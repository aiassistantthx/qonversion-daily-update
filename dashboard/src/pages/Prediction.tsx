import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, Bar
} from 'recharts';
import { Download, TrendingUp, DollarSign, Users, Calculator, RotateCcw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface PredictionParams {
  monthlyBudget: number;
  cpi: number;
  trialRate: number;
  conversionRate: number;
  organicSubscribers: number;
  weeklyPrice: number;
  yearlyPrice: number;
  weeklyChurnMonthly: number;
  yearlyChurnAnnual: number;
  weeklyShare: number;
  forecastMonths: number;
}

interface MonthOverride {
  spend?: number;
  cpi?: number;
}

interface ForecastMonth {
  month: string;
  spend: number;
  cpi: number;
  installs: number;
  trials: number;
  newWeekly: number;
  newYearly: number;
  activeWeekly: number;
  activeYearly: number;
  weeklyRevenue: number;
  yearlyRevenue: number;
  totalRevenue: number;
  cumulativeSpend: number;
  cumulativeRevenue: number;
  roas: number;
  isOverridden: boolean;
}

// Real metrics from OpenChat data (validated on 11 months, avg error 8.1%)
const defaultParams: PredictionParams = {
  monthlyBudget: 50000,
  cpi: 1.83,
  trialRate: 32,
  conversionRate: 22,
  organicSubscribers: 304,  // validated from funnel data
  weeklyPrice: 6.99,
  yearlyPrice: 49.99,
  weeklyChurnMonthly: 51,
  yearlyChurnAnnual: 65,
  weeklyShare: 78,  // validated: 78% of new subs choose weekly
  forecastMonths: 12,
};

export function Prediction() {
  const [params, setParams] = useState<PredictionParams>(defaultParams);
  const [monthOverrides, setMonthOverrides] = useState<Record<string, MonthOverride>>({});

  // Fetch current base from API
  const { data: activeData } = useQuery({
    queryKey: ['active-subscribers'],
    queryFn: () => fetch(`${API_BASE}/dashboard/active-subscribers`).then(r => r.json()),
  });

  // Generate month keys for the forecast period
  const monthKeys = useMemo(() => {
    const keys: string[] = [];
    const today = new Date();
    for (let i = 0; i < params.forecastMonths; i++) {
      const forecastDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      keys.push(forecastDate.toISOString().slice(0, 7));
    }
    return keys;
  }, [params.forecastMonths]);

  // Calculate forecast with per-month overrides
  const forecast = useMemo(() => {
    const results: ForecastMonth[] = [];

    let activeWeekly = activeData?.current?.weekly || 2800;
    let activeYearly = activeData?.current?.yearly || 4900;
    let cumulativeSpend = 0;
    let cumulativeRevenue = 0;

    const monthlyWeeklyRetention = 1 - (params.weeklyChurnMonthly / 100);
    const monthlyYearlyRetention = Math.pow(1 - (params.yearlyChurnAnnual / 100), 1/12);

    for (const monthStr of monthKeys) {
      const override = monthOverrides[monthStr] || {};
      const monthSpend = override.spend ?? params.monthlyBudget;
      const monthCpi = override.cpi ?? params.cpi;
      const isOverridden = override.spend !== undefined || override.cpi !== undefined;

      // New users from paid spend
      const installs = monthCpi > 0 ? monthSpend / monthCpi : 0;
      const trials = installs * (params.trialRate / 100);
      const paidConversions = trials * (params.conversionRate / 100);

      // Add organic subscribers (split by weekly share)
      const organicWeekly = params.organicSubscribers * (params.weeklyShare / 100);
      const organicYearly = params.organicSubscribers * (1 - params.weeklyShare / 100);

      const newWeekly = paidConversions * (params.weeklyShare / 100) + organicWeekly;
      const newYearly = paidConversions * (1 - params.weeklyShare / 100) + organicYearly;

      // Apply churn to existing base
      activeWeekly = activeWeekly * monthlyWeeklyRetention + newWeekly;
      activeYearly = activeYearly * monthlyYearlyRetention + newYearly;

      // Revenue
      const weeklyRevenue = activeWeekly * params.weeklyPrice * 4.33;
      const yearlyRevenue = activeYearly * params.yearlyPrice / 12;
      const totalRevenue = weeklyRevenue + yearlyRevenue;

      cumulativeSpend += monthSpend;
      cumulativeRevenue += totalRevenue;

      results.push({
        month: monthStr,
        spend: monthSpend,
        cpi: monthCpi,
        installs: Math.round(installs),
        trials: Math.round(trials),
        newWeekly: Math.round(newWeekly),
        newYearly: Math.round(newYearly),
        activeWeekly: Math.round(activeWeekly),
        activeYearly: Math.round(activeYearly),
        weeklyRevenue,
        yearlyRevenue,
        totalRevenue,
        cumulativeSpend,
        cumulativeRevenue,
        roas: cumulativeSpend > 0 ? cumulativeRevenue / cumulativeSpend : 0,
        isOverridden,
      });
    }

    return results;
  }, [params, activeData, monthOverrides, monthKeys]);

  const handleMonthOverride = useCallback((month: string, field: 'spend' | 'cpi', value: number) => {
    setMonthOverrides(prev => ({
      ...prev,
      [month]: {
        ...prev[month],
        [field]: value,
      },
    }));
  }, []);

  const resetMonthOverride = useCallback((month: string) => {
    setMonthOverrides(prev => {
      const next = { ...prev };
      delete next[month];
      return next;
    });
  }, []);

  const resetAllOverrides = useCallback(() => {
    setMonthOverrides({});
  }, []);

  const hasOverrides = Object.keys(monthOverrides).length > 0;

  const chartData = forecast.map(f => ({
    month: f.month.slice(5),
    revenue: f.totalRevenue / 1000,
    spend: f.spend / 1000,
    activeWeekly: f.activeWeekly,
    activeYearly: f.activeYearly,
    roas: f.roas,
  }));

  const finalMonth = forecast[forecast.length - 1];
  const totalRevenue = forecast.reduce((s, f) => s + f.totalRevenue, 0);
  const totalSpend = forecast.reduce((s, f) => s + f.spend, 0);

  const handleExport = () => {
    const headers = ['Month', 'Spend', 'CPI', 'Installs', 'Revenue', 'ROAS', 'Active Weekly', 'Active Yearly'];
    const rows = forecast.map(f => [
      f.month,
      f.spend.toFixed(0),
      f.cpi.toFixed(2),
      f.installs,
      f.totalRevenue.toFixed(0),
      f.roas.toFixed(2),
      f.activeWeekly,
      f.activeYearly,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prediction-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>
            <Calculator size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Revenue Prediction Model
          </h2>
          <p style={styles.subtitle}>
            Forecast based on real OpenChat metrics. Starting base: {activeData?.current?.weekly?.toLocaleString() || '~2,800'} weekly + {activeData?.current?.yearly?.toLocaleString() || '~4,900'} yearly active subs.
          </p>
        </div>
        <button onClick={handleExport} style={styles.exportBtn}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <SummaryCard
          title="Total Revenue"
          value={`$${(totalRevenue / 1000).toFixed(0)}K`}
          subtitle={`${params.forecastMonths} months`}
          icon={<DollarSign size={20} />}
          color="#10b981"
        />
        <SummaryCard
          title="Total Spend"
          value={`$${(totalSpend / 1000).toFixed(0)}K`}
          subtitle={hasOverrides ? 'custom budget' : `$${(params.monthlyBudget / 1000).toFixed(0)}K/mo`}
          icon={<TrendingUp size={20} />}
          color="#3b82f6"
        />
        <SummaryCard
          title="Final ROAS"
          value={`${finalMonth?.roas.toFixed(2)}x`}
          subtitle="cumulative"
          icon={<TrendingUp size={20} />}
          color={finalMonth?.roas >= 1 ? '#10b981' : '#ef4444'}
        />
        <SummaryCard
          title="Active Subs (End)"
          value={(finalMonth?.activeWeekly + finalMonth?.activeYearly || 0).toLocaleString()}
          subtitle={`W: ${finalMonth?.activeWeekly.toLocaleString()} / Y: ${finalMonth?.activeYearly.toLocaleString()}`}
          icon={<Users size={20} />}
          color="#8b5cf6"
        />
      </div>

      <div style={styles.mainGrid}>
        {/* Parameters Panel */}
        <div style={styles.paramsCard}>
          <h3 style={styles.cardTitle}>Default Parameters</h3>
          <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 16 }}>
            These values apply to all months unless overridden in the table below.
          </p>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Marketing</div>
            <ParamInput label="Monthly Budget ($)" value={params.monthlyBudget} onChange={v => setParams(p => ({ ...p, monthlyBudget: v }))} step={1000} />
            <ParamInput label="CPI ($)" value={params.cpi} onChange={v => setParams(p => ({ ...p, cpi: v }))} step={0.1} />
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Conversion</div>
            <ParamInput label="Trial Rate (%)" value={params.trialRate} onChange={v => setParams(p => ({ ...p, trialRate: v }))} step={1} />
            <ParamInput label="Conversion Rate (%)" value={params.conversionRate} onChange={v => setParams(p => ({ ...p, conversionRate: v }))} step={1} />
            <ParamInput label="Weekly Share (%)" value={params.weeklyShare} onChange={v => setParams(p => ({ ...p, weeklyShare: v }))} step={1} />
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Organic</div>
            <ParamInput label="New Subs/month" value={params.organicSubscribers} onChange={v => setParams(p => ({ ...p, organicSubscribers: v }))} step={50} />
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Pricing</div>
            <ParamInput label="Weekly Price ($)" value={params.weeklyPrice} onChange={v => setParams(p => ({ ...p, weeklyPrice: v }))} step={0.5} />
            <ParamInput label="Yearly Price ($)" value={params.yearlyPrice} onChange={v => setParams(p => ({ ...p, yearlyPrice: v }))} step={1} />
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Retention</div>
            <ParamInput label="Weekly Churn (%/mo)" value={params.weeklyChurnMonthly} onChange={v => setParams(p => ({ ...p, weeklyChurnMonthly: v }))} step={1} />
            <ParamInput label="Yearly Churn (%/yr)" value={params.yearlyChurnAnnual} onChange={v => setParams(p => ({ ...p, yearlyChurnAnnual: v }))} step={1} />
          </div>

          <div style={styles.paramSection}>
            <div style={styles.paramLabel}>Forecast</div>
            <ParamInput label="Months" value={params.forecastMonths} onChange={v => setParams(p => ({ ...p, forecastMonths: v }))} step={1} min={1} max={36} />
          </div>

          <button onClick={() => { setParams(defaultParams); resetAllOverrides(); }} style={styles.resetBtn}>
            Reset All to Defaults
          </button>
        </div>

        {/* Charts */}
        <div style={styles.chartsColumn}>
          <div style={styles.chartCard}>
            <h3 style={styles.cardTitle}>Revenue vs Spend Forecast</h3>
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis yAxisId="money" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v}k`} />
                  <YAxis yAxisId="roas" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `${v}x`} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                    formatter={(v, name) => {
                      if (name === 'roas') return [`${Number(v).toFixed(2)}x`, 'ROAS'];
                      return [`$${Number(v).toFixed(1)}k`, name === 'revenue' ? 'Revenue' : 'Spend'];
                    }}
                  />
                  <Area yAxisId="money" type="monotone" dataKey="revenue" fill="#10b98130" stroke="#10b981" strokeWidth={2} name="revenue" />
                  <Bar yAxisId="money" dataKey="spend" fill="#3b82f6" opacity={0.6} name="spend" />
                  <Line yAxisId="roas" type="monotone" dataKey="roas" stroke="#f59e0b" strokeWidth={2} dot={false} name="roas" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={styles.chartCard}>
            <h3 style={styles.cardTitle}>Active Subscribers Growth</h3>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                    formatter={(v, name) => [Number(v).toLocaleString(), name === 'activeWeekly' ? 'Weekly' : 'Yearly']}
                  />
                  <Area type="monotone" dataKey="activeWeekly" stackId="1" fill="#3b82f6" stroke="#3b82f6" name="activeWeekly" />
                  <Area type="monotone" dataKey="activeYearly" stackId="1" fill="#8b5cf6" stroke="#8b5cf6" name="activeYearly" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
              <LegendItem color="#3b82f6" label="Weekly Subs" />
              <LegendItem color="#8b5cf6" label="Yearly Subs" />
            </div>
          </div>
        </div>
      </div>

      {/* Editable Forecast Table */}
      <div style={styles.tableCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ ...styles.cardTitle, marginBottom: 4 }}>Monthly Forecast Details</h3>
            <p style={{ fontSize: 12, color: '#6b7280' }}>
              Click on Spend or CPI cells to edit values for individual months.
              {hasOverrides && <span style={{ color: '#f59e0b', marginLeft: 8 }}>● {Object.keys(monthOverrides).length} month(s) customized</span>}
            </p>
          </div>
          {hasOverrides && (
            <button onClick={resetAllOverrides} style={styles.resetTableBtn}>
              <RotateCcw size={14} /> Reset Table
            </button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Month</th>
                <th style={{ ...styles.thRight, background: '#fef3c7' }}>Spend</th>
                <th style={{ ...styles.thRight, background: '#fef3c7' }}>CPI</th>
                <th style={styles.thRight}>Installs</th>
                <th style={styles.thRight}>New Subs</th>
                <th style={styles.thRight}>Active W</th>
                <th style={styles.thRight}>Active Y</th>
                <th style={styles.thRight}>Revenue</th>
                <th style={styles.thRight}>Cum. Revenue</th>
                <th style={styles.thRight}>ROAS</th>
                <th style={{ ...styles.th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {forecast.map(f => (
                <tr key={f.month} style={{ ...styles.tr, background: f.isOverridden ? '#fffbeb' : undefined }}>
                  <td style={styles.td}>{f.month}</td>
                  <td style={{ ...styles.tdRight, padding: 4 }}>
                    <EditableCell
                      value={f.spend}
                      onChange={v => handleMonthOverride(f.month, 'spend', v)}
                      format={v => `$${v.toLocaleString()}`}
                      isOverridden={monthOverrides[f.month]?.spend !== undefined}
                    />
                  </td>
                  <td style={{ ...styles.tdRight, padding: 4 }}>
                    <EditableCell
                      value={f.cpi}
                      onChange={v => handleMonthOverride(f.month, 'cpi', v)}
                      format={v => `$${v.toFixed(2)}`}
                      step={0.1}
                      isOverridden={monthOverrides[f.month]?.cpi !== undefined}
                    />
                  </td>
                  <td style={styles.tdRight}>{f.installs.toLocaleString()}</td>
                  <td style={styles.tdRight}>{(f.newWeekly + f.newYearly).toLocaleString()}</td>
                  <td style={styles.tdRight}>{f.activeWeekly.toLocaleString()}</td>
                  <td style={styles.tdRight}>{f.activeYearly.toLocaleString()}</td>
                  <td style={styles.tdRight}>${f.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={styles.tdRight}>${f.cumulativeRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={{ ...styles.tdRight, color: f.roas >= 1 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                    {f.roas.toFixed(2)}x
                  </td>
                  <td style={{ padding: 4, textAlign: 'center' }}>
                    {f.isOverridden && (
                      <button
                        onClick={() => resetMonthOverride(f.month)}
                        style={styles.resetRowBtn}
                        title="Reset to default"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
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

function EditableCell({ value, onChange, format, step = 1, isOverridden }: {
  value: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  step?: number;
  isOverridden: boolean;
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
        step={step}
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
        background: isOverridden ? '#fef3c7' : '#f9fafb',
        borderColor: isOverridden ? '#f59e0b' : '#e5e7eb',
        fontWeight: isOverridden ? 600 : 400,
      }}
    >
      {format(value)}
    </button>
  );
}

function SummaryCard({ title, value, subtitle, icon, color }: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div style={styles.summaryCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{title}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#9ca3af' }}>{subtitle}</div>
    </div>
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

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, background: color, borderRadius: 2 }} />
      <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
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
    fontSize: 20,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  exportBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 24,
  },
  summaryCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
  },
  mainGrid: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
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
  chartsColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  chartCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
    marginBottom: 16,
  },
  paramSection: {
    marginBottom: 20,
  },
  paramLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 8,
  },
  paramRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  input: {
    width: 100,
    padding: '6px 10px',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'right' as const,
  },
  resetBtn: {
    width: '100%',
    padding: '10px',
    background: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: 8,
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
  tableCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 12,
  },
  thRight: {
    textAlign: 'right',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 12,
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '10px 8px',
    color: '#111827',
  },
  tdRight: {
    padding: '10px 8px',
    color: '#111827',
    textAlign: 'right',
    fontFamily: "'JetBrains Mono', monospace",
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
    border: '2px solid #3b82f6',
    borderRadius: 4,
    fontSize: 13,
    textAlign: 'right' as const,
    fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  },
};
