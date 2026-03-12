export function Delta({ current, previous, format = 'number', precision = 1 }) {
  if (!previous || previous === 0 || !current) return null;

  const change = ((current - previous) / previous) * 100;

  if (Math.abs(change) < 0.1) return null;

  const isPositive = change >= 0;
  const color = isPositive ? 'text-green-600' : 'text-red-600';
  const arrow = isPositive ? '↑' : '↓';

  return (
    <span className={`text-xs font-medium ${color} ml-1`}>
      {arrow} {Math.abs(change).toFixed(precision)}%
    </span>
  );
}

export function DeltaBadge({ current, previous, inverseColors = false }) {
  if (!previous || previous === 0 || !current) return null;

  const change = ((current - previous) / previous) * 100;

  if (Math.abs(change) < 0.1) return null;

  const isPositive = change >= 0;
  const isGood = inverseColors ? !isPositive : isPositive;
  const bgColor = isGood ? 'bg-green-100' : 'bg-red-100';
  const textColor = isGood ? 'text-green-700' : 'text-red-700';
  const arrow = isPositive ? '↑' : '↓';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${bgColor} ${textColor}`}>
      {arrow} {Math.abs(change).toFixed(1)}%
    </span>
  );
}
