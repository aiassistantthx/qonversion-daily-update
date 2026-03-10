import { Download } from 'lucide-react';
import type { KeywordPerformance } from '../api';
import { exportToCSV } from '../utils/export';
import { useSortableData, SortIcon } from './SortableTable';

interface KeywordTableProps {
  keywords: KeywordPerformance[];
}

export function KeywordTable({ keywords }: KeywordTableProps) {
  const { sortedData, sortKey, sortAsc, handleSort } = useSortableData<KeywordPerformance>(
    keywords,
    'spend' as keyof KeywordPerformance,
    false
  );

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleExport = () => {
    const headers = ['Keyword', 'Campaign', 'Spend', 'Impressions', 'Taps', 'CTR', 'Installs', 'CPA', 'Conversions', 'Revenue', 'ROAS'];
    const rows = sortedData.map(k => [
      k.keyword,
      k.campaignName,
      k.spend.toFixed(2),
      k.impressions,
      k.taps,
      k.ctr != null ? (k.ctr * 100).toFixed(2) + '%' : '',
      k.installs,
      k.cpa != null ? k.cpa.toFixed(2) : '',
      k.conversions,
      k.revenue.toFixed(2),
      k.roas != null ? k.roas.toFixed(2) : '',
    ]);
    exportToCSV('keywords', headers, rows);
  };

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-terminal-border flex justify-between items-center">
        <div className="text-sm text-terminal-muted">Keywords Performance</div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-2 py-1 text-xs text-terminal-muted hover:text-terminal-text"
          title="Export to CSV"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-terminal-muted border-b border-terminal-border">
              <th
                className="text-left px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('keyword' as keyof KeywordPerformance)}
              >
                Keyword <SortIcon column="keyword" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('spend' as keyof KeywordPerformance)}
              >
                Spend <SortIcon column="spend" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('taps' as keyof KeywordPerformance)}
              >
                Taps <SortIcon column="taps" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('ctr' as keyof KeywordPerformance)}
              >
                CTR <SortIcon column="ctr" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('installs' as keyof KeywordPerformance)}
              >
                Installs <SortIcon column="installs" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('cpa' as keyof KeywordPerformance)}
              >
                CPA <SortIcon column="cpa" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('conversions' as keyof KeywordPerformance)}
              >
                Conv <SortIcon column="conversions" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-2 font-medium cursor-pointer hover:text-terminal-text"
                onClick={() => handleSort('roas' as keyof KeywordPerformance)}
              >
                ROAS <SortIcon column="roas" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((kw) => {
              const isGoodCpa = kw.cpa !== null && kw.cpa < 50;
              const isGoodRoas = kw.roas !== null && kw.roas > 1;

              return (
                <tr
                  key={kw.keywordId}
                  className="border-b border-terminal-border/50 hover:bg-terminal-border/30"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm text-terminal-text">{kw.keyword}</div>
                    <div className="text-xs text-terminal-muted truncate max-w-[150px]">
                      {kw.campaignName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-terminal-text">
                    {formatCurrency(kw.spend)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-terminal-muted">
                    {kw.taps.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-terminal-muted">
                    {kw.ctr !== null ? `${(kw.ctr * 100).toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-terminal-text">
                    {kw.installs}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm ${
                    isGoodCpa ? 'text-terminal-green' : 'text-terminal-red'
                  }`}>
                    {kw.cpa !== null ? formatCurrency(kw.cpa) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-terminal-text">
                    {kw.conversions}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm ${
                    isGoodRoas ? 'text-terminal-green' : 'text-terminal-red'
                  }`}>
                    {kw.roas !== null ? `${kw.roas.toFixed(2)}x` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
