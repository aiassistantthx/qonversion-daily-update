const express = require('express');
const db = require('../db');

const router = express.Router();

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

// ============================================
// DAILY METRICS
// ============================================

/**
 * GET /dashboard/daily
 * Daily metrics for the operations dashboard
 */
router.get('/daily', async (req, res) => {
  try {
    const date = req.query.date || formatDate(new Date());
    const prevDate = getDaysAgo(1);
    const weekAgo = getDaysAgo(7);

    // Revenue today
    const revenueQuery = `
      SELECT
        DATE(created_at) as date,
        SUM(revenue_usd) as revenue,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'trial_started') as trials,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'subscription_started') as new_subs,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'trial_converted') as trial_converted
      FROM events
      WHERE environment = 'production'
        AND DATE(created_at) >= $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    const revenueResult = await db.query(revenueQuery, [weekAgo]);

    // Apple Ads spend
    const spendQuery = `
      SELECT
        date,
        SUM(spend) as spend,
        SUM(impressions) as impressions,
        SUM(taps) as taps,
        SUM(installs) as installs
      FROM apple_ads_campaigns
      WHERE date >= $1
      GROUP BY date
      ORDER BY date DESC
    `;
    const spendResult = await db.query(spendQuery, [weekAgo]);

    // Build response
    const metrics = revenueResult.rows.map(row => {
      const spendRow = spendResult.rows.find(s => s.date.toISOString().split('T')[0] === row.date.toISOString().split('T')[0]);
      const spend = spendRow ? parseFloat(spendRow.spend) : 0;
      const payers = (parseInt(row.new_subs) || 0) + (parseInt(row.trial_converted) || 0);

      return {
        date: row.date,
        revenue: parseFloat(row.revenue) || 0,
        trials: parseInt(row.trials) || 0,
        newSubs: parseInt(row.new_subs) || 0,
        trialConverted: parseInt(row.trial_converted) || 0,
        spend,
        impressions: spendRow ? parseInt(spendRow.impressions) : 0,
        taps: spendRow ? parseInt(spendRow.taps) : 0,
        installs: spendRow ? parseInt(spendRow.installs) : 0,
        cpa: (parseInt(row.trials) + parseInt(row.new_subs)) > 0
          ? spend / (parseInt(row.trials) + parseInt(row.new_subs))
          : null,
        cop: payers > 0 ? spend / payers : null
      };
    });

    res.json({ metrics });
  } catch (error) {
    console.error('Daily metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /dashboard/intraday
 * Hourly revenue for current day
 */
router.get('/intraday', async (req, res) => {
  try {
    const today = formatDate(new Date());

    const query = `
      SELECT
        DATE_TRUNC('hour', created_at) as hour,
        SUM(revenue_usd) as revenue,
        COUNT(*) as events
      FROM events
      WHERE environment = 'production'
        AND DATE(created_at) = $1
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour
    `;

    const result = await db.query(query, [today]);

    res.json({
      date: today,
      hourly: result.rows.map(row => ({
        hour: row.hour,
        revenue: parseFloat(row.revenue) || 0,
        events: parseInt(row.events)
      }))
    });
  } catch (error) {
    console.error('Intraday metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COP / CPA METRICS
// ============================================

/**
 * GET /dashboard/cop
 * Cost of Payer metrics by cohort windows
 */
router.get('/cop', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = getDaysAgo(days);

    // Get daily spend
    const spendQuery = `
      SELECT date, SUM(spend) as spend
      FROM apple_ads_campaigns
      WHERE date >= $1
      GROUP BY date
      ORDER BY date
    `;
    const spendResult = await db.query(spendQuery, [startDate]);

    // Get payers by date with their signup date
    const payersQuery = `
      SELECT
        DATE(created_at) as event_date,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name IN ('subscription_started', 'trial_converted')) as payers
      FROM events
      WHERE environment = 'production'
        AND DATE(created_at) >= $1
      GROUP BY DATE(created_at)
      ORDER BY event_date
    `;
    const payersResult = await db.query(payersQuery, [startDate]);

    // Calculate COP for different windows (d1, d4, d7, d14, d30)
    const windows = [1, 4, 7, 14, 30];
    const copByWindow = {};

    for (const window of windows) {
      let totalSpend = 0;
      let totalPayers = 0;

      // Sum up spend and payers for the window
      const windowStart = getDaysAgo(window);
      spendResult.rows.forEach(row => {
        if (row.date >= new Date(windowStart)) {
          totalSpend += parseFloat(row.spend);
        }
      });
      payersResult.rows.forEach(row => {
        if (row.event_date >= new Date(windowStart)) {
          totalPayers += parseInt(row.payers);
        }
      });

      copByWindow[`d${window}`] = totalPayers > 0 ? totalSpend / totalPayers : null;
    }

    // COP trend (daily d7 COP)
    const copTrend = [];
    for (let i = days; i >= 7; i--) {
      const date = getDaysAgo(i);
      const windowEnd = getDaysAgo(i);
      const windowStart = getDaysAgo(i + 7);

      let windowSpend = 0;
      let windowPayers = 0;

      spendResult.rows.forEach(row => {
        const rowDate = formatDate(row.date);
        if (rowDate >= windowStart && rowDate <= windowEnd) {
          windowSpend += parseFloat(row.spend);
        }
      });

      payersResult.rows.forEach(row => {
        const rowDate = formatDate(row.event_date);
        if (rowDate >= windowStart && rowDate <= windowEnd) {
          windowPayers += parseInt(row.payers);
        }
      });

      copTrend.push({
        date: windowEnd,
        cop: windowPayers > 0 ? windowSpend / windowPayers : null
      });
    }

    res.json({
      current: copByWindow,
      trend: copTrend
    });
  } catch (error) {
    console.error('COP metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /dashboard/cop-by-campaign
 * COP breakdown by campaign
 */
router.get('/cop-by-campaign', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = getDaysAgo(days);

    const query = `
      WITH campaign_spend AS (
        SELECT
          campaign_id,
          campaign_name,
          SUM(spend) as total_spend,
          SUM(installs) as total_installs
        FROM apple_ads_campaigns
        WHERE date >= $1
        GROUP BY campaign_id, campaign_name
      ),
      attributed_payers AS (
        SELECT
          ua.campaign_id,
          COUNT(DISTINCT e.user_id) as payers,
          SUM(e.revenue_usd) as revenue
        FROM events e
        JOIN user_attributions ua ON e.user_id = ua.user_id
        WHERE e.environment = 'production'
          AND e.event_name IN ('subscription_started', 'trial_converted')
          AND e.created_at >= $1
        GROUP BY ua.campaign_id
      )
      SELECT
        cs.campaign_id,
        cs.campaign_name,
        cs.total_spend as spend,
        cs.total_installs as installs,
        COALESCE(ap.payers, 0) as payers,
        COALESCE(ap.revenue, 0) as revenue,
        CASE WHEN COALESCE(ap.payers, 0) > 0
          THEN cs.total_spend / ap.payers
          ELSE NULL
        END as cop,
        CASE WHEN cs.total_spend > 0
          THEN COALESCE(ap.revenue, 0) / cs.total_spend
          ELSE NULL
        END as roas
      FROM campaign_spend cs
      LEFT JOIN attributed_payers ap ON cs.campaign_id = ap.campaign_id
      ORDER BY cs.total_spend DESC
    `;

    const result = await db.query(query, [startDate]);

    res.json({
      campaigns: result.rows.map(row => ({
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        spend: parseFloat(row.spend),
        installs: parseInt(row.installs),
        payers: parseInt(row.payers),
        revenue: parseFloat(row.revenue),
        cop: row.cop ? parseFloat(row.cop) : null,
        roas: row.roas ? parseFloat(row.roas) : null
      }))
    });
  } catch (error) {
    console.error('COP by campaign error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ORGANIC VS PAID
// ============================================

/**
 * GET /dashboard/revenue-by-source
 * Revenue split between organic and paid
 */
router.get('/revenue-by-source', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = getDaysAgo(days);

    const query = `
      SELECT
        DATE(e.created_at) as date,
        SUM(CASE WHEN ua.user_id IS NOT NULL THEN e.revenue_usd ELSE 0 END) as paid_revenue,
        SUM(CASE WHEN ua.user_id IS NULL THEN e.revenue_usd ELSE 0 END) as organic_revenue,
        SUM(e.revenue_usd) as total_revenue
      FROM events e
      LEFT JOIN user_attributions ua ON e.user_id = ua.user_id
      WHERE e.environment = 'production'
        AND DATE(e.created_at) >= $1
      GROUP BY DATE(e.created_at)
      ORDER BY date
    `;

    const result = await db.query(query, [startDate]);

    // Calculate totals
    let totalPaid = 0;
    let totalOrganic = 0;
    result.rows.forEach(row => {
      totalPaid += parseFloat(row.paid_revenue) || 0;
      totalOrganic += parseFloat(row.organic_revenue) || 0;
    });

    const total = totalPaid + totalOrganic;

    res.json({
      summary: {
        paid: totalPaid,
        organic: totalOrganic,
        total,
        paidPercent: total > 0 ? (totalPaid / total) * 100 : 0,
        organicPercent: total > 0 ? (totalOrganic / total) * 100 : 0
      },
      daily: result.rows.map(row => ({
        date: row.date,
        paid: parseFloat(row.paid_revenue) || 0,
        organic: parseFloat(row.organic_revenue) || 0,
        total: parseFloat(row.total_revenue) || 0
      }))
    });
  } catch (error) {
    console.error('Revenue by source error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COHORT ANALYSIS
// ============================================

/**
 * GET /dashboard/cohorts
 * Cohort revenue curves
 */
router.get('/cohorts', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;

    const query = `
      WITH user_cohorts AS (
        SELECT
          user_id,
          DATE_TRUNC('month', MIN(created_at)) as cohort_month
        FROM events
        WHERE environment = 'production'
          AND event_name IN ('trial_started', 'subscription_started')
        GROUP BY user_id
      ),
      cohort_revenue AS (
        SELECT
          uc.cohort_month,
          DATE_PART('day', e.created_at - uc.cohort_month) as days_since_signup,
          SUM(e.revenue_usd) as revenue,
          COUNT(DISTINCT e.user_id) as users
        FROM events e
        JOIN user_cohorts uc ON e.user_id = uc.user_id
        WHERE e.environment = 'production'
          AND e.revenue_usd > 0
        GROUP BY uc.cohort_month, DATE_PART('day', e.created_at - uc.cohort_month)
      )
      SELECT
        cohort_month,
        days_since_signup,
        SUM(revenue) OVER (
          PARTITION BY cohort_month
          ORDER BY days_since_signup
        ) as cumulative_revenue,
        (SELECT COUNT(DISTINCT user_id) FROM user_cohorts WHERE cohort_month = cr.cohort_month) as cohort_size
      FROM cohort_revenue cr
      WHERE cohort_month >= DATE_TRUNC('month', NOW() - INTERVAL '${months} months')
      ORDER BY cohort_month, days_since_signup
    `;

    const result = await db.query(query);

    // Group by cohort
    const cohorts = {};
    result.rows.forEach(row => {
      const cohortKey = row.cohort_month.toISOString().slice(0, 7);
      if (!cohorts[cohortKey]) {
        cohorts[cohortKey] = {
          cohortMonth: cohortKey,
          cohortSize: parseInt(row.cohort_size),
          curve: []
        };
      }
      cohorts[cohortKey].curve.push({
        day: parseInt(row.days_since_signup),
        cumulativeRevenue: parseFloat(row.cumulative_revenue),
        revenuePerUser: parseFloat(row.cumulative_revenue) / parseInt(row.cohort_size)
      });
    });

    res.json({ cohorts: Object.values(cohorts) });
  } catch (error) {
    console.error('Cohorts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /dashboard/retention
 * Retention heatmap data
 */
router.get('/retention', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;

    const query = `
      WITH user_cohorts AS (
        SELECT
          user_id,
          DATE_TRUNC('month', MIN(created_at)) as cohort_month
        FROM events
        WHERE environment = 'production'
          AND event_name IN ('trial_started', 'subscription_started')
        GROUP BY user_id
      ),
      active_users AS (
        SELECT DISTINCT
          uc.cohort_month,
          EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', e.created_at), uc.cohort_month)) as month_number,
          e.user_id
        FROM events e
        JOIN user_cohorts uc ON e.user_id = uc.user_id
        WHERE e.environment = 'production'
          AND e.revenue_usd > 0
      )
      SELECT
        cohort_month,
        month_number,
        COUNT(DISTINCT user_id) as active_users,
        (SELECT COUNT(DISTINCT user_id) FROM user_cohorts WHERE cohort_month = au.cohort_month) as cohort_size
      FROM active_users au
      WHERE cohort_month >= DATE_TRUNC('month', NOW() - INTERVAL '${months} months')
      GROUP BY cohort_month, month_number
      ORDER BY cohort_month, month_number
    `;

    const result = await db.query(query);

    // Build retention matrix
    const retention = {};
    result.rows.forEach(row => {
      const cohortKey = row.cohort_month.toISOString().slice(0, 7);
      if (!retention[cohortKey]) {
        retention[cohortKey] = {
          cohortMonth: cohortKey,
          cohortSize: parseInt(row.cohort_size),
          retention: {}
        };
      }
      retention[cohortKey].retention[`m${row.month_number}`] = {
        users: parseInt(row.active_users),
        rate: parseInt(row.active_users) / parseInt(row.cohort_size)
      };
    });

    res.json({ retention: Object.values(retention) });
  } catch (error) {
    console.error('Retention error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PAYBACK & FORECASTING
// ============================================

/**
 * GET /dashboard/payback
 * Payback curves by cohort
 */
router.get('/payback', async (req, res) => {
  try {
    const months = parseInt(req.query.months) || 6;

    // Get cohort CAC (spend attributed to cohort)
    const cacQuery = `
      WITH user_cohorts AS (
        SELECT
          user_id,
          DATE_TRUNC('month', MIN(created_at)) as cohort_month
        FROM events
        WHERE environment = 'production'
          AND event_name IN ('trial_started', 'subscription_started')
        GROUP BY user_id
      ),
      attributed_users AS (
        SELECT
          uc.cohort_month,
          ua.user_id
        FROM user_cohorts uc
        JOIN user_attributions ua ON uc.user_id = ua.user_id
      ),
      cohort_spend AS (
        SELECT
          DATE_TRUNC('month', aac.date) as month,
          SUM(aac.spend) as spend
        FROM apple_ads_campaigns aac
        GROUP BY DATE_TRUNC('month', aac.date)
      )
      SELECT
        au.cohort_month,
        COUNT(DISTINCT au.user_id) as attributed_users,
        (SELECT COUNT(DISTINCT user_id) FROM user_cohorts WHERE cohort_month = au.cohort_month) as total_users,
        COALESCE(cs.spend, 0) as spend
      FROM attributed_users au
      LEFT JOIN cohort_spend cs ON au.cohort_month = cs.month
      WHERE au.cohort_month >= DATE_TRUNC('month', NOW() - INTERVAL '${months} months')
      GROUP BY au.cohort_month, cs.spend
      ORDER BY au.cohort_month
    `;

    const cacResult = await db.query(cacQuery);

    // Get cumulative revenue by cohort and day
    const revenueQuery = `
      WITH user_cohorts AS (
        SELECT
          user_id,
          DATE_TRUNC('month', MIN(created_at)) as cohort_month
        FROM events
        WHERE environment = 'production'
          AND event_name IN ('trial_started', 'subscription_started')
        GROUP BY user_id
      )
      SELECT
        uc.cohort_month,
        FLOOR(DATE_PART('day', e.created_at - uc.cohort_month)) as days,
        SUM(e.revenue_usd) as revenue
      FROM events e
      JOIN user_cohorts uc ON e.user_id = uc.user_id
      WHERE e.environment = 'production'
        AND e.revenue_usd > 0
        AND uc.cohort_month >= DATE_TRUNC('month', NOW() - INTERVAL '${months} months')
      GROUP BY uc.cohort_month, FLOOR(DATE_PART('day', e.created_at - uc.cohort_month))
      ORDER BY uc.cohort_month, days
    `;

    const revenueResult = await db.query(revenueQuery);

    // Build payback curves
    const paybackCurves = {};

    // Initialize with CAC data
    cacResult.rows.forEach(row => {
      const cohortKey = row.cohort_month.toISOString().slice(0, 7);
      const cohortSize = parseInt(row.total_users);
      const spend = parseFloat(row.spend);
      const cac = cohortSize > 0 ? spend / cohortSize : 0;

      paybackCurves[cohortKey] = {
        cohortMonth: cohortKey,
        cohortSize,
        spend,
        cac,
        curve: []
      };
    });

    // Add cumulative revenue and calculate payback %
    const cohortCumulativeRevenue = {};
    revenueResult.rows.forEach(row => {
      const cohortKey = row.cohort_month.toISOString().slice(0, 7);
      const day = parseInt(row.days);

      if (!cohortCumulativeRevenue[cohortKey]) {
        cohortCumulativeRevenue[cohortKey] = 0;
      }
      cohortCumulativeRevenue[cohortKey] += parseFloat(row.revenue);

      if (paybackCurves[cohortKey]) {
        const cac = paybackCurves[cohortKey].cac;
        const revenuePerUser = cohortCumulativeRevenue[cohortKey] / paybackCurves[cohortKey].cohortSize;
        const paybackPercent = cac > 0 ? (revenuePerUser / cac) * 100 : 0;

        paybackCurves[cohortKey].curve.push({
          day,
          cumulativeRevenue: cohortCumulativeRevenue[cohortKey],
          revenuePerUser,
          paybackPercent
        });
      }
    });

    res.json({ payback: Object.values(paybackCurves) });
  } catch (error) {
    console.error('Payback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// HEALTH SCORE
// ============================================

/**
 * GET /dashboard/health
 * Composite health score
 */
router.get('/health', async (req, res) => {
  try {
    // Get metrics for health score calculation
    const today = formatDate(new Date());
    const weekAgo = getDaysAgo(7);
    const twoWeeksAgo = getDaysAgo(14);

    // Revenue growth (this week vs last week)
    const revenueQuery = `
      SELECT
        CASE
          WHEN DATE(created_at) >= $1 THEN 'this_week'
          ELSE 'last_week'
        END as period,
        SUM(revenue_usd) as revenue
      FROM events
      WHERE environment = 'production'
        AND DATE(created_at) >= $2
      GROUP BY CASE
          WHEN DATE(created_at) >= $1 THEN 'this_week'
          ELSE 'last_week'
        END
    `;
    const revenueResult = await db.query(revenueQuery, [weekAgo, twoWeeksAgo]);

    const thisWeekRevenue = revenueResult.rows.find(r => r.period === 'this_week')?.revenue || 0;
    const lastWeekRevenue = revenueResult.rows.find(r => r.period === 'last_week')?.revenue || 0;
    const revenueGrowth = lastWeekRevenue > 0 ? (thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue : 0;

    // COP (target: < $50)
    const copQuery = `
      WITH spend AS (
        SELECT SUM(spend) as total FROM apple_ads_campaigns WHERE date >= $1
      ),
      payers AS (
        SELECT COUNT(DISTINCT user_id) as total
        FROM events
        WHERE environment = 'production'
          AND event_name IN ('subscription_started', 'trial_converted')
          AND DATE(created_at) >= $1
      )
      SELECT
        (SELECT total FROM spend) as spend,
        (SELECT total FROM payers) as payers
    `;
    const copResult = await db.query(copQuery, [weekAgo]);
    const spend = parseFloat(copResult.rows[0]?.spend) || 0;
    const payers = parseInt(copResult.rows[0]?.payers) || 0;
    const cop = payers > 0 ? spend / payers : 100;

    // Trial conversion (target: > 15%)
    const conversionQuery = `
      SELECT
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'trial_started') as trials,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'trial_converted') as converted
      FROM events
      WHERE environment = 'production'
        AND DATE(created_at) >= $1
    `;
    const conversionResult = await db.query(conversionQuery, [getDaysAgo(30)]);
    const trials = parseInt(conversionResult.rows[0]?.trials) || 0;
    const converted = parseInt(conversionResult.rows[0]?.converted) || 0;
    const conversionRate = trials > 0 ? converted / trials : 0;

    // Calculate health score components (0-25 each)
    const TARGET_COP = 50;
    const TARGET_CONVERSION = 0.15;

    const revenueScore = Math.min(25, Math.max(0, (revenueGrowth + 0.1) * 125)); // -10% to +10% maps to 0-25
    const copScore = Math.min(25, Math.max(0, (TARGET_COP / cop) * 25)); // Lower COP is better
    const conversionScore = Math.min(25, Math.max(0, (conversionRate / TARGET_CONVERSION) * 25));
    const paybackScore = 20; // Placeholder - would need actual payback calculation

    const healthScore = Math.round(revenueScore + copScore + conversionScore + paybackScore);

    let status = 'critical';
    if (healthScore >= 80) status = 'excellent';
    else if (healthScore >= 60) status = 'good';
    else if (healthScore >= 40) status = 'warning';

    res.json({
      score: healthScore,
      status,
      components: {
        revenue: {
          score: Math.round(revenueScore),
          growth: revenueGrowth,
          thisWeek: parseFloat(thisWeekRevenue),
          lastWeek: parseFloat(lastWeekRevenue)
        },
        cop: {
          score: Math.round(copScore),
          value: cop,
          target: TARGET_COP
        },
        conversion: {
          score: Math.round(conversionScore),
          rate: conversionRate,
          target: TARGET_CONVERSION,
          trials,
          converted
        },
        payback: {
          score: paybackScore
        }
      }
    });
  } catch (error) {
    console.error('Health score error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SUMMARY ENDPOINT
// ============================================

/**
 * GET /dashboard/summary
 * All key metrics in one call
 */
router.get('/summary', async (req, res) => {
  try {
    const today = formatDate(new Date());
    const yesterday = getDaysAgo(1);
    const weekAgo = getDaysAgo(7);
    const monthAgo = getDaysAgo(30);

    // Today's metrics
    const todayQuery = `
      SELECT
        SUM(revenue_usd) as revenue,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'trial_started') as trials,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'subscription_started') as new_subs,
        COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'trial_converted') as converted
      FROM events
      WHERE environment = 'production'
        AND DATE(created_at) = $1
    `;
    const todayResult = await db.query(todayQuery, [today]);

    // Yesterday's metrics
    const yesterdayResult = await db.query(todayQuery, [yesterday]);

    // 7-day average
    const avgQuery = `
      SELECT
        AVG(daily_revenue) as avg_revenue,
        AVG(daily_trials) as avg_trials
      FROM (
        SELECT
          DATE(created_at) as date,
          SUM(revenue_usd) as daily_revenue,
          COUNT(DISTINCT user_id) FILTER (WHERE event_name = 'trial_started') as daily_trials
        FROM events
        WHERE environment = 'production'
          AND DATE(created_at) >= $1 AND DATE(created_at) < $2
        GROUP BY DATE(created_at)
      ) daily
    `;
    const avgResult = await db.query(avgQuery, [weekAgo, today]);

    // Today's spend
    const spendQuery = `
      SELECT SUM(spend) as spend FROM apple_ads_campaigns WHERE date = $1
    `;
    const spendResult = await db.query(spendQuery, [today]);

    const todayData = todayResult.rows[0] || {};
    const yesterdayData = yesterdayResult.rows[0] || {};
    const avgData = avgResult.rows[0] || {};

    const revenue = parseFloat(todayData.revenue) || 0;
    const yesterdayRevenue = parseFloat(yesterdayData.revenue) || 0;
    const avgRevenue = parseFloat(avgData.avg_revenue) || 0;

    res.json({
      today: {
        date: today,
        revenue,
        trials: parseInt(todayData.trials) || 0,
        newSubs: parseInt(todayData.new_subs) || 0,
        converted: parseInt(todayData.converted) || 0,
        spend: parseFloat(spendResult.rows[0]?.spend) || 0
      },
      vsYesterday: {
        revenue: yesterdayRevenue > 0 ? ((revenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0,
        revenueAbsolute: revenue - yesterdayRevenue
      },
      vs7dAvg: {
        revenue: avgRevenue > 0 ? ((revenue - avgRevenue) / avgRevenue) * 100 : 0,
        revenueAbsolute: revenue - avgRevenue
      }
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
