import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, ReferenceLine, ReferenceArea
} from 'recharts';
import { Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';

const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308'
];

export interface TRoasData {
  cohorts: Array<{
    month: string;
    spend: number;
    breakevenDay: number | null;
    roas: {
      d7: number | null;
      d14: number | null;
      d30: number | null;
      d60: number | null;
      d90: number | null;
      d120: number | null;
      d180: number | null;
      current: number | null;
    };
  }>;
  chartData: Array<{ day: number; [key: string]: number | null }>;
  averageBreakevenDay: number | null;
}

interface TRoasChartProps {
  data: TRoasData | undefined;
  selectedCohorts?: string[];
}

export function TRoasChart({ data, selectedCohorts }: TRoasChartProps) {
  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>tROAS (Cumulative ROAS) by Cohort Age</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>API endpoint coming soon</div>
      </div>
    );
  }

  const chartData = data.chartData || [];
  const cohortMonths = data.cohorts?.map(c => c.month) || [];
  const displayCohorts = selectedCohorts?.length
    ? cohortMonths.filter(m => selectedCohorts.includes(m))
    : cohortMonths.slice(-6); // Last 6 cohorts

  // Find where to show shaded area (before breakeven)
  const avgBreakeven = data.averageBreakevenDay;

  const handleExport = () => {
    const headers = ['Cohort', 'Spend', 'D7', 'D14', 'D30', 'D60', 'D90', 'D120', 'D180', 'Current', 'Breakeven Day'];
    const rows = data.cohorts.map(c => [
      c.month,
      c.spend.toFixed(2),
      c.roas.d7 != null ? (c.roas.d7 * 100).toFixed(1) + '%' : '',
      c.roas.d14 != null ? (c.roas.d14 * 100).toFixed(1) + '%' : '',
      c.roas.d30 != null ? (c.roas.d30 * 100).toFixed(1) + '%' : '',
      c.roas.d60 != null ? (c.roas.d60 * 100).toFixed(1) + '%' : '',
      c.roas.d90 != null ? (c.roas.d90 * 100).toFixed(1) + '%' : '',
      c.roas.d120 != null ? (c.roas.d120 * 100).toFixed(1) + '%' : '',
      c.roas.d180 != null ? (c.roas.d180 * 100).toFixed(1) + '%' : '',
      c.roas.current != null ? (c.roas.current * 100).toFixed(1) + '%' : '',
      c.breakevenDay != null ? c.breakevenDay : '',
    ]);
    exportToCSV('troas-cohorts', headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
          tROAS (Cumulative ROAS) by Cohort Age
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
        Cumulative return on ad spend over time. 100% = breakeven point.
        {avgBreakeven && (
          <span style={{ marginLeft: 8, color: '#10b981', fontWeight: 500 }}>
            Avg breakeven: Day {avgBreakeven}
          </span>
        )}
      </p>
      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

            {/* Shaded area below breakeven */}
            {avgBreakeven && (
              <ReferenceArea
                x1={0}
                x2={avgBreakeven}
                y1={0}
                y2={1}
                fill="#fef2f2"
                fillOpacity={0.5}
              />
            )}

            <XAxis
              dataKey="day"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              label={{ value: 'Days since install', position: 'bottom', fill: '#6b7280' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              domain={[0, 'auto']}
            />

            {/* Breakeven line */}
            <ReferenceLine
              y={1}
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="5 5"
              label={{
                value: '100% ROAS (Breakeven)',
                position: 'right',
                fill: '#10b981',
                fontSize: 11
              }}
            />

            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              formatter={(v) => {
                const pct = (Number(v) * 100).toFixed(1);
                return [`${pct}%`, ''];
              }}
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

      {/* Breakeven summary */}
      {data.cohorts && data.cohorts.length > 0 && (
        <div style={{ marginTop: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Cohort</th>
                <th style={thRightStyle}>Spend</th>
                <th style={thRightStyle}>D30</th>
                <th style={thRightStyle}>D60</th>
                <th style={thRightStyle}>D90</th>
                <th style={thRightStyle}>Current</th>
                <th style={thRightStyle}>Breakeven</th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.slice(-8).reverse().map((cohort, i) => {
                const isPaidBack = cohort.roas.current && cohort.roas.current >= 1;
                return (
                  <tr key={cohort.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...tdStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: COHORT_COLORS[i % COHORT_COLORS.length]
                      }} />
                      {cohort.month}
                    </td>
                    <td style={tdRightStyle}>${cohort.spend.toLocaleString()}</td>
                    <td style={tdRightStyle}>
                      {cohort.roas.d30 ? `${(cohort.roas.d30 * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td style={tdRightStyle}>
                      {cohort.roas.d60 ? `${(cohort.roas.d60 * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td style={tdRightStyle}>
                      {cohort.roas.d90 ? `${(cohort.roas.d90 * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td style={{
                      ...tdRightStyle,
                      fontWeight: 600,
                      color: isPaidBack ? '#10b981' : '#ef4444'
                    }}>
                      {cohort.roas.current ? `${(cohort.roas.current * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td style={{
                      ...tdRightStyle,
                      color: cohort.breakevenDay ? '#10b981' : '#9ca3af'
                    }}>
                      {cohort.breakevenDay
                        ? `Day ${cohort.breakevenDay} ✓`
                        : (isPaidBack ? '✓' : 'pending')}
                    </td>
                  </tr>
                );
              })}
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
