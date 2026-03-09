import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
  Line, Area, ComposedChart
} from 'recharts';
import { TrendingUp, TrendingDown, Target, Users, Activity } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Assumptions {
  copTarget: number;
  churnRate: number;        // Blended monthly churn rate
  monthlySpend: number;
  initialActiveBase: number;
}

interface CurrentMetrics {
  activeSubscribers: {
    weekly: number;
    yearly: number;
    total: number;
  };
  churn: {
    current: number;
    trend: number;
    history: { week: string; rate: number }[];
  };
  loading: boolean;
}

interface Scenario {
  name: string;
  assumptions: Assumptions;
  color: string;
  bgColor: string;
  icon: React.ElementType;
}

export function ScenarioModeling() {
  const [currentMetrics, setCurrentMetrics] = useState<CurrentMetrics>({
    activeSubscribers: { weekly: 0, yearly: 0, total: 0 },
    churn: { current: 27, trend: 0, history: [] },
    loading: true,
  });

  const [baseCase, setBaseCase] = useState<Assumptions>({
    copTarget: 65,
    churnRate: 27,
    monthlySpend: 40000,
    initialActiveBase: 0,
  });

  const [optimistic, setOptimistic] = useState<Assumptions>({
    copTarget: 50,
    churnRate: 20,
    monthlySpend: 50000,
    initialActiveBase: 0,
  });

  const [conservative, setConservative] = useState<Assumptions>({
    copTarget: 80,
    churnRate: 35,
    monthlySpend: 30000,
    initialActiveBase: 0,
  });

  // Load current metrics from API
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [activeRes, churnRes] = await Promise.all([
          fetch(`${API_BASE}/dashboard/active-subscribers`),
          fetch(`${API_BASE}/dashboard/weekly-churn`),
        ]);

        const activeData = await activeRes.json();
        const churnData = await churnRes.json();

        // Calculate blended monthly churn based on subscriber mix
        const weeklySubChurn = churnData.stats?.churnRate || 15; // Weekly subs: ~15%/week
        const weeklySubMonthlyChurn = (1 - Math.pow(1 - weeklySubChurn / 100, 4.33)) * 100; // ~51%/month
        const yearlySubMonthlyChurn = 1; // Yearly subs: ~1%/month (very low)

        const weeklyCount = activeData.current?.weekly || 0;
        const yearlyCount = activeData.current?.yearly || 0;
        const totalCount = weeklyCount + yearlyCount || 1;

        // Blended churn weighted by subscriber count
        const blendedChurn = Math.round(
          (weeklyCount * weeklySubMonthlyChurn + yearlyCount * yearlySubMonthlyChurn) / totalCount
        );
        const monthlyChurn = Math.max(5, Math.min(blendedChurn, 60)); // Clamp 5-60%

        // Build churn history from retention curve
        const churnHistory = (churnData.retentionCurve || []).map((point: any, i: number) => ({
          week: `W${point.week || i + 1}`,
          rate: 100 - (point.retention || 100),
        }));

        const totalActive = (activeData.current?.total || 0);

        setCurrentMetrics({
          activeSubscribers: {
            weekly: activeData.current?.weekly || 0,
            yearly: activeData.current?.yearly || 0,
            total: totalActive,
          },
          churn: {
            current: monthlyChurn,
            trend: churnData.stats?.trend || 0,
            history: churnHistory,
          },
          loading: false,
        });

        // Update scenarios with real data
        setBaseCase(prev => ({
          ...prev,
          initialActiveBase: totalActive,
          churnRate: monthlyChurn,
        }));
        setOptimistic(prev => ({
          ...prev,
          initialActiveBase: totalActive,
          churnRate: Math.max(5, monthlyChurn - 7),
        }));
        setConservative(prev => ({
          ...prev,
          initialActiveBase: totalActive,
          churnRate: monthlyChurn + 8,
        }));
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
        setCurrentMetrics(prev => ({ ...prev, loading: false }));
      }
    };

    fetchMetrics();
  }, []);

  const calculateRevenue = (assumptions: Assumptions, months: number) => {
    const { copTarget, churnRate, monthlySpend, initialActiveBase } = assumptions;
    const avgSubscriptionValue = 350; // Average yearly subscription value
    const newSubsPerMonth = monthlySpend / copTarget;
    const retentionRate = 1 - churnRate / 100;

    let totalRevenue = 0;
    let activeBase = initialActiveBase; // Start with existing subscriber base

    for (let i = 0; i < months; i++) {
      activeBase = activeBase * retentionRate + newSubsPerMonth;
      const monthlyRevenue = activeBase * (avgSubscriptionValue / 12);
      totalRevenue += monthlyRevenue;
    }

    return totalRevenue;
  };

  // Calculate monthly revenue for chart (returns array of monthly values)
  const calculateMonthlyRevenue = (assumptions: Assumptions, months: number) => {
    const { copTarget, churnRate, monthlySpend, initialActiveBase } = assumptions;
    const avgSubscriptionValue = 350;
    const newSubsPerMonth = monthlySpend / copTarget;
    const retentionRate = 1 - churnRate / 100;

    const monthlyData: number[] = [];
    let activeBase = initialActiveBase;

    for (let i = 0; i < months; i++) {
      activeBase = activeBase * retentionRate + newSubsPerMonth;
      const monthlyRevenue = activeBase * (avgSubscriptionValue / 12);
      monthlyData.push(monthlyRevenue);
    }

    return monthlyData;
  };

  const months = 12;
  const scenarios: Scenario[] = [
    {
      name: 'Base Case',
      assumptions: baseCase,
      color: '#3b82f6',
      bgColor: '#dbeafe',
      icon: Target,
    },
    {
      name: 'Optimistic',
      assumptions: optimistic,
      color: '#10b981',
      bgColor: '#d1fae5',
      icon: TrendingUp,
    },
    {
      name: 'Conservative',
      assumptions: conservative,
      color: '#f59e0b',
      bgColor: '#fef3c7',
      icon: TrendingDown,
    },
  ];

  // Chart data showing monthly revenue (not cumulative)
  const chartData = Array.from({ length: months }, (_, i) => {
    const data: any = { month: `M${i + 1}` };

    scenarios.forEach(scenario => {
      const monthlyRevenues = calculateMonthlyRevenue(scenario.assumptions, months);
      data[scenario.name] = monthlyRevenues[i] / 1000;
    });

    return data;
  });

  const fmtK = (n: number) => `$${(n / 1000).toFixed(1)}K`;

  const renderScenarioCard = (
    scenario: Scenario,
    setAssumptions: React.Dispatch<React.SetStateAction<Assumptions>>
  ) => {
    const Icon = scenario.icon;
    const revenue12M = calculateRevenue(scenario.assumptions, 12);
    const subscribers12M = (scenario.assumptions.monthlySpend / scenario.assumptions.copTarget) * 12;

    // Calculate ending active base
    const { copTarget, churnRate, monthlySpend, initialActiveBase } = scenario.assumptions;
    const newSubsPerMonth = monthlySpend / copTarget;
    const retentionRate = 1 - churnRate / 100;
    let endingActiveBase = initialActiveBase;
    for (let i = 0; i < 12; i++) {
      endingActiveBase = endingActiveBase * retentionRate + newSubsPerMonth;
    }

    return (
      <div
        key={scenario.name}
        style={{
          background: '#fff',
          border: `2px solid ${scenario.color}`,
          borderRadius: 12,
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Icon size={20} color={scenario.color} />
          <h4 style={{ fontSize: 16, fontWeight: 600, color: scenario.color, margin: 0 }}>
            {scenario.name}
          </h4>
        </div>

        {/* Editable Assumptions */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 12 }}>
            Assumptions
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                COP Target ($)
              </label>
              <input
                type="number"
                value={scenario.assumptions.copTarget}
                onChange={(e) => setAssumptions(prev => ({ ...prev, copTarget: Number(e.target.value) }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Churn Rate (%)
              </label>
              <input
                type="number"
                value={scenario.assumptions.churnRate}
                onChange={(e) => setAssumptions(prev => ({ ...prev, churnRate: Number(e.target.value) }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Monthly Spend ($)
              </label>
              <input
                type="number"
                value={scenario.assumptions.monthlySpend}
                onChange={(e) => setAssumptions(prev => ({ ...prev, monthlySpend: Number(e.target.value) }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Initial Active Base
              </label>
              <input
                type="number"
                value={scenario.assumptions.initialActiveBase}
                onChange={(e) => setAssumptions(prev => ({ ...prev, initialActiveBase: Number(e.target.value) }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
        </div>

        {/* Projections */}
        <div style={{ background: scenario.bgColor, borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
            12-Month Projection
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Revenue</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: scenario.color }}>
                {fmtK(revenue12M)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>New Subscribers</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>
                {Math.round(subscribers12M).toLocaleString()}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Ending Active Base</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>
                {Math.round(endingActiveBase).toLocaleString()}
              </div>
              {scenario.assumptions.initialActiveBase > 0 && (
                <div style={{ fontSize: 10, color: endingActiveBase > scenario.assumptions.initialActiveBase ? '#10b981' : '#ef4444' }}>
                  {endingActiveBase > scenario.assumptions.initialActiveBase ? '+' : ''}
                  {Math.round(endingActiveBase - scenario.assumptions.initialActiveBase).toLocaleString()} vs start
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Total Spend</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>
                {fmtK(scenario.assumptions.monthlySpend * 12)}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Projected ROAS</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: revenue12M / (scenario.assumptions.monthlySpend * 12) >= 1 ? '#10b981' : '#ef4444',
                }}
              >
                {(revenue12M / (scenario.assumptions.monthlySpend * 12)).toFixed(2)}x
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
          Scenario Modeling
        </h3>
        <p style={{ fontSize: 12, color: '#6b7280' }}>
          Compare Base case, Optimistic, and Conservative scenarios with different COP targets, churn rates, and spend levels.
        </p>
      </div>

      {/* Current Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: currentMetrics.churn.history.length > 0 ? '1fr 2fr' : '1fr',
        gap: 16,
        marginBottom: 24,
        padding: 16,
        background: '#f9fafb',
        borderRadius: 8,
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} />
            Current Metrics
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={16} color="#3b82f6" />
              <div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Active Subscribers</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                  {currentMetrics.loading ? '...' : currentMetrics.activeSubscribers.total.toLocaleString()}
                </div>
                {!currentMetrics.loading && (
                  <div style={{ fontSize: 10, color: '#6b7280' }}>
                    Weekly: {currentMetrics.activeSubscribers.weekly.toLocaleString()} |
                    Yearly: {currentMetrics.activeSubscribers.yearly.toLocaleString()}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingDown size={16} color="#ef4444" />
              <div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>Blended Monthly Churn</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                    {currentMetrics.loading ? '...' : `${currentMetrics.churn.current}%`}
                  </span>
                  {!currentMetrics.loading && currentMetrics.churn.trend !== 0 && (
                    <span style={{
                      fontSize: 11,
                      color: currentMetrics.churn.trend > 0 ? '#ef4444' : '#10b981',
                      fontWeight: 500,
                    }}>
                      {currentMetrics.churn.trend > 0 ? '+' : ''}{currentMetrics.churn.trend.toFixed(1)}%
                    </span>
                  )}
                </div>
                {!currentMetrics.loading && (
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                    Weekly: ~51%/mo | Yearly: ~1%/mo
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {currentMetrics.churn.history.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 8 }}>
              Churn by Cohort Week
            </div>
            <div style={{ height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={currentMetrics.churn.history}>
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Churn']}
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="rate" fill="#fee2e2" stroke="transparent" />
                  <Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Scenario Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {renderScenarioCard(scenarios[0], setBaseCase)}
        {renderScenarioCard(scenarios[1], setOptimistic)}
        {renderScenarioCard(scenarios[2], setConservative)}
      </div>

      {/* Comparison Chart */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
          Monthly Revenue Projection
        </div>
        <div style={{ height: 350 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => `$${v}K`}
              />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(1)}K`, '']}
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
              />
              <Legend />
              <Bar dataKey="Base Case" fill={scenarios[0].color} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Optimistic" fill={scenarios[1].color} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Conservative" fill={scenarios[2].color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
