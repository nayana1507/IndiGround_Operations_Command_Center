import { db } from "./db";
import { 
  flights, 
  gates,
  crisisState,
  type InsertFlight,
  type InsertGate,
  type Flight,
  type Gate,
  type GateWithFlight,
  type CrisisState,
} from "@shared/schema";
import { eq, lte, isNull, asc } from "drizzle-orm";

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

  // DAY 2: Fuel Crisis
  getCrisisState(): Promise<CrisisState | undefined>;
  activateFuelCrisis(): Promise<CrisisState>;
  deactivateFuelCrisis(): Promise<void>;
  getDivertedFlights(): Promise<Flight[]>;
  getFuelQueue(): Promise<Flight[]>;      // flights currently being fuelled (positions 1-4)
  getFuelWaiting(): Promise<Flight[]>;    // flights waiting for a bowser (position 5+)
  assignFuelBowser(flightId: number): Promise<{ assigned: boolean; queuePosition: number }>;
}

export class DatabaseStorage implements IStorage {
  // ── Flights ──────────────────────────────────────────────
  async getFlights(): Promise<Flight[]> {
    return await db.select().from(flights);
  }

  async getIncomingFlights(): Promise<Flight[]> {
    return await db.select().from(flights).where(eq(flights.status, "SCHEDULED"));
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

  // ── Gates ─────────────────────────────────────────────────
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

  // ── DAY 2: Crisis State ────────────────────────────────────
  async getCrisisState(): Promise<CrisisState | undefined> {
    const [state] = await db.select().from(crisisState);
    return state;
  }

  async activateFuelCrisis(): Promise<CrisisState> {
    const existing = await this.getCrisisState();
    if (existing) {
      const [updated] = await db
        .update(crisisState)
        .set({ fuelCrisisActive: true, activatedAt: new Date() })
        .where(eq(crisisState.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(crisisState)
      .values({ fuelCrisisActive: true, bowserCount: 4, manualPumpSpeed: 500, activatedAt: new Date() })
      .returning();
    return created;
  }

  async deactivateFuelCrisis(): Promise<void> {
    const existing = await this.getCrisisState();
    if (existing) {
      await db
        .update(crisisState)
        .set({ fuelCrisisActive: false })
        .where(eq(crisisState.id, existing.id));
    }
    // Clear all fuel queue positions
    await db
      .update(flights)
      .set({ fuelQueuePosition: null, fuelStartTime: null })
      .where(eq(flights.status, "FUEL_QUEUE"));
  }

  // ── DAY 2: Diverted Flights ────────────────────────────────
  async getDivertedFlights(): Promise<Flight[]> {
    return await db.select().from(flights).where(eq(flights.status, "DIVERTED"));
  }

  // ── DAY 2: Fuel Queue ──────────────────────────────────────
  async getFuelQueue(): Promise<Flight[]> {
    // Flights currently being fuelled (have a queue position and fuelStartTime)
    const allFuelFlights = await db
      .select()
      .from(flights)
      .where(eq(flights.status, "FUEL_QUEUE"));

    return allFuelFlights
      .filter(f => f.fuelQueuePosition !== null)
      .sort((a, b) => (a.fuelQueuePosition ?? 0) - (b.fuelQueuePosition ?? 0));
  }

  async getFuelWaiting(): Promise<Flight[]> {
    // Flights waiting for a bowser (queue position > 4)
    const queue = await this.getFuelQueue();
    return queue.filter(f => (f.fuelQueuePosition ?? 0) > 4);
  }

  async assignFuelBowser(flightId: number): Promise<{ assigned: boolean; queuePosition: number }> {
    const crisis = await this.getCrisisState();
    const bowserLimit = crisis?.bowserCount ?? 4;

    // Count how many flights are currently being actively fuelled (position 1-4)
    const queue = await this.getFuelQueue();
    const activeBowsers = queue.filter(f => (f.fuelQueuePosition ?? 0) <= bowserLimit).length;

    if (activeBowsers < bowserLimit) {
      // Assign immediately
      const position = activeBowsers + 1;
      await this.updateFlight(flightId, {
        fuelQueuePosition: position,
        fuelStartTime: new Date(),
        status: "FUEL_QUEUE",
      });
      return { assigned: true, queuePosition: position };
    } else {
      // Add to waiting queue
      const waitingPosition = queue.length + 1;
      await this.updateFlight(flightId, {
        fuelQueuePosition: waitingPosition,
        status: "FUEL_QUEUE",
      });
      return { assigned: false, queuePosition: waitingPosition };
    }
  }
}

export const storage = new DatabaseStorage();