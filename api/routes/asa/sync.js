/**
 * Sync Operations routes for ASA Management
 */

const express = require('express');
const router = express.Router();
const appleAds = require('../../services/appleAds');
const { recordChange, db } = require('./utils');

/**
 * GET /asa/sync/status
 * Get current sync status and last sync time
 */
router.get('/status', async (req, res) => {
  try {
    const lastSyncResult = await db.query(`
      SELECT
        MAX(updated_at) as last_sync,
        MAX(date) as last_data_date,
        COUNT(DISTINCT campaign_id) as campaigns_synced
      FROM apple_ads_campaigns
    `);

    const syncHistoryResult = await db.query(`
      SELECT
        changed_at as timestamp,
        change_type,
        CASE
          WHEN source = 'sync' THEN 'success'
          WHEN source = 'sync_error' THEN 'error'
          ELSE 'unknown'
        END as status,
        new_value as message
      FROM asa_change_history
      WHERE entity_type = 'sync'
      ORDER BY changed_at DESC
      LIMIT 10
    `);

    const runningSyncResult = await db.query(`
      SELECT COUNT(*) as running
      FROM asa_change_history
      WHERE entity_type = 'sync'
        AND change_type = 'started'
        AND changed_at > NOW() - INTERVAL '5 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM asa_change_history h2
          WHERE h2.entity_type = 'sync'
            AND h2.change_type IN ('completed', 'error')
            AND h2.changed_at > asa_change_history.changed_at
        )
    `);

    const isSyncing = parseInt(runningSyncResult.rows[0]?.running || 0) > 0;
    const lastSync = lastSyncResult.rows[0];

    res.json({
      status: isSyncing ? 'syncing' : 'idle',
      lastSync: lastSync?.last_sync || null,
      lastDataDate: lastSync?.last_data_date || null,
      campaignsSynced: parseInt(lastSync?.campaigns_synced || 0),
      history: syncHistoryResult.rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/sync
 * Trigger full data sync
 */
router.post('/', async (req, res) => {
  try {
    const { days = 7 } = req.query;

    await recordChange('sync', 'manual', 'started', null, null, `Starting sync for ${days} days`, 'sync', null, req);

    const results = await appleAds.fullSync(parseInt(days));

    await recordChange('sync', 'manual', 'completed', null, null, JSON.stringify({
      days: parseInt(days),
      campaigns: results?.campaigns || 0,
      keywords: results?.keywords || 0
    }), 'sync', null, req);

    res.json({
      success: true,
      days: parseInt(days),
      results
    });
  } catch (error) {
    await recordChange('sync', 'manual', 'error', null, null, error.message, 'sync_error', null, req);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/sync/incremental
 * Incremental sync (last day only)
 */
router.post('/incremental', async (req, res) => {
  try {
    const results = await appleAds.fullSync(1);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /asa/sync/changes
 * Sync changes made directly in Apple Ads (detects bid/status changes)
 */
router.post('/changes', async (req, res) => {
  try {
    await recordChange('sync', 'changes', 'started', null, null, 'Starting change detection sync', 'sync', null, req);

    const changes = await appleAds.syncChanges();

    await recordChange('sync', 'changes', 'completed', null, null, JSON.stringify({
      campaigns: changes.campaigns,
      adgroups: changes.adgroups,
      keywords: changes.keywords,
      total: changes.campaigns + changes.adgroups + changes.keywords
    }), 'sync', null, req);

    res.json({
      success: true,
      changes
    });
  } catch (error) {
    await recordChange('sync', 'changes', 'error', null, null, error.message, 'sync', null, req);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
