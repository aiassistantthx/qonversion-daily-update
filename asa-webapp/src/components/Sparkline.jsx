export function Sparkline({ data, className = '' }) {
  if (!data || data.length === 0) {
    return <div className={`w-16 h-8 ${className}`} />;
  }

  const width = 64;
  const height = 32;
  const padding = 2;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((value, i) => {
    const x = padding + (i / (values.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((value - min) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const trend = lastValue - firstValue;
  const strokeColor = trend >= 0 ? '#10b981' : '#ef4444';

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
