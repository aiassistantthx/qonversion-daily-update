import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, Bar, Area, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine
} from 'recharts';
import { RefreshCw, TrendingUp, DollarSign, Users, Target, Clock, Search } from 'lucide-react';
import {
  DateRangePicker, getDefaultDateRange, parseDateRangeFromURL, updateURLWithDateRange,
  DateScaleSelector, parseDateScaleFromURL, updateURLWithDateScale,
  TrafficSourceFilter, parseTrafficSourceFromURL, updateURLWithTrafficSource,
  CountryFilter, parseCountryFilterFromURL, updateURLWithCountryFilter,
  CampaignFilter, parseCampaignFilterFromURL, updateURLWithCampaignFilter,
  SubscriptionBreakdown,
  RetentionChart,
  WeeklyChurnChart,
  ChurnRateChart,
  RenewalRatesTable,
  CountriesTable,
  MRRBreakdown,
  MetricSelector,
  ActiveSubscribersWidget,
  MonthlyComparisonTable,
  useSortableData,
  SortIcon,
} from '../components';
import type {
  DateRange, DateScale, TrafficSource, CountrySelection, CampaignSelection,
  SubscriptionBreakdownData,
  RetentionData, WeeklyChurnData, RenewalRatesData,
  CountriesData, MRRBreakdownData, ActiveSubscribersData
} from '../components';
import { api } from '../api';
import type { YoYData, ChurnRateData } from '../api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const fmt = (n: number | null | undefined) => n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
const fmtK = (n: number | null | undefined) => n != null ? `$${(n / 1000).toFixed(1)}K` : '—';
const fmtPct = (n: number | null | undefined) => n != null ? `${n.toFixed(1)}%` : '—';
const fmtMonths = (n: number | null | undefined) => n != null ? `${n}mo` : '—';

// Color palette for cohort lines
const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308'
];

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

interface MarketingData {
  data: Array<{
    month: string;
    spend: number;
    cohortAge: number;
    cop: { d4: number | null; d7: number | null; d30: number | null; d60: number | null; d180: number | null; total: number | null; predicted: number | null };
    roas: { d4: number | null; d7: number | null; d30: number | null; d60: number | null; d180: number | null; total: number | null; predicted: number | null };
    subs: { d4: number; d7: number; d30: number; d60: number; d180: number; total: number };
    revenue: { d4: number; d7: number; d30: number; d60: number; d180: number; total: number };
    paybackMonths: number | null;
    predictedPaybackMonths: number | null;
    isPaidBack: boolean;
  }>;
}

interface RoasEvolutionData {
  cohorts: Array<{
    month: string;
    maxAge: number;
    spend: number;
    roas: { d7: number | null; d14: number | null; d30: number | null; d60: number | null; d90: number | null; d120: number | null; d150: number | null; d180: number | null; total: number };
  }>;
  chartData: Array<{ age: number; [key: string]: number | null }>;
  ages: number[];
}

interface KeywordsData {
  keywords: Array<{
    keywordId: string;
    keyword: string;
    campaign: string;
    spend: number;
    installs: number;
    trials: number;
    conversions: number;
    revenue: number;
    cpi: number | null;
    cop: number | null;
    roas: number | null;
    trialRate: number | null;
    crToPaid: number | null;
  }>;
  totals: {
    spend: number;
    installs: number;
    trials: number;
    conversions: number;
    revenue: number;
    cop: number | null;
    roas: number | null;
  };
  days: number;
}

interface ForecastData {
  historical: Array<{
    month: string;
    revenue: number;
    newSubs?: number;
    renewals?: number;
    weeklyRevenue?: number;
    yearlyRevenue?: number;
  }>;
  renewalForecast: Array<{
    month: string;
    expectedRenewals?: number;
    expectedRevenue?: number;
    totalForecastRevenue?: number;
    totalRevenue?: number;
    weeklyRevenue?: number;
    yearlyRevenue?: number;
    newSubsRevenue?: number;
  }>;
  avgNewSubsPerMonth?: number;
  projectedNewSubsPerMonth?: number;
  currentMetrics?: {
    activeWeeklyBase: number;
    avgWeeklyNewTrials: number;
    avgWeeklyRevenue: number;
    avgYearlyNewSubs: number;
    avgYearlyRevenue: number;
    avgMonthlyRevenue: number;
  };
  modelParameters?: {
    weeklyPrice: number;
    yearlyPrice: number;
    yearlyRenewalRate: number;
  };
}

