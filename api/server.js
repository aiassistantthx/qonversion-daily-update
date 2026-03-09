const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const db = require('./db');
const webhookRouter = require('./routes/webhook');
const dashboardRouter = require('./routes/dashboard');
const asaRouter = require('./routes/asa');
const appleAds = require('./services/appleAds');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    await db.query('SELECT 1');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

// Webhook routes
app.use('/webhook', webhookRouter);

// Dashboard routes
app.use('/dashboard', dashboardRouter);

// ASA Management routes
app.use('/asa', asaRouter);

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Qonversion Attribution API',
    version: '3.0.0',
    endpoints: {
      'GET /': 'This info',
      'GET /health': 'Health check',
      'POST /webhook': 'Receive Qonversion webhooks',
      'GET /webhook/stats': 'Event statistics',
      'GET /apple-ads/test': 'Test Apple Ads connection',
      'POST /apple-ads/sync': 'Sync Apple Ads data',
      'GET /dashboard/summary': 'Today metrics summary',
      'GET /dashboard/daily': 'Daily metrics (7 days)',
      'GET /dashboard/intraday': 'Hourly revenue today',
      'GET /dashboard/cop': 'COP metrics by window',
      'GET /dashboard/cop-by-campaign': 'COP by campaign',
      'GET /dashboard/revenue-by-source': 'Organic vs Paid',
      'GET /dashboard/cohorts': 'Cohort revenue curves',
      'GET /dashboard/retention': 'Retention heatmap',
      'GET /dashboard/payback': 'Payback curves',
      'GET /dashboard/health': 'Health score',
      // ASA Management
      'GET /asa/campaigns': 'List campaigns',
      'PUT /asa/campaigns/:id': 'Update campaign',
      'PATCH /asa/campaigns/:id/status': 'Pause/enable campaign',
      'GET /asa/keywords': 'List keywords with filters',
      'POST /asa/keywords/bulk': 'Create keywords',
      'PATCH /asa/keywords/:id/bid': 'Update keyword bid',
      'PATCH /asa/keywords/bulk/bid': 'Bulk update keyword bids',
      'GET /asa/rules': 'List automation rules',
      'POST /asa/rules': 'Create automation rule',
      'POST /asa/rules/:id/execute': 'Execute rule manually',
      'GET /asa/templates': 'List campaign templates',
      'GET /asa/history': 'Get change history',
      'POST /asa/sync': 'Full data sync',
    },
  });
});

