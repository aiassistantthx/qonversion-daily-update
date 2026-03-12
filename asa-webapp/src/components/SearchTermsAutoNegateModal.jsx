import { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Badge } from './Badge';
import { Input } from './Input';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from './Table';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

const AUTO_NEGATE_PRESETS = [
  {
    id: 'zero-conversions-high-impr',
    name: 'Zero Conversions',
    description: 'Impressions > 100, Installs = 0, Spend > $5',
    filter: (st) => {
      return parseInt(st.impressions || 0) > 100 &&
             parseInt(st.installs || 0) === 0 &&
             parseFloat(st.spend || 0) > 5;
    },
    color: 'red',
  },
  {
    id: 'low-ctr-high-spend',
    name: 'Low CTR',
    description: 'TTR < 2%, Spend > $20',
    filter: (st) => {
      return parseFloat(st.ttr || 0) < 0.02 &&
             parseFloat(st.spend || 0) > 20;
    },
    color: 'orange',
  },
  {
    id: 'high-cpa',
    name: 'High CPA',
    description: 'CPA > $150, Spend > $10',
    filter: (st) => {
      const cpa = parseFloat(st.cpa || 999999);
      return cpa > 150 && parseFloat(st.spend || 0) > 10;
    },
    color: 'orange',
  },
  {
    id: 'no-taps-high-impr',
    name: 'No Taps',
    description: 'Impressions > 500, Taps = 0',
    filter: (st) => {
      return parseInt(st.impressions || 0) > 500 &&
             parseInt(st.taps || 0) === 0;
    },
    color: 'red',
  },
];

