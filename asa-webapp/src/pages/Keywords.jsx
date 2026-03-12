import { useState, useMemo, memo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { StatusBadge, Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { HoverActions } from '../components/HoverActions';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getKeywords, getCampaigns, updateKeywordBid, bulkUpdateKeywordBids, bulkUpdateKeywordStatus, createKeywords } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { useColumnSettings } from '../hooks/useColumnSettings';
import { useDebounce } from '../hooks/useDebounce';
import { Modal } from '../components/Modal';
import { BulkKeywordAdd } from '../components/BulkKeywordAdd';
import { ColumnPicker } from '../components/ColumnPicker';
import { PresetViews } from '../components/PresetViews';
import { TableSkeleton } from '../components/SkeletonLoader';
import BidRecommendation, { calculateBidRecommendation } from '../components/BidRecommendation';
import { QuickFilters } from '../components/QuickFilters';
import {
  ChevronUp, ChevronDown, Search, ArrowLeft, X, Download, Edit2, Check, Pause, Play, Percent, AlertTriangle, TrendingUp, Plus, Zap, ChevronRight, Eye, KeyRound, SearchX
} from 'lucide-react';

// Target CAC from yearly payback calculation (proceeds-based)
const TARGET_CAC = 65.68;

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
  cac: false,
  kpiDiff: false,
  cpt: false,
  cpm: false,
  revenue: true,
  roas: true,
  roasD7: false,
  roasD30: false,
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
  { id: 'cac', label: 'CAC' },
  { id: 'kpiDiff', label: 'KPI Diff' },
  { id: 'cpt', label: 'CPT' },
  { id: 'cpm', label: 'CPM' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'roas', label: 'ROAS' },
  { id: 'roasD7', label: 'ROAS D7' },
  { id: 'roasD30', label: 'ROAS D30' },
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
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
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
  const [bulkOptimizeModalOpen, setBulkOptimizeModalOpen] = useState(false);
  const [optimizationPreview, setOptimizationPreview] = useState([]);
  const [page, setPage] = useState(parseInt(pageParam) || 1);
  const itemsPerPage = 20;

  // Grouping state
  const [groupBy, setGroupBy] = useState(''); // '', 'matchType', 'performance', 'bidRange'
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  // Quick filter state
  const [quickFilteredKeywords, setQuickFilteredKeywords] = useState(null);

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

  // Helper function to categorize keywords
  const categorizeKeyword = (kw) => {
    const spend = parseFloat(kw.spend_7d || 0);
    const revenue = parseFloat(kw.revenue_7d || 0);
    const roas = spend > 0 ? revenue / spend : 0;
    const cpa = parseFloat(kw.cpa_7d || 0);
    const bid = parseFloat(kw.bid_amount || 0);

    return {
      matchType: kw.match_type || 'UNKNOWN',
      performance: roas >= 1 ? 'Top' : roas >= 0.5 ? 'Mid' : 'Low',
      bidRange: bid >= 5 ? '$5+' : bid >= 1 ? '$1-5' : '$0-1',
    };
  };

  // Filter and sort current page
  const keywords = useMemo(() => {
    let result = allKeywordsData;

    // Apply quick filter first if active
    if (quickFilteredKeywords !== null) {
      result = quickFilteredKeywords;
    }

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

    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
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
        case 'cac':
          aVal = parseFloat(a.cop_7d || 999999);
          bVal = parseFloat(b.cop_7d || 999999);
          break;
        case 'kpiDiff':
          aVal = (parseFloat(a.cop_7d) || 999999) - TARGET_CAC;
          bVal = (parseFloat(b.cop_7d) || 999999) - TARGET_CAC;
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
        case 'roasD7':
          aVal = parseFloat(a.roas_d7 || 0);
          bVal = parseFloat(b.roas_d7 || 0);
          break;
        case 'roasD30':
          aVal = parseFloat(a.roas_d30 || 0);
          bVal = parseFloat(b.roas_d30 || 0);
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
  }, [allKeywordsData, campaignIds, adGroupIds, campaignFilter, matchTypeFilter, debouncedSearchQuery, sortField, sortDirection, quickFilteredKeywords]);

  // Group keywords if grouping is enabled
  const keywordGroups = useMemo(() => {
    if (!groupBy) {
      return [{ name: 'all', label: 'All Keywords', keywords }];
    }

    const groups = {};
    keywords.forEach(kw => {
      const category = categorizeKeyword(kw);
      const groupKey = category[groupBy];
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(kw);
    });

    return Object.entries(groups).map(([key, kws]) => {
      // Calculate aggregate metrics
      const totals = kws.reduce((acc, kw) => {
        acc.spend += parseFloat(kw.spend_7d || 0);
        acc.revenue += parseFloat(kw.revenue_7d || 0);
        acc.installs += parseInt(kw.installs_7d || 0);
        acc.impressions += parseInt(kw.impressions_7d || 0);
        acc.taps += parseInt(kw.taps_7d || 0);
        acc.paidUsers += parseInt(kw.paid_users_7d || 0);
        return acc;
      }, { spend: 0, revenue: 0, installs: 0, impressions: 0, taps: 0, paidUsers: 0 });

      totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
      totals.cpa = totals.installs > 0 ? totals.spend / totals.installs : 0;
      totals.cop = totals.paidUsers > 0 ? totals.spend / totals.paidUsers : 0;
      totals.ttr = totals.impressions > 0 ? totals.taps / totals.impressions : 0;
      totals.cvr = totals.taps > 0 ? totals.installs / totals.taps : 0;
      totals.cpt = totals.taps > 0 ? totals.spend / totals.taps : 0;
      totals.cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;

      return {
        name: key,
        label: key,
        keywords: kws,
        count: kws.length,
        totals,
      };
    }).sort((a, b) => {
      // Sort groups by spend (descending)
      return b.totals.spend - a.totals.spend;
    });
  }, [keywords, groupBy]);

  // Calculate totals from filtered keywords
  const totals = useMemo(() => {
    if (!keywords.length) return null;
    const t = keywords.reduce((acc, kw) => {
      acc.spend += parseFloat(kw.spend_7d || 0);
      acc.revenue += parseFloat(kw.revenue_7d || 0);
      acc.installs += parseInt(kw.installs_7d || 0);
      acc.impressions += parseInt(kw.impressions_7d || 0);
      acc.taps += parseInt(kw.taps_7d || 0);
      acc.paidUsers += parseInt(kw.paid_users_7d || 0);
      return acc;
    }, { spend: 0, revenue: 0, installs: 0, impressions: 0, taps: 0, paidUsers: 0 });
    t.roas = t.spend > 0 ? t.revenue / t.spend : 0;
    t.cpa = t.installs > 0 ? t.spend / t.installs : 0;
    t.cop = t.paidUsers > 0 ? t.spend / t.paidUsers : 0;
    t.ttr = t.impressions > 0 ? t.taps / t.impressions : 0;
    t.cvr = t.taps > 0 ? t.installs / t.taps : 0;
    t.cpt = t.taps > 0 ? t.spend / t.taps : 0;
    t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
    return t;
  }, [keywords]);

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

  const toggleGroupCollapse = (groupName) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
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
      selectedKeywords,
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
      selectedKeywords,
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

  const handleBulkOptimize = () => {
    const selectedKeywords = keywords.filter(k => selectedIds.has(k.keyword_id));

    const preview = selectedKeywords.map(kw => {
      const currentBid = parseFloat(kw.bid_amount || 0);
      const spend = parseFloat(kw.spend_7d || 0);
      const revenue = parseFloat(kw.revenue_7d || 0);
      const roas = spend > 0 ? revenue / spend : 0;

      const recommendation = calculateBidRecommendation(currentBid, {
        cpa_7d: kw.cpa_7d,
        cop_7d: kw.cop_7d,
        cpt_7d: kw.cpt_7d,
        roas: roas,
        sov: kw.sov,
        installs_7d: kw.installs_7d
      });

      if (!recommendation) {
        return {
          keywordId: kw.keyword_id,
          keywordText: kw.keyword_text,
          currentBid,
          recommendedBid: currentBid,
          change: 0,
          changePercent: 0,
          currentCpa: parseFloat(kw.cpa_7d || 0),
          projectedCpa: parseFloat(kw.cpa_7d || 0),
          reason: 'No recommendation available',
          skip: true
        };
      }

      const { recommendedBid, difference, differencePercent, reasons } = recommendation;
      const currentCpa = parseFloat(kw.cpa_7d || 0);
      const projectedCpa = currentCpa > 0 ? currentCpa * (currentBid / recommendedBid) : 0;

      return {
        keywordId: kw.keyword_id,
        keywordText: kw.keyword_text,
        currentBid,
        recommendedBid,
        change: difference,
        changePercent: differencePercent,
        currentCpa,
        projectedCpa,
        reason: reasons[0] || 'Optimized based on performance',
        skip: Math.abs(differencePercent) < 5
      };
    });

    setOptimizationPreview(preview);
    setBulkOptimizeModalOpen(true);
  };

  const applyBulkOptimization = () => {
    const selectedKeywords = keywords.filter(k => selectedIds.has(k.keyword_id));
    const firstKeyword = selectedKeywords[0];

    const updates = optimizationPreview
      .filter(p => !p.skip)
      .map(p => ({
        keywordId: p.keywordId,
        bidAmount: p.recommendedBid,
      }));

    if (updates.length === 0) {
      setBulkOptimizeModalOpen(false);
      return;
    }

    bulkBidMutation.mutate({
      campaignId: firstKeyword.campaign_id,
      adGroupId: firstKeyword.adgroup_id,
      updates,
    }, {
      onSuccess: () => {
        setBulkOptimizeModalOpen(false);
        setSelectedIds(new Set());
        setOptimizationPreview([]);
      }
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
      <div className="flex items-center justify-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </div>
    </TableHeader>
  );

  // Derived values from totals
  const avgCpa = totals?.cpa || 0;
  const roas = totals?.roas || 0;
  const cop = totals?.cop || 0;

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

      {/* Quick Filters */}
      <Card>
        <div className="p-4">
          <QuickFilters
            keywords={allKeywordsData}
            onFilterChange={(filtered) => setQuickFilteredKeywords(filtered)}
          />
        </div>
      </Card>

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
                {(roas * 100).toFixed(0)}%
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

            {/* Optimize All Bids */}
            <div className="flex items-center gap-2 border-l pl-4 border-blue-300">
              <Button
                size="sm"
                variant="primary"
                onClick={handleBulkOptimize}
              >
                <Zap size={14} /> Optimize All Bids
              </Button>
            </div>

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
        <ConfirmDialog
          open={confirmModal.open}
          onClose={() => setConfirmModal({ open: false, action: null, selectedKeywords: [] })}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.action === 'pause' ? 'Pause Keywords' : 'Enable Keywords'}
          message={confirmModal.action === 'pause' ? 'Pause selected keywords?' : 'Enable selected keywords?'}
          confirmText={confirmModal.action === 'pause' ? 'Pause' : 'Enable'}
          items={confirmModal.selectedKeywords?.map(k => k.keyword_text) || []}
          itemLabel="keywords"
          isLoading={bulkStatusMutation.isPending}
        />
      )}

      {/* Bulk Optimization Preview Modal */}
      {bulkOptimizeModalOpen && (
        <Modal
          open={bulkOptimizeModalOpen}
          onClose={() => setBulkOptimizeModalOpen(false)}
          title="Optimize Bids - Preview"
          className="max-w-5xl"
        >
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-sm text-gray-600">Keywords to Update</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {optimizationPreview.filter(p => !p.skip).length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Bid Change</p>
                  <p className="text-2xl font-bold">
                    ${optimizationPreview.reduce((sum, p) => sum + (p.skip ? 0 : p.change), 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Avg CPA Change</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(() => {
                      const validPreviews = optimizationPreview.filter(p => !p.skip && p.currentCpa > 0);
                      if (validPreviews.length === 0) return '-';
                      const avgChange = validPreviews.reduce((sum, p) =>
                        sum + (p.projectedCpa - p.currentCpa), 0) / validPreviews.length;
                      return `${avgChange >= 0 ? '+' : ''}$${avgChange.toFixed(2)}`;
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Skipped (&lt; 5% change)</p>
                  <p className="text-2xl font-bold text-gray-400">
                    {optimizationPreview.filter(p => p.skip).length}
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Keyword</TableHeader>
                    <TableHeader>Current Bid</TableHeader>
                    <TableHeader>Recommended Bid</TableHeader>
                    <TableHeader>Change</TableHeader>
                    <TableHeader>Current CPA</TableHeader>
                    <TableHeader>Projected CPA</TableHeader>
                    <TableHeader>Reason</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {optimizationPreview.map((preview) => (
                    <TableRow
                      key={preview.keywordId}
                      className={preview.skip ? 'opacity-50' : ''}
                    >
                      <TableCell className="font-medium max-w-xs truncate" title={preview.keywordText}>
                        {preview.keywordText}
                        {preview.skip && (
                          <Badge variant="default" className="ml-2 text-xs">Skip</Badge>
                        )}
                      </TableCell>
                      <TableCell>${preview.currentBid.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">
                        ${preview.recommendedBid.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          preview.change > 0 ? 'text-orange-600' :
                          preview.change < 0 ? 'text-green-600' :
                          'text-gray-400'
                        }`}>
                          {preview.change > 0 ? '+' : ''}${preview.change.toFixed(2)}
                          <span className="text-xs ml-1">
                            ({preview.changePercent > 0 ? '+' : ''}{preview.changePercent.toFixed(1)}%)
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {preview.currentCpa > 0 ? `$${preview.currentCpa.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>
                        {preview.projectedCpa > 0 ? (
                          <span className={preview.projectedCpa < preview.currentCpa ? 'text-green-600 font-medium' : ''}>
                            ${preview.projectedCpa.toFixed(2)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-600 max-w-xs truncate" title={preview.reason}>
                        {preview.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2 justify-end border-t pt-4">
              <Button
                variant="ghost"
                onClick={() => setBulkOptimizeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={applyBulkOptimization}
                loading={bulkBidMutation.isPending}
                disabled={optimizationPreview.filter(p => !p.skip).length === 0}
              >
                <Zap size={14} /> Apply Optimization
              </Button>
            </div>
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

        <select
          value={groupBy}
          onChange={(e) => {
            setGroupBy(e.target.value);
            setCollapsedGroups(new Set());
            setPage(1);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium"
        >
          <option value="">No Grouping</option>
          <option value="matchType">Group by Match Type</option>
          <option value="performance">Group by Performance</option>
          <option value="bidRange">Group by Bid Range</option>
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
                  return (
                    <SortHeader key={columnId} field={columnId}>
                      {column.label}
                    </SortHeader>
                  );
                })}
              </TableRow>
              {/* Totals Row */}
              {totals && (
                <TableRow className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                  <TableHeader></TableHeader>
                  <TableHeader className="text-blue-700">TOTAL ({keywords.length})</TableHeader>
                  {columnOrder.map((columnId) => {
                    if (!visibleColumns[columnId]) return null;
                    switch (columnId) {
                      case 'matchType':
                      case 'bid':
                      case 'bidVsCpa':
                      case 'sov':
                        return <TableHeader key={columnId}>—</TableHeader>;
                      case 'spend':
                        return <TableHeader key={columnId}>${totals.spend?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableHeader>;
                      case 'impressions':
                        return <TableHeader key={columnId}>{totals.impressions?.toLocaleString()}</TableHeader>;
                      case 'taps':
                        return <TableHeader key={columnId}>{totals.taps?.toLocaleString()}</TableHeader>;
                      case 'installs':
                        return <TableHeader key={columnId}>{totals.installs?.toLocaleString()}</TableHeader>;
                      case 'revenue':
                        return <TableHeader key={columnId} className="text-green-600">${totals.revenue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableHeader>;
                      case 'roas':
                        return <TableHeader key={columnId}><span className={totals.roas >= 1 ? 'text-green-600' : 'text-red-500'}>{(totals.roas * 100)?.toFixed(0)}%</span></TableHeader>;
                      case 'cpa':
                        return <TableHeader key={columnId}>${totals.cpa?.toFixed(2)}</TableHeader>;
                      case 'cac':
                      case 'cop':
                        return <TableHeader key={columnId}>${totals.cop?.toFixed(2)}</TableHeader>;
                      case 'kpiDiff':
                        const kpiDiff = totals.cop ? totals.cop - TARGET_CAC : null;
                        return <TableHeader key={columnId}><span className={kpiDiff <= 0 ? 'text-green-600' : 'text-red-600'}>{kpiDiff !== null ? (kpiDiff >= 0 ? '+' : '') + kpiDiff.toFixed(2) : '—'}</span></TableHeader>;
                      case 'roasD7':
                      case 'roasD30':
                        return <TableHeader key={columnId}>—</TableHeader>;
                      case 'ttr':
                        return <TableHeader key={columnId}>{(totals.ttr * 100).toFixed(2)}%</TableHeader>;
                      case 'cvr':
                        return <TableHeader key={columnId}>{(totals.cvr * 100).toFixed(2)}%</TableHeader>;
                      case 'cpt':
                        return <TableHeader key={columnId}>${totals.cpt?.toFixed(2)}</TableHeader>;
                      case 'cpm':
                        return <TableHeader key={columnId}>${totals.cpm?.toFixed(2)}</TableHeader>;
                      default:
                        return <TableHeader key={columnId}>—</TableHeader>;
                    }
                  })}
                </TableRow>
              )}
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableSkeleton rows={10} columns={visibleColumnCount} />
              ) : keywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumnCount} className="py-0">
                    <EmptyState
                      icon={searchQuery ? SearchX : KeyRound}
                      title={searchQuery ? `No results for "${searchQuery}"` : "No keywords in this ad group"}
                      description={searchQuery ? "Try different filters or search terms" : "Add keywords to start advertising"}
                      variant={searchQuery ? "search" : "default"}
                      action={!searchQuery && (
                        <Button onClick={() => setBulkAddOpen(true)}>
                          <Plus size={16} /> Add Keywords
                        </Button>
                      )}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                keywordGroups.flatMap((group) => {
                  const isCollapsed = collapsedGroups.has(group.name);
                  const groupRows = [];

                  // Group header row (only show if grouping is enabled)
                  if (groupBy) {
                    groupRows.push(
                      <TableRow key={`group-${group.name}`} className="bg-gray-100 hover:bg-gray-200 cursor-pointer border-t-2 border-gray-300">
                        <TableCell colSpan={2} onClick={() => toggleGroupCollapse(group.name)}>
                          <div className="flex items-center gap-2 font-semibold text-gray-900">
                            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            <span>{group.label}</span>
                            <Badge variant="info">{group.count} keywords</Badge>
                          </div>
                        </TableCell>
                        {columnOrder.map((columnId) => {
                          if (!visibleColumns[columnId]) return null;

                          // Show aggregate metrics for each column
                          switch (columnId) {
                            case 'matchType':
                            case 'bid':
                            case 'bidVsCpa':
                            case 'sov':
                              return <TableCell key={columnId}>—</TableCell>;
                            case 'spend':
                              return <TableCell key={columnId} className="font-semibold">${group.totals.spend?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>;
                            case 'impressions':
                              return <TableCell key={columnId} className="font-semibold">{group.totals.impressions?.toLocaleString()}</TableCell>;
                            case 'taps':
                              return <TableCell key={columnId} className="font-semibold">{group.totals.taps?.toLocaleString()}</TableCell>;
                            case 'installs':
                              return <TableCell key={columnId} className="font-semibold">{group.totals.installs?.toLocaleString()}</TableCell>;
                            case 'revenue':
                              return <TableCell key={columnId} className="font-semibold text-green-600">${group.totals.revenue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>;
                            case 'roas':
                              return <TableCell key={columnId} className="font-semibold"><span className={group.totals.roas >= 1 ? 'text-green-600' : 'text-red-500'}>{(group.totals.roas * 100)?.toFixed(0)}%</span></TableCell>;
                            case 'cpa':
                              return <TableCell key={columnId} className="font-semibold">${group.totals.cpa?.toFixed(2)}</TableCell>;
                            case 'cac':
                            case 'cop':
                              return <TableCell key={columnId} className="font-semibold">${group.totals.cop?.toFixed(2)}</TableCell>;
                            case 'ttr':
                              return <TableCell key={columnId} className="font-semibold">{(group.totals.ttr * 100).toFixed(2)}%</TableCell>;
                            case 'cvr':
                              return <TableCell key={columnId} className="font-semibold">{(group.totals.cvr * 100).toFixed(2)}%</TableCell>;
                            case 'cpt':
                              return <TableCell key={columnId} className="font-semibold">${group.totals.cpt?.toFixed(2)}</TableCell>;
                            case 'cpm':
                              return <TableCell key={columnId} className="font-semibold">${group.totals.cpm?.toFixed(2)}</TableCell>;
                            default:
                              return <TableCell key={columnId}>—</TableCell>;
                          }
                        })}
                      </TableRow>
                    );
                  }

                  // Keyword rows (only show if not collapsed)
                  if (!isCollapsed) {
                    group.keywords.forEach((kw) => {
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
                          <TableCell key={columnId}>
                        {editingKeywordId === kw.keyword_id ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1 justify-center">
                              <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                max="100"
                                value={newBid}
                                onChange={(e) => setNewBid(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const bidVal = parseFloat(newBid);
                                    if (!isNaN(bidVal) && bidVal >= 0.01 && bidVal <= 100) {
                                      bidMutation.mutate({
                                        keywordId: kw.keyword_id,
                                        campaignId: kw.campaign_id,
                                        adGroupId: kw.adgroup_id,
                                        bidAmount: bidVal,
                                      });
                                    }
                                  } else if (e.key === 'Escape') {
                                    setEditingKeywordId(null);
                                    setNewBid('');
                                  }
                                }}
                                className="w-24 text-center"
                                disabled={bidMutation.isPending}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const bidVal = parseFloat(newBid);
                                  if (!isNaN(bidVal) && bidVal >= 0.01 && bidVal <= 100) {
                                    bidMutation.mutate({
                                      keywordId: kw.keyword_id,
                                      campaignId: kw.campaign_id,
                                      adGroupId: kw.adgroup_id,
                                      bidAmount: bidVal,
                                    });
                                  }
                                }}
                                loading={bidMutation.isPending}
                                className="text-green-600 hover:text-green-700"
                              >
                                <Check size={14} />
                              </Button>
                              <button
                                onClick={() => {
                                  setEditingKeywordId(null);
                                  setNewBid('');
                                }}
                                className="text-gray-400 hover:text-gray-500"
                                disabled={bidMutation.isPending}
                              >
                                <X size={14} />
                              </button>
                            </div>
                            {(() => {
                              const bidVal = parseFloat(newBid);
                              const currentBidVal = parseFloat(bid);
                              if (!isNaN(bidVal) && !isNaN(currentBidVal) && currentBidVal > 0) {
                                const change = bidVal - currentBidVal;
                                const changePercent = (change / currentBidVal) * 100;
                                if (Math.abs(change) > 0.001) {
                                  return (
                                    <span className={`text-xs font-medium ${change > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                      {change > 0 ? '+' : ''}${change.toFixed(2)} ({changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%)
                                    </span>
                                  );
                                }
                              }
                              return null;
                            })()}
                            {(() => {
                              const bidVal = parseFloat(newBid);
                              if (isNaN(bidVal) || bidVal < 0.01 || bidVal > 100) {
                                return (
                                  <span className="text-xs text-red-600">
                                    Must be between $0.01 and $100
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <div
                              className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                              onClick={() => {
                                setEditingKeywordId(kw.keyword_id);
                                setNewBid(bid);
                              }}
                              title="Click to edit"
                            >
                              <span className="font-medium">${parseFloat(bid).toFixed(2)}</span>
                              <Edit2 size={12} className="text-gray-400" />
                            </div>
                            <BidRecommendation
                              currentBid={bid}
                              metrics={{
                                cpa_7d: kw.cpa_7d,
                                cop_7d: kw.cop_7d,
                                cpt_7d: kw.cpt_7d,
                                roas: roas,
                                sov: kw.sov,
                                installs_7d: kw.installs_7d
                              }}
                              inline={true}
                            />
                          </div>
                        )}
                      </TableCell>
                        );
                      case 'bidVsCpa':
                        return (
                      <TableCell key={columnId}>
                        {cpa > 0 ? (
                          <div className="flex items-center justify-center gap-2">
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
                        );
                      case 'spend':
                        return (
                          <TableCell key={columnId}>
                            ${spend.toFixed(2)}
                          </TableCell>
                        );
                      case 'impressions':
                        return (
                          <TableCell key={columnId}>
                            {parseInt(kw.impressions_7d || 0).toLocaleString()}
                          </TableCell>
                        );
                      case 'sov':
                        return (
                          <TableCell key={columnId} className="font-medium text-blue-600">
                            {parseFloat(kw.sov || 0).toFixed(2)}%
                          </TableCell>
                        );
                      case 'taps':
                        return (
                          <TableCell key={columnId}>
                            {parseInt(kw.taps_7d || 0).toLocaleString()}
                          </TableCell>
                        );
                      case 'ttr':
                        return (
                          <TableCell key={columnId}>
                            {(parseFloat(kw.ttr_7d || 0) * 100).toFixed(2)}%
                          </TableCell>
                        );
                      case 'installs':
                        return (
                          <TableCell key={columnId}>
                            {parseInt(kw.installs_7d || 0)}
                          </TableCell>
                        );
                      case 'cvr':
                        return (
                          <TableCell key={columnId}>
                            {(parseFloat(kw.cvr_7d || 0) * 100).toFixed(2)}%
                          </TableCell>
                        );
                      case 'cpa':
                        return (
                          <TableCell key={columnId}>
                            {kw.cpa_7d ? `$${parseFloat(kw.cpa_7d).toFixed(2)}` : '-'}
                          </TableCell>
                        );
                      case 'cpt':
                        return (
                          <TableCell key={columnId}>
                            {kw.cpt_7d ? `$${parseFloat(kw.cpt_7d).toFixed(2)}` : '-'}
                          </TableCell>
                        );
                      case 'cpm':
                        return (
                          <TableCell key={columnId}>
                            {kw.cpm_7d ? `$${parseFloat(kw.cpm_7d).toFixed(2)}` : '-'}
                          </TableCell>
                        );
                      case 'revenue':
                        return (
                          <TableCell key={columnId} className="text-green-600">
                            ${revenue.toFixed(2)}
                          </TableCell>
                        );
                      case 'roas':
                        return (
                          <TableCell key={columnId} className={`font-medium ${roas >= 1 ? 'text-green-600' : roas > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {roas > 0 ? `${(roas * 100).toFixed(0)}%` : '-'}
                          </TableCell>
                        );
                      case 'roasD7':
                        const roasD7 = parseFloat(kw.roas_d7 || 0);
                        return (
                          <TableCell key={columnId} className={`font-medium ${roasD7 >= 1 ? 'text-green-600' : roasD7 > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {roasD7 > 0 ? `${(roasD7 * 100).toFixed(0)}%` : '-'}
                          </TableCell>
                        );
                      case 'roasD30':
                        const roasD30 = parseFloat(kw.roas_d30 || 0);
                        return (
                          <TableCell key={columnId} className={`font-medium ${roasD30 >= 1 ? 'text-green-600' : roasD30 > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {roasD30 > 0 ? `${(roasD30 * 100).toFixed(0)}%` : '-'}
                          </TableCell>
                        );
                      case 'cac':
                        return (
                          <TableCell key={columnId}>
                            {kw.cop_7d ? `$${parseFloat(kw.cop_7d).toFixed(2)}` : '-'}
                          </TableCell>
                        );
                      case 'kpiDiff':
                        const kwCac = parseFloat(kw.cop_7d);
                        const kwKpiDiff = kwCac ? kwCac - TARGET_CAC : null;
                        const kwIsOnTarget = kwKpiDiff !== null && kwKpiDiff <= 0;
                        return (
                          <TableCell key={columnId}>
                            {kwKpiDiff !== null ? (
                              <span className={`font-medium ${kwIsOnTarget ? 'text-green-600' : 'text-red-600'}`}>
                                {kwKpiDiff >= 0 ? '+' : ''}{kwKpiDiff.toFixed(2)}
                              </span>
                            ) : '-'}
                          </TableCell>
                        );
                      case 'cop':
                        return (
                          <TableCell key={columnId}>
                            {kw.cop_7d ? `$${parseFloat(kw.cop_7d).toFixed(2)}` : '-'}
                          </TableCell>
                        );
                      default:
                        return null;
                    }
                  };

                      groupRows.push(
                        <TableRow
                          key={kw.keyword_id}
                          className={selectedIds.has(kw.keyword_id) ? 'bg-blue-50' : ''}
                          hoverActions={
                            <HoverActions>
                              <Button
                                size="sm"
                                variant={kw.keyword_status === 'ACTIVE' ? 'danger' : 'success'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  bulkStatusMutation.mutate({
                                    campaignId: kw.campaign_id,
                                    adGroupId: kw.adgroup_id,
                                    keywordIds: [kw.keyword_id],
                                    status: kw.keyword_status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
                                  });
                                }}
                                loading={bulkStatusMutation.isPending}
                                title={kw.keyword_status === 'ACTIVE' ? 'Pause' : 'Enable'}
                              >
                                {kw.keyword_status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingKeywordId(kw.keyword_id);
                                  setNewBid(bid);
                                }}
                                title="Edit bid"
                              >
                                <Edit2 size={14} />
                              </Button>
                            </HoverActions>
                          }
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(kw.keyword_id)}
                              onChange={() => toggleSelect(kw.keyword_id)}
                              className="rounded border-gray-300"
                            />
                          </TableCell>
                          <TableCell className="font-medium max-w-xs truncate" title={kw.keyword_text}>
                            {kw.keyword_text}
                          </TableCell>
                          {columnOrder.map(columnId => visibleColumns[columnId] ? renderCell(columnId) : null)}
                        </TableRow>
                      );
                    });
                  }

                  return groupRows;
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
