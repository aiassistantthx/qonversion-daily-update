#!/usr/bin/env node

/**
 * Automation Worker
 *
 * Cron-based scheduler for executing automation rules
 * and syncing Apple Search Ads data
 *
 * Usage:
 *   node automation-worker.js
 *   node automation-worker.js --once        # Run once and exit
 *   node automation-worker.js --dry-run     # Preview without making changes
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../api/db');
const rulesEngine = require('../api/services/rulesEngine');
const appleAds = require('../api/services/appleAds');

// Parse command line arguments
const args = process.argv.slice(2);
const runOnce = args.includes('--once');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');

// Job schedules (cron-like intervals in milliseconds)
const SCHEDULES = {
  hourly: 60 * 60 * 1000,           // 1 hour
  daily: 24 * 60 * 60 * 1000,       // 24 hours
  weekly: 7 * 24 * 60 * 60 * 1000   // 7 days
};

// Track last run times
const lastRuns = {
  hourly: null,
  daily: null,
  weekly: null,
  sync: null
};

// Logger
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (data && verbose) {
    console.log(prefix, message, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix, message);
  }
}

/**
 * Execute rules for a specific frequency
 */
async function executeRulesForFrequency(frequency) {
  log('info', `Executing ${frequency} rules...`);

  try {
    const result = await rulesEngine.executeAllRules(dryRun, frequency);

    log('info', `${frequency} rules completed`, {
      totalRules: result.totalRules,
      dryRun: result.dryRun
    });

    // Log summary
    let totalExecuted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const ruleResult of result.results) {
      if (ruleResult.error) {
        totalErrors++;
        log('error', `Rule ${ruleResult.ruleId} failed: ${ruleResult.error}`);
      } else {
        totalExecuted += ruleResult.executed || 0;
        totalSkipped += ruleResult.skipped || 0;

        if (verbose && ruleResult.executed > 0) {
          log('info', `Rule "${ruleResult.ruleName}" executed on ${ruleResult.executed} entities`);
        }
      }
    }

    log('info', `Summary: ${totalExecuted} executed, ${totalSkipped} skipped, ${totalErrors} errors`);

    // Record job run
    await recordJobRun('rule_evaluation', frequency, {
      totalRules: result.totalRules,
      executed: totalExecuted,
      skipped: totalSkipped,
      errors: totalErrors
    });

    return result;

  } catch (error) {
    log('error', `Failed to execute ${frequency} rules: ${error.message}`);
    await recordJobRun('rule_evaluation', frequency, null, error.message);
    throw error;
  }
}

/**
 * Sync Apple Ads data
 */
async function syncAppleAdsData() {
  log('info', 'Starting Apple Ads data sync...');

  try {
    const startTime = Date.now();

    // Sync last 2 days of data
    const results = await appleAds.fullSync(2);

    const duration = Date.now() - startTime;

    const summary = {
      campaigns: results.campaigns.reduce((sum, r) => sum + (r.synced || 0), 0),
      adgroups: results.adgroups.reduce((sum, r) => sum + (r.synced || 0), 0),
      keywords: results.keywords.reduce((sum, r) => sum + (r.synced || 0), 0),
      durationMs: duration
    };

    log('info', 'Apple Ads sync completed', summary);

    await recordJobRun('data_sync', 'incremental', summary);

    return results;

  } catch (error) {
    log('error', `Apple Ads sync failed: ${error.message}`);
    await recordJobRun('data_sync', 'incremental', null, error.message);
    throw error;
  }
}

/**
 * Sync changes from Apple Ads (detect external changes)
 */
async function syncAppleAdsChanges() {
  log('info', 'Starting Apple Ads change detection...');

  try {
    const startTime = Date.now();

    const changes = await appleAds.syncChanges();

    const duration = Date.now() - startTime;

    const summary = {
      campaigns: changes.campaigns,
      adgroups: changes.adgroups,
      keywords: changes.keywords,
      total: changes.campaigns + changes.adgroups + changes.keywords,
      durationMs: duration
    };

    log('info', 'Change detection completed', summary);

    await recordJobRun('change_sync', 'hourly', summary);

    return changes;

  } catch (error) {
    log('error', `Change detection failed: ${error.message}`);
    await recordJobRun('change_sync', 'hourly', null, error.message);
    throw error;
  }
}

/**
 * Record job run to database
 */
async function recordJobRun(jobType, frequency, result, error = null) {
  try {
    await db.query(`
      INSERT INTO asa_scheduled_jobs (
        job_name, job_type, schedule,
        last_run_at, last_run_status, last_run_duration_ms, last_error,
        settings
      ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
      ON CONFLICT (job_name) DO UPDATE SET
        last_run_at = NOW(),
        last_run_status = EXCLUDED.last_run_status,
        last_run_duration_ms = EXCLUDED.last_run_duration_ms,
        last_error = EXCLUDED.last_error,
        updated_at = NOW()
    `, [
      `${jobType}_${frequency}`,
      jobType,
      frequency,
      error ? 'failed' : 'completed',
      result?.durationMs || null,
      error,
      JSON.stringify(result || {})
    ]);
  } catch (err) {
    log('error', `Failed to record job run: ${err.message}`);
  }
}

/**
 * Check if it's time to run a job
 */
function shouldRunJob(frequency) {
  const interval = SCHEDULES[frequency];
  const lastRun = lastRuns[frequency];

  if (!lastRun) return true;

  return Date.now() - lastRun >= interval;
}

