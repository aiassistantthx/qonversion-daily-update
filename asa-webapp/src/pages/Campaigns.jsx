import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { Input } from '../components/Input';
import { getCampaigns, updateCampaignStatus, updateCampaignBudget } from '../lib/api';
import {
  ChevronUp, ChevronDown, Play, Pause, Edit2, X, Check,
  Search, ArrowRight, Layers, KeyRound, Calendar
} from 'lucide-react';

// Date range presets
const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Custom', days: null },
];

export default function Campaigns() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('revenue');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [newBudget, setNewBudget] = useState('');

  // Date range state
  const [days, setDays] = useState(7);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustomDates, setShowCustomDates] = useState(false);

  // Build query params for API
  const queryParams = useMemo(() => {
    if (showCustomDates && customFrom && customTo) {
      return { from: customFrom, to: customTo, sort: sortField };
    }
    return { days, sort: sortField };
  }, [days, customFrom, customTo, showCustomDates, sortField]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns', queryParams],
    queryFn: () => getCampaigns(queryParams),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateCampaignStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries(['campaigns']),
  });

  const budgetMutation = useMutation({
    mutationFn: ({ id, dailyBudget }) => updateCampaignBudget(id, dailyBudget),
    onSuccess: () => {
      queryClient.invalidateQueries(['campaigns']);
      setEditingBudgetId(null);
    },
  });

  // Filter and sort campaigns
  const campaigns = useMemo(() => {
    let result = data?.data || [];

    // Status filter
    if (statusFilter) {
      result = result.filter(c => c.status === statusFilter);
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
        case 'budget':
          aVal = parseFloat(a.dailyBudgetAmount?.amount || 0);
          bVal = parseFloat(b.dailyBudgetAmount?.amount || 0);
          break;
        case 'spend':
          aVal = parseFloat(a.performance?.spend || 0);
          bVal = parseFloat(b.performance?.spend || 0);
          break;
        case 'revenue':
          aVal = parseFloat(a.performance?.revenue || 0);
          bVal = parseFloat(b.performance?.revenue || 0);
          break;
        case 'roas':
          aVal = parseFloat(a.performance?.roas || 0);
          bVal = parseFloat(b.performance?.roas || 0);
          break;
        case 'impressions':
          aVal = parseInt(a.performance?.impressions || 0);
          bVal = parseInt(b.performance?.impressions || 0);
          break;
        case 'taps':
          aVal = parseInt(a.performance?.taps || 0);
          bVal = parseInt(b.performance?.taps || 0);
          break;
        case 'installs':
          aVal = parseInt(a.performance?.installs || 0);
          bVal = parseInt(b.performance?.installs || 0);
          break;
        case 'cpa':
          aVal = parseFloat(a.performance?.cpa || 999999);
          bVal = parseFloat(b.performance?.cpa || 999999);
          break;
        default:
          aVal = a.name;
          bVal = b.name;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, statusFilter, searchQuery, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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

  const navigateToAdGroups = (campaignIds) => {
    const ids = Array.isArray(campaignIds) ? campaignIds : [campaignIds];
    navigate(`/adgroups?campaigns=${ids.join(',')}`);
  };

  const navigateToKeywords = (campaignIds) => {
    const ids = Array.isArray(campaignIds) ? campaignIds : [campaignIds];
    navigate(`/keywords?campaigns=${ids.join(',')}`);
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
          <p className="text-gray-500">Manage your Apple Search Ads campaigns</p>
        </div>
      </div>

      {/* Date Range Selector */}
      <Card className="p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Date Range:</span>
          </div>

          <div className="flex items-center gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  if (preset.days === null) {
                    setShowCustomDates(true);
                  } else {
                    setShowCustomDates(false);
                    setDays(preset.days);
                  }
                }}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  (!showCustomDates && days === preset.days) || (showCustomDates && preset.days === null)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {showCustomDates && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-40"
              />
              <span className="text-gray-500">to</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-40"
              />
            </div>
          )}
        </div>
      </Card>

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
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigateToAdGroups([...selectedIds])}
            >
              <Layers size={14} /> Ad Groups
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigateToKeywords([...selectedIds])}
            >
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
                <TableCell colSpan={9} className="text-center py-8">Loading campaigns...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-red-500">
                  Error: {error.message}
                </TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                  No campaigns found
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => (
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
                      onClick={() => navigateToAdGroups(campaign.id)}
                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      {campaign.name}
                      <ArrowRight size={14} />
                    </button>
                    {campaign.countriesOrRegions && (
                      <span className="text-xs text-gray-400 ml-1">
                        {campaign.countriesOrRegions.join(', ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    ${parseFloat(campaign.performance?.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-600">
                    ${parseFloat(campaign.performance?.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={parseFloat(campaign.performance?.roas || 0) >= 1 ? 'text-green-600 font-medium' : 'text-red-500'}>
                      {parseFloat(campaign.performance?.roas || 0).toFixed(2)}x
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {parseInt(campaign.performance?.installs || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.performance?.cpa
                      ? `$${parseFloat(campaign.performance.cpa).toFixed(2)}`
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={campaign.status === 'ENABLED' ? 'danger' : 'success'}
                      onClick={() => {
                        const newStatus = campaign.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
                        statusMutation.mutate({ id: campaign.id, status: newStatus });
                      }}
                      loading={statusMutation.isPending}
                    >
                      {campaign.status === 'ENABLED' ? <Pause size={14} /> : <Play size={14} />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
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
