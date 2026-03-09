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

        const spend = parseFloat(totals?.localSpend?.amount || 0);
        const impressions = parseInt(totals?.impressions || 0);
        const taps = parseInt(totals?.taps || 0);
        const installs = parseInt(totals?.installs || 0);

        // Calculate metrics
        const ttr = impressions > 0 ? (taps / impressions) * 100 : 0;
        const conversionRate = taps > 0 ? (installs / taps) * 100 : 0;
        const avgCpa = installs > 0 ? spend / installs : 0;
        const avgCpt = taps > 0 ? spend / taps : 0;
        const avgCpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

        await db.query(`
          INSERT INTO apple_ads_campaigns (
            date, campaign_id, campaign_name,
            spend, impressions, taps, installs,
            ttr, conversion_rate, avg_cpa, avg_cpt, avg_cpm,
            synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (date, campaign_id)
          DO UPDATE SET
            campaign_name = EXCLUDED.campaign_name,
            spend = EXCLUDED.spend,
            impressions = EXCLUDED.impressions,
            taps = EXCLUDED.taps,
            installs = EXCLUDED.installs,
            ttr = EXCLUDED.ttr,
            conversion_rate = EXCLUDED.conversion_rate,
            avg_cpa = EXCLUDED.avg_cpa,
            avg_cpt = EXCLUDED.avg_cpt,
            avg_cpm = EXCLUDED.avg_cpm,
            synced_at = NOW()
        `, [
          dateStr,
          metadata.campaignId,
          metadata.campaignName,
          spend,
          impressions,
          taps,
          installs,
          ttr,
          conversionRate,
          avgCpa,
          avgCpt,
          avgCpm,
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

  // ================================================
  // CAMPAIGN OPERATIONS
  // ================================================

  /**
   * Get a single campaign by ID
   */
  async getCampaign(campaignId) {
    const response = await this.request(`/campaigns/${campaignId}`);
    return response.data;
  }

  /**
   * Create a new campaign
   */
  async createCampaign(campaignData) {
    const response = await this.request('/campaigns', 'POST', campaignData);
    return response.data;
  }

  /**
   * Update campaign settings
   */
  async updateCampaign(campaignId, updates) {
    const response = await this.request(`/campaigns/${campaignId}`, 'PUT', updates);
    return response.data;
  }

  /**
   * Update campaign status (pause/enable)
   */
  async updateCampaignStatus(campaignId, status) {
    // status: ENABLED, PAUSED
    return this.updateCampaign(campaignId, { status });
  }

  /**
   * Update campaign budget
   */
  async updateCampaignBudget(campaignId, dailyBudget, currency = 'USD') {
    return this.updateCampaign(campaignId, {
      dailyBudgetAmount: { amount: String(dailyBudget), currency }
    });
  }

  // ================================================
  // AD GROUP OPERATIONS
  // ================================================

  /**
   * Get all ad groups for a campaign
   */
  async getAdGroups(campaignId) {
    const response = await this.request(`/campaigns/${campaignId}/adgroups`);
    return response.data || [];
  }

  /**
   * Get a single ad group
   */
  async getAdGroup(campaignId, adGroupId) {
    const response = await this.request(`/campaigns/${campaignId}/adgroups/${adGroupId}`);
    return response.data;
  }

  /**
   * Update ad group settings
   */
  async updateAdGroup(campaignId, adGroupId, updates) {
    const response = await this.request(`/campaigns/${campaignId}/adgroups/${adGroupId}`, 'PUT', updates);
    return response.data;
  }

  /**
   * Update ad group status
   */
  async updateAdGroupStatus(campaignId, adGroupId, status) {
    return this.updateAdGroup(campaignId, adGroupId, { status });
  }

  /**
   * Update ad group default bid
   */
  async updateAdGroupBid(campaignId, adGroupId, bidAmount, currency = 'USD') {
    return this.updateAdGroup(campaignId, adGroupId, {
      defaultBidAmount: { amount: String(bidAmount), currency }
    });
  }

  // ================================================
  // KEYWORD OPERATIONS
  // ================================================

  /**
   * Get all keywords for an ad group
   */
  async getKeywords(campaignId, adGroupId) {
    const response = await this.request(`/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords`);
    return response.data || [];
  }

  /**
   * Get a single keyword
   */
  async getKeyword(campaignId, adGroupId, keywordId) {
    const response = await this.request(`/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords/${keywordId}`);
    return response.data;
  }

  /**
   * Create new keywords
   */
  async createKeywords(campaignId, adGroupId, keywords) {
    // keywords: [{ text: "keyword", matchType: "EXACT"|"BROAD", bidAmount: { amount: "2.00", currency: "USD" } }]
    const response = await this.request(
      `/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords/bulk`,
      'POST',
      keywords
    );
    return response.data || [];
  }

  /**
   * Update a single keyword
   */
  async updateKeyword(campaignId, adGroupId, keywordId, updates) {
    const response = await this.request(
      `/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords/${keywordId}`,
      'PUT',
      updates
    );
    return response.data;
  }

  /**
   * Update keyword bid
   */
  async updateKeywordBid(campaignId, adGroupId, keywordId, bidAmount, currency = 'USD') {
    return this.updateKeyword(campaignId, adGroupId, keywordId, {
      bidAmount: { amount: String(bidAmount), currency }
    });
  }

  /**
   * Update keyword status
   */
  async updateKeywordStatus(campaignId, adGroupId, keywordId, status) {
    // status: ACTIVE, PAUSED
    return this.updateKeyword(campaignId, adGroupId, keywordId, { status });
  }

  /**
   * Bulk update keywords
   */
  async bulkUpdateKeywords(campaignId, adGroupId, updates) {
    // updates: [{ id: keywordId, bidAmount: {...}, status: "..." }]
    const response = await this.request(
      `/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords/bulk`,
      'PUT',
      updates
    );
    return response.data || [];
  }

  // ================================================
  // NEGATIVE KEYWORDS
  // ================================================

  /**
   * Get negative keywords for a campaign
   */
  async getNegativeKeywords(campaignId) {
    const response = await this.request(`/campaigns/${campaignId}/negativekeywords`);
    return response.data || [];
  }

  /**
   * Get negative keywords for an ad group
   */
  async getAdGroupNegativeKeywords(campaignId, adGroupId) {
    const response = await this.request(`/campaigns/${campaignId}/adgroups/${adGroupId}/negativekeywords`);
    return response.data || [];
  }

  /**
   * Create negative keywords for a campaign
   */
  async createNegativeKeywords(campaignId, keywords) {
    // keywords: [{ text: "keyword", matchType: "EXACT"|"BROAD" }]
    const response = await this.request(
      `/campaigns/${campaignId}/negativekeywords/bulk`,
      'POST',
      keywords
    );
    return response.data || [];
  }

  // ================================================
  // REPORTS
  // ================================================

  /**
   * Get ad group reports
   */
  async getAdGroupReports(campaignId, startDate, endDate, granularity = 'DAILY') {
    const body = {
      startTime: startDate.toISOString().split('T')[0],
      endTime: endDate.toISOString().split('T')[0],
      selector: {
        orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
        conditions: [{ field: 'campaignId', operator: 'EQUALS', values: [String(campaignId)] }]
      },
      returnRowTotals: true,
      returnRecordsWithNoMetrics: false,
      timeZone: 'UTC',
      granularity
    };

    const response = await this.request('/reports/adgroups', 'POST', body);
    return response;
  }

  /**
   * Get keyword reports for a campaign
   */
  async getKeywordReports(campaignId, startDate, endDate, granularity = 'DAILY') {
    const body = {
      startTime: startDate.toISOString().split('T')[0],
      endTime: endDate.toISOString().split('T')[0],
      selector: {
        orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
        conditions: [{ field: 'campaignId', operator: 'EQUALS', values: [String(campaignId)] }]
      },
      returnRowTotals: true,
      returnRecordsWithNoMetrics: false,
      timeZone: 'UTC',
      granularity
    };

    const response = await this.request('/reports/keywords', 'POST', body);
    return response;
  }

  /**
   * Get search terms reports
   */
  async getSearchTermReports(campaignId, startDate, endDate, granularity = 'DAILY') {
    const body = {
      startTime: startDate.toISOString().split('T')[0],
      endTime: endDate.toISOString().split('T')[0],
      selector: {
        orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
        conditions: [{ field: 'campaignId', operator: 'EQUALS', values: [String(campaignId)] }]
      },
      returnRowTotals: true,
      returnRecordsWithNoMetrics: false,
      timeZone: 'UTC',
      granularity
    };

    const response = await this.request('/reports/searchterms', 'POST', body);
    return response;
  }

  // ================================================
  // SYNC OPERATIONS (Extended)
  // ================================================

  /**
   * Sync ad groups for a campaign
   */
  async syncAdGroupData(campaignId, date) {
    if (!this.isConfigured()) {
      console.log('Apple Ads API not configured, skipping sync');
      return { synced: 0 };
    }

    try {
      const dateStr = date.toISOString().split('T')[0];
      const reports = await this.getAdGroupReports(campaignId, date, date);

      const rows = reports.data?.reportingDataResponse?.row || [];
      let synced = 0;

      for (const report of rows) {
        const metadata = report.metadata;
        const totals = report.total;

        await db.query(`
          INSERT INTO apple_ads_adgroups (
            date, campaign_id, adgroup_id, adgroup_name,
            spend, impressions, taps, installs,
            new_downloads, redownloads, synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (date, campaign_id, adgroup_id)
          DO UPDATE SET
            adgroup_name = EXCLUDED.adgroup_name,
            spend = EXCLUDED.spend,
            impressions = EXCLUDED.impressions,
            taps = EXCLUDED.taps,
            installs = EXCLUDED.installs,
            new_downloads = EXCLUDED.new_downloads,
            redownloads = EXCLUDED.redownloads,
            synced_at = NOW()
        `, [
          dateStr,
          campaignId,
          metadata.adGroupId,
          metadata.adGroupName,
          parseFloat(totals?.localSpend?.amount || 0),
          parseInt(totals?.impressions || 0),
          parseInt(totals?.taps || 0),
          parseInt(totals?.installs || 0),
          parseInt(totals?.newDownloads || 0),
          parseInt(totals?.redownloads || 0)
        ]);
        synced++;
      }

      console.log(`Synced ${synced} ad groups for campaign ${campaignId} on ${dateStr}`);
      return { synced, date: dateStr };

    } catch (error) {
      console.error('Failed to sync ad group data:', error.message);
      throw error;
    }
  }

  /**
   * Sync keywords for a campaign
   */
  async syncKeywordData(campaignId, date) {
    if (!this.isConfigured()) {
      console.log('Apple Ads API not configured, skipping sync');
      return { synced: 0 };
    }

    try {
      const dateStr = date.toISOString().split('T')[0];
      const reports = await this.getKeywordReports(campaignId, date, date);

      const rows = reports.data?.reportingDataResponse?.row || [];
      let synced = 0;

      for (const report of rows) {
        const metadata = report.metadata;
        const totals = report.total;

        await db.query(`
          INSERT INTO apple_ads_keywords (
            date, campaign_id, adgroup_id, keyword_id,
            keyword_text, match_type, bid_amount,
            spend, impressions, taps, installs,
            new_downloads, redownloads, synced_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (date, campaign_id, adgroup_id, keyword_id)
          DO UPDATE SET
            keyword_text = EXCLUDED.keyword_text,
            match_type = EXCLUDED.match_type,
            bid_amount = EXCLUDED.bid_amount,
            spend = EXCLUDED.spend,
            impressions = EXCLUDED.impressions,
            taps = EXCLUDED.taps,
            installs = EXCLUDED.installs,
            new_downloads = EXCLUDED.new_downloads,
            redownloads = EXCLUDED.redownloads,
            synced_at = NOW()
        `, [
          dateStr,
          campaignId,
          metadata.adGroupId,
          metadata.keywordId,
          metadata.keyword,
          metadata.matchType,
          parseFloat(metadata.bidAmount?.amount || 0),
          parseFloat(totals?.localSpend?.amount || 0),
          parseInt(totals?.impressions || 0),
          parseInt(totals?.taps || 0),
          parseInt(totals?.installs || 0),
          parseInt(totals?.newDownloads || 0),
          parseInt(totals?.redownloads || 0)
        ]);
        synced++;
      }

      console.log(`Synced ${synced} keywords for campaign ${campaignId} on ${dateStr}`);
      return { synced, date: dateStr };

    } catch (error) {
      console.error('Failed to sync keyword data:', error.message);
      throw error;
    }
  }

  /**
   * Full sync for all campaigns (campaigns, adgroups, keywords)
   */
  async fullSync(days = 7) {
    const results = {
      campaigns: [],
      adgroups: [],
      keywords: []
    };

    const today = new Date();
    const campaigns = await this.getCampaigns();

    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      // Sync campaigns
      const campaignResult = await this.syncCampaignData(date);
      results.campaigns.push(campaignResult);

      // Sync adgroups and keywords for each campaign
      for (const campaign of campaigns) {
        try {
          const adgroupResult = await this.syncAdGroupData(campaign.id, date);
          results.adgroups.push({ campaignId: campaign.id, ...adgroupResult });

          const keywordResult = await this.syncKeywordData(campaign.id, date);
          results.keywords.push({ campaignId: campaign.id, ...keywordResult });
        } catch (error) {
          console.error(`Failed to sync campaign ${campaign.id}:`, error.message);
        }
      }
    }

    return results;
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
