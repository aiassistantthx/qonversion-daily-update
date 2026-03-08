/**
 * Rules Command
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const db = require('../../api/db');

const program = new Command('rules')
  .description('Manage automation rules');

// List rules
program
  .command('list')
  .description('List all automation rules')
  .option('--enabled', 'Show only enabled rules')
  .option('--disabled', 'Show only disabled rules')
  .option('--scope <scope>', 'Filter by scope (campaign, adgroup, keyword)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      let query = 'SELECT * FROM asa_automation_rules WHERE 1=1';
      const params = [];

      if (options.enabled) {
        query += ' AND enabled = true';
      } else if (options.disabled) {
        query += ' AND enabled = false';
      }

      if (options.scope) {
        params.push(options.scope);
        query += ` AND scope = $${params.length}`;
      }

      query += ' ORDER BY priority ASC, created_at DESC';

      const result = await db.query(query, params);

      if (options.json) {
        console.log(JSON.stringify(result.rows, null, 2));
        return;
      }

      console.log('\nAutomation Rules:');
      console.log('─'.repeat(110));
      console.log(
        'ID'.padEnd(5) +
        'Name'.padEnd(35) +
        'Scope'.padEnd(10) +
        'Action'.padEnd(15) +
        'Freq'.padEnd(10) +
        'Enabled'.padEnd(10) +
        'Last Run'.padEnd(20)
      );
      console.log('─'.repeat(110));

      for (const rule of result.rows) {
        const lastRun = rule.last_executed_at
          ? new Date(rule.last_executed_at).toISOString().slice(0, 16).replace('T', ' ')
          : '-';

        console.log(
          String(rule.id).padEnd(5) +
          (rule.name || '').substring(0, 33).padEnd(35) +
          (rule.scope || '').padEnd(10) +
          (rule.action_type || '').padEnd(15) +
          (rule.frequency || '').padEnd(10) +
          (rule.enabled ? 'Yes' : 'No').padEnd(10) +
          lastRun.padEnd(20)
        );
      }

      console.log('─'.repeat(110));
      console.log(`Total: ${result.rows.length} rules\n`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Get rule details
program
  .command('get <ruleId>')
  .description('Get rule details with recent executions')
  .option('--json', 'Output as JSON')
  .action(async (ruleId, options) => {
    try {
      const ruleResult = await db.query('SELECT * FROM asa_automation_rules WHERE id = $1', [ruleId]);

      if (ruleResult.rows.length === 0) {
        console.error('Rule not found');
        process.exit(1);
      }

      const rule = ruleResult.rows[0];

      const execResult = await db.query(`
        SELECT * FROM asa_rule_executions
        WHERE rule_id = $1
        ORDER BY executed_at DESC
        LIMIT 10
      `, [ruleId]);

      if (options.json) {
        console.log(JSON.stringify({ rule, executions: execResult.rows }, null, 2));
        return;
      }

      console.log('\nRule Details:');
      console.log('─'.repeat(60));
      console.log(`ID:            ${rule.id}`);
      console.log(`Name:          ${rule.name}`);
      console.log(`Description:   ${rule.description || '-'}`);
      console.log(`Scope:         ${rule.scope}`);
      console.log(`Action:        ${rule.action_type}`);
      console.log(`Frequency:     ${rule.frequency}`);
      console.log(`Enabled:       ${rule.enabled ? 'Yes' : 'No'}`);
      console.log(`Priority:      ${rule.priority}`);
      console.log(`Max Exec/Day:  ${rule.max_executions_per_day}`);
      console.log(`Cooldown:      ${rule.cooldown_hours}h`);
      console.log('─'.repeat(60));

      console.log('\nConditions:');
      const conditions = typeof rule.conditions === 'string'
        ? JSON.parse(rule.conditions)
        : rule.conditions;
      for (const cond of conditions) {
        console.log(`  - ${cond.metric} ${cond.operator} ${cond.value} (${cond.period})`);
      }

      console.log('\nAction Params:');
      const params = typeof rule.action_params === 'string'
        ? JSON.parse(rule.action_params)
        : rule.action_params;
      for (const [key, value] of Object.entries(params)) {
        console.log(`  - ${key}: ${value}`);
      }

      if (execResult.rows.length > 0) {
        console.log('\nRecent Executions:');
        console.log('─'.repeat(80));
        for (const exec of execResult.rows.slice(0, 5)) {
          const date = new Date(exec.executed_at).toISOString().slice(0, 19).replace('T', ' ');
          console.log(`  ${date} | ${exec.entity_type} ${exec.entity_id} | ${exec.status}`);
          if (exec.previous_value && exec.new_value) {
            console.log(`    Changed: ${exec.previous_value} -> ${exec.new_value}`);
          }
        }
      }

      console.log('');

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Create rule from JSON file
program
  .command('create')
  .description('Create a new rule from JSON file')
  .requiredOption('-f, --file <file>', 'JSON file with rule definition')
  .action(async (options) => {
    try {
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const ruleData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Validate required fields
      if (!ruleData.name || !ruleData.scope || !ruleData.conditions || !ruleData.action_type) {
        console.error('Rule must have: name, scope, conditions, action_type');
        process.exit(1);
      }

      const result = await db.query(`
        INSERT INTO asa_automation_rules (
          name, description, scope, campaign_ids, adgroup_ids, keyword_ids,
          conditions, conditions_logic, action_type, action_params,
          frequency, max_executions_per_day, cooldown_hours, enabled, priority
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        ruleData.name,
        ruleData.description || null,
        ruleData.scope,
        ruleData.campaign_ids || null,
        ruleData.adgroup_ids || null,
        ruleData.keyword_ids || null,
        JSON.stringify(ruleData.conditions),
        ruleData.conditions_logic || 'AND',
        ruleData.action_type,
        JSON.stringify(ruleData.action_params || {}),
        ruleData.frequency || 'daily',
        ruleData.max_executions_per_day || 1,
        ruleData.cooldown_hours || 24,
        ruleData.enabled !== false,
        ruleData.priority || 100
      ]);

      console.log(`Rule created: ID ${result.rows[0].id} - ${result.rows[0].name}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Enable rule
program
  .command('enable <ruleId>')
  .description('Enable a rule')
  .action(async (ruleId) => {
    try {
      const result = await db.query(`
        UPDATE asa_automation_rules
        SET enabled = true, updated_at = NOW()
        WHERE id = $1
        RETURNING name
      `, [ruleId]);

      if (result.rows.length === 0) {
        console.error('Rule not found');
        process.exit(1);
      }

      console.log(`Rule enabled: ${result.rows[0].name}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Disable rule
program
  .command('disable <ruleId>')
  .description('Disable a rule')
  .action(async (ruleId) => {
    try {
      const result = await db.query(`
        UPDATE asa_automation_rules
        SET enabled = false, updated_at = NOW()
        WHERE id = $1
        RETURNING name
      `, [ruleId]);

      if (result.rows.length === 0) {
        console.error('Rule not found');
        process.exit(1);
      }

      console.log(`Rule disabled: ${result.rows[0].name}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Delete rule
program
  .command('delete <ruleId>')
  .description('Delete a rule')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (ruleId, options) => {
    try {
      const ruleResult = await db.query('SELECT name FROM asa_automation_rules WHERE id = $1', [ruleId]);

      if (ruleResult.rows.length === 0) {
        console.error('Rule not found');
        process.exit(1);
      }

      if (!options.yes) {
        console.log(`Are you sure you want to delete rule "${ruleResult.rows[0].name}"?`);
        console.log('Use --yes flag to confirm deletion.');
        return;
      }

      await db.query('DELETE FROM asa_automation_rules WHERE id = $1', [ruleId]);
      console.log(`Rule deleted: ${ruleResult.rows[0].name}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Show execution history
program
  .command('history')
  .description('Show rule execution history')
  .option('-r, --rule <ruleId>', 'Filter by rule ID')
  .option('-s, --status <status>', 'Filter by status (executed, dry_run, failed, skipped)')
  .option('-l, --limit <limit>', 'Number of records', '50')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      let query = `
        SELECT e.*, r.name as rule_name
        FROM asa_rule_executions e
        JOIN asa_automation_rules r ON e.rule_id = r.id
        WHERE 1=1
      `;
      const params = [];

      if (options.rule) {
        params.push(options.rule);
        query += ` AND e.rule_id = $${params.length}`;
      }

      if (options.status) {
        params.push(options.status);
        query += ` AND e.status = $${params.length}`;
      }

      params.push(parseInt(options.limit));
      query += ` ORDER BY e.executed_at DESC LIMIT $${params.length}`;

      const result = await db.query(query, params);

      if (options.json) {
        console.log(JSON.stringify(result.rows, null, 2));
        return;
      }

      console.log('\nRule Execution History:');
      console.log('─'.repeat(120));
      console.log(
        'Time'.padEnd(20) +
        'Rule'.padEnd(30) +
        'Entity'.padEnd(20) +
        'Action'.padEnd(15) +
        'Change'.padEnd(25) +
        'Status'.padEnd(10)
      );
      console.log('─'.repeat(120));

      for (const exec of result.rows) {
        const time = new Date(exec.executed_at).toISOString().slice(0, 16).replace('T', ' ');
        const change = exec.previous_value && exec.new_value
          ? `${exec.previous_value} -> ${exec.new_value}`.substring(0, 23)
          : '-';

        console.log(
          time.padEnd(20) +
          (exec.rule_name || '').substring(0, 28).padEnd(30) +
          `${exec.entity_type}:${exec.entity_id}`.substring(0, 18).padEnd(20) +
          (exec.action_type || '').padEnd(15) +
          change.padEnd(25) +
          (exec.status || '').padEnd(10)
        );
      }

      console.log('─'.repeat(120));
      console.log(`Showing ${result.rows.length} executions\n`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Generate sample rule files
program
  .command('examples')
  .description('Generate example rule JSON files')
  .option('-o, --output <dir>', 'Output directory', '.')
  .action(async (options) => {
    const examples = [
      {
        filename: 'rule_high_cpa_decrease_bid.json',
        content: {
          name: 'High CPA - Decrease Bid',
          description: 'Decrease bid by 15% when CPA exceeds $50 over 7 days with minimum spend',
          scope: 'keyword',
          conditions: [
            { metric: 'cpa', operator: '>', value: 50, period: '7d' },
            { metric: 'spend', operator: '>', value: 10, period: '7d' }
          ],
          conditions_logic: 'AND',
          action_type: 'adjust_bid',
          action_params: {
            adjustmentType: 'percent',
            adjustmentValue: -15,
            minBid: 0.50
          },
          frequency: 'daily',
          max_executions_per_day: 1,
          cooldown_hours: 24,
          enabled: true
        }
      },
      {
        filename: 'rule_low_cpa_increase_bid.json',
        content: {
          name: 'Low CPA - Increase Bid',
          description: 'Increase bid by 10% when CPA is below $20 with good install volume',
          scope: 'keyword',
          conditions: [
            { metric: 'cpa', operator: '<', value: 20, period: '7d' },
            { metric: 'installs', operator: '>', value: 5, period: '7d' }
          ],
          conditions_logic: 'AND',
          action_type: 'adjust_bid',
          action_params: {
            adjustmentType: 'percent',
            adjustmentValue: 10,
            maxBid: 10.00
          },
          frequency: 'daily',
          max_executions_per_day: 1,
          cooldown_hours: 24,
          enabled: true
        }
      },
      {
        filename: 'rule_no_impressions_pause.json',
        content: {
          name: 'No Impressions - Pause',
          description: 'Pause keywords with no impressions in 14 days',
          scope: 'keyword',
          conditions: [
            { metric: 'impressions', operator: '=', value: 0, period: '14d' }
          ],
          conditions_logic: 'AND',
          action_type: 'pause',
          action_params: {},
          frequency: 'daily',
          enabled: true
        }
      },
      {
        filename: 'rule_high_spend_no_installs_alert.json',
        content: {
          name: 'High Spend No Installs - Alert',
          description: 'Send alert when spending $20+ with no installs',
          scope: 'keyword',
          conditions: [
            { metric: 'spend', operator: '>', value: 20, period: '7d' },
            { metric: 'installs', operator: '=', value: 0, period: '7d' }
          ],
          conditions_logic: 'AND',
          action_type: 'send_alert',
          action_params: {
            channel: 'slack',
            message: 'Keyword spending over $20 with no installs'
          },
          frequency: 'daily',
          enabled: true
        }
      }
    ];

    const outDir = path.resolve(options.output);

    for (const example of examples) {
      const filePath = path.join(outDir, example.filename);
      fs.writeFileSync(filePath, JSON.stringify(example.content, null, 2));
      console.log(`Created: ${filePath}`);
    }

    console.log(`\nGenerated ${examples.length} example rule files in ${outDir}`);
    console.log('Use: asa-cli rules create --file=<filename> to create a rule');
  });

module.exports = program;
