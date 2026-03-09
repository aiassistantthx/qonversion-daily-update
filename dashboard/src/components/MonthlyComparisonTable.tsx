import { Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useSortableData, SortIcon } from './SortableTable';

interface MonthlyComparisonRow {
  month: string;
  monthNum: number;
  revenue2025: number;
  revenue2026: number;
  revenueDiff: number | null;
  spend2025: number;
  spend2026: number;
  spendDiff: number | null;
  subs2025: number;
  subs2026: number;
  subsDiff: number | null;
}

interface MonthlyComparisonTableProps {
  data: {
    monthlyTrend: Array<{
      month: string;
      monthNum: number;
      thisYear: number;
      lastYear: number;
      thisYearSubs: number;
      lastYearSubs: number;
      thisYearSpend: number;
      lastYearSpend: number;
    }>;
    currentYear: number;
    lastYear: number;
  } | undefined;
}

function formatCurrency(val: number | undefined | null): string {
  if (val == null) return '—';
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatDiff(diff: number | null): React.ReactElement {
  if (diff === null) return <span style={{ color: '#9ca3af' }}>—</span>;

  const isPositive = diff > 0;
  const isNeutral = Math.abs(diff) < 1;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const color = isNeutral ? '#9ca3af' : isPositive ? '#10b981' : '#ef4444';

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color, fontSize: 13, fontWeight: 500 }}>
      <Icon size={12} />
      {isPositive ? '+' : ''}{diff.toFixed(1)}%
    </span>
  );
}

function getCellColor(diff: number | null, invertColors = false): string {
  if (diff === null || Math.abs(diff) < 5) return 'transparent';

  const isPositive = diff > 0;
  const threshold = Math.abs(diff);

  let bgColor: string;
  if (invertColors) {
    bgColor = isPositive ? (threshold > 20 ? '#fee2e2' : '#fef3f3') : (threshold > 20 ? '#dcfce7' : '#f0fdf4');
  } else {
    bgColor = isPositive ? (threshold > 20 ? '#dcfce7' : '#f0fdf4') : (threshold > 20 ? '#fee2e2' : '#fef3f3');
  }

  return bgColor;
}

