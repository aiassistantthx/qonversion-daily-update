import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { getCohortsByCampaign } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { TableSkeleton } from '../components/SkeletonLoader';
import { ChevronUp, ChevronDown, BarChart3 } from 'lucide-react';

const METRIC_GROUPS = {
  roas: { label: 'ROAS', days: ['d0', 'd4', 'd7', 'd14', 'd30'], format: 'percent', goodHigh: true },
  cop: { label: 'COP', days: ['d0', 'd4', 'd7', 'd14', 'd30'], format: 'currency', goodHigh: false },
  cpt: { label: 'CPT', days: ['d0', 'd4', 'd7', 'd14', 'd30'], format: 'currency', goodHigh: false },
  cpts: { label: 'CPTS', days: ['d0', 'd4', 'd7', 'd14', 'd30'], format: 'currency', goodHigh: false },
};

function getHeatmapColor(value, min, max, goodHigh) {
  if (value === null || value === undefined) return 'bg-gray-100 dark:bg-gray-800';

  const normalized = max === min ? 0.5 : (value - min) / (max - min);
  const intensity = goodHigh ? normalized : 1 - normalized;

  if (intensity >= 0.8) return 'bg-green-200 dark:bg-green-900';
  if (intensity >= 0.6) return 'bg-green-100 dark:bg-green-950';
  if (intensity >= 0.4) return 'bg-yellow-100 dark:bg-yellow-950';
  if (intensity >= 0.2) return 'bg-orange-100 dark:bg-orange-950';
  return 'bg-red-200 dark:bg-red-900';
}

function formatValue(value, format) {
  if (value === null || value === undefined) return '-';

  if (format === 'percent') {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (format === 'currency') {
    return `$${value.toFixed(2)}`;
  }
  return value.toFixed(2);
}

function SortHeader({ field, children, className = '', onClick, sortField, sortDirection }) {
  return (
    <TableHeader
      className={`cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-800 ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </div>
    </TableHeader>
  );
}

export default function Cohorts() {
  const { label: dateLabel } = useDateRange();
  const [days, setDays] = useState(90);
  const [metricGroup, setMetricGroup] = useState('roas');
  const [sortField, setSortField] = useState('spend');
  const [sortDirection, setSortDirection] = useState('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['cohorts-by-campaign', days],
    queryFn: () => getCohortsByCampaign({ days }),
  });

  const campaigns = useMemo(() => {
    if (!data?.campaigns) return [];

    const result = [...data.campaigns];

    result.sort((a, b) => {
      let aVal, bVal;

      if (sortField === 'name') {
        aVal = (a.campaign_name || '').toLowerCase();
        bVal = (b.campaign_name || '').toLowerCase();
      } else if (sortField === 'spend') {
        aVal = a.spend || 0;
        bVal = b.spend || 0;
      } else {
        aVal = a[sortField] || 0;
        bVal = b[sortField] || 0;
      }

      const dir = sortDirection === 'asc' ? 1 : -1;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return result;
  }, [data, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const metricConfig = METRIC_GROUPS[metricGroup];

  const minMax = useMemo(() => {
    if (!campaigns.length) return {};

    const result = {};
    metricConfig.days.forEach(day => {
      const key = `${metricGroup}_${day}`;
      const values = campaigns.map(c => c[key]).filter(v => v !== null && v !== undefined);
      result[key] = {
        min: Math.min(...values),
        max: Math.max(...values),
      };
    });
    return result;
  }, [campaigns, metricGroup, metricConfig]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cohort Analysis</h1>
          <p className="text-gray-500 dark:text-gray-400">{dateLabel}</p>
        </div>
        <TableSkeleton rows={10} columns={7} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cohort Analysis</h1>
        </div>
        <Card>
          <div className="p-8 text-center text-red-500">
            Error loading cohort data: {error.message}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cohort Analysis</h1>
          <p className="text-gray-500 dark:text-gray-400">D0/D4/D7/D14/D30 metrics by campaign</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
          </select>
          <select
            value={metricGroup}
            onChange={(e) => setMetricGroup(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
          >
            <option value="roas">ROAS</option>
            <option value="cop">COP (Cost per Paid)</option>
            <option value="cpt">CPT (Cost per Trial)</option>
            <option value="cpts">CPTS (Cost per Trial+Sub)</option>
          </select>
        </div>
      </div>

      {/* Totals Card */}
      {data?.totals && (
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Totals ({data.total} campaigns)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              <div>
                <div className="text-xs text-gray-500">Spend</div>
                <div className="text-lg font-semibold">${data.totals.spend?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              {metricConfig.days.map(day => {
                const key = `${metricGroup}_${day}`;
                const value = data.totals[key];
                return (
                  <div key={day}>
                    <div className="text-xs text-gray-500">{metricConfig.label} {day.toUpperCase()}</div>
                    <div className="text-lg font-semibold">{formatValue(value, metricConfig.format)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Legend */}
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>Heatmap:</span>
        <span className="px-2 py-1 bg-green-200 dark:bg-green-900 rounded">Best</span>
        <span className="px-2 py-1 bg-green-100 dark:bg-green-950 rounded">Good</span>
        <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-950 rounded">Average</span>
        <span className="px-2 py-1 bg-orange-100 dark:bg-orange-950 rounded">Below Avg</span>
        <span className="px-2 py-1 bg-red-200 dark:bg-red-900 rounded">Worst</span>
      </div>

      {/* Heatmap Table */}
      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <SortHeader
                field="name"
                onClick={() => handleSort('name')}
                sortField={sortField}
                sortDirection={sortDirection}
                className="text-left min-w-[200px]"
              >
                Campaign
              </SortHeader>
              <SortHeader
                field="spend"
                onClick={() => handleSort('spend')}
                sortField={sortField}
                sortDirection={sortDirection}
              >
                Spend
              </SortHeader>
              {metricConfig.days.map(day => {
                const key = `${metricGroup}_${day}`;
                return (
                  <SortHeader
                    key={day}
                    field={key}
                    onClick={() => handleSort(key)}
                    sortField={sortField}
                    sortDirection={sortDirection}
                  >
                    {day.toUpperCase()}
                  </SortHeader>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow key={campaign.campaign_id}>
                <TableCell className="font-medium max-w-[200px] truncate" title={campaign.campaign_name}>
                  {campaign.campaign_name || `Campaign ${campaign.campaign_id}`}
                </TableCell>
                <TableCell className="text-center">
                  ${campaign.spend?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </TableCell>
                {metricConfig.days.map(day => {
                  const key = `${metricGroup}_${day}`;
                  const value = campaign[key];
                  const { min, max } = minMax[key] || {};
                  const colorClass = getHeatmapColor(value, min, max, metricConfig.goodHigh);

                  return (
                    <TableCell key={day} className={`text-center ${colorClass}`}>
                      {formatValue(value, metricConfig.format)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Empty State */}
      {campaigns.length === 0 && (
        <Card>
          <div className="p-8 text-center">
            <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No cohort data</h3>
            <p className="text-gray-500 dark:text-gray-400">
              No campaign data available for the selected period.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
