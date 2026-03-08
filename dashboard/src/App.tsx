import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Users, Target, Clock } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60000, retry: 1 } },
});

const fmt = (n: number | null | undefined) => n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
const fmtK = (n: number | null | undefined) => n != null ? `$${(n / 1000).toFixed(1)}K` : '—';
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : '—';
const fmtMonths = (n: number | null | undefined) => n != null ? `${n}mo` : '—';

interface DashboardData {
  currentMonth: {
    month: string;
    spend: number;
    revenue: number;
    subscribers: number;
    cop: number | null;
    cop3d: number | null;
    cop7d: number | null;
    crToPaid: number | null;
    forecastSpend: number;
    forecastRevenue: number;
    paybackMonths: number | null;
  };
  daily: Array<{
    date: string;
    revenue: number;
    spend: number;
    subscribers: number;
    cohortAge?: number;
    cop: number | null;
    copPredicted?: number | null;
    roas: number | null;
  }>;
  monthly: Array<{
    month: string;
    revenue: number;
    spend: number;
    trials: number;
    converted: number;
    subscribers: number;
    cop: number | null;
    copPredicted?: number | null;
    crToPaid: number | null;
    roas: number | null;
  }>;
}

function KPICard({ title, value, subtitle, icon: Icon, trend }: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ElementType;
  trend?: 'up' | 'down' | null;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>{title}</span>
        {Icon && <Icon size={18} color="#9ca3af" />}
      </div>
      <div style={styles.cardValue}>
        {value}
        {trend && (
          <span style={{ marginLeft: 8, color: trend === 'up' ? '#10b981' : '#ef4444' }}>
            {trend === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </span>
        )}
      </div>
      {subtitle && <div style={styles.cardSubtitle}>{subtitle}</div>}
    </div>
  );
}

function Dashboard() {
  const { data, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => fetch(`${API_URL}/dashboard/main`).then(r => r.json()),
  });

  const cm = data?.currentMonth;
  const daily = data?.daily || [];
  const monthly = data?.monthly || [];

  // Filter daily data for chart with COP and predicted COP
  const dailyChartData = daily.slice(-30).map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: d.revenue,
    spend: d.spend,
    cop: d.cop,
    copPredicted: d.copPredicted,
    roas: d.roas ? d.roas * 100 : null,
  }));

  const monthlyChartData = monthly.map(m => ({
    month: m.month,
    spend: m.spend / 1000,
    cop: m.cop,
    copPredicted: m.copPredicted,
  }));

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Dashboard</h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.dateRange}>
            {cm?.month || '—'}
          </div>
          <button style={styles.refreshBtn} onClick={() => refetch()}>
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Current Month KPIs - Row 1 */}
      <div style={styles.kpiGrid}>
        <KPICard title="Spend" value={fmtK(cm?.spend || 0)} icon={DollarSign} />
        <KPICard title="Revenue" value={fmtK(cm?.revenue || 0)} icon={TrendingUp} />
        <KPICard title="New Subscribers" value={String(cm?.subscribers || 0)} icon={Users} />
        <KPICard title="COP" value={fmt(cm?.cop)} subtitle="excl. last 4 days" icon={Target} />
      </div>

      {/* Current Month KPIs - Row 2 */}
      <div style={styles.kpiGrid}>
        <KPICard title="COP 3d" value={fmt(cm?.cop3d)} subtitle="closed cohorts" />
        <KPICard title="COP 7d" value={fmt(cm?.cop7d)} subtitle="closed cohorts" />
        <KPICard title="CR to Paid" value={fmtPct(cm?.crToPaid)} subtitle="closed cohorts" />
        <KPICard title="Payback" value={fmtMonths(cm?.paybackMonths)} subtitle="months to recover COP" icon={Clock} />
      </div>

      {/* Forecast KPIs */}
      <div style={{ ...styles.kpiGrid, gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <KPICard title="Forecast Spend (month)" value={fmtK(cm?.forecastSpend || 0)} />
        <KPICard title="Forecast Revenue (month)" value={fmtK(cm?.forecastRevenue || 0)} />
      </div>

      {/* Daily Chart */}
      <div style={styles.chartCard}>
        <h3 style={styles.chartTitle}>Last 30 Days</h3>
        <div style={styles.chartContainer}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                formatter={(v, name) => {
                  const val = Number(v) || 0;
                  if (name === 'revenue' || name === 'spend') return [`$${val.toLocaleString()}`, name];
                  if (name === 'cop' || name === 'COP') return [val ? `$${val.toFixed(0)}` : '—', 'COP'];
                  if (name === 'copPredicted' || name === 'COP Predicted') return [val ? `$${val.toFixed(0)}` : '—', 'COP Predicted'];
                  if (name === 'roas') return [val ? `${val.toFixed(0)}%` : '—', 'ROAS %'];
                  return [String(v), String(name)];
                }}
              />
              <Legend />
              <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={false} name="Revenue" />
              <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#ef4444" strokeWidth={2} dot={false} name="Spend" />
              <Line yAxisId="right" type="monotone" dataKey="cop" stroke="#10b981" strokeWidth={2} dot={false} name="COP" connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="copPredicted" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} name="COP Predicted" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Chart */}
      <div style={styles.chartCard}>
        <h3 style={styles.chartTitle}>Monthly Spend & COP</h3>
        <div style={styles.chartContainer}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                formatter={(v, name) => {
                  const val = Number(v) || 0;
                  if (name === 'Spend') return [`$${(val * 1000).toLocaleString()}`, String(name)];
                  if (name === 'COP' || name === 'COP Predicted') return [val ? `$${val.toFixed(0)}` : '—', String(name)];
                  return [String(v), String(name)];
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Spend" />
              <Line yAxisId="right" type="monotone" dataKey="cop" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="COP" connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="copPredicted" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} name="COP Predicted" connectNulls />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Table */}
      <div style={styles.tableCard}>
        <h3 style={styles.chartTitle}>Monthly Data</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Month</th>
                <th style={styles.thRight}>Spend</th>
                <th style={styles.thRight}>Revenue</th>
                <th style={styles.thRight}>Subs</th>
                <th style={styles.thRight}>COP</th>
                <th style={styles.thRight}>CR %</th>
                <th style={styles.thRight}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map(row => (
                <tr key={row.month} style={styles.tr}>
                  <td style={styles.td}>{row.month}</td>
                  <td style={styles.tdRight}>{fmt(row.spend)}</td>
                  <td style={styles.tdRight}>{fmt(row.revenue)}</td>
                  <td style={styles.tdRight}>{row.subscribers}</td>
                  <td style={styles.tdRight}>{row.cop ? fmt(row.cop) : '—'}</td>
                  <td style={styles.tdRight}>{row.crToPaid ? `${row.crToPaid.toFixed(1)}%` : '—'}</td>
                  <td style={{ ...styles.tdRight, color: row.roas && row.roas > 1 ? '#10b981' : '#ef4444' }}>
                    {row.roas ? `${row.roas.toFixed(2)}x` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: #f9fafb; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: 24,
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: '#111827',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dateRange: {
    padding: '8px 16px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: '#374151',
  },
  refreshBtn: {
    padding: 10,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#6b7280',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: 700,
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  chartCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 16,
  },
  chartContainer: {
    height: 300,
  },
  tableCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 12,
  },
  thRight: {
    textAlign: 'right',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 12,
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 8px',
    color: '#111827',
  },
  tdRight: {
    padding: '12px 8px',
    color: '#111827',
    textAlign: 'right',
    fontFamily: "'JetBrains Mono', monospace",
  },
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}

export default App;
