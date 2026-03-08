-- ASA Management Schema
-- Extends existing Apple Ads tables with automation and management features
-- Created: 2026-03-08

-- ================================================
-- Automation Rules
-- ================================================
CREATE TABLE IF NOT EXISTS asa_automation_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Scope: what entities this rule applies to
    scope VARCHAR(50) NOT NULL CHECK (scope IN ('campaign', 'adgroup', 'keyword')),

    -- Filter: which specific entities (NULL = all)
    campaign_ids BIGINT[],
    adgroup_ids BIGINT[],
    keyword_ids BIGINT[],

    -- Conditions (JSON array)
    -- Example: [{"metric": "cpa", "operator": ">", "value": 50, "period": "7d"}]
    conditions JSONB NOT NULL DEFAULT '[]',
    conditions_logic VARCHAR(10) DEFAULT 'AND' CHECK (conditions_logic IN ('AND', 'OR')),

    -- Action to perform
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN (
        'adjust_bid',      -- Adjust bid by percent or amount
        'set_bid',         -- Set exact bid
        'pause',           -- Pause entity
        'enable',          -- Enable entity
        'send_alert'       -- Send notification only
    )),
    action_params JSONB NOT NULL DEFAULT '{}',
    -- Examples:
    -- adjust_bid: {"adjustmentType": "percent", "adjustmentValue": -15, "minBid": 0.50, "maxBid": 10.00}
    -- set_bid: {"bidAmount": 2.50}
    -- pause: {}
    -- send_alert: {"channel": "slack", "message": "CPA exceeded threshold"}

    -- Execution settings
    frequency VARCHAR(20) DEFAULT 'daily' CHECK (frequency IN ('hourly', 'daily', 'weekly')),
    max_executions_per_day INTEGER DEFAULT 1,
    cooldown_hours INTEGER DEFAULT 24,  -- Min hours between executions on same entity

    -- Status
    enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 100,  -- Lower = higher priority

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_executed_at TIMESTAMP,

    -- Created by
    created_by VARCHAR(100) DEFAULT 'system'
);

CREATE INDEX idx_rules_enabled ON asa_automation_rules(enabled);
CREATE INDEX idx_rules_scope ON asa_automation_rules(scope);
CREATE INDEX idx_rules_frequency ON asa_automation_rules(frequency);

-- ================================================
-- Rule Executions Log
-- ================================================
CREATE TABLE IF NOT EXISTS asa_rule_executions (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER NOT NULL REFERENCES asa_automation_rules(id) ON DELETE CASCADE,

    -- What entity was affected
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NOT NULL,
    campaign_id BIGINT,
    adgroup_id BIGINT,
    keyword_id BIGINT,

    -- Execution details
    conditions_evaluated JSONB,  -- Snapshot of conditions at evaluation time
    conditions_met JSONB,        -- Which conditions were satisfied
    metrics_snapshot JSONB,      -- Metric values at evaluation time

    -- Changes made
    action_type VARCHAR(50) NOT NULL,
    previous_value JSONB,
    new_value JSONB,

    -- Status
    status VARCHAR(20) DEFAULT 'executed' CHECK (status IN (
        'executed',     -- Successfully executed
        'dry_run',      -- Simulated, no actual changes
        'failed',       -- Execution failed
        'skipped'       -- Skipped due to cooldown or limit
    )),
    error_message TEXT,

    -- Timing
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    execution_duration_ms INTEGER
);

CREATE INDEX idx_executions_rule_id ON asa_rule_executions(rule_id);
CREATE INDEX idx_executions_entity ON asa_rule_executions(entity_type, entity_id);
CREATE INDEX idx_executions_executed_at ON asa_rule_executions(executed_at);
CREATE INDEX idx_executions_status ON asa_rule_executions(status);

-- ================================================
-- Change History (Audit Log)
-- ================================================
CREATE TABLE IF NOT EXISTS asa_change_history (
    id SERIAL PRIMARY KEY,

    -- Entity reference
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('campaign', 'adgroup', 'keyword')),
    entity_id BIGINT NOT NULL,
    campaign_id BIGINT,
    adgroup_id BIGINT,
    keyword_id BIGINT,

    -- Change details
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN (
        'bid_update',
        'status_update',
        'budget_update',
        'create',
        'delete',
        'bulk_update'
    )),
    field_name VARCHAR(100),
    old_value TEXT,
    new_value TEXT,

    -- Source of change
    source VARCHAR(50) NOT NULL CHECK (source IN ('cli', 'web', 'rule', 'api', 'sync')),
    rule_id INTEGER REFERENCES asa_automation_rules(id) ON DELETE SET NULL,

    -- Metadata
    user_id VARCHAR(100),
    ip_address INET,
    user_agent TEXT,
    notes TEXT,

    -- Timestamp
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_history_entity ON asa_change_history(entity_type, entity_id);
CREATE INDEX idx_history_changed_at ON asa_change_history(changed_at);
CREATE INDEX idx_history_source ON asa_change_history(source);
CREATE INDEX idx_history_change_type ON asa_change_history(change_type);

