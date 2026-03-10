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
    totalRevenue: number;
    roas: number;
    totalRoas: number;
    installs: number;
    trials: number;
    paid_users: number;
    cop?: number | null;
  }>;
}

interface TrendChartProps {
  data: TrendChartData | undefined;
}

type MetricType = 'spend' | 'revenue' | 'totalRevenue' | 'roas' | 'totalRoas' | 'cop';
type ChartMode = 'financial' | 'conversions';

export function TrendChart({ data }: TrendChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('financial');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('totalRevenue');

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Trends</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const chartData = data.data.map(d => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    spend: d.spend,
    revenue: d.revenue,
    totalRevenue: d.totalRevenue,
    roas: d.roas * 100,
    totalRoas: d.totalRoas * 100,
    installs: d.installs,
    trials: d.trials,
    paid_users: d.paid_users,
    cop: d.cop,
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
          title: 'Cohort Revenue',
          color: '#93c5fd',
          formatter: (v: number) => `$${(v / 1000).toFixed(1)}k`,
          yAxisFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
          tooltipLabel: 'Cohort Revenue',
        };
      case 'totalRevenue':
        return {
          title: 'Total Revenue',
          color: '#3b82f6',
          formatter: (v: number) => `$${(v / 1000).toFixed(1)}k`,
          yAxisFormatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
          tooltipLabel: 'Total Revenue',
        };
      case 'roas':
        return {
          title: 'Cohort ROAS',
          color: '#86efac',
          formatter: (v: number) => `${v.toFixed(0)}%`,
          yAxisFormatter: (v: number) => `${v.toFixed(0)}%`,
          tooltipLabel: 'Cohort ROAS',
        };
      case 'totalRoas':
        return {
          title: 'Total ROAS',
          color: '#10b981',
          formatter: (v: number) => `${v.toFixed(0)}%`,
          yAxisFormatter: (v: number) => `${v.toFixed(0)}%`,
          tooltipLabel: 'Total ROAS',
        };
      case 'cop':
        return {
          title: 'COP',
          color: '#f59e0b',
          formatter: (v: number) => `$${v?.toFixed(0) || '—'}`,
          yAxisFormatter: (v: number) => `$${v?.toFixed(0) || '0'}`,
          tooltipLabel: 'COP',
        };
    }
  };

  const config = getMetricConfig(selectedMetric);

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            {chartMode === 'financial' ? 'Daily Spend / Revenue / ROAS' : 'Conversion Funnel'}
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            {chartMode === 'financial' ? 'Total = all sources, Cohort = Apple Ads users who installed on that day' : 'Installs → Trials → Paid Users'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setChartMode('financial')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: chartMode === 'financial' ? '#6366f1' : '#fff',
              color: chartMode === 'financial' ? '#fff' : '#374151',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Spend/Revenue
          </button>
          <button
            onClick={() => setChartMode('conversions')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: chartMode === 'conversions' ? '#6366f1' : '#fff',
              color: chartMode === 'conversions' ? '#fff' : '#374151',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Conversions
          </button>
          {chartMode === 'financial' && (
            <>
              <div style={{ width: 1, background: '#e5e7eb', margin: '0 4px' }} />
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
                onClick={() => setSelectedMetric('totalRevenue')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  background: selectedMetric === 'totalRevenue' ? '#3b82f6' : '#fff',
                  color: selectedMetric === 'totalRevenue' ? '#fff' : '#374151',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Total Revenue
              </button>
              <button
                onClick={() => setSelectedMetric('totalRoas')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  background: selectedMetric === 'totalRoas' ? '#10b981' : '#fff',
                  color: selectedMetric === 'totalRoas' ? '#fff' : '#374151',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Total ROAS
              </button>
              <button
                onClick={() => setSelectedMetric('revenue')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  background: selectedMetric === 'revenue' ? '#93c5fd' : '#fff',
                  color: selectedMetric === 'revenue' ? '#fff' : '#9ca3af',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cohort
              </button>
              <button
                onClick={() => setSelectedMetric('roas')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  background: selectedMetric === 'roas' ? '#86efac' : '#fff',
                  color: selectedMetric === 'roas' ? '#fff' : '#9ca3af',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cohort ROAS
              </button>
              <button
                onClick={() => setSelectedMetric('cop')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #e5e7eb',
                  background: selectedMetric === 'cop' ? '#f59e0b' : '#fff',
                  color: selectedMetric === 'cop' ? '#fff' : '#9ca3af',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                COP
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'financial' ? (
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
                connectNulls
              />
            </LineChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 11 }}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="installs"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Installs"
              />
              <Line
                type="monotone"
                dataKey="trials"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Trials"
              />
              <Line
                type="monotone"
                dataKey="paid_users"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Paid Users"
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
