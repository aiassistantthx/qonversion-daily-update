import { AlertTriangle, AlertCircle } from 'lucide-react';

export interface AnomalyInfo {
  type: 'warning' | 'critical';
  message: string;
  deviation: number; // % deviation from normal
}

interface AnomalyBadgeProps {
  anomaly?: AnomalyInfo;
  position?: 'absolute' | 'relative';
}

/**
 * AnomalyBadge - Visual indicator for metric anomalies
 *
 * Displays a warning or critical badge when a metric deviates significantly
 * from its historical average (>20% and >2σ).
 *
 * Usage:
 * ```tsx
 * const anomaly = detectAnomaly(currentValue, historicalValues, 'Revenue');
 * <AnomalyBadge anomaly={anomaly} />
 * ```
 */
export function AnomalyBadge({ anomaly, position = 'absolute' }: AnomalyBadgeProps) {
  if (!anomaly) return null;

  const Icon = anomaly.type === 'critical' ? AlertCircle : AlertTriangle;
  const bgColor = anomaly.type === 'critical' ? 'bg-red-500/20' : 'bg-yellow-500/20';
  const textColor = anomaly.type === 'critical' ? 'text-red-400' : 'text-yellow-400';
  const borderColor = anomaly.type === 'critical' ? 'border-red-500/30' : 'border-yellow-500/30';

  const positionClasses = position === 'absolute'
    ? 'absolute top-2 right-2'
    : '';

  return (
    <div
      className={`${positionClasses} flex items-center gap-1 px-2 py-1 rounded-md text-xs ${bgColor} ${textColor} border ${borderColor}`}
      title={anomaly.message}
    >
      <Icon size={12} />
      <span className="font-mono">{anomaly.deviation > 0 ? '+' : ''}{anomaly.deviation.toFixed(0)}%</span>
    </div>
  );
}

/**
 * Detect anomaly using 2-sigma statistical method
 *
 * @param currentValue - Current metric value
 * @param historicalValues - Array of historical values for comparison
 * @param metricName - Display name for the metric
 * @param isLowerBetter - Set to true for metrics where lower is better (e.g., COP, CPA)
 * @returns AnomalyInfo if anomaly detected, undefined otherwise
 *
 * Detection criteria:
 * - Deviation > 20% from mean
 * - Z-score > 2 (warning) or > 3 (critical)
 */
export function detectAnomaly(
  currentValue: number,
  historicalValues: number[],
  metricName: string,
  _isLowerBetter = false
): AnomalyInfo | undefined {
  if (!historicalValues || historicalValues.length < 3) return undefined;

  // Calculate mean and standard deviation
  const mean = historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;
  const variance = historicalValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / historicalValues.length;
  const stdDev = Math.sqrt(variance);

  if (mean === 0 || stdDev === 0) return undefined;

  // Calculate z-score
  const zScore = (currentValue - mean) / stdDev;
  const deviationPercent = ((currentValue - mean) / mean) * 100;

  // Check if deviation is significant (> 20% and > 2σ)
  if (Math.abs(deviationPercent) < 20 || Math.abs(zScore) < 2) return undefined;

  const isHigh = currentValue > mean;

  return {
    type: Math.abs(zScore) > 3 ? 'critical' : 'warning',
    message: `${metricName} ${isHigh ? '+' : ''}${deviationPercent.toFixed(0)}% vs avg`,
    deviation: deviationPercent,
  };
}