export function MonthlyComparisonTable({ data }: MonthlyComparisonTableProps) {
  const rows: MonthlyComparisonRow[] = (data?.monthlyTrend || []).map(m => {
    const revenueDiff = m.lastYear > 0 ? ((m.thisYear - m.lastYear) / m.lastYear) * 100 : null;
    const subsDiff = m.lastYearSubs > 0 ? ((m.thisYearSubs - m.lastYearSubs) / m.lastYearSubs) * 100 : null;
    const spendDiff = m.lastYearSpend > 0 ? ((m.thisYearSpend - m.lastYearSpend) / m.lastYearSpend) * 100 : null;

    return {
      month: m.month,
      monthNum: m.monthNum,
      revenue2025: m.lastYear,
      revenue2026: m.thisYear,
      revenueDiff,
      spend2025: m.lastYearSpend,
      spend2026: m.thisYearSpend,
      spendDiff,
      subs2025: m.lastYearSubs,
      subs2026: m.thisYearSubs,
      subsDiff,
    };
  }).sort((a, b) => a.monthNum - b.monthNum);

  const { sortedData, sortKey, sortAsc, handleSort } = useSortableData<MonthlyComparisonRow>(
    rows,
    'monthNum' as keyof MonthlyComparisonRow,
    true
  );

  if (!data || !data.monthlyTrend || data.monthlyTrend.length === 0) {
    return (
      <div style={styles.card}>
        <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
          No monthly comparison data available
        </div>
      </div>
    );
  }

  const totals = sortedData.reduce(
    (acc, row) => ({
      revenue2025: acc.revenue2025 + row.revenue2025,
      revenue2026: acc.revenue2026 + row.revenue2026,
      spend2025: acc.spend2025 + row.spend2025,
      spend2026: acc.spend2026 + row.spend2026,
      subs2025: acc.subs2025 + row.subs2025,
      subs2026: acc.subs2026 + row.subs2026,
    }),
    { revenue2025: 0, revenue2026: 0, spend2025: 0, spend2026: 0, subs2025: 0, subs2026: 0 }
  );

  const totalRevenueDiff = totals.revenue2025 > 0 ? ((totals.revenue2026 - totals.revenue2025) / totals.revenue2025) * 100 : null;
  const totalSpendDiff = totals.spend2025 > 0 ? ((totals.spend2026 - totals.spend2025) / totals.spend2025) * 100 : null;
  const totalSubsDiff = totals.subs2025 > 0 ? ((totals.subs2026 - totals.subs2025) / totals.subs2025) * 100 : null;

  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Calendar size={18} style={{ color: '#6b7280' }} />
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>
          Monthly Comparison: {data.lastYear} vs {data.currentYear}
        </h3>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.th, cursor: 'pointer', position: 'sticky', left: 0, background: '#fff', zIndex: 10 }} onClick={() => handleSort('month' as keyof MonthlyComparisonRow)}>
                Month <SortIcon column="month" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th style={{ ...styles.thRight, background: '#f9fafb', borderLeft: '1px solid #e5e7eb' }} colSpan={3}>Revenue</th>
              <th style={{ ...styles.thRight, background: '#fff3e0', borderLeft: '1px solid #e5e7eb' }} colSpan={3}>Spend</th>
              <th style={{ ...styles.thRight, background: '#f0fdf4', borderLeft: '1px solid #e5e7eb' }} colSpan={3}>Subscribers</th>
            </tr>
            <tr>
              <th style={{ ...styles.thSub, position: 'sticky', left: 0, background: '#fff', zIndex: 10 }}></th>
              <th style={{ ...styles.thRightSub, background: '#f9fafb' }}>{data.lastYear}</th>
              <th style={{ ...styles.thRightSub, background: '#f9fafb' }}>{data.currentYear}</th>
              <th style={{ ...styles.thRightSub, background: '#f9fafb' }}>Diff %</th>
              <th style={{ ...styles.thRightSub, background: '#fff3e0' }}>{data.lastYear}</th>
              <th style={{ ...styles.thRightSub, background: '#fff3e0' }}>{data.currentYear}</th>
              <th style={{ ...styles.thRightSub, background: '#fff3e0' }}>Diff %</th>
              <th style={{ ...styles.thRightSub, background: '#f0fdf4' }}>{data.lastYear}</th>
              <th style={{ ...styles.thRightSub, background: '#f0fdf4' }}>{data.currentYear}</th>
              <th style={{ ...styles.thRightSub, background: '#f0fdf4' }}>Diff %</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row) => (
              <tr key={row.month} style={styles.tr}>
                <td style={{ ...styles.td, fontWeight: 500, position: 'sticky', left: 0, background: '#fff', zIndex: 5 }}>
                  {row.month}
                </td>
                <td style={{ ...styles.tdRight, background: '#fafafa' }}>
                  {formatCurrency(row.revenue2025)}
                </td>
                <td style={{ ...styles.tdRight, background: '#fafafa' }}>
                  {formatCurrency(row.revenue2026)}
                </td>
                <td style={{ ...styles.tdRight, background: getCellColor(row.revenueDiff) }}>
                  {formatDiff(row.revenueDiff)}
                </td>
                <td style={{ ...styles.tdRight, background: '#fef9f3' }}>
                  {formatCurrency(row.spend2025)}
                </td>
                <td style={{ ...styles.tdRight, background: '#fef9f3' }}>
                  {formatCurrency(row.spend2026)}
                </td>
                <td style={{ ...styles.tdRight, background: getCellColor(row.spendDiff, true) }}>
                  {formatDiff(row.spendDiff)}
                </td>
                <td style={{ ...styles.tdRight, background: '#fafafa' }}>
                  {row.subs2025?.toLocaleString() ?? '—'}
                </td>
                <td style={{ ...styles.tdRight, background: '#fafafa' }}>
                  {row.subs2026?.toLocaleString() ?? '—'}
                </td>
                <td style={{ ...styles.tdRight, background: getCellColor(row.subsDiff) }}>
                  {formatDiff(row.subsDiff)}
                </td>
              </tr>
            ))}
            <tr style={{ ...styles.tr, borderTop: '2px solid #e5e7eb' }}>
              <td style={{ ...styles.td, fontWeight: 700, position: 'sticky', left: 0, background: '#fff', zIndex: 5 }}>
                Total
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: '#f3f4f6' }}>
                {formatCurrency(totals.revenue2025)}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: '#f3f4f6' }}>
                {formatCurrency(totals.revenue2026)}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: getCellColor(totalRevenueDiff) }}>
                {formatDiff(totalRevenueDiff)}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: '#f3f4f6' }}>
                {formatCurrency(totals.spend2025)}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: '#f3f4f6' }}>
                {formatCurrency(totals.spend2026)}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: getCellColor(totalSpendDiff, true) }}>
                {formatDiff(totalSpendDiff)}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: '#f3f4f6' }}>
                {totals.subs2025?.toLocaleString() ?? '—'}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: '#f3f4f6' }}>
                {totals.subs2026?.toLocaleString() ?? '—'}
              </td>
              <td style={{ ...styles.tdRight, fontWeight: 700, background: getCellColor(totalSubsDiff) }}>
                {formatDiff(totalSubsDiff)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: '1px solid #e5e7eb',
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  },
  th: {
    textAlign: 'left',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  thRight: {
    textAlign: 'center',
    padding: '12px 8px',
    borderBottom: '1px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  thSub: {
    textAlign: 'left',
    padding: '8px 8px',
    borderBottom: '2px solid #e5e7eb',
    color: '#9ca3af',
    fontWeight: 500,
    fontSize: 11,
  },
  thRightSub: {
    textAlign: 'right',
    padding: '8px 8px',
    borderBottom: '2px solid #e5e7eb',
    color: '#6b7280',
    fontWeight: 500,
    fontSize: 11,
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
  },
  td: {
    padding: '12px 8px',
    color: '#111827',
    fontSize: 13,
  },
  tdRight: {
    padding: '12px 8px',
    color: '#111827',
    textAlign: 'right',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
  },
};