-- ================================================
-- Campaign Templates
-- ================================================
CREATE TABLE IF NOT EXISTS asa_campaign_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Template type
    template_type VARCHAR(50) DEFAULT 'campaign' CHECK (template_type IN ('campaign', 'adgroup', 'full')),

    -- Campaign settings
    campaign_settings JSONB NOT NULL DEFAULT '{}',
    -- Example: {
    --   "dailyBudget": {"amount": "100", "currency": "USD"},
    --   "targetCountries": ["US", "GB"],
    --   "adGroupCount": 3
    -- }

    -- Ad group settings (default for new ad groups)
    adgroup_settings JSONB DEFAULT '{}',
    -- Example: {
    --   "defaultBid": 2.50,
    --   "cpaGoal": 30.00,
    --   "targetingDimensions": {...}
    -- }

    -- Keywords to add
    keywords JSONB DEFAULT '[]',
    -- Example: [
    --   {"text": "chat app", "matchType": "EXACT", "bidAmount": 3.00},
    --   {"text": "ai chat", "matchType": "BROAD", "bidAmount": 2.00}
    -- ]

    -- Negative keywords
    negative_keywords JSONB DEFAULT '[]',

    -- Variables for customization
    variables JSONB DEFAULT '{}',
    -- Example: {"appName": "OpenChat", "targetCPA": 25}

    -- Usage tracking
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Owner
    created_by VARCHAR(100) DEFAULT 'system'
);

CREATE INDEX idx_templates_name ON asa_campaign_templates(name);
CREATE INDEX idx_templates_type ON asa_campaign_templates(template_type);

-- ================================================
-- Bid Suggestions Cache
-- ================================================
CREATE TABLE IF NOT EXISTS asa_bid_suggestions (
    id SERIAL PRIMARY KEY,
    keyword_id BIGINT NOT NULL,
    campaign_id BIGINT NOT NULL,
    adgroup_id BIGINT NOT NULL,

    -- Current values
    current_bid DECIMAL(12,4),
    current_cpa DECIMAL(12,4),
    current_roas DECIMAL(12,4),

    -- Suggested values
    suggested_bid DECIMAL(12,4) NOT NULL,
    suggestion_reason TEXT,
    confidence_score DECIMAL(5,4),  -- 0-1

    -- Target used for calculation
    target_type VARCHAR(20) CHECK (target_type IN ('cpa', 'roas')),
    target_value DECIMAL(12,4),

    -- Metrics used
    period_days INTEGER DEFAULT 7,
    impressions BIGINT,
    taps BIGINT,
    installs BIGINT,
    spend DECIMAL(12,4),
    revenue DECIMAL(12,4),

    -- Timestamps
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    -- Applied?
    applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP,

    UNIQUE(keyword_id, calculated_at)
);

CREATE INDEX idx_suggestions_keyword ON asa_bid_suggestions(keyword_id);
CREATE INDEX idx_suggestions_campaign ON asa_bid_suggestions(campaign_id);
CREATE INDEX idx_suggestions_calculated ON asa_bid_suggestions(calculated_at);

-- ================================================
-- Alert Notifications Log
-- ================================================
CREATE TABLE IF NOT EXISTS asa_alerts (
    id SERIAL PRIMARY KEY,

    -- Alert details
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'rule_execution',
        'budget_alert',
        'performance_alert',
        'sync_error',
        'api_error'
    )),
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT,

    -- Related entities
    rule_id INTEGER REFERENCES asa_automation_rules(id) ON DELETE SET NULL,
    campaign_id BIGINT,
    adgroup_id BIGINT,
    keyword_id BIGINT,

    -- Delivery
    channels JSONB DEFAULT '["log"]',  -- ["slack", "email", "log"]
    delivered_to JSONB DEFAULT '[]',

    -- Status
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP,
    acknowledged_by VARCHAR(100),

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_type ON asa_alerts(alert_type);
CREATE INDEX idx_alerts_severity ON asa_alerts(severity);
CREATE INDEX idx_alerts_created ON asa_alerts(created_at);
CREATE INDEX idx_alerts_acknowledged ON asa_alerts(acknowledged);

