import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Select } from '../components/Input';
import { StatusBadge, Badge } from '../components/Badge';
import { getHistory, syncChanges } from '../lib/api';
import { RefreshCw, Download } from 'lucide-react';

export default function History() {
  const [filters, setFilters] = useState({
    entity_type: '',
    change_type: '',
    source: '',
    limit: 100,
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['history', filters],
    queryFn: () => getHistory(filters),
  });

  const syncChangesMutation = useMutation({
    mutationFn: syncChanges,
    onSuccess: (result) => {
      const total = result.changes.campaigns + result.changes.adgroups + result.changes.keywords;
      if (total > 0) {
        alert(`Synced ${total} changes from Apple Ads:\n- Campaigns: ${result.changes.campaigns}\n- Ad Groups: ${result.changes.adgroups}\n- Keywords: ${result.changes.keywords}`);
        refetch();
      } else {
        alert('No new changes detected in Apple Ads');
      }
    },
    onError: (error) => {
      alert(`Failed to sync changes: ${error.message}`);
    }
  });

  const history = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Change History</h1>
          <p className="text-gray-500">Audit log of all changes</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => syncChangesMutation.mutate()}
            loading={syncChangesMutation.isPending}
          >
            <Download size={16} /> Sync from Apple Ads
          </Button>
          <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw size={16} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex items-center gap-4">
          <Select
            label="Entity Type"
            value={filters.entity_type}
            onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
            options={[
              { value: '', label: 'All' },
              { value: 'campaign', label: 'Campaign' },
              { value: 'adgroup', label: 'Ad Group' },
              { value: 'keyword', label: 'Keyword' },
            ]}
            className="w-40"
          />

          <Select
            label="Change Type"
            value={filters.change_type}
            onChange={(e) => setFilters({ ...filters, change_type: e.target.value })}
            options={[
              { value: '', label: 'All' },
              { value: 'bid_update', label: 'Bid Update' },
              { value: 'status_update', label: 'Status Update' },
              { value: 'budget_update', label: 'Budget Update' },
              { value: 'create', label: 'Create' },
            ]}
            className="w-40"
          />

          <Select
            label="Source"
            value={filters.source}
            onChange={(e) => setFilters({ ...filters, source: e.target.value })}
            options={[
              { value: '', label: 'All' },
              { value: 'cli', label: 'CLI' },
              { value: 'web', label: 'Web' },
              { value: 'rule', label: 'Rule' },
              { value: 'api', label: 'API' },
              { value: 'sync', label: 'Apple Ads' },
            ]}
            className="w-32"
          />

          <Select
            label="Limit"
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: parseInt(e.target.value) })}
            options={[
              { value: 50, label: '50' },
              { value: 100, label: '100' },
              { value: 200, label: '200' },
              { value: 500, label: '500' },
            ]}
            className="w-24"
          />
        </div>
      </Card>

      {/* History Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Time</TableHeader>
              <TableHeader>Entity</TableHeader>
              <TableHeader>Change Type</TableHeader>
              <TableHeader>Field</TableHeader>
              <TableHeader>Old Value</TableHeader>
              <TableHeader>New Value</TableHeader>
              <TableHeader>Source</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">Loading history...</TableCell>
              </TableRow>
            ) : history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No changes found
                </TableCell>
              </TableRow>
            ) : (
              history.map((item) => (
                <TableRow key={item.id} className="hover:bg-gray-50">
                  <TableCell className="text-gray-500 whitespace-nowrap">
                    {new Date(item.changed_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default">{item.entity_type}</Badge>
                    <span className="ml-1 text-gray-500">{item.entity_id}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.change_type === 'bid_update'
                          ? 'info'
                          : item.change_type === 'status_update'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {item.change_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">{item.field_name || '-'}</TableCell>
                  <TableCell className="font-mono text-sm text-gray-500 max-w-xs truncate">
                    {item.old_value || '-'}
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium max-w-xs truncate">
                    {item.new_value || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.source === 'rule'
                          ? 'info'
                          : item.source === 'cli'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {item.source}
                    </Badge>
                    {item.rule_id && (
                      <span className="ml-1 text-xs text-gray-400">#{item.rule_id}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {history.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          Showing {history.length} records
        </div>
      )}
    </div>
  );
}
