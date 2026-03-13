import { TrendingUp, TrendingDown, Minus, Info, Check } from 'lucide-react';
import { Button } from './Button';

const TARGET_CAC = 65.68;

function calculateBidRecommendation(currentBid, metrics) {
  const { cpa_7d, cop_7d, cpt_7d, roas, sov, installs_7d } = metrics;

  if (!currentBid || currentBid === 0) return null;

  let recommendedBid = currentBid;
  let reasons = [];
  let competitionLevel = 'medium';

  const cpa = parseFloat(cpa_7d) || 0;
  const cop = parseFloat(cop_7d) || 0;
  const cpt = parseFloat(cpt_7d) || 0;
  const currentRoas = parseFloat(roas) || 0;
  const shareOfVoice = parseFloat(sov) || 0;
  const installs = parseInt(installs_7d) || 0;

  if (cop > 0 && cop < TARGET_CAC * 0.8) {
    recommendedBid = currentBid * 1.15;
    reasons.push(`COP ($${cop.toFixed(2)}) is well below target ($${TARGET_CAC.toFixed(2)})`);
  } else if (cop > TARGET_CAC * 1.2) {
    recommendedBid = currentBid * 0.85;
    reasons.push(`COP ($${cop.toFixed(2)}) exceeds target ($${TARGET_CAC.toFixed(2)})`);
  }

  if (cpa > 0 && currentBid / cpa > 1.5) {
    recommendedBid = Math.min(recommendedBid, cpa * 1.2);
    reasons.push('Bid is high relative to CPA');
  } else if (cpa > 0 && currentBid / cpa < 0.8) {
    recommendedBid = Math.max(recommendedBid, cpa * 1.0);
    reasons.push('Bid is low relative to CPA');
  }

  if (currentRoas > 3.0 && shareOfVoice < 0.3) {
    recommendedBid = currentBid * 1.1;
    reasons.push('Strong ROAS with low share of voice - opportunity to scale');
    competitionLevel = 'high';
  } else if (currentRoas < 1.0) {
    recommendedBid = currentBid * 0.9;
    reasons.push('ROAS below 1.0 - reduce spend');
  }

  if (installs < 5) {
    recommendedBid = currentBid * 0.95;
    reasons.push('Low conversion volume - test lower bid');
  }

  if (shareOfVoice > 0.6) {
    competitionLevel = 'low';
  } else if (shareOfVoice < 0.2) {
    competitionLevel = 'high';
  }

  recommendedBid = Math.max(0.5, Math.min(10.0, recommendedBid));

  if (reasons.length === 0) {
    reasons.push('Current bid is optimal based on recent performance');
  }

  const bidDiff = recommendedBid - currentBid;
  const bidDiffPercent = ((bidDiff / currentBid) * 100);

  let status = 'optimal';
  if (Math.abs(bidDiffPercent) > 10) {
    status = 'optimize';
  }

  return {
    recommendedBid: parseFloat(recommendedBid.toFixed(2)),
    currentBid: parseFloat(currentBid),
    difference: parseFloat(bidDiff.toFixed(2)),
    differencePercent: parseFloat(bidDiffPercent.toFixed(1)),
    status,
    reasons,
    competitionLevel,
    metrics: { cpa, cop, roas: currentRoas, sov: shareOfVoice }
  };
}

export default function BidRecommendation({ currentBid, metrics, inline = false, onApply, isApplying = false }) {
  const recommendation = calculateBidRecommendation(currentBid, metrics);

  if (!recommendation) return null;

  const { recommendedBid, difference, differencePercent, status, reasons, competitionLevel } = recommendation;

  const isOptimal = status === 'optimal';
  const shouldIncrease = difference > 0;
  const shouldDecrease = difference < 0;

  const statusColors = {
    optimal: 'text-green-600 bg-green-50',
    optimize: shouldIncrease ? 'text-orange-600 bg-orange-50' : 'text-yellow-600 bg-yellow-50'
  };

  const StatusIcon = isOptimal ? Minus : (shouldIncrease ? TrendingUp : TrendingDown);

  if (inline) {
    return (
      <div className="group relative inline-flex items-center gap-1">
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusColors[status]}`}>
          <StatusIcon className="h-3 w-3" />
          ${recommendedBid.toFixed(2)}
        </span>

        <div className="invisible group-hover:visible absolute z-50 left-0 bottom-full mb-1 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">Recommended Bid</div>
                <div className="text-2xl font-bold">${recommendedBid.toFixed(2)}</div>
              </div>
              {!isOptimal && (
                <div className={`text-right ${shouldIncrease ? 'text-orange-300' : 'text-yellow-300'}`}>
                  <div className="text-xs opacity-75">Change</div>
                  <div className="font-semibold">
                    {difference > 0 ? '+' : ''}{difference.toFixed(2)}
                    <span className="text-xs ml-1">({differencePercent > 0 ? '+' : ''}{differencePercent}%)</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-700 pt-2">
              <div className="font-semibold mb-1 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Why this recommendation:
              </div>
              <ul className="space-y-1">
                {reasons.map((reason, idx) => (
                  <li key={idx} className="text-gray-300">• {reason}</li>
                ))}
              </ul>
            </div>

            <div className="border-t border-gray-700 pt-2 flex items-center justify-between text-xs">
              <div>
                <span className="opacity-75">Competition:</span>
                <span className={`ml-1 font-semibold ${
                  competitionLevel === 'high' ? 'text-red-300' :
                  competitionLevel === 'low' ? 'text-green-300' : 'text-yellow-300'
                }`}>
                  {competitionLevel.toUpperCase()}
                </span>
              </div>
              <div className="opacity-75">
                Target CAC: ${TARGET_CAC.toFixed(2)}
              </div>
            </div>

            {onApply && !isOptimal && (
              <div className="border-t border-gray-700 pt-2 mt-2">
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApply(recommendedBid);
                  }}
                  loading={isApplying}
                >
                  <Check size={14} /> Apply ${recommendedBid.toFixed(2)}
                </Button>
              </div>
            )}
          </div>

          <div className="absolute left-4 -bottom-1 w-2 h-2 bg-gray-900 transform rotate-45"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg ${statusColors[status]} border ${
      isOptimal ? 'border-green-200' : 'border-orange-200'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon className="h-5 w-5" />
            <h3 className="font-semibold">
              {isOptimal ? 'Bid is Optimal' : 'Recommended Bid'}
            </h3>
          </div>

          <div className="text-2xl font-bold mb-2">
            ${recommendedBid.toFixed(2)}
            {!isOptimal && (
              <span className="text-sm font-normal ml-2 opacity-75">
                ({difference > 0 ? '+' : ''}{difference.toFixed(2)} / {differencePercent > 0 ? '+' : ''}{differencePercent}%)
              </span>
            )}
          </div>

          <div className="space-y-1 text-sm">
            {reasons.map((reason, idx) => (
              <div key={idx}>• {reason}</div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-current opacity-50 flex items-center gap-4 text-xs">
            <div>Competition: <strong>{competitionLevel.toUpperCase()}</strong></div>
            <div>Target CAC: <strong>${TARGET_CAC.toFixed(2)}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { calculateBidRecommendation };
