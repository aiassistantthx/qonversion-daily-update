import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export default function TrendChart({ data }) {
  const [selectedMetric, setSelectedMetric] = useState('spend');

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Trends</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const chartData = data.data.map((item, index) => {
    const baseData = {
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      spend: parseFloat(item.spend) || 0,
      revenue: parseFloat(item.revenue) || 0,
      roas: parseFloat(item.roas) || 0
    };

    if (data.prevData && data.prevData[index]) {
      baseData.prev_spend = parseFloat(data.prevData[index].spend) || 0;
      baseData.prev_revenue = parseFloat(data.prevData[index].revenue) || 0;
      baseData.prev_roas = parseFloat(data.prevData[index].roas) || 0;
    }

    return baseData;
  });

  const metrics = [
    { key: 'spend', label: 'Spend', color: '#3b82f6', prefix: '$' },
    { key: 'revenue', label: 'Revenue', color: '#10b981', prefix: '$' },
    { key: 'roas', label: 'ROAS', color: '#8b5cf6', suffix: '%' }
  ];

  const currentMetric = metrics.find(m => m.key === selectedMetric);

  const formatValue = (value) => {
    if (!value) return '0';
    if (selectedMetric === 'roas') {
      return (value * 100).toFixed(0);
    }
    return value.toFixed(2);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            Trends
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Daily metrics over time
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {metrics.map((metric) => (
            <button
              key={metric.key}
              onClick={() => setSelectedMetric(metric.key)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 6,
                border: selectedMetric === metric.key ? `2px solid ${metric.color}` : '1px solid #e5e7eb',
                background: selectedMetric === metric.key ? `${metric.color}10` : '#fff',
                color: selectedMetric === metric.key ? metric.color : '#6b7280',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              domain={[0, 'auto']}
              tickFormatter={(v) => selectedMetric === 'roas' ? `${(v * 100).toFixed(0)}%` : v}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              formatter={(v) => {
                const formatted = formatValue(v);
                return `${currentMetric.prefix || ''}${formatted}${currentMetric.suffix || ''}`;
              }}
            />
            <Line
              type="monotone"
              dataKey={selectedMetric}
              stroke={currentMetric.color}
              strokeWidth={2}
              dot={{ r: 3, fill: currentMetric.color }}
              name={currentMetric.label}
            />
            {data.prevData && data.prevData.length > 0 && (
              <Line
                type="monotone"
                dataKey={`prev_${selectedMetric}`}
                stroke={currentMetric.color}
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: currentMetric.color }}
                name={`${currentMetric.label} (Previous)`}
                opacity={0.6}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
