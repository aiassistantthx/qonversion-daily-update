import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { StatusBadge, Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { getKeywords, getCampaigns, updateKeywordBid, bulkUpdateKeywordBids, bulkUpdateKeywordStatus, createKeywords } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { useColumnSettings } from '../hooks/useColumnSettings';
import { Modal } from '../components/Modal';
import { BulkKeywordAdd } from '../components/BulkKeywordAdd';
import { ColumnPicker } from '../components/ColumnPicker';
import { PresetViews } from '../components/PresetViews';
import {
  ChevronUp, ChevronDown, Search, ArrowLeft, X, Download, Edit2, Check, Pause, Play, Percent, AlertTriangle, TrendingUp, Plus
} from 'lucide-react';

const DEFAULT_COLUMNS = {
  matchType: true,
  bid: true,
  bidVsCpa: true,
  spend: true,
  impressions: true,
  sov: true,
  taps: true,
  ttr: false,
  installs: true,
  cvr: false,
  cpa: true,
  cpt: false,
  cpm: false,
  revenue: true,
  roas: true,
  cop: false,
};

const COLUMN_DEFINITIONS = [
  { id: 'matchType', label: 'Match' },
  { id: 'bid', label: 'Bid' },
  { id: 'bidVsCpa', label: 'Bid vs CPA' },
  { id: 'spend', label: 'Spend' },
  { id: 'impressions', label: 'Impressions' },
  { id: 'sov', label: 'SOV %' },
  { id: 'taps', label: 'Taps' },
  { id: 'ttr', label: 'TTR' },
  { id: 'installs', label: 'Installs' },
  { id: 'cvr', label: 'CVR' },
  { id: 'cpa', label: 'CPA' },
  { id: 'cpt', label: 'CPT' },
  { id: 'cpm', label: 'CPM' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'roas', label: 'ROAS' },
  { id: 'cop', label: 'COP' },
];

const PRESET_VIEWS = [
  {
    name: 'performance',
    label: 'Performance',
    columns: {
      matchType: true,
      bid: false,
      bidVsCpa: false,
      spend: true,
      impressions: false,
      sov: true,
      taps: false,
      ttr: false,
      installs: true,
      cvr: false,
      cpa: true,
      cpt: false,
      cpm: false,
      revenue: true,
      roas: true,
      cop: false,
    }
  },
  {
    name: 'bidding',
    label: 'Bidding',
    columns: {
      matchType: true,
      bid: true,
      bidVsCpa: true,
      spend: true,
      impressions: false,
      sov: false,
      taps: false,
      ttr: false,
      installs: true,
      cvr: false,
      cpa: true,
      cpt: false,
      cpm: false,
      revenue: false,
      roas: false,
      cop: false,
    }
  },
  {
    name: 'conversion',
    label: 'Conversion',
    columns: {
      matchType: true,
      bid: false,
      bidVsCpa: false,
      spend: false,
      impressions: false,
      sov: false,
      taps: true,
      ttr: true,
      installs: true,
      cvr: true,
      cpa: true,
      cpt: true,
      cpm: false,
      revenue: false,
      roas: false,
      cop: false,
    }
  },
  {
    name: 'full',
    label: 'Full',
    columns: {
      matchType: true,
      bid: true,
      bidVsCpa: true,
      spend: true,
      impressions: true,
      sov: true,
      taps: true,
      ttr: true,
      installs: true,
      cvr: true,
      cpa: true,
      cpt: true,
      cpm: true,
      revenue: true,
      roas: true,
      cop: true,
    }
  },
  {
    name: 'custom',
    label: 'Custom',
    columns: DEFAULT_COLUMNS
  }
];

export default function Keywords() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { queryParams, label: dateLabel } = useDateRange();

  const campaignIdsParam = searchParams.get('campaigns');
  const adGroupIdsParam = searchParams.get('adgroups');
  const pageParam = searchParams.get('page');
  const campaignIds = campaignIdsParam ? campaignIdsParam.split(',') : [];
  const adGroupIds = adGroupIdsParam ? adGroupIdsParam.split(',') : [];

  const [searchQuery, setSearchQuery] = useState('');
  const [matchTypeFilter, setMatchTypeFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [sortField, setSortField] = useState('spend');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingKeywordId, setEditingKeywordId] = useState(null);
  const [newBid, setNewBid] = useState('');
  const [bulkBidAmount, setBulkBidAmount] = useState('');
  const [bulkBidMode, setBulkBidMode] = useState('absolute'); // 'absolute' or 'percent'
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, message: '' });
  const [bulkAddModalOpen, setBulkAddModalOpen] = useState(false);
  const [page, setPage] = useState(parseInt(pageParam) || 1);
  const itemsPerPage = 20;

  const { visibleColumns, columnOrder, toggleColumn, resetToDefault, applyPreset, activePreset } = useColumnSettings(
    'keywords-columns',
    DEFAULT_COLUMNS,
    Object.keys(DEFAULT_COLUMNS)
  );

  // Get campaigns for names
  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', queryParams],
    queryFn: () => getCampaigns(queryParams),
  });

  const campaignMap = useMemo(() => {
    const map = new Map();
    (campaignsData?.data || []).forEach(c => map.set(String(c.id), c));
    return map;
  }, [campaignsData]);

  // Get keywords with filters
  const { data: keywordsData, isLoading } = useQuery({
    queryKey: ['keywords', { campaignIds, adGroupIds, queryParams, page }],
    queryFn: () => {
      const params = {
        limit: itemsPerPage,
        offset: (page - 1) * itemsPerPage,
        ...queryParams,
      };

      // Only add campaign_id if exactly one campaign is selected
      if (campaignIds.length === 1) {
        params.campaign_id = campaignIds[0];
      }

      // Only add adgroup_id if exactly one ad group is selected
      if (adGroupIds.length === 1) {
        params.adgroup_id = adGroupIds[0];
      }

      return getKeywords(params);
    },
  });

  const bidMutation = useMutation({
    mutationFn: ({ keywordId, campaignId, adGroupId, bidAmount }) =>
      updateKeywordBid(keywordId, { campaignId, adGroupId, bidAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries(['keywords']);
      setEditingKeywordId(null);
    },
  });

  const bulkBidMutation = useMutation({
    mutationFn: (data) => bulkUpdateKeywordBids(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['keywords']);
      setSelectedIds(new Set());
      setBulkBidAmount('');
      setConfirmModal({ open: false, action: null, message: '' });
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: (data) => bulkUpdateKeywordStatus(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['keywords']);
      setSelectedIds(new Set());
      setConfirmModal({ open: false, action: null, message: '' });
    },
  });

  const createKeywordsMutation = useMutation({
    mutationFn: (data) => createKeywords(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['keywords']);
    },
  });

  // Get all keywords data (including total for all pages)
  const allKeywordsData = keywordsData?.data || [];
  const totalKeywords = keywordsData?.total || allKeywordsData.length;

  // Filter and sort current page
  const keywords = useMemo(() => {
    let result = allKeywordsData;

    // Filter by campaign IDs if multiple
    if (campaignIds.length > 1) {
      result = result.filter(k => campaignIds.includes(String(k.campaign_id)));
    }

    // Filter by adgroup IDs if multiple
    if (adGroupIds.length > 1) {
      result = result.filter(k => adGroupIds.includes(String(k.adgroup_id)));
    }

    if (campaignFilter) {
      result = result.filter(k => String(k.campaign_id) === campaignFilter);
    }

    if (matchTypeFilter) {
      result = result.filter(k => k.match_type === matchTypeFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(k =>
        k.keyword_text?.toLowerCase().includes(query)
      );
    }

    result = [...result].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'keyword':
          aVal = (a.keyword_text || '').toLowerCase();
          bVal = (b.keyword_text || '').toLowerCase();
          break;
        case 'matchType':
          aVal = a.match_type || '';
          bVal = b.match_type || '';
          break;
        case 'bid':
          aVal = parseFloat(a.bid_amount || 0);
          bVal = parseFloat(b.bid_amount || 0);
          break;
        case 'spend':
          aVal = parseFloat(a.spend_7d || 0);
          bVal = parseFloat(b.spend_7d || 0);
          break;
        case 'impressions':
          aVal = parseInt(a.impressions_7d || 0);
          bVal = parseInt(b.impressions_7d || 0);
          break;
        case 'taps':
          aVal = parseInt(a.taps_7d || 0);
          bVal = parseInt(b.taps_7d || 0);
          break;
        case 'installs':
          aVal = parseInt(a.installs_7d || 0);
          bVal = parseInt(b.installs_7d || 0);
          break;
        case 'cpa':
          aVal = parseFloat(a.cpa_7d || 999999);
          bVal = parseFloat(b.cpa_7d || 999999);
          break;
        case 'revenue':
          aVal = parseFloat(a.revenue_7d || 0);
          bVal = parseFloat(b.revenue_7d || 0);
          break;
        case 'roas':
          const aSpend = parseFloat(a.spend_7d || 0);
          const aRev = parseFloat(a.revenue_7d || 0);
          aVal = aSpend > 0 ? aRev / aSpend : 0;
          const bSpend = parseFloat(b.spend_7d || 0);
          const bRev = parseFloat(b.revenue_7d || 0);
          bVal = bSpend > 0 ? bRev / bSpend : 0;
          break;
        case 'cop':
          aVal = parseFloat(a.cop_7d || 999999);
          bVal = parseFloat(b.cop_7d || 999999);
          break;
        case 'sov':
          aVal = parseFloat(a.sov || 0);
          bVal = parseFloat(b.sov || 0);
          break;
        case 'ttr':
          aVal = parseFloat(a.ttr_7d || 0);
          bVal = parseFloat(b.ttr_7d || 0);
          break;
        case 'cvr':
          aVal = parseFloat(a.cvr_7d || 0);
          bVal = parseFloat(b.cvr_7d || 0);
          break;
        case 'cpt':
          aVal = parseFloat(a.cpt_7d || 999999);
          bVal = parseFloat(b.cpt_7d || 999999);
          break;
        case 'cpm':
          aVal = parseFloat(a.cpm_7d || 999999);
          bVal = parseFloat(b.cpm_7d || 999999);
          break;
        case 'bidVsCpa':
          const aBid = parseFloat(a.bid_amount || 0);
          const aCpa = parseFloat(a.cpa_7d || 0);
          aVal = aCpa > 0 ? aBid / aCpa : 0;
          const bBid = parseFloat(b.bid_amount || 0);
          const bCpa = parseFloat(b.cpa_7d || 0);
          bVal = bCpa > 0 ? bBid / bCpa : 0;
          break;
        default:
          aVal = a.keyword_text || '';
          bVal = b.keyword_text || '';
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [allKeywordsData, campaignIds, adGroupIds, campaignFilter, matchTypeFilter, searchQuery, sortField, sortDirection]);

  const totalPages = Math.ceil(totalKeywords / itemsPerPage);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setPage(1);
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
    if (selectedIds.size === keywords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(keywords.map(k => k.keyword_id)));
    }
  };

  const updateSearchParams = (newParams) => {
    const params = {};
    if (campaignIds.length > 0) params.campaigns = campaignIds.join(',');
    if (adGroupIds.length > 0) params.adgroups = adGroupIds.join(',');
    if (page > 1) params.page = page;
    setSearchParams({ ...params, ...newParams });
  };

  const clearCampaignFilter = (id) => {
    const newCampaigns = campaignIds.filter(cId => cId !== id);
    const params = {};
    if (newCampaigns.length > 0) params.campaigns = newCampaigns.join(',');
    if (adGroupIds.length > 0) params.adgroups = adGroupIds.join(',');
    setSearchParams(params);
    setPage(1);
  };

  const clearAdGroupFilter = (id) => {
    const newAdGroups = adGroupIds.filter(agId => agId !== id);
    const params = {};
    if (campaignIds.length > 0) params.campaigns = campaignIds.join(',');
    if (newAdGroups.length > 0) params.adgroups = newAdGroups.join(',');
    setSearchParams(params);
    setPage(1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    const params = {};
    if (campaignIds.length > 0) params.campaigns = campaignIds.join(',');
    if (adGroupIds.length > 0) params.adgroups = adGroupIds.join(',');
    if (newPage > 1) params.page = newPage;
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBulkBidUpdate = () => {
    const value = parseFloat(bulkBidAmount);
    if (isNaN(value) || selectedIds.size === 0) return;

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.keyword_id));
    const firstKeyword = selectedKeywords[0];

    const updates = selectedKeywords.map(kw => {
      const currentBid = parseFloat(kw.bid_amount || 0);
      let newBidValue;

      if (bulkBidMode === 'percent') {
        // Percentage change: +10 means increase by 10%, -10 means decrease by 10%
        newBidValue = Math.max(0.01, currentBid * (1 + value / 100));
      } else {
        // Absolute value
        newBidValue = value;
      }

      return {
        keywordId: kw.keyword_id,
        bidAmount: Math.round(newBidValue * 100) / 100,
      };
    });

    bulkBidMutation.mutate({
      campaignId: firstKeyword.campaign_id,
      adGroupId: firstKeyword.adgroup_id,
      updates,
    });
  };

  const handleBulkPause = () => {
    const selectedKeywords = keywords.filter(k => selectedIds.has(k.keyword_id));
    setConfirmModal({
      open: true,
      action: 'pause',
      message: `Pause ${selectedKeywords.length} keywords?`,
      onConfirm: () => {
        const firstKeyword = selectedKeywords[0];
        bulkStatusMutation.mutate({
          campaignId: firstKeyword.campaign_id,
          adGroupId: firstKeyword.adgroup_id,
          keywordIds: selectedKeywords.map(k => k.keyword_id),
          status: 'PAUSED',
        });
      },
    });
  };

  const handleBulkEnable = () => {
    const selectedKeywords = keywords.filter(k => selectedIds.has(k.keyword_id));
    setConfirmModal({
      open: true,
      action: 'enable',
      message: `Enable ${selectedKeywords.length} keywords?`,
      onConfirm: () => {
        const firstKeyword = selectedKeywords[0];
        bulkStatusMutation.mutate({
          campaignId: firstKeyword.campaign_id,
          adGroupId: firstKeyword.adgroup_id,
          keywordIds: selectedKeywords.map(k => k.keyword_id),
          status: 'ACTIVE',
        });
      },
    });
  };

  const handleBulkCreate = async (keywords) => {
    if (!campaignIds.length || !adGroupIds.length) {
      throw new Error('Please select a campaign and ad group first');
    }

    const campaignId = campaignIds[0];
    const adGroupId = adGroupIds[0];

    await createKeywordsMutation.mutateAsync({
      campaignId,
      adGroupId,
      keywords,
    });
  };

  const exportCSV = () => {
    const headers = ['Keyword', 'Match Type', 'Status', 'Bid', 'Bid vs CPA Ratio', 'Recommended Bid', 'Spend', 'Impressions', 'SOV %', 'Taps', 'TTR', 'Installs', 'CVR', 'CPA', 'CPT', 'CPM', 'Revenue', 'ROAS', 'COP'];
    const rows = keywords.map(k => {
      const spend = parseFloat(k.spend_7d || 0);
      const revenue = parseFloat(k.revenue_7d || 0);
      const roas = spend > 0 ? (revenue / spend).toFixed(2) : '';
      const ttr = parseFloat(k.ttr_7d || 0);
      const cvr = parseFloat(k.cvr_7d || 0);
      const bid = parseFloat(k.bid_amount || 0);
      const cpa = parseFloat(k.cpa_7d || 0);
      const bidVsCpaRatio = cpa > 0 ? (bid / cpa).toFixed(2) : '';
      const recommendedBid = cpa > 0 ? Math.max(0.5, cpa * 1.2).toFixed(2) : '';
      return [
        `"${k.keyword_text}"`,
        k.match_type,
        k.keyword_status,
        k.current_bid || k.bid_amount || '',
        bidVsCpaRatio,
        recommendedBid,
        spend.toFixed(2),
        k.impressions_7d || 0,
        parseFloat(k.sov || 0).toFixed(2),
        k.taps_7d || 0,
        (ttr * 100).toFixed(2) + '%',
        k.installs_7d || 0,
        (cvr * 100).toFixed(2) + '%',
        k.cpa_7d || '',
        k.cpt_7d || '',
        k.cpm_7d || '',
        revenue.toFixed(2),
        roas,
        k.cop_7d || '',
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keywords.csv';
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

  // Calculate totals
  const totals = useMemo(() => {
    return keywords.reduce((acc, k) => ({
      spend: acc.spend + parseFloat(k.spend_7d || 0),
      impressions: acc.impressions + parseInt(k.impressions_7d || 0),
      taps: acc.taps + parseInt(k.taps_7d || 0),
      installs: acc.installs + parseInt(k.installs_7d || 0),
      revenue: acc.revenue + parseFloat(k.revenue_7d || 0),
      paidUsers: acc.paidUsers + parseInt(k.paid_users_7d || 0),
      sov: acc.sov + parseFloat(k.sov || 0),
    }), { spend: 0, impressions: 0, taps: 0, installs: 0, revenue: 0, paidUsers: 0, sov: 0 });
  }, [keywords]);

  const avgCpa = totals.installs > 0 ? totals.spend / totals.installs : 0;
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
  const cop = totals.paidUsers > 0 ? totals.spend / totals.paidUsers : 0;

  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length + 2;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Keywords</h1>
          </div>
          <p className="text-gray-500 ml-9">{dateLabel}</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => setBulkAddModalOpen(true)}
            disabled={!campaignIds.length || !adGroupIds.length}
          >
            <Plus size={16} /> Add Keywords
          </Button>
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

      {/* Active Filters */}
      {(campaignIds.length > 0 || adGroupIds.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {campaignIds.length > 0 && (
            <>
              <span className="text-sm text-gray-500">Campaigns:</span>
              {campaignIds.map(id => (
                <Badge key={id} variant="info" className="flex items-center gap-1">
                  {campaignMap.get(id)?.name || `Campaign ${id}`}
                  <button onClick={() => clearCampaignFilter(id)} className="hover:text-red-500">
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </>
          )}
          {adGroupIds.length > 0 && (
            <>
              <span className="text-sm text-gray-500 ml-2">Ad Groups:</span>
              {adGroupIds.map(id => (
                <Badge key={id} variant="default" className="flex items-center gap-1">
                  Ad Group {id}
                  <button onClick={() => clearAdGroupFilter(id)} className="hover:text-red-500">
                    <X size={12} />
                  </button>
                </Badge>
              ))}
            </>
          )}
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>
            Clear all
          </Button>
        </div>
      )}

      {/* Preset Views */}
      <PresetViews
        activePreset={activePreset}
        onPresetChange={applyPreset}
        presets={PRESET_VIEWS}
      />

      {/* Totals */}
      {keywords.length > 0 && (
        <div className="grid grid-cols-7 gap-4">
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Spend</p>
              <p className="text-xl font-bold">${totals.spend.toFixed(2)}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">SOV</p>
              <p className="text-xl font-bold text-blue-600">{totals.sov.toFixed(2)}%</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Installs</p>
              <p className="text-xl font-bold">{totals.installs.toLocaleString()}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">CPA</p>
              <p className="text-xl font-bold">${avgCpa.toFixed(2)}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-xl font-bold text-green-600">${totals.revenue.toFixed(2)}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">ROAS</p>
              <p className={`text-xl font-bold ${roas >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                {roas.toFixed(2)}x
              </p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">COP</p>
              <p className="text-xl font-bold">${cop.toFixed(2)}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <div className="p-4 flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-blue-900">
              {selectedIds.size} keywords selected
            </span>

            {/* Bid Update Section */}
            <div className="flex items-center gap-2 border-l pl-4 border-blue-300">
              <select
                value={bulkBidMode}
                onChange={(e) => setBulkBidMode(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              >
                <option value="absolute">$ Absolute</option>
                <option value="percent">% Change</option>
              </select>
              <Input
                type="number"
                placeholder={bulkBidMode === 'percent' ? '+10 or -10' : 'New bid'}
                value={bulkBidAmount}
                onChange={(e) => setBulkBidAmount(e.target.value)}
                className="w-28"
              />
              <Button
                size="sm"
                onClick={handleBulkBidUpdate}
                loading={bulkBidMutation.isPending}
                disabled={!bulkBidAmount}
              >
                {bulkBidMode === 'percent' ? <Percent size={14} /> : null}
                Update Bids
              </Button>
            </div>

            {/* Status Actions */}
            <div className="flex items-center gap-2 border-l pl-4 border-blue-300">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkPause}
                loading={bulkStatusMutation.isPending}
              >
                <Pause size={14} /> Pause
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleBulkEnable}
                loading={bulkStatusMutation.isPending}
              >
                <Play size={14} /> Enable
              </Button>
            </div>

            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X size={14} /> Clear
            </Button>
          </div>
        </Card>
      )}

      {/* Bulk Add Modal */}
      <BulkKeywordAdd
        isOpen={bulkAddModalOpen}
        onClose={() => setBulkAddModalOpen(false)}
        campaignId={campaignIds[0]}
        adGroupId={adGroupIds[0]}
        onSuccess={handleBulkCreate}
      />

      {/* Confirmation Modal */}
      {confirmModal.open && (
        <Modal
          open={confirmModal.open}
          onClose={() => setConfirmModal({ open: false, action: null, message: '' })}
          title="Confirm Action"
        >
          <p className="text-gray-600 mb-4">{confirmModal.message}</p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => setConfirmModal({ open: false, action: null, message: '' })}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmModal.onConfirm}
              loading={bulkStatusMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        </Modal>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            type="text"
            placeholder="Search keywords..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="pl-10"
          />
        </div>

        <select
          value={campaignFilter}
          onChange={(e) => {
            setCampaignFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Campaigns</option>
          {Array.from(campaignMap.values()).map(campaign => (
            <option key={campaign.id} value={String(campaign.id)}>
              {campaign.name}
            </option>
          ))}
        </select>

        <select
          value={matchTypeFilter}
          onChange={(e) => {
            setMatchTypeFilter(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Match Types</option>
          <option value="EXACT">Exact</option>
          <option value="BROAD">Broad</option>
        </select>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === keywords.length && keywords.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </TableHeader>
                <SortHeader field="keyword">Keyword</SortHeader>
                {columnOrder.map((columnId) => {
                  if (!visibleColumns[columnId]) return null;
                  const column = COLUMN_DEFINITIONS.find(c => c.id === columnId);
                  if (!column) return null;
                  const isRightAligned = columnId !== 'matchType';
                  return (
                    <SortHeader key={columnId} field={columnId} className={isRightAligned ? 'text-right' : ''}>
                      {column.label}
                    </SortHeader>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={visibleColumnCount} className="text-center py-8">Loading keywords...</TableCell>
                </TableRow>
              ) : keywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumnCount} className="text-center py-8 text-gray-500">
                    No keywords found.
                  </TableCell>
                </TableRow>
              ) : (
                keywords.map((kw) => {
                  const spend = parseFloat(kw.spend_7d || 0);
                  const revenue = parseFloat(kw.revenue_7d || 0);
                  const roas = spend > 0 ? revenue / spend : 0;
                  const bid = parseFloat(kw.bid_amount || 0);
                  const cpa = parseFloat(kw.cpa_7d || 0);
                  const bidVsCpaRatio = cpa > 0 ? bid / cpa : 0;
                  const isOverpaying = bidVsCpaRatio > 1.5 && cpa > 0;
                  const recommendedBid = cpa > 0 ? Math.max(0.5, cpa * 1.2) : bid;

                  const renderCell = (columnId) => {
                    switch (columnId) {
                      case 'matchType':
                        return (
                          <TableCell key={columnId}>
                            <Badge variant={kw.match_type === 'EXACT' ? 'info' : 'default'}>
                              {kw.match_type}
                            </Badge>
                          </TableCell>
                        );
                      case 'bid':
                        return (
                          <TableCell key={columnId} className="text-right">
                        {editingKeywordId === kw.keyword_id ? (
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              value={newBid}
                              onChange={(e) => setNewBid(e.target.value)}
                              className="w-20"
                            />
                            <button
                              onClick={() => {
                                const bidVal = parseFloat(newBid);
                                if (!isNaN(bidVal) && bidVal > 0) {
                                  bidMutation.mutate({
                                    keywordId: kw.keyword_id,
                                    campaignId: kw.campaign_id,
                                    adGroupId: kw.adgroup_id,
                                    bidAmount: bidVal,
                                  });
                                }
                              }}
                              className="text-green-600 hover:text-green-700"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingKeywordId(null)}
                              className="text-gray-400 hover:text-gray-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            ${parseFloat(bid).toFixed(2)}
                            <button
                              onClick={() => {
                                setEditingKeywordId(kw.keyword_id);
                                setNewBid(bid);
                              }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              <Edit2 size={12} />
                            </button>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {cpa > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            {isOverpaying && (
                              <AlertTriangle size={14} className="text-orange-500" title="Bid significantly higher than CPA" />
                            )}
                            <span className={isOverpaying ? 'text-orange-600 font-medium' : ''}>
                              ${bid.toFixed(2)} / ${cpa.toFixed(2)}
                            </span>
                            {isOverpaying && (
                              <span className="text-xs text-orange-600" title={`Recommended bid: $${recommendedBid.toFixed(2)}`}>
                                ({(bidVsCpaRatio * 100).toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        ${spend.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseInt(kw.impressions_7d || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium text-blue-600">
                        {parseFloat(kw.sov || 0).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {parseInt(kw.taps_7d || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {(parseFloat(kw.ttr_7d || 0) * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {parseInt(kw.installs_7d || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {(parseFloat(kw.cvr_7d || 0) * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {kw.cpa_7d ? `$${parseFloat(kw.cpa_7d).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {kw.cpt_7d ? `$${parseFloat(kw.cpt_7d).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {kw.cpm_7d ? `$${parseFloat(kw.cpm_7d).toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        ${revenue.toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${roas >= 1 ? 'text-green-600' : roas > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {roas > 0 ? `${roas.toFixed(2)}x` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {kw.cop_7d ? `$${parseFloat(kw.cop_7d).toFixed(2)}` : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {keywords.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, totalKeywords)} of {totalKeywords} keywords
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
              >
                Previous
              </Button>

              <div className="flex items-center gap-1">
                {[...Array(totalPages)].map((_, i) => {
                  const pageNum = i + 1;
                  if (
                    pageNum === 1 ||
                    pageNum === totalPages ||
                    (pageNum >= page - 2 && pageNum <= page + 2)
                  ) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`px-3 py-1 rounded text-sm ${
                          pageNum === page
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  } else if (pageNum === page - 3 || pageNum === page + 3) {
                    return <span key={pageNum} className="text-gray-400">...</span>;
                  }
                  return null;
                })}
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
