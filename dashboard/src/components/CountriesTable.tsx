import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Globe, Download } from 'lucide-react';
import { exportToCSV } from '../utils/export';
import { MetricSelector, type MetricOption } from './MetricSelector';

export interface CountriesData {
  countries: Array<{
    country: string;
    countryCode: string;
    source: 'apple_ads' | 'organic' | 'total';
    revenue: number;
    spend: number;
    roas: number | null;
    cop: number | null;
    subscribers: number;
    trials: number;
    crToPaid: number | null;
  }>;
  totals: {
    revenue: number;
    spend: number;
    roas: number | null;
    cop: number | null;
    subscribers: number;
  };
}

interface CountriesTableProps {
  data: CountriesData | undefined;
  topN?: number;
}

type SortKey = 'country' | 'revenue' | 'spend' | 'roas' | 'cop' | 'subscribers' | 'trials';

// Country flag emoji from country code
function getFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const METRIC_OPTIONS: MetricOption[] = [
  { key: 'revenue', label: 'Revenue', color: '#10b981' },
  { key: 'roas', label: 'ROAS', color: '#3b82f6' },
  { key: 'cop', label: 'COP', color: '#8b5cf6' },
  { key: 'subscribers', label: 'Subs', color: '#f59e0b' },
  { key: 'spend', label: 'Spend', color: '#6b7280' },
  { key: 'trials', label: 'Trials', color: '#ec4899' },
  { key: 'crToPaid', label: 'CR %', color: '#14b8a6' },
];

const DEFAULT_METRICS = ['revenue', 'roas', 'cop', 'subscribers'];

