import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { SearchTermsAutoNegateModal } from '../components/SearchTermsAutoNegateModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getSearchTerms, getCampaigns, createNegativeKeywords, createKeywords } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { useFilterPersistence } from '../hooks/useFilterPersistence';
import {
  ChevronUp, ChevronDown, Search, ArrowLeft, X, Download, Plus, Minus, Sparkles, Filter, RotateCcw
} from 'lucide-react';

export default function SearchTerms() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { queryParams, label: dateLabel } = useDateRange();

  const campaignIdsParam = searchParams.get('campaigns');
  const adGroupIdsParam = searchParams.get('adgroups');
  const campaignIds = campaignIdsParam ? campaignIdsParam.split(',') : [];
  const adGroupIds = adGroupIdsParam ? adGroupIdsParam.split(',') : [];

  const { filters, setFilters, resetFilters, syncToUrl, activeFilterCount } = useFilterPersistence('search-terms-filters', {
    searchQuery: '',
    campaignFilter: '',
    sortField: 'spend',
    sortDirection: 'desc',
  });

  const [searchQuery, setSearchQuery] = useState(filters.searchQuery || '');
  const [campaignFilter, setCampaignFilter] = useState(filters.campaignFilter || '');
  const [sortField, setSortField] = useState(filters.sortField || 'spend');
  const [sortDirection, setSortDirection] = useState(filters.sortDirection || 'desc');
  const [page, setPage] = useState(1);
  const [showAutoNegateModal, setShowAutoNegateModal] = useState(false);
  const [confirmNegative, setConfirmNegative] = useState({ open: false, term: null });
  const itemsPerPage = 20;

  useEffect(() => {
    setFilters({
      searchQuery,
      campaignFilter,
      sortField,
      sortDirection,
    });
  }, [searchQuery, campaignFilter, sortField, sortDirection]);

  const negativeKeywordMutation = useMutation({
    mutationFn: (data) => createNegativeKeywords(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['search-terms']);
      const count = variables.negativeKeywords?.length || 1;
      alert(`${count} negative keyword${count > 1 ? 's' : ''} added successfully`);
    },
    onError: (error) => {
      alert(`Failed to add negative keyword: ${error.message}`);
    },
  });

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

  // Get search terms with filters
  const { data: searchTermsData, isLoading } = useQuery({
    queryKey: ['search-terms', { campaignIds, adGroupIds, queryParams, page }],
    queryFn: () => getSearchTerms({
      campaign_id: campaignIds.length === 1 ? campaignIds[0] : undefined,
      adgroup_id: adGroupIds.length === 1 ? adGroupIds[0] : undefined,
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage,
      ...queryParams,
    }),
  });

  const allSearchTermsData = searchTermsData?.data || [];
  const totalSearchTerms = searchTermsData?.total || allSearchTermsData.length;

  // Filter and sort
  const searchTerms = useMemo(() => {
    let result = allSearchTermsData;

    if (campaignIds.length > 1) {
      result = result.filter(st => campaignIds.includes(String(st.campaign_id)));
    }

    if (adGroupIds.length > 1) {
      result = result.filter(st => adGroupIds.includes(String(st.adgroup_id)));
    }

    if (campaignFilter) {
      result = result.filter(st => String(st.campaign_id) === campaignFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(st =>
        st.search_term?.toLowerCase().includes(query)
      );
    }

    result = [...result].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'searchTerm':
          aVal = (a.search_term || '').toLowerCase();
          bVal = (b.search_term || '').toLowerCase();
          break;
        case 'spend':
          aVal = parseFloat(a.spend || 0);
          bVal = parseFloat(b.spend || 0);
          break;
        case 'impressions':
          aVal = parseInt(a.impressions || 0);
          bVal = parseInt(b.impressions || 0);
          break;
        case 'taps':
          aVal = parseInt(a.taps || 0);
          bVal = parseInt(b.taps || 0);
          break;
        case 'installs':
          aVal = parseInt(a.installs || 0);
          bVal = parseInt(b.installs || 0);
          break;
        case 'cpa':
          aVal = parseFloat(a.cpa || 999999);
          bVal = parseFloat(b.cpa || 999999);
          break;
        case 'ttr':
          aVal = parseFloat(a.ttr || 0);
          bVal = parseFloat(b.ttr || 0);
          break;
        case 'cpt':
          aVal = parseFloat(a.cpt || 999999);
          bVal = parseFloat(b.cpt || 999999);
          break;
        default:
          aVal = a.search_term || '';
          bVal = b.search_term || '';
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [allSearchTermsData, campaignIds, adGroupIds, campaignFilter, searchQuery, sortField, sortDirection]);

  const totalPages = Math.ceil(totalSearchTerms / itemsPerPage);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setPage(1);
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

  const exportCSV = () => {
    const headers = ['Search Term', 'Campaign', 'Ad Group', 'Spend', 'Impressions', 'Taps', 'TTR', 'Installs', 'CPA', 'CPT'];
    const rows = searchTerms.map(st => {
      const spend = parseFloat(st.spend || 0);
      const ttr = parseFloat(st.ttr || 0);
      const campaign = campaignMap.get(String(st.campaign_id));
      return [
        `"${st.search_term}"`,
        campaign?.name || st.campaign_id,
        st.adgroup_id,
        spend.toFixed(2),
        st.impressions || 0,
        st.taps || 0,
        (ttr * 100).toFixed(2) + '%',
        st.installs || 0,
        st.cpa ? parseFloat(st.cpa).toFixed(2) : '',
        st.cpt ? parseFloat(st.cpt).toFixed(2) : '',
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'search-terms.csv';
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

  const totals = useMemo(() => {
    return searchTerms.reduce((acc, st) => ({
      spend: acc.spend + parseFloat(st.spend || 0),
      impressions: acc.impressions + parseInt(st.impressions || 0),
      taps: acc.taps + parseInt(st.taps || 0),
      installs: acc.installs + parseInt(st.installs || 0),
    }), { spend: 0, impressions: 0, taps: 0, installs: 0 });
  }, [searchTerms]);

  const avgCpa = totals.installs > 0 ? totals.spend / totals.installs : 0;
  const avgTtr = totals.impressions > 0 ? totals.taps / totals.impressions : 0;

  const handleBulkAddNegatives = async (termsToAdd) => {
    const grouped = termsToAdd.reduce((acc, st) => {
      const key = `${st.campaign_id}-${st.adgroup_id}`;
      if (!acc[key]) {
        acc[key] = {
          campaignId: st.campaign_id,
          adGroupId: st.adgroup_id,
          keywords: []
        };
      }
      acc[key].keywords.push({
        text: st.search_term,
        matchType: 'EXACT'
      });
      return acc;
    }, {});

    try {
      for (const group of Object.values(grouped)) {
        await negativeKeywordMutation.mutateAsync({
          campaignId: group.campaignId,
          adGroupId: group.adGroupId,
          negativeKeywords: group.keywords
        });
      }
      setShowAutoNegateModal(false);
    } catch (error) {
      console.error('Error adding negative keywords:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Search Terms</h1>
          </div>
          <p className="text-gray-500 ml-9">{dateLabel}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="primary" onClick={() => setShowAutoNegateModal(true)}>
            <Sparkles size={16} /> Auto-Negate
          </Button>
          <Button variant="secondary" onClick={exportCSV}>
            <Download size={16} /> Export CSV
          </Button>
        </div>
      </div>

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

      {searchTerms.length > 0 && (
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Spend</p>
              <p className="text-xl font-bold">${totals.spend.toFixed(2)}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Impressions</p>
              <p className="text-xl font-bold">{totals.impressions.toLocaleString()}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500">Taps</p>
              <p className="text-xl font-bold">{totals.taps.toLocaleString()}</p>
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
              <p className="text-sm text-gray-500">Avg CPA</p>
              <p className="text-xl font-bold">${avgCpa.toFixed(2)}</p>
            </div>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            type="text"
            placeholder="Search terms..."
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

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 border-l pl-4 border-gray-300">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-500" />
              <Badge variant="info" className="font-medium">
                {activeFilterCount} active
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                resetFilters();
                setSearchQuery('');
                setCampaignFilter('');
                setSortField('spend');
                setSortDirection('desc');
                setPage(1);
              }}
              title="Reset all filters"
            >
              <RotateCcw size={14} /> Reset
            </Button>
          </div>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={syncToUrl}
          title="Copy URL to share these filters"
        >
          Share Filters
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <SortHeader field="searchTerm">Search Term</SortHeader>
                <SortHeader field="spend" className="text-right">Spend</SortHeader>
                <SortHeader field="impressions" className="text-right">Impressions</SortHeader>
                <SortHeader field="taps" className="text-right">Taps</SortHeader>
                <SortHeader field="ttr" className="text-right">TTR</SortHeader>
                <SortHeader field="installs" className="text-right">Installs</SortHeader>
                <SortHeader field="cpa" className="text-right">CPA</SortHeader>
                <SortHeader field="cpt" className="text-right">CPT</SortHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">Loading search terms...</TableCell>
                </TableRow>
              ) : searchTerms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                    No search terms found. Select a campaign from the Campaigns page.
                  </TableCell>
                </TableRow>
              ) : (
                searchTerms.map((st, idx) => {
                  const spend = parseFloat(st.spend || 0);
                  const ttr = parseFloat(st.ttr || 0);
                  const cpa = parseFloat(st.cpa || 0);
                  const cpt = parseFloat(st.cpt || 0);

                  return (
                    <TableRow key={`${st.search_term}-${st.campaign_id}-${st.adgroup_id}-${idx}`} className="hover:bg-gray-50">
                      <TableCell className="font-medium max-w-xs" title={st.search_term}>
                        {st.search_term}
                      </TableCell>
                      <TableCell className="text-right">
                        ${spend.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseInt(st.impressions || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseInt(st.taps || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {(ttr * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {parseInt(st.installs || 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {cpa > 0 ? `$${cpa.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {cpt > 0 ? `$${cpt.toFixed(2)}` : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              navigate(`/keywords?campaigns=${st.campaign_id}&adgroups=${st.adgroup_id}`);
                            }}
                            title="Add as keyword"
                          >
                            <Plus size={14} /> Keyword
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setConfirmNegative({ open: true, term: st });
                            }}
                            title="Add as negative keyword"
                            disabled={negativeKeywordMutation.isPending}
                          >
                            <Minus size={14} /> Negative
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {searchTerms.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, totalSearchTerms)} of {totalSearchTerms} search terms
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

      <SearchTermsAutoNegateModal
        open={showAutoNegateModal}
        onClose={() => setShowAutoNegateModal(false)}
        searchTerms={allSearchTermsData}
        onAddNegatives={handleBulkAddNegatives}
      />
    </div>
  );
}
