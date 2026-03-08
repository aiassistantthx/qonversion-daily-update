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
