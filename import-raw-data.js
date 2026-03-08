/**
 * Import Qonversion Raw Data Export
 */

const { createReadStream } = require('fs');
const { createGunzip } = require('zlib');
const { parse } = require('csv-parse');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const filePath = process.argv[2] || '/Users/ivorobyev/Downloads/q-export-20260307183741-w6PF18eJkZVmDx.csv.gzip';

async function importData() {
  console.log('🚀 Importing Qonversion Raw Data\n');
  console.log(`📁 File: ${filePath}\n`);

  let count = 0;
  let errors = 0;
  let skipped = 0;

  const parser = createReadStream(filePath)
    .pipe(createGunzip())
    .pipe(parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }));

  for await (const row of parser) {
    try {
      let userProps = null;
      try {
        if (row['User properties']) {
          userProps = JSON.parse(row['User properties']);
        }
      } catch (e) {
        userProps = null;
      }

      await pool.query(`
        INSERT INTO qonversion_events (
          event_date, transaction_id, transaction_date, event_name, app_name,
          platform, app_id, product_id, subscription_group, currency,
          price, proceeds, price_usd, proceeds_usd, refund,
          q_user_id, user_id, device, device_id, locale,
          country, os_version, install_date, media_source, campaign,
          ad_set, ad, app_version, sdk_version, user_properties, event_receive_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
        ON CONFLICT (transaction_id, event_name, event_date) DO NOTHING
      `, [
        row['Event Date'] || null,
        row['Transaction ID'] || null,
        row['Transaction Date'] || null,
        row['Event Name'] || null,
        row['App Name'] || null,
        row['Platform'] || null,
        row['App ID'] || null,
        row['Product ID'] || null,
        row['Subscription Group'] || null,
        row['Currency'] || null,
        parseFloat(row['Price']) || null,
        parseFloat(row['Proceeds']) || null,
        parseFloat(row['Price USD']) || null,
        parseFloat(row['Proceeds USD']) || null,
        row['Refund'] === 'true' || row['Refund'] === '1',
        row['Q User ID'] || null,
        row['User ID'] || null,
        row['Device'] || null,
        row['Device ID'] || null,
        row['Local'] || null,
        row['Country'] || null,
        row['OS Version'] || null,
        row['Install Date'] || null,
        row['Media source'] || null,
        row['Campaign'] || null,
        row['Ad Set'] || null,
        row['Ad'] || null,
        row['App version'] || null,
        row['SDK version'] || null,
        userProps,
        row['Event receive date'] || null,
      ]);

      count++;
      if (count % 5000 === 0) {
        process.stdout.write(`\r   Imported: ${count.toLocaleString()} records`);
      }
    } catch (e) {
      if (e.code === '23505') {
        skipped++;
      } else {
        errors++;
        if (errors < 5) {
          console.error(`\n   Error: ${e.message}`);
        }
      }
    }
  }

  console.log(`\n\n✅ Done!`);
  console.log(`   Imported: ${count.toLocaleString()}`);
  console.log(`   Skipped (duplicates): ${skipped.toLocaleString()}`);
  console.log(`   Errors: ${errors}`);

  // Summary
  const result = await pool.query(`
    SELECT
      media_source,
      COUNT(*) as events,
      COUNT(DISTINCT q_user_id) as users,
      ROUND(SUM(proceeds_usd)::numeric, 2) as revenue
    FROM qonversion_events
    WHERE media_source IS NOT NULL AND media_source != ''
    GROUP BY media_source
    ORDER BY revenue DESC NULLS LAST
    LIMIT 10
  `);

  console.log('\n📊 Top Attribution Sources:');
  result.rows.forEach(r => {
    console.log(`   ${r.media_source}: ${r.users.toLocaleString()} users, $${r.revenue || 0}`);
  });

  // Apple Ads specific
  const appleAds = await pool.query(`
    SELECT
      DATE(event_date) as date,
      COUNT(*) as events,
      COUNT(DISTINCT q_user_id) as users,
      ROUND(SUM(proceeds_usd)::numeric, 2) as revenue
    FROM qonversion_events
    WHERE media_source = 'Apple AdServices'
    GROUP BY DATE(event_date)
    ORDER BY date DESC
    LIMIT 7
  `);

  console.log('\n📱 Apple AdServices (last 7 days with data):');
  appleAds.rows.forEach(r => {
    console.log(`   ${r.date.toISOString().split('T')[0]}: ${r.users} users, $${r.revenue}`);
  });

  await pool.end();
}

importData().catch(e => {
  console.error('💥', e.message);
  process.exit(1);
});
