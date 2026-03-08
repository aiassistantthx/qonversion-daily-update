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
const COP_DECAY_CURVE = {
  0: 0.16,  // 16% of conversions by day 0
  1: 0.17,
  2: 0.17,
  3: 0.65,  // Big spike at day 3 (trial end)
  4: 0.70,
  5: 0.73,
  6: 0.76,
  7: 0.79,
  10: 0.83,
  14: 0.88,
  21: 0.95,
  30: 1.00,
};

// Get interpolated decay factor for any day
const getDecayFactor = (days) => {
  if (days >= 30) return 1.0;
  const keys = Object.keys(COP_DECAY_CURVE).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (days >= keys[i] && days < keys[i + 1]) {
      const t = (days - keys[i]) / (keys[i + 1] - keys[i]);
      return COP_DECAY_CURVE[keys[i]] + t * (COP_DECAY_CURVE[keys[i + 1]] - COP_DECAY_CURVE[keys[i]]);
    }
  }
  return COP_DECAY_CURVE[keys[0]];
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

    // ---- CURRENT MONTH METRICS ----

    // Spend this month (from apple_ads_campaigns)
    const spendQuery = `
      SELECT COALESCE(SUM(spend), 0) as spend
      FROM apple_ads_campaigns
      WHERE TO_CHAR(date, 'YYYY-MM') = $1
    `;
    const spendResult = await db.query(spendQuery, [currentMonth]);
    const monthSpend = parseFloat(spendResult.rows[0]?.spend) || 0;

    // Revenue this month (only actual revenue events)
    const revenueQuery = `
      SELECT COALESCE(SUM(price_usd), 0) as revenue
      FROM qonversion_events
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = false
        AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
    `;
    const revenueResult = await db.query(revenueQuery, [currentMonth]);
    const monthRevenue = parseFloat(revenueResult.rows[0]?.revenue) || 0;

    // New subscribers this month (trial_converted + subscription_started for yearly)
    const subscribersQuery = `
      SELECT COUNT(DISTINCT q_user_id) as subscribers
      FROM qonversion_events
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
        FROM qonversion_events
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
        FROM qonversion_events, period
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
        FROM qonversion_events, period
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
    // Only count closed cohorts (installed 7+ days ago to allow full trial period)
    const crQuery = `
      WITH cohort_trials AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM qonversion_events
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '7 days'
          AND event_name = 'Trial Started'
      ),
      cohort_converted AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM qonversion_events
        WHERE TO_CHAR(install_date, 'YYYY-MM') = $1
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '7 days'
          AND event_name = 'Trial Converted'
      )
      SELECT cohort_trials.cnt as trials, cohort_converted.cnt as converted
      FROM cohort_trials, cohort_converted
    `;
    const crResult = await db.query(crQuery, [currentMonth]);
    const trials = parseInt(crResult.rows[0]?.trials) || 0;
    const converted = parseInt(crResult.rows[0]?.converted) || 0;
    const crToPaid = trials > 0 ? (converted / trials) * 100 : null;

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

    // Payback calculation using PREDICTED COP (accounting for future conversions)
    // Yearly subscription ~$50, so revenue per subscriber per year = $50
    // Payback in months = predictedCOP / (yearly revenue / 12)
    const yearlyARPU = 50; // Yearly subscription price
    const paybackMonths = predictedCop ? Math.round(predictedCop / (yearlyARPU / 12)) : null;

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
        FROM qonversion_events
        WHERE event_date >= CURRENT_DATE - INTERVAL '34 days'
        GROUP BY DATE(event_date)
      ),
      cohort_conversions AS (
        SELECT
          DATE(install_date) as cohort_day,
          COUNT(DISTINCT q_user_id) as subscribers
        FROM qonversion_events
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

    // ---- MONTHLY DATA (COHORT-BASED, CLOSED COHORTS ONLY) ----
    // Only count cohorts that have fully closed (installed 7+ days ago)
    // For accurate COP, we match spend to closed cohort conversions
    const monthlyQuery = `
      WITH monthly_revenue AS (
        SELECT
          TO_CHAR(event_date, 'YYYY-MM') as month,
          SUM(price_usd) FILTER (
            WHERE refund = false
            AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
          ) as revenue
        FROM qonversion_events
        WHERE event_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY TO_CHAR(event_date, 'YYYY-MM')
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
        FROM qonversion_events
        WHERE install_date >= CURRENT_DATE - INTERVAL '12 months'
          AND DATE(install_date) <= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY TO_CHAR(install_date, 'YYYY-MM')
      ),
      closed_cohort_spend AS (
        SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '12 months'
          AND date <= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
      )
      SELECT
        cs.month,
        COALESCE(mr.revenue, 0) as revenue,
        COALESCE(cm.trials, 0) as trials,
        COALESCE(cm.converted, 0) as converted,
        COALESCE(cm.subscribers, 0) as subscribers,
        COALESCE(cs.spend, 0) as spend
      FROM closed_cohort_spend cs
      LEFT JOIN monthly_revenue mr ON cs.month = mr.month
      LEFT JOIN cohort_metrics cm ON cs.month = cm.month
      ORDER BY cs.month DESC
      LIMIT 12
    `;
    const monthlyResult = await db.query(monthlyQuery);

    const monthlyData = monthlyResult.rows.map(row => {
      const spend = parseFloat(row.spend) || 0;
      const subs = parseInt(row.subscribers) || 0;
      const trials = parseInt(row.trials) || 0;
      const converted = parseInt(row.converted) || 0;
      const revenue = parseFloat(row.revenue) || 0;
      const currentCop = subs > 0 ? spend / subs : null;

      // Calculate months ago for this cohort
      const [year, month] = row.month.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 15); // Mid-month
      const monthsAgo = Math.floor((today - monthDate) / (1000 * 60 * 60 * 24 * 30));

      // Average cohort age in days (mid-month approximation)
      const avgCohortAgeDays = monthsAgo * 30 + 15;
      const decayFactor = getDecayFactor(avgCohortAgeDays);
      const predictedSubs = subs > 0 ? subs / decayFactor : 0;
      const predictedCop = predictedSubs > 0 ? spend / predictedSubs : null;

      return {
        month: row.month,
        revenue,
        spend,
        trials,
        converted,
        subscribers: subs,
        cop: currentCop,  // Always show actual COP
        copPredicted: predictedCop,  // Always show predicted COP
        crToPaid: trials > 0 ? (converted / trials) * 100 : null,
        roas: spend > 0 ? revenue / spend : null,
      };
    }).reverse();

    res.json({
      currentMonth: {
        month: currentMonth,
        spend: monthSpend,
        revenue: monthRevenue,
        subscribers: monthSubscribers,
        cop,
        cop3d,
        cop7d,
        crToPaid,
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
      FROM qonversion_events
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = false
      GROUP BY event_name
      ORDER BY revenue DESC
    `, [month]);

    // Total revenue
    const totalResult = await db.query(`
      SELECT COALESCE(SUM(price_usd), 0) as total
      FROM qonversion_events
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = false
    `, [month]);

    // Check for refunds in this month
    const refundsResult = await db.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(price_usd), 0) as amount
      FROM qonversion_events
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
      FROM qonversion_events
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
      FROM qonversion_events
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
      FROM qonversion_events
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

