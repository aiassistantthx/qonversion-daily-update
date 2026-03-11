const variants = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  success: 'bg-status-success-bg text-status-success-text dark:bg-status-success-dark-bg dark:text-status-success-dark-text',
  warning: 'bg-status-warning-bg text-status-warning-text dark:bg-status-warning-dark-bg dark:text-status-warning-dark-text',
  error: 'bg-status-error-bg text-status-error-text dark:bg-status-error-dark-bg dark:text-status-error-dark-text',
  info: 'bg-status-info-bg text-status-info-text dark:bg-status-info-dark-bg dark:text-status-info-dark-text',
};

export function Badge({ children, variant = 'default', className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  const statusVariants = {
    ENABLED: 'success',
    ACTIVE: 'success',
    PAUSED: 'warning',
    DELETED: 'error',
    executed: 'success',
    dry_run: 'info',
    failed: 'error',
    skipped: 'warning',
  };

  return (
    <Badge variant={statusVariants[status] || 'default'}>
      {status}
    </Badge>
  );
}

export function DeliveryStatusBadge({ status }) {
  const statusVariants = {
    RUNNING: 'success',
    PAUSED: 'warning',
    ENDED: 'default',
    COMPLETED: 'default',
    BUDGET_EXHAUSTED: 'error',
    CAMPAIGN_NOT_STARTED: 'info',
    ARCHIVED: 'default',
    ON_HOLD: 'warning',
  };

  const displayLabels = {
    RUNNING: 'Running',
    PAUSED: 'Paused',
    ENDED: 'Ended',
    COMPLETED: 'Completed',
    BUDGET_EXHAUSTED: 'Budget Exhausted',
    CAMPAIGN_NOT_STARTED: 'Not Started',
    ARCHIVED: 'Archived',
    ON_HOLD: 'On Hold',
  };

  return (
    <Badge variant={statusVariants[status] || 'default'}>
      {displayLabels[status] || status}
    </Badge>
  );
}
