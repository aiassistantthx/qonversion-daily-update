import { TrendingUp, TrendingDown, Download } from 'lucide-react';
import type { CampaignCop } from '../api';
import { exportToCSV } from '../utils/export';
import { useSortableData, SortIcon } from './SortableTable';

interface CampaignTableProps {
  campaigns: CampaignCop[];
}

export function CampaignTable({ campaigns }: CampaignTableProps) {
  const { sortedData, sortKey, sortAsc, handleSort } = useSortableData<CampaignCop>(
    campaigns,
    'spend' as keyof CampaignCop,
    false
  );
  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleExport = () => {
    const headers = ['Campaign', 'Campaign ID', 'COP', 'Spend', 'Share %', 'ROAS', 'Payers', 'Installs'];
    const rows = sortedData.map(c => {
      const sharePercent = totalSpend > 0 ? (c.spend / totalSpend) * 100 : 0;
      return [
        c.campaignName || `Campaign ${c.campaignId}`,
        c.campaignId,
        c.cop != null ? c.cop.toFixed(2) : '',
        c.spend.toFixed(2),
        sharePercent.toFixed(1) + '%',
        c.roas != null ? c.roas.toFixed(2) : '',
        c.payers,
        c.installs,
      ];
    });
    exportToCSV('campaign-cop', headers, rows);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <div className="text-sm font-medium text-gray-900">COP by Campaign</div>
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
                onClick={() => handleSort('campaignName' as keyof CampaignCop)}
              >
                Campaign <SortIcon column="campaignName" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('cop' as keyof CampaignCop)}
              >
                COP <SortIcon column="cop" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('spend' as keyof CampaignCop)}
              >
                Spend <SortIcon column="spend" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
              <th className="text-right px-4 py-3 font-medium">Share</th>
              <th
                className="text-right px-4 py-3 font-medium cursor-pointer hover:text-gray-900"
                onClick={() => handleSort('roas' as keyof CampaignCop)}
              >
                ROAS <SortIcon column="roas" currentColumn={sortKey as string} ascending={sortAsc} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((campaign) => {
              const sharePercent = totalSpend > 0 ? (campaign.spend / totalSpend) * 100 : 0;
              const isGoodCop = campaign.cop !== null && campaign.cop < 50;
              const isGoodRoas = campaign.roas !== null && campaign.roas > 1;

              return (
                <tr
                  key={campaign.campaignId}
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                      {campaign.campaignName || `Campaign ${campaign.campaignId}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {campaign.payers} payers / {campaign.installs} installs
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={`font-mono text-sm font-medium flex items-center justify-end gap-1 ${
                      isGoodCop ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {isGoodCop ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {campaign.cop !== null ? formatCurrency(campaign.cop) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-900">
                    {formatCurrency(campaign.spend)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${sharePercent}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-gray-500 w-10">
                        {sharePercent.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-medium ${
                    isGoodRoas ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {campaign.roas !== null ? `${campaign.roas.toFixed(2)}x` : '—'}
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
