/**
 * Apple Search Ads API Service
 *
 * This module handles synchronization of campaign data from Apple Search Ads API.
 * The API requires OAuth2 authentication with client credentials.
 *
 * Documentation: https://developer.apple.com/documentation/apple_search_ads
 *
 * Required environment variables:
 * - APPLE_ADS_CLIENT_ID
 * - APPLE_ADS_CLIENT_SECRET
 * - APPLE_ADS_ORG_ID
 */

const db = require('../db');

const APPLE_ADS_API_URL = 'https://api.searchads.apple.com/api/v4';

class AppleAdsService {
  constructor() {
    this.clientId = process.env.APPLE_ADS_CLIENT_ID;
    this.clientSecret = process.env.APPLE_ADS_CLIENT_SECRET;
    this.orgId = process.env.APPLE_ADS_ORG_ID;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Check if Apple Ads API is configured
   */
  isConfigured() {
    return !!(this.clientId && this.clientSecret && this.orgId);
  }

  /**
   * Get OAuth2 access token
   * Apple Ads uses client credentials flow
   */
  async getAccessToken() {
    if (!this.isConfigured()) {
      throw new Error('Apple Ads API not configured. Set APPLE_ADS_CLIENT_ID, APPLE_ADS_CLIENT_SECRET, and APPLE_ADS_ORG_ID');
    }

    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // TODO: Implement actual OAuth2 token retrieval
    // Apple Search Ads uses a different auth flow that requires:
    // 1. Creating a public/private key pair
    // 2. Uploading public key to Apple
    // 3. Generating JWT signed with private key
    // 4. Exchanging JWT for access token

    throw new Error('Apple Ads OAuth2 not implemented. API keys required.');
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

    const response = await fetch(`${APPLE_ADS_API_URL}${endpoint}`, options);

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
    return response.data;
  }

  /**
   * Get ad groups for a campaign
   */
  async getAdGroups(campaignId) {
    const response = await this.request(`/campaigns/${campaignId}/adgroups`);
    return response.data;
  }

  /**
   * Get keywords for an ad group
   */
  async getKeywords(campaignId, adgroupId) {
    const response = await this.request(
      `/campaigns/${campaignId}/adgroups/${adgroupId}/targetingkeywords`
    );
    return response.data;
  }

  /**
   * Get campaign reports for a date range
   *
   * @param {Date} startDate
   * @param {Date} endDate
   * @param {string} granularity - 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'
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
    return response.data;
  }

  /**
   * Sync campaign data to database
   *
   * @param {Date} date - Date to sync
   */
  async syncCampaignData(date) {
    if (!this.isConfigured()) {
      console.log('Apple Ads API not configured, skipping sync');
      return;
    }

    try {
      const reports = await this.getCampaignReports(date, date);

      for (const report of reports.reportingDataResponse.row) {
        const metadata = report.metadata;
        const insights = report.insights;

        // Campaign level data
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
          date,
          metadata.campaignId,
          metadata.campaignName,
          parseFloat(insights.localSpend?.amount || 0),
          parseInt(insights.impressions || 0),
          parseInt(insights.taps || 0),
          parseInt(insights.installs || 0),
        ]);
      }

      console.log(`Synced ${reports.reportingDataResponse.row.length} campaigns for ${date.toISOString().split('T')[0]}`);

    } catch (error) {
      console.error('Failed to sync Apple Ads data:', error.message);
      throw error;
    }
  }

  /**
   * Sync last N days of campaign data
   *
   * @param {number} days - Number of days to sync (default: 7)
   */
  async syncRecentData(days = 7) {
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      await this.syncCampaignData(date);
    }
  }
}

// Export singleton instance
const appleAdsService = new AppleAdsService();

module.exports = appleAdsService;

// CLI support for manual sync
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

  const days = parseInt(process.argv[2]) || 7;

  appleAdsService.syncRecentData(days)
    .then(() => {
      console.log('Sync completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Sync failed:', error);
      process.exit(1);
    });
}
