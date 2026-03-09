import { useQuery } from '@tanstack/react-query';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { api } from '../api';
import { MetricCard } from '../components/MetricCard';
import { HealthGauge } from '../components/HealthGauge';
import { YoYComparisonCards } from '../components/YoYComparisonCards';
import { AlertTriangle, CheckCircle, DollarSign, Users, Zap } from 'lucide-react';

export function DailyDashboard() {
  const { data: summary } = useQuery({
    queryKey: ['summary'],
    queryFn: api.getSummary,
    refetchInterval: 60000,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 60000,
  });

  const { data: dailyData } = useQuery({
    queryKey: ['daily'],
    queryFn: api.getDaily,
    refetchInterval: 60000,
  });

  const { data: intraday } = useQuery({
    queryKey: ['intraday'],
    queryFn: api.getIntraday,
    refetchInterval: 60000,
  });

  const { data: yoyData } = useQuery({
    queryKey: ['yoy'],
    queryFn: api.getYoY,
    refetchInterval: 300000, // 5 minutes
  });

  const revenueSparkline = dailyData?.metrics
    ?.slice(0, 7)
    .reverse()
    .map(m => m.revenue) || [];

  const trialsSparkline = dailyData?.metrics
    ?.slice(0, 7)
    .reverse()
    .map(m => m.trials) || [];

  // Calculate COP from daily data
  const todayCop = dailyData?.metrics?.[0]?.cop;
  const yesterdayCop = dailyData?.metrics?.[1]?.cop;
  const copChange = todayCop && yesterdayCop
    ? ((todayCop - yesterdayCop) / yesterdayCop) * 100
    : undefined;

  // Anomaly detection (simple threshold-based)
  const anomalies = [];
  if (health && health.components.cop.value > 60) {
    anomalies.push({ type: 'warning', message: `COP above target: $${health.components.cop.value.toFixed(0)}` });
  }
  if (health && health.components.conversion.rate < 0.10) {
    anomalies.push({ type: 'warning', message: `Low conversion: ${(health.components.conversion.rate * 100).toFixed(1)}%` });
  }
  if (summary && summary.vsYesterday.revenue < -20) {
    anomalies.push({ type: 'critical', message: `Revenue down ${summary.vsYesterday.revenue.toFixed(1)}% vs yesterday` });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Top row - Health + Today's metrics */}
      <div className="grid grid-cols-4 gap-4">
        {health && (
          <HealthGauge score={health.score} status={health.status} />
        )}

        <MetricCard
          title="Revenue Today"
          value={summary?.today.revenue || 0}
          change={summary?.vsYesterday.revenue}
          changeLabel={`vs $${summary?.today.revenue ? (summary.today.revenue - (summary.vsYesterday.revenueAbsolute || 0)).toLocaleString() : 0} yesterday`}
          sparkline={revenueSparkline}
          format="currency"
        />

        <MetricCard
          title="Trials"
          value={summary?.today.trials || 0}
          sparkline={trialsSparkline}
        />

        <MetricCard
          title="COP"
          value={todayCop ? `$${todayCop.toFixed(0)}` : '—'}
          change={copChange}
          changeLabel="Cost per payer (d7)"
        />
      </div>

      {/* Comparison cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3">vs Yesterday</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className={`text-xl font-mono ${
                (summary?.vsYesterday.revenue || 0) >= 0 ? 'text-terminal-green' : 'text-terminal-red'
              }`}>
                {(summary?.vsYesterday.revenue || 0) >= 0 ? '+' : ''}
                {summary?.vsYesterday.revenue?.toFixed(1) || 0}%
              </div>
              <div className="text-xs text-terminal-muted">Revenue</div>
            </div>
            <div>
              <div className="text-xl font-mono text-terminal-text">
                {summary?.today.trials || 0}
              </div>
              <div className="text-xs text-terminal-muted">Trials</div>
            </div>
            <div>
              <div className="text-xl font-mono text-terminal-text">
                ${summary?.today.spend?.toFixed(0) || 0}
              </div>
              <div className="text-xs text-terminal-muted">Spend</div>
            </div>
          </div>
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3">vs 7d Average</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className={`text-xl font-mono ${
                (summary?.vs7dAvg.revenue || 0) >= 0 ? 'text-terminal-green' : 'text-terminal-red'
              }`}>
                {(summary?.vs7dAvg.revenue || 0) >= 0 ? '+' : ''}
                {summary?.vs7dAvg.revenue?.toFixed(1) || 0}%
              </div>
              <div className="text-xs text-terminal-muted">Revenue</div>
            </div>
            <div>
              <div className="text-xl font-mono text-terminal-cyan">
                ${summary?.vs7dAvg.revenueAbsolute?.toFixed(0) || 0}
              </div>
              <div className="text-xs text-terminal-muted">Difference</div>
            </div>
            <div>
              <div className={`text-xl font-mono ${health?.status === 'excellent' || health?.status === 'good' ? 'text-terminal-green' : 'text-terminal-yellow'}`}>
                {health?.status || '—'}
              </div>
              <div className="text-xs text-terminal-muted">Status</div>
            </div>
          </div>
        </div>
      </div>

      {/* Year-over-Year Comparison */}
      <YoYComparisonCards data={yoyData} />

      {/* Intraday chart */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
        <div className="text-sm text-terminal-muted mb-4">Intraday Revenue</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={intraday?.hourly || []}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="hour"
                tickFormatter={(val) => new Date(val).getHours().toString().padStart(2, '0')}
                stroke="#8b949e"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#8b949e"
                fontSize={12}
                tickLine={false}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  color: '#e6edf3'
                }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']}
                labelFormatter={(label) => new Date(label).toLocaleTimeString()}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#00d4ff"
                fill="url(#revenueGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row - Acquisition + Spend + Anomalies */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Acquisition
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-terminal-muted">Trials</span>
              <span className="font-mono text-terminal-text">{summary?.today.trials || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">New Subs</span>
              <span className="font-mono text-terminal-text">{summary?.today.newSubs || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">Converted</span>
              <span className="font-mono text-terminal-green">{summary?.today.converted || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">T→P Conv</span>
              <span className="font-mono text-terminal-text">
                {health?.components.conversion.rate
                  ? `${(health.components.conversion.rate * 100).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Spend Pacing
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-terminal-muted">Today</span>
              <span className="font-mono text-terminal-text">${summary?.today.spend?.toFixed(0) || 0}</span>
            </div>
            <div className="h-3 bg-terminal-border rounded overflow-hidden">
              <div
                className="h-full bg-terminal-cyan"
                style={{ width: `${Math.min(100, ((summary?.today.spend || 0) / 500) * 100)}%` }}
              />
            </div>
            <div className="text-xs text-terminal-muted">
              {((summary?.today.spend || 0) / 500 * 100).toFixed(0)}% of $500 daily budget
            </div>
          </div>
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Anomalies
          </div>
          <div className="space-y-2">
            {anomalies.length === 0 ? (
              <div className="flex items-center gap-2 text-terminal-green">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">All metrics normal</span>
              </div>
            ) : (
              anomalies.map((anomaly, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 ${
                    anomaly.type === 'critical' ? 'text-terminal-red' : 'text-terminal-yellow'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">{anomaly.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
