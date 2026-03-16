interface RoasMatrixProps {
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
      d210: number | null;
      d240: number | null;
      d270: number | null;
      d300: number | null;
      d330: number | null;
      d365: number | null;
      total: number;
    };
    paybackDays: number | null;
    predictedFinalRoas: number | null;
  }>;
}

const AGES = [7, 14, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365];

function getRoasColor(roas: number | null): string {
  if (roas === null) return 'transparent';
  // Color scale: red (<50%) -> yellow (50-100%) -> green (>100%)
  const pct = roas * 100;
  if (pct >= 100) {
    // Green: intensity by how much above 100%
    const t = Math.min((pct - 100) / 100, 1);
    const r = Math.round(209 - t * (209 - 22));
    const g = Math.round(250 - t * (250 - 163));
    const b = Math.round(209 - t * (209 - 74));
    return `rgb(${r}, ${g}, ${b})`;
  } else if (pct >= 50) {
    // Yellow to orange (50-100%)
    const t = (pct - 50) / 50;
    const r = Math.round(253 - t * (253 - 253));
    const g = Math.round(224 - t * (224 - 186));
    const b = Math.round(71 - t * (71 - 5));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red to yellow (0-50%)
    const t = pct / 50;
    const r = 254;
    const gb = Math.round(202 * t);
    return `rgb(${r}, ${gb}, ${gb})`;
  }
}

function getTextColor(roas: number | null): string {
  if (roas === null) return '#9ca3af';
  const pct = roas * 100;
  // Dark text on light backgrounds (yellow zone), light text on dark
  if (pct >= 100) return pct > 150 ? '#065f46' : '#065f46';
  if (pct >= 50) return '#92400e';
  return '#991b1b';
}

export function RoasMatrix({ cohorts }: RoasMatrixProps) {
  if (!cohorts || cohorts.length === 0) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#6b7280', textAlign: 'center', padding: 32 }}>No data available</div>
      </div>
    );
  }

  // Sort cohorts newest first
  const sorted = [...cohorts].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div style={cardStyle}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>
          ROAS Matrix
        </h3>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          ROAS% by cohort age. Green = paid back (100%+). Predicted = extrapolated for cohorts younger than 12 months.
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={stickyTh}>Cohort</th>
              <th style={th}>Spend</th>
              {AGES.map(age => (
                <th key={age} style={th}>D{age}</th>
              ))}
              <th style={{ ...th, background: '#f0fdf4', color: '#065f46' }}>Predicted</th>
              <th style={{ ...th, background: '#fef3c7', color: '#92400e' }}>Payback Days</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(cohort => (
              <tr key={cohort.month}>
                <td style={stickyTd}>{cohort.month}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#6b7280' }}>
                  ${cohort.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                {AGES.map(age => {
                  const key = `d${age}` as keyof typeof cohort.roas;
                  const value = cohort.roas[key] as number | null;
                  const isAvailable = cohort.maxAge >= age;
                  return (
                    <td
                      key={age}
                      style={{
                        ...td,
                        background: isAvailable ? getRoasColor(value) : '#f9fafb',
                        color: isAvailable ? getTextColor(value) : '#d1d5db',
                        textAlign: 'right',
                        fontFamily: 'monospace',
                        fontWeight: value !== null && value >= 1 ? 600 : 400,
                      }}
                    >
                      {isAvailable && value !== null ? `${(value * 100).toFixed(0)}%` : '—'}
                    </td>
                  );
                })}
                <td style={{
                  ...td,
                  background: cohort.predictedFinalRoas !== null ? getRoasColor(cohort.predictedFinalRoas) : '#f9fafb',
                  color: cohort.predictedFinalRoas !== null ? getTextColor(cohort.predictedFinalRoas) : '#d1d5db',
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  borderLeft: '2px solid #e5e7eb',
                }}>
                  {cohort.predictedFinalRoas !== null
                    ? `${(cohort.predictedFinalRoas * 100).toFixed(0)}%`
                    : `${(cohort.roas.total * 100).toFixed(0)}%`}
                </td>
                <td style={{
                  ...td,
                  textAlign: 'right',
                  fontFamily: 'monospace',
                  background: cohort.paybackDays !== null && cohort.paybackDays <= 365 ? '#d1fae5' : cohort.paybackDays !== null ? '#fef3c7' : '#f9fafb',
                  color: cohort.paybackDays !== null && cohort.paybackDays <= 365 ? '#065f46' : cohort.paybackDays !== null ? '#92400e' : '#9ca3af',
                  fontWeight: 500,
                }}>
                  {cohort.paybackDays !== null ? `${cohort.paybackDays}d` : '∞'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
        Color scale: red (&lt;50%) → yellow (50–100%) → green (&gt;100% = paid back)
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 24,
  marginBottom: 24,
  overflowX: 'auto',
};

const th: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'right',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  borderBottom: '2px solid #e5e7eb',
  fontSize: 11,
  color: '#6b7280',
  background: '#f9fafb',
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
  borderBottom: '1px solid #f3f4f6',
  fontSize: 12,
};

const stickyTd: React.CSSProperties = {
  ...td,
  position: 'sticky',
  left: 0,
  background: '#fff',
  zIndex: 1,
  borderRight: '2px solid #e5e7eb',
  fontWeight: 600,
  color: '#111827',
};
