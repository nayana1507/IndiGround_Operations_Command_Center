import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { 
  type PredictRequest, 
  type PredictResponse, 
  type MonteCarloResponse,
  type AnalyticsResponse,
  type GateWithFlight,
  type Flight
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// === GATES ===
export function useGates() {
  return useQuery({
    queryKey: [api.gates.list.path],
    queryFn: async () => {
      const res = await fetch(api.gates.list.path);
      if (!res.ok) throw new Error("Failed to fetch gates");
      return await res.json() as GateWithFlight[];
    },
    refetchInterval: 5000, // Real-time polling
  });
}

// === FLIGHTS ===
export function useIncomingFlights() {
  return useQuery({
    queryKey: [api.flights.listIncoming.path],
    queryFn: async () => {
      const res = await fetch(api.flights.listIncoming.path);
      if (!res.ok) throw new Error("Failed to fetch incoming flights");
      return await res.json() as Flight[];
    },
    refetchInterval: 10000,
  });
}

export function useFlight(id: number) {
  return useQuery({
    queryKey: [api.flights.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.flights.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch flight");
      return await res.json() as Flight;
    },
  });
}

// === PREDICTIONS ===
export function usePredictTat() {
  const { toast } = useToast();
  
  return useMutation({
    mutationFn: async (data: PredictRequest) => {
      const res = await fetch(api.predict.predictTat.path, {
        method: api.predict.predictTat.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Prediction failed");
      }
      return await res.json() as PredictResponse;
    },
    onError: (error) => {
      toast({
        title: "Prediction Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useMonteCarlo() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: PredictRequest) => {
      const res = await fetch(api.predict.monteCarlo.path, {
        method: api.predict.monteCarlo.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Simulation failed");
      }
      return await res.json() as MonteCarloResponse;
    },
    onError: (error) => {
      toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// === ANALYTICS ===
export function useAnalytics() {
  return useQuery({
    queryKey: [api.analytics.getStats.path],
    queryFn: async () => {
      const res = await fetch(api.analytics.getStats.path);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return await res.json() as AnalyticsResponse;
    },
  });
}
