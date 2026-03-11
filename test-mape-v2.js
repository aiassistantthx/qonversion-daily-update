#!/usr/bin/env node
/**
 * MAPE Test with time-varying prices from database
 */

const { Client } = require('pg');

const API_BASE = 'http://localhost:3000';
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c';

// Model parameters (retention from fitting, prices will be loaded from DB)
const MODEL_DEFAULTS = {
  weeklyW1Retention: 40,
  weeklyWeeklyRetention: 95,
  yearlyRenewalRate: 35,
  weeksPerMonth: 4.33,
  weeklyShare: 95,
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
  if (ageMonths < 12) return Math.pow(0.99, ageMonths);
  const yearsCompleted = Math.floor(ageMonths / 12);
  const monthsIntoYear = ageMonths % 12;
  return Math.pow(renewalRate, yearsCompleted) * Math.pow(0.99, monthsIntoYear);
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
  console.log('COHORT MODEL WITH TIME-VARYING PRICES');
  console.log('='.repeat(60));

  // Connect to DB to get prices by month
  const client = new Client({
    connectionString: 'postgres://qonversion:qonv_attr_2026@localhost:5433/qonversion_analytics'
  });
  await client.connect();

  // Get prices by month
  const pricesResult = await client.query(`
    SELECT
      TO_CHAR(event_date, 'YYYY-MM') as month,
      AVG(price_usd) FILTER (WHERE product_id LIKE '%weekly%') as weekly_price,
      AVG(price_usd) FILTER (WHERE product_id LIKE '%yearly%') as yearly_price
    FROM events_v2
    WHERE event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
      AND refund = false
      AND price_usd > 0
    GROUP BY TO_CHAR(event_date, 'YYYY-MM')
    ORDER BY month
  `);

  const pricesByMonth = {};
  pricesResult.rows.forEach(r => {
    pricesByMonth[r.month] = {
      weekly: parseFloat(r.weekly_price) || 8.60,
      yearly: parseFloat(r.yearly_price) || 57.83,
    };
  });

  await client.end();

  console.log('\nPrices by month (sample):');
  const months = Object.keys(pricesByMonth).sort();
  [months[0], months[Math.floor(months.length/2)], months[months.length-1]].forEach(m => {
    console.log(`  ${m}: weekly=$${pricesByMonth[m].weekly.toFixed(2)}, yearly=$${pricesByMonth[m].yearly.toFixed(2)}`);
  });

  // Fetch historical data
  const response = await fetch(`${API_BASE}/dashboard/backtest`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  });
  const data = await response.json();
  const historical = data.historical;

  console.log(`\nLoaded ${historical.length} months of historical data\n`);

  const w1Retention = MODEL_DEFAULTS.weeklyW1Retention / 100;
  const weeklyRetention = MODEL_DEFAULTS.weeklyWeeklyRetention / 100;
  const renewalRate = MODEL_DEFAULTS.yearlyRenewalRate / 100;
  const weeklyShareFrac = MODEL_DEFAULTS.weeklyShare / 100;

  // Build cohorts
  const cohorts = historical.map(h => ({
    month: h.month,
    weeklyInitial: (h.subscribers || 0) * weeklyShareFrac,
    yearlyInitial: (h.subscribers || 0) * (1 - weeklyShareFrac),
  }));

  // Calculate predicted revenue
  const results = [];

  historical.forEach((h, idx) => {
    let totalWeeklyRevenue = 0;
    let totalYearlyRevenue = 0;

    // Get prices for this month
    const prices = pricesByMonth[h.month] || { weekly: 8.60, yearly: 57.83 };

    for (let i = 0; i <= idx; i++) {
      const cohort = cohorts[i];
      const ageMonths = getMonthDiff(h.month, cohort.month);

      const weeklyRetentionRate = getWeeklyRetention(ageMonths, w1Retention, weeklyRetention);
      const yearlyRetentionRate = getYearlyRetention(ageMonths, renewalRate);

      const weeklyActive = cohort.weeklyInitial * weeklyRetentionRate;
      const yearlyActive = cohort.yearlyInitial * yearlyRetentionRate;

      // Weekly: 4.33 renewals per month
      const weeklyRevenue = weeklyActive * prices.weekly * MODEL_DEFAULTS.weeksPerMonth;

      // Yearly: full price at month 0 and month 12, 24...
      let yearlyRevenue = 0;
      if (ageMonths === 0) {
        yearlyRevenue = cohort.yearlyInitial * prices.yearly;
      } else if (ageMonths >= 12 && ageMonths % 12 === 0) {
        yearlyRevenue = yearlyActive * prices.yearly;
      }

      // First month factor
      const firstMonthFactor = ageMonths === 0 ? 0.5 : 1.0;

      totalWeeklyRevenue += weeklyRevenue * firstMonthFactor;
      totalYearlyRevenue += yearlyRevenue * firstMonthFactor;
    }

    const predicted = totalWeeklyRevenue + totalYearlyRevenue;
    const actual = h.revenue || 0;
    const error = actual > 0 ? ((predicted - actual) / actual * 100) : 0;

    results.push({ month: h.month, actual, predicted, error });
  });

  // Print results
  console.log('MONTH-BY-MONTH RESULTS:');
  console.log('-'.repeat(60));
  console.log('Month      | Actual     | Predicted  | Error');
  console.log('-'.repeat(60));

  results.forEach(r => {
    const actualStr = `$${(r.actual / 1000).toFixed(1)}k`.padStart(10);
    const predictedStr = `$${(r.predicted / 1000).toFixed(1)}k`.padStart(10);
    const errorStr = `${r.error >= 0 ? '+' : ''}${r.error.toFixed(1)}%`.padStart(7);
    console.log(`${r.month}  | ${actualStr} | ${predictedStr} | ${errorStr}`);
  });

  // Calculate MAPE
  function calculateMAPE(data) {
    const validPoints = data.filter(d => d.actual > 0);
    if (validPoints.length === 0) return null;
    return validPoints.reduce((sum, d) => sum + Math.abs(d.error), 0) / validPoints.length;
  }

  const mapeAll = calculateMAPE(results);
  const mape12 = calculateMAPE(results.slice(-12));
  const mape6 = calculateMAPE(results.slice(-6));

  console.log('\n' + '='.repeat(60));
  console.log('MAPE SUMMARY:');
  console.log('='.repeat(60));
  console.log(`  All time (${results.length} months): ${mapeAll?.toFixed(1)}%`);
  console.log(`  Last 12 months: ${mape12?.toFixed(1)}%`);
  console.log(`  Last 6 months:  ${mape6?.toFixed(1)}%`);
}

main().catch(console.error);
