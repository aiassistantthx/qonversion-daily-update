import { Card, CardHeader, CardTitle, CardContent } from '../Card';
import { Badge } from '../Badge';
import { Eye, CheckCircle, AlertCircle } from 'lucide-react';

export default function RulePreview({ rule, isValid }) {
  const formatCondition = (condition) => {
    return `${condition.metric.toUpperCase()} ${condition.operator} ${condition.value} (${condition.period})`;
  };

  const formatAction = () => {
    if (!rule.action_type) return 'No action selected';

    switch (rule.action_type) {
      case 'adjust_bid':
        return `Adjust bid by ${rule.action_params?.adjustmentValue || 0}% (Min: $${rule.action_params?.minBid || 0}, Max: $${rule.action_params?.maxBid || 0})`;
      case 'set_bid':
        return `Set bid to $${rule.action_params?.bidAmount || 0}`;
      case 'schedule_bid':
        return 'Apply scheduled bid multipliers (dayparting)';
      case 'pause':
        return 'Pause entity';
      case 'enable':
        return 'Enable entity';
      case 'send_alert':
        return `Send alert: "${rule.action_params?.message || 'No message'}"`;
      default:
        return rule.action_type;
    }
  };

  const getValidationIssues = () => {
    const issues = [];

    if (!rule.name || rule.name.trim() === '') {
      issues.push('Rule name is required');
    }

    if (!rule.conditions || rule.conditions.length === 0) {
      issues.push('At least one condition is required');
    } else {
      rule.conditions.forEach((c, i) => {
        if (!c.value || c.value === '') {
          issues.push(`Condition ${i + 1}: Value is required`);
        }
      });
    }

    if (!rule.action_type) {
      issues.push('Action type is required');
    } else if (rule.action_type === 'adjust_bid') {
      if (!rule.action_params?.adjustmentValue) {
        issues.push('Adjustment percentage is required');
      }
      if (!rule.action_params?.minBid) {
        issues.push('Min bid is required');
      }
      if (!rule.action_params?.maxBid) {
        issues.push('Max bid is required');
      }
    } else if (rule.action_type === 'set_bid') {
      if (!rule.action_params?.bidAmount) {
        issues.push('Bid amount is required');
      }
    } else if (rule.action_type === 'schedule_bid') {
      if (!rule.action_params?.schedule) {
        issues.push('Bid schedule is required');
      }
    }

    return issues;
  };

  const validationIssues = getValidationIssues();
  const isRuleValid = validationIssues.length === 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Eye size={18} />
            Rule Preview
          </CardTitle>
          {isRuleValid ? (
            <Badge variant="success" className="flex items-center gap-1">
              <CheckCircle size={12} />
              Valid
            </Badge>
          ) : (
            <Badge variant="error" className="flex items-center gap-1">
              <AlertCircle size={12} />
              Invalid
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Rule Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-sm text-blue-900 mb-3">
              {rule.name || 'Untitled Rule'}
            </h4>

            {rule.description && (
              <p className="text-sm text-blue-800 mb-3">{rule.description}</p>
            )}

            <div className="space-y-2 text-sm">
              {/* When */}
              <div>
                <span className="font-medium text-blue-900">WHEN:</span>
                <div className="ml-4 mt-1">
                  {!rule.conditions || rule.conditions.length === 0 ? (
                    <span className="text-blue-600 italic">No conditions</span>
                  ) : (
                    rule.conditions.map((condition, index) => (
                      <div key={index} className="flex items-center gap-2">
                        {index > 0 && (
                          <Badge variant={rule.conditions_logic === 'AND' ? 'info' : 'warning'} className="text-xs">
                            {rule.conditions_logic}
                          </Badge>
                        )}
                        <span className="text-blue-800 font-mono text-xs">
                          {formatCondition(condition)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Then */}
              <div>
                <span className="font-medium text-blue-900">THEN:</span>
                <div className="ml-4 mt-1">
                  <span className="text-blue-800">{formatAction()}</span>
                  {rule.action_type === 'schedule_bid' && rule.action_params?.schedule && (
                    <div className="mt-2 text-xs">
                      <div className="text-blue-600">Schedule configured: 7 days × 24 hours</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Settings */}
              <div className="pt-2 border-t border-blue-200">
                <div className="flex gap-4 text-xs text-blue-700">
                  <span>Scope: <strong>{rule.scope || 'keyword'}</strong></span>
                  <span>Frequency: <strong>{rule.frequency || 'daily'}</strong></span>
                  <span>Status: <strong>{rule.enabled ? 'Enabled' : 'Disabled'}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Validation Issues */}
          {!isRuleValid && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-sm text-red-900 mb-2 flex items-center gap-2">
                <AlertCircle size={16} />
                Validation Issues
              </h4>
              <ul className="space-y-1">
                {validationIssues.map((issue, index) => (
                  <li key={index} className="text-sm text-red-700 flex items-start gap-2">
                    <span className="text-red-400 mt-0.5">•</span>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* JSON View */}
          <details className="group">
            <summary className="text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900">
              View JSON
            </summary>
            <pre className="mt-2 text-xs bg-gray-800 text-gray-100 p-3 rounded overflow-x-auto">
              {JSON.stringify(rule, null, 2)}
            </pre>
          </details>
        </div>
      </CardContent>
    </Card>
  );
}
