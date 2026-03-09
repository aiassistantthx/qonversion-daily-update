import { Modal } from './Modal';

const shortcuts = [
  {
    category: 'Navigation',
    items: [
      { keys: ['⌘/Ctrl', '1'], description: 'Go to Dashboard' },
      { keys: ['⌘/Ctrl', '2'], description: 'Go to Campaigns' },
      { keys: ['⌘/Ctrl', '3'], description: 'Go to Ad Groups' },
      { keys: ['⌘/Ctrl', '4'], description: 'Go to Keywords' },
      { keys: ['⌘/Ctrl', '5'], description: 'Go to Search Terms' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: ['⌘/Ctrl', 'K'], description: 'Focus search' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close modals' },
    ],
  },
];

export function ShortcutsHelp({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts" size="md">
      <div className="space-y-6">
        {shortcuts.map((section) => (
          <div key={section.category}>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              {section.category}
            </h4>
            <div className="space-y-2">
              {section.items.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 px-3 rounded bg-gray-50 dark:bg-gray-800"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {item.description}
                  </span>
                  <div className="flex items-center gap-1">
                    {item.keys.map((key, i) => (
                      <span key={i}>
                        <kbd className="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm">
                          {key}
                        </kbd>
                        {i < item.keys.length - 1 && (
                          <span className="mx-1 text-gray-400">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
