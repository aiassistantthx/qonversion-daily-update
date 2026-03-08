import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  sparkline?: number[];
  format?: 'currency' | 'number' | 'percent';
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel,
  sparkline,
  format = 'number'
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
    if (change === undefined || change === 0) return <Minus className="w-4 h-4 text-terminal-muted" />;
    if (change > 0) return <TrendingUp className="w-4 h-4 text-terminal-green" />;
    return <TrendingDown className="w-4 h-4 text-terminal-red" />;
  };

  const getTrendColor = () => {
    if (change === undefined || change === 0) return 'text-terminal-muted';
    return change > 0 ? 'text-terminal-green' : 'text-terminal-red';
  };

  const maxSparkline = sparkline ? Math.max(...sparkline) : 0;

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4 card-hover">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-terminal-muted">{title}</span>
        {change !== undefined && (
          <div className={`flex items-center gap-1 ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="text-xs font-mono">
              {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="text-2xl font-semibold font-mono text-terminal-text mb-2">
        {formatValue(value)}
      </div>

      {sparkline && sparkline.length > 0 && (
        <div className="sparkline mt-2">
          {sparkline.map((val, i) => (
            <div
              key={i}
              className="sparkline-bar"
              style={{ height: `${(val / maxSparkline) * 100}%` }}
            />
          ))}
        </div>
      )}

      {changeLabel && (
        <div className="text-xs text-terminal-muted mt-2">
          {changeLabel}
        </div>
      )}
    </div>
  );
}
