#!/usr/bin/env node
/**
 * MAPE Test Script for Cohort Revenue Model
 * Tests the model against historical data
 */

const API_BASE = 'http://localhost:3000';
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c';

// Model parameters (from cohort data + revenue validation)
const MODEL_DEFAULTS = {
  weeklyW1Retention: 60,           // 60% survive week 1 (from screenshot)
  weeklyWeeklyRetention: 92,       // 92% week-over-week (validated vs revenue)
  yearlyRenewalRate: 45,           // 45% yearly renewal
  weeklyPrice: 8.60,               // Recent avg from DB
  yearlyPrice: 57.83,              // Recent avg from DB
  weeksPerMonth: 4.33,
  weeklyShare: 80,                 // ~80% from DB
};

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
  let retention = Math.pow(renewalRate, yearsCompleted);
  retention *= Math.pow(0.99, monthsIntoYear);
  return retention;
}

function getCohortRevenue(cohort, ageMonths, params) {
  const w1Retention = params.weeklyW1Retention / 100;
  const weeklyRetention = params.weeklyWeeklyRetention / 100;
  const renewalRate = params.yearlyRenewalRate / 100;

  const weeklyRetentionRate = getWeeklyRetention(ageMonths, w1Retention, weeklyRetention);
  const yearlyRetentionRate = getYearlyRetention(ageMonths, renewalRate);

  const weeklyActive = cohort.weeklyInitial * weeklyRetentionRate;
  const yearlyActive = cohort.yearlyInitial * yearlyRetentionRate;

  let weeklyRevenue = 0;
  let yearlyRevenue = 0;

  if (ageMonths === 0) {
    // New cohort - first payment only
    weeklyRevenue = cohort.weeklyInitial * params.weeklyPrice;
    yearlyRevenue = cohort.yearlyInitial * params.yearlyPrice;
  } else {
    // Existing cohorts - weekly renew 4.33 times/month
    weeklyRevenue = weeklyActive * params.weeklyPrice * params.weeksPerMonth;

    // Yearly renewal at month 12, 24, etc.
    if (ageMonths >= 12 && ageMonths % 12 === 0) {
      yearlyRevenue = yearlyActive * params.yearlyPrice;
    }
  }

  return { weeklyRevenue, yearlyRevenue, weeklyActive, yearlyActive };
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

async function main() {
  console.log('='.repeat(60));
  console.log('COHORT MODEL MAPE TEST');
  console.log('='.repeat(60));
  console.log('\nModel Parameters:');
  console.log(`  Weekly W1 Retention: ${MODEL_DEFAULTS.weeklyW1Retention}%`);
  console.log(`  Weekly Week-to-Week: ${MODEL_DEFAULTS.weeklyWeeklyRetention}%`);
  console.log(`  Yearly Renewal Rate: ${MODEL_DEFAULTS.yearlyRenewalRate}%`);
  console.log(`  Weekly Price: $${MODEL_DEFAULTS.weeklyPrice}`);
  console.log(`  Yearly Price: $${MODEL_DEFAULTS.yearlyPrice}`);
  console.log(`  Weekly Share: ${MODEL_DEFAULTS.weeklyShare}%`);
  console.log();

  // Fetch historical data
  const response = await fetch(`${API_BASE}/dashboard/backtest`, {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();
  const historical = data.historical;

  console.log(`Loaded ${historical.length} months of historical data\n`);

  // Build cohorts
  const cohorts = [];
  const weeklyShareFrac = MODEL_DEFAULTS.weeklyShare / 100;

  historical.forEach((h) => {
    const totalSubs = h.subscribers || 0;
    cohorts.push({
      month: h.month,
      weeklyInitial: totalSubs * weeklyShareFrac,
      yearlyInitial: totalSubs * (1 - weeklyShareFrac),
    });
  });

  // Calculate predicted revenue for each historical month
  const results = [];

  historical.forEach((h, idx) => {
    let totalWeeklyRevenue = 0;
    let totalYearlyRevenue = 0;

    // Sum revenue from all cohorts up to and including this month
    for (let i = 0; i <= idx; i++) {
      const cohort = cohorts[i];
      const ageMonths = getMonthDiff(h.month, cohort.month);

      const { weeklyRevenue, yearlyRevenue } = getCohortRevenue(cohort, ageMonths, MODEL_DEFAULTS);

      totalWeeklyRevenue += weeklyRevenue;
      totalYearlyRevenue += yearlyRevenue;
    }

    const predicted = totalWeeklyRevenue + totalYearlyRevenue;
    const actual = h.revenue || 0;
    const error = actual > 0 ? ((predicted - actual) / actual * 100) : 0;

    results.push({
      month: h.month,
      actual,
      predicted,
      error,
      subscribers: h.subscribers || 0,
      spend: h.spend || 0,
    });
  });

  // Print detailed results
  console.log('MONTH-BY-MONTH RESULTS:');
  console.log('-'.repeat(70));
  console.log('Month      | Actual     | Predicted  | Error   | Subs  | Spend');
  console.log('-'.repeat(70));

  results.forEach((r) => {
    const actualStr = `$${(r.actual / 1000).toFixed(1)}k`.padStart(10);
    const predictedStr = `$${(r.predicted / 1000).toFixed(1)}k`.padStart(10);
    const errorStr = `${r.error >= 0 ? '+' : ''}${r.error.toFixed(1)}%`.padStart(7);
    const subsStr = r.subscribers.toString().padStart(5);
    const spendStr = `$${(r.spend / 1000).toFixed(0)}k`.padStart(6);
    console.log(`${r.month}  | ${actualStr} | ${predictedStr} | ${errorStr} | ${subsStr} | ${spendStr}`);
  });

  // Calculate MAPE for different periods
  function calculateMAPE(data) {
    const validPoints = data.filter(d => d.actual > 0);
    if (validPoints.length === 0) return null;
    const totalError = validPoints.reduce((sum, d) => sum + Math.abs(d.error), 0);
    return totalError / validPoints.length;
  }

  const mapeAll = calculateMAPE(results);
  const mape12 = calculateMAPE(results.slice(-12));
  const mape6 = calculateMAPE(results.slice(-6));
  const mape3 = calculateMAPE(results.slice(-3));

  console.log('\n' + '='.repeat(60));
  console.log('MAPE SUMMARY:');
  console.log('='.repeat(60));
  console.log(`  All time (${results.length} months): ${mapeAll?.toFixed(1)}%`);
  console.log(`  Last 12 months: ${mape12?.toFixed(1)}%`);
  console.log(`  Last 6 months:  ${mape6?.toFixed(1)}%`);
  console.log(`  Last 3 months:  ${mape3?.toFixed(1)}%`);
  console.log();

  // Identify largest errors
  const sortedByError = [...results].sort((a, b) => Math.abs(b.error) - Math.abs(a.error));
  console.log('LARGEST ERRORS:');
  console.log('-'.repeat(40));
  sortedByError.slice(0, 5).forEach((r) => {
    console.log(`  ${r.month}: ${r.error >= 0 ? '+' : ''}${r.error.toFixed(1)}% (actual: $${(r.actual/1000).toFixed(1)}k, pred: $${(r.predicted/1000).toFixed(1)}k)`);
  });

  // Check systematic bias
  const avgError = results.reduce((sum, r) => sum + r.error, 0) / results.length;
  console.log(`\nSYSTEMATIC BIAS: ${avgError >= 0 ? '+' : ''}${avgError.toFixed(1)}%`);
  console.log(avgError > 10 ? '  → Model is systematically OVER-predicting' :
              avgError < -10 ? '  → Model is systematically UNDER-predicting' :
              '  → No significant systematic bias');
}

main().catch(console.error);
