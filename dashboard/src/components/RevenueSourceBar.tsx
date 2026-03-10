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
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="text-sm font-medium text-gray-900 mb-4">Revenue by Source</div>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <div className="text-xs text-gray-500 mb-1">Organic</div>
          <div className="text-2xl font-mono font-semibold text-emerald-600">
            {organicPercent.toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500 font-mono">
            {formatCurrency(organic)}
          </div>
        </div>
        <div className="flex-1 text-right">
          <div className="text-xs text-gray-500 mb-1">Paid</div>
          <div className="text-2xl font-mono font-semibold text-blue-600">
            {paidPercent.toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500 font-mono">
            {formatCurrency(paid)}
          </div>
        </div>
      </div>

      <div className="h-3 flex rounded-full overflow-hidden bg-gray-100">
        <div
          className="bg-emerald-500 transition-all"
          style={{ width: `${organicPercent}%` }}
        />
        <div
          className="bg-blue-500 transition-all"
          style={{ width: `${paidPercent}%` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          Organic
        </span>
        <span className="flex items-center gap-1">
          Paid
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        </span>
      </div>
    </div>
  );
}
