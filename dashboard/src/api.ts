const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

// Types
export interface DailyMetric {
  date: string;
  revenue: number;
  trials: number;
  newSubs: number;
  trialConverted: number;
  spend: number;
  impressions: number;
  taps: number;
  installs: number;
  cpa: number | null;
  cop: number | null;
}

export interface Summary {
  today: {
    date: string;
    revenue: number;
    trials: number;
    newSubs: number;
    converted: number;
    spend: number;
  };
  vsYesterday: {
    revenue: number;
    revenueAbsolute: number;
  };
  vs7dAvg: {
    revenue: number;
    revenueAbsolute: number;
  };
}

export interface HealthScore {
  score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  components: {
    revenue: { score: number; growth: number; thisWeek: number; lastWeek: number };
    cop: { score: number; value: number; target: number };
    conversion: { score: number; rate: number; target: number; trials: number; converted: number };
    payback: { score: number };
  };
}

export interface CopData {
  current: {
    d1: number | null;
    d4: number | null;
    d7: number | null;
    d14: number | null;
    d30: number | null;
  };
  trend: Array<{ date: string; cop: number | null }>;
}

export interface CampaignCop {
  campaignId: string;
  campaignName: string;
  spend: number;
  installs: number;
  payers: number;
  revenue: number;
  cop: number | null;
  roas: number | null;
}

export interface RevenueBySource {
  summary: {
    paid: number;
    organic: number;
    total: number;
    paidPercent: number;
    organicPercent: number;
  };
  daily: Array<{ date: string; paid: number; organic: number; total: number }>;
}

export interface CohortData {
  cohortMonth: string;
  cohortSize: number;
  curve: Array<{ day: number; cumulativeRevenue: number; revenuePerUser: number }>;
}

export interface PaybackData {
  cohortMonth: string;
  cohortSize: number;
  spend: number;
  cac: number;
  curve: Array<{
    day: number;
    cumulativeRevenue: number;
    revenuePerUser: number;
    paybackPercent: number;
  }>;
}

export interface IntradayData {
  date: string;
  hourly: Array<{ hour: string; revenue: number; events: number }>;
}

export interface YoYData {
  currentYear: number;
  lastYear: number;
  currentMonth: string;
  monthComparison: {
    thisMonth: number;
    lastYearSameMonth: number;
    change: number | null;
    thisMonthSubs: number;
    lastYearSameMonthSubs: number;
    subsChange: number | null;
  };
  ytdComparison: {
    thisYear: number;
    lastYear: number;
    change: number | null;
    thisYearSubs: number;
    lastYearSubs: number;
    subsChange: number | null;
  };
  fullYearComparison: {
    thisYear: number;
    lastYear: number;
    change: number | null;
  };
  monthlyTrend: Array<{
    month: string;
    monthNum: number;
    thisYear: number;
    lastYear: number;
    thisYearSubs: number;
    lastYearSubs: number;
    thisYearSpend: number;
    lastYearSpend: number;
  }>;
}

export interface ForecastData {
  historical: Array<{
    month: string;
    revenue: number;
    weeklyRevenue: number;
    yearlyRevenue: number;
    monthlyRevenue: number;
  }>;
  renewalForecast: Array<{
    month: string;
    totalRevenue: number;
    totalRevenueOptimistic: number;
    totalRevenuePessimistic: number;
    weeklyRevenue: number;
    yearlyRevenue: number;
    monthlyRevenue: number;
    weeklyBase: number;
  }>;
  validation: {
    results: Array<{
      month: string;
      actual: number;
      forecasted: number;
      errorPercent: string;
    }>;
    avgError: string | null;
  };
  modelParameters: {
    yearlyRenewalRate: number;
    weeklyWeeklyRetention: number;
  };
}

export interface ChurnRateData {
  weekly: {
    data: Array<{
      period: string;
      activeAtStart: number;
      renewed: number;
      churned: number;
      newSubs: number;
      churnRate: number;
      netChange: number;
    }>;
    avgChurnRate: number;
    currentWeek: { activeAtStart: number; churnRate: number };
  };
  yearly: {
    data: Array<{
      period: string;
      activeAtStart: number;
      churned: number;
      newSubs: number;
      churnRate: number;
      netChange: number;
    }>;
    avgChurnRate: number;
    currentMonth: { activeAtStart: number; churnRate: number };
  };
  summary: {
    weeklyAvgChurn: number;
    yearlyAvgChurn: number;
    impliedAnnualFromWeekly: number;
  };
}

export interface TopCountryRoas {
  country: string;
  users: number;
  subscribers: number;
  revenue: number;
  spend: number;
  cop: number | null;
  roas: number | null;
}

// API functions
export const api = {
  getSummary: () => fetchApi<Summary>('/dashboard/summary'),
  getDaily: () => fetchApi<{ metrics: DailyMetric[] }>('/dashboard/daily'),
  getIntraday: () => fetchApi<IntradayData>('/dashboard/intraday'),
  getHealth: () => fetchApi<HealthScore>('/dashboard/health'),
  getCop: (days = 30) => fetchApi<CopData>(`/dashboard/cop?days=${days}`),
  getCopByCampaign: (days = 30) => fetchApi<{ campaigns: CampaignCop[] }>(`/dashboard/cop-by-campaign?days=${days}`),
  getRevenueBySource: (days = 30) => fetchApi<RevenueBySource>(`/dashboard/revenue-by-source?days=${days}`),
  getCohorts: (months = 6) => fetchApi<{ cohorts: CohortData[] }>(`/dashboard/cohorts?months=${months}`),
  getPayback: (months = 6) => fetchApi<{ payback: PaybackData[] }>(`/dashboard/payback?months=${months}`),
  getYoY: () => fetchApi<YoYData>('/dashboard/yoy'),
  getForecast: () => fetchApi<ForecastData>('/dashboard/forecast'),
  getChurnRate: (months = 12) => fetchApi<ChurnRateData>(`/dashboard/churn-rate?months=${months}`),
  getTopCountriesRoas: (limit = 10) => fetchApi<{ countries: TopCountryRoas[] }>(`/dashboard/top-countries-roas?limit=${limit}`),
};
