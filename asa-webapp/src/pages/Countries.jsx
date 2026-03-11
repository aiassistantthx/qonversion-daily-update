import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../components/Table';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { GeoHeatmap } from '../components/GeoHeatmap';
import { getCountries } from '../lib/api';
import { useDateRange } from '../context/DateRangeContext';
import { TableSkeleton } from '../components/SkeletonLoader';
import { ChevronUp, ChevronDown, Search, Download, ArrowRight } from 'lucide-react';

export default function Countries() {
  const navigate = useNavigate();
  const { queryParams, label: dateLabel } = useDateRange();

  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('spend');
  const [sortDirection, setSortDirection] = useState('desc');

  const { data, isLoading, error } = useQuery({
    queryKey: ['countries', queryParams],
    queryFn: () => getCountries(queryParams),
  });

  const countries = useMemo(() => {
    let result = data?.data || [];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => c.country.toLowerCase().includes(query));
    }

    result = [...result].sort((a, b) => {
      let aVal, bVal;

      switch (sortField) {
        case 'country':
          aVal = a.country.toLowerCase();
          bVal = b.country.toLowerCase();
          break;
        case 'spend':
          aVal = a.spend;
          bVal = b.spend;
          break;
        case 'revenue':
          aVal = a.revenue;
          bVal = b.revenue;
          break;
        case 'roas':
          aVal = a.roas;
          bVal = b.roas;
          break;
        case 'cpa':
          aVal = a.cpa || 999999;
          bVal = b.cpa || 999999;
          break;
        case 'installs':
          aVal = a.installs;
          bVal = b.installs;
          break;
        case 'paidUsers':
          aVal = a.paidUsers;
          bVal = b.paidUsers;
          break;
        default:
          aVal = a.spend;
          bVal = b.spend;
      }

      const dir = sortDirection === 'asc' ? 1 : -1;
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });

    return result;
  }, [data, searchQuery, sortField, sortDirection]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(['country'].includes(field) ? 'asc' : 'desc');
    }
  };

  const exportCSV = () => {
    const headers = ['Country', 'Spend', 'Revenue', 'ROAS', 'CPA', 'Installs', 'Paid Users', 'COP'];
    const rows = countries.map(c => [
      `"${c.country}"`,
      c.spend.toFixed(2),
      c.revenue.toFixed(2),
      c.roas.toFixed(2),
      c.cpa ? c.cpa.toFixed(2) : '',
      c.installs,
      c.paidUsers,
      c.cop ? c.cop.toFixed(2) : '',
    ]);
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `countries-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const SortHeader = ({ field, children, className = '' }) => (
    <TableHeader
      className={`cursor-pointer select-none hover:bg-gray-100 ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </div>
    </TableHeader>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Countries</h1>
          <p className="text-gray-500">{dateLabel}</p>
        </div>
        <Button variant="secondary" onClick={exportCSV}>
          <Download size={16} /> Export CSV
        </Button>
      </div>

      <GeoHeatmap data={data?.data || []} />

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <Input
            type="text"
            placeholder="Search countries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <SortHeader field="country">Country</SortHeader>
              <SortHeader field="spend" className="text-right">Spend</SortHeader>
              <SortHeader field="revenue" className="text-right">Revenue</SortHeader>
              <SortHeader field="roas" className="text-right">ROAS</SortHeader>
              <SortHeader field="cpa" className="text-right">CPA</SortHeader>
              <SortHeader field="installs" className="text-right">Installs</SortHeader>
              <SortHeader field="paidUsers" className="text-right">Paid Users</SortHeader>
              <TableHeader className="text-right">COP</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={10} columns={8} />
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-red-500">Error: {error.message}</TableCell>
              </TableRow>
            ) : countries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">No country data found</TableCell>
              </TableRow>
            ) : (
              countries.map((country) => (
                <TableRow key={country.country} className="hover:bg-gray-50">
                  <TableCell>
                    <button
                      onClick={() => navigate(`/campaigns?country=${country.country}`)}
                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      {country.country}
                      <ArrowRight size={14} />
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    ${country.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-600">
                    ${country.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={country.roas >= 1 ? 'text-green-600 font-medium' : 'text-red-500'}>
                      {(country.roas * 100).toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {country.cpa ? `$${country.cpa.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    {country.installs.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {country.paidUsers.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {country.cop ? `$${country.cop.toFixed(2)}` : '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {data?.totals && (
        <Card>
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Totals</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-gray-500">Spend</div>
                <div className="text-lg font-semibold">
                  ${data.totals.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Revenue</div>
                <div className="text-lg font-semibold text-green-600">
                  ${data.totals.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">ROAS</div>
                <div className={`text-lg font-semibold ${data.totals.roas >= 1 ? 'text-green-600' : 'text-red-500'}`}>
                  {(data.totals.roas * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Installs</div>
                <div className="text-lg font-semibold">
                  {data.totals.installs.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {countries.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          Showing {countries.length} countries
        </div>
      )}
    </div>
  );
}
