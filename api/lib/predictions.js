/**
 * ROAS Prediction Library
 *
 * Uses decay curves to predict long-term ROAS from early cohort data
 */

// ROAS decay curve - % of final ROAS by cohort age
// Based on analysis of mature cohorts (300+ days) from /dashboard/roas-evolution
// Includes both initial purchases and subscription renewals
const ROAS_DECAY_CURVE = {
  0: 0.05,    // ~5% - minimal revenue day 0
  4: 0.15,    // ~15% - first trial conversions
  7: 0.22,    // 22% by week 1
  14: 0.28,   // ~28% by week 2
  30: 0.37,   // 37% by month 1
  60: 0.50,   // 50% by month 2
  90: 0.60,   // 60% by month 3
  120: 0.68,  // 68% by month 4
  150: 0.75,  // 75% by month 5
  180: 0.81,  // 81% by month 6
  270: 0.91,  // ~91% by month 9
  365: 1.00,  // 100% by 1 year
};

/**
 * Get interpolated decay factor for any day from the curve
 * @param {number} days - Age in days
 * @returns {number} - Decay factor (0-1)
 */
function getDecayFactor(days) {
  if (days >= 365) return 1.0;
  if (days < 0) return ROAS_DECAY_CURVE[0];

  const keys = Object.keys(ROAS_DECAY_CURVE).map(Number).sort((a, b) => a - b);

  for (let i = 0; i < keys.length - 1; i++) {
    if (days >= keys[i] && days < keys[i + 1]) {
      const t = (days - keys[i]) / (keys[i + 1] - keys[i]);
      return ROAS_DECAY_CURVE[keys[i]] + t * (ROAS_DECAY_CURVE[keys[i + 1]] - ROAS_DECAY_CURVE[keys[i]]);
    }
  }

  return ROAS_DECAY_CURVE[keys[keys.length - 1]];
}

/**
 * Predict final ROAS at day 180 and day 365
 * @param {number} currentRoas - Current ROAS for the cohort
 * @param {number} cohortAge - Age of cohort in days
 * @returns {Object} - { predicted_roas_180, predicted_roas_365 }
 */
function predictRoas(currentRoas, cohortAge) {
  if (!currentRoas || currentRoas <= 0 || cohortAge < 0) {
    return { predicted_roas_180: null, predicted_roas_365: null };
  }

  const currentDecayFactor = getDecayFactor(cohortAge);

  if (currentDecayFactor <= 0) {
    return { predicted_roas_180: null, predicted_roas_365: null };
  }

  // Predict final ROAS at 365 days
  const predictedFinalRoas = currentRoas / currentDecayFactor;

  // Get ROAS at day 180 (81% of final)
  const decayFactor180 = getDecayFactor(180);
  const predicted_roas_180 = predictedFinalRoas * decayFactor180;

  // Final ROAS at day 365 is just the predicted final
  const predicted_roas_365 = predictedFinalRoas;

  return {
    predicted_roas_180,
    predicted_roas_365
  };
}

/**
 * Find the day when ROAS will reach 1.0 (payback point)
 * @param {number} currentRoas - Current ROAS for the cohort
 * @param {number} cohortAge - Age of cohort in days
 * @param {number} predictedFinalRoas - Predicted ROAS at day 365
 * @returns {number|null} - Days until payback, or null if never pays back
 */
function findPaybackDays(currentRoas, cohortAge, predictedFinalRoas) {
  if (!predictedFinalRoas || predictedFinalRoas <= 0) return null;
  if (!currentRoas || currentRoas <= 0) return null;

  // If already paid back
  if (currentRoas >= 1.0) {
    // Find when it crossed 1.0 by interpolating
    const keys = Object.keys(ROAS_DECAY_CURVE).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < keys.length; i++) {
      const day = keys[i];
      const roasAtDay = predictedFinalRoas * ROAS_DECAY_CURVE[day];
      if (roasAtDay >= 1.0) {
        if (i === 0) return day;
        const prevDay = keys[i - 1];
        const prevRoas = predictedFinalRoas * ROAS_DECAY_CURVE[prevDay];
        const t = (1.0 - prevRoas) / (roasAtDay - prevRoas);
        return Math.round(prevDay + t * (day - prevDay));
      }
    }
    return 365;
  }

  // If predicted final ROAS at 365 days >= 1.0, find when within the curve
  if (predictedFinalRoas >= 1.0) {
    const keys = Object.keys(ROAS_DECAY_CURVE).map(Number).sort((a, b) => a - b);
    for (let i = 0; i < keys.length; i++) {
      const day = keys[i];
      const roasAtDay = predictedFinalRoas * ROAS_DECAY_CURVE[day];
      if (roasAtDay >= 1.0) {
        if (i === 0) return day;
        const prevDay = keys[i - 1];
        const prevRoas = predictedFinalRoas * ROAS_DECAY_CURVE[prevDay];
        const t = (1.0 - prevRoas) / (roasAtDay - prevRoas);
        return Math.round(prevDay + t * (day - prevDay));
      }
    }
    return 365;
  }

  // Predicted ROAS at 365 days < 1.0 - extrapolate beyond 365 days
  // Calculate yearly ROAS growth rate from the second half of the curve (d180 to d365)
  // Use this rate to project when ROAS would reach 1.0
  const roasAt180 = predictedFinalRoas * 0.81;  // 81% at d180
  const roasAt365 = predictedFinalRoas;         // 100% at d365
  const dailyGrowthRate = (roasAt365 - roasAt180) / (365 - 180);  // Growth per day in second half

  // Project when ROAS will reach 1.0
  const roasNeeded = 1.0 - roasAt365;
  if (dailyGrowthRate <= 0) return null;  // No growth, will never pay back

  const additionalDays = roasNeeded / dailyGrowthRate;
  const paybackDays = Math.round(365 + additionalDays);

  // Cap at 5 years (1825 days) - beyond that is too uncertain
  if (paybackDays > 1825) return null;

  return paybackDays;
}

module.exports = {
  ROAS_DECAY_CURVE,
  getDecayFactor,
  predictRoas,
  findPaybackDays
};
