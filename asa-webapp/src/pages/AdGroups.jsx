import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { StatusBadge, Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { BulkActionsToolbar } from '../components/BulkActionsToolbar';
import { ColumnPicker } from '../components/ColumnPicker';
import { getCampaigns, getAdGroups, updateAdGroupStatus, updateAdGroupBid, deleteAdGroup } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { useColumnSettings } from '../hooks/useColumnSettings';
import {
  ChevronUp, ChevronDown, Search, ArrowRight, ArrowLeft, KeyRound, X, Download
} from 'lucide-react';

const DEFAULT_COLUMNS = {
  campaign: true,
  status: true,
  spend: true,
  revenue: true,
  roas: true,
  installs: true,
  cpa: true,
  ttr: false,
  cvr: false,
  cpt: false,
  cpm: false,
};

const COLUMN_DEFINITIONS = [
  { id: 'campaign', label: 'Campaign' },
  { id: 'status', label: 'Status' },
  { id: 'spend', label: 'Spend' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'roas', label: 'ROAS' },
  { id: 'installs', label: 'Installs' },
  { id: 'cpa', label: 'CPA' },
  { id: 'ttr', label: 'TTR' },
  { id: 'cvr', label: 'CVR' },
  { id: 'cpt', label: 'CPT' },
  { id: 'cpm', label: 'CPM' },
];

export default function AdGroups() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { queryParams, label: dateLabel } = useDateRange();

  const campaignIdsParam = searchParams.get('campaigns');
  const campaignIds = campaignIdsParam ? campaignIdsParam.split(',').map(Number) : [];

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const { visibleColumns, columnOrder, toggleColumn, resetToDefault } = useColumnSettings(
    'adgroups-columns',
    DEFAULT_COLUMNS,
    Object.keys(DEFAULT_COLUMNS)
  );

  // Get campaigns with performance data
  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', queryParams],
    queryFn: () => getCampaigns(queryParams),
  });

  const campaignMap = useMemo(() => {
    const map = new Map();
    (campaignsData?.data || []).forEach(c => map.set(c.id, c));
    return map;
  }, [campaignsData]);

  // Get ad groups for selected campaigns with performance
  const { data: adGroupsData, isLoading } = useQuery({
    queryKey: ['adgroups', campaignIds, queryParams],
    queryFn: async () => {
      const targetCampaigns = campaignIds.length > 0
        ? campaignIds.map(id => campaignMap.get(id)).filter(Boolean)
        : (campaignsData?.data || []).slice(0, 20);

      const allAdGroups = [];
      for (const campaign of targetCampaigns) {
        try {
          const result = await getAdGroups(campaign.id, queryParams);
          const adGroups = (result?.data || []).map(ag => ({
            ...ag,
            campaignId: campaign.id,
            campaignName: campaign.name,
          }));
          allAdGroups.push(...adGroups);
        } catch (e) {
          console.error(`Failed to fetch adgroups for campaign ${campaign.id}:`, e);
        }
      }
      return { data: allAdGroups };
    },
    enabled: !!campaignsData,
  });

  // Helper to get performance value
  const getPerf = (ag, field) => {
    const p = ag.performance;
    if (!p) return 0;
    return parseFloat(p[field] || 0);
  };

  // Filter and sort
  const adGroups = useMemo(() => {
    let result = adGroupsData?.data || [];

    if (statusFilter) {
      result = result.filter(ag => ag.status === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(ag =>
        ag.name?.toLowerCase().includes(query) ||
        ag.campaignName?.toLowerCase().includes(query)
      );
    }

    result = [...result].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'name':
          aVal = (a.name || '').toLowerCase();
          bVal = (b.name || '').toLowerCase();
          break;
        case 'campaign':
          aVal = (a.campaignName || '').toLowerCase();
          bVal = (b.campaignName || '').toLowerCase();
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
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
        case 'ttr':
          aVal = getPerf(a, 'ttr');
          bVal = getPerf(b, 'ttr');
          break;
        case 'cvr':
          aVal = getPerf(a, 'cvr');
          bVal = getPerf(b, 'cvr');
          break;
        case 'cpt':
          aVal = getPerf(a, 'cpt') || 999999;
          bVal = getPerf(b, 'cpt') || 999999;
          break;
        case 'cpm':
          aVal = getPerf(a, 'cpm') || 999999;
          bVal = getPerf(b, 'cpm') || 999999;
          break;
        default:
          aVal = (a.name || '').toLowerCase();
          bVal = (b.name || '').toLowerCase();
      }

      const dir = sortDirection === 'asc' ? 1 : -1;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return result;
  }, [adGroupsData, statusFilter, searchQuery, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(['name', 'campaign', 'status'].includes(field) ? 'asc' : 'desc');
    }
  };

  const toggleSelect = (id, campaignId) => {
    const key = `${campaignId}-${id}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === adGroups.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(adGroups.map(ag => `${ag.campaignId}-${ag.id}`)));
    }
  };

  const handleBulkPause = async () => {
    for (const key of selectedIds) {
      const [campaignId, adGroupId] = key.split('-');
      await updateAdGroupStatus(parseInt(campaignId), parseInt(adGroupId), 'PAUSED');
    }
    queryClient.invalidateQueries(['adgroups']);
    setSelectedIds(new Set());
  };

  const handleBulkEnable = async () => {
    for (const key of selectedIds) {
      const [campaignId, adGroupId] = key.split('-');
      await updateAdGroupStatus(parseInt(campaignId), parseInt(adGroupId), 'ENABLED');
    }
    queryClient.invalidateQueries(['adgroups']);
    setSelectedIds(new Set());
  };

  const handleBulkAdjustBid = async ({ type, value }) => {
    for (const key of selectedIds) {
      const [campaignId, adGroupId] = key.split('-');
      const adGroup = adGroups.find(ag => ag.campaignId === parseInt(campaignId) && ag.id === parseInt(adGroupId));
      if (!adGroup || !adGroup.defaultBidAmount) continue;

      let newBid;
      if (type === 'percent') {
        newBid = adGroup.defaultBidAmount.amount * (1 + value / 100);
      } else {
        newBid = adGroup.defaultBidAmount.amount + value;
      }

      newBid = Math.max(0.01, newBid);
      await updateAdGroupBid(parseInt(campaignId), parseInt(adGroupId), {
        amount: newBid,
        currency: adGroup.defaultBidAmount.currency,
      });
    }
    queryClient.invalidateQueries(['adgroups']);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    for (const key of selectedIds) {
      const [campaignId, adGroupId] = key.split('-');
      await deleteAdGroup(parseInt(campaignId), parseInt(adGroupId));
    }
    queryClient.invalidateQueries(['adgroups']);
    setSelectedIds(new Set());
  };

  const selectedAdGroups = adGroups.filter(ag => selectedIds.has(`${ag.campaignId}-${ag.id}`));

  const navigateToKeywords = (campaignId, adGroupId) => {
    if (adGroupId) {
      navigate(`/keywords?campaigns=${campaignId}&adgroups=${adGroupId}`);
    } else {
      const selectedAdGroups = [...selectedIds].map(key => {
        const [cId, agId] = key.split('-');
        return { campaignId: cId, adGroupId: agId };
      });
      const campaignParam = [...new Set(selectedAdGroups.map(s => s.campaignId))].join(',');
      const adGroupParam = selectedAdGroups.map(s => s.adGroupId).join(',');
      navigate(`/keywords?campaigns=${campaignParam}&adgroups=${adGroupParam}`);
    }
  };

  const exportCSV = () => {
    const headers = ['Ad Group', 'Campaign', 'Status', 'Bid', 'Spend', 'Impressions', 'Taps', 'Installs', 'CPA', 'Revenue', 'ROAS', 'COP'];
    const rows = adGroups.map(ag => {
      const p = ag.performance || {};
      const spend = parseFloat(p.spend || 0);
      const revenue = parseFloat(p.revenue || 0);
      const roas = spend > 0 ? (revenue / spend).toFixed(2) : '';
      return [
        `"${ag.name}"`,
        `"${ag.campaignName}"`,
        ag.status,
        ag.defaultBidAmount?.amount || '',
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
    a.download = `adgroups-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const removeCampaignFilter = (id) => {
    const newIds = campaignIds.filter(cId => cId !== id);
    if (newIds.length === 0) {
      setSearchParams({});
    } else {
      setSearchParams({ campaigns: newIds.join(',') });
    }
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

  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length + 3;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>
              <ArrowLeft size={16} />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Ad Groups</h1>
          </div>
          <p className="text-gray-500 ml-9">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker
            columns={COLUMN_DEFINITIONS}
            visibleColumns={visibleColumns}
            onToggle={toggleColumn}
            onReset={resetToDefault}
          />
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </Button>
        </div>
      </div>

      {/* Campaign Filters */}
      {campaignIds.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500">Filtered by campaigns:</span>
          {campaignIds.map(id => (
            <Badge key={id} variant="info" className="flex items-center gap-1">
              {campaignMap.get(id)?.name || `Campaign ${id}`}
              <button onClick={() => removeCampaignFilter(id)} className="hover:text-red-500">
                <X size={12} />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            Clear all
          </Button>
        </div>
      )}

      {/* Search and Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <Input
              type="text"
              placeholder="Search ad groups..."
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
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
            <Button variant="secondary" size="sm" onClick={() => navigateToKeywords()}>
              <KeyRound size={14} /> View Keywords
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
                  checked={selectedIds.size === adGroups.length && adGroups.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </TableHeader>
              <SortHeader field="name">Ad Group</SortHeader>
              {columnOrder.map((columnId) => {
                if (!visibleColumns[columnId]) return null;
                const column = COLUMN_DEFINITIONS.find(c => c.id === columnId);
                if (!column) return null;
                const isRightAligned = !['campaign', 'status'].includes(columnId);
                return (
                  <SortHeader key={columnId} field={columnId} className={isRightAligned ? 'text-right' : ''}>
                    {column.label}
                  </SortHeader>
                );
              })}
              <TableHeader className="w-24">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="text-center py-8">Loading ad groups...</TableCell>
              </TableRow>
            ) : adGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="text-center py-8 text-gray-500">
                  No ad groups found
                </TableCell>
              </TableRow>
            ) : (
              adGroups.map((ag) => {
                const renderCell = (columnId) => {
                  switch (columnId) {
                    case 'campaign':
                      return <TableCell key={columnId} className="text-gray-500">{ag.campaignName}</TableCell>;
                    case 'status':
                      return <TableCell key={columnId}><StatusBadge status={ag.status} /></TableCell>;
                    case 'spend':
                      return <TableCell key={columnId} className="text-right">${getPerf(ag, 'spend').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>;
                    case 'revenue':
                      return <TableCell key={columnId} className="text-right font-medium text-green-600">${getPerf(ag, 'revenue').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>;
                    case 'roas':
                      return <TableCell key={columnId} className="text-right"><span className={getPerf(ag, 'roas') >= 1 ? 'text-green-600 font-medium' : 'text-red-500'}>{getPerf(ag, 'roas').toFixed(2)}x</span></TableCell>;
                    case 'installs':
                      return <TableCell key={columnId} className="text-right">{getPerf(ag, 'installs').toLocaleString()}</TableCell>;
                    case 'cpa':
                      return <TableCell key={columnId} className="text-right">{getPerf(ag, 'cpa') ? `$${getPerf(ag, 'cpa').toFixed(2)}` : '-'}</TableCell>;
                    case 'ttr':
                      return <TableCell key={columnId} className="text-right">{(getPerf(ag, 'ttr') * 100).toFixed(2)}%</TableCell>;
                    case 'cvr':
                      return <TableCell key={columnId} className="text-right">{(getPerf(ag, 'cvr') * 100).toFixed(2)}%</TableCell>;
                    case 'cpt':
                      return <TableCell key={columnId} className="text-right">{getPerf(ag, 'cpt') ? `$${getPerf(ag, 'cpt').toFixed(2)}` : '-'}</TableCell>;
                    case 'cpm':
                      return <TableCell key={columnId} className="text-right">{getPerf(ag, 'cpm') ? `$${getPerf(ag, 'cpm').toFixed(2)}` : '-'}</TableCell>;
                    default:
                      return null;
                  }
                };

                return (
                  <TableRow key={`${ag.campaignId}-${ag.id}`} className="hover:bg-gray-50">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(`${ag.campaignId}-${ag.id}`)}
                        onChange={() => toggleSelect(ag.id, ag.campaignId)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => navigateToKeywords(ag.campaignId, ag.id)}
                        className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                      >
                        {ag.name}
                        <ArrowRight size={14} />
                      </button>
                    </TableCell>
                    {columnOrder.map((columnId) => {
                      if (!visibleColumns[columnId]) return null;
                      return renderCell(columnId);
                    })}
                    <TableCell>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigateToKeywords(ag.campaignId, ag.id)}
                      >
                        <KeyRound size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {adGroups.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          Showing {adGroups.length} ad groups
        </div>
      )}

      <BulkActionsToolbar
        selectedCount={selectedIds.size}
        selectedItems={selectedAdGroups}
        onSelectAll={toggleSelectAll}
        onDeselectAll={() => setSelectedIds(new Set())}
        onPause={handleBulkPause}
        onEnable={handleBulkEnable}
        onAdjustBid={handleBulkAdjustBid}
        onDelete={handleBulkDelete}
        entityType="ad groups"
        canAdjustBid={true}
      />
    </div>
  );
}
