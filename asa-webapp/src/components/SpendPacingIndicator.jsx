import { Clock, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export function SpendPacingIndicator({ spend, budget, currentHour = new Date().getHours() }) {
  if (!budget || budget <= 0) {
    return <span className="text-xs text-gray-400">No budget</span>;
  }

  const spendAmount = parseFloat(spend || 0);
  const budgetAmount = parseFloat(budget);

  const percentOfDayPassed = Math.min(100, (currentHour / 24) * 100);
  const percentOfBudgetSpent = Math.min(100, (spendAmount / budgetAmount) * 100);

  const pacingDiff = percentOfBudgetSpent - percentOfDayPassed;

  let status;
  let statusClass;
  let Icon;
  let recommendation;
  let forecast;

  if (Math.abs(pacingDiff) < 5) {
    status = 'On track';
    statusClass = 'text-green-600 bg-green-50';
    Icon = Minus;
    recommendation = null;
  } else if (pacingDiff > 0) {
    status = 'Overspend';
    statusClass = 'text-red-600 bg-red-50';
    Icon = TrendingUp;

    const projectedSpend = (spendAmount / percentOfDayPassed) * 100;
    const exhaustHour = Math.floor((budgetAmount / spendAmount) * currentHour);

    if (percentOfBudgetSpent < 100 && exhaustHour < 24) {
      const exhaustTime = exhaustHour > 12
        ? `${exhaustHour - 12}PM`
        : `${exhaustHour === 0 ? 12 : exhaustHour}AM`;
      forecast = `Will exhaust by ${exhaustTime}`;
    } else if (percentOfBudgetSpent >= 100) {
      forecast = 'Budget exhausted';
    } else {
      forecast = `Projected: $${projectedSpend.toFixed(2)}`;
    }

    recommendation = 'Consider increasing budget';
  } else {
    status = 'Underspend';
    statusClass = 'text-orange-600 bg-orange-50';
    Icon = TrendingDown;

    const projectedSpend = (spendAmount / percentOfDayPassed) * 100;
    forecast = `Projected: $${projectedSpend.toFixed(2)}`;
    recommendation = 'Consider increasing bid or budget';
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusClass}`}>
        <Icon size={12} />
        <span>{status}</span>
      </div>

      <div className="text-xs text-gray-600 space-y-0.5">
        <div className="flex items-center gap-1">
          <Clock size={10} className="opacity-50" />
          <span>{percentOfBudgetSpent.toFixed(0)}% spent vs {percentOfDayPassed.toFixed(0)}% of day</span>
        </div>

        {forecast && (
          <div className="text-xs opacity-75">{forecast}</div>
        )}

        {recommendation && (
          <div className="text-xs italic opacity-75">{recommendation}</div>
        )}
      </div>
    </div>
  );
}