export function SearchTermsAutoNegateModal({
  open,
  onClose,
  searchTerms = [],
  onAddNegatives
}) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [selectedTerms, setSelectedTerms] = useState(new Set());
  const [customFilters, setCustomFilters] = useState({
    minImpressions: '',
    maxInstalls: '',
    minSpend: '',
    maxTtr: '',
    minCpa: '',
  });
  const [useCustom, setUseCustom] = useState(false);
  const [sortField, setSortField] = useState('spend');
  const [sortDirection, setSortDirection] = useState('desc');

  const filteredTerms = useMemo(() => {
    let result = searchTerms;

    if (useCustom) {
      result = result.filter(st => {
        const impressions = parseInt(st.impressions || 0);
        const installs = parseInt(st.installs || 0);
        const spend = parseFloat(st.spend || 0);
        const ttr = parseFloat(st.ttr || 0);
        const cpa = parseFloat(st.cpa || 999999);

        if (customFilters.minImpressions && impressions < parseInt(customFilters.minImpressions)) return false;
        if (customFilters.maxInstalls && installs > parseInt(customFilters.maxInstalls)) return false;
        if (customFilters.minSpend && spend < parseFloat(customFilters.minSpend)) return false;
        if (customFilters.maxTtr && ttr > parseFloat(customFilters.maxTtr) / 100) return false;
        if (customFilters.minCpa && cpa < parseFloat(customFilters.minCpa)) return false;

        return true;
      });
    } else if (selectedPreset) {
      const preset = AUTO_NEGATE_PRESETS.find(p => p.id === selectedPreset);
      if (preset) {
        result = result.filter(preset.filter);
      }
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
          bVal = parseFloat(a.ttr || 0);
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
  }, [searchTerms, selectedPreset, useCustom, customFilters, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSelectAll = () => {
    if (selectedTerms.size === filteredTerms.length) {
      setSelectedTerms(new Set());
    } else {
      setSelectedTerms(new Set(filteredTerms.map(st => `${st.search_term}-${st.campaign_id}-${st.adgroup_id}`)));
    }
  };

  const handleSelectTerm = (st) => {
    const key = `${st.search_term}-${st.campaign_id}-${st.adgroup_id}`;
    const newSelected = new Set(selectedTerms);
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedTerms(newSelected);
  };

  const handleAddNegatives = () => {
    const termsToAdd = filteredTerms.filter(st =>
      selectedTerms.has(`${st.search_term}-${st.campaign_id}-${st.adgroup_id}`)
    );

    if (termsToAdd.length === 0) {
      alert('Please select at least one search term to add as negative keyword');
      return;
    }

    const confirmed = confirm(
      `Add ${termsToAdd.length} search term${termsToAdd.length > 1 ? 's' : ''} as negative keyword${termsToAdd.length > 1 ? 's' : ''}?`
    );

    if (confirmed) {
      onAddNegatives(termsToAdd);
      setSelectedTerms(new Set());
    }
  };

  const getColorClasses = (color, active) => {
    const colors = {
      red: active ? 'bg-red-100 border-red-500 text-red-700' : 'border-red-200 text-red-600 hover:bg-red-50',
      orange: active ? 'bg-orange-100 border-orange-500 text-orange-700' : 'border-orange-200 text-orange-600 hover:bg-orange-50',
      blue: active ? 'bg-blue-100 border-blue-500 text-blue-700' : 'border-blue-200 text-blue-600 hover:bg-blue-50',
    };
    return colors[color] || colors.blue;
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
    <Modal open={open} onClose={onClose} title="Auto-Negate Search Terms" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Automatically identify and add underperforming search terms as negative keywords to improve campaign efficiency.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">Suggestion Presets</h4>
            <Button
              size="sm"
              variant={useCustom ? 'primary' : 'secondary'}
              onClick={() => {
                setUseCustom(!useCustom);
                if (!useCustom) setSelectedPreset(null);
              }}
            >
              {useCustom ? 'Using Custom Filters' : 'Use Custom Filters'}
            </Button>
          </div>

          {!useCustom && (
            <div className="flex flex-wrap gap-2">
              {AUTO_NEGATE_PRESETS.map((preset) => {
                const isActive = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(isActive ? null : preset.id)}
                    className={`px-3 py-2 border-2 rounded-lg text-sm font-medium transition-colors ${getColorClasses(preset.color, isActive)}`}
                    title={preset.description}
                  >
                    <div className="flex items-center gap-2">
                      <span>{preset.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {useCustom && (
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Impressions
                </label>
                <Input
                  type="number"
                  value={customFilters.minImpressions}
                  onChange={(e) => setCustomFilters({ ...customFilters, minImpressions: e.target.value })}
                  placeholder="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Installs
                </label>
                <Input
                  type="number"
                  value={customFilters.maxInstalls}
                  onChange={(e) => setCustomFilters({ ...customFilters, maxInstalls: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Spend ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={customFilters.minSpend}
                  onChange={(e) => setCustomFilters({ ...customFilters, minSpend: e.target.value })}
                  placeholder="5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max TTR (%)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  value={customFilters.maxTtr}
                  onChange={(e) => setCustomFilters({ ...customFilters, maxTtr: e.target.value })}
                  placeholder="2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min CPA ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={customFilters.minCpa}
                  onChange={(e) => setCustomFilters({ ...customFilters, minCpa: e.target.value })}
                  placeholder="150"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-blue-500" />
            <span className="text-sm font-medium text-gray-700">
              {filteredTerms.length} suggested term{filteredTerms.length !== 1 ? 's' : ''}
            </span>
            {filteredTerms.length > 0 && (
              <>
                <span className="text-gray-300">|</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSelectAll}
                >
                  {selectedTerms.size === filteredTerms.length ? 'Deselect All' : 'Select All'}
                </Button>
              </>
            )}
          </div>
          {selectedTerms.size > 0 && (
            <Badge variant="info">
              {selectedTerms.size} selected
            </Badge>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto border rounded-lg">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader className="w-12">
                  <input
                    type="checkbox"
                    checked={filteredTerms.length > 0 && selectedTerms.size === filteredTerms.length}
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                </TableHeader>
                <SortHeader field="searchTerm">Search Term</SortHeader>
                <SortHeader field="spend" className="text-right">Spend</SortHeader>
                <SortHeader field="impressions" className="text-right">Impressions</SortHeader>
                <SortHeader field="taps" className="text-right">Taps</SortHeader>
                <SortHeader field="ttr" className="text-right">TTR</SortHeader>
                <SortHeader field="installs" className="text-right">Installs</SortHeader>
                <SortHeader field="cpa" className="text-right">CPA</SortHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTerms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    No search terms match the selected criteria. Try adjusting your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTerms.map((st, idx) => {
                  const key = `${st.search_term}-${st.campaign_id}-${st.adgroup_id}`;
                  const isSelected = selectedTerms.has(key);
                  const spend = parseFloat(st.spend || 0);
                  const ttr = parseFloat(st.ttr || 0);
                  const cpa = parseFloat(st.cpa || 0);

                  return (
                    <TableRow
                      key={`${key}-${idx}`}
                      className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
                      onClick={() => handleSelectTerm(st)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectTerm(st)}
                          className="rounded"
                        />
                      </TableCell>
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
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex gap-2 justify-end border-t pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleAddNegatives}
            disabled={selectedTerms.size === 0}
          >
            <Sparkles size={14} /> Add {selectedTerms.size > 0 ? `${selectedTerms.size} ` : ''}as Negative
          </Button>
        </div>
      </div>
    </Modal>
  );
}
