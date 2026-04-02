/**
 * Automation Rules routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const rulesEngine = require('../../services/rulesEngine');
const appleAds = require('../../services/appleAds');
const { db } = require('./utils');

/**
 * GET /asa/rule-templates
 * Get predefined rule templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = require('../../data/rule-templates.json');
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
router.get('/', async (req, res) => {
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
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const ruleResult = await db.query('SELECT * FROM asa_automation_rules WHERE id = $1', [id]);
    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const rule = ruleResult.rows[0];

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
router.post('/', async (req, res) => {
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

    if (!name || !scope || !conditions || !action_type) {
      return res.status(400).json({ error: 'name, scope, conditions, and action_type are required' });
    }

    if (!['campaign', 'adgroup', 'keyword'].includes(scope)) {
      return res.status(400).json({ error: 'Invalid scope. Use campaign, adgroup, or keyword.' });
    }

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
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

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
router.delete('/:id', async (req, res) => {
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
router.post('/:id/execute', async (req, res) => {
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
router.get('/:id/preview', async (req, res) => {
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
router.post('/:id/simulate', async (req, res) => {
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
router.post('/execute-all', async (req, res) => {
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
router.get('/executions', async (req, res) => {
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
router.post('/executions/:id/undo', async (req, res) => {
  try {
    const { id } = req.params;

    const executionResult = await db.query(
      'SELECT * FROM asa_rule_executions WHERE id = $1',
      [id]
    );

    if (executionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const execution = executionResult.rows[0];

    if (execution.status !== 'executed') {
      return res.status(400).json({ error: 'Only executed actions can be undone' });
    }

    const executedAt = new Date(execution.executed_at);
    const now = new Date();
    const hoursSince = (now - executedAt) / (1000 * 60 * 60);

    if (hoursSince > 24) {
      return res.status(400).json({ error: 'Cannot undo executions older than 24 hours' });
    }

    const previousValue = execution.previous_value
      ? (typeof execution.previous_value === 'string' ? JSON.parse(execution.previous_value) : execution.previous_value)
      : null;

    if (!previousValue) {
      return res.status(400).json({ error: 'No previous value to restore' });
    }

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

module.exports = router;
