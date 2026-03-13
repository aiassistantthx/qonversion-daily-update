#!/usr/bin/env node
/**
 * Import Qonversion events from CSV export to database
 *
 * Usage:
 *   node import-csv-events.js /path/to/export.csv.gzip
 *   node import-csv-events.js /path/to/export.csv.gzip --dry-run
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Client } = require('pg');

// Database connection (use localhost:5433 for SSH tunnel)
const DB_URL = process.env.DATABASE_URL || 'postgres://qonversion:qonv_attr_2026@localhost:5433/qonversion_analytics';

// Parse args
const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (!csvPath) {
  console.error('Usage: node import-csv-events.js <csv-file.gzip> [--dry-run]');
  process.exit(1);
}

// Convert Qonversion event names to snake_case
function normalizeEventName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_');
}

async function main() {
  console.log(`Reading ${csvPath}...`);

  // Read and decompress file
  let csvData;
  if (csvPath.endsWith('.gzip') || csvPath.endsWith('.gz')) {
    const compressed = fs.readFileSync(csvPath);
    csvData = zlib.gunzipSync(compressed).toString('utf-8');
  } else {
    csvData = fs.readFileSync(csvPath, 'utf-8');
  }

  // Parse CSV
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(`Parsed ${records.length} records`);

  // Filter events we care about
  const relevantEvents = ['Subscription Started', 'Trial Started', 'Subscription Renewed',
                          'Trial Converted', 'Subscription Canceled', 'Subscription Expired',
                          'Trial Canceled', 'Trial Expired', 'Subscription Refunded'];

  const filteredRecords = records.filter(r => relevantEvents.includes(r['Event Name']));
  console.log(`Filtered to ${filteredRecords.length} relevant events`);

  // Group by date for summary
  const byDate = {};
  for (const r of filteredRecords) {
    const date = r['Event Date'].split(' ')[0];
    const event = r['Event Name'];
    byDate[date] = byDate[date] || {};
    byDate[date][event] = (byDate[date][event] || 0) + 1;
  }

  console.log('\nEvents by date:');
  for (const date of Object.keys(byDate).sort()) {
    const events = byDate[date];
    const total = Object.values(events).reduce((a, b) => a + b, 0);
    console.log(`  ${date}: ${total} events`);
    for (const [event, count] of Object.entries(events).sort((a, b) => b[1] - a[1])) {
      console.log(`    - ${event}: ${count}`);
    }
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made');
    return;
  }

  // Connect to database
  console.log('\nConnecting to database...');
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    // Get existing event IDs to avoid duplicates
    const { rows: existing } = await client.query(
      'SELECT event_id FROM events WHERE created_at >= $1',
      ['2026-03-09']
    );
    const existingIds = new Set(existing.map(r => r.event_id));
    console.log(`Found ${existingIds.size} existing events since 2026-03-09`);

    // Insert new events
    let inserted = 0;
    let skipped = 0;

    for (const record of filteredRecords) {
      const eventId = record['Transaction ID'];

      if (existingIds.has(eventId)) {
        skipped++;
        continue;
      }

      const eventName = normalizeEventName(record['Event Name']);
      const userId = record['Q User ID'];
      const productId = record['Product ID'];
      const revenueUsd = parseFloat(record['Proceeds USD']) || 0;
      const platform = record['Platform'] || 'iOS';
      const createdAt = record['Event Date'];

      // Build raw payload with useful fields
      const rawPayload = {
        transaction_id: eventId,
        currency: record['Currency'],
        price: parseFloat(record['Price']) || 0,
        price_usd: parseFloat(record['Price USD']) || 0,
        proceeds_usd: revenueUsd,
        country: record['Country'],
        device: record['Device'],
        install_date: record['Install Date'],
        media_source: record['Media source'],
        campaign: record['Campaign'],
        ad_set: record['Ad Set'],
        ad: record['Ad'],
        app_version: record['App version'],
        user_properties: record['User properties'] ? JSON.parse(record['User properties'].replace(/""/g, '"')) : {},
      };

      try {
        await client.query(
          `INSERT INTO events (event_id, user_id, event_name, product_id, revenue_usd, platform, environment, created_at, raw_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (event_id) DO NOTHING`,
          [eventId, userId, eventName, productId, revenueUsd, platform, 'production', createdAt, rawPayload]
        );
        inserted++;
      } catch (err) {
        console.error(`Error inserting ${eventId}: ${err.message}`);
      }
    }

    console.log(`\nInserted: ${inserted}, Skipped (duplicates): ${skipped}`);

    // Verify counts
    const { rows: counts } = await client.query(`
      SELECT DATE(created_at) as date,
             COUNT(*) FILTER (WHERE event_name IN ('subscription_started', 'trial_started')) as new_subs,
             COUNT(*) FILTER (WHERE event_name = 'subscription_started' AND revenue_usd = 0) as trials,
             COUNT(*) FILTER (WHERE event_name = 'subscription_started' AND revenue_usd > 0 AND product_id LIKE '%year%') as yearly
      FROM events
      WHERE created_at >= '2026-03-09'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    console.log('\nDatabase counts after import:');
    for (const row of counts) {
      console.log(`  ${row.date.toISOString().split('T')[0]}: new_subs=${row.new_subs}, trials=${row.trials}, yearly=${row.yearly}`);
    }

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
