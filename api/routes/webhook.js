const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// Verify webhook signature from Qonversion
function verifySignature(payload, signature) {
  if (!process.env.WEBHOOK_SECRET) {
    console.warn('WEBHOOK_SECRET not set, skipping signature verification');
    return true;
  }

  const expected = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expected)
  );
}

// Convert snake_case to Title Case (subscription_renewed -> Subscription Renewed)
function toTitleCase(str) {
  if (!str) return str;
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Extract event data from Qonversion webhook payload
function parseWebhookPayload(payload) {
  // Qonversion webhook structure:
  // https://documentation.qonversion.io/docs/webhooks
  const {
    id,
    user_id,
    event_name,  // Qonversion uses event_name, not event
    product_id,
    price,
    currency,
    revenue,
    platform,
    environment,
    created_at,
    asa_attribution,  // Apple Search Ads attribution at root level
  } = payload;

  // Revenue in USD - Qonversion sends revenue as object with value_usd
  let revenueUsd = 0;
  if (revenue && typeof revenue === 'object' && revenue.value_usd) {
    revenueUsd = parseFloat(revenue.value_usd) || 0;
  } else if (price && typeof price === 'object' && price.value_usd) {
    revenueUsd = parseFloat(price.value_usd) || 0;
  } else if (typeof revenue === 'number') {
    revenueUsd = revenue;
  } else if (typeof price === 'number') {
    revenueUsd = price;
  }

  return {
    eventId: id || `${user_id}_${event_name}_${created_at}`,
    userId: user_id,
    eventName: toTitleCase(event_name),  // Normalize to Title Case for consistency
    productId: product_id,
    revenueUsd,
    platform: platform || 'unknown',
    environment: environment === 'sandbox' ? 'sandbox' : 'production',
    createdAt: created_at ? new Date(created_at * 1000) : new Date(),
    rawPayload: payload,
    asaAttribution: asa_attribution,  // Pass ASA attribution directly
  };
}

// Extract Apple Search Ads attribution from payload
function extractAttribution(asaAttribution) {
  if (!asaAttribution) {
    return null;
  }

  const asa = asaAttribution;

  // Apple Search Ads attribution fields
  const attribution = {
    campaignId: asa.campaignId || asa.campaign_id,
    adgroupId: asa.adGroupId || asa.adgroup_id,
    keywordId: asa.keywordId || asa.keyword_id,
    adId: asa.adId || asa.ad_id,
    country: asa.countryOrRegion || asa.country,
    conversionType: asa.conversionType || asa.conversion_type,
  };

  // Check if any attribution data exists
  if (!attribution.campaignId && !attribution.adgroupId) {
    return null;
  }

  return attribution;
}

// Save event to database
async function saveEvent(eventData) {
  const query = `
    INSERT INTO events (
      event_id, user_id, event_name, product_id,
      revenue_usd, platform, environment,
      created_at, received_at, raw_payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id
  `;

  const values = [
    eventData.eventId,
    eventData.userId,
    eventData.eventName,
    eventData.productId,
    eventData.revenueUsd,
    eventData.platform,
    eventData.environment,
    eventData.createdAt,
    JSON.stringify(eventData.rawPayload),
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

// Save event to unified subscription_events table (legacy)
async function saveToSubscriptionEvents(eventData, attribution) {
  const payload = eventData.rawPayload;

  // Extract transaction_id from payload
  const transactionId = payload.transaction?.transaction_id;
  if (!transactionId) {
    return null; // Skip events without transaction_id
  }

  const query = `
    INSERT INTO subscription_events (
      transaction_id, q_user_id, custom_user_id,
      event_date, event_name,
      product_id, subscription_group,
      currency, price, price_usd, proceeds_usd, refund,
      platform, device_id, locale, country, app_version,
      install_date, media_source, campaign_id, campaign_name,
      source, raw_payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
    ON CONFLICT (transaction_id) DO NOTHING
    RETURNING id
  `;

  // Get campaign_name from apple_ads_campaigns if we have campaign_id
  let campaignName = null;
  if (attribution?.campaignId) {
    try {
      const campaignResult = await db.query(
        'SELECT campaign_name FROM apple_ads_campaigns WHERE campaign_id = $1 LIMIT 1',
        [attribution.campaignId]
      );
      if (campaignResult.rows[0]) {
        campaignName = campaignResult.rows[0].campaign_name;
      }
    } catch (e) {
      // Ignore campaign name lookup errors
    }
  }

  const values = [
    transactionId,
    eventData.userId,
    payload.custom_user_id || null,
    eventData.createdAt,
    eventData.eventName,
    eventData.productId,
    payload.subscription_group || null,
    payload.price?.currency || null,
    payload.price?.value || null,
    payload.price?.value_usd || null,
    payload.revenue?.is_proceed === 1 ? payload.revenue?.value_usd : null,
    false,
    eventData.platform,
    payload.device_id || null,
    payload.locale || null,
    payload.country || null,
    payload.app_version || null,
    payload.user_install_date ? new Date(payload.user_install_date * 1000) : null,
    attribution?.campaignId ? 'Apple AdServices' : null,
    attribution?.campaignId || null,
    campaignName,
    'webhook',
    JSON.stringify(payload),
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

// Save event to events_v2 with full denormalized attribution
async function saveToEventsV2(eventData, attribution) {
  const payload = eventData.rawPayload;

  const transactionId = payload.transaction?.transaction_id;
  if (!transactionId) {
    return null;
  }

  // If no attribution in payload, try to get from user_attributions
  let finalAttribution = attribution;
  if (!attribution?.campaignId && eventData.userId) {
    try {
      const attrResult = await db.query(
        'SELECT campaign_id, adgroup_id, keyword_id FROM user_attributions WHERE user_id = $1 LIMIT 1',
        [eventData.userId]
      );
      if (attrResult.rows[0]) {
        finalAttribution = {
          campaignId: attrResult.rows[0].campaign_id,
          adgroupId: attrResult.rows[0].adgroup_id,
          keywordId: attrResult.rows[0].keyword_id,
        };
      }
    } catch (e) {
      // Ignore lookup errors
    }
  }

  // Get campaign_name if we have campaign_id
  let campaignName = null;
  if (finalAttribution?.campaignId) {
    try {
      const campaignResult = await db.query(
        'SELECT campaign_name FROM apple_ads_campaigns WHERE campaign_id = $1 LIMIT 1',
        [finalAttribution.campaignId]
      );
      if (campaignResult.rows[0]) {
        campaignName = campaignResult.rows[0].campaign_name;
      }
    } catch (e) {
      // Ignore
    }
  }

  const query = `
    INSERT INTO events_v2 (
      transaction_id, q_user_id, custom_user_id,
      event_date, event_name, product_id, subscription_group,
      currency, price, price_usd, proceeds_usd, refund,
      platform, device_id, locale, country, app_version,
      install_date, media_source, campaign_id, campaign_name,
      adgroup_id, keyword_id, source
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
    ON CONFLICT (transaction_id) DO NOTHING
    RETURNING id
  `;

  const values = [
    transactionId,
    eventData.userId,
    payload.custom_user_id || null,
    eventData.createdAt,
    eventData.eventName,
    eventData.productId,
    payload.subscription_group || null,
    payload.price?.currency || null,
    payload.price?.value || null,
    payload.price?.value_usd || null,
    payload.revenue?.is_proceed === 1 ? payload.revenue?.value_usd : null,
    false,
    eventData.platform,
    payload.device_id || null,
    payload.locale || null,
    payload.country || null,
    payload.app_version || null,
    payload.user_install_date ? new Date(payload.user_install_date * 1000) : null,
    finalAttribution?.campaignId ? 'Apple AdServices' : null,
    finalAttribution?.campaignId || null,
    campaignName,
    finalAttribution?.adgroupId || null,
    finalAttribution?.keywordId || null,
    'webhook',
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

// Save user attribution (only if not exists)
async function saveAttribution(userId, attribution) {
  const query = `
    INSERT INTO user_attributions (
      user_id, campaign_id, adgroup_id, keyword_id,
      ad_id, country, conversion_type, attributed_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  `;

  const values = [
    userId,
    attribution.campaignId || null,
    attribution.adgroupId || null,
    attribution.keywordId || null,
    attribution.adId || null,
    attribution.country || null,
    attribution.conversionType || null,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

// POST /webhook - handle Qonversion webhook events
router.post('/', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const signature = req.headers['x-qonversion-signature'];
    const payload = req.body;

    // Log incoming webhook
    console.log(`Webhook received: ${payload.event_name || 'unknown'} for user ${payload.user_id || 'unknown'}`);

    // Verify Authorization token (if configured)
    if (process.env.WEBHOOK_AUTH_TOKEN) {
      const expectedToken = process.env.WEBHOOK_AUTH_TOKEN;
      if (authHeader !== expectedToken && authHeader !== `Bearer ${expectedToken}`) {
        console.error('Invalid authorization token');
        return res.status(401).json({ error: 'Invalid authorization' });
      }
    }

    // Verify signature (optional, depends on WEBHOOK_SECRET)
    if (process.env.WEBHOOK_SECRET && !verifySignature(payload, signature)) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse payload
    const eventData = parseWebhookPayload(payload);

    // Validate required fields
    if (!eventData.userId || !eventData.eventName) {
      console.error('Missing required fields in webhook payload');
      return res.status(400).json({ error: 'Missing required fields: user_id, event' });
    }

    // Save event to events table
    const savedEvent = await saveEvent(eventData);

    if (savedEvent) {
      console.log(`Event saved: ${eventData.eventId}`);
    } else {
      console.log(`Event already exists: ${eventData.eventId}`);
    }

    // Extract and save attribution if available
    const attribution = extractAttribution(eventData.asaAttribution);
    if (attribution) {
      const savedAttr = await saveAttribution(eventData.userId, attribution);
      if (savedAttr) {
        console.log(`Attribution saved for user: ${eventData.userId}, campaign: ${attribution.campaignId}`);
      }
    }

    // Save to unified subscription_events table (legacy)
    const savedSubscriptionEvent = await saveToSubscriptionEvents(eventData, attribution);
    if (savedSubscriptionEvent) {
      console.log(`Subscription event saved: ${eventData.rawPayload.transaction?.transaction_id}`);
    }

    // Save to events_v2 (new denormalized table)
    const savedEventV2 = await saveToEventsV2(eventData, attribution);
    if (savedEventV2) {
      console.log(`Event V2 saved: ${eventData.rawPayload.transaction?.transaction_id}`);
    }

    res.status(200).json({
      success: true,
      event_id: eventData.eventId,
      saved: !!savedEvent,
      subscription_event_saved: !!savedSubscriptionEvent,
      event_v2_saved: !!savedEventV2,
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /webhook/daily - daily statistics for trials and subscriptions
router.get('/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;

    // Get daily trials (Trial Started events)
    const trials = await db.query(`
      SELECT
        DATE(event_date) as date,
        COUNT(*) as trials
      FROM events_v2
      WHERE event_name = 'Trial Started'
        AND event_date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(event_date)
      ORDER BY date DESC
    `);

    // Get daily yearly subscribers (Trial Converted + Subscription Started for yearly products)
    // Yearly products typically have 'year' or '1y' in product_id
    const yearlySubscribers = await db.query(`
      SELECT
        DATE(event_date) as date,
        COUNT(*) as subscribers
      FROM events_v2
      WHERE event_name IN ('Trial Converted', 'Subscription Started')
        AND (product_id ILIKE '%year%' OR product_id ILIKE '%1y%' OR product_id ILIKE '%annual%')
        AND event_date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(event_date)
      ORDER BY date DESC
    `);

    // Build daily map
    const dailyMap = {};
    for (const row of trials.rows) {
      const dateStr = row.date.toISOString().split('T')[0];
      dailyMap[dateStr] = { date: dateStr, trials: parseInt(row.trials), yearlySubscribers: 0 };
    }
    for (const row of yearlySubscribers.rows) {
      const dateStr = row.date.toISOString().split('T')[0];
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, trials: 0, yearlySubscribers: 0 };
      }
      dailyMap[dateStr].yearlySubscribers = parseInt(row.subscribers);
    }

    // Sort by date descending
    const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      days,
      daily,
    });

  } catch (error) {
    console.error('Daily stats query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /webhook/stats - show webhook statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT
        event_name,
        COUNT(*) as count,
        SUM(COALESCE(price_usd, 0)) as total_revenue,
        MIN(event_date) as first_event,
        MAX(event_date) as last_event
      FROM events_v2
      GROUP BY event_name
      ORDER BY count DESC
    `);

    const attributions = await db.query(`
      SELECT
        COUNT(DISTINCT q_user_id) as total_users,
        COUNT(DISTINCT CASE WHEN campaign_id IS NOT NULL THEN q_user_id END) as users_with_campaign_id,
        COUNT(DISTINCT CASE WHEN media_source = 'Apple AdServices' THEN q_user_id END) as users_from_asa
      FROM events_v2
    `);

    // Check media_source distribution
    const mediaSourceStats = await db.query(`
      SELECT
        media_source,
        COUNT(DISTINCT q_user_id) as users,
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue
      FROM events_v2
      GROUP BY media_source
      ORDER BY users DESC
      LIMIT 10
    `);

    // Campaign ID coverage
    const campaignIdCoverage = await db.query(`
      SELECT
        CASE WHEN campaign_id IS NOT NULL THEN 'has_campaign_id' ELSE 'no_campaign_id' END as status,
        COUNT(DISTINCT q_user_id) as users,
        SUM(CASE WHEN refund = false THEN COALESCE(price_usd, 0) ELSE 0 END) as revenue
      FROM events_v2
      WHERE media_source = 'Apple AdServices'
      GROUP BY 1
    `);

    // Check qonversion_events campaign text values
    const qonversionCampaigns = await db.query(`
      SELECT
        campaign,
        COUNT(DISTINCT q_user_id) as users,
        MIN(install_date) as first_install,
        MAX(install_date) as last_install
      FROM qonversion_events
      WHERE media_source = 'Apple AdServices'
      GROUP BY campaign
      ORDER BY users DESC
      LIMIT 15
    `);

    // Check campaign name matching between qonversion_events and apple_ads_campaigns
    const campaignMatching = await db.query(`
      WITH qon_campaigns AS (
        SELECT campaign, COUNT(DISTINCT q_user_id) as users
        FROM qonversion_events
        WHERE media_source = 'Apple AdServices' AND campaign IS NOT NULL
        GROUP BY campaign
      ),
      apple_campaigns AS (
        SELECT DISTINCT campaign_name, campaign_id FROM apple_ads_campaigns
      )
      SELECT
        (SELECT COUNT(*) FROM qon_campaigns) as qon_unique_campaigns,
        (SELECT SUM(users) FROM qon_campaigns) as qon_total_users,
        (SELECT COUNT(*) FROM apple_campaigns) as apple_unique_campaigns,
        (SELECT COUNT(*) FROM qon_campaigns qc JOIN apple_campaigns ac ON qc.campaign = ac.campaign_name) as matching_campaigns,
        (SELECT SUM(qc.users) FROM qon_campaigns qc JOIN apple_campaigns ac ON qc.campaign = ac.campaign_name) as matchable_users
    `);

    res.json({
      events: stats.rows,
      attributions: attributions.rows[0],
      mediaSourceStats: mediaSourceStats.rows,
      campaignIdCoverage: campaignIdCoverage.rows,
      qonversionCampaigns: qonversionCampaigns.rows,
      campaignMatching: campaignMatching.rows[0],
    });

  } catch (error) {
    console.error('Stats query error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /webhook/debug-campaigns - debug qonversion_events campaigns
router.get('/debug-campaigns', async (req, res) => {
  try {
    // Check campaign values in qonversion_events for ASA users
    const campaigns = await db.query(`
      SELECT
        campaign,
        COUNT(DISTINCT q_user_id) as users,
        SUM(price_usd) as revenue,
        MIN(install_date) as first_install,
        MAX(install_date) as last_install
      FROM qonversion_events
      WHERE media_source = 'Apple AdServices'
      GROUP BY campaign
      ORDER BY users DESC
      LIMIT 20
    `);

    // Check campaign name matching
    const matching = await db.query(`
      WITH qon AS (
        SELECT DISTINCT campaign FROM qonversion_events
        WHERE media_source = 'Apple AdServices' AND campaign IS NOT NULL
      ),
      apple AS (
        SELECT DISTINCT campaign_name FROM apple_ads_campaigns
      )
      SELECT
        (SELECT COUNT(*) FROM qon) as qon_campaigns,
        (SELECT COUNT(*) FROM apple) as apple_campaigns,
        (SELECT COUNT(*) FROM qon q JOIN apple a ON q.campaign = a.campaign_name) as matched
    `);

    // Sample unmatched campaigns
    const unmatched = await db.query(`
      WITH qon AS (
        SELECT campaign, COUNT(DISTINCT q_user_id) as users
        FROM qonversion_events
        WHERE media_source = 'Apple AdServices' AND campaign IS NOT NULL
        GROUP BY campaign
      ),
      apple AS (
        SELECT DISTINCT campaign_name FROM apple_ads_campaigns
      )
      SELECT q.campaign, q.users
      FROM qon q
      LEFT JOIN apple a ON q.campaign = a.campaign_name
      WHERE a.campaign_name IS NULL
      ORDER BY q.users DESC
      LIMIT 10
    `);

    res.json({
      campaigns: campaigns.rows,
      matching: matching.rows[0],
      unmatchedCampaigns: unmatched.rows,
    });
  } catch (error) {
    console.error('Debug campaigns error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// BULK IMPORT ENDPOINT
// ============================================

/**
 * POST /webhook/import
 * Bulk import events from CSV export
 * Body: { events: [...] }
 */
router.post('/import', async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'events array required' });
    }

    console.log(`Importing ${events.length} events...`);

    let inserted = 0;
    let errors = 0;
    const BATCH_SIZE = 500;

    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      const values = [];
      const placeholders = [];
      let idx = 1;

      for (const e of batch) {
        placeholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
        values.push(
          e.transaction_id || null,
          e.event_date,
          e.event_name,
          e.q_user_id,
          e.product_id || null,
          e.price_usd || 0,
          e.refund || false,
          e.platform || null,
          e.country || null,
          e.install_date || null,
          e.media_source || null,
          e.campaign_name || null,
          e.app_version || null
        );
      }

      try {
        const result = await db.query(`
          INSERT INTO events_v2 (
            transaction_id, event_date, event_name, q_user_id, product_id, price_usd, refund,
            platform, country, install_date, media_source, campaign_name, app_version
          ) VALUES ${placeholders.join(', ')}
          ON CONFLICT (transaction_id) DO NOTHING
          RETURNING id
        `, values);
        inserted += result.rowCount || 0;
      } catch (err) {
        console.error('Batch error:', err.message, 'First event:', JSON.stringify(batch[0]));
        errors += batch.length;
      }
    }

    // Get new stats
    const stats = await db.query(`
      SELECT MIN(event_date) as min_date, MAX(event_date) as max_date, COUNT(*) as total
      FROM events_v2
    `);

    res.json({
      success: true,
      inserted,
      errors,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
