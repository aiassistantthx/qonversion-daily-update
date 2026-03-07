const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const db = require('./db');
const webhookRouter = require('./routes/webhook');
const appleAds = require('./services/appleAds');

const app = express();
const PORT = process.env.PORT || 3000;

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

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Qonversion Attribution API',
    version: '1.0.0',
    endpoints: {
      'GET /': 'This info',
      'GET /health': 'Health check',
      'POST /webhook': 'Receive Qonversion webhooks',
      'GET /webhook/stats': 'Event statistics',
      'GET /apple-ads/test': 'Test Apple Ads connection',
      'POST /apple-ads/sync': 'Sync Apple Ads data',
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
