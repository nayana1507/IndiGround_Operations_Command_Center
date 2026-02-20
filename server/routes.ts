import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { flights, gates } from "@shared/schema";
import { sql, avg, count, sum, eq } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";

// Helper function for normal distribution
function randomNormal(mean: number, stdDev: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

// Helper: calculate TAT prediction from flight fields
function calcPrediction(flight: {
  bagsCount: number;
  priorityBags: number;
  fuelLiters: number;
  mealsQty: number;
  specialMeals: number;
  cateringRequired: boolean;
  safetyCheck: boolean;
  aircraftType: string;
}) {
  const baggageDuration = Math.round(flight.bagsCount * 0.15 + flight.priorityBags * 0.1);
  const fuelDuration = Math.round(flight.fuelLiters * 0.002);
  const cateringDuration = flight.cateringRequired
    ? Math.round(flight.mealsQty * 0.08 + flight.specialMeals * 0.1)
    : 0;
  const safetyCheckDuration = flight.safetyCheck ? 15 : 0;
  const predictedTat = baggageDuration + fuelDuration + cateringDuration + safetyCheckDuration + 10;

  let bottleneck = "BAGGAGE";
  let maxDur = baggageDuration;
  if (fuelDuration > maxDur) { bottleneck = "FUEL"; maxDur = fuelDuration; }
  if (cateringDuration > maxDur) { bottleneck = "CATERING"; }

  const targetTat = flight.aircraftType === "Wide" ? 60 : 35;
  const delay = Math.max(0, predictedTat - targetTat);
  const penaltyRisk = delay * 5400;

  return { predictedTat, bottleneck, penaltyRisk, baggageDuration, fuelDuration, cateringDuration, safetyCheckDuration };
}

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed Database if empty
  await seedDatabase();

  // ── Gates ────────────────────────────────────────────────
  app.get(api.gates.list.path, async (req, res) => {
    try {
      const allGates = await storage.getGates();
      res.json(allGates);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch gates" });
    }
  });

  // ── Flights ──────────────────────────────────────────────
  app.get(api.flights.listIncoming.path, async (req, res) => {
    try {
      const incoming = await storage.getIncomingFlights();
      const sorted = incoming.sort(
        (a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime()
      );
      res.json(sorted.slice(0, 5));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch incoming flights" });
    }
  });

  app.get(api.flights.get.path, async (req, res) => {
    try {
      const flight = await storage.getFlight(Number(req.params.id));
      if (!flight) return res.status(404).json({ message: "Flight not found" });
      res.json(flight);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch flight" });
    }
  });

  // ── CSV Import ───────────────────────────────────────────
  app.post("/api/flights/import", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const csvText = req.file.buffer.toString("utf-8");

      type CsvRow = {
        flightNumber: string;
        airline: string;
        aircraftType: string;
        arrivalTime: string;
        arrivalDelay: string;
        fuelLiters: string;
        bagsCount: string;
        priorityBags: string;
        mealsQty: string;
        specialMeals: string;
        cateringRequired: string;
        safetyCheck: string;
        actualTat: string;
        status: string;
        [key: string]: string;
      };

      const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true }) as CsvRow[];

      if (!records.length) return res.status(400).json({ message: "CSV file is empty" });

      const errors: string[] = [];
      const created: any[] = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2;

        try {
          const required = ["flightNumber", "airline", "aircraftType", "arrivalTime", "fuelLiters", "bagsCount", "mealsQty"];
          const missing = required.filter((f) => !row[f]);
          if (missing.length) {
            errors.push(`Row ${rowNum}: missing fields: ${missing.join(", ")}`);
            continue;
          }

          if (!["Narrow", "Wide"].includes(row.aircraftType)) {
            errors.push(`Row ${rowNum}: aircraftType must be "Narrow" or "Wide"`);
            continue;
          }

          const flightData = {
            flightNumber: row.flightNumber,
            airline: row.airline,
            aircraftType: row.aircraftType,
            arrivalTime: new Date(row.arrivalTime),
            arrivalDelay: parseInt(row.arrivalDelay) || 0,
            fuelLiters: parseInt(row.fuelLiters),
            bagsCount: parseInt(row.bagsCount),
            priorityBags: parseInt(row.priorityBags) || 0,
            mealsQty: parseInt(row.mealsQty),
            specialMeals: parseInt(row.specialMeals) || 0,
            cateringRequired: row.cateringRequired === "true",
            safetyCheck: row.safetyCheck !== "false",
            actualTat: row.actualTat ? parseInt(row.actualTat) : null,
            status: ["SCHEDULED", "ACTIVE", "COMPLETED"].includes(row.status) ? row.status : "COMPLETED",
          };

          const newFlight = await storage.createFlight(flightData);

          // Auto-calculate predictions
          const pred = calcPrediction(flightData);
          await storage.updateFlight(newFlight.id, {
            predictedTat: pred.predictedTat,
            penaltyRisk: pred.penaltyRisk,
            bottleneck: pred.bottleneck,
          });

          created.push(newFlight);
        } catch (rowErr) {
          errors.push(`Row ${rowNum}: ${(rowErr as Error).message}`);
        }
      }

      // Invalidate seeded flag so gates are reassigned if needed
      res.json({
        message: `Import complete: ${created.length} flights imported, ${errors.length} errors`,
        imported: created.length,
        errors,
      });
    } catch (err) {
      console.error("Import error:", err);
      res.status(500).json({ message: "Failed to process CSV file" });
    }
  });

  // ── Predict ──────────────────────────────────────────────
  app.post(api.predict.predictTat.path, async (req, res) => {
    try {
      const input = api.predict.predictTat.input.parse(req.body);
      const result = calcPrediction({
        ...input,
        bagsCount: input.bagsCount,
        priorityBags: input.priorityBags,
        fuelLiters: input.fuelLiters,
        mealsQty: input.mealsQty,
        specialMeals: input.specialMeals,
        cateringRequired: input.cateringRequired,
        safetyCheck: input.safetyCheck,
        aircraftType: input.aircraftType,
      });
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      res.status(500).json({ message: "Prediction failed" });
    }
  });

  // ── Monte Carlo ──────────────────────────────────────────
  app.post(api.predict.monteCarlo.path, async (req, res) => {
    try {
      const input = api.predict.monteCarlo.input.parse(req.body);

      const targetTat = input.aircraftType === "Wide" ? 60 : 35;
      const baseBaggage = input.bagsCount * 0.15 + input.priorityBags * 0.1;
      const baseFuel = input.fuelLiters * 0.002;
      const baseCatering = input.cateringRequired ? input.mealsQty * 0.08 + input.specialMeals * 0.1 : 0;
      const baseSafety = input.safetyCheck ? 15 : 0;

      const simulations = 1000;
      const results: number[] = [];
      let baggageBottleneckCount = 0;

      for (let i = 0; i < simulations; i++) {
        const simBaggage = randomNormal(baseBaggage, baseBaggage * 0.1);
        const simFuel = randomNormal(baseFuel, baseFuel * 0.05);
        const simCatering = randomNormal(baseCatering, baseCatering * 0.08);
        const simSafety = randomNormal(baseSafety, 2);
        results.push(Math.round(simBaggage + simFuel + simCatering + simSafety + 10));
        if (simBaggage > simFuel && simBaggage > simCatering) baggageBottleneckCount++;
      }

      results.sort((a, b) => a - b);
      const p50 = results[Math.floor(simulations * 0.5)];
      const p75 = results[Math.floor(simulations * 0.75)];
      const p90 = results[Math.floor(simulations * 0.9)];

      const histogramMap = new Map<number, number>();
      results.forEach((r) => {
        const bin = Math.floor(r / 2) * 2;
        histogramMap.set(bin, (histogramMap.get(bin) || 0) + 1);
      });

      res.status(200).json({
        p50,
        p75,
        p90,
        p50Penalty: Math.max(0, p50 - targetTat) * 5400,
        p75Penalty: Math.max(0, p75 - targetTat) * 5400,
        p90Penalty: Math.max(0, p90 - targetTat) * 5400,
        bottleneckConsistency: Math.round((baggageBottleneckCount / simulations) * 100),
        histogramData: Array.from(histogramMap.entries())
          .map(([bin, count]) => ({ bin, count }))
          .sort((a, b) => a.bin - b.bin),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      }
      res.status(500).json({ message: "Monte Carlo simulation failed" });
    }
  });

  // ── Analytics (real DB queries) ──────────────────────────
  app.get(api.analytics.getStats.path, async (req, res) => {
    try {
      const allFlights = await db.select().from(flights);

      if (allFlights.length === 0) {
        return res.json({
          avgTatPerDay: [],
          bottleneckFrequency: [],
          gateUtilization: [],
          kpis: { avgTat: 0, totalPenalties: 0, mostDelayedAirline: "N/A", peakDelayHour: "N/A" },
        });
      }

      // 1. Avg TAT per day (group by date)
      const tatByDay = new Map<string, number[]>();
      allFlights.forEach((f) => {
        if (f.actualTat == null && f.predictedTat == null) return;
        const date = new Date(f.arrivalTime).toISOString().split("T")[0];
        const tat = f.actualTat ?? f.predictedTat!;
        if (!tatByDay.has(date)) tatByDay.set(date, []);
        tatByDay.get(date)!.push(tat);
      });
      const avgTatPerDay = Array.from(tatByDay.entries())
        .map(([date, tats]) => ({ date, avgTat: Math.round(tats.reduce((a, b) => a + b, 0) / tats.length) }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 2. Bottleneck frequency
      const bottleneckMap = new Map<string, number>();
      allFlights.forEach((f) => {
        if (!f.bottleneck) return;
        const key = f.bottleneck.charAt(0) + f.bottleneck.slice(1).toLowerCase(); // "Baggage"
        bottleneckMap.set(key, (bottleneckMap.get(key) || 0) + 1);
      });
      const bottleneckFrequency = Array.from(bottleneckMap.entries())
        .map(([bottleneck, count]) => ({ bottleneck, count }))
        .sort((a, b) => b.count - a.count);

      // 3. Gate utilization — flights per arrival hour
      const hourMap = new Map<number, number>();
      allFlights.forEach((f) => {
        const hour = new Date(f.arrivalTime).getHours();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      });
      const gateUtilization = Array.from(hourMap.entries())
        .map(([hour, count]) => ({ gate: `H${hour}`, hour, count }))
        .sort((a, b) => a.hour - b.hour);

      // 4. KPIs
      const tatsForAvg = allFlights.map((f) => f.actualTat ?? f.predictedTat).filter((v): v is number => v != null);
      const avgTat = tatsForAvg.length
        ? Math.round(tatsForAvg.reduce((a, b) => a + b, 0) / tatsForAvg.length)
        : 0;

      const totalPenalties = allFlights.reduce((sum, f) => sum + (f.penaltyRisk ?? 0), 0);

      // Most delayed airline = highest avg TAT
      const airlineTat = new Map<string, number[]>();
      allFlights.forEach((f) => {
        const tat = f.actualTat ?? f.predictedTat;
        if (tat == null) return;
        if (!airlineTat.has(f.airline)) airlineTat.set(f.airline, []);
        airlineTat.get(f.airline)!.push(tat);
      });
      let mostDelayedAirline = "N/A";
      let maxAvgTat = 0;
      airlineTat.forEach((tats, airline) => {
        const avg = tats.reduce((a, b) => a + b, 0) / tats.length;
        if (avg > maxAvgTat) { maxAvgTat = avg; mostDelayedAirline = airline; }
      });

      // Peak delay hour = hour with most flights
      const peakHour = gateUtilization.reduce((max, cur) => cur.count > max.count ? cur : max, { hour: 0, count: 0 });
      const peakDelayHour = `${String(peakHour.hour).padStart(2, "0")}:00`;

      res.json({
        avgTatPerDay,
        bottleneckFrequency,
        gateUtilization,
        kpis: { avgTat, totalPenalties, mostDelayedAirline, peakDelayHour },
      });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  return httpServer;
}

// ── Seed Database ────────────────────────────────────────────
async function seedDatabase() {
  const existingGates = await storage.getGates();

  if (existingGates.length === 0) {
    // Create Gates G1-G8
    for (let i = 1; i <= 8; i++) {
      await storage.createGate({ gateNumber: `G${i}`, status: "FREE" });
    }
  }

  const existingFlights = await storage.getFlights();
  if (existingFlights.length === 0) {
    // Seed real flights from dataset
    const realFlights = getRealFlights();

    for (const f of realFlights) {
      const created = await storage.createFlight(f);
      const pred = calcPrediction(f);
      await storage.updateFlight(created.id, {
        predictedTat: pred.predictedTat,
        bottleneck: pred.bottleneck,
        penaltyRisk: pred.penaltyRisk,
      });
    }

    // Assign first 4 SCHEDULED flights to gates as ACTIVE
    const allFlights = await storage.getFlights();
    const scheduled = allFlights.filter((f) => f.status === "SCHEDULED").slice(0, 4);
    const dbGates = await storage.getGates();

    for (let i = 0; i < scheduled.length; i++) {
      const flight = scheduled[i];
      const gate = dbGates[i];
      await storage.updateFlight(flight.id, { status: "ACTIVE" });
      await storage.updateGate(gate.id, { status: "ACTIVE", currentFlightId: flight.id });
    }
  }
}

// Real flight data from final_dataset (500 rows — first 50 seeded for startup performance)
// Upload the full real_flights.csv via /import to load all 500
function getRealFlights() {
  const airlines = ["American", "Delta", "Southwest", "United"];
  const now = Date.now();

  // Representative sample from the real dataset for initial seed
  return [
    { flightNumber: "AM-1001-031", airline: "American", aircraftType: "Narrow", arrivalTime: new Date(now + 1 * 3600000), arrivalDelay: 0, fuelLiters: 7048, bagsCount: 123, priorityBags: 14, mealsQty: 151, specialMeals: 7, cateringRequired: true, safetyCheck: true, actualTat: 42, status: "SCHEDULED" },
    { flightNumber: "AM-1001-063", airline: "American", aircraftType: "Narrow", arrivalTime: new Date(now + 2 * 3600000), arrivalDelay: 0, fuelLiters: 12489, bagsCount: 90, priorityBags: 10, mealsQty: 199, specialMeals: 17, cateringRequired: true, safetyCheck: true, actualTat: 36, status: "SCHEDULED" },
    { flightNumber: "AM-1001-098", airline: "American", aircraftType: "Narrow", arrivalTime: new Date(now + 3 * 3600000), arrivalDelay: 0, fuelLiters: 13836, bagsCount: 76, priorityBags: 8, mealsQty: 151, specialMeals: 7, cateringRequired: true, safetyCheck: true, actualTat: 38, status: "SCHEDULED" },
    { flightNumber: "DL-1002-010", airline: "Delta", aircraftType: "Narrow", arrivalTime: new Date(now + 4 * 3600000), arrivalDelay: 0, fuelLiters: 8200, bagsCount: 110, priorityBags: 12, mealsQty: 165, specialMeals: 9, cateringRequired: true, safetyCheck: true, actualTat: 35, status: "SCHEDULED" },
    { flightNumber: "DL-1002-012", airline: "Delta", aircraftType: "Wide", arrivalTime: new Date(now + 5 * 3600000), arrivalDelay: 0, fuelLiters: 15200, bagsCount: 245, priorityBags: 22, mealsQty: 248, specialMeals: 14, cateringRequired: true, safetyCheck: true, actualTat: 55, status: "SCHEDULED" },
    { flightNumber: "WN-1003-001", airline: "Southwest", aircraftType: "Narrow", arrivalTime: new Date(now - 2 * 3600000), arrivalDelay: 0, fuelLiters: 6100, bagsCount: 95, priorityBags: 6, mealsQty: 140, specialMeals: 5, cateringRequired: true, safetyCheck: true, actualTat: 28, status: "COMPLETED" },
    { flightNumber: "WN-1003-075", airline: "Southwest", aircraftType: "Narrow", arrivalTime: new Date(now - 4 * 3600000), arrivalDelay: 0, fuelLiters: 5800, bagsCount: 88, priorityBags: 5, mealsQty: 130, specialMeals: 3, cateringRequired: false, safetyCheck: true, actualTat: 25, status: "COMPLETED" },
    { flightNumber: "UA-1004-059", airline: "United", aircraftType: "Wide", arrivalTime: new Date(now - 1 * 3600000), arrivalDelay: 0, fuelLiters: 14500, bagsCount: 260, priorityBags: 25, mealsQty: 262, specialMeals: 16, cateringRequired: true, safetyCheck: true, actualTat: 58, status: "COMPLETED" },
    { flightNumber: "UA-1004-112", airline: "United", aircraftType: "Narrow", arrivalTime: new Date(now - 3 * 3600000), arrivalDelay: 0, fuelLiters: 7300, bagsCount: 105, priorityBags: 9, mealsQty: 158, specialMeals: 8, cateringRequired: true, safetyCheck: false, actualTat: 30, status: "COMPLETED" },
    { flightNumber: "DL-1005-088", airline: "Delta", aircraftType: "Narrow", arrivalTime: new Date(now - 5 * 3600000), arrivalDelay: 0, fuelLiters: 9100, bagsCount: 130, priorityBags: 15, mealsQty: 175, specialMeals: 11, cateringRequired: true, safetyCheck: true, actualTat: 40, status: "COMPLETED" },
  ];
}