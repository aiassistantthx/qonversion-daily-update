import { TrendingUp } from 'lucide-react';

export interface CountryRoasData {
  country: string;
  users: number;
  subscribers: number;
  revenue: number;
  spend: number;
  cop: number | null;
  roas: number | null;
}

interface TopCountriesWidgetProps {
  data: { countries: CountryRoasData[] } | undefined;
}

const fmt = (n: number | null | undefined) => n != null ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';

export function TopCountriesWidget({ data }: TopCountriesWidgetProps) {
  if (!data || !data.countries || data.countries.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Top Countries by ROAS</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const maxRoas = Math.max(...data.countries.map(c => Number(c.roas) || 0));

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
            Top Countries by ROAS
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Top 10 countries sorted by Return on Ad Spend (Apple Ads only). Spend attributed proportionally by installs.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {data.countries.map((country) => {
          const roasPercent = maxRoas > 0 ? ((Number(country.roas) || 0) / maxRoas) * 100 : 0;
          const isPositive = (Number(country.roas) || 0) >= 1;

          return (
            <div
              key={country.country}
              style={{
                background: '#f9fafb',
                borderRadius: 8,
                padding: 12,
                border: '1px solid #e5e7eb',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Background bar */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${roasPercent}%`,
                  background: isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  transition: 'width 0.3s ease',
                }}
              />

              {/* Content */}
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 18 }}>
                      {getCountryFlag(country.country)}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                        {country.country}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {country.subscribers} subs
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: isPositive ? '#10b981' : '#ef4444',
                        fontFamily: "'JetBrains Mono', monospace",
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {country.roas != null ? `${Number(country.roas).toFixed(2)}x` : '—'}
                      {isPositive && <TrendingUp size={14} />}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11 }}>
                  <div>
                    <div style={{ color: '#9ca3af' }}>Revenue</div>
                    <div style={{ color: '#111827', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmt(country.revenue)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af' }}>Spend</div>
                    <div style={{ color: '#111827', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmt(country.spend)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af' }}>COP</div>
                    <div style={{ color: '#111827', fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" }}>
                      {fmt(country.cop)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Helper function to get country flag emoji
function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode === 'Unknown') return '🌍';

  const flagMap: Record<string, string> = {
    'US': '🇺🇸', 'GB': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺', 'DE': '🇩🇪',
    'FR': '🇫🇷', 'ES': '🇪🇸', 'IT': '🇮🇹', 'BR': '🇧🇷', 'MX': '🇲🇽',
    'JP': '🇯🇵', 'KR': '🇰🇷', 'CN': '🇨🇳', 'IN': '🇮🇳', 'RU': '🇷🇺',
    'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'DK': '🇩🇰', 'FI': '🇫🇮',
    'PL': '🇵🇱', 'TR': '🇹🇷', 'AR': '🇦🇷', 'CL': '🇨🇱', 'CO': '🇨🇴',
    'PT': '🇵🇹', 'GR': '🇬🇷', 'CZ': '🇨🇿', 'AT': '🇦🇹', 'CH': '🇨🇭',
    'BE': '🇧🇪', 'IE': '🇮🇪', 'NZ': '🇳🇿', 'SG': '🇸🇬', 'HK': '🇭🇰',
    'TH': '🇹🇭', 'MY': '🇲🇾', 'PH': '🇵🇭', 'ID': '🇮🇩', 'VN': '🇻🇳',
    'ZA': '🇿🇦', 'EG': '🇪🇬', 'NG': '🇳🇬', 'KE': '🇰🇪', 'IL': '🇮🇱',
    'SA': '🇸🇦', 'AE': '🇦🇪', 'UA': '🇺🇦', 'RO': '🇷🇴', 'HU': '🇭🇺',
  };

  return flagMap[countryCode.toUpperCase()] || '🌍';
}
