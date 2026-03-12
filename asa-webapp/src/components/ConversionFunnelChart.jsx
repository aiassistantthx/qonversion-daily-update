import { useState, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Brush
} from 'recharts';
import { Download } from 'lucide-react';

export default function ConversionFunnelChart({ data }) {
  const [hiddenLines, setHiddenLines] = useState({});
  const [clickedPoint, setClickedPoint] = useState(null);
  const chartRef = useRef(null);
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

  // Export chart as PNG
  const exportChartAsPNG = () => {
    const chartElement = chartRef.current;
    if (!chartElement) return;

    const svgElement = chartElement.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = svgElement.width.baseVal.value;
      canvas.height = svgElement.height.baseVal.value;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        const link = document.createElement('a');
        link.download = `conversion-funnel-${new Date().toISOString().split('T')[0]}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
      });
    };

    img.src = url;
  };

  // Handle legend click to show/hide series
  const handleLegendClick = (e) => {
    const dataKey = e.dataKey;
    setHiddenLines(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey]
    }));
  };

  // Handle point click for drill-down
  const handlePointClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      setClickedPoint(data.activePayload[0].payload);
    }
  };

  // Custom tooltip with detailed data
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;

    const point = payload[0].payload;
    const installToTrial = point.installs > 0 ? ((point.trials / point.installs) * 100).toFixed(1) : 0;
    const trialToPaid = point.trials > 0 ? ((point.paid_users / point.trials) * 100).toFixed(1) : 0;

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-lg">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{label}</p>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Installs: {point.installs?.toLocaleString() || 0}
          </p>
          <p className="text-sm font-semibold text-sky-600 dark:text-sky-400">
            Trials: {point.trials?.toLocaleString() || 0} ({installToTrial}%)
          </p>
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            Paid: {point.paid_users?.toLocaleString() || 0} ({trialToPaid}%)
          </p>
        </div>
        <p className="text-xs text-gray-400 mt-2 italic">Click point for details</p>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Conversion Funnel
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Daily conversion from installs to trials to paid subscriptions
          </p>
        </div>
        <button
          onClick={exportChartAsPNG}
          className="px-3 py-2 text-xs font-medium rounded-xs cursor-pointer transition-all bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1"
          title="Export as PNG"
        >
          <Download className="h-3 w-3" />
          Export
        </button>
      </div>

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

      <div className="h-[450px]" ref={chartRef}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} onClick={handlePointClick}>
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
            <Tooltip content={<CustomTooltip />} />
            <Legend onClick={handleLegendClick} wrapperStyle={{ cursor: 'pointer' }} />
            {chartData.length > 15 && (
              <Brush
                dataKey="date"
                height={30}
                stroke="#0284c7"
                fill="#f9fafb"
              />
            )}
            {!hiddenLines.installs && (
              <Line
                type="monotone"
                dataKey="installs"
                stroke="#9ca3af"
                strokeWidth={2}
                dot={{ r: 3, cursor: 'pointer' }}
                activeDot={{ r: 6, cursor: 'pointer' }}
                name="Installs"
              />
            )}
            {!hiddenLines.trials && (
              <Line
                type="monotone"
                dataKey="trials"
                stroke="#0284c7"
                strokeWidth={2}
                dot={{ r: 3, cursor: 'pointer' }}
                activeDot={{ r: 6, cursor: 'pointer' }}
                name="Trials"
              />
            )}
            {!hiddenLines.paid_users && (
              <Line
                type="monotone"
                dataKey="paid_users"
                stroke="#15803d"
                strokeWidth={2}
                dot={{ r: 3, cursor: 'pointer' }}
                activeDot={{ r: 6, cursor: 'pointer' }}
                name="Paid Users"
              />
            )}
            {hasPrevData && (
              <>
                {!hiddenLines.prev_installs && (
                  <Line
                    type="monotone"
                    dataKey="prev_installs"
                    stroke="#d1d5db"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 2, cursor: 'pointer' }}
                    activeDot={{ r: 5, cursor: 'pointer' }}
                    name="Prev Installs"
                  />
                )}
                {!hiddenLines.prev_trials && (
                  <Line
                    type="monotone"
                    dataKey="prev_trials"
                    stroke="#7dd3fc"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 2, cursor: 'pointer' }}
                    activeDot={{ r: 5, cursor: 'pointer' }}
                    name="Prev Trials"
                  />
                )}
                {!hiddenLines.prev_paid_users && (
                  <Line
                    type="monotone"
                    dataKey="prev_paid_users"
                    stroke="#86efac"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 2, cursor: 'pointer' }}
                    activeDot={{ r: 5, cursor: 'pointer' }}
                    name="Prev Paid Users"
                  />
                )}
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {clickedPoint && (
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                📊 Drill-down: {clickedPoint.date}
              </h4>
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Installs</p>
                  <p className="text-lg font-bold text-gray-700 dark:text-gray-300">
                    {clickedPoint.installs?.toLocaleString() || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Trials</p>
                  <p className="text-lg font-bold text-sky-600 dark:text-sky-400">
                    {clickedPoint.trials?.toLocaleString() || 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Paid Users</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-400">
                    {clickedPoint.paid_users?.toLocaleString() || 0}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-2 bg-white dark:bg-gray-700 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Install → Trial: </span>
                  <span className="font-semibold text-sky-600 dark:text-sky-400">
                    {clickedPoint.installs > 0 ? ((clickedPoint.trials / clickedPoint.installs) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="p-2 bg-white dark:bg-gray-700 rounded">
                  <span className="text-gray-500 dark:text-gray-400">Trial → Paid: </span>
                  <span className="font-semibold text-green-700 dark:text-green-400">
                    {clickedPoint.trials > 0 ? ((clickedPoint.paid_users / clickedPoint.trials) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setClickedPoint(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
