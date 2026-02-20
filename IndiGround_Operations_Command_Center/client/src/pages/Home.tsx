import { useGates, useIncomingFlights } from "@/hooks/use-tarmac";
import { Layout } from "@/components/Layout";
import { GateCard } from "@/components/GateCard";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, PlaneLanding, Timer, AlertCircle, TrendingUp, Calculator } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function Home() {
  const { data: gates, isLoading: gatesLoading } = useGates();
  const { data: incoming, isLoading: incomingLoading } = useIncomingFlights();

  const totalPenalty = gates?.reduce((acc, gate) => acc + (gate.flight?.penaltyRisk || 0), 0) || 0;
  
  // Color coding for penalty bar
  const penaltyColor = totalPenalty > 200000 ? "bg-red-500" : totalPenalty > 50000 ? "bg-amber-500" : "bg-emerald-500";
  const penaltyText = totalPenalty > 200000 ? "text-red-400" : totalPenalty > 50000 ? "text-amber-400" : "text-emerald-400";

  if (gatesLoading || incomingLoading) {
    return (
      <Layout>
        <div className="flex h-[80vh] items-center justify-center flex-col gap-4">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse">Initializing TarmacIQ Systems...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Top Stats Bar */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-6 border-l-4 border-l-primary flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-background/50 flex items-center justify-center">
              <TrendingUp className={cn("w-6 h-6", penaltyText)} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Penalty Risk</p>
              <h2 className={cn("text-3xl font-display font-bold", penaltyText)}>
                ₹{totalPenalty.toLocaleString()}
              </h2>
            </div>
          </div>

          <div className="h-10 w-px bg-white/10 hidden md:block" />

          <div className="flex items-center gap-8">
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Active Gates</p>
              <p className="text-xl font-bold text-white">
                {gates?.filter(g => g.status === 'ACTIVE').length} <span className="text-sm text-muted-foreground">/ {gates?.length}</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">Critical Bottlenecks</p>
              <p className="text-xl font-bold text-red-400">
                {gates?.filter(g => g.flight?.bottleneck).length || 0}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase">On-Time Perf</p>
              <p className="text-xl font-bold text-emerald-400">92%</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Gate Grid */}
          <div className="lg:col-span-3 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
                <div className="w-2 h-8 bg-primary rounded-sm" />
                Live Gate Status
              </h2>
              <div className="flex gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Free
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Active
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Clearing
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {gates?.map((gate) => (
                <GateCard key={gate.id} gate={gate} />
              ))}
            </div>
          </div>

          {/* Right Sidebar - Incoming */}
          <div className="lg:col-span-1 space-y-6">
            <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <div className="w-2 h-8 bg-purple-500 rounded-sm" />
              Incoming
            </h2>

            <div className="glass-card rounded-xl overflow-hidden border border-white/5">
              <div className="divide-y divide-white/5">
                {incoming?.map((flight, i) => (
                  <motion.div
                    key={flight.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="p-4 hover:bg-white/5 transition-colors group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                          <PlaneLanding className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{flight.flightNumber}</p>
                          <p className="text-xs text-muted-foreground">{flight.airline}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                        {new Date(flight.arrivalTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs mt-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Timer className="w-3.5 h-3.5" />
                        <span>Est. TAT: <span className="text-white font-medium">{flight.predictedTat}m</span></span>
                      </div>
                      {flight.penaltyRisk && flight.penaltyRisk > 0 && (
                        <div className="flex items-center gap-1.5 text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Risk</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="p-3 bg-white/5 border-t border-white/5">
                <Button variant="ghost" className="w-full text-xs h-8 text-muted-foreground hover:text-white">
                  View Schedule <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </Button>
              </div>
            </div>
            
            {/* Quick Action */}
            <div className="glass-card p-4 rounded-xl border border-white/5 bg-gradient-to-br from-primary/10 to-transparent">
              <h3 className="font-bold text-white mb-2">Manual Prediction</h3>
              <p className="text-xs text-muted-foreground mb-4">Run AI simulation for ad-hoc flights or schedule changes.</p>
              <Link href="/predict">
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
                  <Calculator className="w-4 h-4 mr-2" />
                  Predict Flight
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
