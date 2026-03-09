import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { Input } from '../components/Input';
import { TrafficLight, getTrafficLightStatus } from '../components/TrafficLight';
import { getCampaigns, updateCampaignStatus } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import {
  ChevronUp, ChevronDown, Play, Pause,
  Search, ArrowRight, Layers, KeyRound, Download
} from 'lucide-react';

export default function Campaigns() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { queryParams, label: dateLabel } = useDateRange();

  const [statusFilter, setStatusFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns', queryParams],
    queryFn: () => getCampaigns(queryParams),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateCampaignStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries(['campaigns']),
  });

  // Helper to get performance value
  const getPerf = (campaign, field) => {
    const p = campaign.performance;
    if (!p) return 0;
    return parseFloat(p[field] || p[`${field}_7d`] || 0);
  };

  // Filter and sort campaigns
  const campaigns = useMemo(() => {
    let result = data?.data || [];

    // Status filter
    if (statusFilter) {
      result = result.filter(c => c.status === statusFilter);
    }

    // Health filter
    if (healthFilter) {
      result = result.filter(c => {
        const predictedRoas = c.performance?.predicted_roas_365;
        const status = getTrafficLightStatus(predictedRoas);
        return status === healthFilter;
      });
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.countriesOrRegions?.some(r => r.toLowerCase().includes(query))
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal, bVal;

      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'spend':
          aVal = getPerf(a, 'spend');
          bVal = getPerf(b, 'spend');
          break;
        case 'revenue':
          aVal = getPerf(a, 'revenue');
          bVal = getPerf(b, 'revenue');
          break;
        case 'roas':
          aVal = getPerf(a, 'roas');
          bVal = getPerf(b, 'roas');
          break;
        case 'installs':
          aVal = getPerf(a, 'installs');
          bVal = getPerf(b, 'installs');
          break;
        case 'cpa':
          aVal = getPerf(a, 'cpa') || 999999;
          bVal = getPerf(b, 'cpa') || 999999;
          break;
        default:
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
      }

      const dir = sortDirection === 'asc' ? 1 : -1;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return result;
  }, [data, statusFilter, healthFilter, searchQuery, sortField, sortDirection]);

  const handleSort = (field) => {
    console.log('Sort clicked:', field, 'current:', sortField, sortDirection);
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Default to desc for numeric fields, asc for text
      setSortDirection(['name', 'status'].includes(field) ? 'asc' : 'desc');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === campaigns.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(campaigns.map(c => c.id)));
    }
  };

  const exportCSV = () => {
    const headers = ['Campaign', 'Status', 'Budget', 'Spend', 'Impressions', 'Taps', 'Installs', 'CPA', 'Revenue', 'ROAS', 'COP'];
    const rows = campaigns.map(c => {
      const p = c.performance || {};
      const spend = parseFloat(p.spend || 0);
      const revenue = parseFloat(p.revenue || 0);
      const roas = spend > 0 ? (revenue / spend).toFixed(2) : '';
      return [
        `"${c.name}"`,
        c.status,
        c.dailyBudgetAmount?.amount || '',
        spend.toFixed(2),
        p.impressions || 0,
        p.taps || 0,
        p.installs || 0,
        p.cpa ? parseFloat(p.cpa).toFixed(2) : '',
        revenue.toFixed(2),
        roas,
        p.cop ? parseFloat(p.cop).toFixed(2) : '',
      ];
    });
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaigns-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const SortHeader = ({ field, children, className = '' }) => (
    <TableHeader
      className={`cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </div>
    </TableHeader>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500">{dateLabel}</p>
        </div>
        <Button variant="secondary" onClick={exportCSV}>
          <Download size={16} /> Export CSV
        </Button>
      </div>

      {/* Filters and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <Input
              type="text"
              placeholder="Search campaigns..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="ENABLED">Enabled</option>
            <option value="PAUSED">Paused</option>
          </select>

          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Health</option>
            <option value="ok">OK (≥1.5x)</option>
            <option value="risk">Risk (1.0-1.5x)</option>
            <option value="bad">Bad (0.5-1.0x)</option>
            <option value="loss">Loss (&lt;0.5x)</option>
          </select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/adgroups?campaigns=${[...selectedIds].join(',')}`)}>
              <Layers size={14} /> Ad Groups
            </Button>
            <Button variant="secondary" size="sm" onClick={() => navigate(`/keywords?campaigns=${[...selectedIds].join(',')}`)}>
              <KeyRound size={14} /> Keywords
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10">
                <input
                  type="checkbox"
                  checked={selectedIds.size === campaigns.length && campaigns.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </TableHeader>
              <SortHeader field="name">Campaign</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <TableHeader>Health</TableHeader>
              <SortHeader field="spend" className="text-right">Spend</SortHeader>
              <SortHeader field="revenue" className="text-right">Revenue</SortHeader>
              <SortHeader field="roas" className="text-right">ROAS</SortHeader>
              <SortHeader field="installs" className="text-right">Installs</SortHeader>
              <SortHeader field="cpa" className="text-right">CPA</SortHeader>
              <TableHeader className="w-24">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">Loading campaigns...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-red-500">Error: {error.message}</TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-500">No campaigns found</TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => {
                const predictedRoas = campaign.performance?.predicted_roas_365;
                return (
                  <TableRow key={campaign.id} className="hover:bg-gray-50">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(campaign.id)}
                        onChange={() => toggleSelect(campaign.id)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/adgroups?campaigns=${campaign.id}`)}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        {campaign.name}
                        <ArrowRight size={14} />
                      </button>
                      {campaign.countriesOrRegions && (
                        <span className="text-xs text-gray-400 ml-1">{campaign.countriesOrRegions.join(', ')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell>
                      <TrafficLight predictedRoas={predictedRoas} size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      ${getPerf(campaign, 'spend').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      ${getPerf(campaign, 'revenue').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={getPerf(campaign, 'roas') >= 1 ? 'text-green-600 font-medium' : 'text-red-500'}>
                        {getPerf(campaign, 'roas').toFixed(2)}x
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {getPerf(campaign, 'installs').toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {getPerf(campaign, 'cpa') ? `$${getPerf(campaign, 'cpa').toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={campaign.status === 'ENABLED' ? 'danger' : 'success'}
                        onClick={() => statusMutation.mutate({ id: campaign.id, status: campaign.status === 'ENABLED' ? 'PAUSED' : 'ENABLED' })}
                        loading={statusMutation.isPending}
                      >
                        {campaign.status === 'ENABLED' ? <Pause size={14} /> : <Play size={14} />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {campaigns.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          Showing {campaigns.length} campaigns
        </div>
      )}
    </div>
  );
}
