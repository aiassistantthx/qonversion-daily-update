# Методология расчёта Cohort ROAS

## Источники данных

### 1. Qonversion Raw Data Export
- **Файл:** CSV экспорт из Qonversion Dashboard
- **Содержит:** События подписок (покупки, продления, отмены, рефанды)
- **Таблица БД:** `qonversion_events`

### 2. Apple Search Ads API
- **API:** v5 (https://api.searchads.apple.com/api/v5)
- **Содержит:** Spend, impressions, taps, installs по кампаниям
- **Таблица БД:** `apple_ads_campaigns`

---

## Формула расчёта Revenue

### Дедупликация транзакций

**Проблема:** Одна транзакция генерирует несколько событий в Raw Data:
```
transaction_id: 370002573081689
├── Subscription Renewed    → price: $9.01
├── Subscription Canceled   → price: $9.01  (дубль)
├── Subscription Expired    → price: $9.01  (дубль)
└── Billing Retry           → price: $9.01  (дубль)
```

**Решение:** Считаем каждый `transaction_id` только один раз:
```sql
SELECT DISTINCT ON (transaction_id)
  transaction_id, q_user_id, event_date, price_usd
FROM qonversion_events
WHERE price_usd != 0
ORDER BY transaction_id, event_date
```

### Net Revenue (после комиссий)

```
Net Revenue = price_usd × 0.82
```

Где 0.82 = 100% - 15% (комиссия Apple) - 3% (налоги)

---

## Когортный анализ

### Определение когорты

Когорта = пользователи, установившие приложение в определённый месяц через Apple Ads.

```sql
SELECT DISTINCT ON (q_user_id)
  q_user_id, install_date, campaign
FROM qonversion_events
WHERE media_source = 'Apple AdServices'
  AND install_date IS NOT NULL
ORDER BY q_user_id, install_date
```

### Расчёт дней от установки

Дни считаются как 24-часовые периоды:
```sql
EXTRACT(EPOCH FROM (event_date - install_date)) / 86400.0 as days_since_install
```

### Revenue Windows

| Метрика | Условие |
|---------|---------|
| rev_d1 | days_since_install <= 1 |
| rev_d7 | days_since_install <= 7 |
| rev_d14 | days_since_install <= 14 |
| rev_d30 | days_since_install <= 30 |
| rev_d60 | days_since_install <= 60 |
| rev_d90 | days_since_install <= 90 |
| rev_d120 | days_since_install <= 120 |
| rev_d180 | days_since_install <= 180 |

### ROAS

```
ROAS_Dx = (Revenue_Dx / Spend) × 100%
```

---

## KPI Бенчмарки

Рассчитаны на основе mature когорт (до сентября 2025) с spend > $1000.

### Для D180 = 100% (окупаемость)

| День | % от D180 | Порог |
|------|-----------|-------|
| D7 | 24.1% | ≥ 24.1 |
| D30 | 44.0% | ≥ 44.0 |
| D60 | 62.6% | ≥ 62.6 |
| D90 | 74.5% | ≥ 74.5 |
| D120 | 84.4% | ≥ 84.4 |

### Прогноз D180

**Метод:** Линейная интерполяция между опорными точками.

**Опорные точки** (weighted average из mature когорт):
| День | % от D180 |
|------|-----------|
| D1 | 19.85% |
| D4 | 28.54% |
| D7 | 30.35% |
| D14 | 36.97% |
| D30 | 47.67% |
| D60 | 64.46% |
| D90 | 75.75% |
| D120 | 85.00% |
| D180 | 100% |

**Формула для любого дня X:**
```
Для X между Day_low и Day_high:
  coef(X) = (pct_low + (X - low) / (high - low) × (pct_high - pct_low)) / 100

D180_predict = текущий_ROAS / coef(X)
```

**SQL функции:**
```sql
-- Коэффициент LTV для любого дня
SELECT ltv_coefficient(158);  -- 0.945

-- День окупаемости
SELECT breakeven_day(158, 87.0);  -- 233
```

**View с предиктами:**
```sql
SELECT month, days, roas_current, d180_predict,
       breakeven_day, breakeven_date, status
FROM cohort_predictions;
```

---

### Расчёт дня окупаемости

**Если D180_predict ≥ 100%:**
Ищем день Y, где `coef(Y) = текущий_ROAS / 100`

**Если D180_predict < 100%:**
Экстраполируем рост после D180:
```
extra_days = (100 - D180_predict) / 0.15
breakeven_day = 180 + extra_days
```

**Рост после D180:** ~0.15% в день (среднее из 18 mature когорт)

| Период когорт | Рост/день после D180 |
|---------------|---------------------|
| 2025+ | 0.17% |
| 2024 H2 | 0.15% |
| 2024 H1 | 0.08% |
| **Среднее** | **0.15%** |

---

## Структура БД

### Нормализация кампаний

**Проблема:** В qonversion_events одна кампания может быть записана двумя способами:
- По campaign_id: `1512650496`
- По campaign_name: `ASA_tier-1_SR_GPT`

Без нормализации spend удваивается при join с apple_ads_campaigns.

**Решение:** Приводим все campaigns к campaign_id:
```sql
WITH campaign_mapping AS (
  SELECT DISTINCT campaign_id, campaign_name
  FROM apple_ads_campaigns
)
SELECT
  COALESCE(
    CASE WHEN campaign ~ '^[0-9]+$' THEN campaign::bigint END,
    cm.campaign_id
  ) as normalized_campaign_id
FROM qonversion_events q
LEFT JOIN campaign_mapping cm ON q.campaign = cm.campaign_name
```

---

### View: `cohort_roas`
Основной view для когортного анализа:
- Нормализация campaigns к campaign_id
- Дедупликация по transaction_id
- Net revenue (price × 0.82)
- Все временные окна (D1-D180)
- Join со spend из Apple Ads по campaign_id

### Таблица: `cohort_roas_data`
Материализованные данные для быстрых запросов.
Обновляется скриптом `worker/update-cohorts.js`.

---

## Скрипты

### Синхронизация Apple Ads
```bash
cd ~/scripts/qonversion && node worker/sync-historical-full.js
```

### Обновление когорт
```bash
cd ~/scripts/qonversion && node worker/update-cohorts.js
```

---

## Валидация данных

Для проверки корректности расчётов сравниваем с Qonversion Dashboard:

```sql
-- Проверка revenue за конкретный день
SELECT
  campaign,
  DATE(install_date) as install_date,
  ROUND(SUM(price_usd)::numeric, 2) as gross_revenue
FROM (
  SELECT DISTINCT ON (transaction_id) *
  FROM qonversion_events
  WHERE price_usd != 0
  ORDER BY transaction_id, event_date
) deduped
WHERE DATE(install_date) = '2026-03-07'
  AND campaign = 'RO_top'
GROUP BY campaign, DATE(install_date);
```

Ожидаемая точность: ±3% от данных в Qonversion Dashboard.

---

*Обновлено: 2026-03-08*
