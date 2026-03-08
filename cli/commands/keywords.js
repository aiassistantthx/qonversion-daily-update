/**
 * Keywords Command
 */

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const appleAds = require('../../api/services/appleAds');
const db = require('../../api/db');

const program = new Command('keywords')
  .description('Manage keywords');

// List keywords
program
  .command('list <campaignId> <adGroupId>')
  .description('List keywords for an ad group')
  .option('--status <status>', 'Filter by status (ACTIVE, PAUSED)')
  .option('--json', 'Output as JSON')
  .action(async (campaignId, adGroupId, options) => {
    try {
      const keywords = await appleAds.getKeywords(campaignId, adGroupId);

      let filtered = keywords;
      if (options.status) {
        filtered = keywords.filter(k => k.status === options.status.toUpperCase());
      }

      if (options.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      console.log(`\nKeywords for Ad Group ${adGroupId}:`);
      console.log('─'.repeat(100));
      console.log(
        'ID'.padEnd(15) +
        'Keyword'.padEnd(35) +
        'Match'.padEnd(10) +
        'Status'.padEnd(10) +
        'Bid'.padEnd(10) +
        'Impressions'.padEnd(12)
      );
      console.log('─'.repeat(100));

      for (const k of filtered) {
        console.log(
          String(k.id).padEnd(15) +
          (k.text || '').substring(0, 33).padEnd(35) +
          (k.matchType || '').padEnd(10) +
          (k.status || '').padEnd(10) +
          (k.bidAmount?.amount || '-').padEnd(10) +
          (String(k.impressions || '-')).padEnd(12)
        );
      }

      console.log('─'.repeat(100));
      console.log(`Total: ${filtered.length} keywords\n`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Get keyword performance from local DB
program
  .command('performance <campaignId>')
  .description('Show keyword performance from synced data')
  .option('-d, --days <days>', 'Number of days', '7')
  .option('--min-spend <spend>', 'Minimum spend filter', '0')
  .option('--sort <field>', 'Sort by field (spend, cpa, installs)', 'spend')
  .option('--limit <limit>', 'Limit results', '50')
  .option('--json', 'Output as JSON')
  .action(async (campaignId, options) => {
    try {
      const days = parseInt(options.days);
      const minSpend = parseFloat(options.minSpend);
      const limit = parseInt(options.limit);

      const sortFields = {
        spend: 'spend DESC',
        cpa: 'cpa ASC NULLS LAST',
        installs: 'installs DESC',
        impressions: 'impressions DESC'
      };
      const orderBy = sortFields[options.sort] || 'spend DESC';

      const result = await db.query(`
        SELECT
          keyword_id,
          MAX(keyword_text) as keyword,
          MAX(match_type) as match_type,
          MAX(bid_amount) as current_bid,
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(taps) as taps,
          SUM(installs) as installs,
          CASE WHEN SUM(installs) > 0 THEN SUM(spend) / SUM(installs) ELSE NULL END as cpa,
          CASE WHEN SUM(taps) > 0 THEN SUM(spend) / SUM(taps) ELSE NULL END as cpt,
          CASE WHEN SUM(impressions) > 0 THEN SUM(taps)::float / SUM(impressions) * 100 ELSE NULL END as ttr
        FROM apple_ads_keywords
        WHERE campaign_id = $1
          AND date >= CURRENT_DATE - $2
        GROUP BY keyword_id
        HAVING SUM(spend) >= $3
        ORDER BY ${orderBy}
        LIMIT $4
      `, [campaignId, days, minSpend, limit]);

      if (options.json) {
        console.log(JSON.stringify(result.rows, null, 2));
        return;
      }

      console.log(`\nKeyword Performance (Campaign ${campaignId}, Last ${days} days):`);
      console.log('─'.repeat(130));
      console.log(
        'Keyword'.padEnd(30) +
        'Match'.padEnd(8) +
        'Bid'.padStart(8) +
        'Spend'.padStart(10) +
        'Impr'.padStart(10) +
        'Taps'.padStart(8) +
        'Inst'.padStart(8) +
        'CPA'.padStart(10) +
        'CPT'.padStart(8) +
        'TTR'.padStart(8)
      );
      console.log('─'.repeat(130));

      for (const row of result.rows) {
        console.log(
          (row.keyword || '').substring(0, 28).padEnd(30) +
          (row.match_type || '').substring(0, 6).padEnd(8) +
          (row.current_bid ? `$${parseFloat(row.current_bid).toFixed(2)}` : '-').padStart(8) +
          `$${parseFloat(row.spend || 0).toFixed(2)}`.padStart(10) +
          String(row.impressions || 0).padStart(10) +
          String(row.taps || 0).padStart(8) +
          String(row.installs || 0).padStart(8) +
          (row.cpa ? `$${parseFloat(row.cpa).toFixed(2)}` : '-').padStart(10) +
          (row.cpt ? `$${parseFloat(row.cpt).toFixed(2)}` : '-').padStart(8) +
          (row.ttr ? `${parseFloat(row.ttr).toFixed(1)}%` : '-').padStart(8)
        );
      }

      console.log('─'.repeat(130));
      console.log(`Showing ${result.rows.length} keywords with spend >= $${minSpend}\n`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Update single keyword bid
program
  .command('bid <keywordId> <newBid>')
  .description('Update keyword bid')
  .requiredOption('-c, --campaign <campaignId>', 'Campaign ID')
  .requiredOption('-a, --adgroup <adGroupId>', 'Ad Group ID')
  .option('--currency <currency>', 'Currency code', 'USD')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (keywordId, newBid, options) => {
    try {
      const bid = parseFloat(newBid);
      if (isNaN(bid) || bid <= 0) {
        console.error('Invalid bid amount');
        process.exit(1);
      }

      const keyword = await appleAds.getKeyword(options.campaign, options.adgroup, keywordId);

      if (options.dryRun) {
        console.log(`[DRY RUN] Would update bid for keyword "${keyword.text}":`);
        console.log(`  Current: $${keyword.bidAmount?.amount || 'N/A'}`);
        console.log(`  New:     $${bid.toFixed(2)}`);
        return;
      }

      await appleAds.updateKeywordBid(options.campaign, options.adgroup, keywordId, bid, options.currency);

      console.log(`Bid updated for keyword "${keyword.text}":`);
      console.log(`  Previous: $${keyword.bidAmount?.amount || 'N/A'}`);
      console.log(`  New:      $${bid.toFixed(2)}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Bulk update bids from CSV
program
  .command('bid-bulk')
  .description('Bulk update keyword bids from CSV file')
  .requiredOption('-f, --file <file>', 'CSV file with keyword_id, new_bid columns')
  .requiredOption('-c, --campaign <campaignId>', 'Campaign ID')
  .requiredOption('-a, --adgroup <adGroupId>', 'Ad Group ID')
  .option('--currency <currency>', 'Currency code', 'USD')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options) => {
    try {
      // Read CSV file
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const keywordIdIdx = header.indexOf('keyword_id');
      const bidIdx = header.indexOf('new_bid') !== -1 ? header.indexOf('new_bid') : header.indexOf('bid');

      if (keywordIdIdx === -1 || bidIdx === -1) {
        console.error('CSV must have keyword_id and new_bid (or bid) columns');
        process.exit(1);
      }

      // Parse rows
      const updates = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const keywordId = cols[keywordIdIdx];
        const newBid = parseFloat(cols[bidIdx]);

        if (keywordId && !isNaN(newBid) && newBid > 0) {
          updates.push({ keywordId, newBid });
        }
      }

      console.log(`\nParsed ${updates.length} bid updates from ${options.file}`);

      if (updates.length === 0) {
        console.log('No valid updates found.');
        return;
      }

      // Process updates
      let success = 0;
      let errors = 0;

      console.log('─'.repeat(80));
      console.log(
        'Keyword ID'.padEnd(20) +
        'Keyword'.padEnd(30) +
        'Old Bid'.padStart(10) +
        'New Bid'.padStart(10) +
        'Status'.padStart(10)
      );
      console.log('─'.repeat(80));

      for (const update of updates) {
        try {
          const keyword = await appleAds.getKeyword(options.campaign, options.adgroup, update.keywordId);
          const oldBid = keyword.bidAmount?.amount || 'N/A';

          if (options.dryRun) {
            console.log(
              update.keywordId.padEnd(20) +
              (keyword.text || '').substring(0, 28).padEnd(30) +
              `$${oldBid}`.padStart(10) +
              `$${update.newBid.toFixed(2)}`.padStart(10) +
              'DRY RUN'.padStart(10)
            );
            success++;
          } else {
            await appleAds.updateKeywordBid(options.campaign, options.adgroup, update.keywordId, update.newBid, options.currency);
            console.log(
              update.keywordId.padEnd(20) +
              (keyword.text || '').substring(0, 28).padEnd(30) +
              `$${oldBid}`.padStart(10) +
              `$${update.newBid.toFixed(2)}`.padStart(10) +
              'OK'.padStart(10)
            );
            success++;
          }
        } catch (error) {
          console.log(
            update.keywordId.padEnd(20) +
            '-'.padEnd(30) +
            '-'.padStart(10) +
            `$${update.newBid.toFixed(2)}`.padStart(10) +
            'ERROR'.padStart(10)
          );
          console.error(`  Error: ${error.message}`);
          errors++;
        }
      }

      console.log('─'.repeat(80));
      console.log(`\nSummary: ${success} successful, ${errors} errors${options.dryRun ? ' (dry run)' : ''}\n`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Pause keyword
program
  .command('pause <keywordId>')
  .description('Pause a keyword')
  .requiredOption('-c, --campaign <campaignId>', 'Campaign ID')
  .requiredOption('-a, --adgroup <adGroupId>', 'Ad Group ID')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (keywordId, options) => {
    try {
      const keyword = await appleAds.getKeyword(options.campaign, options.adgroup, keywordId);

      if (keyword.status === 'PAUSED') {
        console.log(`Keyword "${keyword.text}" is already paused.`);
        return;
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would pause keyword: "${keyword.text}" (${keywordId})`);
        return;
      }

      await appleAds.updateKeywordStatus(options.campaign, options.adgroup, keywordId, 'PAUSED');
      console.log(`Keyword paused: "${keyword.text}" (${keywordId})`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Enable keyword
program
  .command('enable <keywordId>')
  .description('Enable a keyword')
  .requiredOption('-c, --campaign <campaignId>', 'Campaign ID')
  .requiredOption('-a, --adgroup <adGroupId>', 'Ad Group ID')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (keywordId, options) => {
    try {
      const keyword = await appleAds.getKeyword(options.campaign, options.adgroup, keywordId);

      if (keyword.status === 'ACTIVE') {
        console.log(`Keyword "${keyword.text}" is already active.`);
        return;
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would enable keyword: "${keyword.text}" (${keywordId})`);
        return;
      }

      await appleAds.updateKeywordStatus(options.campaign, options.adgroup, keywordId, 'ACTIVE');
      console.log(`Keyword enabled: "${keyword.text}" (${keywordId})`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Add keywords from file
program
  .command('add-bulk')
  .description('Add keywords from CSV file')
  .requiredOption('-f, --file <file>', 'CSV file with keyword, match_type, bid columns')
  .requiredOption('-c, --campaign <campaignId>', 'Campaign ID')
  .requiredOption('-a, --adgroup <adGroupId>', 'Ad Group ID')
  .option('--currency <currency>', 'Currency code', 'USD')
  .option('--dry-run', 'Show what would be done without making changes')
  .action(async (options) => {
    try {
      const filePath = path.resolve(options.file);
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const keywordIdx = header.indexOf('keyword');
      const matchTypeIdx = header.indexOf('match_type');
      const bidIdx = header.indexOf('bid');

      if (keywordIdx === -1) {
        console.error('CSV must have a keyword column');
        process.exit(1);
      }

      const keywords = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        const text = cols[keywordIdx];
        const matchType = matchTypeIdx !== -1 ? cols[matchTypeIdx].toUpperCase() : 'EXACT';
        const bid = bidIdx !== -1 ? parseFloat(cols[bidIdx]) : null;

        if (text) {
          keywords.push({
            text,
            matchType: ['EXACT', 'BROAD'].includes(matchType) ? matchType : 'EXACT',
            bidAmount: bid && !isNaN(bid) ? { amount: String(bid), currency: options.currency } : undefined
          });
        }
      }

      console.log(`\nParsed ${keywords.length} keywords from ${options.file}`);

      if (keywords.length === 0) {
        console.log('No valid keywords found.');
        return;
      }

      if (options.dryRun) {
        console.log('\n[DRY RUN] Would add:');
        for (const kw of keywords) {
          console.log(`  - "${kw.text}" (${kw.matchType})${kw.bidAmount ? ` bid: $${kw.bidAmount.amount}` : ''}`);
        }
        return;
      }

      const result = await appleAds.createKeywords(options.campaign, options.adgroup, keywords);
      console.log(`\nCreated ${result.length} keywords:`);
      for (const kw of result) {
        console.log(`  - ${kw.id}: "${kw.text}" (${kw.matchType})`);
      }

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Export keywords to CSV
program
  .command('export <campaignId>')
  .description('Export keyword performance to CSV')
  .option('-d, --days <days>', 'Number of days', '7')
  .option('-o, --output <file>', 'Output file', 'keywords_export.csv')
  .action(async (campaignId, options) => {
    try {
      const days = parseInt(options.days);

      const result = await db.query(`
        SELECT
          keyword_id,
          MAX(campaign_id) as campaign_id,
          MAX(adgroup_id) as adgroup_id,
          MAX(keyword_text) as keyword,
          MAX(match_type) as match_type,
          MAX(bid_amount) as current_bid,
          SUM(spend) as spend,
          SUM(impressions) as impressions,
          SUM(taps) as taps,
          SUM(installs) as installs,
          CASE WHEN SUM(installs) > 0 THEN SUM(spend) / SUM(installs) ELSE NULL END as cpa
        FROM apple_ads_keywords
        WHERE campaign_id = $1
          AND date >= CURRENT_DATE - $2
        GROUP BY keyword_id
        ORDER BY spend DESC
      `, [campaignId, days]);

      // Generate CSV
      const headers = ['keyword_id', 'campaign_id', 'adgroup_id', 'keyword', 'match_type', 'current_bid', 'spend', 'impressions', 'taps', 'installs', 'cpa', 'suggested_bid'];
      const rows = result.rows.map(row => [
        row.keyword_id,
        row.campaign_id,
        row.adgroup_id,
        `"${row.keyword}"`,
        row.match_type,
        row.current_bid || '',
        parseFloat(row.spend || 0).toFixed(2),
        row.impressions,
        row.taps,
        row.installs,
        row.cpa ? parseFloat(row.cpa).toFixed(2) : '',
        '' // suggested_bid placeholder for user to fill
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      fs.writeFileSync(options.output, csv);
      console.log(`Exported ${result.rows.length} keywords to ${options.output}`);

    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

module.exports = program;
