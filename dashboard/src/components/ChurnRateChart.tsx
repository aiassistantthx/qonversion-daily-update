import {
  Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  ComposedChart, Bar, ReferenceLine, Line
} from 'recharts';
import { Download, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { exportToCSV } from '../utils/export';

interface ChurnPeriodData {
  period: string;
  activeAtStart: number;
  renewed?: number;
  churned: number;
  newSubs: number;
  churnRate: number;
  netChange: number;
}

interface ChurnRateData {
  weekly: {
    data: ChurnPeriodData[];
    avgChurnRate: number;
    currentWeek: { activeAtStart: number; churnRate: number };
  };
  yearly: {
    data: ChurnPeriodData[];
    avgChurnRate: number;
    currentMonth: { activeAtStart: number; churnRate: number };
  };
  summary: {
    weeklyAvgChurn: number;
    yearlyAvgChurn: number;
    impliedAnnualFromWeekly: number;
  };
}

interface ChurnRateChartProps {
  data: ChurnRateData | undefined;
  subscriptionType?: 'weekly' | 'yearly' | 'both';
}

export function ChurnRateChart({ data, subscriptionType = 'both' }: ChurnRateChartProps) {
  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Churn Rate Analysis</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>Loading...</div>
      </div>
    );
  }

  const showWeekly = subscriptionType === 'weekly' || subscriptionType === 'both';
  const showYearly = subscriptionType === 'yearly' || subscriptionType === 'both';

  const handleExport = (type: 'weekly' | 'yearly') => {
    const headers = ['Period', 'Active at Start', 'Churned', 'New Subs', 'Churn Rate %', 'Net Change'];
    const rows = (type === 'weekly' ? data.weekly.data : data.yearly.data).map(d => [
      d.period,
      d.activeAtStart,
      d.churned,
      d.newSubs,
      d.churnRate,
      d.netChange,
    ]);
    exportToCSV(`${type}-churn-rate`, headers, rows);
  };

  // Format week date for display
  const formatWeekLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatMonthLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Prepare chart data
  const weeklyChartData = data.weekly.data.slice(-24).map(d => ({
    ...d,
    label: formatWeekLabel(d.period),
  }));

  const yearlyChartData = data.yearly.data.slice(-12).map(d => ({
    ...d,
    label: formatMonthLabel(d.period),
  }));

  // Determine health status
  const getHealthStatus = (churnRate: number, type: 'weekly' | 'yearly') => {
    if (type === 'weekly') {
      if (churnRate < 15) return { color: '#10b981', label: 'Excellent', bg: '#ecfdf5' };
      if (churnRate < 25) return { color: '#f59e0b', label: 'Normal', bg: '#fef3c7' };
      return { color: '#ef4444', label: 'High', bg: '#fef2f2' };
    } else {
      if (churnRate < 3) return { color: '#10b981', label: 'Excellent', bg: '#ecfdf5' };
      if (churnRate < 5) return { color: '#f59e0b', label: 'Normal', bg: '#fef3c7' };
      return { color: '#ef4444', label: 'High', bg: '#fef2f2' };
    }
  };

  const weeklyHealth = getHealthStatus(data.weekly.avgChurnRate, 'weekly');
  const yearlyHealth = getHealthStatus(data.yearly.avgChurnRate, 'yearly');

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Streaming Churn Rate
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Period-over-period churn analysis (RevenueCat methodology). Churn = (Active at Start - Renewed) / Active at Start
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: showWeekly && showYearly ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {showWeekly && (
          <div style={{ background: weeklyHealth.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: weeklyHealth.color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingDown size={14} />
              Weekly Churn
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: weeklyHealth.color }}>
              {data.weekly.avgChurnRate.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>12-week avg</div>
          </div>
        )}
        {showYearly && (
          <div style={{ background: yearlyHealth.bg, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: yearlyHealth.color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingDown size={14} />
              Yearly Churn
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: yearlyHealth.color }}>
              {data.yearly.avgChurnRate.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>6-month avg</div>
          </div>
        )}
        {showWeekly && (
          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 500 }}>Implied Annual</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0c4a6e' }}>
              {data.summary.impliedAnnualFromWeekly.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>From weekly rate</div>
          </div>
        )}
        <div style={{ background: '#f5f3ff', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 500 }}>Net Trend</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 4 }}>
            {showWeekly && weeklyChartData.length > 0 && weeklyChartData[weeklyChartData.length - 1].netChange >= 0
              ? <TrendingUp size={20} />
              : <TrendingDown size={20} />}
            {showWeekly && weeklyChartData.length > 0
              ? Math.abs(weeklyChartData[weeklyChartData.length - 1].netChange)
              : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Last week net</div>
        </div>
      </div>

      {/* Weekly Churn Chart */}
      {showWeekly && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Weekly Subscriptions Churn</h4>
            <button
              onClick={() => handleExport('weekly')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', background: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}
            >
              <Download size={12} /> Export
            </button>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={weeklyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  interval={2}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="left"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickFormatter={v => `${v}%`}
                  domain={[0, 'auto']}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => {
                    const numValue = Number(value) || 0;
                    if (name === 'churnRate') return [`${numValue.toFixed(1)}%`, 'Churn Rate'];
                    return [numValue, name === 'activeAtStart' ? 'Active' : name === 'churned' ? 'Churned' : name === 'newSubs' ? 'New' : 'Net'];
                  }}
                  labelFormatter={(label) => `Week of ${label}`}
                />
                <Legend />
                <ReferenceLine
                  yAxisId="rate"
                  y={data.weekly.avgChurnRate}
                  stroke="#9ca3af"
                  strokeDasharray="5 5"
                  label={{ value: 'Avg', fill: '#9ca3af', fontSize: 10 }}
                />
                <Area
                  yAxisId="rate"
                  type="monotone"
                  dataKey="churnRate"
                  stroke="#ef4444"
                  fill="#fecaca"
                  fillOpacity={0.5}
                  name="churnRate"
                />
                <Bar
                  yAxisId="count"
                  dataKey="newSubs"
                  fill="#10b981"
                  opacity={0.7}
                  name="newSubs"
                />
                <Bar
                  yAxisId="count"
                  dataKey="churned"
                  fill="#f87171"
                  opacity={0.7}
                  name="churned"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Yearly Churn Chart */}
      {showYearly && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Yearly Subscriptions Churn</h4>
            <button
              onClick={() => handleExport('yearly')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', background: '#f3f4f6', color: '#374151',
                border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}
            >
              <Download size={12} /> Export
            </button>
          </div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={yearlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="left"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  tickFormatter={v => `${v}%`}
                  domain={[0, 'auto']}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12 }}
                  formatter={(value, name) => {
                    const numValue = Number(value) || 0;
                    if (name === 'churnRate') return [`${numValue.toFixed(1)}%`, 'Churn Rate'];
                    return [numValue, name === 'activeAtStart' ? 'Active' : name === 'churned' ? 'Churned' : name === 'newSubs' ? 'New' : 'Net'];
                  }}
                  labelFormatter={(label) => label}
                />
                <Legend />
                <ReferenceLine
                  yAxisId="rate"
                  y={data.yearly.avgChurnRate}
                  stroke="#9ca3af"
                  strokeDasharray="5 5"
                  label={{ value: 'Avg', fill: '#9ca3af', fontSize: 10 }}
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="churnRate"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="churnRate"
                />
                <Bar
                  yAxisId="count"
                  dataKey="newSubs"
                  fill="#10b981"
                  opacity={0.7}
                  name="newSubs"
                />
                <Bar
                  yAxisId="count"
                  dataKey="churned"
                  fill="#f87171"
                  opacity={0.7}
                  name="churned"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Benchmarks */}
      <div style={{ marginTop: 24, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={14} />
          Industry Benchmarks (RevenueCat 2025)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: 11, color: '#6b7280' }}>
          <div>
            <div style={{ fontWeight: 500, color: '#374151' }}>Weekly Subs</div>
            <div>Good: &lt;15% | Normal: 15-25% | High: &gt;25%</div>
          </div>
          <div>
            <div style={{ fontWeight: 500, color: '#374151' }}>Monthly/Annual Subs</div>
            <div>Good: &lt;3% | Normal: 3-5% | High: &gt;5%</div>
          </div>
          <div>
            <div style={{ fontWeight: 500, color: '#374151' }}>First Month</div>
            <div>~30% of annual subs cancel in month 1</div>
          </div>
        </div>
      </div>
    </div>
  );
}
