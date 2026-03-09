import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSyncStatus, triggerSync } from '../lib/api';
import {
  RefreshCw,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';

function formatTimeAgo(date) {
  if (!date) return 'Never';

  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return then.toLocaleDateString();
}

export function SyncStatus() {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { data: syncStatus, isLoading } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: getSyncStatus,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const syncMutation = useMutation({
    mutationFn: (days) => triggerSync(days),
    onSuccess: () => {
      queryClient.invalidateQueries(['syncStatus']);
      // Also invalidate campaigns data after sync
      queryClient.invalidateQueries(['campaigns']);
    },
  });

  const getStatusIcon = () => {
    if (syncMutation.isPending || syncStatus?.status === 'syncing') {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    if (syncStatus?.status === 'error') {
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    }
    return <Check className="w-4 h-4 text-green-400" />;
  };

  const getStatusText = () => {
    if (syncMutation.isPending || syncStatus?.status === 'syncing') {
      return 'Syncing...';
    }
    return formatTimeAgo(syncStatus?.lastSync);
  };

  const handleSync = () => {
    if (!syncMutation.isPending && syncStatus?.status !== 'syncing') {
      syncMutation.mutate(7);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleSync}
        disabled={syncMutation.isPending || syncStatus?.status === 'syncing'}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-sm ${
          syncMutation.isPending || syncStatus?.status === 'syncing'
            ? 'bg-blue-600 cursor-wait'
            : 'bg-gray-800 hover:bg-gray-700'
        }`}
      >
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span>Sync Data</span>
        </div>
        <span className="text-xs text-gray-400">{getStatusText()}</span>
      </button>

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-gray-400"
      >
        {expanded ? (
          <>
            Hide details <ChevronUp className="w-3 h-3" />
          </>
        ) : (
          <>
            Show details <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {expanded && (
        <div className="space-y-2 text-xs">
          {/* Quick stats */}
          <div className="bg-gray-800 rounded-lg p-2 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Last data:</span>
              <span>{syncStatus?.lastDataDate || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Campaigns:</span>
              <span>{syncStatus?.campaignsSynced || 0}</span>
            </div>
          </div>

          {/* Sync history */}
          {syncStatus?.history?.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-2 space-y-1">
              <p className="text-gray-400 mb-1">Recent syncs:</p>
              {syncStatus.history.slice(0, 5).map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-gray-300">
                  {item.status === 'success' ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : item.status === 'error' ? (
                    <AlertCircle className="w-3 h-3 text-red-400" />
                  ) : (
                    <Clock className="w-3 h-3 text-yellow-400" />
                  )}
                  <span className="flex-1 truncate">{item.change_type}</span>
                  <span className="text-gray-500">
                    {formatTimeAgo(item.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Manual sync options */}
          <div className="flex gap-1">
            <button
              onClick={() => syncMutation.mutate(1)}
              disabled={syncMutation.isPending}
              className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-center disabled:opacity-50"
            >
              1 day
            </button>
            <button
              onClick={() => syncMutation.mutate(7)}
              disabled={syncMutation.isPending}
              className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-center disabled:opacity-50"
            >
              7 days
            </button>
            <button
              onClick={() => syncMutation.mutate(30)}
              disabled={syncMutation.isPending}
              className="flex-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-center disabled:opacity-50"
            >
              30 days
            </button>
          </div>

          {syncMutation.error && (
            <div className="text-red-400 text-xs">
              Error: {syncMutation.error.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
