-- Migration: Cohort ROAS prediction system
-- Date: 2026-03-08
-- Run on production PostgreSQL

-- 1. Create LTV coefficient function
CREATE OR REPLACE FUNCTION ltv_coefficient(day_num INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  days_arr INTEGER[] := ARRAY[1, 4, 7, 14, 30, 60, 90, 120, 180];
  pcts_arr NUMERIC[] := ARRAY[19.85, 28.54, 30.35, 36.97, 47.67, 64.46, 75.75, 85.00, 100.0];
  lower_idx INTEGER;
  ratio NUMERIC;
BEGIN
  IF day_num <= 1 THEN RETURN 0.1985; END IF;
  IF day_num >= 180 THEN RETURN 1.0; END IF;

  FOR i IN 1..8 LOOP
    IF days_arr[i] <= day_num AND days_arr[i+1] >= day_num THEN
      lower_idx := i;
      EXIT;
    END IF;
  END LOOP;

  ratio := (day_num - days_arr[lower_idx])::NUMERIC / (days_arr[lower_idx+1] - days_arr[lower_idx]);
  RETURN (pcts_arr[lower_idx] + ratio * (pcts_arr[lower_idx+1] - pcts_arr[lower_idx])) / 100;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Create breakeven day function
CREATE OR REPLACE FUNCTION breakeven_day(current_day INTEGER, current_roas NUMERIC)
RETURNS INTEGER AS $$
DECLARE
  d180_pred NUMERIC;
  coef NUMERIC;
  target_coef NUMERIC;
  day INTEGER;
  daily_growth NUMERIC := 0.15;
BEGIN
  coef := ltv_coefficient(current_day);
  d180_pred := current_roas / coef;

  IF d180_pred >= 100 THEN
    target_coef := current_roas / 100;
    FOR day IN current_day..180 LOOP
      IF ltv_coefficient(day) >= target_coef THEN
        RETURN day;
      END IF;
    END LOOP;
    RETURN 180;
  ELSE
    RETURN 180 + CEIL((100 - d180_pred) / daily_growth)::INTEGER;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Drop and recreate cohort_roas view with campaign normalization
DROP VIEW IF EXISTS cohort_roas CASCADE;

CREATE VIEW cohort_roas AS
WITH
campaign_mapping AS (
  SELECT DISTINCT campaign_id, campaign_name FROM apple_ads_campaigns
),
user_cohorts AS (
  SELECT DISTINCT ON (q.q_user_id)
    q.q_user_id, q.install_date,
    COALESCE(
      CASE WHEN q.campaign ~ '^[0-9]+$' THEN q.campaign::bigint END,
      cm.campaign_id
    ) as campaign_id,
    DATE(q.install_date) as cohort_date
  FROM qonversion_events q
  LEFT JOIN campaign_mapping cm ON q.campaign = cm.campaign_name
  WHERE q.media_source = 'Apple AdServices' AND q.install_date IS NOT NULL
  ORDER BY q.q_user_id, q.install_date
),
unique_transactions AS (
  SELECT DISTINCT ON (transaction_id)
    transaction_id, q_user_id, event_date, price_usd * 0.82 as revenue
  FROM qonversion_events WHERE price_usd != 0
  ORDER BY transaction_id, event_date
),
revenue_by_day AS (
  SELECT
    uc.campaign_id,
    DATE_TRUNC('month', uc.install_date)::date as cohort_month,
    ut.q_user_id, ut.revenue,
    EXTRACT(EPOCH FROM (ut.event_date - uc.install_date)) / 86400.0 as days_since_install
  FROM user_cohorts uc
  JOIN unique_transactions ut ON uc.q_user_id = ut.q_user_id
  WHERE uc.campaign_id IS NOT NULL
),
cohort_revenue AS (
  SELECT
    campaign_id, cohort_month,
    COUNT(DISTINCT q_user_id) as paying_users,
    SUM(revenue) as rev_total,
    SUM(CASE WHEN days_since_install <= 1 THEN revenue ELSE 0 END) as rev_d1,
    SUM(CASE WHEN days_since_install <= 4 THEN revenue ELSE 0 END) as rev_d4,
    SUM(CASE WHEN days_since_install <= 7 THEN revenue ELSE 0 END) as rev_d7,
    SUM(CASE WHEN days_since_install <= 14 THEN revenue ELSE 0 END) as rev_d14,
    SUM(CASE WHEN days_since_install <= 30 THEN revenue ELSE 0 END) as rev_d30,
    SUM(CASE WHEN days_since_install <= 60 THEN revenue ELSE 0 END) as rev_d60,
    SUM(CASE WHEN days_since_install <= 90 THEN revenue ELSE 0 END) as rev_d90,
    SUM(CASE WHEN days_since_install <= 120 THEN revenue ELSE 0 END) as rev_d120,
    SUM(CASE WHEN days_since_install <= 180 THEN revenue ELSE 0 END) as rev_d180
  FROM revenue_by_day
  GROUP BY campaign_id, cohort_month
),
apple_spend AS (
  SELECT campaign_id, DATE_TRUNC('month', date)::date as month,
    MAX(campaign_name) as campaign_name, SUM(installs) as installs, SUM(spend) as spend
  FROM apple_ads_campaigns
  GROUP BY campaign_id, DATE_TRUNC('month', date)
),
with_spend AS (
  SELECT cr.campaign_id, asp.campaign_name as campaign, cr.cohort_month, cr.paying_users,
    asp.installs, asp.spend, cr.rev_d1, cr.rev_d4, cr.rev_d7, cr.rev_d14, cr.rev_d30,
    cr.rev_d60, cr.rev_d90, cr.rev_d120, cr.rev_d180, cr.rev_total
  FROM cohort_revenue cr
  JOIN apple_spend asp ON cr.campaign_id = asp.campaign_id AND cr.cohort_month = asp.month
)
SELECT
  campaign, cohort_month, paying_users, installs,
  ROUND(spend::numeric, 2) as spend,
  ROUND(rev_d1::numeric, 2) as rev_d1,
  ROUND(rev_d4::numeric, 2) as rev_d4,
  ROUND(rev_d7::numeric, 2) as rev_d7,
  ROUND(rev_d14::numeric, 2) as rev_d14,
  ROUND(rev_d30::numeric, 2) as rev_d30,
  ROUND(rev_d60::numeric, 2) as rev_d60,
  ROUND(rev_d90::numeric, 2) as rev_d90,
  ROUND(rev_d120::numeric, 2) as rev_d120,
  ROUND(rev_d180::numeric, 2) as rev_d180,
  ROUND(rev_total::numeric, 2) as rev_total,
  ROUND((rev_d1 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d1_pct,
  ROUND((rev_d4 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d4_pct,
  ROUND((rev_d7 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d7_pct,
  ROUND((rev_d14 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d14_pct,
  ROUND((rev_d30 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d30_pct,
  ROUND((rev_d60 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d60_pct,
  ROUND((rev_d90 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d90_pct,
  ROUND((rev_d120 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d120_pct,
  ROUND((rev_d180 / NULLIF(spend, 0) * 100)::numeric, 1) as roas_d180_pct
FROM with_spend
WHERE spend > 0;

-- 4. Create cohort_predictions view
DROP VIEW IF EXISTS cohort_predictions;

CREATE VIEW cohort_predictions AS
WITH
campaign_mapping AS (
  SELECT DISTINCT campaign_id, campaign_name FROM apple_ads_campaigns
),
user_cohorts AS (
  SELECT DISTINCT ON (q.q_user_id)
    q.q_user_id, q.install_date,
    COALESCE(
      CASE WHEN q.campaign ~ '^[0-9]+$' THEN q.campaign::bigint END,
      cm.campaign_id
    ) as campaign_id
  FROM qonversion_events q
  LEFT JOIN campaign_mapping cm ON q.campaign = cm.campaign_name
  WHERE q.media_source = 'Apple AdServices' AND q.install_date IS NOT NULL
  ORDER BY q.q_user_id, q.install_date
),
unique_transactions AS (
  SELECT DISTINCT ON (transaction_id)
    transaction_id, q_user_id, event_date, price_usd * 0.82 as revenue
  FROM qonversion_events WHERE price_usd != 0
  ORDER BY transaction_id, event_date
),
cohort_revenue AS (
  SELECT
    DATE_TRUNC('month', uc.install_date)::date as cohort_month,
    (CURRENT_DATE - DATE_TRUNC('month', uc.install_date)::date) as days_elapsed,
    SUM(ut.revenue) as rev_total
  FROM user_cohorts uc
  JOIN unique_transactions ut ON uc.q_user_id = ut.q_user_id
  WHERE uc.campaign_id IS NOT NULL
  GROUP BY DATE_TRUNC('month', uc.install_date)
),
spend AS (
  SELECT DATE_TRUNC('month', date)::date as month, SUM(spend) as spend
  FROM apple_ads_campaigns GROUP BY DATE_TRUNC('month', date)
)
SELECT
  TO_CHAR(cr.cohort_month, 'YYYY-MM') as month,
  cr.days_elapsed as days,
  ROUND(s.spend::numeric, 0) as spend,
  ROUND((cr.rev_total / NULLIF(s.spend, 0) * 100)::numeric, 1) as roas_current,
  ROUND(ltv_coefficient(cr.days_elapsed::integer)::numeric, 3) as coef,
  ROUND((cr.rev_total / NULLIF(s.spend, 0) / NULLIF(ltv_coefficient(cr.days_elapsed::integer), 0) * 100)::numeric, 1) as d180_predict,
  breakeven_day(cr.days_elapsed::integer, (cr.rev_total / NULLIF(s.spend, 0) * 100)::numeric) as breakeven_day,
  cr.cohort_month + breakeven_day(cr.days_elapsed::integer, (cr.rev_total / NULLIF(s.spend, 0) * 100)::numeric) as breakeven_date,
  CASE
    WHEN cr.days_elapsed >= 180 THEN 'Mature'
    WHEN cr.rev_total / NULLIF(s.spend, 0) / NULLIF(ltv_coefficient(cr.days_elapsed::integer), 0) * 100 >= 100 THEN 'OK'
    WHEN cr.rev_total / NULLIF(s.spend, 0) / NULLIF(ltv_coefficient(cr.days_elapsed::integer), 0) * 100 >= 90 THEN 'Риск'
    WHEN cr.rev_total / NULLIF(s.spend, 0) / NULLIF(ltv_coefficient(cr.days_elapsed::integer), 0) * 100 >= 80 THEN 'Плохо'
    ELSE 'Убыток'
  END as status
FROM cohort_revenue cr
JOIN spend s ON cr.cohort_month = s.month
WHERE s.spend > 1000
ORDER BY cr.cohort_month DESC;

-- Done
SELECT 'Migration completed successfully' as status;
