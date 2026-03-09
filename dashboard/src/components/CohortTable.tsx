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
  cop: {
    d0: number | null;
    d3: number | null;
    d7: number | null;
    d14: number | null;
    d30: number | null;
    d60: number | null;
    d90: number | null;
    total: number | null;
  };
  paidUsers: {
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
    cop: {
      d0: number | null;
      d3: number | null;
      d7: number | null;
      d14: number | null;
      d30: number | null;
      d60: number | null;
      d90: number | null;
      total: number | null;
    };
    paidUsers: {
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

// Get color for COP value (inverted heatmap - lower is better)
function getCopColor(cop: number | null, maxCop: number): string {
  if (cop === null || cop <= 0) return '#f3f4f6';

  // Normalize to 0-1 scale based on max
  const normalized = Math.min(cop / Math.max(maxCop, 1), 1);

  // Inverted: lower COP = green, higher COP = red
  if (normalized < 0.33) {
    // Green to yellow (low COP)
    const intensity = normalized / 0.33;
    return `rgb(${16 + (245 - 16) * intensity}, ${185 + (158 - 185) * intensity}, ${129 + (11 - 129) * intensity})`;
  } else if (normalized < 0.67) {
    // Yellow to orange (medium COP)
    const intensity = (normalized - 0.33) / 0.34;
    return `rgb(${245 - (245 - 239) * intensity}, ${158 - (158 - 68) * intensity}, ${11 + (68 - 11) * intensity})`;
  } else {
    // Orange to red (high COP)
    const intensity = (normalized - 0.67) / 0.33;
    return `rgb(239, ${68 + (68 - 68) * intensity}, ${68 + (68 - 68) * intensity})`;
  }
}

// Get text color based on background
function getTextColor(roas: number): string {
  return roas > 0.7 ? '#000' : '#fff';
}

export function CohortTable({ data }: CohortTableProps) {
  const [viewMode, setViewMode] = useState<'roas' | 'revenue' | 'cop'>('roas');

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

  // Find max COP for heatmap scaling
  const maxCop = Math.max(
    ...data.cohorts.flatMap(c => [c.cop.d0, c.cop.d3, c.cop.d7, c.cop.d14, c.cop.d30, c.cop.d60, c.cop.d90, c.cop.total].filter(v => v !== null) as number[]),
    50 // minimum scale
  );

  const handleExport = () => {
    const headers = ['Cohort', 'Age (days)', 'Spend', 'Users', 'D0', 'D3', 'D7', 'D14', 'D30', 'D60', 'D90', 'Total'];
    const rows = data.cohorts.map(c => {
      if (viewMode === 'roas') {
        return [
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
        ];
      } else if (viewMode === 'cop') {
        return [
          c.cohort,
          c.cohortAge,
          c.spend.toFixed(2),
          c.users,
          c.cop.d0 !== null ? '$' + c.cop.d0.toFixed(2) : 'N/A',
          c.cop.d3 !== null ? '$' + c.cop.d3.toFixed(2) : 'N/A',
          c.cop.d7 !== null ? '$' + c.cop.d7.toFixed(2) : 'N/A',
          c.cop.d14 !== null ? '$' + c.cop.d14.toFixed(2) : 'N/A',
          c.cop.d30 !== null ? '$' + c.cop.d30.toFixed(2) : 'N/A',
          c.cop.d60 !== null ? '$' + c.cop.d60.toFixed(2) : 'N/A',
          c.cop.d90 !== null ? '$' + c.cop.d90.toFixed(2) : 'N/A',
          c.cop.total !== null ? '$' + c.cop.total.toFixed(2) : 'N/A',
        ];
      } else {
        return [
          c.cohort,
          c.cohortAge,
          c.spend.toFixed(2),
          c.users,
          '$' + c.revenue.d0.toFixed(0),
          '$' + c.revenue.d3.toFixed(0),
          '$' + c.revenue.d7.toFixed(0),
          '$' + c.revenue.d14.toFixed(0),
          '$' + c.revenue.d30.toFixed(0),
          '$' + c.revenue.d60.toFixed(0),
          '$' + c.revenue.d90.toFixed(0),
          '$' + c.revenue.total.toFixed(0),
        ];
      }
    });
    const filename = viewMode === 'roas' ? 'cohort-roas' : viewMode === 'cop' ? 'cohort-cop' : 'cohort-revenue';
    exportToCSV(filename, headers, rows);
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
            onClick={() => setViewMode('roas')}
            style={{
              padding: '6px 12px',
              background: viewMode === 'roas' ? '#3b82f6' : '#f3f4f6',
              color: viewMode === 'roas' ? '#fff' : '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ROAS
          </button>
          <button
            onClick={() => setViewMode('cop')}
            style={{
              padding: '6px 12px',
              background: viewMode === 'cop' ? '#3b82f6' : '#f3f4f6',
              color: viewMode === 'cop' ? '#fff' : '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            COP
          </button>
          <button
            onClick={() => setViewMode('revenue')}
            style={{
              padding: '6px 12px',
              background: viewMode === 'revenue' ? '#3b82f6' : '#f3f4f6',
              color: viewMode === 'revenue' ? '#fff' : '#374151',
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
            Revenue
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
                  {viewMode === 'revenue' ? (
                    <>
                      <td style={tdRightStyle}>${cohort.revenue.d0.toFixed(0)}</td>
                      <td style={tdRightStyle}>${cohort.revenue.d3.toFixed(0)}</td>
                      <td style={tdRightStyle}>${cohort.revenue.d7.toFixed(0)}</td>
                      <td style={tdRightStyle}>${cohort.revenue.d14.toFixed(0)}</td>
                      <td style={tdRightStyle}>${cohort.revenue.d30.toFixed(0)}</td>
                      <td style={tdRightStyle}>${cohort.revenue.d60.toFixed(0)}</td>
                      <td style={tdRightStyle}>${cohort.revenue.d90.toFixed(0)}</td>
                      <td style={{ ...tdRightStyle, background: '#f0fdf4', fontWeight: 600 }}>
                        ${cohort.revenue.total.toFixed(0)}
                      </td>
                    </>
                  ) : viewMode === 'cop' ? (
                    <>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.d0 !== null ? getCopColor(cohort.cop.d0, maxCop) : '#f3f4f6',
                        color: cohort.cop.d0 !== null && cohort.cop.d0 < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 500,
                      }}>
                        {cohort.cop.d0 !== null ? `$${cohort.cop.d0.toFixed(2)}` : 'N/A'}
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.d3 !== null ? getCopColor(cohort.cop.d3, maxCop) : '#f3f4f6',
                        color: cohort.cop.d3 !== null && cohort.cop.d3 < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 500,
                      }}>
                        {cohort.cop.d3 !== null ? `$${cohort.cop.d3.toFixed(2)}` : 'N/A'}
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.d7 !== null ? getCopColor(cohort.cop.d7, maxCop) : '#f3f4f6',
                        color: cohort.cop.d7 !== null && cohort.cop.d7 < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 500,
                      }}>
                        {cohort.cop.d7 !== null ? `$${cohort.cop.d7.toFixed(2)}` : 'N/A'}
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.d14 !== null ? getCopColor(cohort.cop.d14, maxCop) : '#f3f4f6',
                        color: cohort.cop.d14 !== null && cohort.cop.d14 < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 500,
                      }}>
                        {cohort.cop.d14 !== null ? `$${cohort.cop.d14.toFixed(2)}` : 'N/A'}
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.d30 !== null ? getCopColor(cohort.cop.d30, maxCop) : '#f3f4f6',
                        color: cohort.cop.d30 !== null && cohort.cop.d30 < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 500,
                      }}>
                        {cohort.cop.d30 !== null ? `$${cohort.cop.d30.toFixed(2)}` : 'N/A'}
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.d60 !== null ? getCopColor(cohort.cop.d60, maxCop) : '#f3f4f6',
                        color: cohort.cop.d60 !== null && cohort.cop.d60 < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 500,
                      }}>
                        {cohort.cop.d60 !== null ? `$${cohort.cop.d60.toFixed(2)}` : 'N/A'}
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.d90 !== null ? getCopColor(cohort.cop.d90, maxCop) : '#f3f4f6',
                        color: cohort.cop.d90 !== null && cohort.cop.d90 < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 500,
                      }}>
                        {cohort.cop.d90 !== null ? `$${cohort.cop.d90.toFixed(2)}` : 'N/A'}
                      </td>
                      <td style={{
                        ...tdRightStyle,
                        background: cohort.cop.total !== null ? getCopColor(cohort.cop.total, maxCop) : '#f3f4f6',
                        color: cohort.cop.total !== null && cohort.cop.total < maxCop * 0.5 ? '#000' : '#fff',
                        fontWeight: 600,
                      }}>
                        {cohort.cop.total !== null ? `$${cohort.cop.total.toFixed(2)}` : 'N/A'}
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
              {viewMode === 'revenue' ? (
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
              ) : viewMode === 'cop' ? (
                <>
                  <td style={tdRightStyle}>{data.totals.cop.d0 !== null ? `$${data.totals.cop.d0.toFixed(2)}` : 'N/A'}</td>
                  <td style={tdRightStyle}>{data.totals.cop.d3 !== null ? `$${data.totals.cop.d3.toFixed(2)}` : 'N/A'}</td>
                  <td style={tdRightStyle}>{data.totals.cop.d7 !== null ? `$${data.totals.cop.d7.toFixed(2)}` : 'N/A'}</td>
                  <td style={tdRightStyle}>{data.totals.cop.d14 !== null ? `$${data.totals.cop.d14.toFixed(2)}` : 'N/A'}</td>
                  <td style={tdRightStyle}>{data.totals.cop.d30 !== null ? `$${data.totals.cop.d30.toFixed(2)}` : 'N/A'}</td>
                  <td style={tdRightStyle}>{data.totals.cop.d60 !== null ? `$${data.totals.cop.d60.toFixed(2)}` : 'N/A'}</td>
                  <td style={tdRightStyle}>{data.totals.cop.d90 !== null ? `$${data.totals.cop.d90.toFixed(2)}` : 'N/A'}</td>
                  <td style={{ ...tdRightStyle, background: '#f0fdf4' }}>
                    {data.totals.cop.total !== null ? `$${data.totals.cop.total.toFixed(2)}` : 'N/A'}
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
        Columns show {viewMode === 'roas' ? 'ROAS' : viewMode === 'cop' ? 'COP (Cost of Payment)' : 'Revenue'} at different ages (D0 = day 0, D3 = day 3, etc.).
        {viewMode === 'roas' && (
          <> Colors indicate ROAS: <span style={{ color: '#ef4444', fontWeight: 500 }}>red</span> (low),
          <span style={{ color: '#f59e0b', fontWeight: 500 }}>orange</span> (medium),
          <span style={{ color: '#10b981', fontWeight: 500 }}>green</span> (high).</>
        )}
        {viewMode === 'cop' && (
          <> Colors indicate COP: <span style={{ color: '#10b981', fontWeight: 500 }}>green</span> (low/good),
          <span style={{ color: '#f59e0b', fontWeight: 500 }}>orange</span> (medium),
          <span style={{ color: '#ef4444', fontWeight: 500 }}>red</span> (high/bad).</>
        )}
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
