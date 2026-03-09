import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { Play, Pause, TrendingUp, Trash2 } from 'lucide-react';

export function BulkActionsToolbar({
  selectedCount,
  selectedItems,
  onSelectAll,
  onDeselectAll,
  onPause,
  onEnable,
  onAdjustBid,
  onDelete,
  entityType = 'items',
  canAdjustBid = false,
}) {
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidAdjustment, setBidAdjustment] = useState('');
  const [bidAdjustmentType, setBidAdjustmentType] = useState('percent');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const handleAction = (action, actionFn) => {
    setPendingAction({ action, actionFn });
    setShowConfirmModal(true);
  };

  const confirmAction = () => {
    if (pendingAction) {
      pendingAction.actionFn();
      setShowConfirmModal(false);
      setPendingAction(null);
    }
  };

  const handleBidAdjustment = () => {
    setShowBidModal(true);
  };

  const applyBidAdjustment = () => {
    const value = parseFloat(bidAdjustment);
    if (!isNaN(value) && onAdjustBid) {
      onAdjustBid({
        type: bidAdjustmentType,
        value,
      });
      setShowBidModal(false);
      setBidAdjustment('');
    }
  };

  const getActionPreview = () => {
    if (!pendingAction) return null;

    const action = pendingAction.action;
    const count = selectedCount;

    switch (action) {
      case 'pause':
        return `Pause ${count} ${entityType}`;
      case 'enable':
        return `Enable ${count} ${entityType}`;
      case 'delete':
        return `Delete ${count} ${entityType}`;
      default:
        return `Update ${count} ${entityType}`;
    }
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white shadow-lg rounded-lg border border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {selectedCount} {entityType} selected
            </span>
            <button
              onClick={onSelectAll}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={onDeselectAll}
              className="text-xs text-gray-600 hover:text-gray-800 hover:underline"
            >
              Deselect all
            </button>
          </div>

          <div className="h-6 w-px bg-gray-300" />

          <div className="flex items-center gap-2">
            {onEnable && (
              <Button
                variant="success"
                size="sm"
                onClick={() => handleAction('enable', onEnable)}
              >
                <Play size={14} /> Enable
              </Button>
            )}
            {onPause && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleAction('pause', onPause)}
              >
                <Pause size={14} /> Pause
              </Button>
            )}
            {canAdjustBid && onAdjustBid && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBidAdjustment}
              >
                <TrendingUp size={14} /> Adjust Bid
              </Button>
            )}
            {onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleAction('delete', onDelete)}
              >
                <Trash2 size={14} /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={showBidModal}
        onClose={() => setShowBidModal(false)}
        title="Adjust Bid"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Adjust bid for {selectedCount} selected {entityType}
          </p>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Adjustment Type
            </label>
            <select
              value={bidAdjustmentType}
              onChange={(e) => setBidAdjustmentType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="percent">Percentage (%)</option>
              <option value="absolute">Absolute ($)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              {bidAdjustmentType === 'percent' ? 'Percentage Change' : 'Absolute Change'}
            </label>
            <input
              type="number"
              value={bidAdjustment}
              onChange={(e) => setBidAdjustment(e.target.value)}
              placeholder={bidAdjustmentType === 'percent' ? 'e.g., 10 or -10' : 'e.g., 0.50 or -0.50'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              step={bidAdjustmentType === 'percent' ? '1' : '0.01'}
            />
            <p className="text-xs text-gray-500">
              {bidAdjustmentType === 'percent'
                ? 'Positive values increase bid, negative values decrease bid'
                : 'Positive values increase bid, negative values decrease bid'}
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowBidModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={applyBidAdjustment}
              disabled={!bidAdjustment || isNaN(parseFloat(bidAdjustment))}
            >
              Apply
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Action"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to perform this action?
          </p>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-900">
              {getActionPreview()}
            </div>
            {selectedItems && selectedItems.length > 0 && (
              <div className="mt-2 text-xs text-gray-600 max-h-40 overflow-y-auto">
                <div className="font-medium mb-1">Affected {entityType}:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {selectedItems.slice(0, 10).map((item, idx) => (
                    <li key={idx}>{item.name || item.id}</li>
                  ))}
                  {selectedItems.length > 10 && (
                    <li className="text-gray-500">
                      ... and {selectedItems.length - 10} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowConfirmModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmAction}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
