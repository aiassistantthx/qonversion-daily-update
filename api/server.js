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
