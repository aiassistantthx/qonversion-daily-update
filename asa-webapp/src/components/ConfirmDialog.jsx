import { Modal } from './Modal';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { useIsMobile } from '../hooks/useIsMobile';
import { AlertTriangle } from 'lucide-react';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default', // 'default' or 'destructive'
  items = [], // Array of items that will be affected
  itemLabel = 'items', // Label for items (e.g., 'keywords', 'campaigns')
  showDontAskAgain = false,
  onDontAskAgainChange,
  isLoading = false,
}) {
  const isMobile = useIsMobile();
  const ModalComponent = isMobile ? BottomSheet : Modal;

  const isDestructive = variant === 'destructive';

  return (
    <ModalComponent
      open={open}
      onClose={onClose}
      title={title}
      size="md"
    >
      <div className="space-y-4">
        {/* Message */}
        {message && (
          <p className="text-sm text-gray-600">
            {message}
          </p>
        )}

        {/* Items Preview */}
        {items && items.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div className="text-sm font-medium text-gray-900 mb-2">
              {items.length} {itemLabel} will be affected:
            </div>
            <div className="max-h-40 overflow-y-auto">
              <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                {items.slice(0, 10).map((item, idx) => (
                  <li key={idx} className="truncate">
                    {typeof item === 'string' ? item : item.name || item.id}
                  </li>
                ))}
                {items.length > 10 && (
                  <li className="text-gray-500 font-medium">
                    ... and {items.length - 10} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Destructive warning */}
        {isDestructive && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">
              This action cannot be undone.
            </p>
          </div>
        )}

        {/* Don't ask again checkbox */}
        {showDontAskAgain && onDontAskAgainChange && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              onChange={(e) => onDontAskAgainChange(e.target.checked)}
              className="rounded border-gray-300"
            />
            Don't ask again
          </label>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2 border-t">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </ModalComponent>
  );
}
