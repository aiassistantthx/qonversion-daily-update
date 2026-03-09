import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Layers,
  KeyRound,
  Cog,
  FileText,
  History,
  RefreshCw,
  Calendar,
} from 'lucide-react';
import { useDateRange, DATE_PRESETS } from '../context/DateRangeContext';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { path: '/adgroups', label: 'Ad Groups', icon: Layers },
  { path: '/keywords', label: 'Keywords', icon: KeyRound },
  { path: '/rules', label: 'Rules', icon: Cog },
  { path: '/templates', label: 'Templates', icon: FileText },
  { path: '/history', label: 'History', icon: History },
];

function DateRangePicker() {
  const { days, isCustom, customFrom, customTo, setPreset, setCustomFrom, setCustomTo } = useDateRange();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 flex-wrap">
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => setPreset(preset.days)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              (!isCustom && days === preset.days) || (isCustom && preset.days === null)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {isCustom && (
        <div className="space-y-1">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white"
          />
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold">ASA Manager</h1>
          <p className="text-xs text-gray-400 mt-1">Apple Search Ads</p>
        </div>

        {/* Global Date Range Picker */}
        <div className="p-4 border-b border-gray-800">
          <p className="text-xs text-gray-400 mb-2">Date Range</p>
          <DateRangePicker />
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm">
            <RefreshCw size={16} />
            Sync Data
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
