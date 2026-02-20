import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type Alert = {
  id: number;
  flightNumber: string;
  gate: number;
  bottleneck: string;
  tatBloat: number;
  penaltyRisk: number;
  severity: string;
  acknowledged: boolean;
  createdAt: string;
};

async function fetchAlerts(): Promise<Alert[]> {
  const res = await fetch("/api/alerts");
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

export function useAlerts() {
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    refetchInterval: 30000,
  });

  const acknowledge = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/alerts/${id}/acknowledge`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Failed to acknowledge");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  return {
    alerts,
    criticalAlerts: alerts.filter((a) => a.severity === "critical"),
    warningAlerts: alerts.filter((a) => a.severity === "warning"),
    acknowledge: acknowledge.mutate,
  };
}