export function CountriesTable({ data, topN = 20 }: CountriesTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);
  const [showSource, setShowSource] = useState<'all' | 'apple_ads' | 'organic'>('all');
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>(() => {
    const stored = localStorage.getItem('countries-visible-metrics');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_METRICS;
      }
    }
    return DEFAULT_METRICS;
  });

  const handleMetricsChange = useCallback((metrics: string[]) => {
    setVisibleMetrics(metrics);
  }, []);

  if (!data) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Countries Ranking</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>API endpoint coming soon</div>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  // Filter and sort countries
  let filteredCountries = data.countries || [];
  if (showSource !== 'all') {
    filteredCountries = filteredCountries.filter(c => c.source === showSource);
  }

  const sortedCountries = [...filteredCountries].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];
    if (aVal == null) aVal = -Infinity;
    if (bVal == null) bVal = -Infinity;
    if (typeof aVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  }).slice(0, topN);

  const handleExport = () => {
    const headers = ['#', 'Country', 'Country Code'];
    if (showSource === 'all') headers.push('Source');

    const metricHeaders: Record<string, string> = {
      revenue: 'Revenue',
      spend: 'Spend',
      roas: 'ROAS',
      cop: 'COP',
      subscribers: 'Subscribers',
      trials: 'Trials',
      crToPaid: 'CR %',
    };

    visibleMetrics.forEach(metric => {
      if (metricHeaders[metric]) {
        headers.push(metricHeaders[metric]);
      }
    });

    const rows = sortedCountries.map((c, i) => {
      const row: (string | number)[] = [i + 1, c.country, c.countryCode];
      if (showSource === 'all') row.push(c.source);

      visibleMetrics.forEach(metric => {
        if (metric === 'revenue') row.push(c.revenue);
        else if (metric === 'spend') row.push(c.spend);
        else if (metric === 'roas') row.push(c.roas != null ? (c.roas * 100).toFixed(1) + '%' : '');
        else if (metric === 'cop') row.push(c.cop != null ? c.cop.toFixed(2) : '');
        else if (metric === 'subscribers') row.push(c.subscribers);
        else if (metric === 'trials') row.push(c.trials);
        else if (metric === 'crToPaid') row.push(c.crToPaid != null ? (c.crToPaid * 100).toFixed(1) + '%' : '');
      });

      return row;
    });

    exportToCSV('countries-ranking', headers, rows);
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return null;
    return sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 }}>
            <Globe size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Countries Ranking
          </h3>
          <p style={{ fontSize: 12, color: '#6b7280' }}>
            Performance by country. Top {topN} by {sortKey}.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(['all', 'apple_ads', 'organic'] as const).map(source => (
            <button
              key={source}
              onClick={() => setShowSource(source)}
              style={{
                padding: '6px 12px',
                background: showSource === source ? '#3b82f6' : '#f3f4f6',
                color: showSource === source ? '#fff' : '#374151',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {source === 'all' ? 'All' : source === 'apple_ads' ? 'Apple Ads' : 'Organic'}
            </button>
          ))}
          <button
            onClick={handleExport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '6px 12px',
              background: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            title="Export to CSV"
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <MetricSelector
          options={METRIC_OPTIONS}
          onChange={handleMetricsChange}
          storageKey="countries-visible-metrics"
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>#</th>
              <th
                style={{ ...thStyle, cursor: 'pointer' }}
                onClick={() => handleSort('country')}
              >
                Country <SortIcon column="country" />
              </th>
              {showSource === 'all' && <th style={thStyle}>Source</th>}
              {visibleMetrics.includes('revenue') && (
                <th
                  style={{ ...thRightStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('revenue')}
                >
                  Revenue <SortIcon column="revenue" />
                </th>
              )}
              {visibleMetrics.includes('spend') && (
                <th
                  style={{ ...thRightStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('spend')}
                >
                  Spend <SortIcon column="spend" />
                </th>
              )}
              {visibleMetrics.includes('roas') && (
                <th
                  style={{ ...thRightStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('roas')}
                >
                  ROAS <SortIcon column="roas" />
                </th>
              )}
              {visibleMetrics.includes('cop') && (
                <th
                  style={{ ...thRightStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('cop')}
                >
                  COP <SortIcon column="cop" />
                </th>
              )}
              {visibleMetrics.includes('subscribers') && (
                <th
                  style={{ ...thRightStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('subscribers')}
                >
                  Subs <SortIcon column="subscribers" />
                </th>
              )}
              {visibleMetrics.includes('trials') && (
                <th
                  style={{ ...thRightStyle, cursor: 'pointer' }}
                  onClick={() => handleSort('trials')}
                >
                  Trials <SortIcon column="trials" />
                </th>
              )}
              {visibleMetrics.includes('crToPaid') && (
                <th style={thRightStyle}>CR %</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedCountries.map((country, i) => {
              const roasOk = country.roas != null && country.roas >= 1;
              const copOk = country.cop != null && country.cop < 50;
              return (
                <tr key={`${country.country}-${country.source}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...tdStyle, color: '#9ca3af', width: 32 }}>{i + 1}</td>
                  <td style={tdStyle}>
                    <span style={{ marginRight: 8 }}>{getFlag(country.countryCode)}</span>
                    {country.country}
                  </td>
                  {showSource === 'all' && (
                    <td style={tdStyle}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: country.source === 'apple_ads' ? '#dbeafe' : '#ecfdf5',
                        color: country.source === 'apple_ads' ? '#1d4ed8' : '#047857',
                      }}>
                        {country.source === 'apple_ads' ? 'Ads' : 'Organic'}
                      </span>
                    </td>
                  )}
                  {visibleMetrics.includes('revenue') && (
                    <td style={tdRightStyle}>${country.revenue.toLocaleString()}</td>
                  )}
                  {visibleMetrics.includes('spend') && (
                    <td style={tdRightStyle}>
                      {country.spend > 0 ? `$${country.spend.toLocaleString()}` : '—'}
                    </td>
                  )}
                  {visibleMetrics.includes('roas') && (
                    <td style={{
                      ...tdRightStyle,
                      color: country.roas == null ? '#9ca3af' : roasOk ? '#10b981' : '#ef4444',
                      fontWeight: roasOk ? 600 : 400,
                    }}>
                      {country.roas != null ? `${(country.roas * 100).toFixed(0)}%` : '—'}
                    </td>
                  )}
                  {visibleMetrics.includes('cop') && (
                    <td style={{
                      ...tdRightStyle,
                      color: country.cop == null ? '#9ca3af' : copOk ? '#10b981' : '#ef4444',
                    }}>
                      {country.cop != null ? `$${country.cop.toFixed(0)}` : '—'}
                    </td>
                  )}
                  {visibleMetrics.includes('subscribers') && (
                    <td style={tdRightStyle}>{country.subscribers}</td>
                  )}
                  {visibleMetrics.includes('trials') && (
                    <td style={tdRightStyle}>{country.trials}</td>
                  )}
                  {visibleMetrics.includes('crToPaid') && (
                    <td style={tdRightStyle}>
                      {country.crToPaid != null ? `${(country.crToPaid * 100).toFixed(1)}%` : '—'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {data.totals && (
            <tfoot>
              <tr style={{ background: '#f9fafb', fontWeight: 600 }}>
                <td style={tdStyle}></td>
                <td style={tdStyle}>Total</td>
                {showSource === 'all' && <td style={tdStyle}></td>}
                {visibleMetrics.includes('revenue') && (
                  <td style={tdRightStyle}>${data.totals.revenue.toLocaleString()}</td>
                )}
                {visibleMetrics.includes('spend') && (
                  <td style={tdRightStyle}>${data.totals.spend.toLocaleString()}</td>
                )}
                {visibleMetrics.includes('roas') && (
                  <td style={{
                    ...tdRightStyle,
                    color: data.totals.roas && data.totals.roas >= 1 ? '#10b981' : '#ef4444',
                  }}>
                    {data.totals.roas != null ? `${(data.totals.roas * 100).toFixed(0)}%` : '—'}
                  </td>
                )}
                {visibleMetrics.includes('cop') && (
                  <td style={tdRightStyle}>
                    {data.totals.cop != null ? `$${data.totals.cop.toFixed(0)}` : '—'}
                  </td>
                )}
                {visibleMetrics.includes('subscribers') && (
                  <td style={tdRightStyle}>{data.totals.subscribers}</td>
                )}
                {visibleMetrics.includes('trials') && (
                  <td style={tdRightStyle}></td>
                )}
                {visibleMetrics.includes('crToPaid') && (
                  <td style={tdRightStyle}></td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #e5e7eb',
  color: '#6b7280',
  fontWeight: 500,
  fontSize: 12,
  whiteSpace: 'nowrap',
};

const thRightStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: 'right',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  color: '#111827',
};

const tdRightStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontFamily: "'JetBrains Mono', monospace",
};
