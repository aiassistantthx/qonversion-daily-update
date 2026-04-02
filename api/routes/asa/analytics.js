/**
 * Analytics routes for ASA Management
 * Countries, Trends, Templates, Alerts, Annotations
 */

const express = require('express');
const router = express.Router();
const { fetchDailySales } = require('../../services/qonversionSales');
const { parseDateFilter, db } = require('./utils');

/**
 * GET /asa/countries
 * Get metrics breakdown by country
 */
router.get('/countries', async (req, res) => {
  try {
    const { dateFilter, dateCondition, revenueCondition } = parseDateFilter(req.query);

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

/**
 * GET /asa/trends
 * Get daily trends for Spend, Revenue, ROAS, and Conversion Funnel
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
          SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as total_revenue
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

    const totalRevenueQuery = await db.query(`
      SELECT
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as total_revenue
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
    let totalAllRevenue = parseFloat(totalRevenueQuery.rows[0]?.total_revenue) || 0;
    const totalInstalls = parseInt(totalsQuery.rows[0]?.total_installs) || 0;
    const totalTrials = parseInt(trialsQuery.rows[0]?.total_trials) || 0;
    const totalPaidUsers = parseInt(paidQuery.rows[0]?.total_paid_users) || 0;

    const qonversionSales = await fetchDailySales();

    if (Object.keys(qonversionSales).length > 0) {
      totalAllRevenue = Object.entries(qonversionSales)
        .filter(([date]) => date >= from && date <= to)
        .reduce((sum, [, revenue]) => sum + revenue, 0);
    }

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
      data: result.rows.map(row => {
        const dateStr = row.date.toISOString().split('T')[0];
        const spend = parseFloat(row.spend) || 0;
        const totalRevenue = qonversionSales[dateStr] ?? parseFloat(row.total_revenue) ?? 0;
        return {
          date: row.date,
          spend,
          revenue: parseFloat(row.revenue) || 0,
          totalRevenue,
          roas: parseFloat(row.roas) || 0,
          totalRoas: spend > 0 ? totalRevenue / spend : 0,
          installs: parseInt(row.installs) || 0,
          trials: parseInt(row.trials) || 0,
          paid_users: parseInt(row.paid_users) || 0,
          cop: row.cop != null ? parseFloat(row.cop) : null,
          install_to_trial_rate: parseFloat(row.install_to_trial_rate) || 0,
          trial_to_paid_rate: parseFloat(row.trial_to_paid_rate) || 0
        };
      })
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

/**
 * GET /asa/alerts
 * Get recent alerts
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

    let result = await db.query(`
      UPDATE asa_alerts
      SET acknowledged = true, acknowledged_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

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

/**
 * GET /asa/annotations
 * Get performance annotations for charts
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
