import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, X, ChevronDown, Users } from 'lucide-react';
import { CohortTable, type CohortsData } from '../components/CohortTable';
import { RevenueByDayChart, PayerShareChart } from '../components';
import type { RevenueByDayData, PayerShareData } from '../components';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || '';

const fetchWithAuth = (url: string) => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['X-API-Key'] = API_KEY;
  return fetch(url, { headers }).then(r => r.json());
};

interface Country {
  country: string;
  spend: number;
}

export function Cohorts() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [limit, setLimit] = useState(12);
  const [campaignId, setCampaignId] = useState<string>('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [productType, setProductType] = useState<'all' | 'yearly' | 'weekly'>('all');

  const { data: countriesData } = useQuery<{ data: Country[] }>({
    queryKey: ['countries'],
    queryFn: () => fetchWithAuth(`${API_URL}/asa/countries?days=90`),
  });

  const { data, refetch, isFetching } = useQuery<CohortsData>({
    queryKey: ['cohorts', period, limit, campaignId, selectedCountries, productType],
    queryFn: () => {
      const params = new URLSearchParams({
        period,
        limit: String(limit),
      });
      if (campaignId) {
        params.set('campaign_id', campaignId);
      }
      if (selectedCountries.length > 0) {
        params.set('country', selectedCountries.join(','));
      }
      if (productType !== 'all') {
        params.set('product_type', productType);
      }
      return fetchWithAuth(`${API_URL}/asa/cohorts?${params}`);
    },
  });

  const { data: revenueByDayData } = useQuery<RevenueByDayData>({
    queryKey: ['revenue-by-day'],
    queryFn: () => fetchWithAuth(`${API_URL}/dashboard/revenue-by-day?months=12`),
  });

  const { data: payerShareData } = useQuery<PayerShareData>({
    queryKey: ['payer-share'],
    queryFn: () => fetchWithAuth(`${API_URL}/dashboard/payer-share?months=12`),
  });

  const [isCountryOpen, setIsCountryOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  const countries = countriesData?.data?.map(c => c.country).filter(Boolean) || [];

  const handleCountryChange = (country: string) => {
    setSelectedCountries(prev =>
      prev.includes(country)
        ? prev.filter(c => c !== country)
        : [...prev, country]
    );
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(event.target as Node)) {
        setIsCountryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            <Users size={24} style={{ marginRight: 8, color: '#8b5cf6' }} />
            Cohort ROAS Analysis
          </h1>
          <p style={styles.subtitle}>
            Revenue per user by cohort with LTV curves and payer share analysis
          </p>
        </div>
        <div style={styles.headerRight}>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'week' | 'month')}
            style={styles.select}
          >
            <option value="week">Weekly Cohorts</option>
            <option value="month">Monthly Cohorts</option>
          </select>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={styles.select}
          >
            <option value={8}>Last 8</option>
            <option value={12}>Last 12</option>
            <option value={16}>Last 16</option>
            <option value={24}>Last 24</option>
          </select>
          <select
            value={productType}
            onChange={(e) => setProductType(e.target.value as 'all' | 'yearly' | 'weekly')}
            style={styles.select}
          >
            <option value="all">All Subscriptions</option>
            <option value="yearly">Yearly Only</option>
            <option value="weekly">Weekly Only</option>
          </select>
          <div ref={countryRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setIsCountryOpen(!isCountryOpen)}
              style={{
                ...styles.select,
                width: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedCountries.length === 0 ? 'Countries' : `${selectedCountries.length} selected`}
              </span>
              <ChevronDown size={14} />
            </button>
            {isCountryOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                maxHeight: 300,
                overflowY: 'auto',
                zIndex: 100,
                minWidth: 200,
              }}>
                {selectedCountries.length > 0 && (
                  <div style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                      {selectedCountries.length} selected
                    </span>
                    <button
                      onClick={() => setSelectedCountries([])}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                )}
                {countries.map(country => (
                  <label
                    key={country}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: '#374151',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCountries.includes(country)}
                      onChange={() => handleCountryChange(country)}
                      style={{ marginRight: 8 }}
                    />
                    {country}
                  </label>
                ))}
              </div>
            )}
          </div>
          <input
            type="text"
            placeholder="Campaign ID (optional)"
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            style={{ ...styles.select, width: 180 }}
          />
          <button style={styles.refreshBtn} onClick={() => refetch()}>
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>
    </div>

      {selectedCountries.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Filtered by:</span>
          {selectedCountries.map(country => (
            <div
              key={country}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: 6,
                fontSize: 13,
                color: '#1e40af',
                fontWeight: 500,
              }}
            >
              {country}
              <button
                onClick={() => handleCountryChange(country)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: '#3b82f6',
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => setSelectedCountries([])}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: 12,
              textDecoration: 'underline',
            }}
          >
            Clear all
          </button>
        </div>
      )}

      <CohortTable data={data} />

      {/* Cumulative Revenue per User */}
      {revenueByDayData?.cohorts && <RevenueByDayChart data={revenueByDayData} />}

      {/* Payer Share */}
      {payerShareData?.cohorts && <PayerShareChart data={payerShareData} />}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: #f9fafb; }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1400,
    margin: '0 auto',
    padding: 24,
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  select: {
    padding: '8px 16px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontSize: 14,
    color: '#374151',
    cursor: 'pointer',
  },
  refreshBtn: {
    padding: 10,
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    color: '#6b7280',
  },
};
