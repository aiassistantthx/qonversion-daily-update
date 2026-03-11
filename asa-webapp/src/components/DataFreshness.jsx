import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSyncStatus, triggerSync } from '../lib/api';
import { RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from './Badge';

function formatTimeAgo(date) {
  if (!date) return 'Never';

  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return then.toLocaleDateString();
}

export function DataFreshness() {
  const queryClient = useQueryClient();

  const { data: syncStatus } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: getSyncStatus,
    refetchInterval: 30000,
  });

  const syncMutation = useMutation({
    mutationFn: (days) => triggerSync(days),
    onSuccess: () => {
      queryClient.invalidateQueries(['syncStatus']);
      queryClient.invalidateQueries(['campaigns']);
    },
  });

  const handleRefresh = () => {
    if (!syncMutation.isPending && syncStatus?.status !== 'syncing') {
      syncMutation.mutate(7);
    }
  };

  const getFreshnessStatus = () => {
    if (!syncStatus?.lastSync) return 'critical';
    const diffMs = new Date() - new Date(syncStatus.lastSync);
    const diffHours = diffMs / 3600000;

    if (diffHours > 24) return 'critical';
    if (diffHours > 1) return 'warning';
    return 'fresh';
  };

  const isSyncing = syncMutation.isPending || syncStatus?.status === 'syncing';
  const freshnessStatus = getFreshnessStatus();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Last sync: {formatTimeAgo(syncStatus?.lastSync)}
        </span>
      </div>

      {freshnessStatus === 'warning' && (
        <Badge variant="warning" className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Data older than 1 hour
        </Badge>
      )}

      {freshnessStatus === 'critical' && (
        <Badge variant="error" className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Data older than 24 hours
        </Badge>
      )}

      <button
        onClick={handleRefresh}
        disabled={isSyncing}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          isSyncing
            ? 'bg-blue-600 text-white cursor-wait'
            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
        }`}
        title="Sync data from Apple Search Ads"
      >
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        {isSyncing ? 'Syncing...' : 'Sync'}
      </button>
    </div>
  );
}
