import { Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';
import { useSortableData, SortIcon } from './SortableTable';

export interface RenewalRatesData {
  cohorts: Array<{
    month: string;
    yearlySubscribers: number;
    eligibleForRenewal: number;
    renewed: number;
    renewalRate: number | null;
    cohortAge: number;
    isMatured: boolean;
  }>;
  averageRenewalRate: number | null;
  projectedRenewalRate: number | null;
}

interface RenewalRatesTableProps {
  data: RenewalRatesData | undefined;
}

type CohortType = RenewalRatesData['cohorts'][0];

export function RenewalRatesTable({ data }: RenewalRatesTableProps) {
  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Yearly Renewal Rates</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>API endpoint coming soon</div>
      </div>
    );
  }

  const { sortedData: sortedCohorts, sortKey, sortAsc, handleSort } = useSortableData<CohortType>(
    data.cohorts || [],
    'month' as keyof CohortType,
    false
  );

  const maturedCohorts = sortedCohorts.filter(c => c.isMatured);
  const pendingCohorts = sortedCohorts.filter(c => !c.isMatured);

  const handleExport = () => {
    const headers = ['Cohort', 'Yearly Subs', 'Eligible', 'Renewed', 'Renewal Rate', 'Age (months)', 'Status'];
    const rows = sortedCohorts.map(c => [
      c.month,
      c.yearlySubscribers,
      c.isMatured ? c.eligibleForRenewal : '',
      c.isMatured ? c.renewed : '',
      c.renewalRate != null ? (c.renewalRate * 100).toFixed(1) + '%' : '',
      c.cohortAge,
      c.isMatured ? 'Mature' : 'Pending',
    ]);
    exportToCSV('yearly-renewal-rates', headers, rows);
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Yearly Subscription Renewal Rates
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Renewal rates by yearly subscription cohort. Shows what % of subscribers renew after 12 months.
          </p>
        </div>
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

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#ecfdf5', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>Average Renewal Rate</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#047857' }}>
            {data.averageRenewalRate ? `${(data.averageRenewalRate * 100).toFixed(0)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Based on matured cohorts</div>
        </div>
        <div style={{ background: '#fef3c7', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>Projected Renewal Rate</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#d97706' }}>
            {data.projectedRenewalRate ? `${(data.projectedRenewalRate * 100).toFixed(0)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Including pending cohorts</div>
        </div>
      </div>

      {/* Cohorts table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th
                style={{ ...thStyle, cursor: 'pointer' }}
                onClick={() => handleSort('month' as keyof CohortType)}
              >
                Cohort <SortIcon column="month" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                style={{ ...thRightStyle, cursor: 'pointer' }}
                onClick={() => handleSort('yearlySubscribers' as keyof CohortType)}
              >
                Yearly Subs <SortIcon column="yearlySubscribers" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                style={{ ...thRightStyle, cursor: 'pointer' }}
                onClick={() => handleSort('eligibleForRenewal' as keyof CohortType)}
              >
                Eligible <SortIcon column="eligibleForRenewal" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                style={{ ...thRightStyle, cursor: 'pointer' }}
                onClick={() => handleSort('renewed' as keyof CohortType)}
              >
                Renewed <SortIcon column="renewed" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                style={{ ...thRightStyle, cursor: 'pointer' }}
                onClick={() => handleSort('renewalRate' as keyof CohortType)}
              >
                Rate <SortIcon column="renewalRate" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                style={{ ...thRightStyle, cursor: 'pointer' }}
                onClick={() => handleSort('cohortAge' as keyof CohortType)}
              >
                Age <SortIcon column="cohortAge" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {/* Matured cohorts */}
            {maturedCohorts.map(cohort => (
              <tr key={cohort.month} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={tdStyle}>{cohort.month}</td>
                <td style={tdRightStyle}>{cohort.yearlySubscribers}</td>
                <td style={tdRightStyle}>{cohort.eligibleForRenewal}</td>
                <td style={tdRightStyle}>{cohort.renewed}</td>
                <td style={{
                  ...tdRightStyle,
                  fontWeight: 600,
                  color: getRateColor(cohort.renewalRate)
                }}>
                  {cohort.renewalRate ? `${(cohort.renewalRate * 100).toFixed(0)}%` : '—'}
                </td>
                <td style={tdRightStyle}>{cohort.cohortAge}mo</td>
                <td style={{ ...tdStyle, color: '#10b981' }}>
                  ✓ Mature
                </td>
              </tr>
            ))}

            {/* Pending cohorts */}
            {pendingCohorts.map(cohort => (
              <tr key={cohort.month} style={{ borderBottom: '1px solid #f3f4f6', background: '#fafafa' }}>
                <td style={tdStyle}>{cohort.month}</td>
                <td style={tdRightStyle}>{cohort.yearlySubscribers}</td>
                <td style={{ ...tdRightStyle, color: '#9ca3af' }}>—</td>
                <td style={{ ...tdRightStyle, color: '#9ca3af' }}>—</td>
                <td style={{ ...tdRightStyle, color: '#9ca3af' }}>—</td>
                <td style={tdRightStyle}>{cohort.cohortAge}mo</td>
                <td style={{ ...tdStyle, color: '#f59e0b' }}>
                  ⏳ Pending ({12 - cohort.cohortAge}mo)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Insights */}
      <div style={{ marginTop: 24, padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 8 }}>
          Insights
        </div>
        <ul style={{ fontSize: 12, color: '#6b7280', margin: 0, paddingLeft: 20 }}>
          <li style={{ marginBottom: 4 }}>
            {maturedCohorts.length} cohort{maturedCohorts.length !== 1 ? 's' : ''} have matured (12+ months old)
          </li>
          <li style={{ marginBottom: 4 }}>
            {pendingCohorts.length} cohort{pendingCohorts.length !== 1 ? 's' : ''} are pending renewal
          </li>
          {data.averageRenewalRate && (
            <li>
              At {(data.averageRenewalRate * 100).toFixed(0)}% renewal rate, expect ~
              {Math.round(pendingCohorts.reduce((sum, c) => sum + c.yearlySubscribers, 0) * data.averageRenewalRate)} renewals from pending cohorts
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function getRateColor(rate: number | null): string {
  if (rate == null) return '#9ca3af';
  const pct = rate * 100;
  if (pct >= 40) return '#10b981';
  if (pct >= 30) return '#f59e0b';
  return '#ef4444';
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
  fontWeight: 500,
  fontSize: 12,
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
