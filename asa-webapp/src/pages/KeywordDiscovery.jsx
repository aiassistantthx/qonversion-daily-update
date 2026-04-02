import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { getKeywordSuggestions, getCampaigns, createKeywords } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import {
  ChevronUp, ChevronDown, Search, Plus, Sparkles, Filter, X, Loader2
} from 'lucide-react';

function SortHeader({ field, sortField, sortDirection, onSort, children, className = '' }) {
  return (
    <TableHeader
      className={`cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800 ${className}`}
      onClick={() => onSort(field)}
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

export default function KeywordDiscovery() {
  const queryClient = useQueryClient();
  const { queryParams, label: dateLabel } = useDateRange();

  const [searchQuery, setSearchQuery] = useState('');
  const [adGroupFilter, setAdGroupFilter] = useState('');
  const [minImpressions, setMinImpressions] = useState(100);
  const [minInstalls, setMinInstalls] = useState(5);
  const [sortField, setSortField] = useState('conversions');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedTerms, setSelectedTerms] = useState([]);
  const [confirmAdd, setConfirmAdd] = useState({ open: false, terms: [] });
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns', queryParams],
    queryFn: () => getCampaigns(queryParams),
  });

  const campaignsList = campaignsData?.data || [];

  const adGroups = useMemo(() => {
    const groups = [];
    campaignsList.forEach(c => {
      if (c.adGroups) {
        c.adGroups.forEach(ag => {
          groups.push({
            id: ag.id,
            name: ag.name,
            campaignId: c.id,
            campaignName: c.name
          });
        });
      }
    });
    return groups;
  }, [campaignsList]);

  const { data: suggestionsData, isLoading } = useQuery({
    queryKey: ['keyword-suggestions', {
      adgroup_id: adGroupFilter || undefined,
      min_impressions: minImpressions,
      min_installs: minInstalls,
      ...queryParams,
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage
    }],
    queryFn: () => getKeywordSuggestions({
      adgroup_id: adGroupFilter || undefined,
      min_impressions: minImpressions,
      min_installs: minInstalls,
      ...queryParams,
      limit: itemsPerPage,
      offset: (page - 1) * itemsPerPage
    }),
  });

  const suggestionsList = suggestionsData?.suggestions || [];
  const totalSuggestions = suggestionsData?.total || 0;

  const addKeywordMutation = useMutation({
    mutationFn: (data) => createKeywords(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['keyword-suggestions']);
      queryClient.invalidateQueries(['keywords']);
      setSelectedTerms([]);
      setConfirmAdd({ open: false, terms: [] });
    },
    onError: (error) => {
      alert(`Failed to add keyword(s): ${error.message}`);
    },
  });

  const suggestions = useMemo(() => {
    let result = suggestionsList;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.search_term?.toLowerCase().includes(query) ||
        s.ad_group_name?.toLowerCase().includes(query) ||
        s.campaign_name?.toLowerCase().includes(query)
      );
    }

    result = [...result].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'search_term':
          aVal = (a.search_term || '').toLowerCase();
          bVal = (b.search_term || '').toLowerCase();
          break;
        case 'impressions':
          aVal = a.impressions || 0;
          bVal = b.impressions || 0;
          break;
        case 'taps':
          aVal = a.taps || 0;
          bVal = b.taps || 0;
          break;
        case 'installs':
          aVal = a.installs || 0;
          bVal = b.installs || 0;
          break;
        case 'conversions':
          aVal = a.conversions || 0;
          bVal = b.conversions || 0;
          break;
        case 'conversion_rate':
          aVal = a.conversion_rate || 0;
          bVal = b.conversion_rate || 0;
          break;
        case 'estimated_cpa':
          aVal = a.estimated_cpa || 999999;
          bVal = b.estimated_cpa || 999999;
          break;
        case 'roas':
          aVal = a.roas || 0;
          bVal = b.roas || 0;
          break;
        default:
          aVal = a.conversions || 0;
          bVal = b.conversions || 0;
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [suggestionsList, searchQuery, sortField, sortDirection]);

  const totalPages = Math.ceil(totalSuggestions / itemsPerPage);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSelectTerm = (term) => {
    const key = `${term.search_term}-${term.campaign_id}-${term.ad_group_id}`;
    setSelectedTerms(prev => {
      const existing = prev.find(t =>
        `${t.search_term}-${t.campaign_id}-${t.ad_group_id}` === key
      );
      if (existing) {
        return prev.filter(t =>
          `${t.search_term}-${t.campaign_id}-${t.ad_group_id}` !== key
        );
      }
      return [...prev, term];
    });
  };

  const handleSelectAll = () => {
    if (selectedTerms.length === suggestions.length) {
      setSelectedTerms([]);
    } else {
      setSelectedTerms([...suggestions]);
    }
  };

  const isSelected = (term) => {
    return selectedTerms.some(t =>
      t.search_term === term.search_term &&
      t.campaign_id === term.campaign_id &&
      t.ad_group_id === term.ad_group_id
    );
  };

  const handleAddSingleKeyword = (term) => {
    setConfirmAdd({ open: true, terms: [term] });
  };

  const handleAddSelectedKeywords = () => {
    if (selectedTerms.length === 0) return;
    setConfirmAdd({ open: true, terms: selectedTerms });
  };

  const confirmAddKeywords = async () => {
    const termsToAdd = confirmAdd.terms;
    const grouped = termsToAdd.reduce((acc, term) => {
      const key = `${term.campaign_id}-${term.ad_group_id}`;
      if (!acc[key]) {
        acc[key] = {
          campaignId: term.campaign_id,
          adGroupId: term.ad_group_id,
          keywords: []
        };
      }
      acc[key].keywords.push({
        text: term.search_term,
        matchType: 'EXACT',
        bidAmount: term.recommended_bid
      });
      return acc;
    }, {});

    try {
      for (const group of Object.values(grouped)) {
        await addKeywordMutation.mutateAsync({
          campaignId: group.campaignId,
          adGroupId: group.adGroupId,
          keywords: group.keywords
        });
      }
    } catch (error) {
      console.error('Error adding keywords:', error);
    }
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totals = useMemo(() => {
    return suggestions.reduce((acc, s) => ({
      impressions: acc.impressions + (s.impressions || 0),
      taps: acc.taps + (s.taps || 0),
      installs: acc.installs + (s.installs || 0),
      conversions: acc.conversions + (s.conversions || 0),
      spend: acc.spend + (s.spend || 0),
      revenue: acc.revenue + (s.revenue || 0),
    }), { impressions: 0, taps: 0, installs: 0, conversions: 0, spend: 0, revenue: 0 });
  }, [suggestions]);

  const avgConversionRate = totals.installs > 0 ? totals.conversions / totals.installs : 0;
  const avgRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="text-yellow-500" size={24} />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Keyword Discovery</h1>
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            High-value search terms not yet added as keywords ({dateLabel})
          </p>
        </div>

        {selectedTerms.length > 0 && (
          <Button variant="primary" onClick={handleAddSelectedKeywords}>
            <Plus size={16} /> Add {selectedTerms.length} Selected as Keywords
          </Button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Suggestions</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totalSuggestions}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Impressions</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totals.impressions.toLocaleString()}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Installs</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totals.installs.toLocaleString()}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Conversions</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{totals.conversions.toLocaleString()}</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Avg Conv. Rate</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{(avgConversionRate * 100).toFixed(1)}%</p>
            </div>
          </Card>
          <Card>
            <div className="p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Avg ROAS</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{avgRoas.toFixed(2)}x</p>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <Input
                type="text"
                placeholder="Search terms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-500" />
              <label className="text-sm text-gray-600 dark:text-gray-400">Min Impressions:</label>
              <Input
                type="number"
                value={minImpressions}
                onChange={(e) => {
                  setMinImpressions(parseInt(e.target.value) || 0);
                  setPage(1);
                }}
                className="w-24"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Min Installs:</label>
              <Input
                type="number"
                value={minInstalls}
                onChange={(e) => {
                  setMinInstalls(parseInt(e.target.value) || 0);
                  setPage(1);
                }}
                className="w-24"
              />
            </div>

            <select
              value={adGroupFilter}
              onChange={(e) => {
                setAdGroupFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All Ad Groups</option>
              {adGroups.map(ag => (
                <option key={ag.id} value={ag.id}>
                  {ag.campaignName} - {ag.name}
                </option>
              ))}
            </select>

            {(adGroupFilter || minImpressions !== 100 || minInstalls !== 5) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdGroupFilter('');
                  setMinImpressions(100);
                  setMinInstalls(5);
                  setPage(1);
                }}
              >
                <X size={14} /> Reset Filters
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedTerms.length === suggestions.length && suggestions.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </TableHeader>
                <SortHeader field="search_term" sortField={sortField} sortDirection={sortDirection} onSort={handleSort}>Search Term</SortHeader>
                <TableHeader>Ad Group</TableHeader>
                <SortHeader field="impressions" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-right">Impressions</SortHeader>
                <SortHeader field="taps" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-right">Taps</SortHeader>
                <SortHeader field="installs" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-right">Installs</SortHeader>
                <SortHeader field="conversions" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-right">Conversions</SortHeader>
                <SortHeader field="conversion_rate" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-right">Conv. Rate</SortHeader>
                <SortHeader field="estimated_cpa" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-right">Est. CPA</SortHeader>
                <SortHeader field="roas" sortField={sortField} sortDirection={sortDirection} onSort={handleSort} className="text-right">ROAS</SortHeader>
                <TableHeader className="text-right">Rec. Bid</TableHeader>
                <TableHeader>Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="animate-spin" size={20} />
                      <span>Loading suggestions...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : suggestions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-gray-500">
                    No keyword suggestions found. Try adjusting the filters.
                  </TableCell>
                </TableRow>
              ) : (
                suggestions.map((s, idx) => (
                  <TableRow
                    key={`${s.search_term}-${s.campaign_id}-${s.ad_group_id}-${idx}`}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${isSelected(s) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={isSelected(s)}
                        onChange={() => handleSelectTerm(s)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-xs truncate" title={s.search_term}>
                      {s.search_term}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={`${s.campaign_name} - ${s.ad_group_name}`}>
                      <div className="text-sm">
                        <div className="text-gray-900 dark:text-white">{s.ad_group_name || `Ad Group ${s.ad_group_id}`}</div>
                        <div className="text-xs text-gray-500">{s.campaign_name || `Campaign ${s.campaign_id}`}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.impressions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.taps.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.installs}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.conversions > 0 ? (
                        <Badge variant="success">{s.conversions}</Badge>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {(s.conversion_rate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      {s.estimated_cpa ? `$${s.estimated_cpa.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.roas > 0 ? (
                        <span className={s.roas >= 1 ? 'text-green-600' : 'text-red-500'}>
                          {s.roas.toFixed(2)}x
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      ${s.recommended_bid.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAddSingleKeyword(s)}
                        disabled={addKeywordMutation.isPending}
                      >
                        <Plus size={14} /> Add
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {suggestions.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {(page - 1) * itemsPerPage + 1} to {Math.min(page * itemsPerPage, totalSuggestions)} of {totalSuggestions} suggestions
          </div>

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
              {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1 rounded text-sm ${
                      pageNum === page
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
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
        </div>
      )}

      <ConfirmDialog
        open={confirmAdd.open}
        onClose={() => setConfirmAdd({ open: false, terms: [] })}
        onConfirm={confirmAddKeywords}
        title="Add Keywords"
        message={
          confirmAdd.terms.length === 1
            ? `Add "${confirmAdd.terms[0]?.search_term}" as an EXACT match keyword?`
            : `Add ${confirmAdd.terms.length} search terms as EXACT match keywords?`
        }
        confirmText={addKeywordMutation.isPending ? 'Adding...' : 'Add Keywords'}
        confirmVariant="primary"
        loading={addKeywordMutation.isPending}
      />
    </div>
  );
}
