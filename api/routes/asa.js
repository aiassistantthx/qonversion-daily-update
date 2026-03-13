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
const { predictRoas, findPaybackDays } = require('../lib/predictions');
const cache = require('../lib/cache');

// ================================================
// CONSTANTS
// ================================================

// Apple takes ~26% commission, developer gets 74% (proceeds)
// All revenue calculations should use proceeds, not gross sales
const PROCEEDS_RATE = 0.74;

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

/**
 * Invalidate cache on data changes
 */
function invalidateCache(entityType, entityId) {
  switch (entityType) {
    case 'campaign':
      cache.invalidate('campaigns:*');
      cache.invalidate(`campaign:${entityId}:*`);
      break;
    case 'adgroup':
      cache.invalidate('adgroups:*');
      cache.invalidate(`adgroup:${entityId}:*`);
      break;
    case 'keyword':
      cache.invalidate('keywords:*');
      cache.invalidate(`keyword:${entityId}:*`);
      break;
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
    const { status, limit = 100, offset = 0, sort = 'revenue', compare } = req.query;

    // Parse date range
    let { days = 7, from, to } = req.query;

    // Check cache
    const cacheKey = `campaigns:${days}:${from}:${to}:${status}:${sort}:${compare}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const metadata = cache.getMetadata(cacheKey);
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Age', metadata.age);
      res.set('X-Last-Updated', metadata.createdAt);
      return res.json(cached);
    }
    let dateFilter;
    let prevDateFilter;

    if (from && to) {
      dateFilter = { from, to };
      if (compare === 'true') {
        const currentFrom = new Date(from);
        const currentTo = new Date(to);
        const diffDays = Math.ceil((currentTo - currentFrom) / (1000 * 60 * 60 * 24));
        const prevTo = new Date(currentFrom);
        prevTo.setDate(prevTo.getDate() - 1);
        const prevFrom = new Date(prevTo);
        prevFrom.setDate(prevFrom.getDate() - diffDays);
        prevDateFilter = {
          from: prevFrom.toISOString().split('T')[0],
          to: prevTo.toISOString().split('T')[0]
        };
      }
    } else {
      days = parseInt(days) || 7;
      dateFilter = { days };
      if (compare === 'true') {
        prevDateFilter = { days, offset: days };
      }
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

    // Build previous period conditions if comparison enabled
    let prevDateCondition, prevRevenueCondition;
    if (compare === 'true' && prevDateFilter) {
      if (prevDateFilter.days) {
        prevDateCondition = `date >= CURRENT_DATE - INTERVAL '${prevDateFilter.days * 2} days' AND date < CURRENT_DATE - INTERVAL '${prevDateFilter.days} days'`;
        prevRevenueCondition = `install_date >= CURRENT_DATE - INTERVAL '${prevDateFilter.days * 2} days' AND install_date < CURRENT_DATE - INTERVAL '${prevDateFilter.days} days'`;
      } else {
        prevDateCondition = `date >= '${prevDateFilter.from}' AND date <= '${prevDateFilter.to}'`;
        prevRevenueCondition = `install_date >= '${prevDateFilter.from}' AND install_date <= '${prevDateFilter.to}'`;
      }
    }

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
        c.cohort_age,
        c.impression_share,
        COALESCE(r.revenue, 0) as revenue,
        COALESCE(r.paid_users, 0) as paid_users,
        CASE WHEN c.spend > 0 THEN COALESCE(r.revenue, 0) / c.spend ELSE 0 END as roas,
        CASE WHEN COALESCE(r.paid_users, 0) > 0 THEN c.spend / r.paid_users ELSE NULL END as cop,
        CASE WHEN c.impressions > 0 THEN c.taps::float / c.impressions ELSE 0 END as ttr,
        CASE WHEN c.taps > 0 THEN c.installs::float / c.taps ELSE 0 END as cvr,
        CASE WHEN c.taps > 0 THEN c.spend / c.taps ELSE NULL END as cpt,
        CASE WHEN c.impressions > 0 THEN (c.spend / c.impressions) * 1000 ELSE NULL END as cpm
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
          NULL as impression_share, -- TODO: Enable after running migration
          CASE WHEN SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) > 0
               THEN SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) /
                    SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END)
               ELSE NULL
          END as cpa,
          MAX(date) as last_data_date,
          ROUND(AVG(CURRENT_DATE - date)) as cohort_age
        FROM apple_ads_campaigns
        WHERE ${dateCondition}
        GROUP BY campaign_id
      ) c
      LEFT JOIN (
        SELECT
          campaign_id,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users
        FROM events_v2
        WHERE ${revenueCondition}
          AND campaign_id IS NOT NULL
        GROUP BY campaign_id
      ) r ON c.campaign_id = r.campaign_id
    `);

    // Use string keys to ensure type matching
    const performanceMap = new Map(performanceQuery.rows.map(p => [String(p.campaign_id), p]));

    // Get 7-day trend data for sparklines
    const trendQuery = await db.query(`
      SELECT
        campaign_id,
        date,
        spend
      FROM apple_ads_campaigns
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
        AND date < CURRENT_DATE
      ORDER BY campaign_id, date
    `);

    const trendMap = new Map();
    trendQuery.rows.forEach(row => {
      const key = String(row.campaign_id);
      if (!trendMap.has(key)) {
        trendMap.set(key, []);
      }
      trendMap.get(key).push({
        date: row.date,
        value: parseFloat(row.spend) || 0
      });
    });

    // Get budget alerts for today
    const alertsQuery = await db.query(`
      SELECT campaign_id, alert_level, message
      FROM asa_budget_alerts
      WHERE DATE(created_at) = CURRENT_DATE
        AND acknowledged = FALSE
    `);
    const alertsMap = new Map(alertsQuery.rows.map(a => [String(a.campaign_id), a]));

    // Get cohort ROAS (D7, D30) for each campaign
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
          SUM(CASE WHEN event_date - install_date <= INTERVAL '30 days' AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue_d30
        FROM events_v2
        WHERE ${revenueCondition}
          AND campaign_id IS NOT NULL
        GROUP BY campaign_id
      )
      SELECT
        s.campaign_id,
        CASE WHEN s.total_spend > 0 THEN COALESCE(r.revenue_d7, 0) / s.total_spend ELSE 0 END as roas_d7,
        CASE WHEN s.total_spend > 0 THEN COALESCE(r.revenue_d30, 0) / s.total_spend ELSE 0 END as roas_d30
      FROM spend_by_campaign s
      LEFT JOIN cohort_revenue r ON s.campaign_id = r.campaign_id
    `);
    const cohortRoasMap = new Map(cohortRoasQuery.rows.map(c => [String(c.campaign_id), c]));

    // Enrich campaigns with performance data and budget alerts
    const enriched = filtered.map(campaign => {
      const perf = performanceMap.get(String(campaign.id));
      const alert = alertsMap.get(String(campaign.id));
      const cohortRoas = cohortRoasMap.get(String(campaign.id));

      // Calculate budget usage percentage
      let budgetUsedPct = null;
      if (perf && perf.daily_budget > 0) {
        budgetUsedPct = Math.round((parseFloat(perf.spend) / parseFloat(perf.daily_budget)) * 100);
      }

      // Calculate predicted ROAS
      let predictedRoas365 = null;
      if (perf) {
        const currentRoas = parseFloat(perf.roas) || 0;
        const cohortAge = parseInt(perf.cohort_age) || 0;
        if (currentRoas > 0 && cohortAge > 0) {
          const predictions = predictRoas(currentRoas, cohortAge);
          predictedRoas365 = predictions.predicted_roas_365;
        }
      }

      const trend7d = trendMap.get(String(campaign.id)) || [];

      return {
        ...campaign,
        performance: perf ? {
          ...perf,
          predicted_roas_365: predictedRoas365,
          trend_7d: trend7d,
          roas_d7: cohortRoas ? parseFloat(cohortRoas.roas_d7) || 0 : 0,
          roas_d30: cohortRoas ? parseFloat(cohortRoas.roas_d30) || 0 : 0
        } : null,
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
        ${compare === 'true' && prevDateCondition ? `,
        SUM(CASE WHEN ${prevDateCondition} THEN spend ELSE 0 END) as prev_spend,
        SUM(CASE WHEN ${prevDateCondition} THEN impressions ELSE 0 END) as prev_impressions,
        SUM(CASE WHEN ${prevDateCondition} THEN taps ELSE 0 END) as prev_taps,
        SUM(CASE WHEN ${prevDateCondition} THEN installs ELSE 0 END) as prev_installs` : ''}
      FROM apple_ads_campaigns
    `);

    const revenueQuery = await db.query(`
      SELECT
        SUM(CASE WHEN ${revenueCondition} AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as total_revenue,
        COUNT(DISTINCT CASE WHEN ${revenueCondition} AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as total_paid_users
        ${compare === 'true' && prevRevenueCondition ? `,
        SUM(CASE WHEN ${prevRevenueCondition} AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as prev_revenue,
        COUNT(DISTINCT CASE WHEN ${prevRevenueCondition} AND event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as prev_paid_users` : ''}
      FROM events_v2
      WHERE campaign_id IS NOT NULL
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

    let prevTotals;
    if (compare === 'true') {
      prevTotals = {
        spend: parseFloat(totalsQuery.rows[0]?.prev_spend) || 0,
        impressions: parseInt(totalsQuery.rows[0]?.prev_impressions) || 0,
        taps: parseInt(totalsQuery.rows[0]?.prev_taps) || 0,
        installs: parseInt(totalsQuery.rows[0]?.prev_installs) || 0,
        revenue: parseFloat(revenueQuery.rows[0]?.prev_revenue) || 0,
        paidUsers: parseInt(revenueQuery.rows[0]?.prev_paid_users) || 0,
      };
      prevTotals.roas = prevTotals.spend > 0 ? prevTotals.revenue / prevTotals.spend : 0;
      prevTotals.cpa = prevTotals.installs > 0 ? prevTotals.spend / prevTotals.installs : 0;
      prevTotals.cop = prevTotals.paidUsers > 0 ? prevTotals.spend / prevTotals.paidUsers : 0;
    }

    const responseData = {
      total: enriched.length,
      dateRange: dateFilter,
      prevDateRange: prevDateFilter,
      totals,
      prevTotals,
      data: enriched.slice(offset, offset + parseInt(limit))
    };

    // Cache for 10 minutes (600 seconds)
    cache.set(cacheKey, responseData, 600);

    res.set('X-Cache', 'MISS');
    res.set('X-Last-Updated', new Date().toISOString());
    res.json(responseData);
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

    // Check cache
    const cacheKey = `campaign:${id}:details`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const metadata = cache.getMetadata(cacheKey);
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Age', metadata.age);
      res.set('X-Last-Updated', metadata.createdAt);
      return res.json(cached);
    }

    const campaign = await appleAds.getCampaign(id);

    // Get ad groups
    const adGroups = await appleAds.getAdGroups(id);

    // Get performance data
    const performance = await db.query(`
      SELECT * FROM v_campaign_performance WHERE campaign_id = $1
    `, [id]);

    const responseData = {
      ...campaign,
      adGroups,
      performance: performance.rows[0] || null
    };

    // Cache for 10 minutes
    cache.set(cacheKey, responseData, 600);

    res.set('X-Cache', 'MISS');
    res.set('X-Last-Updated', new Date().toISOString());
    res.json(responseData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/campaigns
 * Create a new campaign with ad group and keywords
 */
router.post('/campaigns', async (req, res) => {
  try {
    const {
      name,
      adamId,
      countriesOrRegions,
      supplySources,
      adGroupName,
      defaultBid,
      keywords,
      negativeKeywords,
      dailyBudget,
      totalBudget,
      startDate,
      endDate,
      status
    } = req.body;

    // Validate required fields
    if (!name || !adamId || !countriesOrRegions || !adGroupName || !dailyBudget) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create campaign
    const campaignPayload = {
      name,
      adamId: parseInt(adamId),
      countriesOrRegions,
      budgetAmount: {
        amount: String(dailyBudget),
        currency: 'USD'
      },
      dailyBudgetAmount: {
        amount: String(dailyBudget),
        currency: 'USD'
      },
      status: status || 'PAUSED'
    };

    if (supplySources && supplySources.length > 0) {
      campaignPayload.supplySources = supplySources;
    }

    if (startDate) {
      campaignPayload.startTime = startDate;
    }

    if (endDate) {
      campaignPayload.endTime = endDate;
    }

    if (totalBudget) {
      campaignPayload.budgetAmount = {
        amount: String(totalBudget),
        currency: 'USD'
      };
    }

    const campaign = await appleAds.createCampaign(campaignPayload);

    // Create ad group
    const adGroupPayload = {
      name: adGroupName,
      defaultBidAmount: {
        amount: String(defaultBid || '1.00'),
        currency: 'USD'
      },
      status: status || 'PAUSED'
    };

    const adGroupResponse = await appleAds.request(
      `/campaigns/${campaign.id}/adgroups`,
      'POST',
      adGroupPayload
    );
    const adGroup = adGroupResponse.data;

    // Create keywords if provided
    if (keywords && keywords.length > 0) {
      await appleAds.createKeywords(campaign.id, adGroup.id, keywords);
    }

    // Create negative keywords if provided
    if (negativeKeywords && negativeKeywords.length > 0) {
      const negativeKeywordsPayload = negativeKeywords.map(text => ({
        text,
        matchType: 'EXACT'
      }));
      await appleAds.createNegativeKeywords(campaign.id, negativeKeywordsPayload);
    }

    // Record change
    await recordChange(
      'campaign',
      campaign.id,
      'create',
      'campaign',
      null,
      JSON.stringify({ name, status: campaignPayload.status }),
      'api',
      null,
      req
    );

    res.json({
      success: true,
      data: {
        campaign,
        adGroup,
        keywordsCreated: keywords?.length || 0,
        negativeKeywordsCreated: negativeKeywords?.length || 0
      }
    });
  } catch (error) {
    console.error('Failed to create campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/campaigns/bulk
 * Create multiple campaigns at once
 */
router.post('/campaigns/bulk', async (req, res) => {
  try {
    const { campaigns } = req.body;

    if (!campaigns || !Array.isArray(campaigns) || campaigns.length === 0) {
      return res.status(400).json({ error: 'campaigns array is required' });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < campaigns.length; i++) {
      const campaignData = campaigns[i];
      try {
        const {
          name,
          adamId,
          countriesOrRegions,
          supplySources,
          adGroupName,
          defaultBid,
          keywords,
          negativeKeywords,
          dailyBudget,
          totalBudget,
          startDate,
          endDate,
          status
        } = campaignData;

        // Validate required fields
        if (!name || !adamId || !countriesOrRegions || !adGroupName || !dailyBudget) {
          errors.push({ index: i, name, error: 'Missing required fields' });
          continue;
        }

        // Create campaign
        const campaignPayload = {
          name,
          adamId: parseInt(adamId),
          countriesOrRegions,
          budgetAmount: {
            amount: String(dailyBudget),
            currency: 'USD'
          },
          dailyBudgetAmount: {
            amount: String(dailyBudget),
            currency: 'USD'
          },
          status: status || 'PAUSED'
        };

        if (supplySources && supplySources.length > 0) {
          campaignPayload.supplySources = supplySources;
        }

        if (startDate) {
          campaignPayload.startTime = startDate;
        }

        if (endDate) {
          campaignPayload.endTime = endDate;
        }

        if (totalBudget) {
          campaignPayload.budgetAmount = {
            amount: String(totalBudget),
            currency: 'USD'
          };
        }

        const campaign = await appleAds.createCampaign(campaignPayload);

        // Create ad group
        const adGroupPayload = {
          name: adGroupName,
          defaultBidAmount: {
            amount: String(defaultBid || '1.00'),
            currency: 'USD'
          },
          status: status || 'PAUSED'
        };

        const adGroupResponse = await appleAds.request(
          `/campaigns/${campaign.id}/adgroups`,
          'POST',
          adGroupPayload
        );
        const adGroup = adGroupResponse.data;

        // Create keywords if provided
        if (keywords && keywords.length > 0) {
          await appleAds.createKeywords(campaign.id, adGroup.id, keywords);
        }

        // Create negative keywords if provided
        if (negativeKeywords && negativeKeywords.length > 0) {
          const negativeKeywordsPayload = negativeKeywords.map(text => ({
            text,
            matchType: 'EXACT'
          }));
          await appleAds.createNegativeKeywords(campaign.id, negativeKeywordsPayload);
        }

        // Record change
        await recordChange(
          'campaign',
          campaign.id,
          'create',
          'campaign',
          null,
          JSON.stringify({ name, status: campaignPayload.status }),
          'api',
          null,
          req
        );

        results.push({
          success: true,
          index: i,
          name,
          campaign,
          adGroup,
          keywordsCreated: keywords?.length || 0,
          negativeKeywordsCreated: negativeKeywords?.length || 0
        });
      } catch (error) {
        console.error(`Failed to create campaign ${i}:`, error);
        errors.push({ index: i, name: campaignData.name, error: error.message });
      }
    }

    res.json({
      success: true,
      total: campaigns.length,
      created: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    console.error('Bulk campaign creation failed:', error);
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

    // Invalidate cache
    invalidateCache('campaign', id);

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

    // Invalidate cache
    invalidateCache('campaign', id);

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/campaigns/:id/copy
 * Copy existing campaign with optional modifications
 */
router.post('/campaigns/:id/copy', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      copyAdGroups = true,
      copyKeywords = true,
      copyBids = true,
      countriesOrRegions
    } = req.body;

    // Get original campaign
    const originalCampaign = await appleAds.getCampaign(id);

    if (!originalCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Create new campaign with copied settings
    const campaignPayload = {
      name: name || `${originalCampaign.name} (Copy)`,
      adamId: originalCampaign.adamId,
      countriesOrRegions: countriesOrRegions || originalCampaign.countriesOrRegions,
      supplySources: originalCampaign.supplySources,
      budgetAmount: originalCampaign.budgetAmount,
      dailyBudgetAmount: originalCampaign.dailyBudgetAmount,
      status: 'PAUSED'
    };

    const newCampaign = await appleAds.createCampaign(campaignPayload);

    let copiedAdGroups = [];
    let copiedKeywords = 0;

    // Copy ad groups if requested
    if (copyAdGroups) {
      const originalAdGroups = await appleAds.getAdGroups(id);

      for (const adGroup of originalAdGroups) {
        // Create ad group copy
        const adGroupPayload = {
          name: adGroup.name,
          defaultBidAmount: adGroup.defaultBidAmount,
          status: 'PAUSED'
        };

        const newAdGroupResponse = await appleAds.request(
          `/campaigns/${newCampaign.id}/adgroups`,
          'POST',
          adGroupPayload
        );
        const newAdGroup = newAdGroupResponse.data;
        copiedAdGroups.push(newAdGroup);

        // Copy keywords if requested
        if (copyKeywords) {
          const keywordsResponse = await appleAds.request(
            `/campaigns/${id}/adgroups/${adGroup.id}/keywords`,
            'GET'
          );
          const keywords = keywordsResponse.data;

          if (keywords && keywords.length > 0) {
            const keywordsToCreate = keywords.map(kw => ({
              text: kw.text,
              matchType: kw.matchType,
              bidAmount: copyBids ? kw.bidAmount : adGroup.defaultBidAmount,
              status: 'PAUSED'
            }));

            await appleAds.createKeywords(newCampaign.id, newAdGroup.id, keywordsToCreate);
            copiedKeywords += keywordsToCreate.length;
          }
        }
      }
    }

    // Record change
    await recordChange(
      'campaign',
      newCampaign.id,
      'create',
      'campaign',
      null,
      JSON.stringify({
        name: newCampaign.name,
        copiedFrom: id,
        copiedAdGroups: copiedAdGroups.length,
        copiedKeywords
      }),
      'api',
      null,
      req
    );

    res.json({
      success: true,
      data: {
        campaign: newCampaign,
        adGroupsCopied: copiedAdGroups.length,
        keywordsCopied: copiedKeywords
      }
    });
  } catch (error) {
    console.error('Failed to copy campaign:', error);
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
          NULL as impression_share -- TODO: Enable after running migration
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

    // Get cohort ROAS (D7, D30) for each adgroup
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

    // Enrich ad groups with performance
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

    // Parse date range
    let { days = 7, from, to } = req.query;
    let dateFilter;
    if (from && to) {
      dateFilter = { from, to };
    } else {
      days = parseInt(days) || 7;
      dateFilter = { days };
    }

    // Check cache
    const cacheKey = `keywords:${campaign_id}:${adgroup_id}:${status}:${days}:${from}:${to}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const metadata = cache.getMetadata(cacheKey);
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Age', metadata.age);
      res.set('X-Last-Updated', metadata.createdAt);
      return res.json(cached);
    }

    // Build date conditions (without table alias - will be used in different contexts)
    const dateCondition = dateFilter.days
      ? `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `date >= '${dateFilter.from}' AND date <= '${dateFilter.to}'`;

    // Use install_date for LTV-based revenue (lifetime value of users acquired in period)
    const revenueCondition = dateFilter.days
      ? `install_date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `install_date >= '${dateFilter.from}' AND install_date <= '${dateFilter.to}'`;

    // Build campaign filter condition
    const params = [];
    let campaignFilter = '';
    if (campaign_id) {
      campaignFilter = `campaign_id = $${params.length + 1}`;
      params.push(campaign_id);
    }

    // Get keywords with dynamic performance data
    let baseQuery = `
      WITH keyword_perf AS (
        SELECT
          keyword_id,
          SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) as spend,
          SUM(CASE WHEN ${dateCondition} THEN impressions ELSE 0 END) as impressions,
          SUM(CASE WHEN ${dateCondition} THEN taps ELSE 0 END) as taps,
          SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) as installs,
          NULL as impression_share -- TODO: Enable after running migration
        FROM apple_ads_keywords
        ${campaignFilter ? `WHERE ${campaignFilter}` : ''}
        GROUP BY keyword_id
      ),
      total_impressions AS (
        SELECT
          SUM(CASE WHEN ${dateCondition} THEN impressions ELSE 0 END) as total_impr
        FROM apple_ads_keywords
        ${campaignFilter ? `WHERE ${campaignFilter}` : ''}
      ),
      keyword_revenue AS (
        SELECT
          keyword_id,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users,
          SUM(CASE WHEN event_date - install_date <= INTERVAL '7 days' AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue_d7,
          SUM(CASE WHEN event_date - install_date <= INTERVAL '30 days' AND refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue_d30
        FROM events_v2
        WHERE ${revenueCondition}
          AND keyword_id IS NOT NULL
          ${campaignFilter ? `AND ${campaignFilter}` : ''}
        GROUP BY keyword_id
      ),
      keyword_base AS (
        SELECT DISTINCT ON (keyword_id)
          keyword_id, campaign_id, adgroup_id, keyword_text, match_type, bid_amount, keyword_status
        FROM apple_ads_keywords
        ${campaignFilter ? `WHERE ${campaignFilter}` : ''}
        ORDER BY keyword_id, date DESC
      )
      SELECT
        k.keyword_id,
        k.campaign_id,
        k.adgroup_id,
        k.keyword_status as status,
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
        CASE WHEN COALESCE(p.spend, 0) > 0 THEN COALESCE(r.revenue_d7, 0) / p.spend ELSE 0 END as roas_d7,
        CASE WHEN COALESCE(p.spend, 0) > 0 THEN COALESCE(r.revenue_d30, 0) / p.spend ELSE 0 END as roas_d30,
        CASE WHEN COALESCE(r.paid_users, 0) > 0 THEN COALESCE(p.spend, 0) / r.paid_users ELSE NULL END as cop_7d,
        CASE WHEN COALESCE(p.impressions, 0) > 0 THEN COALESCE(p.taps, 0)::float / p.impressions ELSE 0 END as ttr_7d,
        CASE WHEN COALESCE(p.taps, 0) > 0 THEN COALESCE(p.installs, 0)::float / p.taps ELSE 0 END as cvr_7d,
        CASE WHEN COALESCE(p.taps, 0) > 0 THEN COALESCE(p.spend, 0) / p.taps ELSE NULL END as cpt_7d,
        CASE WHEN COALESCE(p.impressions, 0) > 0 THEN (COALESCE(p.spend, 0) / p.impressions) * 1000 ELSE NULL END as cpm_7d,
        CASE WHEN ti.total_impr > 0 THEN (COALESCE(p.impressions, 0)::float / ti.total_impr) * 100 ELSE 0 END as sov,
        p.impression_share as soi
      FROM keyword_base k
      LEFT JOIN keyword_perf p ON k.keyword_id = p.keyword_id
      LEFT JOIN keyword_revenue r ON k.keyword_id::TEXT = r.keyword_id::TEXT
      CROSS JOIN total_impressions ti
      WHERE 1=1
    `;

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
        ${campaignFilter ? `WHERE ${campaignFilter}` : ''}
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

    const responseData = {
      total: totalCount,
      dateRange: dateFilter,
      data: result.rows
    };

    // Cache for 10 minutes
    cache.set(cacheKey, responseData, 600);

    res.set('X-Cache', 'MISS');
    res.set('X-Last-Updated', new Date().toISOString());
    res.json(responseData);
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
    const { campaignId, adGroupId, bidAmount, previousBid, currency = 'USD' } = req.body;

    if (!campaignId || !adGroupId || !bidAmount) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and bidAmount required' });
    }

    // Update bid directly (Apple API doesn't support GET for single keyword)
    const result = await appleAds.updateKeywordBid(campaignId, adGroupId, keywordId, bidAmount, currency);

    // Record change
    await recordChange('keyword', keywordId, 'bid_update', 'bidAmount', previousBid || null, String(bidAmount), 'api', null, req);

    // Invalidate cache
    invalidateCache('keyword', keywordId);

    res.json({
      success: true,
      previousBid: previousBid || null,
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
// NEGATIVE KEYWORDS
// ================================================

/**
 * GET /asa/negative-keywords
 * Get negative keywords for campaign or ad group
 */
router.get('/negative-keywords', async (req, res) => {
  try {
    const { campaign_id, adgroup_id } = req.query;

    if (!campaign_id) {
      return res.status(400).json({ error: 'campaign_id required' });
    }

    let keywords;
    if (adgroup_id) {
      keywords = await appleAds.getAdGroupNegativeKeywords(campaign_id, adgroup_id);
    } else {
      keywords = await appleAds.getNegativeKeywords(campaign_id);
    }

    res.json({
      total: keywords.length,
      data: keywords
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/negative-keywords
 * Create negative keywords for campaign or ad group
 */
router.post('/negative-keywords', async (req, res) => {
  try {
    const { campaignId, adGroupId, keywords } = req.body;

    if (!campaignId || !keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'campaignId and keywords array required' });
    }

    const keywordsPayload = keywords.map(kw => ({
      text: typeof kw === 'string' ? kw : kw.text,
      matchType: typeof kw === 'string' ? 'EXACT' : (kw.matchType || 'EXACT')
    }));

    let result;
    if (adGroupId) {
      result = await appleAds.createAdGroupNegativeKeywords(campaignId, adGroupId, keywordsPayload);
    } else {
      result = await appleAds.createNegativeKeywords(campaignId, keywordsPayload);
    }

    await recordChange(
      adGroupId ? 'adgroup' : 'campaign',
      adGroupId || campaignId,
      'create',
      'negative_keywords',
      null,
      JSON.stringify(keywordsPayload),
      'api',
      null,
      req
    );

    res.json({
      success: true,
      created: keywordsPayload.length,
      data: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /asa/negative-keywords/:keywordId
 * Delete a negative keyword
 */
router.delete('/negative-keywords/:keywordId', async (req, res) => {
  try {
    const { keywordId } = req.params;
    const { campaignId, adGroupId } = req.body;

    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    if (adGroupId) {
      await appleAds.deleteAdGroupNegativeKeyword(campaignId, adGroupId, keywordId);
    } else {
      await appleAds.deleteNegativeKeyword(campaignId, keywordId);
    }

    await recordChange(
      adGroupId ? 'adgroup' : 'campaign',
      adGroupId || campaignId,
      'delete',
      'negative_keyword',
      keywordId,
      null,
      'api',
      null,
      req
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// AUTOMATION RULES
// ================================================

/**
 * GET /asa/rule-templates
 * Get predefined rule templates
 */
router.get('/rule-templates', async (req, res) => {
  try {
    const templates = require('../data/rule-templates.json');
    res.json({
      total: templates.length,
      data: templates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
 * POST /asa/rules/:id/simulate
 * Simulate rule execution with detailed what-if analysis
 */
router.post('/rules/:id/simulate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await rulesEngine.simulateRule(parseInt(id));

    res.json({
      success: true,
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

/**
 * GET /asa/rule-executions
 * Get all rule executions with filters and stats
 */
router.get('/rule-executions', async (req, res) => {
  try {
    const { status, ruleId, entityType, dateFrom, dateTo, actionType, limit = 100 } = req.query;

    let query = `
      SELECT
        e.*,
        r.name as rule_name
      FROM asa_rule_executions e
      LEFT JOIN asa_automation_rules r ON e.rule_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND e.status = $${params.length}`;
    }

    if (ruleId) {
      params.push(parseInt(ruleId));
      query += ` AND e.rule_id = $${params.length}`;
    }

    if (entityType) {
      params.push(entityType);
      query += ` AND e.entity_type = $${params.length}`;
    }

    if (actionType) {
      params.push(actionType);
      query += ` AND e.action_type = $${params.length}`;
    }

    if (dateFrom) {
      params.push(dateFrom);
      query += ` AND DATE(e.executed_at) >= $${params.length}`;
    }

    if (dateTo) {
      params.push(dateTo);
      query += ` AND DATE(e.executed_at) <= $${params.length}`;
    }

    query += ` ORDER BY e.executed_at DESC LIMIT ${parseInt(limit)}`;

    const executions = await db.query(query, params);

    // Get today's stats
    const statsQuery = await db.query(`
      SELECT
        COUNT(*) as today_total,
        COUNT(*) FILTER (WHERE status = 'executed') as today_executed,
        COUNT(*) FILTER (WHERE status = 'failed') as today_failed
      FROM asa_rule_executions
      WHERE DATE(executed_at) = CURRENT_DATE
    `);

    const weekStatsQuery = await db.query(`
      SELECT COUNT(*) as week_total
      FROM asa_rule_executions
      WHERE executed_at >= CURRENT_DATE - INTERVAL '7 days'
    `);

    // Get rules that ran today
    const todayRulesQuery = await db.query(`
      SELECT
        e.rule_id,
        r.name as rule_name,
        COUNT(*) as execution_count,
        MAX(e.executed_at) as last_executed_at
      FROM asa_rule_executions e
      LEFT JOIN asa_automation_rules r ON e.rule_id = r.id
      WHERE DATE(e.executed_at) = CURRENT_DATE
        AND e.status = 'executed'
      GROUP BY e.rule_id, r.name
      ORDER BY execution_count DESC
    `);

    res.json({
      success: true,
      data: executions.rows,
      stats: {
        todayTotal: parseInt(statsQuery.rows[0].today_total),
        todayExecuted: parseInt(statsQuery.rows[0].today_executed),
        todayFailed: parseInt(statsQuery.rows[0].today_failed),
        weekTotal: parseInt(weekStatsQuery.rows[0].week_total),
      },
      todayRules: todayRulesQuery.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/rule-executions/:id/undo
 * Undo a rule execution by reverting the change
 */
router.post('/rule-executions/:id/undo', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the execution record
    const executionResult = await db.query(
      'SELECT * FROM asa_rule_executions WHERE id = $1',
      [id]
    );

    if (executionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const execution = executionResult.rows[0];

    // Check if execution can be undone
    if (execution.status !== 'executed') {
      return res.status(400).json({ error: 'Only executed actions can be undone' });
    }

    const executedAt = new Date(execution.executed_at);
    const now = new Date();
    const hoursSince = (now - executedAt) / (1000 * 60 * 60);

    if (hoursSince > 24) {
      return res.status(400).json({ error: 'Cannot undo executions older than 24 hours' });
    }

    // Parse previous and new values
    const previousValue = execution.previous_value
      ? (typeof execution.previous_value === 'string' ? JSON.parse(execution.previous_value) : execution.previous_value)
      : null;

    if (!previousValue) {
      return res.status(400).json({ error: 'No previous value to restore' });
    }

    // Undo the action based on type
    switch (execution.action_type) {
      case 'adjust_bid':
      case 'set_bid':
        const previousBid = parseFloat(previousValue);
        await appleAds.updateKeywordBid(
          execution.campaign_id,
          execution.adgroup_id,
          execution.keyword_id,
          previousBid
        );

        // Log the undo action
        await db.query(`
          INSERT INTO asa_change_history (
            entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
            change_type, field_name, old_value, new_value, source
          ) VALUES ('keyword', $1, $2, $3, $1, 'bid_update', 'bidAmount', $4, $5, 'undo')
        `, [execution.keyword_id, execution.campaign_id, execution.adgroup_id,
            execution.new_value, String(previousBid)]);
        break;

      case 'pause':
        if (execution.entity_type === 'keyword') {
          await appleAds.updateKeywordStatus(
            execution.campaign_id,
            execution.adgroup_id,
            execution.keyword_id,
            'ACTIVE'
          );
        } else if (execution.entity_type === 'adgroup') {
          await appleAds.updateAdGroupStatus(
            execution.campaign_id,
            execution.adgroup_id,
            'ENABLED'
          );
        } else if (execution.entity_type === 'campaign') {
          await appleAds.updateCampaignStatus(execution.campaign_id, 'ENABLED');
        }

        await db.query(`
          INSERT INTO asa_change_history (
            entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
            change_type, field_name, old_value, new_value, source
          ) VALUES ($1, $2, $3, $4, $5, 'status_update', 'status', 'PAUSED', 'ACTIVE', 'undo')
        `, [
          execution.entity_type,
          execution.entity_id,
          execution.campaign_id,
          execution.adgroup_id,
          execution.keyword_id
        ]);
        break;

      case 'enable':
        if (execution.entity_type === 'keyword') {
          await appleAds.updateKeywordStatus(
            execution.campaign_id,
            execution.adgroup_id,
            execution.keyword_id,
            'PAUSED'
          );
        } else if (execution.entity_type === 'adgroup') {
          await appleAds.updateAdGroupStatus(
            execution.campaign_id,
            execution.adgroup_id,
            'PAUSED'
          );
        } else if (execution.entity_type === 'campaign') {
          await appleAds.updateCampaignStatus(execution.campaign_id, 'PAUSED');
        }

        await db.query(`
          INSERT INTO asa_change_history (
            entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
            change_type, field_name, old_value, new_value, source
          ) VALUES ($1, $2, $3, $4, $5, 'status_update', 'status', 'ENABLED', 'PAUSED', 'undo')
        `, [
          execution.entity_type,
          execution.entity_id,
          execution.campaign_id,
          execution.adgroup_id,
          execution.keyword_id
        ]);
        break;

      default:
        return res.status(400).json({ error: `Cannot undo action type: ${execution.action_type}` });
    }

    // Mark the execution as undone
    await db.query(
      'UPDATE asa_rule_executions SET status = $1 WHERE id = $2',
      ['undone', id]
    );

    res.json({
      success: true,
      message: 'Successfully undone rule execution',
      executionId: id,
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

/**
 * POST /asa/sync/changes
 * Sync changes made directly in Apple Ads (detects bid/status changes)
 */
router.post('/sync/changes', async (req, res) => {
  try {
    // Record sync start
    await recordChange('sync', 'changes', 'started', null, null, 'Starting change detection sync', 'sync', null, req);

    const changes = await appleAds.syncChanges();

    // Record sync completion
    await recordChange('sync', 'changes', 'completed', null, null, JSON.stringify({
      campaigns: changes.campaigns,
      adgroups: changes.adgroups,
      keywords: changes.keywords,
      total: changes.campaigns + changes.adgroups + changes.keywords
    }), 'sync', null, req);

    res.json({
      success: true,
      changes
    });
  } catch (error) {
    // Record sync error
    await recordChange('sync', 'changes', 'error', null, null, error.message, 'sync', null, req);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// COUNTRIES
// ================================================

/**
 * GET /asa/countries
 * Get metrics breakdown by country
 *
 * Query params:
 * - days: number of days (default 7)
 * - from: start date (YYYY-MM-DD)
 * - to: end date (YYYY-MM-DD)
 */
router.get('/countries', async (req, res) => {
  try {
    let { days = 7, from, to } = req.query;
    let dateFilter;

    if (from && to) {
      dateFilter = { from, to };
    } else {
      days = parseInt(days) || 7;
      dateFilter = { days };
    }

    const dateCondition = dateFilter.days
      ? `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `date >= '${dateFilter.from}' AND date <= '${dateFilter.to}'`;

    const revenueCondition = dateFilter.days
      ? `install_date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `install_date >= '${dateFilter.from}' AND install_date <= '${dateFilter.to}'`;

    const query = `
      WITH campaign_totals AS (
        SELECT
          SUM(spend) as total_spend,
          SUM(installs) as total_installs
        FROM apple_ads_campaigns
        WHERE ${dateCondition}
      ),
      country_users AS (
        SELECT
          country,
          COUNT(DISTINCT q_user_id) as installs,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue,
          COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users
        FROM events_v2
        WHERE ${revenueCondition}
          AND country IS NOT NULL
          AND campaign_id IS NOT NULL
        GROUP BY country
      )
      SELECT
        cu.country,
        CASE
          WHEN ct.total_installs > 0 THEN (cu.installs::DECIMAL / ct.total_installs) * ct.total_spend
          ELSE 0
        END as spend,
        cu.installs,
        cu.revenue,
        cu.paid_users,
        CASE
          WHEN ct.total_installs > 0 AND (cu.installs::DECIMAL / ct.total_installs) * ct.total_spend > 0
          THEN cu.revenue / ((cu.installs::DECIMAL / ct.total_installs) * ct.total_spend)
          ELSE 0
        END as roas,
        CASE
          WHEN cu.installs > 0 AND ct.total_installs > 0
          THEN ((cu.installs::DECIMAL / ct.total_installs) * ct.total_spend) / cu.installs
          ELSE NULL
        END as cpa,
        CASE
          WHEN cu.paid_users > 0 AND ct.total_installs > 0
          THEN ((cu.installs::DECIMAL / ct.total_installs) * ct.total_spend) / cu.paid_users
          ELSE NULL
        END as cop
      FROM country_users cu
      CROSS JOIN campaign_totals ct
      WHERE cu.country IS NOT NULL
      ORDER BY spend DESC
    `;

    const result = await db.query(query);

    const totals = result.rows.reduce((acc, row) => ({
      spend: acc.spend + parseFloat(row.spend || 0),
      revenue: acc.revenue + parseFloat(row.revenue || 0),
      installs: acc.installs + parseInt(row.installs || 0),
      paid_users: acc.paid_users + parseInt(row.paid_users || 0),
    }), { spend: 0, revenue: 0, installs: 0, paid_users: 0 });

    totals.roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;
    totals.cpa = totals.installs > 0 ? totals.spend / totals.installs : null;
    totals.cop = totals.paid_users > 0 ? totals.spend / totals.paid_users : null;

    res.json({
      dateRange: dateFilter,
      total: result.rows.length,
      totals,
      data: result.rows.map(row => ({
        country: row.country,
        spend: parseFloat(row.spend || 0),
        revenue: parseFloat(row.revenue || 0),
        roas: parseFloat(row.roas || 0),
        cpa: row.cpa ? parseFloat(row.cpa) : null,
        installs: parseInt(row.installs || 0),
        paidUsers: parseInt(row.paid_users || 0),
        cop: row.cop ? parseFloat(row.cop) : null,
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// TRENDS / ANALYTICS
// ================================================

/**
 * GET /asa/trends
 * Get daily trends for Spend, Revenue, ROAS, and Conversion Funnel
 *
 * Query params:
 * - from: start date (YYYY-MM-DD) (required)
 * - to: end date (YYYY-MM-DD) (required)
 */
router.get('/trends', async (req, res) => {
  try {
    let { from, to, days, compare } = req.query;

    if (!from && !to && !days) {
      return res.status(400).json({ error: 'Either days or (from and to) dates are required' });
    }

    if (days) {
      days = parseInt(days) || 7;
      const toDate = new Date();
      toDate.setDate(toDate.getDate() - 1);
      to = toDate.toISOString().split('T')[0];
      const fromDate = new Date(toDate);
      fromDate.setDate(fromDate.getDate() - days + 1);
      from = fromDate.toISOString().split('T')[0];
    } else if (!from || !to) {
      return res.status(400).json({ error: 'Both from and to dates are required (YYYY-MM-DD)' });
    }

    let prevFrom, prevTo;
    if (compare === 'true') {
      const currentFrom = new Date(from);
      const currentTo = new Date(to);
      const diffDays = Math.ceil((currentTo - currentFrom) / (1000 * 60 * 60 * 24));
      prevTo = new Date(currentFrom);
      prevTo.setDate(prevTo.getDate() - 1);
      prevFrom = new Date(prevTo);
      prevFrom.setDate(prevFrom.getDate() - diffDays);
    }

    const query = `
      WITH daily_spend AS (
        SELECT
          date,
          SUM(spend) as spend
        FROM apple_ads_campaigns
        WHERE date >= $1 AND date <= $2
        GROUP BY date
      ),
      daily_revenue AS (
        SELECT
          DATE(install_date) as date,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as revenue
        FROM events_v2
        WHERE install_date >= $1 AND install_date <= $2
          AND campaign_id IS NOT NULL
        GROUP BY DATE(install_date)
      ),
      daily_total_revenue AS (
        SELECT
          DATE(event_date) as date,
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as total_revenue
        FROM events_v2
        WHERE event_date >= $1 AND event_date <= $2
          AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
        GROUP BY DATE(event_date)
      ),
      daily_installs AS (
        SELECT
          date,
          SUM(installs) as installs
        FROM apple_ads_campaigns
        WHERE date >= $1 AND date <= $2
          AND campaign_id IS NOT NULL
        GROUP BY date
      ),
      daily_trials AS (
        SELECT
          DATE(install_date) as date,
          COUNT(DISTINCT q_user_id) as trials
        FROM events_v2
        WHERE install_date >= $1 AND install_date <= $2
          AND campaign_id IS NOT NULL
          AND event_name = 'Trial Started'
        GROUP BY DATE(install_date)
      ),
      daily_paid AS (
        SELECT
          DATE(install_date) as date,
          COUNT(DISTINCT q_user_id) as paid_users
        FROM events_v2
        WHERE install_date >= $1 AND install_date <= $2
          AND campaign_id IS NOT NULL
          AND event_name IN ('Subscription Started', 'Trial Converted')
        GROUP BY DATE(install_date)
      )
      SELECT
        s.date,
        COALESCE(s.spend, 0) as spend,
        COALESCE(r.revenue, 0) as revenue,
        COALESCE(tr.total_revenue, 0) as total_revenue,
        CASE
          WHEN COALESCE(s.spend, 0) > 0 THEN COALESCE(r.revenue, 0) / s.spend
          ELSE 0
        END as roas,
        CASE
          WHEN COALESCE(s.spend, 0) > 0 THEN COALESCE(tr.total_revenue, 0) / s.spend
          ELSE 0
        END as total_roas,
        COALESCE(i.installs, 0) as installs,
        COALESCE(t.trials, 0) as trials,
        COALESCE(p.paid_users, 0) as paid_users,
        CASE WHEN p.paid_users > 0 THEN COALESCE(s.spend, 0) / p.paid_users ELSE NULL END as cop,
        CASE WHEN i.installs > 0 THEN (COALESCE(t.trials, 0)::float / i.installs) * 100 ELSE 0 END as install_to_trial_rate,
        CASE WHEN t.trials > 0 THEN (COALESCE(p.paid_users, 0)::float / t.trials) * 100 ELSE 0 END as trial_to_paid_rate
      FROM daily_spend s
      LEFT JOIN daily_revenue r ON s.date = r.date
      LEFT JOIN daily_total_revenue tr ON s.date = tr.date
      LEFT JOIN daily_installs i ON s.date = i.date
      LEFT JOIN daily_trials t ON s.date = t.date
      LEFT JOIN daily_paid p ON s.date = p.date
      ORDER BY s.date ASC
    `;

    const result = await db.query(query, [from, to]);

    let prevResult;
    if (compare === 'true' && prevFrom && prevTo) {
      prevResult = await db.query(query, [prevFrom.toISOString().split('T')[0], prevTo.toISOString().split('T')[0]]);
    }

    const totalsQuery = await db.query(`
      SELECT
        SUM(spend) as total_spend,
        SUM(installs) as total_installs
      FROM apple_ads_campaigns
      WHERE date >= $1 AND date <= $2
    `, [from, to]);

    const revenueQuery = await db.query(`
      SELECT
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as total_revenue
      FROM events_v2
      WHERE install_date >= $1 AND install_date <= $2
        AND campaign_id IS NOT NULL
    `, [from, to]);

    // Total revenue (all sources, by event_date)
    const totalRevenueQuery = await db.query(`
      SELECT
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) * 0.74 ELSE 0 END) as total_revenue
      FROM events_v2
      WHERE event_date >= $1 AND event_date <= $2
        AND event_name IN ('Subscription Renewed', 'Subscription Started', 'Trial Converted')
    `, [from, to]);

    const trialsQuery = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as total_trials
      FROM events_v2
      WHERE install_date >= $1 AND install_date <= $2
        AND campaign_id IS NOT NULL
        AND event_name = 'Trial Started'
    `, [from, to]);

    const paidQuery = await db.query(`
      SELECT COUNT(DISTINCT q_user_id) as total_paid_users
      FROM events_v2
      WHERE install_date >= $1 AND install_date <= $2
        AND campaign_id IS NOT NULL
        AND event_name IN ('Subscription Started', 'Trial Converted')
    `, [from, to]);

    const totalSpend = parseFloat(totalsQuery.rows[0]?.total_spend) || 0;
    const totalCohortRevenue = parseFloat(revenueQuery.rows[0]?.total_revenue) || 0;
    const totalAllRevenue = parseFloat(totalRevenueQuery.rows[0]?.total_revenue) || 0;
    const totalInstalls = parseInt(totalsQuery.rows[0]?.total_installs) || 0;
    const totalTrials = parseInt(trialsQuery.rows[0]?.total_trials) || 0;
    const totalPaidUsers = parseInt(paidQuery.rows[0]?.total_paid_users) || 0;

    const responseData = {
      from,
      to,
      totals: {
        spend: totalSpend,
        revenue: totalCohortRevenue,
        totalRevenue: totalAllRevenue,
        roas: totalSpend > 0 ? totalCohortRevenue / totalSpend : 0,
        totalRoas: totalSpend > 0 ? totalAllRevenue / totalSpend : 0,
        installs: totalInstalls,
        trials: totalTrials,
        paid_users: totalPaidUsers,
        install_to_trial_rate: totalInstalls > 0 ? (totalTrials / totalInstalls) * 100 : 0,
        trial_to_paid_rate: totalTrials > 0 ? (totalPaidUsers / totalTrials) * 100 : 0,
        install_to_paid_rate: totalInstalls > 0 ? (totalPaidUsers / totalInstalls) * 100 : 0
      },
      data: result.rows.map(row => ({
        date: row.date,
        spend: parseFloat(row.spend) || 0,
        revenue: parseFloat(row.revenue) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        roas: parseFloat(row.roas) || 0,
        totalRoas: parseFloat(row.total_roas) || 0,
        installs: parseInt(row.installs) || 0,
        trials: parseInt(row.trials) || 0,
        paid_users: parseInt(row.paid_users) || 0,
        cop: row.cop != null ? parseFloat(row.cop) : null,
        install_to_trial_rate: parseFloat(row.install_to_trial_rate) || 0,
        trial_to_paid_rate: parseFloat(row.trial_to_paid_rate) || 0
      }))
    };

    if (compare === 'true' && prevResult) {
      responseData.prevData = prevResult.rows.map(row => ({
        date: row.date,
        spend: parseFloat(row.spend) || 0,
        revenue: parseFloat(row.revenue) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        roas: parseFloat(row.roas) || 0,
        totalRoas: parseFloat(row.total_roas) || 0,
        installs: parseInt(row.installs) || 0,
        trials: parseInt(row.trials) || 0,
        paid_users: parseInt(row.paid_users) || 0,
        cop: row.cop != null ? parseFloat(row.cop) : null,
        install_to_trial_rate: parseFloat(row.install_to_trial_rate) || 0,
        trial_to_paid_rate: parseFloat(row.trial_to_paid_rate) || 0
      }));
    }

    res.json(responseData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/keywords/sov-trend
 * Get Share of Voice trend over time
 *
 * Query params:
 * - campaign_id: campaign ID (required)
 * - from: start date (YYYY-MM-DD) (required)
 * - to: end date (YYYY-MM-DD) (required)
 */
router.get('/keywords/sov-trend', async (req, res) => {
  try {
    const { campaign_id, from, to } = req.query;

    if (!campaign_id || !from || !to) {
      return res.status(400).json({ error: 'campaign_id, from, and to dates are required' });
    }

    const query = `
      WITH daily_impressions AS (
        SELECT
          date,
          keyword_id,
          keyword_text,
          SUM(impressions) as impressions
        FROM apple_ads_keywords
        WHERE campaign_id = $1
          AND date >= $2
          AND date <= $3
        GROUP BY date, keyword_id, keyword_text
      ),
      daily_totals AS (
        SELECT
          date,
          SUM(impressions) as total_impressions
        FROM apple_ads_keywords
        WHERE campaign_id = $1
          AND date >= $2
          AND date <= $3
        GROUP BY date
      )
      SELECT
        di.date,
        di.keyword_id,
        di.keyword_text,
        di.impressions,
        dt.total_impressions,
        CASE WHEN dt.total_impressions > 0
          THEN (di.impressions::float / dt.total_impressions) * 100
          ELSE 0
        END as sov
      FROM daily_impressions di
      JOIN daily_totals dt ON di.date = dt.date
      ORDER BY di.date ASC, di.impressions DESC
    `;

    const result = await db.query(query, [campaign_id, from, to]);

    res.json({
      campaign_id,
      from,
      to,
      data: result.rows.map(row => ({
        date: row.date,
        keyword_id: row.keyword_id,
        keyword_text: row.keyword_text,
        impressions: parseInt(row.impressions) || 0,
        total_impressions: parseInt(row.total_impressions) || 0,
        sov: parseFloat(row.sov) || 0
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/cohorts
 * Get cohort ROAS data by install date
 *
 * Query params:
 * - campaign_id: filter by campaign (optional)
 * - period: 'week' or 'month' (default: 'week')
 * - limit: number of cohorts (default: 12)
 * - country: filter by country (optional, supports comma-separated values)
 */
router.get('/cohorts', async (req, res) => {
  try {
    const { campaign_id, period = 'week', limit = 12, country, product_type } = req.query;

    // Build date grouping based on period
    const dateGroup = period === 'month'
      ? "TO_CHAR(install_date, 'YYYY-MM')"
      : "TO_CHAR(DATE_TRUNC('week', install_date), 'YYYY-MM-DD')";

    // Campaign filter
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

    // Get cohort data with ROAS by different time windows
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
          -- Revenue by age windows (days since install) - multiplied by 0.74 for proceeds
          SUM(CASE WHEN event_date - install_date <= 0 THEN price_usd * 0.74 ELSE 0 END) as revenue_d0,
          SUM(CASE WHEN event_date - install_date <= 3 THEN price_usd * 0.74 ELSE 0 END) as revenue_d3,
          SUM(CASE WHEN event_date - install_date <= 7 THEN price_usd * 0.74 ELSE 0 END) as revenue_d7,
          SUM(CASE WHEN event_date - install_date <= 14 THEN price_usd * 0.74 ELSE 0 END) as revenue_d14,
          SUM(CASE WHEN event_date - install_date <= 30 THEN price_usd * 0.74 ELSE 0 END) as revenue_d30,
          SUM(CASE WHEN event_date - install_date <= 60 THEN price_usd * 0.74 ELSE 0 END) as revenue_d60,
          SUM(CASE WHEN event_date - install_date <= 90 THEN price_usd * 0.74 ELSE 0 END) as revenue_d90,
          SUM(price_usd * 0.74) as revenue_total,
          COUNT(DISTINCT q_user_id) as users,
          -- Paid users by age windows
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

    // Calculate totals
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
 * Get aggregated CAC (Cost of Acquisition) by cohort windows
 * Only includes CLOSED cohorts (where enough time has passed)
 *
 * Returns CAC for D1, D4, D7, D14, D30 windows
 * Each window only includes cohorts where cohort_age >= window days
 */
router.get('/kpi/cohort-cac', async (req, res) => {
  try {
    const { campaign_id, country, product_type } = req.query;

    // Build filters
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

    // Query to get CAC by cohort windows, only for CLOSED cohorts
    // Uses events_v2 for paid users by install_date cohort
    // Joins with apple_ads_campaigns spend by date (approximation)
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
          -- Paid users by age windows (D1, D4, D7, D14, D30)
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
        -- D1: Only cohorts with age >= 1
        SUM(CASE WHEN cohort_age >= 1 THEN spend ELSE 0 END) as spend_d1,
        SUM(CASE WHEN cohort_age >= 1 THEN paid_users_d1 ELSE 0 END) as paid_users_d1,
        COUNT(CASE WHEN cohort_age >= 1 THEN 1 END) as cohorts_d1,

        -- D4: Only cohorts with age >= 4
        SUM(CASE WHEN cohort_age >= 4 THEN spend ELSE 0 END) as spend_d4,
        SUM(CASE WHEN cohort_age >= 4 THEN paid_users_d4 ELSE 0 END) as paid_users_d4,
        COUNT(CASE WHEN cohort_age >= 4 THEN 1 END) as cohorts_d4,

        -- D7: Only cohorts with age >= 7
        SUM(CASE WHEN cohort_age >= 7 THEN spend ELSE 0 END) as spend_d7,
        SUM(CASE WHEN cohort_age >= 7 THEN paid_users_d7 ELSE 0 END) as paid_users_d7,
        COUNT(CASE WHEN cohort_age >= 7 THEN 1 END) as cohorts_d7,

        -- D14: Only cohorts with age >= 14
        SUM(CASE WHEN cohort_age >= 14 THEN spend ELSE 0 END) as spend_d14,
        SUM(CASE WHEN cohort_age >= 14 THEN paid_users_d14 ELSE 0 END) as paid_users_d14,
        COUNT(CASE WHEN cohort_age >= 14 THEN 1 END) as cohorts_d14,

        -- D30: Only cohorts with age >= 30
        SUM(CASE WHEN cohort_age >= 30 THEN spend ELSE 0 END) as spend_d30,
        SUM(CASE WHEN cohort_age >= 30 THEN paid_users_d30 ELSE 0 END) as paid_users_d30,
        COUNT(CASE WHEN cohort_age >= 30 THEN 1 END) as cohorts_d30
      FROM cohort_metrics
    `;

    const result = await db.query(query, params);
    const row = result.rows[0] || {};

    // Calculate CAC for each window
    const cac = {
      d1: row.paid_users_d1 > 0 ? parseFloat(row.spend_d1) / parseInt(row.paid_users_d1) : null,
      d4: row.paid_users_d4 > 0 ? parseFloat(row.spend_d4) / parseInt(row.paid_users_d4) : null,
      d7: row.paid_users_d7 > 0 ? parseFloat(row.spend_d7) / parseInt(row.paid_users_d7) : null,
      d14: row.paid_users_d14 > 0 ? parseFloat(row.spend_d14) / parseInt(row.paid_users_d14) : null,
      d30: row.paid_users_d30 > 0 ? parseFloat(row.spend_d30) / parseInt(row.paid_users_d30) : null,
    };

    // Target CAC from yearly payback calculation
    // Target CAC based on proceeds (sales * 0.74) for yearly payback
    const TARGET_CAC = 65.68; // Was 88.75 based on sales, now adjusted for proceeds

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

// ================================================
// SEARCH TERMS
// ================================================

/**
 * GET /asa/search-terms
 * Get search terms with metrics
 *
 * Query params:
 * - campaign_id: filter by campaign (optional)
 * - adgroup_id: filter by ad group (optional)
 * - days: number of days (default 7)
 * - from: start date (YYYY-MM-DD)
 * - to: end date (YYYY-MM-DD)
 */
router.get('/search-terms', async (req, res) => {
  try {
    const { campaign_id, adgroup_id, limit = 100, offset = 0 } = req.query;

    // Parse date range
    let { days = 7, from, to } = req.query;
    let dateFilter;
    if (from && to) {
      dateFilter = { from, to };
    } else {
      days = parseInt(days) || 7;
      dateFilter = { days };
    }

    // Build date conditions
    const dateCondition = dateFilter.days
      ? `date >= CURRENT_DATE - INTERVAL '${dateFilter.days} days'`
      : `date >= '${dateFilter.from}' AND date <= '${dateFilter.to}'`;

    // Build query with optional filters
    let whereConditions = [dateCondition];
    let params = [];
    let paramCount = 0;

    if (campaign_id) {
      paramCount++;
      whereConditions.push(`campaign_id = $${paramCount}`);
      params.push(campaign_id);
    }

    if (adgroup_id) {
      paramCount++;
      whereConditions.push(`adgroup_id = $${paramCount}`);
      params.push(adgroup_id);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get search terms from Apple Ads data
    const query = `
      SELECT
        search_term,
        campaign_id,
        adgroup_id,
        SUM(impressions) as impressions,
        SUM(taps) as taps,
        SUM(installs) as installs,
        SUM(spend) as spend,
        CASE
          WHEN SUM(installs) > 0 THEN SUM(spend) / SUM(installs)
          ELSE NULL
        END as cpa,
        CASE
          WHEN SUM(taps) > 0 THEN SUM(spend) / SUM(taps)
          ELSE NULL
        END as cpt,
        CASE
          WHEN SUM(impressions) > 0 THEN (SUM(taps)::float / SUM(impressions)::float)
          ELSE 0
        END as ttr
      FROM apple_ads_search_terms
      WHERE ${whereClause}
      GROUP BY search_term, campaign_id, adgroup_id
      HAVING SUM(impressions) > 0
      ORDER BY SUM(spend) DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(DISTINCT search_term) as total
      FROM apple_ads_search_terms
      WHERE ${whereClause}
    `;

    const countResult = await db.query(countQuery, params.slice(0, paramCount));
    const total = parseInt(countResult.rows[0]?.total || 0);

    res.json({
      success: true,
      data: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Search terms endpoint error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint for cohort ROAS
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

    // Also check raw events_v2 data
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

// ================================================
// ALERTS
// ================================================

/**
 * GET /asa/alerts
 * Get recent alerts (health, budget, performance)
 *
 * Query params:
 * - limit: number of alerts (default 50)
 * - acknowledged: filter by acknowledged status (true/false)
 * - severity: filter by severity (info, warning, error, critical)
 * - type: filter by alert type
 */
router.get('/alerts', async (req, res) => {
  try {
    const { limit = 50, acknowledged, severity, type } = req.query;

    let whereConditions = [];
    const params = [];
    let paramIndex = 1;

    if (acknowledged !== undefined) {
      whereConditions.push(`acknowledged = $${paramIndex++}`);
      params.push(acknowledged === 'true');
    }

    if (severity) {
      whereConditions.push(`severity = $${paramIndex++}`);
      params.push(severity);
    }

    if (type) {
      whereConditions.push(`alert_type = $${paramIndex++}`);
      params.push(type);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Get alerts from asa_alerts table
    const alertsQuery = await db.query(`
      SELECT
        id,
        alert_type,
        severity,
        title,
        message,
        campaign_id,
        acknowledged,
        acknowledged_at,
        created_at
      FROM asa_alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    // Also get budget alerts from legacy table
    const budgetAlertsQuery = await db.query(`
      SELECT
        id,
        campaign_id,
        alert_level as severity,
        message,
        acknowledged,
        acknowledged_at,
        created_at,
        'budget_alert' as alert_type,
        'Budget Alert' as title
      FROM asa_budget_alerts
      WHERE DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 20
    `);

    // Merge and sort
    const allAlerts = [
      ...alertsQuery.rows,
      ...budgetAlertsQuery.rows
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
     .slice(0, limit);

    res.json({
      data: allAlerts,
      total: allAlerts.length
    });

  } catch (error) {
    console.error('Failed to fetch alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /asa/alerts/:id/acknowledge
 * Mark an alert as acknowledged
 */
router.patch('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { id } = req.params;

    // Try asa_alerts table first
    let result = await db.query(`
      UPDATE asa_alerts
      SET acknowledged = true, acknowledged_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    // If not found, try budget alerts
    if (result.rows.length === 0) {
      result = await db.query(`
        UPDATE asa_budget_alerts
        SET acknowledged = true, acknowledged_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Failed to acknowledge alert:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /asa/alerts/summary
 * Get alert counts by severity and type
 */
router.get('/alerts/summary', async (req, res) => {
  try {
    const summaryQuery = await db.query(`
      WITH all_alerts AS (
        SELECT severity, alert_type, acknowledged
        FROM asa_alerts
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
        UNION ALL
        SELECT alert_level as severity, 'budget_alert' as alert_type, acknowledged
        FROM asa_budget_alerts
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      )
      SELECT
        severity,
        alert_type,
        COUNT(*) as total,
        COUNT(CASE WHEN acknowledged = false THEN 1 END) as unacknowledged
      FROM all_alerts
      GROUP BY severity, alert_type
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'error' THEN 2
          WHEN 'warning' THEN 3
          WHEN 'info' THEN 4
          ELSE 5
        END,
        alert_type
    `);

    res.json({
      data: summaryQuery.rows
    });

  } catch (error) {
    console.error('Failed to fetch alert summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// PERFORMANCE ANNOTATIONS
// ================================================

/**
 * GET /asa/annotations
 * Get performance annotations for charts
 *
 * Query params:
 * - from: start date (YYYY-MM-DD)
 * - to: end date (YYYY-MM-DD)
 * - campaign_id: filter by campaign
 * - event_type: filter by event type
 */
router.get('/annotations', async (req, res) => {
  try {
    const { from, to, campaign_id, event_type } = req.query;

    let whereConditions = [];
    const params = [];
    let paramIndex = 1;

    if (from) {
      whereConditions.push(`annotation_date >= $${paramIndex++}`);
      params.push(from);
    }

    if (to) {
      whereConditions.push(`annotation_date <= $${paramIndex++}`);
      params.push(to);
    }

    if (campaign_id) {
      whereConditions.push(`(campaign_id = $${paramIndex++} OR campaign_id IS NULL)`);
      params.push(campaign_id);
    }

    if (event_type) {
      whereConditions.push(`event_type = $${paramIndex++}`);
      params.push(event_type);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const result = await db.query(`
      SELECT
        id,
        annotation_date,
        event_type,
        campaign_id,
        adgroup_id,
        keyword_id,
        title,
        description,
        color,
        marker_style,
        created_by,
        created_at
      FROM asa_performance_annotations
      ${whereClause}
      ORDER BY annotation_date DESC, created_at DESC
    `, params);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Failed to fetch annotations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/annotations
 * Create a new performance annotation
 *
 * Body:
 * - annotation_date: date (YYYY-MM-DD) - required
 * - event_type: string - required
 * - title: string - required
 * - description: string (optional)
 * - campaign_id: number (optional)
 * - adgroup_id: number (optional)
 * - keyword_id: number (optional)
 * - color: hex color code (optional, default #3b82f6)
 * - marker_style: circle|square|triangle|star (optional, default circle)
 */
router.post('/annotations', async (req, res) => {
  try {
    const {
      annotation_date,
      event_type,
      title,
      description,
      campaign_id,
      adgroup_id,
      keyword_id,
      color = '#3b82f6',
      marker_style = 'circle'
    } = req.body;

    // Validation
    if (!annotation_date || !event_type || !title) {
      return res.status(400).json({
        error: 'Missing required fields: annotation_date, event_type, title'
      });
    }

    const result = await db.query(`
      INSERT INTO asa_performance_annotations (
        annotation_date,
        event_type,
        campaign_id,
        adgroup_id,
        keyword_id,
        title,
        description,
        color,
        marker_style,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      annotation_date,
      event_type,
      campaign_id || null,
      adgroup_id || null,
      keyword_id || null,
      title,
      description || null,
      color,
      marker_style,
      req.user?.id || 'web'
    ]);

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Failed to create annotation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /asa/annotations/:id
 * Update an existing annotation
 */
router.put('/annotations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      annotation_date,
      event_type,
      title,
      description,
      campaign_id,
      adgroup_id,
      keyword_id,
      color,
      marker_style
    } = req.body;

    const result = await db.query(`
      UPDATE asa_performance_annotations
      SET
        annotation_date = COALESCE($1, annotation_date),
        event_type = COALESCE($2, event_type),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        campaign_id = COALESCE($5, campaign_id),
        adgroup_id = COALESCE($6, adgroup_id),
        keyword_id = COALESCE($7, keyword_id),
        color = COALESCE($8, color),
        marker_style = COALESCE($9, marker_style),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      annotation_date,
      event_type,
      title,
      description,
      campaign_id,
      adgroup_id,
      keyword_id,
      color,
      marker_style,
      id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Failed to update annotation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /asa/annotations/:id
 * Delete an annotation
 */
router.delete('/annotations/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(`
      DELETE FROM asa_performance_annotations
      WHERE id = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Annotation not found' });
    }

    res.json({
      success: true,
      message: 'Annotation deleted',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Failed to delete annotation:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