-- ================================================
-- Scheduled Jobs Tracking
-- ================================================
CREATE TABLE IF NOT EXISTS asa_scheduled_jobs (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(100) NOT NULL UNIQUE,
    job_type VARCHAR(50) NOT NULL CHECK (job_type IN (
        'rule_evaluation',
        'data_sync',
        'bid_suggestions',
        'report_generation'
    )),

    -- Schedule (cron expression)
    schedule VARCHAR(100) NOT NULL,

    -- Status
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    last_run_status VARCHAR(20),
    last_run_duration_ms INTEGER,
    last_error TEXT,
    next_run_at TIMESTAMP,

    -- Settings
    settings JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================
-- Helper Functions
-- ================================================

-- Function to record change history
CREATE OR REPLACE FUNCTION record_asa_change(
    p_entity_type VARCHAR(50),
    p_entity_id BIGINT,
    p_campaign_id BIGINT,
    p_adgroup_id BIGINT,
    p_keyword_id BIGINT,
    p_change_type VARCHAR(50),
    p_field_name VARCHAR(100),
    p_old_value TEXT,
    p_new_value TEXT,
    p_source VARCHAR(50),
    p_rule_id INTEGER DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    INSERT INTO asa_change_history (
        entity_type, entity_id, campaign_id, adgroup_id, keyword_id,
        change_type, field_name, old_value, new_value, source, rule_id
    ) VALUES (
        p_entity_type, p_entity_id, p_campaign_id, p_adgroup_id, p_keyword_id,
        p_change_type, p_field_name, p_old_value, p_new_value, p_source, p_rule_id
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check rule cooldown
CREATE OR REPLACE FUNCTION check_rule_cooldown(
    p_rule_id INTEGER,
    p_entity_type VARCHAR(50),
    p_entity_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
    v_cooldown_hours INTEGER;
    v_last_execution TIMESTAMP;
BEGIN
    -- Get rule cooldown setting
    SELECT cooldown_hours INTO v_cooldown_hours
    FROM asa_automation_rules
    WHERE id = p_rule_id;

    IF v_cooldown_hours IS NULL THEN
        RETURN true;  -- No cooldown set
    END IF;

    -- Check last execution for this rule + entity
    SELECT MAX(executed_at) INTO v_last_execution
    FROM asa_rule_executions
    WHERE rule_id = p_rule_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND status = 'executed';

    IF v_last_execution IS NULL THEN
        RETURN true;  -- Never executed
    END IF;

    -- Check if cooldown period has passed
    RETURN (CURRENT_TIMESTAMP - v_last_execution) > (v_cooldown_hours || ' hours')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to get daily execution count
CREATE OR REPLACE FUNCTION get_rule_daily_executions(
    p_rule_id INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM asa_rule_executions
    WHERE rule_id = p_rule_id
      AND status = 'executed'
      AND executed_at >= CURRENT_DATE;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- Views
-- ================================================

-- Recent rule activity
CREATE OR REPLACE VIEW v_recent_rule_activity AS
SELECT
    r.id as rule_id,
    r.name as rule_name,
    r.scope,
    r.action_type,
    r.enabled,
    COUNT(e.id) as total_executions,
    COUNT(CASE WHEN e.executed_at >= CURRENT_DATE THEN 1 END) as today_executions,
    COUNT(CASE WHEN e.executed_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_executions,
    MAX(e.executed_at) as last_execution
FROM asa_automation_rules r
LEFT JOIN asa_rule_executions e ON r.id = e.rule_id AND e.status = 'executed'
GROUP BY r.id, r.name, r.scope, r.action_type, r.enabled
ORDER BY last_execution DESC NULLS LAST;

-- Keyword performance summary (for rule evaluation)
CREATE OR REPLACE VIEW v_keyword_performance AS
SELECT
    k.keyword_id,
    k.campaign_id,
    k.adgroup_id,
    k.keyword_text,
    k.match_type,
    k.keyword_status,
    k.bid_amount as current_bid,
    -- Last 7 days metrics
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.spend ELSE 0 END) as spend_7d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.impressions ELSE 0 END) as impressions_7d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.taps ELSE 0 END) as taps_7d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.installs ELSE 0 END) as installs_7d,
    -- Last 14 days metrics
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '14 days' THEN k.spend ELSE 0 END) as spend_14d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '14 days' THEN k.impressions ELSE 0 END) as impressions_14d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '14 days' THEN k.taps ELSE 0 END) as taps_14d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '14 days' THEN k.installs ELSE 0 END) as installs_14d,
    -- Last 30 days metrics
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '30 days' THEN k.spend ELSE 0 END) as spend_30d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '30 days' THEN k.impressions ELSE 0 END) as impressions_30d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '30 days' THEN k.taps ELSE 0 END) as taps_30d,
    SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '30 days' THEN k.installs ELSE 0 END) as installs_30d,
    -- Calculated metrics (7d)
    CASE WHEN SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.installs ELSE 0 END) > 0
         THEN SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.spend ELSE 0 END) /
              SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.installs ELSE 0 END)
         ELSE NULL
    END as cpa_7d,
    CASE WHEN SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.impressions ELSE 0 END) > 0
         THEN SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.taps ELSE 0 END)::DECIMAL /
              SUM(CASE WHEN k.date >= CURRENT_DATE - INTERVAL '7 days' THEN k.impressions ELSE 0 END) * 100
         ELSE NULL
    END as ttr_7d,
    -- Latest sync
    MAX(k.date) as last_data_date
