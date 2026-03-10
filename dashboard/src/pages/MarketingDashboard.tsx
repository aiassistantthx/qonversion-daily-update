import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import { CopWaterfall } from '../components/CopWaterfall';
import { RevenueSourceBar } from '../components/RevenueSourceBar';
import { CampaignTable } from '../components/CampaignTable';
import { MetricCard, detectAnomaly } from '../components/MetricCard';
import { TopCountriesRoasWidget } from '../components/TopCountriesRoasWidget';

export function MarketingDashboard() {
  const { data: copData } = useQuery({
    queryKey: ['cop'],
    queryFn: () => api.getCop(30),
    refetchInterval: 60000,
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['cop-by-campaign'],
    queryFn: () => api.getCopByCampaign(30),
    refetchInterval: 60000,
  });

  const { data: revenueSource } = useQuery({
    queryKey: ['revenue-by-source'],
    queryFn: () => api.getRevenueBySource(30),
    refetchInterval: 60000,
  });

  const { data: dailyData } = useQuery({
    queryKey: ['daily'],
    queryFn: api.getDaily,
    refetchInterval: 60000,
  });

  const { data: topCountriesRoas } = useQuery({
    queryKey: ['top-countries-roas'],
    queryFn: () => api.getTopCountriesRoas(10),
    refetchInterval: 60000,
  });

  // Calculate CPA metrics
  const todayCpa = dailyData?.metrics?.[0]?.cpa;
  const weekAvgCpa = (dailyData?.metrics?.slice(0, 7).reduce((sum, m) => sum + (m.cpa || 0), 0) || 0) / 7;
  const cpaChange = todayCpa && weekAvgCpa ? ((todayCpa - weekAvgCpa) / weekAvgCpa) * 100 : undefined;

  // Extract historical data for anomaly detection
  const historicalCpa = dailyData?.metrics?.slice(0, 7).map(m => m.cpa || 0).filter(v => v > 0) || [];
  const historicalSpend = dailyData?.metrics?.slice(0, 30).map(m => m.spend || 0).filter(v => v > 0) || [];
  const historicalRevenue = dailyData?.metrics?.slice(0, 30).map(m => m.revenue || 0).filter(v => v > 0) || [];

  // Detect anomalies
  const cpaAnomaly = todayCpa ? detectAnomaly(todayCpa, historicalCpa, 'CPA', true) : undefined;
  const totalSpend = campaignsData?.campaigns.reduce((sum, c) => sum + c.spend, 0) || 0;
  const totalRevenue = revenueSource?.summary.total || 0;
  const spendAnomaly = totalSpend > 0 ? detectAnomaly(totalSpend, historicalSpend, 'Spend') : undefined;
  const revenueAnomaly = totalRevenue > 0 ? detectAnomaly(totalRevenue, historicalRevenue, 'Revenue') : undefined;

  return (
    <div className="p-6 space-y-6">
      {/* Top metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="CPA Today"
          value={todayCpa ? `$${todayCpa.toFixed(2)}` : '—'}
          change={cpaChange ? -cpaChange : undefined} // Inverted: lower is better
          changeLabel="Cost per acquisition"
          anomaly={cpaAnomaly}
        />
        <MetricCard
          title="CPA 7d Avg"
          value={weekAvgCpa ? `$${weekAvgCpa.toFixed(2)}` : '—'}
          format="currency"
        />
        <MetricCard
          title="Total Spend (30d)"
          value={totalSpend}
          format="currency"
          anomaly={spendAnomaly}
        />
        <MetricCard
          title="Total Revenue (30d)"
          value={totalRevenue}
          format="currency"
          anomaly={revenueAnomaly}
        />
      </div>

      {/* COP section */}
      <div className="grid grid-cols-2 gap-4">
        {copData && (
          <CopWaterfall data={copData.current} targetCop={50} />
        )}

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-4">COP Trend (d7)</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={copData?.trend || []}>
                <XAxis
                  dataKey="date"
                  stroke="#8b949e"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(val) => {
                    const date = new Date(val);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  stroke="#8b949e"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(val) => `$${val}`}
                  domain={['dataMin - 10', 'dataMax + 10']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                    color: '#e6edf3'
                  }}
                  formatter={(value) => [`$${Number(value)?.toFixed(2) || '—'}`, 'COP']}
                />
                <Line
                  type="monotone"
                  dataKey="cop"
                  stroke="#00d4ff"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                {/* Target line */}
                <Line
                  type="monotone"
                  dataKey={() => 50}
                  stroke="#ffcc00"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Organic vs Paid */}
      {revenueSource && (
        <div className="grid grid-cols-2 gap-4">
          <RevenueSourceBar
            organic={revenueSource.summary.organic}
            paid={revenueSource.summary.paid}
            organicPercent={revenueSource.summary.organicPercent}
            paidPercent={revenueSource.summary.paidPercent}
          />

          <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
            <div className="text-sm text-terminal-muted mb-4">Revenue by Source (Daily)</div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueSource.daily}>
                  <XAxis
                    dataKey="date"
                    stroke="#8b949e"
                    fontSize={10}
                    tickLine={false}
                    tickFormatter={(val) => {
                      const date = new Date(val);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis
                    stroke="#8b949e"
                    fontSize={10}
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
                    formatter={(value, name) => [
                      `$${Number(value)?.toFixed(0) || 0}`,
                      name === 'organic' ? 'Organic' : 'Paid'
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="organic"
                    stroke="#00ff88"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="paid"
                    stroke="#a371f7"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Campaign table */}
      {campaignsData && campaignsData.campaigns.length > 0 && (
        <CampaignTable campaigns={campaignsData.campaigns} />
      )}
    </div>
  );
}
