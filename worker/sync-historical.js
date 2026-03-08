/**
 * Historical Apple Ads Sync
 * Syncs data in 90-day chunks from a start date
 */

const crypto = require('crypto');
const { Pool } = require('pg');

// Config
const CONFIG = {
  clientId: process.env.APPLE_ADS_CLIENT_ID,
  teamId: process.env.APPLE_ADS_TEAM_ID,
  keyId: process.env.APPLE_ADS_KEY_ID,
  orgId: process.env.APPLE_ADS_ORG_ID,
  privateKey: process.env.APPLE_ADS_PRIVATE_KEY,
  databaseUrl: process.env.DATABASE_URL,
};

const APPLE_ADS_API = 'https://api.searchads.apple.com/api/v5';
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/oauth2/token';

const pool = new Pool({ connectionString: CONFIG.databaseUrl });

let accessToken = null;
let tokenExpiry = null;

function createClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: CONFIG.keyId };
  const payload = {
    iss: CONFIG.teamId,
    iat: now,
    exp: now + 86400,
    aud: 'https://appleid.apple.com',
    sub: CONFIG.clientId,
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signatureInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(CONFIG.privateKey);

  const derToRaw = (der) => {
    let offset = 3;
    const rLength = der[offset]; offset += 1;
    let r = der.slice(offset, offset + rLength); offset += rLength + 1;
    const sLength = der[offset]; offset += 1;
    let s = der.slice(offset, offset + sLength);
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
    if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length), s]);
    return Buffer.concat([r, s]);
  };

  const rawSignature = derToRaw(signature);
  const signatureB64 = rawSignature.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${signatureInput}.${signatureB64}`;
}

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return accessToken;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CONFIG.clientId,
    client_secret: createClientSecret(),
    scope: 'searchadsorg',
  });

  const response = await fetch(APPLE_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return accessToken;
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  const token = await getAccessToken();
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-AP-Context': `orgId=${CONFIG.orgId}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${APPLE_ADS_API}${endpoint}`, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }
  return response.json();
}

async function getCampaigns() {
  const response = await apiRequest('/campaigns?limit=1000');
  return response.data || [];
}

async function getCampaignReports(startDate, endDate) {
  const body = {
    startTime: startDate,
    endTime: endDate,
    granularity: 'DAILY',
    selector: { orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }] },
    returnRowTotals: false,
    returnRecordsWithNoMetrics: false, // Only get records with data
  };
  const response = await apiRequest('/reports/campaigns', 'POST', body);
  return response.data?.reportingDataResponse?.row || [];
}

async function saveCampaigns(rows, campaigns) {
  const campaignMap = new Map(campaigns.map(c => [c.id, c]));
  let count = 0;

  for (const row of rows) {
    const meta = row.metadata;
    const campaign = campaignMap.get(meta.campaignId);
    const granularityData = row.granularity || [];

    for (const dayData of granularityData) {
      const date = dayData.date;
      if (!date) continue;

      await pool.query(`
        INSERT INTO apple_ads_campaigns (
          date, campaign_id, campaign_name, campaign_status,
          daily_budget, total_budget,
          spend, impressions, taps, installs,
          new_downloads, redownloads, lat_on_installs, lat_off_installs,
          ttr, conversion_rate, avg_cpa, avg_cpt, avg_cpm
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (date, campaign_id) DO UPDATE SET
          campaign_name = EXCLUDED.campaign_name,
          spend = EXCLUDED.spend,
          impressions = EXCLUDED.impressions,
          taps = EXCLUDED.taps,
          installs = EXCLUDED.installs,
          new_downloads = EXCLUDED.new_downloads,
          redownloads = EXCLUDED.redownloads,
          synced_at = NOW()
      `, [
        date,
        meta.campaignId,
        meta.campaignName || campaign?.name,
        meta.campaignStatus || campaign?.status,
        meta.dailyBudget?.amount,
        meta.totalBudget?.amount,
        parseFloat(dayData.localSpend?.amount || 0),
        parseInt(dayData.impressions || 0),
        parseInt(dayData.taps || 0),
        parseInt(dayData.totalInstalls || 0),
        parseInt(dayData.totalNewDownloads || 0),
        parseInt(dayData.totalRedownloads || 0),
        parseInt(dayData.latOnInstalls || 0),
        parseInt(dayData.latOffInstalls || 0),
        parseFloat(dayData.ttr || 0),
        parseFloat(dayData.totalInstallRate || 0),
        parseFloat(dayData.totalAvgCPI?.amount || 0),
        parseFloat(dayData.avgCPT?.amount || 0),
        parseFloat(dayData.avgCPM?.amount || 0),
      ]);
      count++;
    }
  }
  return count;
}

async function syncChunk(startDate, endDate, campaigns) {
  console.log(`\n📅 Syncing ${startDate} to ${endDate}...`);

  try {
    const reports = await getCampaignReports(startDate, endDate);
    const count = await saveCampaigns(reports, campaigns);
    console.log(`   ✓ Saved ${count} records`);
    return count;
  } catch (e) {
    console.log(`   ❌ Error: ${e.message.substring(0, 80)}`);
    return 0;
  }
}

async function main() {
  console.log('🚀 Historical Apple Ads Sync\n');

  // Get campaigns first
  console.log('📋 Fetching campaigns...');
  await getAccessToken();
  console.log('   ✓ Authenticated');
  const campaigns = await getCampaigns();
  console.log(`   ✓ Found ${campaigns.length} campaigns`);

  // Define chunks (90 days each)
  const chunks = [
    { start: '2024-01-01', end: '2024-03-31' },
    { start: '2024-04-01', end: '2024-06-29' },
    { start: '2024-06-30', end: '2024-09-27' },
    { start: '2024-09-28', end: '2024-12-26' },
    { start: '2024-12-27', end: '2025-03-26' },
    { start: '2025-03-27', end: '2025-06-24' },
    { start: '2025-06-25', end: '2025-09-22' },
    { start: '2025-09-23', end: '2025-12-06' },
  ];

  let totalRecords = 0;

  for (const chunk of chunks) {
    const count = await syncChunk(chunk.start, chunk.end, campaigns);
    totalRecords += count;
  }

  console.log(`\n✅ Done! Total records synced: ${totalRecords}`);

  // Check total in DB
  const result = await pool.query(`
    SELECT
      MIN(date) as from_date,
      MAX(date) as to_date,
      COUNT(*) as records,
      ROUND(SUM(spend)::numeric, 2) as total_spend
    FROM apple_ads_campaigns
  `);
  console.log('\n📊 Database summary:');
  console.log(`   Period: ${result.rows[0].from_date} to ${result.rows[0].to_date}`);
  console.log(`   Records: ${result.rows[0].records}`);
  console.log(`   Total spend: $${result.rows[0].total_spend}`);

  await pool.end();
}

main().catch(e => {
  console.error('💥 Fatal:', e.message);
  process.exit(1);
});
