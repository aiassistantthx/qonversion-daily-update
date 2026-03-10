import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from 'recharts';
import { RefreshCw, Calendar } from 'lucide-react';
import { MetricSelector, type MetricOption } from '../components/MetricSelector';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308', '#f43f5e', '#0ea5e9', '#22c55e',
  '#a855f7', '#eab308', '#fb923c', '#2dd4bf', '#facc15'
];

interface RoasEvolutionData {
  cohorts: Array<{
    month: string;
    maxAge: number;
    spend: number;
    roas: {
      d7: number | null;
      d14: number | null;
      d30: number | null;
      d60: number | null;
      d90: number | null;
      d120: number | null;
      d150: number | null;
      d180: number | null;
      total: number
    };
    paybackMonths: number | null;
  }>;
  chartData: Array<{ age: number; [key: string]: number | null }>;
  ages: number[];
}

export function RoasEvolution() {
  const [monthsBack, setMonthsBack] = useState(12);
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]);

  const { data: roasEvolution, refetch, isFetching } = useQuery<RoasEvolutionData>({
    queryKey: ['roas-evolution', monthsBack],
    queryFn: () => fetch(`${API_URL}/dashboard/roas-evolution?months=${monthsBack}`).then(r => r.json()),
  });

  const cohortMonths = roasEvolution?.cohorts?.map(c => c.month) || [];
  const chartData = roasEvolution?.chartData || [];

  // Create options for MetricSelector
  const cohortOptions: MetricOption[] = cohortMonths.map((month, i) => ({
    key: month,
    label: month,
    color: COHORT_COLORS[i % COHORT_COLORS.length],
  }));

  const handleCohortChange = useCallback((selected: string[]) => {
    setSelectedCohorts(selected);
  }, []);

  // Calculate cohort stats for the summary section
  const cohortStats = roasEvolution?.cohorts?.map((cohort, i) => {
    const currentRoas = cohort.roas.total;
    const isPaidBack = currentRoas >= 1.0;

    // Validate ROAS - cap at 10x (1000%) to prevent display of anomalous values
    const validRoas = Math.min(currentRoas, 10);

    return {
      month: cohort.month,
      spend: cohort.spend,
      maxAge: cohort.maxAge,
      currentRoas: validRoas,
      isPaidBack,
      paybackMonths: cohort.paybackMonths,
      color: COHORT_COLORS[i % COHORT_COLORS.length],
    };
  }) || [];

  const visibleCohorts = selectedCohorts.length > 0
    ? cohortMonths.filter(month => selectedCohorts.includes(month))
    : cohortMonths;

  // Calculate dynamic Y-axis domain based on actual data
  const maxRoas = chartData.reduce((max, point) => {
    visibleCohorts.forEach(cohort => {
      const value = point[cohort];
      if (typeof value === 'number' && value > max) {
        max = value;
      }
    });
    return max;
  }, 0);

  // Add 20% padding above max, but ensure we show at least 100% breakeven line
  const yAxisMax = Math.max(1, maxRoas * 1.2);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>ROAS Evolution by Cohort Age</h1>
          <p style={styles.subtitle}>
            How ROAS grows as cohorts mature. Each line represents one monthly cohort.
          </p>
        </div>
        <div style={styles.headerRight}>
          <select
            value={monthsBack}
            onChange={(e) => setMonthsBack(Number(e.target.value))}
            style={styles.select}
          >
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={18}>Last 18 months</option>
            <option value={24}>Last 24 months</option>
          </select>
          <button
            style={styles.refreshBtn}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              size={16}
              style={{
                animation: isFetching ? 'spin 1s linear infinite' : 'none'
              }}
            />
          </button>
        </div>
      </div>

      {/* Cohort Selector */}
      <div style={styles.selectorContainer}>
        <div style={styles.selectorLabel}>
          <Calendar size={16} />
          Select Cohorts to Display ({visibleCohorts.length} of {cohortMonths.length})
        </div>
        <MetricSelector
          options={cohortOptions}
          onChange={handleCohortChange}
          storageKey="roasEvolution-selectedCohorts"
        />
      </div>

      {/* Main Chart */}
      <div style={styles.chartCard}>
        <div style={{ ...styles.chartContainer, height: 450 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="age"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                label={{ value: 'Days since install', position: 'insideBottom', offset: -5, fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                tickFormatter={v => `${(v * 100).toFixed(0)}%`}
                domain={[0, yAxisMax]}
                label={{ value: 'ROAS', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 12 }}
              />
              <ReferenceLine
                y={1}
                stroke="#ef4444"
                strokeDasharray="5 5"
                label={{
                  value: 'Breakeven (100%)',
                  fill: '#ef4444',
                  fontSize: 11,
                  position: 'right'
                }}
              />
              <Tooltip
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12
                }}
                formatter={(value, name) => {
                  if (value == null) return ['—', name];
                  return [`${((Number(value) || 0) * 100).toFixed(1)}%`, name];
                }}
                labelFormatter={(age) => `Day ${age}`}
              />
              <Legend
                wrapperStyle={{ paddingTop: 20 }}
                iconType="line"
              />
              {visibleCohorts.map((month) => (
                <Line
                  key={month}
                  type="monotone"
                  dataKey={month}
                  stroke={COHORT_COLORS[cohortMonths.indexOf(month) % COHORT_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  name={month}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cohort Summary Table */}
      <div style={styles.tableCard}>
        <h3 style={styles.tableTitle}>Cohort Summary</h3>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Cohort</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Spend</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Age (days)</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Current ROAS</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Payback Months</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...cohortStats].sort((a, b) => b.month.localeCompare(a.month)).map((cohort) => (
                <tr key={cohort.month} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          background: cohort.color,
                        }}
                      />
                      <span style={{ fontWeight: 500 }}>{cohort.month}</span>
                    </div>
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>
                    ${cohort.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {cohort.maxAge}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {(cohort.currentRoas * 100).toFixed(1)}%
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {cohort.paybackMonths !== null ? cohort.paybackMonths : '∞'}
                  </td>
                  <td style={{ ...styles.td, textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 500,
                        background: cohort.isPaidBack ? '#d1fae5' : '#fee2e2',
                        color: cohort.isPaidBack ? '#065f46' : '#991b1b',
                      }}
                    >
                      {cohort.isPaidBack ? 'Paid back' : 'Pending'}
                    </span>
                  </td>
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
    maxWidth: 1400,
    margin: '0 auto',
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
    fontSize: 24,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  select: {
    padding: '8px 16px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: '#374151',
    cursor: 'pointer',
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
  selectorContainer: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  selectorLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 14,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 16,
  },
  chartCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  chartContainer: {
    width: '100%',
  },
  tableCard: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 24,
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 16,
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px 16px',
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    textAlign: 'left',
    borderBottom: '2px solid #e5e7eb',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 16px',
    fontSize: 14,
    color: '#374151',
  },
};
