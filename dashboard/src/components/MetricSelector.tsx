import { useEffect, useState } from 'react';

export interface MetricOption {
  key: string;
  label: string;
  color: string;
}

interface MetricSelectorProps {
  options: MetricOption[];
  onChange: (selected: string[]) => void;
  storageKey?: string;
}

export function MetricSelector({ options, onChange, storageKey }: MetricSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          return new Set(JSON.parse(stored));
        } catch {
          // Invalid JSON, fall through to default
        }
      }
    }
    return new Set(options.map(o => o.key));
  });

  useEffect(() => {
    onChange(Array.from(selected));
  }, [selected, onChange]);

  const toggleMetric = (key: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(key)) {
      if (newSelected.size > 1) {
        newSelected.delete(key);
      }
    } else {
      newSelected.add(key);
    }

    setSelected(newSelected);

    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(Array.from(newSelected)));
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(option => {
        const isSelected = selected.has(option.key);
        return (
          <button
            key={option.key}
            onClick={() => toggleMetric(option.key)}
            title={`${isSelected ? 'Hide' : 'Show'} ${option.label}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 6,
              border: `2px solid ${option.color}`,
              background: isSelected ? option.color : '#fff',
              color: isSelected ? '#fff' : option.color,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              opacity: isSelected ? 1 : 0.6,
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: isSelected ? '#fff' : option.color,
              border: isSelected ? 'none' : `2px solid ${option.color}`,
            }} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
