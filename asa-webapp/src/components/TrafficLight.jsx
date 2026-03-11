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

export function getTrafficLightColorClass(status) {
  const colors = {
    ok: 'bg-traffic-ok text-traffic-ok',
    risk: 'bg-traffic-risk text-traffic-risk',
    bad: 'bg-traffic-bad text-traffic-bad',
    loss: 'bg-traffic-loss text-traffic-loss',
    unknown: 'bg-traffic-unknown text-traffic-unknown',
  };
  return colors[status] || colors.unknown;
}

// Legacy function for backward compatibility
export function getTrafficLightColor(status) {
  const colors = {
    ok: '#10b981',
    risk: '#f59e0b',
    bad: '#f97316',
    loss: '#ef4444',
    unknown: '#9ca3af',
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
  const colorClass = getTrafficLightColorClass(status);
  const label = getTrafficLightLabel(status);

  const sizes = {
    sm: { dot: 'w-2 h-2', text: 'text-xs' },
    md: { dot: 'w-2.5 h-2.5', text: 'text-sm' },
    lg: { dot: 'w-3 h-3', text: 'text-base' },
  };

  const { dot, text } = sizes[size] || sizes.sm;
  const [bgClass, textClass] = colorClass.split(' ');

  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        className={`rounded-full ${dot} ${bgClass}`}
        title={predictedRoas !== null ? `Predicted ROAS: ${(predictedRoas * 100).toFixed(0)}%` : 'No prediction'}
      />
      <span className={`font-medium ${text} ${textClass}`}>
        {label}
      </span>
    </div>
  );
}
