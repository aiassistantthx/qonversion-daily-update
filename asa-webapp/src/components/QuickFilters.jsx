import { useState, useEffect } from 'react';
import { Button } from './Button';
import { Badge } from './Badge';
import { Modal } from './Modal';
import { Input } from './Input';
import { Filter, Plus, X, Save, Trash2 } from 'lucide-react';

const PRESET_FILTERS = [
  {
    id: 'underperforming',
    name: 'Underperforming',
    description: 'ROAS < 1, spend > $10',
    filter: (kw) => {
      const spend = parseFloat(kw.spend_7d || 0);
      const revenue = parseFloat(kw.revenue_7d || 0);
      const roas = spend > 0 ? revenue / spend : 0;
      return roas < 1 && spend > 10;
    },
    color: 'red',
  },
  {
    id: 'high-potential',
    name: 'High Potential',
    description: 'High impressions (>1000), low spend (<$20)',
    filter: (kw) => {
      const impressions = parseInt(kw.impressions_7d || 0);
      const spend = parseFloat(kw.spend_7d || 0);
      return impressions > 1000 && spend < 20;
    },
    color: 'blue',
  },
  {
    id: 'needs-attention',
    name: 'Needs Attention',
    description: 'CPA > target ($65.68), still running',
    filter: (kw) => {
      const cpa = parseFloat(kw.cpa_7d || 0);
      const isActive = kw.keyword_status === 'ACTIVE';
      return cpa > 65.68 && isActive;
    },
    color: 'orange',
  },
  {
    id: 'winners',
    name: 'Winners',
    description: 'ROAS > 2, spend > $50',
    filter: (kw) => {
      const spend = parseFloat(kw.spend_7d || 0);
      const revenue = parseFloat(kw.revenue_7d || 0);
      const roas = spend > 0 ? revenue / spend : 0;
      return roas > 2 && spend > 50;
    },
    color: 'green',
  },
];

const STORAGE_KEY = 'asa-quick-filters-custom';

