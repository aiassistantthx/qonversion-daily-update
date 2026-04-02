/**
 * Keyword routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const appleAds = require('../../services/appleAds');
const { recordChange, invalidateCache, parseDateFilter, db, cache } = require('./utils');

/**
 * GET /asa/keywords
 * List keywords with filters
 */
router.get('/', async (req, res) => {
  try {
    const { campaign_id, adgroup_id, status, limit = 100, offset = 0 } = req.query;
    const { dateFilter, dateCondition, revenueCondition } = parseDateFilter(req.query);

    const cacheKey = `keywords:${campaign_id}:${adgroup_id}:${status}:${req.query.days || 7}:${req.query.from}:${req.query.to}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      const metadata = cache.getMetadata(cacheKey);
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Age', metadata.age);
      res.set('X-Last-Updated', metadata.createdAt);
      return res.json(cached);
    }

    const params = [];
    let campaignFilter = '';
    if (campaign_id) {
      campaignFilter = `campaign_id = $${params.length + 1}`;
      params.push(campaign_id);
    }

    let baseQuery = `
      WITH keyword_perf AS (
        SELECT
          keyword_id,
          SUM(CASE WHEN ${dateCondition} THEN spend ELSE 0 END) as spend,
          SUM(CASE WHEN ${dateCondition} THEN impressions ELSE 0 END) as impressions,
          SUM(CASE WHEN ${dateCondition} THEN taps ELSE 0 END) as taps,
          SUM(CASE WHEN ${dateCondition} THEN installs ELSE 0 END) as installs,
          NULL as impression_share
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

    baseQuery += ` ORDER BY spend_7d DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(baseQuery, params);

    const responseData = {
      total: totalCount,
      dateRange: dateFilter,
      data: result.rows
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
 * GET /asa/keywords/sov-trend
 * Get Share of Voice trend over time
 */
router.get('/sov-trend', async (req, res) => {
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
 * POST /asa/keywords/bulk
 * Create multiple keywords
 */
router.post('/bulk', async (req, res) => {
  try {
    const { campaignId, adGroupId, keywords } = req.body;

    if (!campaignId || !adGroupId || !keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and keywords array required' });
    }

    const formattedKeywords = keywords.map(kw => ({
      text: kw.text,
      matchType: kw.matchType || 'EXACT',
      bidAmount: kw.bidAmount ? { amount: String(kw.bidAmount), currency: kw.currency || 'USD' } : undefined,
      status: kw.status || 'ACTIVE'
    }));

    const result = await appleAds.createKeywords(campaignId, adGroupId, formattedKeywords);

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
router.patch('/:keywordId/bid', async (req, res) => {
  try {
    const { keywordId } = req.params;
    const { campaignId, adGroupId, bidAmount, previousBid, currency = 'USD' } = req.body;

    if (!campaignId || !adGroupId || !bidAmount) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and bidAmount required' });
    }

    const result = await appleAds.updateKeywordBid(campaignId, adGroupId, keywordId, bidAmount, currency);

    await recordChange('keyword', keywordId, 'bid_update', 'bidAmount', previousBid || null, String(bidAmount), 'api', null, req);
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
router.patch('/:keywordId/status', async (req, res) => {
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
router.patch('/bulk/bid', async (req, res) => {
  try {
    const { campaignId, adGroupId, updates, dryRun = false } = req.body;

    if (!campaignId || !adGroupId || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'campaignId, adGroupId, and updates array required' });
    }

    const results = [];

    for (const update of updates) {
      const { keywordId, bidAmount, currency = 'USD' } = update;

      try {
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
router.patch('/bulk/status', async (req, res) => {
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

/**
 * GET /asa/negative-keywords
 * Get negative keywords for campaign or ad group
 */
router.get('/negative', async (req, res) => {
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
router.post('/negative', async (req, res) => {
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
router.delete('/negative/:keywordId', async (req, res) => {
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

module.exports = router;
