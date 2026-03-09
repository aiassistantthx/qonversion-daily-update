import { Select, Input } from '../Input';
import { Badge } from '../Badge';
import BidScheduler from '../BidScheduler';

const ACTION_TYPES = [
  { value: 'adjust_bid', label: 'Adjust Bid (%)', description: 'Increase or decrease bid by percentage' },
  { value: 'set_bid', label: 'Set Bid ($)', description: 'Set a fixed bid amount' },
  { value: 'schedule_bid', label: 'Schedule Bid', description: 'Set bid multipliers by day and hour' },
  { value: 'pause', label: 'Pause', description: 'Pause the entity' },
  { value: 'enable', label: 'Enable', description: 'Enable the entity' },
  { value: 'send_alert', label: 'Send Alert', description: 'Send a notification' },
];

export default function ActionSelector({ actionType, actionParams, onChange }) {
  const handleActionTypeChange = (type) => {
    onChange({ actionType: type, actionParams: {} });
  };

  const handleParamChange = (param, value) => {
    onChange({
      actionType,
      actionParams: { ...actionParams, [param]: value }
    });
  };

  const selectedAction = ACTION_TYPES.find(a => a.value === actionType);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-gray-700">Action</h3>

      <div className="grid grid-cols-1 gap-2">
        {ACTION_TYPES.map((action) => (
          <div
            key={action.value}
            onClick={() => handleActionTypeChange(action.value)}
            className={`p-3 border rounded-lg cursor-pointer transition-all ${
              actionType === action.value
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{action.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{action.description}</div>
              </div>
              {actionType === action.value && (
                <Badge variant="success">Selected</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {actionType === 'adjust_bid' && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Adjustment Parameters</h4>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Adjustment Percentage
            </label>
            <Input
              type="number"
              value={actionParams.adjustmentValue || ''}
              onChange={(e) => {
                handleParamChange('adjustmentValue', parseFloat(e.target.value) || 0);
                handleParamChange('adjustmentType', 'percent');
              }}
              placeholder="e.g., -15 or 10"
              className="w-full"
            />
            <p className="text-xs text-gray-500 mt-1">
              Negative values decrease bid, positive values increase it
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Min Bid ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={actionParams.minBid || ''}
                onChange={(e) => handleParamChange('minBid', parseFloat(e.target.value) || 0)}
                placeholder="0.50"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Max Bid ($)
              </label>
              <Input
                type="number"
                step="0.01"
                value={actionParams.maxBid || ''}
                onChange={(e) => handleParamChange('maxBid', parseFloat(e.target.value) || 0)}
                placeholder="10.00"
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}

      {actionType === 'set_bid' && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Bid Parameters</h4>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Bid Amount ($)
            </label>
            <Input
              type="number"
              step="0.01"
              value={actionParams.bidAmount || ''}
              onChange={(e) => handleParamChange('bidAmount', parseFloat(e.target.value) || 0)}
              placeholder="2.50"
              className="w-full"
            />
          </div>
        </div>
      )}

      {actionType === 'schedule_bid' && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <BidScheduler
            schedule={actionParams.schedule}
            onChange={(schedule) => handleParamChange('schedule', schedule)}
          />
        </div>
      )}

      {actionType === 'send_alert' && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Alert Parameters</h4>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Message
            </label>
            <Input
              type="text"
              value={actionParams.message || ''}
              onChange={(e) => handleParamChange('message', e.target.value)}
              placeholder="Enter alert message"
              className="w-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
