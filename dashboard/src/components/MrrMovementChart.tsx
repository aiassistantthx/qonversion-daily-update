import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine,
} from 'recharts';
import { Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';

export interface MrrMovementData {
  current: {
    month: string;
    newMrr: number;
    renewalMrr: number;
    churnedMrr: number;
    netMrr: number;
    mrrGrowthRate: number;
  };
  breakdown: Array<{
    month: string;
    newMrr: number;
    renewalMrr: number;
    churnedMrr: number;
    netMrr: number;
    mrrGrowthRate: number;
  }>;
}

interface MrrMovementChartProps {
  data: MrrMovementData | undefined;
}

const COLORS = {
  new: '#10b981',
  renewal: '#3b82f6',
  churned: '#ef4444',
  net: '#111827',
};

export function MrrMovementChart({ data }: MrrMovementChartProps) {
  if (!data || !data.breakdown || data.breakdown.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>MRR Movement</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}K`;
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  const chartData = data.breakdown.map(b => ({
    month: b.month,
    'New MRR': +(b.newMrr / 1000).toFixed(2),
    'Renewal MRR': +(b.renewalMrr / 1000).toFixed(2),
    'Churned MRR': +(-b.churnedMrr / 1000).toFixed(2),
    'Net MRR': +(b.netMrr / 1000).toFixed(2),
    growthRate: +b.mrrGrowthRate.toFixed(1),
  }));

  const handleExport = () => {
    const headers = ['Month', 'New MRR', 'Renewal MRR', 'Churned MRR', 'Net MRR', 'Growth Rate %'];
    const rows = data.breakdown.map(b => [
      b.month,
      b.newMrr.toFixed(2),
      b.renewalMrr.toFixed(2),
      b.churnedMrr.toFixed(2),
      b.netMrr.toFixed(2),
      b.mrrGrowthRate.toFixed(2),
    ]);
    exportToCSV('mrr-movement', headers, rows);
  };

  const c = data.current;

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            MRR Movement
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            New MRR (new subscribers), Renewal MRR (renewals), Churned MRR (cancellations/expirations), Net MRR movement by month.
          </p>
        </div>
        <button
          onClick={handleExport}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 12px', background: '#f3f4f6', color: '#374151',
            border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Download size={14} />
          Export
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500, marginBottom: 4 }}>New MRR</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#047857' }}>{fmtK(c.newMrr)}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>New subscribers</div>
        </div>
        <div style={{ background: '#eff6ff', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500, marginBottom: 4 }}>Renewal MRR</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1e40af' }}>{fmtK(c.renewalMrr)}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Renewals</div>
        </div>
        <div style={{ background: '#fef2f2', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 500, marginBottom: 4 }}>Churned MRR</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#dc2626' }}>-{fmtK(c.churnedMrr)}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Cancellations</div>
        </div>
        <div style={{ background: '#f3f4f6', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>Net MRR</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: c.netMrr >= 0 ? '#10b981' : '#ef4444' }}>{fmtK(c.netMrr)}</div>
          <div style={{ fontSize: 11, color: c.mrrGrowthRate >= 0 ? '#10b981' : '#ef4444', marginTop: 4 }}>{fmtPct(c.mrrGrowthRate)} MoM</div>
        </div>
      </div>

      {/* Stacked bar + Net MRR line */}
      <div style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis
              yAxisId="mrr"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `$${v}K`}
            />
            <YAxis
              yAxisId="net"
              orientation="right"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `$${v}K`}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => [`$${Number(value).toFixed(1)}K`, name]}
            />
            <Legend />
            <ReferenceLine yAxisId="net" y={0} stroke="#9ca3af" strokeDasharray="3 3" />
            <Bar yAxisId="mrr" dataKey="New MRR" stackId="a" fill={COLORS.new} />
            <Bar yAxisId="mrr" dataKey="Renewal MRR" stackId="a" fill={COLORS.renewal} />
            <Bar yAxisId="mrr" dataKey="Churned MRR" stackId="a" fill={COLORS.churned} radius={[4, 4, 0, 0]} />
            <Line
              yAxisId="net"
              type="monotone"
              dataKey="Net MRR"
              stroke={COLORS.net}
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Net MRR"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* MRR Growth Rate trend */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>MRR Growth Rate (%)</div>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Growth Rate']}
              />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
              <Bar dataKey="growthRate" fill="#6366f1" opacity={0.8} radius={[4, 4, 0, 0]} name="growthRate" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
