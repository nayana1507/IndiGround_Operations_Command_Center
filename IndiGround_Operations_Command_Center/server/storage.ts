import { db } from "./db";
import { 
  flights, 
  gates,
  type InsertFlight,
  type InsertGate,
  type Flight,
  type Gate,
  type GateWithFlight
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Flights
  getFlights(): Promise<Flight[]>;
  getIncomingFlights(): Promise<Flight[]>;
  getFlight(id: number): Promise<Flight | undefined>;
  createFlight(flight: InsertFlight): Promise<Flight>;
  updateFlight(id: number, updates: Partial<InsertFlight>): Promise<Flight>;
  
  // Gates
  getGates(): Promise<GateWithFlight[]>;
  getGate(id: number): Promise<Gate | undefined>;
  createGate(gate: InsertGate): Promise<Gate>;
  updateGate(id: number, updates: Partial<InsertGate>): Promise<Gate>;
}

export class DatabaseStorage implements IStorage {
  async getFlights(): Promise<Flight[]> {
    return await db.select().from(flights);
  }

  async getIncomingFlights(): Promise<Flight[]> {
    const now = new Date();
    return await db.select().from(flights).where(eq(flights.status, 'SCHEDULED'));
  }

  async getFlight(id: number): Promise<Flight | undefined> {
    const [flight] = await db.select().from(flights).where(eq(flights.id, id));
    return flight;
  }

  async createFlight(flight: InsertFlight): Promise<Flight> {
    const [newFlight] = await db.insert(flights).values(flight).returning();
    return newFlight;
  }

  async updateFlight(id: number, updates: Partial<InsertFlight>): Promise<Flight> {
    const [updated] = await db.update(flights).set(updates).where(eq(flights.id, id)).returning();
    return updated;
  }

  async getGates(): Promise<GateWithFlight[]> {
    const allGates = await db.select().from(gates);
    const gatesWithFlights = await Promise.all(
      allGates.map(async (gate) => {
        if (gate.currentFlightId) {
          const flight = await this.getFlight(gate.currentFlightId);
          return { ...gate, flight };
        }
        return gate;
      })
    );
    return gatesWithFlights;
  }

  async getGate(id: number): Promise<Gate | undefined> {
    const [gate] = await db.select().from(gates).where(eq(gates.id, id));
    return gate;
  }

  async createGate(gate: InsertGate): Promise<Gate> {
    const [newGate] = await db.insert(gates).values(gate).returning();
    return newGate;
  }

  async updateGate(id: number, updates: Partial<InsertGate>): Promise<Gate> {
    const [updated] = await db.update(gates).set(updates).where(eq(gates.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
