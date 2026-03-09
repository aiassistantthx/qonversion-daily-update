import { useQuery } from '@tanstack/react-query';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from './Table';
import { StatusBadge, Badge } from './Badge';
import { getRule } from '../lib/api';
import { Clock, CheckCircle, XCircle, AlertCircle, PlayCircle } from 'lucide-react';

function getStatusIcon(status) {
  switch (status) {
    case 'executed':
      return <CheckCircle size={14} className="text-green-500" />;
    case 'failed':
      return <XCircle size={14} className="text-red-500" />;
    case 'dry_run':
      return <PlayCircle size={14} className="text-blue-500" />;
    case 'skipped':
      return <AlertCircle size={14} className="text-yellow-500" />;
    default:
      return <Clock size={14} className="text-gray-400" />;
  }
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function RuleExecutionHistory({ ruleId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['rule', ruleId],
    queryFn: () => getRule(ruleId),
    enabled: !!ruleId,
  });

  const executions = data?.recentExecutions || [];

  if (isLoading) {
    return (
      <div className="text-center py-4 text-gray-500">
        Loading execution history...
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        No executions recorded yet
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h4 className="font-medium mb-3 flex items-center gap-2">
        <Clock size={16} />
        Execution History ({executions.length} recent)
      </h4>

      <div className="max-h-96 overflow-auto border rounded">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader className="w-10"></TableHeader>
              <TableHeader>Time</TableHeader>
              <TableHeader>Entity</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Action</TableHeader>
              <TableHeader>Changes</TableHeader>
              <TableHeader>Duration</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {executions.map((execution) => {
              const previousValue = execution.previous_value
                ? (typeof execution.previous_value === 'string' ? JSON.parse(execution.previous_value) : execution.previous_value)
                : null;
              const newValue = execution.new_value
                ? (typeof execution.new_value === 'string' ? JSON.parse(execution.new_value) : execution.new_value)
                : null;

              return (
                <TableRow key={execution.id} className="hover:bg-gray-50">
                  <TableCell>
                    {getStatusIcon(execution.status)}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                    {new Date(execution.executed_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs">
                        {execution.entity_type}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        #{execution.entity_id.toString().slice(-6)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={execution.status.toUpperCase()}
                      size="sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="info" className="text-xs">
                      {execution.action_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {execution.status === 'failed' ? (
                      <span className="text-xs text-red-600" title={execution.error_message}>
                        Error: {execution.error_message?.substring(0, 30)}...
                      </span>
                    ) : execution.status === 'skipped' ? (
                      <span className="text-xs text-gray-500">-</span>
                    ) : previousValue !== null && newValue !== null ? (
                      <span className="text-xs">
                        <span className="text-gray-400">{previousValue}</span>
                        {' → '}
                        <span className="font-medium">{newValue}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {formatDuration(execution.execution_duration_ms)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
