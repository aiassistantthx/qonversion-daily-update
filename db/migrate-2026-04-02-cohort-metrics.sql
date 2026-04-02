-- Cohort Metrics View
-- Calculates D0, D4, D7, D14, D30 metrics by campaign/keyword

-- View for campaign-level cohort metrics
CREATE OR REPLACE VIEW v_cohort_metrics_campaigns AS
WITH cohort_base AS (
  SELECT
    e.campaign_id,
    DATE(e.install_date) as install_date,
    CURRENT_DATE - DATE(e.install_date) as cohort_age,
    -- Revenue by cohort day (multiply by 0.74 for proceeds)
    SUM(CASE WHEN e.event_date::date - e.install_date::date <= 0 THEN e.price_usd * 0.74 ELSE 0 END) as revenue_d0,
    SUM(CASE WHEN e.event_date::date - e.install_date::date <= 4 THEN e.price_usd * 0.74 ELSE 0 END) as revenue_d4,
    SUM(CASE WHEN e.event_date::date - e.install_date::date <= 7 THEN e.price_usd * 0.74 ELSE 0 END) as revenue_d7,
    SUM(CASE WHEN e.event_date::date - e.install_date::date <= 14 THEN e.price_usd * 0.74 ELSE 0 END) as revenue_d14,
    SUM(CASE WHEN e.event_date::date - e.install_date::date <= 30 THEN e.price_usd * 0.74 ELSE 0 END) as revenue_d30,
    -- Trials by cohort day
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 0 AND e.event_name = 'Trial Started' THEN e.q_user_id END) as trials_d0,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 4 AND e.event_name = 'Trial Started' THEN e.q_user_id END) as trials_d4,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 7 AND e.event_name = 'Trial Started' THEN e.q_user_id END) as trials_d7,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 14 AND e.event_name = 'Trial Started' THEN e.q_user_id END) as trials_d14,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 30 AND e.event_name = 'Trial Started' THEN e.q_user_id END) as trials_d30,
    -- Subscribers by cohort day (Trial Converted or Subscription Started)
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 0 AND e.event_name IN ('Trial Converted', 'Subscription Started') THEN e.q_user_id END) as subscribers_d0,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 4 AND e.event_name IN ('Trial Converted', 'Subscription Started') THEN e.q_user_id END) as subscribers_d4,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 7 AND e.event_name IN ('Trial Converted', 'Subscription Started') THEN e.q_user_id END) as subscribers_d7,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 14 AND e.event_name IN ('Trial Converted', 'Subscription Started') THEN e.q_user_id END) as subscribers_d14,
    COUNT(DISTINCT CASE WHEN e.event_date::date - e.install_date::date <= 30 AND e.event_name IN ('Trial Converted', 'Subscription Started') THEN e.q_user_id END) as subscribers_d30
  FROM events_v2 e
  WHERE e.refund = false
    AND e.install_date IS NOT NULL
    AND e.campaign_id IS NOT NULL
    AND e.media_source = 'Apple AdServices'
  GROUP BY e.campaign_id, DATE(e.install_date)
),
cohort_spend AS (
  SELECT
    campaign_id,
    date as install_date,
    SUM(spend) as spend
  FROM apple_ads_campaigns
  GROUP BY campaign_id, date
),
cohort_agg AS (
  SELECT
    cb.campaign_id,
    SUM(cb.revenue_d0) as revenue_d0,
    SUM(cb.revenue_d4) as revenue_d4,
    SUM(cb.revenue_d7) as revenue_d7,
    SUM(cb.revenue_d14) as revenue_d14,
    SUM(cb.revenue_d30) as revenue_d30,
    SUM(cb.trials_d0) as trials_d0,
    SUM(cb.trials_d4) as trials_d4,
    SUM(cb.trials_d7) as trials_d7,
    SUM(cb.trials_d14) as trials_d14,
    SUM(cb.trials_d30) as trials_d30,
    SUM(cb.subscribers_d0) as subscribers_d0,
    SUM(cb.subscribers_d4) as subscribers_d4,
    SUM(cb.subscribers_d7) as subscribers_d7,
    SUM(cb.subscribers_d14) as subscribers_d14,
    SUM(cb.subscribers_d30) as subscribers_d30,
    -- Only include spend for closed cohorts
    SUM(CASE WHEN cb.cohort_age >= 0 THEN COALESCE(cs.spend, 0) ELSE 0 END) as spend_d0,
    SUM(CASE WHEN cb.cohort_age >= 4 THEN COALESCE(cs.spend, 0) ELSE 0 END) as spend_d4,
    SUM(CASE WHEN cb.cohort_age >= 7 THEN COALESCE(cs.spend, 0) ELSE 0 END) as spend_d7,
    SUM(CASE WHEN cb.cohort_age >= 14 THEN COALESCE(cs.spend, 0) ELSE 0 END) as spend_d14,
    SUM(CASE WHEN cb.cohort_age >= 30 THEN COALESCE(cs.spend, 0) ELSE 0 END) as spend_d30,
    -- Revenue for closed cohorts only
    SUM(CASE WHEN cb.cohort_age >= 0 THEN cb.revenue_d0 ELSE 0 END) as closed_revenue_d0,
    SUM(CASE WHEN cb.cohort_age >= 4 THEN cb.revenue_d4 ELSE 0 END) as closed_revenue_d4,
    SUM(CASE WHEN cb.cohort_age >= 7 THEN cb.revenue_d7 ELSE 0 END) as closed_revenue_d7,
    SUM(CASE WHEN cb.cohort_age >= 14 THEN cb.revenue_d14 ELSE 0 END) as closed_revenue_d14,
    SUM(CASE WHEN cb.cohort_age >= 30 THEN cb.revenue_d30 ELSE 0 END) as closed_revenue_d30,
    -- Trials for closed cohorts
    SUM(CASE WHEN cb.cohort_age >= 0 THEN cb.trials_d0 ELSE 0 END) as closed_trials_d0,
    SUM(CASE WHEN cb.cohort_age >= 4 THEN cb.trials_d4 ELSE 0 END) as closed_trials_d4,
    SUM(CASE WHEN cb.cohort_age >= 7 THEN cb.trials_d7 ELSE 0 END) as closed_trials_d7,
    SUM(CASE WHEN cb.cohort_age >= 14 THEN cb.trials_d14 ELSE 0 END) as closed_trials_d14,
    SUM(CASE WHEN cb.cohort_age >= 30 THEN cb.trials_d30 ELSE 0 END) as closed_trials_d30,
    -- Subscribers for closed cohorts
    SUM(CASE WHEN cb.cohort_age >= 0 THEN cb.subscribers_d0 ELSE 0 END) as closed_subscribers_d0,
    SUM(CASE WHEN cb.cohort_age >= 4 THEN cb.subscribers_d4 ELSE 0 END) as closed_subscribers_d4,
    SUM(CASE WHEN cb.cohort_age >= 7 THEN cb.subscribers_d7 ELSE 0 END) as closed_subscribers_d7,
    SUM(CASE WHEN cb.cohort_age >= 14 THEN cb.subscribers_d14 ELSE 0 END) as closed_subscribers_d14,
    SUM(CASE WHEN cb.cohort_age >= 30 THEN cb.subscribers_d30 ELSE 0 END) as closed_subscribers_d30
  FROM cohort_base cb
  LEFT JOIN cohort_spend cs ON cb.campaign_id = cs.campaign_id AND cb.install_date = cs.install_date
  GROUP BY cb.campaign_id
)
SELECT
  ca.campaign_id,
  c.campaign_name,
  -- Total spend
  COALESCE(ca.spend_d0, 0) as spend,
  -- ROAS Dx = Revenue Dx / Spend (for closed cohorts)
  CASE WHEN ca.spend_d0 > 0 THEN ca.closed_revenue_d0 / ca.spend_d0 ELSE NULL END as roas_d0,
  CASE WHEN ca.spend_d4 > 0 THEN ca.closed_revenue_d4 / ca.spend_d4 ELSE NULL END as roas_d4,
  CASE WHEN ca.spend_d7 > 0 THEN ca.closed_revenue_d7 / ca.spend_d7 ELSE NULL END as roas_d7,
  CASE WHEN ca.spend_d14 > 0 THEN ca.closed_revenue_d14 / ca.spend_d14 ELSE NULL END as roas_d14,
  CASE WHEN ca.spend_d30 > 0 THEN ca.closed_revenue_d30 / ca.spend_d30 ELSE NULL END as roas_d30,
  -- COP Dx = Spend / Paid Users Dx
  CASE WHEN ca.closed_subscribers_d0 > 0 THEN ca.spend_d0 / ca.closed_subscribers_d0 ELSE NULL END as cop_d0,
  CASE WHEN ca.closed_subscribers_d4 > 0 THEN ca.spend_d4 / ca.closed_subscribers_d4 ELSE NULL END as cop_d4,
  CASE WHEN ca.closed_subscribers_d7 > 0 THEN ca.spend_d7 / ca.closed_subscribers_d7 ELSE NULL END as cop_d7,
  CASE WHEN ca.closed_subscribers_d14 > 0 THEN ca.spend_d14 / ca.closed_subscribers_d14 ELSE NULL END as cop_d14,
  CASE WHEN ca.closed_subscribers_d30 > 0 THEN ca.spend_d30 / ca.closed_subscribers_d30 ELSE NULL END as cop_d30,
  -- Cost per Trial Dx = Spend / Trials Dx
  CASE WHEN ca.closed_trials_d0 > 0 THEN ca.spend_d0 / ca.closed_trials_d0 ELSE NULL END as cpt_d0,
  CASE WHEN ca.closed_trials_d4 > 0 THEN ca.spend_d4 / ca.closed_trials_d4 ELSE NULL END as cpt_d4,
  CASE WHEN ca.closed_trials_d7 > 0 THEN ca.spend_d7 / ca.closed_trials_d7 ELSE NULL END as cpt_d7,
  CASE WHEN ca.closed_trials_d14 > 0 THEN ca.spend_d14 / ca.closed_trials_d14 ELSE NULL END as cpt_d14,
  CASE WHEN ca.closed_trials_d30 > 0 THEN ca.spend_d30 / ca.closed_trials_d30 ELSE NULL END as cpt_d30,
  -- Cost per Trial+Subscriber Dx = Spend / (Trials + Subscribers) Dx
  CASE WHEN (ca.closed_trials_d0 + ca.closed_subscribers_d0) > 0 THEN ca.spend_d0 / (ca.closed_trials_d0 + ca.closed_subscribers_d0) ELSE NULL END as cpts_d0,
  CASE WHEN (ca.closed_trials_d4 + ca.closed_subscribers_d4) > 0 THEN ca.spend_d4 / (ca.closed_trials_d4 + ca.closed_subscribers_d4) ELSE NULL END as cpts_d4,
  CASE WHEN (ca.closed_trials_d7 + ca.closed_subscribers_d7) > 0 THEN ca.spend_d7 / (ca.closed_trials_d7 + ca.closed_subscribers_d7) ELSE NULL END as cpts_d7,
  CASE WHEN (ca.closed_trials_d14 + ca.closed_subscribers_d14) > 0 THEN ca.spend_d14 / (ca.closed_trials_d14 + ca.closed_subscribers_d14) ELSE NULL END as cpts_d14,
  CASE WHEN (ca.closed_trials_d30 + ca.closed_subscribers_d30) > 0 THEN ca.spend_d30 / (ca.closed_trials_d30 + ca.closed_subscribers_d30) ELSE NULL END as cpts_d30,
  -- Raw metrics
  ca.revenue_d0, ca.revenue_d4, ca.revenue_d7, ca.revenue_d14, ca.revenue_d30,
  ca.trials_d0, ca.trials_d4, ca.trials_d7, ca.trials_d14, ca.trials_d30,
  ca.subscribers_d0, ca.subscribers_d4, ca.subscribers_d7, ca.subscribers_d14, ca.subscribers_d30
FROM cohort_agg ca
LEFT JOIN (
  SELECT DISTINCT ON (campaign_id) campaign_id, campaign_name
  FROM apple_ads_campaigns
  ORDER BY campaign_id, date DESC
) c ON ca.campaign_id = c.campaign_id
WHERE ca.spend_d0 > 0;
