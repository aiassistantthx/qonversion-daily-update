import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from 'recharts';

export default function ConversionFunnelChart({ data }) {
  if (!data || !data.data || data.data.length === 0) {
    return (
      <div style={{ background: '#fff', borderRadius: 12, padding: 40, border: '1px solid #e5e7eb', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#9ca3af', marginBottom: 8 }}>Conversion Funnel</div>
        <div style={{ fontSize: 13, color: '#d1d5db' }}>No data available</div>
      </div>
    );
  }

  const chartData = data.data.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    installs: item.installs,
    trials: item.trials,
    paid_users: item.paid_users
  }));

  const totals = data.totals || {};

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 8 }}>
        Conversion Funnel
      </h3>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        Daily conversion from installs to trials to paid subscriptions
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
        <div style={{ padding: 12, background: '#f9fafb', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Total Installs</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>
            {totals.installs?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            100%
          </div>
        </div>
        <div style={{ padding: 12, background: '#f0f9ff', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Total Trials</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#0284c7' }}>
            {totals.trials?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: 11, color: '#0284c7', marginTop: 4 }}>
            {totals.install_to_trial_rate?.toFixed(1) || 0}% conversion
          </div>
        </div>
        <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Total Paid Users</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#15803d' }}>
            {totals.paid_users?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>
            {totals.trial_to_paid_rate?.toFixed(1) || 0}% of trials
          </div>
        </div>
      </div>

      <div style={{ height: 350 }}>
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
              contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
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
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 20, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', marginBottom: 8 }}>
          Overall Conversion Rates
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12 }}>
          <div>
            <span style={{ color: '#6b7280' }}>Install → Trial: </span>
            <span style={{ fontWeight: 600, color: '#0284c7' }}>
              {totals.install_to_trial_rate?.toFixed(1) || 0}%
            </span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Trial → Paid: </span>
            <span style={{ fontWeight: 600, color: '#15803d' }}>
              {totals.trial_to_paid_rate?.toFixed(1) || 0}%
            </span>
          </div>
          <div>
            <span style={{ color: '#6b7280' }}>Install → Paid: </span>
            <span style={{ fontWeight: 600, color: '#7c3aed' }}>
              {totals.install_to_paid_rate?.toFixed(1) || 0}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
