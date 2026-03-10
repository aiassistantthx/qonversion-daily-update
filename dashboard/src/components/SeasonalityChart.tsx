import {
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, ReferenceLine
} from 'recharts';
import { Download, Calendar, Sun, TrendingUp, TrendingDown } from 'lucide-react';
import { exportToCSV } from '../utils/export';

export interface SeasonalityData {
  dayOfWeek: Array<{
    day: number;
    dayName: string;
    avgRevenue: number;
    avgTrials: number;
    avgConversions: number;
    avgSpend: number;
    avgInstalls: number;
    sampleDays: number;
    revenueIndex: number;
    conversionsIndex: number;
    spendIndex: number;
  }>;
  monthly: Array<{
    month: number;
    monthName: string;
    avgRevenue: number;
    avgTrials: number;
    avgConversions: number;
    avgSpend: number;
    avgInstalls: number;
    sampleMonths: number;
    revenueIndex: number;
    conversionsIndex: number;
  }>;
  weekOfMonth: Array<{
    week: number;
    weekLabel: string;
    avgRevenue: number;
    avgConversions: number;
    sampleDays: number;
    revenueIndex: number;
  }>;
  insights: {
    bestDayOfWeek: { day: string; index: number } | null;
    worstDayOfWeek: { day: string; index: number } | null;
    bestMonth: { month: string; index: number } | null;
    worstMonth: { month: string; index: number } | null;
    weekendVsWeekday: { weekend: number; weekday: number };
  };
  metadata: {
    months: number;
    generatedAt: string;
  };
}

interface SeasonalityChartProps {
  data: SeasonalityData | undefined;
  isLoading?: boolean;
}


