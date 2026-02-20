import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plane, Activity, BarChart3, Calculator, Menu, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { label: "Live Ops", icon: Activity, href: "/" },
  { label: "Flight Analysis", icon: Plane, href: "/flights" },
  { label: "Predict Flight", icon: Calculator, href: "/predict" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [now, setNow] = useState(new Date());

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
          <Plane className="text-white w-6 h-6 -rotate-45" />
        </div>
        <div>
          <h1 className="font-display font-bold text-xl tracking-tight text-white">TarmacIQ</h1>
          <p className="text-xs text-muted-foreground">Ops Intelligence</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer group",
                  isActive
                    ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-3px_rgba(0,170,255,0.2)]"
                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
                <span className="font-medium">{item.label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(0,170,255,0.8)]" />
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="glass-card p-4 rounded-xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-500">System Online</span>
          </div>
          <p className="text-xs text-muted-foreground">
            AI Models v2.4 active.
            <br />
            Real-time sync enabled.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 glass-panel h-screen sticky top-0 z-50">
        <NavContent />
      </aside>

      {/* Mobile Sidebar */}
      <div className="lg:hidden absolute top-4 left-4 z-50">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="glass-card border-white/10">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 bg-background border-r border-white/10 w-72">
            <NavContent />
          </SheetContent>
        </Sheet>
      </div>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto relative">
        {/* Header */}
        <header className="sticky top-0 z-40 px-8 py-4 glass-card border-b border-white/5 flex items-center justify-between mb-6">
          <div className="lg:hidden" />
          <div className="hidden lg:block">
            <h2 className="text-lg font-medium text-muted-foreground">
              {NAV_ITEMS.find(i => location === i.href || (i.href !== "/" && location.startsWith(i.href)))?.label || "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-sm font-display font-bold text-white tabular-nums">
                {timeStr}
              </span>
              <span className="text-xs text-muted-foreground">
                {dateStr}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-white">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-background" />
            </Button>
            <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/50 flex items-center justify-center text-primary font-bold text-xs">
              JD
            </div>
          </div>
        </header>

        <div className="px-4 md:px-8 pb-8 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}