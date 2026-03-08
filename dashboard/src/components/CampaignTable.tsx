import { TrendingUp, TrendingDown } from 'lucide-react';
import type { CampaignCop } from '../api';

interface CampaignTableProps {
  campaigns: CampaignCop[];
}

export function CampaignTable({ campaigns }: CampaignTableProps) {
  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);

  const formatCurrency = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-terminal-border">
        <div className="text-sm text-terminal-muted">COP by Campaign</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-terminal-muted border-b border-terminal-border">
              <th className="text-left px-4 py-2 font-medium">Campaign</th>
              <th className="text-right px-4 py-2 font-medium">COP</th>
              <th className="text-right px-4 py-2 font-medium">Spend</th>
              <th className="text-right px-4 py-2 font-medium">Share</th>
              <th className="text-right px-4 py-2 font-medium">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const sharePercent = totalSpend > 0 ? (campaign.spend / totalSpend) * 100 : 0;
              const isGoodCop = campaign.cop !== null && campaign.cop < 50;
              const isGoodRoas = campaign.roas !== null && campaign.roas > 1;

              return (
                <tr
                  key={campaign.campaignId}
                  className="border-b border-terminal-border/50 hover:bg-terminal-border/30"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm text-terminal-text truncate max-w-[200px]">
                      {campaign.campaignName || `Campaign ${campaign.campaignId}`}
                    </div>
                    <div className="text-xs text-terminal-muted">
                      {campaign.payers} payers / {campaign.installs} installs
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className={`font-mono text-sm flex items-center justify-end gap-1 ${
                      isGoodCop ? 'text-terminal-green' : 'text-terminal-red'
                    }`}>
                      {isGoodCop ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                      {campaign.cop !== null ? formatCurrency(campaign.cop) : '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-terminal-text">
                    {formatCurrency(campaign.spend)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-terminal-border rounded overflow-hidden">
                        <div
                          className="h-full bg-terminal-cyan"
                          style={{ width: `${sharePercent}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-terminal-muted w-10">
                        {sharePercent.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-sm ${
                    isGoodRoas ? 'text-terminal-green' : 'text-terminal-red'
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
