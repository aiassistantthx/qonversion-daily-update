import { useState } from 'react';
import { Input } from '../Input';

export default function TargetingStep({ data, onChange, errors }) {
  const [keywordInput, setKeywordInput] = useState('');

  const handleAddKeyword = () => {
    if (!keywordInput.trim()) return;

    const keywords = data.keywords || [];
    const newKeyword = {
      text: keywordInput.trim(),
      matchType: 'BROAD',
      bidAmount: { amount: '1.00', currency: 'USD' }
    };

    onChange({ keywords: [...keywords, newKeyword] });
    setKeywordInput('');
  };

  const handleRemoveKeyword = (index) => {
    const keywords = [...(data.keywords || [])];
    keywords.splice(index, 1);
    onChange({ keywords });
  };

  const handleKeywordChange = (index, field, value) => {
    const keywords = [...(data.keywords || [])];
    if (field === 'matchType') {
      keywords[index].matchType = value;
    } else if (field === 'bid') {
      keywords[index].bidAmount = { amount: value, currency: 'USD' };
    }
    onChange({ keywords });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ad Group Name *
        </label>
        <Input
          type="text"
          value={data.adGroupName || ''}
          onChange={(e) => onChange({ adGroupName: e.target.value })}
          placeholder="Enter ad group name"
          className={errors.adGroupName ? 'border-red-500' : ''}
        />
        {errors.adGroupName && (
          <p className="mt-1 text-sm text-red-500">{errors.adGroupName}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default CPC Bid
        </label>
        <Input
          type="number"
          step="0.01"
          min="0.10"
          value={data.defaultBid || '1.00'}
          onChange={(e) => onChange({ defaultBid: e.target.value })}
          placeholder="1.00"
        />
        <p className="mt-1 text-sm text-gray-500">
          Default cost per click bid for this ad group
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Keywords
        </label>
        <div className="flex gap-2 mb-4">
          <Input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
            placeholder="Enter keyword and press Enter"
            className="flex-1"
          />
          <button
            type="button"
            onClick={handleAddKeyword}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add
          </button>
        </div>

        {data.keywords && data.keywords.length > 0 && (
          <div className="space-y-2">
            {data.keywords.map((keyword, index) => (
              <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <span className="flex-1 font-medium">{keyword.text}</span>
                <select
                  value={keyword.matchType}
                  onChange={(e) => handleKeywordChange(index, 'matchType', e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  <option value="EXACT">Exact</option>
                  <option value="BROAD">Broad</option>
                </select>
                <Input
                  type="number"
                  step="0.01"
                  min="0.10"
                  value={keyword.bidAmount.amount}
                  onChange={(e) => handleKeywordChange(index, 'bid', e.target.value)}
                  className="w-24"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(index)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Negative Keywords
        </label>
        <textarea
          value={data.negativeKeywords?.join('\n') || ''}
          onChange={(e) => {
            const keywords = e.target.value.split('\n').filter(k => k.trim());
            onChange({ negativeKeywords: keywords });
          }}
          placeholder="Enter negative keywords (one per line)"
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
        <p className="mt-1 text-sm text-gray-500">
          Keywords you don't want to trigger your ads
        </p>
      </div>
    </div>
  );
}
