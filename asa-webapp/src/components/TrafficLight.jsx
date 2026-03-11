/**
 * Traffic Light Component
 * Shows campaign status based on predicted ROAS
 *
 * Status Levels:
 * - OK: predicted ROAS >= 1.5 (green)
 * - Risk: 1.0 <= predicted ROAS < 1.5 (yellow)
 * - Bad: 0.5 <= predicted ROAS < 1.0 (orange)
 * - Loss: predicted ROAS < 0.5 (red)
 */

export function getTrafficLightStatus(predictedRoas) {
  if (!predictedRoas || predictedRoas === null) return 'unknown';
  if (predictedRoas >= 1.5) return 'ok';
  if (predictedRoas >= 1.0) return 'risk';
  if (predictedRoas >= 0.5) return 'bad';
  return 'loss';
}

export function getTrafficLightColor(status) {
  const colors = {
    ok: '#10b981',      // green-500
    risk: '#f59e0b',    // amber-500
    bad: '#f97316',     // orange-500
    loss: '#ef4444',    // red-500
    unknown: '#9ca3af', // gray-400
  };
  return colors[status] || colors.unknown;
}

export function getTrafficLightLabel(status) {
  const labels = {
    ok: 'OK',
    risk: 'Risk',
    bad: 'Bad',
    loss: 'Loss',
    unknown: 'N/A',
  };
  return labels[status] || labels.unknown;
}

export function TrafficLight({ predictedRoas, size = 'sm' }) {
  const status = getTrafficLightStatus(predictedRoas);
  const color = getTrafficLightColor(status);
  const label = getTrafficLightLabel(status);

  const sizes = {
    sm: { dot: 8, text: 'text-xs' },
    md: { dot: 10, text: 'text-sm' },
    lg: { dot: 12, text: 'text-base' },
  };

  const { dot, text } = sizes[size] || sizes.sm;

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className="rounded-full"
        style={{
          width: `${dot}px`,
          height: `${dot}px`,
          backgroundColor: color,
        }}
        title={predictedRoas !== null ? `Predicted ROAS: ${(predictedRoas * 100).toFixed(0)}%` : 'No prediction'}
      />
      <span className={`font-medium ${text}`} style={{ color }}>
        {label}
      </span>
    </div>
  );
}
