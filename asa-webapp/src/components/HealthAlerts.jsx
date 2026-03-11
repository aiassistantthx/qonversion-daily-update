import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Badge } from './Badge';
import { getAlerts, acknowledgeAlert } from '../lib/api';
import { AlertTriangle, AlertCircle, Info, XCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';

const severityConfig = {
  critical: {
    icon: XCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badge: 'error'
  },
  error: {
    icon: AlertCircle,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badge: 'error'
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    badge: 'warning'
  },
  info: {
    icon: Info,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    badge: 'info'
  }
};

function AlertItem({ alert, onAcknowledge }) {
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const config = severityConfig[alert.severity] || severityConfig.info;
  const Icon = config.icon;

  const handleAcknowledge = async () => {
    if (alert.acknowledged) return;

    setIsAcknowledging(true);
    try {
      await onAcknowledge(alert.id);
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    } finally {
      setIsAcknowledging(false);
    }
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border ${config.borderColor} ${config.bgColor} ${
        alert.acknowledged ? 'opacity-50' : ''
      }`}
    >
      <Icon className={`h-5 w-5 ${config.color} flex-shrink-0 mt-0.5`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm font-medium ${config.color}`}>
            {alert.title || alert.alert_type}
          </span>
          <Badge status={config.badge} />
        </div>

        <p className="text-sm text-gray-700 mb-1">{alert.message}</p>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{new Date(alert.created_at).toLocaleString()}</span>
          {alert.campaign_id && <span>Campaign ID: {alert.campaign_id}</span>}
        </div>
      </div>

      {!alert.acknowledged && (
        <button
          onClick={handleAcknowledge}
          disabled={isAcknowledging}
          className="flex-shrink-0 px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          {isAcknowledging ? 'Acknowledging...' : 'Acknowledge'}
        </button>
      )}

      {alert.acknowledged && (
        <div className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
          <CheckCircle className="h-4 w-4" />
          <span>Acknowledged</span>
        </div>
      )}
    </div>
  );
}

export default function HealthAlerts({ limit = 10, showTitle = true }) {
  const { data: alertsData, isLoading, refetch } = useQuery({
    queryKey: ['alerts', { limit, acknowledged: false }],
    queryFn: () => getAlerts({ limit, acknowledged: false }),
    refetchInterval: 60000 // Refresh every minute
  });

  const alerts = alertsData?.data || [];

  const handleAcknowledge = async (alertId) => {
    await acknowledgeAlert(alertId);
    refetch();
  };

  if (isLoading) {
    return (
      <Card>
        {showTitle && (
          <CardHeader>
            <CardTitle>Health Alerts</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-gray-500 text-sm">Loading alerts...</p>
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card>
        {showTitle && (
          <CardHeader>
            <CardTitle>Health Alerts</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <p className="text-sm font-medium">All systems healthy - no active alerts</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {showTitle && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Health Alerts</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-500">
                {alerts.length} active {alerts.length === 1 ? 'alert' : 'alerts'}
              </span>
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent>
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
