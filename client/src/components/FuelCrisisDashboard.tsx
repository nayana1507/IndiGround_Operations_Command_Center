import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, Fuel, Clock, Plane, CheckCircle, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DivertedFlight = {
  id: number;
  flightNumber: string;
  airline: string;
  fuelLiters: number;
  bagsCount: number;
  penaltyRatePerMin: number;
  penaltyRisk: number;
  elapsedMin: number;
  minsUntilArrival: number;
  penaltyAccrued: number;
  fuelDuration: number;
  bowserSlot: number | null;
  hasLanded: boolean;
  isBeingFuelled: boolean;
};

type DomesticQueueFlight = {
  id: number;
  flightNumber: string;
  airline: string;
  fuelLiters: number;
  fuelDuration: number;
  fuelElapsed: number;
  fuelRemaining: number;
  fuelProgress: number;
  isCurrentlyFuelling: boolean;
  estimatedWaitMins: number;
};

type FuelQueueResponse = {
  crisis: { fuelCrisisActive: boolean; bowserCount: number; manualPumpSpeed: number };
  bowserAllocation: { international: number[]; domestic: number[] };
  domesticQueue: DomesticQueueFlight[];
  domesticQueueLength: number;
};

type PenaltySummary = {
  international: { count: number; totalPenalty: number; ratePerMin: number };
  domestic: { count: number; totalPenalty: number; ratePerMin: number };
  grandTotal: number;
};

const AIRLINE_FLAGS: Record<string, string> = {
  "Air France": "🇫🇷",
  "Singapore Air": "🇸🇬",
  "British Airways": "🇬🇧",
  "Emirates": "🇦🇪",
  "Lufthansa": "🇩🇪",
};

