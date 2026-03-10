import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line } from 'recharts';
import { Download, TrendingUp, TrendingDown, Target } from 'lucide-react';

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
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-xs text-terminal-muted block mb-1">CAC Target ($)</label>
        <input
          type="number"
          value={assumptions.cacTarget}
          onChange={(e) => setAssumptions({ ...assumptions, cacTarget: Number(e.target.value) })}
          className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text text-sm font-mono"
        />
      </div>
      <div>
        <label className="text-xs text-terminal-muted block mb-1">Monthly Budget ($)</label>
        <input
          type="number"
          value={assumptions.monthlyBudget}
          onChange={(e) => setAssumptions({ ...assumptions, monthlyBudget: Number(e.target.value) })}
          className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text text-sm font-mono"
        />
      </div>
      <div>
        <label className="text-xs text-terminal-muted block mb-1">Weekly Churn (%/mo)</label>
        <input
          type="number"
          step="0.1"
          value={assumptions.monthlyChurnRate}
          onChange={(e) => setAssumptions({ ...assumptions, monthlyChurnRate: Number(e.target.value) })}
          className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text text-sm font-mono"
        />
      </div>
      <div>
        <label className="text-xs text-terminal-muted block mb-1">Yearly Churn (%/mo)</label>
        <input
          type="number"
          step="0.1"
          value={assumptions.yearlyChurnRate}
          onChange={(e) => setAssumptions({ ...assumptions, yearlyChurnRate: Number(e.target.value) })}
          className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text text-sm font-mono"
        />
      </div>
      <div>
        <label className="text-xs text-terminal-muted block mb-1">Yearly Renewal Rate (%)</label>
        <input
          type="number"
          step="0.1"
          value={assumptions.yearlyRenewalRate}
          onChange={(e) => setAssumptions({ ...assumptions, yearlyRenewalRate: Number(e.target.value) })}
          className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text text-sm font-mono"
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-terminal-text mb-1">Planning Tool</h1>
          <p className="text-sm text-terminal-muted">
            Revenue forecasting with cohort-based model and scenario planning
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-terminal-cyan text-terminal-bg rounded hover:bg-terminal-cyan/90 transition-colors"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Revenue Forecast (Cohort-based Model) */}
      {forecastApiData && (
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="text-sm text-terminal-muted mb-1">Revenue Forecast (12 Months)</div>
              <div className="text-xs text-terminal-muted">
                Cohort-based model with {forecastApiData.modelParameters.yearlyRenewalRate * 100}% renewal rate, {(forecastApiData.modelParameters.weeklyWeeklyRetention * 100).toFixed(0)}% weekly retention
              </div>
            </div>
            {forecastApiData.validation?.avgError && (
              <div className="text-xs text-terminal-muted">
                Avg forecast error: ±{forecastApiData.validation.avgError}%
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
          <div className="mt-4 flex gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-terminal-cyan rounded"></div>
              <span className="text-terminal-muted">Base Case (Cohort Model)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-terminal-green/30 border border-terminal-green rounded"></div>
              <span className="text-terminal-muted">Optimistic (+20% acquisition, +2pp retention)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-terminal-red/30 border border-terminal-red rounded"></div>
              <span className="text-terminal-muted">Pessimistic (-15% acquisition, -3pp retention)</span>
            </div>
          </div>
        </div>
      )}

      {/* Forecast Validation */}
      {forecastApiData?.validation?.results && forecastApiData.validation.results.length > 0 && (
        <div className="bg-terminal-card border border-terminal-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-terminal-border">
            <div className="text-sm text-terminal-muted">Model Validation (Last 3 Months)</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-terminal-muted border-b border-terminal-border">
                  <th className="text-left px-4 py-2 font-medium">Month</th>
                  <th className="text-right px-4 py-2 font-medium">Actual</th>
                  <th className="text-right px-4 py-2 font-medium">Forecasted</th>
                  <th className="text-right px-4 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {forecastApiData.validation.results.map((result: any) => {
                  const errorNum = parseFloat(result.errorPercent);
                  const errorColor = Math.abs(errorNum) < 5 ? 'text-terminal-green' :
                                     Math.abs(errorNum) < 10 ? 'text-terminal-yellow' :
                                     'text-terminal-red';
                  return (
                    <tr key={result.month} className="border-b border-terminal-border/50">
                      <td className="px-4 py-3 font-mono text-terminal-text">{result.month}</td>
                      <td className="px-4 py-3 text-right font-mono text-terminal-text">
                        ${(result.actual / 1000).toFixed(1)}k
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-terminal-muted">
                        ${(result.forecasted / 1000).toFixed(1)}k
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${errorColor}`}>
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

      {/* Scenario Modeling Section */}
      <div className="border-t border-terminal-border pt-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-terminal-text mb-1">Scenario Modeling</h2>
          <p className="text-sm text-terminal-muted mb-2">
            What-if analysis with custom assumptions for budget planning
          </p>
          <div className="bg-terminal-bg border border-terminal-border rounded p-3 text-xs text-terminal-muted">
            <strong>Note:</strong> The cohort-based forecast above uses actual historical retention ({(forecastApiData?.modelParameters.weeklyWeeklyRetention * 100).toFixed(0)}%)
            and renewal rates ({(forecastApiData?.modelParameters.yearlyRenewalRate * 100)}%) from your data.
            Scenario modeling below lets you test different assumptions for planning purposes.
          </div>
        </div>

        {/* Scenario Selector */}
        <div className="flex gap-4">
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
              className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                isSelected
                  ? `border-[${scenario.color}] bg-terminal-card`
                  : 'border-terminal-border bg-terminal-card/50 hover:border-terminal-border/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={18} style={{ color: scenario.color }} />
                <span className="font-semibold text-terminal-text">{scenario.name}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Assumptions Editor */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold text-terminal-text">Scenario Assumptions</h3>
          <div className="flex items-center gap-2">
            <label className="text-xs text-terminal-muted">Forecast Months:</label>
            <input
              type="number"
              min="3"
              max="24"
              value={forecastMonths}
              onChange={(e) => setForecastMonths(Number(e.target.value))}
              className="w-16 px-2 py-1 bg-terminal-bg border border-terminal-border rounded text-terminal-text text-sm font-mono"
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-terminal-cyan mb-2">Base Case</div>
            {renderAssumptionInputs(baseAssumptions, setBaseAssumptions)}
          </div>
          <div>
            <div className="text-xs text-terminal-green mb-2">Optimistic</div>
            {renderAssumptionInputs(optimisticAssumptions, setOptimisticAssumptions)}
          </div>
          <div>
            <div className="text-xs text-terminal-yellow mb-2">Conservative</div>
            {renderAssumptionInputs(conservativeAssumptions, setConservativeAssumptions)}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      {summary && (
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
            <div className="text-xs text-terminal-muted mb-1">Total Revenue ({forecastMonths}m)</div>
            <div className="text-2xl font-mono text-terminal-text">
              ${(totalRevenue / 1000).toFixed(1)}k
            </div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
            <div className="text-xs text-terminal-muted mb-1">Total Spend ({forecastMonths}m)</div>
            <div className="text-2xl font-mono text-terminal-text">
              ${(totalSpend / 1000).toFixed(1)}k
            </div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
            <div className="text-xs text-terminal-muted mb-1">Avg ROAS</div>
            <div className={`text-2xl font-mono ${avgRoas >= 1 ? 'text-terminal-green' : 'text-terminal-red'}`}>
              {avgRoas.toFixed(2)}x
            </div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
            <div className="text-xs text-terminal-muted mb-1">Active Subs (EOP)</div>
            <div className="text-2xl font-mono text-terminal-text">
              {Math.round(summary.totalActive).toLocaleString()}
            </div>
            <div className="text-xs text-terminal-muted">
              Paid: {Math.round(summary.appleAdsActive).toLocaleString()} | Org: {Math.round(summary.organicActive).toLocaleString()}
            </div>
          </div>
          <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
            <div className="text-xs text-terminal-muted mb-1">New Subs ({forecastMonths}m)</div>
            <div className="text-2xl font-mono text-terminal-text">
              {Math.round(forecastData.reduce((sum, d) => sum + d.newSubs, 0)).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Stacked Area Chart */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
        <div className="text-sm text-terminal-muted mb-4">Revenue Forecast by Source</div>
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
      <div className="bg-terminal-card border border-terminal-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border">
          <div className="text-sm text-terminal-muted">Monthly Forecast Detail</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-terminal-muted border-b border-terminal-border">
                <th className="text-left px-4 py-2 font-medium">Month</th>
                <th className="text-right px-4 py-2 font-medium">Apple Ads Rev</th>
                <th className="text-right px-4 py-2 font-medium">Organic Rev</th>
                <th className="text-right px-4 py-2 font-medium">Total Rev</th>
                <th className="text-right px-4 py-2 font-medium">Spend</th>
                <th className="text-right px-4 py-2 font-medium">ROAS</th>
                <th className="text-right px-4 py-2 font-medium">Active Subs</th>
                <th className="text-right px-4 py-2 font-medium">New Subs</th>
              </tr>
            </thead>
            <tbody>
              {forecastData.map((row, i) => {
                const roas = row.totalRevenue / row.spend;
                return (
                  <tr key={i} className="border-b border-terminal-border/50 hover:bg-terminal-bg/50">
                    <td className="px-4 py-3 font-mono text-terminal-text">{row.date}</td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      ${(row.appleAdsRevenue / 1000).toFixed(1)}k
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      ${(row.organicRevenue / 1000).toFixed(1)}k
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      ${(row.totalRevenue / 1000).toFixed(1)}k
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-muted">
                      ${(row.spend / 1000).toFixed(1)}k
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${roas >= 1 ? 'text-terminal-green' : 'text-terminal-red'}`}>
                      {roas.toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      {Math.round(row.totalActive).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-muted">
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
