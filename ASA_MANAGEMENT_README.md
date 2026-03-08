# Apple Search Ads Management Tool

Полнофункциональный инструмент для управления Apple Search Ads с CLI, веб-приложением и автоматизацией правил.

## Быстрый старт

### 1. Применить миграцию базы данных

```bash
cd ~/scripts/qonversion
psql $DATABASE_URL < db/asa_management_schema.sql
```

### 2. Перезапустить API сервер

```bash
cd ~/scripts/qonversion/api
npm run dev
```

### 3. Запустить веб-приложение

```bash
cd ~/scripts/qonversion/asa-webapp
npm run dev
# Открыть http://localhost:5174
```

### 4. Использовать CLI

```bash
cd ~/scripts/qonversion/cli
node asa-cli.js --help
```

---

## Компоненты

### 1. API Server (порт 3000)

Расширен новыми эндпоинтами `/asa/*`:

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/asa/campaigns` | GET | Список кампаний с метриками |
| `/asa/campaigns/:id` | GET | Детали кампании с ad groups |
| `/asa/campaigns/:id/status` | PATCH | Пауза/включение кампании |
| `/asa/campaigns/:id/budget` | PATCH | Обновить бюджет |
| `/asa/keywords` | GET | Список keywords с фильтрами |
| `/asa/keywords/bulk` | POST | Создать keywords |
| `/asa/keywords/:id/bid` | PATCH | Обновить bid |
| `/asa/keywords/bulk/bid` | PATCH | Bulk обновление bids |
| `/asa/rules` | GET/POST | Правила автоматизации |
| `/asa/rules/:id/execute` | POST | Выполнить правило |
| `/asa/rules/:id/preview` | GET | Превью результатов |
| `/asa/templates` | GET/POST | Шаблоны кампаний |
| `/asa/history` | GET | История изменений |
| `/asa/sync` | POST | Синхронизация данных |

### 2. CLI Tool

```bash
# Кампании
node asa-cli.js campaigns list
node asa-cli.js campaigns list --status=ENABLED
node asa-cli.js campaigns get <campaign_id>
node asa-cli.js campaigns pause <campaign_id>
node asa-cli.js campaigns enable <campaign_id>
node asa-cli.js campaigns budget <campaign_id> 150
node asa-cli.js campaigns performance --days=7

# Keywords
node asa-cli.js keywords list <campaign_id> <adgroup_id>
node asa-cli.js keywords performance <campaign_id> --days=7 --min-spend=10
node asa-cli.js keywords bid <keyword_id> 2.50 -c <campaign_id> -a <adgroup_id>
node asa-cli.js keywords bid-bulk --file=bids.csv -c <campaign_id> -a <adgroup_id>
node asa-cli.js keywords export <campaign_id> -o keywords.csv
node asa-cli.js keywords add-bulk --file=keywords.csv -c <campaign_id> -a <adgroup_id>

# Правила
node asa-cli.js rules list
node asa-cli.js rules get <rule_id>
node asa-cli.js rules create --file=rule.json
node asa-cli.js rules enable <rule_id>
node asa-cli.js rules disable <rule_id>
node asa-cli.js rules delete <rule_id> --yes
node asa-cli.js rules history --rule=1 --limit=50
node asa-cli.js rules examples  # Создать примеры правил

# Шаблоны
node asa-cli.js templates list
node asa-cli.js templates create --file=template.json
node asa-cli.js templates export <id> -o template.json
node asa-cli.js templates examples

# Синхронизация
node asa-cli.js sync test
node asa-cli.js sync status
node asa-cli.js sync incremental
node asa-cli.js sync full --days=7
node asa-cli.js sync campaign <campaign_id> --days=7
```

### 3. Automation Worker

Запуск в фоне для автоматического выполнения правил:

```bash
# Одноразовое выполнение
node worker/automation-worker.js --once

# Dry run (без изменений)
node worker/automation-worker.js --once --dry-run

# Непрерывная работа (как сервис)
node worker/automation-worker.js

