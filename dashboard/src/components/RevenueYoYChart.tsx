import { useState, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';
import { MetricSelector } from './MetricSelector';
import type { MetricOption } from './MetricSelector';

const YEAR_COLORS: Record<number, string> = {
  2024: '#3b82f6',
  2025: '#10b981',
  2026: '#f59e0b',
  2027: '#ef4444',
  2028: '#8b5cf6',
};

export interface RevenueYoYData {
  chartData: Array<{ month: string; monthNum: number; [year: number]: number }>;
  years: number[];
}

interface RevenueYoYChartProps {
  data: RevenueYoYData | undefined;
}

export function RevenueYoYChart({ data }: RevenueYoYChartProps) {
  const [selectedYears, setSelectedYears] = useState<string[]>([]);

  const handleMetricChange = useCallback((selected: string[]) => {
    setSelectedYears(selected);
  }, []);

  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Revenue Year-over-Year Comparison</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>Loading...</div>
      </div>
    );
  }

  const chartData = data.chartData || [];
  const years = data.years || [];

  const metricOptions: MetricOption[] = years.map(year => ({
    key: String(year),
    label: String(year),
    color: YEAR_COLORS[year] || '#6b7280',
  }));

  const visibleYears = selectedYears.length > 0
    ? years.filter(y => selectedYears.includes(String(y)))
    : years;

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Revenue Year-over-Year Comparison
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Monthly revenue trends across different years. Compare revenue patterns by month.
          </p>
        </div>
        <MetricSelector
          options={metricOptions}
          onChange={handleMetricChange}
          storageKey="revenueYoY-selectedYears"
        />
      </div>
      <div style={{ height: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="month"
              tick={{ fill: '#6b7280', fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              formatter={(v) => [`$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, '']}
            />
            <Legend />
            {visibleYears.map((year) => (
              <Line
                key={year}
                type="monotone"
                dataKey={year}
                stroke={YEAR_COLORS[year] || '#6b7280'}
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
                name={String(year)}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
