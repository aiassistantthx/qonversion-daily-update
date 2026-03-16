import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts';

export interface LtvCacData {
  trend: Array<{
    month: string;
    spend: number;
    newSubs: number;
    cac: number | null;
    ltv: number | null;
    ratio: number | null;
  }>;
}

interface LtvCacChartProps {
  data: LtvCacData | undefined;
}

function getRatioColor(ratio: number | null): string {
  if (ratio == null) return '#9ca3af';
  if (ratio >= 3) return '#10b981';
  if (ratio >= 1) return '#f59e0b';
  return '#ef4444';
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const fmt = (n: number | null) => n != null ? `$${n.toFixed(0)}` : '—';
  const fmtR = (n: number | null) => n != null ? `${n.toFixed(2)}x` : '—';
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div>LTV: <b>{fmt(d.ltv)}</b></div>
      <div>CAC: <b>{fmt(d.cac)}</b></div>
      <div style={{ color: getRatioColor(d.ratio), fontWeight: 600 }}>
        LTV/CAC: {fmtR(d.ratio)}
      </div>
      <div style={{ color: '#9ca3af', marginTop: 4 }}>Subs: {d.newSubs}</div>
    </div>
  );
};

export function LtvCacChart({ data }: LtvCacChartProps) {
  if (!data || !data.trend || data.trend.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>LTV/CAC Ratio Trend</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const chartData = data.trend.map(r => ({
    month: r.month,
    ratio: r.ratio != null ? +r.ratio.toFixed(2) : null,
    ltv: r.ltv != null ? +r.ltv.toFixed(0) : null,
    cac: r.cac != null ? +r.cac.toFixed(0) : null,
    newSubs: r.newSubs,
  }));

  const latest = data.trend[data.trend.length - 1];
  const ratioColor = getRatioColor(latest?.ratio ?? null);
  const ratioLabel = latest?.ratio != null
    ? (latest.ratio >= 3 ? 'Healthy' : latest.ratio >= 1 ? 'Normal' : 'Unprofitable')
    : '—';

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            LTV/CAC Ratio Trend
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Lifetime value vs customer acquisition cost by cohort month.
            Current: <span style={{ color: ratioColor, fontWeight: 600 }}>
              {latest?.ratio != null ? `${latest.ratio.toFixed(2)}x` : '—'} ({ratioLabel})
            </span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#6b7280', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10b981', display: 'inline-block' }} />
            ≥3x Healthy
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b', display: 'inline-block' }} />
            1–3x Normal
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
            &lt;1x Unprofitable
          </span>
        </div>
      </div>

      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis
              yAxisId="ratio"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `${v}x`}
              domain={[0, 'auto']}
            />
            <YAxis
              yAxisId="dollars"
              orientation="right"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `$${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* Reference lines */}
            <ReferenceLine
              yAxisId="ratio"
              y={1}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: '1x breakeven', position: 'right', fill: '#ef4444', fontSize: 10 }}
            />
            <ReferenceLine
              yAxisId="ratio"
              y={3}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{ value: '3x healthy', position: 'right', fill: '#10b981', fontSize: 10 }}
            />

            {/* LTV/CAC ratio bars */}
            <Bar yAxisId="ratio" dataKey="ratio" name="LTV/CAC" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={getRatioColor(entry.ratio)} fillOpacity={0.85} />
              ))}
            </Bar>

            {/* LTV and CAC lines */}
            <Line
              yAxisId="dollars"
              type="monotone"
              dataKey="ltv"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="LTV ($)"
              connectNulls
            />
            <Line
              yAxisId="dollars"
              type="monotone"
              dataKey="cac"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="CAC ($)"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
