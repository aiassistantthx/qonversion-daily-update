#!/usr/bin/env node
/**
 * Import Qonversion events CSV export via API
 *
 * Usage:
 *   node import-events-csv.js /path/to/export.csv [--dry-run]
 */

const fs = require('fs');
const readline = require('readline');

const API_URL = process.env.API_URL || 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io';
const DRY_RUN = process.argv.includes('--dry-run');
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: node import-events-csv.js <csv-file> [--dry-run]');
  process.exit(1);
}

// Parse CSV line handling quoted fields with commas inside
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

async function sendBatch(events) {
  const response = await fetch(`${API_URL}/webhook/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

async function main() {
  console.log(`Importing from: ${csvPath}`);
  console.log(`API: ${API_URL}`);
  console.log(`Dry run: ${DRY_RUN}`);

  const fileStream = fs.createReadStream(csvPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let headers = null;
  let lineCount = 0;
  let insertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const batch = [];
  const BATCH_SIZE = 200;

  const processBatch = async () => {
    if (batch.length === 0) return;

    if (DRY_RUN) {
      insertedCount += batch.length;
      batch.length = 0;
      return;
    }

    try {
      const result = await sendBatch(batch);
      insertedCount += result.inserted || 0;
      errorCount += result.errors || 0;
    } catch (err) {
      console.error('API error:', err.message);
      errorCount += batch.length;
    }

    batch.length = 0;
  };

  for await (const line of rl) {
    if (!headers) {
      headers = parseCSVLine(line);
      console.log(`Headers: ${headers.length} columns`);
      continue;
    }

    lineCount++;
    const fields = parseCSVLine(line);

    if (fields.length < 20) {
      skippedCount++;
      continue;
    }

    // Map CSV columns to DB columns
    // 0: Event Date, 1: Transaction ID, 3: Event Name, 5: Platform, 7: Product ID
    // 12: Price USD, 14: Refund, 15: Q User ID, 17: Device, 20: Country
    // 22: Install Date, 23: Media source, 24: Campaign, 27: App version

    const eventDate = fields[0];
    const transactionId = fields[1] || null;
    const eventName = fields[3];
    const platform = fields[5];
    const productId = fields[7];
    const priceUsd = parseFloat(fields[12]) || 0;
    const refund = fields[14]?.toLowerCase() === 'true' || fields[14] === '1';
    const qUserId = fields[15];
    const device = fields[17] || null;
    const country = fields[20];
    const installDate = fields[22] || null;
    const mediaSource = fields[23] || null;
    const campaignName = fields[24] || null;
    const appVersion = fields[27] || null;

    if (!qUserId || !eventDate) {
      skippedCount++;
      continue;
    }

    batch.push({
      transaction_id: transactionId,
      event_date: eventDate,
      event_name: eventName,
      q_user_id: qUserId,
      product_id: productId,
      price_usd: priceUsd,
      refund: refund,
      platform: platform,
      country: country,
      install_date: installDate,
      media_source: mediaSource,
      campaign_name: campaignName,
      device: device,
      app_version: appVersion
    });

    if (batch.length >= BATCH_SIZE) {
      await processBatch();
      if (lineCount % 10000 === 0) {
        console.log(`  Processed ${lineCount} lines, inserted ${insertedCount}...`);
      }
    }
  }

  // Process remaining
  await processBatch();

  console.log(`\nDone!`);
  console.log(`  Total lines: ${lineCount}`);
  console.log(`  Inserted: ${insertedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
  console.log(`  Errors: ${errorCount}`);

  // Get final stats
  if (!DRY_RUN) {
    try {
      const response = await fetch(`${API_URL}/dashboard/debug`);
      const stats = await response.json();
      console.log(`\nNew date range: ${stats.dateRange?.min_date} — ${stats.dateRange?.max_date}`);
      console.log(`Total events: ${stats.dateRange?.total}`);
    } catch (e) {}
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
