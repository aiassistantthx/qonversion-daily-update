import { RefreshCw, Activity } from 'lucide-react';

interface HeaderProps {
  onRefresh: () => void;
  isLoading: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = [
  { id: 'daily', label: 'Daily' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'cohorts', label: 'Cohorts' },
  { id: 'forecast', label: 'Forecast' },
];

export function Header({ onRefresh, isLoading, activeTab, onTabChange }: HeaderProps) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const dateStr = now.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  return (
    <header className="bg-terminal-card border-b border-terminal-border px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-terminal-cyan" />
            <span className="text-lg font-semibold text-terminal-text">
              OPENCHAT TERMINAL
            </span>
          </div>
          <div className="h-4 w-px bg-terminal-border" />
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-terminal-green pulse-indicator" />
            <span className="text-xs text-terminal-muted font-mono">LIVE</span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded transition-colors ${
                activeTab === tab.id
                  ? 'bg-terminal-cyan/20 text-terminal-cyan'
                  : 'text-terminal-muted hover:text-terminal-text hover:bg-terminal-border/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-mono text-terminal-text">{timeStr}</div>
            <div className="text-xs text-terminal-muted">{dateStr}</div>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded bg-terminal-border hover:bg-terminal-muted/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-terminal-muted ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
