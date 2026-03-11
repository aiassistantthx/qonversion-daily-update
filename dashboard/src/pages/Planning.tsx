import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line } from 'recharts';
import { Download, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { BacktestValidation } from '../components/BacktestValidation';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Assumptions {
  cacTarget: number;
  weeklyChurnMonthly: number;   // Weekly churn rate per month (%)
  yearlyChurnAnnual: number;    // Yearly churn rate per year (%)
  weeklyShare: number;          // % of new subs choosing weekly (%)
  monthlyBudget: number;
  organicMonthly: number;       // New organic subscribers per month
}

interface ScenarioConfig {
  name: string;
  assumptions: Assumptions;
  color: string;
  icon: typeof Target;
}

interface ForecastPoint {
  date: string;
  appleAdsRevenue: number;
  organicRevenue: number;
  totalRevenue: number;
  appleAdsActive: number;
  organicActive: number;
  totalActive: number;
  spend: number;
  newSubs: number;
}

export function Planning() {
  // Default values (validated on retention data)
  const defaultWeeklyChurnMonthly = 51;  // Weekly churn rate per month %
  const defaultYearlyChurnAnnual = 65;   // Yearly churn rate per year %
  const defaultWeeklyShare = 78;          // % of new subs choosing weekly
  const defaultBudget = 40000;
  const defaultOrganicMonthly = 304;      // validated from funnel data

  // Scenario assumptions - only CAC varies
  const [baseAssumptions, setBaseAssumptions] = useState<Assumptions>({
    cacTarget: 59,  // Current paid-only COP
    weeklyChurnMonthly: defaultWeeklyChurnMonthly,
    yearlyChurnAnnual: defaultYearlyChurnAnnual,
    weeklyShare: defaultWeeklyShare,
    monthlyBudget: defaultBudget,
    organicMonthly: defaultOrganicMonthly,
  });

  const [optimisticAssumptions, setOptimisticAssumptions] = useState<Assumptions>({
    cacTarget: 45,
    weeklyChurnMonthly: defaultWeeklyChurnMonthly,
    yearlyChurnAnnual: defaultYearlyChurnAnnual,
    weeklyShare: defaultWeeklyShare,
    monthlyBudget: defaultBudget,
    organicMonthly: defaultOrganicMonthly,
  });

  const [conservativeAssumptions, setConservativeAssumptions] = useState<Assumptions>({
    cacTarget: 75,
    weeklyChurnMonthly: defaultWeeklyChurnMonthly,
    yearlyChurnAnnual: defaultYearlyChurnAnnual,
    weeklyShare: defaultWeeklyShare,
    monthlyBudget: defaultBudget,
    organicMonthly: defaultOrganicMonthly,
  });

  const [selectedScenario, setSelectedScenario] = useState<'base' | 'optimistic' | 'conservative'>('base');
  const [forecastMonths, setForecastMonths] = useState(12);

  // Fetch historical cohort data
  const { data: historicalData, isLoading } = useQuery({
    queryKey: ['planning-data'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/dashboard/planning-data`);
      if (!response.ok) throw new Error('Failed to fetch planning data');
      return response.json();
    },
  });

  // Fetch cohort-based forecast from API
  const { data: forecastApiData, isLoading: forecastLoading } = useQuery({
    queryKey: ['forecast'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/dashboard/forecast`);
      if (!response.ok) throw new Error('Failed to fetch forecast');
      return response.json();
    },
  });

  // Calculate forecast based on scenarios using actual current base
  const calculateForecast = (assumptions: Assumptions, currentMetrics: any): ForecastPoint[] => {
    const forecast: ForecastPoint[] = [];
    const today = new Date();

    // Start with actual current subscriber base from API
    // Use activeSubs breakdown if available, otherwise fall back to estimates
    const activeSubs = currentMetrics?.activeSubs;

    // Weekly subscribers (high churn)
    const weeklyAppleAds = activeSubs?.weekly?.apple_ads || 0;
    const weeklyOrganic = activeSubs?.weekly?.organic || 0;

    // Yearly subscribers (low churn)
    const yearlyAppleAds = activeSubs?.yearly?.apple_ads || 0;
    const yearlyOrganic = activeSubs?.yearly?.organic || 0;

    // Initialize tracking for both product types
    let weeklyPaidActive = weeklyAppleAds;
    let weeklyOrganicActive = weeklyOrganic;
    let yearlyPaidActive = yearlyAppleAds;
    let yearlyOrganicActive = yearlyOrganic;

    // Use separate churn rates from assumptions
    const weeklyRetention = 1 - assumptions.weeklyChurnMonthly / 100;
    // Convert annual churn to monthly: (1 - yearlyChurn)^(1/12)
    const yearlyRetention = Math.pow(1 - assumptions.yearlyChurnAnnual / 100, 1 / 12);

    const weeklyArpu = 30.27;  // $6.99/week x 4.33 weeks (gross)
    const yearlyArpu = 4.17;   // $49.99/year / 12 months (gross)
    const weeklyShareFraction = assumptions.weeklyShare / 100;  // Convert % to fraction

    for (let month = 0; month < forecastMonths; month++) {
      const forecastDate = new Date(today);
      forecastDate.setMonth(forecastDate.getMonth() + month + 1);

      const newPaidSubs = assumptions.monthlyBudget / assumptions.cacTarget;
      const newPaidWeekly = newPaidSubs * weeklyShareFraction;
      const newPaidYearly = newPaidSubs * (1 - weeklyShareFraction);
      const newOrganicWeekly = assumptions.organicMonthly * weeklyShareFraction;
      const newOrganicYearly = assumptions.organicMonthly * (1 - weeklyShareFraction);

      // WEEKLY SUBSCRIBERS (high churn - applied monthly)
      weeklyPaidActive = weeklyPaidActive * weeklyRetention + newPaidWeekly;
      weeklyOrganicActive = weeklyOrganicActive * weeklyRetention + newOrganicWeekly;

      // YEARLY SUBSCRIBERS (low churn - annual rate converted to monthly)
      yearlyPaidActive = yearlyPaidActive * yearlyRetention + newPaidYearly;
      yearlyOrganicActive = yearlyOrganicActive * yearlyRetention + newOrganicYearly;

      // Revenue by product type
      const weeklyPaidRevenue = weeklyPaidActive * weeklyArpu;
      const weeklyOrganicRevenue = weeklyOrganicActive * weeklyArpu;
      const yearlyPaidRevenue = yearlyPaidActive * yearlyArpu;
      const yearlyOrganicRevenue = yearlyOrganicActive * yearlyArpu;

      // Aggregate
      const appleAdsActive = weeklyPaidActive + yearlyPaidActive;
      const organicActive = weeklyOrganicActive + yearlyOrganicActive;
      const appleAdsRevenue = weeklyPaidRevenue + yearlyPaidRevenue;
      const organicRevenue = weeklyOrganicRevenue + yearlyOrganicRevenue;

      forecast.push({
        date: forecastDate.toISOString().slice(0, 7),
        appleAdsRevenue,
        organicRevenue,
        totalRevenue: appleAdsRevenue + organicRevenue,
        appleAdsActive,
        organicActive,
        totalActive: appleAdsActive + organicActive,
        spend: assumptions.monthlyBudget,
        newSubs: newPaidSubs,
      });
    }

    return forecast;
  };

  const scenarios: ScenarioConfig[] = [
    { name: 'Base Case', assumptions: baseAssumptions, color: '#3b82f6', icon: Target },
    { name: 'Optimistic', assumptions: optimisticAssumptions, color: '#10b981', icon: TrendingUp },
    { name: 'Conservative', assumptions: conservativeAssumptions, color: '#f59e0b', icon: TrendingDown },
  ];

  const currentScenario = scenarios.find(s =>
    s.name === (selectedScenario === 'base' ? 'Base Case' : selectedScenario === 'optimistic' ? 'Optimistic' : 'Conservative')
  );

  const forecastData = useMemo(() => {
    if (!forecastApiData?.currentMetrics) return [];
    return calculateForecast(currentScenario?.assumptions || baseAssumptions, forecastApiData.currentMetrics);
  }, [forecastApiData, currentScenario, forecastMonths]);

  // Calculate all scenarios for comparison chart
  const allScenariosData = useMemo(() => {
    if (!forecastApiData?.currentMetrics) return [];
    const baseForecast = calculateForecast(baseAssumptions, forecastApiData.currentMetrics);
    const optimisticForecast = calculateForecast(optimisticAssumptions, forecastApiData.currentMetrics);
    const conservativeForecast = calculateForecast(conservativeAssumptions, forecastApiData.currentMetrics);

    return baseForecast.map((base, i) => ({
      date: base.date,
      base: base.totalRevenue / 1000,
      optimistic: optimisticForecast[i]?.totalRevenue / 1000 || 0,
      conservative: conservativeForecast[i]?.totalRevenue / 1000 || 0,
    }));
  }, [forecastApiData, baseAssumptions, optimisticAssumptions, conservativeAssumptions, forecastMonths]);


  const handleExport = () => {
    if (!forecastData.length) return;
    const headers = ['Date', 'Apple Ads Revenue', 'Organic Revenue', 'Total Revenue', 'Apple Ads Active', 'Organic Active', 'Total Active', 'Spend', 'New Subs', 'ROAS'];
    const rows = forecastData.map(d => [
      d.date, d.appleAdsRevenue.toFixed(2), d.organicRevenue.toFixed(2), d.totalRevenue.toFixed(2),
      Math.round(d.appleAdsActive), Math.round(d.organicActive), Math.round(d.totalActive),
      d.spend.toFixed(2), Math.round(d.newSubs), (d.totalRevenue / d.spend).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning-forecast-${selectedScenario}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderAssumptionInputs = (
    assumptions: Assumptions,
    setAssumptions: React.Dispatch<React.SetStateAction<Assumptions>>,
    _accentColor: string
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[
        { label: 'CAC Target ($)', key: 'cacTarget', step: 1 },
        { label: 'Monthly Budget ($)', key: 'monthlyBudget', step: 1000 },
        { label: 'Organic Monthly', key: 'organicMonthly', step: 50 },
        { label: 'Weekly Churn (%/mo)', key: 'weeklyChurnMonthly', step: 1 },
        { label: 'Yearly Churn (%/yr)', key: 'yearlyChurnAnnual', step: 1 },
        { label: 'New Subs → Weekly (%)', key: 'weeklyShare', step: 1 },
      ].map(({ label, key, step }) => (
        <div key={key}>
          <label style={styles.inputLabel}>{label}</label>
          <input
            type="number"
            step={step}
            value={assumptions[key as keyof Assumptions]}
            onChange={(e) => setAssumptions({ ...assumptions, [key]: Number(e.target.value) })}
            style={styles.input}
          />
        </div>
      ))}
    </div>
  );

  if (isLoading || forecastLoading) {
    return (
      <div style={{ padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading planning data...</div>
      </div>
    );
  }

  const forecastChartData = [
    ...(forecastApiData?.historical.map((h: any) => ({ month: h.month, actual: h.revenue, type: 'historical' })) || []),
    ...(forecastApiData?.renewalForecast.map((f: any) => ({
      month: f.month, forecast: f.totalRevenue, optimistic: f.totalRevenueOptimistic, pessimistic: f.totalRevenuePessimistic, type: 'forecast',
    })) || []),
  ];

  const summary = forecastData[forecastData.length - 1];
  const totalRevenue = forecastData.reduce((sum, d) => sum + d.totalRevenue, 0);
  const totalSpend = forecastData.reduce((sum, d) => sum + d.spend, 0);
  const avgRoas = totalRevenue / totalSpend;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Planning & Forecasting</h1>
          <p style={styles.subtitle}>Revenue planning and scenario modeling tools</p>
        </div>
        <button onClick={handleExport} style={styles.exportBtn}>
          <Download size={16} />
          Export Data
        </button>
      </div>

      {/* Automated Revenue Forecast */}
      {forecastApiData && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Automated Revenue Forecast</h2>
              <p style={styles.cardSubtitle}>12-month projection based on cohort retention curves</p>
              <div style={styles.modelParams}>
                <span>Spend: ${(forecastApiData.currentMetrics?.avgSpend30d / 1000 || 40).toFixed(0)}k/mo</span>
                <span>CAC: ${(forecastApiData.currentMetrics?.avgCAC30d || 59).toFixed(0)}</span>
                <span>Organic: {forecastApiData.currentMetrics?.avgOrganic30d || 304}/mo</span>
                <span>Weekly Share: {((forecastApiData.currentMetrics?.weeklyShare || 0.78) * 100).toFixed(0)}%</span>
              </div>
            </div>
            {forecastApiData.validation?.avgError && (
              <div style={styles.accuracyBadge}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Model Accuracy</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: '#3b82f6' }}>±{forecastApiData.validation.avgError}%</div>
              </div>
            )}
          </div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#6b7280" fontSize={11} tickLine={false} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#111827' }}
                  formatter={(value) => [`$${(Number(value) / 1000).toFixed(1)}k`, '']}
                />
                <Area type="monotone" dataKey="optimistic" fill="#10b98120" stroke="none" name="Optimistic" />
                <Area type="monotone" dataKey="pessimistic" fill="#ef444420" stroke="none" name="Pessimistic" />
                <Line type="monotone" dataKey="actual" stroke="#6b7280" strokeWidth={2} dot={{ fill: '#6b7280', r: 3 }} name="Historical" />
                <Line type="monotone" dataKey="forecast" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#3b82f6', r: 3 }} name="Forecast" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={styles.legendRow}>
            <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#3b82f6' }} /> Base Forecast</div>
            <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#10b981', opacity: 0.5 }} /> Optimistic (+20%)</div>
            <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#ef4444', opacity: 0.5 }} /> Pessimistic (-15%)</div>
          </div>
        </div>
      )}

      {/* Forecast Summary */}
      {forecastApiData?.renewalForecast && (
        <div style={styles.metricsGrid}>
          {(() => {
            const next12 = forecastApiData.renewalForecast.slice(0, 12);
            const total = next12.reduce((s: number, m: any) => s + m.totalRevenue, 0);
            const totalOpt = next12.reduce((s: number, m: any) => s + m.totalRevenueOptimistic, 0);
            const totalPes = next12.reduce((s: number, m: any) => s + m.totalRevenuePessimistic, 0);
            const endBase = next12[next12.length - 1]?.weeklyBase || 0;
            return (
              <>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>12-Month Revenue</div>
                  <div style={{ ...styles.metricValue, color: '#3b82f6' }}>${(total / 1000).toFixed(0)}k</div>
                  <div style={styles.metricSub}>Range: ${(totalPes / 1000).toFixed(0)}k - ${(totalOpt / 1000).toFixed(0)}k</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Monthly Average</div>
                  <div style={styles.metricValue}>${(total / 12 / 1000).toFixed(1)}k</div>
                  <div style={styles.metricSub}>Current: ${((forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) / 1000).toFixed(1)}k/mo</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Active Subscribers</div>
                  <div style={styles.metricValue}>{endBase.toLocaleString()}</div>
                  <div style={styles.metricSub}>End of forecast period</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricLabel}>Growth Trajectory</div>
                  <div style={{ ...styles.metricValue, color: total > (forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) * 12 ? '#10b981' : '#f59e0b' }}>
                    {total > (forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) * 12 ? '📈 Growing' : '📊 Stable'}
                  </div>
                  <div style={styles.metricSub}>Based on current trends</div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Validation Table */}
      {forecastApiData?.validation?.results?.length > 0 && (
        <div style={styles.card}>
          <div style={styles.tableHeader}>
            <div style={styles.cardTitle}>Historical Model Validation</div>
            <div style={styles.cardSubtitle}>Comparing forecasted vs actual revenue</div>
          </div>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Month</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actual</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Forecasted</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {forecastApiData.validation.results.map((r: any, i: number) => {
                const err = parseFloat(r.errorPercent);
                const errColor = Math.abs(err) < 5 ? '#10b981' : Math.abs(err) < 10 ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={r.month} style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff' }}>
                    <td style={styles.td}>{r.month}</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>${(r.actual / 1000).toFixed(1)}k</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#6b7280' }}>${(r.forecasted / 1000).toFixed(1)}k</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: errColor, fontWeight: 600 }}>{err > 0 ? '+' : ''}{r.errorPercent}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Scenario Planning Section */}
      <div style={styles.sectionDivider}>
        <h2 style={styles.sectionTitle}>Scenario Planning Tool</h2>
        <p style={styles.sectionSubtitle}>Test different growth strategies by adjusting assumptions</p>
      </div>

      {/* Scenario Selector */}
      <div style={styles.scenarioGrid}>
        {scenarios.map((scenario) => {
          const Icon = scenario.icon;
          const isSelected = scenario.name === currentScenario?.name;
          return (
            <button
              key={scenario.name}
              onClick={() => setSelectedScenario(scenario.name === 'Base Case' ? 'base' : scenario.name === 'Optimistic' ? 'optimistic' : 'conservative')}
              style={{
                ...styles.scenarioBtn,
                borderColor: isSelected ? scenario.color : '#e5e7eb',
                background: isSelected ? `${scenario.color}10` : '#fff',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={20} style={{ color: scenario.color }} />
                <span style={{ fontWeight: 600, color: '#111827' }}>{scenario.name}</span>
              </div>
              {isSelected && <div style={{ fontSize: 12, color: scenario.color, marginTop: 8 }}>✓ Active</div>}
            </button>
          );
        })}
      </div>

      {/* Assumptions Editor */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={styles.cardTitle}>Adjust Assumptions</h3>
            <p style={styles.cardSubtitle}>Modify parameters to explore outcomes</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 14, color: '#6b7280' }}>Forecast Period:</label>
            <input
              type="number"
              min="3"
              max="24"
              value={forecastMonths}
              onChange={(e) => setForecastMonths(Number(e.target.value))}
              style={{ ...styles.input, width: 60 }}
            />
            <span style={{ fontSize: 14, color: '#6b7280' }}>months</span>
          </div>
        </div>
        <div style={styles.assumptionsGrid}>
          <div style={{ ...styles.assumptionBox, borderColor: '#3b82f6' }}>
            <div style={{ fontWeight: 600, color: '#3b82f6', marginBottom: 12 }}>Base Case</div>
            {renderAssumptionInputs(baseAssumptions, setBaseAssumptions, '#3b82f6')}
          </div>
          <div style={{ ...styles.assumptionBox, borderColor: '#10b981' }}>
            <div style={{ fontWeight: 600, color: '#10b981', marginBottom: 12 }}>Optimistic</div>
            {renderAssumptionInputs(optimisticAssumptions, setOptimisticAssumptions, '#10b981')}
          </div>
          <div style={{ ...styles.assumptionBox, borderColor: '#f59e0b' }}>
            <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: 12 }}>Conservative</div>
            {renderAssumptionInputs(conservativeAssumptions, setConservativeAssumptions, '#f59e0b')}
          </div>
        </div>
      </div>

      {/* Scenario Comparison Chart */}
      {allScenariosData.length > 0 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Scenario Comparison</h3>
          <p style={styles.cardSubtitle}>Revenue projection across all scenarios</p>
          <div style={{ height: 320, marginTop: 20 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={allScenariosData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} tickFormatter={(val) => `$${val}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                  formatter={(v, name) => [`$${Number(v).toFixed(1)}k`, name === 'base' ? 'Base Case' : name === 'optimistic' ? 'Optimistic' : 'Conservative']}
                />
                <Area type="monotone" dataKey="optimistic" stroke="#10b981" fill="#10b98130" strokeWidth={2} name="Optimistic" />
                <Area type="monotone" dataKey="base" stroke="#3b82f6" fill="#3b82f630" strokeWidth={2} name="Base Case" />
                <Area type="monotone" dataKey="conservative" stroke="#f59e0b" fill="#f59e0b30" strokeWidth={2} name="Conservative" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={styles.legendRow}>
            <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#10b981' }} /> Optimistic (CAC ${optimisticAssumptions.cacTarget})</div>
            <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#3b82f6' }} /> Base Case (CAC ${baseAssumptions.cacTarget})</div>
            <div style={styles.legendItem}><div style={{ ...styles.legendDot, background: '#f59e0b' }} /> Conservative (CAC ${conservativeAssumptions.cacTarget})</div>
          </div>
        </div>
      )}

      {/* Scenario Metrics */}
      {summary && (
        <div style={styles.metricsGrid5}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Total Revenue</div>
            <div style={{ ...styles.metricValue, color: '#3b82f6' }}>${(totalRevenue / 1000).toFixed(1)}k</div>
            <div style={styles.metricSub}>{forecastMonths} month period</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Total Spend</div>
            <div style={styles.metricValue}>${(totalSpend / 1000).toFixed(1)}k</div>
            <div style={styles.metricSub}>{forecastMonths} month budget</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Average ROAS</div>
            <div style={{ ...styles.metricValue, color: avgRoas >= 1 ? '#10b981' : '#ef4444' }}>{avgRoas.toFixed(2)}x</div>
            <div style={{ ...styles.metricSub, color: avgRoas >= 1 ? '#10b981' : '#ef4444' }}>{avgRoas >= 1 ? '✓ Profitable' : '⚠ Loss-making'}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Active Subscribers</div>
            <div style={styles.metricValue}>{Math.round(summary.totalActive).toLocaleString()}</div>
            <div style={styles.metricSub}>{Math.round(summary.appleAdsActive).toLocaleString()} paid • {Math.round(summary.organicActive).toLocaleString()} organic</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>New Subscribers</div>
            <div style={styles.metricValue}>{Math.round(forecastData.reduce((s, d) => s + d.newSubs, 0)).toLocaleString()}</div>
            <div style={styles.metricSub}>From paid acquisition</div>
          </div>
        </div>
      )}


      {/* Forecast Table */}
      <div style={styles.card}>
        <div style={styles.tableHeader}>
          <div style={styles.cardTitle}>Detailed Monthly Breakdown</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Month', 'Apple Ads Rev', 'Organic Rev', 'Total Rev', 'Spend', 'ROAS', 'Active Subs', 'New Subs'].map(h => (
                  <th key={h} style={{ ...styles.th, textAlign: h === 'Month' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {forecastData.map((row, i) => {
                const roas = row.totalRevenue / row.spend;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff' }}>
                    <td style={styles.td}>{row.date}</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#3b82f6' }}>${(row.appleAdsRevenue / 1000).toFixed(1)}k</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#8b5cf6' }}>${(row.organicRevenue / 1000).toFixed(1)}k</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>${(row.totalRevenue / 1000).toFixed(1)}k</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#6b7280' }}>${(row.spend / 1000).toFixed(1)}k</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600, color: roas >= 1 ? '#10b981' : '#ef4444' }}>{roas.toFixed(2)}x</td>
                    <td style={{ ...styles.td, textAlign: 'right' }}>{Math.round(row.totalActive).toLocaleString()}</td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#6b7280' }}>{Math.round(row.newSubs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* COP Breakdown */}
      {historicalData?.copBreakdown && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>Current COP Breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Overall COP</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>${historicalData.copBreakdown.overall.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>All subscribers</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Paid-Only COP</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>${historicalData.copBreakdown.paidOnly.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Apple Ads only</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Organic Subs</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{historicalData.copBreakdown.organicCount.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {((historicalData.copBreakdown.organicCount / (historicalData.copBreakdown.organicCount + historicalData.copBreakdown.paidCount)) * 100).toFixed(1)}% of total
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model Backtesting Section */}
      <BacktestValidation />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24, fontFamily: "'Inter', -apple-system, sans-serif" },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280' },
  exportBtn: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
    background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8,
    cursor: 'pointer', fontWeight: 500, fontSize: 14,
  },
  card: {
    background: '#fff', borderRadius: 12, padding: 24,
    border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 20,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 },
  cardSubtitle: { fontSize: 13, color: '#6b7280' },
  modelParams: { display: 'flex', gap: 16, fontSize: 12, color: '#6b7280', marginTop: 8, background: '#f9fafb', padding: '8px 12px', borderRadius: 6 },
  accuracyBadge: { background: '#f0f9ff', padding: '8px 16px', borderRadius: 8, textAlign: 'center' as const },
  legendRow: { display: 'flex', gap: 24, marginTop: 16, fontSize: 13 },
  legendItem: { display: 'flex', alignItems: 'center', gap: 8 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  metricsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 },
  metricsGrid5: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 },
  metricCard: {
    background: '#fff', borderRadius: 12, padding: 20,
    border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  metricLabel: { fontSize: 12, color: '#6b7280', fontWeight: 500, marginBottom: 8, textTransform: 'uppercase' as const },
  metricValue: { fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 4 },
  metricSub: { fontSize: 12, color: '#6b7280' },
  tableHeader: { marginBottom: 16 },
  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { padding: '12px 16px', textAlign: 'left' as const, fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, borderBottom: '2px solid #e5e7eb' },
  td: { padding: '12px 16px', fontSize: 14, borderBottom: '1px solid #f3f4f6' },
  sectionDivider: { borderTop: '2px solid #e5e7eb', paddingTop: 32, marginTop: 32, marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 },
  sectionSubtitle: { fontSize: 14, color: '#6b7280' },
  scenarioGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 },
  scenarioBtn: {
    padding: 20, borderRadius: 12, border: '2px solid', background: '#fff',
    cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.2s',
  },
  assumptionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 },
  assumptionBox: { background: '#f9fafb', borderRadius: 12, padding: 20, borderLeft: '3px solid' },
  inputLabel: { display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase' as const },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
    fontSize: 14, fontWeight: 500, background: '#fff',
  },
};
