/**
 * Rules Engine Service
 *
 * Evaluates automation rules against performance data
 * and executes actions (bid adjustments, pausing, alerts)
 */

const db = require('../db');
const appleAds = require('./appleAds');

class RulesEngine {
  constructor() {
    this.metrics = {
      spend: 'spend',
      impressions: 'impressions',
      taps: 'taps',
      installs: 'installs',
      cpa: 'cpa',
      cpt: 'cpt',
      ttr: 'ttr',
      roas: 'roas',
      revenue: 'revenue'
    };

    this.operators = {
      '>': (a, b) => a > b,
      '<': (a, b) => a < b,
      '>=': (a, b) => a >= b,
      '<=': (a, b) => a <= b,
      '=': (a, b) => a === b,
      '!=': (a, b) => a !== b
    };

    this.periodDays = {
      '1d': 1,
      '3d': 3,
      '7d': 7,
      '14d': 14,
      '30d': 30
    };
  }

  /**
   * Parse period string to days
   */
  parsePeriod(period) {
    return this.periodDays[period] || 7;
  }

  /**
   * Get performance metrics for an entity
   */
  async getEntityMetrics(entityType, entityId, days) {
    let query;
    const params = [entityId, days];

    switch (entityType) {
      case 'keyword':
        query = `
          SELECT
            keyword_id as entity_id,
            SUM(spend) as spend,
            SUM(impressions) as impressions,
            SUM(taps) as taps,
            SUM(installs) as installs,
            CASE WHEN SUM(installs) > 0 THEN SUM(spend) / SUM(installs) ELSE NULL END as cpa,
            CASE WHEN SUM(taps) > 0 THEN SUM(spend) / SUM(taps) ELSE NULL END as cpt,
            CASE WHEN SUM(impressions) > 0 THEN SUM(taps)::float / SUM(impressions) * 100 ELSE NULL END as ttr,
            MAX(bid_amount) as current_bid
          FROM apple_ads_keywords
          WHERE keyword_id = $1
            AND date >= CURRENT_DATE - $2
          GROUP BY keyword_id
        `;
        break;

      case 'adgroup':
        query = `
          SELECT
            adgroup_id as entity_id,
            SUM(spend) as spend,
            SUM(impressions) as impressions,
            SUM(taps) as taps,
            SUM(installs) as installs,
            CASE WHEN SUM(installs) > 0 THEN SUM(spend) / SUM(installs) ELSE NULL END as cpa,
            CASE WHEN SUM(taps) > 0 THEN SUM(spend) / SUM(taps) ELSE NULL END as cpt,
            CASE WHEN SUM(impressions) > 0 THEN SUM(taps)::float / SUM(impressions) * 100 ELSE NULL END as ttr
          FROM apple_ads_adgroups
          WHERE adgroup_id = $1
            AND date >= CURRENT_DATE - $2
          GROUP BY adgroup_id
        `;
        break;

      case 'campaign':
        query = `
          SELECT
            campaign_id as entity_id,
            SUM(spend) as spend,
            SUM(impressions) as impressions,
            SUM(taps) as taps,
            SUM(installs) as installs,
            CASE WHEN SUM(installs) > 0 THEN SUM(spend) / SUM(installs) ELSE NULL END as cpa,
            CASE WHEN SUM(taps) > 0 THEN SUM(spend) / SUM(taps) ELSE NULL END as cpt,
            CASE WHEN SUM(impressions) > 0 THEN SUM(taps)::float / SUM(impressions) * 100 ELSE NULL END as ttr
          FROM apple_ads_campaigns
          WHERE campaign_id = $1
            AND date >= CURRENT_DATE - $2
          GROUP BY campaign_id
        `;
        break;

      default:
        return null;
    }

    const result = await db.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Get all entities for a rule scope
   */
  async getEntitiesForRule(rule) {
    let query;
    const params = [];

    switch (rule.scope) {
      case 'keyword':
        query = `
          SELECT DISTINCT
            k.keyword_id as entity_id,
            k.campaign_id,
            k.adgroup_id,
            k.keyword_text,
            k.keyword_status,
            k.bid_amount as current_bid
          FROM apple_ads_keywords k
          WHERE k.keyword_status = 'ACTIVE'
            AND k.date = (SELECT MAX(date) FROM apple_ads_keywords)
        `;

        // Filter by campaign/adgroup if specified
        if (rule.campaign_ids && rule.campaign_ids.length > 0) {
          query += ` AND k.campaign_id = ANY($${params.length + 1})`;
          params.push(rule.campaign_ids);
        }
        if (rule.adgroup_ids && rule.adgroup_ids.length > 0) {
          query += ` AND k.adgroup_id = ANY($${params.length + 1})`;
          params.push(rule.adgroup_ids);
        }
        if (rule.keyword_ids && rule.keyword_ids.length > 0) {
          query += ` AND k.keyword_id = ANY($${params.length + 1})`;
          params.push(rule.keyword_ids);
        }
        break;

      case 'adgroup':
        query = `
          SELECT DISTINCT
            a.adgroup_id as entity_id,
            a.campaign_id,
            a.adgroup_name,
            a.adgroup_status
          FROM apple_ads_adgroups a
          WHERE a.adgroup_status = 'ENABLED'
            AND a.date = (SELECT MAX(date) FROM apple_ads_adgroups)
        `;

        if (rule.campaign_ids && rule.campaign_ids.length > 0) {
          query += ` AND a.campaign_id = ANY($${params.length + 1})`;
          params.push(rule.campaign_ids);
        }
        if (rule.adgroup_ids && rule.adgroup_ids.length > 0) {
          query += ` AND a.adgroup_id = ANY($${params.length + 1})`;
          params.push(rule.adgroup_ids);
        }
        break;

      case 'campaign':
        query = `
          SELECT DISTINCT
            c.campaign_id as entity_id,
            c.campaign_name,
            c.campaign_status
          FROM apple_ads_campaigns c
          WHERE c.campaign_status = 'ENABLED'
            AND c.date = (SELECT MAX(date) FROM apple_ads_campaigns)
        `;

        if (rule.campaign_ids && rule.campaign_ids.length > 0) {
          query += ` AND c.campaign_id = ANY($${params.length + 1})`;
          params.push(rule.campaign_ids);
        }
        break;

      default:
        return [];
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Evaluate a single condition against metrics
   */
  evaluateCondition(condition, metrics) {
    const { metric, operator, value, period } = condition;

    const metricValue = metrics[metric];
    const op = this.operators[operator];

    if (metricValue === null || metricValue === undefined || !op) {
      return { met: false, reason: `Metric ${metric} not available` };
    }

    const met = op(parseFloat(metricValue), value);

    return {
      met,
      metric,
      operator,
      threshold: value,
      actual: parseFloat(metricValue),
      period
    };
  }

  /**
   * Evaluate all conditions for a rule against entity metrics
   */
  async evaluateConditions(rule, entityId) {
    const conditions = typeof rule.conditions === 'string'
      ? JSON.parse(rule.conditions)
      : rule.conditions;

    const results = [];
    const logic = rule.conditions_logic || 'AND';

    for (const condition of conditions) {
      const days = this.parsePeriod(condition.period);
      const metrics = await this.getEntityMetrics(rule.scope, entityId, days);

      if (!metrics) {
        results.push({
          condition,
          met: false,
          reason: 'No metrics available'
        });
        continue;
      }

      const result = this.evaluateCondition(condition, metrics);
      results.push({ condition, ...result, metrics });
    }

    // Determine overall result based on logic
    let allMet;
    if (logic === 'AND') {
      allMet = results.every(r => r.met);
    } else {
      allMet = results.some(r => r.met);
    }

    return {
      allMet,
      logic,
      conditions: results
    };
  }

  /**
   * Check if rule can be executed (cooldown, daily limit)
   */
  async canExecuteRule(rule, entityType, entityId) {
    // Check daily execution limit
    const dailyCount = await db.query(`
      SELECT COUNT(*) as count
      FROM asa_rule_executions
      WHERE rule_id = $1
        AND status = 'executed'
        AND executed_at >= CURRENT_DATE
    `, [rule.id]);

    if (parseInt(dailyCount.rows[0].count) >= rule.max_executions_per_day) {
      return { canExecute: false, reason: 'Daily execution limit reached' };
    }

    // Check cooldown for this entity
    const lastExecution = await db.query(`
      SELECT executed_at
      FROM asa_rule_executions
      WHERE rule_id = $1
        AND entity_type = $2
        AND entity_id = $3
        AND status = 'executed'
      ORDER BY executed_at DESC
      LIMIT 1
    `, [rule.id, entityType, entityId]);

    if (lastExecution.rows.length > 0) {
      const lastTime = new Date(lastExecution.rows[0].executed_at);
      const cooldownMs = rule.cooldown_hours * 60 * 60 * 1000;
      const now = Date.now();

      if (now - lastTime.getTime() < cooldownMs) {
        return { canExecute: false, reason: `Cooldown period not elapsed (${rule.cooldown_hours}h)` };
      }
    }

    return { canExecute: true };
  }

  /**
   * Execute action for a rule
   */
  async executeAction(rule, entity, evaluation, dryRun = false) {
    const actionParams = typeof rule.action_params === 'string'
      ? JSON.parse(rule.action_params)
      : rule.action_params;

    const startTime = Date.now();
    let previousValue = null;
    let newValue = null;
    let success = true;
    let errorMessage = null;

    try {
      switch (rule.action_type) {
        case 'adjust_bid':
          const result = await this.executeAdjustBid(entity, actionParams, rule.scope, dryRun);
          previousValue = result.previousBid;
          newValue = result.newBid;
          break;

        case 'set_bid':
          const setBidResult = await this.executeSetBid(entity, actionParams, rule.scope, dryRun);
          previousValue = setBidResult.previousBid;
          newValue = setBidResult.newBid;
          break;

        case 'schedule_bid':
          const scheduleBidResult = await this.executeScheduledBid(entity, actionParams, rule.scope, dryRun);
          previousValue = scheduleBidResult.previousBid;
          newValue = scheduleBidResult.newBid;
          break;

        case 'pause':
          await this.executePause(entity, rule.scope, dryRun);
          previousValue = 'ACTIVE';
          newValue = 'PAUSED';
          break;

        case 'enable':
          await this.executeEnable(entity, rule.scope, dryRun);
          previousValue = 'PAUSED';
          newValue = 'ENABLED';
          break;

        case 'send_alert':
          await this.executeSendAlert(rule, entity, evaluation, actionParams);
          newValue = 'alert_sent';
          break;

        default:
          throw new Error(`Unknown action type: ${rule.action_type}`);
      }
    } catch (error) {
      success = false;
      errorMessage = error.message;
    }

    const executionDuration = Date.now() - startTime;

    // Log execution
    await db.query(`
      INSERT INTO asa_rule_executions (
        rule_id, entity_type, entity_id,
        campaign_id, adgroup_id, keyword_id,
        conditions_evaluated, conditions_met, metrics_snapshot,
        action_type, previous_value, new_value,
        status, error_message, execution_duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `, [
      rule.id,
      rule.scope,
      entity.entity_id,
      entity.campaign_id || null,
      entity.adgroup_id || null,
      rule.scope === 'keyword' ? entity.entity_id : null,
      JSON.stringify(evaluation.conditions),
      JSON.stringify(evaluation.conditions.filter(c => c.met)),
      JSON.stringify(evaluation.conditions[0]?.metrics || {}),
      rule.action_type,
      previousValue ? JSON.stringify(previousValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      dryRun ? 'dry_run' : (success ? 'executed' : 'failed'),
      errorMessage,
      executionDuration
    ]);

    // Update rule last_executed_at
    if (!dryRun && success) {
      await db.query(`
        UPDATE asa_automation_rules
        SET last_executed_at = NOW()
        WHERE id = $1
      `, [rule.id]);
    }

    return {
      success,
      dryRun,
      previousValue,
      newValue,
      error: errorMessage
    };
  }

  /**
   * Execute bid adjustment
   */
  async executeAdjustBid(entity, params, scope, dryRun) {
    const { adjustmentType, adjustmentValue, minBid, maxBid } = params;
    const currentBid = parseFloat(entity.current_bid || 0);

    let newBid;
    if (adjustmentType === 'percent') {
      newBid = currentBid * (1 + adjustmentValue / 100);
    } else {
      newBid = currentBid + adjustmentValue;
    }

    // Apply limits
    if (minBid !== undefined && newBid < minBid) {
      newBid = minBid;
    }
    if (maxBid !== undefined && newBid > maxBid) {
      newBid = maxBid;
    }

    newBid = Math.round(newBid * 100) / 100; // Round to 2 decimal places

    if (!dryRun && scope === 'keyword') {
      await appleAds.updateKeywordBid(
        entity.campaign_id,
        entity.adgroup_id,
        entity.entity_id,
        newBid
      );

      // Record in change history
      await db.query(`
        INSERT INTO asa_change_history (
          entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
          change_type, field_name, old_value, new_value, source
        ) VALUES ('keyword', $1, $2, $3, $1, 'bid_update', 'bidAmount', $4, $5, 'rule')
      `, [entity.entity_id, entity.campaign_id, entity.adgroup_id, String(currentBid), String(newBid)]);
    }

    return { previousBid: currentBid, newBid };
  }

  /**
   * Execute set bid
   */
  async executeSetBid(entity, params, scope, dryRun) {
    const { bidAmount } = params;
    const currentBid = parseFloat(entity.current_bid || 0);
    const newBid = parseFloat(bidAmount);

    if (!dryRun && scope === 'keyword') {
      await appleAds.updateKeywordBid(
        entity.campaign_id,
        entity.adgroup_id,
        entity.entity_id,
        newBid
      );

      await db.query(`
        INSERT INTO asa_change_history (
          entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
          change_type, field_name, old_value, new_value, source
        ) VALUES ('keyword', $1, $2, $3, $1, 'bid_update', 'bidAmount', $4, $5, 'rule')
      `, [entity.entity_id, entity.campaign_id, entity.adgroup_id, String(currentBid), String(newBid)]);
    }

    return { previousBid: currentBid, newBid };
  }

  /**
   * Execute scheduled bid (dayparting)
   */
  async executeScheduledBid(entity, params, scope, dryRun) {
    const { schedule } = params;
    const currentBid = parseFloat(entity.current_bid || 0);

    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    const multiplier = schedule?.[dayOfWeek]?.[hour] ?? 1.0;
    const newBid = Math.round(currentBid * multiplier * 100) / 100;

    if (multiplier === 0) {
      if (!dryRun && scope === 'keyword') {
        await appleAds.updateKeywordStatus(
          entity.campaign_id,
          entity.adgroup_id,
          entity.entity_id,
          'PAUSED'
        );

        await db.query(`
          INSERT INTO asa_change_history (
            entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
            change_type, field_name, old_value, new_value, source
          ) VALUES ('keyword', $1, $2, $3, $1, 'status_update', 'status', 'ACTIVE', 'PAUSED', 'schedule')
        `, [entity.entity_id, entity.campaign_id, entity.adgroup_id]);
      }
      return { previousBid: currentBid, newBid: 0 };
    }

    if (!dryRun && scope === 'keyword' && newBid !== currentBid) {
      await appleAds.updateKeywordBid(
        entity.campaign_id,
        entity.adgroup_id,
        entity.entity_id,
        newBid
      );

      await db.query(`
        INSERT INTO asa_change_history (
          entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
          change_type, field_name, old_value, new_value, source
        ) VALUES ('keyword', $1, $2, $3, $1, 'bid_update', 'bidAmount', $4, $5, 'schedule')
      `, [entity.entity_id, entity.campaign_id, entity.adgroup_id, String(currentBid), String(newBid)]);
    }

    return { previousBid: currentBid, newBid };
  }

  /**
   * Execute pause action
   */
  async executePause(entity, scope, dryRun) {
    if (dryRun) return;

    if (scope === 'keyword') {
      await appleAds.updateKeywordStatus(
        entity.campaign_id,
        entity.adgroup_id,
        entity.entity_id,
        'PAUSED'
      );
    } else if (scope === 'adgroup') {
      await appleAds.updateAdGroupStatus(
        entity.campaign_id,
        entity.entity_id,
        'PAUSED'
      );
    } else if (scope === 'campaign') {
      await appleAds.updateCampaignStatus(entity.entity_id, 'PAUSED');
    }

    await db.query(`
      INSERT INTO asa_change_history (
        entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
        change_type, field_name, old_value, new_value, source
      ) VALUES ($1, $2, $3, $4, $5, 'status_update', 'status', 'ACTIVE', 'PAUSED', 'rule')
    `, [
      scope,
      entity.entity_id,
      entity.campaign_id || (scope === 'campaign' ? entity.entity_id : null),
      entity.adgroup_id || (scope === 'adgroup' ? entity.entity_id : null),
      scope === 'keyword' ? entity.entity_id : null
    ]);
  }

  /**
   * Execute enable action
   */
  async executeEnable(entity, scope, dryRun) {
    if (dryRun) return;

    if (scope === 'keyword') {
      await appleAds.updateKeywordStatus(
        entity.campaign_id,
        entity.adgroup_id,
        entity.entity_id,
        'ACTIVE'
      );
    } else if (scope === 'adgroup') {
      await appleAds.updateAdGroupStatus(
        entity.campaign_id,
        entity.entity_id,
        'ENABLED'
      );
    } else if (scope === 'campaign') {
      await appleAds.updateCampaignStatus(entity.entity_id, 'ENABLED');
    }

    await db.query(`
      INSERT INTO asa_change_history (
        entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
        change_type, field_name, old_value, new_value, source
      ) VALUES ($1, $2, $3, $4, $5, 'status_update', 'status', 'PAUSED', 'ACTIVE', 'rule')
    `, [
      scope,
      entity.entity_id,
      entity.campaign_id || (scope === 'campaign' ? entity.entity_id : null),
      entity.adgroup_id || (scope === 'adgroup' ? entity.entity_id : null),
      scope === 'keyword' ? entity.entity_id : null
    ]);
  }

  /**
   * Execute send alert action
   */
  async executeSendAlert(rule, entity, evaluation, params) {
    const { channel, message } = params;

    // For now, just log to database
    await db.query(`
      INSERT INTO asa_alerts (
        alert_type, severity, title, message,
        rule_id, campaign_id, adgroup_id, keyword_id,
        channels
      ) VALUES ('rule_execution', 'warning', $1, $2, $3, $4, $5, $6, $7)
    `, [
      `Rule Alert: ${rule.name}`,
      `${message}\n\nEntity: ${rule.scope} ${entity.entity_id}\nConditions: ${JSON.stringify(evaluation.conditions.filter(c => c.met))}`,
      rule.id,
      entity.campaign_id || null,
      entity.adgroup_id || null,
      rule.scope === 'keyword' ? entity.entity_id : null,
      JSON.stringify([channel || 'log'])
    ]);

    console.log(`[ALERT] Rule "${rule.name}" triggered for ${rule.scope} ${entity.entity_id}: ${message}`);
  }

  /**
   * Execute a single rule
   */
  async executeRule(ruleId, dryRun = false) {
    // Get rule
    const ruleResult = await db.query('SELECT * FROM asa_automation_rules WHERE id = $1', [ruleId]);
    if (ruleResult.rows.length === 0) {
      throw new Error('Rule not found');
    }

    const rule = ruleResult.rows[0];

    if (!rule.enabled && !dryRun) {
      return { success: false, message: 'Rule is disabled' };
    }

    // Get all entities for this rule
    const entities = await this.getEntitiesForRule(rule);

    const results = [];

    for (const entity of entities) {
      // Check if can execute
      const canExecute = await this.canExecuteRule(rule, rule.scope, entity.entity_id);
      if (!canExecute.canExecute && !dryRun) {
        results.push({
          entityId: entity.entity_id,
          skipped: true,
          reason: canExecute.reason
        });
        continue;
      }

      // Evaluate conditions
      const evaluation = await this.evaluateConditions(rule, entity.entity_id);

      if (!evaluation.allMet) {
        results.push({
          entityId: entity.entity_id,
          skipped: true,
          reason: 'Conditions not met',
          evaluation
        });
        continue;
      }

      // Execute action
      const actionResult = await this.executeAction(rule, entity, evaluation, dryRun);

      results.push({
        entityId: entity.entity_id,
        executed: !dryRun,
        dryRun,
        evaluation,
        actionResult
      });
    }

    return {
      ruleId,
      ruleName: rule.name,
      scope: rule.scope,
      actionType: rule.action_type,
      dryRun,
      totalEntities: entities.length,
      executed: results.filter(r => r.executed).length,
      skipped: results.filter(r => r.skipped).length,
      results
    };
  }

  /**
   * Execute all enabled rules
   */
  async executeAllRules(dryRun = false, frequency = null) {
    let query = 'SELECT id FROM asa_automation_rules WHERE enabled = true';
    const params = [];

    if (frequency) {
      params.push(frequency);
      query += ` AND frequency = $${params.length}`;
    }

    query += ' ORDER BY priority ASC';

    const rules = await db.query(query, params);
    const results = [];

    for (const row of rules.rows) {
      try {
        const result = await this.executeRule(row.id, dryRun);
        results.push(result);
      } catch (error) {
        results.push({
          ruleId: row.id,
          error: error.message
        });
      }
    }

    return {
      totalRules: rules.rows.length,
      dryRun,
      results
    };
  }

  /**
   * Preview rule execution (dry run with detailed output)
   */
  async previewRule(ruleId) {
    return this.executeRule(ruleId, true);
  }

  /**
   * Simulate rule execution with what-if analysis
   * Returns detailed information about affected entities and predicted changes
   */
  async simulateRule(ruleId) {
    const result = await this.executeRule(ruleId, true);

    // Get rule to access scope
    const ruleResult = await db.query('SELECT * FROM asa_automation_rules WHERE id = $1', [ruleId]);
    const rule = ruleResult.rows[0];

    // Get entities with names
    const entities = await this.getEntitiesForRule(rule);
    const entityMap = new Map();

    entities.forEach(entity => {
      const name = entity.keyword_text || entity.adgroup_name || entity.campaign_name || `${result.scope}_${entity.entity_id}`;
      entityMap.set(entity.entity_id.toString(), name);
    });

    // Transform results for UI display
    const affectedEntities = result.results
      .filter(r => !r.skipped)
      .map(r => ({
        entityId: r.entityId,
        entityType: result.scope,
        entityName: entityMap.get(r.entityId.toString()) || `${result.scope}_${r.entityId}`,
        currentMetrics: r.evaluation?.conditions[0]?.metrics || {},
        conditionsMet: r.evaluation?.allMet || false,
        conditions: r.evaluation?.conditions || [],
        action: {
          type: result.actionType,
          oldValue: r.actionResult?.previousValue,
          newValue: r.actionResult?.newValue,
        }
      }));

    const skippedEntities = result.results
      .filter(r => r.skipped)
      .map(r => ({
        entityId: r.entityId,
        entityType: result.scope,
        entityName: entityMap.get(r.entityId.toString()) || `${result.scope}_${r.entityId}`,
        reason: r.reason,
        evaluation: r.evaluation
      }));

    return {
      ruleId: result.ruleId,
      ruleName: result.ruleName,
      scope: result.scope,
      actionType: result.actionType,
      summary: {
        totalEntities: result.totalEntities,
        affected: affectedEntities.length,
        skipped: skippedEntities.length
      },
      affectedEntities,
      skippedEntities
    };
  }
}

module.exports = new RulesEngine();
