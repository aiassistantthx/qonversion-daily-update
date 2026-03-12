import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Copy } from 'lucide-react';

export function CampaignDuplicateModal({ campaign, isOpen: open, onClose, onDuplicate, isLoading }) {
  const [name, setName] = useState(`${campaign?.name || ''} (Copy)`);
  const [copyAdGroups, setCopyAdGroups] = useState(true);
  const [copyKeywords, setCopyKeywords] = useState(true);
  const [copyBids, setCopyBids] = useState(true);
  const [selectedCountries, setSelectedCountries] = useState(campaign?.countriesOrRegions || []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onDuplicate({
      name: name.trim(),
      copyAdGroups,
      copyKeywords: copyAdGroups && copyKeywords,
      copyBids: copyAdGroups && copyKeywords && copyBids,
      countriesOrRegions: selectedCountries
    });
  };

  const handleCountryChange = (e) => {
    const value = e.target.value;
    const countries = value.split(',').map(c => c.trim()).filter(Boolean);
    setSelectedCountries(countries);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Duplicate Campaign"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Campaign Name
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter campaign name"
            required
          />
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Countries/Regions
          </label>
          <Input
            type="text"
            value={selectedCountries.join(', ')}
            onChange={handleCountryChange}
            placeholder="US, GB, DE"
          />
          <p className="mt-1 text-xs text-gray-500">
            Comma-separated country codes (e.g., US, GB, DE)
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> The duplicated campaign will be created in PAUSED status.
            {copyAdGroups && ' Ad groups and keywords will also be paused.'}
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
            disabled={!name.trim() || selectedCountries.length === 0}
          >
            <Copy size={16} />
            Duplicate Campaign
          </Button>
        </div>
      </form>
    </Modal>
  );
}
