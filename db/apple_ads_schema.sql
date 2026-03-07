-- Apple Ads Full Data Schema
-- Хранит всю статистику по дням на всех уровнях

-- Campaigns (расширенная версия)
DROP TABLE IF EXISTS apple_ads_campaigns CASCADE;
CREATE TABLE apple_ads_campaigns (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    campaign_id BIGINT NOT NULL,
    campaign_name VARCHAR(255),
    campaign_status VARCHAR(50),
    daily_budget DECIMAL(12,2),
    total_budget DECIMAL(12,2),

    -- Metrics
    spend DECIMAL(12,4) DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    taps BIGINT DEFAULT 0,
    installs BIGINT DEFAULT 0,
    new_downloads BIGINT DEFAULT 0,
    redownloads BIGINT DEFAULT 0,
    lat_on_installs BIGINT DEFAULT 0,
    lat_off_installs BIGINT DEFAULT 0,

    -- Calculated metrics
    ttr DECIMAL(8,4),           -- Tap-through rate
    conversion_rate DECIMAL(8,4), -- Installs/Taps
    avg_cpa DECIMAL(12,4),      -- Cost per acquisition
    avg_cpt DECIMAL(12,4),      -- Cost per tap
    avg_cpm DECIMAL(12,4),      -- Cost per 1000 impressions

    -- Metadata
    currency VARCHAR(3) DEFAULT 'USD',
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, campaign_id)
);

CREATE INDEX idx_campaigns_date ON apple_ads_campaigns(date);
CREATE INDEX idx_campaigns_campaign_id ON apple_ads_campaigns(campaign_id);

-- Ad Groups
CREATE TABLE apple_ads_adgroups (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    campaign_id BIGINT NOT NULL,
    adgroup_id BIGINT NOT NULL,
    adgroup_name VARCHAR(255),
    adgroup_status VARCHAR(50),
    default_bid DECIMAL(12,4),

    -- Metrics
    spend DECIMAL(12,4) DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    taps BIGINT DEFAULT 0,
    installs BIGINT DEFAULT 0,
    new_downloads BIGINT DEFAULT 0,
    redownloads BIGINT DEFAULT 0,
    lat_on_installs BIGINT DEFAULT 0,
    lat_off_installs BIGINT DEFAULT 0,

    -- Calculated metrics
    ttr DECIMAL(8,4),
    conversion_rate DECIMAL(8,4),
    avg_cpa DECIMAL(12,4),
    avg_cpt DECIMAL(12,4),
    avg_cpm DECIMAL(12,4),

    -- Metadata
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, campaign_id, adgroup_id)
);

CREATE INDEX idx_adgroups_date ON apple_ads_adgroups(date);
CREATE INDEX idx_adgroups_campaign_id ON apple_ads_adgroups(campaign_id);
CREATE INDEX idx_adgroups_adgroup_id ON apple_ads_adgroups(adgroup_id);

-- Keywords
CREATE TABLE apple_ads_keywords (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    campaign_id BIGINT NOT NULL,
    adgroup_id BIGINT NOT NULL,
    keyword_id BIGINT NOT NULL,
    keyword_text VARCHAR(500),
    match_type VARCHAR(20),       -- EXACT, BROAD
    keyword_status VARCHAR(50),
    bid_amount DECIMAL(12,4),

    -- Metrics
    spend DECIMAL(12,4) DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    taps BIGINT DEFAULT 0,
    installs BIGINT DEFAULT 0,
    new_downloads BIGINT DEFAULT 0,
    redownloads BIGINT DEFAULT 0,
    lat_on_installs BIGINT DEFAULT 0,
    lat_off_installs BIGINT DEFAULT 0,

    -- Calculated metrics
    ttr DECIMAL(8,4),
    conversion_rate DECIMAL(8,4),
    avg_cpa DECIMAL(12,4),
    avg_cpt DECIMAL(12,4),
    avg_cpm DECIMAL(12,4),

    -- Metadata
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, campaign_id, adgroup_id, keyword_id)
);

CREATE INDEX idx_keywords_date ON apple_ads_keywords(date);
CREATE INDEX idx_keywords_campaign_id ON apple_ads_keywords(campaign_id);
CREATE INDEX idx_keywords_keyword_id ON apple_ads_keywords(keyword_id);
CREATE INDEX idx_keywords_keyword_text ON apple_ads_keywords(keyword_text);

