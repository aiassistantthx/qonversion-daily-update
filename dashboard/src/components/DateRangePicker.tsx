import { useState, useRef, useEffect } from 'react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Calendar, ChevronDown } from 'lucide-react';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This Month', type: 'thisMonth' },
  { label: 'Last Month', type: 'lastMonth' },
] as const;

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(value.from);
  const [customTo, setCustomTo] = useState(value.to);
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

  useEffect(() => {
    setCustomFrom(value.from);
    setCustomTo(value.to);
  }, [value]);

  const handlePreset = (preset: typeof PRESETS[number]) => {
    const today = new Date();
    let from: Date, to: Date;

    if ('days' in preset) {
      from = subDays(today, preset.days);
      to = today;
    } else if (preset.type === 'thisMonth') {
      from = startOfMonth(today);
      to = today;
    } else {
      const lastMonth = subMonths(today, 1);
      from = startOfMonth(lastMonth);
      to = endOfMonth(lastMonth);
    }

    onChange({
      from: format(from, 'yyyy-MM-dd'),
      to: format(to, 'yyyy-MM-dd'),
    });
    setIsOpen(false);
  };

  const handleApply = () => {
    onChange({ from: customFrom, to: customTo });
    setIsOpen(false);
  };

  const displayLabel = `${format(new Date(value.from), 'MMM d, yyyy')} - ${format(new Date(value.to), 'MMM d, yyyy')}`;

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
        }}
      >
        <Calendar size={14} color="#6b7280" />
        <span>{displayLabel}</span>
        <ChevronDown size={14} color="#6b7280" />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
            zIndex: 100,
            minWidth: 280,
          }}
        >
          {/* Presets */}
          <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Range */}
          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#6b7280', marginBottom: 8 }}>
              Custom Range
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </div>
            <button
              onClick={handleApply}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to get default date range (last 30 days)
export function getDefaultDateRange(): DateRange {
  const today = new Date();
  return {
    from: format(subDays(today, 30), 'yyyy-MM-dd'),
    to: format(today, 'yyyy-MM-dd'),
  };
}

// Helper to parse date range from URL
export function parseDateRangeFromURL(): DateRange | null {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const to = params.get('to');
  if (from && to) {
    return { from, to };
  }
  return null;
}

// Helper to update URL with date range
export function updateURLWithDateRange(range: DateRange) {
  const url = new URL(window.location.href);
  url.searchParams.set('from', range.from);
  url.searchParams.set('to', range.to);
  window.history.replaceState({}, '', url.toString());
}
