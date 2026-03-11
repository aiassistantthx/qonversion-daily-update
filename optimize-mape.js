#!/usr/bin/env node
/**
 * Find optimal retention parameters by grid search
 * Goal: minimize MAPE using ONLY real data-derived parameters
 */

const API_BASE = 'http://localhost:3000';
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c';

// Fixed parameters from database (can't change these - they're real data)
const WEEKLY_PRICE = 8.60;      // Recent avg from DB
const YEARLY_PRICE = 57.83;     // Recent avg from DB
const WEEKS_PER_MONTH = 4.33;
const WEEKLY_SHARE = 0.95;      // From DB

// Retention functions
function getWeeklyRetention(ageMonths, w1Retention, weeklyRetention) {
  if (ageMonths <= 0) return 1;
  const ageWeeks = Math.floor(ageMonths * 4.33);
  if (ageWeeks === 0) return 1;
  if (ageWeeks === 1) return w1Retention;
  return w1Retention * Math.pow(weeklyRetention, ageWeeks - 1);
}

function getYearlyRetention(ageMonths, renewalRate) {
  if (ageMonths < 12) {
    return Math.pow(0.99, ageMonths);
  }
  const yearsCompleted = Math.floor(ageMonths / 12);
  const monthsIntoYear = ageMonths % 12;
  return Math.pow(renewalRate, yearsCompleted) * Math.pow(0.99, monthsIntoYear);
}

function getCohortRevenue(cohort, ageMonths, params) {
  const weeklyRetentionRate = getWeeklyRetention(ageMonths, params.w1Retention, params.weeklyRetention);
  const yearlyRetentionRate = getYearlyRetention(ageMonths, params.yearlyRenewal);

  const weeklyActive = cohort.weeklyInitial * weeklyRetentionRate;
  const yearlyActive = cohort.yearlyInitial * yearlyRetentionRate;

  const weeklyRevenue = weeklyActive * WEEKLY_PRICE * WEEKS_PER_MONTH;
  const yearlyRevenue = yearlyActive * (YEARLY_PRICE / 12);

  return { weeklyRevenue, yearlyRevenue };
}

function parseMonth(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

function getMonthDiff(targetMonth, cohortMonth) {
  const target = parseMonth(targetMonth);
  const cohort = parseMonth(cohortMonth);
  return (target.getFullYear() - cohort.getFullYear()) * 12 + (target.getMonth() - cohort.getMonth());
}

function calculateMAPE(historical, params) {
  const cohorts = [];

  historical.forEach((h) => {
    const totalSubs = h.subscribers || 0;
    cohorts.push({
      month: h.month,
      weeklyInitial: totalSubs * WEEKLY_SHARE,
      yearlyInitial: totalSubs * (1 - WEEKLY_SHARE),
    });
  });

  const errors = [];

  // Only use last 12 months for MAPE
  const startIdx = Math.max(0, historical.length - 12);

  for (let idx = startIdx; idx < historical.length; idx++) {
    const h = historical[idx];
    let totalRevenue = 0;

    for (let i = 0; i <= idx; i++) {
      const cohort = cohorts[i];
      const ageMonths = getMonthDiff(h.month, cohort.month);
      const { weeklyRevenue, yearlyRevenue } = getCohortRevenue(cohort, ageMonths, params);
      const firstMonthFactor = ageMonths === 0 ? 0.5 : 1.0;
      totalRevenue += (weeklyRevenue + yearlyRevenue) * firstMonthFactor;
    }

    if (h.revenue > 0) {
      const error = Math.abs((totalRevenue - h.revenue) / h.revenue);
      errors.push(error);
    }
  }

  return errors.length > 0 ? errors.reduce((a, b) => a + b, 0) / errors.length * 100 : 999;
}

async function main() {
  console.log('=== GRID SEARCH FOR OPTIMAL RETENTION ===\n');
  console.log('Fixed parameters (from DB):');
  console.log(`  Weekly price: $${WEEKLY_PRICE}`);
  console.log(`  Yearly price: $${YEARLY_PRICE}`);
  console.log(`  Weekly share: ${WEEKLY_SHARE * 100}%\n`);

  const response = await fetch(`${API_BASE}/dashboard/backtest`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  });
  const data = await response.json();
  const historical = data.historical;

  console.log(`Testing on ${historical.length} months of data\n`);

  let bestMAPE = 999;
  let bestParams = null;

  // Grid search over retention parameters
  // W1 retention: 30% to 70%
  // Weekly retention: 85% to 99%
  // Yearly renewal: 20% to 60%

  for (let w1 = 30; w1 <= 70; w1 += 5) {
    for (let weekly = 85; weekly <= 99; weekly += 2) {
      for (let yearly = 20; yearly <= 70; yearly += 5) {
        const params = {
          w1Retention: w1 / 100,
          weeklyRetention: weekly / 100,
          yearlyRenewal: yearly / 100,
        };

        const mape = calculateMAPE(historical, params);

        if (mape < bestMAPE) {
          bestMAPE = mape;
          bestParams = { w1, weekly, yearly };
          if (mape < 12) {
            console.log(`  Found: W1=${w1}%, Weekly=${weekly}%, Yearly=${yearly}% → MAPE=${mape.toFixed(1)}%`);
          }
        }
      }
    }
  }

  console.log('\n=== BEST RESULT ===');
  console.log(`W1 Retention: ${bestParams.w1}%`);
  console.log(`Weekly Retention: ${bestParams.weekly}%`);
  console.log(`Yearly Renewal: ${bestParams.yearly}%`);
  console.log(`MAPE (12mo): ${bestMAPE.toFixed(1)}%`);

  // Test detailed results with best params
  console.log('\n=== DETAILED RESULTS WITH BEST PARAMS ===');
  const params = {
    w1Retention: bestParams.w1 / 100,
    weeklyRetention: bestParams.weekly / 100,
    yearlyRenewal: bestParams.yearly / 100,
  };

  const cohorts = [];
  historical.forEach((h) => {
    cohorts.push({
      month: h.month,
      weeklyInitial: (h.subscribers || 0) * WEEKLY_SHARE,
      yearlyInitial: (h.subscribers || 0) * (1 - WEEKLY_SHARE),
    });
  });

  console.log('\nLast 12 months:');
  const last12 = historical.slice(-12);
  last12.forEach((h, relIdx) => {
    const idx = historical.length - 12 + relIdx;
    let totalRevenue = 0;

    for (let i = 0; i <= idx; i++) {
      const cohort = cohorts[i];
      const ageMonths = getMonthDiff(h.month, cohort.month);
      const { weeklyRevenue, yearlyRevenue } = getCohortRevenue(cohort, ageMonths, params);
      const firstMonthFactor = ageMonths === 0 ? 0.5 : 1.0;
      totalRevenue += (weeklyRevenue + yearlyRevenue) * firstMonthFactor;
    }

    const error = h.revenue > 0 ? ((totalRevenue - h.revenue) / h.revenue * 100).toFixed(1) : '-';
    console.log(`  ${h.month}: actual=$${(h.revenue/1000).toFixed(1)}k, pred=$${(totalRevenue/1000).toFixed(1)}k, error=${error}%`);
  });
}

main().catch(console.error);
