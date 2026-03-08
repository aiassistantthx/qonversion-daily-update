/**
 * Update Cohort ROAS Data
 * Run daily to refresh cohort metrics
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/qonversion_analytics'
});

async function updateCohorts() {
  console.log('📊 Updating cohort ROAS data...\n');

  const result = await pool.query(`
    INSERT INTO cohort_roas_data (
      campaign, cohort_month, paying_users, installs, spend,
      rev_d1, rev_d4, rev_d7, rev_d14, rev_d30, rev_d60, rev_d90, rev_d120, rev_d180, rev_total,
      roas_d1_pct, roas_d4_pct, roas_d7_pct, roas_d14_pct, roas_d30_pct,
      roas_d60_pct, roas_d90_pct, roas_d120_pct, roas_d180_pct
    )
    SELECT
      campaign, cohort_month, paying_users, installs, spend,
      rev_d1, rev_d4, rev_d7, rev_d14, rev_d30, rev_d60, rev_d90, rev_d120, rev_d180, rev_total,
      roas_d1_pct, roas_d4_pct, roas_d7_pct, roas_d14_pct, roas_d30_pct,
      roas_d60_pct, roas_d90_pct, roas_d120_pct, roas_d180_pct
    FROM cohort_roas
    WHERE cohort_month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
    ON CONFLICT (campaign, cohort_month) DO UPDATE SET
      paying_users = EXCLUDED.paying_users,
      installs = EXCLUDED.installs,
      spend = EXCLUDED.spend,
      rev_d1 = EXCLUDED.rev_d1,
      rev_d4 = EXCLUDED.rev_d4,
      rev_d7 = EXCLUDED.rev_d7,
      rev_d14 = EXCLUDED.rev_d14,
      rev_d30 = EXCLUDED.rev_d30,
      rev_d60 = EXCLUDED.rev_d60,
      rev_d90 = EXCLUDED.rev_d90,
      rev_d120 = EXCLUDED.rev_d120,
      rev_d180 = EXCLUDED.rev_d180,
      rev_total = EXCLUDED.rev_total,
      roas_d1_pct = EXCLUDED.roas_d1_pct,
      roas_d4_pct = EXCLUDED.roas_d4_pct,
      roas_d7_pct = EXCLUDED.roas_d7_pct,
      roas_d14_pct = EXCLUDED.roas_d14_pct,
      roas_d30_pct = EXCLUDED.roas_d30_pct,
      roas_d60_pct = EXCLUDED.roas_d60_pct,
      roas_d90_pct = EXCLUDED.roas_d90_pct,
      roas_d120_pct = EXCLUDED.roas_d120_pct,
      roas_d180_pct = EXCLUDED.roas_d180_pct,
      updated_at = NOW()
  `);

  console.log(`   ✓ Updated ${result.rowCount} cohorts (last 6 months)`);

  // Show summary
  const summary = await pool.query(`
    SELECT
      COUNT(*) as total_cohorts,
      COUNT(DISTINCT campaign) as campaigns,
      MIN(cohort_month) as oldest,
      MAX(cohort_month) as newest,
      MAX(updated_at) as last_update
    FROM cohort_roas_data
  `);

  const s = summary.rows[0];
  console.log(`\n📈 Database summary:`);
  console.log(`   Total cohorts: ${s.total_cohorts}`);
  console.log(`   Campaigns: ${s.campaigns}`);
  console.log(`   Period: ${s.oldest} → ${s.newest}`);
  console.log(`   Last update: ${s.last_update}`);

  await pool.end();
}

updateCohorts().catch(e => {
  console.error('💥', e.message);
  process.exit(1);
});
