import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Button } from './Button';
import { Badge } from './Badge';
import { Input, Select } from './Input';
import { getRuleTemplates } from '../lib/api';
import { Zap, ChevronDown, ChevronUp, Settings, Filter } from 'lucide-react';

export default function RuleTemplates({ onSelectTemplate, onClose }) {
  const [expandedId, setExpandedId] = useState(null);
  const [customParams, setCustomParams] = useState({});
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['rule-templates'],
    queryFn: getRuleTemplates,
  });

  const templates = data?.data || [];

  // Group templates by category
  const categories = useMemo(() => {
    const cats = new Set(templates.map(t => t.category || 'Other'));
    return ['all', ...Array.from(cats).sort()];
  }, [templates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    let filtered = templates;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => (t.category || 'Other') === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [templates, selectedCategory, searchQuery]);

  const handleSelectTemplate = (template) => {
    const params = customParams[template.id] || {};

    const customizedTemplate = {
      name: template.name,
      description: template.description,
      scope: template.scope,
      conditions: template.conditions.map(c => ({
        ...c,
        value: params[`condition_${c.metric}_value`] !== undefined
          ? parseFloat(params[`condition_${c.metric}_value`])
          : c.value
      })),
      conditions_logic: template.conditions_logic,
      action_type: template.action_type,
      action_params: {
        ...template.action_params,
        ...(params.adjustmentValue !== undefined && { adjustmentValue: parseFloat(params.adjustmentValue) }),
        ...(params.minBid !== undefined && { minBid: parseFloat(params.minBid) }),
        ...(params.maxBid !== undefined && { maxBid: parseFloat(params.maxBid) }),
      },
      frequency: template.frequency,
      max_executions_per_day: template.max_executions_per_day,
      cooldown_hours: template.cooldown_hours,
      enabled: template.enabled,
      priority: template.priority,
    };

    onSelectTemplate(customizedTemplate);
  };

  const handleParamChange = (templateId, paramName, value) => {
    setCustomParams({
      ...customParams,
      [templateId]: {
        ...(customParams[templateId] || {}),
        [paramName]: value,
      },
    });
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-8 text-gray-500">Loading templates...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Rule Templates</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              {templates.length} templates - Based on SplitMetrics Acquire best practices
            </p>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Category Summary */}
        {!isLoading && templates.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex flex-wrap gap-2">
              {categories.filter(cat => cat !== 'all').map(cat => {
                const count = templates.filter(t => (t.category || 'Other') === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      selectedCategory === cat
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-blue-100'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
              {selectedCategory !== 'all' && (
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="w-48">
            <Select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              options={categories.map(cat => ({ value: cat, label: cat === 'all' ? 'All Categories' : cat }))}
            />
          </div>
        </div>

        {/* Template Count */}
        <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
          <Filter size={14} />
          <span>Showing {filteredTemplates.length} of {templates.length} templates</span>
        </div>

        <div className="space-y-3">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">No templates found</p>
              <p className="text-sm">Try adjusting your search or filter criteria</p>
            </div>
          ) : (
            filteredTemplates.map((template) => {
              const isExpanded = expandedId === template.id;
              const params = customParams[template.id] || {};

              return (
                <div key={template.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap size={16} className="text-blue-500" />
                      <h3 className="font-medium">{template.name}</h3>
                      {template.category && (
                        <Badge variant="info">{template.category}</Badge>
                      )}
                      <Badge>{template.scope}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{template.description}</p>

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span>Action: {template.action_type}</span>
                      <span>•</span>
                      <span>Frequency: {template.frequency}</span>
                      <span>•</span>
                      <span>{template.conditions.length} condition(s)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleExpand(template.id)}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleSelectTemplate(template)}
                    >
                      Use Template
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <Settings size={14} />
                        Customize Parameters
                      </h4>

                      <div className="space-y-3">
                        {template.conditions.map((condition, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 w-24">{condition.metric}:</span>
                            <Input
                              type="number"
                              placeholder={String(condition.value)}
                              value={params[`condition_${condition.metric}_value`] || ''}
                              onChange={(e) =>
                                handleParamChange(template.id, `condition_${condition.metric}_value`, e.target.value)
                              }
                              className="w-24"
                            />
                            <span className="text-sm text-gray-500">
                              (default: {condition.value}, period: {condition.period})
                            </span>
                          </div>
                        ))}

                        {template.action_type === 'adjust_bid' && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 w-24">Adjustment %:</span>
                              <Input
                                type="number"
                                placeholder={String(template.action_params.adjustmentValue)}
                                value={params.adjustmentValue || ''}
                                onChange={(e) =>
                                  handleParamChange(template.id, 'adjustmentValue', e.target.value)
                                }
                                className="w-24"
                              />
                              <span className="text-sm text-gray-500">
                                (default: {template.action_params.adjustmentValue}%)
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 w-24">Min Bid $:</span>
                              <Input
                                type="number"
                                placeholder={String(template.action_params.minBid)}
                                value={params.minBid || ''}
                                onChange={(e) =>
                                  handleParamChange(template.id, 'minBid', e.target.value)
                                }
                                className="w-24"
                              />
                              <span className="text-sm text-gray-500">
                                (default: ${template.action_params.minBid})
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600 w-24">Max Bid $:</span>
                              <Input
                                type="number"
                                placeholder={String(template.action_params.maxBid)}
                                value={params.maxBid || ''}
                                onChange={(e) =>
                                  handleParamChange(template.id, 'maxBid', e.target.value)
                                }
                                className="w-24"
                              />
                              <span className="text-sm text-gray-500">
                                (default: ${template.action_params.maxBid})
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="bg-gray-50 p-3 rounded text-xs">
                      <div className="font-medium mb-2">Conditions:</div>
                      <ul className="space-y-1">
                        {template.conditions.map((c, i) => (
                          <li key={i}>
                            {c.metric} {c.operator} {params[`condition_${c.metric}_value`] || c.value} ({c.period})
                          </li>
                        ))}
                      </ul>
                      <div className="font-medium mt-3 mb-2">Action:</div>
                      <div>{template.action_type}</div>
                    </div>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
