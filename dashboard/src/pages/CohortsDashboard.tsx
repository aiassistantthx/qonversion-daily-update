import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { RefreshCw, Calendar, Users } from 'lucide-react';
import { api } from '../api';
import { useTheme, themes } from '../styles/themes';
import { MetricSelector, type MetricOption } from '../components/MetricSelector';

const COHORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308', '#f43f5e', '#0ea5e9', '#22c55e',
  '#a855f7', '#eab308', '#fb923c', '#2dd4bf', '#facc15'
];

export function CohortsDashboard() {
  const { theme } = useTheme();
  const t = themes[theme];
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]);
  const [monthsCount, setMonthsCount] = useState(6);

  const { data: cohortsData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['cohorts', monthsCount],
    queryFn: () => api.getCohorts(monthsCount),
    refetchInterval: 60000,
  });

  const cohortMonths = cohortsData?.cohorts?.map(c => c.cohortMonth) || [];

  // Create options for MetricSelector
  const cohortOptions: MetricOption[] = cohortMonths.map((month, i) => ({
    key: month,
    label: month,
    color: COHORT_COLORS[i % COHORT_COLORS.length],
  }));

  const handleCohortChange = useCallback((selected: string[]) => {
    setSelectedCohorts(selected);
  }, []);

  const visibleCohorts = selectedCohorts.length > 0
    ? cohortMonths.filter(month => selectedCohorts.includes(month))
    : cohortMonths;

  // Transform cohort data for chart
  const chartData: Record<number, Record<string, number>> = {};
  cohortsData?.cohorts.forEach((cohort) => {
    if (!visibleCohorts.includes(cohort.cohortMonth)) return;
    cohort.curve.forEach((point) => {
      if (!chartData[point.day]) {
        chartData[point.day] = { day: point.day };
      }
      chartData[point.day][cohort.cohortMonth] = point.revenuePerUser;
    });
  });

  const chartDataArray = Object.values(chartData).sort((a, b) => a.day - b.day);

  // Get best and worst cohorts
  const sortedCohorts = [...(cohortsData?.cohorts || [])].sort((a, b) => {
    const aMax = Math.max(...a.curve.map(c => c.revenuePerUser));
    const bMax = Math.max(...b.curve.map(c => c.revenuePerUser));
    return bMax - aMax;
  });

  const bestCohort = sortedCohorts[0];
  const worstCohort = sortedCohorts[sortedCohorts.length - 1];

  // Calculate dynamic Y-axis max
  const maxLtv = chartDataArray.reduce((max, point) => {
    visibleCohorts.forEach(cohort => {
      const value = point[cohort];
      if (typeof value === 'number' && value > max) {
        max = value;
      }
    });
    return max;
  }, 0);

  const yAxisMax = Math.ceil(maxLtv * 1.1 / 10) * 10;

  if (isLoading) {
    return (
      <div style={{ ...styles.container, background: t.bg }}>
        <div style={styles.loadingContainer}>
          <div style={{ color: t.textMuted }}>Loading cohorts data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...styles.container, background: t.bg }}>
        <div style={styles.errorContainer}>
          <div style={styles.errorTitle}>Error loading cohorts</div>
          <div style={styles.errorMessage}>{error.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, background: t.bg }}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={{ ...styles.title, color: t.text }}>
            <Users size={24} style={{ marginRight: 8, color: t.accent }} />
            Revenue per User by Cohort
          </h1>
          <p style={{ ...styles.subtitle, color: t.textMuted }}>
            How LTV grows as cohorts mature. Each line represents one monthly cohort.
          </p>
        </div>
        <div style={styles.headerRight}>
          <select
            value={monthsCount}
            onChange={(e) => setMonthsCount(Number(e.target.value))}
            style={{ ...styles.select, background: t.cardBg, borderColor: t.border, color: t.text }}
          >
            <option value={6}>Last 6 months</option>
            <option value={9}>Last 9 months</option>
            <option value={12}>Last 12 months</option>
          </select>
          <button
            style={{ ...styles.refreshBtn, background: t.cardBg, borderColor: t.border, color: t.textMuted }}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              size={16}
              style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }}
            />
          </button>
        </div>
      </div>

      {/* Cohort Selector */}
      <div style={{ ...styles.selectorContainer, background: t.cardBg, borderColor: t.border }}>
        <div style={{ ...styles.selectorLabel, color: t.text }}>
          <Calendar size={16} />
          Select Cohorts to Display ({visibleCohorts.length} of {cohortMonths.length})
        </div>
        <MetricSelector
          options={cohortOptions}
          onChange={handleCohortChange}
          storageKey="cohorts-selectedCohorts"
        />
      </div>

      {/* Main Chart */}
      <div style={{ ...styles.chartCard, background: t.cardBg, borderColor: t.border }}>
        <div style={{ ...styles.chartContainer, height: 450 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataArray}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis
                dataKey="day"
                tick={{ fill: t.textMuted, fontSize: 11 }}
                label={{ value: 'Days since signup', position: 'insideBottom', offset: -5, fill: t.textMuted, fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: t.textMuted, fontSize: 11 }}
                tickFormatter={(val) => `$${val}`}
                domain={[0, yAxisMax]}
                label={{ value: 'LTV', angle: -90, position: 'insideLeft', fill: t.textMuted, fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: t.cardBg,
                  border: `1px solid ${t.border}`,
                  borderRadius: 8,
                  padding: 12,
                  color: t.text
                }}
                formatter={(value) => [`$${Number(value)?.toFixed(2) || 0}`, 'Rev/User']}
                labelFormatter={(label) => `Day ${label}`}
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

      {/* Cohort summary cards */}
      <div style={styles.summaryGrid}>
        <div style={{ ...styles.card, background: t.cardBg, borderColor: t.border }}>
          <div style={{ ...styles.cardTitle, color: t.textMuted }}>Best Cohort</div>
          {bestCohort && (
            <>
              <div style={{ ...styles.cohortValue, color: '#10b981' }}>
                {bestCohort.cohortMonth}
              </div>
              <div style={{ ...styles.cohortSubtitle, color: t.textMuted }}>
                {bestCohort.cohortSize} users
              </div>
              <div style={{ ...styles.ltvValue, color: t.text }}>
                LTV: ${Math.max(...bestCohort.curve.map(c => c.revenuePerUser)).toFixed(2)}
              </div>
            </>
          )}
        </div>

        <div style={{ ...styles.card, background: t.cardBg, borderColor: t.border }}>
          <div style={{ ...styles.cardTitle, color: t.textMuted }}>Worst Cohort</div>
          {worstCohort && (
            <>
              <div style={{ ...styles.cohortValue, color: '#ef4444' }}>
                {worstCohort.cohortMonth}
              </div>
              <div style={{ ...styles.cohortSubtitle, color: t.textMuted }}>
                {worstCohort.cohortSize} users
              </div>
              <div style={{ ...styles.ltvValue, color: t.text }}>
                LTV: ${Math.max(...worstCohort.curve.map(c => c.revenuePerUser)).toFixed(2)}
              </div>
            </>
          )}
        </div>

        <div style={{ ...styles.card, background: t.cardBg, borderColor: t.border }}>
          <div style={{ ...styles.cardTitle, color: t.textMuted }}>Average LTV</div>
          <div style={{ ...styles.cohortValue, color: t.accent }}>
            ${cohortsData?.cohorts.length
              ? (cohortsData.cohorts.reduce((sum, c) =>
                  sum + Math.max(...c.curve.map(p => p.revenuePerUser)), 0
                ) / cohortsData.cohorts.length).toFixed(2)
              : '—'}
          </div>
          <div style={{ ...styles.cohortSubtitle, color: t.textMuted }}>
            Across {cohortsData?.cohorts.length || 0} cohorts
          </div>
        </div>
      </div>

      {/* Cohort table */}
      <div style={{ ...styles.tableCard, background: t.cardBg, borderColor: t.border }}>
        <h3 style={{ ...styles.tableTitle, color: t.text }}>Cohort Summary</h3>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, color: t.textMuted, borderColor: t.border }}>Cohort</th>
                <th style={{ ...styles.th, color: t.textMuted, borderColor: t.border, textAlign: 'right' }}>Size</th>
                <th style={{ ...styles.th, color: t.textMuted, borderColor: t.border, textAlign: 'right' }}>d7 LTV</th>
                <th style={{ ...styles.th, color: t.textMuted, borderColor: t.border, textAlign: 'right' }}>d30 LTV</th>
                <th style={{ ...styles.th, color: t.textMuted, borderColor: t.border, textAlign: 'right' }}>d60 LTV</th>
                <th style={{ ...styles.th, color: t.textMuted, borderColor: t.border, textAlign: 'right' }}>Max LTV</th>
              </tr>
            </thead>
            <tbody>
              {[...(cohortsData?.cohorts || [])].sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth)).map((cohort, i) => {
                const d7 = cohort.curve.find(p => p.day <= 7)?.revenuePerUser;
                const d30 = cohort.curve.find(p => p.day <= 30)?.revenuePerUser;
                const d60 = cohort.curve.find(p => p.day <= 60)?.revenuePerUser;
                const maxLtvValue = Math.max(...cohort.curve.map(p => p.revenuePerUser));
                const colorIndex = cohortMonths.indexOf(cohort.cohortMonth);

                return (
                  <tr key={cohort.cohortMonth} style={{ borderBottom: `1px solid ${t.border}` }}>
                    <td style={{ ...styles.td, color: t.text }}>
                      <div style={styles.cohortCell}>
                        <div
                          style={{ ...styles.colorDot, backgroundColor: COHORT_COLORS[colorIndex % COHORT_COLORS.length] }}
                        />
                        <span style={{ ...styles.mono, fontWeight: 500 }}>{cohort.cohortMonth}</span>
                      </div>
                    </td>
                    <td style={{ ...styles.td, ...styles.mono, color: t.textMuted, textAlign: 'right' }}>
                      {cohort.cohortSize}
                    </td>
                    <td style={{ ...styles.td, ...styles.mono, color: t.text, textAlign: 'right' }}>
                      {d7 ? `$${d7.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ ...styles.td, ...styles.mono, color: t.text, textAlign: 'right' }}>
                      {d30 ? `$${d30.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ ...styles.td, ...styles.mono, color: t.text, textAlign: 'right' }}>
                      {d60 ? `$${d60.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ ...styles.td, ...styles.mono, color: t.accent, textAlign: 'right', fontWeight: 500 }}>
                      ${maxLtvValue.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
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
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 256,
  },
  errorContainer: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: 16,
  },
  errorTitle: {
    color: '#991b1b',
    fontWeight: 500,
    marginBottom: 4,
  },
  errorMessage: {
    color: '#dc2626',
    fontSize: 14,
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
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 14,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  select: {
    padding: '8px 16px',
    border: '1px solid',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
  },
  refreshBtn: {
    padding: 10,
    border: '1px solid',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorContainer: {
    border: '1px solid',
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
    marginBottom: 16,
  },
  chartCard: {
    border: '1px solid',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  },
  chartContainer: {
    width: '100%',
  },
  card: {
    borderRadius: 12,
    padding: 20,
    border: '1px solid',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 12,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 24,
  },
  cohortValue: {
    fontSize: 24,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    marginBottom: 4,
    fontWeight: 600,
  },
  cohortSubtitle: {
    fontSize: 14,
  },
  ltvValue: {
    fontSize: 14,
    marginTop: 8,
  },
  tableCard: {
    borderRadius: 12,
    border: '1px solid',
    padding: 24,
  },
  tableTitle: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 16,
  },
  tableWrapper: {
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
    textAlign: 'left',
    borderBottom: '2px solid',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  td: {
    padding: '12px 16px',
    fontSize: 14,
  },
  cohortCell: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  mono: {
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
};
