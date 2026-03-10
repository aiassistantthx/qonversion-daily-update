import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api } from '../api';
import { PaybackGauge } from './PaybackGauge';

const COLORS = ['#00d4ff', '#00ff88', '#a371f7', '#ffcc00', '#ff4444', '#ff88aa'];

export function PaybackAnalysis() {
  const { data: paybackData } = useQuery({
    queryKey: ['payback'],
    queryFn: () => api.getPayback(6),
    refetchInterval: 60000,
  });

  // Transform payback data for chart
  const chartData: Record<number, Record<string, number>> = {};
  paybackData?.payback.forEach((cohort) => {
    cohort.curve.forEach((point) => {
      if (!chartData[point.day]) {
        chartData[point.day] = { day: point.day };
      }
      chartData[point.day][cohort.cohortMonth] = point.paybackPercent;
    });
  });

  const chartDataArray = Object.values(chartData).sort((a, b) => a.day - b.day);

  // Find break-even days for each cohort
  const breakEvenDays = paybackData?.payback.map(cohort => {
    const breakEvenPoint = cohort.curve.find(p => p.paybackPercent >= 100);
    return {
      cohort: cohort.cohortMonth,
      days: breakEvenPoint?.day || null,
      currentPercent: cohort.curve[cohort.curve.length - 1]?.paybackPercent || 0
    };
  }) || [];

  // Calculate average CAC and LTV
  const avgCac = paybackData?.payback.length
    ? paybackData.payback.reduce((sum, c) => sum + c.cac, 0) / paybackData.payback.length
    : 0;

  const avgLtv = paybackData?.payback.length
    ? paybackData.payback.reduce((sum, c) => {
        const maxRev = Math.max(...c.curve.map(p => p.revenuePerUser));
        return sum + maxRev;
      }, 0) / paybackData.payback.length
    : 0;

  const ltvCacRatio = avgCac > 0 ? avgLtv / avgCac : 0;

  // Calculate overall payback progress (average of most recent cohorts)
  const recentCohorts = paybackData?.payback.slice(0, 3) || [];
  const avgCurrentPercent = recentCohorts.length > 0
    ? recentCohorts.reduce((sum, c) => sum + (c.curve[c.curve.length - 1]?.paybackPercent || 0), 0) / recentCohorts.length
    : 0;

  const avgBreakEvenDay = breakEvenDays.filter(b => b.days !== null).length > 0
    ? Math.round(breakEvenDays.filter(b => b.days !== null).reduce((sum, b) => sum + (b.days || 0), 0) / breakEvenDays.filter(b => b.days !== null).length)
    : null;

  const mostRecentCohortDate = paybackData?.payback[0]?.cohortMonth;

  if (!paybackData || !paybackData.payback || paybackData.payback.length === 0) {
    return null;
  }

  const hasValidData = avgCac > 0 && avgLtv > 0 && ltvCacRatio > 0;

  if (!hasValidData) {
    return null;
  }

  return (
    <div className="border-t-2 border-terminal-border pt-6 mt-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-terminal-text mb-1">Payback Analysis</h2>
        <p className="text-sm text-terminal-muted mb-3">
          Track CAC recovery and LTV/CAC ratio by cohort
        </p>
      </div>

      {/* Payback curves */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
        <div className="text-sm text-terminal-muted mb-4">Payback Curves by Cohort</div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataArray}>
              <XAxis
                dataKey="day"
                stroke="#8b949e"
                fontSize={12}
                tickLine={false}
                label={{ value: 'Days', position: 'bottom', fill: '#8b949e', fontSize: 12 }}
              />
              <YAxis
                stroke="#8b949e"
                fontSize={12}
                tickLine={false}
                tickFormatter={(val) => `${val}%`}
                domain={[0, 'dataMax + 20']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  color: '#e6edf3'
                }}
                formatter={(value) => [`${Number(value)?.toFixed(1) || 0}%`, 'Payback']}
                labelFormatter={(label) => `Day ${label}`}
              />
              <ReferenceLine y={100} stroke="#ffcc00" strokeDasharray="5 5" label={{
                value: 'Break-even',
                position: 'right',
                fill: '#ffcc00',
                fontSize: 10
              }} />
              {paybackData.payback.map((cohort, i) => (
                <Line
                  key={cohort.cohortMonth}
                  type="monotone"
                  dataKey={cohort.cohortMonth}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={cohort.cohortMonth}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-2">Avg CAC</div>
          <div className="text-2xl font-mono text-terminal-text">
            ${avgCac.toFixed(2)}
          </div>
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-2">Avg LTV</div>
          <div className="text-2xl font-mono text-terminal-text">
            ${avgLtv.toFixed(2)}
          </div>
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-2">LTV/CAC</div>
          <div className={`text-2xl font-mono ${ltvCacRatio >= 3 ? 'text-terminal-green' : ltvCacRatio >= 2 ? 'text-terminal-yellow' : 'text-terminal-red'}`}>
            {ltvCacRatio.toFixed(2)}x
          </div>
          <div className="text-xs text-terminal-muted mt-1">
            Target: &gt;3x
          </div>
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-2">Avg Break-even</div>
          <div className="text-2xl font-mono text-terminal-cyan">
            {breakEvenDays.filter(b => b.days !== null).length > 0
              ? `${Math.round(breakEvenDays.filter(b => b.days !== null).reduce((sum, b) => sum + (b.days || 0), 0) / breakEvenDays.filter(b => b.days !== null).length)} days`
              : '—'}
          </div>
        </div>

        <PaybackGauge
          currentPercent={avgCurrentPercent}
          breakEvenDay={avgBreakEvenDay}
          targetDays={60}
          cohortStartDate={mostRecentCohortDate}
        />
      </div>

      {/* Break-even table */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border">
          <div className="text-sm text-terminal-muted">Payback by Cohort</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-terminal-muted border-b border-terminal-border">
                <th className="text-left px-4 py-2 font-medium">Cohort</th>
                <th className="text-right px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">CAC</th>
                <th className="text-right px-4 py-2 font-medium">Break-even</th>
                <th className="text-right px-4 py-2 font-medium">Current %</th>
                <th className="text-left px-4 py-2 font-medium">Progress</th>
              </tr>
            </thead>
            <tbody>
              {paybackData.payback.map((cohort, i) => {
                const beData = breakEvenDays.find(b => b.cohort === cohort.cohortMonth);
                const isBreakEven = beData && beData.currentPercent >= 100;

                return (
                  <tr key={cohort.cohortMonth} className="border-b border-terminal-border/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        <span className="font-mono text-terminal-text">{cohort.cohortMonth}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-muted">
                      {cohort.cohortSize}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      ${cohort.cac.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      {beData?.days ? `${beData.days}d` : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${isBreakEven ? 'text-terminal-green' : 'text-terminal-text'}`}>
                      {beData?.currentPercent.toFixed(0)}%
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-terminal-border rounded overflow-hidden max-w-[120px]">
                          <div
                            className={`h-full transition-all ${isBreakEven ? 'bg-terminal-green' : 'bg-terminal-cyan'}`}
                            style={{ width: `${Math.min(100, beData?.currentPercent || 0)}%` }}
                          />
                        </div>
                        {isBreakEven && (
                          <span className="text-xs text-terminal-green">Paid back</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
