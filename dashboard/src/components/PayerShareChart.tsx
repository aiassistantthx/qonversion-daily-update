import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';

const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

export interface PayerShareData {
  cohorts: Array<{
    month: string;
    totalUsers: number;
    payerShare: {
      d1: number | null;
      d3: number | null;
      d7: number | null;
      d14: number | null;
      d30: number | null;
      d60: number | null;
    };
    trialConversions: {
      d1: number | null;
      d3: number | null;
      d7: number | null;
      d14: number | null;
      d30: number | null;
      d60: number | null;
    };
    directPurchases: {
      d1: number | null;
      d3: number | null;
      d7: number | null;
      d14: number | null;
      d30: number | null;
      d60: number | null;
    };
  }>;
  chartData: Array<{ day: number; [key: string]: number | null }>;
}

interface PayerShareChartProps {
  data: PayerShareData | undefined;
  mode?: 'all' | 'trial' | 'direct';
}

export function PayerShareChart({ data, mode = 'all' }: PayerShareChartProps) {
  if (!data) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
        Loading payer share data...
      </div>
    );
  }

  const chartData = data.chartData || [];
  const cohortMonths = data.cohorts?.map(c => c.month).slice(-6) || [];

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
        Payer Share by Day
      </h3>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        % of users who became paying customers after N days. Each line = one monthly cohort.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'trial', 'direct'].map(type => (
          <button
            key={type}
            style={{
              padding: '6px 12px',
              background: mode === type ? '#3b82f6' : '#f3f4f6',
              color: mode === type ? '#fff' : '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {type === 'all' ? 'All Payers' : type === 'trial' ? 'Trial Conversions' : 'Direct Purchases'}
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
              label={{ value: 'Days since install', position: 'bottom', fill: '#6b7280' }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `${(v * 100).toFixed(0)}%`}
              domain={[0, 0.3]}
            />
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

      {data.cohorts && data.cohorts.length > 0 && (
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
              </tr>
            </thead>
            <tbody>
              {data.cohorts.slice(-8).reverse().map((cohort, i) => {
                const dataToShow = mode === 'trial' ? cohort.trialConversions
                  : mode === 'direct' ? cohort.directPurchases
                  : cohort.payerShare;

                return (
                  <tr key={cohort.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...tdStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: COHORT_COLORS[i % COHORT_COLORS.length]
                      }} />
                      {cohort.month}
                    </td>
                    <td style={tdRightStyle}>{cohort.totalUsers.toLocaleString()}</td>
                    <td style={tdRightStyle}>{formatPct(dataToShow.d1)}</td>
                    <td style={tdRightStyle}>{formatPct(dataToShow.d3)}</td>
                    <td style={tdRightStyle}>{formatPct(dataToShow.d7)}</td>
                    <td style={tdRightStyle}>{formatPct(dataToShow.d14)}</td>
                    <td style={tdRightStyle}>{formatPct(dataToShow.d30)}</td>
                    <td style={tdRightStyle}>{formatPct(dataToShow.d60)}</td>
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

function formatPct(v: number | null): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
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
