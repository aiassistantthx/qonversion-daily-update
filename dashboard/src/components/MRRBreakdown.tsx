import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Cell, LineChart, Line, PieChart, Pie
} from 'recharts';
import { Download, TrendingUp } from 'lucide-react';
import { exportToCSV } from '../utils/export';

export interface MRRBreakdownData {
  current: {
    newMrr: number;
    expansionMrr: number;
    churnMrr: number;
    reactivationMrr: number;
    netMrr: number;
    totalMrr: number;
    mrrGrowthRate: number;
    yearlyMrr?: number;
    weeklyMrr?: number;
  };
  breakdown: Array<{
    month: string;
    newMrr: number;
    expansionMrr: number;
    churnMrr: number;
    reactivationMrr: number;
    netMrr: number;
    totalMrr: number;
    mrrGrowthRate: number;
    yearlyMrr?: number;
    weeklyMrr?: number;
  }>;
  byType?: {
    yearly: number;
    weekly: number;
    yearlyPercentage: number;
    weeklyPercentage: number;
  };
}

interface MRRBreakdownProps {
  data: MRRBreakdownData | undefined;
}

const COLORS = {
  new: '#10b981',
  expansion: '#3b82f6',
  churn: '#ef4444',
  reactivation: '#8b5cf6',
  net: '#111827',
  yearly: '#10b981',
  weekly: '#3b82f6',
};

export function MRRBreakdown({ data }: MRRBreakdownProps) {
  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>MRR Breakdown</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>Loading...</div>
      </div>
    );
  }

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}K`;
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  // Waterfall chart data for current month
  const waterfallData = [
    { name: 'New MRR', value: data.current.newMrr, color: COLORS.new },
    { name: 'Expansion', value: data.current.expansionMrr, color: COLORS.expansion },
    { name: 'Churn', value: -data.current.churnMrr, color: COLORS.churn },
    { name: 'Reactivation', value: data.current.reactivationMrr, color: COLORS.reactivation },
  ];

  // Trend data for chart
  const trendData = data.breakdown.map(b => ({
    month: b.month,
    'New MRR': b.newMrr / 1000,
    'Expansion': b.expansionMrr / 1000,
    'Churn': -b.churnMrr / 1000,
    'Net MRR': b.netMrr / 1000,
    'Total MRR': b.totalMrr / 1000,
  }));

  const handleExport = () => {
    const headers = ['Month', 'New MRR', 'Expansion', 'Churn', 'Reactivation', 'Net MRR', 'Total MRR', 'Growth Rate %'];
    const rows = data.breakdown.map(b => [
      b.month,
      b.newMrr.toFixed(2),
      b.expansionMrr.toFixed(2),
      b.churnMrr.toFixed(2),
      b.reactivationMrr.toFixed(2),
      b.netMrr.toFixed(2),
      b.totalMrr.toFixed(2),
      b.mrrGrowthRate.toFixed(2),
    ]);
    exportToCSV('mrr-breakdown', headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            MRR Breakdown
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Monthly Recurring Revenue components: New, Expansion, Churn, Reactivation. Normalized to monthly amounts.
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
          title="Export to CSV"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      {/* Key Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500, marginBottom: 4 }}>
            New MRR
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#047857' }}>
            {fmtK(data.current.newMrr)}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            From new subscribers
          </div>
        </div>

        <div style={{ background: '#fef3c7', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500, marginBottom: 4 }}>
            Expansion
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>
            {fmtK(data.current.expansionMrr)}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            Upgrades
          </div>
        </div>

        <div style={{ background: '#fee2e2', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500, marginBottom: 4 }}>
            Churn
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>
            -{fmtK(data.current.churnMrr)}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            Lost revenue
          </div>
        </div>

        <div style={{ background: '#f3f4f6', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>
            Net MRR
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: data.current.netMrr >= 0 ? '#10b981' : '#ef4444' }}>
            {fmtK(data.current.netMrr)}
          </div>
          <div style={{ fontSize: 11, color: data.current.mrrGrowthRate >= 0 ? '#10b981' : '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <TrendingUp size={12} />
            {fmtPct(data.current.mrrGrowthRate)} MoM
          </div>
        </div>
      </div>

      {/* Current Month Waterfall */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
          Current Month Components
        </div>
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => fmtK(v)} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} width={100} />
              <Tooltip
                formatter={(value) => [fmt(Number(value)), '']}
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {waterfallData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Trend */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
          Month-over-Month Trend
        </div>
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
              <Bar dataKey="New MRR" stackId="a" fill={COLORS.new} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Expansion" stackId="a" fill={COLORS.expansion} radius={[0, 0, 0, 0]} />
              <Bar dataKey="Churn" stackId="a" fill={COLORS.churn} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Total MRR Line Chart */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
          Total MRR Growth
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
              <Line
                type="monotone"
                dataKey="Total MRR"
                stroke={COLORS.net}
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Total MRR"
              />
              <Line
                type="monotone"
                dataKey="Net MRR"
                stroke={COLORS.new}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3 }}
                name="Net MRR Change"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subscription Type Breakdown */}
      {data.byType && (
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 16 }}>
            MRR by Subscription Type
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24 }}>
            {/* Pie Chart */}
            <div>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Yearly', value: data.byType.yearly },
                        { name: 'Weekly', value: data.byType.weekly },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={(props) => `${props.name} ${((props.percent || 0) * 100).toFixed(0)}%`}
                    >
                      <Cell fill={COLORS.yearly} />
                      <Cell fill={COLORS.weekly} />
                    </Pie>
                    <Tooltip
                      formatter={(value) => [fmt(Number(value)), '']}
                      contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Metrics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, alignContent: 'start' }}>
              <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500, marginBottom: 4 }}>
                  Yearly MRR
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#047857' }}>
                  {fmtK(data.byType.yearly)}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  {data.byType.yearlyPercentage.toFixed(1)}% of total MRR
                </div>
              </div>

              <div style={{ background: '#eff6ff', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500, marginBottom: 4 }}>
                  Weekly MRR
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>
                  {fmtK(data.byType.weekly)}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                  {data.byType.weeklyPercentage.toFixed(1)}% of total MRR
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
