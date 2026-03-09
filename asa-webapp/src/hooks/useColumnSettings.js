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

  const [activePreset, setActivePreset] = useState(() => {
    return localStorage.getItem(`${storageKey}-preset`) || 'custom';
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(visibleColumns));
  }, [visibleColumns, storageKey]);

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
    setActivePreset('custom');
  };

  const applyPreset = (presetName, presetColumns) => {
    setVisibleColumns(presetColumns);
    setActivePreset(presetName);
  };

  return { visibleColumns, toggleColumn, resetToDefault, applyPreset, activePreset };
}
