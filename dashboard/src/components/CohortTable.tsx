import { useState } from 'react';
import { Calendar, Download, TrendingUp } from 'lucide-react';
import { exportToCSV } from '../utils/export';

export interface CohortData {
  cohort: string;
  cohortStart: string;
  cohortAge: number;
  spend: number;
  users: number;
  roas: {
    d0: number;
    d3: number;
    d7: number;
    d14: number;
    d30: number;
    d60: number;
    d90: number;
    total: number;
  };
  revenue: {
    d0: number;
    d3: number;
    d7: number;
    d14: number;
    d30: number;
    d60: number;
    d90: number;
    total: number;
  };
}

export interface CohortsData {
  period: string;
  total: number;
  cohorts: CohortData[];
  totals: {
    spend: number;
    users: number;
    roas: {
      d0: number;
      d3: number;
      d7: number;
      d14: number;
      d30: number;
      d60: number;
      d90: number;
      total: number;
    };
    revenue: {
      d0: number;
      d3: number;
      d7: number;
      d14: number;
      d30: number;
      d60: number;
      d90: number;
      total: number;
    };
  };
}

interface CohortTableProps {
  data: CohortsData | undefined;
}

// Get color for ROAS value (heatmap)
function getRoasColor(roas: number, maxRoas: number): string {
  if (roas <= 0) return '#f3f4f6';

  // Normalize to 0-1 scale based on max
  const normalized = Math.min(roas / Math.max(maxRoas, 1), 1);

  if (roas < 0.5) {
    // Red to orange (0-50% ROAS)
    const intensity = Math.floor(normalized * 2 * 255);
    return `rgb(239, ${68 + intensity}, 68)`;
  } else if (roas < 1.0) {
    // Orange to yellow (50-100% ROAS)
    const intensity = Math.floor((normalized - 0.5) * 2 * 255);
    return `rgb(${245 - intensity}, ${158 + intensity}, 11)`;
  } else {
    // Yellow to green (100%+ ROAS)
    const intensity = Math.floor(Math.min((roas - 1) / 1, 1) * 255);
    return `rgb(${16 + (239 - 16) * (1 - intensity/255)}, ${185 + (158 - 185) * (1 - intensity/255)}, ${129 + (11 - 129) * (1 - intensity/255)})`;
  }
}

// Get text color based on background
function getTextColor(roas: number): string {
  return roas > 0.7 ? '#000' : '#fff';
}

