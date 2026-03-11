#!/usr/bin/env node
/**
 * CORRECT Revenue Model
 *
 * Revenue sources:
 * 1. Weekly Trial (first payment): new_weekly_subs × weekly_price
 * 2. Weekly Renewals: existing_active_weekly × weekly_price × renewals_per_month
 * 3. Yearly New: new_yearly_subs × yearly_price
 * 4. Yearly Renewals: yearly_subs_at_month_12 × yearly_price
 */

const { Client } = require('pg');

const API_BASE = 'http://localhost:3000';
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c';

// Retention adjusted to match actual active subscriber counts
const W1_RETENTION = 0.60;      // 60% survive week 1 (from screenshot avg)
const WEEKLY_RETENTION = 0.92;  // 92% week-over-week after W1 (adjusted)
const YEARLY_RENEWAL = 0.45;    // 45% yearly renewal
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
  console.log('CORRECT REVENUE MODEL');
  console.log('='.repeat(60));

  const client = new Client({
    connectionString: 'postgres://qonversion:qonv_attr_2026@localhost:5433/qonversion_analytics'
  });
  await client.connect();

  // Get prices and new sub counts by month
  const dataResult = await client.query(`
    SELECT
      TO_CHAR(event_date, 'YYYY-MM') as month,
      AVG(price_usd) FILTER (WHERE product_id LIKE '%weekly%') as weekly_price,
      AVG(price_usd) FILTER (WHERE product_id LIKE '%yearly%') as yearly_price,
      COUNT(*) FILTER (WHERE product_id LIKE '%weekly%' AND event_name = 'Trial Converted') as new_weekly,
      COUNT(*) FILTER (WHERE (event_name = 'Trial Converted' OR event_name = 'Subscription Started') AND product_id LIKE '%yearly%') as new_yearly
    FROM events_v2
    WHERE refund = false
    GROUP BY TO_CHAR(event_date, 'YYYY-MM')
    ORDER BY month
  `);

  const monthlyData = {};
  dataResult.rows.forEach(r => {
    monthlyData[r.month] = {
      weeklyPrice: parseFloat(r.weekly_price) || 8.60,
      yearlyPrice: parseFloat(r.yearly_price) || 57.83,
      newWeekly: parseInt(r.new_weekly) || 0,
      newYearly: parseInt(r.new_yearly) || 0,
    };
  });

  await client.end();

  // Fetch historical data
  const response = await fetch(`${API_BASE}/dashboard/backtest`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  });
  const data = await response.json();
  const historical = data.historical;

  console.log('\nLoaded ' + historical.length + ' months\n');

  // Build cohorts with actual new_weekly and new_yearly counts
  const cohorts = historical.map(h => {
    const md = monthlyData[h.month] || { newWeekly: 0, newYearly: 0 };
    return {
      month: h.month,
      weeklyInitial: md.newWeekly,
      yearlyInitial: md.newYearly,
    };
  });

  // Calculate revenue for each month
  const results = [];

  historical.forEach((h, targetIdx) => {
    const prices = monthlyData[h.month] || { weeklyPrice: 8.60, yearlyPrice: 57.83 };
    const md = monthlyData[h.month] || { newWeekly: 0, newYearly: 0 };

    // 1. Weekly Trial Revenue (first payment from this month's new subs)
    const weeklyTrialRev = md.newWeekly * prices.weeklyPrice;

    // 2. Weekly Renewal Revenue (from previous months' cohorts)
    let weeklyRenewalRev = 0;
    for (let i = 0; i < targetIdx; i++) {
      const cohort = cohorts[i];
      const ageMonths = targetIdx - i;

      // Active weekly at start of this month (before any churn this month)
      const weeklyRet = getWeeklyRetention(ageMonths);
      const weeklyActive = cohort.weeklyInitial * weeklyRet;

      // They renew ~4.33 times this month
      weeklyRenewalRev += weeklyActive * prices.weeklyPrice * WEEKS_PER_MONTH;
    }

    // 3. Yearly New Revenue (upfront from this month's new yearly subs)
    const yearlyNewRev = md.newYearly * prices.yearlyPrice;

    // 4. Yearly Renewal Revenue (from cohorts at month 12, 24, etc.)
    let yearlyRenewalRev = 0;
    for (let i = 0; i < targetIdx; i++) {
      const cohort = cohorts[i];
      const ageMonths = targetIdx - i;

      // Only renew at exactly month 12, 24, etc.
      if (ageMonths >= 12 && ageMonths % 12 === 0) {
        const yearlyRet = getYearlyRetention(ageMonths);
        const yearlyActive = cohort.yearlyInitial * yearlyRet;
        yearlyRenewalRev += yearlyActive * prices.yearlyPrice;
      }
    }

    const predicted = weeklyTrialRev + weeklyRenewalRev + yearlyNewRev + yearlyRenewalRev;
    const actual = h.revenue || 0;
    const error = actual > 0 ? ((predicted - actual) / actual * 100) : 0;

    results.push({
      month: h.month,
      actual,
      predicted,
      error,
      weeklyTrial: weeklyTrialRev,
      weeklyRenewal: weeklyRenewalRev,
      yearlyNew: yearlyNewRev,
      yearlyRenewal: yearlyRenewalRev,
    });
  });

  // Print results
  console.log('RESULTS (Last 12 months):');
  console.log('-'.repeat(80));
  console.log('Month    | Actual | Pred  | Error  | W-Trial | W-Renew | Y-New | Y-Renew');
  console.log('-'.repeat(80));

  results.slice(-12).forEach(r => {
    console.log(
      r.month + ' | $' + Math.round(r.actual/1000) + 'k'.padEnd(4) +
      ' | $' + Math.round(r.predicted/1000) + 'k'.padEnd(3) +
      ' | ' + (r.error >= 0 ? '+' : '') + r.error.toFixed(0) + '%'.padEnd(4) +
      ' | $' + Math.round(r.weeklyTrial/1000) + 'k'.padEnd(5) +
      ' | $' + Math.round(r.weeklyRenewal/1000) + 'k'.padEnd(5) +
      ' | $' + Math.round(r.yearlyNew/1000) + 'k'.padEnd(4) +
      ' | $' + Math.round(r.yearlyRenewal/1000) + 'k'
    );
  });

  // MAPE
  function calculateMAPE(data) {
    const valid = data.filter(d => d.actual > 0);
    return valid.reduce((sum, d) => sum + Math.abs(d.error), 0) / valid.length;
  }

  console.log('\n' + '='.repeat(60));
  console.log('MAPE SUMMARY:');
  console.log('  All time: ' + calculateMAPE(results).toFixed(1) + '%');
  console.log('  Last 12 months: ' + calculateMAPE(results.slice(-12)).toFixed(1) + '%');
  console.log('  Last 6 months:  ' + calculateMAPE(results.slice(-6)).toFixed(1) + '%');
}

main().catch(console.error);
