import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { StatusBadge } from '../components/Badge';
import { getCampaigns, getRules, getHistory } from '../lib/api';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  MousePointer,
  Download,
  Cog,
} from 'lucide-react';

function MetricCard({ title, value, change, icon: Icon, prefix = '', suffix = '' }) {
  const isPositive = change > 0;

  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Icon className="h-6 w-6 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold">
            {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
          </p>
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {Math.abs(change)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: getCampaigns,
  });

  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => getRules({ enabled: true }),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['history', { limit: 10 }],
    queryFn: () => getHistory({ limit: 10 }),
  });

  // Calculate totals from campaign performance
  const campaigns = campaignsData?.data || [];
  const totalSpend = campaigns.reduce((sum, c) => sum + parseFloat(c.performance?.spend_7d || 0), 0);
  const totalImpressions = campaigns.reduce((sum, c) => sum + parseInt(c.performance?.impressions_7d || 0), 0);
  const totalTaps = campaigns.reduce((sum, c) => sum + parseInt(c.performance?.taps_7d || 0), 0);
  const totalInstalls = campaigns.reduce((sum, c) => sum + parseInt(c.performance?.installs_7d || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Apple Search Ads performance overview</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Spend (7d)"
          value={totalSpend.toFixed(2)}
          prefix="$"
          icon={DollarSign}
        />
        <MetricCard
          title="Impressions (7d)"
          value={totalImpressions}
          icon={MousePointer}
        />
        <MetricCard
          title="Taps (7d)"
          value={totalTaps}
          icon={MousePointer}
        />
        <MetricCard
          title="Installs (7d)"
          value={totalInstalls}
          icon={Download}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Campaigns */}
        <Card>
          <CardHeader>
            <CardTitle>Campaigns</CardTitle>
          </CardHeader>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Campaign</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader className="text-right">Spend (7d)</TableHeader>
                <TableHeader className="text-right">CPA</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {campaignsLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">Loading...</TableCell>
                </TableRow>
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500">No campaigns found</TableCell>
                </TableRow>
              ) : (
                campaigns.slice(0, 5).map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      ${parseFloat(campaign.performance?.spend_7d || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.performance?.cpa_7d
                        ? `$${parseFloat(campaign.performance.cpa_7d).toFixed(2)}`
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))
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
