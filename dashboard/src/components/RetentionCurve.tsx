import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from 'recharts';
import { useTheme, themes } from '../styles/themes';

export interface RetentionCurvePoint {
  period: number;
  retention: number | null;
  yearlyRetention: number | null;
  weeklyRetention: number | null;
}

interface RetentionCurveProps {
  averageCurve: RetentionCurvePoint[] | undefined;
  isLoading: boolean;
}

const BENCHMARK_M1 = 40; // Industry average ~40% M1 for subscription apps

export function RetentionCurve({ averageCurve, isLoading }: RetentionCurveProps) {
  const { theme } = useTheme();
  const t = themes[theme];

  if (isLoading) {
    return (
      <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
        <div style={{ color: t.textMuted, textAlign: 'center', padding: 32 }}>Loading retention curve...</div>
      </div>
    );
  }

  if (!averageCurve || averageCurve.length === 0) {
    return (
      <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
        <div style={{ color: t.textMuted, textAlign: 'center', padding: 32 }}>No data available</div>
      </div>
    );
  }

  return (
    <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: t.text, margin: 0 }}>Retention Curve</h3>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
          Average retention across all cohorts by month since install. Dashed line = industry benchmark (~40% M1).
        </div>
      </div>
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={averageCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
            <XAxis
              dataKey="period"
              tick={{ fill: t.textMuted, fontSize: 11 }}
              tickFormatter={(v) => `M${v}`}
              label={{ value: 'Months since install', position: 'insideBottom', offset: -5, fill: t.textMuted, fontSize: 12 }}
            />
            <YAxis
              tick={{ fill: t.textMuted, fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
              label={{ value: 'Retention %', angle: -90, position: 'insideLeft', fill: t.textMuted, fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: t.cardBg, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`]}
              labelFormatter={(label) => `Month ${label}`}
            />
            <Legend wrapperStyle={{ paddingTop: 20 }} iconType="line" />
            <ReferenceLine
              y={BENCHMARK_M1}
              stroke="#f59e0b"
              strokeDasharray="6 3"
              label={{ value: `Benchmark ${BENCHMARK_M1}%`, position: 'right', fill: '#f59e0b', fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="retention"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
              name="All"
            />
            <Line
              type="monotone"
              dataKey="yearlyRetention"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
              name="Yearly"
            />
            <Line
              type="monotone"
              dataKey="weeklyRetention"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
              name="Weekly"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid',
  padding: 20,
  marginBottom: 24,
};
