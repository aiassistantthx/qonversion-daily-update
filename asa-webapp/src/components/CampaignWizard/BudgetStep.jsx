import { Input } from '../Input';

export default function BudgetStep({ data, onChange, errors }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Daily Budget *
        </label>
        <Input
          type="number"
          step="1"
          min="1"
          value={data.dailyBudget || ''}
          onChange={(e) => onChange({ dailyBudget: e.target.value })}
          placeholder="100"
          className={errors.dailyBudget ? 'border-red-500' : ''}
        />
        {errors.dailyBudget && (
          <p className="mt-1 text-sm text-red-500">{errors.dailyBudget}</p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          Maximum amount to spend per day (USD)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Total Budget (Optional)
        </label>
        <Input
          type="number"
          step="1"
          min="1"
          value={data.totalBudget || ''}
          onChange={(e) => onChange({ totalBudget: e.target.value })}
          placeholder="Leave empty for no limit"
        />
        <p className="mt-1 text-sm text-gray-500">
          Maximum total amount to spend for the entire campaign
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Start Date
        </label>
        <Input
          type="date"
          value={data.startDate || ''}
          onChange={(e) => onChange({ startDate: e.target.value })}
          min={new Date().toISOString().split('T')[0]}
        />
        <p className="mt-1 text-sm text-gray-500">
          Leave empty to start immediately
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          End Date (Optional)
        </label>
        <Input
          type="date"
          value={data.endDate || ''}
          onChange={(e) => onChange({ endDate: e.target.value })}
          min={data.startDate || new Date().toISOString().split('T')[0]}
        />
        <p className="mt-1 text-sm text-gray-500">
          Leave empty to run indefinitely
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Status
        </label>
        <select
          value={data.status || 'PAUSED'}
          onChange={(e) => onChange({ status: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="PAUSED">Paused (review before launching)</option>
          <option value="ENABLED">Enabled (start immediately)</option>
        </select>
        <p className="mt-1 text-sm text-gray-500">
          Start paused to review settings before launching
        </p>
      </div>
    </div>
  );
}
