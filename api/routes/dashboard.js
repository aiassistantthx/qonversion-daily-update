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

    // Revenue this month (from qonversion_events)
    const revenueQuery = `
      SELECT COALESCE(SUM(proceeds_usd), 0) as revenue
      FROM qonversion_events
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND refund = false
    `;
    const revenueResult = await db.query(revenueQuery, [currentMonth]);
    const monthRevenue = parseFloat(revenueResult.rows[0]?.revenue) || 0;

    // New subscribers this month (trial_converted + subscription_started for yearly)
    const subscribersQuery = `
      SELECT COUNT(DISTINCT q_user_id) as subscribers
      FROM qonversion_events
      WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
        AND (
          event_name = 'trial_converted'
          OR (event_name = 'subscription_started' AND product_id LIKE '%yearly%')
        )
    `;
    const subscribersResult = await db.query(subscribersQuery, [currentMonth]);
    const monthSubscribers = parseInt(subscribersResult.rows[0]?.subscribers) || 0;

    // COP calculation (excluding last 4 days for closed cohorts)
    const copQuery = `
      WITH daily_data AS (
        SELECT
          DATE(event_date) as day,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE event_name = 'trial_converted'
            OR (event_name = 'subscription_started' AND product_id LIKE '%yearly%')
          ) as subscribers
        FROM qonversion_events
        WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
          AND DATE(event_date) <= CURRENT_DATE - INTERVAL '4 days'
        GROUP BY DATE(event_date)
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
        COALESCE(SUM(dd.subscribers), 0) as total_subscribers
      FROM daily_spend ds
      LEFT JOIN daily_data dd ON ds.day = dd.day
    `;
    const copResult = await db.query(copQuery, [currentMonth]);
    const copSpend = parseFloat(copResult.rows[0]?.total_spend) || 0;
    const copSubs = parseInt(copResult.rows[0]?.total_subscribers) || 0;
    const cop = copSubs > 0 ? copSpend / copSubs : null;

    // COP 3d (last 3 closed days, excluding last 4)
    const cop3dQuery = `
      WITH period AS (
        SELECT
          CURRENT_DATE - INTERVAL '7 days' as start_date,
          CURRENT_DATE - INTERVAL '4 days' as end_date
      ),
      subs AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM qonversion_events, period
        WHERE DATE(event_date) BETWEEN start_date AND end_date
          AND (event_name = 'trial_converted' OR (event_name = 'subscription_started' AND product_id LIKE '%yearly%'))
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

    // COP 7d
    const cop7dQuery = `
      WITH period AS (
        SELECT
          CURRENT_DATE - INTERVAL '11 days' as start_date,
          CURRENT_DATE - INTERVAL '4 days' as end_date
      ),
      subs AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM qonversion_events, period
        WHERE DATE(event_date) BETWEEN start_date AND end_date
          AND (event_name = 'trial_converted' OR (event_name = 'subscription_started' AND product_id LIKE '%yearly%'))
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

    // CR to paid (trial_converted / trial_started, closed cohorts)
    const crQuery = `
      WITH trials AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM qonversion_events
        WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
          AND DATE(event_date) <= CURRENT_DATE - INTERVAL '7 days'
          AND event_name = 'trial_started'
      ),
      converted AS (
        SELECT COUNT(DISTINCT q_user_id) as cnt
        FROM qonversion_events
        WHERE TO_CHAR(event_date, 'YYYY-MM') = $1
          AND DATE(event_date) <= CURRENT_DATE - INTERVAL '4 days'
          AND event_name = 'trial_converted'
      )
      SELECT trials.cnt as trials, converted.cnt as converted FROM trials, converted
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
    const forecastPaybackDays = cop && avgDailyRevenue > 0 ? Math.round(cop / (avgDailyRevenue / monthSubscribers || 1)) : null;

    // ---- DAILY DATA (last 30 days) ----
    const dailyQuery = `
      WITH daily_events AS (
        SELECT
          DATE(event_date) as day,
          SUM(proceeds_usd) FILTER (WHERE refund = false) as revenue,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE event_name = 'trial_converted'
            OR (event_name = 'subscription_started' AND product_id LIKE '%yearly%')
          ) as subscribers
        FROM qonversion_events
        WHERE event_date >= CURRENT_DATE - INTERVAL '34 days'
        GROUP BY DATE(event_date)
      ),
      daily_spend AS (
        SELECT date as day, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '34 days'
        GROUP BY date
      )
      SELECT
        COALESCE(de.day, ds.day) as day,
        COALESCE(de.revenue, 0) as revenue,
        COALESCE(de.subscribers, 0) as subscribers,
        COALESCE(ds.spend, 0) as spend
      FROM daily_events de
      FULL OUTER JOIN daily_spend ds ON de.day = ds.day
      WHERE COALESCE(de.day, ds.day) IS NOT NULL
      ORDER BY day DESC
      LIMIT 34
    `;
    const dailyResult = await db.query(dailyQuery);

    // Calculate COP and ROAS for each day (excluding last 4 days for metrics)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 4);

    const dailyData = dailyResult.rows.map(row => {
      const dayDate = new Date(row.day);
      const isOpen = dayDate > cutoffDate;
      return {
        date: formatDate(row.day),
        revenue: parseFloat(row.revenue) || 0,
        spend: parseFloat(row.spend) || 0,
        subscribers: parseInt(row.subscribers) || 0,
        cop: !isOpen && row.subscribers > 0 ? parseFloat(row.spend) / parseInt(row.subscribers) : null,
        roas: !isOpen && parseFloat(row.spend) > 0 ? parseFloat(row.revenue) / parseFloat(row.spend) : null,
      };
    }).reverse();

    // ---- MONTHLY DATA ----
    const monthlyQuery = `
      WITH monthly_events AS (
        SELECT
          TO_CHAR(event_date, 'YYYY-MM') as month,
          SUM(proceeds_usd) FILTER (WHERE refund = false) as revenue,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'trial_started') as trials,
          COUNT(DISTINCT q_user_id) FILTER (WHERE event_name = 'trial_converted') as converted,
          COUNT(DISTINCT q_user_id) FILTER (
            WHERE event_name = 'trial_converted'
            OR (event_name = 'subscription_started' AND product_id LIKE '%yearly%')
          ) as subscribers
        FROM qonversion_events
        WHERE event_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY TO_CHAR(event_date, 'YYYY-MM')
      ),
      monthly_spend AS (
        SELECT TO_CHAR(date, 'YYYY-MM') as month, SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY TO_CHAR(date, 'YYYY-MM')
      )
      SELECT
        COALESCE(me.month, ms.month) as month,
        COALESCE(me.revenue, 0) as revenue,
        COALESCE(me.trials, 0) as trials,
        COALESCE(me.converted, 0) as converted,
        COALESCE(me.subscribers, 0) as subscribers,
        COALESCE(ms.spend, 0) as spend
      FROM monthly_events me
      FULL OUTER JOIN monthly_spend ms ON me.month = ms.month
      WHERE COALESCE(me.month, ms.month) IS NOT NULL
      ORDER BY month DESC
      LIMIT 12
    `;
    const monthlyResult = await db.query(monthlyQuery);

    const monthlyData = monthlyResult.rows.map(row => ({
      month: row.month,
      revenue: parseFloat(row.revenue) || 0,
      spend: parseFloat(row.spend) || 0,
      trials: parseInt(row.trials) || 0,
      converted: parseInt(row.converted) || 0,
      subscribers: parseInt(row.subscribers) || 0,
      cop: row.subscribers > 0 ? parseFloat(row.spend) / parseInt(row.subscribers) : null,
      crToPaid: row.trials > 0 ? (parseInt(row.converted) / parseInt(row.trials)) * 100 : null,
      roas: parseFloat(row.spend) > 0 ? parseFloat(row.revenue) / parseFloat(row.spend) : null,
    })).reverse();

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
        forecastPaybackDays,
      },
      daily: dailyData,
      monthly: monthlyData,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
