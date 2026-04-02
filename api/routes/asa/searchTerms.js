/**
 * Search Terms routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const { parseDateFilter, db } = require('./utils');

/**
 * GET /asa/search-terms
 * Get search terms with metrics
 */
router.get('/', async (req, res) => {
  try {
    const { campaign_id, adgroup_id, limit = 100, offset = 0 } = req.query;
    const { dateFilter, dateCondition } = parseDateFilter(req.query);

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

module.exports = router;
