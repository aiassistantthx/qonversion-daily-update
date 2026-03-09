const express = require('express');
const db = require('../db');

const router = express.Router();

// Helper: format date
const formatDate = (d) => d.toISOString().split('T')[0];
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
};

// COP decay curve - % of final conversions by cohort age (based on historical data)
// Used to predict final COP from early cohort data
// Data from /dashboard/debug-conversion-delay analysis (13K+ users, Jan 2025+)
const COP_DECAY_CURVE = {
  0: 0.154,   // 15.4% - immediate yearly conversions
  1: 0.158,
  2: 0.162,
  3: 0.576,   // 57.6% - trial end spike (day 3)
  4: 0.606,
  5: 0.629,
  6: 0.653,
  7: 0.669,   // 66.9% by week 1
  10: 0.700,
  14: 0.736,  // 73.6% by week 2
  21: 0.785,  // 78.5% by week 3
  28: 0.819,  // 81.9% by week 4
  30: 0.829,  // 82.9% by day 30
  45: 0.877,  // ~88% by 6 weeks
  60: 0.907,  // 90.7% by 2 months
  90: 0.942,  // ~94% by 3 months
  120: 0.960, // ~96% by 4 months
  180: 0.980, // ~98% by 6 months
  365: 1.00,  // 100% by 1 year
};

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

// Get interpolated decay factor for any day from a curve
const getDecayFactor = (days, curve = COP_DECAY_CURVE) => {
  if (days >= 365) return 1.0;
  if (days < 0) return curve[Object.keys(curve)[0]];
  const keys = Object.keys(curve).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (days >= keys[i] && days < keys[i + 1]) {
      const t = (days - keys[i]) / (keys[i + 1] - keys[i]);
      return curve[keys[i]] + t * (curve[keys[i + 1]] - curve[keys[i]]);
    }
  }
  return curve[keys[keys.length - 1]];
};

// Get ROAS decay factor
const getRoasDecayFactor = (days) => getDecayFactor(days, ROAS_DECAY_CURVE);

// Find days when ROAS reaches target using the decay curve
// Extrapolates beyond 365 days if needed
const findPaybackDays = (currentRoas, currentDays, predictedFinalRoas) => {
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
};

// Legacy function for backward compatibility - find when ROAS reaches target within curve
const findPaybackDaysWithinCurve = (currentRoas, currentDays, predictedFinalRoas) => {
  if (!predictedFinalRoas || predictedFinalRoas <= 0) return null;
  if (predictedFinalRoas < 1.0) return null;

  // Will pay back - find when by interpolating the curve
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

  return null; // Never pays back within 365 days
};

// ============================================
// MAIN DASHBOARD ENDPOINT
// ============================================

