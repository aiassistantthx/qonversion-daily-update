/**
 * Apple Ads Full Sync Worker
 *
 * Syncs all data from Apple Search Ads API:
 * - Campaigns
 * - Ad Groups
 * - Keywords
 * - Search Terms
 *
 * Run: node apple-ads-sync.js [days]
 * Default: 90 days
 */

const crypto = require('crypto');
const { Pool } = require('pg');

// Config
const CONFIG = {
  clientId: process.env.APPLE_ADS_CLIENT_ID,
  teamId: process.env.APPLE_ADS_TEAM_ID,
  keyId: process.env.APPLE_ADS_KEY_ID,
  orgId: process.env.APPLE_ADS_ORG_ID,
  privateKey: process.env.APPLE_ADS_PRIVATE_KEY_BASE64
    ? Buffer.from(process.env.APPLE_ADS_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
    : process.env.APPLE_ADS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  databaseUrl: process.env.DATABASE_URL,
};

const APPLE_ADS_API = 'https://api.searchads.apple.com/api/v5';
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/oauth2/token';

// Database
const pool = new Pool({ connectionString: CONFIG.databaseUrl });

// Auth
let accessToken = null;
let tokenExpiry = null;

function createClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 86400;

  const header = { alg: 'ES256', kid: CONFIG.keyId };
  const payload = {
    iss: CONFIG.teamId,
    iat: now,
    exp: expiry,
    aud: 'https://appleid.apple.com',
    sub: CONFIG.clientId,
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signatureInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(CONFIG.privateKey);

  // Convert DER to raw
  const derToRaw = (der) => {
    let offset = 3;
    const rLength = der[offset];
    offset += 1;
    let r = der.slice(offset, offset + rLength);
    offset += rLength + 1;
    const sLength = der[offset];
    offset += 1;
    let s = der.slice(offset, offset + sLength);

    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
    if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length), s]);

    return Buffer.concat([r, s]);
  };

  const rawSignature = derToRaw(signature);
  const signatureB64 = rawSignature
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${signatureInput}.${signatureB64}`;
}

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry - 300000) {
    return accessToken;
  }

  const clientSecret = createClientSecret();
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CONFIG.clientId,
    client_secret: clientSecret,
    scope: 'searchadsorg',
  });

  const response = await fetch(APPLE_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Auth error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  console.log('✓ Access token obtained');
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

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${APPLE_ADS_API}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json();
}

// Get all campaigns
async function getCampaigns() {
  const response = await apiRequest('/campaigns?limit=1000');
  return response.data || [];
}

// Get ad groups for campaign
async function getAdGroups(campaignId) {
  const response = await apiRequest(`/campaigns/${campaignId}/adgroups?limit=1000`);
  return response.data || [];
}

// Get keywords for ad group
async function getKeywords(campaignId, adgroupId) {
  const response = await apiRequest(
    `/campaigns/${campaignId}/adgroups/${adgroupId}/targetingkeywords?limit=1000`
  );
  return response.data || [];
}

// Get campaign reports
async function getCampaignReports(startDate, endDate) {
  const body = {
    startTime: startDate,
    endTime: endDate,
    granularity: 'DAILY',
    selector: {
      orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
    },
    returnRowTotals: false,
    returnRecordsWithNoMetrics: true,
  };

  const response = await apiRequest('/reports/campaigns', 'POST', body);
  return response.data?.reportingDataResponse?.row || [];
}

// Get ad group reports
async function getAdGroupReports(campaignId, startDate, endDate) {
  const body = {
    startTime: startDate,
    endTime: endDate,
    granularity: 'DAILY',
    selector: {
      orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
    },
    returnRowTotals: false,
    returnRecordsWithNoMetrics: true,
  };

  const response = await apiRequest(`/reports/campaigns/${campaignId}/adgroups`, 'POST', body);
  return response.data?.reportingDataResponse?.row || [];
}

// Get keyword reports
async function getKeywordReports(campaignId, startDate, endDate) {
  const body = {
    startTime: startDate,
    endTime: endDate,
    granularity: 'DAILY',
    selector: {
      orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
    },
    returnRowTotals: false,
    returnRecordsWithNoMetrics: true,
  };

  const response = await apiRequest(`/reports/campaigns/${campaignId}/keywords`, 'POST', body);
  return response.data?.reportingDataResponse?.row || [];
}

// Get search term reports
async function getSearchTermReports(campaignId, startDate, endDate) {
  const body = {
    startTime: startDate,
    endTime: endDate,
    granularity: 'DAILY',
    selector: {
      orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
    },
    returnRowTotals: false,
    returnRecordsWithNoMetrics: false,
  };

  const response = await apiRequest(`/reports/campaigns/${campaignId}/searchterms`, 'POST', body);
  return response.data?.reportingDataResponse?.row || [];
}

// Save campaign data
async function saveCampaigns(rows, campaigns) {
  const campaignMap = new Map(campaigns.map(c => [c.id, c]));

  for (const row of rows) {
    const meta = row.metadata;
    const metrics = row.granularity?.[0]?.insights || row.total || {};
    const date = row.granularity?.[0]?.date || meta.date;
    const campaign = campaignMap.get(meta.campaignId);

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
        campaign_status = EXCLUDED.campaign_status,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        taps = EXCLUDED.taps,
        installs = EXCLUDED.installs,
        new_downloads = EXCLUDED.new_downloads,
        redownloads = EXCLUDED.redownloads,
        lat_on_installs = EXCLUDED.lat_on_installs,
        lat_off_installs = EXCLUDED.lat_off_installs,
        ttr = EXCLUDED.ttr,
        conversion_rate = EXCLUDED.conversion_rate,
        avg_cpa = EXCLUDED.avg_cpa,
        avg_cpt = EXCLUDED.avg_cpt,
        avg_cpm = EXCLUDED.avg_cpm,
        synced_at = NOW()
    `, [
      date,
      meta.campaignId,
      meta.campaignName || campaign?.name,
      meta.campaignStatus || campaign?.status,
      campaign?.dailyBudgetAmount?.amount,
      campaign?.budgetAmount?.amount,
      parseFloat(metrics.localSpend?.amount || 0),
      parseInt(metrics.impressions || 0),
      parseInt(metrics.taps || 0),
      parseInt(metrics.installs || 0),
      parseInt(metrics.newDownloads || 0),
      parseInt(metrics.redownloads || 0),
      parseInt(metrics.latOnInstalls || 0),
      parseInt(metrics.latOffInstalls || 0),
      parseFloat(metrics.ttr || 0),
      parseFloat(metrics.conversionRate || 0),
      parseFloat(metrics.avgCPA?.amount || 0),
      parseFloat(metrics.avgCPT?.amount || 0),
      parseFloat(metrics.avgCPM?.amount || 0),
    ]);
  }
}

