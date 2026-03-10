interface CopWaterfallProps {
  data: {
    d1: number | null;
    d4: number | null;
    d7: number | null;
    d14: number | null;
    d30: number | null;
  };
  targetCop?: number;
}

export function CopWaterfall({ data, targetCop = 50 }: CopWaterfallProps) {
  const windows = [
    { key: 'd1', label: 'd1', value: data.d1 },
    { key: 'd4', label: 'd4', value: data.d4 },
    { key: 'd7', label: 'd7', value: data.d7 },
    { key: 'd14', label: 'd14', value: data.d14 },
    { key: 'd30', label: 'd30', value: data.d30 },
  ];

  const maxValue = Math.max(
    ...windows.map(w => w.value || 0),
    targetCop
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="text-sm font-medium text-gray-900 mb-4">COP by Window</div>

      <div className="space-y-3">
        {windows.map(({ key, label, value }) => {
          const width = value ? (value / maxValue) * 100 : 0;
          const isAboveTarget = value && value > targetCop;

          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-8 text-sm font-mono text-gray-500">{label}</div>
              <div className="flex-1 h-6 bg-gray-100 rounded relative">
                {/* Target line */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-amber-400"
                  style={{ left: `${(targetCop / maxValue) * 100}%` }}
                />
                {/* Bar */}
                <div
                  className={`h-full rounded transition-all ${
                    isAboveTarget ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className={`w-16 text-right font-mono text-sm font-medium ${
                isAboveTarget ? 'text-red-600' : 'text-gray-900'
              }`}>
                {value !== null ? `$${value.toFixed(0)}` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
        <div className="w-3 h-0.5 bg-amber-400" />
        <span>Target: ${targetCop}</span>
      </div>
    </div>
  );
}
