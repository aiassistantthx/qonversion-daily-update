# Ежедневное обновление AI_finmodel

## Таблица
https://docs.google.com/spreadsheets/d/1XGhckU9SJfGXK94JFVBIpAuoCBoybBSKVnT0Q4mqKwM/edit?gid=0#gid=0

Лист: `fact`

## Автоматическое обновление

Скрипт запускается автоматически каждый день в **9:00** через launchd.

### Запуск вручную

```bash
# Стандартный запуск (последние 10 дней)
cd ~/scripts/qonversion && node daily-update-api.js

# За последние 30 дней
node daily-update-api.js --days=30

# Кастомный диапазон дат
node daily-update-api.js --from=2026-02-01 --to=2026-03-08

# Тестовый режим (без записи в таблицу)
node daily-update-api.js --dry-run

# Подробный вывод
node daily-update-api.js --verbose
```

### Логи и отчёты

- **Лог:** `~/scripts/qonversion/daily-update.log`
- **Cron лог:** `~/scripts/qonversion/cron.log`
- **Отчёты:** `~/scripts/qonversion/reports/report-YYYY-MM-DD.md`
- **Данные:** `~/scripts/qonversion/data/api-update-YYYY-MM-DD.json`

## Источники данных

### API (основной источник)
```
http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io/dashboard/main
```

Возвращает:
- `daily[]` - ежедневные данные (spend, revenue, subscribers)
- `monthly[]` - месячные данные (trials, converted, subscribers)
- `currentMonth` - метрики текущего месяца

### Таблицы в БД
- `qonversion_events` - события подписок из Qonversion webhook
- `apple_ads_campaigns` - расходы Apple Ads

## Строки в таблице

| Строка | Метрика | Источник |
|--------|---------|----------|
| 7 | Apple Ads Cost (Spend) | API: `daily[].spend` |
| 19 | Sales (Revenue) | API: `daily[].revenue` |
| 55 | New Trials | API: `monthly[].trials` |
| 58 | New Yearly Subscribers | API: `daily[].subscribers` |
| 64 | Trial-to-Paid Conversion | API: `currentMonth.crToPaid` |
| 93 | Cohort Rev Gross | Qonversion Dashboard UI: `dash.qonversion.io/cohorts` (Playwright) |

## Unit Economics метрики

Скрипт автоматически рассчитывает:

| Метрика | Формула | Описание |
|---------|---------|----------|
| CAC | Spend / Subscribers | Cost of Acquisition |
| ARPU | Revenue / Subscribers | Avg Revenue Per User |
| ROAS | Revenue / Spend | Return on Ad Spend |
| LTV/CAC | ARPU / CAC | Эффективность привлечения |
| CR to Paid | Converted / Trials | Конверсия триала в платку |

### Пример вывода

```
==================================================
UNIT ECONOMICS SUMMARY
==================================================
Month: 2026-03
  Spend:        $13915.90
  Revenue:      $28397.89
  Subscribers:  309
  CAC:          $58.28
  ARPU:         $91.90
  ROAS:         2.04x
  LTV/CAC:      1.58
  CR to Paid:   9.77%
==================================================
```

## Обновление когорт (Cohort Rev Gross, row 93)

Когорты обновляются ежедневно вместе с остальными данными. Значения растут каждый день, т.к. когорты продолжают генерировать revenue.

**Источник:** Qonversion Dashboard UI — `dash.qonversion.io/cohorts`
- metric=revenue, revenueType=gross, valueType=absolute
- Колонка **Sum** — total gross revenue по когорте
- API эндпоинта нет, парсить через **Playwright** с `auth.json`

**URL:**
```
https://dash.qonversion.io/cohorts?project=PcnB70vn&metric=revenue&valueType=absolute&revenueType=gross&from=1646092800&to=1773705599&relativeInterval=last48Months&account=8htsgud1
```

**Обновляемые ячейки:** B93:AI93 (ежемесячные когорты Jun 23 — Mar 26)

## Корректировки когорт

- **July 2025**: вычесть $4,225 из когортной выручки
- **Feb 2022**: вычесть $2,700 из итоговой суммы

## Важные правила

1. **Apple Ads Cost = 0** — скрипт НЕ записывает нули, чтобы не затирать реальные данные
2. **Trial-to-Paid** — последние 4 дня не учитываются (данные ещё не финальные)
3. **Колонки** — автоматически расширяются при необходимости

## Структура колонок

- Базовая колонка: `AMP` = 26.02.2026 (индекс 1030)
- Каждый следующий день = +1 колонка
- Пример: Mar 8 = `AMZ` (1040)

## Troubleshooting

### Данные не обновились
```bash
# Проверить логи
tail -50 ~/scripts/qonversion/daily-update.log

# Проверить статус launchd
launchctl list | grep qonversion
```

### Перезапустить launchd agent
```bash
launchctl unload ~/Library/LaunchAgents/com.qonversion.daily-update.plist
launchctl load ~/Library/LaunchAgents/com.qonversion.daily-update.plist
```

### Проверить API
```bash
curl -s http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io/health
curl -s http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io/dashboard/main | head -100
```

## Legacy скрипт (Playwright)

Старый скрипт `daily-update.js` использует Playwright для парсинга UI Qonversion.
Используется как fallback если API недоступен.

```bash
# Требует auth.json (сессия браузера)
cd ~/scripts/qonversion && node daily-update.js
```

Если сессия истекла:
```bash
node login.js  # откроется браузер для авторизации
```