// Apple Ads endpoints
app.get('/apple-ads/test', async (req, res) => {
  try {
    const result = await appleAds.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/apple-ads/sync', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const results = await appleAds.syncRecentData(days);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/apple-ads/campaigns', async (req, res) => {
  try {
    const campaigns = await appleAds.getCampaigns();
    res.json({ campaigns });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to check subscription_events data
app.get('/debug/subscription-events', async (req, res) => {
  try {
    // Date range
    const dateRange = await db.query(`
      SELECT
        MIN(event_date) as min_date,
        MAX(event_date) as max_date,
        COUNT(*) as total
      FROM subscription_events
    `);

    // Daily revenue for last 10 days
    const dailyRevenue = await db.query(`
      SELECT
        DATE(event_date) as day,
        COUNT(*) as events,
        SUM(CASE WHEN event_name IN ('Subscription Started', 'Trial Converted', 'Subscription Renewed') AND refund = false THEN price_usd ELSE 0 END) as revenue,
        COUNT(DISTINCT q_user_id) FILTER (WHERE event_name IN ('Subscription Started', 'Trial Converted')) as subscribers
      FROM subscription_events
      WHERE event_date >= CURRENT_DATE - INTERVAL '10 days'
      GROUP BY DATE(event_date)
      ORDER BY day DESC
    `);

    const stats = await db.query(`
      SELECT
        COUNT(*) as total_events,
        COUNT(campaign_id) as with_campaign_id,
        COUNT(DISTINCT campaign_id) as unique_campaigns,
        SUM(CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN 1 ELSE 0 END) as revenue_events,
        SUM(CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') AND campaign_id IS NOT NULL THEN 1 ELSE 0 END) as revenue_events_with_campaign
      FROM subscription_events
      WHERE event_date >= CURRENT_DATE - INTERVAL '7 days'
    `);

    // Check events joined with user_attributions
    const attributed = await db.query(`
      SELECT
        COUNT(*) as total_matched,
        COUNT(DISTINCT ua.campaign_id) as unique_campaigns,
        SUM(CASE WHEN se.event_name IN ('Subscription Started', 'Trial Converted') THEN 1 ELSE 0 END) as paid_events_matched,
        SUM(CASE WHEN se.event_name IN ('Subscription Started', 'Trial Converted') THEN COALESCE(se.price_usd, 0) ELSE 0 END) as paid_revenue
      FROM subscription_events se
      JOIN user_attributions ua ON se.q_user_id::TEXT = ua.user_id::TEXT
      WHERE se.event_date >= CURRENT_DATE - INTERVAL '7 days'
        AND ua.campaign_id IS NOT NULL
    `);

    // Sample of user_attributions
    const sample_ua = await db.query(`
      SELECT user_id, campaign_id FROM user_attributions LIMIT 3
    `);

    // Sample of subscription_events
    const sample_se = await db.query(`
      SELECT q_user_id, event_name, campaign_id FROM subscription_events WHERE event_date >= CURRENT_DATE - INTERVAL '7 days' LIMIT 3
    `);

    // Debug: events by type for Mar 8-9
    const recentEvents = await db.query(`
      SELECT
        DATE(event_date) as day,
        event_name,
        COUNT(*) as cnt,
        SUM(COALESCE(price_usd, 0)) as total_price,
        COUNT(*) FILTER (WHERE price_usd IS NOT NULL AND price_usd > 0) as with_price
      FROM subscription_events
      WHERE event_date >= '2026-03-08'
      GROUP BY DATE(event_date), event_name
      ORDER BY day DESC, cnt DESC
    `);

    res.json({
      dateRange: dateRange.rows[0],
      dailyRevenue: dailyRevenue.rows,
      recentEvents: recentEvents.rows,
      stats: stats.rows[0],
      attributed: attributed.rows[0],
      sample_user_attributions: sample_ua.rows,
      sample_subscription_events: sample_se.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fix event_name format: snake_case -> Title Case
app.post('/migrate/fix-event-names', async (req, res) => {
  try {
    // Update snake_case event names to Title Case
    const result = await db.query(`
      UPDATE subscription_events
      SET event_name = INITCAP(REPLACE(event_name, '_', ' '))
      WHERE event_name LIKE '%_%'
      RETURNING id
    `);

    res.json({
      success: true,
      updated: result.rowCount,
      message: 'Event names converted from snake_case to Title Case'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fix event_name format in events_v2: snake_case -> Title Case
app.post('/migrate/fix-event-names-v2', async (req, res) => {
  try {
    const result = await db.query(`
      UPDATE events_v2
      SET event_name = INITCAP(REPLACE(event_name, '_', ' '))
      WHERE event_name LIKE '%_%'
      RETURNING id
    `);

    res.json({
      success: true,
      updated: result.rowCount,
      message: 'Event names in events_v2 converted from snake_case to Title Case'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Drop legacy qonversion_events table
app.post('/migrate/drop-qonversion-events', async (req, res) => {
  try {
    await db.query('DROP TABLE IF EXISTS qonversion_events CASCADE');
    res.json({
      success: true,
      message: 'Table qonversion_events dropped'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create events_v2 table with full denormalization
app.post('/migrate/create-events-v2', async (req, res) => {
  try {
    // Step 1: Create new table
    await db.query(`
      CREATE TABLE IF NOT EXISTS events_v2 (
        id SERIAL PRIMARY KEY,
        transaction_id TEXT UNIQUE,
        q_user_id TEXT NOT NULL,
        custom_user_id TEXT,
        event_date TIMESTAMP NOT NULL,
        event_name TEXT NOT NULL,
        product_id TEXT,
        subscription_group TEXT,
        currency TEXT,
        price DECIMAL(10,2),
        price_usd DECIMAL(10,2),
        proceeds_usd DECIMAL(10,2),
        refund BOOLEAN DEFAULT FALSE,
        platform TEXT,
        device_id TEXT,
        locale TEXT,
        country TEXT,
        app_version TEXT,
        install_date TIMESTAMP,
        media_source TEXT,
        campaign_id BIGINT,
        campaign_name TEXT,
        adgroup_id BIGINT,
        keyword_id BIGINT,
        source TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Step 2: Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_events_v2_event_date ON events_v2(event_date);
      CREATE INDEX IF NOT EXISTS idx_events_v2_user ON events_v2(q_user_id);
      CREATE INDEX IF NOT EXISTS idx_events_v2_event_name ON events_v2(event_name);
      CREATE INDEX IF NOT EXISTS idx_events_v2_install_date ON events_v2(install_date);
      CREATE INDEX IF NOT EXISTS idx_events_v2_campaign ON events_v2(campaign_id);
      CREATE INDEX IF NOT EXISTS idx_events_v2_keyword ON events_v2(keyword_id);
    `);

    res.json({
      success: true,
      message: 'Table events_v2 created with indexes'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Migrate data from subscription_events to events_v2 with attribution enrichment
app.post('/migrate/populate-events-v2', async (req, res) => {
  try {
    // Insert data from subscription_events, enriching with user_attributions
    const result = await db.query(`
      INSERT INTO events_v2 (
        transaction_id, q_user_id, custom_user_id,
        event_date, event_name, product_id, subscription_group,
        currency, price, price_usd, proceeds_usd, refund,
        platform, device_id, locale, country, app_version,
        install_date, media_source, campaign_id, campaign_name,
        adgroup_id, keyword_id, source
      )
      SELECT
        se.transaction_id,
        se.q_user_id,
        se.custom_user_id,
        se.event_date,
        se.event_name,
        se.product_id,
        se.subscription_group,
        se.currency,
        se.price,
        se.price_usd,
        se.proceeds_usd,
        se.refund,
        se.platform,
        se.device_id,
        se.locale,
        se.country,
        se.app_version,
        se.install_date,
        COALESCE(se.media_source, CASE WHEN ua.campaign_id IS NOT NULL THEN 'Apple AdServices' END),
        COALESCE(se.campaign_id, ua.campaign_id),
        se.campaign_name,
        ua.adgroup_id,
        ua.keyword_id,
        se.source
      FROM subscription_events se
      LEFT JOIN user_attributions ua ON se.q_user_id::TEXT = ua.user_id::TEXT
      ON CONFLICT (transaction_id) DO NOTHING
    `);

    // Get stats
    const stats = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(campaign_id) as with_campaign,
        COUNT(keyword_id) as with_keyword
      FROM events_v2
    `);

    res.json({
      success: true,
      inserted: result.rowCount,
      stats: stats.rows[0],
      message: 'Data migrated to events_v2 with attribution enrichment'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Database migration endpoint for ASA management tables
app.post('/migrate/asa', async (req, res) => {
  const migrationSQL = `
    -- ASA Automation Rules
    CREATE TABLE IF NOT EXISTS asa_automation_rules (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      scope VARCHAR(50) NOT NULL,
      campaign_ids BIGINT[],
      adgroup_ids BIGINT[],
      keyword_ids BIGINT[],
      conditions JSONB NOT NULL DEFAULT '[]',
      conditions_logic VARCHAR(10) DEFAULT 'AND',
      action_type VARCHAR(50) NOT NULL,
      action_params JSONB NOT NULL DEFAULT '{}',
      frequency VARCHAR(20) DEFAULT 'daily',
      max_executions_per_day INTEGER DEFAULT 1,
      cooldown_hours INTEGER DEFAULT 24,
      enabled BOOLEAN DEFAULT true,
      priority INTEGER DEFAULT 100,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_executed_at TIMESTAMP,
      created_by VARCHAR(100) DEFAULT 'system'
    );

    -- Rule Executions Log
    CREATE TABLE IF NOT EXISTS asa_rule_executions (
      id SERIAL PRIMARY KEY,
      rule_id INTEGER REFERENCES asa_automation_rules(id) ON DELETE CASCADE,
      entity_type VARCHAR(50) NOT NULL,
      entity_id BIGINT NOT NULL,
      campaign_id BIGINT,
      adgroup_id BIGINT,
      keyword_id BIGINT,
      conditions_evaluated JSONB,
      conditions_met JSONB,
      metrics_snapshot JSONB,
      action_type VARCHAR(50) NOT NULL,
      previous_value JSONB,
      new_value JSONB,
      status VARCHAR(20) DEFAULT 'executed',
      error_message TEXT,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      execution_duration_ms INTEGER
    );

    -- Change History (Audit Log)
    CREATE TABLE IF NOT EXISTS asa_change_history (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id BIGINT NOT NULL,
      campaign_id BIGINT,
      adgroup_id BIGINT,
      keyword_id BIGINT,
      change_type VARCHAR(50) NOT NULL,
      field_name VARCHAR(100),
      old_value TEXT,
      new_value TEXT,
      source VARCHAR(50) NOT NULL,
      rule_id INTEGER REFERENCES asa_automation_rules(id) ON DELETE SET NULL,
      user_id VARCHAR(100),
      ip_address INET,
      user_agent TEXT,
      notes TEXT,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Campaign Templates
    CREATE TABLE IF NOT EXISTS asa_campaign_templates (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      template_type VARCHAR(50) DEFAULT 'campaign',
      campaign_settings JSONB NOT NULL DEFAULT '{}',
      adgroup_settings JSONB DEFAULT '{}',
      keywords JSONB DEFAULT '[]',
      negative_keywords JSONB DEFAULT '[]',
      variables JSONB DEFAULT '{}',
      times_used INTEGER DEFAULT 0,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_by VARCHAR(100) DEFAULT 'system'
    );

    -- Alerts
    CREATE TABLE IF NOT EXISTS asa_alerts (
      id SERIAL PRIMARY KEY,
      alert_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      message TEXT,
      rule_id INTEGER REFERENCES asa_automation_rules(id) ON DELETE SET NULL,
      campaign_id BIGINT,
      adgroup_id BIGINT,
      keyword_id BIGINT,
      channels JSONB DEFAULT '["log"]',
      delivered_to JSONB DEFAULT '[]',
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_at TIMESTAMP,
      acknowledged_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Scheduled Jobs
    CREATE TABLE IF NOT EXISTS asa_scheduled_jobs (
      id SERIAL PRIMARY KEY,
      job_name VARCHAR(100) NOT NULL UNIQUE,
      job_type VARCHAR(50) NOT NULL,
      schedule VARCHAR(100) NOT NULL,
      enabled BOOLEAN DEFAULT true,
      last_run_at TIMESTAMP,
      last_run_status VARCHAR(20),
      last_run_duration_ms INTEGER,
      last_error TEXT,
      next_run_at TIMESTAMP,
      settings JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_rules_enabled ON asa_automation_rules(enabled);
    CREATE INDEX IF NOT EXISTS idx_executions_rule_id ON asa_rule_executions(rule_id);
    CREATE INDEX IF NOT EXISTS idx_executions_executed_at ON asa_rule_executions(executed_at);
    CREATE INDEX IF NOT EXISTS idx_history_entity ON asa_change_history(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_history_changed_at ON asa_change_history(changed_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON asa_alerts(created_at);

    -- Views
    DROP VIEW IF EXISTS v_campaign_performance CASCADE;
    DROP VIEW IF EXISTS v_keyword_performance CASCADE;
    DROP VIEW IF EXISTS v_recent_rule_activity CASCADE;

    CREATE OR REPLACE VIEW v_recent_rule_activity AS
    SELECT
      r.id as rule_id,
      r.name as rule_name,
      r.scope,
      r.action_type,
      r.enabled,
      COUNT(e.id) as total_executions,
      COUNT(CASE WHEN e.executed_at >= CURRENT_DATE THEN 1 END) as today_executions,
      COUNT(CASE WHEN e.executed_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_executions,
      MAX(e.executed_at) as last_execution
    FROM asa_automation_rules r
    LEFT JOIN asa_rule_executions e ON r.id = e.rule_id AND e.status = 'executed'
    GROUP BY r.id, r.name, r.scope, r.action_type, r.enabled;

    -- Campaign performance with revenue from Qonversion
    CREATE OR REPLACE VIEW v_campaign_performance AS
    SELECT
      c.campaign_id,
      c.campaign_name,
      c.campaign_status,
      c.daily_budget,
      c.spend_7d,
      c.impressions_7d,
      c.taps_7d,
      c.installs_7d,
      c.cpa_7d,
      c.last_data_date,
      COALESCE(r.revenue_7d, 0) as revenue_7d,
      COALESCE(r.paid_users_7d, 0) as paid_users_7d,
      CASE WHEN c.spend_7d > 0 THEN COALESCE(r.revenue_7d, 0) / c.spend_7d ELSE 0 END as roas_7d,
      CASE WHEN COALESCE(r.paid_users_7d, 0) > 0 THEN c.spend_7d / r.paid_users_7d ELSE NULL END as cop_7d
    FROM (
      SELECT
        campaign_id,
        MAX(campaign_name) as campaign_name,
        MAX(campaign_status) as campaign_status,
        MAX(daily_budget) as daily_budget,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN spend ELSE 0 END) as spend_7d,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN impressions ELSE 0 END) as impressions_7d,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN taps ELSE 0 END) as taps_7d,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN installs ELSE 0 END) as installs_7d,
        CASE WHEN SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN installs ELSE 0 END) > 0
             THEN SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN spend ELSE 0 END) /
                  SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN installs ELSE 0 END)
             ELSE NULL
        END as cpa_7d,
        MAX(date) as last_data_date
      FROM apple_ads_campaigns
      GROUP BY campaign_id
    ) c
    LEFT JOIN (
      SELECT
        campaign_id,
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue_7d,
        COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_7d
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '7 days'
        AND campaign_id IS NOT NULL
      GROUP BY campaign_id
    ) r ON c.campaign_id = r.campaign_id;

    -- Keyword performance with revenue from Qonversion
    CREATE OR REPLACE VIEW v_keyword_performance AS
    SELECT
      k.keyword_id,
      k.campaign_id,
      k.adgroup_id,
      k.keyword_text,
      k.match_type,
      k.keyword_status,
      k.current_bid,
      k.spend_7d,
      k.impressions_7d,
      k.taps_7d,
      k.installs_7d,
      k.cpa_7d,
      k.ttr_7d,
      k.last_data_date,
      COALESCE(r.revenue_7d, 0) as revenue_7d,
      COALESCE(r.paid_users_7d, 0) as paid_users_7d,
      CASE WHEN k.spend_7d > 0 THEN COALESCE(r.revenue_7d, 0) / k.spend_7d ELSE 0 END as roas_7d,
      CASE WHEN COALESCE(r.paid_users_7d, 0) > 0 THEN k.spend_7d / r.paid_users_7d ELSE NULL END as cop_7d
    FROM (
      SELECT
        keyword_id,
        campaign_id,
        adgroup_id,
        MAX(keyword_text) as keyword_text,
        MAX(match_type) as match_type,
        MAX(keyword_status) as keyword_status,
        MAX(bid_amount) as current_bid,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN spend ELSE 0 END) as spend_7d,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN impressions ELSE 0 END) as impressions_7d,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN taps ELSE 0 END) as taps_7d,
        SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN installs ELSE 0 END) as installs_7d,
        CASE WHEN SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN installs ELSE 0 END) > 0
             THEN SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN spend ELSE 0 END) /
                  SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN installs ELSE 0 END)
             ELSE NULL
        END as cpa_7d,
        CASE WHEN SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN impressions ELSE 0 END) > 0
             THEN SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN taps ELSE 0 END)::DECIMAL /
                  SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days' THEN impressions ELSE 0 END) * 100
             ELSE NULL
        END as ttr_7d,
        MAX(date) as last_data_date
      FROM apple_ads_keywords
      GROUP BY keyword_id, campaign_id, adgroup_id
    ) k
    LEFT JOIN (
      SELECT
        keyword_id,
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue_7d,
        COUNT(DISTINCT CASE WHEN event_name IN ('Subscription Started', 'Trial Converted') THEN q_user_id END) as paid_users_7d
      FROM events_v2
      WHERE event_date >= CURRENT_DATE - INTERVAL '7 days'
        AND keyword_id IS NOT NULL
      GROUP BY keyword_id
    ) r ON k.keyword_id = r.keyword_id;
  `;

  try {
    await db.query(migrationSQL);
    res.json({
      success: true,
      message: 'ASA management schema migrated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({
      error: error.message,
      hint: 'Some tables may already exist'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
async function start() {
  try {
    // Test database connection
    await db.query('SELECT 1');
    console.log('Database connected successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Qonversion Attribution API running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Webhook URL: http://localhost:${PORT}/webhook`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
