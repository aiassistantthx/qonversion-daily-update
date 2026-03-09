import { useState, useRef, useEffect } from 'react';
import { Columns, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export function ColumnPicker({ columns, visibleColumns, onToggle, onReset }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Columns size={16} />
        Columns
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Show Columns</span>
              <button
                onClick={onReset}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {columns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns[column.id]}
                  onChange={() => onToggle(column.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">{column.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
