import { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Button } from './Button';

const countryCoordinates = {
  'US': { cx: 250, cy: 180, name: 'United States' },
  'CA': { cx: 200, cy: 140, name: 'Canada' },
  'MX': { cx: 220, cy: 220, name: 'Mexico' },
  'BR': { cx: 360, cy: 340, name: 'Brazil' },
  'GB': { cx: 480, cy: 140, name: 'United Kingdom' },
  'FR': { cx: 500, cy: 160, name: 'France' },
  'DE': { cx: 520, cy: 145, name: 'Germany' },
  'ES': { cx: 490, cy: 180, name: 'Spain' },
  'IT': { cx: 530, cy: 175, name: 'Italy' },
  'RU': { cx: 600, cy: 130, name: 'Russia' },
  'CN': { cx: 700, cy: 190, name: 'China' },
  'JP': { cx: 770, cy: 190, name: 'Japan' },
  'KR': { cx: 740, cy: 195, name: 'South Korea' },
  'IN': { cx: 650, cy: 220, name: 'India' },
  'AU': { cx: 760, cy: 360, name: 'Australia' },
  'ZA': { cx: 540, cy: 360, name: 'South Africa' },
  'AR': { cx: 340, cy: 400, name: 'Argentina' },
  'CL': { cx: 320, cy: 390, name: 'Chile' },
  'PE': { cx: 300, cy: 310, name: 'Peru' },
  'CO': { cx: 300, cy: 260, name: 'Colombia' },
  'VE': { cx: 330, cy: 250, name: 'Venezuela' },
  'TR': { cx: 560, cy: 180, name: 'Turkey' },
  'SA': { cx: 580, cy: 230, name: 'Saudi Arabia' },
  'AE': { cx: 600, cy: 235, name: 'United Arab Emirates' },
  'EG': { cx: 550, cy: 220, name: 'Egypt' },
  'NG': { cx: 510, cy: 260, name: 'Nigeria' },
  'KE': { cx: 570, cy: 280, name: 'Kenya' },
  'TH': { cx: 690, cy: 240, name: 'Thailand' },
  'VN': { cx: 710, cy: 240, name: 'Vietnam' },
  'ID': { cx: 720, cy: 280, name: 'Indonesia' },
  'MY': { cx: 700, cy: 265, name: 'Malaysia' },
  'SG': { cx: 705, cy: 275, name: 'Singapore' },
  'PH': { cx: 730, cy: 245, name: 'Philippines' },
  'PK': { cx: 640, cy: 210, name: 'Pakistan' },
  'BD': { cx: 670, cy: 230, name: 'Bangladesh' },
  'PL': { cx: 540, cy: 145, name: 'Poland' },
  'UA': { cx: 560, cy: 150, name: 'Ukraine' },
  'RO': { cx: 545, cy: 165, name: 'Romania' },
  'NL': { cx: 500, cy: 140, name: 'Netherlands' },
  'BE': { cx: 495, cy: 145, name: 'Belgium' },
  'CH': { cx: 510, cy: 160, name: 'Switzerland' },
  'AT': { cx: 525, cy: 155, name: 'Austria' },
  'SE': { cx: 525, cy: 120, name: 'Sweden' },
  'NO': { cx: 515, cy: 110, name: 'Norway' },
  'DK': { cx: 515, cy: 135, name: 'Denmark' },
  'FI': { cx: 550, cy: 110, name: 'Finland' },
  'IE': { cx: 470, cy: 140, name: 'Ireland' },
  'PT': { cx: 470, cy: 180, name: 'Portugal' },
  'GR': { cx: 545, cy: 185, name: 'Greece' },
  'CZ': { cx: 525, cy: 150, name: 'Czech Republic' },
  'HU': { cx: 540, cy: 160, name: 'Hungary' },
  'IL': { cx: 565, cy: 210, name: 'Israel' },
  'NZ': { cx: 820, cy: 410, name: 'New Zealand' },
};

