import { ChevronDown, Search, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export type CountrySelection = string[]; // Array of country codes

interface CountryFilterProps {
  value: CountrySelection;
  onChange: (countries: CountrySelection) => void;
  availableCountries?: Array<{ code: string; name: string }>;
}

// Top countries for presets
const TOP_COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
];

// Country flag emoji from country code
function getFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function CountryFilter({ value, onChange }: CountryFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const toggleCountry = (code: string) => {
    if (value.includes(code)) {
      onChange(value.filter(c => c !== code));
    } else {
      onChange([...value, code]);
    }
  };

  const applyPreset = (preset: 'top5' | 'top10' | 'clear') => {
    if (preset === 'clear') {
      onChange([]);
    } else if (preset === 'top5') {
      onChange(TOP_COUNTRIES.slice(0, 5).map(c => c.code));
    } else if (preset === 'top10') {
      onChange(TOP_COUNTRIES.slice(0, 10).map(c => c.code));
    }
    setIsOpen(false);
  };

  const filteredCountries = TOP_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedCountries = value.map(code =>
    TOP_COUNTRIES.find(c => c.code === code)
  ).filter(Boolean);

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
          minWidth: 150,
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>
          {value.length === 0 ? 'All Countries' : `${value.length} selected`}
        </span>
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
            minWidth: 280,
            maxHeight: 400,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Presets */}
          <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <button
                onClick={() => applyPreset('top5')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Top 5
              </button>
              <button
                onClick={() => applyPreset('top10')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Top 10
              </button>
              <button
                onClick={() => applyPreset('clear')}
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  color: '#374151',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Clear
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Search countries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px 6px 28px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={12} color="#9ca3af" />
                </button>
              )}
            </div>
          </div>

          {/* Selected Countries */}
          {value.length > 0 && (
            <div style={{ padding: 8, borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Selected ({value.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedCountries.map(country => country && (
                  <button
                    key={country.code}
                    onClick={() => toggleCountry(country.code)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 6px',
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 4,
                      fontSize: 11,
                      color: '#374151',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span>{getFlag(country.code)}</span>
                    <span>{country.code}</span>
                    <X size={10} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Country List */}
          <div style={{ flex: 1, overflow: 'auto', padding: 4 }}>
            {filteredCountries.map(country => {
              const isSelected = value.includes(country.code);
              return (
                <button
                  key={country.code}
                  onClick={() => toggleCountry(country.code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    background: isSelected ? '#eff6ff' : 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    color: '#374151',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = '#f9fafb';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    style={{ cursor: 'pointer' }}
                  />
                  <span>{getFlag(country.code)}</span>
                  <span style={{ flex: 1 }}>{country.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{country.code}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to parse from URL
export function parseCountryFilterFromURL(): CountrySelection {
  const params = new URLSearchParams(window.location.search);
  const countries = params.get('countries');
  if (countries) {
    return countries.split(',').filter(Boolean);
  }
  return [];
}

// Helper to update URL
export function updateURLWithCountryFilter(countries: CountrySelection) {
  const url = new URL(window.location.href);
  if (countries.length > 0) {
    url.searchParams.set('countries', countries.join(','));
  } else {
    url.searchParams.delete('countries');
  }
  window.history.replaceState({}, '', url.toString());
}
