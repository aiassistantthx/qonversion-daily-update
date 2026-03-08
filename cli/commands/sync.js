/**
 * Sync Command
 */

const { Command } = require('commander');
const appleAds = require('../../api/services/appleAds');
const db = require('../../api/db');

const program = new Command('sync')
  .description('Sync Apple Search Ads data');

// Full sync
program
  .command('full')
  .description('Full sync of campaigns, ad groups, and keywords')
  .option('-d, --days <days>', 'Number of days to sync', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      console.log(`Starting full sync for last ${days} days...`);

      const startTime = Date.now();
      const results = await appleAds.fullSync(days);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\nSync completed:');
      console.log(`  Campaigns: ${results.campaigns.reduce((sum, r) => sum + (r.synced || 0), 0)} records`);
      console.log(`  Ad Groups: ${results.adgroups.reduce((sum, r) => sum + (r.synced || 0), 0)} records`);
      console.log(`  Keywords:  ${results.keywords.reduce((sum, r) => sum + (r.synced || 0), 0)} records`);
      console.log(`  Duration:  ${duration}s`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Incremental sync (last day only)
program
  .command('incremental')
  .description('Sync only yesterday\'s data')
  .action(async () => {
    try {
      console.log('Starting incremental sync...');

      const startTime = Date.now();
      const results = await appleAds.fullSync(1);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\nIncremental sync completed:');
      console.log(`  Campaigns: ${results.campaigns.reduce((sum, r) => sum + (r.synced || 0), 0)} records`);
      console.log(`  Ad Groups: ${results.adgroups.reduce((sum, r) => sum + (r.synced || 0), 0)} records`);
      console.log(`  Keywords:  ${results.keywords.reduce((sum, r) => sum + (r.synced || 0), 0)} records`);
      console.log(`  Duration:  ${duration}s`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Campaigns only
program
  .command('campaigns')
  .description('Sync campaign data only')
  .option('-d, --days <days>', 'Number of days to sync', '7')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);
      console.log(`Syncing campaigns for last ${days} days...`);

      const results = await appleAds.syncRecentData(days);

      const total = results.reduce((sum, r) => sum + (r.synced || 0), 0);
      console.log(`Synced ${total} campaign records`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Single campaign deep sync
program
  .command('campaign <campaignId>')
  .description('Deep sync for a specific campaign')
  .option('-d, --days <days>', 'Number of days to sync', '7')
  .action(async (campaignId, options) => {
    try {
      const days = parseInt(options.days);
      console.log(`Syncing campaign ${campaignId} for last ${days} days...`);

      const today = new Date();
      let adgroupsTotal = 0;
      let keywordsTotal = 0;

      for (let i = 1; i <= days; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        console.log(`  ${dateStr}...`);

        const agResult = await appleAds.syncAdGroupData(campaignId, date);
        adgroupsTotal += agResult.synced || 0;

        const kwResult = await appleAds.syncKeywordData(campaignId, date);
        keywordsTotal += kwResult.synced || 0;
      }

      console.log(`\nSync completed for campaign ${campaignId}:`);
      console.log(`  Ad Groups: ${adgroupsTotal} records`);
      console.log(`  Keywords:  ${keywordsTotal} records`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Check sync status
program
  .command('status')
  .description('Show sync status and data freshness')
  .action(async () => {
    try {
      console.log('\nSync Status:');
      console.log('─'.repeat(60));

      // Check API connection
      const testResult = await appleAds.testConnection();
      console.log(`API Connection: ${testResult.success ? 'OK' : 'FAILED'}`);
      if (testResult.success) {
        console.log(`  Campaigns: ${testResult.campaignCount}`);
      } else {
        console.log(`  Error: ${testResult.error}`);
      }

      // Check data freshness
      const campaignsFreshness = await db.query(`
        SELECT
          MAX(date) as latest_date,
          COUNT(DISTINCT date) as dates_count,
          COUNT(DISTINCT campaign_id) as campaigns_count
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - 30
      `);

      const keywordsFreshness = await db.query(`
        SELECT
          MAX(date) as latest_date,
          COUNT(DISTINCT date) as dates_count,
          COUNT(DISTINCT keyword_id) as keywords_count
        FROM apple_ads_keywords
        WHERE date >= CURRENT_DATE - 30
      `);

      console.log('\nData Freshness (last 30 days):');
      console.log('─'.repeat(60));

      if (campaignsFreshness.rows[0].latest_date) {
        console.log('Campaigns:');
        console.log(`  Latest Data:    ${campaignsFreshness.rows[0].latest_date}`);
        console.log(`  Days with Data: ${campaignsFreshness.rows[0].dates_count}`);
        console.log(`  Unique Campaigns: ${campaignsFreshness.rows[0].campaigns_count}`);
      } else {
        console.log('Campaigns: No data');
      }

      if (keywordsFreshness.rows[0].latest_date) {
        console.log('\nKeywords:');
        console.log(`  Latest Data:    ${keywordsFreshness.rows[0].latest_date}`);
        console.log(`  Days with Data: ${keywordsFreshness.rows[0].dates_count}`);
        console.log(`  Unique Keywords: ${keywordsFreshness.rows[0].keywords_count}`);
      } else {
        console.log('\nKeywords: No data');
      }

      // Check sync log
      const syncLog = await db.query(`
        SELECT sync_type, status, records_synced, started_at, completed_at, error_message
        FROM apple_ads_sync_log
        ORDER BY started_at DESC
        LIMIT 5
      `);

      if (syncLog.rows.length > 0) {
        console.log('\nRecent Syncs:');
        console.log('─'.repeat(60));
        for (const log of syncLog.rows) {
          const time = new Date(log.started_at).toISOString().slice(0, 16).replace('T', ' ');
          console.log(`  ${time} | ${log.sync_type} | ${log.status} | ${log.records_synced} records`);
          if (log.error_message) {
            console.log(`    Error: ${log.error_message}`);
          }
        }
      }

      console.log('');

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Test API connection
program
  .command('test')
  .description('Test Apple Ads API connection')
  .action(async () => {
    try {
      console.log('Testing Apple Ads API connection...');

      const result = await appleAds.testConnection();

      if (result.success) {
        console.log('\nConnection successful!');
        console.log(`Found ${result.campaignCount} campaigns:`);
        for (const c of result.campaigns) {
          console.log(`  - ${c.id}: ${c.name} (${c.status})`);
        }
      } else {
        console.log('\nConnection failed!');
        console.log(`Error: ${result.error}`);
        process.exit(1);
      }

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

module.exports = program;
