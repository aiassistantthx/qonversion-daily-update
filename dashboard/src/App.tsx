import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Overview } from './pages/Overview';
import { MarketingDashboard } from './pages/MarketingDashboard';
import { CohortsDashboard } from './pages/CohortsDashboard';
import { ForecastDashboard } from './pages/ForecastDashboard';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60000, retry: 1 } },
});

function DashboardLayout() {
  const tabs = [
    { path: '/dashboard/overview', label: 'Overview' },
    { path: '/dashboard/marketing', label: 'Marketing' },
    { path: '/dashboard/cohorts', label: 'Cohorts' },
    { path: '/dashboard/forecast', label: 'Forecast' },
  ];

  return (
    <div style={styles.container}>
      {/* Header with Navigation */}
      <div style={styles.header}>
        <h1 style={styles.title}>Analytics Dashboard</h1>
        <nav style={styles.tabNav}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              style={({ isActive }) => ({
                ...styles.tab,
                ...(isActive ? styles.tabActive : {}),
              })}
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Content */}
      <Routes>
        <Route path="/overview" element={<Overview />} />
        <Route path="/marketing" element={<MarketingDashboard />} />
        <Route path="/cohorts" element={<CohortsDashboard />} />
        <Route path="/forecast" element={<ForecastDashboard />} />
        <Route path="/" element={<Navigate to="/dashboard/overview" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/dashboard/*" element={<DashboardLayout />} />
          <Route path="/" element={<Navigate to="/dashboard/overview" replace />} />
        </Routes>
      </BrowserRouter>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: #f9fafb; }
      `}</style>
    </QueryClientProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 1400,
    margin: '0 auto',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 24px 0 24px',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: '#111827',
  },
  tabNav: {
    display: 'flex',
    gap: 4,
    background: '#fff',
    padding: 4,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
  },
  tab: {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 500,
    color: '#6b7280',
    textDecoration: 'none',
    borderRadius: 6,
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  tabActive: {
    background: '#3b82f6',
    color: '#fff',
  },
};

export default App;
