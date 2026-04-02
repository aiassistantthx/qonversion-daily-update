/**
 * ASA Management Routes
 *
 * Main router that mounts all sub-routers for Apple Search Ads management.
 * Includes campaigns, ad groups, keywords, rules, templates, history, sync, and analytics.
 */

const express = require('express');
const router = express.Router();

// Import sub-routers
const campaignsRouter = require('./campaigns');
const adgroupsRouter = require('./adgroups');
const keywordsRouter = require('./keywords');
const searchTermsRouter = require('./searchTerms');
const rulesRouter = require('./rules');
const cohortsRouter = require('./cohorts');
const historyRouter = require('./history');
const syncRouter = require('./sync');
const analyticsRouter = require('./analytics');

// Mount campaign routes at root level for backward compatibility
// GET /asa/campaigns, POST /asa/campaigns, etc.
router.use('/campaigns', campaignsRouter);

// Ad group routes nested under campaigns for backward compatibility
// GET /asa/campaigns/:campaignId/adgroups, etc.
router.get('/campaigns/:campaignId/adgroups', (req, res, next) => {
  req.url = `/${req.params.campaignId}`;
  adgroupsRouter(req, res, next);
});
router.get('/campaigns/:campaignId/adgroups/:adGroupId', (req, res, next) => {
  req.url = `/${req.params.campaignId}/${req.params.adGroupId}`;
  adgroupsRouter(req, res, next);
});
router.put('/campaigns/:campaignId/adgroups/:adGroupId', (req, res, next) => {
  req.url = `/${req.params.campaignId}/${req.params.adGroupId}`;
  adgroupsRouter(req, res, next);
});
router.patch('/campaigns/:campaignId/adgroups/:adGroupId/status', (req, res, next) => {
  req.url = `/${req.params.campaignId}/${req.params.adGroupId}/status`;
  adgroupsRouter(req, res, next);
});
router.patch('/campaigns/:campaignId/adgroups/:adGroupId/bid', (req, res, next) => {
  req.url = `/${req.params.campaignId}/${req.params.adGroupId}/bid`;
  adgroupsRouter(req, res, next);
});

// Keywords nested under campaigns/adgroups for backward compatibility
router.get('/campaigns/:campaignId/adgroups/:adGroupId/keywords', async (req, res) => {
  const appleAds = require('../../services/appleAds');
  try {
    const { campaignId, adGroupId } = req.params;
    const keywords = await appleAds.getKeywords(campaignId, adGroupId);
    res.json({
      campaignId,
      adGroupId,
      total: keywords.length,
      data: keywords
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Keyword routes
// GET /asa/keywords, POST /asa/keywords/bulk, etc.
router.use('/keywords', keywordsRouter);

// Negative keywords (alias routes for backward compatibility)
router.get('/negative-keywords', (req, res, next) => {
  req.url = '/negative';
  keywordsRouter(req, res, next);
});
router.post('/negative-keywords', (req, res, next) => {
  req.url = '/negative';
  keywordsRouter(req, res, next);
});
router.delete('/negative-keywords/:keywordId', (req, res, next) => {
  req.url = `/negative/${req.params.keywordId}`;
  keywordsRouter(req, res, next);
});

// Search terms
router.use('/search-terms', searchTermsRouter);

// Keyword suggestions (alias for keywords/suggestions)
router.get('/keyword-suggestions', (req, res, next) => {
  req.url = '/suggestions';
  keywordsRouter(req, res, next);
});

// Automation rules
// GET /asa/rules, POST /asa/rules, etc.
router.use('/rules', rulesRouter);

// Rule templates and executions (mounted under rules for organization)
router.get('/rule-templates', (req, res, next) => {
  req.url = '/templates';
  rulesRouter(req, res, next);
});

router.get('/rule-executions', (req, res, next) => {
  req.url = '/executions';
  rulesRouter(req, res, next);
});

router.post('/rule-executions/:id/undo', (req, res, next) => {
  req.url = `/executions/${req.params.id}/undo`;
  rulesRouter(req, res, next);
});

// Cohorts and KPI
router.use('/cohorts', cohortsRouter);
router.get('/kpi/cohort-cac', (req, res, next) => {
  req.url = '/kpi/cohort-cac';
  cohortsRouter(req, res, next);
});
router.get('/debug/cohort-roas', (req, res, next) => {
  req.url = '/debug/cohort-roas';
  cohortsRouter(req, res, next);
});

// History / Audit log
router.use('/history', historyRouter);

// Sync operations
router.use('/sync', syncRouter);

// Analytics (countries, trends)
router.get('/countries', (req, res, next) => {
  req.url = '/countries';
  analyticsRouter(req, res, next);
});
router.get('/trends', (req, res, next) => {
  req.url = '/trends';
  analyticsRouter(req, res, next);
});

// Templates
router.get('/templates', (req, res, next) => {
  req.url = '/templates';
  analyticsRouter(req, res, next);
});
router.get('/templates/:id', (req, res, next) => {
  req.url = `/templates/${req.params.id}`;
  analyticsRouter(req, res, next);
});
router.post('/templates', (req, res, next) => {
  req.url = '/templates';
  analyticsRouter(req, res, next);
});
router.put('/templates/:id', (req, res, next) => {
  req.url = `/templates/${req.params.id}`;
  analyticsRouter(req, res, next);
});
router.delete('/templates/:id', (req, res, next) => {
  req.url = `/templates/${req.params.id}`;
  analyticsRouter(req, res, next);
});

// Alerts
router.get('/alerts', (req, res, next) => {
  req.url = '/alerts';
  analyticsRouter(req, res, next);
});
router.get('/alerts/summary', (req, res, next) => {
  req.url = '/alerts/summary';
  analyticsRouter(req, res, next);
});
router.patch('/alerts/:id/acknowledge', (req, res, next) => {
  req.url = `/alerts/${req.params.id}/acknowledge`;
  analyticsRouter(req, res, next);
});

// Annotations
router.get('/annotations', (req, res, next) => {
  req.url = '/annotations';
  analyticsRouter(req, res, next);
});
router.post('/annotations', (req, res, next) => {
  req.url = '/annotations';
  analyticsRouter(req, res, next);
});
router.put('/annotations/:id', (req, res, next) => {
  req.url = `/annotations/${req.params.id}`;
  analyticsRouter(req, res, next);
});
router.delete('/annotations/:id', (req, res, next) => {
  req.url = `/annotations/${req.params.id}`;
  analyticsRouter(req, res, next);
});

module.exports = router;
