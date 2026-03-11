import { useState } from 'react';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeywordPerformance } from '../api';
import { exportToCSV } from '../utils/export';
import { useSortableData, SortIcon } from './SortableTable';

interface KeywordTotals {
  spend: number;
  installs: number;
  trials: number;
  conversions: number;
  revenue: number;
  keywordsWithAttribution: number;
  keywordsTotal: number;
  cop: number | null;
  roas: number | null;
  attributionRate: string;
}

interface KeywordTableProps {
  keywords: KeywordPerformance[];
  totals?: KeywordTotals;
}

const ITEMS_PER_PAGE = 20;

export function KeywordTable({ keywords, totals }: KeywordTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const { sortedData, sortKey, sortAsc, handleSort } = useSortableData<KeywordPerformance>(
    keywords,
    'spend' as keyof KeywordPerformance,
    false
  );

  // Pagination
  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = sortedData.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const formatCurrency = (val: number | undefined | null) =>
    val != null ? `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-';

  const handleExport = () => {
    const headers = ['Keyword', 'Campaign', 'Spend', 'Impressions', 'Taps', 'CTR', 'Installs', 'CPA', 'Conversions', 'Revenue', 'ROAS'];
    const rows = sortedData.map(k => [
      k.keyword,
      k.campaign,
      k.spend?.toFixed(2) ?? '',
      k.impressions,
      k.taps,
      k.ctr != null ? (k.ctr * 100).toFixed(2) + '%' : '',
      k.installs,
      k.cpa != null ? k.cpa.toFixed(2) : '',
      k.conversions,
      k.revenue?.toFixed(2) ?? '',
      k.roas != null ? k.roas.toFixed(2) : '',
    ]);
    exportToCSV('keywords', headers, rows);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <div>
          <div className="text-sm font-medium text-gray-900">Keywords Performance</div>
          <div className="text-xs text-gray-500">
            {sortedData.length} keywords
            {totals && (
              <span className="ml-2">
                • {totals.keywordsWithAttribution} with attribution ({totals.attributionRate}%)
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          title="Export to CSV"
        >
          <Download size={14} />
          Export
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('keyword' as keyof KeywordPerformance)}
              >
                Keyword <SortIcon column="keyword" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-left px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('campaign' as keyof KeywordPerformance)}
              >
                Campaign <SortIcon column="campaign" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('spend' as keyof KeywordPerformance)}
              >
                Spend <SortIcon column="spend" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('taps' as keyof KeywordPerformance)}
              >
                Taps <SortIcon column="taps" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('ctr' as keyof KeywordPerformance)}
              >
                CTR <SortIcon column="ctr" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('installs' as keyof KeywordPerformance)}
              >
                Installs <SortIcon column="installs" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('cpa' as keyof KeywordPerformance)}
              >
                CPA <SortIcon column="cpa" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('conversions' as keyof KeywordPerformance)}
              >
                Conv <SortIcon column="conversions" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('roas' as keyof KeywordPerformance)}
              >
                ROAS <SortIcon column="roas" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((kw) => {
              const isGoodCpa = kw.cpa !== null && kw.cpa < 50;
              const isGoodRoas = kw.roas !== null && kw.roas > 1;
              const hasData = kw.hasAttribution;

              return (
                <tr
                  key={kw.keywordId}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-60' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-gray-900">{kw.keyword}</div>
                      {!hasData && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500" title="No attribution data for this keyword">
                          No data
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                      {kw.campaign || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-900">
                    {formatCurrency(kw.spend)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-500">
                    {kw.taps?.toLocaleString() ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-500">
                    {kw.ctr !== null ? `${(kw.ctr * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-900">
                    {kw.installs?.toLocaleString() ?? '-'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-medium ${
                    hasData ? (isGoodCpa ? 'text-green-600' : 'text-red-600') : 'text-gray-400'
                  }`}>
                    {kw.cpa !== null ? formatCurrency(kw.cpa) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-900">
                    {hasData ? (kw.conversions?.toLocaleString() ?? '-') : '—'}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-medium ${
                    hasData ? (isGoodRoas ? 'text-green-600' : 'text-red-600') : 'text-gray-400'
                  }`}>
                    {hasData && kw.roas !== null ? `${kw.roas.toFixed(2)}x` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="text-sm text-gray-500">
            Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, sortedData.length)} of {sortedData.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
