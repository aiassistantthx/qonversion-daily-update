/**
 * Campaigns Command
 */

const { Command } = require('commander');
const appleAds = require('../../api/services/appleAds');
const db = require('../../api/db');

const program = new Command('campaigns')
  .description('Manage campaigns');

// List campaigns
program
  .command('list')
  .description('List all campaigns')
  .option('-s, --status <status>', 'Filter by status (ENABLED, PAUSED)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const campaigns = await appleAds.getCampaigns();

      let filtered = campaigns;
      if (options.status) {
        filtered = campaigns.filter(c => c.status === options.status.toUpperCase());
      }

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      console.log('\nCampaigns:');
      console.log('─'.repeat(100));
      console.log(
        'ID'.padEnd(15) +
        'Name'.padEnd(40) +
        'Status'.padEnd(12) +
        'Daily Budget'.padEnd(15) +
        'Country'
      );
      console.log('─'.repeat(100));

      for (const c of filtered) {
        console.log(
          String(c.id).padEnd(15) +
          (c.name || '').substring(0, 38).padEnd(40) +
          (c.status || '').padEnd(12) +
          (c.dailyBudgetAmount?.amount || '-').padEnd(15) +
          (c.countriesOrRegions?.join(', ') || '-')
        );
      }

      console.log('─'.repeat(100));
      console.log(`Total: ${filtered.length} campaigns\n`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Get campaign details
program
  .command('get <campaignId>')
  .description('Get campaign details')
  .option('--json', 'Output as JSON')
  .action(async (campaignId, options) => {
    try {
      const campaign = await appleAds.getCampaign(campaignId);
      const adGroups = await appleAds.getAdGroups(campaignId);

      if (options.json) {
        console.log(JSON.stringify({ campaign, adGroups }, null, 2));
        return;
      }

      console.log('\nCampaign Details:');
      console.log('─'.repeat(60));
      console.log(`ID:            ${campaign.id}`);
      console.log(`Name:          ${campaign.name}`);
      console.log(`Status:        ${campaign.status}`);
      console.log(`Daily Budget:  ${campaign.dailyBudgetAmount?.amount} ${campaign.dailyBudgetAmount?.currency}`);
      console.log(`Total Budget:  ${campaign.budgetAmount?.amount || 'N/A'} ${campaign.budgetAmount?.currency || ''}`);
      console.log(`Countries:     ${campaign.countriesOrRegions?.join(', ')}`);
      console.log(`Ad Groups:     ${adGroups.length}`);
      console.log('─'.repeat(60));

      if (adGroups.length > 0) {
        console.log('\nAd Groups:');
        for (const ag of adGroups) {
          console.log(`  - ${ag.id}: ${ag.name} (${ag.status}) - Default bid: ${ag.defaultBidAmount?.amount || 'N/A'}`);
        }
      }

      console.log('');

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Pause campaign
program
  .command('pause <campaignId>')
  .description('Pause a campaign')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (campaignId, options) => {
    try {
      const campaign = await appleAds.getCampaign(campaignId);

      if (campaign.status === 'PAUSED') {
        console.log(`Campaign ${campaignId} is already paused.`);
        return;
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would pause campaign: ${campaign.name} (${campaignId})`);
        return;
      }

      await appleAds.updateCampaignStatus(campaignId, 'PAUSED');
      console.log(`Campaign paused: ${campaign.name} (${campaignId})`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Enable campaign
program
  .command('enable <campaignId>')
  .description('Enable a campaign')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (campaignId, options) => {
    try {
      const campaign = await appleAds.getCampaign(campaignId);

      if (campaign.status === 'ENABLED') {
        console.log(`Campaign ${campaignId} is already enabled.`);
        return;
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would enable campaign: ${campaign.name} (${campaignId})`);
        return;
      }

      await appleAds.updateCampaignStatus(campaignId, 'ENABLED');
      console.log(`Campaign enabled: ${campaign.name} (${campaignId})`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Update campaign budget
program
  .command('budget <campaignId> <amount>')
  .description('Update campaign daily budget')
  .option('--currency <currency>', 'Currency code', 'USD')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (campaignId, amount, options) => {
    try {
      const budget = parseFloat(amount);
      if (isNaN(budget) || budget <= 0) {
        console.error('Invalid budget amount');
        process.exit(1);
      }

      const campaign = await appleAds.getCampaign(campaignId);

      if (options.dryRun) {
        console.log(`[DRY RUN] Would update budget for ${campaign.name}:`);
        console.log(`  Current: ${campaign.dailyBudgetAmount?.amount} ${campaign.dailyBudgetAmount?.currency}`);
        console.log(`  New:     ${budget} ${options.currency}`);
        return;
      }

      await appleAds.updateCampaignBudget(campaignId, budget, options.currency);
      console.log(`Budget updated for ${campaign.name}:`);
      console.log(`  Previous: ${campaign.dailyBudgetAmount?.amount} ${campaign.dailyBudgetAmount?.currency}`);
      console.log(`  New:      ${budget} ${options.currency}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Performance summary
program
  .command('performance')
  .description('Show performance summary for all campaigns')
  .option('-d, --days <days>', 'Number of days', '7')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const days = parseInt(options.days);

      const result = await db.query(`
        SELECT
          campaign_id,
          MAX(campaign_name) as name,
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(taps) as taps,
          SUM(installs) as installs,
          CASE WHEN SUM(installs) > 0 THEN SUM(spend) / SUM(installs) ELSE NULL END as cpa,
          CASE WHEN SUM(taps) > 0 THEN SUM(spend) / SUM(taps) ELSE NULL END as cpt,
          CASE WHEN SUM(impressions) > 0 THEN SUM(taps)::float / SUM(impressions) * 100 ELSE NULL END as ttr
        FROM apple_ads_campaigns
        WHERE date >= CURRENT_DATE - $1
        GROUP BY campaign_id
        ORDER BY spend DESC
      `, [days]);

      if (options.json) {
        console.log(JSON.stringify(result.rows, null, 2));
        return;
      }

      console.log(`\nCampaign Performance (Last ${days} days):`);
      console.log('─'.repeat(120));
      console.log(
        'Campaign'.padEnd(35) +
        'Spend'.padStart(12) +
        'Impr'.padStart(10) +
        'Taps'.padStart(10) +
        'Installs'.padStart(10) +
        'CPA'.padStart(10) +
        'CPT'.padStart(10) +
        'TTR'.padStart(10)
      );
      console.log('─'.repeat(120));

      for (const row of result.rows) {
        console.log(
          (row.name || '').substring(0, 33).padEnd(35) +
          `$${parseFloat(row.spend || 0).toFixed(2)}`.padStart(12) +
          String(row.impressions || 0).padStart(10) +
          String(row.taps || 0).padStart(10) +
          String(row.installs || 0).padStart(10) +
          (row.cpa ? `$${parseFloat(row.cpa).toFixed(2)}` : '-').padStart(10) +
          (row.cpt ? `$${parseFloat(row.cpt).toFixed(2)}` : '-').padStart(10) +
          (row.ttr ? `${parseFloat(row.ttr).toFixed(2)}%` : '-').padStart(10)
        );
      }

      console.log('─'.repeat(120));
      console.log('');

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

module.exports = program;
