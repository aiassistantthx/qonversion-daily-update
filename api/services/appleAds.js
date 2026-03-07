/**
 * Apple Search Ads API Service
 *
 * Documentation: https://developer.apple.com/documentation/apple_search_ads
 *
 * Required environment variables:
 * - APPLE_ADS_CLIENT_ID
 * - APPLE_ADS_TEAM_ID
 * - APPLE_ADS_KEY_ID
 * - APPLE_ADS_PRIVATE_KEY
 * - APPLE_ADS_ORG_ID
 */

const crypto = require('crypto');
const db = require('../db');

const APPLE_ADS_API_URL = 'https://api.searchads.apple.com/api/v5';
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/oauth2/token';

class AppleAdsService {
  constructor() {
    this.clientId = process.env.APPLE_ADS_CLIENT_ID;
    this.teamId = process.env.APPLE_ADS_TEAM_ID;
    this.keyId = process.env.APPLE_ADS_KEY_ID;
    this.orgId = process.env.APPLE_ADS_ORG_ID;
    this.accessToken = null;
    this.tokenExpiry = null;

    // Decode private key from base64 or use directly
    const keyBase64 = process.env.APPLE_ADS_PRIVATE_KEY_BASE64;
    const keyDirect = process.env.APPLE_ADS_PRIVATE_KEY;
    if (keyBase64) {
      this.privateKey = Buffer.from(keyBase64, 'base64').toString('utf8');
    } else if (keyDirect) {
      this.privateKey = keyDirect.replace(/\\n/g, '\n');
    }
  }

  /**
   * Check if Apple Ads API is configured
   */
  isConfigured() {
    return !!(this.clientId && this.teamId && this.keyId && this.privateKey && this.orgId);
  }

  /**
   * Create JWT for Apple Auth
   */
  createClientSecret() {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 86400; // 24 hours

    const header = {
      alg: 'ES256',
      kid: this.keyId,
    };

    const payload = {
      iss: this.teamId,
      iat: now,
      exp: expiry,
      aud: 'https://appleid.apple.com',
      sub: this.clientId,
    };

    // Base64url encode
    const encode = (obj) => Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    const headerB64 = encode(header);
    const payloadB64 = encode(payload);
    const signatureInput = `${headerB64}.${payloadB64}`;

    // Sign with ES256
    const sign = crypto.createSign('SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(this.privateKey);

    // Convert DER signature to raw format for JWT
    const derToRaw = (der) => {
      let offset = 3;
      const rLength = der[offset];
      offset += 1;
      let r = der.slice(offset, offset + rLength);
      offset += rLength + 1;
      const sLength = der[offset];
      offset += 1;
      let s = der.slice(offset, offset + sLength);

      // Pad or trim to 32 bytes
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

  /**
   * Get OAuth2 access token
   */
  async getAccessToken() {
    if (!this.isConfigured()) {
      throw new Error('Apple Ads API not configured');
    }

    // Return cached token if still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    const clientSecret = this.createClientSecret();

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: clientSecret,
      scope: 'searchadsorg',
    });

    const response = await fetch(APPLE_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Apple Auth error: ${response.status} ${error}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);

    console.log('Apple Ads access token obtained');
    return this.accessToken;
  }

  /**
   * Make authenticated request to Apple Ads API
   */
  async request(endpoint, method = 'GET', body = null) {
    const token = await this.getAccessToken();

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-AP-Context': `orgId=${this.orgId}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = `${APPLE_ADS_API_URL}${endpoint}`;
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Apple Ads API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Get all campaigns
   */
  async getCampaigns() {
    const response = await this.request('/campaigns');
    return response.data || [];
  }

  /**
   * Get campaign reports for a date range
   */
  async getCampaignReports(startDate, endDate, granularity = 'DAILY') {
    const body = {
      startTime: startDate.toISOString().split('T')[0],
      endTime: endDate.toISOString().split('T')[0],
      selector: {
        orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
      },
      returnRowTotals: true,
      returnRecordsWithNoMetrics: false,
      timeZone: 'UTC',
      granularity,
    };

    const response = await this.request('/reports/campaigns', 'POST', body);
    return response;
  }

  /**
   * Sync campaign data to database
   */
  async syncCampaignData(date) {
    if (!this.isConfigured()) {
      console.log('Apple Ads API not configured, skipping sync');
      return { synced: 0 };
    }

    try {
      const dateStr = date.toISOString().split('T')[0];
      const reports = await this.getCampaignReports(date, date);

      const rows = reports.data?.reportingDataResponse?.row || [];
      let synced = 0;

      for (const report of rows) {
        const metadata = report.metadata;
        const totals = report.total;

        await db.query(`
          INSERT INTO apple_ads_campaigns (
            date, campaign_id, campaign_name,
            adgroup_id, adgroup_name, keyword_id, keyword,
            spend_usd, impressions, taps, installs, updated_at
          )
          VALUES ($1, $2, $3, 0, NULL, 0, NULL, $4, $5, $6, $7, NOW())
          ON CONFLICT (date, campaign_id, adgroup_id, keyword_id)
          DO UPDATE SET
            campaign_name = EXCLUDED.campaign_name,
            spend_usd = EXCLUDED.spend_usd,
            impressions = EXCLUDED.impressions,
            taps = EXCLUDED.taps,
            installs = EXCLUDED.installs,
            updated_at = NOW()
        `, [
          dateStr,
          metadata.campaignId,
          metadata.campaignName,
          parseFloat(totals?.localSpend?.amount || 0),
          parseInt(totals?.impressions || 0),
          parseInt(totals?.taps || 0),
          parseInt(totals?.installs || 0),
        ]);
        synced++;
      }

      console.log(`Synced ${synced} campaigns for ${dateStr}`);
      return { synced, date: dateStr };

    } catch (error) {
      console.error('Failed to sync Apple Ads data:', error.message);
      throw error;
    }
  }

  /**
   * Sync last N days of campaign data
   */
  async syncRecentData(days = 7) {
    const results = [];
    const today = new Date();

    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const result = await this.syncCampaignData(date);
      results.push(result);
    }

    return results;
  }

  /**
   * Test connection to Apple Ads API
   */
  async testConnection() {
    try {
      await this.getAccessToken();
      const campaigns = await this.getCampaigns();
      return {
        success: true,
        campaignCount: campaigns.length,
        campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: c.status })),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
const appleAdsService = new AppleAdsService();

module.exports = appleAdsService;

// CLI support for manual sync
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

  const command = process.argv[2] || 'test';

  if (command === 'test') {
    appleAdsService.testConnection()
      .then((result) => {
        console.log('Test result:', JSON.stringify(result, null, 2));
        process.exit(result.success ? 0 : 1);
      });
  } else if (command === 'sync') {
    const days = parseInt(process.argv[3]) || 7;
    appleAdsService.syncRecentData(days)
      .then((results) => {
        console.log('Sync completed:', results);
        process.exit(0);
      })
      .catch((error) => {
        console.error('Sync failed:', error);
        process.exit(1);
      });
  }
}
