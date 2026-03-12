import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useFilterPersistence(storageKey, defaultFilters = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFiltersState] = useState(() => {
    // Priority: URL params > localStorage > defaults
    const urlFilters = {};
    let hasUrlFilters = false;

    for (const [key, value] of searchParams.entries()) {
      if (key !== 'campaigns' && key !== 'adgroups' && key !== 'page') {
        urlFilters[key] = value;
        hasUrlFilters = true;
      }
    }

    if (hasUrlFilters) {
      return { ...defaultFilters, ...urlFilters };
    }

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return { ...defaultFilters, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Failed to parse saved filters:', e);
    }

    return defaultFilters;
  });

  // Sync to localStorage
  useEffect(() => {
    try {
      const filtersToSave = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value !== '' && value !== null && value !== undefined)
      );
      if (Object.keys(filtersToSave).length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(filtersToSave));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (e) {
      console.error('Failed to save filters:', e);
    }
  }, [filters, storageKey]);

  // Sync to URL params (for sharing)
  const syncToUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams);

    // Preserve existing params like campaigns, adgroups, page
    const preservedParams = ['campaigns', 'adgroups', 'page'];
    const newParams = new URLSearchParams();

    preservedParams.forEach(key => {
      const value = params.get(key);
      if (value) newParams.set(key, value);
    });

    // Add filter params
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        newParams.set(key, value);
      }
    });

    setSearchParams(newParams);
  }, [filters, searchParams, setSearchParams]);

  const setFilters = useCallback((updates) => {
    setFiltersState(prev => {
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(defaultFilters);
    localStorage.removeItem(storageKey);

    // Clear URL params except preserved ones
    const params = new URLSearchParams(searchParams);
    const newParams = new URLSearchParams();
    const preservedParams = ['campaigns', 'adgroups', 'page'];

    preservedParams.forEach(key => {
      const value = params.get(key);
      if (value) newParams.set(key, value);
    });

    setSearchParams(newParams);
  }, [defaultFilters, storageKey, searchParams, setSearchParams]);

  const getActiveFilterCount = useCallback(() => {
    return Object.entries(filters).filter(([key, value]) => {
      // Exclude default values
      if (value === '' || value === null || value === undefined) return false;
      if (defaultFilters[key] === value) return false;
      return true;
    }).length;
  }, [filters, defaultFilters]);

  return {
    filters,
    setFilters,
    resetFilters,
    syncToUrl,
    activeFilterCount: getActiveFilterCount(),
  };
}
