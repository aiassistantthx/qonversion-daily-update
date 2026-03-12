-- Performance Annotations
-- Adds annotations to performance graphs for tracking events like campaign launches, bid changes, etc.
-- Created: 2026-03-12

-- ================================================
-- Performance Annotations Table
-- ================================================
CREATE TABLE IF NOT EXISTS asa_performance_annotations (
    id SERIAL PRIMARY KEY,

    -- Date of the annotation
    annotation_date DATE NOT NULL,

    -- Type of event
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'campaign_launch',
        'bid_change',
        'budget_change',
        'targeting_change',
        'keyword_added',
        'keyword_paused',
        'rule_execution',
        'optimization',
        'other'
    )),

    -- Associated entities (optional)
    campaign_id BIGINT,
    adgroup_id BIGINT,
    keyword_id BIGINT,

    -- Annotation content
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Display settings
    color VARCHAR(7) DEFAULT '#3b82f6',  -- Hex color code
    marker_style VARCHAR(20) DEFAULT 'circle' CHECK (marker_style IN ('circle', 'square', 'triangle', 'star')),

    -- Metadata
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_annotations_date ON asa_performance_annotations(annotation_date);
CREATE INDEX idx_annotations_event_type ON asa_performance_annotations(event_type);
CREATE INDEX idx_annotations_campaign ON asa_performance_annotations(campaign_id);
CREATE INDEX idx_annotations_created_at ON asa_performance_annotations(created_at);

COMMENT ON TABLE asa_performance_annotations IS 'Stores annotations for performance graphs to mark significant events';

-- ================================================
-- Sample Data (for testing)
-- ================================================
-- Uncomment to insert sample data
/*
INSERT INTO asa_performance_annotations (annotation_date, event_type, title, description, color) VALUES
('2026-03-01', 'campaign_launch', 'New US Campaign', 'Launched US-focused campaign with $100/day budget', '#10b981'),
('2026-03-05', 'bid_change', 'Bid Optimization', 'Increased bids on top-performing keywords by 20%', '#3b82f6'),
('2026-03-08', 'budget_change', 'Budget Increase', 'Increased daily budget from $100 to $150', '#f59e0b');
*/