router.get('/main', async (req, res) => {
  try {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const currentDay = today.getDate();

    // Previous month for comparison
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDays = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();

    // ---- CURRENT MONTH METRICS ----

    // Spend this month (from apple_ads_campaigns)
    const spendQuery = `
      SELECT COALESCE(SUM(spend), 0) as spend
      FROM apple_ads_campaigns
      WHERE TO_CHAR(date, 'YYYY-MM') = $1
    `;
    const spendResult = await db.query(spendQuery, [currentMonth]);
    const monthSpend = parseFloat(spendResult.rows[0]?.spend) || 0;

    // Revenue this month (only actual revenue events) - total revenue
    const revenueQuery = `
      SELECT COALESCE(SUM(price_usd), 0) as revenue
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = false
        AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
    `;
    const revenueResult = await db.query(revenueQuery, [currentMonth]);
    const monthRevenue = parseFloat(revenueResult.rows[0]?.revenue) || 0;

    // Cohort revenue from Apple Ads users (for ROAS calculation)
    // Revenue from users who installed THIS month AND came from Apple Ads
    const cohortRevenueQuery = `
      SELECT COALESCE(SUM(price_usd), 0) as revenue
      FROM events_v2
      WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
        AND media_source = 'Apple AdServices'
        AND refund = false
        AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
    `;
    const cohortRevenueResult = await db.query(cohortRevenueQuery, [currentMonth]);
    const monthCohortRevenue = parseFloat(cohortRevenueResult.rows[0]?.revenue) || 0;

    // New subscribers this month (trial_converted + subscription_started for yearly)
    const subscribersQuery = `
      SELECT COUNT(DISTINCT q_user_id) as subscribers
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND (
          event_name = 'Trial Converted'
          OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
        )
    `;
    const subscribersResult = await db.query(subscribersQuery, [currentMonth]);
    const monthSubscribers = parseInt(subscribersResult.rows[0]?.subscribers) || 0;

    // COHORT COP calculation (excluding last 4 days for closed cohorts)
    // Group by install_date (cohort), not event_date
    const copQuery = `
      WITH cohort_conversions AS (
        SELECT
          DATE(install_date) as cohort_day,
          COUNT(DISTINCT q_user_id) as subscribers
        FROM events_v2
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '4 days'
          AND (
            event_name = 'Trial Converted'
            OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          )
        GROUP BY DATE(install_date)
      ),
      daily_spend AS (
        SELECT date as day, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE TO_CHAR(date, 'YYYY-MM') = $1
          AND date <= CURRENT_DATE - INTERVAL '4 days'
        GROUP BY date
      )
      SELECT
        COALESCE(SUM(ds.spend), 0) as total_spend,
        COALESCE(SUM(cc.subscribers), 0) as total_subscribers
      FROM daily_spend ds
      LEFT JOIN cohort_conversions cc ON ds.day = cc.cohort_day
    `;
    const copResult = await db.query(copQuery, [currentMonth]);
    const copSpend = parseFloat(copResult.rows[0]?.total_spend) || 0;
    const copSubs = parseInt(copResult.rows[0]?.total_subscribers) || 0;
    const cop = copSubs > 0 ? copSpend / copSubs : null;

    // COHORT COP 3d (cohorts from 7 to 4 days ago - closed cohorts)
    const cop3dQuery = `
      WITH period AS (
        SELECT
          CURRENT_DATE - INTERVAL '7 days' as start_date,
          CURRENT_DATE - INTERVAL '4 days' as end_date
      ),
      subs AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM events_v2, period
        WHERE DATE(install_date) BETWEEN start_date AND end_date
          AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
      ),
      spend AS (
        SELECT COALESCE(SUM(spend), 0) as total
        FROM apple_ads_campaigns, period
        WHERE date BETWEEN start_date AND end_date
      )
      SELECT spend.total as spend, subs.cnt as subs FROM spend, subs
    `;
    const cop3dResult = await db.query(cop3dQuery);
    const cop3dSpend = parseFloat(cop3dResult.rows[0]?.spend) || 0;
    const cop3dSubs = parseInt(cop3dResult.rows[0]?.subs) || 0;
    const cop3d = cop3dSubs > 0 ? cop3dSpend / cop3dSubs : null;

    // COHORT COP 7d (cohorts from 11 to 4 days ago - closed cohorts)
    const cop7dQuery = `
      WITH period AS (
        SELECT
          CURRENT_DATE - INTERVAL '11 days' as start_date,
          CURRENT_DATE - INTERVAL '4 days' as end_date
      ),
      subs AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM events_v2, period
        WHERE DATE(install_date) BETWEEN start_date AND end_date
          AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
      ),
      spend AS (
        SELECT COALESCE(SUM(spend), 0) as total
        FROM apple_ads_campaigns, period
        WHERE date BETWEEN start_date AND end_date
      )
      SELECT spend.total as spend, subs.cnt as subs FROM spend, subs
    `;
    const cop7dResult = await db.query(cop7dQuery);
    const cop7dSpend = parseFloat(cop7dResult.rows[0]?.spend) || 0;
    const cop7dSubs = parseInt(cop7dResult.rows[0]?.subs) || 0;
    const cop7d = cop7dSubs > 0 ? cop7dSpend / cop7dSubs : null;

    // COHORT CR to paid (trial_converted / trial_started, by install_date cohort)
    // Exclude last 4 days (trial is 3 days, need time for conversion)
    const crQuery = `
      WITH cohort_trials AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM events_v2
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '4 days'
          AND event_name = 'Trial Started'
      ),
      cohort_converted AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM events_v2
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '4 days'
          AND event_name = 'Trial Converted'
      )
      SELECT cohort_trials.cnt as trials, cohort_converted.cnt as converted
      FROM cohort_trials, cohort_converted
    `;
    const crResult = await db.query(crQuery, [currentMonth]);
    const trials = parseInt(crResult.rows[0]?.trials) || 0;
    const converted = parseInt(crResult.rows[0]?.converted) || 0;
    const crToPaid = trials > 0 ? (converted / trials) * 100 : null;

    // ---- PREVIOUS MONTH METRICS (for comparison) ----
    // Spend
    const prevSpendResult = await db.query(spendQuery, [prevMonth]);
    const prevMonthSpend = parseFloat(prevSpendResult.rows[0]?.spend) || 0;

    // Revenue
    const prevRevenueResult = await db.query(revenueQuery, [prevMonth]);
    const prevMonthRevenue = parseFloat(prevRevenueResult.rows[0]?.revenue) || 0;

    // Cohort revenue from Apple Ads (for ROAS comparison)
    const prevCohortRevenueResult = await db.query(cohortRevenueQuery, [prevMonth]);
    const prevMonthCohortRevenue = parseFloat(prevCohortRevenueResult.rows[0]?.revenue) || 0;

    // Subscribers
    const prevSubscribersResult = await db.query(subscribersQuery, [prevMonth]);
    const prevMonthSubscribers = parseInt(prevSubscribersResult.rows[0]?.subscribers) || 0;

    // COP (full month, closed cohorts)
    const prevCopQuery = `
      WITH cohort_conversions AS (
        SELECT COUNT(DISTINCT q_user_id) as subscribers
        FROM events_v2
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND (
            event_name = 'Trial Converted'
            OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          )
      ),
      monthly_spend AS (
        SELECT COALESCE(SUM(spend), 0) as spend
        FROM apple_ads_campaigns
        WHERE TO_CHAR(date, 'YYYY-MM') = $1
      )
      SELECT spend, subscribers FROM monthly_spend, cohort_conversions
    `;
    const prevCopResult = await db.query(prevCopQuery, [prevMonth]);
    const prevCopSpend = parseFloat(prevCopResult.rows[0]?.spend) || 0;
    const prevCopSubs = parseInt(prevCopResult.rows[0]?.subscribers) || 0;
    const prevCop = prevCopSubs > 0 ? prevCopSpend / prevCopSubs : null;

    // CR to Paid (full previous month)
    const prevCrQuery = `
      WITH cohort_trials AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM events_v2
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND event_name = 'Trial Started'
      ),
      cohort_converted AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM events_v2
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND event_name = 'Trial Converted'
      )
      SELECT cohort_trials.cnt as trials, cohort_converted.cnt as converted
      FROM cohort_trials, cohort_converted
    `;
    const prevCrResult = await db.query(prevCrQuery, [prevMonth]);
    const prevTrials = parseInt(prevCrResult.rows[0]?.trials) || 0;
    const prevConverted = parseInt(prevCrResult.rows[0]?.converted) || 0;
    const prevCrToPaid = prevTrials > 0 ? (prevConverted / prevTrials) * 100 : null;

    // Calculate ROAS (cohort-based, Apple Ads only)
    const roas = monthSpend > 0 ? monthCohortRevenue / monthSpend : null;
    const prevRoas = prevMonthSpend > 0 ? prevMonthCohortRevenue / prevMonthSpend : null;

    // Calculate % changes (normalized to same day of month for fair comparison)
    const normFactor = currentDay / prevMonthDays;
    const spendChange = prevMonthSpend > 0 ? ((monthSpend / (prevMonthSpend * normFactor)) - 1) * 100 : null;
    const revenueChange = prevMonthRevenue > 0 ? ((monthRevenue / (prevMonthRevenue * normFactor)) - 1) * 100 : null;
    const subscribersChange = prevMonthSubscribers > 0 ? ((monthSubscribers / (prevMonthSubscribers * normFactor)) - 1) * 100 : null;
    const copChange = prevCop && cop ? ((cop / prevCop) - 1) * 100 : null;
    const crChange = prevCrToPaid && crToPaid ? ((crToPaid / prevCrToPaid) - 1) * 100 : null;
    // ROAS change - NOT normalized by day (ratio metric)
    const roasChange = prevRoas && roas ? ((roas / prevRoas) - 1) * 100 : null;

    // Forecasts
    const avgDailySpend = currentDay > 0 ? monthSpend / currentDay : 0;
    const avgDailyRevenue = currentDay > 0 ? monthRevenue / currentDay : 0;
    const forecastSpend = avgDailySpend * daysInMonth;
    const forecastRevenue = avgDailyRevenue * daysInMonth;

    // Calculate predicted COP for current month cohorts
    // Average cohort age for current month = currentDay / 2 (mid-point)
    const avgCohortAge = Math.floor(currentDay / 2);
    const currentDecayFactor = getDecayFactor(avgCohortAge);
    const predictedMonthSubs = monthSubscribers > 0 ? monthSubscribers / currentDecayFactor : 0;
    const predictedCop = predictedMonthSubs > 0 ? monthSpend / predictedMonthSubs : null;

    // Predicted ROAS for current month cohort (Apple Ads)
    // Based on current cohort revenue and decay factor
    const predictedRoas = monthSpend > 0 && monthCohortRevenue > 0
      ? (monthCohortRevenue / currentDecayFactor) / monthSpend
      : null;

    // Payback calculation - estimate when ROAS reaches 1x
    // Based on historical data, payback is typically 4-6 months for healthy cohorts
    let paybackMonths = null;
    if (predictedRoas) {
      if (predictedRoas >= 1) {
        // Will break even - estimate based on decay curve
        // At decay factor 0.83 (30 days), if predicted ROAS >= 1, breakeven around 4-5 months
        paybackMonths = Math.round(30 / currentDecayFactor / 30); // Rough estimate
        if (paybackMonths < 1) paybackMonths = 1;
        if (paybackMonths > 12) paybackMonths = 12;
      } else {
        // Won't break even within a year
        paybackMonths = null;
      }
    }

    // Also calculate forecast subscribers (current + expected additional conversions)
    const forecastSubscribers = Math.round(predictedMonthSubs);

    // ---- DAILY DATA (last 30 days) ----
    // Revenue by event_date, but cohort conversions by install_date
    const dailyQuery = `
      WITH daily_revenue AS (
        SELECT
          DATE(event_date) as day,
          SUM(price_usd) FILTER (
            WHERE refund = false
            AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
          ) as revenue
        FROM events_v2
        WHERE event_date >= CURRENT_DATE - INTERVAL '34 days'
        GROUP BY DATE(event_date)
      ),
      cohort_conversions AS (
        SELECT
          DATE(install_date) as cohort_day,
          COUNT(DISTINCT q_user_id) as subscribers
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '34 days'
          AND (
            event_name = 'Trial Converted'
            OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          )
        GROUP BY DATE(install_date)
      ),
      daily_spend AS (
        SELECT date as day, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '34 days'
        GROUP BY date
      )
      SELECT
        ds.day,
        COALESCE(dr.revenue, 0) as revenue,
        COALESCE(cc.subscribers, 0) as subscribers,
        COALESCE(ds.spend, 0) as spend
      FROM daily_spend ds
      LEFT JOIN daily_revenue dr ON ds.day = dr.day
      LEFT JOIN cohort_conversions cc ON ds.day = cc.cohort_day
      ORDER BY ds.day DESC
      LIMIT 34
    `;
    const dailyResult = await db.query(dailyQuery);

    // Calculate COHORT COP for each day with predicted final COP
    const todayForCohort = new Date();
    todayForCohort.setHours(0, 0, 0, 0);

    const dailyData = dailyResult.rows.map(row => {
      const dayDate = new Date(row.day);
      dayDate.setHours(0, 0, 0, 0);
      const cohortAge = Math.floor((todayForCohort - dayDate) / (1000 * 60 * 60 * 24));
      const spend = parseFloat(row.spend) || 0;
      const subs = parseInt(row.subscribers) || 0;

      // Current COP (actual conversions so far)
      const currentCop = subs > 0 ? spend / subs : null;

      // Predicted final COP based on decay curve
      // Shows what COP will be once all conversions arrive
      const decayFactor = getDecayFactor(cohortAge);
      const predictedFinalSubs = subs > 0 ? subs / decayFactor : 0;
      const predictedCop = predictedFinalSubs > 0 ? spend / predictedFinalSubs : null;

      return {
        date: formatDate(row.day),
        revenue: parseFloat(row.revenue) || 0,
        spend,
        subscribers: subs,
        cohortAge,
        cop: currentCop,  // Always show actual COP (will decrease over time)
        copPredicted: predictedCop,  // Always show predicted final COP
        roas: cohortAge >= 4 && spend > 0 ? parseFloat(row.revenue) / spend : null,
      };
    }).reverse();

    // ---- MONTHLY DATA (COHORT-BASED) ----
    // ROAS here is total (all traffic), marketing section below shows Apple Ads only
    const monthsBack = parseInt(req.query.months) || 12;
    const monthlyQuery = `
      WITH cohort_revenue AS (
        -- Revenue from ALL users by their install month (cohort revenue)
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as month,
          SUM(price_usd) FILTER (
            WHERE refund = false
            AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
          ) as revenue
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
        GROUP BY TO_CHAR(install_date, 'YYYY-MM')
      ),
      cohort_metrics AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as month,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Started') as trials,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted') as converted,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE event_name = 'Trial Converted'
            OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          ) as subscribers
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY TO_CHAR(install_date, 'YYYY-MM')
      ),
      monthly_spend AS (
        SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
      )
      SELECT
        ms.month,
        COALESCE(cr.revenue, 0) as revenue,
        COALESCE(cm.trials, 0) as trials,
        COALESCE(cm.converted, 0) as converted,
        COALESCE(cm.subscribers, 0) as subscribers,
        COALESCE(ms.spend, 0) as spend
      FROM monthly_spend ms
      LEFT JOIN cohort_revenue cr ON ms.month = cr.month
      LEFT JOIN cohort_metrics cm ON ms.month = cm.month
      ORDER BY ms.month DESC
      LIMIT ${monthsBack}
    `;
    const monthlyResult = await db.query(monthlyQuery);

    const monthlyData = monthlyResult.rows.map(row => {
      const spend = parseFloat(row.spend) || 0;
      const subs = parseInt(row.subscribers) || 0;
      const trials = parseInt(row.trials) || 0;
      const converted = parseInt(row.converted) || 0;
      const revenue = parseFloat(row.revenue) || 0;
      const currentCop = subs > 0 ? spend / subs : null;

      // Calculate cohort age properly
      // Monthly data only includes closed cohorts (installed 7+ days ago)
      // So we calculate age from the END of the month to today
      const [year, month] = row.month.split('-').map(Number);
      const isCurrentMonth = row.month === currentMonth;

      let avgCohortAgeDays;
      if (isCurrentMonth) {
        // For current month, data only includes first few days (closed cohorts)
        // Average cohort age = days since start of month + 7 (closed cohort offset) / 2
        // But this data is too incomplete for prediction - skip prediction
        avgCohortAgeDays = 7; // Minimum closed cohort age
      } else {
        // For past months, calculate days from mid-month to today
        const monthEndDate = new Date(year, month, 0); // Last day of month
        const monthMidDate = new Date(year, month - 1, 15);
        const daysSinceMonthEnd = Math.floor((today - monthEndDate) / (1000 * 60 * 60 * 24));
        avgCohortAgeDays = daysSinceMonthEnd + 15; // Mid-month approximation
      }

      // Only predict COP for months with enough data (at least 30 days old)
      const decayFactor = getDecayFactor(avgCohortAgeDays);
      const predictedSubs = subs > 0 ? subs / decayFactor : 0;
      // Don't show predicted COP for current month (data too incomplete)
      const predictedCop = !isCurrentMonth && predictedSubs > 0 ? spend / predictedSubs : null;

      return {
        month: row.month,
        revenue,
        spend,
        trials,
        converted,
        subscribers: subs,
        cop: currentCop,  // Always show actual COP
        copPredicted: predictedCop,  // Predicted COP (null for current month - will be replaced below)
        crToPaid: trials > 0 ? (converted / trials) * 100 : null,
        roas: spend > 0 ? revenue / spend : null,
      };
    }).reverse();

    // Replace current month in monthly data with full data (not just closed cohorts)
    const currentMonthIdx = monthlyData.findIndex(m => m.month === currentMonth);
    if (currentMonthIdx >= 0) {
      // Replace with full current month data
      monthlyData[currentMonthIdx] = {
        ...monthlyData[currentMonthIdx],
        spend: monthSpend,
        revenue: monthRevenue,
        subscribers: monthSubscribers,
        cop: monthSubscribers > 0 ? monthSpend / monthSubscribers : null,
        copPredicted: predictedCop, // Use the correctly calculated predicted COP
        roas: monthSpend > 0 ? monthRevenue / monthSpend : null,  // Total ROAS (all traffic)
      };
    } else {
      // Add current month if not in array
      monthlyData.push({
        month: currentMonth,
        revenue: monthRevenue,
        spend: monthSpend,
        trials: 0,
        converted: 0,
        subscribers: monthSubscribers,
        cop: monthSubscribers > 0 ? monthSpend / monthSubscribers : null,
        copPredicted: predictedCop,
        crToPaid: crToPaid,
        roas: monthSpend > 0 ? monthRevenue / monthSpend : null,  // Total ROAS (all traffic)
      });
    }

    res.json({
      currentMonth: {
        month: currentMonth,
        spend: monthSpend,
        spendChange,
        revenue: monthRevenue,
        revenueChange,
        cohortRevenue: monthCohortRevenue,  // Apple Ads users revenue (for ROAS)
        subscribers: monthSubscribers,
        subscribersChange,
        cop,
        copChange,
        cop3d,
        cop7d,
        crToPaid,
        crChange,
        roas,         // Cohort ROAS (Apple Ads only)
        roasChange,
        predictedRoas,  // Predicted final ROAS for current month
        forecastSpend,
        forecastRevenue,
        predictedCop,
        forecastSubscribers,
        paybackMonths,
      },
      daily: dailyData,
      monthly: monthlyData,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MARKETING ANALYTICS ENDPOINT
// COP and ROAS at different cohort ages (4, 7, 30, 60, 180 days)
// Only Apple Ads users (media_source = 'Apple AdServices')
// ============================================
router.get('/marketing', async (req, res) => {
  try {
    const cohortAges = [4, 7, 30, 60, 180];
    const monthsBack = parseInt(req.query.months) || 6;

    // Get monthly marketing metrics at different cohort ages
    // IMPORTANT: Filter only Apple Ads users (media_source = 'Apple AdServices')
    const result = await db.query(`
      WITH monthly_spend AS (
        SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
      ),
      cohort_data AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as month,
          DATE_PART('day', event_date - install_date)::int as days_to_event,
          DATE_PART('day', CURRENT_DATE - install_date)::int as cohort_age,
          q_user_id,
          event_name,
          product_id,
          price_usd,
          refund
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
          AND media_source = 'Apple AdServices'
      ),
      conversions_by_age AS (
        SELECT
          month,
          MAX(cohort_age) as cohort_age,
          -- Conversions within X days of install
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE days_to_event <= 4 AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
          ) as subs_4d,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE days_to_event <= 7 AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
          ) as subs_7d,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE days_to_event <= 30 AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
          ) as subs_30d,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE days_to_event <= 60 AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
          ) as subs_60d,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE days_to_event <= 180 AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
          ) as subs_180d,
          -- Total conversions (all time)
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          ) as subs_total,
          -- Revenue within X days of install
          SUM(price_usd) FILTER (WHERE days_to_event <= 4 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_4d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 7 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_7d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 30 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_30d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 60 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_60d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 180 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_180d,
          -- Total revenue (all time)
          SUM(price_usd) FILTER (WHERE refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_total
        FROM cohort_data
        GROUP BY month
      )
      SELECT
        ms.month,
        ms.spend,
        COALESCE(ca.cohort_age, 0) as cohort_age,
        COALESCE(ca.subs_4d, 0) as subs_4d,
        COALESCE(ca.subs_7d, 0) as subs_7d,
        COALESCE(ca.subs_30d, 0) as subs_30d,
        COALESCE(ca.subs_60d, 0) as subs_60d,
        COALESCE(ca.subs_180d, 0) as subs_180d,
        COALESCE(ca.subs_total, 0) as subs_total,
        COALESCE(ca.rev_4d, 0) as rev_4d,
        COALESCE(ca.rev_7d, 0) as rev_7d,
        COALESCE(ca.rev_30d, 0) as rev_30d,
        COALESCE(ca.rev_60d, 0) as rev_60d,
        COALESCE(ca.rev_180d, 0) as rev_180d,
        COALESCE(ca.rev_total, 0) as rev_total
      FROM monthly_spend ms
      LEFT JOIN conversions_by_age ca ON ms.month = ca.month
      ORDER BY ms.month DESC
    `);

    // Apple commission factor: sales * 0.82 = proceeds (Apple takes ~18%)
    const PROCEEDS_FACTOR = 0.82;

    const data = result.rows.map(row => {
      const spend = parseFloat(row.spend) || 0;
      const cohortAge = parseInt(row.cohort_age) || 0;

      // Calculate COP at each age (only show if cohort is old enough)
      const cop4d = cohortAge >= 4 && row.subs_4d > 0 ? spend / row.subs_4d : null;
      const cop7d = cohortAge >= 7 && row.subs_7d > 0 ? spend / row.subs_7d : null;
      const cop30d = cohortAge >= 30 && row.subs_30d > 0 ? spend / row.subs_30d : null;
      const cop60d = cohortAge >= 60 && row.subs_60d > 0 ? spend / row.subs_60d : null;
      const cop180d = cohortAge >= 180 && row.subs_180d > 0 ? spend / row.subs_180d : null;
      const copTotal = row.subs_total > 0 ? spend / row.subs_total : null;

      // Calculate ROAS at each age using proceeds (sales * 0.82)
      const roas4d = cohortAge >= 4 && spend > 0 ? (parseFloat(row.rev_4d) * PROCEEDS_FACTOR) / spend : null;
      const roas7d = cohortAge >= 7 && spend > 0 ? (parseFloat(row.rev_7d) * PROCEEDS_FACTOR) / spend : null;
      const roas30d = cohortAge >= 30 && spend > 0 ? (parseFloat(row.rev_30d) * PROCEEDS_FACTOR) / spend : null;
      const roas60d = cohortAge >= 60 && spend > 0 ? (parseFloat(row.rev_60d) * PROCEEDS_FACTOR) / spend : null;
      const roas180d = cohortAge >= 180 && spend > 0 ? (parseFloat(row.rev_180d) * PROCEEDS_FACTOR) / spend : null;
      const roasTotal = spend > 0 ? (parseFloat(row.rev_total) * PROCEEDS_FACTOR) / spend : null;

      // Predict final COP and ROAS based on decay curves
      const copDecayFactor = getDecayFactor(cohortAge, COP_DECAY_CURVE);
      const roasDecayFactor = getRoasDecayFactor(cohortAge);
      const subsTotal = parseInt(row.subs_total) || 0;
      const revTotal = parseFloat(row.rev_total) || 0;

      // Predict final COP using COP decay curve
      const predictedSubs = subsTotal > 0 ? subsTotal / copDecayFactor : 0;
      const copPredicted = predictedSubs > 0 ? spend / predictedSubs : null;

      // Predict final ROAS using ROAS decay curve (with proceeds factor)
      const roasPredicted = roasTotal && roasDecayFactor > 0 ? roasTotal / roasDecayFactor : null;

      // Payback calculation using the ROAS decay curve
      let paybackDays = null;
      let predictedPaybackDays = null;
      const isPaidBack = roasTotal && roasTotal >= 1;

      if (isPaidBack) {
        // Already paid back - find when it crossed 1x using the curve
        paybackDays = findPaybackDays(roasTotal, cohortAge, roasPredicted);
      } else if (roasPredicted && roasPredicted >= 1) {
        // Will pay back eventually - find predicted payback day
        predictedPaybackDays = findPaybackDays(roasTotal, cohortAge, roasPredicted);
      }

      const paybackMonths = paybackDays ? Math.round(paybackDays / 30) : null;
      const predictedPaybackMonths = predictedPaybackDays ? Math.round(predictedPaybackDays / 30) : null;

      return {
        month: row.month,
        spend,
        cohortAge,
        cop: { d4: cop4d, d7: cop7d, d30: cop30d, d60: cop60d, d180: cop180d, total: copTotal, predicted: copPredicted },
        roas: { d4: roas4d, d7: roas7d, d30: roas30d, d60: roas60d, d180: roas180d, total: roasTotal, predicted: roasPredicted },
        subs: { d4: parseInt(row.subs_4d), d7: parseInt(row.subs_7d), d30: parseInt(row.subs_30d), d60: parseInt(row.subs_60d), d180: parseInt(row.subs_180d), total: parseInt(row.subs_total) },
        revenue: { d4: parseFloat(row.rev_4d), d7: parseFloat(row.rev_7d), d30: parseFloat(row.rev_30d), d60: parseFloat(row.rev_60d), d180: parseFloat(row.rev_180d), total: parseFloat(row.rev_total) },
        paybackMonths,
        predictedPaybackMonths,
        isPaidBack,
      };
    });

    res.json({ data });
  } catch (error) {
    console.error('Marketing analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ROAS EVOLUTION - How ROAS grows over cohort age
// ============================================
router.get('/roas-evolution', async (req, res) => {
  try {
    const monthsBack = parseInt(req.query.months) || 12;

    // Get ROAS at different ages for each cohort month
    const result = await db.query(`
      WITH cohort_data AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as cohort_month,
          DATE_PART('day', event_date - install_date)::int as days_to_event,
          DATE_PART('day', CURRENT_DATE - install_date)::int as cohort_age,
          q_user_id,
          price_usd,
          refund,
          event_name
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
          AND media_source = 'Apple AdServices'
      ),
      monthly_spend AS (
        SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
      ),
      roas_by_age AS (
        SELECT
          cohort_month,
          MAX(cohort_age) as max_age,
          SUM(price_usd) FILTER (WHERE days_to_event <= 7 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_7d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 14 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_14d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 30 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_30d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 60 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_60d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 90 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_90d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 120 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_120d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 150 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_150d,
          SUM(price_usd) FILTER (WHERE days_to_event <= 180 AND refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_180d,
          SUM(price_usd) FILTER (WHERE refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as rev_total
        FROM cohort_data
        GROUP BY cohort_month
      )
      SELECT
        ra.cohort_month,
        ms.spend,
        ra.max_age,
        COALESCE(ra.rev_7d, 0) as rev_7d,
        COALESCE(ra.rev_14d, 0) as rev_14d,
        COALESCE(ra.rev_30d, 0) as rev_30d,
        COALESCE(ra.rev_60d, 0) as rev_60d,
        COALESCE(ra.rev_90d, 0) as rev_90d,
        COALESCE(ra.rev_120d, 0) as rev_120d,
        COALESCE(ra.rev_150d, 0) as rev_150d,
        COALESCE(ra.rev_180d, 0) as rev_180d,
        COALESCE(ra.rev_total, 0) as rev_total
      FROM roas_by_age ra
      JOIN monthly_spend ms ON ra.cohort_month = ms.month
      ORDER BY ra.cohort_month
    `);

    // Transform to chart-friendly format
    const cohorts = result.rows.map(row => {
      const spend = parseFloat(row.spend) || 1;
      const maxAge = parseInt(row.max_age) || 0;

      return {
        month: row.cohort_month,
        maxAge,
        spend,
        roas: {
          d7: maxAge >= 7 ? parseFloat(row.rev_7d) / spend : null,
          d14: maxAge >= 14 ? parseFloat(row.rev_14d) / spend : null,
          d30: maxAge >= 30 ? parseFloat(row.rev_30d) / spend : null,
          d60: maxAge >= 60 ? parseFloat(row.rev_60d) / spend : null,
          d90: maxAge >= 90 ? parseFloat(row.rev_90d) / spend : null,
          d120: maxAge >= 120 ? parseFloat(row.rev_120d) / spend : null,
          d150: maxAge >= 150 ? parseFloat(row.rev_150d) / spend : null,
          d180: maxAge >= 180 ? parseFloat(row.rev_180d) / spend : null,
          total: parseFloat(row.rev_total) / spend,
        },
      };
    });

    // Also create data for line chart (age on X axis, multiple cohort lines)
    const ages = [7, 14, 30, 60, 90, 120, 150, 180];
    const chartData = ages.map(age => {
      const point = { age };
      cohorts.forEach(c => {
        const key = `d${age}`;
        if (c.roas[key] != null) {
          point[c.month] = c.roas[key];
        }
      });
      return point;
    });

    res.json({ cohorts, chartData, ages });
  } catch (error) {
    console.error('ROAS evolution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// KEYWORDS PERFORMANCE - Apple Ads keywords data
// Note: Conversions estimated using average trial and conversion rates
// ============================================
router.get('/keywords', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;

    // Get average conversion rates for estimation
    const ratesResult = await db.query(`
      SELECT
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Started') as trials,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name = 'Trial Converted'
          OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
        ) as conversions
      FROM events_v2
      WHERE install_date >= CURRENT_DATE - INTERVAL '${days} days'
        AND media_source = 'Apple AdServices'
    `);

    const avgTrials = parseInt(ratesResult.rows[0]?.trials) || 1;
    const avgConversions = parseInt(ratesResult.rows[0]?.conversions) || 1;

    // Get total installs from Apple Ads for the period
    const installsResult = await db.query(`
      SELECT SUM(installs) as total_installs
      FROM apple_ads_campaigns
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
    `);
    const totalInstalls = parseInt(installsResult.rows[0]?.total_installs) || 1;

    // Trial rate and conversion rate
    const trialRate = avgTrials / totalInstalls;
    const conversionRate = avgConversions / avgTrials;

    // Get keyword performance from Apple Ads
    const result = await db.query(`
      WITH keyword_data AS (
        SELECT
          keyword_id,
          keyword_text,
          campaign_id,
          SUM(spend) as spend,
          SUM(installs) as installs,
          SUM(taps) as taps,
          SUM(impressions) as impressions
        FROM apple_ads_keywords
        WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
          AND keyword_text IS NOT NULL
        GROUP BY keyword_id, keyword_text, campaign_id
      ),
      campaign_names AS (
        SELECT DISTINCT campaign_id, campaign_name
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
      )
      SELECT
        kd.keyword_id,
        kd.keyword_text,
        cn.campaign_name,
        kd.spend,
        kd.installs,
        kd.taps,
        kd.impressions
      FROM keyword_data kd
      LEFT JOIN campaign_names cn ON kd.campaign_id = cn.campaign_id
      WHERE kd.spend > 10
      ORDER BY kd.spend DESC
      LIMIT 100
    `);

    const keywords = result.rows.map(row => {
      const spend = parseFloat(row.spend) || 0;
      const installs = parseInt(row.installs) || 0;
      const taps = parseInt(row.taps) || 0;

      // Estimate trials and conversions based on average rates
      const estTrials = Math.round(installs * trialRate);
      const estConversions = Math.round(estTrials * conversionRate);
      const avgPrice = 50; // Average yearly subscription price
      const estRevenue = estConversions * avgPrice;

      return {
        keywordId: row.keyword_id,
        keyword: row.keyword_text,
        campaign: row.campaign_name,
        spend,
        installs,
        taps,
        impressions: parseInt(row.impressions) || 0,
        trials: estTrials,
        conversions: estConversions,
        revenue: estRevenue,
        cpi: installs > 0 ? spend / installs : null,
        cpt: estTrials > 0 ? spend / estTrials : null,
        cop: estConversions > 0 ? spend / estConversions : null,
        roas: spend > 0 ? estRevenue / spend : null,
        trialRate: trialRate * 100,
        crToPaid: conversionRate * 100,
        isEstimated: true,  // Flag to indicate values are estimated
      };
    });

    // Calculate totals
    const totals = {
      spend: keywords.reduce((s, k) => s + k.spend, 0),
      installs: keywords.reduce((s, k) => s + k.installs, 0),
      trials: keywords.reduce((s, k) => s + k.trials, 0),
      conversions: keywords.reduce((s, k) => s + k.conversions, 0),
      revenue: keywords.reduce((s, k) => s + k.revenue, 0),
      trialRate: trialRate * 100,
      crToPaid: conversionRate * 100,
    };
    totals.cop = totals.conversions > 0 ? totals.spend / totals.conversions : null;
    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : null;

    res.json({ keywords, totals, days });
  } catch (error) {
    console.error('Keywords error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// REVENUE FORECAST - Cohort-based revenue prediction
// ============================================
router.get('/forecast', async (req, res) => {
  try {
    const RENEWAL_RATE = 0.70;
    const PROCEEDS_FACTOR = 0.82;

    // Get ALL historical cohorts (by first subscription month)
    // Going back 24 months to capture cohorts that will renew
    const cohortsResult = await db.query(`
      WITH first_subs AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date,
          MIN(price_usd) as first_price
        FROM events_v2
        WHERE event_name IN ('Subscription Started', 'Trial Converted')
          AND product_id LIKE '%yearly%'
          AND refund = false
        GROUP BY q_user_id
      )
      SELECT
        TO_CHAR(first_sub_date, 'YYYY-MM') as cohort_month,
        COUNT(*) as subscribers,
        AVG(first_price) as avg_price
      FROM first_subs
      WHERE first_sub_date >= CURRENT_DATE - INTERVAL '24 months'
      GROUP BY TO_CHAR(first_sub_date, 'YYYY-MM')
      ORDER BY cohort_month
    `);

    // Get historical monthly revenue for chart
    const monthlyRevenueResult = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        SUM(price_usd) FILTER (WHERE refund = false) as revenue,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name IN ('Subscription Started', 'Trial Converted')
        ) as new_subs,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name = 'Subscription Renewed'
        ) as renewals
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '12 months'
        AND event_date < DATE_TRUNC('month', CURRENT_DATE)
        AND event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
      GROUP BY TO_CHAR(event_date, 'YYYY-MM')
      ORDER BY month
    `);

    // Build cohort map: month -> {subscribers, avgPrice}
    const cohorts = {};
    for (const row of cohortsResult.rows) {
      cohorts[row.cohort_month] = {
        subscribers: parseInt(row.subscribers),
        avgPrice: parseFloat(row.avg_price) || 50,
      };
    }

    // Get average new subscribers per month (for projecting future cohorts)
    const last3Months = monthlyRevenueResult.rows.slice(-3);
    const avgNewSubsPerMonth = last3Months.length > 0
      ? Math.round(last3Months.reduce((s, r) => s + parseInt(r.new_subs || 0), 0) / last3Months.length)
      : 1000;
    const avgPrice = last3Months.length > 0
      ? last3Months.reduce((s, r) => s + parseFloat(r.revenue || 0), 0) /
        last3Months.reduce((s, r) => s + parseInt(r.new_subs || 0) + parseInt(r.renewals || 0), 0)
      : 50;

    // Helper to add months to a date string
    const addMonths = (monthStr, months) => {
      const [year, month] = monthStr.split('-').map(Number);
      const date = new Date(year, month - 1 + months, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    // Get current month partial data for extrapolation
    const today = new Date();
    const currentDay = today.getDate();
    const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthData = await db.query(`
      SELECT
        COALESCE(SUM(price_usd) FILTER (WHERE refund = false), 0) as revenue,
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name IN ('Subscription Started', 'Trial Converted')) as new_subs
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
    `, [currentMonthStr]);

    const currentMonthPartialRevenue = parseFloat(currentMonthData.rows[0]?.revenue) || 0;
    const currentMonthNewSubs = parseInt(currentMonthData.rows[0]?.new_subs) || 0;
    const extrapolatedCurrentMonthRevenue = currentDay > 0
      ? (currentMonthPartialRevenue / currentDay) * daysInCurrentMonth
      : 0;
    const extrapolatedCurrentMonthNewSubs = currentDay > 0
      ? Math.round((currentMonthNewSubs / currentDay) * daysInCurrentMonth)
      : avgNewSubsPerMonth;

    // Get baseline renewals from last 3 full months
    // This represents ongoing renewals from ALL historical cohorts
    const baselineRenewalsCount = last3Months.length > 0
      ? Math.round(last3Months.reduce((s, r) => s + parseInt(r.renewals || 0), 0) / last3Months.length)
      : 2000;
    const baselineRenewalsRevenue = baselineRenewalsCount * avgPrice;

    // Build forecast using cohort model
    const renewalForecast = [];
    const projectedCohorts = []; // Track new cohorts for future renewal calculation

    for (let i = 0; i <= 12; i++) {
      const forecastDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const forecastMonthStr = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;

      let newSubsRevenue = 0;
      let newSubsCount = 0;

      if (i === 0) {
        // Current month: extrapolate from partial data
        // extrapolatedCurrentMonthRevenue already includes BOTH new subs and renewals
        newSubsCount = extrapolatedCurrentMonthNewSubs;
        // For current month, we'll set totalRevenue directly to avoid double-counting renewals
        newSubsRevenue = extrapolatedCurrentMonthRevenue; // This is actually total, not just new subs
      } else {
        // Future month: new subscribers at avg rate
        newSubsCount = avgNewSubsPerMonth;
        newSubsRevenue = newSubsCount * avgPrice;
      }

      // Track this cohort for future renewals
      projectedCohorts.push({ month: forecastMonthStr, subscribers: newSubsCount });

      // Renewals = baseline renewals + delta from cohort size changes
      // The baseline already includes renewals from all historical cohorts
      // We need to adjust for:
      // 1. Cohort that's renewing now vs cohort from 12 months ago in baseline
      // 2. Growth/decline in cohort sizes over time

      // Get cohort from 12 months ago (relative to this forecast month)
      const renewalSourceMonth = addMonths(forecastMonthStr, -12);
      const historicalCohort = cohorts[renewalSourceMonth];

      // Get the cohort from 12 months before the baseline period (for delta calculation)
      const lastFullMonthStr = last3Months[last3Months.length - 1]?.month;
      const baselineSourceMonth = lastFullMonthStr ? addMonths(lastFullMonthStr, -12) : null;
      const baselineCohort = baselineSourceMonth ? cohorts[baselineSourceMonth] : null;

      // Calculate renewal delta: (current renewing cohort - baseline renewing cohort) * renewal_rate
      let renewalsDelta = 0;
      if (historicalCohort && baselineCohort) {
        const cohortDiff = historicalCohort.subscribers - baselineCohort.subscribers;
        renewalsDelta = Math.round(cohortDiff * RENEWAL_RATE);
      }

      // Add renewals from projected cohorts that reach 12 months during this forecast
      let projectedRenewals = 0;
      if (i >= 12 && projectedCohorts[i - 12]) {
        projectedRenewals = Math.round(projectedCohorts[i - 12].subscribers * RENEWAL_RATE);
      }

      const renewalsCount = baselineRenewalsCount + renewalsDelta + projectedRenewals;
      const renewalsRevenue = renewalsCount * avgPrice;

      // For current month, extrapolatedCurrentMonthRevenue already includes renewals
      // So totalRevenue = extrapolated revenue (not newSubs + renewals)
      const totalRevenue = (i === 0)
        ? extrapolatedCurrentMonthRevenue
        : newSubsRevenue + renewalsRevenue;

      renewalForecast.push({
        month: forecastMonthStr,
        newSubs: newSubsCount,
        newSubsRevenue: Math.round(newSubsRevenue),
        renewals: renewalsCount,
        renewalsRevenue: Math.round(renewalsRevenue),
        totalRevenue: Math.round(totalRevenue),
        // For backward compatibility
        expectedRevenue: Math.round(totalRevenue),
        expectedRenewals: renewalsCount,
      });
    }

    // Get current month subscribers for stats
    const currentMonthSubs = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as subs
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
        AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
    `);

    // Get last 30 days spend and metrics for projection
    const last30DaysMetrics = await db.query(`
      SELECT
        SUM(spend) as total_spend,
        SUM(spend) / 30.0 as avg_daily_spend
      FROM apple_ads_campaigns
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    // Get average COP (cost per paid user) from last 30 days
    const last30DaysCOP = await db.query(`
      SELECT
        COUNT(DISTINCT q_user_id) as paid_users
      FROM events_v2
      WHERE install_date >= CURRENT_DATE - INTERVAL '30 days'
        AND media_source = 'Apple AdServices'
        AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
    `);

    const avgDailySpend = parseFloat(last30DaysMetrics.rows[0]?.avg_daily_spend) || 0;
    const avgMonthlySpend = avgDailySpend * 30;
    const paidUsersLast30 = parseInt(last30DaysCOP.rows[0]?.paid_users) || 1;
    const totalSpendLast30 = parseFloat(last30DaysMetrics.rows[0]?.total_spend) || 1;
    const currentCOP = totalSpendLast30 / paidUsersLast30;

    // Get average yearly subscription price
    const avgYearlyPrice = await db.query(`
      SELECT AVG(price_usd) as avg_price
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '90 days'
        AND event_name IN ('Subscription Started', 'Trial Converted')
        AND product_id LIKE '%yearly%'
        AND price_usd > 0
    `);
    const avgSubPrice = parseFloat(avgYearlyPrice.rows[0]?.avg_price) || 50;

    // Calculate projected new subscribers per month (assuming same spend as last 30 days)
    const projectedNewSubsPerMonth = avgMonthlySpend > 0 && currentCOP > 0
      ? Math.round(avgMonthlySpend / currentCOP)
      : 0;

    // Add totalForecastRevenue for backward compatibility
    for (let i = 0; i < renewalForecast.length; i++) {
      renewalForecast[i].projectedNewSubs = projectedNewSubsPerMonth;
      renewalForecast[i].totalForecastRevenue = renewalForecast[i].totalRevenue;
    }

    res.json({
      historical: monthlyRevenueResult.rows.map(r => ({
        month: r.month,
        revenue: parseFloat(r.revenue) || 0,
        newSubs: parseInt(r.new_subs) || 0,
        renewals: parseInt(r.renewals) || 0,
      })),
      renewalForecast,
      avgNewSubsPerMonth: Math.round(avgNewSubsPerMonth),
      currentMonthSubs: parseInt(currentMonthSubs.rows[0]?.subs) || 0,
      projectedNewSubsPerMonth,
      projectionAssumptions: {
        avgDailySpend: Math.round(avgDailySpend),
        avgMonthlySpend: Math.round(avgMonthlySpend),
        currentCOP: Math.round(currentCOP),
        projectedNewSubsPerMonth,
        avgSubPrice: Math.round(avgSubPrice),
        renewalRate: RENEWAL_RATE,
        proceedsFactor: PROCEEDS_FACTOR,
      },
    });
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FUNNEL - Conversion funnel metrics
// ============================================
router.get('/funnel', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const result = await db.query(`
      WITH funnel_data AS (
        SELECT
          media_source,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Started') as trials,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted') as converted,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE event_name = 'Subscription Started' AND product_id LIKE '%yearly%'
          ) as direct_yearly,
          SUM(price_usd) FILTER (
            WHERE refund = false
            AND event_name IN ('Subscription Started', 'Trial Converted')
          ) as revenue
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${days} days'
          AND install_date <= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY media_source
      ),
      installs AS (
        SELECT
          CASE WHEN media_source = 'Apple AdServices' THEN 'Apple Ads' ELSE 'Organic' END as source,
          SUM(installs) as installs
        FROM (
          SELECT 'Apple AdServices' as media_source, SUM(installs) as installs
          FROM apple_ads_campaigns
          WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
            AND date <= CURRENT_DATE - INTERVAL '7 days'
        ) aa
        GROUP BY source
      )
      SELECT
        CASE WHEN fd.media_source = 'Apple AdServices' THEN 'Apple Ads' ELSE 'Organic' END as source,
        COALESCE(i.installs, 0) as installs,
        COALESCE(fd.trials, 0) as trials,
        COALESCE(fd.converted, 0) as converted,
        COALESCE(fd.direct_yearly, 0) as direct_yearly,
        COALESCE(fd.revenue, 0) as revenue
      FROM funnel_data fd
      LEFT JOIN installs i ON (CASE WHEN fd.media_source = 'Apple AdServices' THEN 'Apple Ads' ELSE 'Organic' END) = i.source
    `);

    const funnel = result.rows.map(r => ({
      source: r.source || 'Unknown',
      installs: parseInt(r.installs) || 0,
      trials: parseInt(r.trials) || 0,
      converted: parseInt(r.converted) || 0,
      directYearly: parseInt(r.direct_yearly) || 0,
      totalPaid: (parseInt(r.converted) || 0) + (parseInt(r.direct_yearly) || 0),
      revenue: parseFloat(r.revenue) || 0,
    }));

    // Add rates
    funnel.forEach(f => {
      f.trialRate = f.installs > 0 ? (f.trials / f.installs) * 100 : null;
      f.crToPaid = f.trials > 0 ? (f.converted / f.trials) * 100 : null;
      f.directRate = f.installs > 0 ? (f.directYearly / f.installs) * 100 : null;
    });

    res.json({ funnel, days });
  } catch (error) {
    console.error('Funnel error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RETENTION - User retention by cohort
// ============================================
router.get('/retention', async (req, res) => {
  try {
    const monthsBack = parseInt(req.query.months) || 6;

    // For subscription apps, retention = still subscribed
    // We track: Day 0 (subscribed), Day 30, Day 60, Day 90, Day 180, Day 365 (renewed)
    const result = await db.query(`
      WITH cohorts AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as cohort_month,
          q_user_id,
          MIN(event_date) as first_purchase_date
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
          AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
        GROUP BY TO_CHAR(install_date, 'YYYY-MM'), q_user_id
      ),
      renewals AS (
        SELECT q_user_id, event_date as renewal_date
        FROM events_v2
        WHERE event_name = 'Subscription Renewed'
          AND install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
      ),
      refunds AS (
        SELECT DISTINCT q_user_id
        FROM events_v2
        WHERE refund = true
          AND install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
      )
      SELECT
        c.cohort_month,
        COUNT(DISTINCT c.q_user_id) as total_subscribers,
        COUNT(DISTINCT c.q_user_id) FILTER (WHERE c.q_user_id NOT IN (SELECT q_user_id FROM refunds)) as active_after_refunds,
        COUNT(DISTINCT r.q_user_id) as renewed,
        DATE_PART('day', CURRENT_DATE - MAX(c.first_purchase_date))::int as cohort_age
      FROM cohorts c
      LEFT JOIN renewals r ON c.q_user_id = r.q_user_id
      GROUP BY c.cohort_month
      ORDER BY c.cohort_month
    `);

    const retention = result.rows.map(r => ({
      month: r.cohort_month,
      totalSubscribers: parseInt(r.total_subscribers) || 0,
      activeAfterRefunds: parseInt(r.active_after_refunds) || 0,
      renewed: parseInt(r.renewed) || 0,
      cohortAge: parseInt(r.cohort_age) || 0,
      refundRate: parseInt(r.total_subscribers) > 0
        ? ((parseInt(r.total_subscribers) - parseInt(r.active_after_refunds)) / parseInt(r.total_subscribers) * 100)
        : 0,
      renewalRate: parseInt(r.active_after_refunds) > 0 && parseInt(r.cohort_age) >= 365
        ? (parseInt(r.renewed) / parseInt(r.active_after_refunds) * 100)
        : null,
    }));

    res.json({ retention });
  } catch (error) {
    console.error('Retention error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug revenue for a month
router.get('/debug-revenue/:month', async (req, res) => {
  try {
    const month = req.params.month; // e.g., '2026-03'

    // Revenue by event type
    const byEventResult = await db.query(`
      SELECT
        event_name,
        COUNT(*) as events,
        COALESCE(SUM(price_usd), 0) as revenue
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = false
      GROUP BY event_name
      ORDER BY revenue DESC
    `, [month]);

    // Total revenue
    const totalResult = await db.query(`
      SELECT COALESCE(SUM(price_usd), 0) as total
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = false
    `, [month]);

    // Check for refunds in this month
    const refundsResult = await db.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(price_usd), 0) as amount
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = true
    `, [month]);

    res.json({
      month,
      totalRevenue: parseFloat(totalResult.rows[0]?.total) || 0,
      byEvent: byEventResult.rows,
      refunds: refundsResult.rows[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug media sources
router.get('/debug-media-sources', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        media_source,
        COUNT(*) as events,
        COUNT(DISTINCT q_user_id) as users
      FROM events_v2
      WHERE install_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY media_source
      ORDER BY users DESC
    `);
    res.json({ sources: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug COP calculation for a specific date
router.get('/debug-cop/:date', async (req, res) => {
  try {
    const date = req.params.date; // e.g., '2026-02-27'

    // 1. Spend for this date
    const spendResult = await db.query(`
      SELECT COALESCE(SUM(spend), 0) as spend
      FROM apple_ads_campaigns
      WHERE date = $1
    `, [date]);

    // 2. Cohort conversions (installed on this date, converted anytime)
    const conversionsResult = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as conversions
      FROM events_v2
      WHERE DATE(install_date) = $1
        AND (
          event_name = 'Trial Converted'
          OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
        )
    `, [date]);

    // 3. Breakdown by event type
    const breakdownResult = await db.query(`
      SELECT
        event_name,
        COUNT(DISTINCT q_user_id) as users
      FROM events_v2
      WHERE DATE(install_date) = $1
        AND (
          event_name = 'Trial Converted'
          OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
        )
      GROUP BY event_name
    `, [date]);

    // 4. Sample users from this cohort
    const sampleResult = await db.query(`
      SELECT
        q_user_id,
        event_name,
        product_id,
        DATE(install_date) as install_date,
        DATE(event_date) as event_date
      FROM events_v2
      WHERE DATE(install_date) = $1
        AND (
          event_name = 'Trial Converted'
          OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
        )
      LIMIT 10
    `, [date]);

    const spend = parseFloat(spendResult.rows[0]?.spend) || 0;
    const conversions = parseInt(conversionsResult.rows[0]?.conversions) || 0;

    res.json({
      date,
      spend,
      conversions,
      cop: conversions > 0 ? spend / conversions : null,
      breakdown: breakdownResult.rows,
      sampleUsers: sampleResult.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze conversion delay distribution (days from install to conversion)
router.get('/debug-conversion-delay', async (req, res) => {
  try {
    const minAge = parseInt(req.query.minAge) || 60; // Minimum cohort age in days

    // Distribution by days to convert
    const byDayResult = await db.query(`
      SELECT
        DATE_PART('day', event_date - install_date)::int as days_to_convert,
        COUNT(DISTINCT q_user_id) as users
      FROM events_v2
      WHERE (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
        AND install_date >= '2025-01-01'
        AND install_date <= CURRENT_DATE - INTERVAL '${minAge} days'
      GROUP BY days_to_convert
      ORDER BY days_to_convert
    `);

    // Calculate cumulative percentage
    const totalUsers = byDayResult.rows.reduce((sum, r) => sum + parseInt(r.users), 0);
    let cumulative = 0;
    const distribution = byDayResult.rows.map(r => {
      cumulative += parseInt(r.users);
      return {
        day: parseInt(r.days_to_convert),
        users: parseInt(r.users),
        pct: ((parseInt(r.users) / totalUsers) * 100).toFixed(2),
        cumPct: ((cumulative / totalUsers) * 100).toFixed(2),
      };
    });

    // Group by week for longer tail
    const byWeekResult = await db.query(`
      SELECT
        FLOOR(DATE_PART('day', event_date - install_date) / 7)::int as week,
        COUNT(DISTINCT q_user_id) as users
      FROM events_v2
      WHERE (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
        AND install_date >= '2025-01-01'
        AND install_date <= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY week
      ORDER BY week
    `);

    cumulative = 0;
    const byWeek = byWeekResult.rows.map(r => {
      cumulative += parseInt(r.users);
      return {
        week: parseInt(r.week),
        users: parseInt(r.users),
        pct: ((parseInt(r.users) / totalUsers) * 100).toFixed(2),
        cumPct: ((cumulative / totalUsers) * 100).toFixed(2),
      };
    });

    res.json({
      totalUsers,
      byDay: distribution.slice(0, 60), // First 60 days
      byWeek,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analyze conversion delay by cohort month (to validate consistency)
router.get('/debug-cohort-decay', async (req, res) => {
  try {
    // For each cohort month, calculate cumulative conversion % at key milestones
    const result = await db.query(`
      WITH cohort_conversions AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as cohort_month,
          DATE_PART('day', event_date - install_date)::int as days_to_convert,
          COUNT(DISTINCT q_user_id) as users
        FROM events_v2
        WHERE (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
          AND install_date >= '2025-01-01'
          AND install_date <= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY TO_CHAR(install_date, 'YYYY-MM'), DATE_PART('day', event_date - install_date)::int
      ),
      cohort_totals AS (
        SELECT cohort_month, SUM(users) as total_users
        FROM cohort_conversions
        GROUP BY cohort_month
      ),
      milestones AS (
        SELECT
          cc.cohort_month,
          ct.total_users,
          SUM(cc.users) FILTER (WHERE cc.days_to_convert <= 0) as by_day_0,
          SUM(cc.users) FILTER (WHERE cc.days_to_convert <= 3) as by_day_3,
          SUM(cc.users) FILTER (WHERE cc.days_to_convert <= 7) as by_day_7,
          SUM(cc.users) FILTER (WHERE cc.days_to_convert <= 14) as by_day_14,
          SUM(cc.users) FILTER (WHERE cc.days_to_convert <= 30) as by_day_30,
          SUM(cc.users) FILTER (WHERE cc.days_to_convert <= 60) as by_day_60
        FROM cohort_conversions cc
        JOIN cohort_totals ct ON cc.cohort_month = ct.cohort_month
        GROUP BY cc.cohort_month, ct.total_users
      )
      SELECT
        cohort_month,
        total_users,
        ROUND((by_day_0::numeric / total_users) * 100, 1) as pct_day_0,
        ROUND((by_day_3::numeric / total_users) * 100, 1) as pct_day_3,
        ROUND((by_day_7::numeric / total_users) * 100, 1) as pct_day_7,
        ROUND((by_day_14::numeric / total_users) * 100, 1) as pct_day_14,
        ROUND((by_day_30::numeric / total_users) * 100, 1) as pct_day_30,
        ROUND((COALESCE(by_day_60, by_day_30)::numeric / total_users) * 100, 1) as pct_day_60
      FROM milestones
      ORDER BY cohort_month
    `);

    res.json({
      cohorts: result.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint
router.get('/debug', async (req, res) => {
  try {
    const eventsQuery = `
      SELECT event_name, COUNT(*) as cnt
      FROM events_v2
      GROUP BY event_name
      ORDER BY cnt DESC
    `;
    const events = await db.query(eventsQuery);

    const dateRange = await db.query(`
      SELECT MIN(event_date) as min_date, MAX(event_date) as max_date, COUNT(*) as total
      FROM events_v2
    `);

    const products = await db.query(`
      SELECT product_id, COUNT(*) as cnt
      FROM events_v2
      WHERE event_name IN ('subscription_started', 'Subscription Started')
      GROUP BY product_id
      ORDER BY cnt DESC
      LIMIT 10
    `);

    const mediaSources = await db.query(`
      SELECT media_source, COUNT(*) as events, COUNT(DISTINCT q_user_id) as users
      FROM events_v2
      WHERE install_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY media_source
      ORDER BY users DESC
    `);

    // Check price_usd vs proceeds_usd
    const revenueCheck = await db.query(`
      SELECT
        COUNT(*) as total_events,
        COUNT(price_usd) as with_price,
        COUNT(proceeds_usd) as with_proceeds,
        SUM(price_usd) as total_sales,
        SUM(proceeds_usd) as total_proceeds,
        CASE WHEN SUM(price_usd) > 0 THEN SUM(proceeds_usd) / SUM(price_usd) ELSE 0 END as proceeds_ratio
      FROM events_v2
      WHERE event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
    `);

    res.json({
      events: events.rows,
      dateRange: dateRange.rows[0],
      products: products.rows,
      mediaSources: mediaSources.rows,
      revenueCheck: revenueCheck.rows[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FINMODEL ENDPOINT - данные для Google Sheets AI_finmodel
// ============================================

router.get('/finmodel', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 10;

    // Daily data for fin model (last N days)
    const dailyQuery = `
      WITH daily_spend AS (
        SELECT date as day, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY date
      ),
      daily_revenue AS (
        SELECT
          DATE(event_date) as day,
          SUM(price_usd) FILTER (
            WHERE refund = false
            AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
          ) as revenue
        FROM events_v2
        WHERE event_date >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY DATE(event_date)
      ),
      daily_trials AS (
        SELECT
          DATE(install_date) as day,
          COUNT(DISTINCT q_user_id) as trials
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${days} days'
          AND event_name = 'Trial Started'
        GROUP BY DATE(install_date)
      ),
      daily_yearly_subs AS (
        SELECT
          DATE(event_date) as day,
          COUNT(DISTINCT q_user_id) as yearly_subs
        FROM events_v2
        WHERE event_date >= CURRENT_DATE - INTERVAL '${days} days'
          AND (
            (event_name = 'Trial Converted' AND product_id LIKE '%yearly%')
            OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          )
        GROUP BY DATE(event_date)
      ),
      trial_to_paid AS (
        SELECT
          DATE(install_date) as day,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Started') as trials,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted') as converted
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${days + 7} days'
          AND install_date <= CURRENT_DATE - INTERVAL '4 days'
        GROUP BY DATE(install_date)
      ),
      all_days AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '${days} days',
          CURRENT_DATE,
          '1 day'::interval
        )::date as day
      )
      SELECT
        ad.day,
        COALESCE(ds.spend, 0) as spend,
        COALESCE(dr.revenue, 0) as revenue,
        COALESCE(dt.trials, 0) as trials,
        COALESCE(dys.yearly_subs, 0) as yearly_subs,
        ttp.trials as ttp_trials,
        ttp.converted as ttp_converted,
        CASE
          WHEN ttp.trials > 0 THEN ROUND((ttp.converted::numeric / ttp.trials) * 100, 2)
          ELSE NULL
        END as trial_to_paid_pct
      FROM all_days ad
      LEFT JOIN daily_spend ds ON ad.day = ds.day
      LEFT JOIN daily_revenue dr ON ad.day = dr.day
      LEFT JOIN daily_trials dt ON ad.day = dt.day
      LEFT JOIN daily_yearly_subs dys ON ad.day = dys.day
      LEFT JOIN trial_to_paid ttp ON ad.day = ttp.day
      ORDER BY ad.day DESC
    `;
    const dailyResult = await db.query(dailyQuery);

    // Monthly cohort revenue (last 12 months)
    const cohortQuery = `
      SELECT
        TO_CHAR(install_date, 'YYYY-MM') as cohort_month,
        TO_CHAR(install_date, 'Mon YYYY') as cohort_label,
        SUM(price_usd) FILTER (WHERE refund = false) as total_revenue
      FROM events_v2
      WHERE install_date >= CURRENT_DATE - INTERVAL '12 months'
        AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
      GROUP BY TO_CHAR(install_date, 'YYYY-MM'), TO_CHAR(install_date, 'Mon YYYY')
      ORDER BY cohort_month DESC
    `;
    const cohortResult = await db.query(cohortQuery);

    const dailyData = dailyResult.rows.map(row => ({
      date: formatDate(row.day),
      dateKey: new Date(row.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      spend: Math.round(parseFloat(row.spend) || 0),
      revenue: Math.round(parseFloat(row.revenue) || 0),
      trials: parseInt(row.trials) || 0,
      yearlySubs: parseInt(row.yearly_subs) || 0,
      trialToPaidPct: row.trial_to_paid_pct ? parseFloat(row.trial_to_paid_pct) / 100 : null,
    }));

    const cohortData = cohortResult.rows.map(row => ({
      month: row.cohort_month,
      label: row.cohort_label,
      revenue: Math.round(parseFloat(row.total_revenue) || 0),
    }));

    res.json({
      daily: dailyData,
      cohorts: cohortData,
      generated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Finmodel error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COMPARE V1 vs V2 - Compare events_v2 vs events_v2
// ============================================

router.get('/compare', async (req, res) => {
  try {
    // Compare daily revenue from both tables
    const v1Query = `
      SELECT
        DATE(event_date) as day,
        COUNT(*) as events,
        SUM(CASE WHEN event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted') AND refund = false THEN price_usd ELSE 0 END) as revenue,
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name IN ('Subscription Started', 'Trial Converted')) as subscribers,
        COUNT(campaign_id) as with_campaign
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(event_date)
      ORDER BY day DESC
    `;

    const v2Query = `
      SELECT
        DATE(event_date) as day,
        COUNT(*) as events,
        SUM(CASE WHEN event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted') AND refund = false THEN price_usd ELSE 0 END) as revenue,
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name IN ('Subscription Started', 'Trial Converted')) as subscribers,
        COUNT(campaign_id) as with_campaign
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(event_date)
      ORDER BY day DESC
    `;

    const [v1Result, v2Result] = await Promise.all([
      db.query(v1Query),
      db.query(v2Query),
    ]);

    // Total stats
    const v1Stats = await db.query(`
      SELECT COUNT(*) as total, COUNT(campaign_id) as with_campaign, 0 as with_keyword
      FROM events_v2
    `);

    const v2Stats = await db.query(`
      SELECT COUNT(*) as total, COUNT(campaign_id) as with_campaign, COUNT(keyword_id) as with_keyword
      FROM events_v2
    `);

    res.json({
      v1: {
        daily: v1Result.rows,
        stats: v1Stats.rows[0],
      },
      v2: {
        daily: v2Result.rows,
        stats: v2Stats.rows[0],
      },
    });
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COHORT ANALYSIS - Deep cohort revenue analysis
// ============================================
router.get('/cohort-analysis', async (req, res) => {
  try {
    // 1. Get all cohorts by first subscription month
    const cohortsResult = await db.query(`
      WITH first_subs AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date,
          MIN(price_usd) as first_price
        FROM events_v2
        WHERE event_name IN ('Subscription Started', 'Trial Converted')
          AND product_id LIKE '%yearly%'
          AND refund = false
        GROUP BY q_user_id
      )
      SELECT
        TO_CHAR(first_sub_date, 'YYYY-MM') as cohort_month,
        COUNT(*) as subscribers,
        ROUND(AVG(first_price)::numeric, 2) as avg_price,
        ROUND(SUM(first_price)::numeric, 2) as initial_revenue
      FROM first_subs
      GROUP BY TO_CHAR(first_sub_date, 'YYYY-MM')
      ORDER BY cohort_month
    `);

    // 2. Get revenue by cohort and revenue month (when revenue was earned)
    const revenueByMonthResult = await db.query(`
      WITH first_subs AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date
        FROM events_v2
        WHERE event_name IN ('Subscription Started', 'Trial Converted')
          AND product_id LIKE '%yearly%'
          AND refund = false
        GROUP BY q_user_id
      )
      SELECT
        TO_CHAR(fs.first_sub_date, 'YYYY-MM') as cohort_month,
        TO_CHAR(e.event_date, 'YYYY-MM') as revenue_month,
        e.event_name,
        COUNT(DISTINCT e.q_user_id) as users,
        ROUND(SUM(e.price_usd)::numeric, 2) as revenue
      FROM first_subs fs
      JOIN events_v2 e ON fs.q_user_id = e.q_user_id
      WHERE e.event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
        AND e.refund = false
        AND e.price_usd > 0
      GROUP BY TO_CHAR(fs.first_sub_date, 'YYYY-MM'), TO_CHAR(e.event_date, 'YYYY-MM'), e.event_name
      ORDER BY cohort_month, revenue_month
    `);

    // 3. Get current month revenue breakdown by cohort
    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const currentMonthByCohortsResult = await db.query(`
      WITH first_subs AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date
        FROM events_v2
        WHERE event_name IN ('Subscription Started', 'Trial Converted')
          AND product_id LIKE '%yearly%'
          AND refund = false
        GROUP BY q_user_id
      )
      SELECT
        TO_CHAR(fs.first_sub_date, 'YYYY-MM') as cohort_month,
        e.event_name,
        COUNT(DISTINCT e.q_user_id) as users,
        ROUND(SUM(e.price_usd)::numeric, 2) as revenue
      FROM first_subs fs
      JOIN events_v2 e ON fs.q_user_id = e.q_user_id
      WHERE e.event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
        AND e.refund = false
        AND e.price_usd > 0
        AND TO_CHAR(e.event_date, 'YYYY-MM') = $1
      GROUP BY TO_CHAR(fs.first_sub_date, 'YYYY-MM'), e.event_name
      ORDER BY cohort_month
    `, [currentMonthStr]);

    // 4. Calculate retention/renewal rates by cohort age
    const renewalRatesResult = await db.query(`
      WITH first_subs AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date
        FROM events_v2
        WHERE event_name IN ('Subscription Started', 'Trial Converted')
          AND product_id LIKE '%yearly%'
          AND refund = false
        GROUP BY q_user_id
      ),
      cohort_sizes AS (
        SELECT
          TO_CHAR(first_sub_date, 'YYYY-MM') as cohort_month,
          COUNT(*) as initial_size
        FROM first_subs
        GROUP BY TO_CHAR(first_sub_date, 'YYYY-MM')
      ),
      renewals AS (
        SELECT
          TO_CHAR(fs.first_sub_date, 'YYYY-MM') as cohort_month,
          COUNT(DISTINCT e.q_user_id) as renewed_users
        FROM first_subs fs
        JOIN events_v2 e ON fs.q_user_id = e.q_user_id
        WHERE e.event_name = 'Subscription Renewed'
          AND e.refund = false
          AND e.event_date >= fs.first_sub_date + INTERVAL '11 months'
        GROUP BY TO_CHAR(fs.first_sub_date, 'YYYY-MM')
      )
      SELECT
        cs.cohort_month,
        cs.initial_size,
        COALESCE(r.renewed_users, 0) as renewed_users,
        ROUND((COALESCE(r.renewed_users, 0)::numeric / cs.initial_size) * 100, 1) as renewal_rate,
        EXTRACT(DAYS FROM (CURRENT_DATE - (cs.cohort_month || '-01')::date)) as cohort_age_days
      FROM cohort_sizes cs
      LEFT JOIN renewals r ON cs.cohort_month = r.cohort_month
      ORDER BY cs.cohort_month
    `);

    // 5. Get total revenue for validation
    const totalRevenueResult = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        ROUND(SUM(price_usd)::numeric, 2) as total_revenue,
        COUNT(DISTINCT q_user_id) as unique_users
      FROM events_v2
      WHERE event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
        AND refund = false
        AND price_usd > 0
      GROUP BY TO_CHAR(event_date, 'YYYY-MM')
      ORDER BY month
    `);

    // 6. Aggregate pre-2024 cohorts
    const pre2024Cohorts = cohortsResult.rows.filter(c => c.cohort_month < '2024-01');
    const post2024Cohorts = cohortsResult.rows.filter(c => c.cohort_month >= '2024-01');

    let aggregatedCohorts = [...post2024Cohorts];
    if (pre2024Cohorts.length > 0) {
      const pre2024Aggregate = {
        cohort_month: 'pre-2024',
        subscribers: pre2024Cohorts.reduce((s, c) => s + parseInt(c.subscribers), 0),
        avg_price: pre2024Cohorts.reduce((s, c) => s + parseFloat(c.avg_price), 0) / pre2024Cohorts.length,
        initial_revenue: pre2024Cohorts.reduce((s, c) => s + parseFloat(c.initial_revenue), 0),
      };
      aggregatedCohorts = [pre2024Aggregate, ...aggregatedCohorts];
    }

    res.json({
      cohorts: aggregatedCohorts,
      revenueByMonth: revenueByMonthResult.rows,
      currentMonthByCohorts: currentMonthByCohortsResult.rows,
      renewalRates: renewalRatesResult.rows,
      monthlyTotals: totalRevenueResult.rows,
      summary: {
        totalCohorts: cohortsResult.rows.length,
        totalSubscribers: cohortsResult.rows.reduce((s, c) => s + parseInt(c.subscribers), 0),
        dataRange: {
          from: cohortsResult.rows[0]?.cohort_month,
          to: cohortsResult.rows[cohortsResult.rows.length - 1]?.cohort_month,
        },
      },
    });
  } catch (error) {
    console.error('Cohort analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
