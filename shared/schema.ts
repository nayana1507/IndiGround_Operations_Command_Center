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
  arrivalDelay: integer("arrival_delay").notNull().default(0),
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

  // Historical
  actualTat: integer("actual_tat"),
  gateId: integer("gate_id"),

  // DAY 2: status now includes "DIVERTED" and "FUEL_QUEUE"
  // SCHEDULED, ACTIVE, COMPLETED, DIVERTED, FUEL_QUEUE
  status: text("status").notNull().default("COMPLETED"),

  // DAY 2: penalty rate per minute (default 5400 domestic, 15000 international)
  penaltyRatePerMin: integer("penalty_rate_per_min").notNull().default(5400),

  // DAY 2: fuel queue position (null = not queued, 1-4 = being fuelled, 5+ = waiting)
  fuelQueuePosition: integer("fuel_queue_position"),

  // DAY 2: fuel start time (when bowser started fuelling this flight)
  fuelStartTime: timestamp("fuel_start_time"),
});

export const gates = pgTable("gates", {
  id: serial("id").primaryKey(),
  gateNumber: text("gate_number").notNull(),
  status: text("status").notNull(), // FREE, ACTIVE, CLEARING
  currentFlightId: integer("current_flight_id"),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  flightNumber: text("flight_number").notNull(),
  gate: integer("gate").notNull(),
  bottleneck: text("bottleneck").notNull(),
  tatBloat: integer("tat_bloat").notNull(),
  penaltyRisk: integer("penalty_risk").notNull(),
  severity: text("severity").notNull().default("warning"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// DAY 2: Crisis state table — tracks whether fuel crisis is active
export const crisisState = pgTable("crisis_state", {
  id: serial("id").primaryKey(),
  fuelCrisisActive: boolean("fuel_crisis_active").notNull().default(false),
  bowserCount: integer("bowser_count").notNull().default(4), // max simultaneous fuelling
  manualPumpSpeed: integer("manual_pump_speed").notNull().default(500), // liters per minute
  activatedAt: timestamp("activated_at"),
});

// === SCHEMAS ===
export const insertFlightSchema = createInsertSchema(flights).omit({ id: true });
export const insertGateSchema = createInsertSchema(gates).omit({ id: true });
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true });
export const insertCrisisStateSchema = createInsertSchema(crisisState).omit({ id: true });

// === TYPES ===
export type Flight = typeof flights.$inferSelect;
export type InsertFlight = z.infer<typeof insertFlightSchema>;
export type Gate = typeof gates.$inferSelect;
export type InsertGate = z.infer<typeof insertGateSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type CrisisState = typeof crisisState.$inferSelect;

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
  // DAY 2
  fuelCrisisActive: z.boolean().default(false),
  penaltyRatePerMin: z.number().default(5400),
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
  // DAY 2
  fuelQueueDelay: z.number().optional(),
  isManualFuelling: z.boolean().optional(),
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

export const gateWithFlightSchema = z.any();
export type GateWithFlight = Gate & { flight?: Flight };