import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { StatusBadge, Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { Delta } from '../components/Delta';
import { getRuleExecutions, undoRuleExecution } from '../lib/api';
import { Clock, CheckCircle, XCircle, AlertCircle, PlayCircle, Undo2, TrendingUp, TrendingDown, Activity } from 'lucide-react';

function getStatusIcon(status) {
  switch (status) {
    case 'executed':
      return <CheckCircle size={14} className="text-green-500" />;
    case 'failed':
      return <XCircle size={14} className="text-red-500" />;
    case 'dry_run':
      return <PlayCircle size={14} className="text-blue-500" />;
    case 'skipped':
      return <AlertCircle size={14} className="text-yellow-500" />;
    default:
      return <Clock size={14} className="text-gray-400" />;
  }
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatMetrics(metrics) {
  if (!metrics) return null;

  const parsed = typeof metrics === 'string' ? JSON.parse(metrics) : metrics;
  return (
    <div className="text-xs space-y-1">
      {parsed.spend !== undefined && <div>Spend: ${parsed.spend?.toFixed(2) || 0}</div>}
      {parsed.cpa !== undefined && <div>CPA: ${parsed.cpa?.toFixed(2) || '-'}</div>}
      {parsed.installs !== undefined && <div>Installs: {parsed.installs || 0}</div>}
      {parsed.taps !== undefined && <div>Taps: {parsed.taps || 0}</div>}
      {parsed.ttr !== undefined && <div>TTR: {parsed.ttr?.toFixed(2) || 0}%</div>}
    </div>
  );
}

function BeforeAfter({ previous, current, actionType }) {
  if (!previous && !current) return <span className="text-xs text-gray-400">-</span>;

  const prev = typeof previous === 'string' ? JSON.parse(previous) : previous;
  const curr = typeof current === 'string' ? JSON.parse(current) : current;

  if (actionType === 'adjust_bid' || actionType === 'set_bid') {
    const prevBid = parseFloat(prev) || 0;
    const currBid = parseFloat(curr) || 0;
    const change = currBid - prevBid;
    const changePercent = prevBid > 0 ? ((change / prevBid) * 100) : 0;

    return (
      <div className="text-xs">
        <div className="text-gray-500">${prevBid.toFixed(2)}</div>
        <div className="flex items-center gap-1">
          {change > 0 ? <TrendingUp size={12} className="text-green-500" /> : <TrendingDown size={12} className="text-red-500" />}
          <span className="font-medium">${currBid.toFixed(2)}</span>
          <span className={change > 0 ? 'text-green-600' : 'text-red-600'}>
            ({change > 0 ? '+' : ''}{changePercent.toFixed(1)}%)
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <span className="text-gray-400">{String(prev)}</span>
      {' → '}
      <span className="font-medium">{String(curr)}</span>
    </div>
  );
}

export default function RulesExecutionLog() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    status: '',
    ruleId: '',
    entityType: '',
    dateFrom: '',
    dateTo: '',
    actionType: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['rule-executions', filters],
    queryFn: () => getRuleExecutions(filters),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const undoMutation = useMutation({
    mutationFn: undoRuleExecution,
    onSuccess: () => {
      queryClient.invalidateQueries(['rule-executions']);
      alert('Successfully undone the rule execution');
    },
    onError: (error) => {
      alert(`Failed to undo: ${error.message}`);
    },
  });

  const executions = data?.data || [];
  const stats = data?.stats || {
    todayTotal: 0,
    todayExecuted: 0,
    todayFailed: 0,
    weekTotal: 0,
  };

  const todayRules = data?.todayRules || [];

  const canUndo = (execution) => {
    const executedAt = new Date(execution.executed_at);
    const now = new Date();
    const hoursSince = (now - executedAt) / (1000 * 60 * 60);

    return (
      execution.status === 'executed' &&
      hoursSince <= 24 &&
      (execution.action_type === 'adjust_bid' || execution.action_type === 'set_bid' || execution.action_type === 'pause')
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rules Execution Log</h1>
        <p className="text-gray-500">Detailed history of all automation rule executions</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Today's Executions</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.todayTotal}</div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.todayExecuted} executed • {stats.todayFailed} failed
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">This Week</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.weekTotal}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Active Rules Today</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{todayRules.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-500">Success Rate</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {stats.todayTotal > 0 ? ((stats.todayExecuted / stats.todayTotal) * 100).toFixed(1) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rules Active Today */}
      {todayRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity size={18} />
              Rules Triggered Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {todayRules.map((rule) => (
                <div key={rule.rule_id} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border">
                  <Badge>{rule.rule_name}</Badge>
                  <span className="text-sm text-gray-500">
                    {rule.execution_count} executions
                  </span>
                  {rule.last_executed_at && (
                    <span className="text-xs text-gray-400">
                      Last: {new Date(rule.last_executed_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-6 gap-4">
            <Select
              label="Status"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'executed', label: 'Executed' },
                { value: 'failed', label: 'Failed' },
                { value: 'dry_run', label: 'Dry Run' },
                { value: 'skipped', label: 'Skipped' },
              ]}
            />

            <Select
              label="Entity Type"
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
              options={[
                { value: '', label: 'All Types' },
                { value: 'keyword', label: 'Keyword' },
                { value: 'adgroup', label: 'Ad Group' },
                { value: 'campaign', label: 'Campaign' },
              ]}
            />

            <Select
              label="Action Type"
              value={filters.actionType}
              onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
              options={[
                { value: '', label: 'All Actions' },
                { value: 'adjust_bid', label: 'Adjust Bid' },
                { value: 'set_bid', label: 'Set Bid' },
                { value: 'pause', label: 'Pause' },
                { value: 'enable', label: 'Enable' },
                { value: 'send_alert', label: 'Send Alert' },
              ]}
            />

            <Input
              label="Date From"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />

            <Input
              label="Date To"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />

            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => setFilters({
                  status: '',
                  ruleId: '',
                  entityType: '',
                  dateFrom: '',
                  dateTo: '',
                  actionType: '',
                })}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Executions Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10"></TableHeader>
              <TableHeader>Time</TableHeader>
              <TableHeader>Rule</TableHeader>
              <TableHeader>Entity</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Action</TableHeader>
              <TableHeader>Before → After</TableHeader>
              <TableHeader>Metrics</TableHeader>
              <TableHeader>Duration</TableHeader>
              <TableHeader className="w-20">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">Loading executions...</TableCell>
              </TableRow>
            ) : executions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-0">
                  <EmptyState
                    icon={Clock}
                    title="No executions found"
                    description="No rule executions match your filters"
                  />
                </TableCell>
              </TableRow>
            ) : (
              executions.map((execution) => (
                <TableRow key={execution.id} className="hover:bg-gray-50">
                  <TableCell>
                    {getStatusIcon(execution.status)}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <div>{new Date(execution.executed_at).toLocaleDateString()}</div>
                    <div className="text-gray-500">
                      {new Date(execution.executed_at).toLocaleTimeString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{execution.rule_name}</div>
                    <div className="text-xs text-gray-500">ID: {execution.rule_id}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs">
                        {execution.entity_type}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        #{execution.entity_id.toString().slice(-6)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={execution.status.toUpperCase()}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="info" className="text-xs">
                      {execution.action_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {execution.status === 'failed' ? (
                      <span className="text-xs text-red-600" title={execution.error_message}>
                        Error: {execution.error_message?.substring(0, 30)}...
                      </span>
                    ) : execution.status === 'skipped' ? (
                      <span className="text-xs text-gray-500">-</span>
                    ) : (
                      <BeforeAfter
                        previous={execution.previous_value}
                        current={execution.new_value}
                        actionType={execution.action_type}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {formatMetrics(execution.metrics_snapshot)}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {formatDuration(execution.execution_duration_ms)}
                  </TableCell>
                  <TableCell>
                    {canUndo(execution) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Undo this rule execution? This will revert the changes.')) {
                            undoMutation.mutate(execution.id);
                          }
                        }}
                        loading={undoMutation.isPending}
                        title="Undo this change"
                      >
                        <Undo2 size={14} />
                      </Button>
                    )}
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