export function CohortTable({ data }: CohortTableProps) {
  const [showRevenue, setShowRevenue] = useState(false);

  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Cohort ROAS Analysis</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>Loading...</div>
      </div>
    );
  }

  // Find max ROAS for heatmap scaling
  const maxRoas = Math.max(
    ...data.cohorts.flatMap(c => [c.roas.d0, c.roas.d3, c.roas.d7, c.roas.d14, c.roas.d30, c.roas.d60, c.roas.d90, c.roas.total]),
    2 // minimum scale
  );

  const handleExport = () => {
    const headers = ['Cohort', 'Age (days)', 'Spend', 'Users', 'D0', 'D3', 'D7', 'D14', 'D30', 'D60', 'D90', 'Total'];
    const rows = data.cohorts.map(c => [
      c.cohort,
      c.cohortAge,
      c.spend.toFixed(2),
      c.users,
      (c.roas.d0 * 100).toFixed(1) + '%',
      (c.roas.d3 * 100).toFixed(1) + '%',
      (c.roas.d7 * 100).toFixed(1) + '%',
      (c.roas.d14 * 100).toFixed(1) + '%',
      (c.roas.d30 * 100).toFixed(1) + '%',
      (c.roas.d60 * 100).toFixed(1) + '%',
      (c.roas.d90 * 100).toFixed(1) + '%',
      (c.roas.total * 100).toFixed(1) + '%',
    ]);
    exportToCSV('cohort-roas', headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            <Calendar size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Cohort ROAS Analysis
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            ROAS by cohort age. Grouped by {data.period}. Showing {data.total} cohorts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowRevenue(!showRevenue)}
            style={{
              padding: '6px 12px',
              background: showRevenue ? '#3b82f6' : '#f3f4f6',
              color: showRevenue ? '#fff' : '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <TrendingUp size={14} />
            {showRevenue ? 'Show ROAS' : 'Show Revenue'}
          </button>
          <button
            onClick={handleExport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 12px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            title="Export to CSV"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Cohort</th>
              <th style={thRightStyle}>Age</th>
              <th style={thRightStyle}>Spend</th>
              <th style={thRightStyle}>Users</th>
              <th style={thRightStyle}>D0</th>
              <th style={thRightStyle}>D3</th>
              <th style={thRightStyle}>D7</th>
              <th style={thRightStyle}>D14</th>
              <th style={thRightStyle}>D30</th>
              <th style={thRightStyle}>D60</th>
              <th style={thRightStyle}>D90</th>
              <th style={{ ...thRightStyle, background: '#f0fdf4', fontWeight: 600 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((cohort) => {
              const values = showRevenue ? cohort.revenue : cohort.roas;
              return (
                <tr key={cohort.cohort} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{cohort.cohort}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{cohort.cohortAge}d old</div>
                  </td>
                  <td style={tdRightStyle}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      background: cohort.cohortAge < 30 ? '#fef3c7' : cohort.cohortAge < 60 ? '#dbeafe' : '#ecfdf5',
                      color: cohort.cohortAge < 30 ? '#92400e' : cohort.cohortAge < 60 ? '#1e40af' : '#065f46',
                    }}>
                      {cohort.cohortAge}d
                    </span>
                  </td>
                  <td style={tdRightStyle}>${cohort.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td style={tdRightStyle}>{cohort.users}</td>
                  {showRevenue ? (
                    <>
                      <td style={tdRightStyle}>${values.d0.toFixed(0)}</td>
                      <td style={tdRightStyle}>${values.d3.toFixed(0)}</td>
                      <td style={tdRightStyle}>${values.d7.toFixed(0)}</td>
                      <td style={tdRightStyle}>${values.d14.toFixed(0)}</td>
                      <td style={tdRightStyle}>${values.d30.toFixed(0)}</td>
                      <td style={tdRightStyle}>${values.d60.toFixed(0)}</td>
                      <td style={tdRightStyle}>${values.d90.toFixed(0)}</td>
                      <td style={{ ...tdRightStyle, background: '#f0fdf4', fontWeight: 600 }}>
                        ${values.total.toFixed(0)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.d0, maxRoas),
                        color: getTextColor(cohort.roas.d0),
                        fontWeight: 500,
                      }}>
                        {(cohort.roas.d0 * 100).toFixed(0)}%
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.d3, maxRoas),
                        color: getTextColor(cohort.roas.d3),
                        fontWeight: 500,
                      }}>
                        {(cohort.roas.d3 * 100).toFixed(0)}%
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.d7, maxRoas),
                        color: getTextColor(cohort.roas.d7),
                        fontWeight: 500,
                      }}>
                        {(cohort.roas.d7 * 100).toFixed(0)}%
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.d14, maxRoas),
                        color: getTextColor(cohort.roas.d14),
                        fontWeight: 500,
                      }}>
                        {(cohort.roas.d14 * 100).toFixed(0)}%
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.d30, maxRoas),
                        color: getTextColor(cohort.roas.d30),
                        fontWeight: 500,
                      }}>
                        {(cohort.roas.d30 * 100).toFixed(0)}%
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.d60, maxRoas),
                        color: getTextColor(cohort.roas.d60),
                        fontWeight: 500,
                      }}>
                        {(cohort.roas.d60 * 100).toFixed(0)}%
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.d90, maxRoas),
                        color: getTextColor(cohort.roas.d90),
                        fontWeight: 500,
                      }}>
                        {(cohort.roas.d90 * 100).toFixed(0)}%
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: getRoasColor(cohort.roas.total, maxRoas),
                        color: getTextColor(cohort.roas.total),
                        fontWeight: 600,
                      }}>
                        {(cohort.roas.total * 100).toFixed(0)}%
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f9fafb', fontWeight: 600, borderTop: '2px solid #e5e7eb' }}>
              <td style={tdStyle}>Average</td>
              <td style={tdRightStyle}></td>
              <td style={tdRightStyle}>${data.totals.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
              <td style={tdRightStyle}>{data.totals.users}</td>
              {showRevenue ? (
                <>
                  <td style={tdRightStyle}>${data.totals.revenue.d0.toFixed(0)}</td>
                  <td style={tdRightStyle}>${data.totals.revenue.d3.toFixed(0)}</td>
                  <td style={tdRightStyle}>${data.totals.revenue.d7.toFixed(0)}</td>
                  <td style={tdRightStyle}>${data.totals.revenue.d14.toFixed(0)}</td>
                  <td style={tdRightStyle}>${data.totals.revenue.d30.toFixed(0)}</td>
                  <td style={tdRightStyle}>${data.totals.revenue.d60.toFixed(0)}</td>
                  <td style={tdRightStyle}>${data.totals.revenue.d90.toFixed(0)}</td>
                  <td style={{ ...tdRightStyle, background: '#f0fdf4' }}>
                    ${data.totals.revenue.total.toFixed(0)}
                  </td>
                </>
              ) : (
                <>
                  <td style={tdRightStyle}>{(data.totals.roas.d0 * 100).toFixed(0)}%</td>
                  <td style={tdRightStyle}>{(data.totals.roas.d3 * 100).toFixed(0)}%</td>
                  <td style={tdRightStyle}>{(data.totals.roas.d7 * 100).toFixed(0)}%</td>
                  <td style={tdRightStyle}>{(data.totals.roas.d14 * 100).toFixed(0)}%</td>
                  <td style={tdRightStyle}>{(data.totals.roas.d30 * 100).toFixed(0)}%</td>
                  <td style={tdRightStyle}>{(data.totals.roas.d60 * 100).toFixed(0)}%</td>
                  <td style={tdRightStyle}>{(data.totals.roas.d90 * 100).toFixed(0)}%</td>
                  <td style={{ ...tdRightStyle, background: '#f0fdf4' }}>
                    {(data.totals.roas.total * 100).toFixed(0)}%
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
        <strong>How to read:</strong> Each row is a cohort (users who installed in that {data.period}).
        Columns show ROAS at different ages (D0 = day 0, D3 = day 3, etc.).
        Colors indicate performance: <span style={{ color: '#ef4444', fontWeight: 500 }}>red</span> (low),
        <span style={{ color: '#f59e0b', fontWeight: 500 }}>orange</span> (medium),
        <span style={{ color: '#10b981', fontWeight: 500 }}>green</span> (high).
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
  fontWeight: 500,
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const thRightStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: 'right',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  color: '#111827',
};

const tdRightStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontFamily: "'JetBrains Mono', monospace",
};
