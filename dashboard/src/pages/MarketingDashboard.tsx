import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api';
import { CopWaterfall } from '../components/CopWaterfall';
import { RevenueSourceBar } from '../components/RevenueSourceBar';
import { CampaignTable } from '../components/CampaignTable';
import { MetricCard, detectAnomaly } from '../components/MetricCard';
import { TopCountriesRoasWidget } from '../components/TopCountriesRoasWidget';
import { KeywordTable } from '../components/KeywordTable';

export function MarketingDashboard() {
  const { data: copData, isLoading: copLoading } = useQuery({
    queryKey: ['cop'],
    queryFn: () => api.getCop(30),
    refetchInterval: 60000,
  });

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['cop-by-campaign'],
    queryFn: () => api.getCopByCampaign(30),
    refetchInterval: 60000,
  });

  const { data: revenueSource, isLoading: revenueLoading } = useQuery({
    queryKey: ['revenue-by-source'],
    queryFn: () => api.getRevenueBySource(30),
    refetchInterval: 60000,
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ['daily'],
    queryFn: api.getDaily,
    refetchInterval: 60000,
  });

  const { data: topCountriesRoas } = useQuery({
    queryKey: ['top-countries-roas'],
    queryFn: () => api.getTopCountriesRoas(10),
    refetchInterval: 60000,
  });

  const { data: marketingData, isLoading: marketingLoading, error: marketingError } = useQuery({
    queryKey: ['marketing'],
    queryFn: () => api.getMarketing(6),
    refetchInterval: 60000,
  });

  const { data: keywordsData } = useQuery({
    queryKey: ['keywords'],
    queryFn: () => api.getKeywords(30),
    refetchInterval: 60000,
  });

  const isLoading = copLoading || campaignsLoading || revenueLoading || dailyLoading || marketingLoading;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading marketing data...</div>
        </div>
      </div>
    );
  }

  if (marketingError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 font-medium mb-1">Error loading marketing data</div>
          <div className="text-red-600 text-sm">{marketingError.message}</div>
        </div>
      </div>
    );
  }

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
    <div className="p-6 space-y-6 bg-white">
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

      {/* Spend vs Revenue and ROAS Trend */}
      {marketingData && marketingData.data.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-600 mb-4 font-medium">Spend vs Revenue (Monthly)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...marketingData.data].reverse()}>
                  <XAxis
                    dataKey="month"
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      color: '#111827'
                    }}
                    formatter={(value, name) => [
                      `$${Number(value)?.toFixed(0) || 0}`,
                      name === 'spend' ? 'Spend' : 'Revenue (Total)'
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="spend"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="Spend"
                  />
                  <Line
                    type="monotone"
                    dataKey={(m) => m.revenue.total}
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Revenue"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-600 mb-4 font-medium">ROAS Trend (d7, Monthly)</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={[...marketingData.data].reverse()}>
                  <XAxis
                    dataKey="month"
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(val) => `${val.toFixed(1)}x`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      color: '#111827'
                    }}
                    formatter={(value) => [`${Number(value)?.toFixed(2) || '—'}x`, 'ROAS (d7)']}
                  />
                  <Line
                    type="monotone"
                    dataKey={(m) => m.roas.d7}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={true}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* COP section */}
      <div className="grid grid-cols-2 gap-4">
        {copData && (
          <CopWaterfall data={copData.current} targetCop={50} />
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="text-sm text-gray-600 mb-4 font-medium">COP Trend (d7)</div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={copData?.trend || []}>
                <XAxis
                  dataKey="date"
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(val) => {
                    const date = new Date(val);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  stroke="#6b7280"
                  fontSize={12}
                  tickLine={false}
                  tickFormatter={(val) => `$${val}`}
                  domain={['dataMin - 10', 'dataMax + 10']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    color: '#111827'
                  }}
                  formatter={(value) => [`$${Number(value)?.toFixed(2) || '—'}`, 'COP']}
                />
                <Line
                  type="monotone"
                  dataKey="cop"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
                {/* Target line */}
                <Line
                  type="monotone"
                  dataKey={() => 50}
                  stroke="#f59e0b"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Organic vs Paid and Top Countries */}
      {revenueSource && (
        <div className="grid grid-cols-2 gap-4">
          <RevenueSourceBar
            organic={revenueSource.summary.organic}
            paid={revenueSource.summary.paid}
            organicPercent={revenueSource.summary.organicPercent}
            paidPercent={revenueSource.summary.paidPercent}
          />

          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="text-sm text-gray-600 mb-4 font-medium">Revenue by Source (Daily)</div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueSource.daily}>
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(val) => {
                      const date = new Date(val);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      color: '#111827'
                    }}
                    formatter={(value, name) => [
                      `$${Number(value)?.toFixed(0) || 0}`,
                      name === 'organic' ? 'Organic' : 'Paid'
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="organic"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Organic"
                  />
                  <Line
                    type="monotone"
                    dataKey="paid"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    name="Paid"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Top Countries by ROAS */}
      {topCountriesRoas && topCountriesRoas.countries.length > 0 && (
        <TopCountriesRoasWidget countries={topCountriesRoas.countries} />
      )}

      {/* Campaign table */}
      {campaignsData && campaignsData.campaigns.length > 0 && (
        <CampaignTable campaigns={campaignsData.campaigns} />
      )}

      {/* Keywords table */}
      {keywordsData && keywordsData.keywords.length > 0 && (
        <KeywordTable keywords={keywordsData.keywords} />
      )}
    </div>
  );
}
