import { useState, useEffect } from 'react';

const STORAGE_KEY = 'asa-scheduled-exports';

export const useScheduledExports = (pageKey) => {
  const [exports, setExports] = useState([]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const allExports = JSON.parse(stored);
        setExports(allExports.filter(exp => exp.pageKey === pageKey));
      } catch (e) {
        console.error('Failed to load scheduled exports:', e);
      }
    }
  }, [pageKey]);

  const saveExport = (exportConfig) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    let allExports = [];

    if (stored) {
      try {
        allExports = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse stored exports:', e);
      }
    }

    const newExport = {
      ...exportConfig,
      pageKey,
      createdAt: new Date().toISOString()
    };

    const existingIndex = allExports.findIndex(exp => exp.id === exportConfig.id);
    if (existingIndex >= 0) {
      allExports[existingIndex] = newExport;
    } else {
      allExports.push(newExport);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(allExports));
    setExports(allExports.filter(exp => exp.pageKey === pageKey));
  };

  const deleteExport = (exportId) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const allExports = JSON.parse(stored);
      const filtered = allExports.filter(exp => exp.id !== exportId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      setExports(filtered.filter(exp => exp.pageKey === pageKey));
    } catch (e) {
      console.error('Failed to delete export:', e);
    }
  };

  const toggleExport = (exportId) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    try {
      const allExports = JSON.parse(stored);
      const exportIndex = allExports.findIndex(exp => exp.id === exportId);
      if (exportIndex >= 0) {
        allExports[exportIndex].enabled = !allExports[exportIndex].enabled;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allExports));
        setExports(allExports.filter(exp => exp.pageKey === pageKey));
      }
    } catch (e) {
      console.error('Failed to toggle export:', e);
    }
  };

  return {
    exports,
    saveExport,
    deleteExport,
    toggleExport
  };
};
