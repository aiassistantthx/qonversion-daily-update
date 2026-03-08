import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Input, Textarea } from '../components/Input';
import { Badge } from '../components/Badge';
import { getTemplates, createTemplate, deleteTemplate } from '../lib/api';
import { Plus, Trash2, Copy, Eye, X } from 'lucide-react';

function TemplateForm({ onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    template_type: 'campaign',
    campaign_settings: {
      dailyBudget: { amount: '100', currency: 'USD' },
      targetCountries: ['US'],
    },
    adgroup_settings: {
      defaultBid: 2.50,
    },
    keywords: [],
    variables: {},
  });

  const [keywordInput, setKeywordInput] = useState('');

  const handleAddKeyword = () => {
    if (!keywordInput.trim()) return;

    const newKeyword = {
      text: keywordInput.trim(),
      matchType: 'EXACT',
      bidAmount: 2.50,
    };

    setFormData({
      ...formData,
      keywords: [...formData.keywords, newKeyword],
    });
    setKeywordInput('');
  };

  const handleRemoveKeyword = (index) => {
    setFormData({
      ...formData,
      keywords: formData.keywords.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Template Name"
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
        <Input
          label="Daily Budget ($)"
          type="number"
          value={formData.campaign_settings.dailyBudget?.amount || ''}
          onChange={(e) =>
            setFormData({
              ...formData,
              campaign_settings: {
                ...formData.campaign_settings,
                dailyBudget: { amount: e.target.value, currency: 'USD' },
              },
            })
          }
        />

        <Input
          label="Default Bid ($)"
          type="number"
          value={formData.adgroup_settings.defaultBid || ''}
          onChange={(e) =>
            setFormData({
              ...formData,
              adgroup_settings: {
                ...formData.adgroup_settings,
                defaultBid: parseFloat(e.target.value),
              },
            })
          }
        />
      </div>

      <Input
        label="Target Countries (comma-separated)"
        value={(formData.campaign_settings.targetCountries || []).join(', ')}
        onChange={(e) =>
          setFormData({
            ...formData,
            campaign_settings: {
              ...formData.campaign_settings,
              targetCountries: e.target.value.split(',').map((s) => s.trim().toUpperCase()),
            },
          })
        }
        placeholder="US, GB, CA"
      />

      {/* Keywords */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Keywords</label>
        <div className="flex gap-2 mb-2">
          <Input
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="Add keyword"
            className="flex-1"
          />
          <Button type="button" onClick={handleAddKeyword}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.keywords.map((kw, i) => (
            <Badge key={i} className="flex items-center gap-1">
              {kw.text}
              <button
                type="button"
                onClick={() => handleRemoveKeyword(i)}
                className="hover:text-red-500"
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create Template</Button>
      </div>
    </form>
  );
}

function TemplatePreview({ template, onClose }) {
  const campaignSettings =
    typeof template.campaign_settings === 'string'
      ? JSON.parse(template.campaign_settings)
      : template.campaign_settings || {};

  const adgroupSettings =
    typeof template.adgroup_settings === 'string'
      ? JSON.parse(template.adgroup_settings)
      : template.adgroup_settings || {};

  const keywords =
    typeof template.keywords === 'string'
      ? JSON.parse(template.keywords)
      : template.keywords || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">{template.name}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      {template.description && (
        <p className="text-gray-500 text-sm">{template.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Campaign Settings</h4>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
            {JSON.stringify(campaignSettings, null, 2)}
          </pre>
        </div>

        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Ad Group Settings</h4>
          <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto">
            {JSON.stringify(adgroupSettings, null, 2)}
          </pre>
        </div>
      </div>

      {keywords.length > 0 && (
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Keywords ({keywords.length})</h4>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, i) => (
              <Badge key={i}>
                {kw.text} ({kw.matchType})
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Templates() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => getTemplates(),
  });

  const createMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
      setShowForm(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries(['templates']);
    },
  });

  const templates = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaign Templates</h1>
          <p className="text-gray-500">Reusable templates for campaign creation</p>
        </div>

        <Button onClick={() => setShowForm(true)}>
          <Plus size={16} /> New Template
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Template</CardTitle>
          </CardHeader>
          <CardContent>
            <TemplateForm
              onSave={(data) => createMutation.mutate(data)}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {previewTemplate && (
        <Card>
          <CardContent>
            <TemplatePreview
              template={previewTemplate}
              onClose={() => setPreviewTemplate(null)}
            />
          </CardContent>
        </Card>
      )}

      {/* Templates List */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Template</TableHeader>
              <TableHeader>Type</TableHeader>
              <TableHeader>Keywords</TableHeader>
              <TableHeader>Times Used</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader className="w-32">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">Loading templates...</TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No templates created yet
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => {
                const keywords =
                  typeof template.keywords === 'string'
                    ? JSON.parse(template.keywords)
                    : template.keywords || [];

                return (
                  <TableRow key={template.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="font-medium">{template.name}</div>
                      {template.description && (
                        <div className="text-xs text-gray-500">{template.description}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge>{template.template_type}</Badge>
                    </TableCell>
                    <TableCell>{keywords.length}</TableCell>
                    <TableCell>{template.times_used || 0}</TableCell>
                    <TableCell className="text-gray-500">
                      {new Date(template.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewTemplate(template)}
                          title="Preview"
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('Delete this template?')) {
                              deleteMutation.mutate(template.id);
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 size={14} />
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
    </div>
  );
}
