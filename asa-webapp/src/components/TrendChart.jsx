import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export default function TrendChart({ data }) {
  const [selectedMetric, setSelectedMetric] = useState('spend');

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-10 border border-gray-200 dark:border-gray-700 text-center">
        <div className="text-sm text-gray-400 dark:text-gray-500 mb-2">Trends</div>
        <div className="text-xs text-gray-300 dark:text-gray-600">No data available</div>
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

  const metricStyles = {
    spend: {
      selected: 'border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-500',
      default: 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    },
    revenue: {
      selected: 'border-2 border-green-500 bg-green-50 dark:bg-green-900/20 text-green-500',
      default: 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    },
    roas: {
      selected: 'border-2 border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-500',
      default: 'border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Trends
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Daily metrics over time
          </p>
        </div>
        <div className="flex gap-2">
          {metrics.map((metric) => (
            <button
              key={metric.key}
              onClick={() => setSelectedMetric(metric.key)}
              className={`px-4 py-2 text-xs font-medium rounded-xs cursor-pointer transition-all ${
                selectedMetric === metric.key ? metricStyles[metric.key].selected : metricStyles[metric.key].default
              }`}
            >
              {metric.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[300px]">
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
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
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
