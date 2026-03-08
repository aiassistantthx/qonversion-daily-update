/**
 * Full Historical Apple Ads Sync
 * Syncs ALL data: campaigns, ad groups, keywords, search terms
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Load private key from file if env var not set
const getPrivateKey = () => {
  if (process.env.APPLE_ADS_PRIVATE_KEY) {
    return process.env.APPLE_ADS_PRIVATE_KEY;
  }
  const keyPath = path.join(__dirname, '../credentials/openchat-apple-ads-private.pem');
  return fs.readFileSync(keyPath, 'utf8');
};

const CONFIG = {
  clientId: process.env.APPLE_ADS_CLIENT_ID,
  teamId: process.env.APPLE_ADS_TEAM_ID,
  keyId: process.env.APPLE_ADS_KEY_ID,
  orgId: process.env.APPLE_ADS_ORG_ID,
  privateKey: getPrivateKey(),
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
    iss: CONFIG.teamId, iat: now, exp: now + 86400,
    aud: 'https://appleid.apple.com', sub: CONFIG.clientId,
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
  return `${signatureInput}.${rawSignature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`;
}

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 300000) return accessToken;
  const params = new URLSearchParams({
    grant_type: 'client_credentials', client_id: CONFIG.clientId,
    client_secret: createClientSecret(), scope: 'searchadsorg',
  });
  const response = await fetch(APPLE_AUTH_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    throw new Error(`API ${response.status}: ${error.substring(0, 100)}`);
  }
  return response.json();
}

async function getCampaigns() {
  const response = await apiRequest('/campaigns?limit=1000');
  return response.data || [];
}

// Reports
async function getReports(endpoint, startDate, endDate) {
  const body = {
    startTime: startDate, endTime: endDate, granularity: 'DAILY',
    selector: { orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }] },
    returnRowTotals: false, returnRecordsWithNoMetrics: false,
  };
  const response = await apiRequest(endpoint, 'POST', body);
  return response.data?.reportingDataResponse?.row || [];
}

// Save functions
async function saveCampaigns(rows, campaigns) {
  const campaignMap = new Map(campaigns.map(c => [c.id, c]));
  let count = 0;
  for (const row of rows) {
    const meta = row.metadata;
    const campaign = campaignMap.get(meta.campaignId);
    for (const dayData of (row.granularity || [])) {
      if (!dayData.date) continue;
      await pool.query(`
        INSERT INTO apple_ads_campaigns (date, campaign_id, campaign_name, campaign_status, daily_budget, total_budget,
          spend, impressions, taps, installs, new_downloads, redownloads, lat_on_installs, lat_off_installs,
          ttr, conversion_rate, avg_cpa, avg_cpt, avg_cpm)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (date, campaign_id) DO UPDATE SET
          spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, taps=EXCLUDED.taps, installs=EXCLUDED.installs, synced_at=NOW()
      `, [dayData.date, meta.campaignId, meta.campaignName || campaign?.name, meta.campaignStatus || campaign?.status,
        meta.dailyBudget?.amount, meta.totalBudget?.amount,
        parseFloat(dayData.localSpend?.amount||0), parseInt(dayData.impressions||0), parseInt(dayData.taps||0),
        parseInt(dayData.totalInstalls||0), parseInt(dayData.totalNewDownloads||0), parseInt(dayData.totalRedownloads||0),
        parseInt(dayData.latOnInstalls||0), parseInt(dayData.latOffInstalls||0),
        parseFloat(dayData.ttr||0), parseFloat(dayData.totalInstallRate||0), parseFloat(dayData.totalAvgCPI?.amount||0),
        parseFloat(dayData.avgCPT?.amount||0), parseFloat(dayData.avgCPM?.amount||0)]);
      count++;
    }
  }
  return count;
}

async function saveAdGroups(rows) {
  let count = 0;
  for (const row of rows) {
    const meta = row.metadata;
    for (const dayData of (row.granularity || [])) {
      if (!dayData.date) continue;
      await pool.query(`
        INSERT INTO apple_ads_adgroups (date, campaign_id, adgroup_id, adgroup_name, adgroup_status, default_bid,
          spend, impressions, taps, installs, new_downloads, redownloads, ttr, conversion_rate, avg_cpa, avg_cpt, avg_cpm)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (date, campaign_id, adgroup_id) DO UPDATE SET
          spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, taps=EXCLUDED.taps, installs=EXCLUDED.installs, synced_at=NOW()
      `, [dayData.date, meta.campaignId, meta.adGroupId, meta.adGroupName, meta.adGroupStatus, meta.defaultBidAmount?.amount,
        parseFloat(dayData.localSpend?.amount||0), parseInt(dayData.impressions||0), parseInt(dayData.taps||0),
        parseInt(dayData.totalInstalls||0), parseInt(dayData.totalNewDownloads||0), parseInt(dayData.totalRedownloads||0),
        parseFloat(dayData.ttr||0), parseFloat(dayData.totalInstallRate||0), parseFloat(dayData.totalAvgCPI?.amount||0),
        parseFloat(dayData.avgCPT?.amount||0), parseFloat(dayData.avgCPM?.amount||0)]);
      count++;
    }
  }
  return count;
}

async function saveKeywords(rows) {
  let count = 0;
  for (const row of rows) {
    const meta = row.metadata;
    for (const dayData of (row.granularity || [])) {
      if (!dayData.date) continue;
      await pool.query(`
        INSERT INTO apple_ads_keywords (date, campaign_id, adgroup_id, keyword_id, keyword_text, match_type, keyword_status, bid_amount,
          spend, impressions, taps, installs, new_downloads, redownloads, ttr, conversion_rate, avg_cpa, avg_cpt, avg_cpm)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (date, campaign_id, adgroup_id, keyword_id) DO UPDATE SET
          spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, taps=EXCLUDED.taps, installs=EXCLUDED.installs, synced_at=NOW()
      `, [dayData.date, meta.campaignId, meta.adGroupId, meta.keywordId, meta.keyword, meta.matchType, meta.keywordStatus, meta.bidAmount?.amount,
        parseFloat(dayData.localSpend?.amount||0), parseInt(dayData.impressions||0), parseInt(dayData.taps||0),
        parseInt(dayData.totalInstalls||0), parseInt(dayData.totalNewDownloads||0), parseInt(dayData.totalRedownloads||0),
        parseFloat(dayData.ttr||0), parseFloat(dayData.totalInstallRate||0), parseFloat(dayData.totalAvgCPI?.amount||0),
        parseFloat(dayData.avgCPT?.amount||0), parseFloat(dayData.avgCPM?.amount||0)]);
      count++;
    }
  }
  return count;
}

async function saveSearchTerms(rows) {
  let count = 0;
  for (const row of rows) {
    const meta = row.metadata;
    if (!meta.searchTermText) continue;
    for (const dayData of (row.granularity || [])) {
      if (!dayData.date) continue;
      await pool.query(`
        INSERT INTO apple_ads_search_terms (date, campaign_id, adgroup_id, keyword_id, search_term,
          spend, impressions, taps, installs, new_downloads, redownloads, ttr, conversion_rate, avg_cpa, avg_cpt)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (date, campaign_id, adgroup_id, search_term) DO UPDATE SET
          spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, taps=EXCLUDED.taps, installs=EXCLUDED.installs, synced_at=NOW()
      `, [dayData.date, meta.campaignId, meta.adGroupId, meta.keywordId, meta.searchTermText,
        parseFloat(dayData.localSpend?.amount||0), parseInt(dayData.impressions||0), parseInt(dayData.taps||0),
        parseInt(dayData.totalInstalls||0), parseInt(dayData.totalNewDownloads||0), parseInt(dayData.totalRedownloads||0),
        parseFloat(dayData.ttr||0), parseFloat(dayData.totalInstallRate||0), parseFloat(dayData.totalAvgCPI?.amount||0),
        parseFloat(dayData.avgCPT?.amount||0)]);
      count++;
    }
  }
  return count;
}

async function syncChunk(startDate, endDate, campaigns) {
  console.log(`\n📅 ${startDate} → ${endDate}`);

  // First sync campaigns (aggregate report)
  let campTotal = 0;
  try {
    const campRows = await getReports('/reports/campaigns', startDate, endDate);
    campTotal = await saveCampaigns(campRows, campaigns);
  } catch (e) {
    console.log(`   ⚠ Campaigns error: ${e.message.substring(0, 50)}`);
  }

  let agTotal = 0, kwTotal = 0, stTotal = 0;
  let processed = 0;

  for (const campaign of campaigns) {
    processed++;
    if (processed % 50 === 0) {
      process.stdout.write(`   Processing campaign ${processed}/${campaigns.length}...\r`);
    }

    try {
      // Ad Groups
      const agRows = await getReports(`/reports/campaigns/${campaign.id}/adgroups`, startDate, endDate);
      agTotal += await saveAdGroups(agRows);

      // Keywords
      const kwRows = await getReports(`/reports/campaigns/${campaign.id}/keywords`, startDate, endDate);
      kwTotal += await saveKeywords(kwRows);

      // Search Terms
      const stRows = await getReports(`/reports/campaigns/${campaign.id}/searchterms`, startDate, endDate);
      stTotal += await saveSearchTerms(stRows);
    } catch (e) {
      // Skip errors silently
    }
  }

  console.log(`   ✓ Campaigns: ${campTotal}, AdGroups: ${agTotal}, Keywords: ${kwTotal}, SearchTerms: ${stTotal}`);
  return { campTotal, agTotal, kwTotal, stTotal };
}

async function main() {
  console.log('🚀 Full Historical Apple Ads Sync (AdGroups + Keywords + SearchTerms)\n');

  console.log('📋 Fetching campaigns...');
  await getAccessToken();
  const campaigns = await getCampaigns();
  console.log(`   ✓ Found ${campaigns.length} campaigns`);

  // Chunks (90 days each) - updated to include 2026
  const chunks = [
    { start: '2024-01-01', end: '2024-03-31' },
    { start: '2024-04-01', end: '2024-06-29' },
    { start: '2024-06-30', end: '2024-09-27' },
    { start: '2024-09-28', end: '2024-12-26' },
    { start: '2024-12-27', end: '2025-03-26' },
    { start: '2025-03-27', end: '2025-06-24' },
    { start: '2025-06-25', end: '2025-09-22' },
    { start: '2025-09-23', end: '2025-12-21' },
    { start: '2025-12-22', end: '2026-03-07' },
  ];

  let totalCamp = 0, totalAG = 0, totalKW = 0, totalST = 0;

  for (const chunk of chunks) {
    const result = await syncChunk(chunk.start, chunk.end, campaigns);
    totalCamp += result.campTotal;
    totalAG += result.agTotal;
    totalKW += result.kwTotal;
    totalST += result.stTotal;
  }

  console.log(`\n✅ Done!`);
  console.log(`   Campaigns: ${totalCamp}`);
  console.log(`   Ad Groups: ${totalAG}`);
  console.log(`   Keywords: ${totalKW}`);
  console.log(`   Search Terms: ${totalST}`);

  // DB summary
  const result = await pool.query(`
    SELECT 'campaigns' as t, COUNT(*) as c, MIN(date) as f, MAX(date) as l, ROUND(SUM(spend)::numeric, 2) as spend FROM apple_ads_campaigns
    UNION ALL SELECT 'adgroups', COUNT(*), MIN(date), MAX(date), ROUND(SUM(spend)::numeric, 2) FROM apple_ads_adgroups
    UNION ALL SELECT 'keywords', COUNT(*), MIN(date), MAX(date), ROUND(SUM(spend)::numeric, 2) FROM apple_ads_keywords
    UNION ALL SELECT 'search_terms', COUNT(*), MIN(date), MAX(date), ROUND(SUM(spend)::numeric, 2) FROM apple_ads_search_terms
  `);
  console.log('\n📊 Database:');
  result.rows.forEach(r => console.log(`   ${r.t}: ${r.c} records (${r.f} → ${r.l}), $${r.spend || 0} spend`));

  await pool.end();
}

main().catch(e => { console.error('💥', e.message); process.exit(1); });
