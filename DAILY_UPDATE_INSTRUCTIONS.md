# Ежедневное обновление AI_finmodel

## Таблица
https://docs.google.com/spreadsheets/d/1XGhckU9SJfGXK94JFVBIpAuoCBoybBSKVnT0Q4mqKwM/edit?gid=0#gid=0

Лист: `fact`

## Шаги обновления

### 1. Добавить новый день
- Добавить колонку для текущего дня (если ещё нет)

### 2. New Trials (строка 55)
- Источник: https://dash.qonversion.io/analytics/trials → New Trials
- Обновить данные за последние 7 дней

### 3. Apple Ads Cost (строка 7)
- Источник: Apple Search Ads или Qonversion интеграция
- Обновить расходы на рекламу

### 4. Sales (строка 19)
- Источник: Qonversion → Revenue/Proceeds
- Обновить продажи

### 5. New Yearly Subscribers (строка 58)
- Источник: Qonversion
- Фильтр по продуктам:
  - `chat.yearly.null.v1.0423`
  - `chat.yearly.null.v2.1006`
  - `chat.yearly.null.v3.0725`

### 6. Trial-to-Paid Conversion (строка 64)
- Источник: https://dash.qonversion.io/analytics/trials/trial-to-paid
- **Важно:** НЕ обновлять последние 4 дня (данные ещё не финальные)

### 7. Cohort Revenue (строка 93)
- Источник: https://dash.qonversion.io/cohorts?project=PcnB70vn&metric=revenue&valueType=relative&revenueType=gross&from=1646092800&to=1772841599&relativeInterval=last48Months&account=8htsgud1

#### Корректировки:
- **July 2025**: вычесть $4,225 из когортной выручки
- **Feb 2022**: вычесть $2,700 из итоговой суммы

## Проверка и отчёт

После обновления:
1. Проверить отклонения за 7 дней
2. Проверить отклонения за 30 дней
3. Убедиться что всё вписывается в общую картину
4. Сохранить изменения
5. Подготовить отчёт:
   - Что изменилось
   - Есть ли аномалии
   - Или всё стабильно

## Запуск

```bash
cd ~/scripts/qonversion && node daily-update.js
```