// Save ad group data
async function saveAdGroups(rows) {
  for (const row of rows) {
    const meta = row.metadata;
    const metrics = row.granularity?.[0]?.insights || row.total || {};
    const date = row.granularity?.[0]?.date || meta.date;

    if (!date) continue;

    await pool.query(`
      INSERT INTO apple_ads_adgroups (
        date, campaign_id, adgroup_id, adgroup_name, adgroup_status, default_bid,
        spend, impressions, taps, installs,
        new_downloads, redownloads, lat_on_installs, lat_off_installs,
        ttr, conversion_rate, avg_cpa, avg_cpt, avg_cpm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (date, campaign_id, adgroup_id) DO UPDATE SET
        adgroup_name = EXCLUDED.adgroup_name,
        adgroup_status = EXCLUDED.adgroup_status,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        taps = EXCLUDED.taps,
        installs = EXCLUDED.installs,
        new_downloads = EXCLUDED.new_downloads,
        redownloads = EXCLUDED.redownloads,
        lat_on_installs = EXCLUDED.lat_on_installs,
        lat_off_installs = EXCLUDED.lat_off_installs,
        ttr = EXCLUDED.ttr,
        conversion_rate = EXCLUDED.conversion_rate,
        avg_cpa = EXCLUDED.avg_cpa,
        avg_cpt = EXCLUDED.avg_cpt,
        avg_cpm = EXCLUDED.avg_cpm,
        synced_at = NOW()
    `, [
      date,
      meta.campaignId,
      meta.adGroupId,
      meta.adGroupName,
      meta.adGroupStatus,
      meta.defaultBidAmount?.amount,
      parseFloat(metrics.localSpend?.amount || 0),
      parseInt(metrics.impressions || 0),
      parseInt(metrics.taps || 0),
      parseInt(metrics.installs || 0),
      parseInt(metrics.newDownloads || 0),
      parseInt(metrics.redownloads || 0),
      parseInt(metrics.latOnInstalls || 0),
      parseInt(metrics.latOffInstalls || 0),
      parseFloat(metrics.ttr || 0),
      parseFloat(metrics.conversionRate || 0),
      parseFloat(metrics.avgCPA?.amount || 0),
      parseFloat(metrics.avgCPT?.amount || 0),
      parseFloat(metrics.avgCPM?.amount || 0),
    ]);
  }
}

