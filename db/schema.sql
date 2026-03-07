-- Qonversion Attribution System Schema
-- Run this with: psql $DATABASE_URL -f schema.sql

-- Events table: all webhook events (source of truth)
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    product_id VARCHAR(255),
    revenue_usd DECIMAL(10,2) DEFAULT 0,
    platform VARCHAR(20),
    environment VARCHAR(20) DEFAULT 'production',
    created_at TIMESTAMP NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_payload JSONB
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_product_id ON events(product_id);

-- User attributions: attribution data from first event with asa_attribution
CREATE TABLE IF NOT EXISTS user_attributions (
    user_id VARCHAR(255) PRIMARY KEY,
    campaign_id BIGINT,
    adgroup_id BIGINT,
    keyword_id BIGINT,
    ad_id BIGINT,
    country VARCHAR(10),
    conversion_type VARCHAR(50),
    attributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for user_attributions
CREATE INDEX IF NOT EXISTS idx_user_attributions_campaign_id ON user_attributions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_attributions_country ON user_attributions(country);

-- Apple Ads campaigns data (to be populated from Apple Ads API)
CREATE TABLE IF NOT EXISTS apple_ads_campaigns (
    date DATE NOT NULL,
    campaign_id BIGINT NOT NULL,
    campaign_name VARCHAR(255),
    adgroup_id BIGINT NOT NULL DEFAULT 0,
    adgroup_name VARCHAR(255),
    keyword_id BIGINT NOT NULL DEFAULT 0,
    keyword VARCHAR(255),
    spend_usd DECIMAL(10,2) DEFAULT 0,
    impressions INT DEFAULT 0,
    taps INT DEFAULT 0,
    installs INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (date, campaign_id, adgroup_id, keyword_id)
);

-- Indexes for apple_ads_campaigns
CREATE INDEX IF NOT EXISTS idx_apple_ads_campaigns_campaign_id ON apple_ads_campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_apple_ads_campaigns_date ON apple_ads_campaigns(date);

-- View: attribution_summary for ROAS analysis
CREATE OR REPLACE VIEW attribution_summary AS
SELECT
    ua.campaign_id,
    DATE(e.created_at) as date,
    COUNT(DISTINCT e.user_id) as users,
    SUM(e.revenue_usd) as revenue,
    aac.campaign_name,
    aac.spend_usd,
    aac.impressions,
    aac.taps,
    aac.installs,
    CASE
        WHEN aac.spend_usd > 0 THEN SUM(e.revenue_usd) / aac.spend_usd
        ELSE NULL
    END as roas
FROM events e
JOIN user_attributions ua ON e.user_id = ua.user_id
LEFT JOIN apple_ads_campaigns aac
    ON ua.campaign_id = aac.campaign_id
    AND DATE(e.created_at) = aac.date
    AND aac.adgroup_id = 0
    AND aac.keyword_id = 0
WHERE e.environment = 'production'
GROUP BY
    ua.campaign_id,
    DATE(e.created_at),
    aac.campaign_name,
    aac.spend_usd,
    aac.impressions,
    aac.taps,
    aac.installs;

-- Detailed attribution summary by adgroup
CREATE OR REPLACE VIEW attribution_summary_by_adgroup AS
SELECT
    ua.campaign_id,
    ua.adgroup_id,
    DATE(e.created_at) as date,
    COUNT(DISTINCT e.user_id) as users,
    SUM(e.revenue_usd) as revenue,
    aac.campaign_name,
    aac.adgroup_name,
    aac.spend_usd,
    aac.impressions,
    aac.taps,
    aac.installs,
    CASE
        WHEN aac.spend_usd > 0 THEN SUM(e.revenue_usd) / aac.spend_usd
        ELSE NULL
    END as roas
FROM events e
JOIN user_attributions ua ON e.user_id = ua.user_id
LEFT JOIN apple_ads_campaigns aac
    ON ua.campaign_id = aac.campaign_id
    AND ua.adgroup_id = aac.adgroup_id
    AND DATE(e.created_at) = aac.date
    AND aac.keyword_id = 0
WHERE e.environment = 'production'
GROUP BY
    ua.campaign_id,
    ua.adgroup_id,
    DATE(e.created_at),
    aac.campaign_name,
    aac.adgroup_name,
    aac.spend_usd,
    aac.impressions,
    aac.taps,
    aac.installs;
