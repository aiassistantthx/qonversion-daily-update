import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
}

interface UseKeyboardShortcutsOptions {
  onRefresh?: () => void;
  onShowHelp?: () => void;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleRefresh = useCallback(() => {
    if (options.onRefresh) {
      options.onRefresh();
    } else {
      window.location.reload();
    }
  }, [options]);

  const handleShowHelp = useCallback(() => {
    if (options.onShowHelp) {
      options.onShowHelp();
    }
  }, [options]);

  const shortcuts: KeyboardShortcut[] = [
    { key: 'r', description: 'Refresh data', action: handleRefresh },
    { key: '1', description: 'Overview tab', action: () => navigate('/dashboard/overview') },
    { key: '2', description: 'Marketing tab', action: () => navigate('/dashboard/marketing') },
    { key: '3', description: 'Cohorts tab', action: () => navigate('/dashboard/cohorts') },
    { key: '4', description: 'Forecast tab', action: () => navigate('/dashboard/forecast') },
    { key: '?', description: 'Show shortcuts help', action: handleShowHelp },
  ];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Handle '?' with shift key
      if (event.key === '?' && event.shiftKey) {
        event.preventDefault();
        handleShowHelp();
        return;
      }

      // Handle other shortcuts (lowercase only)
      const key = event.key.toLowerCase();
      const shortcut = shortcuts.find(s => s.key === key && s.key !== '?');

      if (shortcut) {
        event.preventDefault();
        shortcut.action();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, location, handleRefresh, handleShowHelp]);

  return shortcuts;
}
