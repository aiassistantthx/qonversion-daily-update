import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelp } from './components/ShortcutsHelp';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const CampaignCreate = lazy(() => import('./pages/CampaignCreate'));
const AdGroups = lazy(() => import('./pages/AdGroups'));
const Keywords = lazy(() => import('./pages/Keywords'));
const SearchTerms = lazy(() => import('./pages/SearchTerms'));
const NegativeKeywords = lazy(() => import('./pages/NegativeKeywords'));
const Rules = lazy(() => import('./pages/Rules'));
const RuleEdit = lazy(() => import('./pages/RuleEdit'));
const RulesExecutionLog = lazy(() => import('./pages/RulesExecutionLog'));
const Templates = lazy(() => import('./pages/Templates'));
const History = lazy(() => import('./pages/History'));
const Countries = lazy(() => import('./pages/Countries'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  );
}

function App() {
  const { showHelp, setShowHelp } = useKeyboardShortcuts();

  return (
    <>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/campaigns/create" element={<CampaignCreate />} />
            <Route path="/adgroups" element={<AdGroups />} />
            <Route path="/keywords" element={<Keywords />} />
            <Route path="/search-terms" element={<SearchTerms />} />
            <Route path="/negative-keywords" element={<NegativeKeywords />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/rules/new" element={<RuleEdit />} />
            <Route path="/rules/:id/edit" element={<RuleEdit />} />
            <Route path="/rules/execution-log" element={<RulesExecutionLog />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/history" element={<History />} />
            <Route path="/countries" element={<Countries />} />
          </Routes>
        </Suspense>
      </Layout>
      <ShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
}

export default App;