FROM apple_ads_keywords k
GROUP BY k.keyword_id, k.campaign_id, k.adgroup_id, k.keyword_text, k.match_type, k.keyword_status, k.bid_amount;

-- Campaign performance summary
CREATE OR REPLACE VIEW v_campaign_performance AS
SELECT
    c.campaign_id,
    c.campaign_name,
    c.campaign_status,
    c.daily_budget,
    -- Last 7 days
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '7 days' THEN c.spend ELSE 0 END) as spend_7d,
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '7 days' THEN c.impressions ELSE 0 END) as impressions_7d,
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '7 days' THEN c.taps ELSE 0 END) as taps_7d,
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '7 days' THEN c.installs ELSE 0 END) as installs_7d,
    -- Last 30 days
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '30 days' THEN c.spend ELSE 0 END) as spend_30d,
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '30 days' THEN c.impressions ELSE 0 END) as impressions_30d,
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '30 days' THEN c.taps ELSE 0 END) as taps_30d,
    SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '30 days' THEN c.installs ELSE 0 END) as installs_30d,
    -- CPA
    CASE WHEN SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '7 days' THEN c.installs ELSE 0 END) > 0
         THEN SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '7 days' THEN c.spend ELSE 0 END) /
              SUM(CASE WHEN c.date >= CURRENT_DATE - INTERVAL '7 days' THEN c.installs ELSE 0 END)
         ELSE NULL
    END as cpa_7d,
    MAX(c.date) as last_data_date
FROM apple_ads_campaigns c
GROUP BY c.campaign_id, c.campaign_name, c.campaign_status, c.daily_budget;

-- ================================================
-- Sample Data (for testing)
-- ================================================

-- Insert sample automation rules
-- (Commented out - uncomment to insert sample data)
/*
INSERT INTO asa_automation_rules (name, description, scope, conditions, action_type, action_params, frequency) VALUES
(
    'High CPA - Decrease Bid',
    'Decrease bid by 15% when CPA exceeds $50 over 7 days',
    'keyword',
    '[{"metric": "cpa", "operator": ">", "value": 50, "period": "7d"}, {"metric": "spend", "operator": ">", "value": 10, "period": "7d"}]',
    'adjust_bid',
    '{"adjustmentType": "percent", "adjustmentValue": -15, "minBid": 0.50}',
    'daily'
),
(
    'Low CPA - Increase Bid',
    'Increase bid by 10% when CPA is below $20 with good volume',
    'keyword',
    '[{"metric": "cpa", "operator": "<", "value": 20, "period": "7d"}, {"metric": "installs", "operator": ">", "value": 5, "period": "7d"}]',
    'adjust_bid',
    '{"adjustmentType": "percent", "adjustmentValue": 10, "maxBid": 10.00}',
    'daily'
),
(
    'No Impressions - Pause',
    'Pause keywords with no impressions in 14 days',
    'keyword',
    '[{"metric": "impressions", "operator": "=", "value": 0, "period": "14d"}]',
    'pause',
    '{}',
    'daily'
);
*/

COMMENT ON TABLE asa_automation_rules IS 'Stores automation rules for bid management and campaign optimization';
COMMENT ON TABLE asa_rule_executions IS 'Logs all rule executions with before/after values';
COMMENT ON TABLE asa_change_history IS 'Audit log for all changes made through the system';
COMMENT ON TABLE asa_campaign_templates IS 'Reusable templates for campaign creation';
COMMENT ON TABLE asa_bid_suggestions IS 'AI-generated bid suggestions based on performance data';
COMMENT ON TABLE asa_alerts IS 'Notification log for alerts and warnings';
