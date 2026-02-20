import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { predictRequestSchema, type PredictRequest } from "@shared/schema";
import { usePredictTat, useMonteCarlo } from "@/hooks/use-tarmac";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Calculator, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function Predict() {
  const [step, setStep] = useState(1);
  const predictMutation = usePredictTat();
  const mcMutation = useMonteCarlo();

  const form = useForm<PredictRequest>({
    resolver: zodResolver(predictRequestSchema),
    defaultValues: {
      flightNumber: "",
      airline: "",
      aircraftType: "Narrow",
      arrivalTime: new Date().toISOString(),
      arrivalDelay: 0,
      fuelLiters: 5000,
      bagsCount: 150,
      priorityBags: 20,
      mealsQty: 180,
      specialMeals: 5,
      cateringRequired: true,
      safetyCheck: true,
    },
  });

  const onSubmit = async (data: PredictRequest) => {
    await Promise.all([
      predictMutation.mutateAsync(data),
      mcMutation.mutateAsync(data)
    ]);
    setStep(2);
  };

  const isCalculating = predictMutation.isPending || mcMutation.isPending;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-display font-bold text-white">AI Prediction Engine</h1>
          <p className="text-muted-foreground">
            Enter flight parameters to simulate turnaround time and potential bottlenecks.
          </p>
        </div>

        {step === 1 && (
          <Card className="glass-card p-8 border-white/10">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="flightNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Flight Number</FormLabel>
                        <FormControl>
                          <Input placeholder="AI-302" {...field} className="bg-black/20 border-white/10" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="airline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Airline</FormLabel>
                        <FormControl>
                          <Input placeholder="Air India" {...field} className="bg-black/20 border-white/10" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="aircraftType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aircraft Type</FormLabel>
                        <FormControl>
                          <select 
                            {...field} 
                            className="w-full h-10 px-3 rounded-md border border-white/10 bg-black/20 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="Narrow">Narrow Body (A320/B737)</option>
                            <option value="Wide">Wide Body (A350/B777)</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="arrivalDelay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Arrival Delay (min)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value))} 
                            className="bg-black/20 border-white/10" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator className="bg-white/10" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <FormField
                    control={form.control}
                    name="bagsCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bags Count</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value))} 
                            className="bg-black/20 border-white/10" 
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fuelLiters"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Refuel Amount (L)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value))} 
                            className="bg-black/20 border-white/10" 
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                   <FormField
                    control={form.control}
                    name="mealsQty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meals Quantity</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value))} 
                            className="bg-black/20 border-white/10" 
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-6">
                  <FormField
                    control={form.control}
                    name="cateringRequired"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 rounded-md border border-white/10 bg-white/5">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Catering Required</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="safetyCheck"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-4 rounded-md border border-white/10 bg-white/5">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Full Safety Check</FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <Button 
                  type="submit" 
                  disabled={isCalculating}
                  className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                >
                  {isCalculating ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Running Neural Network Prediction...
                    </div>
                  ) : (
                    <>
                      <Calculator className="w-5 h-5 mr-2" />
                      Run Prediction
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </Card>
        )}

        {step === 2 && predictMutation.data && (
          <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-500 fade-in">
            <Card className="glass-card border-white/10 overflow-hidden">
              <div className="bg-primary/10 p-6 border-b border-primary/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-display font-bold text-white mb-1">Prediction Complete</h2>
                    <p className="text-primary-foreground/80">Analysis based on {form.getValues().aircraftType} aircraft profile</p>
                  </div>
                  <CheckCircle2 className="w-12 h-12 text-primary opacity-50" />
                </div>
              </div>

              <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="text-center p-4 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-muted-foreground uppercase tracking-wider text-sm mb-2">Predicted TAT</p>
                  <p className="text-4xl font-display font-bold text-white">{predictMutation.data.predictedTat} <span className="text-lg text-muted-foreground">min</span></p>
                </div>
                
                <div className="text-center p-4 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-muted-foreground uppercase tracking-wider text-sm mb-2">Bottleneck</p>
                  <p className={`text-2xl font-bold ${predictMutation.data.bottleneck ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {predictMutation.data.bottleneck || "None"}
                  </p>
                  {predictMutation.data.bottleneck && <p className="text-xs text-amber-400/70 mt-1">Resource allocation needed</p>}
                </div>

                <div className="text-center p-4 rounded-xl bg-white/5 border border-white/5">
                  <p className="text-muted-foreground uppercase tracking-wider text-sm mb-2">Penalty Risk</p>
                  <p className={`text-4xl font-display font-bold ${predictMutation.data.penaltyRisk > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    ₹{predictMutation.data.penaltyRisk.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="px-8 pb-8 flex justify-end gap-4">
                <Button variant="outline" onClick={() => setStep(1)} className="border-white/10 hover:bg-white/5">
                  Run Another
                </Button>
                <Link href="/">
                  <Button className="bg-white text-black hover:bg-white/90">
                    Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
