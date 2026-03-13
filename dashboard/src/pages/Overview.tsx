import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, DollarSign, Users, Target, Clock } from 'lucide-react';
import {
  DateRangePicker, getDefaultDateRange, parseDateRangeFromURL, updateURLWithDateRange,
  DateScaleSelector, parseDateScaleFromURL, updateURLWithDateScale,
  TrafficSourceFilter, parseTrafficSourceFromURL, updateURLWithTrafficSource,
  CountryFilter, parseCountryFilterFromURL, updateURLWithCountryFilter,
  CampaignFilter, parseCampaignFilterFromURL, updateURLWithCampaignFilter,
  ActiveSubscribersWidget,
  MonthlyComparisonTable,
  TrendChart,
} from '../components';
import type {
  DateRange, DateScale, TrafficSource, CountrySelection, CampaignSelection,
  ActiveSubscribersData,
  TrendChartData,
} from '../components';
import { api } from '../api';
import type { YoYData } from '../api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

const getHeaders = (): HeadersInit => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return headers;
};

const apiFetch = (url: string) => fetch(url, { headers: getHeaders() }).then(r => r.json());

const fmt = (n: number | null | undefined) => n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
const fmtK = (n: number | null | undefined) => n != null ? `$${(n / 1000).toFixed(1)}K` : '—';
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : '—';
const fmtMonths = (n: number | null | undefined) => n != null ? `${n}mo` : '—';

interface DashboardData {
  currentMonth: {
    month: string;
    spend: number;
    spendChange: number | null;
    revenue: number;
    revenueChange: number | null;
    cohortRevenue: number;
    subscribers: number;
    subscribersChange: number | null;
    cop: number | null;
    copChange: number | null;
    cop3d: number | null;
    cop7d: number | null;
    crToPaid: number | null;
    crChange: number | null;
    roas: number | null;
    roasChange: number | null;
    forecastSpend: number;
    forecastRevenue: number;
    predictedCop: number | null;
    forecastSubscribers: number;
    paybackMonths: number | null;
  };
  daily: Array<{
    date: string;
    revenue: number;
    spend: number;
    subscribers: number;
    cop: number | null;
    copPredicted?: number | null;
    roas: number | null;
  }>;
  monthly: Array<{
    month: string;
    revenue: number;
    spend: number;
    trials: number;
    converted: number;
    subscribers: number;
    cop: number | null;
    copPredicted?: number | null;
    crToPaid: number | null;
    roas: number | null;
  }>;
}

function KPICard({ title, value, subtitle, icon: Icon, change, invertChange, sparklineData }: {
  title: string;
  value: string;
  subtitle?: string;
  icon?: React.ElementType;
  change?: number | null;
  invertChange?: boolean;
  sparklineData?: number[];
}) {
  const changeColor = change != null
    ? (invertChange ? (change < 0 ? '#10b981' : '#ef4444') : (change > 0 ? '#10b981' : '#ef4444'))
    : undefined;
  const changeSign = change != null && change > 0 ? '+' : '';

  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;

    const width = 60;
    const height = 24;
    const validData = sparklineData.filter(v => v != null && !isNaN(v));
    if (validData.length < 2) return null;

    const max = Math.max(...validData);
    const min = Math.min(...validData);
    const range = max - min || 1;

    const points = validData.map((val, i) => {
      const x = (i / (validData.length - 1)) * width;
      const y = height - ((val - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    const trend = validData[validData.length - 1] >= validData[0];
    const lineColor = invertChange ? (trend ? '#ef4444' : '#10b981') : (trend ? '#10b981' : '#ef4444');

    return (
      <svg width={width} height={height} style={{ marginLeft: 'auto' }}>
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardTitle}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={18} color="#9ca3af" />}
        </div>
      </div>
      <div style={styles.cardValue}>
        {value}
        {change != null && (
          <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 500, color: changeColor }}>
            {changeSign}{change.toFixed(0)}%
          </span>
        )}
      </div>
      {subtitle && <div style={styles.cardSubtitle}>{subtitle}</div>}
      {renderSparkline()}
    </div>
  );
}

