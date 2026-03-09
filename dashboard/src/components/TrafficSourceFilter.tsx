import { ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export type TrafficSource = 'all' | 'apple_ads' | 'organic';

interface TrafficSourceFilterProps {
  value: TrafficSource;
  onChange: (source: TrafficSource) => void;
}

const SOURCES: { value: TrafficSource; label: string; color?: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'apple_ads', label: 'Apple Ads', color: '#3b82f6' },
  { value: 'organic', label: 'Organic', color: '#10b981' },
];

export function TrafficSourceFilter({ value, onChange }: TrafficSourceFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentSource = SOURCES.find((s) => s.value === value) || SOURCES[0];

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          fontSize: 13,
          color: '#374151',
          cursor: 'pointer',
          fontFamily: 'inherit',
          minWidth: 130,
        }}
      >
        {currentSource.color && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: currentSource.color,
            }}
          />
        )}
        <span style={{ flex: 1, textAlign: 'left' }}>{currentSource.label}</span>
        <ChevronDown size={14} color="#6b7280" />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
            zIndex: 100,
            minWidth: 160,
            padding: 4,
          }}
        >
          {SOURCES.map((source) => (
            <button
              key={source.value}
              onClick={() => {
                onChange(source.value);
                setIsOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 12px',
                background: value === source.value ? '#f3f4f6' : 'transparent',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                color: '#374151',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
              onMouseOver={(e) => {
                if (value !== source.value) {
                  e.currentTarget.style.background = '#f9fafb';
                }
              }}
              onMouseOut={(e) => {
                if (value !== source.value) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {source.color && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: source.color,
                  }}
                />
              )}
              <span>{source.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper to parse from URL
export function parseTrafficSourceFromURL(): TrafficSource | null {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('source');
  if (source === 'all' || source === 'apple_ads' || source === 'organic') {
    return source;
  }
  return null;
}

// Helper to update URL
export function updateURLWithTrafficSource(source: TrafficSource) {
  const url = new URL(window.location.href);
  url.searchParams.set('source', source);
  window.history.replaceState({}, '', url.toString());
}
