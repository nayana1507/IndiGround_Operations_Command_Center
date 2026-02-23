import { useParams } from "wouter";
import { useFlight, usePredictTat, useMonteCarlo } from "@/hooks/use-tarmac";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plane, Clock, AlertTriangle, RefreshCw, BarChart2, Activity } from "lucide-react";
import { useState, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, ReferenceLine 
} from "recharts";
import { motion } from "framer-motion";

export default function FlightAnalysis() {
  const { id } = useParams();
  const flightId = id ? parseInt(id) : 1; 
  
  const { data: flight, isLoading } = useFlight(flightId);
  const predictMutation = usePredictTat();
  const monteCarloMutation = useMonteCarlo();

  const [delayInput, setDelayInput] = useState(0);

  useEffect(() => {
    if (flight) setDelayInput(flight.arrivalDelay || 0);
  }, [flight]);

  useEffect(() => {
    if (!flight) return;
    const timer = setTimeout(() => {
      const request = {
        flightNumber: flight.flightNumber,
        airline: flight.airline,
        aircraftType: flight.aircraftType,
        arrivalTime: new Date().toISOString(),
        arrivalDelay: parseInt(String(delayInput)) || 0,
        fuelLiters: flight.fuelLiters,
        bagsCount: flight.bagsCount,
        priorityBags: flight.priorityBags,
        mealsQty: flight.mealsQty,
        specialMeals: flight.specialMeals,
        cateringRequired: flight.cateringRequired,
        safetyCheck: flight.safetyCheck,
        penaltyRatePerMin: (flight as any).penaltyRatePerMin ?? 5400,
        fuelCrisisActive: false,
      };
      predictMutation.mutate(request);
      monteCarloMutation.mutate(request);
    }, 600);
    return () => clearTimeout(timer);
  }, [delayInput, flight]);

  const handleSimulate = () => {
    if (!flight) return;
    const request = {
      flightNumber: flight.flightNumber,
      airline: flight.airline,
      aircraftType: flight.aircraftType,
      arrivalTime: new Date().toISOString(),
      arrivalDelay: parseInt(String(delayInput)),
      fuelLiters: flight.fuelLiters,
      bagsCount: flight.bagsCount,
      priorityBags: flight.priorityBags,
      mealsQty: flight.mealsQty,
      specialMeals: flight.specialMeals,
      cateringRequired: flight.cateringRequired,
      safetyCheck: flight.safetyCheck,
      penaltyRatePerMin: (flight as any).penaltyRatePerMin ?? 5400,
      fuelCrisisActive: false,
    };
    predictMutation.mutate(request);
    monteCarloMutation.mutate(request);
  };

  if (isLoading || !flight) {
    return (
      <Layout>
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  const predictedData = predictMutation.data;
  const mcData = monteCarloMutation.data;

  const currentTat = predictedData?.predictedTat || flight.predictedTat || 45;
  const currentRisk = predictedData?.penaltyRisk ?? flight.penaltyRisk ?? 0;
  const bottleneck = predictedData?.bottleneck || flight.bottleneck;

  // Gate display — use gateNumber if API provides it, else derive from gateId
  const gateDisplay = (flight as any).gateNumber
    ? (flight as any).gateNumber
    : flight.gateId
    ? `G${flight.gateId}`
    : "Unassigned";

  const processData = [
    { name: "Baggage", duration: predictedData?.baggageDuration || 25, fill: "#0ea5e9" },
    { name: "Fuel",    duration: predictedData?.fuelDuration    || 20, fill: "#8b5cf6" },
    { name: "Catering",duration: predictedData?.cateringDuration|| 30, fill: "#f59e0b" },
    { name: "Safety",  duration: predictedData?.safetyCheckDuration || 15, fill: "#10b981" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-display font-bold text-white">{flight.flightNumber}</h1>
              <span className="bg-white/10 text-white px-2 py-0.5 rounded text-sm font-medium border border-white/10">
                {flight.aircraftType}
              </span>
              {flight.status === "DIVERTED" && (
                <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-sm font-medium border border-red-500/30">
                  DIVERTED
                </span>
              )}
            </div>
            <p className="text-muted-foreground">
              {flight.airline} • Gate {gateDisplay}
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="border-white/10 hover:bg-white/5" onClick={() => window.location.reload()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel */}
          <div className="lg:col-span-3 space-y-6">
            <div className="glass-card p-6 rounded-xl space-y-6">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Scenario Inputs
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Arrival Delay (minutes)</Label>
                  <Input 
                    type="number" 
                    value={delayInput} 
                    onChange={(e) => setDelayInput(parseInt(e.target.value))}
                    className="bg-black/20 border-white/10 text-white"
                  />
                </div>
                <div className="pt-4 border-t border-white/10 space-y-4">
                  <div>
                    <span className="text-sm text-muted-foreground">Predicted TAT</span>
                    <div className="text-3xl font-display font-bold text-white">{currentTat} min</div>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">Penalty Risk</span>
                    <div className={`text-2xl font-display font-bold ${currentRisk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      ₹{currentRisk.toLocaleString()}
                    </div>
                  </div>
                  {bottleneck && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        Bottleneck: {bottleneck}
                      </div>
                      <p className="text-xs text-amber-300/80">
                        {bottleneck === "FUEL"
                          ? flight.status === "DIVERTED"
                            ? "Manual bowser fuelling in effect. ₹15,000/min penalty accruing."
                            : "Manual bowser assigned (Bowser 4). Queue delay affecting TAT."
                          : `Expedite ${bottleneck.toLowerCase()} crew to save approx 5-10 mins.`}
                      </p>
                    </div>
                  )}
                  {/* Show penalty rate for international */}
                  {flight.status === "DIVERTED" && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-xs text-red-400 font-bold">₹15,000 / min penalty</p>
                      <p className="text-xs text-red-300/70 mt-0.5">International diversion rate</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Center Panel */}
          <div className="lg:col-span-5 space-y-6">
            <div className="glass-card p-6 rounded-xl h-full flex flex-col">
              <h3 className="font-bold text-white flex items-center gap-2 mb-6">
                <BarChart2 className="w-4 h-4 text-primary" />
                Sub-Process Breakdown
              </h3>
              <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={60} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                      cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    />
                    <Bar dataKey="duration" radius={[0, 4, 4, 0]} barSize={32} animationDuration={1000} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                {processData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                      <span className="text-sm text-white">{item.name}</span>
                    </div>
                    <span className="text-sm font-mono text-muted-foreground">{item.duration}m</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Monte Carlo */}
          <div className="lg:col-span-4 space-y-6">
            <div className="glass-card p-6 rounded-xl h-full flex flex-col">
              <h3 className="font-bold text-white flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                Monte Carlo Simulation
              </h3>
              <p className="text-xs text-muted-foreground mb-6">Distribution of 1,000 simulated scenarios based on current variables.</p>
              {mcData ? (
                <div className="flex-1">
                  <div className="h-[200px] w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mcData.histogramData}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="bin" stroke="#64748b" fontSize={10} tickFormatter={(val) => `${val}m`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)' }}
                          labelStyle={{ color: '#94a3b8' }}
                        />
                        <Area type="monotone" dataKey="count" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorCount)" />
                        <ReferenceLine x={mcData.p90} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'P90', fill: '#ef4444', fontSize: 10 }} />
                        <ReferenceLine x={mcData.p50} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'P50', fill: '#10b981', fontSize: 10 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-sm text-emerald-400 font-medium">P50 (Median)</span>
                      <div className="text-right">
                        <div className="text-white font-bold">{mcData.p50} min</div>
                        <div className="text-xs text-muted-foreground">₹{mcData.p50Penalty.toLocaleString()} risk</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-sm text-blue-400 font-medium">P75 (Likely)</span>
                      <div className="text-right">
                        <div className="text-white font-bold">{mcData.p75} min</div>
                        <div className="text-xs text-muted-foreground">₹{mcData.p75Penalty.toLocaleString()} risk</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-sm text-red-400 font-medium">P90 (Worst Case)</span>
                      <div className="text-right">
                        <div className="text-white font-bold">{mcData.p90} min</div>
                        <div className="text-xs text-muted-foreground">₹{mcData.p90Penalty.toLocaleString()} risk</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-white/10 rounded-lg">
                  <Activity className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground mb-4">No simulation data available.</p>
                  <Button variant="outline" onClick={handleSimulate} className="border-white/10 hover:bg-white/5">
                    Run Analysis
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}