// Debug endpoint
router.get('/debug', async (req, res) => {
  try {
    const eventsQuery = `
      SELECT event_name, COUNT(*) as cnt
      FROM qonversion_events
      GROUP BY event_name
      ORDER BY cnt DESC
    `;
    const events = await db.query(eventsQuery);

    const dateRange = await db.query(`
      SELECT MIN(event_date) as min_date, MAX(event_date) as max_date, COUNT(*) as total
      FROM qonversion_events
    `);

    const products = await db.query(`
      SELECT product_id, COUNT(*) as cnt
      FROM qonversion_events
      WHERE event_name IN ('subscription_started', 'Subscription Started')
      GROUP BY product_id
      ORDER BY cnt DESC
      LIMIT 10
    `);

    res.json({
      events: events.rows,
      dateRange: dateRange.rows[0],
      products: products.rows,
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
        FROM qonversion_events
        WHERE event_date >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY DATE(event_date)
      ),
      daily_trials AS (
        SELECT
          DATE(install_date) as day,
          COUNT(DISTINCT q_user_id) as trials
        FROM qonversion_events
        WHERE install_date >= CURRENT_DATE - INTERVAL '${days} days'
          AND event_name = 'Trial Started'
        GROUP BY DATE(install_date)
      ),
      daily_yearly_subs AS (
        SELECT
          DATE(event_date) as day,
          COUNT(DISTINCT q_user_id) as yearly_subs
        FROM qonversion_events
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
        FROM qonversion_events
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
      FROM qonversion_events
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

module.exports = router;
