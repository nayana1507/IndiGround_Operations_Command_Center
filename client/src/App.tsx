import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AlertBanner } from "@/components/AlertBanner";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import FlightAnalysis from "@/pages/FlightAnalysis";
import Predict from "@/pages/Predict";
import Analytics from "@/pages/Analytics";
import ImportFlights from "@/pages/ImportFlights";

function Router() {
  return (
    <>
    <AlertBanner />
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/flights/:id" component={FlightAnalysis} />
      <Route path="/flights" component={() => <FlightAnalysis />} /> {/* Fallback default */}
      <Route path="/predict" component={Predict} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/import" component={ImportFlights} />
      <Route component={NotFound} />
    </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
