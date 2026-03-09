import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { Badge } from './Badge';
import { Upload, FileText, X, AlertTriangle } from 'lucide-react';

export function BulkKeywordAdd({ isOpen, onClose, campaignId, adGroupId, onSuccess }) {
  const [mode, setMode] = useState('textarea'); // 'textarea' or 'csv'
  const [textInput, setTextInput] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [parsedKeywords, setParsedKeywords] = useState([]);
  const [defaultBid, setDefaultBid] = useState('1.00');
  const [defaultMatchType, setDefaultMatchType] = useState('EXACT');
  const [errors, setErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parseTextInput = () => {
    const lines = textInput.split('\n').filter(line => line.trim());
    const keywords = lines.map((line, index) => {
      const text = line.trim();
      if (!text) return null;
      return {
        text,
        matchType: defaultMatchType,
        bidAmount: parseFloat(defaultBid),
        status: 'ACTIVE',
        lineNumber: index + 1
      };
    }).filter(Boolean);

    const validationErrors = [];
    keywords.forEach(kw => {
      if (kw.text.length > 100) {
        validationErrors.push(`Line ${kw.lineNumber}: Keyword too long (max 100 chars)`);
      }
      if (kw.bidAmount <= 0) {
        validationErrors.push(`Line ${kw.lineNumber}: Invalid bid amount`);
      }
    });

    setErrors(validationErrors);
    setParsedKeywords(keywords);
  };

  const parseCsvFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        setErrors(['CSV file is empty']);
        return;
      }

      // Skip header if present
      const startIndex = lines[0].toLowerCase().includes('keyword') ? 1 : 0;
      const keywords = [];
      const validationErrors = [];

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const text = parts[0];
        const matchType = parts[1]?.toUpperCase() || defaultMatchType;
        const bidAmount = parseFloat(parts[2] || defaultBid);

        if (!text) {
          validationErrors.push(`Line ${i + 1}: Missing keyword text`);
          continue;
        }

        if (text.length > 100) {
          validationErrors.push(`Line ${i + 1}: Keyword too long (max 100 chars)`);
        }

        if (!['EXACT', 'BROAD'].includes(matchType)) {
          validationErrors.push(`Line ${i + 1}: Invalid match type (use EXACT or BROAD)`);
        }

        if (isNaN(bidAmount) || bidAmount <= 0) {
          validationErrors.push(`Line ${i + 1}: Invalid bid amount`);
        }

        keywords.push({
          text,
          matchType,
          bidAmount,
          status: 'ACTIVE',
          lineNumber: i + 1
        });
      }

      setErrors(validationErrors);
      setParsedKeywords(keywords);
    };

    reader.readAsText(file);
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setErrors(['Please upload a CSV file']);
      return;
    }

    setCsvFile(file);
    parseCsvFile(file);
  };

  const handlePreview = () => {
    if (mode === 'textarea') {
      parseTextInput();
    }
  };

  const handleSubmit = async () => {
    if (!campaignId || !adGroupId) {
      setErrors(['Campaign and Ad Group must be selected']);
      return;
    }

    if (parsedKeywords.length === 0) {
      setErrors(['No keywords to add']);
      return;
    }

    if (errors.length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSuccess(parsedKeywords);
      handleClose();
    } catch (error) {
      setErrors([error.message || 'Failed to create keywords']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setMode('textarea');
    setTextInput('');
    setCsvFile(null);
    setParsedKeywords([]);
    setErrors([]);
    setDefaultBid('1.00');
    setDefaultMatchType('EXACT');
    onClose();
  };

  const removeKeyword = (index) => {
    setParsedKeywords(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Add Keywords in Bulk" size="large">
      <div className="space-y-4">
        {/* Mode Selection */}
        <div className="flex gap-2 border-b pb-3">
          <Button
            variant={mode === 'textarea' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setMode('textarea')}
          >
            <FileText size={16} /> Text Input
          </Button>
          <Button
            variant={mode === 'csv' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setMode('csv')}
          >
            <Upload size={16} /> CSV Upload
          </Button>
        </div>

        {/* Default Settings */}
        <Card>
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">Default Settings</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Match Type</label>
                <select
                  value={defaultMatchType}
                  onChange={(e) => setDefaultMatchType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="EXACT">Exact</option>
                  <option value="BROAD">Broad</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Default Bid ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={defaultBid}
                  onChange={(e) => setDefaultBid(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Input Area */}
        {mode === 'textarea' ? (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Enter keywords (one per line)
            </label>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="ai chat&#10;chatbot&#10;openai assistant"
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            />
            <div className="flex justify-end mt-2">
              <Button size="sm" onClick={handlePreview} disabled={!textInput.trim()}>
                Preview
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Upload CSV file
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">
                  {csvFile ? csvFile.name : 'Click to upload CSV file'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Format: keyword,match_type,bid_amount
                </p>
              </label>
            </div>
          </div>
        )}

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
        {parsedKeywords.length > 0 && (
          <Card>
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Preview ({parsedKeywords.length} keywords)
                </h3>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {parsedKeywords.map((kw, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <span className="font-mono">{kw.text}</span>
                      <Badge variant={kw.matchType === 'EXACT' ? 'info' : 'default'}>
                        {kw.matchType}
                      </Badge>
                      <span className="text-gray-500">${kw.bidAmount.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={() => removeKeyword(index)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
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
            disabled={parsedKeywords.length === 0 || errors.length > 0}
          >
            Add {parsedKeywords.length} Keywords
          </Button>
        </div>
      </div>
    </Modal>
  );
}
