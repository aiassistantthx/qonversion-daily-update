import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { CohortTable, CohortsData } from '../components/CohortTable';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function Cohorts() {
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [limit, setLimit] = useState(12);
  const [campaignId, setCampaignId] = useState<string>('');

  const { data, refetch, isFetching } = useQuery<CohortsData>({
    queryKey: ['cohorts', period, limit, campaignId],
    queryFn: () => {
      const params = new URLSearchParams({
        period,
        limit: String(limit),
      });
      if (campaignId) {
        params.set('campaign_id', campaignId);
      }
      return fetch(`${API_URL}/asa/cohorts?${params}`).then(r => r.json());
    },
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Cohort ROAS Analysis</h1>
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

      <CohortTable data={data} />

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
    fontSize: 24,
    fontWeight: 600,
    color: '#111827',
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
