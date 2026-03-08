import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api } from '../api';

const COLORS = ['#00d4ff', '#00ff88', '#a371f7', '#ffcc00', '#ff4444', '#ff88aa'];

export function ForecastDashboard() {
  const { data: paybackData } = useQuery({
    queryKey: ['payback'],
    queryFn: () => api.getPayback(6),
    refetchInterval: 60000,
  });

  // Health data available if needed
  // const { data: health } = useQuery({
  //   queryKey: ['health'],
  //   queryFn: api.getHealth,
  //   refetchInterval: 60000,
  // });

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

  return (
    <div className="p-6 space-y-6">
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
              {paybackData?.payback.map((cohort, i) => (
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
      <div className="grid grid-cols-4 gap-4">
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
              {paybackData?.payback.map((cohort, i) => {
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

      {/* Scenario modeling placeholder */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
        <div className="text-sm text-terminal-muted mb-4">Scenario Projections</div>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-terminal-border/30 rounded">
            <div className="text-xs text-terminal-muted mb-1">Base Case</div>
            <div className="text-lg font-mono text-terminal-text">
              ${((avgLtv * (paybackData?.payback.reduce((sum, c) => sum + c.cohortSize, 0) || 0)) / 1000).toFixed(0)}k
            </div>
            <div className="text-xs text-terminal-muted">Annual revenue</div>
          </div>
          <div className="p-3 bg-terminal-green/10 rounded border border-terminal-green/30">
            <div className="text-xs text-terminal-green mb-1">Optimistic (+20%)</div>
            <div className="text-lg font-mono text-terminal-green">
              ${((avgLtv * 1.2 * (paybackData?.payback.reduce((sum, c) => sum + c.cohortSize, 0) || 0)) / 1000).toFixed(0)}k
            </div>
            <div className="text-xs text-terminal-muted">If COP drops to $30</div>
          </div>
          <div className="p-3 bg-terminal-red/10 rounded border border-terminal-red/30">
            <div className="text-xs text-terminal-red mb-1">Pessimistic (-15%)</div>
            <div className="text-lg font-mono text-terminal-red">
              ${((avgLtv * 0.85 * (paybackData?.payback.reduce((sum, c) => sum + c.cohortSize, 0) || 0)) / 1000).toFixed(0)}k
            </div>
            <div className="text-xs text-terminal-muted">If churn +5%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
