import { useAnalytics } from "@/hooks/use-tarmac";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell 
} from "recharts";
import { DollarSign, Clock, Plane, AlertOctagon } from "lucide-react";

export default function Analytics() {
  const { data, isLoading } = useAnalytics();

  if (isLoading || !data) {
    return (
      <Layout>
        <div className="flex h-screen items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </Layout>
    );
  }

  const KPICard = ({ title, value, icon: Icon, subtext, color = "text-white" }: any) => (
    <Card className="glass-card p-6 border-white/5">
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-sm text-muted-foreground uppercase tracking-wider">{title}</p>
          <h3 className={`text-3xl font-display font-bold ${color} mt-1`}>{value}</h3>
        </div>
        <div className={`p-3 rounded-lg bg-white/5 ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{subtext}</p>
    </Card>
  );

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  return (
    <Layout>
      <div className="space-y-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-white mb-2">Operations Analytics</h1>
          <p className="text-muted-foreground">Historical performance and bottleneck analysis for the last 30 days.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KPICard 
            title="Avg TAT" 
            value={`${data.kpis.avgTat}m`} 
            icon={Clock} 
            subtext="-2% vs last month"
            color="text-primary"
          />
          <KPICard 
            title="Total Penalties" 
            value={`₹${(data.kpis.totalPenalties / 100000).toFixed(1)}L`} 
            icon={DollarSign} 
            subtext="Critical threshold exceeded"
            color="text-red-400"
          />
          <KPICard 
            title="Peak Delay Hour" 
            value={data.kpis.peakDelayHour} 
            icon={AlertOctagon} 
            subtext="Consistently high load"
            color="text-amber-400"
          />
          <KPICard 
            title="Most Delayed" 
            value={data.kpis.mostDelayedAirline} 
            icon={Plane} 
            subtext="Requires optimization"
            color="text-blue-400"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="glass-card p-6 border-white/5">
            <h3 className="text-lg font-bold text-white mb-6">Average TAT Trend</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.avgTatPerDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickFormatter={str => new Date(str).getDate().toString()} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                  <Line type="monotone" dataKey="avgTat" stroke="#0ea5e9" strokeWidth={3} dot={{ fill: '#0ea5e9', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="glass-card p-6 border-white/5">
            <h3 className="text-lg font-bold text-white mb-6">Bottleneck Distribution</h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.bottleneckFrequency}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="bottleneck" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={50}>
                    {data.bottleneckFrequency.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card className="glass-card p-6 border-white/5">
          <h3 className="text-lg font-bold text-white mb-6">Gate Utilization (Heatmap Proxy)</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
               <BarChart data={data.gateUtilization.slice(0, 15)}> {/* Showing subset for demo */}
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="gate" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Flights Handled" />
               </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
