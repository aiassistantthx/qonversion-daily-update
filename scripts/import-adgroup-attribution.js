#!/usr/bin/env node
/**
 * Import Qonversion CSV export to enrich events_v2 with adgroup_id
 * Uses API endpoint for database updates
 *
 * Usage: node import-adgroup-attribution.js <csv-file.gzip>
 */

const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const API_URL = process.env.API_URL || 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io';

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

async function sendBatch(records) {
  const response = await fetch(`${API_URL}/webhook/import-attribution`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function processCSV(filePath) {
  console.log(`Processing: ${filePath}`);
  console.log(`API URL: ${API_URL}`);

  const gunzip = zlib.createGunzip();
  const input = fs.createReadStream(filePath).pipe(gunzip);

  const rl = readline.createInterface({
    input,
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  let totalUpdated = 0;
  let totalNotFound = 0;
  let skipped = 0;
  let errors = 0;

  const batchSize = 500;
  let batch = [];

  // Track unique users to avoid duplicate API calls
  const processedUsers = new Set();

  async function flushBatch() {
    if (batch.length === 0) return;

    try {
      const result = await sendBatch(batch);
      totalUpdated += result.updated || 0;
      totalNotFound += result.notFound || 0;
    } catch (e) {
      errors += batch.length;
      console.error('Batch error:', e.message);
    }

    batch = [];
  }

  for await (const line of rl) {
    lineNum++;

    // Skip header
    if (lineNum === 1) continue;

    // Progress
    if (lineNum % 50000 === 0) {
      console.log(`Processed ${lineNum} lines, updated ${totalUpdated}, skipped ${skipped}, notFound ${totalNotFound}, errors ${errors}`);
    }

    try {
      const cols = parseCSVLine(line);

      // Column indices (0-based): 15=Q User ID, 23=Media source, 24=Campaign, 25=Ad Set
      const qUserId = cols[15]?.replace(/"/g, '');
      const mediaSource = cols[23]?.replace(/"/g, '');
      const campaignName = cols[24]?.replace(/"/g, '');
      const adSetName = cols[25]?.replace(/"/g, '');

      // Skip non-Apple Ads
      if (mediaSource !== 'Apple AdServices') {
        skipped++;
        continue;
      }

      if (!qUserId || !campaignName) {
        skipped++;
        continue;
      }

      // Skip already processed users
      if (processedUsers.has(qUserId)) {
        skipped++;
        continue;
      }
      processedUsers.add(qUserId);

      batch.push({ qUserId, campaignName, adSetName });

      if (batch.length >= batchSize) {
        await flushBatch();
      }

    } catch (e) {
      errors++;
      if (errors < 10) {
        console.error(`Line ${lineNum} error:`, e.message);
      }
    }
  }

  // Final flush
  await flushBatch();

  console.log('\n=== Import Complete ===');
  console.log(`Total lines: ${lineNum - 1}`);
  console.log(`Unique users processed: ${processedUsers.size}`);
  console.log(`Updated records: ${totalUpdated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Not found (campaign): ${totalNotFound}`);
  console.log(`Errors: ${errors}`);
}

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error('Usage: node import-adgroup-attribution.js <csv-file.gzip>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    await processCSV(filePath);
  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
}

main();
