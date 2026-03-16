import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { TopCountriesRoasWidget } from '../components/TopCountriesRoasWidget';
import { DateScaleSelector, parseDateScaleFromURL, updateURLWithDateScale } from '../components/DateScaleSelector';
import type { DateScale } from '../components/DateScaleSelector';

export function MarketingDashboard() {
  const [dateScale, setDateScale] = useState<DateScale>(() => parseDateScaleFromURL() || 'month');

  useEffect(() => {
    updateURLWithDateScale(dateScale);
  }, [dateScale]);

  const { data: topCountriesRoas } = useQuery({
    queryKey: ['top-countries-roas'],
    queryFn: () => api.getTopCountriesRoas(10),
    refetchInterval: 60000,
  });

  const { data: marketingData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['marketing', dateScale],
    queryFn: () => api.getMarketing(6, dateScale),
    refetchInterval: 60000,
  });


  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading marketing data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <strong>Error loading marketing data</strong>
          <p>{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  // Calculate summary metrics
  const recentData = marketingData?.data?.slice(0, 3) || [];
  const totalSpend = recentData.reduce((sum, m) => sum + (m.spend || 0), 0);
  const totalRevenue = recentData.reduce((sum, m) => sum + (m.revenue?.total || 0), 0);
  const avgRoas = recentData.length > 0
    ? recentData.reduce((sum, m) => sum + (m.roas?.d7 || 0), 0) / recentData.length
    : 0;
  const avgCop = recentData.length > 0
    ? recentData.reduce((sum, m) => sum + (m.cop?.d7 || 0), 0) / recentData.length
    : 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <TrendingUp size={24} style={{ marginRight: 8, color: '#3b82f6' }} />
            Marketing Analytics
          </h1>
          <p style={styles.subtitle}>
            Spend, revenue, ROAS trends and keyword performance
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DateScaleSelector value={dateScale} onChange={setDateScale} />
          <button
            style={styles.refreshBtn}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              size={16}
              style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }}
            />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.metricsGrid}>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #ef4444' }}>
          <div style={styles.metricLabel}>Total Spend (3mo)</div>
          <div style={styles.metricValue}>${(totalSpend / 1000).toFixed(0)}k</div>
          <div style={styles.metricSub}>Apple Search Ads</div>
        </div>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #10b981' }}>
          <div style={styles.metricLabel}>Total Revenue (3mo)</div>
          <div style={styles.metricValue}>${(totalRevenue / 1000).toFixed(0)}k</div>
          <div style={styles.metricSub}>From paid users</div>
        </div>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #3b82f6' }}>
          <div style={styles.metricLabel}>Avg ROAS (d7)</div>
          <div style={{ ...styles.metricValue, color: avgRoas >= 0.15 ? '#10b981' : '#ef4444' }}>
            {(avgRoas * 100).toFixed(1)}%
          </div>
          <div style={styles.metricSub}>Last 3 months</div>
        </div>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #f59e0b' }}>
          <div style={styles.metricLabel}>Avg COP (d7)</div>
          <div style={styles.metricValue}>${avgCop.toFixed(0)}</div>
          <div style={styles.metricSub}>Cost per payer</div>
        </div>
      </div>

      {/* Charts Row */}
      {marketingData && marketingData.data.length > 0 && (
        <div style={styles.grid2}>
          {/* Spend vs Revenue */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Spend vs Revenue ({dateScale.charAt(0).toUpperCase() + dateScale.slice(1)}ly)</h3>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...marketingData.data].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="month"
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                    formatter={(value, name) => [
                      `$${Number(value)?.toLocaleString() || 0}`,
                      name === 'spend' ? 'Spend' : 'Revenue'
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Spend"
                  />
                  <Line
                    type="monotone"
                    dataKey={(m) => m.revenue?.total || 0}
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    name="Revenue"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ROAS Trend */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>ROAS Trend (d7, {dateScale.charAt(0).toUpperCase() + dateScale.slice(1)}ly)</h3>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...marketingData.data].reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="month"
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                  />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                    formatter={(value) => [`${(Number(value) * 100).toFixed(1)}%`, 'ROAS (d7)']}
                  />
                  <Line
                    type="monotone"
                    dataKey={(m) => m.roas?.d7 || 0}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#3b82f6' }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Top Countries by ROAS */}
      {topCountriesRoas && topCountriesRoas.countries.length > 0 && (
        <TopCountriesRoasWidget countries={topCountriesRoas.countries} />
      )}


      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 24,
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  refreshBtn: {
    padding: 10,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#6b7280',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 24,
  },
  metricCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: 500,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 4,
  },
  metricSub: {
    fontSize: 12,
    color: '#9ca3af',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
    marginBottom: 24,
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    border: '1px solid #e5e7eb',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 16,
  },
  loading: {
    padding: 40,
    textAlign: 'center' as const,
    color: '#6b7280',
  },
  error: {
    padding: 20,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 12,
    color: '#991b1b',
  },
};