// Save keyword data
async function saveKeywords(rows) {
  for (const row of rows) {
    const meta = row.metadata;
    const metrics = row.granularity?.[0]?.insights || row.total || {};
    const date = row.granularity?.[0]?.date || meta.date;

    if (!date) continue;

    await pool.query(`
      INSERT INTO apple_ads_keywords (
        date, campaign_id, adgroup_id, keyword_id, keyword_text, match_type, keyword_status, bid_amount,
        spend, impressions, taps, installs,
        new_downloads, redownloads, lat_on_installs, lat_off_installs,
        ttr, conversion_rate, avg_cpa, avg_cpt, avg_cpm
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (date, campaign_id, adgroup_id, keyword_id) DO UPDATE SET
        keyword_text = EXCLUDED.keyword_text,
        match_type = EXCLUDED.match_type,
        keyword_status = EXCLUDED.keyword_status,
        bid_amount = EXCLUDED.bid_amount,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        taps = EXCLUDED.taps,
        installs = EXCLUDED.installs,
        new_downloads = EXCLUDED.new_downloads,
        redownloads = EXCLUDED.redownloads,
        lat_on_installs = EXCLUDED.lat_on_installs,
        lat_off_installs = EXCLUDED.lat_off_installs,
        ttr = EXCLUDED.ttr,
        conversion_rate = EXCLUDED.conversion_rate,
        avg_cpa = EXCLUDED.avg_cpa,
        avg_cpt = EXCLUDED.avg_cpt,
        avg_cpm = EXCLUDED.avg_cpm,
        synced_at = NOW()
    `, [
      date,
      meta.campaignId,
      meta.adGroupId,
      meta.keywordId,
      meta.keyword,
      meta.matchType,
      meta.keywordStatus,
      meta.bidAmount?.amount,
      parseFloat(metrics.localSpend?.amount || 0),
      parseInt(metrics.impressions || 0),
      parseInt(metrics.taps || 0),
      parseInt(metrics.installs || 0),
      parseInt(metrics.newDownloads || 0),
      parseInt(metrics.redownloads || 0),
      parseInt(metrics.latOnInstalls || 0),
      parseInt(metrics.latOffInstalls || 0),
      parseFloat(metrics.ttr || 0),
      parseFloat(metrics.conversionRate || 0),
      parseFloat(metrics.avgCPA?.amount || 0),
      parseFloat(metrics.avgCPT?.amount || 0),
      parseFloat(metrics.avgCPM?.amount || 0),
    ]);
  }
}

// Save search terms
async function saveSearchTerms(rows) {
  for (const row of rows) {
    const meta = row.metadata;
    const metrics = row.granularity?.[0]?.insights || row.total || {};
    const date = row.granularity?.[0]?.date || meta.date;

    if (!date || !meta.searchTermText) continue;

    await pool.query(`
      INSERT INTO apple_ads_search_terms (
        date, campaign_id, adgroup_id, keyword_id, search_term,
        spend, impressions, taps, installs,
        new_downloads, redownloads,
        ttr, conversion_rate, avg_cpa, avg_cpt
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (date, campaign_id, adgroup_id, search_term) DO UPDATE SET
        keyword_id = EXCLUDED.keyword_id,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        taps = EXCLUDED.taps,
        installs = EXCLUDED.installs,
        new_downloads = EXCLUDED.new_downloads,
        redownloads = EXCLUDED.redownloads,
        ttr = EXCLUDED.ttr,
        conversion_rate = EXCLUDED.conversion_rate,
        avg_cpa = EXCLUDED.avg_cpa,
        avg_cpt = EXCLUDED.avg_cpt,
        synced_at = NOW()
    `, [
      date,
      meta.campaignId,
      meta.adGroupId,
      meta.keywordId,
      meta.searchTermText,
      parseFloat(metrics.localSpend?.amount || 0),
      parseInt(metrics.impressions || 0),
      parseInt(metrics.taps || 0),
      parseInt(metrics.installs || 0),
      parseInt(metrics.newDownloads || 0),
      parseInt(metrics.redownloads || 0),
      parseFloat(metrics.ttr || 0),
      parseFloat(metrics.conversionRate || 0),
      parseFloat(metrics.avgCPA?.amount || 0),
      parseFloat(metrics.avgCPT?.amount || 0),
    ]);
  }
}

