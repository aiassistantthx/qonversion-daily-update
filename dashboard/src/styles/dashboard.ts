import type { CSSProperties } from 'react';

// Shared color palette
export const colors = {
  primary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',

  text: '#111827',
  textMuted: '#6b7280',
  textLight: '#9ca3af',

  bg: '#f9fafb',
  cardBg: '#fff',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
};

// Shared styles for all dashboard pages
export const dashboardStyles: Record<string, CSSProperties> = {
  container: {
    padding: 24,
    fontFamily: "'Inter', -apple-system, sans-serif",
    minHeight: '100vh',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: colors.text,
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    maxWidth: 600,
  },

  // Action buttons
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: colors.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  secondaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    background: colors.borderLight,
    color: colors.textMuted,
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },

  // Metrics grid
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 24,
  },
  metricsGrid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 16,
    marginBottom: 24,
  },

  // Metric cards
  metricCard: {
    background: colors.cardBg,
    borderRadius: 12,
    padding: 20,
    border: `1px solid ${colors.border}`,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: 500,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
  },
  metricValue: {
    fontSize: 28,
    fontWeight: 700,
    color: colors.text,
    marginBottom: 4,
  },
  metricSub: {
    fontSize: 12,
    color: colors.textLight,
  },

  // Cards
  card: {
    background: colors.cardBg,
    borderRadius: 12,
    padding: 24,
    border: `1px solid ${colors.border}`,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 16,
  },

  // Grid layouts
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24,
    marginBottom: 24,
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 24,
    marginBottom: 24,
  },

  // Tables
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 13,
  },
  th: {
    textAlign: 'left' as const,
    padding: '12px 16px',
    fontSize: 11,
    fontWeight: 600,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.borderLight,
  },
  td: {
    padding: '12px 16px',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.text,
  },

  // Chart container
  chartContainer: {
    height: 350,
    marginBottom: 16,
  },
  chartContainerSmall: {
    height: 250,
  },

  // Filters
  filterRow: {
    display: 'flex',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap' as const,
  },
  select: {
    padding: '8px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    fontSize: 14,
    background: colors.cardBg,
    color: colors.text,
    cursor: 'pointer',
  },

  // Loading state
  loading: {
    padding: 40,
    textAlign: 'center' as const,
    color: colors.textMuted,
  },

  // Empty state
  empty: {
    padding: 40,
    textAlign: 'center' as const,
    color: colors.textMuted,
    background: colors.borderLight,
    borderRadius: 12,
  },
};

// Helper to merge styles
export const mergeStyles = (...styles: (CSSProperties | undefined)[]): CSSProperties => {
  return Object.assign({}, ...styles.filter(Boolean));
};
