#!/usr/bin/env node
/**
 * Grid search for optimal retention with time-varying prices/share
 */

const { Client } = require('pg');

const API_BASE = 'http://localhost:3000';
const API_KEY = 'sk_dash_7f3k9m2x5p8q1n4v6b0c';
const WEEKS_PER_MONTH = 4.33;

function getWeeklyRetention(ageMonths, w1, weekly) {
  if (ageMonths <= 0) return 1;
  const ageWeeks = Math.floor(ageMonths * WEEKS_PER_MONTH);
  if (ageWeeks === 0) return 1;
  if (ageWeeks === 1) return w1;
  return w1 * Math.pow(weekly, ageWeeks - 1);
}

function getYearlyRetention(ageMonths, renewal) {
  if (ageMonths < 12) return Math.pow(0.99, ageMonths);
  const yearsCompleted = Math.floor(ageMonths / 12);
  const monthsIntoYear = ageMonths % 12;
  return Math.pow(renewal, yearsCompleted) * Math.pow(0.99, monthsIntoYear);
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
  const client = new Client({
    connectionString: 'postgres://qonversion:qonv_attr_2026@localhost:5433/qonversion_analytics'
  });
  await client.connect();

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

  const response = await fetch(`${API_BASE}/dashboard/backtest`, {
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
  });
  const data = await response.json();
  const historical = data.historical;

  function calculateMAPE12(w1, weekly, yearly) {
    const cohorts = historical.map(h => {
      const md = monthlyData[h.month] || { weeklyShare: 0.80 };
      return {
        month: h.month,
        weeklyInitial: (h.subscribers || 0) * md.weeklyShare,
        yearlyInitial: (h.subscribers || 0) * (1 - md.weeklyShare),
      };
    });

    const errors = [];
    const startIdx = Math.max(0, historical.length - 12);

    for (let idx = startIdx; idx < historical.length; idx++) {
      const h = historical[idx];
      const prices = monthlyData[h.month] || { weeklyPrice: 8.60, yearlyPrice: 57.83 };
      let totalRevenue = 0;

      for (let i = 0; i <= idx; i++) {
        const cohort = cohorts[i];
        const ageMonths = getMonthDiff(h.month, cohort.month);

        const weeklyActive = cohort.weeklyInitial * getWeeklyRetention(ageMonths, w1, weekly);
        const yearlyActive = cohort.yearlyInitial * getYearlyRetention(ageMonths, yearly);

        let weeklyRevenue = weeklyActive * prices.weeklyPrice * WEEKS_PER_MONTH;
        let yearlyRevenue = 0;
        if (ageMonths === 0) {
          yearlyRevenue = cohort.yearlyInitial * prices.yearlyPrice;
        } else if (ageMonths >= 12 && ageMonths % 12 === 0) {
          yearlyRevenue = yearlyActive * prices.yearlyPrice;
        }

        const factor = ageMonths === 0 ? 0.5 : 1.0;
        totalRevenue += (weeklyRevenue + yearlyRevenue) * factor;
      }

      if (h.revenue > 0) {
        errors.push(Math.abs((totalRevenue - h.revenue) / h.revenue));
      }
    }

    return errors.length > 0 ? errors.reduce((a, b) => a + b, 0) / errors.length * 100 : 999;
  }

  console.log('GRID SEARCH (Last 12 months MAPE)\n');

  let bestMAPE = 999;
  let bestParams = null;

  for (let w1 = 35; w1 <= 65; w1 += 5) {
    for (let weekly = 92; weekly <= 99; weekly += 1) {
      for (let yearly = 25; yearly <= 55; yearly += 5) {
        const mape = calculateMAPE12(w1 / 100, weekly / 100, yearly / 100);
        if (mape < bestMAPE) {
          bestMAPE = mape;
          bestParams = { w1, weekly, yearly };
          if (mape < 8) {
            console.log('  W1=' + w1 + '%, Weekly=' + weekly + '%, Yearly=' + yearly + '% → MAPE=' + mape.toFixed(1) + '%');
          }
        }
      }
    }
  }

  console.log('\n=== BEST RESULT ===');
  console.log('W1 Retention: ' + bestParams.w1 + '%');
  console.log('Weekly Retention: ' + bestParams.weekly + '%');
  console.log('Yearly Renewal: ' + bestParams.yearly + '%');
  console.log('MAPE (12mo): ' + bestMAPE.toFixed(1) + '%');
}

main().catch(console.error);
