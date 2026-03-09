import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine
} from 'recharts';
import { Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';

const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export interface RetentionData {
  cohorts: Array<{
    month: string;
    subscriptionType: 'weekly' | 'yearly' | 'all';
    users: number;
    retention: {
      d1: number | null;
      d3: number | null;
      d7: number | null;
      d14: number | null;
      d30: number | null;
      d60: number | null;
      d90: number | null;
    };
  }>;
  chartData: Array<{ day: number; [key: string]: number | null }>;
  benchmarks: {
    d1: number;
    d7: number;
    d30: number;
  };
}

interface RetentionChartProps {
  data: RetentionData | undefined;
  subscriptionType?: 'weekly' | 'yearly' | 'all';
}

export function RetentionChart({ data, subscriptionType = 'all' }: RetentionChartProps) {
  if (!data || !data.cohorts || !data.chartData) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Retention Analysis</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const chartData = data.chartData;
  const filteredCohorts = data.cohorts.filter(c =>
    subscriptionType === 'all' || c.subscriptionType === subscriptionType
  );
  const cohortMonths = filteredCohorts.map(c => c.month).slice(-6);

  const handleExport = () => {
    const typeLabel = subscriptionType === 'all' ? 'all' : subscriptionType;
    const headers = ['Cohort', 'Type', 'Users', 'D1', 'D3', 'D7', 'D14', 'D30', 'D60', 'D90'];
    const rows = filteredCohorts.map(c => [
      c.month,
      c.subscriptionType,
      c.users,
      formatRetention(c.retention.d1),
      formatRetention(c.retention.d3),
      formatRetention(c.retention.d7),
      formatRetention(c.retention.d14),
      formatRetention(c.retention.d30),
      formatRetention(c.retention.d60),
      formatRetention(c.retention.d90),
    ]);
    exportToCSV(`retention-${typeLabel}`, headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
          Retention by Day
        </h3>
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
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        % of users with active subscription after N days. Each line = one monthly cohort.
      </p>

      {/* Subscription type toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'weekly', 'yearly'].map(type => (
          <button
            key={type}
            style={{
              padding: '6px 12px',
              background: subscriptionType === type ? '#3b82f6' : '#f3f4f6',
              color: subscriptionType === type ? '#fff' : '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="day"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              label={{ value: 'Days since subscription', position: 'bottom', fill: '#6b7280' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              domain={[0, 1]}
            />

            {/* Industry benchmark line */}
            {data.benchmarks && (
              <ReferenceLine
                y={data.benchmarks.d30 / 100}
                stroke="#9ca3af"
                strokeDasharray="5 5"
                label={{
                  value: `D30 Benchmark: ${data.benchmarks.d30}%`,
                  position: 'right',
                  fill: '#9ca3af',
                  fontSize: 10
                }}
              />
            )}

            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              formatter={(v) => [`${((Number(v) || 0) * 100).toFixed(1)}%`, '']}
              labelFormatter={(day) => `Day ${day}`}
            />
            <Legend />
            {cohortMonths.map((month, i) => (
              <Line
                key={month}
                type="monotone"
                dataKey={month}
                stroke={COHORT_COLORS[i % COHORT_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
                name={month}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Retention table */}
      {filteredCohorts.length > 0 && (
        <div style={{ marginTop: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Cohort</th>
                <th style={thRightStyle}>Users</th>
                <th style={thRightStyle}>D1</th>
                <th style={thRightStyle}>D3</th>
                <th style={thRightStyle}>D7</th>
                <th style={thRightStyle}>D14</th>
                <th style={thRightStyle}>D30</th>
                <th style={thRightStyle}>D60</th>
                <th style={thRightStyle}>D90</th>
              </tr>
            </thead>
            <tbody>
              {filteredCohorts.slice(-8).reverse().map((cohort, i) => (
                <tr key={cohort.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...tdStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: COHORT_COLORS[i % COHORT_COLORS.length]
                    }} />
                    {cohort.month}
                  </td>
                  <td style={tdRightStyle}>{cohort.users.toLocaleString()}</td>
                  <td style={retentionCell(cohort.retention.d1)}>
                    {formatRetention(cohort.retention.d1)}
                  </td>
                  <td style={retentionCell(cohort.retention.d3)}>
                    {formatRetention(cohort.retention.d3)}
                  </td>
                  <td style={retentionCell(cohort.retention.d7)}>
                    {formatRetention(cohort.retention.d7)}
                  </td>
                  <td style={retentionCell(cohort.retention.d14)}>
                    {formatRetention(cohort.retention.d14)}
                  </td>
                  <td style={retentionCell(cohort.retention.d30)}>
                    {formatRetention(cohort.retention.d30)}
                  </td>
                  <td style={retentionCell(cohort.retention.d60)}>
                    {formatRetention(cohort.retention.d60)}
                  </td>
                  <td style={retentionCell(cohort.retention.d90)}>
                    {formatRetention(cohort.retention.d90)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatRetention(v: number | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function retentionCell(v: number | null): React.CSSProperties {
  const baseStyle = tdRightStyle;
  if (v == null) return { ...baseStyle, color: '#9ca3af' };

  // Color based on retention level
  const pct = v * 100;
  let color = '#111827';
  if (pct >= 80) color = '#10b981';
  else if (pct >= 50) color = '#f59e0b';
  else if (pct < 30) color = '#ef4444';

  return { ...baseStyle, color };
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
  fontWeight: 500,
  fontSize: 12,
};

const thRightStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: 'right',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  color: '#111827',
};

const tdRightStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontFamily: "'JetBrains Mono', monospace",
};
