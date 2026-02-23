import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { flights as flightsTable, gates, crisisState } from "@shared/schema";
import { sql, avg, count, sum, eq } from "drizzle-orm";
import multer from "multer";
import { parse } from "csv-parse/sync";

function randomNormal(mean: number, stdDev: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  await seedDatabase();

  // ── Gates ─────────────────────────────────────────────────
  app.get(api.gates.list.path, async (req, res) => {
    try {
      const allGates = await storage.getGates();
      const now = Date.now();
      const enriched = await Promise.all(
        allGates.map(async (gate) => {
          if (!gate.currentFlightId) return { ...gate, flight: null, elapsedMin: 0, remainingMin: 0, progressPct: 0 };
          const flight = await storage.getFlight(gate.currentFlightId);
          if (!flight) return { ...gate, flight: null, elapsedMin: 0, remainingMin: 0, progressPct: 0 };
          // Attach gate number directly to flight for display
          const enrichedFlight = { ...flight, gateNumber: gate.gateNumber };
          const arrivalMs = new Date(flight.arrivalTime + "Z").getTime();
          const elapsedMin = Math.max(0, Math.round((now - arrivalMs) / 60000));
          const totalTat = flight.predictedTat ?? flight.actualTat ?? 45;
          const remainingMin = Math.max(0, totalTat - elapsedMin);
          const progressPct = Math.min(100, Math.round((elapsedMin / totalTat) * 100));
          let gateStatus = gate.status;
          if (progressPct >= 100 && gate.status === "ACTIVE") gateStatus = "CLEARING";
          return { ...gate, status: gateStatus, flight: enrichedFlight, elapsedMin, remainingMin, progressPct };
        })
      );
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch gates" });
    }
  });

  // ── Flights ───────────────────────────────────────────────
  app.get(api.flights.listIncoming.path, async (req, res) => {
    try {
      const incoming = await storage.getIncomingFlights();
      const sorted = incoming.sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime());
      res.json(sorted.slice(0, 5));
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch incoming flights" });
    }
  });

  app.get("/api/flights/all", async (req, res) => {
    try {
      const all = await storage.getFlights();
      const sorted = all.sort((a, b) => new Date(b.arrivalTime).getTime() - new Date(a.arrivalTime).getTime());
      res.json(sorted);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch flights" });
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

  // ── CSV Import ────────────────────────────────────────────
  app.post("/api/flights/import", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const csvText = req.file.buffer.toString("utf-8");
      type CsvRow = { flightNumber: string; airline: string; aircraftType: string; arrivalTime: string; arrivalDelay: string; fuelLiters: string; bagsCount: string; priorityBags: string; mealsQty: string; specialMeals: string; cateringRequired: string; safetyCheck: string; actualTat: string; status: string; [key: string]: string; };
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
          if (missing.length) { errors.push(`Row ${rowNum}: missing fields: ${missing.join(", ")}`); continue; }
          if (!["Narrow", "Wide"].includes(row.aircraftType)) { errors.push(`Row ${rowNum}: aircraftType must be "Narrow" or "Wide"`); continue; }
          const flightData = {
            flightNumber: row.flightNumber, airline: row.airline, aircraftType: row.aircraftType,
            arrivalTime: new Date(row.arrivalTime), arrivalDelay: parseInt(row.arrivalDelay) || 0,
            fuelLiters: parseInt(row.fuelLiters), bagsCount: parseInt(row.bagsCount),
            priorityBags: parseInt(row.priorityBags) || 0, mealsQty: parseInt(row.mealsQty),
            specialMeals: parseInt(row.specialMeals) || 0, cateringRequired: row.cateringRequired === "true",
            safetyCheck: row.safetyCheck !== "false", actualTat: row.actualTat ? parseInt(row.actualTat) : null,
            status: ["SCHEDULED", "ACTIVE", "COMPLETED"].includes(row.status) ? row.status : "COMPLETED",
          };
          const newFlight = await storage.createFlight(flightData);
          const pred = calcPrediction(flightData);
          await storage.updateFlight(newFlight.id, { predictedTat: pred.predictedTat, penaltyRisk: pred.penaltyRisk, bottleneck: pred.bottleneck });
          created.push(newFlight);
        } catch (rowErr) {
          errors.push(`Row ${rowNum}: ${(rowErr as Error).message}`);
        }
      }
      res.json({ message: `Import complete: ${created.length} flights imported, ${errors.length} errors`, imported: created.length, errors });
    } catch (err) {
      console.error("Import error:", err);
      res.status(500).json({ message: "Failed to process CSV file" });
    }
  });

  // ── Predict ───────────────────────────────────────────────
  app.post(api.predict.predictTat.path, async (req, res) => {
    try {
      const input = api.predict.predictTat.input.parse(req.body);
      const result = calcPrediction(input);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Prediction failed" });
    }
  });

  // ── Monte Carlo ───────────────────────────────────────────
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
      results.forEach((r) => { const bin = Math.floor(r / 2) * 2; histogramMap.set(bin, (histogramMap.get(bin) || 0) + 1); });
      res.status(200).json({
        p50, p75, p90,
        p50Penalty: Math.max(0, p50 - targetTat) * 5400,
        p75Penalty: Math.max(0, p75 - targetTat) * 5400,
        p90Penalty: Math.max(0, p90 - targetTat) * 5400,
        bottleneckConsistency: Math.round((baggageBottleneckCount / simulations) * 100),
        histogramData: Array.from(histogramMap.entries()).map(([bin, count]) => ({ bin, count })).sort((a, b) => a.bin - b.bin),
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Monte Carlo simulation failed" });
    }
  });

  // ── Analytics ─────────────────────────────────────────────
  app.get(api.analytics.getStats.path, async (req, res) => {
    try {
      const allFlights = await db.select().from(flightsTable);
      if (allFlights.length === 0) return res.json({ avgTatPerDay: [], bottleneckFrequency: [], gateUtilization: [], kpis: { avgTat: 0, totalPenalties: 0, mostDelayedAirline: "N/A", peakDelayHour: "N/A" } });
      const tatByDay = new Map<string, number[]>();
      allFlights.forEach((f) => {
        if (f.actualTat == null && f.predictedTat == null) return;
        const date = new Date(f.arrivalTime).toISOString().split("T")[0];
        const tat = f.actualTat ?? f.predictedTat!;
        if (!tatByDay.has(date)) tatByDay.set(date, []);
        tatByDay.get(date)!.push(tat);
      });
      const avgTatPerDay = Array.from(tatByDay.entries()).map(([date, tats]) => ({ date, avgTat: Math.round(tats.reduce((a, b) => a + b, 0) / tats.length) })).sort((a, b) => a.date.localeCompare(b.date));
      const bottleneckMap = new Map<string, number>();
      allFlights.forEach((f) => { if (!f.bottleneck) return; const key = f.bottleneck.charAt(0) + f.bottleneck.slice(1).toLowerCase(); bottleneckMap.set(key, (bottleneckMap.get(key) || 0) + 1); });
      const bottleneckFrequency = Array.from(bottleneckMap.entries()).map(([bottleneck, count]) => ({ bottleneck, count })).sort((a, b) => b.count - a.count);
      const hourMap = new Map<number, number>();
      allFlights.forEach((f) => { const hour = new Date(f.arrivalTime).getHours(); hourMap.set(hour, (hourMap.get(hour) || 0) + 1); });
      const gateUtilization = Array.from(hourMap.entries()).map(([hour, count]) => ({ gate: `H${hour}`, hour, count })).sort((a, b) => a.hour - b.hour);
      const tatsForAvg = allFlights.map((f) => f.actualTat ?? f.predictedTat).filter((v): v is number => v != null);
      const avgTat = tatsForAvg.length ? Math.round(tatsForAvg.reduce((a, b) => a + b, 0) / tatsForAvg.length) : 0;
      const totalPenalties = allFlights.reduce((sum, f) => sum + (f.penaltyRisk ?? 0), 0);
      const airlineTat = new Map<string, number[]>();
      allFlights.forEach((f) => { const tat = f.actualTat ?? f.predictedTat; if (tat == null) return; if (!airlineTat.has(f.airline)) airlineTat.set(f.airline, []); airlineTat.get(f.airline)!.push(tat); });
      let mostDelayedAirline = "N/A"; let maxAvgTat = 0;
      airlineTat.forEach((tats, airline) => { const avg = tats.reduce((a, b) => a + b, 0) / tats.length; if (avg > maxAvgTat) { maxAvgTat = avg; mostDelayedAirline = airline; } });
      const peakHour = gateUtilization.reduce((max, cur) => cur.count > max.count ? cur : max, { hour: 0, count: 0 });
      const peakDelayHour = `${String(peakHour.hour).padStart(2, "0")}:00`;
      res.json({ avgTatPerDay, bottleneckFrequency, gateUtilization, kpis: { avgTat, totalPenalties, mostDelayedAirline, peakDelayHour } });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ── DAY 2: Crisis State ───────────────────────────────────
  app.get("/api/crisis", async (req, res) => {
    try {
      const state = await storage.getCrisisState();
      res.json(state ?? { fuelCrisisActive: false, bowserCount: 4, manualPumpSpeed: 500 });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch crisis state" });
    }
  });

  app.post("/api/crisis/activate", async (req, res) => {
    try {
      const state = await storage.activateFuelCrisis();
      const now = Date.now();

      const diverted = await storage.getDivertedFlights();
      if (diverted.length === 0) {
        // Real arrival order from dataset (mapped to relative times today):
        // Air France (first), Singapore Air (+24min), British Airways (+2min),
        // Emirates (big gap ~2hrs later), Lufthansa (+49min after Emirates)
        const divertedFlights = [
          { flightNumber: "INT-1015-003", airline: "Air France",      aircraftType: "Wide", fuelLiters: 42000, bagsCount: 309, priorityBags: 25, mealsQty: 280, specialMeals: 20, cateringRequired: true, safetyCheck: true, arrivalDelay: 0, arrivalTime: new Date(now - 25 * 60000), penaltyRatePerMin: 15000, status: "DIVERTED" },
          { flightNumber: "INT-1015-004", airline: "Singapore Air",   aircraftType: "Wide", fuelLiters: 45000, bagsCount: 437, priorityBags: 25, mealsQty: 329, specialMeals: 20, cateringRequired: true, safetyCheck: true, arrivalDelay: 0, arrivalTime: new Date(now - 10 * 60000), penaltyRatePerMin: 15000, status: "DIVERTED" },
          { flightNumber: "INT-1015-002", airline: "British Airways",  aircraftType: "Wide", fuelLiters: 46000, bagsCount: 342, priorityBags: 25, mealsQty: 261, specialMeals: 20, cateringRequired: true, safetyCheck: true, arrivalDelay: 0, arrivalTime: new Date(now - 8  * 60000), penaltyRatePerMin: 15000, status: "DIVERTED" },
          { flightNumber: "INT-1015-001", airline: "Emirates",         aircraftType: "Wide", fuelLiters: 48000, bagsCount: 410, priorityBags: 25, mealsQty: 305, specialMeals: 20, cateringRequired: true, safetyCheck: true, arrivalDelay: 0, arrivalTime: new Date(now + 95  * 60000), penaltyRatePerMin: 15000, status: "DIVERTED" },
          { flightNumber: "INT-1015-000", airline: "Lufthansa",        aircraftType: "Wide", fuelLiters: 44000, bagsCount: 412, priorityBags: 25, mealsQty: 327, specialMeals: 20, cateringRequired: true, safetyCheck: true, arrivalDelay: 0, arrivalTime: new Date(now + 144 * 60000), penaltyRatePerMin: 15000, status: "DIVERTED" },
        ];

        // 3:1 RATIO: Bowsers 1,2,3 → INT only | Bowser 4 → DOM only
        // Gate assignment: landed INT flights → G5, G6, G7. G8 stays FREE.
        const intGateNames = ["G5", "G6", "G7"];
        let intBowserSlot = 1;

        // Fetch all gates fresh by gate number for reliable lookup
        const allGatesNow = await db.select().from(gates);
        const gateByName = new Map(allGatesNow.map(g => [g.gateNumber, g]));

        for (const f of divertedFlights) {
          const created = await storage.createFlight(f as any);
          const fuelDuration = Math.round(f.fuelLiters / 500);
          const baggageDuration = Math.round(f.bagsCount * 0.15 + f.priorityBags * 0.1);
          const cateringDuration = Math.round(f.mealsQty * 0.08 + f.specialMeals * 0.1);
          const predictedTat = baggageDuration + fuelDuration + cateringDuration + 15 + 10;
          const penaltyRisk = Math.max(0, predictedTat - 60) * f.penaltyRatePerMin;

          await storage.updateFlight(created.id, { predictedTat, bottleneck: "FUEL", penaltyRisk });

          // Only assign already-landed flights to bowser + gate
          const isLanded = f.arrivalTime.getTime() <= now;
          if (isLanded && intBowserSlot <= 3) {
            const gateName = intGateNames[intBowserSlot - 1]; // G5, G6, G7
            const gate = gateByName.get(gateName);
            if (gate) {
              // Update gate to point to this flight
              await db.update(gates).set({ status: "ACTIVE", currentFlightId: created.id }).where(eq(gates.id, gate.id));
              // Update flight to reference gate
              await db.update(flightsTable).set({ gateId: gate.id, fuelQueuePosition: intBowserSlot, fuelStartTime: new Date() }).where(eq(flightsTable.id, created.id));
              console.log("[crisis] " + f.flightNumber + " assigned to " + gateName + " Bowser " + intBowserSlot);
            }
            intBowserSlot++;
          }
          // Emirates, Lufthansa: future arrivals — no gate/bowser until they land
        }
      }

      // Domestic flights: Bowser 4 only, queue up sequentially
      const allFlights = await storage.getFlights();
      const domesticFlights = allFlights.filter(f =>
        (f.status === "ACTIVE" || f.status === "SCHEDULED") && (f.penaltyRatePerMin ?? 5400) === 5400
      );
      for (let i = 0; i < domesticFlights.length; i++) {
        const f = domesticFlights[i];
        const fuelDuration = Math.round(f.fuelLiters / 500);
        const baggageDuration = Math.round(f.bagsCount * 0.15 + f.priorityBags * 0.1);
        const cateringDuration = f.cateringRequired ? Math.round(f.mealsQty * 0.08 + f.specialMeals * 0.1) : 0;
        const safetyCheckDuration = f.safetyCheck ? 15 : 0;
        const queueWait = i * fuelDuration; // each waits for prev to finish on Bowser 4
        const predictedTat = baggageDuration + fuelDuration + cateringDuration + safetyCheckDuration + 10 + queueWait;
        const targetTat = f.aircraftType === "Wide" ? 60 : 35;
        const penaltyRisk = Math.max(0, predictedTat - targetTat) * 5400;
        await storage.updateFlight(f.id, { predictedTat, penaltyRisk, bottleneck: "FUEL", fuelQueuePosition: i + 1 });
      }

      res.json({ success: true, state, message: "Crisis activated. 3:1 bowser ratio: INT gets Bowsers 1-3, DOM gets Bowser 4." });
    } catch (err) {
      console.error("Crisis activation error:", err);
      res.status(500).json({ message: "Failed to activate crisis" });
    }
  });

  app.post("/api/crisis/deactivate", async (req, res) => {
    try {
      await storage.deactivateFuelCrisis();
      const allFlights = await storage.getFlights();

      // 1. Free gates occupied by diverted flights (G5, G6, G7)
      const divertedFlights = allFlights.filter(f => f.status === "DIVERTED");
      for (const f of divertedFlights) {
        if (f.gateId) {
          await storage.updateGate(f.gateId, { status: "FREE", currentFlightId: null });
        }
      }

      // 2. Remove all diverted flights from DB so next activation starts fresh
      const { db } = await import("./db");
      const { flights: flightsTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(flightsTable).where(eq(flightsTable.status, "DIVERTED"));
      console.log(`[crisis] Removed ${divertedFlights.length} diverted flights, freed their gates.`);

      // 3. Restore normal hydrant fuelling for domestic flights
      const domesticFlights = allFlights.filter(f => f.status === "ACTIVE" || f.status === "SCHEDULED");
      for (const f of domesticFlights) {
        const fuelDuration = Math.round(f.fuelLiters * 0.002);
        const baggageDuration = Math.round(f.bagsCount * 0.15 + f.priorityBags * 0.1);
        const cateringDuration = f.cateringRequired ? Math.round(f.mealsQty * 0.08 + f.specialMeals * 0.1) : 0;
        const safetyCheckDuration = f.safetyCheck ? 15 : 0;
        const predictedTat = baggageDuration + fuelDuration + cateringDuration + safetyCheckDuration + 10;
        const targetTat = f.aircraftType === "Wide" ? 60 : 35;
        const delay = Math.max(0, predictedTat - targetTat);
        let bottleneck = "BAGGAGE"; let maxDur = baggageDuration;
        if (fuelDuration > maxDur) { bottleneck = "FUEL"; maxDur = fuelDuration; }
        if (cateringDuration > maxDur) { bottleneck = "CATERING"; }
        await storage.updateFlight(f.id, { predictedTat, penaltyRisk: delay * 5400, bottleneck, fuelQueuePosition: null });
      }

      res.json({ success: true, message: "Crisis resolved. Diverted flights cleared. Normal hydrant fuelling restored." });
    } catch (err) {
      console.error("Deactivate error:", err);
      res.status(500).json({ message: "Failed to deactivate crisis" });
    }
  });

  // ── DAY 2: Diverted Flights ───────────────────────────────
  app.get("/api/diverted", async (req, res) => {
    try {
      const diverted = await storage.getDivertedFlights();
      const now = Date.now();
      const enriched = diverted.map(f => {
        const arrivalMs = new Date(f.arrivalTime + "Z").getTime();
        const hasLanded = arrivalMs <= now;
        const elapsedMin = hasLanded ? Math.max(0, Math.round((now - arrivalMs) / 60000)) : 0;
        const minsUntilArrival = hasLanded ? 0 : Math.round((arrivalMs - now) / 60000);
        const penaltyAccrued = elapsedMin * (f.penaltyRatePerMin ?? 15000);
        const fuelDuration = Math.round(f.fuelLiters / 500);
        const bowserSlot = f.fuelQueuePosition && f.fuelQueuePosition <= 3 ? f.fuelQueuePosition : null;
        return { ...f, hasLanded, elapsedMin, minsUntilArrival, penaltyAccrued, fuelDuration, bowserSlot, isBeingFuelled: bowserSlot !== null };
      }).sort((a, b) => {
        if (a.hasLanded && !b.hasLanded) return -1;
        if (!a.hasLanded && b.hasLanded) return 1;
        return new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime();
      });
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch diverted flights" });
    }
  });

  // ── DAY 2: Fuel Queue (Bowser 4 - Domestic) ──────────────
  app.get("/api/fuel-queue", async (req, res) => {
    try {
      const crisis = await storage.getCrisisState();
      const allFlights = await storage.getFlights();
      const domesticQueue = allFlights
        .filter(f => f.fuelQueuePosition !== null && (f.status === "ACTIVE" || f.status === "SCHEDULED"))
        .sort((a, b) => (a.fuelQueuePosition ?? 0) - (b.fuelQueuePosition ?? 0));
      const now = Date.now();
      const enriched = domesticQueue.map((f, idx) => {
        const fuelDuration = Math.round(f.fuelLiters / 500);
        const fuelStartMs = f.fuelStartTime ? new Date(f.fuelStartTime + "Z").getTime() : null;
        const fuelElapsed = fuelStartMs ? Math.max(0, Math.round((now - fuelStartMs) / 60000)) : 0;
        const fuelRemaining = Math.max(0, fuelDuration - fuelElapsed);
        const fuelProgress = fuelDuration > 0 ? Math.min(100, Math.round((fuelElapsed / fuelDuration) * 100)) : 0;
        const estimatedWaitMins = domesticQueue.slice(0, idx).reduce((s, p) => s + Math.round(p.fuelLiters / 500), 0);
        return { ...f, fuelDuration, fuelElapsed, fuelRemaining, fuelProgress, isCurrentlyFuelling: idx === 0, estimatedWaitMins };
      });
      res.json({
        crisis: crisis ?? { fuelCrisisActive: false, bowserCount: 4, manualPumpSpeed: 500 },
        bowserAllocation: { international: [1, 2, 3], domestic: [4] },
        domesticQueue: enriched,
        domesticQueueLength: enriched.length,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch fuel queue" });
    }
  });

  // ── DAY 2: Penalty Summary ────────────────────────────────
  app.get("/api/crisis/penalty-summary", async (req, res) => {
    try {
      const allFlights = await storage.getFlights();
      const now = Date.now();
      const international = allFlights.filter(f => f.status === "DIVERTED");
      const domestic = allFlights.filter(f => (f.status === "ACTIVE" || f.status === "SCHEDULED") && (f.penaltyRisk ?? 0) > 0);
      const intPenalty = international.reduce((sum, f) => {
        const arrivalMs = new Date(f.arrivalTime + "Z").getTime();
        const elapsedMin = Math.max(0, Math.round((now - arrivalMs) / 60000));
        return sum + elapsedMin * (f.penaltyRatePerMin ?? 15000);
      }, 0);
      const domPenalty = domestic.reduce((sum, f) => sum + (f.penaltyRisk ?? 0), 0);
      res.json({
        international: { count: international.length, totalPenalty: intPenalty, ratePerMin: 15000 },
        domestic: { count: domestic.length, totalPenalty: domPenalty, ratePerMin: 5400 },
        grandTotal: intPenalty + domPenalty,
        allocationRule: "3 bowsers → INT (₹15k/min) | 1 bowser → DOM (₹5.4k/min)",
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch penalty summary" });
    }
  });

  return httpServer;
}

// ── Seed Database ─────────────────────────────────────────────────
async function seedDatabase() {
  try {
    console.log("[seed] Checking database...");
    const existingGates = await storage.getGates();
    console.log(`[seed] Found ${existingGates.length} gates`);
    if (existingGates.length === 0) {
      console.log("[seed] Creating gates G1-G8...");
      for (let i = 1; i <= 8; i++) await storage.createGate({ gateNumber: `G${i}`, status: "FREE" });
      console.log("[seed] Gates created.");
    }
    const existingFlights = await storage.getFlights();
    console.log(`[seed] Found ${existingFlights.length} flights`);
    if (existingFlights.length === 0) {
      console.log("[seed] Seeding flights...");
      const realFlights = getRealFlights();
      for (const f of realFlights) {
        const created = await storage.createFlight(f);
        const pred = calcPrediction(f);
        await storage.updateFlight(created.id, { predictedTat: pred.predictedTat, bottleneck: pred.bottleneck, penaltyRisk: pred.penaltyRisk });
        console.log(`[seed] Created flight ${f.flightNumber}`);
      }
      const allFlights = await storage.getFlights();
      const scheduled = allFlights.filter((f) => f.status === "SCHEDULED").slice(0, 4);
      const dbGates = await storage.getGates();
      for (let i = 0; i < scheduled.length; i++) {
        const flight = scheduled[i];
        const gate = dbGates[i]; // G1-G4 for domestic
        await storage.updateFlight(flight.id, { status: "ACTIVE" });
        await storage.updateGate(gate.id, { status: "ACTIVE", currentFlightId: flight.id });
        console.log(`[seed] Assigned ${flight.flightNumber} to ${gate.gateNumber}`);
      }

      // Assign INT diverted flights to G5, G6, G7
      const divertedSeed = allFlights.filter((f) => f.status === "DIVERTED").slice(0, 3);
      const intGateNames = ["G5", "G6", "G7"];
      for (let i = 0; i < divertedSeed.length; i++) {
        const flight = divertedSeed[i];
        const gate = dbGates.find(g => g.gateNumber === intGateNames[i]);
        if (gate) {
          await storage.updateGate(gate.id, { status: "ACTIVE", currentFlightId: flight.id });
          await storage.updateFlight(flight.id, { gateId: gate.id, fuelQueuePosition: i + 1, fuelStartTime: new Date(), bottleneck: "FUEL", predictedTat: Math.round(flight.fuelLiters / 500) + 60, penaltyRisk: Math.max(0, Math.round(flight.fuelLiters / 500) + 60 - 60) * 15000 });
          console.log(`[seed] Assigned ${flight.flightNumber} to ${gate.gateNumber}`);
        }
      }
      console.log("[seed] Done!");
    } else {
      console.log("[seed] DB already seeded, skipping.");
    }
    // Always refresh ACTIVE flight arrival times on startup
    const allFlights = await storage.getFlights();
    const activeFlights = allFlights.filter((f) => f.status === "ACTIVE");
    const offsets = [5, 10, 8, 15, 12, 7, 3, 20];
    for (let i = 0; i < activeFlights.length; i++) {
      await storage.updateFlight(activeFlights[i].id, { arrivalTime: new Date(Date.now() - (offsets[i] || 10) * 60000) });
    }
    if (activeFlights.length > 0) console.log(`[seed] Refreshed ${activeFlights.length} active flight arrival times.`);
  } catch (err) {
    console.error("[seed] ERROR:", err);
  }
}

function getRealFlights() {
  const now = Date.now();
  return [
    { flightNumber: "AM-1001-031", airline: "American",  aircraftType: "Narrow", arrivalTime: new Date(now - 5  * 60000), arrivalDelay: 0, fuelLiters: 7048,  bagsCount: 123, priorityBags: 14, mealsQty: 151, specialMeals: 7,  cateringRequired: true,  safetyCheck: true,  actualTat: 42, status: "SCHEDULED" },
    { flightNumber: "AM-1001-063", airline: "American",  aircraftType: "Narrow", arrivalTime: new Date(now - 10 * 60000), arrivalDelay: 0, fuelLiters: 12489, bagsCount: 90,  priorityBags: 10, mealsQty: 199, specialMeals: 17, cateringRequired: true,  safetyCheck: true,  actualTat: 36, status: "SCHEDULED" },
    { flightNumber: "AM-1001-098", airline: "American",  aircraftType: "Narrow", arrivalTime: new Date(now - 8  * 60000), arrivalDelay: 0, fuelLiters: 13836, bagsCount: 76,  priorityBags: 8,  mealsQty: 151, specialMeals: 7,  cateringRequired: true,  safetyCheck: true,  actualTat: 38, status: "SCHEDULED" },
    { flightNumber: "DL-1002-010", airline: "Delta",     aircraftType: "Narrow", arrivalTime: new Date(now - 15 * 60000), arrivalDelay: 0, fuelLiters: 8200,  bagsCount: 110, priorityBags: 12, mealsQty: 165, specialMeals: 9,  cateringRequired: true,  safetyCheck: true,  actualTat: 35, status: "SCHEDULED" },
    { flightNumber: "DL-1002-012", airline: "Delta",     aircraftType: "Wide",   arrivalTime: new Date(now + 45 * 60000), arrivalDelay: 0, fuelLiters: 15200, bagsCount: 245, priorityBags: 22, mealsQty: 248, specialMeals: 14, cateringRequired: true,  safetyCheck: true,  actualTat: 55, status: "SCHEDULED" },
    { flightNumber: "WN-1003-001", airline: "Southwest", aircraftType: "Narrow", arrivalTime: new Date(now + 90 * 60000), arrivalDelay: 0, fuelLiters: 6100,  bagsCount: 95,  priorityBags: 6,  mealsQty: 140, specialMeals: 5,  cateringRequired: true,  safetyCheck: true,  actualTat: 28, status: "SCHEDULED" },
    { flightNumber: "WN-1003-075", airline: "Southwest", aircraftType: "Narrow", arrivalTime: new Date(now - 4  * 3600000), arrivalDelay: 0, fuelLiters: 5800, bagsCount: 88,  priorityBags: 5,  mealsQty: 130, specialMeals: 3,  cateringRequired: false, safetyCheck: true,  actualTat: 25, status: "COMPLETED" },
    { flightNumber: "UA-1004-059", airline: "United",    aircraftType: "Wide",   arrivalTime: new Date(now - 2  * 3600000), arrivalDelay: 0, fuelLiters: 14500, bagsCount: 260, priorityBags: 25, mealsQty: 262, specialMeals: 16, cateringRequired: true,  safetyCheck: true,  actualTat: 58, status: "COMPLETED" },
    { flightNumber: "UA-1004-112", airline: "United",    aircraftType: "Narrow", arrivalTime: new Date(now - 3  * 3600000), arrivalDelay: 0, fuelLiters: 7300,  bagsCount: 105, priorityBags: 9,  mealsQty: 158, specialMeals: 8,  cateringRequired: true,  safetyCheck: false, actualTat: 30, status: "COMPLETED" },
    { flightNumber: "DL-1005-088", airline: "Delta",     aircraftType: "Narrow", arrivalTime: new Date(now - 5  * 3600000), arrivalDelay: 0, fuelLiters: 9100,  bagsCount: 130, priorityBags: 15, mealsQty: 175, specialMeals: 11, cateringRequired: true,  safetyCheck: true,  actualTat: 40, status: "COMPLETED" },
    // INTERNATIONAL diverted flights — always seeded on G5, G6, G7
    { flightNumber: "INT-1015-003", airline: "Air France",     aircraftType: "Wide", arrivalTime: new Date(now - 20 * 60000), arrivalDelay: 0, fuelLiters: 42000, bagsCount: 309, priorityBags: 25, mealsQty: 280, specialMeals: 20, cateringRequired: true, safetyCheck: true, actualTat: null, penaltyRatePerMin: 15000, status: "DIVERTED" },
    { flightNumber: "INT-1015-004", airline: "Singapore Air",  aircraftType: "Wide", arrivalTime: new Date(now - 10 * 60000), arrivalDelay: 0, fuelLiters: 45000, bagsCount: 437, priorityBags: 25, mealsQty: 329, specialMeals: 20, cateringRequired: true, safetyCheck: true, actualTat: null, penaltyRatePerMin: 15000, status: "DIVERTED" },
    { flightNumber: "INT-1015-002", airline: "British Airways", aircraftType: "Wide", arrivalTime: new Date(now - 5  * 60000), arrivalDelay: 0, fuelLiters: 46000, bagsCount: 342, priorityBags: 25, mealsQty: 261, specialMeals: 20, cateringRequired: true, safetyCheck: true, actualTat: null, penaltyRatePerMin: 15000, status: "DIVERTED" },
  ];
}