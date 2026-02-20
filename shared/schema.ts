import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// === TABLE DEFINITIONS ===
export const flights = pgTable("flights", {
  id: serial("id").primaryKey(),
  flightNumber: text("flight_number").notNull(),
  airline: text("airline").notNull(),
  aircraftType: text("aircraft_type").notNull(), // Narrow, Wide
  arrivalTime: timestamp("arrival_time").notNull(),
  arrivalDelay: integer("arrival_delay").notNull().default(0), // in minutes
  fuelLiters: integer("fuel_liters").notNull(),
  bagsCount: integer("bags_count").notNull(),
  priorityBags: integer("priority_bags").notNull().default(0),
  mealsQty: integer("meals_qty").notNull(),
  specialMeals: integer("special_meals").notNull().default(0),
  cateringRequired: boolean("catering_required").notNull().default(true),
  safetyCheck: boolean("safety_check").notNull().default(true),
  
  // Predictions
  predictedTat: integer("predicted_tat"),
  bottleneck: text("bottleneck"),
  penaltyRisk: integer("penalty_risk"),
  
  // For historical data
  actualTat: integer("actual_tat"),
  gateId: integer("gate_id"),
  status: text("status").notNull().default("COMPLETED"), // SCHEDULED, ACTIVE, COMPLETED
});

export const gates = pgTable("gates", {
  id: serial("id").primaryKey(),
  gateNumber: text("gate_number").notNull(), // G1-G8
  status: text("status").notNull(), // FREE, ACTIVE, CLEARING
  currentFlightId: integer("current_flight_id"), // references flights.id
});

// === BASE SCHEMAS ===
export const insertFlightSchema = createInsertSchema(flights).omit({ id: true });
export const insertGateSchema = createInsertSchema(gates).omit({ id: true });

// === EXPLICIT API CONTRACT TYPES ===
export type Flight = typeof flights.$inferSelect;
export type InsertFlight = z.infer<typeof insertFlightSchema>;
export type Gate = typeof gates.$inferSelect;
export type InsertGate = z.infer<typeof insertGateSchema>;

export const predictRequestSchema = z.object({
  flightNumber: z.string(),
  airline: z.string(),
  aircraftType: z.string(),
  arrivalTime: z.string(),
  arrivalDelay: z.number().default(0),
  fuelLiters: z.number(),
  bagsCount: z.number(),
  priorityBags: z.number().default(0),
  mealsQty: z.number(),
  specialMeals: z.number().default(0),
  cateringRequired: z.boolean().default(true),
  safetyCheck: z.boolean().default(true),
});

export type PredictRequest = z.infer<typeof predictRequestSchema>;

export const predictResponseSchema = z.object({
  predictedTat: z.number(),
  bottleneck: z.string(),
  penaltyRisk: z.number(),
  baggageDuration: z.number(),
  fuelDuration: z.number(),
  cateringDuration: z.number(),
  safetyCheckDuration: z.number(),
});

export type PredictResponse = z.infer<typeof predictResponseSchema>;

export const monteCarloResponseSchema = z.object({
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
  p50Penalty: z.number(),
  p75Penalty: z.number(),
  p90Penalty: z.number(),
  bottleneckConsistency: z.number(),
  histogramData: z.array(z.object({
    bin: z.number(),
    count: z.number(),
  })),
});

export type MonteCarloResponse = z.infer<typeof monteCarloResponseSchema>;

export const analyticsResponseSchema = z.object({
  avgTatPerDay: z.array(z.object({ date: z.string(), avgTat: z.number() })),
  bottleneckFrequency: z.array(z.object({ bottleneck: z.string(), count: z.number() })),
  gateUtilization: z.array(z.object({ gate: z.string(), hour: z.number(), count: z.number() })),
  kpis: z.object({
    avgTat: z.number(),
    totalPenalties: z.number(),
    mostDelayedAirline: z.string(),
    peakDelayHour: z.string(),
  }),
});

export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;

export const gateWithFlightSchema = z.any(); // Custom type for Gate + Flight
export type GateWithFlight = Gate & { flight?: Flight };
