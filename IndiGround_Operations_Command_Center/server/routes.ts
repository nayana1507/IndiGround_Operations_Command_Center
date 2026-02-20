import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { flights, gates } from "@shared/schema";
import { db } from "./db";

// Helper function for normal distribution
function randomNormal(mean: number, stdDev: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdDev + mean;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed Database if empty
  await seedDatabase();

  // Gates
  app.get(api.gates.list.path, async (req, res) => {
    try {
      const allGates = await storage.getGates();
      res.json(allGates);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch gates" });
    }
  });

  // Incoming Flights
  app.get(api.flights.listIncoming.path, async (req, res) => {
    try {
      const incoming = await storage.getIncomingFlights();
      // Sort by arrival time
      const sorted = incoming.sort((a, b) => new Date(a.arrivalTime).getTime() - new Date(b.arrivalTime).getTime());
      res.json(sorted.slice(0, 5)); // Return next 5
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch incoming flights" });
    }
  });

  app.get(api.flights.get.path, async (req, res) => {
    try {
      const flight = await storage.getFlight(Number(req.params.id));
      if (!flight) {
        return res.status(404).json({ message: 'Flight not found' });
      }
      res.json(flight);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch flight" });
    }
  });

  // Predict endpoint
  app.post(api.predict.predictTat.path, async (req, res) => {
    try {
      const input = api.predict.predictTat.input.parse(req.body);
      
      // Calculate sub-process durations based on simple logic (simulating ML)
      // Baggage
      const baggageDuration = Math.round(input.bagsCount * 0.15 + input.priorityBags * 0.1);
      // Fuel
      const fuelDuration = Math.round(input.fuelLiters * 0.002);
      // Catering
      const cateringDuration = input.cateringRequired ? Math.round(input.mealsQty * 0.08 + input.specialMeals * 0.1) : 0;
      // Safety
      const safetyCheckDuration = input.safetyCheck ? 15 : 0;

      const predictedTat = baggageDuration + fuelDuration + cateringDuration + safetyCheckDuration + 10; // 10 min base padding

      let bottleneck = "BAGGAGE";
      let maxDuration = baggageDuration;
      
      if (fuelDuration > maxDuration) {
        bottleneck = "FUEL";
        maxDuration = fuelDuration;
      }
      if (cateringDuration > maxDuration) {
        bottleneck = "CATERING";
        maxDuration = cateringDuration;
      }

      // Penalty Risk
      // Target: Narrow 35, Wide 60. Every min delay = 5400
      const targetTat = input.aircraftType === "Wide" ? 60 : 35;
      const delay = Math.max(0, predictedTat - targetTat);
      const penaltyRisk = delay * 5400;

      res.status(200).json({
        predictedTat,
        bottleneck,
        penaltyRisk,
        baggageDuration,
        fuelDuration,
        cateringDuration,
        safetyCheckDuration
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Prediction failed" });
    }
  });

  // Monte Carlo endpoint
  app.post(api.predict.monteCarlo.path, async (req, res) => {
    try {
      const input = api.predict.monteCarlo.input.parse(req.body);
      
      const targetTat = input.aircraftType === "Wide" ? 60 : 35;
      
      // Calculate base durations
      const baseBaggage = input.bagsCount * 0.15 + input.priorityBags * 0.1;
      const baseFuel = input.fuelLiters * 0.002;
      const baseCatering = input.cateringRequired ? (input.mealsQty * 0.08 + input.specialMeals * 0.1) : 0;
      const baseSafety = input.safetyCheck ? 15 : 0;

      const simulations = 1000;
      const results: number[] = [];
      let baggageBottleneckCount = 0;
      
      for (let i = 0; i < simulations; i++) {
        // Add random normal noise
        const simBaggage = randomNormal(baseBaggage, baseBaggage * 0.1);
        const simFuel = randomNormal(baseFuel, baseFuel * 0.05);
        const simCatering = randomNormal(baseCatering, baseCatering * 0.08);
        const simSafety = randomNormal(baseSafety, 2);
        
        const simTat = Math.round(simBaggage + simFuel + simCatering + simSafety + 10);
        results.push(simTat);
        
        if (simBaggage > simFuel && simBaggage > simCatering) {
          baggageBottleneckCount++;
        }
      }
      
      results.sort((a, b) => a - b);
      const p50 = results[Math.floor(simulations * 0.5)];
      const p75 = results[Math.floor(simulations * 0.75)];
      const p90 = results[Math.floor(simulations * 0.90)];
      
      const p50Penalty = Math.max(0, p50 - targetTat) * 5400;
      const p75Penalty = Math.max(0, p75 - targetTat) * 5400;
      const p90Penalty = Math.max(0, p90 - targetTat) * 5400;
      
      const bottleneckConsistency = Math.round((baggageBottleneckCount / simulations) * 100);
      
      // Build histogram
      const histogramMap = new Map<number, number>();
      results.forEach(r => {
        const bin = Math.floor(r / 2) * 2; // Bin size 2
        histogramMap.set(bin, (histogramMap.get(bin) || 0) + 1);
      });
      
      const histogramData = Array.from(histogramMap.entries())
        .map(([bin, count]) => ({ bin, count }))
        .sort((a, b) => a.bin - b.bin);

      res.status(200).json({
        p50,
        p75,
        p90,
        p50Penalty,
        p75Penalty,
        p90Penalty,
        bottleneckConsistency,
        histogramData
      });

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Monte Carlo simulation failed" });
    }
  });

  // Analytics endpoint
  app.get(api.analytics.getStats.path, async (req, res) => {
    try {
      // Mock historical data since we only seed a small amount
      const stats = {
        avgTatPerDay: Array.from({length: 30}).map((_, i) => ({
          date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
          avgTat: 40 + Math.random() * 15
        })),
        bottleneckFrequency: [
          { bottleneck: 'Baggage', count: 450 },
          { bottleneck: 'Fuel', count: 320 },
          { bottleneck: 'Catering', count: 230 }
        ],
        gateUtilization: Array.from({length: 24}).map((_, i) => ({
          gate: `G${Math.floor(Math.random() * 8) + 1}`,
          hour: i,
          count: Math.floor(Math.random() * 100)
        })),
        kpis: {
          avgTat: 47,
          totalPenalties: 1250000,
          mostDelayedAirline: 'SpiceJet',
          peakDelayHour: '18:00'
        }
      };
      res.json(stats);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  return httpServer;
}

async function seedDatabase() {
  const existingGates = await storage.getGates();
  
  if (existingGates.length === 0) {
    // 1. Create Gates G1-G8
    for (let i = 1; i <= 8; i++) {
      await storage.createGate({
        gateNumber: `G${i}`,
        status: "FREE",
      });
    }
    
    // 2. Generate 500 Synthetic Flights (just a few for initial load, to save time, actually 50 is fine)
    const airlines = ['IndiGo', 'Air India', 'SpiceJet', 'Vistara', 'GoFirst'];
    
    for (let i = 0; i < 50; i++) {
      const isWide = Math.random() > 0.8;
      const airline = airlines[Math.floor(Math.random() * airlines.length)];
      
      const flight = await storage.createFlight({
        flightNumber: `${airline.substring(0, 2).toUpperCase()}-${100 + i}`,
        airline: airline,
        aircraftType: isWide ? "Wide" : "Narrow",
        arrivalTime: new Date(Date.now() + (Math.random() * 86400000 - 43200000)), // +/- 12 hours
        arrivalDelay: Math.max(0, Math.floor(randomNormal(0, 15))),
        fuelLiters: isWide ? Math.floor(randomNormal(14000, 3000)) : Math.floor(randomNormal(5000, 1500)),
        bagsCount: isWide ? Math.floor(randomNormal(250, 40)) : Math.floor(randomNormal(120, 25)),
        priorityBags: Math.floor(Math.random() * 20),
        mealsQty: isWide ? 250 : 120,
        specialMeals: 10,
        cateringRequired: Math.random() > 0.3,
        safetyCheck: true,
        status: Math.random() > 0.5 ? "COMPLETED" : "SCHEDULED"
      });
    }
    
    // 3. Assign some flights to gates to make dashboard active
    const allFlights = await storage.getFlights();
    const scheduledFlights = allFlights.filter(f => f.status === 'SCHEDULED');
    
    const dbGates = await storage.getGates();
    for(let i=0; i < 4 && i < scheduledFlights.length; i++) {
      // update gate
      const gate = dbGates[i];
      const flight = scheduledFlights[i];
      
      // Update flight to ACTIVE
      await storage.updateFlight(flight.id, { status: "ACTIVE" });
      
      // Calculate pseudo prediction
      const targetTat = flight.aircraftType === "Wide" ? 60 : 35;
      const predictedTat = targetTat + Math.floor(Math.random() * 20);
      const delay = Math.max(0, predictedTat - targetTat);
      const penaltyRisk = delay * 5400;
      const bottlenecks = ["BAGGAGE", "FUEL", "CATERING"];
      const bottleneck = bottlenecks[Math.floor(Math.random() * bottlenecks.length)];

      await storage.updateFlight(flight.id, { 
        predictedTat,
        bottleneck,
        penaltyRisk
      });

      await storage.updateGate(gate.id, {
        status: Math.random() > 0.3 ? "ACTIVE" : "CLEARING",
        currentFlightId: flight.id
      });
    }
  }
}
