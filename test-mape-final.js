#!/usr/bin/env node
/**
 * FINAL MAPE Test - time-varying prices AND weekly share from database
 */

const { Client } = require('pg');

const API_BASE = 'http://localhost:3000';
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c';

// Retention parameters (from REAL cohort data - screenshot)
const W1_RETENTION = 0.59;      // 59% survive week 1
const WEEKLY_RETENTION = 0.88;  // 88% week-over-week after W1
const YEARLY_RENEWAL = 0.45;    // 45% renew yearly
const WEEKS_PER_MONTH = 4.33;

function getWeeklyRetention(ageMonths) {
  if (ageMonths <= 0) return 1;
  const ageWeeks = Math.floor(ageMonths * WEEKS_PER_MONTH);
  if (ageWeeks === 0) return 1;
  if (ageWeeks === 1) return W1_RETENTION;
  return W1_RETENTION * Math.pow(WEEKLY_RETENTION, ageWeeks - 1);
}

function getYearlyRetention(ageMonths) {
  if (ageMonths < 12) return Math.pow(0.99, ageMonths);
  const yearsCompleted = Math.floor(ageMonths / 12);
  const monthsIntoYear = ageMonths % 12;
  return Math.pow(YEARLY_RENEWAL, yearsCompleted) * Math.pow(0.99, monthsIntoYear);
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
  console.log('FINAL MODEL: Time-varying prices + weekly share');
  console.log('='.repeat(60));
  console.log('\nRetention parameters:');
  console.log('  W1 Retention: ' + (W1_RETENTION * 100) + '%');
  console.log('  Weekly Retention: ' + (WEEKLY_RETENTION * 100) + '%');
  console.log('  Yearly Renewal: ' + (YEARLY_RENEWAL * 100) + '%');

  const client = new Client({
    connectionString: 'postgres://qonversion:qonv_attr_2026@localhost:5433/qonversion_analytics'
  });
  await client.connect();

  // Get prices and weekly share by month
  const dataResult = await client.query(`
    SELECT
      TO_CHAR(event_date, 'YYYY-MM') as month,
      AVG(price_usd) FILTER (WHERE product_id LIKE '%weekly%') as weekly_price,
      AVG(price_usd) FILTER (WHERE product_id LIKE '%yearly%') as yearly_price,
      COUNT(*) FILTER (WHERE product_id LIKE '%weekly%' AND event_name = 'Trial Converted') as new_weekly,
      COUNT(*) FILTER (WHERE product_id LIKE '%yearly%' AND (event_name = 'Trial Converted' OR event_name = 'Subscription Started')) as new_yearly
    FROM events_v2
    WHERE refund = false
    GROUP BY TO_CHAR(event_date, 'YYYY-MM')
    ORDER BY month
  `);

  const monthlyData = {};
  dataResult.rows.forEach(r => {
    const w = parseInt(r.new_weekly) || 0;
    const y = parseInt(r.new_yearly) || 0;
    const total = w + y;
    monthlyData[r.month] = {
      weeklyPrice: parseFloat(r.weekly_price) || 8.60,
      yearlyPrice: parseFloat(r.yearly_price) || 57.83,
      weeklyShare: total > 0 ? w / total : 0.80,
    };
  });

  await client.end();

  // Fetch historical data from API
  const response = await fetch(`${API_BASE}/dashboard/backtest`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  });
  const data = await response.json();
  const historical = data.historical;

  console.log('\nLoaded ' + historical.length + ' months of historical data\n');

  // Build cohorts with per-month weekly share
  const cohorts = historical.map(h => {
    const md = monthlyData[h.month] || { weeklyShare: 0.80 };
    const totalSubs = h.subscribers || 0;
    return {
      month: h.month,
      weeklyInitial: totalSubs * md.weeklyShare,
      yearlyInitial: totalSubs * (1 - md.weeklyShare),
    };
  });

  // Calculate predicted revenue
  const results = [];

  historical.forEach((h, idx) => {
    let totalWeeklyRevenue = 0;
    let totalYearlyRevenue = 0;

    const prices = monthlyData[h.month] || { weeklyPrice: 8.60, yearlyPrice: 57.83 };

    for (let i = 0; i <= idx; i++) {
      const cohort = cohorts[i];
      const ageMonths = getMonthDiff(h.month, cohort.month);

      const weeklyRetentionRate = getWeeklyRetention(ageMonths);
      const yearlyRetentionRate = getYearlyRetention(ageMonths);

      const weeklyActive = cohort.weeklyInitial * weeklyRetentionRate;
      const yearlyActive = cohort.yearlyInitial * yearlyRetentionRate;

      // Weekly: 4.33 renewals per month
      const weeklyRevenue = weeklyActive * prices.weeklyPrice * WEEKS_PER_MONTH;

      // Yearly: full price at month 0 and renewals at 12, 24...
      let yearlyRevenue = 0;
      if (ageMonths === 0) {
        yearlyRevenue = cohort.yearlyInitial * prices.yearlyPrice;
      } else if (ageMonths >= 12 && ageMonths % 12 === 0) {
        yearlyRevenue = yearlyActive * prices.yearlyPrice;
      }

      const firstMonthFactor = ageMonths === 0 ? 0.5 : 1.0;
      totalWeeklyRevenue += weeklyRevenue * firstMonthFactor;
      totalYearlyRevenue += yearlyRevenue * firstMonthFactor;
    }

    const predicted = totalWeeklyRevenue + totalYearlyRevenue;
    const actual = h.revenue || 0;
    const error = actual > 0 ? ((predicted - actual) / actual * 100) : 0;

    results.push({ month: h.month, actual, predicted, error, weeklyRev: totalWeeklyRevenue, yearlyRev: totalYearlyRevenue });
  });

  // Print results
  console.log('MONTH-BY-MONTH RESULTS:');
  console.log('-'.repeat(70));
  console.log('Month    | Actual  | Predicted | Error  | W-Rev   | Y-Rev');
  console.log('-'.repeat(70));

  results.forEach(r => {
    console.log(
      r.month + ' | $' + Math.round(r.actual/1000) + 'k'.padEnd(4) +
      ' | $' + Math.round(r.predicted/1000) + 'k'.padEnd(6) +
      ' | ' + (r.error >= 0 ? '+' : '') + r.error.toFixed(1) + '%'.padEnd(4) +
      ' | $' + Math.round(r.weeklyRev/1000) + 'k'.padEnd(4) +
      ' | $' + Math.round(r.yearlyRev/1000) + 'k'
    );
  });

  // MAPE
  function calculateMAPE(data) {
    const valid = data.filter(d => d.actual > 0);
    return valid.reduce((sum, d) => sum + Math.abs(d.error), 0) / valid.length;
  }

  const mapeAll = calculateMAPE(results);
  const mape12 = calculateMAPE(results.slice(-12));
  const mape6 = calculateMAPE(results.slice(-6));
  const mape3 = calculateMAPE(results.slice(-3));

  console.log('\n' + '='.repeat(60));
  console.log('MAPE SUMMARY:');
  console.log('='.repeat(60));
  console.log('  All time (' + results.length + ' months): ' + mapeAll.toFixed(1) + '%');
  console.log('  Last 12 months: ' + mape12.toFixed(1) + '%');
  console.log('  Last 6 months:  ' + mape6.toFixed(1) + '%');
  console.log('  Last 3 months:  ' + mape3.toFixed(1) + '%');

  // Systematic bias
  const avgError = results.reduce((sum, r) => sum + r.error, 0) / results.length;
  console.log('\nSystematic bias: ' + (avgError >= 0 ? '+' : '') + avgError.toFixed(1) + '%');
}

main().catch(console.error);
