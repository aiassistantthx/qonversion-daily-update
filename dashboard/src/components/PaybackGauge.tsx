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
    if (isBreakEven) return '#10b981';
    if (currentPercent >= 75) return '#06b6d4';
    if (currentPercent >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const getBarColor = () => {
    if (isBreakEven) return '#10b981';
    if (currentPercent >= 75) return '#06b6d4';
    if (currentPercent >= 50) return '#f59e0b';
    return '#ef4444';
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
    <div style={styles.container}>
      <div style={styles.label}>Payback Progress</div>

      <div style={styles.percentContainer}>
        <div style={{ ...styles.percentValue, color: getStatusColor() }}>
          {cappedPercent.toFixed(0)}%
        </div>
        {isBreakEven && (
          <div style={styles.paidBackBadge}>✓ Paid back</div>
        )}
      </div>

      <div style={styles.progressBar}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.segment,
              backgroundColor: i < filledSegments ? getBarColor() : '#e5e7eb',
              opacity: i < filledSegments ? 1 - (i * 0.02) : 0.3,
            }}
          />
        ))}
      </div>

      <div style={styles.detailsContainer}>
        {isBreakEven && breakEvenDate && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Break-even achieved:</span>
            <span style={{ ...styles.detailValue, color: '#10b981' }}>{breakEvenDate}</span>
          </div>
        )}

        {!isBreakEven && projectedBreakEven && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Estimated break-even:</span>
            <span style={styles.detailValue}>
              {projectedBreakEven.date} (~{projectedBreakEven.days}d)
            </span>
          </div>
        )}

        {breakEvenDay && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Payback period:</span>
            <span style={{
              ...styles.detailValue,
              color: breakEvenDay <= targetDays ? '#10b981' : '#f59e0b'
            }}>
              {breakEvenDay} days
            </span>
          </div>
        )}

        {vsTarget !== null && (
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>vs Target ({targetDays}d):</span>
            <span style={{
              ...styles.detailValue,
              color: vsTarget >= 0 ? '#10b981' : '#ef4444'
            }}>
              {vsTarget >= 0 ? '-' : '+'}{Math.abs(vsTarget).toFixed(0)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    fontWeight: 500,
  },
  percentContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  percentValue: {
    fontSize: 36,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
  },
  paidBackBadge: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: 500,
  },
  progressBar: {
    display: 'flex',
    gap: 2,
    marginBottom: 16,
  },
  segment: {
    height: 12,
    flex: 1,
    borderRadius: 2,
  },
  detailsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
  },
  detailLabel: {
    color: '#6b7280',
  },
  detailValue: {
    color: '#111827',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
  },
};
