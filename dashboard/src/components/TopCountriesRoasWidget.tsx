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
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={18} className="text-yellow-500" />
          <div className="text-sm font-medium text-gray-900">Top Countries by ROAS</div>
        </div>
        <div className="text-xs text-gray-400 text-center py-4">No data available</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={18} className="text-yellow-500" />
        <div className="text-sm font-medium text-gray-900">Top Countries by ROAS</div>
      </div>
      <div className="space-y-1">
        {countries.map((country, index) => {
          const roasPercent = country.roas != null ? country.roas * 100 : 0;
          const isGood = roasPercent >= 100;

          return (
            <div
              key={country.country}
              className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="text-gray-400 text-xs w-4 font-mono">{index + 1}</div>
                <div className="text-base">{getFlag(country.country)}</div>
                <div className="text-sm text-gray-900 font-medium">{country.country}</div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs text-gray-400">Revenue</div>
                  <div className="text-sm font-mono text-gray-900">
                    ${country.revenue.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Spend</div>
                  <div className="text-sm font-mono text-gray-900">
                    ${country.spend.toLocaleString()}
                  </div>
                </div>
                <div className="text-right min-w-[60px]">
                  <div className="text-xs text-gray-400">ROAS</div>
                  <div
                    className={`text-sm font-mono font-semibold ${
                      isGood ? 'text-green-600' : 'text-amber-600'
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
