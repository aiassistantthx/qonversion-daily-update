import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { Badge } from './Badge';
import { AlertTriangle, X } from 'lucide-react';

const CAMPAIGN_TYPES = {
  discovery: {
    label: 'Discovery',
    description: 'Generic keywords for broad user acquisition',
    keywords: ['ai chat', 'chatbot', 'ai assistant', 'chat ai'],
  },
  brand: {
    label: 'Brand',
    description: 'Brand-related keywords',
    keywords: ['openchat', 'open chat', 'openchat ai'],
  },
  competitors: {
    label: 'Competitors',
    description: 'Competitor brand keywords',
    keywords: ['chatgpt', 'claude', 'gemini', 'copilot'],
  },
};

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
];

export function BulkCampaignCreate({ isOpen, onClose, onSuccess, appId }) {
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [dailyBudget, setDailyBudget] = useState('10.00');
  const [defaultBid, setDefaultBid] = useState('1.00');
  const [status, setStatus] = useState('PAUSED');
  const [errors, setErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleType = (type) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleCountry = (code) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const selectAllCountries = () => {
    if (selectedCountries.length === COUNTRIES.length) {
      setSelectedCountries([]);
    } else {
      setSelectedCountries(COUNTRIES.map(c => c.code));
    }
  };

  const validateInputs = () => {
    const validationErrors = [];

    if (selectedTypes.length === 0) {
      validationErrors.push('Select at least one campaign type');
    }

    if (selectedCountries.length === 0) {
      validationErrors.push('Select at least one country');
    }

    const budget = parseFloat(dailyBudget);
    if (isNaN(budget) || budget < 1) {
      validationErrors.push('Daily budget must be at least $1');
    }

    const bid = parseFloat(defaultBid);
    if (isNaN(bid) || bid < 0.1) {
      validationErrors.push('Default bid must be at least $0.10');
    }

    return validationErrors;
  };

  const generateCampaigns = () => {
    const campaigns = [];

    selectedTypes.forEach(type => {
      selectedCountries.forEach(country => {
        const typeConfig = CAMPAIGN_TYPES[type];
        campaigns.push({
          name: `${typeConfig.label} - ${country}`,
          adamId: appId || '',
          countriesOrRegions: [country],
          supplySources: ['APPSTORE_SEARCH_RESULTS'],
          adGroupName: `${typeConfig.label} Ad Group`,
          defaultBid: defaultBid,
          keywords: typeConfig.keywords.map(kw => ({
            text: kw,
            matchType: 'EXACT',
            bidAmount: { amount: defaultBid, currency: 'USD' }
          })),
          negativeKeywords: [],
          dailyBudget: dailyBudget,
          status: status,
        });
      });
    });

    return campaigns;
  };

  const totalCampaigns = selectedTypes.length * selectedCountries.length;

  const handleSubmit = async () => {
    const validationErrors = validateInputs();

    if (!appId) {
      validationErrors.push('App ID is required');
    }

    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    const campaignsToCreate = generateCampaigns();

    if (campaignsToCreate.length === 0) {
      return;
    }

    setErrors([]);
    setIsSubmitting(true);
    try {
      await onSuccess(campaignsToCreate);
      handleClose();
    } catch (error) {
      setErrors([error.message || 'Failed to create campaigns']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedTypes([]);
    setSelectedCountries([]);
    setDailyBudget('10.00');
    setDefaultBid('1.00');
    setStatus('PAUSED');
    setErrors([]);
    onClose();
  };

  const removeType = (type) => {
    setSelectedTypes(prev => prev.filter(t => t !== type));
  };

  const removeCountry = (code) => {
    setSelectedCountries(prev => prev.filter(c => c !== code));
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Bulk Create Campaigns" size="large">
      <div className="space-y-4">
        {/* Campaign Types */}
        <Card>
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Campaign Types</h3>
            <div className="grid grid-cols-1 gap-2">
              {Object.entries(CAMPAIGN_TYPES).map(([key, config]) => (
                <label
                  key={key}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedTypes.includes(key)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(key)}
                    onChange={() => toggleType(key)}
                    className="mt-1 rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{config.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{config.description}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Keywords: {config.keywords.join(', ')}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {selectedTypes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {selectedTypes.map(type => (
                  <Badge key={type} variant="primary">
                    {CAMPAIGN_TYPES[type].label}
                    <button
                      onClick={() => removeType(type)}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      <X size={12} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Countries */}
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">Countries</h3>
              <Button size="sm" variant="ghost" onClick={selectAllCountries}>
                {selectedCountries.length === COUNTRIES.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COUNTRIES.map(country => (
                <label
                  key={country.code}
                  className={`flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors ${
                    selectedCountries.includes(country.code)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCountries.includes(country.code)}
                    onChange={() => toggleCountry(country.code)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium">{country.code}</span>
                  <span className="text-xs text-gray-500">{country.name}</span>
                </label>
              ))}
            </div>
            {selectedCountries.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {selectedCountries.map(code => {
                  const country = COUNTRIES.find(c => c.code === code);
                  return (
                    <Badge key={code} variant="default">
                      {code}
                      <button
                        onClick={() => removeCountry(code)}
                        className="ml-1 text-gray-600 hover:text-gray-800"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Settings */}
        <Card>
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Campaign Settings</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Daily Budget ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Default Bid ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.10"
                  value={defaultBid}
                  onChange={(e) => setDefaultBid(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Initial Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="PAUSED">Paused</option>
                  <option value="ENABLED">Enabled</option>
                </select>
              </div>
            </div>
          </div>
        </Card>

        {/* Errors */}
        {errors.length > 0 && (
          <Card className="border-red-200 bg-red-50">
            <div className="p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-red-900 mb-1">Validation Errors</h4>
                  <ul className="text-xs text-red-700 space-y-1">
                    {errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Preview */}
        {totalCampaigns > 0 && errors.length === 0 && (
          <Card>
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Preview ({totalCampaigns} campaigns will be created)
              </h3>
              <div className="text-xs text-gray-600 space-y-1">
                <p>• {selectedTypes.length} campaign types × {selectedCountries.length} countries</p>
                <p>• Daily budget: ${dailyBudget} per campaign</p>
                <p>• Total daily budget: ${(parseFloat(dailyBudget) * totalCampaigns).toFixed(2)}</p>
                <p>• Default keyword bid: ${defaultBid}</p>
                <p>• Initial status: {status}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={totalCampaigns === 0 || errors.length > 0 || !appId}
          >
            Create {totalCampaigns} Campaigns
          </Button>
        </div>
      </div>
    </Modal>
  );
}
