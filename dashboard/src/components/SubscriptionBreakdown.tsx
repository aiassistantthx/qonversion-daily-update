import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell, PieChart, Pie
} from 'recharts';
import { Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';

export interface SubscriptionBreakdownData {
  current: {
    weekly: { revenue: number; subscribers: number; percentage: number };
    yearly: { revenue: number; subscribers: number; percentage: number };
    total: { revenue: number; subscribers: number };
  };
  trend: Array<{
    month: string;
    weeklyRevenue: number;
    yearlyRevenue: number;
    weeklyPercentage: number;
    yearlyPercentage: number;
  }>;
}

interface SubscriptionBreakdownProps {
  data: SubscriptionBreakdownData | undefined;
}

const COLORS = {
  weekly: '#3b82f6',
  yearly: '#10b981',
};

export function SubscriptionBreakdown({ data }: SubscriptionBreakdownProps) {
  if (!data || !data.current) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Revenue by Subscription Type</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const pieData = [
    { name: 'Weekly', value: data.current.weekly?.revenue || 0, percentage: data.current.weekly?.percentage || 0 },
    { name: 'Yearly', value: data.current.yearly?.revenue || 0, percentage: data.current.yearly?.percentage || 0 },
  ];

  const trendData = data.trend?.map(t => ({
    month: t.month,
    Weekly: t.weeklyRevenue / 1000,
    Yearly: t.yearlyRevenue / 1000,
  })) || [];

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}K`;

  const handleExport = () => {
    const headers = ['Month', 'Weekly Revenue', 'Yearly Revenue', 'Weekly %', 'Yearly %'];
    const rows = (data.trend || []).map(t => [
      t.month,
      t.weeklyRevenue.toFixed(2),
      t.yearlyRevenue.toFixed(2),
      t.weeklyPercentage.toFixed(1) + '%',
      t.yearlyPercentage.toFixed(1) + '%',
    ]);
    exportToCSV('subscription-breakdown', headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Revenue by Subscription Type
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Weekly vs Yearly subscription revenue breakdown. Current month and trend over time.
          </p>
        </div>
        <button
          onClick={handleExport}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          title="Export trend to CSV"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Weekly KPI */}
        <div style={{ background: '#eff6ff', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500, marginBottom: 4 }}>
            Weekly Subscriptions
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>
            {fmtK(data.current.weekly.revenue)}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {data.current.weekly.subscribers} subs • {data.current.weekly.percentage.toFixed(0)}% of revenue
          </div>
        </div>

        {/* Yearly KPI */}
        <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500, marginBottom: 4 }}>
            Yearly Subscriptions
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#047857' }}>
            {fmtK(data.current.yearly.revenue)}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {data.current.yearly.subscribers} subs • {data.current.yearly.percentage.toFixed(0)}% of revenue
          </div>
        </div>

        {/* Total KPI */}
        <div style={{ background: '#f3f4f6', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>
            Total Revenue
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
            {fmtK(data.current.total.revenue)}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            {data.current.total.subscribers} total subscribers
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 24 }}>
        {/* Pie Chart */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
            Current Month
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={(props) => `${props.name || ''} ${((props.percent || 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  <Cell fill={COLORS.weekly} />
                  <Cell fill={COLORS.yearly} />
                </Pie>
                <Tooltip
                  formatter={(value) => [fmt(Number(value)), '']}
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Trend Chart */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
            Monthly Trend
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickFormatter={v => `$${v}K`}
                />
                <Tooltip
                  formatter={(value) => [`$${Number(value).toFixed(1)}K`, '']}
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                />
                <Legend />
                <Bar dataKey="Weekly" stackId="a" fill={COLORS.weekly} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Yearly" stackId="a" fill={COLORS.yearly} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
