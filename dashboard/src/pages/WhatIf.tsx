import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart, Area, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  ReferenceLine
} from 'recharts';
import { Settings, Target, Download, RefreshCw, RotateCcw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

// ============================================
// COHORT-BASED MODEL PARAMETERS
// ============================================
// These parameters are derived from REAL data analysis:
// - Weekly W1 retention: 48% (from /dashboard/forecast)
// - Weekly week-to-week retention: 92% (from /dashboard/weekly-churn)
// - Yearly renewal rate: 35% (from cohort analysis)
// ============================================

const MODEL_DEFAULTS = {
  // Retention curves (from cohort analysis + revenue validation)
  // W1 = 60%: 40% churn in first week (matches cohort data 59-61%)
  // Weekly = 92%: 8% churn per week after W1 (validated vs actual revenue)
  weeklyW1Retention: 60,           // % survive week 1
  weeklyWeeklyRetention: 92,       // % week-over-week retention after W1
  yearlyRenewalRate: 45,           // % renew at year end

  // Pricing (from events_v2 database - recent averages)
  weeklyPrice: 8.60,               // Weekly subscription price
  yearlyPrice: 57.83,              // Yearly subscription price
  weeksPerMonth: 4.33,

  // Acquisition mix (from events_v2 database - varies by month, ~80% avg)
  weeklyShare: 80,                 // % of new subs are weekly

  // Budget & CAC defaults
  monthlyBudget: 57000,            // Default monthly ad spend
  forecastCAC: 33,                 // Blended CAC for forecast (historical: $18-35)
};

interface WhatIfParams {
  monthlyBudget: number;
  forecastCAC: number;
  weeklyW1Retention: number;
  weeklyWeeklyRetention: number;
  yearlyRenewalRate: number;
  weeklyShare: number;
  weeklyPrice: number;
  yearlyPrice: number;
}

interface MonthBudget {
  budget: number;
  isCustom: boolean;
}

interface Cohort {
  month: string;
  weeklyInitial: number;
  yearlyInitial: number;
}

interface ForecastPoint {
  month: string;
  actual?: number;
  predicted: number;
  spend: number;
  weeklyActive: number;
  yearlyActive: number;
  newSubs: number;
  type: 'historical' | 'current' | 'forecast';
  isCustomBudget?: boolean;
}

// ============================================
// COHORT RETENTION FUNCTIONS
// ============================================

/**
 * Calculate weekly subscription retention at a given age (in months)
 * Retention curve: W1 = 48%, then 92% weekly
 * Monthly retention at month N = W1_RETENTION * WEEKLY_RETENTION^(4*N - 1)
 */
function getWeeklyRetention(ageMonths: number, w1Retention: number, weeklyRetention: number): number {
  if (ageMonths <= 0) return 1;

  // Convert to weekly age
  const ageWeeks = Math.floor(ageMonths * 4.33);

  if (ageWeeks === 0) return 1;
  if (ageWeeks === 1) return w1Retention;

  // After week 1, apply week-over-week retention
  return w1Retention * Math.pow(weeklyRetention, ageWeeks - 1);
}

/**
 * Calculate yearly subscription retention at a given age (in months)
 * Near 100% retention until month 12, then renewal rate applies
 */
function getYearlyRetention(ageMonths: number, renewalRate: number): number {
  if (ageMonths < 12) {
    // Slight natural churn even before renewal (1% per month)
    return Math.pow(0.99, ageMonths);
  }

  // At 12 months, apply renewal rate
  const yearsCompleted = Math.floor(ageMonths / 12);
  const monthsIntoYear = ageMonths % 12;

  // Each completed year multiplies by renewal rate
  let retention = Math.pow(renewalRate, yearsCompleted);

  // Apply slight natural churn for partial year
  retention *= Math.pow(0.99, monthsIntoYear);

  return retention;
}

/**
 * Calculate monthly revenue contribution from a cohort at a given age
 *
 * Revenue model (corrected to match actual revenue sources):
 * - Age 0 (new cohort): First payment only (not 4.33 renewals)
 * - Age > 0: Active subs × price × 4.33 renewals/month
 * - Yearly: Full price at month 0 and renewals at month 12, 24, etc.
 */
function getCohortRevenue(
  cohort: Cohort,
  ageMonths: number,
  params: WhatIfParams
): { weeklyRevenue: number; yearlyRevenue: number; weeklyActive: number; yearlyActive: number } {
  const w1Retention = params.weeklyW1Retention / 100;
  const weeklyRetention = params.weeklyWeeklyRetention / 100;
  const renewalRate = params.yearlyRenewalRate / 100;

  // Calculate active subscribers at this age
  const weeklyRetentionRate = getWeeklyRetention(ageMonths, w1Retention, weeklyRetention);
  const yearlyRetentionRate = getYearlyRetention(ageMonths, renewalRate);

  const weeklyActive = cohort.weeklyInitial * weeklyRetentionRate;
  const yearlyActive = cohort.yearlyInitial * yearlyRetentionRate;

  let weeklyRevenue = 0;
  let yearlyRevenue = 0;

  if (ageMonths === 0) {
    // New cohort this month - they pay first subscription fee only
    // (renewals start next month after W1 retention is applied)
    weeklyRevenue = cohort.weeklyInitial * params.weeklyPrice;
    yearlyRevenue = cohort.yearlyInitial * params.yearlyPrice;
  } else {
    // Existing cohorts - active weekly subs renew 4.33 times/month
    weeklyRevenue = weeklyActive * params.weeklyPrice * MODEL_DEFAULTS.weeksPerMonth;

    // Yearly renewal only at month 12, 24, etc.
    if (ageMonths >= 12 && ageMonths % 12 === 0) {
      yearlyRevenue = yearlyActive * params.yearlyPrice;
    }
  }

  return { weeklyRevenue, yearlyRevenue, weeklyActive, yearlyActive };
}

export function WhatIf() {
  const [params, setParams] = useState<WhatIfParams>({
    monthlyBudget: MODEL_DEFAULTS.monthlyBudget,
    forecastCAC: MODEL_DEFAULTS.forecastCAC,
    weeklyW1Retention: MODEL_DEFAULTS.weeklyW1Retention,
    weeklyWeeklyRetention: MODEL_DEFAULTS.weeklyWeeklyRetention,
    yearlyRenewalRate: MODEL_DEFAULTS.yearlyRenewalRate,
    weeklyShare: MODEL_DEFAULTS.weeklyShare,
    weeklyPrice: MODEL_DEFAULTS.weeklyPrice,
    yearlyPrice: MODEL_DEFAULTS.yearlyPrice,
  });

  const [forecastMonths, setForecastMonths] = useState(12);
  const [monthlyBudgets, setMonthlyBudgets] = useState<Record<string, number>>({});

  // Fetch backtest data (has historical + model validation)
  const { data: backtestData, isLoading } = useQuery({
    queryKey: ['backtest'],
    queryFn: async () => {
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (API_KEY) headers['X-API-Key'] = API_KEY;
      const response = await fetch(`${API_BASE}/dashboard/backtest`, { headers });
      if (!response.ok) throw new Error('Failed to fetch backtest data');
      return response.json();
    },
  });

  // Generate forecast month keys (starting from month after last historical)
  const forecastMonthKeys = useMemo(() => {
    if (!backtestData?.historical?.length) return [];
    const lastHistorical = backtestData.historical[backtestData.historical.length - 1];
    const [year, month] = lastHistorical.month.split('-').map(Number);
    const lastMonth = new Date(year, month - 1, 1); // month is 0-indexed in Date

    const keys: string[] = [];
    for (let i = 1; i <= forecastMonths; i++) {
      const forecastDate = new Date(lastMonth);
      forecastDate.setMonth(forecastDate.getMonth() + i);
      const y = forecastDate.getFullYear();
      const m = String(forecastDate.getMonth() + 1).padStart(2, '0');
      const monthKey = `${y}-${m}`;
      keys.push(monthKey);
    }
    return keys;
  }, [backtestData, forecastMonths]);

  // Get budget for a specific month
  const getBudgetForMonth = useCallback((month: string): MonthBudget => {
    if (monthlyBudgets[month] !== undefined) {
      return { budget: monthlyBudgets[month], isCustom: true };
    }
    return { budget: params.monthlyBudget, isCustom: false };
  }, [monthlyBudgets, params.monthlyBudget]);

  // Set budget for a specific month
  const setMonthBudget = useCallback((month: string, budget: number) => {
    setMonthlyBudgets(prev => ({ ...prev, [month]: budget }));
  }, []);

  // Reset a specific month to default
  const resetMonthBudget = useCallback((month: string) => {
    setMonthlyBudgets(prev => {
      const next = { ...prev };
      delete next[month];
      return next;
    });
  }, []);

  // Reset all monthly budgets
  const resetAllBudgets = useCallback(() => {
    setMonthlyBudgets({});
  }, []);

  const hasCustomBudgets = Object.keys(monthlyBudgets).length > 0;

  // ============================================
  // COHORT-BASED FORECAST CALCULATION
  // ============================================
  const forecastData = useMemo(() => {
    if (!backtestData?.historical) return [];

    const historical = backtestData.historical;
    const results: ForecastPoint[] = [];
    const weeklyShareFrac = params.weeklyShare / 100;

    // Check if last month is current (incomplete) month
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7); // "2026-03"
    const dayOfMonth = today.getDate();
    const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    // Build cohorts from historical data
    // Each month's subscribers become a cohort
    const cohorts: Cohort[] = [];

    // Use forecastCAC parameter for new subscriber calculation
    // (blended CAC includes organic effect: spend / total_subs)
    const forecastCAC = params.forecastCAC;

    // Process historical months to build cohorts
    // For current month, extrapolate subscribers to full month
    historical.forEach((h: any) => {
      let totalSubs = h.subscribers || 0;

      // Extrapolate current month's subscribers
      if (h.month === currentMonth && dayOfMonth < daysInCurrentMonth) {
        const extrapolationFactor = daysInCurrentMonth / dayOfMonth;
        totalSubs = Math.round(totalSubs * extrapolationFactor);
      }

      cohorts.push({
        month: h.month,
        weeklyInitial: totalSubs * weeklyShareFrac,
        yearlyInitial: totalSubs * (1 - weeklyShareFrac),
      });
    });

    // Helper to parse month string to Date
    const parseMonth = (monthStr: string): Date => {
      const [year, month] = monthStr.split('-').map(Number);
      return new Date(year, month - 1, 1);
    };

    // Helper to get month difference
    const getMonthDiff = (targetMonth: string, cohortMonth: string): number => {
      const target = parseMonth(targetMonth);
      const cohort = parseMonth(cohortMonth);
      return (target.getFullYear() - cohort.getFullYear()) * 12 + (target.getMonth() - cohort.getMonth());
    };

    // Calculate revenue for each historical month using cohort model
    historical.forEach((h: any, idx: number) => {
      let totalWeeklyActive = 0;
      let totalYearlyActive = 0;
      let totalWeeklyRevenue = 0;
      let totalYearlyRevenue = 0;

      // Sum revenue from all cohorts up to and including this month
      for (let i = 0; i <= idx; i++) {
        const cohort = cohorts[i];
        const ageMonths = getMonthDiff(h.month, cohort.month);

        const { weeklyRevenue, yearlyRevenue, weeklyActive, yearlyActive } =
          getCohortRevenue(cohort, ageMonths, params);

        totalWeeklyActive += weeklyActive;
        totalYearlyActive += yearlyActive;
        totalWeeklyRevenue += weeklyRevenue;
        totalYearlyRevenue += yearlyRevenue;
      }

      // For current month, extrapolate actual to full month
      const isCurrentMonth = h.month === currentMonth;
      let actualRevenue = h.revenue || 0;
      let actualSpend = h.spend || 0;
      let actualSubs = h.subscribers || 0;

      if (isCurrentMonth && dayOfMonth < daysInCurrentMonth) {
        const extrapolationFactor = daysInCurrentMonth / dayOfMonth;
        actualRevenue = Math.round(actualRevenue * extrapolationFactor);
        actualSpend = Math.round(actualSpend * extrapolationFactor);
        actualSubs = Math.round(actualSubs * extrapolationFactor);
      }

      results.push({
        month: h.month,
        actual: actualRevenue,
        predicted: totalWeeklyRevenue + totalYearlyRevenue,
        spend: actualSpend,
        weeklyActive: Math.round(totalWeeklyActive),
        yearlyActive: Math.round(totalYearlyActive),
        newSubs: actualSubs,
        type: isCurrentMonth ? 'current' : 'historical',
      });
    });

    // Generate forecast months
    for (const monthStr of forecastMonthKeys) {
      const { budget: monthBudget, isCustom } = getBudgetForMonth(monthStr);

      // Calculate new subscribers from budget / CAC (blended includes organic)
      const totalNewSubs = forecastCAC > 0 ? monthBudget / forecastCAC : 0;

      // Add new cohort for this forecast month
      cohorts.push({
        month: monthStr,
        weeklyInitial: totalNewSubs * weeklyShareFrac,
        yearlyInitial: totalNewSubs * (1 - weeklyShareFrac),
      });

      // Calculate revenue from ALL cohorts (historical + forecast)
      let totalWeeklyActive = 0;
      let totalYearlyActive = 0;
      let totalWeeklyRevenue = 0;
      let totalYearlyRevenue = 0;

      for (const cohort of cohorts) {
        const ageMonths = getMonthDiff(monthStr, cohort.month);

        // Skip future cohorts (negative age)
        if (ageMonths < 0) continue;

        const { weeklyRevenue, yearlyRevenue, weeklyActive, yearlyActive } =
          getCohortRevenue(cohort, ageMonths, params);

        totalWeeklyActive += weeklyActive;
        totalYearlyActive += yearlyActive;
        totalWeeklyRevenue += weeklyRevenue;
        totalYearlyRevenue += yearlyRevenue;
      }

      results.push({
        month: monthStr,
        predicted: totalWeeklyRevenue + totalYearlyRevenue,
        spend: monthBudget,
        weeklyActive: Math.round(totalWeeklyActive),
        yearlyActive: Math.round(totalYearlyActive),
        newSubs: Math.round(totalNewSubs),
        type: 'forecast',
        isCustomBudget: isCustom,
      });
    }

    // Results should be in order: historical months first, then forecast months
    // No deduplication needed since forecastMonthKeys starts AFTER last historical month
    return results;
  }, [backtestData, params, forecastMonthKeys, getBudgetForMonth]);

  // Chart data
  const chartData = forecastData.map(d => ({
    month: d.month.slice(2), // "24-01" format
    actual: d.actual ? d.actual / 1000 : undefined,
    predicted: d.predicted / 1000,
    spend: d.spend / 1000,
    type: d.type,
  }));

  // Subscribers chart data
  const subsChartData = forecastData.map(d => ({
    month: d.month.slice(2),
    newSubs: d.newSubs,
    weeklyActive: d.weeklyActive,
    yearlyActive: d.yearlyActive,
    totalActive: d.weeklyActive + d.yearlyActive,
    type: d.type,
  }));

  // Summary metrics
  const historicalData = forecastData.filter(d => d.type === 'historical' || d.type === 'current');
  const futureData = forecastData.filter(d => d.type === 'forecast');
  const lastHistorical = historicalData[historicalData.length - 1];
  const lastForecast = futureData[futureData.length - 1];

  const totalFutureRevenue = futureData.reduce((sum, d) => sum + d.predicted, 0);
  const totalFutureSpend = futureData.reduce((sum, d) => sum + d.spend, 0);
  const forecastROAS = totalFutureSpend > 0 ? totalFutureRevenue / totalFutureSpend : 0;

  // Calculate MAPE directly from our model (last 12 months)
  const recentHistorical = historicalData.slice(-12);
  const modelMAPE = useMemo(() => {
    if (recentHistorical.length === 0) return null;
    const validPoints = recentHistorical.filter(d => d.actual && d.actual > 0);
    if (validPoints.length === 0) return null;
    const totalError = validPoints.reduce((sum, d) => {
      return sum + Math.abs((d.predicted - d.actual!) / d.actual!);
    }, 0);
    return Math.round(totalError / validPoints.length * 1000) / 10;
  }, [recentHistorical]);

  const resetToDefaults = () => {
    setParams({
      monthlyBudget: MODEL_DEFAULTS.monthlyBudget,
      forecastCAC: MODEL_DEFAULTS.forecastCAC,
      weeklyW1Retention: MODEL_DEFAULTS.weeklyW1Retention,
      weeklyWeeklyRetention: MODEL_DEFAULTS.weeklyWeeklyRetention,
      yearlyRenewalRate: MODEL_DEFAULTS.yearlyRenewalRate,
      weeklyShare: MODEL_DEFAULTS.weeklyShare,
      weeklyPrice: MODEL_DEFAULTS.weeklyPrice,
      yearlyPrice: MODEL_DEFAULTS.yearlyPrice,
    });
    resetAllBudgets();
  };

  const handleExport = () => {
    const headers = ['Month', 'Type', 'Actual', 'Predicted', 'Error%', 'Spend', 'Weekly Active', 'Yearly Active', 'New Subs'];
    const rows = forecastData.map(d => [
      d.month,
      d.type,
      d.actual?.toFixed(0) || '',
      d.predicted.toFixed(0),
      d.actual ? (((d.predicted - d.actual) / d.actual) * 100).toFixed(1) : '',
      d.spend.toFixed(0),
      d.weeklyActive,
      d.yearlyActive,
      d.newSubs,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `what-if-cohort-forecast-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Loading What-If model...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <Target size={24} style={{ marginRight: 8, color: '#8b5cf6' }} />
            What-If Revenue Model
          </h1>
          <p style={styles.subtitle}>
            Cohort-based model with real retention curves{modelMAPE !== null ? ` (${modelMAPE}% MAPE)` : ''}.
            Each acquisition month creates a cohort tracked through its lifecycle.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleExport} style={styles.exportBtn}>
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.metricsGrid}>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #8b5cf6' }}>
          <div style={styles.metricLabel}>Total Forecast Spend</div>
          <div style={{ ...styles.metricValue, color: '#8b5cf6' }}>
            ${(totalFutureSpend / 1000).toFixed(0)}k
          </div>
          <div style={styles.metricSub}>
            {hasCustomBudgets ? 'Custom budgets' : `$${(params.monthlyBudget / 1000).toFixed(0)}k/mo default`}
          </div>
        </div>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #10b981' }}>
          <div style={styles.metricLabel}>{forecastMonths}mo Forecast Revenue</div>
          <div style={{ ...styles.metricValue, color: '#10b981' }}>
            ${(totalFutureRevenue / 1000).toFixed(0)}k
          </div>
          <div style={styles.metricSub}>
            ${(totalFutureRevenue / forecastMonths / 1000).toFixed(1)}k/month avg
          </div>
        </div>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #3b82f6' }}>
          <div style={styles.metricLabel}>Forecast ROAS</div>
          <div style={{ ...styles.metricValue, color: forecastROAS >= 1 ? '#10b981' : '#ef4444' }}>
            {forecastROAS.toFixed(2)}x
          </div>
          <div style={styles.metricSub}>
            {forecastROAS >= 1 ? 'Profitable' : 'Loss-making'}
          </div>
        </div>
        <div style={{ ...styles.metricCard, borderTop: '3px solid #f59e0b' }}>
          <div style={styles.metricLabel}>End Active Subs</div>
          <div style={styles.metricValue}>
            {lastForecast ? (lastForecast.weeklyActive + lastForecast.yearlyActive).toLocaleString() : '-'}
          </div>
          <div style={styles.metricSub}>
            {lastForecast ? `W: ${lastForecast.weeklyActive.toLocaleString()} / Y: ${lastForecast.yearlyActive.toLocaleString()}` : ''}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainGrid}>
        {/* Parameters Panel */}
        <div style={styles.paramsCard}>
          <div style={styles.paramsHeader}>
            <h3 style={styles.cardTitle}>
              <Settings size={18} style={{ marginRight: 8 }} />
              Model Parameters
            </h3>
            <button onClick={resetToDefaults} style={styles.resetBtn} title="Reset to defaults">
              <RefreshCw size={14} />
            </button>
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Budget & Forecast</div>
            <ParamInput
              label="Default Budget ($)"
              value={params.monthlyBudget}
              onChange={v => setParams(p => ({ ...p, monthlyBudget: v }))}
              step={5000}
            />
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, marginBottom: 8 }}>
              Override per month in table below
            </div>
            <ParamInput
              label="Blended CAC ($)"
              value={params.forecastCAC}
              onChange={v => setParams(p => ({ ...p, forecastCAC: v }))}
              step={1}
            />
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, marginBottom: 8 }}>
              Historical: $18-35 (recent: ~$33)
            </div>
            <ParamInput
              label="Forecast Months"
              value={forecastMonths}
              onChange={setForecastMonths}
              step={1}
              min={1}
              max={24}
            />
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Weekly Retention Curve</div>
            <ParamInput
              label="W1 Retention (%)"
              value={params.weeklyW1Retention}
              onChange={v => setParams(p => ({ ...p, weeklyW1Retention: v }))}
              step={1}
            />
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, marginBottom: 8 }}>
              % surviving week 1 (default: 48%)
            </div>
            <ParamInput
              label="Weekly Retention (%)"
              value={params.weeklyWeeklyRetention}
              onChange={v => setParams(p => ({ ...p, weeklyWeeklyRetention: v }))}
              step={1}
            />
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, marginBottom: 8 }}>
              Week-to-week after W1 (default: 92%)
            </div>
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Yearly Retention</div>
            <ParamInput
              label="Renewal Rate (%)"
              value={params.yearlyRenewalRate}
              onChange={v => setParams(p => ({ ...p, yearlyRenewalRate: v }))}
              step={1}
            />
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, marginBottom: 8 }}>
              % renewing at year end (default: 35%)
            </div>
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Subscriber Mix</div>
            <ParamInput
              label="Weekly Share (%)"
              value={params.weeklyShare}
              onChange={v => setParams(p => ({ ...p, weeklyShare: v }))}
              step={1}
            />
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, marginBottom: 8 }}>
              % of new subs choosing weekly (default: 80%)
            </div>
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Pricing ($)</div>
            <ParamInput
              label="Weekly Price"
              value={params.weeklyPrice}
              onChange={v => setParams(p => ({ ...p, weeklyPrice: v }))}
              step={0.5}
            />
            <ParamInput
              label="Yearly Price"
              value={params.yearlyPrice}
              onChange={v => setParams(p => ({ ...p, yearlyPrice: v }))}
              step={1}
            />
          </div>

          {/* Model accuracy badge */}
          {modelMAPE !== null && (
            <div style={{
              ...styles.accuracyBadge,
              background: modelMAPE < 10 ? '#f0fdf4' : modelMAPE < 20 ? '#fffbeb' : '#fef2f2',
              borderColor: modelMAPE < 10 ? '#bbf7d0' : modelMAPE < 20 ? '#fde68a' : '#fecaca',
            }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Model Accuracy (12mo)</div>
              <div style={{
                fontSize: 20,
                fontWeight: 700,
                color: modelMAPE < 10 ? '#10b981' : modelMAPE < 20 ? '#f59e0b' : '#ef4444',
              }}>
                {modelMAPE}% MAPE
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                {modelMAPE < 10 ? 'Excellent' : modelMAPE < 20 ? 'Good' : 'Needs tuning'}
              </div>
            </div>
          )}

          {/* Cohort info */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 12,
            marginTop: 12,
          }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>
              COHORT MODEL
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5 }}>
              Each acquisition month creates a cohort. Weekly subs follow: W1={params.weeklyW1Retention}%, then {params.weeklyWeeklyRetention}%/week.
              Yearly subs renew at {params.yearlyRenewalRate}%/year.
              Revenue = sum across all active cohorts.
            </div>
          </div>
        </div>

        {/* Chart */}
        <div style={styles.chartCard}>
          <h3 style={styles.cardTitle}>Revenue: Actual vs Predicted</h3>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            Solid line = historical actual, dashed = cohort model prediction, shaded = forecast
          </p>
          <div style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  yAxisId="revenue"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={v => `$${v}k`}
                />
                <YAxis
                  yAxisId="spend"
                  orientation="right"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={v => `$${v}k`}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                  formatter={(value, name) => {
                    if (name === 'actual' || name === 'Actual') return [`$${Number(value).toFixed(1)}k`, 'Actual Revenue'];
                    if (name === 'predicted' || name === 'Predicted') return [`$${Number(value).toFixed(1)}k`, 'Predicted Revenue'];
                    return [`$${Number(value).toFixed(1)}k`, 'Spend'];
                  }}
                />
                <Legend />

                {/* Reference line for forecast start */}
                {lastHistorical && (
                  <ReferenceLine
                    x={lastHistorical.month.slice(2)}
                    stroke="#6b7280"
                    strokeDasharray="3 3"
                    yAxisId="revenue"
                  />
                )}

                {/* Spend bars */}
                <Bar
                  yAxisId="spend"
                  dataKey="spend"
                  fill="#e5e7eb"
                  opacity={0.5}
                  name="Spend"
                />

                {/* Predicted (full line - both historical and forecast) */}
                <Area
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="predicted"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="#8b5cf620"
                  name="Predicted"
                />

                {/* Actual (only for historical) */}
                <Line
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="actual"
                  stroke="#111827"
                  strokeWidth={3}
                  dot={{ fill: '#111827', r: 3 }}
                  name="Actual"
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Subscribers Chart */}
          <h3 style={{ ...styles.cardTitle, marginTop: 32 }}>Subscribers Growth</h3>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
            Active subscribers and new acquisitions per month
          </p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={subsChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="month"
                  stroke="#6b7280"
                  fontSize={11}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  yAxisId="active"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                />
                <YAxis
                  yAxisId="new"
                  orientation="right"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v}
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                  formatter={(value, name) => {
                    const v = Number(value).toLocaleString();
                    if (name === 'totalActive') return [v, 'Total Active'];
                    if (name === 'weeklyActive') return [v, 'Weekly Active'];
                    if (name === 'yearlyActive') return [v, 'Yearly Active'];
                    if (name === 'newSubs') return [v, 'New Subscribers'];
                    return [v, name];
                  }}
                />
                <Legend />

                {/* Reference line for forecast start */}
                {lastHistorical && (
                  <ReferenceLine
                    x={lastHistorical.month.slice(2)}
                    stroke="#6b7280"
                    strokeDasharray="3 3"
                    yAxisId="active"
                  />
                )}

                {/* New subscribers (bars) */}
                <Bar
                  yAxisId="new"
                  dataKey="newSubs"
                  fill="#10b981"
                  opacity={0.6}
                  name="newSubs"
                />

                {/* Total active subscribers (area) */}
                <Area
                  yAxisId="active"
                  type="monotone"
                  dataKey="totalActive"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="#3b82f620"
                  name="totalActive"
                />

                {/* Weekly active (line) */}
                <Line
                  yAxisId="active"
                  type="monotone"
                  dataKey="weeklyActive"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="weeklyActive"
                />

                {/* Yearly active (line) */}
                <Line
                  yAxisId="active"
                  type="monotone"
                  dataKey="yearlyActive"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="yearlyActive"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Table with Editable Budgets */}
      <div style={styles.tableCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ ...styles.cardTitle, marginBottom: 4 }}>Monthly Forecast</h3>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              Click on Budget cells in forecast rows to customize spending per month.
              <span style={{ color: '#d97706', marginLeft: 8 }}>Current* = extrapolated to full month</span>
              {hasCustomBudgets && (
                <span style={{ color: '#f59e0b', marginLeft: 8 }}>
                  • {Object.keys(monthlyBudgets).length} custom budget(s)
                </span>
              )}
            </p>
          </div>
          {hasCustomBudgets && (
            <button onClick={resetAllBudgets} style={styles.resetTableBtn}>
              <RotateCcw size={14} /> Reset Budgets
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Month</th>
                <th style={styles.th}>Type</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actual</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Predicted</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Error</th>
                <th style={{ ...styles.th, textAlign: 'right', background: '#fef3c7' }}>Budget</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Weekly</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Yearly</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>New Subs</th>
                <th style={{ ...styles.th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {forecastData.slice(-24).map((row, i) => {
                const error = row.actual
                  ? ((row.predicted - row.actual) / row.actual * 100).toFixed(1)
                  : null;
                const errorNum = error ? parseFloat(error) : 0;
                const errorColor = Math.abs(errorNum) < 10 ? '#10b981' : Math.abs(errorNum) < 20 ? '#f59e0b' : '#ef4444';
                const isForecast = row.type === 'forecast';
                const isCurrent = row.type === 'current';

                return (
                  <tr
                    key={`${row.month}-${row.type}`}
                    style={{
                      background: row.isCustomBudget ? '#fffbeb' :
                                  isForecast ? '#f5f3ff' :
                                  isCurrent ? '#fef3c7' :
                                  i % 2 === 0 ? '#f9fafb' : '#fff',
                    }}
                  >
                    <td style={styles.td}>{row.month}</td>
                    <td style={styles.td}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 500,
                        background: isForecast ? '#8b5cf620' : isCurrent ? '#fbbf2420' : '#e5e7eb',
                        color: isForecast ? '#8b5cf6' : isCurrent ? '#d97706' : '#6b7280',
                      }}>
                        {isForecast ? 'Forecast' : isCurrent ? 'Current*' : 'Historical'}
                      </span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                      {row.actual ? `$${(row.actual / 1000).toFixed(1)}k` : '-'}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#8b5cf6' }}>
                      ${(row.predicted / 1000).toFixed(1)}k
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: errorColor, fontWeight: 500 }}>
                      {error ? `${errorNum > 0 ? '+' : ''}${error}%` : '-'}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', padding: 4 }}>
                      {isForecast ? (
                        <EditableCell
                          value={row.spend}
                          onChange={v => setMonthBudget(row.month, v)}
                          isCustom={row.isCustomBudget || false}
                        />
                      ) : (
                        <span style={{ color: '#6b7280' }}>${(row.spend / 1000).toFixed(1)}k</span>
                      )}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      {row.weeklyActive.toLocaleString()}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      {row.yearlyActive.toLocaleString()}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>
                      {row.newSubs.toLocaleString()}
                    </td>
                    <td style={{ padding: 4, textAlign: 'center' }}>
                      {row.isCustomBudget && (
                        <button
                          onClick={() => resetMonthBudget(row.month)}
                          style={styles.resetRowBtn}
                          title="Reset to default"
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f3f4f6', fontWeight: 600 }}>
                <td style={styles.td} colSpan={3}>Forecast Total</td>
                <td style={{ ...styles.td, textAlign: 'right', color: '#10b981' }}>
                  ${(totalFutureRevenue / 1000).toFixed(0)}k
                </td>
                <td style={styles.td}>-</td>
                <td style={{ ...styles.td, textAlign: 'right', color: '#8b5cf6' }}>
                  ${(totalFutureSpend / 1000).toFixed(0)}k
                </td>
                <td style={styles.td} colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function EditableCell({ value, onChange, isCustom }: {
  value: number;
  onChange: (v: number) => void;
  isCustom: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseFloat(tempValue);
    if (!isNaN(parsed) && parsed !== value) {
      onChange(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setTempValue(value.toString());
    }
  };

  if (editing) {
    return (
      <input
        type="number"
        value={tempValue}
        onChange={e => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        step={1000}
        autoFocus
        style={styles.editInput}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setTempValue(value.toString());
        setEditing(true);
      }}
      style={{
        ...styles.editableCell,
        background: isCustom ? '#fef3c7' : '#f9fafb',
        borderColor: isCustom ? '#f59e0b' : '#e5e7eb',
        fontWeight: isCustom ? 600 : 400,
      }}
    >
      ${(value / 1000).toFixed(0)}k
    </button>
  );
}

function ParamInput({ label, value, onChange, step = 1, min, max }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div style={styles.paramRow}>
      <label style={{ fontSize: 12, color: '#6b7280' }}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        step={step}
        min={min}
        max={max}
        style={styles.input}
      />
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
    maxWidth: 600,
  },
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: '#8b5cf6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
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
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '300px 1fr',
    gap: 24,
    marginBottom: 24,
  },
  paramsCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    height: 'fit-content',
  },
  paramsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
  },
  resetBtn: {
    padding: 8,
    background: '#f3f4f6',
    color: '#6b7280',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
  },
  paramSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: '1px solid #f3f4f6',
  },
  paramLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: 12,
  },
  paramRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  input: {
    width: 90,
    padding: '6px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'right' as const,
  },
  accuracyBadge: {
    background: '#f0fdf4',
    border: '1px solid #bbf7d0',
    borderRadius: 8,
    padding: 16,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  chartCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    border: '1px solid #e5e7eb',
  },
  tableCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    border: '1px solid #e5e7eb',
  },
  resetTableBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    background: '#fef3c7',
    color: '#92400e',
    border: '1px solid #f59e0b',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  resetRowBtn: {
    padding: 4,
    background: 'transparent',
    color: '#9ca3af',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 8px',
    borderBottom: '2px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase' as const,
  },
  td: {
    padding: '10px 8px',
    borderBottom: '1px solid #f3f4f6',
    color: '#111827',
  },
  editableCell: {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid',
    borderRadius: 4,
    fontSize: 13,
    textAlign: 'right' as const,
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
  },
  editInput: {
    width: '100%',
    padding: '6px 8px',
    border: '2px solid #8b5cf6',
    borderRadius: 4,
    fontSize: 13,
    textAlign: 'right' as const,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  },
};

export default WhatIf;
