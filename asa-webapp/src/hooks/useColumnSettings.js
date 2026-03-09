import { useState, useEffect } from 'react';

export function useColumnSettings(storageKey, defaultColumns, defaultColumnOrder = null) {
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

  const [columnOrder, setColumnOrder] = useState(() => {
    const stored = localStorage.getItem(`${storageKey}-order`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return defaultColumnOrder || Object.keys(defaultColumns);
      }
    }
    return defaultColumnOrder || Object.keys(defaultColumns);
  });

  const [activePreset, setActivePreset] = useState(() => {
    return localStorage.getItem(`${storageKey}-preset`) || 'custom';
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
  }, [visibleColumns, storageKey]);

  useEffect(() => {
    localStorage.setItem(`${storageKey}-order`, JSON.stringify(columnOrder));
  }, [columnOrder, storageKey]);

  useEffect(() => {
    localStorage.setItem(`${storageKey}-preset`, activePreset);
  }, [activePreset, storageKey]);

  const toggleColumn = (columnId) => {
    setVisibleColumns(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
    setActivePreset('custom');
  };

  const resetToDefault = () => {
    setVisibleColumns(defaultColumns);
    setColumnOrder(defaultColumnOrder || Object.keys(defaultColumns));
    setActivePreset('custom');
  };

  const applyPreset = (presetName, presetColumns) => {
    setVisibleColumns(presetColumns);
    setActivePreset(presetName);
  };

  const reorderColumns = (fromIndex, toIndex) => {
    const newOrder = [...columnOrder];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    setColumnOrder(newOrder);
    setActivePreset('custom');
  };

  return { visibleColumns, columnOrder, toggleColumn, resetToDefault, applyPreset, activePreset, reorderColumns };
}
