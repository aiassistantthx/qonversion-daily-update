import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { CheckCircle, AlertTriangle, XCircle, BarChart2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface BacktestResult {
  month: string;
  actual: number;
  predicted: number;
  errorPercent: string;
}

interface ModelResult {
  name: string;
  description: string;
  results: BacktestResult[];
  mape: number | null;
  mae: number | null;
}

interface BacktestData {
  models: {
    status_quo: ModelResult;
    simple_average: ModelResult;
    cohort_based: ModelResult;
  };
  historical: Array<{
    month: string;
    revenue: number;
    subscribers: number;
    spend: number;
  }>;
  summary: {
    monthsTested: number;
    dateRange: {
      from: string;
      to: string;
    };
  };
}

export function BacktestValidation() {
  const { data, isLoading, error } = useQuery<BacktestData>({
    queryKey: ['backtest'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/dashboard/backtest`);
      if (!response.ok) throw new Error('Failed to fetch backtest data');
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>Model Validation</div>
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Loading backtest data...
        </div>
      </div>
    );
  }

  if (error || !data || !data.models) {
    return (
      <div style={styles.card}>
        <div style={styles.cardTitle}>Model Validation</div>
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
          Unable to load backtest data. Please ensure the API is updated and deployed.
        </div>
      </div>
    );
  }

  // Prepare chart data - combine actual with all model predictions
  const chartData = data.models.cohort_based?.results.map((r, i) => ({
    month: r.month,
    actual: r.actual / 1000,
    status_quo: data.models.status_quo?.results[i]?.predicted / 1000 || null,
    simple_avg: data.models.simple_average?.results[i - 2]?.predicted / 1000 || null,
    cohort_based: r.predicted / 1000,
  })) || [];

  // Get MAPE badge color
  const getMapeColor = (mape: number | null) => {
    if (mape === null) return '#6b7280';
    if (mape < 10) return '#10b981';
    if (mape < 20) return '#f59e0b';
    return '#ef4444';
  };

  const getMapeIcon = (mape: number | null) => {
    if (mape === null) return AlertTriangle;
    if (mape < 10) return CheckCircle;
    if (mape < 20) return AlertTriangle;
    return XCircle;
  };

  const modelCards = [
    { key: 'cohort_based', color: '#3b82f6' },
    { key: 'status_quo', color: '#8b5cf6' },
    { key: 'simple_average', color: '#6b7280' },
  ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>
            <BarChart2 size={20} style={{ marginRight: 8 }} />
            Model Backtesting
          </h2>
          <p style={styles.sectionSubtitle}>
            Validation of forecast models on {data.summary?.monthsTested || 0} months of historical data
            ({data.summary?.dateRange?.from} to {data.summary?.dateRange?.to})
          </p>
        </div>
      </div>

      {/* Model Accuracy Cards */}
      <div style={styles.metricsGrid}>
        {modelCards.map(({ key, color }) => {
          const model = data.models[key as keyof typeof data.models];
          if (!model) return null;

          const MapeIcon = getMapeIcon(model.mape);
          const mapeColor = getMapeColor(model.mape);

          return (
            <div key={key} style={{ ...styles.metricCard, borderTop: `3px solid ${color}` }}>
              <div style={styles.metricHeader}>
                <span style={{ fontWeight: 600, color: '#111827' }}>{model.name}</span>
                <MapeIcon size={18} style={{ color: mapeColor }} />
              </div>
              <div style={styles.metricDescription}>{model.description}</div>
              <div style={styles.metricStats}>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>MAPE</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: mapeColor }}>
                    {model.mape !== null ? `${model.mape}%` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>MAE</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>
                    {model.mae !== null ? `$${(model.mae / 1000).toFixed(1)}k` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart: Actual vs Predicted */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>Actual vs Predicted Revenue</div>
          <div style={styles.cardSubtitle}>Comparing model predictions against actual monthly revenue</div>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
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
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                tickFormatter={(val) => `$${val}k`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                formatter={(value) => [`$${Number(value)?.toFixed(1)}k`, '']}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#111827"
                strokeWidth={3}
                dot={{ fill: '#111827', r: 4 }}
                name="Actual"
              />
              <Line
                type="monotone"
                dataKey="cohort_based"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#3b82f6', r: 3 }}
                name="Cohort Model"
              />
              <Line
                type="monotone"
                dataKey="status_quo"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#8b5cf6', r: 3 }}
                name="Status Quo"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Results Table */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitle}>Monthly Backtest Results</div>
          <div style={styles.cardSubtitle}>Cohort-based model prediction errors by month</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Month</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Actual Revenue</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Predicted</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {data.models.cohort_based?.results.map((result, i) => {
                const error = parseFloat(result.errorPercent);
                const errorColor = Math.abs(error) < 10 ? '#10b981' :
                                   Math.abs(error) < 20 ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={result.month} style={{ background: i % 2 === 0 ? '#f9fafb' : '#fff' }}>
                    <td style={styles.td}>{result.month}</td>
                    <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                      ${(result.actual / 1000).toFixed(1)}k
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: '#6b7280' }}>
                      ${(result.predicted / 1000).toFixed(1)}k
                    </td>
                    <td style={{ ...styles.td, textAlign: 'right', color: errorColor, fontWeight: 600 }}>
                      {error > 0 ? '+' : ''}{result.errorPercent}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f3f4f6', fontWeight: 600 }}>
                <td style={styles.td}>Average</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>-</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>-</td>
                <td style={{
                  ...styles.td,
                  textAlign: 'right',
                  color: getMapeColor(data.models.cohort_based?.mape || null)
                }}>
                  MAPE: {data.models.cohort_based?.mape || 'N/A'}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginTop: 40,
    borderTop: '2px solid #e5e7eb',
    paddingTop: 32,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: '#111827',
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 20,
  },
  metricCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  metricHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 16,
  },
  metricStats: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    marginBottom: 20,
  },
  cardHeader: {
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: 12,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    borderBottom: '2px solid #e5e7eb',
  },
  td: {
    padding: '12px 16px',
    fontSize: 14,
    borderBottom: '1px solid #f3f4f6',
  },
};

export default BacktestValidation;
