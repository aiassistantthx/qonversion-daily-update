import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { StatusBadge, DeliveryStatusBadge } from '../components/Badge';
import { Input } from '../components/Input';
import { TrafficLight, getTrafficLightStatus } from '../components/TrafficLight';
import { ColumnPicker } from '../components/ColumnPicker';
import { BulkActionsToolbar } from '../components/BulkActionsToolbar';
import { Sparkline } from '../components/Sparkline';
import { PresetViews } from '../components/PresetViews';
import { getCampaigns, updateCampaignStatus, deleteCampaign } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { useColumnSettings } from '../hooks/useColumnSettings';
import {
  ChevronUp, ChevronDown, Play, Pause,
  Search, ArrowRight, Layers, KeyRound, Download, Copy
} from 'lucide-react';

const DEFAULT_COLUMNS = {
  status: true,
  deliveryStatus: true,
  health: true,
  trend: true,
  spend: true,
  revenue: true,
  roas: true,
  installs: true,
  cpa: true,
  ttr: false,
  cvr: false,
  cpt: false,
  cpm: false,
  soi: false,
};

const COLUMN_DEFINITIONS = [
  { id: 'status', label: 'Status' },
  { id: 'deliveryStatus', label: 'Delivery Status' },
  { id: 'health', label: 'Health' },
  { id: 'trend', label: 'Trend' },
  { id: 'spend', label: 'Spend' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'roas', label: 'ROAS' },
  { id: 'installs', label: 'Installs' },
  { id: 'cpa', label: 'CPA' },
  { id: 'ttr', label: 'TTR' },
  { id: 'cvr', label: 'CVR' },
  { id: 'cpt', label: 'CPT' },
  { id: 'cpm', label: 'CPM' },
  { id: 'soi', label: 'SOI' },
];

const PRESET_VIEWS = [
  {
    name: 'performance',
    label: 'Performance',
    columns: {
      status: true,
      deliveryStatus: true,
      health: true,
      trend: true,
      spend: false,
      revenue: true,
      roas: true,
      installs: true,
      cpa: false,
      ttr: false,
      cvr: false,
      cpt: false,
      cpm: false,
      soi: false,
    }
  },
  {
    name: 'budget',
    label: 'Budget',
    columns: {
      status: true,
      deliveryStatus: true,
      health: false,
      trend: false,
      spend: true,
      revenue: false,
      roas: false,
      installs: false,
      cpa: false,
      ttr: false,
      cvr: false,
      cpt: false,
      cpm: false,
      soi: false,
    }
  },
  {
    name: 'conversion',
    label: 'Conversion',
    columns: {
      status: true,
      deliveryStatus: false,
      health: false,
      trend: false,
      spend: false,
      revenue: false,
      roas: false,
      installs: false,
      cpa: true,
      ttr: true,
      cvr: true,
      cpt: true,
      cpm: false,
      soi: false,
    }
  },
  {
    name: 'full',
    label: 'Full',
    columns: {
      status: true,
      deliveryStatus: true,
      health: true,
      trend: true,
      spend: true,
      revenue: true,
      roas: true,
      installs: true,
      cpa: true,
      ttr: true,
      cvr: true,
      cpt: true,
      cpm: true,
      soi: true,
    }
  },
  {
    name: 'custom',
    label: 'Custom',
    columns: DEFAULT_COLUMNS
  }
];

