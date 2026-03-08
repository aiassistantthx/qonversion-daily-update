import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import { StatusBadge } from '../components/Badge';
import { getCampaigns, getKeywords, updateKeywordBid, bulkUpdateKeywordBids } from '../lib/api';
import { Edit2, X, Check, Download, Upload } from 'lucide-react';

export default function Keywords() {
  const queryClient = useQueryClient();
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [bulkBidAmount, setBulkBidAmount] = useState('');
  const [editingKeyword, setEditingKeyword] = useState(null);
  const [newBid, setNewBid] = useState('');

  const { data: campaignsData } = useQuery({
    queryKey: ['campaigns'],
    queryFn: getCampaigns,
  });

  const { data: keywordsData, isLoading: keywordsLoading } = useQuery({
    queryKey: ['keywords', { campaign_id: selectedCampaign }],
    queryFn: () => getKeywords({ campaign_id: selectedCampaign, limit: 200 }),
    enabled: !!selectedCampaign,
  });

  const bidMutation = useMutation({
    mutationFn: ({ keywordId, campaignId, adGroupId, bidAmount }) =>
      updateKeywordBid(keywordId, { campaignId, adGroupId, bidAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries(['keywords']);
      setEditingKeyword(null);
    },
  });

  const bulkBidMutation = useMutation({
    mutationFn: (data) => bulkUpdateKeywordBids(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['keywords']);
      setSelectedKeywords([]);
      setBulkBidAmount('');
    },
  });

  const campaigns = campaignsData?.data || [];
  const keywords = keywordsData?.data || [];

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedKeywords(keywords.map((k) => k.keyword_id));
    } else {
      setSelectedKeywords([]);
    }
  };

  const handleSelectKeyword = (keywordId) => {
    setSelectedKeywords((prev) =>
      prev.includes(keywordId)
        ? prev.filter((id) => id !== keywordId)
        : [...prev, keywordId]
    );
  };

  const handleBidSave = (keyword) => {
    const bid = parseFloat(newBid);
    if (!isNaN(bid) && bid > 0) {
      bidMutation.mutate({
        keywordId: keyword.keyword_id,
        campaignId: keyword.campaign_id,
        adGroupId: keyword.adgroup_id,
        bidAmount: bid,
      });
    }
  };

  const handleBulkBidUpdate = () => {
    const bid = parseFloat(bulkBidAmount);
    if (isNaN(bid) || bid <= 0 || selectedKeywords.length === 0) return;

    // Get keyword details for the update
    const updates = selectedKeywords.map((keywordId) => {
      const keyword = keywords.find((k) => k.keyword_id === keywordId);
      return {
        keywordId,
        bidAmount: bid,
      };
    });

    // Get campaign and adgroup from first keyword
    const firstKeyword = keywords.find((k) => selectedKeywords.includes(k.keyword_id));

    bulkBidMutation.mutate({
      campaignId: firstKeyword.campaign_id,
      adGroupId: firstKeyword.adgroup_id,
      updates,
    });
  };

  const exportToCSV = () => {
    if (keywords.length === 0) return;

    const headers = ['keyword_id', 'keyword', 'match_type', 'current_bid', 'spend_7d', 'impressions_7d', 'taps_7d', 'installs_7d', 'cpa_7d', 'new_bid'];
    const rows = keywords.map((k) => [
      k.keyword_id,
      `"${k.keyword_text}"`,
      k.match_type,
      k.bid_amount || '',
      k.spend_7d || 0,
      k.impressions_7d || 0,
      k.taps_7d || 0,
      k.installs_7d || 0,
      k.cpa_7d || '',
      '', // new_bid placeholder
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keywords_${selectedCampaign}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Keywords</h1>
          <p className="text-gray-500">Manage keyword bids and performance</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="p-4 flex items-center gap-4">
          <Select
            label="Campaign"
            value={selectedCampaign}
            onChange={(e) => setSelectedCampaign(e.target.value)}
            options={[
              { value: '', label: 'Select a campaign' },
              ...campaigns.map((c) => ({ value: c.id, label: c.name })),
            ]}
            className="w-64"
          />

          {selectedCampaign && (
            <Button variant="secondary" onClick={exportToCSV}>
              <Download size={16} />
              Export CSV
            </Button>
          )}
        </div>
      </Card>

      {/* Bulk Actions */}
      {selectedKeywords.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <div className="p-4 flex items-center gap-4">
            <span className="text-sm font-medium text-blue-900">
              {selectedKeywords.length} keywords selected
            </span>
            <Input
              type="number"
              placeholder="New bid"
              value={bulkBidAmount}
              onChange={(e) => setBulkBidAmount(e.target.value)}
              className="w-32"
            />
            <Button
              onClick={handleBulkBidUpdate}
              loading={bulkBidMutation.isPending}
              disabled={!bulkBidAmount}
            >
              Update Bids
            </Button>
            <Button variant="ghost" onClick={() => setSelectedKeywords([])}>
              Clear Selection
            </Button>
          </div>
        </Card>
      )}

      {/* Keywords Table */}
      {selectedCampaign && (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-10">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={selectedKeywords.length === keywords.length && keywords.length > 0}
                  />
                </TableHeader>
                <TableHeader>Keyword</TableHeader>
                <TableHeader>Match</TableHeader>
                <TableHeader>Current Bid</TableHeader>
                <TableHeader className="text-right">Spend (7d)</TableHeader>
                <TableHeader className="text-right">Impr</TableHeader>
                <TableHeader className="text-right">Taps</TableHeader>
                <TableHeader className="text-right">Installs</TableHeader>
                <TableHeader className="text-right">CPA</TableHeader>
                <TableHeader className="text-right">TTR</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {keywordsLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">Loading keywords...</TableCell>
                </TableRow>
              ) : keywords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                    No keywords found for this campaign
                  </TableCell>
                </TableRow>
              ) : (
                keywords.map((keyword) => (
                  <TableRow key={keyword.keyword_id} className="hover:bg-gray-50">
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedKeywords.includes(keyword.keyword_id)}
                        onChange={() => handleSelectKeyword(keyword.keyword_id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-xs truncate" title={keyword.keyword_text}>
                      {keyword.keyword_text}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={keyword.match_type} />
                    </TableCell>
                    <TableCell>
                      {editingKeyword === keyword.keyword_id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={newBid}
                            onChange={(e) => setNewBid(e.target.value)}
                            className="w-20"
                          />
                          <button
                            onClick={() => handleBidSave(keyword)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => setEditingKeyword(null)}
                            className="text-gray-400 hover:text-gray-500"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>${keyword.bid_amount || '-'}</span>
                          <button
                            onClick={() => {
                              setEditingKeyword(keyword.keyword_id);
                              setNewBid(keyword.bid_amount || '');
                            }}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      ${parseFloat(keyword.spend_7d || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(keyword.impressions_7d || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {(keyword.taps_7d || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">{keyword.installs_7d || 0}</TableCell>
                    <TableCell className="text-right">
                      {keyword.cpa_7d ? `$${parseFloat(keyword.cpa_7d).toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {keyword.ttr_7d ? `${parseFloat(keyword.ttr_7d).toFixed(2)}%` : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {!selectedCampaign && (
        <Card>
          <div className="p-8 text-center text-gray-500">
            Select a campaign to view keywords
          </div>
        </Card>
      )}
    </div>
  );
}
