import { useState } from 'react';
import { Input, Select } from '../Input';
import { Button } from '../Button';
import { Badge } from '../Badge';
import { X, Plus } from 'lucide-react';

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

export default function ConditionBuilder({ conditions, onChange, logic, onLogicChange }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);

    const templateData = e.dataTransfer.getData('conditionTemplate');
    if (templateData) {
      try {
        const template = JSON.parse(templateData);
        const newCondition = {
          metric: template.metric,
          operator: template.defaultOperator,
          value: template.defaultValue,
          period: template.defaultPeriod,
        };
        onChange([...conditions, newCondition]);
      } catch (error) {
        console.error('Failed to parse condition template:', error);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleConditionChange = (index, field, value) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    onChange(newConditions);
  };

  const removeCondition = (index) => {
    const newConditions = conditions.filter((_, i) => i !== index);
    onChange(newConditions);
  };

  const addEmptyCondition = () => {
    onChange([
      ...conditions,
      { metric: 'spend', operator: '>', value: '', period: '7d' }
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Conditions</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Logic:</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onLogicChange('AND')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                logic === 'AND'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              AND
            </button>
            <button
              type="button"
              onClick={() => onLogicChange('OR')}
              className={`px-3 py-1 text-xs font-medium rounded ${
                logic === 'OR'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              OR
            </button>
          </div>
        </div>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`min-h-[200px] p-4 border-2 border-dashed rounded-lg transition-colors ${
          isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 bg-gray-50'
        }`}
      >
        {conditions.length === 0 ? (
          <div className="flex items-center justify-center h-[180px] text-gray-400">
            <div className="text-center">
              <p className="text-sm">Drop conditions here or click "Add Condition"</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {conditions.map((condition, index) => (
              <div key={index} className="bg-white p-3 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                  {index > 0 && (
                    <Badge variant={logic === 'AND' ? 'info' : 'warning'} className="mr-2">
                      {logic}
                    </Badge>
                  )}

                  <Select
                    value={condition.metric}
                    onChange={(e) => handleConditionChange(index, 'metric', e.target.value)}
                    options={[
                      { value: 'spend', label: 'Spend' },
                      { value: 'impressions', label: 'Impressions' },
                      { value: 'taps', label: 'Taps' },
                      { value: 'installs', label: 'Installs' },
                      { value: 'cpa', label: 'CPA' },
                      { value: 'cpt', label: 'CPT' },
                      { value: 'ttr', label: 'TTR' },
                    ]}
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
                    onChange={(e) => handleConditionChange(index, 'value', parseFloat(e.target.value) || '')}
                    placeholder="Value"
                    className="w-24"
                  />

                  <Select
                    value={condition.period}
                    onChange={(e) => handleConditionChange(index, 'period', e.target.value)}
                    options={PERIODS}
                    className="w-28"
                  />

                  <button
                    type="button"
                    onClick={() => removeCondition(index)}
                    className="ml-auto p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button type="button" variant="ghost" size="sm" onClick={addEmptyCondition}>
        <Plus size={14} /> Add Condition
      </Button>
    </div>
  );
}
