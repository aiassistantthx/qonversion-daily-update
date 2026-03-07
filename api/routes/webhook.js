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

// Extract event data from Qonversion webhook payload
function parseWebhookPayload(payload) {
  // Qonversion webhook structure:
  // https://documentation.qonversion.io/docs/webhooks
  const {
    id,
    user_id,
    event,
    product_id,
    price,
    currency,
    revenue,
    platform,
    environment,
    created_at,
    user,
  } = payload;

  // Revenue in USD (Qonversion provides this in cents for some events)
  let revenueUsd = 0;
  if (revenue !== undefined && revenue !== null) {
    revenueUsd = parseFloat(revenue);
  } else if (price !== undefined && price !== null) {
    // Approximate USD conversion (Qonversion usually provides USD revenue)
    revenueUsd = parseFloat(price);
  }

  return {
    eventId: id || `${user_id}_${event}_${created_at}`,
    userId: user_id,
    eventName: event,
    productId: product_id,
    revenueUsd,
    platform: platform || 'unknown',
    environment: environment === 'sandbox' ? 'sandbox' : 'production',
    createdAt: created_at ? new Date(created_at * 1000) : new Date(),
    rawPayload: payload,
    user,
  };
}

// Extract Apple Search Ads attribution from user data
function extractAttribution(userData) {
  if (!userData || !userData.custom_attributes) {
    return null;
  }

  const asa = userData.custom_attributes.asa_attribution ||
              userData.custom_attributes.apple_search_ads ||
              userData.custom_attributes;

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
    console.log(`Webhook received: ${payload.event || 'unknown'} for user ${payload.user_id || 'unknown'}`);

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

    // Save event
    const savedEvent = await saveEvent(eventData);

    if (savedEvent) {
      console.log(`Event saved: ${eventData.eventId}`);
    } else {
      console.log(`Event already exists: ${eventData.eventId}`);
    }

    // Extract and save attribution if available
    const attribution = extractAttribution(eventData.user);
    if (attribution) {
      const savedAttr = await saveAttribution(eventData.userId, attribution);
      if (savedAttr) {
        console.log(`Attribution saved for user: ${eventData.userId}, campaign: ${attribution.campaignId}`);
      }
    }

    res.status(200).json({
      success: true,
      event_id: eventData.eventId,
      saved: !!savedEvent,
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /webhook/stats - show webhook statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await db.query(`
      SELECT
        event_name,
        COUNT(*) as count,
        SUM(revenue_usd) as total_revenue,
        MIN(created_at) as first_event,
        MAX(created_at) as last_event
      FROM events
      WHERE environment = 'production'
      GROUP BY event_name
      ORDER BY count DESC
    `);

    const attributions = await db.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(campaign_id) as attributed_users
      FROM user_attributions
    `);

    res.json({
      events: stats.rows,
      attributions: attributions.rows[0],
    });

  } catch (error) {
    console.error('Stats query error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
