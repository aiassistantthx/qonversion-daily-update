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
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <div className="text-sm text-terminal-muted mb-4">COP by Window</div>

      <div className="space-y-3">
        {windows.map(({ key, label, value }) => {
          const width = value ? (value / maxValue) * 100 : 0;
          const isAboveTarget = value && value > targetCop;

          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-8 text-sm font-mono text-terminal-muted">{label}</div>
              <div className="flex-1 h-6 bg-terminal-border rounded relative">
                {/* Target line */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-terminal-yellow opacity-50"
                  style={{ left: `${(targetCop / maxValue) * 100}%` }}
                />
                {/* Bar */}
                <div
                  className={`h-full rounded transition-all ${
                    isAboveTarget ? 'bg-terminal-red' : 'bg-terminal-cyan'
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <div className={`w-16 text-right font-mono text-sm ${
                isAboveTarget ? 'text-terminal-red' : 'text-terminal-text'
              }`}>
                {value !== null ? `$${value.toFixed(0)}` : '—'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-terminal-muted">
        <div className="w-3 h-px bg-terminal-yellow" />
        <span>Target: ${targetCop}</span>
      </div>
    </div>
  );
}
