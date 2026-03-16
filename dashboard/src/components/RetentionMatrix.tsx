import { useState } from 'react';
import { useTheme, themes } from '../styles/themes';

export interface RetentionPeriod {
  period: number;
  activeSubs: number | null;
  yearlySubs: number | null;
  weeklySubs: number | null;
  retention: number | null;
  yearlyRetention: number | null;
  weeklyRetention: number | null;
}

export interface RetentionRow {
  cohortMonth: string;
  cohortSize: number;
  yearlyCohortSize: number;
  weeklyCohortSize: number;
  periods: RetentionPeriod[];
}

export interface RetentionMatrixData {
  rows: RetentionRow[];
  maxPeriod: number;
  averageCurve: Array<{
    period: number;
    retention: number | null;
    yearlyRetention: number | null;
    weeklyRetention: number | null;
  }>;
}

interface RetentionMatrixProps {
  data: RetentionMatrixData | undefined;
  isLoading: boolean;
}

type PlanFilter = 'all' | 'yearly' | 'weekly';

function getRetentionColor(value: number | null): string {
  if (value === null) return 'transparent';
  // Red (0%) → Yellow (50%) → Green (100%)
  if (value >= 100) return 'rgb(16, 185, 129)';
  if (value >= 60) {
    const t = (value - 60) / 40;
    const r = Math.round(234 - t * (234 - 16));
    const g = Math.round(179 + t * (185 - 179));
    const b = Math.round(8 + t * (129 - 8));
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (value >= 20) {
    const t = (value - 20) / 40;
    const r = Math.round(239 - t * (239 - 234));
    const g = Math.round(68 + t * (179 - 68));
    const b = Math.round(68 - t * (68 - 8));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = value / 20;
  return `rgb(${Math.round(239 - t * 20)}, ${Math.round(68)}, ${Math.round(68)})`;
}

export function RetentionMatrix({ data, isLoading }: RetentionMatrixProps) {
  const { theme } = useTheme();
  const t = themes[theme];
  const [plan, setPlan] = useState<PlanFilter>('all');

  if (isLoading) {
    return (
      <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
        <div style={{ color: t.textMuted, textAlign: 'center', padding: 32 }}>Loading retention matrix...</div>
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

  const getRetention = (p: RetentionPeriod): number | null => {
    if (plan === 'yearly') return p.yearlyRetention;
    if (plan === 'weekly') return p.weeklyRetention;
    return p.retention;
  };

  const getCohortSize = (row: RetentionRow): number => {
    if (plan === 'yearly') return row.yearlyCohortSize;
    if (plan === 'weekly') return row.weeklyCohortSize;
    return row.cohortSize;
  };

  return (
    <div style={{ ...cardStyle, background: t.cardBg, borderColor: t.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: t.text, margin: 0 }}>Retention Heatmap</h3>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'yearly', 'weekly'] as PlanFilter[]).map(opt => (
            <button
              key={opt}
              onClick={() => setPlan(opt)}
              style={{
                padding: '5px 10px',
                fontSize: 12,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                background: plan === opt ? t.accent : t.bg,
                color: plan === opt ? '#fff' : t.textMuted,
                fontWeight: plan === opt ? 600 : 400,
                textTransform: 'capitalize',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>
        Retention % relative to initial subscribers (M0). Heatmap: red = low, green = high.
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...stickyTh, background: t.cardBg, color: t.textMuted, borderColor: t.border }}>Cohort</th>
              <th style={{ ...th, color: t.textMuted, borderColor: t.border }}>Size</th>
              {periods.map(p => (
                <th key={p} style={{ ...th, color: t.textMuted, borderColor: t.border }}>M{p}</th>
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
                  {getCohortSize(row)}
                </td>
                {periods.map(p => {
                  const cell = row.periods[p];
                  const value = cell ? getRetention(cell) : null;
                  const bg = getRetentionColor(value);
                  const isDark = value !== null && value >= 40;
                  return (
                    <td
                      key={p}
                      style={{
                        ...td,
                        background: bg,
                        color: value === null ? t.textMuted : isDark ? '#fff' : '#111',
                        borderColor: t.border,
                        textAlign: 'right',
                        fontFamily: "'JetBrains Mono', monospace",
                        opacity: value === null ? 0.3 : 1,
                      }}
                    >
                      {value !== null ? `${value.toFixed(0)}%` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: t.textMuted }}>
        Plan split: yearly ≥ $20 first purchase, weekly &lt; $20. M0 = install month.
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