interface FunnelData {
  funnel: Array<{
    source: string;
    installs: number;
    trials: number;
    converted: number;
    directYearly: number;
    totalPaid: number;
    revenue: number;
    trialRate: number | null;
    crToPaid: number | null;
  }>;
  days: number;
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
  const [keywordDays, setKeywordDays] = useState(90);
  const [dailyChartMetrics, setDailyChartMetrics] = useState<string[]>([]);
  const [roasEvolutionCohorts, setRoasEvolutionCohorts] = useState<string[]>([]);
  const [monthlyChartMetrics, setMonthlyChartMetrics] = useState<string[]>([]);

  const handleDailyChartMetricsChange = useCallback((selected: string[]) => {
    setDailyChartMetrics(selected);
  }, []);

  const handleRoasEvolutionCohortsChange = useCallback((selected: string[]) => {
    setRoasEvolutionCohorts(selected);
  }, []);

  const handleMonthlyChartMetricsChange = useCallback((selected: string[]) => {
    setMonthlyChartMetrics(selected);
  }, []);

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
    queryFn: () => fetch(`${API_URL}/dashboard/main?${buildParams()}`).then(r => r.json()),
  });

  const { data: campaignsData } = useQuery<{ campaigns: Array<{ campaign_id: string; campaign_name: string; performance: { spend: number } }> }>({
    queryKey: ['campaigns', dateRange],
    queryFn: () => fetch(`${API_URL}/asa/campaigns?from=${dateRange.from}&to=${dateRange.to}`).then(r => r.json()),
  });

  const { data: marketingData } = useQuery<MarketingData>({
    queryKey: ['marketing', dateRange],
    queryFn: () => fetch(`${API_URL}/dashboard/marketing?${buildParams({ months: 12 })}`).then(r => r.json()),
  });

  const { data: roasEvolution } = useQuery<RoasEvolutionData>({
    queryKey: ['roas-evolution', dateRange],
    queryFn: () => fetch(`${API_URL}/dashboard/roas-evolution?${buildParams({ months: 12 })}`).then(r => r.json()),
  });

  const { data: keywordsData } = useQuery<KeywordsData>({
    queryKey: ['keywords', keywordDays, trafficSource],
    queryFn: () => fetch(`${API_URL}/dashboard/keywords?${buildParams({ days: keywordDays })}`).then(r => r.json()),
  });

  const { data: forecastData } = useQuery<ForecastData>({
    queryKey: ['forecast'],
    queryFn: () => fetch(`${API_URL}/dashboard/forecast`).then(r => r.json()),
  });

  const { data: funnelData } = useQuery<FunnelData>({
    queryKey: ['funnel', dateRange, trafficSource],
    queryFn: () => fetch(`${API_URL}/dashboard/funnel?${buildParams({ days: 30 })}`).then(r => r.json()),
  });

  const { data: subscriptionBreakdownData } = useQuery<SubscriptionBreakdownData>({
    queryKey: ['subscription-breakdown'],
    queryFn: () => fetch(`${API_URL}/dashboard/subscription-breakdown?months=12`).then(r => r.json()),
  });

  const { data: retentionData } = useQuery<RetentionData>({
    queryKey: ['retention', dateRange],
    queryFn: () => fetch(`${API_URL}/dashboard/retention?${buildParams({ months: 12 })}`).then(r => r.json()),
  });

  const { data: weeklyChurnData } = useQuery<WeeklyChurnData>({
    queryKey: ['weekly-churn', dateRange],
    queryFn: () => fetch(`${API_URL}/dashboard/weekly-churn?${buildParams({ months: 12 })}`).then(r => r.json()),
  });

  const { data: renewalRatesData } = useQuery<RenewalRatesData>({
    queryKey: ['renewal-rates'],
    queryFn: () => fetch(`${API_URL}/dashboard/renewal-rates`).then(r => r.json()),
  });

  const { data: countriesData } = useQuery<CountriesData>({
    queryKey: ['countries', dateRange, countryFilter],
    queryFn: () => fetch(`${API_URL}/dashboard/countries?${buildParams({ limit: 20 })}`).then(r => r.json()),
  });


  const { data: mrrBreakdownData } = useQuery<MRRBreakdownData>({
    queryKey: ['mrr-breakdown'],
    queryFn: () => fetch(`${API_URL}/dashboard/mrr?months=12`).then(r => r.json()),
  });

  const { data: activeSubscribersData } = useQuery<ActiveSubscribersData>({
    queryKey: ['active-subscribers'],
    queryFn: () => fetch(`${API_URL}/dashboard/active-subscribers`).then(r => r.json()),
  });

  const { data: yoyData } = useQuery<YoYData>({
    queryKey: ['yoy'],
    queryFn: api.getYoY,
  });

  const { data: churnRateData } = useQuery<ChurnRateData>({
    queryKey: ['churn-rate'],
    queryFn: () => api.getChurnRate(12),
  });

  const cm = data?.currentMonth;
  const daily = data?.daily || [];
  const monthly = [...(data?.monthly || [])].sort((a, b) => b.month.localeCompare(a.month));
  const marketing = [...(marketingData?.data || [])].sort((a, b) => b.month.localeCompare(a.month));
  const keywords = keywordsData?.keywords || [];
  const keywordTotals = keywordsData?.totals;

  // Sorting hooks for tables
  type MonthlyRow = typeof monthly[0];
  type MarketingRow = typeof marketing[0];
  type KeywordRow = typeof keywords[0];

  const { sortedData: sortedMonthly, sortKey: monthlySortKey, sortAsc: monthlySortAsc, handleSort: handleMonthlySort } =
    useSortableData<MonthlyRow>(monthly, 'month' as keyof MonthlyRow, false);

  const { sortedData: sortedMarketing, sortKey: marketingSortKey, sortAsc: marketingSortAsc, handleSort: handleMarketingSort } =
    useSortableData<MarketingRow>(marketing, 'month' as keyof MarketingRow, false);

  const { sortedData: sortedKeywords, sortKey: keywordsSortKey, sortAsc: keywordsSortAsc, handleSort: handleKeywordsSort } =
    useSortableData<KeywordRow>(keywords, 'spend' as keyof KeywordRow, false);

  // Filter out incomplete days (today + days where webhooks haven't arrived yet)
  // Incomplete = has spend but revenue = 0 (webhooks delayed)
  const today = new Date().toISOString().split('T')[0];
  const completeDays = daily.filter(d => {
    if (d.date === today) return false; // Exclude today
    if (d.spend > 0 && d.revenue === 0) return false; // Webhooks not arrived
    return true;
  });
  const last7Days = completeDays.slice(-7);
  const spendSparkline = last7Days.map(d => d.spend);
  const revenueSparkline = last7Days.map(d => d.revenue);
  const subscribersSparkline = last7Days.map(d => d.subscribers);
  const copSparkline = last7Days.map(d => d.cop).filter(v => v != null) as number[];
  const roasSparkline = last7Days.map(d => d.roas).filter(v => v != null) as number[];

  const dailyChartData = daily.slice(-30).map(d => {
    const dateObj = new Date(d.date);
    let formattedDate;
    if (dateScale === 'month') {
      formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } else if (dateScale === 'week') {
      formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return {
      date: formattedDate,
      revenue: d.revenue,
      spend: d.spend,
      cop: d.cop,
      copPredicted: d.copPredicted,
    };
  });

  const monthlyChartData = monthly.map(m => ({
    month: m.month,
    spend: m.spend / 1000,
    cop: m.cop,
    copPredicted: m.copPredicted,
  }));

  // ROAS Evolution chart data - multiple cohort lines
  const roasChartData = roasEvolution?.chartData || [];
  const cohortMonths = roasEvolution?.cohorts?.map(c => c.month) || [];

  // Forecast chart data
  const forecastChartData = [
    ...(forecastData?.historical || []).map(h => ({
      month: h.month,
      revenue: h.revenue,
      newSubs: h.newSubs,
      renewals: h.renewals,
      type: 'actual',
    })),
    ...(forecastData?.renewalForecast || []).map(f => ({
      month: f.month,
      revenue: f.totalForecastRevenue || f.expectedRevenue,
      renewals: f.expectedRenewals,
      newSubsRevenue: f.newSubsRevenue,
      type: 'forecast',
    })),
  ];

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

      {/* Daily Chart */}
      <div style={styles.chartCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h3 style={{ ...styles.chartTitle, marginBottom: 0 }}>
            {dateScale === 'month' ? 'Monthly' : dateScale === 'week' ? 'Weekly' : 'Last 30 Days'} - Revenue, Spend & COP
          </h3>
          <MetricSelector
            options={[
              { key: 'revenue', label: 'Revenue', color: '#3b82f6' },
              { key: 'spend', label: 'Spend', color: '#ef4444' },
              { key: 'cop', label: 'COP', color: '#10b981' },
              { key: 'copPredicted', label: 'COP Predicted', color: '#10b981' },
            ]}
            onChange={handleDailyChartMetricsChange}
            storageKey="dailyChart-selectedMetrics"
          />
        </div>
        <div style={styles.chartContainer}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} />
              <Legend />
              {dailyChartMetrics.includes('revenue') && (
                <Area yAxisId="left" type="monotone" dataKey="revenue" fill="#3b82f6" fillOpacity={0.2} stroke="#3b82f6" strokeWidth={2} name="Revenue" />
              )}
              {dailyChartMetrics.includes('spend') && (
                <Area yAxisId="left" type="monotone" dataKey="spend" fill="#ef4444" fillOpacity={0.2} stroke="#ef4444" strokeWidth={2} name="Spend" />
              )}
              {dailyChartMetrics.includes('cop') && (
                <Line yAxisId="right" type="monotone" dataKey="cop" stroke="#10b981" strokeWidth={2} dot={false} name="COP" connectNulls />
              )}
              {dailyChartMetrics.includes('copPredicted') && (
                <Line yAxisId="right" type="monotone" dataKey="copPredicted" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} name="COP Predicted" connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ROAS Evolution Chart */}
      <div style={styles.chartCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ ...styles.chartTitle, marginBottom: 4 }}>ROAS Evolution by Cohort Age</h3>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              How ROAS grows as cohorts mature. Each line = one monthly cohort.
            </p>
          </div>
          <MetricSelector
            options={cohortMonths.slice(-8).map((month, i) => ({
              key: month,
              label: month,
              color: COHORT_COLORS[i % COHORT_COLORS.length],
            }))}
            onChange={handleRoasEvolutionCohortsChange}
            storageKey="roasEvolution-selectedCohorts"
          />
        </div>
        <div style={{ ...styles.chartContainer, height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={roasChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="age" tick={{ fill: '#6b7280', fontSize: 11 }} label={{ value: 'Days', position: 'bottom', fill: '#6b7280' }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} domain={[0, 'auto']} />
              <ReferenceLine y={1} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'Breakeven', fill: '#ef4444', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                formatter={(v) => [`${((Number(v) || 0) * 100).toFixed(1)}%`, '']}
                labelFormatter={(age) => `Day ${age}`}
              />
              <Legend />
              {cohortMonths.slice(-8)
                .filter(month => roasEvolutionCohorts.length === 0 || roasEvolutionCohorts.includes(month))
                .map((month) => (
                  <Line
                    key={month}
                    type="monotone"
                    dataKey={month}
                    stroke={COHORT_COLORS[cohortMonths.slice(-8).indexOf(month) % COHORT_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    name={month}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Subscription Breakdown */}
      <SubscriptionBreakdown data={subscriptionBreakdownData} />

      {/* MRR Breakdown */}
      {mrrBreakdownData?.current && <MRRBreakdown data={mrrBreakdownData} />}

      {/* Retention Chart */}
      {retentionData?.cohorts && <RetentionChart data={retentionData} />}

      {/* Weekly Churn Analysis */}
      {weeklyChurnData?.cohorts && <WeeklyChurnChart data={weeklyChurnData} />}

      {/* Streaming Churn Rate */}
      {churnRateData && <ChurnRateChart data={churnRateData} />}

      {/* Yearly Renewal Rates */}
      {renewalRatesData?.cohorts && <RenewalRatesTable data={renewalRatesData} />}

      {/* Countries Ranking */}
      {countriesData?.countries && <CountriesTable data={countriesData} />}

      {/* Funnel Comparison */}
      {funnelData && (
        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Conversion Funnel (Last 30 Days)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
            {funnelData.funnel.map(f => (
              <div key={f.source} style={{ padding: 16, background: '#f9fafb', borderRadius: 8 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: f.source === 'Apple Ads' ? '#3b82f6' : '#10b981' }}>
                  {f.source}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Installs</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{f.installs.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Trials</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{f.trials}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{fmtPct(f.trialRate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Paid</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{f.totalPaid}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>CR {fmtPct(f.crToPaid)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  Revenue: <strong>{fmt(f.revenue)}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Forecast */}
      {forecastData && (
        <div style={styles.chartCard}>
          <h3 style={styles.chartTitle}>Revenue Forecast (12 months)</h3>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            Weekly ({forecastData.currentMetrics?.avgWeeklyRevenue ? `$${Math.round(forecastData.currentMetrics.avgWeeklyRevenue/1000)}k` : '73%'}) + Yearly (35% renewal rate). Assumes current marketing performance continues.
          </p>
          <div style={{ ...styles.chartContainer, height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={forecastChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  fill="#3b82f6"
                  fillOpacity={0.3}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Revenue"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Monthly Spend & COP */}
      <div style={styles.chartCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ ...styles.chartTitle, marginBottom: 0 }}>Monthly Spend & COP</h3>
          <MetricSelector
            options={[
              { key: 'spend', label: 'Spend', color: '#3b82f6' },
              { key: 'cop', label: 'COP', color: '#10b981' },
              { key: 'copPredicted', label: 'COP Predicted', color: '#10b981' },
            ]}
            onChange={handleMonthlyChartMetricsChange}
            storageKey="monthlyChart-selectedMetrics"
          />
        </div>
        <div style={styles.chartContainer}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} />
              <Legend />
              {monthlyChartMetrics.includes('spend') && (
                <Bar yAxisId="left" dataKey="spend" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Spend ($K)" />
              )}
              {monthlyChartMetrics.includes('cop') && (
                <Line yAxisId="right" type="monotone" dataKey="cop" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="COP" connectNulls />
              )}
              {monthlyChartMetrics.includes('copPredicted') && (
                <Line yAxisId="right" type="monotone" dataKey="copPredicted" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4 }} name="COP Predicted" connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Table */}
      <div style={{ ...styles.tableCard, marginBottom: 16 }}>
        <h3 style={styles.chartTitle}>Monthly Data</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleMonthlySort('month' as keyof MonthlyRow)}>
                  Month <SortIcon column="month" currentColumn={monthlySortKey as string} ascending={monthlySortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMonthlySort('spend' as keyof MonthlyRow)}>
                  Spend <SortIcon column="spend" currentColumn={monthlySortKey as string} ascending={monthlySortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMonthlySort('revenue' as keyof MonthlyRow)}>
                  Sales <SortIcon column="revenue" currentColumn={monthlySortKey as string} ascending={monthlySortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMonthlySort('subscribers' as keyof MonthlyRow)}>
                  Subs <SortIcon column="subscribers" currentColumn={monthlySortKey as string} ascending={monthlySortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMonthlySort('cop' as keyof MonthlyRow)}>
                  COP <SortIcon column="cop" currentColumn={monthlySortKey as string} ascending={monthlySortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMonthlySort('crToPaid' as keyof MonthlyRow)}>
                  CR % <SortIcon column="crToPaid" currentColumn={monthlySortKey as string} ascending={monthlySortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMonthlySort('roas' as keyof MonthlyRow)}>
                  ROAS (net) <SortIcon column="roas" currentColumn={monthlySortKey as string} ascending={monthlySortAsc} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedMonthly.map(row => {
                const roasNet = row.roas ? row.roas * 0.82 : null;
                return (
                  <tr key={row.month} style={styles.tr}>
                    <td style={styles.td}>{row.month}</td>
                    <td style={styles.tdRight}>{fmt(row.spend)}</td>
                    <td style={styles.tdRight}>{fmt(row.revenue)}</td>
                    <td style={styles.tdRight}>{row.subscribers}</td>
                    <td style={styles.tdRight}>{row.cop ? fmt(row.cop) : '—'}</td>
                    <td style={styles.tdRight}>{row.crToPaid ? `${row.crToPaid.toFixed(1)}%` : '—'}</td>
                    <td style={{ ...styles.tdRight, color: roasNet && roasNet > 1 ? '#10b981' : '#ef4444' }}>
                      {roasNet ? `${roasNet.toFixed(2)}x` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Marketing Analytics */}
      <div style={{ ...styles.tableCard, marginBottom: 16 }}>
        <h3 style={styles.chartTitle}>Marketing Analytics (Apple Ads)</h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          COP and ROAS by cohort age. Shows how metrics evolve as cohorts mature.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleMarketingSort('month' as keyof MarketingRow)}>
                  Month <SortIcon column="month" currentColumn={marketingSortKey as string} ascending={marketingSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMarketingSort('spend' as keyof MarketingRow)}>
                  Spend <SortIcon column="spend" currentColumn={marketingSortKey as string} ascending={marketingSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleMarketingSort('cohortAge' as keyof MarketingRow)}>
                  Age <SortIcon column="cohortAge" currentColumn={marketingSortKey as string} ascending={marketingSortAsc} />
                </th>
                <th style={{ ...styles.thRight, background: '#f0fdf4' }}>COP 4d</th>
                <th style={{ ...styles.thRight, background: '#f0fdf4' }}>COP 7d</th>
                <th style={{ ...styles.thRight, background: '#f0fdf4' }}>COP 30d</th>
                <th style={{ ...styles.thRight, background: '#f0fdf4' }}>COP 60d</th>
                <th style={{ ...styles.thRight, background: '#dbeafe' }}>ROAS 4d</th>
                <th style={{ ...styles.thRight, background: '#dbeafe' }}>ROAS 7d</th>
                <th style={{ ...styles.thRight, background: '#dbeafe' }}>ROAS 30d</th>
                <th style={{ ...styles.thRight, background: '#dbeafe' }}>ROAS 60d</th>
                <th style={{ ...styles.thRight, background: '#fef3c7' }}>Fact ROAS</th>
                <th style={styles.thRight}>Payback</th>
              </tr>
            </thead>
            <tbody>
              {sortedMarketing.map(row => (
                <tr key={row.month} style={styles.tr}>
                  <td style={styles.td}>{row.month}</td>
                  <td style={styles.tdRight}>{fmt(row.spend)}</td>
                  <td style={styles.tdRight}>{row.cohortAge}d</td>
                  <td style={{ ...styles.tdRight, background: '#f0fdf4' }}>{row.cop.d4 ? fmt(row.cop.d4) : '—'}</td>
                  <td style={{ ...styles.tdRight, background: '#f0fdf4' }}>{row.cop.d7 ? fmt(row.cop.d7) : '—'}</td>
                  <td style={{ ...styles.tdRight, background: '#f0fdf4' }}>{row.cop.d30 ? fmt(row.cop.d30) : '—'}</td>
                  <td style={{ ...styles.tdRight, background: '#f0fdf4' }}>{row.cop.d60 ? fmt(row.cop.d60) : '—'}</td>
                  <td style={{ ...styles.tdRight, background: '#dbeafe' }}>{row.roas.d4 ? `${row.roas.d4.toFixed(2)}x` : '—'}</td>
                  <td style={{ ...styles.tdRight, background: '#dbeafe' }}>{row.roas.d7 ? `${row.roas.d7.toFixed(2)}x` : '—'}</td>
                  <td style={{ ...styles.tdRight, background: '#dbeafe' }}>{row.roas.d30 ? `${row.roas.d30.toFixed(2)}x` : '—'}</td>
                  <td style={{ ...styles.tdRight, background: '#dbeafe', color: row.roas.d60 && row.roas.d60 >= 1 ? '#10b981' : '#ef4444' }}>
                    {row.roas.d60 ? `${row.roas.d60.toFixed(2)}x` : '—'}
                  </td>
                  <td style={{ ...styles.tdRight, background: '#fef3c7', fontWeight: 500, color: row.roas.total && row.roas.total >= 1 ? '#10b981' : '#ef4444' }}>
                    {row.roas.total ? `${row.roas.total.toFixed(2)}x` : '—'}
                  </td>
                  <td style={{ ...styles.tdRight, color: row.isPaidBack ? '#10b981' : (row.predictedPaybackMonths ? '#f59e0b' : '#9ca3af') }}>
                    {row.paybackMonths ? `${row.paybackMonths}mo` :
                     row.predictedPaybackMonths ? (row.predictedPaybackMonths > 24 ? '>2yr' : `~${row.predictedPaybackMonths}mo`) : 'n/a'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Keywords Performance */}
      <div style={styles.tableCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ ...styles.chartTitle, marginBottom: 4 }}>Keywords Performance</h3>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              Top keywords by spend. Total: {fmt(keywordTotals?.spend)} spend, {keywordTotals?.conversions} conversions, COP {fmt(keywordTotals?.cop)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={keywordDays}
              onChange={(e) => setKeywordDays(Number(e.target.value))}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13 }}
            >
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
            </select>
          </div>
        </div>
        <div style={{ overflowX: 'auto', maxHeight: 500 }}>
          <table style={styles.table}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
              <tr>
                <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleKeywordsSort('keyword' as keyof KeywordRow)}>
                  Keyword <SortIcon column="keyword" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.th, cursor: 'pointer' }} onClick={() => handleKeywordsSort('campaign' as keyof KeywordRow)}>
                  Campaign <SortIcon column="campaign" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('spend' as keyof KeywordRow)}>
                  Spend <SortIcon column="spend" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('installs' as keyof KeywordRow)}>
                  Installs <SortIcon column="installs" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('trials' as keyof KeywordRow)}>
                  Trials <SortIcon column="trials" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('conversions' as keyof KeywordRow)}>
                  Conversions <SortIcon column="conversions" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('cpi' as keyof KeywordRow)}>
                  CPI <SortIcon column="cpi" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('cop' as keyof KeywordRow)}>
                  COP <SortIcon column="cop" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('roas' as keyof KeywordRow)}>
                  ROAS <SortIcon column="roas" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
                <th style={{ ...styles.thRight, cursor: 'pointer' }} onClick={() => handleKeywordsSort('crToPaid' as keyof KeywordRow)}>
                  CR % <SortIcon column="crToPaid" currentColumn={keywordsSortKey as string} ascending={keywordsSortAsc} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedKeywords.slice(0, 50).map((kw, i) => (
                <tr key={kw.keywordId || i} style={styles.tr}>
                  <td style={{ ...styles.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Search size={12} style={{ marginRight: 6, color: '#9ca3af' }} />
                    {kw.keyword || '—'}
                  </td>
                  <td style={{ ...styles.td, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280', fontSize: 12 }}>
                    {kw.campaign || '—'}
                  </td>
                  <td style={styles.tdRight}>{fmt(kw.spend)}</td>
                  <td style={styles.tdRight}>{kw.installs}</td>
                  <td style={styles.tdRight}>{kw.trials}</td>
                  <td style={styles.tdRight}>{kw.conversions}</td>
                  <td style={styles.tdRight}>{kw.cpi ? fmt(kw.cpi) : '—'}</td>
                  <td style={{ ...styles.tdRight, color: kw.cop && kw.cop < 50 ? '#10b981' : kw.cop && kw.cop > 80 ? '#ef4444' : '#111827' }}>
                    {kw.cop ? fmt(kw.cop) : '—'}
                  </td>
                  <td style={{ ...styles.tdRight, color: kw.roas && kw.roas * 0.82 >= 1 ? '#10b981' : '#ef4444' }}>
                    {kw.roas ? `${(kw.roas * 0.82).toFixed(2)}x` : '—'}
                  </td>
                  <td style={styles.tdRight}>{fmtPct(kw.crToPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
  chartCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 16,
  },
  chartContainer: {
    height: 300,
  },
  tableCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 12,
  },
  thRight: {
    textAlign: 'right',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 12,
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 8px',
    color: '#111827',
  },
  tdRight: {
    padding: '12px 8px',
    color: '#111827',
    textAlign: 'right',
    fontFamily: "'JetBrains Mono', monospace",
  },
};