export function SeasonalityChart({ data, isLoading }: SeasonalityChartProps) {
  if (isLoading) {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading seasonality data...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No seasonality data available</div>
      </div>
    );
  }

  const handleExportDayOfWeek = () => {
    const headers = ['Day', 'Avg Revenue', 'Revenue Index', 'Avg Conversions', 'Conv Index', 'Avg Spend', 'Sample Days'];
    const rows = data.dayOfWeek.map(d => [
      d.dayName,
      d.avgRevenue.toFixed(2),
      d.revenueIndex,
      d.avgConversions.toFixed(1),
      d.conversionsIndex,
      d.avgSpend.toFixed(2),
      d.sampleDays,
    ]);
    exportToCSV('seasonality-day-of-week', headers, rows);
  };

  const handleExportMonthly = () => {
    const headers = ['Month', 'Avg Revenue', 'Revenue Index', 'Avg Conversions', 'Conv Index', 'Sample Months'];
    const rows = data.monthly.map(m => [
      m.monthName,
      m.avgRevenue.toFixed(2),
      m.revenueIndex,
      m.avgConversions.toFixed(1),
      m.conversionsIndex,
      m.sampleMonths,
    ]);
    exportToCSV('seasonality-monthly', headers, rows);
  };

  const { insights } = data;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
            <Calendar size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Seasonality Patterns
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Revenue and conversion patterns by day of week and month (last {data.metadata.months} months)
          </p>
        </div>
      </div>

      {/* Insights summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        <InsightCard
          label="Best Day"
          value={insights.bestDayOfWeek?.day || '—'}
          index={insights.bestDayOfWeek?.index}
          icon={<TrendingUp size={14} />}
          positive
        />
        <InsightCard
          label="Worst Day"
          value={insights.worstDayOfWeek?.day || '—'}
          index={insights.worstDayOfWeek?.index}
          icon={<TrendingDown size={14} />}
          positive={false}
        />
        <InsightCard
          label="Best Month"
          value={insights.bestMonth?.month || '—'}
          index={insights.bestMonth?.index}
          icon={<TrendingUp size={14} />}
          positive
        />
        <InsightCard
          label="Weekday vs Weekend"
          value={`${insights.weekendVsWeekday.weekday}% vs ${insights.weekendVsWeekday.weekend}%`}
          icon={<Sun size={14} />}
          subtitle={insights.weekendVsWeekday.weekday > insights.weekendVsWeekday.weekend ? 'Weekdays stronger' : 'Weekends stronger'}
        />
      </div>

      {/* Day of Week Chart */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Day of Week Performance</h4>
          <button onClick={handleExportDayOfWeek} style={exportButtonStyle} title="Export to CSV">
            <Download size={14} />
          </button>
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.dayOfWeek}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="dayName" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis
                yAxisId="index"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => `${v}%`}
                domain={[
                  Math.min(...data.dayOfWeek.map(d => d.revenueIndex)) - 10,
                  Math.max(...data.dayOfWeek.map(d => d.revenueIndex)) + 10
                ]}
              />
              <ReferenceLine yAxisId="index" y={100} stroke="#9ca3af" strokeDasharray="5 5" label={{ value: 'Avg', fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                formatter={(value, name) => {
                  if (name === 'revenueIndex') return [`${value}%`, 'Revenue Index'];
                  if (name === 'conversionsIndex') return [`${value}%`, 'Conversions Index'];
                  return [String(value), String(name)];
                }}
                labelFormatter={(label) => `${label}`}
              />
              <Bar yAxisId="index" dataKey="revenueIndex" fill="#3b82f6" radius={[4, 4, 0, 0]} name="revenueIndex" />
              <Line yAxisId="index" type="monotone" dataKey="conversionsIndex" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="conversionsIndex" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
          <LegendItem color="#3b82f6" label="Revenue Index" />
          <LegendItem color="#10b981" label="Conversions Index" />
        </div>
      </div>

      {/* Monthly Seasonality Chart */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Monthly Seasonality</h4>
          <button onClick={handleExportMonthly} style={exportButtonStyle} title="Export to CSV">
            <Download size={14} />
          </button>
        </div>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="monthName" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis
                yAxisId="index"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => `${v}%`}
                domain={[
                  Math.min(...data.monthly.map(m => m.revenueIndex)) - 15,
                  Math.max(...data.monthly.map(m => m.revenueIndex)) + 15
                ]}
              />
              <ReferenceLine yAxisId="index" y={100} stroke="#9ca3af" strokeDasharray="5 5" label={{ value: 'Avg', fill: '#9ca3af', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                formatter={(value, name) => {
                  if (name === 'revenueIndex') return [`${value}%`, 'Revenue Index'];
                  if (name === 'conversionsIndex') return [`${value}%`, 'Conversions Index'];
                  return [String(value), String(name)];
                }}
              />
              <Bar yAxisId="index" dataKey="revenueIndex" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="revenueIndex" />
              <Line yAxisId="index" type="monotone" dataKey="conversionsIndex" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="conversionsIndex" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
          <LegendItem color="#8b5cf6" label="Revenue Index" />
          <LegendItem color="#f59e0b" label="Conversions Index" />
        </div>
      </div>

      {/* Week of Month mini chart */}
      {data.weekOfMonth.length > 0 && (
        <div>
          <h4 style={{ fontSize: 14, fontWeight: 500, color: '#374151', marginBottom: 12 }}>Week of Month</h4>
          <div style={{ display: 'flex', gap: 8 }}>
            {data.weekOfMonth.map(w => (
              <div
                key={w.week}
                style={{
                  flex: 1,
                  background: w.revenueIndex >= 100 ? '#ecfdf5' : '#fef2f2',
                  borderRadius: 8,
                  padding: 12,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{w.weekLabel}</div>
                <div style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: w.revenueIndex >= 100 ? '#10b981' : '#ef4444'
                }}>
                  {w.revenueIndex}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InsightCard({
  label,
  value,
  index,
  icon,
  positive,
  subtitle,
}: {
  label: string;
  value: string;
  index?: number;
  icon: React.ReactNode;
  positive?: boolean;
  subtitle?: string;
}) {
  const bgColor = positive === true ? '#ecfdf5' : positive === false ? '#fef2f2' : '#f3f4f6';
  const textColor = positive === true ? '#10b981' : positive === false ? '#ef4444' : '#374151';
  const iconColor = positive === true ? '#10b981' : positive === false ? '#ef4444' : '#6b7280';

  return (
    <div style={{ background: bgColor, borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <span style={{ color: iconColor }}>{icon}</span>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: textColor }}>{value}</div>
      {index !== undefined && (
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{index}% of avg</div>
      )}
      {subtitle && (
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{subtitle}</div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />
      <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 20,
  border: '1px solid #e5e7eb',
  marginBottom: 16,
};

const exportButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  background: '#f3f4f6',
  color: '#374151',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
};
