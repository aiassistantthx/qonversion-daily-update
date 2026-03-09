import { Badge } from '../Badge';
import { Grip } from 'lucide-react';

const CONDITION_TEMPLATES = [
  { id: 'cpa', metric: 'cpa', label: 'CPA', description: 'Cost per acquisition', defaultOperator: '>', defaultValue: 50, defaultPeriod: '7d' },
  { id: 'spend', metric: 'spend', label: 'Spend', description: 'Total spend', defaultOperator: '>', defaultValue: 10, defaultPeriod: '7d' },
  { id: 'impressions', metric: 'impressions', label: 'Impressions', description: 'Number of impressions', defaultOperator: '<', defaultValue: 1000, defaultPeriod: '7d' },
  { id: 'taps', metric: 'taps', label: 'Taps', description: 'Number of taps/clicks', defaultOperator: '<', defaultValue: 50, defaultPeriod: '7d' },
  { id: 'installs', metric: 'installs', label: 'Installs', description: 'Number of installs', defaultOperator: '<', defaultValue: 10, defaultPeriod: '7d' },
  { id: 'cpt', metric: 'cpt', label: 'CPT', description: 'Cost per tap', defaultOperator: '>', defaultValue: 1, defaultPeriod: '7d' },
  { id: 'ttr', metric: 'ttr', label: 'TTR', description: 'Tap-through rate', defaultOperator: '<', defaultValue: 5, defaultPeriod: '7d' },
];

export default function ConditionLibrary({ onAddCondition }) {
  const handleDragStart = (e, template) => {
    e.dataTransfer.setData('conditionTemplate', JSON.stringify(template));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleClick = (template) => {
    if (onAddCondition) {
      onAddCondition({
        metric: template.metric,
        operator: template.defaultOperator,
        value: template.defaultValue,
        period: template.defaultPeriod,
      });
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Condition Library</h3>
      <div className="grid grid-cols-1 gap-2">
        {CONDITION_TEMPLATES.map((template) => (
          <div
            key={template.id}
            draggable
            onDragStart={(e) => handleDragStart(e, template)}
            onClick={() => handleClick(template)}
            className="flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg cursor-move hover:border-blue-400 hover:shadow-sm transition-all"
          >
            <Grip size={16} className="text-gray-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{template.label}</span>
                <Badge variant="info">{template.metric}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Drag conditions to the builder or click to add
      </p>
    </div>
  );
}
