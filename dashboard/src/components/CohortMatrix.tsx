import { useState } from 'react';
import { useTheme, themes } from '../styles/themes';

interface CohortPeriod {
  period: number;
  revenue: number | null;
  cumulativeRevenue: number | null;
  activeSubscribers: number | null;
}

interface CohortRow {
  cohortMonth: string;
  cohortSize: number;
  periods: CohortPeriod[];
}

export interface CohortMatrixData {
  rows: CohortRow[];
  maxPeriod: number;
  mode: string;
}

interface CohortMatrixProps {
  data: CohortMatrixData | undefined;
  isLoading: boolean;
  mode: 'calendar' | 'rolling30';
  onModeChange: (mode: 'calendar' | 'rolling30') => void;
}

function getHeatColor(value: number, min: number, max: number, isNull: boolean): string {
  if (isNull || value === null) return 'transparent';
  if (max === min) return 'rgba(59, 130, 246, 0.2)';
  const normalized = (value - min) / (max - min);
  // Green heatmap: low = light, high = green
  const r = Math.round(255 - normalized * (255 - 16));
  const g = Math.round(255 - normalized * (255 - 185));
  const b = Math.round(255 - normalized * (255 - 129));
  return `rgb(${r}, ${g}, ${b})`;
}

export function CohortMatrix({ data, isLoading, mode, onModeChange }: CohortMatrixProps) {
  const { theme } = useTheme();
  const t = themes[theme];
  const [metric, setMetric] = useState<'revenue' | 'cumulativeRevenue' | 'activeSubscribers'>('revenue');

  if (isLoading) {
    return (
      <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
        <div style={{ color: t.textMuted, textAlign: 'center', padding: 32 }}>Loading cohort matrix...</div>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
        <div style={{ color: t.textMuted, textAlign: 'center', padding: 32 }}>No data available</div>
      </div>
    );
  }

  const { rows, maxPeriod } = data;
  const periods = Array.from({ length: maxPeriod + 1 }, (_, i) => i);

  // Compute per-column min/max for heatmap
  const colStats: Array<{ min: number; max: number }> = periods.map(p => {
    const values = rows
      .map(r => r.periods[p]?.[metric])
      .filter((v): v is number => v !== null && v !== undefined);
    if (values.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...values), max: Math.max(...values) };
  });

  const formatValue = (v: number | null): string => {
    if (v === null || v === undefined) return '—';
    if (metric === 'activeSubscribers') return v.toFixed(0);
    return `$${v.toFixed(0)}`;
  };

  const colLabel = mode === 'calendar' ? 'Mo' : 'M';

  return (
    <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: t.text, margin: 0 }}>
          Cohort Matrix
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Metric toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'revenue', label: 'Revenue' },
              { key: 'cumulativeRevenue', label: 'Cumulative' },
              { key: 'activeSubscribers', label: 'Subscribers' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => setMetric(opt.key)}
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: metric === opt.key ? t.accent : t.bg,
                  color: metric === opt.key ? '#fff' : t.textMuted,
                  fontWeight: metric === opt.key ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { key: 'calendar', label: 'Calendar' },
              { key: 'rolling30', label: '30-day' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => onModeChange(opt.key)}
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  border: `1px solid ${t.border}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: mode === opt.key ? '#6366f1' : t.bg,
                  color: mode === opt.key ? '#fff' : t.textMuted,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Note about mode */}
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>
        {mode === 'calendar'
          ? 'Each column = calendar month. Month 0 = install month.'
          : 'Each column = 30-day rolling window. Month 0 = days 0–29.'}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...stickyTh, background: t.cardBg, color: t.textMuted, borderColor: t.border }}>
                Cohort
              </th>
              <th style={{ ...th, color: t.textMuted, borderColor: t.border }}>Size</th>
              {periods.map(p => (
                <th key={p} style={{ ...th, color: t.textMuted, borderColor: t.border }}>
                  {colLabel}{p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.cohortMonth}>
                <td style={{ ...stickyTd, background: t.cardBg, color: t.text, borderColor: t.border, fontWeight: 600 }}>
                  {row.cohortMonth}
                </td>
                <td style={{ ...td, color: t.textMuted, borderColor: t.border, textAlign: 'right' }}>
                  {row.cohortSize}
                </td>
                {periods.map(p => {
                  const cell = row.periods[p];
                  const value = cell?.[metric] ?? null;
                  const isNull = value === null;
                  const bg = isNull
                    ? 'transparent'
                    : getHeatColor(value, colStats[p].min, colStats[p].max, false);
                  const isDark = !isNull && (value - colStats[p].min) / Math.max(colStats[p].max - colStats[p].min, 1) > 0.6;
                  return (
                    <td
                      key={p}
                      style={{
                        ...td,
                        background: bg,
                        color: isDark ? '#fff' : t.text,
                        borderColor: t.border,
                        textAlign: 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        opacity: isNull ? 0.3 : 1,
                      }}
                    >
                      {formatValue(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: t.textMuted }}>
        Heatmap: darker green = higher value within column. Revenue = Gross Sales (before Apple commission).
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid',
  padding: 20,
  marginBottom: 24,
};

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'right',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  borderBottom: '2px solid',
  fontSize: 11,
};

const stickyTh: React.CSSProperties = {
  ...th,
  textAlign: 'left',
  position: 'sticky',
  left: 0,
  zIndex: 1,
  borderRight: '2px solid #e5e7eb',
  minWidth: 90,
};

const td: React.CSSProperties = {
  padding: '7px 10px',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid',
  fontSize: 12,
};

const stickyTd: React.CSSProperties = {
  ...td,
  position: 'sticky',
  left: 0,
  zIndex: 1,
  borderRight: '2px solid #e5e7eb',
};