function SortHeader({ field, children, className = '', onClick, sortField, sortDirection, draggable, onDragStart, onDragOver, onDrop, onDragEnd, draggedColumn }) {
  return (
    <TableHeader
      className={`cursor-pointer select-none hover:bg-gray-100 ${className} ${draggedColumn === field ? 'opacity-50' : ''}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </div>
    </TableHeader>
  );
}

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

  const { visibleColumns, columnOrder, toggleColumn, resetToDefault, applyPreset, activePreset, reorderColumns } = useColumnSettings(
    'campaigns-columns',
    DEFAULT_COLUMNS,
    Object.keys(DEFAULT_COLUMNS)
  );

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

  const handleBulkPause = async () => {
    for (const id of selectedIds) {
      await statusMutation.mutateAsync({ id, status: 'PAUSED' });
    }
    setSelectedIds(new Set());
  };

  const handleBulkEnable = async () => {
    for (const id of selectedIds) {
      await statusMutation.mutateAsync({ id, status: 'ENABLED' });
    }
    setSelectedIds(new Set());
  };

  const handleBulkDelete = async () => {
    for (const id of selectedIds) {
      await deleteCampaign(id);
    }
    queryClient.invalidateQueries(['campaigns']);
    setSelectedIds(new Set());
  };

  const selectedCampaigns = campaigns.filter(c => selectedIds.has(c.id));

  const exportCSV = () => {
    const headers = ['Campaign', 'Status', 'Budget', 'Spend', 'Impressions', 'Taps', 'Installs', 'CPA', 'Revenue', 'ROAS', 'COP', 'TTR', 'CVR', 'CPT', 'CPM'];
    const rows = campaigns.map(c => {
      const p = c.performance || {};
      const spend = parseFloat(p.spend || 0);
      const revenue = parseFloat(p.revenue || 0);
      const roas = spend > 0 ? (revenue / spend).toFixed(2) : '';
      const ttr = parseFloat(p.ttr || 0);
      const cvr = parseFloat(p.cvr || 0);
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
        (ttr * 100).toFixed(2) + '%',
        (cvr * 100).toFixed(2) + '%',
        p.cpt ? parseFloat(p.cpt).toFixed(2) : '',
        p.cpm ? parseFloat(p.cpm).toFixed(2) : '',
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

  const [draggedColumn, setDraggedColumn] = useState(null);

  const handleDragStart = (e, columnId) => {
    setDraggedColumn(columnId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetColumnId) => {
    e.preventDefault();
    if (draggedColumn && draggedColumn !== targetColumnId) {
      const fromIndex = columnOrder.indexOf(draggedColumn);
      const toIndex = columnOrder.indexOf(targetColumnId);
      reorderColumns(fromIndex, toIndex);
    }
    setDraggedColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
  };

  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length + 3;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Campaigns</h1>
          <p className="text-gray-500 dark:text-gray-400">{dateLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ColumnPicker
            columns={COLUMN_DEFINITIONS}
            visibleColumns={visibleColumns}
            onToggle={toggleColumn}
            onReset={resetToDefault}
          />
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </Button>
          <Button onClick={() => navigate('/campaigns/create')}>
            Create Campaign
          </Button>
        </div>
      </div>

      {/* Preset Views */}
      <PresetViews
        activePreset={activePreset}
        onPresetChange={applyPreset}
        presets={PRESET_VIEWS}
      />

      {/* Filters and Actions */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 flex-1">
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
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm touch-target"
          >
            <option value="">All Status</option>
            <option value="ENABLED">Enabled</option>
            <option value="PAUSED">Paused</option>
          </select>

          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm touch-target"
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
        <Table stickyFirstColumn={true}>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10" sticky>
                <input
                  type="checkbox"
                  checked={selectedIds.size === campaigns.length && campaigns.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </TableHeader>
              <TableHeader sticky className="cursor-pointer select-none hover:bg-gray-100" onClick={() => handleSort('name')}>
                <div className="flex items-center gap-1">
                  Campaign
                  {sortField === 'name' && (
                    sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                  )}
                </div>
              </TableHeader>
              {columnOrder.map((columnId) => {
                if (!visibleColumns[columnId]) return null;
                const column = COLUMN_DEFINITIONS.find(c => c.id === columnId);
                if (!column) return null;

                const isRightAligned = !['status', 'deliveryStatus', 'health', 'trend'].includes(columnId);

                if (columnId === 'health' || columnId === 'trend') {
                  return (
                    <TableHeader
                      key={columnId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, columnId)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, columnId)}
                      onDragEnd={handleDragEnd}
                      className={draggedColumn === columnId ? 'opacity-50' : ''}
                    >
                      {column.label}
                    </TableHeader>
                  );
                }

                return (
                  <SortHeader
                    key={columnId}
                    field={columnId}
                    onClick={() => handleSort(columnId)}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    className={isRightAligned ? 'text-right' : ''}
                    draggable
                    onDragStart={(e) => handleDragStart(e, columnId)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, columnId)}
                    onDragEnd={handleDragEnd}
                    draggedColumn={draggedColumn}
                  >
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
                <TableCell colSpan={visibleColumnCount} className="text-center py-8">Loading campaigns...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="text-center py-8 text-red-500">Error: {error.message}</TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="text-center py-8 text-gray-500">No campaigns found</TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => {
                const predictedRoas = campaign.performance?.predicted_roas_365;

                const renderCell = (columnId) => {
                  switch (columnId) {
                    case 'status':
                      return <TableCell key={columnId}><StatusBadge status={campaign.status} /></TableCell>;
                    case 'deliveryStatus':
                      return <TableCell key={columnId}><DeliveryStatusBadge status={campaign.displayStatus || campaign.servingStatus || 'RUNNING'} /></TableCell>;
                    case 'health':
                      return <TableCell key={columnId}><TrafficLight predictedRoas={predictedRoas} size="sm" /></TableCell>;
                    case 'trend':
                      return <TableCell key={columnId}><Sparkline data={campaign.performance?.trend_7d || []} /></TableCell>;
                    case 'spend':
                      return <TableCell key={columnId} className="text-right">${getPerf(campaign, 'spend').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>;
                    case 'revenue':
                      return <TableCell key={columnId} className="text-right font-medium text-green-600">${getPerf(campaign, 'revenue').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>;
                    case 'roas':
                      return <TableCell key={columnId} className="text-right"><span className={getPerf(campaign, 'roas') >= 1 ? 'text-green-600 font-medium' : 'text-red-500'}>{getPerf(campaign, 'roas').toFixed(2)}x</span></TableCell>;
                    case 'installs':
                      return <TableCell key={columnId} className="text-right">{getPerf(campaign, 'installs').toLocaleString()}</TableCell>;
                    case 'cpa':
                      return <TableCell key={columnId} className="text-right">{getPerf(campaign, 'cpa') ? `$${getPerf(campaign, 'cpa').toFixed(2)}` : '-'}</TableCell>;
                    case 'ttr':
                      return <TableCell key={columnId} className="text-right">{(getPerf(campaign, 'ttr') * 100).toFixed(2)}%</TableCell>;
                    case 'cvr':
                      return <TableCell key={columnId} className="text-right">{(getPerf(campaign, 'cvr') * 100).toFixed(2)}%</TableCell>;
                    case 'cpt':
                      return <TableCell key={columnId} className="text-right">{getPerf(campaign, 'cpt') ? `$${getPerf(campaign, 'cpt').toFixed(2)}` : '-'}</TableCell>;
                    case 'cpm':
                      return <TableCell key={columnId} className="text-right">{getPerf(campaign, 'cpm') ? `$${getPerf(campaign, 'cpm').toFixed(2)}` : '-'}</TableCell>;
                    default:
                      return null;
                  }
                };

                return (
                  <TableRow key={campaign.id} className="hover:bg-gray-50">
                    <TableCell sticky>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(campaign.id)}
                        onChange={() => toggleSelect(campaign.id)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell sticky>
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
                    {columnOrder.map((columnId) => {
                      if (!visibleColumns[columnId]) return null;
                      return renderCell(columnId);
                    })}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/campaigns/create?copy=${campaign.id}`)}
                          title="Copy campaign"
                        >
                          <Copy size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant={campaign.status === 'ENABLED' ? 'danger' : 'success'}
                          onClick={() => statusMutation.mutate({ id: campaign.id, status: campaign.status === 'ENABLED' ? 'PAUSED' : 'ENABLED' })}
                          loading={statusMutation.isPending}
                        >
                          {campaign.status === 'ENABLED' ? <Pause size={14} /> : <Play size={14} />}
                        </Button>
                      </div>
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

      <BulkActionsToolbar
        selectedCount={selectedIds.size}
        selectedItems={selectedCampaigns}
        onSelectAll={toggleSelectAll}
        onDeselectAll={() => setSelectedIds(new Set())}
        onPause={handleBulkPause}
        onEnable={handleBulkEnable}
        onDelete={handleBulkDelete}
        entityType="campaigns"
        canAdjustBid={false}
      />
    </div>
  );
}
