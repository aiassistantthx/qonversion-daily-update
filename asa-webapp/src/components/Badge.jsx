const variants = {
  default: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
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
