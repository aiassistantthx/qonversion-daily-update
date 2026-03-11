import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { StatusBadge } from '../components/Badge';
import { HealthScoreWidget } from '../components/HealthScoreWidget';
import ConversionFunnelChart from '../components/ConversionFunnelChart';
import TrendChart from '../components/TrendChart';
import { getTrafficLightStatus, getTrafficLightColor, getTrafficLightLabel } from '../components/TrafficLight';
import { getCampaigns, getRules, getHistory, getTrends, getCohortCac } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { CardSkeleton, TableSkeleton } from '../components/SkeletonLoader';
import { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  MousePointer,
  Download,
  BarChart3,
  Target,
} from 'lucide-react';

// Cohort KPI Card - shows CAC by D1, D4, D7, D14, D30 windows (closed cohorts only)
function CohortKpiCard({ data, isLoading }) {
  if (isLoading) {
    return (
      <Card className="border-2 border-gray-200">
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 text-gray-600">
              <Target className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600">Cohort CAC KPI</p>
              <p className="text-lg text-gray-400">Loading...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { target, cac, meta } = data;
  const windows = ['d1', 'd4', 'd7', 'd14', 'd30'];
  const labels = { d1: 'D1', d4: 'D4', d7: 'D7', d14: 'D14', d30: 'D30' };

  return (
    <Card className="border-2 border-blue-200 bg-blue-50/30">
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <Target className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-600">Cohort CAC KPI</p>
            <p className="text-xs text-gray-400">Target: ${target.toFixed(2)} (yearly payback)</p>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {windows.map(window => {
            const cacValue = cac[window];
            const metaData = meta[window];
            const hasData = cacValue !== null && metaData.cohorts > 0;
            const isOnTarget = hasData && cacValue <= target;
            const diff = hasData ? cacValue - target : 0;
            const percentDiff = hasData && target > 0 ? (diff / target) * 100 : 0;

            return (
              <div
                key={window}
                className={`text-center p-3 rounded-lg border ${
                  !hasData
                    ? 'border-gray-200 bg-gray-50'
                    : isOnTarget
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                <p className="text-xs font-medium text-gray-500 mb-1">{labels[window]}</p>
                {hasData ? (
                  <>
                    <p className={`text-lg font-bold ${isOnTarget ? 'text-green-600' : 'text-red-600'}`}>
                      ${cacValue.toFixed(0)}
                    </p>
                    <p className={`text-xs font-medium ${isOnTarget ? 'text-green-500' : 'text-red-500'}`}>
                      {diff >= 0 ? '+' : ''}{percentDiff.toFixed(0)}%
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {metaData.cohorts} cohorts
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-gray-400">—</p>
                    <p className="text-xs text-gray-400">no data</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Only closed cohorts are included (age &ge; window days)
        </p>
      </CardContent>
    </Card>
  );
}

function MetricCard({ title, value, prevValue, icon: Icon, prefix = '', suffix = '', color = 'blue', subtext, isLoading }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  const percentChange = prevValue && prevValue !== 0
    ? ((value - prevValue) / prevValue) * 100
    : null;

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <CardSkeleton />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colors[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold">
            {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
          </p>
          {percentChange !== null && (
            <p className={`text-xs font-medium ${percentChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {percentChange >= 0 ? '↑' : '↓'} {Math.abs(percentChange).toFixed(1)}% vs previous
            </p>
          )}
          {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { queryParams, label: dateLabel } = useDateRange();
  const [showConversionChart, setShowConversionChart] = useState(false);

  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns', queryParams],
    queryFn: () => getCampaigns(queryParams),
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => getRules({ enabled: true }),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['history', { limit: 10 }],
    queryFn: () => getHistory({ limit: 10 }),
  });

  const { data: trendsData } = useQuery({
    queryKey: ['trends', queryParams],
    queryFn: () => getTrends(queryParams),
  });

  const { data: cohortCacData, isLoading: cohortCacLoading } = useQuery({
    queryKey: ['cohortCac'],
    queryFn: () => getCohortCac(),
  });

  // Helper to get performance value
  const getPerf = (campaign, field) => {
    const p = campaign.performance;
    if (!p) return 0;
    return parseFloat(p[field] || p[`${field}_7d`] || 0);
  };

  // Use totals from API (includes all campaigns from DB, not just active ones)
  const campaigns = campaignsData?.data || [];
  const totals = campaignsData?.totals || {};
  const prevTotals = campaignsData?.prevTotals || {};
  const totalSpend = totals.spend || 0;
  const totalImpressions = totals.impressions || 0;
  const totalTaps = totals.taps || 0;
  const totalInstalls = totals.installs || 0;
  const totalRevenue = totals.revenue || 0;
  const totalPaidUsers = totals.paidUsers || 0;

  const avgCpa = totals.cpa || 0;
  const roas = totals.roas || 0;
  const cop = totals.cop || 0;

  const prevSpend = prevTotals.spend || 0;
  const prevRevenue = prevTotals.revenue || 0;
  const prevRoas = prevTotals.roas || 0;
  const prevInstalls = prevTotals.installs || 0;
  const prevCpa = prevTotals.cpa || 0;
  const prevCop = prevTotals.cop || 0;

  // Sort campaigns by revenue for top performers
  const topCampaigns = [...campaigns]
    .sort((a, b) => getPerf(b, 'revenue') - getPerf(a, 'revenue'))
    .slice(0, 5);

  // Calculate traffic light status counts
  const trafficLightCounts = campaigns.reduce((acc, campaign) => {
    const predictedRoas = campaign.performance?.predicted_roas_365;
    const status = getTrafficLightStatus(predictedRoas);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">{dateLabel}</p>
      </div>

      {/* Health Score and Main Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <HealthScoreWidget campaigns={campaigns} />
        <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard
          title="Spend"
          value={totalSpend.toFixed(2)}
          prevValue={prevSpend > 0 ? prevSpend.toFixed(2) : null}
          prefix="$"
          icon={DollarSign}
          color="blue"
          isLoading={campaignsLoading}
        />
        <MetricCard
          title="Revenue"
          value={totalRevenue.toFixed(2)}
          prevValue={prevRevenue > 0 ? prevRevenue.toFixed(2) : null}
          prefix="$"
          icon={TrendingUp}
          color="green"
          isLoading={campaignsLoading}
        />
        <MetricCard
          title="ROAS"
          value={(roas * 100).toFixed(0)}
          prevValue={prevRoas > 0 ? (prevRoas * 100).toFixed(0) : null}
          suffix="%"
          icon={BarChart3}
          color={roas >= 1 ? 'green' : 'red'}
          isLoading={campaignsLoading}
        />
        <MetricCard
          title="Installs"
          value={totalInstalls}
          prevValue={prevInstalls > 0 ? prevInstalls : null}
          icon={Download}
          color="purple"
          isLoading={campaignsLoading}
        />
        <MetricCard
          title="CPA"
          value={avgCpa.toFixed(2)}
          prevValue={prevCpa > 0 ? prevCpa.toFixed(2) : null}
          prefix="$"
          icon={MousePointer}
          color="blue"
          isLoading={campaignsLoading}
        />
        <MetricCard
          title="CAC"
          value={cop.toFixed(2)}
          prevValue={prevCop > 0 ? prevCop.toFixed(2) : null}
          prefix="$"
          icon={DollarSign}
          color="purple"
          subtext={`${totalPaidUsers} paid users`}
          isLoading={campaignsLoading}
        />
        </div>
      </div>

      {/* Cohort KPI Card */}
      <div className="grid grid-cols-1 gap-4">
        <CohortKpiCard data={cohortCacData} isLoading={cohortCacLoading} />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Impressions</p>
            <p className="text-xl font-bold">{totalImpressions.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Taps</p>
            <p className="text-xl font-bold">{totalTaps.toLocaleString()}</p>
            <p className="text-xs text-gray-400">
              TTR: {totalImpressions > 0 ? ((totalTaps / totalImpressions) * 100).toFixed(2) : 0}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-gray-500">Conversion Rate</p>
            <p className="text-xl font-bold">
              {totalTaps > 0 ? ((totalInstalls / totalTaps) * 100).toFixed(2) : 0}%
            </p>
            <p className="text-xs text-gray-400">Taps to Installs</p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Health Status */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Health Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {['ok', 'risk', 'bad', 'loss', 'unknown'].map(status => {
              const count = trafficLightCounts[status] || 0;
              const color = getTrafficLightColor(status);
              const label = getTrafficLightLabel(status);
              const total = campaigns.length || 1;
              const percentage = ((count / total) * 100).toFixed(0);

              return (
                <div key={status} className="text-center p-4 border rounded-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div
                      className="rounded-full"
                      style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: color,
                      }}
                    />
                    <span className="text-sm font-medium" style={{ color }}>
                      {label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-gray-400">{percentage}%</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-xs text-gray-500">
            <p><strong>OK:</strong> Predicted ROAS ≥ 1.5x | <strong>Risk:</strong> 1.0-1.5x | <strong>Bad:</strong> 0.5-1.0x | <strong>Loss:</strong> &lt; 0.5x</p>
          </div>
        </CardContent>
      </Card>

      {/* Trends Chart */}
      <TrendChart data={trendsData} />

      {/* Conversion Funnel Chart */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>Analytics</CardTitle>
            <button
              onClick={() => setShowConversionChart(!showConversionChart)}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 500,
                borderRadius: '6px',
                border: '1px solid #e5e7eb',
                background: showConversionChart ? '#3b82f6' : '#fff',
                color: showConversionChart ? '#fff' : '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {showConversionChart ? 'Hide' : 'Show'} Conversion Funnel
            </button>
          </div>
        </CardHeader>
        {showConversionChart && (
          <CardContent>
            <ConversionFunnelChart data={trendsData} />
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Campaigns by Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>Top Campaigns</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Campaign</TableHeader>
                <TableHeader className="text-right">Spend</TableHeader>
                <TableHeader className="text-right">Revenue</TableHeader>
                <TableHeader className="text-right">ROAS</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaignsLoading ? (
                <TableSkeleton rows={5} columns={4} />
              ) : topCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500">No campaigns found</TableCell>
                </TableRow>
              ) : (
                topCampaigns.map((campaign) => {
                  const spend = getPerf(campaign, 'spend');
                  const revenue = getPerf(campaign, 'revenue');
                  const campaignRoas = spend > 0 ? revenue / spend : 0;

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div className="font-medium">{campaign.name}</div>
                        <div className="text-xs text-gray-400">
                          {campaign.countriesOrRegions?.join(', ')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">${spend.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-600">${revenue.toFixed(2)}</TableCell>
                      <TableCell className={`text-right font-medium ${campaignRoas >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                        {(campaignRoas * 100).toFixed(0)}%
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Active Rules */}
        <Card>
          <CardHeader>
            <CardTitle>Active Rules</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Rule</TableHeader>
                <TableHeader>Scope</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Frequency</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rulesLoading ? (
                <TableSkeleton rows={5} columns={4} />
              ) : (rulesData?.data || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500">No active rules</TableCell>
                </TableRow>
              ) : (
                (rulesData?.data || []).slice(0, 5).map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{rule.scope}</TableCell>
                    <TableCell>{rule.action_type}</TableCell>
                    <TableCell>{rule.frequency}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Time</TableHeader>
              <TableHeader>Entity</TableHeader>
              <TableHeader>Change</TableHeader>
              <TableHeader>Old Value</TableHeader>
              <TableHeader>New Value</TableHeader>
              <TableHeader>Source</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {historyLoading ? (
              <TableSkeleton rows={10} columns={6} />
            ) : (historyData?.data || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-gray-500">No recent activity</TableCell>
              </TableRow>
            ) : (
              (historyData?.data || []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-gray-500">
                    {new Date(item.changed_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{item.entity_type} {item.entity_id}</TableCell>
                  <TableCell>{item.change_type}</TableCell>
                  <TableCell className="text-gray-500">{item.old_value || '-'}</TableCell>
                  <TableCell className="text-gray-900 font-medium">{item.new_value || '-'}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.source} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
