/**
 * ASA Management Routes
 *
 * CRUD endpoints for Apple Search Ads management
 * Includes campaigns, adgroups, keywords, rules, templates, and history
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const appleAds = require('../services/appleAds');
const rulesEngine = require('../services/rulesEngine');

// ================================================
// MIDDLEWARE
// ================================================

/**
 * Record change to history
 */
async function recordChange(entityType, entityId, changeType, fieldName, oldValue, newValue, source, ruleId = null, req = null) {
  try {
    await db.query(`
      INSERT INTO asa_change_history (
        entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
        change_type, field_name, old_value, new_value, source, rule_id,
        user_id, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      entityType,
      entityId,
      entityType === 'campaign' ? entityId : null,
      entityType === 'adgroup' ? entityId : null,
      entityType === 'keyword' ? entityId : null,
      changeType,
      fieldName,
      oldValue,
      newValue,
      source,
      ruleId,
      req?.user?.id || null,
      req?.ip || null,
      req?.get('user-agent') || null
    ]);
  } catch (error) {
    console.error('Failed to record change:', error.message);
  }
}

// ================================================
// CAMPAIGNS
// ================================================

/**
 * GET /asa/campaigns
 * List all campaigns with optional filters
 *
 * Query params:
 * - days: number of days (default 7)
 * - from: start date (YYYY-MM-DD)
 * - to: end date (YYYY-MM-DD)
 * - status: filter by status
 * - sort: revenue (default), spend, roas, name
 */
router.get('/campaigns', async (req, res) => {
  try {
    const { status, limit = 100, offset = 0, sort = 'revenue' } = req.query;

    // Parse date range
    let { days = 7, from, to } = req.query;
    let dateFilter;

    if (from && to) {
      dateFilter = { from, to };
    } else {
      days = parseInt(days) || 7;
      dateFilter = { days };
    }

    // Get from Apple Ads API
    const campaigns = await appleAds.getCampaigns();

    // Filter by status if specified
    let filtered = campaigns;
    if (status) {
      filtered = campaigns.filter(c => c.status === status.toUpperCase());
    }

    // Build dynamic performance query
    const dateCondition = dateFilter.days
      ? `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `date >= '${dateFilter.from}' AND date <= '${dateFilter.to}'`;

    // Use install_date for LTV-based revenue (lifetime value of users acquired in period)
    const revenueCondition = dateFilter.days
      ? `install_date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `install_date >= '${dateFilter.from}' AND install_date <= '${dateFilter.to}'`;

    const performanceQuery = await db.query(`
      SELECT
        c.campaign_id,
        c.campaign_name,
        c.campaign_status,
        c.daily_budget,
        c.spend,
        c.impressions,
        c.taps,
        c.installs,
        c.cpa,
        c.last_data_date,
        COALESCE(r.revenue, 0) as revenue,
        COALESCE(r.paid_users, 0) as paid_users,
        CASE WHEN c.spend > 0 THEN COALESCE(r.revenue, 0) / c.spend ELSE 0 END as roas,
        CASE WHEN COALESCE(r.paid_users, 0) > 0 THEN c.spend / r.paid_users ELSE NULL END as cop
      FROM (
        SELECT
          campaign_id,
          MAX(campaign_name) as campaign_name,
          MAX(campaign_status) as campaign_status,
          MAX(daily_budget) as daily_budget,
          SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) as spend,
          SUM(CASE WHEN ${dateCondition} THEN impressions ELSE 0 END) as impressions,
          SUM(CASE WHEN ${dateCondition} THEN taps ELSE 0 END) as taps,
          SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) as installs,
          CASE WHEN SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) > 0
               THEN SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) /
                    SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END)
               ELSE NULL
          END as cpa,
          MAX(date) as last_data_date
        FROM apple_ads_campaigns
        GROUP BY campaign_id
      ) c
      LEFT JOIN (
        SELECT
          campaign_id,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users
        FROM events_v2
        WHERE ${revenueCondition}
          AND campaign_id IS NOT NULL
        GROUP BY campaign_id
      ) r ON c.campaign_id = r.campaign_id
    `);

    // Use string keys to ensure type matching
    const performanceMap = new Map(performanceQuery.rows.map(p => [String(p.campaign_id), p]));

    // Get budget alerts for today
    const alertsQuery = await db.query(`
      SELECT campaign_id, alert_level, message
      FROM asa_budget_alerts
      WHERE DATE(created_at) = CURRENT_DATE
        AND acknowledged = FALSE
    `);
    const alertsMap = new Map(alertsQuery.rows.map(a => [String(a.campaign_id), a]));

    // Enrich campaigns with performance data and budget alerts
    const enriched = filtered.map(campaign => {
      const perf = performanceMap.get(String(campaign.id));
      const alert = alertsMap.get(String(campaign.id));

      // Calculate budget usage percentage
      let budgetUsedPct = null;
      if (perf && perf.daily_budget > 0) {
        budgetUsedPct = Math.round((parseFloat(perf.spend) / parseFloat(perf.daily_budget)) * 100);
      }

      return {
        ...campaign,
        performance: perf || null,
        budgetAlert: alert ? {
          level: alert.alert_level,
          message: alert.message
        } : null,
        budgetUsedPct
      };
    });

    // Sort
    enriched.sort((a, b) => {
      const perfA = a.performance || {};
      const perfB = b.performance || {};

      switch (sort) {
        case 'revenue':
          return (parseFloat(perfB.revenue) || 0) - (parseFloat(perfA.revenue) || 0);
        case 'spend':
          return (parseFloat(perfB.spend) || 0) - (parseFloat(perfA.spend) || 0);
        case 'roas':
          return (parseFloat(perfB.roas) || 0) - (parseFloat(perfA.roas) || 0);
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return (parseFloat(perfB.revenue) || 0) - (parseFloat(perfA.revenue) || 0);
      }
    });

    // Get totals from DB (includes all campaigns, not just those from API)
    const totalsQuery = await db.query(`
      SELECT
        SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) as total_spend,
        SUM(CASE WHEN ${dateCondition} THEN impressions ELSE 0 END) as total_impressions,
        SUM(CASE WHEN ${dateCondition} THEN taps ELSE 0 END) as total_taps,
        SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) as total_installs
      FROM apple_ads_campaigns
    `);

    const revenueQuery = await db.query(`
      SELECT
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as total_revenue,
        COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as total_paid_users
      FROM events_v2
      WHERE ${revenueCondition}
        AND campaign_id IS NOT NULL
    `);

    const totals = {
      spend: parseFloat(totalsQuery.rows[0]?.total_spend) || 0,
      impressions: parseInt(totalsQuery.rows[0]?.total_impressions) || 0,
      taps: parseInt(totalsQuery.rows[0]?.total_taps) || 0,
      installs: parseInt(totalsQuery.rows[0]?.total_installs) || 0,
      revenue: parseFloat(revenueQuery.rows[0]?.total_revenue) || 0,
      paidUsers: parseInt(revenueQuery.rows[0]?.total_paid_users) || 0,
    };
    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    totals.cpa = totals.installs > 0 ? totals.spend / totals.installs : 0;
    totals.cop = totals.paidUsers > 0 ? totals.spend / totals.paidUsers : 0;

    res.json({
      total: enriched.length,
      dateRange: dateFilter,
      totals,
      data: enriched.slice(offset, offset + parseInt(limit))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/campaigns/:id
 * Get single campaign with details
 */
router.get('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await appleAds.getCampaign(id);

    // Get ad groups
    const adGroups = await appleAds.getAdGroups(id);

    // Get performance data
    const performance = await db.query(`
      SELECT * FROM v_campaign_performance WHERE campaign_id = $1
    `, [id]);

    res.json({
      ...campaign,
      adGroups,
      performance: performance.rows[0] || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /asa/campaigns/:id
 * Update campaign settings
 */
router.put('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Get current values for history
    const current = await appleAds.getCampaign(id);

    // Apply updates
    const result = await appleAds.updateCampaign(id, updates);

    // Record changes
    for (const [key, value] of Object.entries(updates)) {
      await recordChange(
        'campaign',
        id,
        'status_update',
        key,
        JSON.stringify(current[key]),
        JSON.stringify(value),
        'api',
        null,
        req
      );
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/campaigns/:id/status
 * Update campaign status (pause/enable)
 */
router.patch('/campaigns/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // ENABLED, PAUSED

    if (!['ENABLED', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use ENABLED or PAUSED.' });
    }

    // Get current status
    const current = await appleAds.getCampaign(id);

    // Update
    const result = await appleAds.updateCampaignStatus(id, status);

    // Record change
    await recordChange('campaign', id, 'status_update', 'status', current.status, status, 'api', null, req);

    res.json({ success: true, previousStatus: current.status, newStatus: status, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/campaigns/:id/budget
 * Update campaign budget
 */
router.patch('/campaigns/:id/budget', async (req, res) => {
  try {
    const { id } = req.params;
    const { dailyBudget, currency = 'USD' } = req.body;

    if (!dailyBudget || dailyBudget <= 0) {
      return res.status(400).json({ error: 'Invalid dailyBudget' });
    }

    // Get current budget
    const current = await appleAds.getCampaign(id);

    // Update
    const result = await appleAds.updateCampaignBudget(id, dailyBudget, currency);

    // Record change
    await recordChange(
      'campaign',
      id,
      'budget_update',
      'dailyBudget',
      current.dailyBudgetAmount?.amount,
      String(dailyBudget),
      'api',
      null,
      req
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// AD GROUPS
// ================================================

/**
 * GET /asa/campaigns/:campaignId/adgroups
 * List ad groups for a campaign with performance data
 */
router.get('/campaigns/:campaignId/adgroups', async (req, res) => {
  try {
    const { campaignId } = req.params;
    let { days = 7, from, to } = req.query;

    // Parse date range
    let dateFilter;
    if (from && to) {
      dateFilter = { from, to };
    } else {
      days = parseInt(days) || 7;
      dateFilter = { days };
    }

    const adGroups = await appleAds.getAdGroups(campaignId);

    // Build date conditions for performance query
    const dateCondition = dateFilter.days
      ? `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `date >= '${dateFilter.from}' AND date <= '${dateFilter.to}'`;

    // Use install_date for LTV-based revenue (lifetime value of users acquired in period)
    const revenueCondition = dateFilter.days
      ? `install_date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `install_date >= '${dateFilter.from}' AND install_date <= '${dateFilter.to}'`;

    // Get performance data aggregated by adgroup
    const performanceQuery = await db.query(`
      SELECT
        k.adgroup_id,
        SUM(CASE WHEN ${dateCondition} THEN k.spend ELSE 0 END) as spend,
        SUM(CASE WHEN ${dateCondition} THEN k.impressions ELSE 0 END) as impressions,
        SUM(CASE WHEN ${dateCondition} THEN k.taps ELSE 0 END) as taps,
        SUM(CASE WHEN ${dateCondition} THEN k.installs ELSE 0 END) as installs,
        COALESCE(r.revenue, 0) as revenue,
        COALESCE(r.paid_users, 0) as paid_users
      FROM apple_ads_keywords k
      LEFT JOIN (
        SELECT
          adgroup_id,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users
        FROM events_v2
        WHERE ${revenueCondition}
          AND adgroup_id IS NOT NULL
        GROUP BY adgroup_id
      ) r ON k.adgroup_id::TEXT = r.adgroup_id::TEXT
      WHERE k.campaign_id = $1
      GROUP BY k.adgroup_id, r.revenue, r.paid_users
    `, [campaignId]);

    const performanceMap = new Map(performanceQuery.rows.map(p => [String(p.adgroup_id), p]));

    // Enrich ad groups with performance
    const enriched = adGroups.map(ag => {
      const perf = performanceMap.get(String(ag.id)) || {};
      const spend = parseFloat(perf.spend || 0);
      const installs = parseInt(perf.installs || 0);
      const revenue = parseFloat(perf.revenue || 0);
      const paidUsers = parseInt(perf.paid_users || 0);

      return {
        ...ag,
        performance: {
          spend,
          impressions: parseInt(perf.impressions || 0),
          taps: parseInt(perf.taps || 0),
          installs,
          revenue,
          paid_users: paidUsers,
          cpa: installs > 0 ? spend / installs : null,
          roas: spend > 0 ? revenue / spend : 0,
          cop: paidUsers > 0 ? spend / paidUsers : null,
        }
      };
    });

    // Sort by revenue descending
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
router.get('/campaigns/:campaignId/adgroups/:adGroupId', async (req, res) => {
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
router.put('/campaigns/:campaignId/adgroups/:adGroupId', async (req, res) => {
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
router.patch('/campaigns/:campaignId/adgroups/:adGroupId/status', async (req, res) => {
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
router.patch('/campaigns/:campaignId/adgroups/:adGroupId/bid', async (req, res) => {
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

// ================================================
// KEYWORDS
// ================================================

/**
 * GET /asa/keywords
 * List keywords with filters
 *
 * Query params:
 * - campaign_id: campaign ID (required)
 * - adgroup_id: ad group ID (optional)
 * - status: filter by status
 * - days: number of days (default 7)
 * - from: start date (YYYY-MM-DD)
 * - to: end date (YYYY-MM-DD)
 */
router.get('/keywords', async (req, res) => {
  try {
    const { campaign_id, adgroup_id, status, limit = 100, offset = 0 } = req.query;

    if (!campaign_id) {
      return res.status(400).json({ error: 'campaign_id is required' });
    }

    // Parse date range
    let { days = 7, from, to } = req.query;
    let dateFilter;
    if (from && to) {
      dateFilter = { from, to };
    } else {
      days = parseInt(days) || 7;
      dateFilter = { days };
    }

    // Build date conditions (without table alias - will be used in different contexts)
    const dateCondition = dateFilter.days
      ? `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `date >= '${dateFilter.from}' AND date <= '${dateFilter.to}'`;

    // Use install_date for LTV-based revenue (lifetime value of users acquired in period)
    const revenueCondition = dateFilter.days
      ? `install_date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `install_date >= '${dateFilter.from}' AND install_date <= '${dateFilter.to}'`;

    // Get keywords with dynamic performance data
    let baseQuery = `
      WITH keyword_perf AS (
        SELECT
          keyword_id,
          SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) as spend,
          SUM(CASE WHEN ${dateCondition} THEN impressions ELSE 0 END) as impressions,
          SUM(CASE WHEN ${dateCondition} THEN taps ELSE 0 END) as taps,
          SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) as installs
        FROM apple_ads_keywords
        WHERE campaign_id = $1
        GROUP BY keyword_id
      ),
      keyword_revenue AS (
        SELECT
          keyword_id,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users
        FROM events_v2
        WHERE ${revenueCondition}
          AND keyword_id IS NOT NULL
          AND campaign_id = $1
        GROUP BY keyword_id
      ),
      keyword_base AS (
        SELECT DISTINCT ON (keyword_id)
          keyword_id, campaign_id, adgroup_id, keyword_text, match_type, bid_amount
        FROM apple_ads_keywords
        WHERE campaign_id = $1
        ORDER BY keyword_id, date DESC
      )
      SELECT
        k.keyword_id,
        k.campaign_id,
        k.adgroup_id,
        k.keyword_text,
        k.match_type,
        k.bid_amount,
        COALESCE(p.spend, 0) as spend_7d,
        COALESCE(p.impressions, 0) as impressions_7d,
        COALESCE(p.taps, 0) as taps_7d,
        COALESCE(p.installs, 0) as installs_7d,
        COALESCE(r.revenue, 0) as revenue_7d,
        COALESCE(r.paid_users, 0) as paid_users_7d,
        CASE WHEN COALESCE(p.installs, 0) > 0 THEN COALESCE(p.spend, 0) / p.installs ELSE NULL END as cpa_7d,
        CASE WHEN COALESCE(p.spend, 0) > 0 THEN COALESCE(r.revenue, 0) / p.spend ELSE 0 END as roas_7d,
        CASE WHEN COALESCE(r.paid_users, 0) > 0 THEN COALESCE(p.spend, 0) / r.paid_users ELSE NULL END as cop_7d,
        CASE WHEN COALESCE(p.impressions, 0) > 0 THEN COALESCE(p.taps, 0)::float / p.impressions ELSE 0 END as ttr_7d
      FROM keyword_base k
      LEFT JOIN keyword_perf p ON k.keyword_id = p.keyword_id
      LEFT JOIN keyword_revenue r ON k.keyword_id::TEXT = r.keyword_id::TEXT
      WHERE 1=1
    `;
    const params = [campaign_id];

    if (adgroup_id) {
      baseQuery += ` AND k.adgroup_id = $${params.length + 1}`;
      params.push(adgroup_id);
    }

    // Get total count
    const countQuery = `
      WITH keyword_base AS (
        SELECT DISTINCT ON (keyword_id)
          keyword_id, campaign_id, adgroup_id
        FROM apple_ads_keywords
        WHERE campaign_id = $1
        ORDER BY keyword_id, date DESC
      )
      SELECT COUNT(*) as total
      FROM keyword_base k
      WHERE 1=1
      ${adgroup_id ? ` AND k.adgroup_id = $${params.length}` : ''}
    `;

    const countResult = await db.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0]?.total || 0);

    // Add pagination to main query
    baseQuery += ` ORDER BY spend_7d DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(baseQuery, params);

    res.json({
      total: totalCount,
      dateRange: dateFilter,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/campaigns/:campaignId/adgroups/:adGroupId/keywords
 * List keywords from Apple Ads API
 */
router.get('/campaigns/:campaignId/adgroups/:adGroupId/keywords', async (req, res) => {
  try {
    const { campaignId, adGroupId } = req.params;
    const keywords = await appleAds.getKeywords(campaignId, adGroupId);

    res.json({
      campaignId,
      adGroupId,
      total: keywords.length,
      data: keywords
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/keywords/bulk
 * Create multiple keywords
 */
router.post('/keywords/bulk', async (req, res) => {
  try {
    const { campaignId, adGroupId, keywords } = req.body;

    if (!campaignId || !adGroupId || !keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and keywords array required' });
    }

    // Format keywords for Apple Ads API
    const formattedKeywords = keywords.map(kw => ({
      text: kw.text,
      matchType: kw.matchType || 'EXACT',
      bidAmount: kw.bidAmount ? { amount: String(kw.bidAmount), currency: kw.currency || 'USD' } : undefined,
      status: kw.status || 'ACTIVE'
    }));

    const result = await appleAds.createKeywords(campaignId, adGroupId, formattedKeywords);

    // Record changes
    for (const kw of result) {
      await recordChange('keyword', kw.id, 'create', null, null, JSON.stringify(kw), 'api', null, req);
    }

    res.json({
      success: true,
      created: result.length,
      data: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/keywords/:keywordId/bid
 * Update single keyword bid
 */
router.patch('/keywords/:keywordId/bid', async (req, res) => {
  try {
    const { keywordId } = req.params;
    const { campaignId, adGroupId, bidAmount, currency = 'USD' } = req.body;

    if (!campaignId || !adGroupId || !bidAmount) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and bidAmount required' });
    }

    // Get current keyword
    const current = await appleAds.getKeyword(campaignId, adGroupId, keywordId);

    // Update bid
    const result = await appleAds.updateKeywordBid(campaignId, adGroupId, keywordId, bidAmount, currency);

    // Record change
    await recordChange('keyword', keywordId, 'bid_update', 'bidAmount', current.bidAmount?.amount, String(bidAmount), 'api', null, req);

    res.json({
      success: true,
      previousBid: current.bidAmount?.amount,
      newBid: String(bidAmount),
      data: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/keywords/:keywordId/status
 * Update single keyword status
 */
router.patch('/keywords/:keywordId/status', async (req, res) => {
  try {
    const { keywordId } = req.params;
    const { campaignId, adGroupId, status } = req.body;

    if (!campaignId || !adGroupId || !['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and valid status required' });
    }

    const current = await appleAds.getKeyword(campaignId, adGroupId, keywordId);
    const result = await appleAds.updateKeywordStatus(campaignId, adGroupId, keywordId, status);

    await recordChange('keyword', keywordId, 'status_update', 'status', current.status, status, 'api', null, req);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/keywords/bulk/bid
 * Bulk update keyword bids
 */
router.patch('/keywords/bulk/bid', async (req, res) => {
  try {
    const { campaignId, adGroupId, updates, dryRun = false } = req.body;
    // updates: [{ keywordId, bidAmount }]

    if (!campaignId || !adGroupId || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and updates array required' });
    }

    const results = [];

    for (const update of updates) {
      const { keywordId, bidAmount, currency = 'USD' } = update;

      try {
        // Get current value
        const current = await appleAds.getKeyword(campaignId, adGroupId, keywordId);

        if (dryRun) {
          results.push({
            keywordId,
            keyword: current.text,
            currentBid: current.bidAmount?.amount,
            newBid: String(bidAmount),
            status: 'dry_run'
          });
        } else {
          await appleAds.updateKeywordBid(campaignId, adGroupId, keywordId, bidAmount, currency);
          await recordChange('keyword', keywordId, 'bid_update', 'bidAmount', current.bidAmount?.amount, String(bidAmount), 'api', null, req);

          results.push({
            keywordId,
            keyword: current.text,
            currentBid: current.bidAmount?.amount,
            newBid: String(bidAmount),
            status: 'updated'
          });
        }
      } catch (error) {
        results.push({
          keywordId,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      dryRun,
      total: updates.length,
      updated: results.filter(r => r.status === 'updated').length,
      errors: results.filter(r => r.status === 'error').length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/keywords/bulk/status
 * Bulk update keyword status (ACTIVE/PAUSED)
 */
router.patch('/keywords/bulk/status', async (req, res) => {
  try {
    const { campaignId, adGroupId, keywordIds, status, dryRun = false } = req.body;

    if (!campaignId || !adGroupId || !keywordIds || !Array.isArray(keywordIds) || !status) {
      return res.status(400).json({ error: 'campaignId, adGroupId, keywordIds array, and status required' });
    }

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ACTIVE or PAUSED' });
    }

    const results = [];

    for (const keywordId of keywordIds) {
      try {
        const current = await appleAds.getKeyword(campaignId, adGroupId, keywordId);

        if (dryRun) {
          results.push({
            keywordId,
            keyword: current.text,
            currentStatus: current.status,
            newStatus: status,
            status: 'dry_run'
          });
        } else {
          await appleAds.updateKeywordStatus(campaignId, adGroupId, keywordId, status);
          await recordChange('keyword', keywordId, 'status_update', 'status', current.status, status, 'api', null, req);

          results.push({
            keywordId,
            keyword: current.text,
            currentStatus: current.status,
            newStatus: status,
            status: 'updated'
          });
        }
      } catch (error) {
        results.push({
          keywordId,
          status: 'error',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      dryRun,
      total: keywordIds.length,
      updated: results.filter(r => r.status === 'updated').length,
      errors: results.filter(r => r.status === 'error').length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// AUTOMATION RULES
// ================================================

/**
 * GET /asa/rules
 * List all automation rules
 */
router.get('/rules', async (req, res) => {
  try {
    const { enabled, scope } = req.query;

    let query = 'SELECT * FROM asa_automation_rules WHERE 1=1';
    const params = [];

    if (enabled !== undefined) {
      params.push(enabled === 'true');
      query += ` AND enabled = $${params.length}`;
    }

    if (scope) {
      params.push(scope);
      query += ` AND scope = $${params.length}`;
    }

    query += ' ORDER BY priority ASC, created_at DESC';

    const result = await db.query(query, params);

    // Get execution stats
    const statsQuery = await db.query(`
      SELECT * FROM v_recent_rule_activity
    `);
    const statsMap = new Map(statsQuery.rows.map(s => [s.rule_id, s]));

    const enriched = result.rows.map(rule => ({
      ...rule,
      stats: statsMap.get(rule.id) || null
    }));

    res.json({
      total: enriched.length,
      data: enriched
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/rules/:id
 * Get single rule with execution history
 */
router.get('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const ruleResult = await db.query('SELECT * FROM asa_automation_rules WHERE id = $1', [id]);
    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const rule = ruleResult.rows[0];

    // Get recent executions
    const executions = await db.query(`
      SELECT * FROM asa_rule_executions
      WHERE rule_id = $1
      ORDER BY executed_at DESC
      LIMIT 50
    `, [id]);

    res.json({
      ...rule,
      recentExecutions: executions.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/rules
 * Create new automation rule
 */
router.post('/rules', async (req, res) => {
  try {
    const {
      name,
      description,
      scope,
      campaign_ids,
      adgroup_ids,
      keyword_ids,
      conditions,
      conditions_logic = 'AND',
      action_type,
      action_params,
      frequency = 'daily',
      max_executions_per_day = 1,
      cooldown_hours = 24,
      enabled = true,
      priority = 100
    } = req.body;

    // Validate required fields
    if (!name || !scope || !conditions || !action_type) {
      return res.status(400).json({ error: 'name, scope, conditions, and action_type are required' });
    }

    // Validate scope
    if (!['campaign', 'adgroup', 'keyword'].includes(scope)) {
      return res.status(400).json({ error: 'Invalid scope. Use campaign, adgroup, or keyword.' });
    }

    // Validate action_type
    const validActions = ['adjust_bid', 'set_bid', 'pause', 'enable', 'send_alert'];
    if (!validActions.includes(action_type)) {
      return res.status(400).json({ error: `Invalid action_type. Use one of: ${validActions.join(', ')}` });
    }

    const result = await db.query(`
      INSERT INTO asa_automation_rules (
        name, description, scope, campaign_ids, adgroup_ids, keyword_ids,
        conditions, conditions_logic, action_type, action_params,
        frequency, max_executions_per_day, cooldown_hours, enabled, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      name,
      description,
      scope,
      campaign_ids || null,
      adgroup_ids || null,
      keyword_ids || null,
      JSON.stringify(conditions),
      conditions_logic,
      action_type,
      JSON.stringify(action_params || {}),
      frequency,
      max_executions_per_day,
      cooldown_hours,
      enabled,
      priority
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /asa/rules/:id
 * Update automation rule
 */
router.put('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build update query dynamically
    const allowedFields = [
      'name', 'description', 'scope', 'campaign_ids', 'adgroup_ids', 'keyword_ids',
      'conditions', 'conditions_logic', 'action_type', 'action_params',
      'frequency', 'max_executions_per_day', 'cooldown_hours', 'enabled', 'priority'
    ];

    const setClauses = [];
    const params = [id];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        params.push(key === 'conditions' || key === 'action_params' ? JSON.stringify(value) : value);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = NOW()');

    const result = await db.query(`
      UPDATE asa_automation_rules
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /asa/rules/:id
 * Delete automation rule
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query('DELETE FROM asa_automation_rules WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/rules/:id/execute
 * Execute rule manually (for testing)
 */
router.post('/rules/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { dry_run = false } = req.query;

    const result = await rulesEngine.executeRule(parseInt(id), dry_run === 'true');

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/rules/:id/preview
 * Preview what entities would be affected by rule
 */
router.get('/rules/:id/preview', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await rulesEngine.previewRule(parseInt(id));

    res.json({
      success: true,
      preview: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/rules/execute-all
 * Execute all enabled rules
 */
router.post('/rules/execute-all', async (req, res) => {
  try {
    const { dry_run = false, frequency } = req.query;

    const result = await rulesEngine.executeAllRules(
      dry_run === 'true',
      frequency || null
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// TEMPLATES
// ================================================

/**
 * GET /asa/templates
 * List all templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { type } = req.query;

    let query = 'SELECT * FROM asa_campaign_templates';
    const params = [];

    if (type) {
      params.push(type);
      query += ' WHERE template_type = $1';
    }

    query += ' ORDER BY times_used DESC, created_at DESC';

    const result = await db.query(query, params);

    res.json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/templates/:id
 * Get single template
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM asa_campaign_templates WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/templates
 * Create new template
 */
router.post('/templates', async (req, res) => {
  try {
    const {
      name,
      description,
      template_type = 'campaign',
      campaign_settings = {},
      adgroup_settings = {},
      keywords = [],
      negative_keywords = [],
      variables = {}
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = await db.query(`
      INSERT INTO asa_campaign_templates (
        name, description, template_type,
        campaign_settings, adgroup_settings, keywords, negative_keywords, variables
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      name,
      description,
      template_type,
      JSON.stringify(campaign_settings),
      JSON.stringify(adgroup_settings),
      JSON.stringify(keywords),
      JSON.stringify(negative_keywords),
      JSON.stringify(variables)
    ]);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /asa/templates/:id
 * Update template
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      'name', 'description', 'template_type',
      'campaign_settings', 'adgroup_settings', 'keywords', 'negative_keywords', 'variables'
    ];

    const setClauses = [];
    const params = [id];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        params.push(['campaign_settings', 'adgroup_settings', 'keywords', 'negative_keywords', 'variables'].includes(key)
          ? JSON.stringify(value)
          : value
        );
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = NOW()');

    const result = await db.query(`
      UPDATE asa_campaign_templates
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /asa/templates/:id
 * Delete template
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM asa_campaign_templates WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// HISTORY / AUDIT LOG
// ================================================

/**
 * GET /asa/history
 * Get change history
 */
router.get('/history', async (req, res) => {
  try {
    const {
      entity_type,
      entity_id,
      change_type,
      source,
      from,
      to,
      limit = 100,
      offset = 0
    } = req.query;

    let query = 'SELECT * FROM asa_change_history WHERE 1=1';
    const params = [];

    if (entity_type) {
      params.push(entity_type);
      query += ` AND entity_type = $${params.length}`;
    }

    if (entity_id) {
      params.push(entity_id);
      query += ` AND entity_id = $${params.length}`;
    }

    if (change_type) {
      params.push(change_type);
      query += ` AND change_type = $${params.length}`;
    }

    if (source) {
      params.push(source);
      query += ` AND source = $${params.length}`;
    }

    if (from) {
      params.push(from);
      query += ` AND changed_at >= $${params.length}`;
    }

    if (to) {
      params.push(to);
      query += ` AND changed_at <= $${params.length}`;
    }

    query += ` ORDER BY changed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/history/entity/:type/:id
 * Get history for specific entity
 */
router.get('/history/entity/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    const result = await db.query(`
      SELECT * FROM asa_change_history
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY changed_at DESC
      LIMIT 100
    `, [type, id]);

    res.json({
      entityType: type,
      entityId: id,
      total: result.rowCount,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// SYNC OPERATIONS
// ================================================

/**
 * GET /asa/sync/status
 * Get current sync status and last sync time
 */
router.get('/sync/status', async (req, res) => {
  try {
    // Get last sync from campaign data
    const lastSyncResult = await db.query(`
      SELECT
        MAX(updated_at) as last_sync,
        MAX(date) as last_data_date,
        COUNT(DISTINCT campaign_id) as campaigns_synced
      FROM apple_ads_campaigns
    `);

    // Get sync history from change log
    const syncHistoryResult = await db.query(`
      SELECT
        changed_at as timestamp,
        change_type,
        CASE
          WHEN source = 'sync' THEN 'success'
          WHEN source = 'sync_error' THEN 'error'
          ELSE 'unknown'
        END as status,
        new_value as message
      FROM asa_change_history
      WHERE entity_type = 'sync'
      ORDER BY changed_at DESC
      LIMIT 10
    `);

    // Check if sync is currently running (within last 5 minutes with 'started' status)
    const runningSyncResult = await db.query(`
      SELECT COUNT(*) as running
      FROM asa_change_history
      WHERE entity_type = 'sync'
        AND change_type = 'started'
        AND changed_at > NOW() - INTERVAL '5 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM asa_change_history h2
          WHERE h2.entity_type = 'sync'
            AND h2.change_type IN ('completed', 'error')
            AND h2.changed_at > asa_change_history.changed_at
        )
    `);

    const isSyncing = parseInt(runningSyncResult.rows[0]?.running || 0) > 0;
    const lastSync = lastSyncResult.rows[0];

    res.json({
      status: isSyncing ? 'syncing' : 'idle',
      lastSync: lastSync?.last_sync || null,
      lastDataDate: lastSync?.last_data_date || null,
      campaignsSynced: parseInt(lastSync?.campaigns_synced || 0),
      history: syncHistoryResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/sync
 * Trigger full data sync
 */
router.post('/sync', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Record sync start
    await recordChange('sync', 'manual', 'started', null, null, `Starting sync for ${days} days`, 'sync', null, req);

    const results = await appleAds.fullSync(parseInt(days));

    // Record sync completion
    await recordChange('sync', 'manual', 'completed', null, null, JSON.stringify({
      days: parseInt(days),
      campaigns: results?.campaigns || 0,
      keywords: results?.keywords || 0
    }), 'sync', null, req);

    res.json({
      success: true,
      days: parseInt(days),
      results
    });
  } catch (error) {
    // Record sync error
    await recordChange('sync', 'manual', 'error', null, null, error.message, 'sync_error', null, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/sync/incremental
 * Incremental sync (last day only)
 */
router.post('/sync/incremental', async (req, res) => {
  try {
    const results = await appleAds.fullSync(1);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
