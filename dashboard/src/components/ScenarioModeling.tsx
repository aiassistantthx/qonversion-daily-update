import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

interface Assumptions {
  copTarget: number;
  churnRate: number;
  monthlySpend: number;
}

interface Scenario {
  name: string;
  assumptions: Assumptions;
  color: string;
  bgColor: string;
  icon: React.ElementType;
}

export function ScenarioModeling() {
  const [baseCase, setBaseCase] = useState<Assumptions>({
    copTarget: 65,
    churnRate: 27,
    monthlySpend: 40000,
  });

  const [optimistic, setOptimistic] = useState<Assumptions>({
    copTarget: 50,
    churnRate: 20,
    monthlySpend: 50000,
  });

  const [conservative, setConservative] = useState<Assumptions>({
    copTarget: 80,
    churnRate: 35,
    monthlySpend: 30000,
  });

  const calculateRevenue = (assumptions: Assumptions, months: number) => {
    const { copTarget, churnRate, monthlySpend } = assumptions;
    const avgSubscriptionValue = 350; // Average yearly subscription value
    const newSubsPerMonth = monthlySpend / copTarget;
    const retentionRate = 1 - churnRate / 100;

    let totalRevenue = 0;
    let activeBase = 0;

    for (let i = 0; i < months; i++) {
      activeBase = activeBase * retentionRate + newSubsPerMonth;
      const monthlyRevenue = activeBase * (avgSubscriptionValue / 12);
      totalRevenue += monthlyRevenue;
    }

    return totalRevenue;
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

  const chartData = Array.from({ length: months }, (_, i) => {
    const month = i + 1;
    const data: any = { month: `M${month}` };

    scenarios.forEach(scenario => {
      data[scenario.name] = calculateRevenue(scenario.assumptions, month) / 1000;
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
              <div style={{ fontSize: 11, color: '#6b7280' }}>Total Subscribers</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#374151' }}>
                {Math.round(subscribers12M).toLocaleString()}
              </div>
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

      {/* Scenario Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {renderScenarioCard(scenarios[0], setBaseCase)}
        {renderScenarioCard(scenarios[1], setOptimistic)}
        {renderScenarioCard(scenarios[2], setConservative)}
      </div>

      {/* Comparison Chart */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 12 }}>
          Revenue Projection Comparison
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