// Log sync
async function logSync(type, dateFrom, dateTo, records, status, error = null) {
  await pool.query(`
    INSERT INTO apple_ads_sync_log (sync_type, date_from, date_to, records_synced, status, error_message, completed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [type, dateFrom, dateTo, records, status, error, status === 'completed' || status === 'failed' ? new Date() : null]);
}

// Main sync function
async function fullSync(days = 90) {
  console.log(`\n🚀 Starting Apple Ads full sync for ${days} days\n`);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  console.log(`📅 Period: ${startStr} to ${endStr}\n`);

  try {
    // Get campaigns list
    console.log('📋 Fetching campaigns...');
    const campaigns = await getCampaigns();
    console.log(`   Found ${campaigns.length} campaigns\n`);

    // Sync campaign reports
    console.log('📊 Syncing campaign reports...');
    const campaignReports = await getCampaignReports(startStr, endStr);
    await saveCampaigns(campaignReports, campaigns);
    await logSync('campaigns', startStr, endStr, campaignReports.length, 'completed');
    console.log(`   ✓ Saved ${campaignReports.length} campaign records\n`);

    // Sync ad groups and keywords for each campaign
    let totalAdGroups = 0;
    let totalKeywords = 0;
    let totalSearchTerms = 0;

    for (const campaign of campaigns) {
      console.log(`📁 Campaign: ${campaign.name} (${campaign.id})`);

      try {
        // Ad Groups
        const adGroupReports = await getAdGroupReports(campaign.id, startStr, endStr);
        await saveAdGroups(adGroupReports);
        totalAdGroups += adGroupReports.length;
        console.log(`   ✓ ${adGroupReports.length} ad group records`);

        // Keywords
        const keywordReports = await getKeywordReports(campaign.id, startStr, endStr);
        await saveKeywords(keywordReports);
        totalKeywords += keywordReports.length;
        console.log(`   ✓ ${keywordReports.length} keyword records`);

        // Search Terms
        try {
          const searchTermReports = await getSearchTermReports(campaign.id, startStr, endStr);
          await saveSearchTerms(searchTermReports);
          totalSearchTerms += searchTermReports.length;
          console.log(`   ✓ ${searchTermReports.length} search term records`);
        } catch (e) {
          console.log(`   ⚠ Search terms: ${e.message.substring(0, 50)}`);
        }
      } catch (e) {
        console.log(`   ⚠ Skipped: ${e.message.substring(0, 50)}`);
      }

      console.log('');
    }

    await logSync('adgroups', startStr, endStr, totalAdGroups, 'completed');
    await logSync('keywords', startStr, endStr, totalKeywords, 'completed');
    await logSync('search_terms', startStr, endStr, totalSearchTerms, 'completed');

    console.log('✅ Sync completed!');
    console.log(`   Campaigns: ${campaignReports.length}`);
    console.log(`   Ad Groups: ${totalAdGroups}`);
    console.log(`   Keywords: ${totalKeywords}`);
    console.log(`   Search Terms: ${totalSearchTerms}`);

  } catch (error) {
    console.error('❌ Sync failed:', error.message);
    await logSync('full', startStr, endStr, 0, 'failed', error.message);
    throw error;
  }
}

// Run
const days = parseInt(process.argv[2]) || 90;

fullSync(days)
  .then(() => {
    console.log('\n👋 Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
