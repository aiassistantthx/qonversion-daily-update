/**
 * Qonversion Sales Service
 * Fetches daily sales data from Qonversion Dashboard API
 */

const fs = require('fs');
const path = require('path');

const AUTH_PATH = path.join(__dirname, '..', 'auth.json');

// Cache for 5 minutes
let salesCache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getQonversionCookies() {
  if (!fs.existsSync(AUTH_PATH)) {
    console.warn('Qonversion auth.json not found at', AUTH_PATH);
    return null;
  }

  const authData = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'));
  return authData.cookies
    .filter(c => c.domain && c.domain.includes('qonversion'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

/**
 * Fetch daily sales from Qonversion Dashboard API
 * Returns { 'YYYY-MM-DD': revenue } map
 */
async function fetchDailySales() {
  // Check cache
  if (salesCache && Date.now() - cacheTime < CACHE_TTL) {
    return salesCache;
  }

  const cookies = await getQonversionCookies();
  if (!cookies) {
    return {};
  }

  try {
    const response = await fetch(
      'https://dash.qonversion.io/api/v1/analytics/chart/sales?unit=day&environment=1&project=PcnB70vn',
      {
        headers: { 'Cookie': cookies },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      console.error('Qonversion API error:', response.status);
      return salesCache || {};
    }

    const data = await response.json();

    if (data.data?.status === 401) {
      console.error('Qonversion auth expired');
      return salesCache || {};
    }

    const salesSeries = data.data?.series?.find(s => s.label === 'After refunds');
    if (!salesSeries?.data) {
      return salesCache || {};
    }

    const result = {};
    for (const point of salesSeries.data) {
      const date = new Date(point.start_time * 1000).toISOString().split('T')[0];
      // Convert proceeds (after Apple commission) to gross price
      // Apple takes ~26% commission on average (mix of 15% and 30%), so proceeds = price * 0.74
      // Gross = proceeds / 0.74
      const proceeds = point.value || 0;
      result[date] = proceeds / 0.74;
    }

    // Update cache
    salesCache = result;
    cacheTime = Date.now();

    console.log(`Fetched Qonversion sales for ${Object.keys(result).length} days`);
    return result;
  } catch (error) {
    console.error('Error fetching Qonversion sales:', error.message);
    return salesCache || {};
  }
}

module.exports = { fetchDailySales };
