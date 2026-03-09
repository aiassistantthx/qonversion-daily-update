import { useState, useEffect } from 'react';

export function useColumnSettings(storageKey, defaultColumns) {
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return defaultColumns;
      }
    }
    return defaultColumns;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
  }, [visibleColumns, storageKey]);

  const toggleColumn = (columnId) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  const resetToDefault = () => {
    setVisibleColumns(defaultColumns);
  };

  return { visibleColumns, toggleColumn, resetToDefault };
}
