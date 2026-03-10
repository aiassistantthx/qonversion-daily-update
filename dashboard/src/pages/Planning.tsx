import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line } from 'recharts';
import { Download, TrendingUp, TrendingDown, Target } from 'lucide-react';
import { PaybackAnalysis } from '../components/PaybackAnalysis';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Assumptions {
  cacTarget: number;
  monthlyChurnRate: number;
  yearlyChurnRate: number;
  yearlyRenewalRate: number;
  monthlyBudget: number;
}

interface ScenarioConfig {
  name: string;
  assumptions: Assumptions;
  color: string;
  icon: typeof Target;
}

interface CohortData {
  cohortDate: string;
  source: 'apple_ads' | 'organic';
  subscribers: number;
  revenue: number;
  spend?: number;
  age: number;
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
  // Scenario assumptions
  const [baseAssumptions, setBaseAssumptions] = useState<Assumptions>({
    cacTarget: 65,
    monthlyChurnRate: 51,
    yearlyChurnRate: 1,
    yearlyRenewalRate: 85,
    monthlyBudget: 40000,
  });

  const [optimisticAssumptions, setOptimisticAssumptions] = useState<Assumptions>({
    cacTarget: 50,
    monthlyChurnRate: 45,
    yearlyChurnRate: 0.8,
    yearlyRenewalRate: 90,
    monthlyBudget: 50000,
  });

