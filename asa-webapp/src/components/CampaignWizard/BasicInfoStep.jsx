import { Input } from '../Input';

export default function BasicInfoStep({ data, onChange, errors }) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Campaign Name *
        </label>
        <Input
          type="text"
          value={data.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Enter campaign name"
          className={errors.name ? 'border-red-500' : ''}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-500">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          App ID *
        </label>
        <Input
          type="text"
          value={data.adamId || ''}
          onChange={(e) => onChange({ adamId: e.target.value })}
          placeholder="App Store ID (e.g., 1234567890)"
          className={errors.adamId ? 'border-red-500' : ''}
        />
        {errors.adamId && (
          <p className="mt-1 text-sm text-red-500">{errors.adamId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Countries/Regions *
        </label>
        <select
          multiple
          value={data.countriesOrRegions || []}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, option => option.value);
            onChange({ countriesOrRegions: selected });
          }}
          className={`w-full px-3 py-2 border rounded-lg min-h-[120px] ${errors.countriesOrRegions ? 'border-red-500' : 'border-gray-300'}`}
        >
          <option value="US">United States</option>
          <option value="GB">United Kingdom</option>
          <option value="CA">Canada</option>
          <option value="AU">Australia</option>
          <option value="DE">Germany</option>
          <option value="FR">France</option>
          <option value="ES">Spain</option>
          <option value="IT">Italy</option>
          <option value="JP">Japan</option>
          <option value="CN">China</option>
        </select>
        {errors.countriesOrRegions && (
          <p className="mt-1 text-sm text-red-500">{errors.countriesOrRegions}</p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          Hold Ctrl/Cmd to select multiple countries
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Supply Sources
        </label>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={data.supplySources?.includes('APPSTORE_SEARCH_RESULTS') || false}
              onChange={(e) => {
                const sources = data.supplySources || [];
                const value = 'APPSTORE_SEARCH_RESULTS';
                onChange({
                  supplySources: e.target.checked
                    ? [...sources, value]
                    : sources.filter(s => s !== value)
                });
              }}
              className="rounded border-gray-300"
            />
            <span className="ml-2 text-sm">App Store Search Results</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={data.supplySources?.includes('APPSTORE_SEARCH_TAB') || false}
              onChange={(e) => {
                const sources = data.supplySources || [];
                const value = 'APPSTORE_SEARCH_TAB';
                onChange({
                  supplySources: e.target.checked
                    ? [...sources, value]
                    : sources.filter(s => s !== value)
                });
              }}
              className="rounded border-gray-300"
            />
            <span className="ml-2 text-sm">App Store Search Tab</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={data.supplySources?.includes('APPSTORE_TODAY_TAB') || false}
              onChange={(e) => {
                const sources = data.supplySources || [];
                const value = 'APPSTORE_TODAY_TAB';
                onChange({
                  supplySources: e.target.checked
                    ? [...sources, value]
                    : sources.filter(s => s !== value)
                });
              }}
              className="rounded border-gray-300"
            />
            <span className="ml-2 text-sm">App Store Today Tab</span>
          </label>
        </div>
      </div>
    </div>
  );
}
