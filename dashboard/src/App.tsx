import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { Overview } from './pages/Overview';
import { MarketingDashboard } from './pages/MarketingDashboard';
import { CohortsDashboard } from './pages/CohortsDashboard';
import { ForecastDashboard } from './pages/ForecastDashboard';
import { Planning } from './pages/Planning';
import { ThemeContext, useThemeProvider, themes } from './styles/themes';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from './components';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60000, retry: 1 } },
});

function DashboardLayout() {
  const { theme, toggleTheme } = useThemeProvider();
  const currentTheme = themes[theme];
  const [showHelp, setShowHelp] = useState(false);

  const shortcuts = useKeyboardShortcuts({
    onRefresh: () => window.location.reload(),
    onShowHelp: () => setShowHelp(true),
  });

  const tabs = [
    { path: '/dashboard/overview', label: 'Overview' },
    { path: '/dashboard/marketing', label: 'Marketing' },
    { path: '/dashboard/cohorts', label: 'Cohorts' },
    { path: '/dashboard/forecast', label: 'Forecast' },
    { path: '/dashboard/planning', label: 'Planning' },
  ];

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div style={{ ...styles.container, background: currentTheme.bg, minHeight: '100vh' }}>
        <div style={{ ...styles.header }}>
          <h1 style={{ ...styles.title, color: currentTheme.text }}>Analytics Dashboard</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <nav style={{ ...styles.tabNav, background: currentTheme.cardBg, borderColor: currentTheme.border }}>
              {tabs.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  style={({ isActive }) => ({
                    ...styles.tab,
                    color: isActive ? (theme === 'dark' ? '#000' : '#fff') : currentTheme.textMuted,
                    ...(isActive ? { ...styles.tabActive, background: currentTheme.accent } : {}),
                  })}
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
            <button
              onClick={toggleTheme}
              style={{
                ...styles.themeToggle,
                background: currentTheme.cardBg,
                borderColor: currentTheme.border,
                color: currentTheme.text,
              }}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button
              onClick={() => setShowHelp(true)}
              style={{
                ...styles.themeToggle,
                background: currentTheme.cardBg,
                borderColor: currentTheme.border,
                color: currentTheme.text,
              }}
              title="Keyboard shortcuts (Shift + ?)"
            >
              ?
            </button>
          </div>
        </div>

        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/marketing" element={<MarketingDashboard />} />
          <Route path="/cohorts" element={<CohortsDashboard />} />
          <Route path="/forecast" element={<ForecastDashboard />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/" element={<Navigate to="/dashboard/overview" replace />} />
        </Routes>

        {showHelp && (
          <ShortcutsHelpModal
            shortcuts={shortcuts}
            onClose={() => setShowHelp(false)}
          />
        )}
      </div>
    </ThemeContext.Provider>
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
        body { font-family: 'Inter', -apple-system, sans-serif; }
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
  },
  tabNav: {
    display: 'flex',
    gap: 4,
    padding: 4,
    borderRadius: 8,
    border: '1px solid',
  },
  tab: {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 500,
    textDecoration: 'none',
    borderRadius: 6,
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  tabActive: {},
  themeToggle: {
    padding: '8px 12px',
    fontSize: 18,
    border: '1px solid',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default App;
