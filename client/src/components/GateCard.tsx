import { motion } from "framer-motion";
import { Plane, AlertTriangle, Clock, Activity, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GateWithFlight } from "@shared/schema";
import { Link } from "wouter";

interface GateCardProps {
  gate: GateWithFlight;
}

export function GateCard({ gate }: GateCardProps) {
  const isOccupied = gate.status === "ACTIVE" || gate.status === "CLEARING";
  const hasPenaltyRisk = (gate.flight?.penaltyRisk || 0) > 0;
  
  // Progress calc
  const predictedTat = gate.flight?.predictedTat || 45; // default 45m
  const elapsed = 25; // Mock elapsed time for demo
  const progress = Math.min((elapsed / predictedTat) * 100, 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "glass-card rounded-xl p-5 relative overflow-hidden group transition-all duration-300",
        gate.status === "ACTIVE" && "border-l-4 border-l-blue-500",
        gate.status === "CLEARING" && "border-l-4 border-l-amber-500",
        gate.status === "FREE" && "border-l-4 border-l-emerald-500 opacity-75 hover:opacity-100"
      )}
    >
      {/* Background glow for active gates */}
      {isOccupied && (
        <div className="absolute -right-10 -top-10 w-32 h-32 bg-primary/5 blur-3xl rounded-full group-hover:bg-primary/10 transition-colors" />
      )}

      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            {gate.gateNumber}
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold",
              gate.status === "ACTIVE" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
              gate.status === "CLEARING" && "bg-amber-500/10 text-amber-400 border-amber-500/20",
              gate.status === "FREE" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            )}>
              {gate.status}
            </span>
          </h3>
        </div>
        
        {isOccupied && gate.flight && (
          <div className="text-right">
             <Link href={`/flights/${gate.flight.id}`}>
               <span className="text-sm font-mono text-primary hover:underline cursor-pointer">
                 {gate.flight.flightNumber}
               </span>
             </Link>
             <p className="text-xs text-muted-foreground">{gate.flight.airline}</p>
          </div>
        )}
      </div>

      {isOccupied && gate.flight ? (
        <div className="space-y-4">
          <div className="flex justify-between items-end text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Bottleneck</span>
              <span className={cn(
                "font-medium flex items-center gap-1.5",
                gate.flight.bottleneck === "BAGGAGE" && "text-amber-400",
                gate.flight.bottleneck === "FUEL" && "text-red-400",
                !gate.flight.bottleneck && "text-emerald-400"
              )}>
                {gate.flight.bottleneck ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {gate.flight.bottleneck}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    None
                  </>
                )}
              </span>
            </div>
            
            <div className="flex flex-col gap-1 text-right">
              <span className="text-muted-foreground text-xs uppercase tracking-wider">Penalty Risk</span>
              <span className={cn(
                "font-mono font-medium",
                hasPenaltyRisk ? "text-red-400" : "text-emerald-400"
              )}>
                ₹{(gate.flight.penaltyRisk || 0).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{predictedTat}m EST</span>
            </div>
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className={cn(
                  "h-full rounded-full",
                  progress > 90 ? "bg-red-500" : "bg-primary"
                )}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center text-muted-foreground/30">
          <Plane className="w-12 h-12" />
        </div>
      )}
    </motion.div>
  );
}
