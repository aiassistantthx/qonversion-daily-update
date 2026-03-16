import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

export interface InstallsData {
  trend: Array<{ period: string; installs: number }>;
  topCountries: Array<{ country: string; installs: number }>;
  funnel: {
    installs: number;
    trials: number;
    paid: number;
    installToTrial: number | null;
    trialToPaid: number | null;
    installToPaid: number | null;
  };
}

const COUNTRY_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff'];

const fmtNum = (n: number) => n.toLocaleString();
const fmtPct = (n: number | null) => n != null ? `${n.toFixed(1)}%` : '—';

function FunnelStep({ label, value, rate, rateLabel }: { label: string; value: number; rate?: number | null; rateLabel?: string }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{fmtNum(value)}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{label}</div>
      {rate != null && (
        <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600, marginTop: 6 }}>
          {fmtPct(rate)} {rateLabel}
        </div>
      )}
    </div>
  );
}

function FunnelArrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', color: '#d1d5db', fontSize: 20, padding: '0 8px' }}>→</div>
  );
}

interface InstallsChartProps {
  data: InstallsData | undefined;
  isLoading?: boolean;
}

export function InstallsChart({ data, isLoading }: InstallsChartProps) {
  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading installs data...</div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Trend Chart */}
      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Installs Trend</h3>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="period"
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`;
                }}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
                formatter={(value) => [fmtNum(Number(value)), 'Installs']}
                labelFormatter={(label) => {
                  const d = new Date(label);
                  return d.toLocaleDateString('default', { year: 'numeric', month: 'long', day: 'numeric' });
                }}
              />
              <Bar dataKey="installs" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        {/* Top Countries */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Top 10 Countries by Installs</h3>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.topCountries}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                />
                <YAxis
                  type="category"
                  dataKey="country"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13 }}
                  formatter={(value) => [fmtNum(Number(value)), 'Installs']}
                />
                <Bar dataKey="installs" radius={[0, 4, 4, 0]}>
                  {data.topCountries.map((_, i) => (
                    <Cell key={i} fill={COUNTRY_COLORS[i % COUNTRY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Funnel */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Install → Trial → Paid Funnel</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 32, marginBottom: 24 }}>
            <FunnelStep label="Installs" value={data.funnel.installs} />
            <FunnelArrow />
            <FunnelStep
              label="Trials"
              value={data.funnel.trials}
              rate={data.funnel.installToTrial}
              rateLabel="of installs"
            />
            <FunnelArrow />
            <FunnelStep
              label="Paid"
              value={data.funnel.paid}
              rate={data.funnel.trialToPaid}
              rateLabel="of trials"
            />
          </div>
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, display: 'flex', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>
                {fmtPct(data.funnel.installToPaid)}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Overall Install → Paid</div>
            </div>
          </div>
        </div>
      </div>
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
};
