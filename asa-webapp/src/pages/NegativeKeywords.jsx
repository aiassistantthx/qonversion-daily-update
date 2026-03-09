import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { getNegativeKeywords, getCampaigns, createNegativeKeywords, deleteNegativeKeyword } from '../lib/api';
import {
  ChevronUp, ChevronDown, Search, ArrowLeft, X, Plus, Trash2, AlertTriangle
} from 'lucide-react';

export default function NegativeKeywords() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const campaignIdsParam = searchParams.get('campaigns');
  const adGroupIdsParam = searchParams.get('adgroups');
  const campaignIds = campaignIdsParam ? campaignIdsParam.split(',') : [];
  const adGroupIds = adGroupIdsParam ? adGroupIdsParam.split(',') : [];

  const [searchQuery, setSearchQuery] = useState('');
  const [matchTypeFilter, setMatchTypeFilter] = useState('');
  const [sortField, setSortField] = useState('text');
  const [sortDirection, setSortDirection] = useState('asc');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [defaultMatchType, setDefaultMatchType] = useState('EXACT');
  const [errors, setErrors] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => getCampaigns(),
  });

  const campaignMap = useMemo(() => {
    const map = new Map();
    (campaignsData?.data || []).forEach(c => map.set(String(c.id), c));
    return map;
  }, [campaignsData]);

  const { data: negativeKeywordsData, isLoading } = useQuery({
    queryKey: ['negative-keywords', { campaignIds, adGroupIds }],
    queryFn: async () => {
      if (!campaignIds.length) return { data: [] };

      const allKeywords = [];
      for (const campaignId of campaignIds) {
        if (adGroupIds.length) {
          for (const adGroupId of adGroupIds) {
            const result = await getNegativeKeywords({ campaign_id: campaignId, adgroup_id: adGroupId });
            allKeywords.push(...(result.data || []).map(kw => ({ ...kw, campaign_id: campaignId, adgroup_id: adGroupId })));
          }
        } else {
          const result = await getNegativeKeywords({ campaign_id: campaignId });
          allKeywords.push(...(result.data || []).map(kw => ({ ...kw, campaign_id: campaignId })));
        }
      }
      return { data: allKeywords };
    },
    enabled: campaignIds.length > 0,
  });

  const createMutation = useMutation({
    mutationFn: (data) => createNegativeKeywords(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['negative-keywords']);
      setAddModalOpen(false);
      setTextInput('');
      setErrors([]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ keywordId, campaignId, adGroupId }) =>
      deleteNegativeKeyword(keywordId, { campaignId, adGroupId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['negative-keywords']);
      setDeleteConfirm(null);
    },
  });

  const allKeywordsData = negativeKeywordsData?.data || [];

  const keywords = useMemo(() => {
    let result = allKeywordsData;

    if (matchTypeFilter) {
      result = result.filter(k => k.matchType === matchTypeFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(k =>
        k.text?.toLowerCase().includes(query)
      );
    }

    result = [...result].sort((a, b) => {
      let aVal, bVal;
      switch (sortField) {
        case 'text':
          aVal = (a.text || '').toLowerCase();
          bVal = (b.text || '').toLowerCase();
          break;
        case 'matchType':
          aVal = a.matchType || '';
          bVal = b.matchType || '';
          break;
        default:
          aVal = a.text || '';
          bVal = b.text || '';
      }
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [allKeywordsData, matchTypeFilter, searchQuery, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const clearCampaignFilter = (id) => {
    const newCampaigns = campaignIds.filter(cId => cId !== id);
    const params = {};
    if (newCampaigns.length > 0) params.campaigns = newCampaigns.join(',');
    if (adGroupIds.length > 0) params.adgroups = adGroupIds.join(',');
    setSearchParams(params);
  };

  const clearAdGroupFilter = (id) => {
    const newAdGroups = adGroupIds.filter(agId => agId !== id);
    const params = {};
    if (campaignIds.length > 0) params.campaigns = campaignIds.join(',');
    if (newAdGroups.length > 0) params.adgroups = newAdGroups.join(',');
    setSearchParams(params);
  };

  const parseTextInput = () => {
    const lines = textInput.split('\n').filter(line => line.trim());
    const keywords = lines.map((line) => {
      const text = line.trim();
      if (!text) return null;
      return { text, matchType: defaultMatchType };
    }).filter(Boolean);

    const validationErrors = [];
    keywords.forEach((kw, i) => {
      if (kw.text.length > 100) {
        validationErrors.push(`Line ${i + 1}: Keyword too long (max 100 chars)`);
      }
    });

    setErrors(validationErrors);
    return { keywords, errors: validationErrors };
  };

  const handleAdd = () => {
    if (!campaignIds.length) {
      setErrors(['Please select a campaign first']);
      return;
    }

    const { keywords, errors: validationErrors } = parseTextInput();

    if (validationErrors.length > 0) {
      return;
    }

    if (keywords.length === 0) {
      setErrors(['No keywords to add']);
      return;
    }

    createMutation.mutate({
      campaignId: campaignIds[0],
      adGroupId: adGroupIds[0],
      keywords,
    });
  };

  const handleDelete = (kw) => {
    deleteMutation.mutate({
      keywordId: kw.id,
      campaignId: kw.campaign_id,
      adGroupId: kw.adgroup_id,
    });
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
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Negative Keywords</h1>
          </div>
          <p className="text-gray-500 ml-9">Exclude keywords from campaigns and ad groups</p>
        </div>

        <Button
          variant="primary"
          onClick={() => setAddModalOpen(true)}
          disabled={!campaignIds.length}
        >
          <Plus size={16} /> Add Negative Keywords
        </Button>
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

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            type="text"
            placeholder="Search negative keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <select
          value={matchTypeFilter}
          onChange={(e) => setMatchTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Match Types</option>
          <option value="EXACT">Exact</option>
          <option value="BROAD">Broad</option>
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <SortHeader field="text">Keyword</SortHeader>
                <SortHeader field="matchType">Match Type</SortHeader>
                <TableHeader>Level</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">Loading negative keywords...</TableCell>
                </TableRow>
              ) : keywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                    No negative keywords found. Select a campaign from the Campaigns page.
                  </TableCell>
                </TableRow>
              ) : (
                keywords.map((kw, index) => (
                  <TableRow key={`${kw.id}-${index}`} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{kw.text}</TableCell>
                    <TableCell>
                      <Badge variant={kw.matchType === 'EXACT' ? 'info' : 'default'}>
                        {kw.matchType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={kw.adgroup_id ? 'default' : 'info'}>
                        {kw.adgroup_id ? 'Ad Group' : 'Campaign'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirm(kw)}
                      >
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Negative Keywords">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Match Type
            </label>
            <select
              value={defaultMatchType}
              onChange={(e) => setDefaultMatchType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="EXACT">Exact</option>
              <option value="BROAD">Broad</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Enter keywords (one per line)
            </label>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="competitor app&#10;brand name&#10;spam keyword"
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
          </div>

          {errors.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <div className="p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-red-900 mb-1">Validation Errors</h4>
                    <ul className="text-xs text-red-700 space-y-1">
                      {errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              loading={createMutation.isPending}
              disabled={!textInput.trim()}
            >
              Add Keywords
            </Button>
          </div>
        </div>
      </Modal>

      {deleteConfirm && (
        <Modal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          title="Delete Negative Keyword"
        >
          <p className="text-gray-600 mb-4">
            Are you sure you want to delete the negative keyword "{deleteConfirm.text}"?
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => handleDelete(deleteConfirm)}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