export function FuelCrisisDashboard() {
  const queryClient = useQueryClient();
  const [livePenalties, setLivePenalties] = useState<Record<number, number>>({});
  const [grandTotal, setGrandTotal] = useState(0);

  const { data: crisis } = useQuery({
    queryKey: ["/api/crisis"],
    queryFn: async () => { const res = await fetch("/api/crisis"); return res.json(); },
    refetchInterval: 5000,
  });

  const { data: diverted = [] } = useQuery<DivertedFlight[]>({
    queryKey: ["/api/diverted"],
    queryFn: async () => { const res = await fetch("/api/diverted"); return res.json(); },
    refetchInterval: 10000,
    enabled: crisis?.fuelCrisisActive,
  });

  const { data: fuelQueue } = useQuery<FuelQueueResponse>({
    queryKey: ["/api/fuel-queue"],
    queryFn: async () => { const res = await fetch("/api/fuel-queue"); return res.json(); },
    refetchInterval: 5000,
    enabled: crisis?.fuelCrisisActive,
  });

  const { data: penaltySummary } = useQuery<PenaltySummary>({
    queryKey: ["/api/crisis/penalty-summary"],
    queryFn: async () => { const res = await fetch("/api/crisis/penalty-summary"); return res.json(); },
    refetchInterval: 10000,
    enabled: crisis?.fuelCrisisActive,
  });

  const activateMutation = useMutation({
    mutationFn: async () => { const res = await fetch("/api/crisis/activate", { method: "POST" }); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crisis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/diverted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crisis/penalty-summary"] });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => { const res = await fetch("/api/crisis/deactivate", { method: "POST" }); return res.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crisis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gates"] });
    },
  });

  // Live penalty ticker — every second
  useEffect(() => {
    if (!diverted.length) return;
    const timer = setInterval(() => {
      const updated: Record<number, number> = {};
      let total = 0;
      diverted.forEach(f => {
        if (!f.hasLanded) { updated[f.id] = 0; return; }
        const extra = ((Date.now() / 1000) % 60) / 60;
        const live = Math.round(f.penaltyAccrued + extra * f.penaltyRatePerMin);
        updated[f.id] = live;
        total += live;
      });
      setLivePenalties(updated);
      setGrandTotal(total + (penaltySummary?.domestic.totalPenalty ?? 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [diverted, penaltySummary]);

  // Not in crisis — show button only
  if (!crisis?.fuelCrisisActive) {
    return (
      <div className="glass-card rounded-xl p-5 border border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Fuel className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-white font-medium text-sm">Hydrant Fuelling System</p>
            <p className="text-xs text-emerald-400">Normal Operations · All systems clear</p>
          </div>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => activateMutation.mutate()}
          disabled={activateMutation.isPending}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          {activateMutation.isPending ? "Activating..." : "Simulate Day 2 Crisis"}
        </Button>
      </div>
    );
  }

  const landed = diverted.filter(f => f.hasLanded);
  const incoming = diverted.filter(f => !f.hasLanded);

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* ── Crisis Banner ── */}
      <div className="glass-card rounded-xl p-5 border border-red-500/40 bg-red-500/5">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">
                ⚠ FUEL CONTAMINATION CRISIS
                <span className="ml-2 text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full uppercase tracking-wider">ACTIVE</span>
              </h3>
              <p className="text-xs text-red-300/70 mt-0.5">
                Hydrant suspended · Manual bowsers only · 3:1 allocation (INT:DOM)
              </p>
            </div>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => deactivateMutation.mutate()}
            disabled={deactivateMutation.isPending}
            className="border-white/10 text-muted-foreground hover:bg-white/5 text-xs"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Resolve Crisis
          </Button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Pump Speed</p>
            <p className="text-white font-bold">500 L/min</p>
            <p className="text-[10px] text-red-400 mt-0.5">vs 1500 normal</p>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">INT Bowsers</p>
            <p className="text-white font-bold">3 / 4</p>
            <p className="text-[10px] text-amber-400 mt-0.5">reserved</p>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">DOM Bowser</p>
            <p className="text-white font-bold">1 / 4</p>
            <p className="text-[10px] text-blue-400 mt-0.5">{fuelQueue?.domesticQueueLength ?? 0} flights queued</p>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">INT Penalty</p>
            <p className="text-red-400 font-bold tabular-nums text-sm">
              ₹{Object.values(livePenalties).reduce((a, b) => a + b, 0).toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">₹15k/min each</p>
          </div>
          <div className="bg-black/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">DOM Penalty</p>
            <p className="text-amber-400 font-bold tabular-nums text-sm">
              ₹{(penaltySummary?.domestic.totalPenalty ?? 0).toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">₹5.4k/min each</p>
          </div>
        </div>
      </div>

      {/* ── 4 Bowser Visual ── */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-white font-bold flex items-center gap-2 mb-4">
          <Fuel className="w-4 h-4 text-amber-400" />
          Bowser Allocation — 3:1 Ratio
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(bowser => {
            const isIntBowser = bowser <= 3;
            const assignedFlight = isIntBowser
              ? diverted.find(f => f.bowserSlot === bowser && f.hasLanded)
              : fuelQueue?.domesticQueue.find(f => f.isCurrentlyFuelling);

            return (
              <div key={bowser} className={cn(
                "rounded-xl p-4 border",
                isIntBowser ? "border-red-500/20 bg-red-500/5" : "border-blue-500/20 bg-blue-500/5"
              )}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-white">Bowser {bowser}</span>
                  <span className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded-full border uppercase font-bold",
                    isIntBowser ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  )}>
                    {isIntBowser ? "INT" : "DOM"}
                  </span>
                </div>

                {assignedFlight ? (
                  <div>
                    <p className="text-xs font-mono text-white truncate">
                      {AIRLINE_FLAGS[assignedFlight.airline] ?? "✈"} {assignedFlight.flightNumber}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">{assignedFlight.airline}</p>
                    <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-1000",
                          isIntBowser ? "bg-red-400" : "bg-blue-400"
                        )}
                        style={{
                          width: isIntBowser
                            ? `${Math.min(100, Math.round(((assignedFlight as DivertedFlight).elapsedMin / (assignedFlight as DivertedFlight).fuelDuration) * 100))}%`
                            : `${(assignedFlight as DomesticQueueFlight).fuelProgress}%`
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                      {isIntBowser
                        ? `${(assignedFlight as DivertedFlight).fuelDuration - (assignedFlight as DivertedFlight).elapsedMin}m left`
                        : `${(assignedFlight as DomesticQueueFlight).fuelRemaining}m left`
                      }
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-[10px] text-muted-foreground">
                      {isIntBowser ? "Awaiting INT flight" : "Awaiting DOM flight"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Arrival Timeline ── */}
      <div className="glass-card rounded-xl p-5">
        <h3 className="text-white font-bold flex items-center gap-2 mb-4">
          <Timer className="w-4 h-4 text-primary" />
          International Flight Timeline
          <span className="text-xs text-muted-foreground font-normal ml-1">arrival sequence from dataset</span>
        </h3>

        {/* Landed */}
        {landed.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Already Landed</p>
            <div className="space-y-2">
              {landed.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-lg">
                  <span className="text-lg">{AIRLINE_FLAGS[f.airline] ?? "✈"}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-white">{f.flightNumber}</span>
                      <span className="text-xs text-muted-foreground">{f.airline}</span>
                      {f.bowserSlot && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
                          Bowser {f.bowserSlot}
                        </span>
                      )}
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400 rounded-full transition-all duration-1000"
                        style={{ width: `${Math.min(100, Math.round((f.elapsedMin / f.fuelDuration) * 100))}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right min-w-[80px]">
                    <p className="text-xs text-red-400 font-bold tabular-nums">
                      ₹{(livePenalties[f.id] ?? f.penaltyAccrued).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{f.elapsedMin}m elapsed</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gap indicator */}
        {landed.length > 0 && incoming.length > 0 && (
          <div className="flex items-center gap-2 my-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-muted-foreground px-2">
              ⬇ {incoming[0].minsUntilArrival}m until next arrival — domestic bowsers free in gap
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
        )}

        {/* Incoming */}
        {incoming.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Incoming</p>
            <div className="space-y-2">
              {incoming.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-lg opacity-70">
                  <span className="text-lg">{AIRLINE_FLAGS[f.airline] ?? "✈"}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-white">{f.flightNumber}</span>
                      <span className="text-xs text-muted-foreground">{f.airline}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {f.fuelLiters.toLocaleString()}L needed · {f.fuelDuration}m fuel time
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-blue-400 tabular-nums">in {f.minsUntilArrival}m</p>
                    <p className="text-[10px] text-muted-foreground">₹15k/min on land</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Domestic Queue ── */}
      {(fuelQueue?.domesticQueue.length ?? 0) > 0 && (
        <div className="glass-card rounded-xl p-5">
          <h3 className="text-white font-bold flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-blue-400" />
            Domestic Bowser Queue
            <span className="text-xs text-blue-400 font-normal">Bowser 4 only</span>
          </h3>
          <div className="space-y-2">
            {fuelQueue!.domesticQueue.map((f, idx) => (
              <div key={f.id} className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                f.isCurrentlyFuelling ? "bg-blue-500/5 border-blue-500/20" : "bg-white/5 border-white/5"
              )}>
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  f.isCurrentlyFuelling ? "bg-blue-500/20 text-blue-400" : "bg-white/10 text-muted-foreground"
                )}>
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-mono text-white">{f.flightNumber}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {f.isCurrentlyFuelling ? `${f.fuelRemaining}m remaining` : `~${f.estimatedWaitMins}m wait`}
                    </span>
                  </div>
                  {f.isCurrentlyFuelling && (
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full transition-all duration-1000"
                        style={{ width: `${f.fuelProgress}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border uppercase font-semibold shrink-0",
                  f.isCurrentlyFuelling
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    : "bg-white/5 text-muted-foreground border-white/10"
                )}>
                  {f.isCurrentlyFuelling ? "Fuelling" : "Waiting"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </motion.div>
  );
}