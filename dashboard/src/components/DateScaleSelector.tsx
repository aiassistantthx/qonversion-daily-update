export type DateScale = 'day' | 'week' | 'month' | 'year';

interface DateScaleSelectorProps {
  value: DateScale;
  onChange: (scale: DateScale) => void;
}

const SCALES: { value: DateScale; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export function DateScaleSelector({ value, onChange }: DateScaleSelectorProps) {
  return (
    <div
      style={{
        display: 'flex',
        background: '#f3f4f6',
        borderRadius: 8,
        padding: 2,
      }}
    >
      {SCALES.map((scale) => (
        <button
          key={scale.value}
          onClick={() => onChange(scale.value)}
          style={{
            padding: '6px 12px',
            background: value === scale.value ? '#fff' : 'transparent',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: value === scale.value ? 500 : 400,
            color: value === scale.value ? '#111827' : '#6b7280',
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: value === scale.value ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          {scale.label}
        </button>
      ))}
    </div>
  );
}

// Helper to parse from URL
export function parseDateScaleFromURL(): DateScale | null {
  const params = new URLSearchParams(window.location.search);
  const scale = params.get('scale');
  if (scale === 'day' || scale === 'week' || scale === 'month' || scale === 'year') {
    return scale;
  }
  return null;
}

// Helper to update URL
export function updateURLWithDateScale(scale: DateScale) {
  const url = new URL(window.location.href);
  url.searchParams.set('scale', scale);
  window.history.replaceState({}, '', url.toString());
}