/**
 * Get current hour for scheduling
 */
function getCurrentHour() {
  return new Date().getUTCHours();
}

/**
 * Main worker loop
 */
async function runWorker() {
  log('info', 'Automation worker started', { dryRun, runOnce, verbose });

  // Initial sync on startup (unless --once)
  if (!runOnce) {
    try {
      await syncAppleAdsData();
      lastRuns.sync = Date.now();
    } catch (error) {
      log('error', 'Initial sync failed, continuing...');
    }
  }

  // Main loop function
  async function tick() {
    try {
      const currentHour = getCurrentHour();

      // Hourly rules - run every hour
      if (shouldRunJob('hourly')) {
        await executeRulesForFrequency('hourly');
        await checkBudgetAlerts(); // Check budget usage hourly

        // Sync changes from Apple Ads hourly
        try {
          await syncAppleAdsChanges();
        } catch (error) {
          log('error', 'Change sync failed, continuing...');
        }

        lastRuns.hourly = Date.now();
      }

      // Daily rules - run at 6 AM UTC
      if (shouldRunJob('daily') && currentHour === 6) {
        await executeRulesForFrequency('daily');
        lastRuns.daily = Date.now();

        // Also sync data daily
        await syncAppleAdsData();
        lastRuns.sync = Date.now();
      }

      // Weekly rules - run on Monday at 6 AM UTC
      const dayOfWeek = new Date().getUTCDay();
      if (shouldRunJob('weekly') && dayOfWeek === 1 && currentHour === 6) {
        await executeRulesForFrequency('weekly');
        lastRuns.weekly = Date.now();
      }

    } catch (error) {
      log('error', `Worker tick failed: ${error.message}`);
    }
  }

  if (runOnce) {
    // Run all frequencies once
    log('info', 'Running all rules once...');

    try {
      await syncAppleAdsData();
    } catch (e) {
      log('error', 'Sync failed');
    }

    for (const freq of ['hourly', 'daily', 'weekly']) {
      try {
        await executeRulesForFrequency(freq);
      } catch (e) {
        log('error', `${freq} rules failed`);
      }
    }

    log('info', 'Single run completed');
    process.exit(0);

  } else {
    // Start the continuous loop
    log('info', 'Starting continuous loop (checking every minute)...');

    // Check every minute
    setInterval(tick, 60 * 1000);

    // Initial tick
    await tick();
  }
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  log('info', `Received ${signal}, shutting down...`);

  try {
    await db.pool.end();
    log('info', 'Database connections closed');
  } catch (error) {
    log('error', `Error closing database: ${error.message}`);
  }

  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log('error', `Uncaught exception: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', `Unhandled rejection: ${reason}`);
  console.error(reason);
});

/**
 * Check campaign budget usage and send alerts
 */
async function checkBudgetAlerts() {
  log('info', 'Checking campaign budgets...');

  try {
    // Get today's spend vs daily budget
    const result = await db.query(`
      SELECT
        campaign_id,
        campaign_name,
        daily_budget,
        spend as today_spend,
        CASE
          WHEN daily_budget > 0 THEN ROUND((spend / daily_budget * 100)::numeric, 1)
          ELSE 0
        END as budget_used_pct
      FROM apple_ads_campaigns
      WHERE date = CURRENT_DATE
        AND campaign_status = 'ENABLED'
        AND daily_budget > 0
      ORDER BY budget_used_pct DESC
    `);

    const alerts = [];

    for (const campaign of result.rows) {
      const pct = parseFloat(campaign.budget_used_pct);

      if (pct >= 100) {
        alerts.push({
          level: 'critical',
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.campaign_name,
          message: `🚨 Budget EXHAUSTED: ${campaign.campaign_name} - ${pct}% used ($${campaign.today_spend}/$${campaign.daily_budget})`
        });
      } else if (pct >= 80) {
        alerts.push({
          level: 'warning',
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.campaign_name,
          message: `⚠️ Budget WARNING: ${campaign.campaign_name} - ${pct}% used ($${campaign.today_spend}/$${campaign.daily_budget})`
        });
      }
    }

    if (alerts.length > 0) {
      log('info', `Found ${alerts.length} budget alerts`);

      // Send Telegram notification
      await sendTelegramAlert(alerts);

      // Record alerts in database
      for (const alert of alerts) {
        await db.query(`
          INSERT INTO asa_budget_alerts (campaign_id, alert_level, message, created_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (campaign_id, DATE(created_at)) DO UPDATE SET
            alert_level = EXCLUDED.alert_level,
            message = EXCLUDED.message
        `, [alert.campaign_id, alert.level, alert.message]);
      }
    } else {
      log('info', 'No budget alerts');
    }

    return alerts;

  } catch (error) {
    log('error', `Budget check failed: ${error.message}`);
    return [];
  }
}

/**
 * Send alert to Telegram
 */
async function sendTelegramAlert(alerts) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    log('warn', 'Telegram not configured, skipping notification');
    return;
  }

  const message = `📊 *ASA Budget Alerts*\n\n${alerts.map(a => a.message).join('\n')}`;

  try {
    const fetch = require('node-fetch');
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      log('error', `Telegram API error: ${response.status}`);
    } else {
      log('info', 'Telegram notification sent');
    }
  } catch (error) {
    log('error', `Failed to send Telegram: ${error.message}`);
  }
}

// Start the worker
runWorker().catch(error => {
  log('error', `Worker failed to start: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
