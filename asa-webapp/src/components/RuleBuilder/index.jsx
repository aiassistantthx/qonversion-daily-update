import { useState, useEffect } from 'react';
import { Input, Select, Textarea } from '../Input';
import { Button } from '../Button';
import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import ConditionLibrary from './ConditionLibrary';
import ConditionBuilder from './ConditionBuilder';
import ActionSelector from './ActionSelector';
import RulePreview from './RulePreview';

export default function RuleBuilder({ initialRule, onSave, onCancel }) {
  const [rule, setRule] = useState({
    name: '',
    description: '',
    scope: 'keyword',
    conditions: [],
    conditions_logic: 'AND',
    action_type: 'adjust_bid',
    action_params: {},
    frequency: 'daily',
    enabled: true,
    ...initialRule,
  });

  const handleFieldChange = (field, value) => {
    setRule({ ...rule, [field]: value });
  };

  const handleConditionsChange = (conditions) => {
    setRule({ ...rule, conditions });
  };

  const handleActionChange = ({ actionType, actionParams }) => {
    setRule({
      ...rule,
      action_type: actionType,
      action_params: actionParams,
    });
  };

  const handleAddCondition = (condition) => {
    setRule({
      ...rule,
      conditions: [...rule.conditions, condition],
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(rule);
  };

  const isValid = () => {
    if (!rule.name || rule.name.trim() === '') return false;
    if (!rule.conditions || rule.conditions.length === 0) return false;
    if (!rule.action_type) return false;

    const hasInvalidConditions = rule.conditions.some(c => !c.value || c.value === '');
    if (hasInvalidConditions) return false;

    if (rule.action_type === 'adjust_bid') {
      if (!rule.action_params?.adjustmentValue ||
          !rule.action_params?.minBid ||
          !rule.action_params?.maxBid) {
        return false;
      }
    } else if (rule.action_type === 'set_bid') {
      if (!rule.action_params?.bidAmount) return false;
    } else if (rule.action_type === 'schedule_bid') {
      if (!rule.action_params?.schedule) return false;
    }

    return true;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Rule Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Rule Name"
            value={rule.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            placeholder="e.g., High CPA - Decrease Bid"
            required
          />

          <Textarea
            label="Description"
            value={rule.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            placeholder="Describe what this rule does and when it should trigger"
            rows={2}
          />

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Scope"
              value={rule.scope}
              onChange={(e) => handleFieldChange('scope', e.target.value)}
              options={[
                { value: 'keyword', label: 'Keyword' },
                { value: 'adgroup', label: 'Ad Group' },
                { value: 'campaign', label: 'Campaign' },
              ]}
            />

            <Select
              label="Frequency"
              value={rule.frequency}
              onChange={(e) => handleFieldChange('frequency', e.target.value)}
              options={[
                { value: 'hourly', label: 'Hourly' },
                { value: 'daily', label: 'Daily' },
                { value: 'weekly', label: 'Weekly' },
              ]}
            />

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(e) => handleFieldChange('enabled', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Enable rule</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conditions */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Build Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <ConditionBuilder
                conditions={rule.conditions}
                onChange={handleConditionsChange}
                logic={rule.conditions_logic}
                onLogicChange={(logic) => handleFieldChange('conditions_logic', logic)}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardContent className="pt-4">
              <ConditionLibrary onAddCondition={handleAddCondition} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action */}
      <Card>
        <CardHeader>
          <CardTitle>Select Action</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionSelector
            actionType={rule.action_type}
            actionParams={rule.action_params}
            onChange={handleActionChange}
          />
        </CardContent>
      </Card>

      {/* Preview */}
      <RulePreview rule={rule} isValid={isValid()} />

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!isValid()}>
          {initialRule ? 'Update Rule' : 'Create Rule'}
        </Button>
      </div>
    </form>
  );
}
