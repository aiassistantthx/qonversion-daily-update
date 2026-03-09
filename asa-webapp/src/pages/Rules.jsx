import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Input, Select, Textarea } from '../components/Input';
import { StatusBadge, Badge } from '../components/Badge';
import RuleTemplates from '../components/RuleTemplates';
import { getRules, getRule, createRule, updateRule, deleteRule, executeRule, previewRule } from '../lib/api';
import { Plus, Play, Trash2, Edit2, Eye, X, Check, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

const ACTION_TYPES = [
  { value: 'adjust_bid', label: 'Adjust Bid (%)' },
  { value: 'set_bid', label: 'Set Bid ($)' },
  { value: 'pause', label: 'Pause' },
  { value: 'enable', label: 'Enable' },
  { value: 'send_alert', label: 'Send Alert' },
];

const METRICS = [
  { value: 'spend', label: 'Spend' },
  { value: 'impressions', label: 'Impressions' },
  { value: 'taps', label: 'Taps' },
  { value: 'installs', label: 'Installs' },
  { value: 'cpa', label: 'CPA' },
  { value: 'cpt', label: 'CPT' },
  { value: 'ttr', label: 'TTR' },
];

const OPERATORS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '=', label: '=' },
];

const PERIODS = [
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
];

function RuleForm({ rule, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    scope: rule?.scope || 'keyword',
    conditions: rule?.conditions || [{ metric: 'cpa', operator: '>', value: '', period: '7d' }],
    conditions_logic: rule?.conditions_logic || 'AND',
    action_type: rule?.action_type || 'adjust_bid',
    action_params: rule?.action_params || {},
    frequency: rule?.frequency || 'daily',
    enabled: rule?.enabled !== false,
  });

  const handleConditionChange = (index, field, value) => {
    const newConditions = [...formData.conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setFormData({ ...formData, conditions: newConditions });
  };

  const addCondition = () => {
    setFormData({
      ...formData,
      conditions: [...formData.conditions, { metric: 'spend', operator: '>', value: '', period: '7d' }],
    });
  };

  const removeCondition = (index) => {
    const newConditions = formData.conditions.filter((_, i) => i !== index);
    setFormData({ ...formData, conditions: newConditions });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Rule Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />

      <Textarea
        label="Description"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        rows={2}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Scope"
          value={formData.scope}
          onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
          options={[
            { value: 'keyword', label: 'Keyword' },
            { value: 'adgroup', label: 'Ad Group' },
            { value: 'campaign', label: 'Campaign' },
          ]}
        />

        <Select
          label="Frequency"
          value={formData.frequency}
          onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
          options={[
            { value: 'hourly', label: 'Hourly' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
          ]}
        />
      </div>

      {/* Conditions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Conditions ({formData.conditions_logic})
        </label>
        <div className="space-y-2">
          {formData.conditions.map((condition, index) => (
            <div key={index} className="flex items-center gap-2">
              <Select
                value={condition.metric}
                onChange={(e) => handleConditionChange(index, 'metric', e.target.value)}
                options={METRICS}
                className="w-32"
              />
              <Select
                value={condition.operator}
                onChange={(e) => handleConditionChange(index, 'operator', e.target.value)}
                options={OPERATORS}
                className="w-20"
              />
              <Input
                type="number"
                value={condition.value}
                onChange={(e) => handleConditionChange(index, 'value', parseFloat(e.target.value))}
                placeholder="Value"
                className="w-24"
              />
              <Select
                value={condition.period}
                onChange={(e) => handleConditionChange(index, 'period', e.target.value)}
                options={PERIODS}
                className="w-28"
              />
              {formData.conditions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCondition(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={addCondition}>
            <Plus size={14} /> Add Condition
          </Button>
        </div>
      </div>

      {/* Action */}
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Action"
          value={formData.action_type}
          onChange={(e) => setFormData({ ...formData, action_type: e.target.value })}
          options={ACTION_TYPES}
        />

        {formData.action_type === 'adjust_bid' && (
          <Input
            label="Adjustment %"
            type="number"
            value={formData.action_params.adjustmentValue || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                action_params: {
                  ...formData.action_params,
                  adjustmentType: 'percent',
                  adjustmentValue: parseFloat(e.target.value),
                },
              })
            }
            placeholder="-15 or 10"
          />
        )}

        {formData.action_type === 'set_bid' && (
          <Input
            label="Bid Amount ($)"
            type="number"
            value={formData.action_params.bidAmount || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                action_params: { ...formData.action_params, bidAmount: parseFloat(e.target.value) },
              })
            }
            placeholder="2.50"
          />
        )}
      </div>

      {/* Min/Max bid for adjust_bid */}
      {formData.action_type === 'adjust_bid' && (
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Min Bid ($)"
            type="number"
            value={formData.action_params.minBid || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                action_params: { ...formData.action_params, minBid: parseFloat(e.target.value) },
              })
            }
            placeholder="0.50"
          />
          <Input
            label="Max Bid ($)"
            type="number"
            value={formData.action_params.maxBid || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                action_params: { ...formData.action_params, maxBid: parseFloat(e.target.value) },
              })
            }
            placeholder="10.00"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enabled"
          checked={formData.enabled}
          onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
        />
        <label htmlFor="enabled" className="text-sm text-gray-700">
          Enable rule
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {rule ? 'Update Rule' : 'Create Rule'}
        </Button>
      </div>
    </form>
  );
}

