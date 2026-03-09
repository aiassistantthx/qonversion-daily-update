import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';
import { Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';

const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308'
];

export interface RevenueByDayData {
  cohorts: Array<{
    month: string;
    maxAge: number;
    users: number;
    revenue: {
      d0: number;
      d7: number;
      d14: number;
      d30: number;
      d60: number;
      d90: number;
      d120: number;
      d180: number;
    };
  }>;
  chartData: Array<{ day: number; [key: string]: number | null }>;
  days: number[];
}

interface RevenueByDayChartProps {
  data: RevenueByDayData | undefined;
  selectedCohorts?: string[];
}

export function RevenueByDayChart({ data, selectedCohorts }: RevenueByDayChartProps) {
  if (!data || !data.cohorts || !data.chartData) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Cumulative Revenue per User by Day</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const chartData = data.chartData;
  const cohortMonths = data.cohorts.map(c => c.month);
  const displayCohorts = selectedCohorts?.length
    ? cohortMonths.filter(m => selectedCohorts.includes(m))
    : cohortMonths.slice(-8); // Last 8 cohorts by default

  const handleExport = () => {
    const headers = ['Cohort', 'Users', 'D0', 'D7', 'D14', 'D30', 'D60', 'D90', 'D120', 'D180'];
    const rows = data.cohorts.map(c => [
      c.month,
      c.users,
      c.revenue.d0.toFixed(2),
      c.revenue.d7.toFixed(2),
      c.revenue.d14.toFixed(2),
      c.revenue.d30.toFixed(2),
      c.revenue.d60.toFixed(2),
      c.revenue.d90.toFixed(2),
      c.revenue.d120.toFixed(2),
      c.revenue.d180.toFixed(2),
    ]);
    exportToCSV('revenue-per-user', headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
          Cumulative Revenue per User by Day
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
        How revenue accumulates as cohorts mature. Each line = one monthly cohort. Y-axis = cumulative ARPU.
      </p>
      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="day"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              label={{ value: 'Days since install', position: 'bottom', fill: '#6b7280' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `$${v.toFixed(2)}`}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              formatter={(v) => [`$${Number(v).toFixed(2)}`, '']}
              labelFormatter={(day) => `Day ${day}`}
            />
            <Legend />
            {displayCohorts.map((month, i) => (
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

      {/* Cohort summary table */}
      {data.cohorts && data.cohorts.length > 0 && (
        <div style={{ marginTop: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Cohort</th>
                <th style={thRightStyle}>Users</th>
                <th style={thRightStyle}>D7</th>
                <th style={thRightStyle}>D30</th>
                <th style={thRightStyle}>D60</th>
                <th style={thRightStyle}>D90</th>
                <th style={thRightStyle}>D180</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.slice(-8).reverse().map((cohort, i) => (
                <tr key={cohort.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...tdStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: COHORT_COLORS[i % COHORT_COLORS.length]
                    }} />
                    {cohort.month}
                  </td>
                  <td style={tdRightStyle}>{cohort.users.toLocaleString()}</td>
                  <td style={tdRightStyle}>${cohort.revenue.d7?.toFixed(2) || '—'}</td>
                  <td style={tdRightStyle}>${cohort.revenue.d30?.toFixed(2) || '—'}</td>
                  <td style={tdRightStyle}>${cohort.revenue.d60?.toFixed(2) || '—'}</td>
                  <td style={tdRightStyle}>${cohort.revenue.d90?.toFixed(2) || '—'}</td>
                  <td style={tdRightStyle}>${cohort.revenue.d180?.toFixed(2) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
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
