import { useAlerts } from "@/hooks/useAlerts";

export function AlertBanner() {
  const { criticalAlerts, warningAlerts, acknowledge } = useAlerts();

  if (criticalAlerts.length === 0 && warningAlerts.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-1 px-4 py-2 bg-[#0a0c10] z-50">

      {criticalAlerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center gap-3 px-4 py-3
            bg-red-950/50 border border-red-500/30 rounded-sm"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full
              rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>

          <span className="text-red-400 font-mono text-xs font-bold uppercase tracking-wider">
            ⚠ CRITICAL
          </span>

          <span className="text-white font-mono text-xs">
            <span className="text-amber-400 font-bold">{alert.flightNumber}</span>
            {" · "}Gate {alert.gate}
            {" · "}
            <span className="text-red-300">{alert.bottleneck} delay</span>
            {" · "}+{alert.tatBloat} min TAT bloat
            {" · "}
            <span className="text-red-400 font-bold">
              ₹{alert.penaltyRisk.toLocaleString()} risk
            </span>
            {" · "}
            <span className="text-red-500/60">@ ₹5,400/min</span>
          </span>

          <button
            onClick={() => acknowledge(alert.id)}
            className="ml-auto text-amber-400 border border-amber-400/30
              px-3 py-1 text-xs font-mono rounded-sm
              hover:bg-amber-400/10 transition-colors"
          >
            → PRIORITIZE & DISMISS
          </button>
        </div>
      ))}

      {warningAlerts.map((alert) => (
        <div
          key={alert.id}
          className="flex items-center gap-3 px-4 py-2
            bg-amber-950/30 border border-amber-500/20 rounded-sm"
        >
          <span className="text-amber-400 font-mono text-xs font-bold uppercase tracking-wider">
            ⚡ WARNING
          </span>
          <span className="text-white font-mono text-xs">
            <span className="text-amber-400 font-bold">{alert.flightNumber}</span>
            {" · "}Gate {alert.gate}
            {" · "}{alert.bottleneck}
            {" · "}+{alert.tatBloat} min
            {" · "}₹{alert.penaltyRisk.toLocaleString()}
          </span>
          <button
            onClick={() => acknowledge(alert.id)}
            className="ml-auto text-amber-400/60 text-xs font-mono
              hover:text-amber-400 transition-colors"
          >
            Dismiss
          </button>
        </div>
      ))}

    </div>
  );
}