import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../api';

const COLORS = ['#00d4ff', '#00ff88', '#a371f7', '#ffcc00', '#ff4444', '#ff88aa'];

export function CohortsDashboard() {
  const { data: cohortsData } = useQuery({
    queryKey: ['cohorts'],
    queryFn: () => api.getCohorts(6),
    refetchInterval: 60000,
  });

  // Transform cohort data for chart
  const chartData: Record<number, Record<string, number>> = {};
  cohortsData?.cohorts.forEach((cohort) => {
    cohort.curve.forEach((point) => {
      if (!chartData[point.day]) {
        chartData[point.day] = { day: point.day };
      }
      chartData[point.day][cohort.cohortMonth] = point.revenuePerUser;
    });
  });

  const chartDataArray = Object.values(chartData).sort((a, b) => a.day - b.day);

  // Get best and worst cohorts
  const sortedCohorts = [...(cohortsData?.cohorts || [])].sort((a, b) => {
    const aMax = Math.max(...a.curve.map(c => c.revenuePerUser));
    const bMax = Math.max(...b.curve.map(c => c.revenuePerUser));
    return bMax - aMax;
  });

  const bestCohort = sortedCohorts[0];
  const worstCohort = sortedCohorts[sortedCohorts.length - 1];

  return (
    <div className="p-6 space-y-6">
      {/* Revenue curves */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
        <div className="text-sm text-terminal-muted mb-4">Revenue per User by Cohort</div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartDataArray}>
              <XAxis
                dataKey="day"
                stroke="#8b949e"
                fontSize={12}
                tickLine={false}
                label={{ value: 'Days since signup', position: 'bottom', fill: '#8b949e', fontSize: 12 }}
              />
              <YAxis
                stroke="#8b949e"
                fontSize={12}
                tickLine={false}
                tickFormatter={(val) => `$${val}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  color: '#e6edf3'
                }}
                formatter={(value) => [`$${Number(value)?.toFixed(2) || 0}`, 'Rev/User']}
                labelFormatter={(label) => `Day ${label}`}
              />
              <Legend />
              {cohortsData?.cohorts.map((cohort, i) => (
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

      {/* Cohort summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3">Best Cohort</div>
          {bestCohort && (
            <>
              <div className="text-2xl font-mono text-terminal-green mb-1">
                {bestCohort.cohortMonth}
              </div>
              <div className="text-sm text-terminal-muted">
                {bestCohort.cohortSize} users
              </div>
              <div className="text-sm text-terminal-text mt-2">
                LTV: ${Math.max(...bestCohort.curve.map(c => c.revenuePerUser)).toFixed(2)}
              </div>
            </>
          )}
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3">Worst Cohort</div>
          {worstCohort && (
            <>
              <div className="text-2xl font-mono text-terminal-red mb-1">
                {worstCohort.cohortMonth}
              </div>
              <div className="text-sm text-terminal-muted">
                {worstCohort.cohortSize} users
              </div>
              <div className="text-sm text-terminal-text mt-2">
                LTV: ${Math.max(...worstCohort.curve.map(c => c.revenuePerUser)).toFixed(2)}
              </div>
            </>
          )}
        </div>

        <div className="bg-terminal-card border border-terminal-border rounded-lg p-4">
          <div className="text-sm text-terminal-muted mb-3">Average LTV</div>
          <div className="text-2xl font-mono text-terminal-cyan mb-1">
            ${cohortsData?.cohorts.length
              ? (cohortsData.cohorts.reduce((sum, c) =>
                  sum + Math.max(...c.curve.map(p => p.revenuePerUser)), 0
                ) / cohortsData.cohorts.length).toFixed(2)
              : '—'}
          </div>
          <div className="text-sm text-terminal-muted">
            Across {cohortsData?.cohorts.length || 0} cohorts
          </div>
        </div>
      </div>

      {/* Cohort table */}
      <div className="bg-terminal-card border border-terminal-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-terminal-border">
          <div className="text-sm text-terminal-muted">Cohort Summary</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-terminal-muted border-b border-terminal-border">
                <th className="text-left px-4 py-2 font-medium">Cohort</th>
                <th className="text-right px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">d7 LTV</th>
                <th className="text-right px-4 py-2 font-medium">d30 LTV</th>
                <th className="text-right px-4 py-2 font-medium">d60 LTV</th>
                <th className="text-right px-4 py-2 font-medium">Max LTV</th>
              </tr>
            </thead>
            <tbody>
              {[...(cohortsData?.cohorts || [])].sort((a, b) => b.cohortMonth.localeCompare(a.cohortMonth)).map((cohort, i) => {
                const d7 = cohort.curve.find(p => p.day <= 7)?.revenuePerUser;
                const d30 = cohort.curve.find(p => p.day <= 30)?.revenuePerUser;
                const d60 = cohort.curve.find(p => p.day <= 60)?.revenuePerUser;
                const maxLtv = Math.max(...cohort.curve.map(p => p.revenuePerUser));

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
                      {d7 ? `$${d7.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      {d30 ? `$${d30.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-text">
                      {d60 ? `$${d60.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-terminal-cyan">
                      ${maxLtv.toFixed(2)}
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
