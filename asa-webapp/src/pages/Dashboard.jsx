import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { StatusBadge } from '../components/Badge';
import { getCampaigns, getRules, getHistory } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import {
  TrendingUp,
  DollarSign,
  MousePointer,
  Download,
  BarChart3,
} from 'lucide-react';

function MetricCard({ title, value, icon: Icon, prefix = '', suffix = '', color = 'blue', subtext }) {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
  };

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
          {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { queryParams, label: dateLabel } = useDateRange();

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

  // Helper to get performance value
  const getPerf = (campaign, field) => {
    const p = campaign.performance;
    if (!p) return 0;
    return parseFloat(p[field] || p[`${field}_7d`] || 0);
  };

  // Calculate totals from campaign performance
  const campaigns = campaignsData?.data || [];
  const totalSpend = campaigns.reduce((sum, c) => sum + getPerf(c, 'spend'), 0);
  const totalImpressions = campaigns.reduce((sum, c) => sum + getPerf(c, 'impressions'), 0);
  const totalTaps = campaigns.reduce((sum, c) => sum + getPerf(c, 'taps'), 0);
  const totalInstalls = campaigns.reduce((sum, c) => sum + getPerf(c, 'installs'), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + getPerf(c, 'revenue'), 0);
  const totalPaidUsers = campaigns.reduce((sum, c) => sum + getPerf(c, 'paid_users'), 0);

  const avgCpa = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const cop = totalPaidUsers > 0 ? totalSpend / totalPaidUsers : 0;

  // Sort campaigns by revenue for top performers
  const topCampaigns = [...campaigns]
    .sort((a, b) => getPerf(b, 'revenue') - getPerf(a, 'revenue'))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">{dateLabel}</p>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          title="Spend"
          value={totalSpend.toFixed(2)}
          prefix="$"
          icon={DollarSign}
          color="blue"
        />
        <MetricCard
          title="Revenue"
          value={totalRevenue.toFixed(2)}
          prefix="$"
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          title="ROAS"
          value={roas.toFixed(2)}
          suffix="x"
          icon={BarChart3}
          color={roas >= 1 ? 'green' : 'red'}
        />
        <MetricCard
          title="Installs"
          value={totalInstalls}
          icon={Download}
          color="purple"
        />
        <MetricCard
          title="CPA"
          value={avgCpa.toFixed(2)}
          prefix="$"
          icon={MousePointer}
          color="blue"
        />
        <MetricCard
          title="COP"
          value={cop.toFixed(2)}
          prefix="$"
          icon={DollarSign}
          color="purple"
          subtext={`${totalPaidUsers} paid users`}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-3 gap-4">
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
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading...</TableCell>
                </TableRow>
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
                        {campaignRoas.toFixed(2)}x
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
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading...</TableCell>
                </TableRow>
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
              <TableRow>
                <TableCell colSpan={6} className="text-center">Loading...</TableCell>
              </TableRow>
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
