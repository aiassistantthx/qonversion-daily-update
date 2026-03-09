interface PaybackGaugeProps {
  currentPercent: number;
  breakEvenDay: number | null;
  targetDays?: number;
  cohortStartDate?: string;
}

export function PaybackGauge({
  currentPercent,
  breakEvenDay,
  targetDays = 60,
  cohortStartDate
}: PaybackGaugeProps) {
  const isBreakEven = currentPercent >= 100;
  const cappedPercent = Math.min(currentPercent, 100);

  const getStatusColor = () => {
    if (isBreakEven) return 'text-terminal-green';
    if (currentPercent >= 75) return 'text-terminal-cyan';
    if (currentPercent >= 50) return 'text-terminal-yellow';
    return 'text-terminal-red';
  };

  const getBarColor = () => {
    if (isBreakEven) return 'bg-terminal-green';
    if (currentPercent >= 75) return 'bg-terminal-cyan';
    if (currentPercent >= 50) return 'bg-terminal-yellow';
    return 'bg-terminal-red';
  };

  const calculateBreakEvenDate = () => {
    if (!breakEvenDay || !cohortStartDate) return null;

    const cohortDate = new Date(cohortStartDate);
    const breakEvenDate = new Date(cohortDate);
    breakEvenDate.setDate(breakEvenDate.getDate() + breakEvenDay);

    return breakEvenDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const calculateProjectedBreakEven = () => {
    if (isBreakEven || currentPercent === 0 || !cohortStartDate) return null;

    const daysElapsed = Math.floor((Date.now() - new Date(cohortStartDate).getTime()) / (1000 * 60 * 60 * 24));
    const projectedDays = Math.ceil((100 / currentPercent) * daysElapsed);

    const cohortDate = new Date(cohortStartDate);
    const projectedDate = new Date(cohortDate);
    projectedDate.setDate(projectedDate.getDate() + projectedDays);

    return {
      date: projectedDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      days: projectedDays
    };
  };

  const breakEvenDate = calculateBreakEvenDate();
  const projectedBreakEven = calculateProjectedBreakEven();
  const vsTarget = breakEvenDay ? ((targetDays - breakEvenDay) / targetDays) * 100 : null;

  const segments = 20;
  const filledSegments = Math.round((cappedPercent / 100) * segments);

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <div className="text-sm text-terminal-muted mb-3">Payback Progress</div>

      <div className="flex items-center gap-4 mb-4">
        <div className={`text-4xl font-bold font-mono ${getStatusColor()}`}>
          {cappedPercent.toFixed(0)}%
        </div>
        {isBreakEven && (
          <div className="text-sm text-terminal-green">✓ Paid back</div>
        )}
      </div>

      <div className="flex gap-0.5 mb-4">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-3 flex-1 rounded-sm ${
              i < filledSegments ? getBarColor() : 'bg-terminal-border'
            }`}
            style={{ opacity: i < filledSegments ? 1 - (i * 0.02) : 0.3 }}
          />
        ))}
      </div>

      <div className="space-y-2 text-sm">
        {isBreakEven && breakEvenDate && (
          <div className="flex justify-between text-terminal-muted">
            <span>Break-even achieved:</span>
            <span className="text-terminal-green font-mono">{breakEvenDate}</span>
          </div>
        )}

        {!isBreakEven && projectedBreakEven && (
          <div className="flex justify-between text-terminal-muted">
            <span>Estimated break-even:</span>
            <span className="text-terminal-text font-mono">
              {projectedBreakEven.date} (~{projectedBreakEven.days}d)
            </span>
          </div>
        )}

        {breakEvenDay && (
          <div className="flex justify-between text-terminal-muted">
            <span>Payback period:</span>
            <span className={`font-mono ${
              breakEvenDay <= targetDays ? 'text-terminal-green' : 'text-terminal-yellow'
            }`}>
              {breakEvenDay} days
            </span>
          </div>
        )}

        {vsTarget !== null && (
          <div className="flex justify-between text-terminal-muted">
            <span>vs Target ({targetDays}d):</span>
            <span className={`font-mono ${
              vsTarget >= 0 ? 'text-terminal-green' : 'text-terminal-red'
            }`}>
              {vsTarget >= 0 ? '-' : '+'}{Math.abs(vsTarget).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
