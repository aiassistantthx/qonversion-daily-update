#!/usr/bin/env node
/**
 * Sync Qonversion analytics data to PostgreSQL
 *
 * Fetches daily data by country for:
 * - users-overview (installs)
 * - proceeds (revenue after Apple commission)
 * - active-subscriptions
 *
 * Usage:
 *   node sync-qonversion-metrics.js              # full sync from project start
 *   node sync-qonversion-metrics.js --days=30    # last 30 days only
 *   node sync-qonversion-metrics.js --chart=users-overview  # specific chart only
 */

const { Pool } = require('pg');

const API_KEY = 'bfGiq4khkfuQNe-Dxmvuspxtboqmcuy-';
const BASE_URL = `https://api.qonversion.io/v1/analytics/${API_KEY}`;
const ENVIRONMENT = 1; // Production

// Project started May 2023
const PROJECT_START = new Date('2023-05-01').getTime() / 1000;

const CHARTS = ['users-overview', 'proceeds', 'active-subscriptions'];

// Rate limit: 30 req/min -> ~2 sec between requests
const RATE_LIMIT_MS = 2100;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'qonversion_analytics',
  user: process.env.DB_USER || 'qonversion',
  password: process.env.DB_PASSWORD || 'qonv_attr_2026',
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChart(chart, unit, from, to, segmentation, retries = 3) {
  const params = new URLSearchParams({
    environment: ENVIRONMENT,
    unit,
    from: Math.floor(from),
    to: Math.floor(to),
  });
  if (segmentation) params.set('segmentation', segmentation);

  const url = `${BASE_URL}/chart/${chart}?${params}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      if (res.status >= 500 && attempt < retries) {
        console.log(`    Retry ${attempt}/${retries} after ${res.status}...`);
        await sleep(5000 * attempt);
        continue;
      }
      throw new Error(`API error ${res.status}`);
    } catch (err) {
      if (attempt < retries && (err.code === 'ECONNRESET' || err.message.includes('502') || err.message.includes('503'))) {
        console.log(`    Retry ${attempt}/${retries}: ${err.message}`);
        await sleep(5000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

async function upsertBatch(rows) {
  if (rows.length === 0) return 0;

  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const row of rows) {
    placeholders.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5})`);
    values.push(row.date, row.country, row.chart_type, row.series_label, row.value, row.environment);
    idx += 6;
  }

  const query = `
    INSERT INTO qonversion_daily_metrics (date, country, chart_type, series_label, value, environment)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (date, country, chart_type, series_label, environment)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;

  const result = await pool.query(query, values);
  return result.rowCount;
}

async function syncChart(chart, from, to) {
  console.log(`\n📊 Syncing ${chart}...`);

  // 1. Fetch total (no segmentation) - daily
  console.log(`  Fetching total daily data...`);
  const totalData = await fetchChart(chart, 'day', from, to);
  await sleep(RATE_LIMIT_MS);

  let totalRows = 0;
  const totalSeries = totalData.data?.series || [];

  for (const series of totalSeries) {
    const rows = (series.data || []).map(point => ({
      date: new Date(point.start_time * 1000).toISOString().split('T')[0],
      country: '_total',
      chart_type: chart,
      series_label: series.label,
      value: point.value,
      environment: ENVIRONMENT,
    }));

    // Batch insert in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      totalRows += await upsertBatch(chunk);
    }
  }
  console.log(`  Total: ${totalRows} rows`);

  // 2. Fetch by country - need to chunk by 6-month periods for daily data
  // (API has maxSeries=50 countries, daily data can be large)
  console.log(`  Fetching by country...`);

  let countryRows = 0;
  const chunkSize = 180 * 86400; // 180 days in seconds
  let chunkFrom = from;

  while (chunkFrom < to) {
    const chunkTo = Math.min(chunkFrom + chunkSize, to);
    const fromDate = new Date(chunkFrom * 1000).toISOString().split('T')[0];
    const toDate = new Date(chunkTo * 1000).toISOString().split('T')[0];
    console.log(`  Period ${fromDate} to ${toDate}...`);

    const countryData = await fetchChart(chart, 'day', chunkFrom, chunkTo, 'country');
    await sleep(RATE_LIMIT_MS);

    const countrySeries = countryData.data?.series || [];

    for (const series of countrySeries) {
      const rows = (series.data || []).map(point => ({
        date: new Date(point.start_time * 1000).toISOString().split('T')[0],
        country: series.label,
        chart_type: chart,
        series_label: 'Total',
        value: point.value,
        environment: ENVIRONMENT,
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        countryRows += await upsertBatch(chunk);
      }
    }

    chunkFrom = chunkTo;
  }
  console.log(`  Countries: ${countryRows} rows`);

  return totalRows + countryRows;
}

async function main() {
  const args = process.argv.slice(2);
  const daysArg = args.find(a => a.startsWith('--days='));
  const chartArg = args.find(a => a.startsWith('--chart='));

  const now = Date.now() / 1000;
  const from = daysArg
    ? now - parseInt(daysArg.split('=')[1]) * 86400
    : PROJECT_START;
  const to = now;

  const charts = chartArg
    ? [chartArg.split('=')[1]]
    : CHARTS;

  const fromDate = new Date(from * 1000).toISOString().split('T')[0];
  const toDate = new Date(to * 1000).toISOString().split('T')[0];

  console.log(`🚀 Syncing Qonversion metrics`);
  console.log(`   Period: ${fromDate} to ${toDate}`);
  console.log(`   Charts: ${charts.join(', ')}`);
  console.log(`   Environment: Production`);

  let totalInserted = 0;

  for (const chart of charts) {
    const count = await syncChart(chart, from, to);
    totalInserted += count;
  }

  console.log(`\n✅ Done! Total rows upserted: ${totalInserted}`);

  // Show summary
  const summary = await pool.query(`
    SELECT chart_type,
           COUNT(*) as rows,
           COUNT(DISTINCT date) as days,
           COUNT(DISTINCT country) as countries,
           MIN(date) as first_date,
           MAX(date) as last_date
    FROM qonversion_daily_metrics
    WHERE environment = $1
    GROUP BY chart_type
    ORDER BY chart_type
  `, [ENVIRONMENT]);

  console.log('\n📈 Database summary:');
  for (const row of summary.rows) {
    console.log(`  ${row.chart_type}: ${row.rows} rows, ${row.days} days, ${row.countries} countries (${row.first_date} to ${row.last_date})`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
