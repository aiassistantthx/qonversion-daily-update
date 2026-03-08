import { useState, useCallback } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Header } from './components/Header';
import { DailyDashboard } from './pages/DailyDashboard';
import { MarketingDashboard } from './pages/MarketingDashboard';
import { CohortsDashboard } from './pages/CohortsDashboard';
import { ForecastDashboard } from './pages/ForecastDashboard';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 2,
    },
  },
});

function DashboardContent() {
  const [activeTab, setActiveTab] = useState('daily');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const qc = useQueryClient();

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await qc.invalidateQueries();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [qc]);

  const renderContent = () => {
    switch (activeTab) {
      case 'daily':
        return <DailyDashboard />;
      case 'marketing':
        return <MarketingDashboard />;
      case 'cohorts':
        return <CohortsDashboard />;
      case 'forecast':
        return <ForecastDashboard />;
      default:
        return <DailyDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-terminal-bg">
      <Header
        onRefresh={handleRefresh}
        isLoading={isRefreshing}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <main>
        {renderContent()}
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardContent />
    </QueryClientProvider>
  );
}

export default App;
