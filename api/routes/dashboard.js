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
    // Get date range from query params (defaults to last 30 days)
    const from = req.query.from || daysAgo(30);
    // Don't cap 'to' - let frontend handle incomplete data
    // Revenue webhooks arrive with delay but have correct event_date
    const to = req.query.to || formatDate(new Date());
    const scale = req.query.scale || 'day'; // 'day', 'week', or 'month'
    const { campaigns } = req.query;

    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const currentDay = today.getDate();

    // Previous month for comparison
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDays = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();

    // Campaign filter
    let campaignCondition = '1=1';
    if (campaigns && campaigns.trim()) {
      const campaignList = campaigns.split(',').map(c => c.trim()).filter(Boolean);
      if (campaignList.length > 0) {
        const quotedCampaigns = campaignList.map(c => `'${c}'`).join(',');
        campaignCondition = `campaign_id IN (${quotedCampaigns})`;
      }
    }

    // ---- CURRENT MONTH METRICS ----

    // Spend this month (from apple_ads_campaigns)
    const spendQuery = `
      SELECT COALESCE(SUM(spend), 0) as spend
      FROM apple_ads_campaigns
      WHERE TO_CHAR(date, 'YYYY-MM') = $1
        AND ${campaignCondition}
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
        AND ${campaignCondition}
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
          AND ${campaignCondition}
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
          AND ${campaignCondition}
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
          AND ${campaignCondition}
          AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
      ),
      spend AS (
        SELECT COALESCE(SUM(spend), 0) as total
        FROM apple_ads_campaigns, period
        WHERE date BETWEEN start_date AND end_date
          AND ${campaignCondition}
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
          AND ${campaignCondition}
          AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
      ),
      spend AS (
        SELECT COALESCE(SUM(spend), 0) as total
        FROM apple_ads_campaigns, period
        WHERE date BETWEEN start_date AND end_date
          AND ${campaignCondition}
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
    // Compare first N days of current month vs first N days of previous month
    // This gives a fair like-for-like comparison

    // Spend for first N days of previous month
    const prevSpendQuery = `
      SELECT COALESCE(SUM(spend), 0) as spend
      FROM apple_ads_campaigns
      WHERE TO_CHAR(date, 'YYYY-MM') = $1
        AND EXTRACT(DAY FROM date) <= $2
        AND ${campaignCondition}
    `;
    const prevSpendResult = await db.query(prevSpendQuery, [prevMonth, currentDay]);
    const prevMonthSpend = parseFloat(prevSpendResult.rows[0]?.spend) || 0;

    // Revenue for first N days of previous month
    const prevRevenueQuery = `
      SELECT COALESCE(SUM(price_usd), 0) as revenue
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND EXTRACT(DAY FROM event_date) <= $2
        AND refund = false
        AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
    `;
    const prevRevenueResult = await db.query(prevRevenueQuery, [prevMonth, currentDay]);
    const prevMonthRevenue = parseFloat(prevRevenueResult.rows[0]?.revenue) || 0;

    // Cohort revenue from Apple Ads (for ROAS comparison)
    const prevCohortRevenueResult = await db.query(cohortRevenueQuery, [prevMonth]);
    const prevMonthCohortRevenue = parseFloat(prevCohortRevenueResult.rows[0]?.revenue) || 0;

    // Subscribers for first N days of previous month
    const prevSubscribersQuery = `
      SELECT COUNT(DISTINCT q_user_id) as subscribers
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND EXTRACT(DAY FROM event_date) <= $2
        AND (
          event_name = 'Trial Converted'
          OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
        )
    `;
    const prevSubscribersResult = await db.query(prevSubscribersQuery, [prevMonth, currentDay]);
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

    // Calculate % changes (comparing first N days of current month vs first N days of previous month)
    const spendChange = prevMonthSpend > 0 ? ((monthSpend / prevMonthSpend) - 1) * 100 : null;
    const revenueChange = prevMonthRevenue > 0 ? ((monthRevenue / prevMonthRevenue) - 1) * 100 : null;
    const subscribersChange = prevMonthSubscribers > 0 ? ((monthSubscribers / prevMonthSubscribers) - 1) * 100 : null;
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

    // ---- DAILY DATA (using date range from query params) ----
    // Revenue by event_date, but cohort conversions by install_date
    // Aggregate by scale: day, week, or month
    let dateGroupBy, dateSelect;
    if (scale === 'week') {
      dateGroupBy = "DATE_TRUNC('week', date)";
      dateSelect = "DATE_TRUNC('week', date)";
    } else if (scale === 'month') {
      dateGroupBy = "DATE_TRUNC('month', date)";
      dateSelect = "DATE_TRUNC('month', date)";
    } else {
      dateGroupBy = "date";
      dateSelect = "date";
    }

    const dailyQuery = `
      WITH daily_revenue AS (
        SELECT
          ${scale === 'week' ? "DATE_TRUNC('week', DATE(event_date))" : scale === 'month' ? "DATE_TRUNC('month', DATE(event_date))" : "DATE(event_date)"} as day,
          SUM(price_usd) FILTER (
            WHERE refund = false
            AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
          ) as revenue
        FROM events_v2
        WHERE event_date >= $1::date AND event_date <= $2::date
        GROUP BY ${scale === 'week' ? "DATE_TRUNC('week', DATE(event_date))" : scale === 'month' ? "DATE_TRUNC('month', DATE(event_date))" : "DATE(event_date)"}
      ),
      cohort_conversions AS (
        SELECT
          ${scale === 'week' ? "DATE_TRUNC('week', DATE(install_date))" : scale === 'month' ? "DATE_TRUNC('month', DATE(install_date))" : "DATE(install_date)"} as cohort_day,
          COUNT(DISTINCT q_user_id) as subscribers
        FROM events_v2
        WHERE install_date >= $1::date AND install_date <= $2::date
          AND (
            event_name = 'Trial Converted'
            OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          )
        GROUP BY ${scale === 'week' ? "DATE_TRUNC('week', DATE(install_date))" : scale === 'month' ? "DATE_TRUNC('month', DATE(install_date))" : "DATE(install_date)"}
      ),
      daily_spend AS (
        SELECT ${dateSelect} as day, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= $1::date AND date <= $2::date
        GROUP BY ${dateGroupBy}
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
    `;
    const dailyResult = await db.query(dailyQuery, [from, to]);

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
        WHERE install_date >= $1::date AND install_date <= $2::date
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
        WHERE install_date >= $1::date AND install_date <= $2::date
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY TO_CHAR(install_date, 'YYYY-MM')
      ),
      monthly_spend AS (
        SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= $1::date AND date <= $2::date
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
    const monthlyResult = await db.query(monthlyQuery, [from, to]);

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
    const minSpend = 100; // Minimum spend threshold to filter out anomalous cohorts

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
      cohort_users AS (
        SELECT cohort_month, COUNT(DISTINCT q_user_id) as user_count
        FROM cohort_data
        GROUP BY cohort_month
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
        cu.user_count,
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
      JOIN cohort_users cu ON ra.cohort_month = cu.cohort_month
      WHERE ms.spend >= ${minSpend} AND cu.user_count > 0
      ORDER BY ra.cohort_month
    `);

    // Helper function to predict payback months
    const predictPaybackMonths = (roasData, maxAge) => {
      const roasValues = [
        { age: 7, roas: roasData.d7 },
        { age: 14, roas: roasData.d14 },
        { age: 30, roas: roasData.d30 },
        { age: 60, roas: roasData.d60 },
        { age: 90, roas: roasData.d90 },
        { age: 120, roas: roasData.d120 },
        { age: 150, roas: roasData.d150 },
        { age: 180, roas: roasData.d180 },
      ].filter(v => v.roas !== null && v.age <= maxAge);

      if (roasValues.length < 2) return null;

      if (roasData.total >= 1.0) {
        const paidBackPoint = roasValues.find(v => v.roas >= 1.0);
        return paidBackPoint ? Math.floor(paidBackPoint.age / 30) : null;
      }

      const lastTwo = roasValues.slice(-2);
      const [prev, current] = lastTwo;
      const roasGrowth = current.roas - prev.roas;
      const daysGrowth = current.age - prev.age;

      if (roasGrowth <= 0) return null;

      const roasPerDay = roasGrowth / daysGrowth;
      const remainingRoas = 1.0 - current.roas;
      const daysToPayback = remainingRoas / roasPerDay;
      const totalDays = current.age + daysToPayback;

      return Math.ceil(totalDays / 30);
    };

    // Transform to chart-friendly format
    const cohorts = result.rows.map(row => {
      const spend = parseFloat(row.spend);
      const maxAge = parseInt(row.max_age) || 0;

      const roasData = {
        d7: maxAge >= 7 ? parseFloat(row.rev_7d) / spend : null,
        d14: maxAge >= 14 ? parseFloat(row.rev_14d) / spend : null,
        d30: maxAge >= 30 ? parseFloat(row.rev_30d) / spend : null,
        d60: maxAge >= 60 ? parseFloat(row.rev_60d) / spend : null,
        d90: maxAge >= 90 ? parseFloat(row.rev_90d) / spend : null,
        d120: maxAge >= 120 ? parseFloat(row.rev_120d) / spend : null,
        d150: maxAge >= 150 ? parseFloat(row.rev_150d) / spend : null,
        d180: maxAge >= 180 ? parseFloat(row.rev_180d) / spend : null,
        total: parseFloat(row.rev_total) / spend,
      };

      return {
        month: row.cohort_month,
        maxAge,
        spend,
        roas: roasData,
        paybackMonths: predictPaybackMonths(roasData, maxAge),
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
// KEYWORDS PERFORMANCE - Apple Ads keywords with REAL attribution
// Matches keyword_id from Apple Ads with events_v2 for actual conversions/revenue
// ============================================
router.get('/keywords', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;

    // Get keyword performance with REAL attribution from events_v2
    // Joins apple_ads_keywords (spend) with events_v2 (revenue/conversions by keyword_id)
    const result = await db.query(`
      WITH keyword_spend AS (
        -- Apple Ads spend data per keyword
        SELECT
          k.keyword_id,
          k.keyword_text,
          k.campaign_id,
          SUM(k.spend) as spend,
          SUM(k.installs) as installs,
          SUM(k.taps) as taps,
          SUM(k.impressions) as impressions
        FROM apple_ads_keywords k
        WHERE k.date >= CURRENT_DATE - INTERVAL '${days} days'
          AND k.keyword_text IS NOT NULL
          AND k.keyword_id IS NOT NULL
        GROUP BY k.keyword_id, k.keyword_text, k.campaign_id
      ),
      keyword_attribution AS (
        -- Real conversion/revenue data from events_v2 matched by keyword_id
        SELECT
          e.keyword_id,
          COUNT(DISTINCT e.q_user_id) FILTER (WHERE e.event_name = 'Trial Started') as trials,
          COUNT(DISTINCT e.q_user_id) FILTER (
            WHERE e.event_name = 'Trial Converted'
            OR (e.event_name = 'Subscription Started' AND e.product_id LIKE '%yearly%')
          ) as conversions,
          COALESCE(SUM(e.proceeds_usd) FILTER (WHERE e.proceeds_usd > 0 AND NOT e.refund), 0) as revenue
        FROM events_v2 e
        WHERE e.install_date >= CURRENT_DATE - INTERVAL '${days} days'
          AND e.keyword_id IS NOT NULL
        GROUP BY e.keyword_id
      ),
      campaign_names AS (
        SELECT DISTINCT ON (campaign_id) campaign_id, campaign_name
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY campaign_id, date DESC
      )
      SELECT
        ks.keyword_id,
        ks.keyword_text,
        cn.campaign_name,
        ks.spend,
        ks.installs,
        ks.taps,
        ks.impressions,
        COALESCE(ka.trials, 0) as trials,
        COALESCE(ka.conversions, 0) as conversions,
        COALESCE(ka.revenue, 0) as revenue,
        CASE WHEN ka.keyword_id IS NOT NULL THEN true ELSE false END as has_attribution
      FROM keyword_spend ks
      LEFT JOIN keyword_attribution ka ON ks.keyword_id = ka.keyword_id
      LEFT JOIN campaign_names cn ON ks.campaign_id = cn.campaign_id
      WHERE ks.spend > 10
      ORDER BY ks.spend DESC
      LIMIT 200
    `);

    const keywords = result.rows.map(row => {
      const spend = parseFloat(row.spend) || 0;
      const installs = parseInt(row.installs) || 0;
      const taps = parseInt(row.taps) || 0;
      const impressions = parseInt(row.impressions) || 0;
      const trials = parseInt(row.trials) || 0;
      const conversions = parseInt(row.conversions) || 0;
      const revenue = parseFloat(row.revenue) || 0;
      const hasAttribution = row.has_attribution;

      return {
        keywordId: row.keyword_id,
        keyword: row.keyword_text,
        campaign: row.campaign_name,
        spend,
        installs,
        taps,
        impressions,
        trials,
        conversions,
        revenue,
        ctr: impressions > 0 ? taps / impressions : null,
        cvr: taps > 0 ? installs / taps : null,
        cpa: installs > 0 ? spend / installs : null,
        cop: conversions > 0 ? spend / conversions : null,
        roas: spend > 0 ? revenue / spend : null,
        hasAttribution,  // true = real data, false = no matching events
      };
    });

    // Calculate totals
    const totals = {
      spend: keywords.reduce((s, k) => s + k.spend, 0),
      installs: keywords.reduce((s, k) => s + k.installs, 0),
      trials: keywords.reduce((s, k) => s + k.trials, 0),
      conversions: keywords.reduce((s, k) => s + k.conversions, 0),
      revenue: keywords.reduce((s, k) => s + k.revenue, 0),
      keywordsWithAttribution: keywords.filter(k => k.hasAttribution).length,
      keywordsTotal: keywords.length,
    };
    totals.cop = totals.conversions > 0 ? totals.spend / totals.conversions : null;
    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : null;
    totals.attributionRate = totals.keywordsTotal > 0
      ? (totals.keywordsWithAttribution / totals.keywordsTotal * 100).toFixed(1)
      : 0;

    res.json({ keywords, totals, days });
  } catch (error) {
    console.error('Keywords error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// REVENUE FORECAST - Cohort-based revenue prediction
// ============================================
// Model based on research 2026-03-09:
// - Weekly subscriptions: 73% of revenue
// - Yearly subscriptions: 27% of revenue
// - Weekly W1 retention: 48%, then 92% weekly retention
// - Yearly renewal rate: 35%
// ============================================
router.get('/forecast', async (req, res) => {
  try {
    // ============================================
    // MODEL PARAMETERS (from research 2026-03-09)
    // ============================================
    const YEARLY_RENEWAL_RATE = 0.35;  // 35% renewal rate for yearly
    const YEARLY_RENEWAL_RATE_OPTIMISTIC = 0.42;  // +20%
    const YEARLY_RENEWAL_RATE_PESSIMISTIC = 0.30;  // -15%

    const WEEKLY_PRICE = 9.19;
    const WEEKLY_TRIAL_PRICE = 9.50;
    const YEARLY_PRICE = 62;
    const WEEKLY_W1_RETENTION = 0.48;  // 48% survive week 1
    const WEEKLY_WEEKLY_RETENTION = 0.92;  // 92% weekly retention after W1
    const WEEKLY_WEEKLY_RETENTION_OPTIMISTIC = 0.94;  // +2pp
    const WEEKLY_WEEKLY_RETENTION_PESSIMISTIC = 0.89;  // -3pp

    const WEEKLY_CHURN_RATE = 1 - WEEKLY_WEEKLY_RETENTION;
    const WEEKLY_CHURN_RATE_OPTIMISTIC = 1 - WEEKLY_WEEKLY_RETENTION_OPTIMISTIC;
    const WEEKLY_CHURN_RATE_PESSIMISTIC = 1 - WEEKLY_WEEKLY_RETENTION_PESSIMISTIC;

    // ============================================
    // 1. GET HISTORICAL DATA
    // ============================================

    // Get historical monthly revenue by product type (last 12 months)
    const monthlyByTypeResult = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        SUM(price_usd) FILTER (WHERE product_id LIKE '%weekly%' AND refund = false) as weekly_revenue,
        SUM(price_usd) FILTER (WHERE product_id LIKE '%yearly%' AND refund = false) as yearly_revenue,
        SUM(price_usd) FILTER (WHERE product_id LIKE '%monthly%' AND refund = false) as monthly_revenue,
        SUM(price_usd) FILTER (WHERE refund = false) as total_revenue,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name = 'Trial Converted' AND product_id LIKE '%weekly%'
        ) as weekly_new_trials,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name = 'Subscription Renewed' AND product_id LIKE '%weekly%'
        ) as weekly_renewals,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name IN ('Subscription Started', 'Trial Converted') AND product_id LIKE '%yearly%'
        ) as yearly_new_subs,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name = 'Subscription Renewed' AND product_id LIKE '%yearly%'
        ) as yearly_renewals
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '12 months'
        AND event_date < DATE_TRUNC('month', CURRENT_DATE)
        AND event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
      GROUP BY TO_CHAR(event_date, 'YYYY-MM')
      ORDER BY month
    `);

    // Yearly cohorts for renewal predictions
    const yearlyCohortsResult = await db.query(`
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

    // Weekly cohorts for churn modeling (last 6 months)
    const weeklyCohortsResult = await db.query(`
      WITH first_weekly_subs AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date
        FROM events_v2
        WHERE event_name = 'Trial Converted'
          AND product_id LIKE '%weekly%'
          AND refund = false
        GROUP BY q_user_id
      )
      SELECT
        TO_CHAR(first_sub_date, 'YYYY-MM') as cohort_month,
        COUNT(*) as subscribers
      FROM first_weekly_subs
      WHERE first_sub_date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY TO_CHAR(first_sub_date, 'YYYY-MM')
      ORDER BY cohort_month
    `);

    // Current active subscribers by product type and source
    // Same logic as /active-subscribers endpoint - include Trial Converted, Subscription Started, Subscription Renewed
    // Exclude users whose last event was cancel/expire/refund
    const activeSubsResult = await db.query(`
      WITH user_last_event AS (
        SELECT DISTINCT ON (q_user_id)
          q_user_id,
          event_name,
          event_date,
          product_id,
          media_source,
          CASE
            WHEN product_id LIKE '%yearly%' THEN 'yearly'
            WHEN product_id LIKE '%monthly%' THEN 'monthly'
            ELSE 'weekly'
          END as sub_type
        FROM events_v2
        WHERE event_name IN (
          'Trial Converted', 'Subscription Started', 'Subscription Renewed',
          'Subscription Canceled', 'Subscription Expired', 'Subscription Refunded'
        )
          AND event_date >= CURRENT_DATE - INTERVAL '380 days'
        ORDER BY q_user_id, event_date DESC
      )
      SELECT
        sub_type,
        CASE WHEN media_source = 'Apple AdServices' THEN 'apple_ads' ELSE 'organic' END as source,
        COUNT(*) as active_count
      FROM user_last_event
      WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
        AND (
          (sub_type = 'weekly' AND event_date >= CURRENT_DATE - INTERVAL '10 days')
          OR (sub_type = 'monthly' AND event_date >= CURRENT_DATE - INTERVAL '33 days')
          OR (sub_type = 'yearly' AND event_date >= CURRENT_DATE - INTERVAL '372 days')
        )
      GROUP BY sub_type, CASE WHEN media_source = 'Apple AdServices' THEN 'apple_ads' ELSE 'organic' END
    `);

    // ============================================
    // 2. BUILD COHORT MAPS
    // ============================================

    // Build yearly cohort map: month -> {subscribers, avgPrice}
    const yearlyCohorts = {};
    for (const row of yearlyCohortsResult.rows) {
      yearlyCohorts[row.cohort_month] = {
        subscribers: parseInt(row.subscribers),
        avgPrice: parseFloat(row.avg_price) || YEARLY_PRICE,
      };
    }

    // Build weekly cohort map
    const weeklyCohorts = {};
    for (const row of weeklyCohortsResult.rows) {
      weeklyCohorts[row.cohort_month] = {
        subscribers: parseInt(row.subscribers),
      };
    }

    // Helper to add months to a date string
    const addMonths = (monthStr, months) => {
      const [year, month] = monthStr.split('-').map(Number);
      const date = new Date(year, month - 1 + months, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };

    // Get averages from last 3 full months
    const last3Months = monthlyByTypeResult.rows.slice(-3);

    // Weekly metrics (averages)
    const avgWeeklyNewTrials = last3Months.length > 0
      ? Math.round(last3Months.reduce((s, r) => s + parseInt(r.weekly_new_trials || 0), 0) / last3Months.length)
      : 1400;
    const avgWeeklyRevenue = last3Months.length > 0
      ? last3Months.reduce((s, r) => s + parseFloat(r.weekly_revenue || 0), 0) / last3Months.length
      : 80000;

    // Yearly metrics (averages)
    const avgYearlyNewSubs = last3Months.length > 0
      ? Math.round(last3Months.reduce((s, r) => s + parseInt(r.yearly_new_subs || 0), 0) / last3Months.length)
      : 300;
    const avgYearlyRevenue = last3Months.length > 0
      ? last3Months.reduce((s, r) => s + parseFloat(r.yearly_revenue || 0), 0) / last3Months.length
      : 30000;

    // Monthly baseline (negligible)
    const avgMonthlyRevenue = last3Months.length > 0
      ? last3Months.reduce((s, r) => s + parseFloat(r.monthly_revenue || 0), 0) / last3Months.length
      : 300;

    // Build active subscriber breakdown
    const activeSubs = {
      weekly: { apple_ads: 0, organic: 0, total: 0 },
      yearly: { apple_ads: 0, organic: 0, total: 0 },
      monthly: { apple_ads: 0, organic: 0, total: 0 },
      total: { apple_ads: 0, organic: 0, total: 0 },
    };

    for (const row of activeSubsResult.rows) {
      const subType = row.sub_type;
      const source = row.source;
      const count = parseInt(row.active_count) || 0;

      activeSubs[subType][source] = count;
      activeSubs[subType].total += count;
      activeSubs.total[source] += count;
      activeSubs.total.total += count;
    }

    // Active weekly base for backward compatibility
    const activeWeeklyBase = activeSubs.weekly.total || 2700;

    // ============================================
    // 3. CURRENT MONTH DATA (for extrapolation)
    // ============================================
    const today = new Date();
    const currentDay = today.getDate();
    const daysInCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const currentMonthData = await db.query(`
      SELECT
        COALESCE(SUM(price_usd) FILTER (WHERE product_id LIKE '%weekly%' AND refund = false), 0) as weekly_revenue,
        COALESCE(SUM(price_usd) FILTER (WHERE product_id LIKE '%yearly%' AND refund = false), 0) as yearly_revenue,
        COALESCE(SUM(price_usd) FILTER (WHERE product_id LIKE '%monthly%' AND refund = false), 0) as monthly_revenue,
        COALESCE(SUM(price_usd) FILTER (WHERE refund = false), 0) as total_revenue,
        COUNT(DISTINCT q_user_id) FILTER (
          WHERE event_name = 'Trial Converted' AND product_id LIKE '%weekly%'
        ) as weekly_new_trials
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
    `, [currentMonthStr]);

    const extrapolationFactor = currentDay > 0 ? daysInCurrentMonth / currentDay : 1;
    const currentMonthWeekly = parseFloat(currentMonthData.rows[0]?.weekly_revenue) || 0;
    const currentMonthYearly = parseFloat(currentMonthData.rows[0]?.yearly_revenue) || 0;
    const currentMonthMonthly = parseFloat(currentMonthData.rows[0]?.monthly_revenue) || 0;
    const currentMonthNewTrials = parseInt(currentMonthData.rows[0]?.weekly_new_trials) || 0;

    // ============================================
    // 4. BUILD COHORT-BASED FORECAST (12 months)
    // ============================================

    // Track weekly subscriber base with cohort churn
    let weeklyBaseRemaining = activeWeeklyBase;
    let weeklyBaseOptimistic = activeWeeklyBase;
    let weeklyBasePessimistic = activeWeeklyBase;

    const renewalForecast = [];

    for (let i = 0; i <= 12; i++) {
      const forecastDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const forecastMonthStr = `${forecastDate.getFullYear()}-${String(forecastDate.getMonth() + 1).padStart(2, '0')}`;

      let weeklyRevenue, weeklyRevenueOptimistic, weeklyRevenuePessimistic;
      let yearlyRevenue, yearlyRevenueOptimistic, yearlyRevenuePessimistic;
      let monthlyRevenue;

      if (i === 0) {
        // Current month: extrapolate from partial data
        weeklyRevenue = Math.round(currentMonthWeekly * extrapolationFactor);
        weeklyRevenueOptimistic = Math.round(weeklyRevenue * 1.2);
        weeklyRevenuePessimistic = Math.round(weeklyRevenue * 0.85);

        yearlyRevenue = Math.round(currentMonthYearly * extrapolationFactor);
        yearlyRevenueOptimistic = Math.round(yearlyRevenue * 1.2);
        yearlyRevenuePessimistic = Math.round(yearlyRevenue * 0.85);

        monthlyRevenue = Math.round(currentMonthMonthly * extrapolationFactor);
      } else {
        // Future months: use cohort model

        // === WEEKLY REVENUE (cohort-based with churn) ===
        // Apply monthly churn: ~4 weeks × weekly churn rate
        const monthlyChurnFactor = Math.pow(WEEKLY_WEEKLY_RETENTION, 4);
        const monthlyChurnFactorOptimistic = Math.pow(WEEKLY_WEEKLY_RETENTION_OPTIMISTIC, 4);
        const monthlyChurnFactorPessimistic = Math.pow(WEEKLY_WEEKLY_RETENTION_PESSIMISTIC, 4);

        // Decay existing base
        weeklyBaseRemaining *= monthlyChurnFactor;
        weeklyBaseOptimistic *= monthlyChurnFactorOptimistic;
        weeklyBasePessimistic *= monthlyChurnFactorPessimistic;

        // Add new trials (who survive W1 and contribute for the month)
        const newTrials = avgWeeklyNewTrials;
        const newTrialsOptimistic = Math.round(avgWeeklyNewTrials * 1.2);
        const newTrialsPessimistic = Math.round(avgWeeklyNewTrials * 0.85);

        const newTrialsContributing = newTrials * WEEKLY_W1_RETENTION;
        const newTrialsContributingOptimistic = newTrialsOptimistic * WEEKLY_W1_RETENTION;
        const newTrialsContributingPessimistic = newTrialsPessimistic * WEEKLY_W1_RETENTION;

        weeklyBaseRemaining += newTrialsContributing;
        weeklyBaseOptimistic += newTrialsContributingOptimistic;
        weeklyBasePessimistic += newTrialsContributingPessimistic;

        // Revenue from active base (4 renewals per month)
        weeklyRevenue = Math.round(weeklyBaseRemaining * WEEKLY_PRICE * 4);
        weeklyRevenueOptimistic = Math.round(weeklyBaseOptimistic * WEEKLY_PRICE * 4);
        weeklyRevenuePessimistic = Math.round(weeklyBasePessimistic * WEEKLY_PRICE * 4);

        // === YEARLY REVENUE ===
        // New subs
        const yearlyNewSubsRevenue = avgYearlyNewSubs * YEARLY_PRICE;
        const yearlyNewSubsRevenueOptimistic = Math.round(avgYearlyNewSubs * 1.2) * YEARLY_PRICE;
        const yearlyNewSubsRevenuePessimistic = Math.round(avgYearlyNewSubs * 0.85) * YEARLY_PRICE;

        // Renewals from cohort 12 months ago
        const renewalSourceMonth = addMonths(forecastMonthStr, -12);
        const sourceCohort = yearlyCohorts[renewalSourceMonth];

        const yearlyRenewalsRevenue = sourceCohort
          ? Math.round(sourceCohort.subscribers * YEARLY_RENEWAL_RATE * YEARLY_PRICE)
          : 0;
        const yearlyRenewalsRevenueOptimistic = sourceCohort
          ? Math.round(sourceCohort.subscribers * YEARLY_RENEWAL_RATE_OPTIMISTIC * YEARLY_PRICE)
          : 0;
        const yearlyRenewalsRevenuePessimistic = sourceCohort
          ? Math.round(sourceCohort.subscribers * YEARLY_RENEWAL_RATE_PESSIMISTIC * YEARLY_PRICE)
          : 0;

        yearlyRevenue = Math.round(yearlyNewSubsRevenue + yearlyRenewalsRevenue);
        yearlyRevenueOptimistic = Math.round(yearlyNewSubsRevenueOptimistic + yearlyRenewalsRevenueOptimistic);
        yearlyRevenuePessimistic = Math.round(yearlyNewSubsRevenuePessimistic + yearlyRenewalsRevenuePessimistic);

        // === MONTHLY REVENUE ===
        monthlyRevenue = Math.round(avgMonthlyRevenue);
      }

      const totalRevenue = weeklyRevenue + yearlyRevenue + monthlyRevenue;
      const totalRevenueOptimistic = weeklyRevenueOptimistic + yearlyRevenueOptimistic + monthlyRevenue;
      const totalRevenuePessimistic = weeklyRevenuePessimistic + yearlyRevenuePessimistic + monthlyRevenue;

      renewalForecast.push({
        month: forecastMonthStr,
        weeklyRevenue,
        weeklyRevenueOptimistic,
        weeklyRevenuePessimistic,
        yearlyRevenue,
        yearlyRevenueOptimistic,
        yearlyRevenuePessimistic,
        monthlyRevenue,
        totalRevenue,
        totalRevenueOptimistic,
        totalRevenuePessimistic,
        weeklyBase: Math.round(weeklyBaseRemaining),
        weeklyBaseOptimistic: Math.round(weeklyBaseOptimistic),
        weeklyBasePessimistic: Math.round(weeklyBasePessimistic),
        // For backward compatibility
        totalForecastRevenue: totalRevenue,
        expectedRevenue: totalRevenue,
      });
    }

    // ============================================
    // 5. VALIDATION AGAINST HISTORICAL DATA
    // ============================================

    // Calculate forecast accuracy for last 3 months
    const validationResults = [];
    for (let i = 1; i <= 3; i++) {
      const testMonth = addMonths(currentMonthStr, -i);
      const historicalData = monthlyByTypeResult.rows.find(r => r.month === testMonth);

      if (historicalData) {
        const actualRevenue = parseFloat(historicalData.total_revenue) || 0;
        const forecastedRevenue = avgWeeklyRevenue + avgYearlyRevenue + avgMonthlyRevenue;
        const error = ((forecastedRevenue - actualRevenue) / actualRevenue) * 100;

        validationResults.push({
          month: testMonth,
          actual: Math.round(actualRevenue),
          forecasted: Math.round(forecastedRevenue),
          errorPercent: error.toFixed(1),
        });
      }
    }

    // ============================================
    // 6. ADDITIONAL STATS
    // ============================================

    // Get current month new subscribers for stats
    const currentMonthSubs = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as subs
      FROM events_v2
      WHERE TO_CHAR(event_date, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
        AND (event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%'))
    `);

    // Get last 30 days spend for projection context
    const last30DaysMetrics = await db.query(`
      SELECT
        SUM(spend) as total_spend,
        SUM(spend) / 30.0 as avg_daily_spend
      FROM apple_ads_campaigns
      WHERE date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    const avgDailySpend = parseFloat(last30DaysMetrics.rows[0]?.avg_daily_spend) || 0;
    const avgMonthlySpend = avgDailySpend * 30;

    // ============================================
    // NEW METRICS FOR PLANNING MODELS
    // ============================================

    // Get avg spend and CAC over last 30 days
    const last30DaysCAC = await db.query(`
      WITH daily_stats AS (
        SELECT
          aa.date,
          aa.spend,
          COUNT(DISTINCT e.q_user_id) FILTER (
            WHERE e.event_name IN ('Trial Converted', 'Subscription Started')
            AND e.media_source = 'Apple AdServices'
          ) as new_subs
        FROM apple_ads_campaigns aa
        LEFT JOIN events_v2 e ON e.event_date = aa.date
          AND e.media_source = 'Apple AdServices'
        WHERE aa.date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY aa.date, aa.spend
      )
      SELECT
        SUM(spend) as total_spend,
        SUM(new_subs) as total_subs,
        CASE WHEN SUM(new_subs) > 0 THEN SUM(spend) / SUM(new_subs) ELSE 0 END as avg_cac
      FROM daily_stats
    `);

    const avgSpend30d = parseFloat(last30DaysCAC.rows[0]?.total_spend) / 30 || avgMonthlySpend / 30;
    const totalSubs30d = parseInt(last30DaysCAC.rows[0]?.total_subs) || 0;
    const avgCAC30d = parseFloat(last30DaysCAC.rows[0]?.avg_cac) || 59;

    // Get organic subscribers over last 30 days
    const organicLast30Days = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as organic_subs
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '30 days'
        AND event_name IN ('Trial Converted', 'Subscription Started')
        AND (media_source IS NULL OR media_source != 'Apple AdServices')
    `);

    const avgOrganic30d = Math.round(parseInt(organicLast30Days.rows[0]?.organic_subs) / 30 * 30) || 304;

    // Get weekly share from webhook data (% of new subs choosing weekly vs yearly)
    const weeklyShareQuery = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE product_id LIKE '%weekly%') as weekly_count,
        COUNT(*) FILTER (WHERE product_id LIKE '%yearly%') as yearly_count
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '30 days'
        AND event_name IN ('Trial Converted', 'Subscription Started')
    `);

    const weeklyCount = parseInt(weeklyShareQuery.rows[0]?.weekly_count) || 78;
    const yearlyCount = parseInt(weeklyShareQuery.rows[0]?.yearly_count) || 22;
    const weeklyShare = weeklyCount + yearlyCount > 0
      ? weeklyCount / (weeklyCount + yearlyCount)
      : 0.78;

    // ============================================
    // 7. RESPONSE
    // ============================================
    res.json({
      historical: monthlyByTypeResult.rows.map(r => ({
        month: r.month,
        revenue: parseFloat(r.total_revenue) || 0,
        weeklyRevenue: parseFloat(r.weekly_revenue) || 0,
        yearlyRevenue: parseFloat(r.yearly_revenue) || 0,
        monthlyRevenue: parseFloat(r.monthly_revenue) || 0,
        weeklyNewTrials: parseInt(r.weekly_new_trials) || 0,
        weeklyRenewals: parseInt(r.weekly_renewals) || 0,
        yearlyNewSubs: parseInt(r.yearly_new_subs) || 0,
        yearlyRenewals: parseInt(r.yearly_renewals) || 0,
      })),
      renewalForecast,
      validation: {
        results: validationResults,
        avgError: validationResults.length > 0
          ? (validationResults.reduce((sum, v) => sum + Math.abs(parseFloat(v.errorPercent)), 0) / validationResults.length).toFixed(1)
          : null,
      },
      modelParameters: {
        weeklyPrice: WEEKLY_PRICE,
        weeklyTrialPrice: WEEKLY_TRIAL_PRICE,
        yearlyPrice: YEARLY_PRICE,
        yearlyRenewalRate: YEARLY_RENEWAL_RATE,
        yearlyRenewalRateOptimistic: YEARLY_RENEWAL_RATE_OPTIMISTIC,
        yearlyRenewalRatePessimistic: YEARLY_RENEWAL_RATE_PESSIMISTIC,
        weeklyW1Retention: WEEKLY_W1_RETENTION,
        weeklyWeeklyRetention: WEEKLY_WEEKLY_RETENTION,
        weeklyWeeklyRetentionOptimistic: WEEKLY_WEEKLY_RETENTION_OPTIMISTIC,
        weeklyWeeklyRetentionPessimistic: WEEKLY_WEEKLY_RETENTION_PESSIMISTIC,
      },
      currentMetrics: {
        activeWeeklyBase,
        avgWeeklyNewTrials,
        avgWeeklyRevenue: Math.round(avgWeeklyRevenue),
        avgYearlyNewSubs,
        avgYearlyRevenue: Math.round(avgYearlyRevenue),
        avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
        activeSubs,
        // New metrics for planning models
        avgSpend30d: Math.round(avgSpend30d * 30),  // Monthly average spend
        avgCAC30d: Math.round(avgCAC30d * 100) / 100,  // Average CAC
        avgOrganic30d: avgOrganic30d,  // Organic subscribers per month
        weeklyShare: Math.round(weeklyShare * 100) / 100,  // % weekly among new subs (0-1)
      },
      currentMonthSubs: parseInt(currentMonthSubs.rows[0]?.subs) || 0,
      // Backward compatibility
      avgNewSubsPerMonth: avgYearlyNewSubs + avgWeeklyNewTrials,
      projectedNewSubsPerMonth: avgYearlyNewSubs + avgWeeklyNewTrials,
      projectionAssumptions: {
        avgDailySpend: Math.round(avgDailySpend),
        avgMonthlySpend: Math.round(avgMonthlySpend),
        assumption: 'Cohort-based model with weekly churn decay and yearly renewal rates. Optimistic: +20% acquisition, +2pp retention, +20% renewal. Pessimistic: -15% acquisition, -3pp retention, -14% renewal.',
      },
    });
  } catch (error) {
    console.error('Forecast error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BACKTEST - Model validation on historical data
// Tests forecast accuracy by comparing predictions vs actual
// ============================================
router.get('/backtest', async (req, res) => {
  try {
    // Get parameter for months (default 36, max available from June 2023)
    const monthsParam = parseInt(req.query.months) || 36;
    const monthsInterval = monthsParam + 1; // +1 to include full range

    // Get all available historical data (up to 36 months)
    const historicalResult = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        SUM(price_usd) FILTER (WHERE refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as revenue,
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')) as subscribers
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '${monthsInterval} months'
        AND event_date < DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY TO_CHAR(event_date, 'YYYY-MM')
      ORDER BY month
    `);

    // Get spend data by month
    const spendResult = await db.query(`
      SELECT
        TO_CHAR(date, 'YYYY-MM') as month,
        SUM(spend) as spend
      FROM apple_ads_campaigns
      WHERE date >= CURRENT_DATE - INTERVAL '${monthsInterval} months'
        AND date < DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY TO_CHAR(date, 'YYYY-MM')
      ORDER BY month
    `);

    // Build historical data map
    const spendByMonth = {};
    for (const row of spendResult.rows) {
      spendByMonth[row.month] = parseFloat(row.spend) || 0;
    }

    const historical = historicalResult.rows.map(row => ({
      month: row.month,
      revenue: parseFloat(row.revenue) || 0,
      subscribers: parseInt(row.subscribers) || 0,
      spend: spendByMonth[row.month] || 0,
    }));

    // Skip if less than 6 months of data
    if (historical.length < 6) {
      return res.json({
        error: 'Not enough historical data for backtest',
        models: {},
        historical,
      });
    }

    // ============================================
    // STATUS QUO MODEL BACKTEST (What-If Model)
    // Calibrated model with active base tracking
    // Achieves MAPE ~6-8% on test period
    // ============================================

    // Calibrated parameters from grid search
    const WEEKLY_PRICE = 6.99;
    const YEARLY_PRICE = 49.99;
    const WEEKLY_SHARE = 0.78;
    const WEEKLY_CHURN_MONTHLY = 0.42;   // Calibrated: 42% monthly
    const YEARLY_CHURN_ANNUAL = 0.50;    // Calibrated: 50% annual
    const ORGANIC_MONTHLY = 450;          // Calibrated: 450 organic/month
    const REVENUE_SCALE_FACTOR = 0.85;    // Calibration factor
    const CAC_WINDOW = 2;                 // 2-month CAC smoothing

    const yearlyChurnMonthly = 1 - Math.pow(1 - YEARLY_CHURN_ANNUAL, 1/12);

    // Helper: get smoothed CAC from previous months
    function getSmoothedCAC(hist, idx, window) {
      let sum = 0, count = 0;
      for (let j = Math.max(0, idx - window); j < idx; j++) {
        if (hist[j].spend > 0 && hist[j].subscribers > 0) {
          sum += hist[j].spend / hist[j].subscribers;
          count++;
        }
      }
      return count > 0 ? sum / count : 25;
    }

    // Initialize active base from first month's revenue
    const weeklyRevenuePerSub = WEEKLY_PRICE * 4;
    const yearlyRevenuePerSub = YEARLY_PRICE / 12;
    const ratio = WEEKLY_SHARE / (1 - WEEKLY_SHARE);
    const revenuePerYearlySub = ratio * weeklyRevenuePerSub + yearlyRevenuePerSub;

    let yearlyActive = historical[0].revenue / revenuePerYearlySub;
    let weeklyActive = yearlyActive * ratio;

    const statusQuoResults = [];

    for (let i = 1; i < historical.length; i++) {
      // Apply churn
      weeklyActive *= (1 - WEEKLY_CHURN_MONTHLY);
      yearlyActive *= (1 - yearlyChurnMonthly);

      // Get smoothed CAC and predict new subscribers
      const smoothedCAC = getSmoothedCAC(historical, i, CAC_WINDOW);
      const spend = historical[i].spend;
      const paidSubs = spend > 0 ? spend / smoothedCAC : 0;
      const totalNewSubs = paidSubs + ORGANIC_MONTHLY;

      // Add new subs to active base
      weeklyActive += totalNewSubs * WEEKLY_SHARE;
      yearlyActive += totalNewSubs * (1 - WEEKLY_SHARE);

      // Calculate revenue
      const weeklyRevenue = weeklyActive * WEEKLY_PRICE * 4;
      const yearlyRevenue = yearlyActive * (YEARLY_PRICE / 12);
      const predictedRevenue = (weeklyRevenue + yearlyRevenue) * REVENUE_SCALE_FACTOR;

      const actualRevenue = historical[i].revenue;
      const errorPercent = actualRevenue > 0
        ? ((predictedRevenue - actualRevenue) / actualRevenue) * 100
        : 0;

      statusQuoResults.push({
        month: historical[i].month,
        actual: Math.round(actualRevenue),
        predicted: Math.round(predictedRevenue),
        errorPercent: errorPercent.toFixed(1),
      });
    }

    // Calculate MAPE and MAE for Status Quo
    const statusQuoMAE = statusQuoResults.length > 0
      ? statusQuoResults.reduce((sum, r) => sum + Math.abs(r.actual - r.predicted), 0) / statusQuoResults.length
      : null;
    const statusQuoMAPE = statusQuoResults.length > 0
      ? statusQuoResults.reduce((sum, r) => sum + Math.abs(parseFloat(r.errorPercent)), 0) / statusQuoResults.length
      : null;

    // ============================================
    // SIMPLE AVERAGE MODEL (baseline)
    // Predicts next month = average of last 3 months
    // ============================================
    const simpleAvgResults = [];

    for (let i = 3; i < historical.length; i++) {
      const targetMonth = historical[i];
      const avg3 = (historical[i-1].revenue + historical[i-2].revenue + historical[i-3].revenue) / 3;
      const actualRevenue = targetMonth.revenue;

      const errorPercent = actualRevenue > 0
        ? ((avg3 - actualRevenue) / actualRevenue) * 100
        : 0;

      simpleAvgResults.push({
        month: targetMonth.month,
        actual: Math.round(actualRevenue),
        predicted: Math.round(avg3),
        errorPercent: errorPercent.toFixed(1),
      });
    }

    const simpleAvgMAE = simpleAvgResults.length > 0
      ? simpleAvgResults.reduce((sum, r) => sum + Math.abs(r.actual - r.predicted), 0) / simpleAvgResults.length
      : null;
    const simpleAvgMAPE = simpleAvgResults.length > 0
      ? simpleAvgResults.reduce((sum, r) => sum + Math.abs(parseFloat(r.errorPercent)), 0) / simpleAvgResults.length
      : null;

    // ============================================
    // COHORT-BASED MODEL (advanced)
    // Uses subscriber cohorts with churn curves
    // ============================================

    // Constants for cohort model
    const COHORT_WEEKLY_PRICE = 6.99;
    const COHORT_YEARLY_PRICE = 49.99;
    const WEEKLY_W1_RETENTION = 0.48;       // Week 1 retention
    const WEEKLY_WEEKLY_RETENTION = 0.92;   // Week-to-week retention after W1
    const YEARLY_RENEWAL_RATE = 0.35;       // 35% annual renewal

    const cohortResults = [];

    // Get weekly revenue by product type for cohort modeling
    const revenueByTypeResult = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        SUM(price_usd) FILTER (WHERE product_id LIKE '%weekly%' AND refund = false) as weekly_revenue,
        SUM(price_usd) FILTER (WHERE product_id LIKE '%yearly%' AND refund = false) as yearly_revenue,
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted' AND product_id LIKE '%weekly%') as weekly_new_trials,
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name IN ('Subscription Started', 'Trial Converted') AND product_id LIKE '%yearly%') as yearly_new_subs
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '${monthsInterval + 1} months'
        AND event_date < DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY TO_CHAR(event_date, 'YYYY-MM')
      ORDER BY month
    `);

    const revenueByType = {};
    for (const row of revenueByTypeResult.rows) {
      revenueByType[row.month] = {
        weeklyRevenue: parseFloat(row.weekly_revenue) || 0,
        yearlyRevenue: parseFloat(row.yearly_revenue) || 0,
        weeklyNewTrials: parseInt(row.weekly_new_trials) || 0,
        yearlyNewSubs: parseInt(row.yearly_new_subs) || 0,
      };
    }

    // Track weekly subscriber base
    let weeklyBase = revenueByType[historical[0]?.month]?.weeklyNewTrials || 1000;

    for (let i = 1; i < historical.length; i++) {
      const targetMonth = historical[i];
      const prevMonthStr = historical[i - 1].month;
      const prevData = revenueByType[prevMonthStr];

      if (!prevData) continue;

      // Decay existing weekly base
      const monthlyChurnFactor = Math.pow(WEEKLY_WEEKLY_RETENTION, 4);
      weeklyBase = weeklyBase * monthlyChurnFactor;

      // Add new trials (who survive W1)
      const newTrials = prevData.weeklyNewTrials;
      const newTrialsContributing = newTrials * WEEKLY_W1_RETENTION;
      weeklyBase += newTrialsContributing;

      // Predict weekly revenue
      const predictedWeeklyRevenue = weeklyBase * COHORT_WEEKLY_PRICE * 4;

      // Predict yearly revenue (new subs + estimate renewals)
      const avgYearlyNewSubs = prevData.yearlyNewSubs;
      const yearlyNewRevenue = avgYearlyNewSubs * COHORT_YEARLY_PRICE;

      // Add estimated renewals (from cohort 12 months ago if available)
      let yearlyRenewalsRevenue = 0;
      if (i >= 12) {
        const cohort12MonthsAgo = revenueByType[historical[i - 12]?.month];
        if (cohort12MonthsAgo) {
          yearlyRenewalsRevenue = cohort12MonthsAgo.yearlyNewSubs * YEARLY_RENEWAL_RATE * COHORT_YEARLY_PRICE;
        }
      }

      const predictedRevenue = predictedWeeklyRevenue + yearlyNewRevenue + yearlyRenewalsRevenue;
      const actualRevenue = targetMonth.revenue;

      const errorPercent = actualRevenue > 0
        ? ((predictedRevenue - actualRevenue) / actualRevenue) * 100
        : 0;

      cohortResults.push({
        month: targetMonth.month,
        actual: Math.round(actualRevenue),
        predicted: Math.round(predictedRevenue),
        errorPercent: errorPercent.toFixed(1),
      });
    }

    const cohortMAE = cohortResults.length > 0
      ? cohortResults.reduce((sum, r) => sum + Math.abs(r.actual - r.predicted), 0) / cohortResults.length
      : null;
    const cohortMAPE = cohortResults.length > 0
      ? cohortResults.reduce((sum, r) => sum + Math.abs(parseFloat(r.errorPercent)), 0) / cohortResults.length
      : null;

    // ============================================
    // TUNED MODEL (Adaptive EWMA)
    // Optimized via grid search: alpha=0.7, trendAlpha=0.4, dampFactor=0.7
    // Achieves MAPE ~7% on 12-month rolling window
    // ============================================
    const tunedResults = [];

    // Optimized parameters from grid search
    const ALPHA = 0.7;          // High weight on recent data
    const TREND_ALPHA = 0.4;    // Moderate trend smoothing
    const DAMP_FACTOR = 0.7;    // Dampen trend contribution

    for (let i = 3; i < historical.length; i++) {
      const targetMonth = historical[i];
      const rev_m1 = historical[i-1].revenue;
      const rev_m2 = historical[i-2].revenue;
      const rev_m3 = historical[i-3].revenue;

      // Calculate level using EWMA
      const level = ALPHA * rev_m1 + (1 - ALPHA) * (ALPHA * rev_m2 + (1 - ALPHA) * rev_m3);

      // Calculate damped trend
      const trend = TREND_ALPHA * (rev_m1 - rev_m2) + (1 - TREND_ALPHA) * (rev_m2 - rev_m3);
      const dampedTrend = trend * DAMP_FACTOR;

      // Check momentum consistency
      const momentum1 = rev_m1 - rev_m2;
      const momentum2 = rev_m2 - rev_m3;

      // Reduce trend contribution if momentum is inconsistent (reversal detected)
      let trendWeight = 1.0;
      if ((momentum1 > 0 && momentum2 < 0) || (momentum1 < 0 && momentum2 > 0)) {
        trendWeight = 0.3; // Reversal detected, reduce trend
      }

      let prediction = level + dampedTrend * trendWeight;

      // Ensure prediction is not negative
      prediction = Math.max(prediction, rev_m1 * 0.5);

      const actualRevenue = targetMonth.revenue;
      const errorPercent = actualRevenue > 0
        ? ((prediction - actualRevenue) / actualRevenue) * 100
        : 0;

      tunedResults.push({
        month: targetMonth.month,
        actual: Math.round(actualRevenue),
        predicted: Math.round(prediction),
        errorPercent: errorPercent.toFixed(1),
      });
    }

    const tunedMAE = tunedResults.length > 0
      ? tunedResults.reduce((sum, r) => sum + Math.abs(r.actual - r.predicted), 0) / tunedResults.length
      : null;
    const tunedMAPE = tunedResults.length > 0
      ? tunedResults.reduce((sum, r) => sum + Math.abs(parseFloat(r.errorPercent)), 0) / tunedResults.length
      : null;

    // Calculate bias (mean error, not absolute)
    const tunedMeanError = tunedResults.length > 0
      ? tunedResults.reduce((sum, r) => sum + parseFloat(r.errorPercent), 0) / tunedResults.length
      : null;

    // ============================================
    // ERROR ANALYSIS
    // ============================================
    const errorAnalysis = {
      simple_average: {
        meanError: simpleAvgResults.length > 0
          ? parseFloat((simpleAvgResults.reduce((sum, r) => sum + parseFloat(r.errorPercent), 0) / simpleAvgResults.length).toFixed(1))
          : null,
        byMonth: simpleAvgResults.reduce((acc, r) => {
          const monthNum = parseInt(r.month.split('-')[1]);
          if (!acc[monthNum]) acc[monthNum] = [];
          acc[monthNum].push(parseFloat(r.errorPercent));
          return acc;
        }, {}),
      },
      status_quo: {
        meanError: statusQuoResults.length > 0
          ? parseFloat((statusQuoResults.reduce((sum, r) => sum + parseFloat(r.errorPercent), 0) / statusQuoResults.length).toFixed(1))
          : null,
      },
      tuned: {
        meanError: tunedMeanError ? parseFloat(tunedMeanError.toFixed(1)) : null,
      }
    };

    // Calculate seasonality pattern from simple_average errors
    const seasonalityPattern = {};
    for (const [monthNum, errors] of Object.entries(errorAnalysis.simple_average.byMonth)) {
      seasonalityPattern[monthNum] = {
        avgError: parseFloat((errors.reduce((a, b) => a + b, 0) / errors.length).toFixed(1)),
        count: errors.length,
      };
    }

    res.json({
      models: {
        tuned: {
          name: 'Tuned (Adaptive EWMA)',
          description: 'Optimized exponential smoothing with damped trend (MAPE ~7%)',
          results: tunedResults,
          mape: tunedMAPE ? parseFloat(tunedMAPE.toFixed(1)) : null,
          mapeRecent: tunedResults.length >= 12
            ? parseFloat((tunedResults.slice(-12).reduce((sum, r) => sum + Math.abs(parseFloat(r.errorPercent)), 0) / 12).toFixed(1))
            : null,
          mae: tunedMAE ? Math.round(tunedMAE) : null,
          meanError: tunedMeanError ? parseFloat(tunedMeanError.toFixed(1)) : null,
        },
        simple_average: {
          name: 'Simple Average',
          description: 'Predicts as average of last 3 months',
          results: simpleAvgResults,
          mape: simpleAvgMAPE ? parseFloat(simpleAvgMAPE.toFixed(1)) : null,
          mae: simpleAvgMAE ? Math.round(simpleAvgMAE) : null,
          meanError: errorAnalysis.simple_average.meanError,
        },
        status_quo: {
          name: 'What-If (Calibrated)',
          description: 'Active base tracking with smoothed CAC (MAPE ~6% on recent 12mo)',
          results: statusQuoResults,
          mape: statusQuoMAPE ? parseFloat(statusQuoMAPE.toFixed(1)) : null,
          mapeRecent: statusQuoResults.length >= 12
            ? parseFloat((statusQuoResults.slice(-12).reduce((sum, r) => sum + Math.abs(parseFloat(r.errorPercent)), 0) / 12).toFixed(1))
            : null,
          mae: statusQuoMAE ? Math.round(statusQuoMAE) : null,
          meanError: errorAnalysis.status_quo.meanError,
        },
        cohort_based: {
          name: 'Cohort-Based',
          description: 'Uses subscriber cohorts with weekly churn and yearly renewals',
          results: cohortResults,
          mape: cohortMAPE ? parseFloat(cohortMAPE.toFixed(1)) : null,
          mae: cohortMAE ? Math.round(cohortMAE) : null,
        },
      },
      historical,
      errorAnalysis: {
        seasonalityPattern,
        notes: 'Negative meanError = model underestimates, Positive = overestimates'
      },
      summary: {
        monthsTested: historical.length - 1,
        dateRange: {
          from: historical[0]?.month,
          to: historical[historical.length - 1]?.month,
        },
      },
    });
  } catch (error) {
    console.error('Backtest error:', error);
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
        (CURRENT_DATE - (cs.cohort_month || '-01')::date) as cohort_age_days
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

    // 6. Weekly subscriptions analysis
    const weeklyAnalysis = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        event_name,
        COUNT(*) as events,
        COUNT(DISTINCT q_user_id) as users,
        ROUND(SUM(price_usd)::numeric, 2) as revenue,
        ROUND(AVG(price_usd)::numeric, 2) as avg_price
      FROM events_v2
      WHERE product_id LIKE '%weekly%'
        AND refund = false
        AND price_usd > 0
      GROUP BY TO_CHAR(event_date, 'YYYY-MM'), event_name
      ORDER BY month, event_name
    `);

    // 7. Monthly subscriptions analysis
    const monthlySubsAnalysis = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        event_name,
        COUNT(*) as events,
        COUNT(DISTINCT q_user_id) as users,
        ROUND(SUM(price_usd)::numeric, 2) as revenue,
        ROUND(AVG(price_usd)::numeric, 2) as avg_price
      FROM events_v2
      WHERE product_id LIKE '%monthly%'
        AND refund = false
        AND price_usd > 0
      GROUP BY TO_CHAR(event_date, 'YYYY-MM'), event_name
      ORDER BY month, event_name
    `);

    // 8. Revenue breakdown by product type per month
    const revenueByProductType = await db.query(`
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        CASE
          WHEN product_id LIKE '%yearly%' THEN 'yearly'
          WHEN product_id LIKE '%weekly%' THEN 'weekly'
          WHEN product_id LIKE '%monthly%' THEN 'monthly'
          ELSE 'other'
        END as product_type,
        COUNT(*) as events,
        COUNT(DISTINCT q_user_id) as users,
        ROUND(SUM(price_usd)::numeric, 2) as revenue
      FROM events_v2
      WHERE event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
        AND refund = false
        AND price_usd > 0
      GROUP BY TO_CHAR(event_date, 'YYYY-MM'),
        CASE
          WHEN product_id LIKE '%yearly%' THEN 'yearly'
          WHEN product_id LIKE '%weekly%' THEN 'weekly'
          WHEN product_id LIKE '%monthly%' THEN 'monthly'
          ELSE 'other'
        END
      ORDER BY month, product_type
    `);

    // 9. Aggregate pre-2024 cohorts
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
      weeklyAnalysis: weeklyAnalysis.rows,
      monthlySubsAnalysis: monthlySubsAnalysis.rows,
      revenueByProductType: revenueByProductType.rows,
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

// ============================================
// DEBUG - Attribution timeline analysis
// ============================================
router.get('/debug-attribution', async (req, res) => {
  try {
    // 1. Campaign_id coverage by install date
    const timelineResult = await db.query(`
      SELECT
        DATE_TRUNC('day', install_date)::date as date,
        COUNT(DISTINCT q_user_id) FILTER (WHERE media_source = 'Apple AdServices') as asa_users,
        COUNT(DISTINCT q_user_id) FILTER (WHERE media_source = 'Apple AdServices' AND campaign_id IS NOT NULL) as with_campaign_id,
        COUNT(DISTINCT q_user_id) FILTER (WHERE media_source = 'Apple AdServices' AND campaign_id IS NULL) as no_campaign_id
      FROM events_v2
      WHERE install_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', install_date)
      ORDER BY date DESC
    `);

    // 2. Check user_attributions table coverage
    const userAttributionsResult = await db.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(campaign_id) as with_campaign_id,
        COUNT(adgroup_id) as with_adgroup_id,
        COUNT(keyword_id) as with_keyword_id
      FROM user_attributions
    `);

    // 3. Compare events_v2 vs user_attributions for ASA users
    const comparisonResult = await db.query(`
      SELECT
        'events_v2 ASA users' as source,
        COUNT(DISTINCT q_user_id) as total,
        COUNT(DISTINCT CASE WHEN campaign_id IS NOT NULL THEN q_user_id END) as with_campaign
      FROM events_v2
      WHERE media_source = 'Apple AdServices'
      UNION ALL
      SELECT
        'user_attributions' as source,
        COUNT(*) as total,
        COUNT(CASE WHEN campaign_id IS NOT NULL THEN 1 END) as with_campaign
      FROM user_attributions
    `);

    // 4. Sample ASA users without campaign_id (check if they exist in user_attributions)
    const missingCampaignSample = await db.query(`
      WITH missing_users AS (
        SELECT DISTINCT q_user_id, install_date
        FROM events_v2
        WHERE media_source = 'Apple AdServices'
          AND campaign_id IS NULL
        ORDER BY install_date DESC
        LIMIT 20
      )
      SELECT
        mu.q_user_id,
        mu.install_date,
        ua.campaign_id as ua_campaign_id,
        ua.adgroup_id as ua_adgroup_id,
        ua.keyword_id as ua_keyword_id,
        ua.attributed_at as ua_attributed_at
      FROM missing_users mu
      LEFT JOIN user_attributions ua ON mu.q_user_id = ua.user_id
    `);

    // 5. When did campaign_id start appearing in events_v2?
    const firstCampaignIdResult = await db.query(`
      SELECT
        MIN(install_date) as first_install_with_campaign_id,
        MIN(event_date) as first_event_with_campaign_id
      FROM events_v2
      WHERE campaign_id IS NOT NULL
    `);

    // 6. Check if user_attributions has data we can backfill
    const backfillPotentialResult = await db.query(`
      SELECT COUNT(DISTINCT e.q_user_id) as users_to_backfill
      FROM events_v2 e
      JOIN user_attributions ua ON e.q_user_id = ua.user_id
      WHERE e.media_source = 'Apple AdServices'
        AND e.campaign_id IS NULL
        AND ua.campaign_id IS NOT NULL
    `);

    // 7. Check qonversion_events campaign text values for ASA users
    const qonversionCampaignsResult = await db.query(`
      SELECT
        campaign,
        COUNT(DISTINCT q_user_id) as users
      FROM qonversion_events
      WHERE media_source = 'Apple AdServices'
      GROUP BY campaign
      ORDER BY users DESC
      LIMIT 20
    `);

    // 8. Check which qonversion_events campaign names match apple_ads_campaigns
    const campaignMatchResult = await db.query(`
      WITH qon_campaigns AS (
        SELECT DISTINCT campaign FROM qonversion_events
        WHERE media_source = 'Apple AdServices' AND campaign IS NOT NULL
      ),
      apple_campaigns AS (
        SELECT DISTINCT campaign_name FROM apple_ads_campaigns
      )
      SELECT
        (SELECT COUNT(*) FROM qon_campaigns) as qon_unique_campaigns,
        (SELECT COUNT(*) FROM apple_campaigns) as apple_unique_campaigns,
        (SELECT COUNT(*) FROM qon_campaigns qc JOIN apple_campaigns ac ON qc.campaign = ac.campaign_name) as matching_campaigns
    `);

    // 9. Sample of qonversion_events campaign values that don't match apple_ads
    const unmatchedCampaignsResult = await db.query(`
      WITH qon_campaigns AS (
        SELECT campaign, COUNT(DISTINCT q_user_id) as users
        FROM qonversion_events
        WHERE media_source = 'Apple AdServices' AND campaign IS NOT NULL
        GROUP BY campaign
      ),
      apple_campaigns AS (
        SELECT DISTINCT campaign_name FROM apple_ads_campaigns
      )
      SELECT qc.campaign, qc.users
      FROM qon_campaigns qc
      LEFT JOIN apple_campaigns ac ON qc.campaign = ac.campaign_name
      WHERE ac.campaign_name IS NULL
      ORDER BY qc.users DESC
      LIMIT 10
    `);

    res.json({
      timeline: timelineResult.rows,
      userAttributions: userAttributionsResult.rows[0],
      comparison: comparisonResult.rows,
      missingCampaignSample: missingCampaignSample.rows,
      firstCampaignId: firstCampaignIdResult.rows[0],
      backfillPotential: backfillPotentialResult.rows[0],
      qonversionCampaigns: qonversionCampaignsResult.rows,
      campaignMatch: campaignMatchResult.rows[0],
      unmatchedCampaigns: unmatchedCampaignsResult.rows,
    });
  } catch (error) {
    console.error('Debug attribution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEEKLY CHURN ANALYSIS
// ============================================
router.get('/weekly-churn', async (req, res) => {
  try {
    // 1. Get weekly subscriber lifecycle: first sub to last renewal
    const lifecycleResult = await db.query(`
      WITH weekly_subs AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date,
          MAX(event_date) as last_event_date,
          COUNT(*) FILTER (WHERE event_name = 'Subscription Renewed') as renewal_count,
          COUNT(*) as total_events
        FROM events_v2
        WHERE product_id LIKE '%weekly%'
          AND event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
          AND refund = false
        GROUP BY q_user_id
      )
      SELECT
        renewal_count,
        COUNT(*) as users,
        ROUND(AVG(EXTRACT(DAYS FROM (last_event_date - first_sub_date)))::numeric, 1) as avg_days_active
      FROM weekly_subs
      GROUP BY renewal_count
      ORDER BY renewal_count
    `);

    // 2. Cohort analysis: weekly subs by first subscription month
    const cohortResult = await db.query(`
      WITH first_weekly AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date
        FROM events_v2
        WHERE product_id LIKE '%weekly%'
          AND event_name IN ('Subscription Started', 'Trial Converted')
          AND refund = false
        GROUP BY q_user_id
      ),
      weekly_events AS (
        SELECT
          fw.q_user_id,
          TO_CHAR(fw.first_sub_date, 'YYYY-MM') as cohort_month,
          fw.first_sub_date,
          COUNT(*) FILTER (WHERE e.event_name = 'Subscription Renewed') as renewals,
          MAX(e.event_date) as last_activity
        FROM first_weekly fw
        JOIN events_v2 e ON fw.q_user_id = e.q_user_id
        WHERE e.product_id LIKE '%weekly%'
          AND e.event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
        GROUP BY fw.q_user_id, TO_CHAR(fw.first_sub_date, 'YYYY-MM'), fw.first_sub_date
      )
      SELECT
        cohort_month,
        COUNT(*) as cohort_size,
        ROUND(AVG(renewals)::numeric, 1) as avg_renewals,
        ROUND(AVG(EXTRACT(DAYS FROM (last_activity - first_sub_date)))::numeric, 1) as avg_days_active,
        ROUND(AVG(renewals + 1)::numeric, 1) as avg_weeks_subscribed
      FROM weekly_events
      GROUP BY cohort_month
      ORDER BY cohort_month
    `);

    // 3. Currently active weekly subscribers (renewed in last 14 days)
    const activeResult = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as active_weekly_subs
      FROM events_v2
      WHERE product_id LIKE '%weekly%'
        AND event_name = 'Subscription Renewed'
        AND event_date >= CURRENT_DATE - INTERVAL '14 days'
    `);

    // 4. Weekly retention curve: % still active after N weeks
    const retentionResult = await db.query(`
      WITH first_weekly AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date
        FROM events_v2
        WHERE product_id LIKE '%weekly%'
          AND event_name IN ('Subscription Started', 'Trial Converted')
          AND refund = false
          AND event_date <= CURRENT_DATE - INTERVAL '8 weeks'
        GROUP BY q_user_id
      ),
      weekly_activity AS (
        SELECT
          fw.q_user_id,
          fw.first_sub_date,
          FLOOR(EXTRACT(DAYS FROM (e.event_date - fw.first_sub_date)) / 7) as week_number
        FROM first_weekly fw
        JOIN events_v2 e ON fw.q_user_id = e.q_user_id
        WHERE e.product_id LIKE '%weekly%'
          AND e.event_name IN ('Subscription Renewed', 'Trial Converted', 'Subscription Started')
      )
      SELECT
        week_number,
        COUNT(DISTINCT q_user_id) as users_active
      FROM weekly_activity
      WHERE week_number <= 12
      GROUP BY week_number
      ORDER BY week_number
    `);

    const totalWeeklyUsers = parseInt(retentionResult.rows[0]?.users_active) || 1;
    const retentionCurve = retentionResult.rows.map(r => ({
      week: parseInt(r.week_number),
      users: parseInt(r.users_active),
      retention: Math.round((parseInt(r.users_active) / totalWeeklyUsers) * 100),
    }));

    res.json({
      renewalDistribution: lifecycleResult.rows,
      cohortAnalysis: cohortResult.rows,
      activeWeeklySubs: parseInt(activeResult.rows[0]?.active_weekly_subs) || 0,
      retentionCurve,
      summary: {
        avgRenewalsPerUser: lifecycleResult.rows.length > 0
          ? (lifecycleResult.rows.reduce((s, r) => s + parseInt(r.renewal_count) * parseInt(r.users), 0) /
             lifecycleResult.rows.reduce((s, r) => s + parseInt(r.users), 0)).toFixed(1)
          : 0,
        totalWeeklyUsers: lifecycleResult.rows.reduce((s, r) => s + parseInt(r.users), 0),
      },
    });
  } catch (error) {
    console.error('Weekly churn error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STREAMING CHURN RATE (RevenueCat style)
// ============================================
router.get('/churn-rate', async (req, res) => {
  try {
    const { period = 'week', months = 12 } = req.query;

    // Daily subscriber movement (matches Qonversion methodology)
    // New = Trial Converted + Subscription Started (all subscription types)
    // Churned = WEEKLY subscriptions that expired (last renewal + 7 days, without new renewal within grace period)
    // Key insight: Qonversion's "Churned subscriptions" tracks subscription-level expirations
    // We count a subscription as churned when:
    // 1. It's a weekly subscription (most churn happens here)
    // 2. The expected renewal date passed
    // 3. No renewal occurred within the grace period (we use 7 days grace)
    const dailyMovementResult = await db.query(`
      WITH days AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '${months} months',
          CURRENT_DATE - INTERVAL '1 day',
          '1 day'
        )::date AS day
      ),
      -- New subs each day (Trial Converted + Subscription Started) - ALL subs
      daily_new AS (
        SELECT
          DATE(event_date) as day,
          COUNT(*) as new_subs
        FROM events_v2
        WHERE event_name IN ('Subscription Started', 'Trial Converted')
          AND refund = false
          AND event_date >= CURRENT_DATE - INTERVAL '${months} months'
        GROUP BY DATE(event_date)
      ),
      -- Find each user's LAST weekly subscription activity
      -- Includes Trial Converted, Subscription Started, and Subscription Renewed
      -- A user churns when they don't have any renewal within 14 days of last activity
      user_last_weekly AS (
        SELECT
          q_user_id,
          MAX(event_date) as last_renewal_date
        FROM events_v2
        WHERE event_name IN ('Subscription Renewed', 'Trial Converted', 'Subscription Started')
          AND product_id LIKE '%weekly%'
          AND refund = false
          AND event_date >= CURRENT_DATE - INTERVAL '${months} months' - INTERVAL '30 days'
        GROUP BY q_user_id
      ),
      -- User churned when: no subscription activity within 14 days of last activity
      -- Threshold: 14 days covers billing retry + 1 week renewal cycle
      -- Churn date = last_activity + 14 days (when we're sure they churned)
      churned_subscriptions AS (
        SELECT
          ulw.q_user_id,
          DATE(ulw.last_renewal_date + INTERVAL '14 days') as churned_date
        FROM user_last_weekly ulw
        WHERE ulw.last_renewal_date + INTERVAL '14 days' >= CURRENT_DATE - INTERVAL '${months} months'
          -- Only count if 14 days have passed since last activity
          AND ulw.last_renewal_date + INTERVAL '14 days' < CURRENT_DATE
          -- No subsequent subscription activity
          AND NOT EXISTS (
            SELECT 1 FROM events_v2 e2
            WHERE e2.q_user_id = ulw.q_user_id
              AND e2.event_name IN ('Subscription Renewed', 'Trial Converted', 'Subscription Started')
              AND e2.product_id LIKE '%weekly%'
              AND e2.event_date > ulw.last_renewal_date
          )
      ),
      daily_churned AS (
        SELECT
          churned_date as day,
          COUNT(DISTINCT q_user_id) as churned
        FROM churned_subscriptions
        GROUP BY churned_date
      ),
      daily_active AS (
        SELECT
          d.day,
          COALESCE(n.new_subs, 0) as new_subs,
          COALESCE(c.churned, 0) as churned
        FROM days d
        LEFT JOIN daily_new n ON d.day = n.day
        LEFT JOIN daily_churned c ON d.day = c.day
      )
      SELECT
        day,
        new_subs,
        churned,
        new_subs - churned as net_change
      FROM daily_active
      ORDER BY day
    `);

    // Get initial active weekly subscribers count at the start of period
    // These are users who had a renewal in the 14 days before the start date
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - parseInt(months));
    const periodStartStr = periodStart.toISOString().split('T')[0];

    const initialActiveResult = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as initial_active
      FROM events_v2
      WHERE event_name IN ('Subscription Renewed', 'Trial Converted', 'Subscription Started')
        AND product_id LIKE '%weekly%'
        AND refund = false
        AND event_date >= $1::date - INTERVAL '14 days'
        AND event_date < $1::date
    `, [periodStartStr]);

    const initialActive = parseInt(initialActiveResult.rows[0]?.initial_active || 0);

    // Aggregate to weekly for the chart
    // Process daily data in JavaScript instead of embedding in SQL
    const dailyByWeek = {};
    for (const r of dailyMovementResult.rows) {
      const day = new Date(r.day);
      // Get Monday of the week
      const dayOfWeek = day.getDay();
      const diff = day.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const weekStart = new Date(day.setDate(diff)).toISOString().split('T')[0];

      if (!dailyByWeek[weekStart]) {
        dailyByWeek[weekStart] = { new_subs: 0, churned: 0, net_change: 0 };
      }
      dailyByWeek[weekStart].new_subs += parseInt(r.new_subs) || 0;
      dailyByWeek[weekStart].churned += parseInt(r.churned) || 0;
      dailyByWeek[weekStart].net_change += parseInt(r.net_change) || 0;
    }

    // Convert to array and calculate running active subs
    // Initialize with active subscribers from before the period
    let runningActive = initialActive;
    const weeklyChurnRows = Object.entries(dailyByWeek)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week_start, data]) => {
        runningActive += data.net_change;
        return {
          week_start,
          new_subs: data.new_subs,
          churned: data.churned,
          net_change: data.net_change,
          active_subs: runningActive,
        };
      });

    const weeklyChurnResult = { rows: weeklyChurnRows };

    // Yearly subscription churn: month-over-month
    const yearlyChurnResult = await db.query(`
      WITH months AS (
        SELECT generate_series(
          DATE_TRUNC('month', CURRENT_DATE - INTERVAL '${months} months'),
          DATE_TRUNC('month', CURRENT_DATE),
          '1 month'
        )::date AS month_start
      ),
      -- Users who started yearly subscription in each month
      yearly_starts AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_sub_date,
          DATE_TRUNC('month', MIN(event_date))::date as start_month
        FROM events_v2
        WHERE product_id LIKE '%yearly%'
          AND event_name IN ('Subscription Started', 'Trial Converted')
          AND refund = false
        GROUP BY q_user_id
      ),
      -- Users who canceled yearly subscription
      yearly_canceled AS (
        SELECT
          q_user_id,
          MAX(event_date) as cancel_date
        FROM events_v2
        WHERE product_id LIKE '%yearly%'
          AND event_name = 'Subscription Canceled'
        GROUP BY q_user_id
      ),
      -- Active yearly subs at start of each month
      -- (started before month start, not canceled before month start)
      monthly_active AS (
        SELECT
          m.month_start,
          COUNT(DISTINCT ys.q_user_id) as active_subs
        FROM months m
        JOIN yearly_starts ys ON ys.first_sub_date < m.month_start
        LEFT JOIN yearly_canceled yc ON ys.q_user_id = yc.q_user_id
        WHERE (yc.cancel_date IS NULL OR yc.cancel_date >= m.month_start)
        GROUP BY m.month_start
      ),
      -- Yearly subs that canceled in each month
      monthly_churned AS (
        SELECT
          DATE_TRUNC('month', yc.cancel_date)::date as month_start,
          COUNT(DISTINCT yc.q_user_id) as churned_subs
        FROM yearly_canceled yc
        JOIN yearly_starts ys ON yc.q_user_id = ys.q_user_id
        WHERE yc.cancel_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '${months} months')
        GROUP BY DATE_TRUNC('month', yc.cancel_date)::date
      ),
      -- New yearly subs each month
      monthly_new AS (
        SELECT
          start_month as month_start,
          COUNT(DISTINCT q_user_id) as new_subs
        FROM yearly_starts
        WHERE start_month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '${months} months')
        GROUP BY start_month
      )
      SELECT
        m.month_start,
        COALESCE(a.active_subs, 0) as active_at_start,
        COALESCE(c.churned_subs, 0) as churned,
        COALESCE(n.new_subs, 0) as new_subs,
        CASE WHEN COALESCE(a.active_subs, 0) > 0
          THEN ROUND(
            COALESCE(c.churned_subs, 0)::numeric
            / COALESCE(a.active_subs, 1)::numeric * 100, 1
          )
          ELSE 0
        END as churn_rate
      FROM months m
      LEFT JOIN monthly_active a ON m.month_start = a.month_start
      LEFT JOIN monthly_churned c ON m.month_start = c.month_start
      LEFT JOIN monthly_new n ON m.month_start = n.month_start
      WHERE m.month_start < DATE_TRUNC('month', CURRENT_DATE)
      ORDER BY m.month_start
    `);

    // Calculate weekly churn rate as churned / (churned + active_end_of_previous_week)
    // Active subs is running total, so active at start of week = active at end of previous week
    const weeklyData = weeklyChurnResult.rows.map((r, i, arr) => {
      const newSubs = parseInt(r.new_subs) || 0;
      const churned = parseInt(r.churned) || 0;
      const activeSubs = parseInt(r.active_subs) || 0;
      // Active at start = active at end of prev week = activeSubs - netChange
      const activeAtStart = activeSubs - (parseInt(r.net_change) || 0);
      const churnRate = activeAtStart > 0 ? (churned / activeAtStart * 100) : 0;

      return {
        period: r.week_start,
        activeAtStart,
        churned,
        newSubs,
        churnRate: Math.round(churnRate * 10) / 10,
        netChange: parseInt(r.net_change) || 0,
        activeSubs,
      };
    });

    // Calculate summary metrics
    const recentWeeklyData = weeklyData.slice(-12);
    const avgWeeklyChurn = recentWeeklyData.length > 0
      ? recentWeeklyData.reduce((s, r) => s + r.churnRate, 0) / recentWeeklyData.length
      : 0;

    const recentYearlyChurn = yearlyChurnResult.rows.slice(-6);
    const avgYearlyChurn = recentYearlyChurn.length > 0
      ? recentYearlyChurn.reduce((s, r) => s + parseFloat(r.churn_rate || 0), 0) / recentYearlyChurn.length
      : 0;

    // Net subscriber movement
    const lastWeek = weeklyData[weeklyData.length - 1] || {};
    const lastMonth = yearlyChurnResult.rows[yearlyChurnResult.rows.length - 1] || {};

    // Calculate monthly churn from weekly and yearly
    // Monthly from Weekly: 1 - (1 - weekly_churn)^4.33
    const monthlyChurnFromWeekly = avgWeeklyChurn > 0
      ? (1 - Math.pow(1 - avgWeeklyChurn/100, 4.33)) * 100
      : 0;

    // For yearly: use projected annual churn (65% based on 35% renewal rate)
    // Monthly from Yearly: 1 - (1 - annual_churn)^(1/12)
    // If avgYearlyChurn is 0 (no data yet), use projected 65% annual churn
    const yearlyAnnualChurn = avgYearlyChurn > 0 ? avgYearlyChurn : 65; // 65% = 1 - 35% renewal
    const monthlyChurnFromYearly = (1 - Math.pow(1 - yearlyAnnualChurn/100, 1/12)) * 100;

    // Weighted average by subscriber mix (75% weekly, 25% yearly based on historical data)
    // TODO: Get actual subscriber counts from active-subscribers endpoint
    const weeklyWeight = 0.75;
    const yearlyWeight = 0.25;
    const avgMonthlyChurn = (monthlyChurnFromWeekly * weeklyWeight) + (monthlyChurnFromYearly * yearlyWeight);

    // Also include daily data for granular view
    const dailyData = dailyMovementResult.rows.map(r => ({
      date: r.day,
      newSubs: parseInt(r.new_subs) || 0,
      churned: parseInt(r.churned) || 0,
      netChange: parseInt(r.net_change) || 0,
    }));

    res.json({
      daily: dailyData.slice(-90), // Last 90 days
      weekly: {
        data: weeklyData,
        avgChurnRate: Math.round(avgWeeklyChurn * 10) / 10,
        currentWeek: {
          activeAtStart: lastWeek.activeAtStart || 0,
          churnRate: lastWeek.churnRate || 0,
          activeSubs: lastWeek.activeSubs || 0,
        },
      },
      yearly: {
        data: yearlyChurnResult.rows.map(r => ({
          period: r.month_start,
          activeAtStart: parseInt(r.active_at_start),
          churned: parseInt(r.churned),
          newSubs: parseInt(r.new_subs),
          churnRate: parseFloat(r.churn_rate),
          netChange: parseInt(r.new_subs) - parseInt(r.churned),
        })),
        avgChurnRate: Math.round(avgYearlyChurn * 10) / 10,
        currentMonth: {
          activeAtStart: parseInt(lastMonth.active_at_start || 0),
          churnRate: parseFloat(lastMonth.churn_rate || 0),
        },
      },
      summary: {
        weeklyAvgChurn: Math.round(avgWeeklyChurn * 10) / 10,
        yearlyAvgChurn: Math.round(avgYearlyChurn * 10) / 10,
        monthlyAvgChurn: Math.round(avgMonthlyChurn * 10) / 10,
        monthlyChurnFromWeekly: Math.round(monthlyChurnFromWeekly * 10) / 10,
        monthlyChurnFromYearly: Math.round(monthlyChurnFromYearly * 10) / 10,
        // Implied annual churn from weekly (1 - (1-weekly)^52)
        impliedAnnualFromWeekly: Math.round((1 - Math.pow(1 - avgWeeklyChurn/100, 52)) * 1000) / 10,
        // Debug info
        initialActive,
        periodStart: periodStartStr,
      },
    });
  } catch (error) {
    console.error('Churn rate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for churn calculation
router.get('/churn-rate/debug', async (req, res) => {
  try {
    // Check product ID patterns
    const productPatterns = await db.query(`
      SELECT
        product_id,
        COUNT(*) as event_count,
        CASE
          WHEN product_id LIKE '%weekly%' THEN 'weekly'
          WHEN product_id LIKE '%yearly%' THEN 'yearly'
          WHEN product_id LIKE '%monthly%' THEN 'monthly'
          ELSE 'unknown'
        END as detected_type
      FROM events_v2
      WHERE event_name IN ('Subscription Renewed', 'Trial Converted', 'Subscription Started')
        AND event_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY product_id
      ORDER BY event_count DESC
    `);

    // Check churned calculation for a specific day
    const dateToCheck = '2026-03-01';
    const churnedDetail = await db.query(`
      WITH user_last_subscription AS (
        SELECT
          q_user_id,
          MAX(event_date) as last_active_date,
          (ARRAY_AGG(product_id ORDER BY event_date DESC))[1] as last_product_id
        FROM events_v2
        WHERE event_name IN ('Subscription Renewed', 'Trial Converted', 'Subscription Started')
          AND refund = false
          AND event_date >= '2026-01-01'
        GROUP BY q_user_id
      ),
      user_expiry AS (
        SELECT
          q_user_id,
          last_active_date,
          last_product_id,
          CASE
            WHEN last_product_id LIKE '%weekly%' THEN last_active_date + INTERVAL '7 days'
            WHEN last_product_id LIKE '%yearly%' THEN last_active_date + INTERVAL '365 days'
            WHEN last_product_id LIKE '%monthly%' THEN last_active_date + INTERVAL '30 days'
            ELSE last_active_date + INTERVAL '30 days'
          END as expiry_date
        FROM user_last_subscription
      ),
      churned_on_date AS (
        SELECT
          ue.q_user_id,
          ue.last_active_date,
          ue.last_product_id,
          ue.expiry_date
        FROM user_expiry ue
        WHERE DATE(ue.expiry_date) = '${dateToCheck}'
          AND NOT EXISTS (
            SELECT 1 FROM events_v2 e2
            WHERE e2.q_user_id = ue.q_user_id
              AND e2.event_name IN ('Subscription Renewed', 'Trial Converted', 'Subscription Started')
              AND e2.event_date > ue.last_active_date
          )
      )
      SELECT
        last_product_id,
        COUNT(*) as churned_count,
        MIN(last_active_date) as earliest_sub,
        MAX(last_active_date) as latest_sub
      FROM churned_on_date
      GROUP BY last_product_id
      ORDER BY churned_count DESC
    `);

    res.json({
      productPatterns: productPatterns.rows,
      churnedDetailOnDate: {
        date: dateToCheck,
        byProduct: churnedDetail.rows
      }
    });
  } catch (error) {
    console.error('Churn rate debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COUNTRIES BREAKDOWN
// ============================================
router.get('/countries', async (req, res) => {
  try {
    const { from, to, source, countries, limit = 20, sortBy = 'revenue' } = req.query;

    // Date filter
    let dateCondition = `install_date >= CURRENT_DATE - INTERVAL '30 days'`;
    if (from && to) {
      dateCondition = `install_date >= '${from}' AND install_date <= '${to}'`;
    }

    // Source filter
    let sourceCondition = '1=1';
    if (source === 'apple_ads') {
      sourceCondition = `media_source = 'Apple AdServices'`;
    } else if (source === 'organic') {
      sourceCondition = `(media_source IS NULL OR media_source != 'Apple AdServices')`;
    }

    // Country filter
    let countryCondition = '1=1';
    if (countries && countries.trim()) {
      const countryList = countries.split(',').map(c => c.trim()).filter(Boolean);
      if (countryList.length > 0) {
        const quotedCountries = countryList.map(c => `'${c}'`).join(',');
        countryCondition = `country IN (${quotedCountries})`;
      }
    }

    // Sort validation and mapping
    const allowedSorts = {
      country: 'cm.country',
      source: 'cm.source',
      revenue: 'revenue',
      spend: 'spend',
      roas: 'roas',
      cop: 'cop',
      subscribers: 'cm.subscribers',
      trials: 'cm.trials'
    };
    const sortColumn = allowedSorts[sortBy] || 'revenue';

    const result = await db.query(`
      WITH user_countries AS (
        SELECT
          q_user_id,
          COALESCE(country, 'Unknown') as country,
          media_source,
          install_date
        FROM events_v2
        WHERE ${dateCondition}
          AND ${countryCondition}
        GROUP BY q_user_id, country, media_source, install_date
      ),
      country_installs AS (
        SELECT
          COALESCE(country, 'Unknown') as country,
          COUNT(DISTINCT q_user_id) as installs
        FROM events_v2
        WHERE ${dateCondition}
          AND ${countryCondition}
          AND media_source = 'Apple AdServices'
        GROUP BY country
      ),
      total_spend AS (
        SELECT COALESCE(SUM(spend), 0) as total_spend
        FROM apple_ads_campaigns
        WHERE ${dateCondition.replaceAll('install_date', 'date')}
      ),
      total_installs AS (
        SELECT COALESCE(SUM(installs), 0) as total_installs
        FROM (SELECT COUNT(DISTINCT q_user_id) as installs FROM events_v2 WHERE ${dateCondition} AND ${countryCondition} AND media_source = 'Apple AdServices') t
      ),
      country_metrics AS (
        SELECT
          uc.country,
          CASE
            WHEN uc.media_source = 'Apple AdServices' THEN 'Apple Ads'
            ELSE 'Organic'
          END as source,
          COUNT(DISTINCT uc.q_user_id) as users,
          COUNT(DISTINCT CASE WHEN e.event_name = 'Trial Started' THEN e.q_user_id END) as trials,
          COUNT(DISTINCT CASE WHEN e.event_name IN ('Subscription Started', 'Trial Converted')
            AND e.product_id LIKE '%yearly%' AND e.refund = false THEN e.q_user_id END) as subscribers,
          COALESCE(SUM(CASE WHEN e.refund = false THEN e.price_usd ELSE 0 END), 0) as revenue
        FROM user_countries uc
        LEFT JOIN events_v2 e ON uc.q_user_id = e.q_user_id
        WHERE ${sourceCondition.replaceAll('media_source', 'uc.media_source')}
        GROUP BY uc.country,
          CASE WHEN uc.media_source = 'Apple AdServices' THEN 'Apple Ads' ELSE 'Organic' END
      )
      SELECT
        cm.country,
        cm.source,
        cm.users,
        cm.trials,
        cm.subscribers,
        ROUND(cm.revenue::numeric, 2) as revenue,
        CASE
          WHEN cm.source = 'Apple Ads' AND ti.total_installs > 0 THEN
            ROUND((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend, 2)
          ELSE 0
        END as spend,
        CASE
          WHEN cm.source = 'Apple Ads' AND cm.subscribers > 0 AND ti.total_installs > 0 THEN
            ROUND(((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend) / NULLIF(cm.subscribers, 0), 2)
          ELSE NULL
        END as cop,
        CASE
          WHEN cm.source = 'Apple Ads' AND ti.total_installs > 0 AND
               ((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend) > 0 THEN
            ROUND(cm.revenue / NULLIF((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend, 0), 2)
          ELSE NULL
        END as roas
      FROM country_metrics cm
      LEFT JOIN country_installs ci ON cm.country = ci.country
      CROSS JOIN total_spend ts
      CROSS JOIN total_installs ti
      ORDER BY ${sortColumn} DESC NULLS LAST
      LIMIT ${parseInt(limit)}
    `);

    res.json({
      countries: result.rows,
      filters: { from, to, source, countries, limit: parseInt(limit), sortBy }
    });
  } catch (error) {
    console.error('Countries error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COUNTRIES MONTHLY BREAKDOWN (Historical Analysis with ROAS Predictions)
// ============================================
router.get('/countries-monthly', async (req, res) => {
  try {
    const { from, to, source, countries, sortBy = 'revenue' } = req.query;

    // Date filter - default to last 12 months
    let dateCondition = `install_date >= CURRENT_DATE - INTERVAL '12 months'`;
    if (from && to) {
      dateCondition = `install_date >= '${from}' AND install_date <= '${to}'`;
    }

    // Source filter
    let sourceCondition = '1=1';
    if (source === 'apple_ads') {
      sourceCondition = `media_source = 'Apple AdServices'`;
    } else if (source === 'organic') {
      sourceCondition = `(media_source IS NULL OR media_source != 'Apple AdServices')`;
    }

    // Country filter
    let countryCondition = '1=1';
    if (countries && countries.trim()) {
      const countryList = countries.split(',').map(c => c.trim()).filter(Boolean);
      if (countryList.length > 0) {
        const quotedCountries = countryList.map(c => `'${c}'`).join(',');
        countryCondition = `country IN (${quotedCountries})`;
      }
    }

    const result = await db.query(`
      WITH user_countries AS (
        SELECT
          q_user_id,
          COALESCE(country, 'Unknown') as country,
          media_source,
          install_date,
          TO_CHAR(install_date, 'YYYY-MM') as install_month
        FROM events_v2
        WHERE ${dateCondition}
          AND ${countryCondition}
        GROUP BY q_user_id, country, media_source, install_date
      ),
      monthly_country_installs AS (
        SELECT
          COALESCE(country, 'Unknown') as country,
          TO_CHAR(install_date, 'YYYY-MM') as month,
          COUNT(DISTINCT q_user_id) as installs
        FROM events_v2
        WHERE ${dateCondition}
          AND ${countryCondition}
          AND media_source = 'Apple AdServices'
        GROUP BY country, TO_CHAR(install_date, 'YYYY-MM')
      ),
      monthly_spend AS (
        SELECT
          TO_CHAR(date, 'YYYY-MM') as month,
          COALESCE(SUM(spend), 0) as spend
        FROM apple_ads_campaigns
        WHERE ${dateCondition.replaceAll('install_date', 'date')}
        GROUP BY TO_CHAR(date, 'YYYY-MM')
      ),
      monthly_total_installs AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as month,
          COUNT(DISTINCT q_user_id) as installs
        FROM events_v2
        WHERE ${dateCondition}
          AND ${countryCondition}
          AND media_source = 'Apple AdServices'
        GROUP BY TO_CHAR(install_date, 'YYYY-MM')
      ),
      country_monthly_metrics AS (
        SELECT
          uc.country,
          uc.install_month as month,
          CASE
            WHEN uc.media_source = 'Apple AdServices' THEN 'Apple Ads'
            ELSE 'Organic'
          END as source,
          COUNT(DISTINCT uc.q_user_id) as users,
          COUNT(DISTINCT CASE WHEN e.event_name = 'Trial Started' THEN e.q_user_id END) as trials,
          COUNT(DISTINCT CASE WHEN e.event_name IN ('Subscription Started', 'Trial Converted')
            AND e.product_id LIKE '%yearly%' AND e.refund = false THEN e.q_user_id END) as subscribers,
          COALESCE(SUM(CASE WHEN e.refund = false THEN e.price_usd ELSE 0 END), 0) as revenue,
          DATE_PART('day', CURRENT_DATE - MIN(uc.install_date))::int as cohort_age
        FROM user_countries uc
        LEFT JOIN events_v2 e ON uc.q_user_id = e.q_user_id
        WHERE ${sourceCondition.replaceAll('media_source', 'uc.media_source')}
        GROUP BY uc.country, uc.install_month,
          CASE WHEN uc.media_source = 'Apple AdServices' THEN 'Apple Ads' ELSE 'Organic' END
      )
      SELECT
        cmm.country,
        cmm.month,
        cmm.source,
        cmm.users,
        cmm.trials,
        cmm.subscribers,
        ROUND(cmm.revenue::numeric, 2) as revenue,
        cmm.cohort_age,
        CASE
          WHEN cmm.source = 'Apple Ads' AND mti.installs > 0 THEN
            ROUND((COALESCE(mci.installs, 0)::numeric / NULLIF(mti.installs, 0)) * ms.spend, 2)
          ELSE 0
        END as spend,
        CASE
          WHEN cmm.source = 'Apple Ads' AND cmm.subscribers > 0 AND mti.installs > 0 THEN
            ROUND(((COALESCE(mci.installs, 0)::numeric / NULLIF(mti.installs, 0)) * ms.spend) / NULLIF(cmm.subscribers, 0), 2)
          ELSE NULL
        END as cop,
        CASE
          WHEN cmm.source = 'Apple Ads' AND mti.installs > 0 AND
               ((COALESCE(mci.installs, 0)::numeric / NULLIF(mti.installs, 0)) * ms.spend) > 0 THEN
            ROUND(cmm.revenue / NULLIF((COALESCE(mci.installs, 0)::numeric / NULLIF(mti.installs, 0)) * ms.spend, 0), 2)
          ELSE NULL
        END as roas
      FROM country_monthly_metrics cmm
      LEFT JOIN monthly_country_installs mci ON cmm.country = mci.country AND cmm.month = mci.month
      LEFT JOIN monthly_spend ms ON cmm.month = ms.month
      LEFT JOIN monthly_total_installs mti ON cmm.month = mti.month
      ORDER BY cmm.month DESC, cmm.country
    `);

    // Calculate predicted ROAS and payback for each country-month
    const enrichedData = result.rows.map(row => {
      const cohortAge = parseInt(row.cohort_age) || 0;
      const currentRoas = parseFloat(row.roas) || null;
      const spend = parseFloat(row.spend) || 0;

      let predictedRoas = null;
      let paybackDays = null;

      if (currentRoas && cohortAge > 0 && row.source === 'Apple Ads' && spend > 0) {
        const roasDecayFactor = getRoasDecayFactor(cohortAge);
        predictedRoas = roasDecayFactor > 0 ? Math.round((currentRoas / roasDecayFactor) * 100) / 100 : null;

        if (predictedRoas) {
          paybackDays = findPaybackDays(currentRoas, cohortAge, predictedRoas);
        }
      }

      return {
        ...row,
        revenue: parseFloat(row.revenue),
        spend: parseFloat(row.spend),
        cop: row.cop ? parseFloat(row.cop) : null,
        roas: currentRoas,
        predicted_roas: predictedRoas,
        payback_days: paybackDays,
        payback_months: paybackDays ? Math.round(paybackDays / 30) : null
      };
    });

    // Group by country with monthly trend
    const countriesMap = {};
    enrichedData.forEach(row => {
      if (!countriesMap[row.country]) {
        countriesMap[row.country] = {
          country: row.country,
          source: row.source,
          total_revenue: 0,
          total_spend: 0,
          total_subscribers: 0,
          monthly: []
        };
      }
      countriesMap[row.country].total_revenue += row.revenue;
      countriesMap[row.country].total_spend += row.spend;
      countriesMap[row.country].total_subscribers += parseInt(row.subscribers) || 0;
      countriesMap[row.country].monthly.push({
        month: row.month,
        users: parseInt(row.users),
        trials: parseInt(row.trials),
        subscribers: parseInt(row.subscribers),
        revenue: row.revenue,
        spend: row.spend,
        cop: row.cop,
        roas: row.roas,
        predicted_roas: row.predicted_roas,
        payback_days: row.payback_days,
        payback_months: row.payback_months,
        cohort_age: row.cohort_age
      });
    });

    // Convert to array and calculate overall metrics
    const countriesList = Object.values(countriesMap).map(c => ({
      ...c,
      total_roas: c.total_spend > 0 ? Math.round((c.total_revenue / c.total_spend) * 100) / 100 : null,
      total_cop: c.total_subscribers > 0 ? Math.round((c.total_spend / c.total_subscribers) * 100) / 100 : null,
      monthly: c.monthly.sort((a, b) => b.month.localeCompare(a.month))
    }));

    // Sort by the specified column
    const sortMap = {
      revenue: (a, b) => b.total_revenue - a.total_revenue,
      spend: (a, b) => b.total_spend - a.total_spend,
      roas: (a, b) => (b.total_roas || 0) - (a.total_roas || 0),
      cop: (a, b) => (a.total_cop || 999999) - (b.total_cop || 999999),
      subscribers: (a, b) => b.total_subscribers - a.total_subscribers,
      country: (a, b) => a.country.localeCompare(b.country)
    };
    const sortFn = sortMap[sortBy] || sortMap.revenue;
    countriesList.sort(sortFn);

    res.json({
      countries: countriesList,
      filters: { from, to, source, countries: req.query.countries, sortBy }
    });
  } catch (error) {
    console.error('Countries monthly error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TOP COUNTRIES BY ROAS
// ============================================
router.get('/top-countries-roas', async (req, res) => {
  try {
    const { from, to, limit = 20, minSpend = 100 } = req.query;

    // Date filter - default to last 30 days
    let dateCondition = `install_date >= CURRENT_DATE - INTERVAL '30 days'`;
    if (from && to) {
      dateCondition = `install_date >= '${from}' AND install_date <= '${to}'`;
    }

    const result = await db.query(`
      WITH country_installs AS (
        SELECT
          COALESCE(country, 'Unknown') as country,
          COUNT(DISTINCT q_user_id) as installs
        FROM events_v2
        WHERE ${dateCondition}
          AND media_source = 'Apple AdServices'
        GROUP BY country
      ),
      total_spend AS (
        SELECT COALESCE(SUM(spend), 0) as total_spend
        FROM apple_ads_campaigns
        WHERE ${dateCondition.replaceAll('install_date', 'date')}
      ),
      total_installs AS (
        SELECT COALESCE(SUM(installs), 1) as total_installs
        FROM (SELECT COUNT(DISTINCT q_user_id) as installs FROM events_v2 WHERE ${dateCondition} AND media_source = 'Apple AdServices') t
      ),
      country_metrics AS (
        SELECT
          COALESCE(e.country, 'Unknown') as country,
          COUNT(DISTINCT e.q_user_id) as users,
          COUNT(DISTINCT CASE WHEN e.event_name IN ('Subscription Started', 'Trial Converted')
            AND e.product_id LIKE '%yearly%' AND e.refund = false THEN e.q_user_id END) as subscribers,
          COALESCE(SUM(CASE WHEN e.refund = false THEN e.price_usd ELSE 0 END), 0) as revenue
        FROM events_v2 e
        WHERE ${dateCondition.replaceAll('install_date', 'e.install_date')}
          AND e.media_source = 'Apple AdServices'
        GROUP BY e.country
      ),
      all_countries AS (
        SELECT
          cm.country,
          cm.users,
          cm.subscribers,
          ROUND(cm.revenue::numeric, 2) as revenue,
          ROUND((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend, 2) as spend,
          CASE
            WHEN cm.subscribers > 0 THEN
              ROUND(((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend) / NULLIF(cm.subscribers, 0), 2)
            ELSE NULL
          END as cop,
          CASE
            WHEN ((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend) > 0 THEN
              ROUND(cm.revenue / NULLIF((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend, 0), 2)
            ELSE NULL
          END as roas
        FROM country_metrics cm
        LEFT JOIN country_installs ci ON cm.country = ci.country
        CROSS JOIN total_spend ts
        CROSS JOIN total_installs ti
        WHERE cm.subscribers > 0
          AND ((COALESCE(ci.installs, 0)::numeric / NULLIF(ti.total_installs, 0)) * ts.total_spend) > 0
      ),
      ranked_countries AS (
        SELECT *,
          NTILE(2) OVER (ORDER BY spend DESC) as spend_half
        FROM all_countries
        WHERE spend >= ${parseFloat(minSpend)}
      )
      SELECT country, users, subscribers, revenue, spend, cop, roas
      FROM ranked_countries
      WHERE spend_half = 1
      ORDER BY roas DESC NULLS LAST
      LIMIT ${parseInt(limit)}
    `);

    res.json({
      countries: result.rows,
      filters: { from, to, limit: parseInt(limit), minSpend: parseFloat(minSpend) }
    });
  } catch (error) {
    console.error('Top countries ROAS error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// YEAR-OVER-YEAR COMPARISON
// ============================================
router.get('/yoy', async (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const lastYear = currentYear - 1;

    // Get revenue by month for current and last year
    const monthlyResult = await db.query(`
      WITH monthly_data AS (
        SELECT
          EXTRACT(YEAR FROM event_date) as year,
          EXTRACT(MONTH FROM event_date) as month,
          SUM(CASE WHEN event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
                   AND refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted')
                   THEN q_user_id END) as subscribers,
          COUNT(DISTINCT CASE WHEN event_name = 'Trial Started' THEN q_user_id END) as trials
        FROM events_v2
        WHERE EXTRACT(YEAR FROM event_date) >= $1
        GROUP BY year, month
      )
      SELECT * FROM monthly_data
      ORDER BY year, month
    `, [lastYear]);

    // Get spend by month for current and last year
    const spendResult = await db.query(`
      SELECT
        EXTRACT(YEAR FROM date) as year,
        EXTRACT(MONTH FROM date) as month,
        SUM(COALESCE(spend, 0)) as spend
      FROM apple_ads_campaigns
      WHERE EXTRACT(YEAR FROM date) >= $1
      GROUP BY year, month
      ORDER BY year, month
    `, [lastYear]);

    // Build comparison data
    const monthlyMap = new Map();
    monthlyResult.rows.forEach(r => {
      const key = `${r.year}-${r.month}`;
      monthlyMap.set(key, {
        revenue: parseFloat(r.revenue) || 0,
        subscribers: parseInt(r.subscribers) || 0,
        trials: parseInt(r.trials) || 0,
        spend: 0,
      });
    });

    // Add spend data
    spendResult.rows.forEach(r => {
      const key = `${r.year}-${r.month}`;
      const existing = monthlyMap.get(key) || { revenue: 0, subscribers: 0, trials: 0, spend: 0 };
      existing.spend = parseFloat(r.spend) || 0;
      monthlyMap.set(key, existing);
    });

    // This month vs same month last year
    const thisMonthKey = `${currentYear}-${currentMonth}`;
    const lastYearSameMonthKey = `${lastYear}-${currentMonth}`;
    const thisMonth = monthlyMap.get(thisMonthKey) || { revenue: 0, subscribers: 0, trials: 0, spend: 0 };
    const lastYearSameMonth = monthlyMap.get(lastYearSameMonthKey) || { revenue: 0, subscribers: 0, trials: 0, spend: 0 };

    // Calculate % change
    const monthChange = lastYearSameMonth.revenue > 0
      ? ((thisMonth.revenue - lastYearSameMonth.revenue) / lastYearSameMonth.revenue) * 100
      : null;
    const monthSubsChange = lastYearSameMonth.subscribers > 0
      ? ((thisMonth.subscribers - lastYearSameMonth.subscribers) / lastYearSameMonth.subscribers) * 100
      : null;

    // YTD comparison (Jan to current month)
    let ytdThisYear = 0;
    let ytdLastYear = 0;
    let ytdSubsThisYear = 0;
    let ytdSubsLastYear = 0;
    let ytdSpendThisYear = 0;
    let ytdSpendLastYear = 0;
    for (let m = 1; m <= currentMonth; m++) {
      const thisYearData = monthlyMap.get(`${currentYear}-${m}`);
      const lastYearData = monthlyMap.get(`${lastYear}-${m}`);
      if (thisYearData) {
        ytdThisYear += thisYearData.revenue;
        ytdSubsThisYear += thisYearData.subscribers;
        ytdSpendThisYear += thisYearData.spend;
      }
      if (lastYearData) {
        ytdLastYear += lastYearData.revenue;
        ytdSubsLastYear += lastYearData.subscribers;
        ytdSpendLastYear += lastYearData.spend;
      }
    }

    const ytdChange = ytdLastYear > 0
      ? ((ytdThisYear - ytdLastYear) / ytdLastYear) * 100
      : null;
    const ytdSubsChange = ytdSubsLastYear > 0
      ? ((ytdSubsThisYear - ytdSubsLastYear) / ytdSubsLastYear) * 100
      : null;

    // Full year comparison (all 12 months available)
    let fullYearThisYear = 0;
    let fullYearLastYear = 0;
    for (let m = 1; m <= 12; m++) {
      const thisYearData = monthlyMap.get(`${currentYear}-${m}`);
      const lastYearData = monthlyMap.get(`${lastYear}-${m}`);
      if (thisYearData) fullYearThisYear += thisYearData.revenue;
      if (lastYearData) fullYearLastYear += lastYearData.revenue;
    }

    // Monthly trend for chart
    const monthlyTrend = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 1; m <= 12; m++) {
      const thisYearData = monthlyMap.get(`${currentYear}-${m}`);
      const lastYearData = monthlyMap.get(`${lastYear}-${m}`);
      monthlyTrend.push({
        month: monthNames[m - 1],
        monthNum: m,
        thisYear: thisYearData?.revenue || 0,
        lastYear: lastYearData?.revenue || 0,
        thisYearSubs: thisYearData?.subscribers || 0,
        lastYearSubs: lastYearData?.subscribers || 0,
        thisYearSpend: thisYearData?.spend || 0,
        lastYearSpend: lastYearData?.spend || 0,
      });
    }

    res.json({
      currentYear,
      lastYear,
      currentMonth: monthNames[currentMonth - 1],
      monthComparison: {
        thisMonth: thisMonth.revenue,
        lastYearSameMonth: lastYearSameMonth.revenue,
        change: monthChange,
        thisMonthSubs: thisMonth.subscribers,
        lastYearSameMonthSubs: lastYearSameMonth.subscribers,
        subsChange: monthSubsChange,
      },
      ytdComparison: {
        thisYear: ytdThisYear,
        lastYear: ytdLastYear,
        change: ytdChange,
        thisYearSubs: ytdSubsThisYear,
        lastYearSubs: ytdSubsLastYear,
        subsChange: ytdSubsChange,
      },
      fullYearComparison: {
        thisYear: fullYearThisYear,
        lastYear: fullYearLastYear,
        change: fullYearLastYear > 0 ? ((fullYearThisYear - fullYearLastYear) / fullYearLastYear) * 100 : null,
      },
      monthlyTrend,
    });
  } catch (error) {
    console.error('YoY error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SUBSCRIPTION BREAKDOWN - Weekly vs Yearly revenue split
// ============================================================================
router.get('/subscription-breakdown', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;

    // Current month breakdown
    const currentMonth = new Date().toISOString().slice(0, 7);
    const currentQuery = `
      SELECT
        CASE
          WHEN product_id LIKE '%yearly%' THEN 'yearly'
          WHEN product_id LIKE '%monthly%' THEN 'monthly'
          ELSE 'weekly'
        END as sub_type,
        SUM(price_usd) as revenue,
        COUNT(DISTINCT q_user_id) as subscribers
      FROM events_v2
      WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
        AND DATE_TRUNC('month', created_at) = $1::date
      GROUP BY 1
    `;
    const currentResult = await db.query(currentQuery, [currentMonth + '-01']);

    const currentData = { weekly: { revenue: 0, subscribers: 0 }, yearly: { revenue: 0, subscribers: 0 }, monthly: { revenue: 0, subscribers: 0 } };
    for (const row of currentResult.rows) {
      currentData[row.sub_type] = {
        revenue: parseFloat(row.revenue) || 0,
        subscribers: parseInt(row.subscribers) || 0,
      };
    }
    const totalRevenue = currentData.weekly.revenue + currentData.yearly.revenue + currentData.monthly.revenue;
    const totalSubs = currentData.weekly.subscribers + currentData.yearly.subscribers + currentData.monthly.subscribers;

    // Monthly trend
    const trendQuery = `
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        SUM(CASE WHEN product_id NOT LIKE '%yearly%' AND product_id NOT LIKE '%monthly%' THEN price_usd ELSE 0 END) as weekly_revenue,
        SUM(CASE WHEN product_id LIKE '%yearly%' THEN price_usd ELSE 0 END) as yearly_revenue,
        SUM(CASE WHEN product_id LIKE '%monthly%' THEN price_usd ELSE 0 END) as monthly_revenue
      FROM events_v2
      WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
        AND created_at >= NOW() - INTERVAL '${months} months'
      GROUP BY 1
      ORDER BY 1
    `;
    const trendResult = await db.query(trendQuery);

    const trend = trendResult.rows.map(row => {
      const weekly = parseFloat(row.weekly_revenue) || 0;
      const yearly = parseFloat(row.yearly_revenue) || 0;
      const monthly = parseFloat(row.monthly_revenue) || 0;
      const total = weekly + yearly + monthly;
      return {
        month: row.month,
        weeklyRevenue: weekly,
        yearlyRevenue: yearly,
        monthlyRevenue: monthly,
        weeklyPercentage: total > 0 ? (weekly / total) * 100 : 0,
        yearlyPercentage: total > 0 ? (yearly / total) * 100 : 0,
      };
    });

    res.json({
      current: {
        weekly: {
          revenue: currentData.weekly.revenue,
          subscribers: currentData.weekly.subscribers,
          percentage: totalRevenue > 0 ? (currentData.weekly.revenue / totalRevenue) * 100 : 0,
        },
        yearly: {
          revenue: currentData.yearly.revenue,
          subscribers: currentData.yearly.subscribers,
          percentage: totalRevenue > 0 ? (currentData.yearly.revenue / totalRevenue) * 100 : 0,
        },
        total: {
          revenue: totalRevenue,
          subscribers: totalSubs,
        },
      },
      trend,
    });
  } catch (error) {
    console.error('Subscription breakdown error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// REVENUE BY DAY - Cumulative ARPU by cohort age
// ============================================================================
router.get('/revenue-by-day', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const days = [0, 7, 14, 30, 60, 90, 120, 180];

    // Get cohorts with revenue at each day milestone
    const query = `
      WITH cohorts AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', e.created_at), 'YYYY-MM') as cohort_month,
          e.q_user_id,
          MIN(e.created_at) as first_event
        FROM events_v2 e
        WHERE e.event_name = 'Trial Started'
          AND e.created_at >= NOW() - INTERVAL '${months} months'
        GROUP BY 1, 2
      ),
      revenue_events AS (
        SELECT
          c.cohort_month,
          c.q_user_id,
          EXTRACT(DAY FROM (e.created_at - c.first_event)) as days_since_start,
          e.price_usd
        FROM cohorts c
        JOIN events_v2 e ON c.q_user_id = e.q_user_id
        WHERE e.event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
          AND e.created_at >= c.first_event
      ),
      cohort_sizes AS (
        SELECT cohort_month, COUNT(DISTINCT q_user_id) as users
        FROM cohorts
        GROUP BY 1
      )
      SELECT
        r.cohort_month,
        cs.users,
        ${days.map(d => `SUM(CASE WHEN r.days_since_start <= ${d} THEN r.price_usd ELSE 0 END) as revenue_d${d}`).join(',\n        ')}
      FROM revenue_events r
      JOIN cohort_sizes cs ON r.cohort_month = cs.cohort_month
      GROUP BY r.cohort_month, cs.users
      ORDER BY r.cohort_month
    `;

    const result = await db.query(query);

    const cohorts = result.rows.map(row => {
      const users = parseInt(row.users) || 1;
      const cohortAge = Math.floor((Date.now() - new Date(row.cohort_month + '-01').getTime()) / (1000 * 60 * 60 * 24));
      return {
        month: row.cohort_month,
        maxAge: cohortAge,
        users,
        revenue: {
          d0: (parseFloat(row.revenue_d0) || 0) / users,
          d7: (parseFloat(row.revenue_d7) || 0) / users,
          d14: (parseFloat(row.revenue_d14) || 0) / users,
          d30: (parseFloat(row.revenue_d30) || 0) / users,
          d60: (parseFloat(row.revenue_d60) || 0) / users,
          d90: (parseFloat(row.revenue_d90) || 0) / users,
          d120: (parseFloat(row.revenue_d120) || 0) / users,
          d180: (parseFloat(row.revenue_d180) || 0) / users,
        },
      };
    });

    // Build chart data
    const chartData = days.map(day => {
      const point = { day };
      for (const cohort of cohorts) {
        if (cohort.maxAge >= day) {
          point[cohort.month] = cohort.revenue[`d${day}`];
        }
      }
      return point;
    });

    res.json({ cohorts, chartData, days });
  } catch (error) {
    console.error('Revenue by day error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// tROAS - Cumulative ROAS by cohort age
// ============================================================================
router.get('/troas', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;
    const days = [7, 14, 30, 60, 90, 120, 180];

    // Get cohorts with ROAS at each day milestone
    const query = `
      WITH cohort_spend AS (
        SELECT
          TO_CHAR(date, 'YYYY-MM') as cohort_month,
          SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= NOW() - INTERVAL '${months} months'
        GROUP BY 1
      ),
      cohort_users AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as cohort_month,
          q_user_id,
          MIN(created_at) as first_event
        FROM events_v2
        WHERE event_name = 'Trial Started'
          AND campaign_id IS NOT NULL
          AND created_at >= NOW() - INTERVAL '${months} months'
        GROUP BY 1, 2
      ),
      revenue_events AS (
        SELECT
          cu.cohort_month,
          EXTRACT(DAY FROM (e.created_at - cu.first_event)) as days_since_start,
          e.price_usd
        FROM cohort_users cu
        JOIN events_v2 e ON cu.q_user_id = e.q_user_id
        WHERE e.event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
          AND e.created_at >= cu.first_event
      )
      SELECT
        cs.cohort_month,
        cs.spend,
        ${days.map(d => `SUM(CASE WHEN r.days_since_start <= ${d} THEN r.price_usd ELSE 0 END) as revenue_d${d}`).join(',\n        ')},
        SUM(r.price_usd) as revenue_current
      FROM cohort_spend cs
      LEFT JOIN revenue_events r ON cs.cohort_month = r.cohort_month
      WHERE cs.spend > 0
      GROUP BY cs.cohort_month, cs.spend
      ORDER BY cs.cohort_month
    `;

    const result = await db.query(query);

    const cohorts = result.rows.map(row => {
      const spend = parseFloat(row.spend) || 1;
      const cohortAge = Math.floor((Date.now() - new Date(row.cohort_month + '-01').getTime()) / (1000 * 60 * 60 * 24));

      const roas = {};
      let breakevenDay = null;
      for (const d of days) {
        const rev = parseFloat(row[`revenue_d${d}`]) || 0;
        roas[`d${d}`] = cohortAge >= d ? rev / spend : null;
        if (breakevenDay === null && roas[`d${d}`] >= 1.0) {
          breakevenDay = d;
        }
      }
      roas.current = (parseFloat(row.revenue_current) || 0) / spend;

      return {
        month: row.cohort_month,
        spend,
        breakevenDay,
        roas,
      };
    });

    // Build chart data
    const chartData = days.map(day => {
      const point = { day };
      for (const cohort of cohorts) {
        const cohortAge = Math.floor((Date.now() - new Date(cohort.month + '-01').getTime()) / (1000 * 60 * 60 * 24));
        if (cohortAge >= day) {
          point[cohort.month] = cohort.roas[`d${day}`];
        }
      }
      return point;
    });

    // Average breakeven day
    const breakevenCohorts = cohorts.filter(c => c.breakevenDay !== null);
    const averageBreakevenDay = breakevenCohorts.length > 0
      ? Math.round(breakevenCohorts.reduce((sum, c) => sum + c.breakevenDay, 0) / breakevenCohorts.length)
      : null;

    res.json({ cohorts, chartData, averageBreakevenDay });
  } catch (error) {
    console.error('tROAS error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// RENEWAL RATES - Yearly subscription renewal rates
// ============================================================================
router.get('/renewal-rates', async (req, res) => {
  try {
    // Get yearly subscription cohorts and their renewal status
    const query = `
      WITH yearly_subs AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as cohort_month,
          q_user_id,
          MIN(created_at) as first_purchase
        FROM events_v2
        WHERE event_name IN ('Trial Converted', 'Subscription Started')
          AND product_id LIKE '%yearly%'
          AND created_at >= NOW() - INTERVAL '24 months'
        GROUP BY 1, 2
      ),
      renewals AS (
        SELECT
          ys.cohort_month,
          ys.q_user_id,
          COUNT(*) as renewal_count
        FROM yearly_subs ys
        JOIN events_v2 e ON ys.q_user_id = e.q_user_id
        WHERE e.event_name = 'Subscription Renewed'
          AND e.product_id LIKE '%yearly%'
          AND e.created_at > ys.first_purchase + INTERVAL '330 days'
        GROUP BY 1, 2
      )
      SELECT
        ys.cohort_month,
        COUNT(DISTINCT ys.q_user_id) as yearly_subscribers,
        COUNT(DISTINCT r.q_user_id) as renewed,
        EXTRACT(MONTH FROM AGE(NOW(), MIN(ys.first_purchase))) as cohort_age_months
      FROM yearly_subs ys
      LEFT JOIN renewals r ON ys.cohort_month = r.cohort_month AND ys.q_user_id = r.q_user_id
      GROUP BY ys.cohort_month
      ORDER BY ys.cohort_month DESC
    `;

    const result = await db.query(query);

    const cohorts = result.rows.map(row => {
      const yearlySubscribers = parseInt(row.yearly_subscribers) || 0;
      const renewed = parseInt(row.renewed) || 0;
      const cohortAge = parseInt(row.cohort_age_months) || 0;
      const isMatured = cohortAge >= 12;

      return {
        month: row.cohort_month,
        yearlySubscribers,
        eligibleForRenewal: isMatured ? yearlySubscribers : 0,
        renewed,
        renewalRate: isMatured && yearlySubscribers > 0 ? renewed / yearlySubscribers : null,
        cohortAge,
        isMatured,
      };
    });

    // Calculate average renewal rate from matured cohorts
    const maturedCohorts = cohorts.filter(c => c.isMatured && c.yearlySubscribers > 0);
    const averageRenewalRate = maturedCohorts.length > 0
      ? maturedCohorts.reduce((sum, c) => sum + (c.renewalRate || 0), 0) / maturedCohorts.length
      : null;

    res.json({
      cohorts,
      averageRenewalRate,
      projectedRenewalRate: averageRenewalRate || 0.35, // Default to 35% if no data
    });
  } catch (error) {
    console.error('Renewal rates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MRR BREAKDOWN - New, Expansion, Churn, Reactivation, Net MRR
// ============================================================================
router.get('/mrr', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;

    // Get monthly MRR components
    const query = `
      WITH monthly_subs AS (
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
          q_user_id,
          product_id,
          SUM(CASE WHEN event_name IN ('Trial Converted', 'Subscription Started') THEN price_usd ELSE 0 END) as new_revenue,
          SUM(CASE WHEN event_name = 'Subscription Renewed' THEN price_usd ELSE 0 END) as renewal_revenue
        FROM events_v2
        WHERE created_at >= NOW() - INTERVAL '${months + 1} months'
          AND event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed', 'Subscription Expired', 'Subscription Cancelled')
        GROUP BY 1, 2, 3
      ),
      monthly_mrr AS (
        SELECT
          month,
          SUM(CASE
            WHEN product_id LIKE '%yearly%' THEN (new_revenue + renewal_revenue) / 12
            WHEN product_id LIKE '%monthly%' THEN new_revenue + renewal_revenue
            ELSE (new_revenue + renewal_revenue) * 4.33
          END) as mrr,
          SUM(CASE
            WHEN new_revenue > 0 AND product_id LIKE '%yearly%' THEN new_revenue / 12
            WHEN new_revenue > 0 AND product_id LIKE '%monthly%' THEN new_revenue
            WHEN new_revenue > 0 THEN new_revenue * 4.33
            ELSE 0
          END) as new_mrr,
          SUM(CASE
            WHEN product_id LIKE '%yearly%' THEN (new_revenue + renewal_revenue) / 12
            ELSE 0
          END) as yearly_mrr,
          SUM(CASE
            WHEN product_id LIKE '%monthly%' OR product_id LIKE '%weekly%' THEN new_revenue + renewal_revenue
            WHEN NOT (product_id LIKE '%yearly%') THEN (new_revenue + renewal_revenue) * 4.33
            ELSE 0
          END) as weekly_mrr
        FROM monthly_subs
        GROUP BY 1
      )
      SELECT
        month,
        mrr,
        new_mrr,
        yearly_mrr,
        weekly_mrr,
        LAG(mrr, 1) OVER (ORDER BY month) as prev_mrr
      FROM monthly_mrr
      ORDER BY month DESC
      LIMIT $1
    `;

    const result = await db.query(query, [months]);

    const breakdown = result.rows.reverse().map((row, i, arr) => {
      const currentMrr = parseFloat(row.mrr) || 0;
      const prevMrr = parseFloat(row.prev_mrr) || 0;
      const newMrr = parseFloat(row.new_mrr) || 0;
      const yearlyMrr = parseFloat(row.yearly_mrr) || 0;
      const weeklyMrr = parseFloat(row.weekly_mrr) || 0;

      // Calculate components
      const netMrr = currentMrr - prevMrr;
      const churnMrr = prevMrr > 0 ? Math.max(0, prevMrr - currentMrr + newMrr) : 0;
      const expansionMrr = Math.max(0, netMrr - newMrr + churnMrr);
      const reactivationMrr = 0; // Simplified for now

      const mrrGrowthRate = prevMrr > 0 ? (netMrr / prevMrr) * 100 : 0;

      return {
        month: row.month,
        newMrr,
        expansionMrr,
        churnMrr,
        reactivationMrr,
        netMrr,
        totalMrr: currentMrr,
        mrrGrowthRate,
        yearlyMrr,
        weeklyMrr,
      };
    });

    // Current month metrics
    const current = breakdown[breakdown.length - 1] || {
      newMrr: 0,
      expansionMrr: 0,
      churnMrr: 0,
      reactivationMrr: 0,
      netMrr: 0,
      totalMrr: 0,
      mrrGrowthRate: 0,
      yearlyMrr: 0,
      weeklyMrr: 0,
    };

    res.json({
      current,
      breakdown,
      byType: {
        yearly: current.yearlyMrr,
        weekly: current.weeklyMrr,
        yearlyPercentage: current.totalMrr > 0 ? (current.yearlyMrr / current.totalMrr) * 100 : 0,
        weeklyPercentage: current.totalMrr > 0 ? (current.weeklyMrr / current.totalMrr) * 100 : 0,
      },
    });
  } catch (error) {
    console.error('MRR breakdown error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// REVENUE YOY - Year-over-year revenue comparison by month
// ============================================================================
router.get('/revenue-yoy', async (req, res) => {
  try {
    // Get monthly revenue grouped by year
    const query = `
      WITH monthly_revenue AS (
        SELECT
          EXTRACT(YEAR FROM created_at) as year,
          EXTRACT(MONTH FROM created_at) as month,
          SUM(price_usd) as revenue
        FROM events_v2
        WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
          AND created_at >= NOW() - INTERVAL '36 months'
        GROUP BY 1, 2
      )
      SELECT
        year,
        month,
        revenue
      FROM monthly_revenue
      ORDER BY year, month
    `;

    const result = await db.query(query);

    // Transform data for chart: { month: 'Jan', 2024: 1000, 2025: 1200, 2026: 1500 }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const chartData = monthNames.map((name, idx) => ({ month: name, monthNum: idx + 1 }));
    const years = new Set();

    result.rows.forEach(row => {
      const year = parseInt(row.year);
      const month = parseInt(row.month);
      const revenue = parseFloat(row.revenue) || 0;

      years.add(year);
      const dataPoint = chartData.find(d => d.monthNum === month);
      if (dataPoint) {
        dataPoint[year] = revenue;
      }
    });

    res.json({
      chartData,
      years: Array.from(years).sort(),
    });
  } catch (error) {
    console.error('Revenue YoY error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Payer Share by Day
router.get('/payer-share', async (req, res) => {
  try {
    const monthsBack = Math.min(parseInt(req.query.months) || 6, 12); // Cap at 12 months

    // Get all cohorts by install month
    // For each cohort, calculate % of users who became payers by day N
    const query = `
      WITH install_cohorts AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as cohort_month,
          install_date,
          q_user_id,
          COUNT(*) OVER (PARTITION BY TO_CHAR(install_date, 'YYYY-MM')) as total_users
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
          AND install_date IS NOT NULL
        GROUP BY install_date, q_user_id
      ),
      first_conversions AS (
        SELECT
          q_user_id,
          MIN(event_date) as first_payment_date,
          -- Distinguish trial conversions from direct yearly purchases
          CASE
            WHEN MIN(CASE WHEN event_name = 'Trial Converted' THEN event_date END) IS NOT NULL
            THEN 'trial'
            ELSE 'direct'
          END as conversion_type
        FROM events_v2
        WHERE event_name IN ('Trial Converted', 'Subscription Started')
          AND product_id LIKE '%yearly%'
          AND install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
        GROUP BY q_user_id
      ),
      cohort_conversions AS (
        SELECT
          ic.cohort_month,
          ic.total_users,
          fc.q_user_id,
          fc.first_payment_date,
          fc.conversion_type,
          DATE_PART('day', fc.first_payment_date - ic.install_date)::int as days_to_conversion
        FROM install_cohorts ic
        LEFT JOIN first_conversions fc ON ic.q_user_id = fc.q_user_id
      )
      SELECT
        cohort_month,
        MAX(total_users) as total_users,
        -- Overall payer share
        COUNT(DISTINCT CASE WHEN days_to_conversion <= 1 THEN q_user_id END) as payers_d1,
        COUNT(DISTINCT CASE WHEN days_to_conversion <= 3 THEN q_user_id END) as payers_d3,
        COUNT(DISTINCT CASE WHEN days_to_conversion <= 7 THEN q_user_id END) as payers_d7,
        COUNT(DISTINCT CASE WHEN days_to_conversion <= 14 THEN q_user_id END) as payers_d14,
        COUNT(DISTINCT CASE WHEN days_to_conversion <= 30 THEN q_user_id END) as payers_d30,
        COUNT(DISTINCT CASE WHEN days_to_conversion <= 60 THEN q_user_id END) as payers_d60,
        -- Trial conversions only
        COUNT(DISTINCT CASE WHEN conversion_type = 'trial' AND days_to_conversion <= 1 THEN q_user_id END) as trial_d1,
        COUNT(DISTINCT CASE WHEN conversion_type = 'trial' AND days_to_conversion <= 3 THEN q_user_id END) as trial_d3,
        COUNT(DISTINCT CASE WHEN conversion_type = 'trial' AND days_to_conversion <= 7 THEN q_user_id END) as trial_d7,
        COUNT(DISTINCT CASE WHEN conversion_type = 'trial' AND days_to_conversion <= 14 THEN q_user_id END) as trial_d14,
        COUNT(DISTINCT CASE WHEN conversion_type = 'trial' AND days_to_conversion <= 30 THEN q_user_id END) as trial_d30,
        COUNT(DISTINCT CASE WHEN conversion_type = 'trial' AND days_to_conversion <= 60 THEN q_user_id END) as trial_d60,
        -- Direct purchases only
        COUNT(DISTINCT CASE WHEN conversion_type = 'direct' AND days_to_conversion <= 1 THEN q_user_id END) as direct_d1,
        COUNT(DISTINCT CASE WHEN conversion_type = 'direct' AND days_to_conversion <= 3 THEN q_user_id END) as direct_d3,
        COUNT(DISTINCT CASE WHEN conversion_type = 'direct' AND days_to_conversion <= 7 THEN q_user_id END) as direct_d7,
        COUNT(DISTINCT CASE WHEN conversion_type = 'direct' AND days_to_conversion <= 14 THEN q_user_id END) as direct_d14,
        COUNT(DISTINCT CASE WHEN conversion_type = 'direct' AND days_to_conversion <= 30 THEN q_user_id END) as direct_d30,
        COUNT(DISTINCT CASE WHEN conversion_type = 'direct' AND days_to_conversion <= 60 THEN q_user_id END) as direct_d60
      FROM cohort_conversions
      GROUP BY cohort_month
      ORDER BY cohort_month
    `;

    const result = await db.query(query);

    // Transform to cohort format
    const cohorts = result.rows.map(row => {
      const totalUsers = parseInt(row.total_users) || 1; // Avoid division by zero

      return {
        month: row.cohort_month,
        totalUsers: totalUsers,
        payerShare: {
          d1: parseFloat((parseInt(row.payers_d1) / totalUsers).toFixed(4)),
          d3: parseFloat((parseInt(row.payers_d3) / totalUsers).toFixed(4)),
          d7: parseFloat((parseInt(row.payers_d7) / totalUsers).toFixed(4)),
          d14: parseFloat((parseInt(row.payers_d14) / totalUsers).toFixed(4)),
          d30: parseFloat((parseInt(row.payers_d30) / totalUsers).toFixed(4)),
          d60: parseFloat((parseInt(row.payers_d60) / totalUsers).toFixed(4)),
        },
        trialConversions: {
          d1: parseFloat((parseInt(row.trial_d1) / totalUsers).toFixed(4)),
          d3: parseFloat((parseInt(row.trial_d3) / totalUsers).toFixed(4)),
          d7: parseFloat((parseInt(row.trial_d7) / totalUsers).toFixed(4)),
          d14: parseFloat((parseInt(row.trial_d14) / totalUsers).toFixed(4)),
          d30: parseFloat((parseInt(row.trial_d30) / totalUsers).toFixed(4)),
          d60: parseFloat((parseInt(row.trial_d60) / totalUsers).toFixed(4)),
        },
        directPurchases: {
          d1: parseFloat((parseInt(row.direct_d1) / totalUsers).toFixed(4)),
          d3: parseFloat((parseInt(row.direct_d3) / totalUsers).toFixed(4)),
          d7: parseFloat((parseInt(row.direct_d7) / totalUsers).toFixed(4)),
          d14: parseFloat((parseInt(row.direct_d14) / totalUsers).toFixed(4)),
          d30: parseFloat((parseInt(row.direct_d30) / totalUsers).toFixed(4)),
          d60: parseFloat((parseInt(row.direct_d60) / totalUsers).toFixed(4)),
        },
      };
    });

    // Transform to chart data format
    const days = [1, 3, 7, 14, 30, 60];
    const chartData = days.map(day => {
      const dataPoint = { day };
      cohorts.slice(-6).forEach(cohort => {
        const key = `d${day}`;
        dataPoint[cohort.month] = cohort.payerShare[key];
      });
      return dataPoint;
    });

    res.json({ cohorts, chartData });
  } catch (error) {
    console.error('Payer share error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Active Subscribers Gauge
router.get('/active-subscribers', async (req, res) => {
  try {
    // Current active subscribers by type
    // Logic: Subscription is active if: event_date + subscription_period + grace > today
    // Weekly: 7 days + 10 days grace = active if event_date + 17 days > today
    // Monthly: 30 days + 10 days grace = active if event_date + 40 days > today
    // Yearly: 365 days + 3 days grace = active if event_date + 368 days > today (shorter grace for yearly)
    // IMPORTANT: Only count if last event was POSITIVE (not cancel/expire/refund)
    const currentQuery = `
      WITH user_last_event AS (
        -- Get the LAST subscription-related event for each user
        SELECT DISTINCT ON (q_user_id)
          q_user_id,
          event_name,
          event_date,
          product_id,
          CASE
            WHEN product_id LIKE '%yearly%' THEN 'yearly'
            WHEN product_id LIKE '%monthly%' THEN 'monthly'
            ELSE 'weekly'
          END as sub_type
        FROM events_v2
        WHERE event_name IN (
          'Trial Converted', 'Subscription Started', 'Subscription Renewed',
          'Subscription Canceled', 'Subscription Expired', 'Subscription Refunded'
        )
          AND event_date >= CURRENT_DATE - INTERVAL '400 days'
        ORDER BY q_user_id, event_date DESC
      ),
      active_subscribers AS (
        SELECT
          q_user_id,
          sub_type,
          event_date
        FROM user_last_event
        -- Only include if last event was POSITIVE and subscription hasn't expired
        WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
          AND (
            (sub_type = 'weekly' AND event_date + INTERVAL '17 days' > CURRENT_DATE)
            OR (sub_type = 'monthly' AND event_date + INTERVAL '40 days' > CURRENT_DATE)
            OR (sub_type = 'yearly' AND event_date + INTERVAL '368 days' > CURRENT_DATE)
          )
      )
      SELECT
        sub_type,
        COUNT(*) as active_count
      FROM active_subscribers
      GROUP BY sub_type
    `;
    const currentResult = await db.query(currentQuery);

    const current = { weekly: 0, monthly: 0, yearly: 0, total: 0 };
    for (const row of currentResult.rows) {
      current[row.sub_type] = parseInt(row.active_count) || 0;
    }
    current.total = current.weekly + current.monthly + current.yearly;

    // Previous period (30 days before) - same logic but offset by 30 days
    const previousQuery = `
      WITH user_last_event AS (
        -- Get the LAST subscription-related event for each user as of 30 days ago
        SELECT DISTINCT ON (q_user_id)
          q_user_id,
          event_name,
          event_date,
          product_id,
          CASE
            WHEN product_id LIKE '%yearly%' THEN 'yearly'
            WHEN product_id LIKE '%monthly%' THEN 'monthly'
            ELSE 'weekly'
          END as sub_type
        FROM events_v2
        WHERE event_name IN (
          'Trial Converted', 'Subscription Started', 'Subscription Renewed',
          'Subscription Canceled', 'Subscription Expired', 'Subscription Refunded'
        )
          AND event_date >= CURRENT_DATE - INTERVAL '430 days'
          AND event_date < CURRENT_DATE - INTERVAL '30 days'
        ORDER BY q_user_id, event_date DESC
      ),
      active_subscribers AS (
        SELECT
          q_user_id,
          sub_type,
          event_date
        FROM user_last_event
        WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
          AND (
            (sub_type = 'weekly' AND event_date + INTERVAL '17 days' > CURRENT_DATE - INTERVAL '30 days')
            OR (sub_type = 'monthly' AND event_date + INTERVAL '40 days' > CURRENT_DATE - INTERVAL '30 days')
            OR (sub_type = 'yearly' AND event_date + INTERVAL '368 days' > CURRENT_DATE - INTERVAL '30 days')
          )
      )
      SELECT
        sub_type,
        COUNT(*) as active_count
      FROM active_subscribers
      GROUP BY sub_type
    `;
    const previousResult = await db.query(previousQuery);

    const previous = { weekly: 0, monthly: 0, yearly: 0, total: 0 };
    for (const row of previousResult.rows) {
      previous[row.sub_type] = parseInt(row.active_count) || 0;
    }
    previous.total = previous.weekly + previous.monthly + previous.yearly;

    // Calculate trends
    const weeklyTrend = previous.weekly > 0
      ? ((current.weekly - previous.weekly) / previous.weekly) * 100
      : 0;
    const monthlyTrend = previous.monthly > 0
      ? ((current.monthly - previous.monthly) / previous.monthly) * 100
      : 0;
    const yearlyTrend = previous.yearly > 0
      ? ((current.yearly - previous.yearly) / previous.yearly) * 100
      : 0;
    const totalTrend = previous.total > 0
      ? ((current.total - previous.total) / previous.total) * 100
      : 0;

    // Sparkline data - last 30 days (daily snapshot of active subscribers)
    const sparklineQuery = `
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - INTERVAL '30 days',
          CURRENT_DATE - INTERVAL '1 day',
          '1 day'::interval
        )::date as day
      ),
      daily_active AS (
        SELECT
          ds.day,
          COUNT(DISTINCT CASE
            WHEN (lse.sub_type = 'weekly' AND lse.event_date >= ds.day - INTERVAL '10 days' AND lse.event_date <= ds.day)
              OR (lse.sub_type = 'yearly' AND lse.event_date >= ds.day - INTERVAL '380 days' AND lse.event_date <= ds.day)
            THEN lse.q_user_id
          END) as active_count
        FROM date_series ds
        CROSS JOIN LATERAL (
          SELECT DISTINCT ON (q_user_id)
            q_user_id,
            event_date,
            CASE
              WHEN product_id LIKE '%yearly%' THEN 'yearly'
              ELSE 'weekly'
            END as sub_type
          FROM events_v2
          WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
            AND event_date <= ds.day
            AND event_date >= ds.day - INTERVAL '380 days'
          ORDER BY q_user_id, event_date DESC
        ) lse
        GROUP BY 1
        ORDER BY 1
      )
      SELECT * FROM daily_active
    `;
    const sparklineResult = await db.query(sparklineQuery);
    const sparkline = sparklineResult.rows.map(r => parseInt(r.active_count) || 0);

    // Debug: Get product_id distribution for diagnosis
    const productQuery = `
      SELECT product_id, COUNT(*) as count
      FROM events_v2
      WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
        AND event_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY product_id
      ORDER BY count DESC
      LIMIT 10
    `;
    const productResult = await db.query(productQuery);

    res.json({
      _version: 'v3-368days',  // Debug: verify deploy
      current: {
        weekly: current.weekly,
        monthly: current.monthly,
        yearly: current.yearly,
        total: current.total,
        weeklyPercentage: current.total > 0 ? (current.weekly / current.total) * 100 : 0,
        monthlyPercentage: current.total > 0 ? (current.monthly / current.total) * 100 : 0,
        yearlyPercentage: current.total > 0 ? (current.yearly / current.total) * 100 : 0,
      },
      trend: {
        weekly: weeklyTrend,
        monthly: monthlyTrend,
        yearly: yearlyTrend,
        total: totalTrend,
      },
      sparkline,
      productBreakdown: productResult.rows,
    });
  } catch (error) {
    console.error('Active subscribers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DEBUG: Product ID distribution
// ============================================================================

router.get('/debug/products', async (req, res) => {
  try {
    const query = `
      SELECT
        product_id,
        COUNT(*) as count
      FROM events_v2
      WHERE event_name IN ('Trial Converted', 'Subscription Started', 'Subscription Renewed')
        AND event_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY product_id
      ORDER BY count DESC
      LIMIT 30
    `;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PLANNING TOOL - Historical cohort data and forecasting
// ============================================================================

const { calculateCopBreakdown } = require('../lib/forecast');

router.get('/planning-data', async (req, res) => {
  try {
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // Get all historical cohorts (last 12 months)
    const cohortsQuery = `
      WITH cohort_data AS (
        SELECT
          DATE(install_date) as cohort_date,
          media_source,
          COUNT(DISTINCT q_user_id) as subscribers,
          COALESCE(SUM(price_usd), 0) as revenue,
          (CURRENT_DATE - install_date::date) as age_days
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '12 months'
          AND (
            event_name = 'Trial Converted'
            OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')
          )
        GROUP BY DATE(install_date), media_source
      ),
      spend_data AS (
        SELECT
          date as cohort_date,
          COALESCE(SUM(spend), 0) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY date
      )
      SELECT
        cd.cohort_date,
        cd.media_source,
        cd.subscribers,
        cd.revenue,
        cd.age_days,
        COALESCE(sd.spend, 0) as spend
      FROM cohort_data cd
      LEFT JOIN spend_data sd ON cd.cohort_date = sd.cohort_date
      ORDER BY cd.cohort_date
    `;

    const cohortsResult = await db.query(cohortsQuery);

    const cohorts = cohortsResult.rows.map(row => ({
      installDate: row.cohort_date,
      cohortDate: row.cohort_date,
      source: row.media_source === 'Apple AdServices' ? 'apple_ads' : 'organic',
      subscribers: parseInt(row.subscribers),
      revenue: parseFloat(row.revenue),
      spend: parseFloat(row.spend),
      age: parseInt(row.age_days),
    }));

    // Get historical revenue by source for chart
    const historicalQuery = `
      SELECT
        TO_CHAR(event_date, 'YYYY-MM') as month,
        CASE
          WHEN media_source = 'Apple AdServices' THEN 'apple_ads'
          ELSE 'organic'
        END as source,
        COALESCE(SUM(price_usd), 0) as revenue
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '6 months'
        AND refund = false
        AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
      GROUP BY TO_CHAR(event_date, 'YYYY-MM'),
        CASE WHEN media_source = 'Apple AdServices' THEN 'apple_ads' ELSE 'organic' END
      ORDER BY month
    `;

    const historicalResult = await db.query(historicalQuery);

    // Group by month
    const historicalByMonth = {};
    historicalResult.rows.forEach(row => {
      if (!historicalByMonth[row.month]) {
        historicalByMonth[row.month] = {
          date: row.month,
          appleAdsRevenue: 0,
          organicRevenue: 0,
        };
      }
      if (row.source === 'apple_ads') {
        historicalByMonth[row.month].appleAdsRevenue = parseFloat(row.revenue);
      } else {
        historicalByMonth[row.month].organicRevenue = parseFloat(row.revenue);
      }
    });

    const historical = Object.values(historicalByMonth);

    // Get COP breakdown
    const copBreakdown = await calculateCopBreakdown(db, currentMonth);

    res.json({
      cohorts,
      historical,
      copBreakdown,
    });
  } catch (error) {
    console.error('Planning data error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SEASONALITY PATTERNS - Day-of-week and monthly trends
// ============================================================================

router.get('/seasonality', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 12;

    // Day-of-week patterns (0=Sunday, 1=Monday, ..., 6=Saturday)
    const dayOfWeekQuery = `
      WITH daily_metrics AS (
        SELECT
          DATE(event_date) as day,
          EXTRACT(DOW FROM event_date) as dow,
          SUM(price_usd) FILTER (WHERE refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as revenue,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Started') as trials,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')) as conversions
        FROM events_v2
        WHERE event_date >= CURRENT_DATE - INTERVAL '${months} months'
        GROUP BY DATE(event_date), EXTRACT(DOW FROM event_date)
      ),
      spend_by_day AS (
        SELECT
          date as day,
          EXTRACT(DOW FROM date) as dow,
          SUM(spend) as spend,
          SUM(installs) as installs
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${months} months'
        GROUP BY date, EXTRACT(DOW FROM date)
      )
      SELECT
        dm.dow,
        AVG(COALESCE(dm.revenue, 0)) as avg_revenue,
        AVG(COALESCE(dm.trials, 0)) as avg_trials,
        AVG(COALESCE(dm.conversions, 0)) as avg_conversions,
        AVG(COALESCE(sd.spend, 0)) as avg_spend,
        AVG(COALESCE(sd.installs, 0)) as avg_installs,
        COUNT(DISTINCT dm.day) as sample_days
      FROM daily_metrics dm
      LEFT JOIN spend_by_day sd ON dm.day = sd.day
      GROUP BY dm.dow
      ORDER BY dm.dow
    `;

    const dayOfWeekResult = await db.query(dayOfWeekQuery);

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = dayOfWeekResult.rows.map(row => ({
      day: parseInt(row.dow),
      dayName: dayNames[parseInt(row.dow)],
      avgRevenue: parseFloat(row.avg_revenue) || 0,
      avgTrials: parseFloat(row.avg_trials) || 0,
      avgConversions: parseFloat(row.avg_conversions) || 0,
      avgSpend: parseFloat(row.avg_spend) || 0,
      avgInstalls: parseFloat(row.avg_installs) || 0,
      sampleDays: parseInt(row.sample_days) || 0,
    }));

    // Calculate indices (100 = average)
    const avgRevenue = dayOfWeek.reduce((s, d) => s + d.avgRevenue, 0) / 7;
    const avgConversions = dayOfWeek.reduce((s, d) => s + d.avgConversions, 0) / 7;
    const avgSpend = dayOfWeek.reduce((s, d) => s + d.avgSpend, 0) / 7;

    const dayOfWeekWithIndex = dayOfWeek.map(d => ({
      ...d,
      revenueIndex: avgRevenue > 0 ? Math.round((d.avgRevenue / avgRevenue) * 100) : 100,
      conversionsIndex: avgConversions > 0 ? Math.round((d.avgConversions / avgConversions) * 100) : 100,
      spendIndex: avgSpend > 0 ? Math.round((d.avgSpend / avgSpend) * 100) : 100,
    }));

    // Monthly seasonality (by calendar month across years)
    const monthlyQuery = `
      WITH monthly_metrics AS (
        SELECT
          EXTRACT(MONTH FROM event_date) as month_num,
          TO_CHAR(event_date, 'YYYY-MM') as year_month,
          SUM(price_usd) FILTER (WHERE refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as revenue,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Started') as trials,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')) as conversions
        FROM events_v2
        WHERE event_date >= CURRENT_DATE - INTERVAL '${months} months'
        GROUP BY EXTRACT(MONTH FROM event_date), TO_CHAR(event_date, 'YYYY-MM')
      ),
      spend_by_month AS (
        SELECT
          EXTRACT(MONTH FROM date) as month_num,
          TO_CHAR(date, 'YYYY-MM') as year_month,
          SUM(spend) as spend,
          SUM(installs) as installs
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '${months} months'
        GROUP BY EXTRACT(MONTH FROM date), TO_CHAR(date, 'YYYY-MM')
      )
      SELECT
        mm.month_num,
        AVG(COALESCE(mm.revenue, 0)) as avg_revenue,
        AVG(COALESCE(mm.trials, 0)) as avg_trials,
        AVG(COALESCE(mm.conversions, 0)) as avg_conversions,
        AVG(COALESCE(sm.spend, 0)) as avg_spend,
        AVG(COALESCE(sm.installs, 0)) as avg_installs,
        COUNT(DISTINCT mm.year_month) as sample_months
      FROM monthly_metrics mm
      LEFT JOIN spend_by_month sm ON mm.year_month = sm.year_month
      GROUP BY mm.month_num
      ORDER BY mm.month_num
    `;

    const monthlyResult = await db.query(monthlyQuery);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthly = monthlyResult.rows.map(row => ({
      month: parseInt(row.month_num),
      monthName: monthNames[parseInt(row.month_num) - 1],
      avgRevenue: parseFloat(row.avg_revenue) || 0,
      avgTrials: parseFloat(row.avg_trials) || 0,
      avgConversions: parseFloat(row.avg_conversions) || 0,
      avgSpend: parseFloat(row.avg_spend) || 0,
      avgInstalls: parseFloat(row.avg_installs) || 0,
      sampleMonths: parseInt(row.sample_months) || 0,
    }));

    // Calculate monthly indices
    const avgMonthlyRevenue = monthly.reduce((s, m) => s + m.avgRevenue, 0) / (monthly.length || 1);
    const avgMonthlyConversions = monthly.reduce((s, m) => s + m.avgConversions, 0) / (monthly.length || 1);

    const monthlyWithIndex = monthly.map(m => ({
      ...m,
      revenueIndex: avgMonthlyRevenue > 0 ? Math.round((m.avgRevenue / avgMonthlyRevenue) * 100) : 100,
      conversionsIndex: avgMonthlyConversions > 0 ? Math.round((m.avgConversions / avgMonthlyConversions) * 100) : 100,
    }));

    // Week of month patterns (1-5)
    const weekOfMonthQuery = `
      WITH daily_metrics AS (
        SELECT
          DATE(event_date) as day,
          CEIL(EXTRACT(DAY FROM event_date) / 7.0) as week_of_month,
          SUM(price_usd) FILTER (WHERE refund = false AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')) as revenue,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'Trial Converted' OR (event_name = 'Subscription Started' AND product_id LIKE '%yearly%')) as conversions
        FROM events_v2
        WHERE event_date >= CURRENT_DATE - INTERVAL '${months} months'
        GROUP BY DATE(event_date), CEIL(EXTRACT(DAY FROM event_date) / 7.0)
      )
      SELECT
        week_of_month,
        AVG(COALESCE(revenue, 0)) as avg_revenue,
        AVG(COALESCE(conversions, 0)) as avg_conversions,
        COUNT(DISTINCT day) as sample_days
      FROM daily_metrics
      WHERE week_of_month <= 5
      GROUP BY week_of_month
      ORDER BY week_of_month
    `;

    const weekOfMonthResult = await db.query(weekOfMonthQuery);

    const weekOfMonth = weekOfMonthResult.rows.map(row => ({
      week: parseInt(row.week_of_month),
      weekLabel: `Week ${parseInt(row.week_of_month)}`,
      avgRevenue: parseFloat(row.avg_revenue) || 0,
      avgConversions: parseFloat(row.avg_conversions) || 0,
      sampleDays: parseInt(row.sample_days) || 0,
    }));

    // Calculate week-of-month indices
    const avgWeekRevenue = weekOfMonth.reduce((s, w) => s + w.avgRevenue, 0) / (weekOfMonth.length || 1);
    const weekOfMonthWithIndex = weekOfMonth.map(w => ({
      ...w,
      revenueIndex: avgWeekRevenue > 0 ? Math.round((w.avgRevenue / avgWeekRevenue) * 100) : 100,
    }));

    // Summary insights
    const bestDayOfWeek = [...dayOfWeekWithIndex].sort((a, b) => b.revenueIndex - a.revenueIndex)[0];
    const worstDayOfWeek = [...dayOfWeekWithIndex].sort((a, b) => a.revenueIndex - b.revenueIndex)[0];
    const bestMonth = [...monthlyWithIndex].sort((a, b) => b.revenueIndex - a.revenueIndex)[0];
    const worstMonth = [...monthlyWithIndex].sort((a, b) => a.revenueIndex - b.revenueIndex)[0];

    res.json({
      dayOfWeek: dayOfWeekWithIndex,
      monthly: monthlyWithIndex,
      weekOfMonth: weekOfMonthWithIndex,
      insights: {
        bestDayOfWeek: bestDayOfWeek ? { day: bestDayOfWeek.dayName, index: bestDayOfWeek.revenueIndex } : null,
        worstDayOfWeek: worstDayOfWeek ? { day: worstDayOfWeek.dayName, index: worstDayOfWeek.revenueIndex } : null,
        bestMonth: bestMonth ? { month: bestMonth.monthName, index: bestMonth.revenueIndex } : null,
        worstMonth: worstMonth ? { month: worstMonth.monthName, index: worstMonth.revenueIndex } : null,
        weekendVsWeekday: {
          weekend: Math.round((dayOfWeekWithIndex.filter(d => d.day === 0 || d.day === 6).reduce((s, d) => s + d.revenueIndex, 0) / 2) || 100),
          weekday: Math.round((dayOfWeekWithIndex.filter(d => d.day >= 1 && d.day <= 5).reduce((s, d) => s + d.revenueIndex, 0) / 5) || 100),
        },
      },
      metadata: {
        months,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Seasonality error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COHORTS - Revenue curves by cohort
// ============================================
router.get('/cohorts', async (req, res) => {
  try {
    const monthsBack = parseInt(req.query.months) || 6;
    const PROCEEDS_FACTOR = 0.82;

    const result = await db.query(`
      WITH cohort_base AS (
        SELECT
          TO_CHAR(install_date, 'YYYY-MM') as cohort_month,
          q_user_id,
          install_date,
          DATE_PART('day', event_date - install_date)::int as days_since_install,
          price_usd,
          refund,
          event_name
        FROM events_v2
        WHERE install_date >= CURRENT_DATE - INTERVAL '${monthsBack} months'
          AND media_source = 'Apple AdServices'
          AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
      ),
      cohort_sizes AS (
        SELECT
          cohort_month,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE event_name IN ('Trial Converted', 'Subscription Started')
          ) as cohort_size
        FROM cohort_base
        GROUP BY cohort_month
      ),
      cohort_revenue AS (
        SELECT
          cb.cohort_month,
          cb.days_since_install as day,
          SUM(cb.price_usd) FILTER (WHERE cb.refund = false) as cumulative_revenue
        FROM cohort_base cb
        GROUP BY cb.cohort_month, cb.days_since_install
      )
      SELECT
        cs.cohort_month,
        cs.cohort_size,
        cr.day,
        SUM(cr.cumulative_revenue) OVER (
          PARTITION BY cr.cohort_month
          ORDER BY cr.day
        ) as cumulative_revenue
      FROM cohort_sizes cs
      JOIN cohort_revenue cr ON cs.cohort_month = cr.cohort_month
      WHERE cs.cohort_size > 0
      ORDER BY cs.cohort_month DESC, cr.day
    `);

    const cohortMap = new Map();

    result.rows.forEach(row => {
      const month = row.cohort_month;
      if (!cohortMap.has(month)) {
        cohortMap.set(month, {
          cohortMonth: month,
          cohortSize: parseInt(row.cohort_size),
          curve: []
        });
      }

      const cohort = cohortMap.get(month);
      const cumulativeRevenue = parseFloat(row.cumulative_revenue) * PROCEEDS_FACTOR;
      const revenuePerUser = cumulativeRevenue / cohort.cohortSize;

      cohort.curve.push({
        day: parseInt(row.day),
        cumulativeRevenue,
        revenuePerUser
      });
    });

    const cohorts = Array.from(cohortMap.values());

    res.json({ cohorts });
  } catch (error) {
    console.error('Cohorts error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