# С подробным выводом
node worker/automation-worker.js --verbose
```

Расписание:
- **Hourly rules**: каждый час
- **Daily rules**: в 6:00 UTC + синхронизация данных
- **Weekly rules**: понедельник 6:00 UTC

### 4. Web Application (порт 5174)

Страницы:
- **Dashboard** - обзор метрик, кампании, правила, активность
- **Campaigns** - управление кампаниями, inline редактирование бюджета
- **Keywords** - фильтрация, bulk операции, экспорт CSV
- **Rules** - визуальный конструктор правил, preview, execution
- **Templates** - шаблоны кампаний
- **History** - аудит лог всех изменений

---

## Схема правил автоматизации

```json
{
  "name": "High CPA - Decrease Bid",
  "description": "Уменьшить bid на 15% когда CPA > $50",
  "scope": "keyword",
  "conditions": [
    {"metric": "cpa", "operator": ">", "value": 50, "period": "7d"},
    {"metric": "spend", "operator": ">", "value": 10, "period": "7d"}
  ],
  "conditions_logic": "AND",
  "action_type": "adjust_bid",
  "action_params": {
    "adjustmentType": "percent",
    "adjustmentValue": -15,
    "minBid": 0.50,
    "maxBid": 10.00
  },
  "frequency": "daily",
  "max_executions_per_day": 1,
  "cooldown_hours": 24,
  "enabled": true
}
```

### Доступные метрики
- `spend` - расходы
- `impressions` - показы
- `taps` - клики
- `installs` - установки
- `cpa` - стоимость установки
- `cpt` - стоимость клика
- `ttr` - tap-through rate

### Доступные действия
- `adjust_bid` - изменить bid на % или сумму
- `set_bid` - установить фиксированный bid
- `pause` - приостановить
- `enable` - включить
- `send_alert` - отправить уведомление

---

## База данных

Новые таблицы:

| Таблица | Описание |
|---------|----------|
| `asa_automation_rules` | Правила автоматизации |
| `asa_rule_executions` | Лог выполнения правил |
| `asa_change_history` | Аудит всех изменений |
| `asa_campaign_templates` | Шаблоны кампаний |
| `asa_bid_suggestions` | Рекомендации по bidам |
| `asa_alerts` | Уведомления |
| `asa_scheduled_jobs` | Статус scheduled jobs |

Views:
- `v_recent_rule_activity` - активность правил
- `v_keyword_performance` - метрики keywords
- `v_campaign_performance` - метрики кампаний

---

## Файловая структура

```
~/scripts/qonversion/
├── api/
│   ├── routes/
│   │   └── asa.js          # Новые CRUD эндпоинты
│   └── services/
│       ├── appleAds.js     # Расширенный сервис (write ops)
│       └── rulesEngine.js  # Движок правил
├── cli/
│   ├── asa-cli.js          # Главный CLI
│   ├── commands/
│   │   ├── campaigns.js
│   │   ├── keywords.js
│   │   ├── rules.js
│   │   ├── sync.js
│   │   └── templates.js
│   └── package.json
├── worker/
│   └── automation-worker.js # Cron scheduler
├── db/
│   └── asa_management_schema.sql
├── asa-webapp/             # React приложение
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/api.js
│   └── package.json
└── ASA_MANAGEMENT_README.md
```

---

## Примеры использования

### Создать правило через CLI

```bash
# Сгенерировать примеры
node asa-cli.js rules examples

# Создать правило
node asa-cli.js rules create --file=rule_high_cpa_decrease_bid.json

# Проверить
node asa-cli.js rules list
```

### Bulk обновление bids

```bash
# Экспортировать keywords
node asa-cli.js keywords export 123456 -o keywords.csv

# Отредактировать CSV, заполнить колонку new_bid

# Применить изменения (dry run)
node asa-cli.js keywords bid-bulk -f keywords.csv -c 123456 -a 789012 --dry-run

# Применить изменения
node asa-cli.js keywords bid-bulk -f keywords.csv -c 123456 -a 789012
```

### Тестовый запуск правил

```bash
# Dry run одного правила
curl -X POST "http://localhost:3000/asa/rules/1/execute?dry_run=true"

# Dry run всех правил
curl -X POST "http://localhost:3000/asa/rules/execute-all?dry_run=true"
```

---

## Coolify Deploy

API сервер уже задеплоен на Coolify. Для обновления:

```bash
# Push изменений в репозиторий
git add .
git commit -m "Add ASA management features"
git push

# Coolify автоматически подхватит изменения
# Или вручную:
curl -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  http://46.225.26.104:8000/api/v1/applications/rwwc84wcsgkc48g88wsoco4o/restart
```

---

*Создано: 2026-03-08*