const getColorForValue = (value, min, max, metric) => {
  if (value === null || value === undefined || max === min) return '#e5e7eb';

  const normalized = (value - min) / (max - min);

  if (metric === 'roas') {
    if (value < 0.5) return '#dc2626';
    if (value < 1.0) return '#f59e0b';
    if (value < 1.5) return '#fbbf24';
    if (value < 2.0) return '#a3e635';
    return '#22c55e';
  }

  const hue = metric === 'spend' ? 200 : 140;
  const saturation = 70 + normalized * 30;
  const lightness = 80 - normalized * 50;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export function GeoHeatmap({ data = [] }) {
  const [selectedMetric, setSelectedMetric] = useState('roas');
  const [hoveredCountry, setHoveredCountry] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const metrics = [
    { value: 'roas', label: 'ROAS' },
    { value: 'spend', label: 'Spend' },
    { value: 'installs', label: 'Installs' },
    { value: 'revenue', label: 'Revenue' },
  ];

  const countryData = useMemo(() => {
    const dataMap = {};
    data.forEach(item => {
      const countryCode = item.country.toUpperCase();
      dataMap[countryCode] = item;
    });
    return dataMap;
  }, [data]);

  const { min, max } = useMemo(() => {
    if (data.length === 0) return { min: 0, max: 0 };

    const values = data.map(d => d[selectedMetric]).filter(v => v !== null && v !== undefined);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [data, selectedMetric]);

  const handleMouseMove = (e, countryCode) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setHoveredCountry(countryCode);
  };

  const formatValue = (value, metric) => {
    if (value === null || value === undefined) return 'N/A';
    if (metric === 'spend' || metric === 'revenue') {
      return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (metric === 'roas') {
      return `${value.toFixed(2)}x`;
    }
    return value.toLocaleString();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Geographic Distribution</CardTitle>
          <div className="flex gap-2">
            {metrics.map(metric => (
              <Button
                key={metric.value}
                variant={selectedMetric === metric.value ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setSelectedMetric(metric.value)}
              >
                {metric.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <svg
            viewBox="0 0 900 500"
            className="w-full h-auto"
            style={{ maxHeight: '500px' }}
          >
            <rect width="900" height="500" fill="#f9fafb" />

            {Object.entries(countryCoordinates).map(([code, coords]) => {
              const country = countryData[code];
              const value = country?.[selectedMetric];
              const color = getColorForValue(value, min, max, selectedMetric);
              const radius = country ? 8 + (value - min) / (max - min) * 12 : 6;

              return (
                <g key={code}>
                  <circle
                    cx={coords.cx}
                    cy={coords.cy}
                    r={radius}
                    fill={color}
                    stroke={hoveredCountry === code ? '#1f2937' : '#fff'}
                    strokeWidth={hoveredCountry === code ? 2 : 1}
                    opacity={country ? 0.9 : 0.3}
                    className="transition-all cursor-pointer"
                    onMouseMove={(e) => handleMouseMove(e, code)}
                    onMouseLeave={() => setHoveredCountry(null)}
                  />
                  {country && radius > 10 && (
                    <text
                      x={coords.cx}
                      y={coords.cy + 3}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="600"
                      fill="#fff"
                      pointerEvents="none"
                    >
                      {code}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {hoveredCountry && countryData[hoveredCountry] && (
            <div
              className="absolute bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg text-sm z-10 pointer-events-none"
              style={{
                left: `${tooltipPos.x + 10}px`,
                top: `${tooltipPos.y + 10}px`,
              }}
            >
              <div className="font-semibold mb-1">
                {countryCoordinates[hoveredCountry].name}
              </div>
              <div className="space-y-0.5 text-xs">
                <div>
                  <span className="text-gray-400">Spend:</span>{' '}
                  {formatValue(countryData[hoveredCountry].spend, 'spend')}
                </div>
                <div>
                  <span className="text-gray-400">Revenue:</span>{' '}
                  {formatValue(countryData[hoveredCountry].revenue, 'revenue')}
                </div>
                <div>
                  <span className="text-gray-400">ROAS:</span>{' '}
                  {formatValue(countryData[hoveredCountry].roas, 'roas')}
                </div>
                <div>
                  <span className="text-gray-400">Installs:</span>{' '}
                  {formatValue(countryData[hoveredCountry].installs, 'installs')}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Legend:</span>
            {selectedMetric === 'roas' ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#dc2626' }}></div>
                  <span className="text-xs text-gray-600">&lt;0.5x</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#f59e0b' }}></div>
                  <span className="text-xs text-gray-600">0.5-1x</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#fbbf24' }}></div>
                  <span className="text-xs text-gray-600">1-1.5x</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#a3e635' }}></div>
                  <span className="text-xs text-gray-600">1.5-2x</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#22c55e' }}></div>
                  <span className="text-xs text-gray-600">&gt;2x</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Low</span>
                <div className="flex gap-1">
                  {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                    <div
                      key={i}
                      className="w-6 h-4 rounded"
                      style={{ backgroundColor: getColorForValue(min + (max - min) * v, min, max, selectedMetric) }}
                    ></div>
                  ))}
                </div>
                <span className="text-xs text-gray-600">High</span>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {data.length} countries with data
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
