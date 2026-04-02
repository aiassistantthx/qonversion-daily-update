/**
 * Campaign routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const appleAds = require('../../services/appleAds');
const { predictRoas } = require('../../lib/predictions');
const { recordChange, invalidateCache, parseDateFilter, buildPrevPeriodConditions, db, cache } = require('./utils');

/**
 * GET /asa/campaigns
 * List all campaigns with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const { status, limit = 100, offset = 0, sort = 'revenue', compare } = req.query;
    const { dateFilter, dateCondition, revenueCondition } = parseDateFilter(req.query);
    const { prevDateFilter, prevDateCondition, prevRevenueCondition } = buildPrevPeriodConditions(req.query, dateFilter);

    // Check cache
    const cacheKey = `campaigns:${req.query.days || 7}:${req.query.from}:${req.query.to}:${status}:${sort}:${compare}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const metadata = cache.getMetadata(cacheKey);
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Age', metadata.age);
      res.set('X-Last-Updated', metadata.createdAt);
      return res.json(cached);
    }

    // Get from Apple Ads API
    const campaigns = await appleAds.getCampaigns();

    // Filter by status if specified
    let filtered = campaigns;
    if (status) {
      filtered = campaigns.filter(c => c.status === status.toUpperCase());
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
          NULL as impression_share,
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

      let budgetUsedPct = null;
      if (perf && perf.daily_budget > 0) {
        budgetUsedPct = Math.round((parseFloat(perf.spend) / parseFloat(perf.daily_budget)) * 100);
      }

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

    // Get totals from DB
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
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

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
    const adGroups = await appleAds.getAdGroups(id);

    const performance = await db.query(`
      SELECT * FROM v_campaign_performance WHERE campaign_id = $1
    `, [id]);

    const responseData = {
      ...campaign,
      adGroups,
      performance: performance.rows[0] || null
    };

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
router.post('/', async (req, res) => {
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

    if (!name || !adamId || !countriesOrRegions || !adGroupName || !dailyBudget) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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

    if (keywords && keywords.length > 0) {
      await appleAds.createKeywords(campaign.id, adGroup.id, keywords);
    }

    if (negativeKeywords && negativeKeywords.length > 0) {
      const negativeKeywordsPayload = negativeKeywords.map(text => ({
        text,
        matchType: 'EXACT'
      }));
      await appleAds.createNegativeKeywords(campaign.id, negativeKeywordsPayload);
    }

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
router.post('/bulk', async (req, res) => {
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

        if (!name || !adamId || !countriesOrRegions || !adGroupName || !dailyBudget) {
          errors.push({ index: i, name, error: 'Missing required fields' });
          continue;
        }

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

        if (keywords && keywords.length > 0) {
          await appleAds.createKeywords(campaign.id, adGroup.id, keywords);
        }

        if (negativeKeywords && negativeKeywords.length > 0) {
          const negativeKeywordsPayload = negativeKeywords.map(text => ({
            text,
            matchType: 'EXACT'
          }));
          await appleAds.createNegativeKeywords(campaign.id, negativeKeywordsPayload);
        }

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
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const current = await appleAds.getCampaign(id);
    const result = await appleAds.updateCampaign(id, updates);

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
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['ENABLED', 'PAUSED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use ENABLED or PAUSED.' });
    }

    const current = await appleAds.getCampaign(id);
    const result = await appleAds.updateCampaignStatus(id, status);

    await recordChange('campaign', id, 'status_update', 'status', current.status, status, 'api', null, req);
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
router.patch('/:id/budget', async (req, res) => {
  try {
    const { id } = req.params;
    const { dailyBudget, currency = 'USD' } = req.body;

    if (!dailyBudget || dailyBudget <= 0) {
      return res.status(400).json({ error: 'Invalid dailyBudget' });
    }

    const current = await appleAds.getCampaign(id);
    const result = await appleAds.updateCampaignBudget(id, dailyBudget, currency);

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
router.post('/:id/copy', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      copyAdGroups = true,
      copyKeywords = true,
      copyBids = true,
      countriesOrRegions
    } = req.body;

    const originalCampaign = await appleAds.getCampaign(id);

    if (!originalCampaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

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

    if (copyAdGroups) {
      const originalAdGroups = await appleAds.getAdGroups(id);

      for (const adGroup of originalAdGroups) {
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

module.exports = router;
