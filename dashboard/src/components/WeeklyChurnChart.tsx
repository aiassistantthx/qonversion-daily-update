import {
  Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine, ComposedChart
} from 'recharts';
import { Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';

const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16'
];

export interface WeeklyChurnData {
  cohorts: Array<{
    month: string;
    initialSubs: number;
    churnByWeek: {
      w1: number | null;
      w2: number | null;
      w3: number | null;
      w4: number | null;
      w8: number | null;
      w12: number | null;
    };
    retentionByWeek: {
      w1: number | null;
      w2: number | null;
      w3: number | null;
      w4: number | null;
      w8: number | null;
      w12: number | null;
    };
    steadyStateChurn: number | null;
  }>;
  chartData: Array<{ week: number; [key: string]: number | null }>;
  averages: {
    w1Churn: number;
    w4Churn: number;
    steadyStateChurn: number;
  };
}

interface WeeklyChurnChartProps {
  data: WeeklyChurnData | undefined;
}

export function WeeklyChurnChart({ data }: WeeklyChurnChartProps) {
  if (!data || !data.cohorts || !data.chartData) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Weekly Churn Analysis</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const chartData = data.chartData;
  const cohortMonths = data.cohorts.map(c => c.month).slice(-6);

  const handleExport = () => {
    const headers = ['Cohort', 'Initial', 'W1', 'W2', 'W3', 'W4', 'W8', 'W12', 'Steady State'];
    const rows = (data.cohorts || []).map(c => [
      c.month,
      c.initialSubs,
      formatPct(c.retentionByWeek.w1),
      formatPct(c.retentionByWeek.w2),
      formatPct(c.retentionByWeek.w3),
      formatPct(c.retentionByWeek.w4),
      formatPct(c.retentionByWeek.w8),
      formatPct(c.retentionByWeek.w12),
      formatPct(c.steadyStateChurn),
    ]);
    exportToCSV('weekly-churn', headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Weekly Subscription Churn Analysis
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Weekly churn curve showing % of subscribers retained by week. Critical for weekly revenue forecasting.
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

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#fef2f2', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500 }}>W1 Churn</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#b91c1c' }}>
            {data.averages?.w1Churn ? `${(data.averages.w1Churn * 100).toFixed(0)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>First week dropout</div>
        </div>
        <div style={{ background: '#fef3c7', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>W4 Churn</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#d97706' }}>
            {data.averages?.w4Churn ? `${(data.averages.w4Churn * 100).toFixed(0)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>First month dropout</div>
        </div>
        <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>Steady State</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#047857' }}>
            {data.averages?.steadyStateChurn ? `${(data.averages.steadyStateChurn * 100).toFixed(0)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>W12+ retention rate</div>
        </div>
      </div>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={w => `W${w}`}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              domain={[0, 1]}
            />

            {/* 50% retention reference */}
            <ReferenceLine
              y={0.5}
              stroke="#9ca3af"
              strokeDasharray="5 5"
            />

            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              formatter={(v) => [`${((Number(v) || 0) * 100).toFixed(1)}%`, '']}
              labelFormatter={(week) => `Week ${week}`}
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed table */}
      {data.cohorts && data.cohorts.length > 0 && (
        <div style={{ marginTop: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Cohort</th>
                <th style={thRightStyle}>Initial</th>
                <th style={thRightStyle}>W1</th>
                <th style={thRightStyle}>W2</th>
                <th style={thRightStyle}>W3</th>
                <th style={thRightStyle}>W4</th>
                <th style={thRightStyle}>W8</th>
                <th style={thRightStyle}>W12</th>
                <th style={thRightStyle}>Steady</th>
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
                  <td style={tdRightStyle}>{cohort.initialSubs}</td>
                  <td style={retentionCell(cohort.retentionByWeek.w1)}>
                    {formatPct(cohort.retentionByWeek.w1)}
                  </td>
                  <td style={retentionCell(cohort.retentionByWeek.w2)}>
                    {formatPct(cohort.retentionByWeek.w2)}
                  </td>
                  <td style={retentionCell(cohort.retentionByWeek.w3)}>
                    {formatPct(cohort.retentionByWeek.w3)}
                  </td>
                  <td style={retentionCell(cohort.retentionByWeek.w4)}>
                    {formatPct(cohort.retentionByWeek.w4)}
                  </td>
                  <td style={retentionCell(cohort.retentionByWeek.w8)}>
                    {formatPct(cohort.retentionByWeek.w8)}
                  </td>
                  <td style={retentionCell(cohort.retentionByWeek.w12)}>
                    {formatPct(cohort.retentionByWeek.w12)}
                  </td>
                  <td style={{
                    ...tdRightStyle,
                    fontWeight: 600,
                    color: cohort.steadyStateChurn ? '#10b981' : '#9ca3af'
                  }}>
                    {formatPct(cohort.steadyStateChurn)}
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

function formatPct(v: number | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

function retentionCell(v: number | null): React.CSSProperties {
  const baseStyle = tdRightStyle;
  if (v == null) return { ...baseStyle, color: '#9ca3af' };

  const pct = v * 100;
  let color = '#111827';
  if (pct >= 70) color = '#10b981';
  else if (pct >= 50) color = '#f59e0b';
  else color = '#ef4444';

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
