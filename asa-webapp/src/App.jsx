import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import AdGroups from './pages/AdGroups';
import Keywords from './pages/Keywords';
import Rules from './pages/Rules';
import Templates from './pages/Templates';
import History from './pages/History';
import Countries from './pages/Countries';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/adgroups" element={<AdGroups />} />
        <Route path="/keywords" element={<Keywords />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/history" element={<History />} />
        <Route path="/countries" element={<Countries />} />
      </Routes>
    </Layout>
  );
}

export default App;
