import React from 'react';
import { useTheme, themes } from '../styles/themes';
import type { KeyboardShortcut } from '../hooks/useKeyboardShortcuts';

interface ShortcutsHelpModalProps {
  shortcuts: KeyboardShortcut[];
  onClose: () => void;
}

export function ShortcutsHelpModal({ shortcuts, onClose }: ShortcutsHelpModalProps) {
  const { theme } = useTheme();
  const currentTheme = themes[theme];

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick}>
      <div style={{ ...styles.modal, background: currentTheme.cardBg, borderColor: currentTheme.border }}>
        <div style={{ ...styles.header, borderColor: currentTheme.border }}>
          <h2 style={{ ...styles.title, color: currentTheme.text }}>Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            style={{ ...styles.closeButton, color: currentTheme.textMuted }}
            title="Close"
          >
            ✕
          </button>
        </div>
        <div style={styles.content}>
          {shortcuts.map((shortcut) => (
            <div key={shortcut.key} style={styles.shortcutRow}>
              <kbd style={{ ...styles.kbd, background: currentTheme.bg, color: currentTheme.text, borderColor: currentTheme.border }}>
                {shortcut.key === '?' ? 'Shift + ?' : shortcut.key.toUpperCase()}
              </kbd>
              <span style={{ ...styles.description, color: currentTheme.textMuted }}>
                {shortcut.description}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    width: '100%',
    maxWidth: 500,
    borderRadius: 12,
    border: '1px solid',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid',
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    padding: 0,
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    transition: 'opacity 0.2s',
  },
  content: {
    padding: 24,
  },
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  kbd: {
    padding: '6px 12px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'monospace',
    borderRadius: 6,
    border: '1px solid',
    minWidth: 80,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
  },
};
