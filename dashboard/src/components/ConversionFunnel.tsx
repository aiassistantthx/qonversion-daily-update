import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';

export interface FunnelStep {
  step: string;
  value: number;
  conversionFromPrev: number | null;
  conversionFromInstall: number | null;
  weekly?: number;
  yearly?: number;
}

export interface FunnelTrendPoint {
  month: string;
  installs: number;
  trialStarts: number;
  paid: number;
  renewals: number;
  trialWeekly: number;
  trialYearly: number;
  paidWeekly: number;
  paidYearly: number;
  installToTrial: number | null;
  trialToPaid: number | null;
  paidToRenewal: number | null;
  installToPaid: number | null;
}

export interface ConversionFunnelData {
  funnel: FunnelStep[];
  trend: FunnelTrendPoint[];
}

interface ConversionFunnelProps {
  data: ConversionFunnelData | undefined;
  isLoading?: boolean;
}

const STEP_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b'];

const fmtNum = (n: number) => n.toLocaleString();
const fmtPct = (n: number | null) => n != null ? `${n.toFixed(1)}%` : '—';

type TrendKey = 'installToTrial' | 'trialToPaid' | 'paidToRenewal' | 'installToPaid';

const TREND_LINES: Array<{ key: TrendKey; label: string; color: string }> = [
  { key: 'installToTrial', label: 'Install → Trial', color: '#6366f1' },
  { key: 'trialToPaid', label: 'Trial → Paid', color: '#10b981' },
  { key: 'paidToRenewal', label: 'Paid → Renewal', color: '#f59e0b' },
  { key: 'installToPaid', label: 'Install → Paid', color: '#3b82f6' },
];

export function ConversionFunnel({ data, isLoading }: ConversionFunnelProps) {
  const [split, setSplit] = useState<'all' | 'weekly' | 'yearly'>('all');

  if (isLoading) {
    return (
      <div style={styles.card}>
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading funnel data...</div>
      </div>
    );
  }

  if (!data || !data.funnel || data.funnel.length === 0) return null;

  const maxValue = data.funnel[0]?.value || 1;

  return (
    <div>
      {/* Visual Funnel */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={styles.cardTitle}>Conversion Funnel</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'weekly', 'yearly'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSplit(s)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  background: split === s ? '#6366f1' : '#fff',
                  color: split === s ? '#fff' : '#374151',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: split === s ? 600 : 400,
                }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.funnel.map((step, i) => {
            const displayValue = split === 'weekly' && step.weekly != null
              ? step.weekly
              : split === 'yearly' && step.yearly != null
                ? step.yearly
                : step.value;
            const displayBarPct = maxValue > 0 ? (displayValue / maxValue) * 100 : 0;

            return (
              <div key={step.step}>
                {i > 0 && step.conversionFromPrev != null && (
                  <div style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                    {fmtPct(step.conversionFromPrev)} conversion
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 120, fontSize: 13, fontWeight: 500, color: '#374151', flexShrink: 0 }}>
                    {step.step}
                  </div>
                  <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 6, height: 36, position: 'relative' }}>
                    <div
                      style={{
                        width: `${displayBarPct}%`,
                        height: '100%',
                        background: STEP_COLORS[i % STEP_COLORS.length],
                        borderRadius: 6,
                        transition: 'width 0.3s',
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 12,
                      fontSize: 13,
                      fontWeight: 600,
                      color: displayBarPct > 30 ? '#fff' : '#374151',
                    }}>
                      {fmtNum(displayValue)}
                      {split !== 'all' && step.weekly != null && (
                        <span style={{ fontWeight: 400, marginLeft: 8, fontSize: 11, opacity: 0.8 }}>
                          ({fmtPct(step.value > 0 ? (displayValue / step.value) * 100 : null)} of total)
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ width: 80, textAlign: 'right', fontSize: 12, color: '#6b7280', flexShrink: 0 }}>
                    {step.conversionFromInstall != null && i > 0 && (
                      <span>{fmtPct(step.conversionFromInstall)} of install</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trend by month */}
      {data.trend && data.trend.length > 1 && (
        <div style={{ ...styles.card, marginTop: 24 }}>
          <h3 style={styles.cardTitle}>Conversion Rate Trend by Month</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#9ca3af" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => [fmtPct(typeof value === 'number' ? value : null), String(name)]}
                />
                <Legend />
                {TREND_LINES.map(({ key, label, color }) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Split table weekly/yearly */}
      {data.trend && data.trend.length > 0 && (
        <div style={{ ...styles.card, marginTop: 24 }}>
          <h3 style={styles.cardTitle}>Weekly vs Yearly Split by Month</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  <th style={styles.th}>Month</th>
                  <th style={styles.th}>Installs</th>
                  <th style={styles.th}>Trial Weekly</th>
                  <th style={styles.th}>Trial Yearly</th>
                  <th style={styles.th}>Paid Weekly</th>
                  <th style={styles.th}>Paid Yearly</th>
                  <th style={styles.th}>Install→Trial</th>
                  <th style={styles.th}>Trial→Paid</th>
                </tr>
              </thead>
              <tbody>
                {[...data.trend].reverse().map((row) => (
                  <tr key={row.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={styles.td}>{row.month}</td>
                    <td style={styles.td}>{fmtNum(row.installs)}</td>
                    <td style={styles.td}>{fmtNum(row.trialWeekly)}</td>
                    <td style={styles.td}>{fmtNum(row.trialYearly)}</td>
                    <td style={styles.td}>{fmtNum(row.paidWeekly)}</td>
                    <td style={styles.td}>{fmtNum(row.paidYearly)}</td>
                    <td style={{ ...styles.td, color: '#6366f1', fontWeight: 500 }}>{fmtPct(row.installToTrial)}</td>
                    <td style={{ ...styles.td, color: '#10b981', fontWeight: 500 }}>{fmtPct(row.trialToPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    border: '1px solid #e5e7eb',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 16,
  },
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  td: {
    padding: '8px 12px',
    color: '#374151',
  },
};
