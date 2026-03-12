import { useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';
import { BottomSheet } from './BottomSheet';
import { StickyActionBar } from './StickyActionBar';
import { ConfirmDialog } from './ConfirmDialog';
import { useIsMobile } from '../hooks/useIsMobile';
import { Play, Pause, TrendingUp, Trash2, MoreHorizontal } from 'lucide-react';

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
  isLoading = false,
}) {
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidAdjustment, setBidAdjustment] = useState('');
  const [bidAdjustmentType, setBidAdjustmentType] = useState('percent');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const isMobile = useIsMobile();

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

  const getActionMessage = () => {
    if (!pendingAction) return '';

    const action = pendingAction.action;

    switch (action) {
      case 'pause':
        return 'Pause selected items?';
      case 'enable':
        return 'Enable selected items?';
      case 'delete':
        return 'Delete selected items? This cannot be undone.';
      default:
        return 'Apply this action?';
    }
  };

  const getActionTitle = () => {
    if (!pendingAction) return 'Confirm Action';

    switch (pendingAction.action) {
      case 'pause':
        return 'Pause Items';
      case 'enable':
        return 'Enable Items';
      case 'delete':
        return 'Delete Items';
      default:
        return 'Confirm Action';
    }
  };

  if (selectedCount === 0) return null;

  const ModalComponent = isMobile ? BottomSheet : Modal;

  // Mobile view
  if (isMobile) {
    return (
      <>
        <StickyActionBar show={selectedCount > 0}>
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-900">
              {selectedCount} {entityType}
            </div>
            <button
              onClick={onDeselectAll}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Deselect all
            </button>
          </div>
          <Button
            size="sm"
            onClick={() => setShowMobileMenu(true)}
          >
            <MoreHorizontal size={16} /> Actions
          </Button>
        </StickyActionBar>

        <BottomSheet
          open={showMobileMenu}
          onClose={() => setShowMobileMenu(false)}
          title="Bulk Actions"
        >
          <div className="space-y-2">
            {onEnable && (
              <Button
                variant="success"
                className="w-full"
                onClick={() => {
                  setShowMobileMenu(false);
                  handleAction('enable', onEnable);
                }}
                loading={isLoading}
              >
                <Play size={16} /> Enable
              </Button>
            )}
            {onPause && (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  setShowMobileMenu(false);
                  handleAction('pause', onPause);
                }}
                loading={isLoading}
              >
                <Pause size={16} /> Pause
              </Button>
            )}
            {canAdjustBid && onAdjustBid && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setShowMobileMenu(false);
                  handleBidAdjustment();
                }}
                loading={isLoading}
              >
                <TrendingUp size={16} /> Adjust Bid
              </Button>
            )}
            {onDelete && (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  setShowMobileMenu(false);
                  handleAction('delete', onDelete);
                }}
                loading={isLoading}
              >
                <Trash2 size={16} /> Delete
              </Button>
            )}
          </div>
        </BottomSheet>
      </>
    );
  }

  // Desktop view
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
                loading={isLoading}
              >
                <Play size={14} /> Enable
              </Button>
            )}
            {onPause && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleAction('pause', onPause)}
                loading={isLoading}
              >
                <Pause size={14} /> Pause
              </Button>
            )}
            {canAdjustBid && onAdjustBid && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleBidAdjustment}
                loading={isLoading}
              >
                <TrendingUp size={14} /> Adjust Bid
              </Button>
            )}
            {onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleAction('delete', onDelete)}
                loading={isLoading}
              >
                <Trash2 size={14} /> Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <ModalComponent
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
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={applyBidAdjustment}
              disabled={!bidAdjustment || isNaN(parseFloat(bidAdjustment))}
              loading={isLoading}
            >
              Apply
            </Button>
          </div>
        </div>
      </ModalComponent>

      <ConfirmDialog
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmAction}
        title={getActionTitle()}
        message={getActionMessage()}
        confirmText={pendingAction?.action === 'delete' ? 'Delete' : 'Confirm'}
        variant={pendingAction?.action === 'delete' || pendingAction?.action === 'pause' ? 'destructive' : 'default'}
        items={selectedItems || []}
        itemLabel={entityType}
        isLoading={isLoading}
      />
    </>
  );
}
