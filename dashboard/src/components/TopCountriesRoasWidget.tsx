import { Trophy } from 'lucide-react';
import type { TopCountryRoas } from '../api';

interface TopCountriesRoasWidgetProps {
  countries: TopCountryRoas[];
}

function getFlag(countryName: string): string {
  const countryToCode: Record<string, string> = {
    'United States': 'US',
    'United Kingdom': 'GB',
    'Canada': 'CA',
    'Australia': 'AU',
    'Germany': 'DE',
    'France': 'FR',
    'Italy': 'IT',
    'Spain': 'ES',
    'Japan': 'JP',
    'South Korea': 'KR',
    'Brazil': 'BR',
    'Mexico': 'MX',
    'India': 'IN',
    'China': 'CN',
    'Russia': 'RU',
    'Netherlands': 'NL',
    'Belgium': 'BE',
    'Sweden': 'SE',
    'Norway': 'NO',
    'Denmark': 'DK',
    'Finland': 'FI',
    'Poland': 'PL',
    'Switzerland': 'CH',
    'Austria': 'AT',
    'Ireland': 'IE',
    'Portugal': 'PT',
    'Greece': 'GR',
    'Turkey': 'TR',
    'Singapore': 'SG',
    'Hong Kong': 'HK',
    'Taiwan': 'TW',
    'Thailand': 'TH',
    'Vietnam': 'VN',
    'Philippines': 'PH',
    'Indonesia': 'ID',
    'Malaysia': 'MY',
    'South Africa': 'ZA',
    'Saudi Arabia': 'SA',
    'United Arab Emirates': 'AE',
    'Israel': 'IL',
    'Egypt': 'EG',
    'Argentina': 'AR',
    'Chile': 'CL',
    'Colombia': 'CO',
    'Peru': 'PE',
    'New Zealand': 'NZ',
  };

  const code = countryToCode[countryName];
  if (!code || code.length !== 2) return '🌍';

  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function TopCountriesRoasWidget({ countries }: TopCountriesRoasWidgetProps) {
  if (!countries || countries.length === 0) {
    return (
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={18} className="text-terminal-accent" />
          <div className="text-sm text-terminal-muted">Top Countries by ROAS</div>
        </div>
        <div className="text-xs text-terminal-dim text-center py-4">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-terminal-accent" />
        <div className="text-sm text-terminal-muted">Top Countries by ROAS</div>
      </div>
      <div className="space-y-2">
        {countries.map((country, index) => {
          const roasPercent = country.roas != null ? country.roas * 100 : 0;
          const isGood = roasPercent >= 100;

          return (
            <div
              key={country.country}
              className="flex items-center justify-between p-2 rounded hover:bg-terminal-hover transition-colors"
            >
              <div className="flex items-center gap-2 flex-1">
                <div className="text-terminal-dim text-xs w-4">{index + 1}</div>
                <div className="text-base">{getFlag(country.country)}</div>
                <div className="text-xs text-terminal-text">{country.country}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-xs text-terminal-dim">Revenue</div>
                  <div className="text-xs font-mono text-terminal-text">
                    ${country.revenue.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-terminal-dim">Spend</div>
                  <div className="text-xs font-mono text-terminal-text">
                    ${country.spend.toLocaleString()}
                  </div>
                </div>
                <div className="text-right min-w-[60px]">
                  <div className="text-xs text-terminal-dim">ROAS</div>
                  <div
                    className={`text-sm font-mono font-semibold ${
                      isGood ? 'text-terminal-success' : 'text-terminal-warning'
                    }`}
                  >
                    {roasPercent.toFixed(0)}%
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
