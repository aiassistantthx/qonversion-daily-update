import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import CampaignCreate from './pages/CampaignCreate';
import AdGroups from './pages/AdGroups';
import Keywords from './pages/Keywords';
import SearchTerms from './pages/SearchTerms';
import NegativeKeywords from './pages/NegativeKeywords';
import Rules from './pages/Rules';
import RuleEdit from './pages/RuleEdit';
import Templates from './pages/Templates';
import History from './pages/History';
import Countries from './pages/Countries';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ShortcutsHelp } from './components/ShortcutsHelp';

function App() {
  const { showHelp, setShowHelp } = useKeyboardShortcuts();

  return (
    <>
      <Layout>
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
          <Route path="/templates" element={<Templates />} />
          <Route path="/history" element={<History />} />
          <Route path="/countries" element={<Countries />} />
        </Routes>
      </Layout>
      <ShortcutsHelp open={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
}

export default App;