-- Search Terms (actual search queries)
CREATE TABLE apple_ads_search_terms (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    campaign_id BIGINT NOT NULL,
    adgroup_id BIGINT NOT NULL,
    keyword_id BIGINT,
    search_term VARCHAR(500) NOT NULL,

    -- Metrics
    spend DECIMAL(12,4) DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    taps BIGINT DEFAULT 0,
    installs BIGINT DEFAULT 0,
    new_downloads BIGINT DEFAULT 0,
    redownloads BIGINT DEFAULT 0,

    -- Calculated metrics
    ttr DECIMAL(8,4),
    conversion_rate DECIMAL(8,4),
    avg_cpa DECIMAL(12,4),
    avg_cpt DECIMAL(12,4),

    -- Metadata
    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, campaign_id, adgroup_id, search_term)
);

CREATE INDEX idx_search_terms_date ON apple_ads_search_terms(date);
CREATE INDEX idx_search_terms_search_term ON apple_ads_search_terms(search_term);

-- Sync log for tracking
CREATE TABLE apple_ads_sync_log (
    id SERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,  -- campaigns, adgroups, keywords, search_terms
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    records_synced INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, running, completed, failed
    error_message TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- View: ROAS by campaign with Qonversion data
CREATE OR REPLACE VIEW v_campaign_roas AS
SELECT
    c.date,
    c.campaign_id,
    c.campaign_name,
    c.spend,
    c.impressions,
    c.taps,
    c.installs,
    c.avg_cpa,
    c.avg_cpt,
    COALESCE(q.users, 0) as attributed_users,
    COALESCE(q.revenue, 0) as attributed_revenue,
    CASE
        WHEN c.spend > 0 THEN COALESCE(q.revenue, 0) / c.spend
        ELSE 0
    END as roas
FROM apple_ads_campaigns c
LEFT JOIN (
    SELECT
        ua.campaign_id,
        DATE(e.created_at) as date,
        COUNT(DISTINCT e.user_id) as users,
        SUM(e.revenue_usd) as revenue
    FROM events e
    JOIN user_attributions ua ON e.user_id = ua.user_id
    WHERE e.environment = 'production'
    GROUP BY ua.campaign_id, DATE(e.created_at)
) q ON c.campaign_id = q.campaign_id AND c.date = q.date
ORDER BY c.date DESC, c.spend DESC;

-- View: ROAS by keyword
CREATE OR REPLACE VIEW v_keyword_roas AS
SELECT
    k.date,
    k.campaign_id,
    k.adgroup_id,
    k.keyword_id,
    k.keyword_text,
    k.match_type,
    k.spend,
    k.impressions,
    k.taps,
    k.installs,
    k.avg_cpa,
    COALESCE(q.users, 0) as attributed_users,
    COALESCE(q.revenue, 0) as attributed_revenue,
    CASE
        WHEN k.spend > 0 THEN COALESCE(q.revenue, 0) / k.spend
        ELSE 0
    END as roas
FROM apple_ads_keywords k
LEFT JOIN (
    SELECT
        ua.keyword_id,
        DATE(e.created_at) as date,
        COUNT(DISTINCT e.user_id) as users,
        SUM(e.revenue_usd) as revenue
    FROM events e
    JOIN user_attributions ua ON e.user_id = ua.user_id
    WHERE e.environment = 'production' AND ua.keyword_id IS NOT NULL
    GROUP BY ua.keyword_id, DATE(e.created_at)
) q ON k.keyword_id = q.keyword_id AND k.date = q.date
ORDER BY k.date DESC, k.spend DESC;

-- View: Daily totals
CREATE OR REPLACE VIEW v_daily_totals AS
SELECT
    date,
    SUM(spend) as total_spend,
    SUM(impressions) as total_impressions,
    SUM(taps) as total_taps,
    SUM(installs) as total_installs,
    AVG(avg_cpa) as avg_cpa,
    AVG(avg_cpt) as avg_cpt,
    COUNT(DISTINCT campaign_id) as active_campaigns
FROM apple_ads_campaigns
GROUP BY date
ORDER BY date DESC;
