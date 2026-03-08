import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/Badge';
import { Input } from '../components/Input';
import { getCampaigns, getCampaign, updateCampaignStatus, updateCampaignBudget, getAdGroups } from '../lib/api';
import { ChevronDown, ChevronRight, Play, Pause, Edit2, X, Check } from 'lucide-react';

function CampaignRow({ campaign, expanded, onToggle }) {
  const queryClient = useQueryClient();
  const [editingBudget, setEditingBudget] = useState(false);
  const [newBudget, setNewBudget] = useState(campaign.dailyBudgetAmount?.amount || '');

  const { data: adGroupsData, isLoading: adGroupsLoading } = useQuery({
    queryKey: ['adgroups', campaign.id],
    queryFn: () => getAdGroups(campaign.id),
    enabled: expanded,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateCampaignStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries(['campaigns']);
    },
  });

  const budgetMutation = useMutation({
    mutationFn: ({ id, dailyBudget }) => updateCampaignBudget(id, dailyBudget),
    onSuccess: () => {
      queryClient.invalidateQueries(['campaigns']);
      setEditingBudget(false);
    },
  });

  const handleStatusToggle = () => {
    const newStatus = campaign.status === 'ENABLED' ? 'PAUSED' : 'ENABLED';
    statusMutation.mutate({ id: campaign.id, status: newStatus });
  };

  const handleBudgetSave = () => {
    const budget = parseFloat(newBudget);
    if (!isNaN(budget) && budget > 0) {
      budgetMutation.mutate({ id: campaign.id, dailyBudget: budget });
    }
  };

  return (
    <>
      <TableRow className="hover:bg-gray-50">
        <TableCell>
          <button onClick={onToggle} className="p-1 hover:bg-gray-200 rounded">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </TableCell>
        <TableCell className="font-medium">{campaign.name}</TableCell>
        <TableCell>
          <StatusBadge status={campaign.status} />
        </TableCell>
        <TableCell>
          {editingBudget ? (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                className="w-24"
              />
              <button onClick={handleBudgetSave} className="text-green-600 hover:text-green-700">
                <Check size={16} />
              </button>
              <button onClick={() => setEditingBudget(false)} className="text-gray-400 hover:text-gray-500">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span>${campaign.dailyBudgetAmount?.amount || '-'}</span>
              <button onClick={() => setEditingBudget(true)} className="text-gray-400 hover:text-gray-600">
                <Edit2 size={14} />
              </button>
            </div>
          )}
        </TableCell>
        <TableCell className="text-right">${(campaign.performance?.spend_7d || 0).toFixed(2)}</TableCell>
        <TableCell className="text-right">{campaign.performance?.impressions_7d?.toLocaleString() || 0}</TableCell>
        <TableCell className="text-right">{campaign.performance?.taps_7d?.toLocaleString() || 0}</TableCell>
        <TableCell className="text-right">{campaign.performance?.installs_7d || 0}</TableCell>
        <TableCell className="text-right">
          {campaign.performance?.cpa_7d ? `$${parseFloat(campaign.performance.cpa_7d).toFixed(2)}` : '-'}
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            variant={campaign.status === 'ENABLED' ? 'danger' : 'success'}
            onClick={handleStatusToggle}
            loading={statusMutation.isPending}
          >
            {campaign.status === 'ENABLED' ? <Pause size={14} /> : <Play size={14} />}
          </Button>
        </TableCell>
      </TableRow>

      {/* Expanded: Ad Groups */}
      {expanded && (
        <TableRow>
          <TableCell colSpan={10} className="bg-gray-50 p-4">
            <h4 className="font-medium mb-2">Ad Groups</h4>
            {adGroupsLoading ? (
              <p className="text-gray-500">Loading ad groups...</p>
            ) : (adGroupsData?.data || []).length === 0 ? (
              <p className="text-gray-500">No ad groups found</p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Ad Group</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Default Bid</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(adGroupsData?.data || []).map((ag) => (
                    <TableRow key={ag.id}>
                      <TableCell>{ag.name}</TableCell>
                      <TableCell><StatusBadge status={ag.status} /></TableCell>
                      <TableCell>${ag.defaultBidAmount?.amount || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function Campaigns() {
  const [expandedId, setExpandedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns', { status: statusFilter }],
    queryFn: () => getCampaigns({ status: statusFilter || undefined }),
  });

  const campaigns = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500">Manage your Apple Search Ads campaigns</p>
        </div>

        <div className="flex items-center gap-4">
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
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10"></TableHeader>
              <TableHeader>Campaign</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Daily Budget</TableHeader>
              <TableHeader className="text-right">Spend (7d)</TableHeader>
              <TableHeader className="text-right">Impr</TableHeader>
              <TableHeader className="text-right">Taps</TableHeader>
              <TableHeader className="text-right">Installs</TableHeader>
              <TableHeader className="text-right">CPA</TableHeader>
              <TableHeader className="w-20">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">Loading campaigns...</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-red-500">
                  Error loading campaigns: {error.message}
                </TableCell>
              </TableRow>
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-500">No campaigns found</TableCell>
              </TableRow>
            ) : (
              campaigns.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  expanded={expandedId === campaign.id}
                  onToggle={() => setExpandedId(expandedId === campaign.id ? null : campaign.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
