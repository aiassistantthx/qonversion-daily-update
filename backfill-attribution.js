#!/usr/bin/env node
/**
 * Backfill campaign attribution from Qonversion CSV export
 *
 * Usage:
 *   node backfill-attribution.js /path/to/export.csv.gzip [--dry-run]
 */

const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const https = require('https');
const http = require('http');

const API_URL = process.env.API_URL || 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io';
const DRY_RUN = process.argv.includes('--dry-run');
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: node backfill-attribution.js <csv.gzip> [--dry-run]');
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

// HTTP request helper
function httpRequest(url, method, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log(`CSV file: ${csvPath}`);
  console.log(`API URL: ${API_URL}`);
  console.log(`Dry run: ${DRY_RUN}`);

  // 1. Get campaign mapping from API
  console.log('\n1. Fetching campaign name -> id mapping...');
  const mappingResponse = await httpRequest(`${API_URL}/backfill/campaign-mapping`, 'GET');
  const campaignMap = mappingResponse.mapping || {};
  console.log(`   Loaded ${Object.keys(campaignMap).length} campaign mappings`);

  // 2. Read CSV and build user -> campaign mapping
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

  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }

    lineCount++;
    const fields = parseCSVLine(line);

    // Column indexes based on header:
    // 15: Q User ID, 23: Media source, 24: Campaign
    const qUserId = fields[15];
    const mediaSource = fields[23];
    const campaignName = fields[24];

    if (mediaSource === 'Apple AdServices' && campaignName && qUserId) {
      asaCount++;

      // Try to find campaign_id
      let campaignId = campaignMap[campaignName];

      // Try numeric campaign name as ID
      if (!campaignId && /^\d+$/.test(campaignName)) {
        campaignId = campaignName;
      }

      if (campaignId) {
        matchedCount++;
        // Store only first occurrence (earliest attribution)
        if (!userCampaigns.has(qUserId)) {
          userCampaigns.set(qUserId, { campaign_name: campaignName, campaign_id: campaignId });
        }
      } else {
        unmatchedCampaigns.set(campaignName, (unmatchedCampaigns.get(campaignName) || 0) + 1);
      }
    }

    if (lineCount % 100000 === 0) {
      console.log(`   Processed ${lineCount} lines...`);
    }
  }

  console.log(`\n   Summary:`);
  console.log(`   - Total lines: ${lineCount}`);
  console.log(`   - ASA events: ${asaCount}`);
  console.log(`   - Matched campaigns: ${matchedCount}`);
  console.log(`   - Unique users with attribution: ${userCampaigns.size}`);

  // Show unmatched campaigns
  if (unmatchedCampaigns.size > 0) {
    console.log('\n   Top unmatched campaigns:');
    const sortedUnmatched = [...unmatchedCampaigns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [name, count] of sortedUnmatched) {
      console.log(`     ${name}: ${count}`);
    }
  }

  // 3. Send to API
  console.log('\n3. Sending to API...');

  if (DRY_RUN) {
    console.log('   [DRY RUN] Would send the following users:');
    let previewCount = 0;
    for (const [userId, data] of userCampaigns) {
      if (previewCount < 10) {
        console.log(`     ${userId} -> ${data.campaign_id} (${data.campaign_name})`);
        previewCount++;
      }
    }
    if (userCampaigns.size > 10) {
      console.log(`     ... and ${userCampaigns.size - 10} more`);
    }
    console.log('\n   Run without --dry-run to execute');
    return;
  }

  // Send in batches
  const batchSize = 500;
  const allUsers = [...userCampaigns.entries()];
  let totalUpdated = 0;

  for (let i = 0; i < allUsers.length; i += batchSize) {
    const batch = allUsers.slice(i, i + batchSize);
    const mappings = batch.map(([q_user_id, data]) => ({
      q_user_id,
      campaign_id: data.campaign_id,
      campaign_name: data.campaign_name,
    }));

    const response = await httpRequest(`${API_URL}/backfill/campaign-attribution`, 'POST', { mappings });

    if (response.error) {
      console.error(`   Batch ${i / batchSize + 1} error:`, response.error);
    } else {
      totalUpdated += response.rows_updated || 0;
      console.log(`   Batch ${i / batchSize + 1}/${Math.ceil(allUsers.length / batchSize)}: ${response.rows_updated} rows updated`);
    }
  }

  console.log(`\n   Total rows updated: ${totalUpdated}`);

  // 4. Get final stats
  console.log('\n4. Final stats:');
  const stats = await httpRequest(`${API_URL}/webhook/stats`, 'GET');
  if (stats.campaignIdCoverage) {
    for (const row of stats.campaignIdCoverage) {
      console.log(`   ${row.status}: ${row.users} users, $${parseFloat(row.revenue).toFixed(2)} revenue`);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
