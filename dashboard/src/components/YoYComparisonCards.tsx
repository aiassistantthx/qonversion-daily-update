import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react';
import type { YoYData } from '../api';

interface YoYComparisonCardsProps {
  data: YoYData | undefined;
}

function formatCurrency(val: number): string {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function ChangeIndicator({ change, suffix = '%' }: { change: number | null; suffix?: string }) {
  if (change === null) return <span style={{ color: '#9ca3af' }}>—</span>;

  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 1;
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown;
  const color = isNeutral ? '#9ca3af' : isPositive ? '#10b981' : '#ef4444';

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color }}>
      <Icon size={14} />
      {isPositive ? '+' : ''}{change.toFixed(1)}{suffix}
    </span>
  );
}

function ComparisonCard({
  title,
  thisValue,
  lastValue,
  change,
  thisLabel,
  lastLabel,
  format = 'currency',
}: {
  title: string;
  thisValue: number;
  lastValue: number;
  change: number | null;
  thisLabel: string;
  lastLabel: string;
  format?: 'currency' | 'number';
}) {
  const formatVal = format === 'currency' ? formatCurrency : (v: number) => v.toLocaleString();

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: 20,
      border: '1px solid #e5e7eb',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>{title}</div>
        <ChangeIndicator change={change} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
            {formatVal(thisValue)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{thisLabel}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: '#6b7280' }}>
            {formatVal(lastValue)}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{lastLabel}</div>
        </div>
      </div>
    </div>
  );
}

export function YoYComparisonCards({ data }: YoYComparisonCardsProps) {
  if (!data) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
        Loading YoY comparison...
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Calendar size={18} style={{ color: '#6b7280' }} />
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>
          Year-over-Year Comparison
        </h3>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {data.currentYear} vs {data.lastYear}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {/* This month vs same month last year - Revenue */}
        <ComparisonCard
          title={`${data.currentMonth} Revenue`}
          thisValue={data.monthComparison.thisMonth}
          lastValue={data.monthComparison.lastYearSameMonth}
          change={data.monthComparison.change}
          thisLabel={`${data.currentMonth} ${data.currentYear}`}
          lastLabel={`${data.currentMonth} ${data.lastYear}`}
        />

        {/* This month vs same month last year - Subscribers */}
        <ComparisonCard
          title={`${data.currentMonth} Subscribers`}
          thisValue={data.monthComparison.thisMonthSubs}
          lastValue={data.monthComparison.lastYearSameMonthSubs}
          change={data.monthComparison.subsChange}
          thisLabel={`${data.currentMonth} ${data.currentYear}`}
          lastLabel={`${data.currentMonth} ${data.lastYear}`}
          format="number"
        />

        {/* YTD Revenue */}
        <ComparisonCard
          title="YTD Revenue"
          thisValue={data.ytdComparison.thisYear}
          lastValue={data.ytdComparison.lastYear}
          change={data.ytdComparison.change}
          thisLabel={`Jan-${data.currentMonth} ${data.currentYear}`}
          lastLabel={`Jan-${data.currentMonth} ${data.lastYear}`}
        />

        {/* YTD Subscribers */}
        <ComparisonCard
          title="YTD Subscribers"
          thisValue={data.ytdComparison.thisYearSubs}
          lastValue={data.ytdComparison.lastYearSubs}
          change={data.ytdComparison.subsChange}
          thisLabel={`Jan-${data.currentMonth} ${data.currentYear}`}
          lastLabel={`Jan-${data.currentMonth} ${data.lastYear}`}
          format="number"
        />
      </div>
    </div>
  );
}
