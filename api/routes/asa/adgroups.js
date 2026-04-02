/**
 * Ad Group routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const appleAds = require('../../services/appleAds');
const { recordChange, parseDateFilter, db } = require('./utils');

/**
 * GET /asa/campaigns/:campaignId/adgroups
 * List ad groups for a campaign with performance data
 */
router.get('/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { dateFilter, dateCondition, revenueCondition } = parseDateFilter(req.query);

    const adGroups = await appleAds.getAdGroups(campaignId);

    const performanceQuery = await db.query(`
      SELECT
        k.adgroup_id,
        k.spend,
        k.impressions,
        k.taps,
        k.installs,
        k.impression_share,
        COALESCE(r.revenue, 0) as revenue,
        COALESCE(r.paid_users, 0) as paid_users
      FROM (
        SELECT
          adgroup_id,
          SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) as spend,
          SUM(CASE WHEN ${dateCondition} THEN impressions ELSE 0 END) as impressions,
          SUM(CASE WHEN ${dateCondition} THEN taps ELSE 0 END) as taps,
          SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) as installs,
          NULL as impression_share
        FROM apple_ads_keywords
        WHERE campaign_id = $1
        GROUP BY adgroup_id
      ) k
      LEFT JOIN (
        SELECT
          adgroup_id,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users
        FROM events_v2
        WHERE ${revenueCondition}
          AND campaign_id = $1
          AND adgroup_id IS NOT NULL
        GROUP BY adgroup_id
      ) r ON k.adgroup_id::TEXT = r.adgroup_id::TEXT
    `, [campaignId]);

    const performanceMap = new Map(performanceQuery.rows.map(p => [String(p.adgroup_id), p]));

    const cohortRoasQuery = await db.query(`
      WITH spend_by_adgroup AS (
        SELECT adgroup_id::TEXT as adgroup_id, SUM(spend) as total_spend
        FROM apple_ads_keywords
        WHERE campaign_id = $1 AND ${dateCondition}
        GROUP BY adgroup_id
      ),
      cohort_revenue AS (
        SELECT
          adgroup_id::TEXT as adgroup_id,
          SUM(CASE WHEN event_date - install_date <= INTERVAL '7 days' AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue_d7,
          SUM(CASE WHEN event_date - install_date <= INTERVAL '30 days' AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue_d30
        FROM events_v2
        WHERE ${revenueCondition}
          AND campaign_id = $1
          AND adgroup_id IS NOT NULL
        GROUP BY adgroup_id
      )
      SELECT
        s.adgroup_id,
        CASE WHEN s.total_spend > 0 THEN COALESCE(r.revenue_d7, 0) / s.total_spend ELSE 0 END as roas_d7,
        CASE WHEN s.total_spend > 0 THEN COALESCE(r.revenue_d30, 0) / s.total_spend ELSE 0 END as roas_d30
      FROM spend_by_adgroup s
      LEFT JOIN cohort_revenue r ON s.adgroup_id = r.adgroup_id
    `, [campaignId]);
    const cohortRoasMap = new Map(cohortRoasQuery.rows.map(c => [String(c.adgroup_id), c]));

    const enriched = adGroups.map(ag => {
      const perf = performanceMap.get(String(ag.id)) || {};
      const cohortRoas = cohortRoasMap.get(String(ag.id));
      const spend = parseFloat(perf.spend || 0);
      const impressions = parseInt(perf.impressions || 0);
      const taps = parseInt(perf.taps || 0);
      const installs = parseInt(perf.installs || 0);
      const revenue = parseFloat(perf.revenue || 0);
      const paidUsers = parseInt(perf.paid_users || 0);
      const impressionShare = parseFloat(perf.impression_share) || null;

      return {
        ...ag,
        performance: {
          spend,
          impressions,
          taps,
          installs,
          revenue,
          paid_users: paidUsers,
          cpa: installs > 0 ? spend / installs : null,
          roas: spend > 0 ? revenue / spend : 0,
          roas_d7: cohortRoas ? parseFloat(cohortRoas.roas_d7) || 0 : 0,
          roas_d30: cohortRoas ? parseFloat(cohortRoas.roas_d30) || 0 : 0,
          cop: paidUsers > 0 ? spend / paidUsers : null,
          ttr: impressions > 0 ? taps / impressions : 0,
          cvr: taps > 0 ? installs / taps : 0,
          cpt: taps > 0 ? spend / taps : null,
          cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
          impression_share: impressionShare,
          soi: impressionShare,
        }
      };
    });

    enriched.sort((a, b) => (b.performance?.revenue || 0) - (a.performance?.revenue || 0));

    res.json({
      campaignId,
      total: enriched.length,
      dateRange: dateFilter,
      data: enriched
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/campaigns/:campaignId/adgroups/:adGroupId
 * Get single ad group
 */
router.get('/:campaignId/:adGroupId', async (req, res) => {
  try {
    const { campaignId, adGroupId } = req.params;
    const adGroup = await appleAds.getAdGroup(campaignId, adGroupId);
    const keywords = await appleAds.getKeywords(campaignId, adGroupId);

    res.json({
      ...adGroup,
      keywords,
      keywordCount: keywords.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /asa/campaigns/:campaignId/adgroups/:adGroupId
 * Update ad group
 */
router.put('/:campaignId/:adGroupId', async (req, res) => {
  try {
    const { campaignId, adGroupId } = req.params;
    const updates = req.body;

    const current = await appleAds.getAdGroup(campaignId, adGroupId);
    const result = await appleAds.updateAdGroup(campaignId, adGroupId, updates);

    for (const [key, value] of Object.entries(updates)) {
      await recordChange('adgroup', adGroupId, 'status_update', key, JSON.stringify(current[key]), JSON.stringify(value), 'api', null, req);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/campaigns/:campaignId/adgroups/:adGroupId/status
 * Update ad group status
 */
router.patch('/:campaignId/:adGroupId/status', async (req, res) => {
  try {
    const { campaignId, adGroupId } = req.params;
    const { status } = req.body;

    if (!['ENABLED', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const current = await appleAds.getAdGroup(campaignId, adGroupId);
    const result = await appleAds.updateAdGroupStatus(campaignId, adGroupId, status);

    await recordChange('adgroup', adGroupId, 'status_update', 'status', current.status, status, 'api', null, req);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/campaigns/:campaignId/adgroups/:adGroupId/bid
 * Update ad group default bid
 */
router.patch('/:campaignId/:adGroupId/bid', async (req, res) => {
  try {
    const { campaignId, adGroupId } = req.params;
    const { bidAmount, currency = 'USD' } = req.body;

    if (!bidAmount || bidAmount <= 0) {
      return res.status(400).json({ error: 'Invalid bidAmount' });
    }

    const current = await appleAds.getAdGroup(campaignId, adGroupId);
    const result = await appleAds.updateAdGroupBid(campaignId, adGroupId, bidAmount, currency);

    await recordChange('adgroup', adGroupId, 'bid_update', 'defaultBid', current.defaultBidAmount?.amount, String(bidAmount), 'api', null, req);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
