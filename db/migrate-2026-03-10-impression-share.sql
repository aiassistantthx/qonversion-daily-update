-- Migration: Add impression_share columns to Apple Ads tables
-- Date: 2026-03-10
-- Description: Add Share of Voice (SOV) and Share of Impressions (SOI) metrics

-- Add impression_share column to campaigns table
ALTER TABLE apple_ads_campaigns
ADD COLUMN IF NOT EXISTS impression_share DECIMAL(8,4);

-- Add impression_share column to adgroups table
ALTER TABLE apple_ads_adgroups
ADD COLUMN IF NOT EXISTS impression_share DECIMAL(8,4);

-- Add impression_share column to keywords table
ALTER TABLE apple_ads_keywords
ADD COLUMN IF NOT EXISTS impression_share DECIMAL(8,4);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_campaigns_impression_share ON apple_ads_campaigns(impression_share) WHERE impression_share IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_adgroups_impression_share ON apple_ads_adgroups(impression_share) WHERE impression_share IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_keywords_impression_share ON apple_ads_keywords(impression_share) WHERE impression_share IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN apple_ads_campaigns.impression_share IS 'Share of Voice (SOV) - percentage of impressions won vs total available impressions';
COMMENT ON COLUMN apple_ads_adgroups.impression_share IS 'Share of Voice (SOV) - percentage of impressions won vs total available impressions';
COMMENT ON COLUMN apple_ads_keywords.impression_share IS 'Share of Voice (SOV) - percentage of impressions won vs total available impressions';
