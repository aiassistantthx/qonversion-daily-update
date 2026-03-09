import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard,
  Megaphone,
  Layers,
  KeyRound,
  XCircle,
  Cog,
  FileText,
  History,
  Globe,
  Search,
  Moon,
  Sun,
  Menu,
  X,
} from 'lucide-react';
import { useDateRange, DATE_PRESETS } from '../context/DateRangeContext';
import { useTheme } from '../context/ThemeContext';
import { SyncStatus } from './SyncStatus';
import { DataFreshness } from './DataFreshness';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { path: '/adgroups', label: 'Ad Groups', icon: Layers },
  { path: '/keywords', label: 'Keywords', icon: KeyRound },
  { path: '/search-terms', label: 'Search Terms', icon: Search },
  { path: '/negative-keywords', label: 'Negative Keywords', icon: XCircle },
  { path: '/countries', label: 'Countries', icon: Globe },
  { path: '/rules', label: 'Rules', icon: Cog },
  { path: '/templates', label: 'Templates', icon: FileText },
  { path: '/history', label: 'History', icon: History },
];

function DateRangePicker() {
  const { days, isCustom, customFrom, customTo, compareEnabled, setPreset, setCustomFrom, setCustomTo, setCompareEnabled } = useDateRange();

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
                : 'bg-gray-700 dark:bg-gray-800 text-gray-300 hover:bg-gray-600 dark:hover:bg-gray-700'
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
            className="w-full px-2 py-1 text-xs bg-gray-700 dark:bg-gray-800 border border-gray-600 dark:border-gray-700 rounded text-white"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-full px-2 py-1 text-xs bg-gray-700 dark:bg-gray-800 border border-gray-600 dark:border-gray-700 rounded text-white"
          />
        </div>
      )}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="compare-toggle"
          checked={compareEnabled}
          onChange={(e) => setCompareEnabled(e.target.checked)}
          className="w-3 h-3 rounded border-gray-600 dark:border-gray-700 bg-gray-700 dark:bg-gray-800 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="compare-toggle" className="text-xs text-gray-300 cursor-pointer">
          Compare to previous period
        </label>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-gray-900 text-white"
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        w-64 bg-gray-900 dark:bg-gray-950 text-white flex flex-col border-r border-gray-800 dark:border-gray-900
        fixed lg:static inset-y-0 left-0 z-40 transform transition-transform duration-300
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4 border-b border-gray-800 dark:border-gray-900 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">ASA Manager</h1>
            <p className="text-xs text-gray-400 mt-1">Apple Search Ads</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-900 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        {/* Global Date Range Picker */}
        <div className="p-4 border-b border-gray-800 dark:border-gray-900">
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
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 dark:hover:bg-gray-900 hover:text-white'
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

        <div className="p-4 border-t border-gray-800 dark:border-gray-900">
          <SyncStatus />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 w-full lg:w-auto">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 lg:px-6 py-3 pt-16 lg:pt-3">
          <DataFreshness />
        </div>
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
