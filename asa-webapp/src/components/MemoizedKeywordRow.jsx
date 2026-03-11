import { memo } from 'react';
import { TableRow, TableCell } from './Table';
import { Badge } from './Badge';
import { Input } from './Input';
import { Button } from './Button';
import { HoverActions } from './HoverActions';
import BidRecommendation from './BidRecommendation';
import { Edit2, Check, X, Pause, Play, AlertTriangle } from 'lucide-react';

const KeywordRow = memo(({
  kw,
  columnOrder,
  visibleColumns,
  selectedIds,
  editingKeywordId,
  newBid,
  toggleSelect,
  setEditingKeywordId,
  setNewBid,
  bidMutation,
  bulkStatusMutation,
  onBidUpdate,
  onStatusUpdate
}) => {
  const spend = parseFloat(kw.spend_7d || 0);
  const revenue = parseFloat(kw.revenue_7d || 0);
  const roas = spend > 0 ? revenue / spend : 0;
  const bid = parseFloat(kw.bid_amount || 0);
  const cpa = parseFloat(kw.cpa_7d || 0);
  const bidVsCpaRatio = cpa > 0 ? bid / cpa : 0;
  const isOverpaying = bidVsCpaRatio > 1.5 && cpa > 0;
  const recommendedBid = cpa > 0 ? Math.max(0.5, cpa * 1.2) : bid;

  const TARGET_CAC = 65.68;

  const renderCell = (columnId) => {
    switch (columnId) {
      case 'matchType':
        return (
          <TableCell key={columnId}>
            <Badge variant={kw.match_type === 'EXACT' ? 'info' : 'default'}>
              {kw.match_type}
            </Badge>
          </TableCell>
        );
      case 'bid':
        return (
          <TableCell key={columnId}>
            {editingKeywordId === kw.keyword_id ? (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1 justify-center">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="100"
                    value={newBid}
                    onChange={(e) => setNewBid(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const bidVal = parseFloat(newBid);
                        if (!isNaN(bidVal) && bidVal >= 0.01 && bidVal <= 100) {
                          onBidUpdate(kw, bidVal);
                        }
                      } else if (e.key === 'Escape') {
                        setEditingKeywordId(null);
                        setNewBid('');
                      }
                    }}
                    className="w-24 text-center"
                    disabled={bidMutation.isPending}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const bidVal = parseFloat(newBid);
                      if (!isNaN(bidVal) && bidVal >= 0.01 && bidVal <= 100) {
                        onBidUpdate(kw, bidVal);
                      }
                    }}
                    loading={bidMutation.isPending}
                    className="text-green-600 hover:text-green-700"
                  >
                    <Check size={14} />
                  </Button>
                  <button
                    onClick={() => {
                      setEditingKeywordId(null);
                      setNewBid('');
                    }}
                    className="text-gray-400 hover:text-gray-500"
                    disabled={bidMutation.isPending}
                  >
                    <X size={14} />
                  </button>
                </div>
                {(() => {
                  const bidVal = parseFloat(newBid);
                  const currentBidVal = parseFloat(bid);
                  if (!isNaN(bidVal) && !isNaN(currentBidVal) && currentBidVal > 0) {
                    const change = bidVal - currentBidVal;
                    const changePercent = (change / currentBidVal) * 100;
                    if (Math.abs(change) > 0.001) {
                      return (
                        <span className={`text-xs font-medium ${change > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {change > 0 ? '+' : ''}${change.toFixed(2)} ({changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%)
                        </span>
                      );
                    }
                  }
                  return null;
                })()}
                {(() => {
                  const bidVal = parseFloat(newBid);
                  if (isNaN(bidVal) || bidVal < 0.01 || bidVal > 100) {
                    return (
                      <span className="text-xs text-red-600">
                        Must be between $0.01 and $100
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                  onClick={() => {
                    setEditingKeywordId(kw.keyword_id);
                    setNewBid(bid);
                  }}
                  title="Click to edit"
                >
                  <span className="font-medium">${parseFloat(bid).toFixed(2)}</span>
                  <Edit2 size={12} className="text-gray-400" />
                </div>
                <BidRecommendation
                  currentBid={bid}
                  metrics={{
                    cpa_7d: kw.cpa_7d,
                    cop_7d: kw.cop_7d,
                    cpt_7d: kw.cpt_7d,
                    roas: roas,
                    sov: kw.sov,
                    installs_7d: kw.installs_7d
                  }}
                  inline={true}
                />
              </div>
            )}
          </TableCell>
        );
      case 'bidVsCpa':
        return (
          <TableCell key={columnId}>
            {cpa > 0 ? (
              <div className="flex items-center justify-center gap-2">
                {isOverpaying && (
                  <AlertTriangle size={14} className="text-orange-500" title="Bid significantly higher than CPA" />
                )}
                <span className={isOverpaying ? 'text-orange-600 font-medium' : ''}>
                  ${bid.toFixed(2)} / ${cpa.toFixed(2)}
                </span>
                {isOverpaying && (
                  <span className="text-xs text-orange-600" title={`Recommended bid: $${recommendedBid.toFixed(2)}`}>
                    ({(bidVsCpaRatio * 100).toFixed(0)}%)
                  </span>
                )}
              </div>
            ) : (
              <span className="text-gray-400">-</span>
            )}
          </TableCell>
        );
      case 'spend':
        return <TableCell key={columnId}>${spend.toFixed(2)}</TableCell>;
      case 'impressions':
        return <TableCell key={columnId}>{parseInt(kw.impressions_7d || 0).toLocaleString()}</TableCell>;
      case 'sov':
        return <TableCell key={columnId} className="font-medium text-blue-600">{parseFloat(kw.sov || 0).toFixed(2)}%</TableCell>;
      case 'taps':
        return <TableCell key={columnId}>{parseInt(kw.taps_7d || 0).toLocaleString()}</TableCell>;
      case 'ttr':
        return <TableCell key={columnId}>{(parseFloat(kw.ttr_7d || 0) * 100).toFixed(2)}%</TableCell>;
      case 'installs':
        return <TableCell key={columnId}>{parseInt(kw.installs_7d || 0)}</TableCell>;
      case 'cvr':
        return <TableCell key={columnId}>{(parseFloat(kw.cvr_7d || 0) * 100).toFixed(2)}%</TableCell>;
      case 'cpa':
        return <TableCell key={columnId}>{kw.cpa_7d ? `$${parseFloat(kw.cpa_7d).toFixed(2)}` : '-'}</TableCell>;
      case 'cpt':
        return <TableCell key={columnId}>{kw.cpt_7d ? `$${parseFloat(kw.cpt_7d).toFixed(2)}` : '-'}</TableCell>;
      case 'cpm':
        return <TableCell key={columnId}>{kw.cpm_7d ? `$${parseFloat(kw.cpm_7d).toFixed(2)}` : '-'}</TableCell>;
      case 'revenue':
        return <TableCell key={columnId} className="text-green-600">${revenue.toFixed(2)}</TableCell>;
      case 'roas':
        return (
          <TableCell key={columnId} className={`font-medium ${roas >= 1 ? 'text-green-600' : roas > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {roas > 0 ? `${(roas * 100).toFixed(0)}%` : '-'}
          </TableCell>
        );
      case 'roasD7':
        const roasD7 = parseFloat(kw.roas_d7 || 0);
        return (
          <TableCell key={columnId} className={`font-medium ${roasD7 >= 1 ? 'text-green-600' : roasD7 > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {roasD7 > 0 ? `${(roasD7 * 100).toFixed(0)}%` : '-'}
          </TableCell>
        );
      case 'roasD30':
        const roasD30 = parseFloat(kw.roas_d30 || 0);
        return (
          <TableCell key={columnId} className={`font-medium ${roasD30 >= 1 ? 'text-green-600' : roasD30 > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {roasD30 > 0 ? `${(roasD30 * 100).toFixed(0)}%` : '-'}
          </TableCell>
        );
      case 'cac':
        return <TableCell key={columnId}>{kw.cop_7d ? `$${parseFloat(kw.cop_7d).toFixed(2)}` : '-'}</TableCell>;
      case 'kpiDiff':
        const kwCac = parseFloat(kw.cop_7d);
        const kwKpiDiff = kwCac ? kwCac - TARGET_CAC : null;
        const kwIsOnTarget = kwKpiDiff !== null && kwKpiDiff <= 0;
        return (
          <TableCell key={columnId}>
            {kwKpiDiff !== null ? (
              <span className={`font-medium ${kwIsOnTarget ? 'text-green-600' : 'text-red-600'}`}>
                {kwKpiDiff >= 0 ? '+' : ''}{kwKpiDiff.toFixed(2)}
              </span>
            ) : '-'}
          </TableCell>
        );
      case 'cop':
        return <TableCell key={columnId}>{kw.cop_7d ? `$${parseFloat(kw.cop_7d).toFixed(2)}` : '-'}</TableCell>;
      default:
        return null;
    }
  };

  return (
    <TableRow
      key={kw.keyword_id}
      className={selectedIds.has(kw.keyword_id) ? 'bg-blue-50' : ''}
      hoverActions={
        <HoverActions>
          <Button
            size="sm"
            variant={kw.keyword_status === 'ACTIVE' ? 'danger' : 'success'}
            onClick={(e) => {
              e.stopPropagation();
              onStatusUpdate(kw);
            }}
            loading={bulkStatusMutation.isPending}
            title={kw.keyword_status === 'ACTIVE' ? 'Pause' : 'Enable'}
          >
            {kw.keyword_status === 'ACTIVE' ? <Pause size={14} /> : <Play size={14} />}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setEditingKeywordId(kw.keyword_id);
              setNewBid(bid);
            }}
            title="Edit bid"
          >
            <Edit2 size={14} />
          </Button>
        </HoverActions>
      }
    >
      <TableCell>
        <input
          type="checkbox"
          checked={selectedIds.has(kw.keyword_id)}
          onChange={() => toggleSelect(kw.keyword_id)}
          className="rounded border-gray-300"
        />
      </TableCell>
      <TableCell className="font-medium max-w-xs truncate" title={kw.keyword_text}>
        {kw.keyword_text}
      </TableCell>
      {columnOrder.map(columnId => visibleColumns[columnId] ? renderCell(columnId) : null)}
    </TableRow>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.kw.keyword_id === nextProps.kw.keyword_id &&
    prevProps.editingKeywordId === nextProps.editingKeywordId &&
    prevProps.newBid === nextProps.newBid &&
    prevProps.selectedIds.has(prevProps.kw.keyword_id) === nextProps.selectedIds.has(nextProps.kw.keyword_id) &&
    JSON.stringify(prevProps.visibleColumns) === JSON.stringify(nextProps.visibleColumns) &&
    JSON.stringify(prevProps.columnOrder) === JSON.stringify(nextProps.columnOrder)
  );
});

KeywordRow.displayName = 'MemoizedKeywordRow';

export default KeywordRow;
