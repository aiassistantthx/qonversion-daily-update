import { Trophy } from 'lucide-react';
import type { TopCountryRoas } from '../api';

interface TopCountriesRoasWidgetProps {
  countries: TopCountryRoas[];
  filterBySpend?: boolean; // Filter to top 50% by spend
}

function getFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export function TopCountriesRoasWidget({ countries, filterBySpend = true }: TopCountriesRoasWidgetProps) {
  if (!countries || countries.length === 0) {
    return (
      <div style={styles.card}>
        <div style={styles.header}>
          <Trophy size={18} style={{ color: '#f59e0b' }} />
          <span style={styles.title}>Top Countries by ROAS</span>
        </div>
        <div style={styles.empty}>No data available</div>
      </div>
    );
  }

  // Filter to top 50% by spend if enabled
  let filteredCountries = countries;
  if (filterBySpend && countries.length > 0) {
    // Sort by spend descending
    const sortedBySpend = [...countries].sort((a, b) => b.spend - a.spend);
    // Calculate total spend
    const totalSpend = sortedBySpend.reduce((sum, c) => sum + c.spend, 0);
    // Take countries until we reach 50% of spend
    let cumulativeSpend = 0;
    const top50Percent: TopCountryRoas[] = [];
    for (const country of sortedBySpend) {
      top50Percent.push(country);
      cumulativeSpend += country.spend;
      if (cumulativeSpend >= totalSpend * 0.5) break;
    }
    // Sort by ROAS for display
    filteredCountries = top50Percent.sort((a, b) => (b.roas || 0) - (a.roas || 0));
  }

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <Trophy size={18} style={{ color: '#f59e0b' }} />
        <span style={styles.title}>Top Countries by ROAS</span>
        <span style={styles.subtitle}>
          (top 50% by spend)
        </span>
      </div>
      <div style={styles.list}>
        {filteredCountries.map((country, index) => {
          const roasPercent = country.roas != null ? country.roas * 100 : 0;
          const isGood = roasPercent >= 100;

          return (
            <div key={country.country} style={styles.row}>
              <div style={styles.rowLeft}>
                <span style={styles.rank}>{index + 1}</span>
                <span style={styles.flag}>{getFlag(country.country)}</span>
                <span style={styles.countryName}>{country.country}</span>
              </div>
              <div style={styles.rowRight}>
                <div style={styles.metric}>
                  <span style={styles.metricLabel}>Revenue</span>
                  <span style={styles.metricValue}>${country.revenue.toLocaleString()}</span>
                </div>
                <div style={styles.metric}>
                  <span style={styles.metricLabel}>Spend</span>
                  <span style={styles.metricValue}>${country.spend.toLocaleString()}</span>
                </div>
                <div style={{ ...styles.metric, minWidth: 60 }}>
                  <span style={styles.metricLabel}>ROAS</span>
                  <span style={{
                    ...styles.metricValue,
                    fontWeight: 600,
                    color: isGood ? '#10b981' : '#f59e0b'
                  }}>
                    {roasPercent.toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111827',
  },
  subtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 4,
  },
  empty: {
    textAlign: 'center' as const,
    color: '#9ca3af',
    padding: 20,
    fontSize: 13,
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: 8,
    transition: 'background 0.15s',
    cursor: 'default',
  },
  rowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  rank: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
    width: 16,
  },
  flag: {
    fontSize: 18,
  },
  countryName: {
    fontSize: 14,
    fontWeight: 500,
    color: '#111827',
  },
  rowRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
  },
  metric: {
    textAlign: 'right' as const,
  },
  metricLabel: {
    display: 'block',
    fontSize: 11,
    color: '#9ca3af',
    marginBottom: 2,
  },
  metricValue: {
    display: 'block',
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#111827',
  },
};
