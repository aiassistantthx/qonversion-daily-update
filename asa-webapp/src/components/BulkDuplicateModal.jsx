import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Copy } from 'lucide-react';

const COMMON_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'BR', name: 'Brazil' },
];

export function BulkDuplicateModal({ campaigns, isOpen: open, onClose, onDuplicate, isLoading }) {
  const [copyAdGroups, setCopyAdGroups] = useState(true);
  const [copyKeywords, setCopyKeywords] = useState(true);
  const [copyBids, setCopyBids] = useState(true);
  const [selectedCountries, setSelectedCountries] = useState([]);
  const [customCountries, setCustomCountries] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();

    const allCountries = [
      ...selectedCountries,
      ...customCountries.split(',').map(c => c.trim()).filter(Boolean)
    ];

    if (allCountries.length === 0) {
      alert('Please select at least one country');
      return;
    }

    const duplicates = [];
    campaigns.forEach(campaign => {
      allCountries.forEach(country => {
        duplicates.push({
          sourceId: campaign.id,
          name: `${campaign.name} (${country})`,
          copyAdGroups,
          copyKeywords: copyAdGroups && copyKeywords,
          copyBids: copyAdGroups && copyKeywords && copyBids,
          countriesOrRegions: [country]
        });
      });
    });

    onDuplicate(duplicates);
  };

  const toggleCountry = (code) => {
    setSelectedCountries(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Bulk Duplicate ${campaigns?.length || 0} Campaign(s)`}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            Each selected campaign will be duplicated for each selected country.
            Total campaigns to create: <strong>{(campaigns?.length || 0) * (selectedCountries.length + customCountries.split(',').filter(Boolean).length)}</strong>
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">What to copy?</h3>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={copyAdGroups}
              onChange={(e) => {
                setCopyAdGroups(e.target.checked);
                if (!e.target.checked) {
                  setCopyKeywords(false);
                  setCopyBids(false);
                }
              }}
              className="mt-1 rounded border-gray-300"
            />
            <div>
              <div className="font-medium text-sm">Ad Groups</div>
              <div className="text-xs text-gray-500">Copy all ad group structures</div>
            </div>
          </label>

          <label className="flex items-start gap-3 ml-6">
            <input
              type="checkbox"
              checked={copyKeywords}
              onChange={(e) => {
                setCopyKeywords(e.target.checked);
                if (!e.target.checked) {
                  setCopyBids(false);
                }
              }}
              disabled={!copyAdGroups}
              className="mt-1 rounded border-gray-300 disabled:opacity-50"
            />
            <div>
              <div className="font-medium text-sm">Keywords</div>
              <div className="text-xs text-gray-500">Copy all keywords from ad groups</div>
            </div>
          </label>

          <label className="flex items-start gap-3 ml-12">
            <input
              type="checkbox"
              checked={copyBids}
              onChange={(e) => setCopyBids(e.target.checked)}
              disabled={!copyAdGroups || !copyKeywords}
              className="mt-1 rounded border-gray-300 disabled:opacity-50"
            />
            <div>
              <div className="font-medium text-sm">Current Bids</div>
              <div className="text-xs text-gray-500">Keep current bid amounts</div>
            </div>
          </label>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Select Countries</h3>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_COUNTRIES.map(country => (
              <label
                key={country.code}
                className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedCountries.includes(country.code)}
                  onChange={() => toggleCountry(country.code)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{country.name} ({country.code})</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom Countries
            </label>
            <input
              type="text"
              value={customCountries}
              onChange={(e) => setCustomCountries(e.target.value)}
              placeholder="e.g., SE, NO, DK"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Comma-separated country codes
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            <strong>Note:</strong> All duplicated campaigns will be created in PAUSED status.
            You can review and enable them individually.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isLoading}
            disabled={selectedCountries.length === 0 && !customCountries.trim()}
          >
            <Copy size={16} />
            Duplicate to {selectedCountries.length + customCountries.split(',').filter(Boolean).length} Countries
          </Button>
        </div>
      </form>
    </Modal>
  );
}
