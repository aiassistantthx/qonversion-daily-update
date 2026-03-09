import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';

export interface TrendChartData {
  from: string;
  to: string;
  data: Array<{
    date: string;
    spend: number;
    revenue: number;
    roas: number;
  }>;
}

interface TrendChartProps {
  data: TrendChartData | undefined;
}

type MetricType = 'spend' | 'revenue' | 'roas';

export function TrendChart({ data }: TrendChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('roas');

  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Spend / Revenue / ROAS Trends</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>Loading...</div>
      </div>
    );
  }

  const chartData = data.data.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    spend: d.spend,
    revenue: d.revenue,
    roas: d.roas * 100,
  }));

  const getMetricConfig = (metric: MetricType) => {
    switch (metric) {
      case 'spend':
        return {
          title: 'Spend',
          color: '#ef4444',
          formatter: (v: number) => `$${(v / 1000).toFixed(1)}k`,
          yAxisFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
          tooltipLabel: 'Spend',
        };
      case 'revenue':
        return {
          title: 'Revenue',
          color: '#3b82f6',
          formatter: (v: number) => `$${(v / 1000).toFixed(1)}k`,
          yAxisFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
          tooltipLabel: 'Revenue',
        };
      case 'roas':
        return {
          title: 'ROAS',
          color: '#10b981',
          formatter: (v: number) => `${v.toFixed(0)}%`,
          yAxisFormatter: (v: number) => `${v.toFixed(0)}%`,
          tooltipLabel: 'ROAS',
        };
    }
  };

  const config = getMetricConfig(selectedMetric);

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            Spend / Revenue / ROAS Trends
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Daily metrics for the selected period
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setSelectedMetric('spend')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: selectedMetric === 'spend' ? '#ef4444' : '#fff',
              color: selectedMetric === 'spend' ? '#fff' : '#374151',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Spend
          </button>
          <button
            onClick={() => setSelectedMetric('revenue')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: selectedMetric === 'revenue' ? '#3b82f6' : '#fff',
              color: selectedMetric === 'revenue' ? '#fff' : '#374151',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Revenue
          </button>
          <button
            onClick={() => setSelectedMetric('roas')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: selectedMetric === 'roas' ? '#10b981' : '#fff',
              color: selectedMetric === 'roas' ? '#fff' : '#374151',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            ROAS
          </button>
        </div>
      </div>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={config.yAxisFormatter}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              formatter={(v) => [config.formatter(Number(v)), config.tooltipLabel]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey={selectedMetric}
              stroke={config.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={config.title}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
