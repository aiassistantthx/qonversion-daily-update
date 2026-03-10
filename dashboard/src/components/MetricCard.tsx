import { TrendingUp, TrendingDown, Minus, AlertTriangle, AlertCircle } from 'lucide-react';

export interface AnomalyInfo {
  type: 'warning' | 'critical';
  message: string;
  deviation: number; // % deviation from normal
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  sparkline?: number[];
  format?: 'currency' | 'number' | 'percent';
  anomaly?: AnomalyInfo;
}

// Detect anomaly from sparkline data (simple 2σ detection)
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
    message: `${metricName} ${isHigh ? '+' : ''}${deviationPercent.toFixed(0)}% vs 7d avg`,
    deviation: deviationPercent,
  };
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel,
  sparkline,
  format = 'number',
  anomaly
}: MetricCardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'string') return val;
    switch (format) {
      case 'currency':
        return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      case 'percent':
        return `${val.toFixed(1)}%`;
      default:
        return val.toLocaleString();
    }
  };

  const getTrendIcon = () => {
    if (change === undefined || change === 0) return <Minus className="w-4 h-4 text-gray-400" />;
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    return <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  const getTrendColor = () => {
    if (change === undefined || change === 0) return 'text-gray-400';
    return change > 0 ? 'text-green-600' : 'text-red-600';
  };

  const maxSparkline = sparkline ? Math.max(...sparkline) : 0;

  const AnomalyBadge = () => {
    if (!anomaly) return null;
    const Icon = anomaly.type === 'critical' ? AlertCircle : AlertTriangle;
    const bgColor = anomaly.type === 'critical' ? 'bg-red-100' : 'bg-yellow-100';
    const textColor = anomaly.type === 'critical' ? 'text-red-700' : 'text-yellow-700';
    const borderColor = anomaly.type === 'critical' ? 'border-red-200' : 'border-yellow-200';

    return (
      <div
        className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md text-xs ${bgColor} ${textColor} border ${borderColor}`}
        title={anomaly.message}
      >
        <Icon size={12} />
        <span className="font-mono">{anomaly.deviation > 0 ? '+' : ''}{anomaly.deviation.toFixed(0)}%</span>
      </div>
    );
  };

  return (
    <div className={`relative bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow ${
      anomaly?.type === 'critical' ? 'border-red-300' :
      anomaly?.type === 'warning' ? 'border-yellow-300' :
      'border-gray-200'
    }`}>
      <AnomalyBadge />
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{title}</span>
        {change !== undefined && (
          <div className={`flex items-center gap-1 ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="text-xs font-mono">
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="text-2xl font-semibold font-mono text-gray-900 mb-2">
        {formatValue(value)}
      </div>

      {sparkline && sparkline.length > 0 && (
        <div className="flex items-end gap-0.5 h-8 mt-2">
          {sparkline.map((val, i) => (
            <div
              key={i}
              className="flex-1 bg-blue-200 rounded-sm min-h-[2px]"
              style={{ height: `${(val / maxSparkline) * 100}%` }}
            />
          ))}
        </div>
      )}

      {changeLabel && (
        <div className="text-xs text-gray-500 mt-2">
          {changeLabel}
        </div>
      )}
    </div>
  );
}
