#!/usr/bin/env node
/**
 * Import Qonversion CSV export and update events_v2 with campaign attribution
 *
 * Usage:
 *   node import-qonversion-csv.js /path/to/export.csv.gzip [--dry-run]
 */

const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/qonversion_analytics'
});

const DRY_RUN = process.argv.includes('--dry-run');
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: node import-qonversion-csv.js <csv.gzip> [--dry-run]');
  process.exit(1);
}

// Parse CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function main() {
  console.log(`Importing from: ${csvPath}`);
  console.log(`Dry run: ${DRY_RUN}`);

  // 1. Load campaign name -> id mapping from apple_ads_campaigns
  console.log('\n1. Loading campaign mapping from apple_ads_campaigns...');
  const campaignResult = await pool.query(`
    SELECT DISTINCT campaign_id, campaign_name
    FROM apple_ads_campaigns
    WHERE campaign_name IS NOT NULL
  `);

  const campaignMap = new Map();
  for (const row of campaignResult.rows) {
    campaignMap.set(row.campaign_name, row.campaign_id);
  }
  console.log(`   Loaded ${campaignMap.size} campaign mappings`);

  // 2. Read CSV and extract user -> campaign mapping
  console.log('\n2. Reading CSV export...');

  const userCampaigns = new Map(); // q_user_id -> { campaign_name, campaign_id }
  let lineCount = 0;
  let asaCount = 0;
  let matchedCount = 0;
  const unmatchedCampaigns = new Map();

  const fileStream = fs.createReadStream(csvPath);
  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: fileStream.pipe(gunzip),
    crlfDelay: Infinity
  });

  let headers = null;

  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVLine(line);
      // Find column indexes
      const mediaSourceIdx = headers.indexOf('Media source');
      const campaignIdx = headers.indexOf('Campaign');
      const userIdIdx = headers.indexOf('Q User ID');
      console.log(`   Columns: Media source=${mediaSourceIdx}, Campaign=${campaignIdx}, Q User ID=${userIdIdx}`);
      continue;
    }

    lineCount++;
    const fields = parseCSVLine(line);

    const mediaSource = fields[23]; // Media source
    const campaignName = fields[24]; // Campaign
    const qUserId = fields[15]; // Q User ID

    if (mediaSource === 'Apple AdServices' && campaignName && qUserId) {
      asaCount++;

      // Try to find campaign_id
      let campaignId = campaignMap.get(campaignName);

      // Try numeric campaign name as ID
      if (!campaignId && /^\d+$/.test(campaignName)) {
        campaignId = campaignName;
      }

      if (campaignId) {
        matchedCount++;
        // Store only first occurrence (earliest attribution)
        if (!userCampaigns.has(qUserId)) {
          userCampaigns.set(qUserId, { campaignName, campaignId });
        }
      } else {
        unmatchedCampaigns.set(campaignName, (unmatchedCampaigns.get(campaignName) || 0) + 1);
      }
    }

    if (lineCount % 100000 === 0) {
      console.log(`   Processed ${lineCount} lines...`);
    }
  }

  console.log(`   Total lines: ${lineCount}`);
  console.log(`   ASA events: ${asaCount}`);
  console.log(`   Matched campaigns: ${matchedCount}`);
  console.log(`   Unique users with attribution: ${userCampaigns.size}`);

  // Show unmatched campaigns
  console.log('\n   Top unmatched campaigns:');
  const sortedUnmatched = [...unmatchedCampaigns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [name, count] of sortedUnmatched) {
    console.log(`     ${name}: ${count}`);
  }

  // 3. Update events_v2
  console.log('\n3. Updating events_v2...');

  // First check how many users need updating
  const checkResult = await pool.query(`
    SELECT COUNT(DISTINCT q_user_id) as count
    FROM events_v2
    WHERE media_source = 'Apple AdServices'
      AND campaign_id IS NULL
  `);
  console.log(`   Users with ASA but no campaign_id: ${checkResult.rows[0].count}`);

  if (DRY_RUN) {
    console.log('\n   [DRY RUN] Would update the following users:');
    let previewCount = 0;
    for (const [userId, data] of userCampaigns) {
      if (previewCount < 10) {
        console.log(`     ${userId} -> campaign_id: ${data.campaignId} (${data.campaignName})`);
        previewCount++;
      }
    }
    if (userCampaigns.size > 10) {
      console.log(`     ... and ${userCampaigns.size - 10} more`);
    }
  } else {
    // Batch update
    let updated = 0;
    const batchSize = 500;
    const userIds = [...userCampaigns.keys()];

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);

      // Build update query with CASE
      const cases = batch.map((uid, idx) => {
        const data = userCampaigns.get(uid);
        return `WHEN q_user_id = $${idx + 1} THEN ${data.campaignId}`;
      }).join(' ');

      const nameCases = batch.map((uid, idx) => {
        const data = userCampaigns.get(uid);
        return `WHEN q_user_id = $${idx + 1} THEN '${data.campaignName.replace(/'/g, "''")}'`;
      }).join(' ');

      const result = await pool.query(`
        UPDATE events_v2
        SET
          campaign_id = CASE ${cases} END,
          campaign_name = CASE ${nameCases} END,
          media_source = COALESCE(media_source, 'Apple AdServices')
        WHERE q_user_id = ANY($${batch.length + 1})
          AND campaign_id IS NULL
      `, [...batch, batch]);

      updated += result.rowCount;

      if ((i + batchSize) % 5000 === 0 || i + batchSize >= userIds.length) {
        console.log(`   Updated ${updated} rows (${Math.round((i + batchSize) / userIds.length * 100)}%)`);
      }
    }

    console.log(`\n   Total updated: ${updated} rows`);
  }

  // 4. Final stats
  console.log('\n4. Final statistics:');
  const finalResult = await pool.query(`
    SELECT
      COUNT(DISTINCT q_user_id) as total_asa_users,
      COUNT(DISTINCT CASE WHEN campaign_id IS NOT NULL THEN q_user_id END) as with_campaign_id
    FROM events_v2
    WHERE media_source = 'Apple AdServices'
  `);
  console.log(`   ASA users: ${finalResult.rows[0].total_asa_users}`);
  console.log(`   With campaign_id: ${finalResult.rows[0].with_campaign_id}`);

  await pool.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
