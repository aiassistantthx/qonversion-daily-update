-- Budget Alerts Table
-- Tracks budget threshold alerts for campaigns

CREATE TABLE IF NOT EXISTS asa_budget_alerts (
  id SERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL,
  alert_level VARCHAR(20) NOT NULL, -- 'warning' (80%) or 'critical' (100%)
  message TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  UNIQUE(campaign_id, DATE(created_at))
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_campaign ON asa_budget_alerts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_budget_alerts_date ON asa_budget_alerts(created_at);
