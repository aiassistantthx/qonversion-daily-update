import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';

export default function ConversionFunnelChart({ data }) {
  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-10 border border-gray-200 dark:border-gray-700 text-center">
        <div className="text-sm text-gray-400 dark:text-gray-500 mb-2">Conversion Funnel</div>
        <div className="text-xs text-gray-300 dark:text-gray-600">No data available</div>
      </div>
    );
  }

  const hasPrevData = data.prevData && data.prevData.length > 0;

  const chartData = data.data.map((item, index) => {
    const row = {
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      installs: item.installs,
      trials: item.trials,
      paid_users: item.paid_users
    };

    if (hasPrevData && data.prevData[index]) {
      row.prev_installs = data.prevData[index].installs;
      row.prev_trials = data.prevData[index].trials;
      row.prev_paid_users = data.prevData[index].paid_users;
    }

    return row;
  });

  const totals = data.totals || {};

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Conversion Funnel
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Daily conversion from installs to trials to paid subscriptions
      </p>

      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Installs</div>
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {totals.installs?.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            100%
          </div>
        </div>
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Trials</div>
          <div className="text-xl font-semibold text-sky-600 dark:text-sky-400">
            {totals.trials?.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-sky-600 dark:text-sky-400 mt-1">
            {totals.install_to_trial_rate?.toFixed(1) || 0}% conversion
          </div>
        </div>
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Paid Users</div>
          <div className="text-xl font-semibold text-green-700 dark:text-green-400">
            {totals.paid_users?.toLocaleString() || 0}
          </div>
          <div className="text-[11px] text-green-700 dark:text-green-400 mt-1">
            {totals.trial_to_paid_rate?.toFixed(1) || 0}% of trials
          </div>
        </div>
      </div>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              formatter={(v) => v.toLocaleString()}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="installs"
              stroke="#9ca3af"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Installs"
            />
            <Line
              type="monotone"
              dataKey="trials"
              stroke="#0284c7"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Trials"
            />
            <Line
              type="monotone"
              dataKey="paid_users"
              stroke="#15803d"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Paid Users"
            />
            {hasPrevData && (
              <>
                <Line
                  type="monotone"
                  dataKey="prev_installs"
                  stroke="#d1d5db"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 2 }}
                  name="Prev Installs"
                />
                <Line
                  type="monotone"
                  dataKey="prev_trials"
                  stroke="#7dd3fc"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 2 }}
                  name="Prev Trials"
                />
                <Line
                  type="monotone"
                  dataKey="prev_paid_users"
                  stroke="#86efac"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ r: 2 }}
                  name="Prev Paid Users"
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
          Overall Conversion Rates
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Install → Trial: </span>
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              {totals.install_to_trial_rate?.toFixed(1) || 0}%
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Trial → Paid: </span>
            <span className="font-semibold text-green-700 dark:text-green-400">
              {totals.trial_to_paid_rate?.toFixed(1) || 0}%
            </span>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Install → Paid: </span>
            <span className="font-semibold text-purple-600 dark:text-purple-400">
              {totals.install_to_paid_rate?.toFixed(1) || 0}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
