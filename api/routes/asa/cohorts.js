/**
 * Cohort Analysis routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const { predictRoas, findPaybackDays } = require('../../lib/predictions');
const { db } = require('./utils');

/**
 * GET /asa/cohorts
 * Get cohort ROAS data by install date
 */
router.get('/', async (req, res) => {
  try {
    const { campaign_id, period = 'week', limit = 12, country, product_type } = req.query;

    const dateGroup = period === 'month'
      ? "TO_CHAR(install_date, 'YYYY-MM')"
      : "TO_CHAR(DATE_TRUNC('week', install_date), 'YYYY-MM-DD')";

    let campaignFilter = '';
    let countryFilter = '';
    let spendCountryFilter = '';
    let productTypeFilter = '';
    const params = [parseInt(limit) || 12];
    let paramIndex = 2;

    if (campaign_id) {
      campaignFilter = `AND campaign_id = $${paramIndex}`;
      params.push(campaign_id);
      paramIndex++;
    }

    if (country) {
      const countries = country.split(',').map(c => c.trim()).filter(Boolean);
      if (countries.length > 0) {
        countryFilter = `AND country = ANY($${paramIndex}::text[])`;
        spendCountryFilter = `AND $${paramIndex}::text[] && countries_or_regions`;
        params.push(countries);
        paramIndex++;
      }
    }

    if (product_type) {
      productTypeFilter = `AND product_id LIKE '%${product_type}%'`;
    }

    const query = `
      WITH cohort_spend AS (
        SELECT
          ${dateGroup} as cohort,
          COALESCE(SUM(spend), 0) as spend
        FROM apple_ads_campaigns
        WHERE install_date IS NOT NULL
          ${campaignFilter}
          ${spendCountryFilter}
        GROUP BY 1
      ),
      cohort_revenue AS (
        SELECT
          ${dateGroup} as cohort,
          install_date,
          SUM(CASE WHEN event_date - install_date <= 0 THEN price_usd * 0.74 ELSE 0 END) as revenue_d0,
          SUM(CASE WHEN event_date - install_date <= 3 THEN price_usd * 0.74 ELSE 0 END) as revenue_d3,
          SUM(CASE WHEN event_date - install_date <= 7 THEN price_usd * 0.74 ELSE 0 END) as revenue_d7,
          SUM(CASE WHEN event_date - install_date <= 14 THEN price_usd * 0.74 ELSE 0 END) as revenue_d14,
          SUM(CASE WHEN event_date - install_date <= 30 THEN price_usd * 0.74 ELSE 0 END) as revenue_d30,
          SUM(CASE WHEN event_date - install_date <= 60 THEN price_usd * 0.74 ELSE 0 END) as revenue_d60,
          SUM(CASE WHEN event_date - install_date <= 90 THEN price_usd * 0.74 ELSE 0 END) as revenue_d90,
          SUM(price_usd * 0.74) as revenue_total,
          COUNT(DISTINCT q_user_id) as users,
          COUNT(DISTINCT CASE WHEN event_date - install_date <= 0 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d0,
          COUNT(DISTINCT CASE WHEN event_date - install_date <= 3 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d3,
          COUNT(DISTINCT CASE WHEN event_date - install_date <= 7 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d7,
          COUNT(DISTINCT CASE WHEN event_date - install_date <= 14 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d14,
          COUNT(DISTINCT CASE WHEN event_date - install_date <= 30 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d30,
          COUNT(DISTINCT CASE WHEN event_date - install_date <= 60 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d60,
          COUNT(DISTINCT CASE WHEN event_date - install_date <= 90 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d90,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_total
        FROM events_v2
        WHERE refund = false
          AND event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed')
          AND install_date IS NOT NULL
          ${campaignFilter}
          ${countryFilter}
          ${productTypeFilter}
        GROUP BY 1, 2
      ),
      cohort_agg AS (
        SELECT
          r.cohort,
          MIN(r.install_date) as cohort_start,
          CURRENT_DATE - MIN(r.install_date)::date as cohort_age,
          COALESCE(s.spend, 0) as spend,
          SUM(r.revenue_d0) as revenue_d0,
          SUM(r.revenue_d3) as revenue_d3,
          SUM(r.revenue_d7) as revenue_d7,
          SUM(r.revenue_d14) as revenue_d14,
          SUM(r.revenue_d30) as revenue_d30,
          SUM(r.revenue_d60) as revenue_d60,
          SUM(r.revenue_d90) as revenue_d90,
          SUM(r.revenue_total) as revenue_total,
          SUM(r.users) as users,
          SUM(r.paid_users_d0) as paid_users_d0,
          SUM(r.paid_users_d3) as paid_users_d3,
          SUM(r.paid_users_d7) as paid_users_d7,
          SUM(r.paid_users_d14) as paid_users_d14,
          SUM(r.paid_users_d30) as paid_users_d30,
          SUM(r.paid_users_d60) as paid_users_d60,
          SUM(r.paid_users_d90) as paid_users_d90,
          SUM(r.paid_users_total) as paid_users_total
        FROM cohort_revenue r
        LEFT JOIN cohort_spend s ON r.cohort = s.cohort
        GROUP BY r.cohort, s.spend
      )
      SELECT
        cohort,
        cohort_start,
        cohort_age,
        spend,
        revenue_d0,
        revenue_d3,
        revenue_d7,
        revenue_d14,
        revenue_d30,
        revenue_d60,
        revenue_d90,
        revenue_total,
        users,
        paid_users_d0,
        paid_users_d3,
        paid_users_d7,
        paid_users_d14,
        paid_users_d30,
        paid_users_d60,
        paid_users_d90,
        paid_users_total,
        CASE WHEN spend > 0 THEN revenue_d0 / spend ELSE 0 END as roas_d0,
        CASE WHEN spend > 0 THEN revenue_d3 / spend ELSE 0 END as roas_d3,
        CASE WHEN spend > 0 THEN revenue_d7 / spend ELSE 0 END as roas_d7,
        CASE WHEN spend > 0 THEN revenue_d14 / spend ELSE 0 END as roas_d14,
        CASE WHEN spend > 0 THEN revenue_d30 / spend ELSE 0 END as roas_d30,
        CASE WHEN spend > 0 THEN revenue_d60 / spend ELSE 0 END as roas_d60,
        CASE WHEN spend > 0 THEN revenue_d90 / spend ELSE 0 END as roas_d90,
        CASE WHEN spend > 0 THEN revenue_total / spend ELSE 0 END as roas_total,
        CASE WHEN paid_users_d0 > 0 THEN spend / paid_users_d0 ELSE NULL END as cop_d0,
        CASE WHEN paid_users_d3 > 0 THEN spend / paid_users_d3 ELSE NULL END as cop_d3,
        CASE WHEN paid_users_d7 > 0 THEN spend / paid_users_d7 ELSE NULL END as cop_d7,
        CASE WHEN paid_users_d14 > 0 THEN spend / paid_users_d14 ELSE NULL END as cop_d14,
        CASE WHEN paid_users_d30 > 0 THEN spend / paid_users_d30 ELSE NULL END as cop_d30,
        CASE WHEN paid_users_d60 > 0 THEN spend / paid_users_d60 ELSE NULL END as cop_d60,
        CASE WHEN paid_users_d90 > 0 THEN spend / paid_users_d90 ELSE NULL END as cop_d90,
        CASE WHEN paid_users_total > 0 THEN spend / paid_users_total ELSE NULL END as cop_total
      FROM cohort_agg
      WHERE spend > 0
      ORDER BY cohort DESC
      LIMIT $1
    `;

    const result = await db.query(query, params);

    const totals = result.rows.reduce((acc, row) => ({
      spend: acc.spend + parseFloat(row.spend || 0),
      revenue_d0: acc.revenue_d0 + parseFloat(row.revenue_d0 || 0),
      revenue_d3: acc.revenue_d3 + parseFloat(row.revenue_d3 || 0),
      revenue_d7: acc.revenue_d7 + parseFloat(row.revenue_d7 || 0),
      revenue_d14: acc.revenue_d14 + parseFloat(row.revenue_d14 || 0),
      revenue_d30: acc.revenue_d30 + parseFloat(row.revenue_d30 || 0),
      revenue_d60: acc.revenue_d60 + parseFloat(row.revenue_d60 || 0),
      revenue_d90: acc.revenue_d90 + parseFloat(row.revenue_d90 || 0),
      revenue_total: acc.revenue_total + parseFloat(row.revenue_total || 0),
      users: acc.users + parseInt(row.users || 0),
      paid_users_d0: acc.paid_users_d0 + parseInt(row.paid_users_d0 || 0),
      paid_users_d3: acc.paid_users_d3 + parseInt(row.paid_users_d3 || 0),
      paid_users_d7: acc.paid_users_d7 + parseInt(row.paid_users_d7 || 0),
      paid_users_d14: acc.paid_users_d14 + parseInt(row.paid_users_d14 || 0),
      paid_users_d30: acc.paid_users_d30 + parseInt(row.paid_users_d30 || 0),
      paid_users_d60: acc.paid_users_d60 + parseInt(row.paid_users_d60 || 0),
      paid_users_d90: acc.paid_users_d90 + parseInt(row.paid_users_d90 || 0),
      paid_users_total: acc.paid_users_total + parseInt(row.paid_users_total || 0),
    }), {
      spend: 0,
      revenue_d0: 0,
      revenue_d3: 0,
      revenue_d7: 0,
      revenue_d14: 0,
      revenue_d30: 0,
      revenue_d60: 0,
      revenue_d90: 0,
      revenue_total: 0,
      users: 0,
      paid_users_d0: 0,
      paid_users_d3: 0,
      paid_users_d7: 0,
      paid_users_d14: 0,
      paid_users_d30: 0,
      paid_users_d60: 0,
      paid_users_d90: 0,
      paid_users_total: 0,
    });

    res.json({
      period,
      total: result.rows.length,
      cohorts: result.rows.map(row => {
        const cohortAge = parseInt(row.cohort_age || 0);
        const currentRoas = parseFloat(row.roas_total || 0);
        const predictions = predictRoas(currentRoas, cohortAge);
        const paybackDays = findPaybackDays(currentRoas, cohortAge, predictions.predicted_roas_365);

        return {
          cohort: row.cohort,
          cohortStart: row.cohort_start,
          cohortAge,
          spend: parseFloat(row.spend || 0),
          users: parseInt(row.users || 0),
          roas: {
            d0: parseFloat(row.roas_d0 || 0),
            d3: parseFloat(row.roas_d3 || 0),
            d7: parseFloat(row.roas_d7 || 0),
            d14: parseFloat(row.roas_d14 || 0),
            d30: parseFloat(row.roas_d30 || 0),
            d60: parseFloat(row.roas_d60 || 0),
            d90: parseFloat(row.roas_d90 || 0),
            total: currentRoas,
          },
          predictedRoas: {
            d180: predictions.predicted_roas_180,
            d365: predictions.predicted_roas_365,
          },
          paybackDays,
          revenue: {
            d0: parseFloat(row.revenue_d0 || 0),
            d3: parseFloat(row.revenue_d3 || 0),
            d7: parseFloat(row.revenue_d7 || 0),
            d14: parseFloat(row.revenue_d14 || 0),
            d30: parseFloat(row.revenue_d30 || 0),
            d60: parseFloat(row.revenue_d60 || 0),
            d90: parseFloat(row.revenue_d90 || 0),
            total: parseFloat(row.revenue_total || 0),
          },
          cop: {
            d0: row.cop_d0 !== null ? parseFloat(row.cop_d0) : null,
            d3: row.cop_d3 !== null ? parseFloat(row.cop_d3) : null,
            d7: row.cop_d7 !== null ? parseFloat(row.cop_d7) : null,
            d14: row.cop_d14 !== null ? parseFloat(row.cop_d14) : null,
            d30: row.cop_d30 !== null ? parseFloat(row.cop_d30) : null,
            d60: row.cop_d60 !== null ? parseFloat(row.cop_d60) : null,
            d90: row.cop_d90 !== null ? parseFloat(row.cop_d90) : null,
            total: row.cop_total !== null ? parseFloat(row.cop_total) : null,
          },
          paidUsers: {
            d0: parseInt(row.paid_users_d0 || 0),
            d3: parseInt(row.paid_users_d3 || 0),
            d7: parseInt(row.paid_users_d7 || 0),
            d14: parseInt(row.paid_users_d14 || 0),
            d30: parseInt(row.paid_users_d30 || 0),
            d60: parseInt(row.paid_users_d60 || 0),
            d90: parseInt(row.paid_users_d90 || 0),
            total: parseInt(row.paid_users_total || 0),
          }
        };
      }),
      totals: (() => {
        const avgCohortAge = result.rows.length > 0
          ? Math.round(result.rows.reduce((sum, row) => sum + parseInt(row.cohort_age || 0), 0) / result.rows.length)
          : 0;
        const totalRoas = totals.spend > 0 ? totals.revenue_total / totals.spend : 0;
        const totalPredictions = predictRoas(totalRoas, avgCohortAge);
        const totalPaybackDays = findPaybackDays(totalRoas, avgCohortAge, totalPredictions.predicted_roas_365);

        return {
          spend: totals.spend,
          users: totals.users,
          roas: {
            d0: totals.spend > 0 ? totals.revenue_d0 / totals.spend : 0,
            d3: totals.spend > 0 ? totals.revenue_d3 / totals.spend : 0,
            d7: totals.spend > 0 ? totals.revenue_d7 / totals.spend : 0,
            d14: totals.spend > 0 ? totals.revenue_d14 / totals.spend : 0,
            d30: totals.spend > 0 ? totals.revenue_d30 / totals.spend : 0,
            d60: totals.spend > 0 ? totals.revenue_d60 / totals.spend : 0,
            d90: totals.spend > 0 ? totals.revenue_d90 / totals.spend : 0,
            total: totalRoas,
          },
          predictedRoas: {
            d180: totalPredictions.predicted_roas_180,
            d365: totalPredictions.predicted_roas_365,
          },
          paybackDays: totalPaybackDays,
          revenue: {
            d0: totals.revenue_d0,
            d3: totals.revenue_d3,
            d7: totals.revenue_d7,
            d14: totals.revenue_d14,
            d30: totals.revenue_d30,
            d60: totals.revenue_d60,
            d90: totals.revenue_d90,
            total: totals.revenue_total,
          },
          cop: {
            d0: totals.paid_users_d0 > 0 ? totals.spend / totals.paid_users_d0 : null,
            d3: totals.paid_users_d3 > 0 ? totals.spend / totals.paid_users_d3 : null,
            d7: totals.paid_users_d7 > 0 ? totals.spend / totals.paid_users_d7 : null,
            d14: totals.paid_users_d14 > 0 ? totals.spend / totals.paid_users_d14 : null,
            d30: totals.paid_users_d30 > 0 ? totals.spend / totals.paid_users_d30 : null,
            d60: totals.paid_users_d60 > 0 ? totals.spend / totals.paid_users_d60 : null,
            d90: totals.paid_users_d90 > 0 ? totals.spend / totals.paid_users_d90 : null,
            total: totals.paid_users_total > 0 ? totals.spend / totals.paid_users_total : null,
          },
          paidUsers: {
            d0: totals.paid_users_d0,
            d3: totals.paid_users_d3,
            d7: totals.paid_users_d7,
            d14: totals.paid_users_d14,
            d30: totals.paid_users_d30,
            d60: totals.paid_users_d60,
            d90: totals.paid_users_d90,
            total: totals.paid_users_total,
          }
        };
      })()
    });
  } catch (error) {
    console.error('Cohorts endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/kpi/cohort-cac
 * Get aggregated CAC by cohort windows
 */
router.get('/kpi/cohort-cac', async (req, res) => {
  try {
    const { campaign_id, country, product_type } = req.query;

    let campaignFilter = '';
    let countryFilter = '';
    let spendCountryFilter = '';
    let productTypeFilter = '';
    const params = [];
    let paramIndex = 1;

    if (campaign_id) {
      campaignFilter = `AND campaign_id = $${paramIndex}`;
      params.push(campaign_id);
      paramIndex++;
    }

    if (country) {
      const countries = country.split(',').map(c => c.trim()).filter(Boolean);
      if (countries.length > 0) {
        countryFilter = `AND country = ANY($${paramIndex}::text[])`;
        spendCountryFilter = `AND $${paramIndex}::text[] && countries_or_regions`;
        params.push(countries);
        paramIndex++;
      }
    }

    if (product_type) {
      productTypeFilter = `AND product_id LIKE '%${product_type}%'`;
    }

    const query = `
      WITH daily_cohort_spend AS (
        SELECT
          date as cohort_date,
          COALESCE(SUM(spend), 0) as spend
        FROM apple_ads_campaigns
        WHERE date IS NOT NULL
          ${campaignFilter}
          ${spendCountryFilter}
        GROUP BY 1
      ),
      daily_cohort_revenue AS (
        SELECT
          install_date::date as cohort_date,
          CURRENT_DATE - install_date::date as cohort_age,
          COUNT(DISTINCT CASE WHEN event_date::date - install_date::date <= 1 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d1,
          COUNT(DISTINCT CASE WHEN event_date::date - install_date::date <= 4 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d4,
          COUNT(DISTINCT CASE WHEN event_date::date - install_date::date <= 7 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d7,
          COUNT(DISTINCT CASE WHEN event_date::date - install_date::date <= 14 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d14,
          COUNT(DISTINCT CASE WHEN event_date::date - install_date::date <= 30 AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_d30
        FROM events_v2
        WHERE refund = false
          AND install_date IS NOT NULL
          ${campaignFilter}
          ${countryFilter}
          ${productTypeFilter}
        GROUP BY 1, 2
      ),
      cohort_metrics AS (
        SELECT
          r.cohort_date,
          r.cohort_age,
          COALESCE(s.spend, 0) as spend,
          r.paid_users_d1,
          r.paid_users_d4,
          r.paid_users_d7,
          r.paid_users_d14,
          r.paid_users_d30
        FROM daily_cohort_revenue r
        LEFT JOIN daily_cohort_spend s ON r.cohort_date = s.cohort_date
        WHERE COALESCE(s.spend, 0) > 0
      )
      SELECT
        SUM(CASE WHEN cohort_age >= 1 THEN spend ELSE 0 END) as spend_d1,
        SUM(CASE WHEN cohort_age >= 1 THEN paid_users_d1 ELSE 0 END) as paid_users_d1,
        COUNT(CASE WHEN cohort_age >= 1 THEN 1 END) as cohorts_d1,

        SUM(CASE WHEN cohort_age >= 4 THEN spend ELSE 0 END) as spend_d4,
        SUM(CASE WHEN cohort_age >= 4 THEN paid_users_d4 ELSE 0 END) as paid_users_d4,
        COUNT(CASE WHEN cohort_age >= 4 THEN 1 END) as cohorts_d4,

        SUM(CASE WHEN cohort_age >= 7 THEN spend ELSE 0 END) as spend_d7,
        SUM(CASE WHEN cohort_age >= 7 THEN paid_users_d7 ELSE 0 END) as paid_users_d7,
        COUNT(CASE WHEN cohort_age >= 7 THEN 1 END) as cohorts_d7,

        SUM(CASE WHEN cohort_age >= 14 THEN spend ELSE 0 END) as spend_d14,
        SUM(CASE WHEN cohort_age >= 14 THEN paid_users_d14 ELSE 0 END) as paid_users_d14,
        COUNT(CASE WHEN cohort_age >= 14 THEN 1 END) as cohorts_d14,

        SUM(CASE WHEN cohort_age >= 30 THEN spend ELSE 0 END) as spend_d30,
        SUM(CASE WHEN cohort_age >= 30 THEN paid_users_d30 ELSE 0 END) as paid_users_d30,
        COUNT(CASE WHEN cohort_age >= 30 THEN 1 END) as cohorts_d30
      FROM cohort_metrics
    `;

    const result = await db.query(query, params);
    const row = result.rows[0] || {};

    const cac = {
      d1: row.paid_users_d1 > 0 ? parseFloat(row.spend_d1) / parseInt(row.paid_users_d1) : null,
      d4: row.paid_users_d4 > 0 ? parseFloat(row.spend_d4) / parseInt(row.paid_users_d4) : null,
      d7: row.paid_users_d7 > 0 ? parseFloat(row.spend_d7) / parseInt(row.paid_users_d7) : null,
      d14: row.paid_users_d14 > 0 ? parseFloat(row.spend_d14) / parseInt(row.paid_users_d14) : null,
      d30: row.paid_users_d30 > 0 ? parseFloat(row.spend_d30) / parseInt(row.paid_users_d30) : null,
    };

    const TARGET_CAC = 65.68;

    res.json({
      target: TARGET_CAC,
      cac,
      meta: {
        d1: { spend: parseFloat(row.spend_d1) || 0, paidUsers: parseInt(row.paid_users_d1) || 0, cohorts: parseInt(row.cohorts_d1) || 0 },
        d4: { spend: parseFloat(row.spend_d4) || 0, paidUsers: parseInt(row.paid_users_d4) || 0, cohorts: parseInt(row.cohorts_d4) || 0 },
        d7: { spend: parseFloat(row.spend_d7) || 0, paidUsers: parseInt(row.paid_users_d7) || 0, cohorts: parseInt(row.cohorts_d7) || 0 },
        d14: { spend: parseFloat(row.spend_d14) || 0, paidUsers: parseInt(row.paid_users_d14) || 0, cohorts: parseInt(row.cohorts_d14) || 0 },
        d30: { spend: parseFloat(row.spend_d30) || 0, paidUsers: parseInt(row.paid_users_d30) || 0, cohorts: parseInt(row.cohorts_d30) || 0 },
      }
    });
  } catch (error) {
    console.error('KPI cohort CAC endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/debug/cohort-roas
 * Debug endpoint for cohort ROAS
 */
router.get('/debug/cohort-roas', async (req, res) => {
  try {
    const days = 7;
    const dateCondition = `date >= CURRENT_DATE - INTERVAL '${days} days'`;
    const revenueCondition = `install_date >= CURRENT_DATE - INTERVAL '${days} days'`;

    const cohortRoasQuery = await db.query(`
      WITH spend_by_campaign AS (
        SELECT campaign_id::TEXT as campaign_id, SUM(spend) as total_spend
        FROM apple_ads_campaigns
        WHERE ${dateCondition}
        GROUP BY campaign_id
      ),
      cohort_revenue AS (
        SELECT
          campaign_id::TEXT as campaign_id,
          SUM(CASE WHEN event_date - install_date <= INTERVAL '7 days' AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue_d7,
          SUM(CASE WHEN event_date - install_date <= INTERVAL '30 days' AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue_d30,
          COUNT(*) as event_count
        FROM events_v2
        WHERE ${revenueCondition}
          AND campaign_id IS NOT NULL
        GROUP BY campaign_id
      )
      SELECT
        s.campaign_id,
        s.total_spend,
        r.revenue_d7,
        r.revenue_d30,
        r.event_count,
        CASE WHEN s.total_spend > 0 THEN COALESCE(r.revenue_d7, 0) / s.total_spend ELSE 0 END as roas_d7,
        CASE WHEN s.total_spend > 0 THEN COALESCE(r.revenue_d30, 0) / s.total_spend ELSE 0 END as roas_d30
      FROM spend_by_campaign s
      LEFT JOIN cohort_revenue r ON s.campaign_id = r.campaign_id
      LIMIT 10
    `);

    const eventsCheck = await db.query(`
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT campaign_id) as campaigns_with_events,
        COUNT(CASE WHEN install_date IS NOT NULL THEN 1 END) as with_install_date,
        COUNT(CASE WHEN event_date IS NOT NULL THEN 1 END) as with_event_date,
        MIN(install_date) as min_install_date,
        MAX(install_date) as max_install_date
      FROM events_v2
      WHERE campaign_id IS NOT NULL
    `);

    res.json({
      cohortRoas: cohortRoasQuery.rows,
      eventsStats: eventsCheck.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