export default function Rules() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [expandedRule, setExpandedRule] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: () => getRules(),
  });

  const createMutation = useMutation({
    mutationFn: createRule,
    onSuccess: () => {
      queryClient.invalidateQueries(['rules']);
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['rules']);
      setEditingRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => {
      queryClient.invalidateQueries(['rules']);
    },
  });

  const executeMutation = useMutation({
    mutationFn: ({ id, dryRun }) => executeRule(id, dryRun),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['rules']);
      alert(`Rule executed: ${data.executed || 0} entities affected`);
    },
  });

  const handlePreview = async (ruleId) => {
    try {
      const data = await previewRule(ruleId);
      setPreviewData(data);
      setExpandedRule(ruleId);
    } catch (error) {
      alert('Failed to preview rule: ' + error.message);
    }
  };

  const rules = data?.data || [];

  const handleSelectTemplate = (templateData) => {
    setShowTemplates(false);
    setShowForm(true);
    setEditingRule({ ...templateData });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automation Rules</h1>
          <p className="text-gray-500">Create and manage bid automation rules</p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowTemplates(!showTemplates)}>
            <Sparkles size={16} /> Templates
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus size={16} /> New Rule
          </Button>
        </div>
      </div>

      {/* Templates Section */}
      {showTemplates && (
        <RuleTemplates
          onSelectTemplate={handleSelectTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {/* Create/Edit Form */}
      {(showForm || editingRule) && (
        <Card>
          <CardHeader>
            <CardTitle>{editingRule ? 'Edit Rule' : 'Create New Rule'}</CardTitle>
          </CardHeader>
          <CardContent>
            <RuleForm
              rule={editingRule}
              onSave={(data) => {
                if (editingRule) {
                  updateMutation.mutate({ id: editingRule.id, data });
                } else {
                  createMutation.mutate(data);
                }
              }}
              onCancel={() => {
                setShowForm(false);
                setEditingRule(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10"></TableHeader>
              <TableHeader>Rule</TableHeader>
              <TableHeader>Scope</TableHeader>
              <TableHeader>Action</TableHeader>
              <TableHeader>Frequency</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Executions</TableHeader>
              <TableHeader className="w-40">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">Loading rules...</TableCell>
              </TableRow>
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  No rules created yet
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <>
                  <TableRow key={rule.id} className="hover:bg-gray-50">
                    <TableCell>
                      <button
                        onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {expandedRule === rule.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-gray-500">{rule.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge>{rule.scope}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">{rule.action_type}</Badge>
                    </TableCell>
                    <TableCell>{rule.frequency}</TableCell>
                    <TableCell>
                      <StatusBadge status={rule.enabled ? 'ENABLED' : 'PAUSED'} />
                    </TableCell>
                    <TableCell>
                      {rule.stats?.today_executions || 0} today / {rule.stats?.week_executions || 0} week
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePreview(rule.id)}
                          title="Preview"
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => executeMutation.mutate({ id: rule.id, dryRun: true })}
                          title="Dry Run"
                          loading={executeMutation.isPending}
                        >
                          <Play size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingRule(rule)}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('Delete this rule?')) {
                              deleteMutation.mutate(rule.id);
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded: Conditions and Preview */}
                  {expandedRule === rule.id && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-gray-50 p-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Conditions</h4>
                            <ul className="text-sm space-y-1">
                              {(typeof rule.conditions === 'string'
                                ? JSON.parse(rule.conditions)
                                : rule.conditions || []
                              ).map((c, i) => (
                                <li key={i}>
                                  {c.metric} {c.operator} {c.value} ({c.period})
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Action Parameters</h4>
                            <pre className="text-sm bg-white p-2 rounded">
                              {JSON.stringify(
                                typeof rule.action_params === 'string'
                                  ? JSON.parse(rule.action_params)
                                  : rule.action_params,
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        </div>

                        {previewData && previewData.ruleId === rule.id && (
                          <div className="mt-4">
                            <h4 className="font-medium mb-2">
                              Preview Results ({previewData.totalEntities} entities)
                            </h4>
                            <div className="max-h-48 overflow-auto">
                              <Table>
                                <TableHead>
                                  <TableRow>
                                    <TableHeader>Entity ID</TableHeader>
                                    <TableHeader>Status</TableHeader>
                                    <TableHeader>Reason</TableHeader>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {(previewData.results || []).slice(0, 10).map((r, i) => (
                                    <TableRow key={i}>
                                      <TableCell>{r.entityId}</TableCell>
                                      <TableCell>
                                        <StatusBadge status={r.skipped ? 'skipped' : 'executed'} />
                                      </TableCell>
                                      <TableCell className="text-xs">{r.reason || '-'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
