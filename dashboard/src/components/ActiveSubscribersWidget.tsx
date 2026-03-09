import { TrendingUp, TrendingDown, Users } from 'lucide-react';

export interface ActiveSubscribersData {
  current: {
    weekly: number;
    yearly: number;
    total: number;
    weeklyPercentage: number;
    yearlyPercentage: number;
  };
  trend: {
    weekly: number;
    yearly: number;
    total: number;
  };
  sparkline: number[];
}

interface ActiveSubscribersWidgetProps {
  data: ActiveSubscribersData | undefined;
}

export function ActiveSubscribersWidget({ data }: ActiveSubscribersWidgetProps) {
  if (!data || !data.current || !data.trend) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Active Subscribers</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const getTrendIcon = (trend: number) => {
    if (trend === 0) return null;
    return trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />;
  };

  const getTrendColor = (trend: number) => {
    if (trend === 0) return '#6b7280';
    return trend > 0 ? '#10b981' : '#ef4444';
  };

  const maxSparkline = Math.max(...(data.sparkline || []));

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Active Subscribers
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Total active subscribers with breakdown by subscription type. Based on renewals in last 30 days.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {/* Total Active */}
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Users size={16} color="#6b7280" />
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
              Total Active
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#111827', fontFamily: "'JetBrains Mono', monospace" }}>
              {data.current.total.toLocaleString()}
            </div>
            {data.trend.total !== 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  color: getTrendColor(data.trend.total),
                }}
              >
                {getTrendIcon(data.trend.total)}
                <span>
                  {data.trend.total > 0 ? '+' : ''}{data.trend.total.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            vs previous 30 days
          </div>

          {/* Mini Sparkline */}
          {data.sparkline && data.sparkline.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1,
              height: 32,
              marginTop: 12
            }}>
              {data.sparkline.map((val, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    background: '#3b82f6',
                    borderRadius: '2px 2px 0 0',
                    height: `${(val / maxSparkline) * 100}%`,
                    minHeight: 2,
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Weekly Active */}
        <div style={{ background: '#eff6ff', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500, marginBottom: 8 }}>
            Weekly Subscribers
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1e40af', fontFamily: "'JetBrains Mono', monospace" }}>
              {data.current.weekly.toLocaleString()}
            </div>
            {data.trend.weekly !== 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  color: getTrendColor(data.trend.weekly),
                }}
              >
                {getTrendIcon(data.trend.weekly)}
                <span>
                  {data.trend.weekly > 0 ? '+' : ''}{data.trend.weekly.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            {data.current.weeklyPercentage.toFixed(0)}% of total subscribers
          </div>
        </div>

        {/* Yearly Active */}
        <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500, marginBottom: 8 }}>
            Yearly Subscribers
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#047857', fontFamily: "'JetBrains Mono', monospace" }}>
              {data.current.yearly.toLocaleString()}
            </div>
            {data.trend.yearly !== 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 500,
                  color: getTrendColor(data.trend.yearly),
                }}
              >
                {getTrendIcon(data.trend.yearly)}
                <span>
                  {data.trend.yearly > 0 ? '+' : ''}{data.trend.yearly.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            {data.current.yearlyPercentage.toFixed(0)}% of total subscribers
          </div>
        </div>
      </div>
    </div>
  );
}