  const [conservativeAssumptions, setConservativeAssumptions] = useState<Assumptions>({
    cacTarget: 80,
    monthlyChurnRate: 55,
    yearlyChurnRate: 1.2,
    yearlyRenewalRate: 80,
    monthlyBudget: 30000,
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

  // Calculate forecast based on scenarios
  const calculateForecast = (assumptions: Assumptions, cohorts: CohortData[]): ForecastPoint[] => {
    const forecast: ForecastPoint[] = [];
    const today = new Date();
    const avgWeeklyPrice = 9.99; // weekly subscription price
    const avgYearlyPrice = 99.99; // yearly subscription price

    // Separate cohorts by source
    const appleAdsCohorts = cohorts.filter(c => c.source === 'apple_ads');
    const organicCohorts = cohorts.filter(c => c.source === 'organic');

    // Calculate current active base
    let appleAdsActive = appleAdsCohorts.reduce((sum, c) => {
      const weeksSinceInstall = c.age / 7;
      const monthlyRetention = (1 - assumptions.monthlyChurnRate / 100);
      const yearlyRetention = (1 - assumptions.yearlyChurnRate / 100);

      // Assume 94% weekly, 6% yearly split
      const weeklyActive = c.subscribers * 0.94 * Math.pow(monthlyRetention, weeksSinceInstall / 4);
      const yearlyActive = c.subscribers * 0.06 * Math.pow(yearlyRetention, weeksSinceInstall / 52);

      return sum + weeklyActive + yearlyActive;
    }, 0);

    let organicActive = organicCohorts.reduce((sum, c) => {
      const weeksSinceInstall = c.age / 7;
      const monthlyRetention = (1 - assumptions.monthlyChurnRate / 100);
      const yearlyRetention = (1 - assumptions.yearlyChurnRate / 100);

      const weeklyActive = c.subscribers * 0.94 * Math.pow(monthlyRetention, weeksSinceInstall / 4);
      const yearlyActive = c.subscribers * 0.06 * Math.pow(yearlyRetention, weeksSinceInstall / 52);

      return sum + weeklyActive + yearlyActive;
    }, 0);

    // Project forward month by month
    for (let month = 0; month < forecastMonths; month++) {
      const forecastDate = new Date(today);
      forecastDate.setMonth(forecastDate.getMonth() + month + 1);

      const monthlyRetention = (1 - assumptions.monthlyChurnRate / 100);
      const yearlyRetention = (1 - assumptions.yearlyChurnRate / 100);

      // New paid subscribers from budget
      const newPaidSubs = assumptions.monthlyBudget / assumptions.cacTarget;

      // Apple Ads: decay existing + add new paid subs
      const appleAdsWeekly = appleAdsActive * 0.94 * monthlyRetention;
      const appleAdsYearly = appleAdsActive * 0.06 * yearlyRetention;
      appleAdsActive = appleAdsWeekly + appleAdsYearly + newPaidSubs;

      // Organic: decay existing (no new organic for now)
      const organicWeekly = organicActive * 0.94 * monthlyRetention;
      const organicYearly = organicActive * 0.06 * yearlyRetention;
      organicActive = organicWeekly + organicYearly;

      // Calculate revenue (monthly recurring)
      const appleAdsRevenue = (appleAdsWeekly * avgWeeklyPrice * 4.33) + (appleAdsYearly * avgYearlyPrice / 12);
      const organicRevenue = (organicWeekly * avgWeeklyPrice * 4.33) + (organicYearly * avgYearlyPrice / 12);

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
    {
      name: 'Base Case',
      assumptions: baseAssumptions,
      color: '#00d4ff',
      icon: Target,
    },
    {
      name: 'Optimistic',
      assumptions: optimisticAssumptions,
      color: '#00ff88',
      icon: TrendingUp,
    },
    {
      name: 'Conservative',
      assumptions: conservativeAssumptions,
      color: '#ffcc00',
      icon: TrendingDown,
    },
  ];

  const currentScenario = scenarios.find(s =>
    s.name === (selectedScenario === 'base' ? 'Base Case' : selectedScenario === 'optimistic' ? 'Optimistic' : 'Conservative')
  );

  const forecastData = useMemo(() => {
    if (!historicalData?.cohorts) return [];
    return calculateForecast(currentScenario?.assumptions || baseAssumptions, historicalData.cohorts);
  }, [historicalData, currentScenario, forecastMonths]);

  const chartData = useMemo(() => {
    if (!historicalData?.historical || !forecastData.length) return [];

    // Combine historical and forecast data
    const historical = (historicalData.historical || []).map((d: any) => ({
      date: d.date,
      appleAdsRevenue: d.appleAdsRevenue / 1000,
      organicRevenue: d.organicRevenue / 1000,
      type: 'historical',
    }));

    const forecast = forecastData.map(d => ({
      date: d.date,
      appleAdsRevenue: d.appleAdsRevenue / 1000,
      organicRevenue: d.organicRevenue / 1000,
      type: 'forecast',
    }));

    return [...historical, ...forecast];
  }, [historicalData, forecastData]);

  const handleExport = () => {
    if (!forecastData.length) return;

    const headers = ['Date', 'Apple Ads Revenue', 'Organic Revenue', 'Total Revenue', 'Apple Ads Active', 'Organic Active', 'Total Active', 'Spend', 'New Subs', 'ROAS'];
    const rows = forecastData.map(d => [
      d.date,
      d.appleAdsRevenue.toFixed(2),
      d.organicRevenue.toFixed(2),
      d.totalRevenue.toFixed(2),
      Math.round(d.appleAdsActive),
      Math.round(d.organicActive),
      Math.round(d.totalActive),
      d.spend.toFixed(2),
      Math.round(d.newSubs),
      (d.totalRevenue / d.spend).toFixed(2),
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
    setAssumptions: React.Dispatch<React.SetStateAction<Assumptions>>
  ) => (
    <div className="space-y-3.5">
      <div>
        <label className="text-xs font-semibold text-terminal-muted uppercase tracking-wide block mb-2">CAC Target ($)</label>
        <input
          type="number"
          value={assumptions.cacTarget}
          onChange={(e) => setAssumptions({ ...assumptions, cacTarget: Number(e.target.value) })}
          className="w-full px-4 py-2.5 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text text-sm font-mono font-bold hover:border-terminal-cyan/50 focus:border-terminal-cyan focus:outline-none transition-colors shadow-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-terminal-muted uppercase tracking-wide block mb-2">Monthly Budget ($)</label>
        <input
          type="number"
          value={assumptions.monthlyBudget}
          onChange={(e) => setAssumptions({ ...assumptions, monthlyBudget: Number(e.target.value) })}
          className="w-full px-4 py-2.5 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text text-sm font-mono font-bold hover:border-terminal-cyan/50 focus:border-terminal-cyan focus:outline-none transition-colors shadow-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-terminal-muted uppercase tracking-wide block mb-2">Weekly Churn (%/mo)</label>
        <input
          type="number"
          step="0.1"
          value={assumptions.monthlyChurnRate}
          onChange={(e) => setAssumptions({ ...assumptions, monthlyChurnRate: Number(e.target.value) })}
          className="w-full px-4 py-2.5 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text text-sm font-mono font-bold hover:border-terminal-cyan/50 focus:border-terminal-cyan focus:outline-none transition-colors shadow-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-terminal-muted uppercase tracking-wide block mb-2">Yearly Churn (%/mo)</label>
        <input
          type="number"
          step="0.1"
          value={assumptions.yearlyChurnRate}
          onChange={(e) => setAssumptions({ ...assumptions, yearlyChurnRate: Number(e.target.value) })}
          className="w-full px-4 py-2.5 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text text-sm font-mono font-bold hover:border-terminal-cyan/50 focus:border-terminal-cyan focus:outline-none transition-colors shadow-sm"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-terminal-muted uppercase tracking-wide block mb-2">Yearly Renewal Rate (%)</label>
        <input
          type="number"
          step="0.1"
          value={assumptions.yearlyRenewalRate}
          onChange={(e) => setAssumptions({ ...assumptions, yearlyRenewalRate: Number(e.target.value) })}
          className="w-full px-4 py-2.5 bg-terminal-bg border border-terminal-border rounded-lg text-terminal-text text-sm font-mono font-bold hover:border-terminal-cyan/50 focus:border-terminal-cyan focus:outline-none transition-colors shadow-sm"
        />
      </div>
    </div>
  );

  if (isLoading || forecastLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-terminal-muted">Loading planning data...</div>
      </div>
    );
  }

  // Transform forecast API data for chart
  const forecastChartData = [
    ...(forecastApiData?.historical.map((h: any) => ({
      month: h.month,
      actual: h.revenue,
      type: 'historical',
    })) || []),
    ...(forecastApiData?.renewalForecast.map((f: any) => ({
      month: f.month,
      forecast: f.totalRevenue,
      optimistic: f.totalRevenueOptimistic,
      pessimistic: f.totalRevenuePessimistic,
      type: 'forecast',
    })) || []),
  ];

  const summary = forecastData[forecastData.length - 1];
  const totalRevenue = forecastData.reduce((sum, d) => sum + d.totalRevenue, 0);
  const totalSpend = forecastData.reduce((sum, d) => sum + d.spend, 0);
  const avgRoas = totalRevenue / totalSpend;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold text-terminal-text mb-3">Planning & Forecasting</h1>
          <p className="text-base text-terminal-text mb-3 leading-relaxed">
            Two complementary tools for revenue planning and decision-making
          </p>
          <div className="space-y-2 text-sm text-terminal-muted">
            <div className="flex items-start gap-2">
              <span className="text-terminal-cyan font-semibold">Forecast:</span>
              <span>Automated 12-month revenue prediction based on actual cohort retention curves and renewal rates from historical data</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-terminal-green font-semibold">Scenario Planning:</span>
              <span>Interactive what-if analysis to test different growth strategies by adjusting CAC, churn, and budget assumptions</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-terminal-cyan text-terminal-bg rounded-lg hover:bg-terminal-cyan/90 transition-colors font-medium shadow-sm"
        >
          <Download size={18} />
          Export Data
        </button>
      </div>

      {/* Revenue Forecast (Cohort-based Model) */}
      {forecastApiData && (
        <div className="bg-terminal-card border-2 border-terminal-cyan/30 rounded-xl p-6 shadow-lg">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-6 bg-terminal-cyan rounded"></div>
                <h2 className="text-xl font-bold text-terminal-text">Automated Revenue Forecast</h2>
              </div>
              <div className="text-sm text-terminal-muted mb-2">
                Data-driven 12-month projection using actual subscriber behavior
              </div>
              <div className="flex gap-4 text-xs text-terminal-muted bg-terminal-bg/50 rounded px-3 py-2 inline-flex">
                <span>📊 Model: Cohort retention curves</span>
                <span>📈 Renewal rate: {(forecastApiData.modelParameters.yearlyRenewalRate * 100).toFixed(0)}%</span>
                <span>🔄 Weekly retention: {(forecastApiData.modelParameters.weeklyWeeklyRetention * 100).toFixed(0)}%</span>
              </div>
            </div>
            {forecastApiData.validation?.avgError && (
              <div className="px-4 py-2 bg-terminal-bg rounded-lg border border-terminal-cyan/30">
                <div className="text-xs text-terminal-muted mb-0.5">Model Accuracy</div>
                <div className="text-lg font-mono font-semibold text-terminal-cyan">±{forecastApiData.validation.avgError}%</div>
              </div>
            )}
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                <XAxis
                  dataKey="month"
                  stroke="#8b949e"
                  fontSize={11}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis
                  stroke="#8b949e"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    color: '#e6edf3'
                  }}
                  formatter={(value) => [`$${(Number(value) / 1000).toFixed(1)}k`, '']}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="optimistic"
                  fill="#00ff8820"
                  stroke="none"
                  name="Optimistic (+20%)"
                />
                <Area
                  type="monotone"
                  dataKey="pessimistic"
                  fill="#ff444420"
                  stroke="none"
                  name="Pessimistic (-15%)"
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke="#8b949e"
                  strokeWidth={2}
                  dot={{ fill: '#8b949e', r: 3 }}
                  name="Historical"
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#00d4ff', r: 3 }}
                  name="Base Forecast"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-5 space-y-3">
            <div className="flex gap-6 text-sm bg-terminal-bg/50 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-terminal-cyan rounded"></div>
                <span className="text-terminal-text font-semibold">Base Forecast</span>
                <span className="text-terminal-muted">• Historical retention rates</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-terminal-green/30 border-2 border-terminal-green rounded"></div>
                <span className="text-terminal-green font-semibold">Optimistic</span>
                <span className="text-terminal-muted">• +20% acq., +2pp retention</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-terminal-red/30 border-2 border-terminal-red rounded"></div>
                <span className="text-terminal-red font-semibold">Pessimistic</span>
                <span className="text-terminal-muted">• -15% acq., -3pp retention</span>
              </div>
            </div>
            <div className="text-xs text-terminal-muted bg-gradient-to-r from-terminal-bg to-transparent border-l-2 border-terminal-cyan/30 rounded-r px-4 py-2.5 leading-relaxed">
              <strong className="text-terminal-text">Methodology:</strong> Cohort-based forecast using actual subscriber retention curves and yearly renewal patterns from historical data.
              Confidence intervals reflect variations in acquisition volume and retention performance.
            </div>
          </div>
        </div>
      )}

      {/* Forecast Summary Metrics */}
      {forecastApiData?.renewalForecast && (
        <div className="grid grid-cols-4 gap-5">
          {(() => {
            const next12Months = forecastApiData.renewalForecast.slice(0, 12);
            const totalRevenue = next12Months.reduce((sum: number, m: any) => sum + m.totalRevenue, 0);
            const totalRevenueOptimistic = next12Months.reduce((sum: number, m: any) => sum + m.totalRevenueOptimistic, 0);
            const totalRevenuePessimistic = next12Months.reduce((sum: number, m: any) => sum + m.totalRevenuePessimistic, 0);
            const endingBase = next12Months[next12Months.length - 1]?.weeklyBase || 0;

            return (
              <>
                <div className="bg-terminal-card border border-terminal-border rounded-xl p-6 hover:border-terminal-cyan/50 hover:shadow-md transition-all shadow-sm">
                  <div className="text-xs font-semibold text-terminal-muted mb-3 uppercase tracking-wide">12-Month Revenue</div>
                  <div className="text-3xl font-bold font-mono text-terminal-cyan mb-3">
                    ${(totalRevenue / 1000).toFixed(0)}k
                  </div>
                  <div className="text-xs text-terminal-muted font-medium">
                    Range: ${(totalRevenuePessimistic / 1000).toFixed(0)}k - ${(totalRevenueOptimistic / 1000).toFixed(0)}k
                  </div>
                </div>

                <div className="bg-terminal-card border border-terminal-border rounded-xl p-6 hover:border-terminal-cyan/50 hover:shadow-md transition-all shadow-sm">
                  <div className="text-xs font-semibold text-terminal-muted mb-3 uppercase tracking-wide">Monthly Average</div>
                  <div className="text-3xl font-bold font-mono text-terminal-text mb-3">
                    ${(totalRevenue / 12 / 1000).toFixed(1)}k
                  </div>
                  <div className="text-xs text-terminal-muted font-medium">
                    Current: ${((forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) / 1000).toFixed(1)}k/mo
                  </div>
                </div>

                <div className="bg-terminal-card border border-terminal-border rounded-xl p-6 hover:border-terminal-cyan/50 hover:shadow-md transition-all shadow-sm">
                  <div className="text-xs font-semibold text-terminal-muted mb-3 uppercase tracking-wide">Active Subscribers</div>
                  <div className="text-3xl font-bold font-mono text-terminal-text mb-3">
                    {endingBase.toLocaleString()}
                  </div>
                  <div className="text-xs text-terminal-muted font-medium">
                    End of forecast period
                  </div>
                </div>

                <div className="bg-terminal-card border border-terminal-border rounded-xl p-6 hover:border-terminal-cyan/50 hover:shadow-md transition-all shadow-sm">
                  <div className="text-xs font-semibold text-terminal-muted mb-3 uppercase tracking-wide">Growth Trajectory</div>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className={`text-2xl ${totalRevenue > (forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) * 12 ? 'text-terminal-green' : 'text-terminal-yellow'}`}>
                      {totalRevenue > (forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) * 12 ? '📈' : '📊'}
                    </div>
                    <div className={`text-xl font-bold ${totalRevenue > (forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) * 12 ? 'text-terminal-green' : 'text-terminal-yellow'}`}>
                      {totalRevenue > (forecastApiData.currentMetrics?.avgWeeklyRevenue || 0) * 12 ? 'Growing' : 'Stable'}
                    </div>
                  </div>
                  <div className="text-xs text-terminal-muted font-medium">
                    Based on current trends
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Forecast Validation */}
      {forecastApiData?.validation?.results && forecastApiData.validation.results.length > 0 && (
        <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-terminal-border bg-terminal-bg/30">
            <div className="text-base font-semibold text-terminal-text">Historical Model Validation</div>
            <div className="text-xs text-terminal-muted mt-1">Comparing forecasted vs actual revenue for past months</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-terminal-bg/50">
                <tr className="text-xs font-semibold text-terminal-muted uppercase tracking-wide border-b-2 border-terminal-border">
                  <th className="text-left px-6 py-3">Month</th>
                  <th className="text-right px-6 py-3">Actual</th>
                  <th className="text-right px-6 py-3">Forecasted</th>
                  <th className="text-right px-6 py-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {forecastApiData.validation.results.map((result: any, index: number) => {
                  const errorNum = parseFloat(result.errorPercent);
                  const errorColor = Math.abs(errorNum) < 5 ? 'text-terminal-green' :
                                     Math.abs(errorNum) < 10 ? 'text-terminal-yellow' :
                                     'text-terminal-red';
                  return (
                    <tr
                      key={result.month}
                      className={`border-b border-terminal-border/30 hover:bg-terminal-bg/30 transition-colors ${
                        index % 2 === 0 ? 'bg-terminal-bg/10' : ''
                      }`}
                    >
                      <td className="px-6 py-3.5 font-mono text-sm text-terminal-text font-medium">{result.month}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-sm text-terminal-text font-semibold">
                        ${(result.actual / 1000).toFixed(1)}k
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-sm text-terminal-muted">
                        ${(result.forecasted / 1000).toFixed(1)}k
                      </td>
                      <td className={`px-6 py-3.5 text-right font-mono text-sm font-semibold ${errorColor}`}>
                        {errorNum > 0 ? '+' : ''}{result.errorPercent}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payback Analysis Section */}
      <div className="border-t-2 border-terminal-border/50 pt-8 mt-8">
        <PaybackAnalysis />
      </div>

      {/* Scenario Modeling Section */}
      <div className="border-t-4 border-terminal-border/70 pt-10 mt-10">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-1.5 h-7 bg-terminal-green rounded"></div>
            <h2 className="text-2xl font-bold text-terminal-text">Scenario Planning Tool</h2>
          </div>
          <p className="text-base text-terminal-text mb-4 leading-relaxed">
            Test different growth strategies by adjusting key assumptions and comparing outcomes
          </p>
          <div className="bg-gradient-to-r from-terminal-yellow/10 to-transparent border-l-4 border-terminal-yellow rounded-r-lg p-4">
            <div className="flex items-start gap-3">
              <div className="text-terminal-yellow text-xl mt-0.5">💡</div>
              <div>
                <div className="text-terminal-text font-semibold mb-2">Key Difference from Forecast</div>
                <div className="text-sm text-terminal-muted space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-terminal-cyan font-medium min-w-fit">Forecast (above):</span>
                    <span>Shows what <strong>will likely happen</strong> based on actual historical retention curves ({(forecastApiData?.modelParameters.weeklyWeeklyRetention * 100).toFixed(0)}% weekly, {(forecastApiData?.modelParameters.yearlyRenewalRate * 100)}% yearly renewal)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-terminal-green font-medium min-w-fit">Scenario Planning (below):</span>
                    <span>Explore what <strong>could happen if</strong> you change CAC targets, budget levels, or improve retention rates</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scenario Selector */}
        <div className="grid grid-cols-3 gap-5">
        {scenarios.map((scenario) => {
          const Icon = scenario.icon;
          const isSelected = scenario.name === currentScenario?.name;
          return (
            <button
              key={scenario.name}
              onClick={() => setSelectedScenario(
                scenario.name === 'Base Case' ? 'base' :
                scenario.name === 'Optimistic' ? 'optimistic' : 'conservative'
              )}
              className={`p-6 rounded-xl border-2 transition-all duration-200 ${
                isSelected
                  ? 'border-terminal-green bg-terminal-card shadow-lg scale-[1.02]'
                  : 'border-terminal-border bg-terminal-card/50 hover:border-terminal-green/50 hover:shadow-md hover:scale-[1.01]'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Icon size={24} style={{ color: scenario.color }} />
                <span className="font-bold text-lg text-terminal-text">{scenario.name}</span>
              </div>
              {isSelected && (
                <div className="flex items-center gap-1.5 text-xs text-terminal-green font-semibold mt-3 px-2 py-1 bg-terminal-green/10 rounded w-fit">
                  <span>✓</span>
                  <span>Active scenario</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Assumptions Editor */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-terminal-text mb-1.5">Adjust Assumptions</h3>
            <p className="text-sm text-terminal-muted">Modify parameters to explore different outcomes</p>
          </div>
          <div className="flex items-center gap-3 bg-terminal-bg border border-terminal-border rounded-lg px-4 py-2.5 shadow-sm">
            <label className="text-sm font-semibold text-terminal-muted">Forecast Period:</label>
            <input
              type="number"
              min="3"
              max="24"
              value={forecastMonths}
              onChange={(e) => setForecastMonths(Number(e.target.value))}
              className="w-16 px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text text-sm font-mono font-semibold hover:border-terminal-cyan/50 focus:border-terminal-cyan focus:outline-none transition-colors"
            />
            <span className="text-sm font-medium text-terminal-muted">months</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-5">
          <div className="bg-terminal-bg/50 rounded-xl p-5 border-2 border-terminal-cyan/30 shadow-sm">
            <div className="text-base font-bold text-terminal-cyan mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-terminal-cyan rounded"></div>
              Base Case
            </div>
            {renderAssumptionInputs(baseAssumptions, setBaseAssumptions)}
          </div>
          <div className="bg-terminal-bg/50 rounded-xl p-5 border-2 border-terminal-green/30 shadow-sm">
            <div className="text-base font-bold text-terminal-green mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-terminal-green rounded"></div>
              Optimistic
            </div>
            {renderAssumptionInputs(optimisticAssumptions, setOptimisticAssumptions)}
          </div>
          <div className="bg-terminal-bg/50 rounded-xl p-5 border-2 border-terminal-yellow/30 shadow-sm">
            <div className="text-base font-bold text-terminal-yellow mb-4 flex items-center gap-2">
              <div className="w-1 h-5 bg-terminal-yellow rounded"></div>
              Conservative
            </div>
            {renderAssumptionInputs(conservativeAssumptions, setConservativeAssumptions)}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      {summary && (
        <div className="grid grid-cols-5 gap-5">
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-5 hover:border-terminal-green/50 hover:shadow-md transition-all shadow-sm">
            <div className="text-xs font-semibold text-terminal-muted mb-2.5 uppercase tracking-wide">Total Revenue</div>
            <div className="text-2xl font-bold font-mono text-terminal-cyan mb-1.5">
              ${(totalRevenue / 1000).toFixed(1)}k
            </div>
            <div className="text-xs text-terminal-muted font-medium">{forecastMonths} month period</div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-5 hover:border-terminal-green/50 hover:shadow-md transition-all shadow-sm">
            <div className="text-xs font-semibold text-terminal-muted mb-2.5 uppercase tracking-wide">Total Spend</div>
            <div className="text-2xl font-bold font-mono text-terminal-text mb-1.5">
              ${(totalSpend / 1000).toFixed(1)}k
            </div>
            <div className="text-xs text-terminal-muted font-medium">{forecastMonths} month budget</div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-5 hover:border-terminal-green/50 hover:shadow-md transition-all shadow-sm">
            <div className="text-xs font-semibold text-terminal-muted mb-2.5 uppercase tracking-wide">Average ROAS</div>
            <div className={`text-2xl font-bold font-mono mb-1.5 ${avgRoas >= 1 ? 'text-terminal-green' : 'text-terminal-red'}`}>
              {avgRoas.toFixed(2)}x
            </div>
            <div className={`text-xs font-semibold ${avgRoas >= 1 ? 'text-terminal-green' : 'text-terminal-red'}`}>
              {avgRoas >= 1 ? '✓ Profitable' : '⚠ Loss-making'}
            </div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-5 hover:border-terminal-green/50 hover:shadow-md transition-all shadow-sm">
            <div className="text-xs font-semibold text-terminal-muted mb-2.5 uppercase tracking-wide">Active Subscribers</div>
            <div className="text-2xl font-bold font-mono text-terminal-text mb-1.5">
              {Math.round(summary.totalActive).toLocaleString()}
            </div>
            <div className="text-xs text-terminal-muted font-medium">
              {Math.round(summary.appleAdsActive).toLocaleString()} paid • {Math.round(summary.organicActive).toLocaleString()} organic
            </div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-xl p-5 hover:border-terminal-green/50 hover:shadow-md transition-all shadow-sm">
            <div className="text-xs font-semibold text-terminal-muted mb-2.5 uppercase tracking-wide">New Subscribers</div>
            <div className="text-2xl font-bold font-mono text-terminal-text mb-1.5">
              {Math.round(forecastData.reduce((sum, d) => sum + d.newSubs, 0)).toLocaleString()}
            </div>
            <div className="text-xs text-terminal-muted font-medium">From paid acquisition</div>
          </div>
        </div>
      )}

      {/* Stacked Area Chart */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl p-6 shadow-sm">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-6 bg-terminal-green rounded"></div>
            <div className="text-lg font-bold text-terminal-text">Revenue Projection by Source</div>
          </div>
          <div className="text-sm text-terminal-muted">Breakdown of paid vs. organic revenue streams</div>
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis
                dataKey="date"
                stroke="#8b949e"
                fontSize={11}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="#8b949e"
                fontSize={12}
                tickLine={false}
                tickFormatter={(val) => `$${val}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  color: '#e6edf3'
                }}
                formatter={(value: any) => [`$${Number(value).toFixed(1)}k`, '']}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="organicRevenue"
                stackId="1"
                stroke="#a371f7"
                fill="#a371f7"
                name="Organic Revenue"
              />
              <Area
                type="monotone"
                dataKey="appleAdsRevenue"
                stackId="1"
                stroke="#00d4ff"
                fill="#00d4ff"
                name="Apple Ads Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Forecast Table */}
      <div className="bg-terminal-card border border-terminal-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-terminal-border bg-terminal-bg/30">
          <div className="text-base font-semibold text-terminal-text">Detailed Monthly Breakdown</div>
          <div className="text-xs text-terminal-muted mt-1">Complete scenario projection data</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-terminal-bg/50">
              <tr className="text-xs font-semibold text-terminal-muted uppercase tracking-wide border-b-2 border-terminal-border">
                <th className="text-left px-5 py-3">Month</th>
                <th className="text-right px-5 py-3">Apple Ads Rev</th>
                <th className="text-right px-5 py-3">Organic Rev</th>
                <th className="text-right px-5 py-3">Total Rev</th>
                <th className="text-right px-5 py-3">Spend</th>
                <th className="text-right px-5 py-3">ROAS</th>
                <th className="text-right px-5 py-3">Active Subs</th>
                <th className="text-right px-5 py-3">New Subs</th>
              </tr>
            </thead>
            <tbody>
              {forecastData.map((row, i) => {
                const roas = row.totalRevenue / row.spend;
                return (
                  <tr
                    key={i}
                    className={`border-b border-terminal-border/30 hover:bg-terminal-bg/30 transition-colors ${
                      i % 2 === 0 ? 'bg-terminal-bg/10' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5 font-mono text-sm text-terminal-text font-medium">{row.date}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-terminal-cyan font-semibold">
                      ${(row.appleAdsRevenue / 1000).toFixed(1)}k
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-purple-400 font-semibold">
                      ${(row.organicRevenue / 1000).toFixed(1)}k
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-terminal-text font-bold">
                      ${(row.totalRevenue / 1000).toFixed(1)}k
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-terminal-muted">
                      ${(row.spend / 1000).toFixed(1)}k
                    </td>
                    <td className={`px-5 py-3.5 text-right font-mono text-sm font-bold ${roas >= 1 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {roas.toFixed(2)}x
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-terminal-text">
                      {Math.round(row.totalActive).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm text-terminal-muted">
                      {Math.round(row.newSubs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      </div>

      {/* COP Breakdown */}
      {historicalData?.copBreakdown && (
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-4">Current COP Breakdown</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-terminal-muted mb-1">Overall COP</div>
              <div className="text-2xl font-mono text-terminal-text">
                ${historicalData.copBreakdown.overall.toFixed(2)}
              </div>
              <div className="text-xs text-terminal-muted">All subscribers</div>
            </div>
            <div>
              <div className="text-xs text-terminal-muted mb-1">Paid-Only COP</div>
              <div className="text-2xl font-mono text-terminal-cyan">
                ${historicalData.copBreakdown.paidOnly.toFixed(2)}
              </div>
              <div className="text-xs text-terminal-muted">Apple Ads only</div>
            </div>
            <div>
              <div className="text-xs text-terminal-muted mb-1">Organic Subs</div>
              <div className="text-2xl font-mono text-terminal-text">
                {historicalData.copBreakdown.organicCount.toLocaleString()}
              </div>
              <div className="text-xs text-terminal-muted">
                {((historicalData.copBreakdown.organicCount / (historicalData.copBreakdown.organicCount + historicalData.copBreakdown.paidCount)) * 100).toFixed(1)}% of total
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