export function QuickFilters({ keywords = [], onFilterChange }) {
  const [activeFilter, setActiveFilter] = useState(null);
  const [customPresets, setCustomPresets] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetConditions, setNewPresetConditions] = useState({
    minSpend: '',
    maxSpend: '',
    minRoas: '',
    maxRoas: '',
    minCpa: '',
    maxCpa: '',
    minImpressions: '',
    status: '',
  });

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setCustomPresets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse custom presets:', e);
      }
    }
  }, []);

  const saveCustomPresets = (presets) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    setCustomPresets(presets);
  };

  const applyFilter = (filterId) => {
    if (activeFilter === filterId) {
      setActiveFilter(null);
      onFilterChange(null);
      return;
    }

    setActiveFilter(filterId);

    const preset = [...PRESET_FILTERS, ...customPresets].find(p => p.id === filterId);
    if (preset && preset.filter) {
      const filtered = keywords.filter(preset.filter);
      onFilterChange(filtered);
    }
  };

  const createCustomPreset = () => {
    if (!newPresetName.trim()) return;

    const conditions = { ...newPresetConditions };
    const filter = (kw) => {
      const spend = parseFloat(kw.spend_7d || 0);
      const revenue = parseFloat(kw.revenue_7d || 0);
      const roas = spend > 0 ? revenue / spend : 0;
      const cpa = parseFloat(kw.cpa_7d || 0);
      const impressions = parseInt(kw.impressions_7d || 0);

      if (conditions.minSpend && spend < parseFloat(conditions.minSpend)) return false;
      if (conditions.maxSpend && spend > parseFloat(conditions.maxSpend)) return false;
      if (conditions.minRoas && roas < parseFloat(conditions.minRoas)) return false;
      if (conditions.maxRoas && roas > parseFloat(conditions.maxRoas)) return false;
      if (conditions.minCpa && cpa < parseFloat(conditions.minCpa)) return false;
      if (conditions.maxCpa && cpa > parseFloat(conditions.maxCpa)) return false;
      if (conditions.minImpressions && impressions < parseInt(conditions.minImpressions)) return false;
      if (conditions.status && kw.keyword_status !== conditions.status) return false;

      return true;
    };

    const description = Object.entries(conditions)
      .filter(([_, v]) => v)
      .map(([k, v]) => {
        const labels = {
          minSpend: 'spend ≥',
          maxSpend: 'spend ≤',
          minRoas: 'ROAS ≥',
          maxRoas: 'ROAS ≤',
          minCpa: 'CPA ≥',
          maxCpa: 'CPA ≤',
          minImpressions: 'impressions ≥',
          status: 'status =',
        };
        return `${labels[k]} ${v}`;
      })
      .join(', ');

    const newPreset = {
      id: `custom-${Date.now()}`,
      name: newPresetName,
      description: description || 'Custom filter',
      filter,
      conditions,
      color: 'purple',
      custom: true,
    };

    saveCustomPresets([...customPresets, newPreset]);
    setShowCreateModal(false);
    setNewPresetName('');
    setNewPresetConditions({
      minSpend: '',
      maxSpend: '',
      minRoas: '',
      maxRoas: '',
      minCpa: '',
      maxCpa: '',
      minImpressions: '',
      status: '',
    });
  };

  const deleteCustomPreset = (id) => {
    const updated = customPresets.filter(p => p.id !== id);
    saveCustomPresets(updated);
    if (activeFilter === id) {
      setActiveFilter(null);
      onFilterChange(null);
    }
  };

  const getFilterCount = (preset) => {
    if (!preset.filter) return 0;
    return keywords.filter(preset.filter).length;
  };

  const getColorClasses = (color, active) => {
    const colors = {
      red: active ? 'bg-red-100 border-red-500 text-red-700' : 'border-red-200 text-red-600 hover:bg-red-50',
      blue: active ? 'bg-blue-100 border-blue-500 text-blue-700' : 'border-blue-200 text-blue-600 hover:bg-blue-50',
      orange: active ? 'bg-orange-100 border-orange-500 text-orange-700' : 'border-orange-200 text-orange-600 hover:bg-orange-50',
      green: active ? 'bg-green-100 border-green-500 text-green-700' : 'border-green-200 text-green-600 hover:bg-green-50',
      purple: active ? 'bg-purple-100 border-purple-500 text-purple-700' : 'border-purple-200 text-purple-600 hover:bg-purple-50',
    };
    return colors[color] || colors.blue;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">Quick Filters</h3>
          {activeFilter && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setActiveFilter(null);
                onFilterChange(null);
              }}
            >
              <X size={14} /> Clear
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {customPresets.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowManageModal(true)}
            >
              Manage
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={14} /> Create
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESET_FILTERS.map((preset) => {
          const count = getFilterCount(preset);
          const isActive = activeFilter === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => applyFilter(preset.id)}
              className={`px-3 py-2 border-2 rounded-lg text-sm font-medium transition-colors ${getColorClasses(preset.color, isActive)}`}
              title={preset.description}
            >
              <div className="flex items-center gap-2">
                <span>{preset.name}</span>
                <Badge variant="default" className="text-xs">
                  {count}
                </Badge>
              </div>
            </button>
          );
        })}

        {customPresets.map((preset) => {
          const count = getFilterCount(preset);
          const isActive = activeFilter === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => applyFilter(preset.id)}
              className={`px-3 py-2 border-2 rounded-lg text-sm font-medium transition-colors ${getColorClasses(preset.color, isActive)}`}
              title={preset.description}
            >
              <div className="flex items-center gap-2">
                <span>{preset.name}</span>
                <Badge variant="default" className="text-xs">
                  {count}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Custom Filter"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter Name
            </label>
            <Input
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g., My Custom Filter"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Spend ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={newPresetConditions.minSpend}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, minSpend: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Spend ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={newPresetConditions.maxSpend}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, maxSpend: e.target.value })}
                placeholder="999999"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min ROAS
              </label>
              <Input
                type="number"
                step="0.1"
                value={newPresetConditions.minRoas}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, minRoas: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max ROAS
              </label>
              <Input
                type="number"
                step="0.1"
                value={newPresetConditions.maxRoas}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, maxRoas: e.target.value })}
                placeholder="999"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min CPA ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={newPresetConditions.minCpa}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, minCpa: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max CPA ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={newPresetConditions.maxCpa}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, maxCpa: e.target.value })}
                placeholder="999"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Impressions
              </label>
              <Input
                type="number"
                value={newPresetConditions.minImpressions}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, minImpressions: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={newPresetConditions.status}
                onChange={(e) => setNewPresetConditions({ ...newPresetConditions, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Any</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 justify-end border-t pt-4">
            <Button
              variant="ghost"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={createCustomPreset}
              disabled={!newPresetName.trim()}
            >
              <Save size={14} /> Create Filter
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showManageModal}
        onClose={() => setShowManageModal(false)}
        title="Manage Custom Filters"
      >
        <div className="space-y-2">
          {customPresets.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No custom filters yet</p>
          ) : (
            customPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{preset.name}</p>
                  <p className="text-sm text-gray-500">{preset.description}</p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteCustomPreset(preset.id)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end border-t pt-4 mt-4">
          <Button
            variant="secondary"
            onClick={() => setShowManageModal(false)}
          >
            Close
          </Button>
        </div>
      </Modal>
    </div>
  );
}