export function Overview() {
  // Filter state
  const [dateRange, setDateRange] = useState<DateRange>(() => parseDateRangeFromURL() || getDefaultDateRange());
  const [dateScale, setDateScale] = useState<DateScale>(() => parseDateScaleFromURL() || 'day');
  const [trafficSource, setTrafficSource] = useState<TrafficSource>(() => parseTrafficSourceFromURL() || 'all');
  const [countryFilter, setCountryFilter] = useState<CountrySelection>(() => parseCountryFilterFromURL());
  const [campaignFilter, setCampaignFilter] = useState<CampaignSelection>(() => parseCampaignFilterFromURL());

  // Sync filters to URL
  useEffect(() => {
    updateURLWithDateRange(dateRange);
  }, [dateRange]);

  useEffect(() => {
    updateURLWithDateScale(dateScale);
  }, [dateScale]);

  useEffect(() => {
    updateURLWithTrafficSource(trafficSource);
  }, [trafficSource]);

  useEffect(() => {
    updateURLWithCountryFilter(countryFilter);
  }, [countryFilter]);

  useEffect(() => {
    updateURLWithCampaignFilter(campaignFilter);
  }, [campaignFilter]);

  // Build query params
  const buildParams = (extra: Record<string, string | number> = {}) => {
    const params = new URLSearchParams({
      from: dateRange.from,
      to: dateRange.to,
      scale: dateScale,
      source: trafficSource,
      ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
    });
    if (countryFilter.length > 0) {
      params.set('countries', countryFilter.join(','));
    }
    if (campaignFilter.length > 0) {
      params.set('campaigns', campaignFilter.join(','));
    }
    return params.toString();
  };

  const { data, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ['dashboard', dateRange, dateScale, trafficSource, countryFilter, campaignFilter],
    queryFn: () => apiFetch(`${API_URL}/dashboard/main?${buildParams()}`),
  });

  const { data: campaignsData } = useQuery<{ campaigns: Array<{ campaign_id: string; campaign_name: string; performance: { spend: number } }> }>({
    queryKey: ['campaigns', dateRange],
    queryFn: () => apiFetch(`${API_URL}/asa/campaigns?from=${dateRange.from}&to=${dateRange.to}`),
  });

  const { data: activeSubscribersData } = useQuery<ActiveSubscribersData>({
    queryKey: ['active-subscribers'],
    queryFn: () => apiFetch(`${API_URL}/dashboard/active-subscribers`),
  });

  const { data: yoyData } = useQuery<YoYData>({
    queryKey: ['yoy'],
    queryFn: api.getYoY,
  });

  const { data: trendsData } = useQuery<TrendChartData>({
    queryKey: ['trends', dateRange],
    queryFn: () => apiFetch(`${API_URL}/asa/trends?from=${dateRange.from}&to=${dateRange.to}`),
  });

  const cm = data?.currentMonth;
  const daily = data?.daily || [];

  // Filter out incomplete days (today + days where webhooks haven't arrived yet)
  const today = new Date().toISOString().split('T')[0];
  const completeDays = daily.filter(d => {
    if (d.date === today) return false;
    if (d.spend > 0 && d.revenue === 0) return false;
    return true;
  });
  const last7Days = completeDays.slice(-7);
  const spendSparkline = last7Days.map(d => d.spend);
  const revenueSparkline = last7Days.map(d => d.revenue);
  const subscribersSparkline = last7Days.map(d => d.subscribers);
  const copSparkline = last7Days.map(d => d.cop).filter(v => v != null) as number[];
  const roasSparkline = last7Days.map(d => d.roas).filter(v => v != null) as number[];

  return (
    <div style={styles.container}>
      {/* Filters Header */}
      <div style={styles.filtersBar}>
        <CountryFilter value={countryFilter} onChange={setCountryFilter} />
        <CampaignFilter
          value={campaignFilter}
          onChange={setCampaignFilter}
          campaigns={(campaignsData?.campaigns || []).map(c => ({
            campaign_id: c.campaign_id,
            campaign_name: c.campaign_name,
            spend: c.performance?.spend || 0,
          }))}
          disabled={trafficSource === 'organic'}
        />
        <TrafficSourceFilter value={trafficSource} onChange={setTrafficSource} />
        <DateScaleSelector value={dateScale} onChange={setDateScale} />
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <button style={styles.refreshBtn} onClick={() => refetch()}>
          <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Trends Chart */}
      <TrendChart data={trendsData} />

      {/* Current Month KPIs */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
          {cm?.month || 'Current Month'}
        </h2>
      </div>

      {/* KPI Cards Row 1 */}
      <div style={styles.kpiGrid}>
        <KPICard title="Spend" value={fmtK(cm?.spend || 0)} icon={DollarSign} change={cm?.spendChange} sparklineData={spendSparkline} />
        <KPICard title="Revenue" value={fmtK(cm?.revenue || 0)} icon={TrendingUp} change={cm?.revenueChange} sparklineData={revenueSparkline} />
        <KPICard title="New Subscribers" value={String(cm?.subscribers || 0)} icon={Users} change={cm?.subscribersChange} sparklineData={subscribersSparkline} />
        <KPICard title="COP" value={fmt(cm?.cop)} subtitle="excl. last 4 days" icon={Target} change={cm?.copChange} invertChange sparklineData={copSparkline} />
      </div>

      {/* KPI Cards Row 2 */}
      <div style={styles.kpiGrid}>
        <KPICard title="COP 3d" value={fmt(cm?.cop3d)} subtitle="closed cohorts" sparklineData={copSparkline} invertChange />
        <KPICard title="COP 7d" value={fmt(cm?.cop7d)} subtitle="closed cohorts" sparklineData={copSparkline} invertChange />
        <KPICard title="CR to Paid" value={fmtPct(cm?.crToPaid)} subtitle="excl. last 4 days" change={cm?.crChange} />
        <KPICard title="ROAS" value={cm?.roas != null ? `${cm.roas.toFixed(2)}x` : '—'} subtitle="Apple Ads cohort" icon={TrendingUp} change={cm?.roasChange} sparklineData={roasSparkline} />
      </div>

      {/* KPI Cards Row 3 - Forecasts */}
      <div style={styles.kpiGrid}>
        <KPICard title="Forecast Spend" value={fmtK(cm?.forecastSpend || 0)} subtitle="month-end" sparklineData={spendSparkline} />
        <KPICard title="Forecast Revenue" value={fmtK(cm?.forecastRevenue || 0)} subtitle="month-end" sparklineData={revenueSparkline} />
        <KPICard title="Predicted COP" value={fmt(cm?.predictedCop)} subtitle="pending conversions" icon={Target} sparklineData={copSparkline} invertChange />
        <KPICard title="Payback" value={fmtMonths(cm?.paybackMonths)} subtitle="months to recover" icon={Clock} />
      </div>

      {/* Active Subscribers Widget */}
      {activeSubscribersData?.current && <ActiveSubscribersWidget data={activeSubscribersData} />}

      {/* Monthly Comparison Table */}
      {yoyData?.monthlyTrend && <MonthlyComparisonTable data={yoyData} />}

      {/* Navigation Cards to Detailed Tabs */}
      <div style={styles.navCardsGrid}>
        <a href="/#/roas-evolution" style={styles.navCard}>
          <div style={styles.navCardIcon}>📈</div>
          <h3 style={styles.navCardTitle}>ROAS Evolution</h3>
          <p style={styles.navCardDescription}>
            Track how ROAS grows as cohorts mature over time
          </p>
        </a>
        <a href="/#/cohorts" style={styles.navCard}>
          <div style={styles.navCardIcon}>👥</div>
          <h3 style={styles.navCardTitle}>Cohort Analysis</h3>
          <p style={styles.navCardDescription}>
            Detailed cohort ROAS, retention, churn, and renewal rates
          </p>
        </a>
        <a href="/#/marketing" style={styles.navCard}>
          <div style={styles.navCardIcon}>💰</div>
          <h3 style={styles.navCardTitle}>Marketing Performance</h3>
          <p style={styles.navCardDescription}>
            CPA trends, campaign performance, and revenue sources
          </p>
        </a>
      </div>

      <style>{`
        a[href*="/#/"]:hover {
          border-color: #3b82f6;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 24,
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  filtersBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  refreshBtn: {
    padding: 10,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#6b7280',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 16,
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: 500,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: 700,
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  navCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 16,
  },
  navCard: {
    background: '#fff',
    border: '2px solid #e5e7eb',
    borderRadius: 12,
    padding: 24,
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  navCardIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  navCardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 8,
  },
  navCardDescription: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 1.5,
  },
};
