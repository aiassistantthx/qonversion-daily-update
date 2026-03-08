interface RevenueSourceBarProps {
  organic: number;
  paid: number;
  organicPercent: number;
  paidPercent: number;
}

export function RevenueSourceBar({
  organic,
  paid,
  organicPercent,
  paidPercent
}: RevenueSourceBarProps) {
  const formatCurrency = (val: number) =>
    `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <div className="text-sm text-terminal-muted mb-4">Revenue by Source</div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="text-xs text-terminal-muted mb-1">Organic</div>
          <div className="text-xl font-mono text-terminal-green">
            {organicPercent.toFixed(0)}%
          </div>
          <div className="text-sm text-terminal-muted font-mono">
            {formatCurrency(organic)}
          </div>
        </div>
        <div className="flex-1 text-right">
          <div className="text-xs text-terminal-muted mb-1">Paid</div>
          <div className="text-xl font-mono text-terminal-purple">
            {paidPercent.toFixed(0)}%
          </div>
          <div className="text-sm text-terminal-muted font-mono">
            {formatCurrency(paid)}
          </div>
        </div>
      </div>

      <div className="h-4 flex rounded overflow-hidden">
        <div
          className="bg-terminal-green transition-all"
          style={{ width: `${organicPercent}%` }}
        />
        <div
          className="bg-terminal-purple transition-all"
          style={{ width: `${paidPercent}%` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-xs text-terminal-muted">
        <span>Organic</span>
        <span>Paid</span>
      </div>
    </div>
  );
}
