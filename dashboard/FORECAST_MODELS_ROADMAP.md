# Roadmap: Переработка моделей прогнозирования

## Цель
Три модели с разными use-cases, согласованной методологией и точными расчётами.

---

## Модель 1: Automated Revenue Forecast (Status Quo Model)
**Файл:** API `/dashboard/forecast` + Planning.tsx (верхний график)
**Use case:** "Что будет если ничего не менять?" - прогноз при текущих метриках

### Изменения:
1. **Добавить маркетинг бюджет** - средний за последние 30 дней
2. **Добавить органику** - средний за последние 30 дней
3. **Рассчитывать новых подписчиков** на основе:
   - Spend / CAC (из реальных данных за 30 дней)
   - Соотношение weekly/yearly из реальных данных
4. **Добавить валидацию** - показывать ошибку прогноза vs факт

### Параметры (автоматические из API):
- `avgSpend30d` - средний spend за 30 дней
- `avgCAC30d` - средний CAC за 30 дней
- `avgOrganic30d` - органические подписчики за 30 дней
- `weeklyShare` - % weekly среди новых подписчиков
- `weeklyChurn` - 51% monthly (из retention curve)
- `yearlyChurn` - 8.4% monthly (из renewal rate 35%)

---

## Модель 2: Scenario Planning (What-If Model)
**Файл:** Planning.tsx (нижняя часть - Scenario Comparison)
**Use case:** "Что будет если изменить X?" - интерактивное планирование

### Изменения:
1. **Разделить churn на два типа:**
   - Weekly Churn (%/mo) - default 51%
   - Yearly Churn (%/yr) - default 65%

2. **Добавить Weekly/Yearly Share:**
   - Weekly Share (%) - default 78% (из реальных данных)

3. **Убрать blended Monthly Churn** - заменить на раздельные

4. **Пересчитать модель:**
   ```
   newPaidSubs = monthlyBudget / cacTarget
   newWeekly = newPaidSubs * weeklyShare + organicMonthly * weeklyShare
   newYearly = newPaidSubs * (1-weeklyShare) + organicMonthly * (1-weeklyShare)

   weeklyRetention = 1 - weeklyChurnMonthly/100
   yearlyRetention = (1 - yearlyChurnAnnual/100)^(1/12)

   activeWeekly = activeWeekly * weeklyRetention + newWeekly
   activeYearly = activeYearly * yearlyRetention + newYearly
   ```

### UI изменения:
- Заменить "Monthly Churn (%)" на:
  - "Weekly Churn (%/mo)"
  - "Yearly Churn (%/yr)"
- Добавить "Weekly Share (%)"

---

## Модель 3: Revenue Prediction (Detailed Funnel Model)
**Файл:** Prediction.tsx
**Use case:** Детальное моделирование с возможностью override по месяцам

### Изменения:
1. **Заменить CPI на CAC:**
   - Убрать: CPI, Trial Rate, Conversion Rate
   - Добавить: CAC Target ($)

2. **Упростить funnel:**
   ```
   Было: Spend → CPI → Installs → Trial% → Conversion% → Subs
   Стало: Spend → CAC → New Subs
   ```

3. **Сохранить раздельные churn rates:**
   - Weekly Churn (%/mo) - 51%
   - Yearly Churn (%/yr) - 65%

4. **Сохранить Weekly Share**

5. **Убрать лишние поля из таблицы:**
   - Убрать: Installs, CPI, Trials
   - Оставить: Month, Spend, CAC, New Subs, Active W, Active Y, Sales, ROAS

### Параметры после рефакторинга:
```
MARKETING:
- Monthly Budget ($): 50000
- CAC Target ($): 59

ORGANIC:
- New Subs/month: 304

SPLIT:
- Weekly Share (%): 78

PRICING:
- Weekly Price ($): 6.99
- Yearly Price ($): 49.99

RETENTION:
- Weekly Churn (%/mo): 51
- Yearly Churn (%/yr): 65
```

---

## API изменения

### Новый endpoint или расширение `/dashboard/forecast`:
```json
{
  "currentMetrics": {
    "avgSpend30d": 40000,
    "avgCAC30d": 59,
    "avgOrganic30d": 304,
    "weeklyShare": 0.78,
    "activeSubs": {...}
  },
  "modelParameters": {
    "weeklyChurnMonthly": 51,
    "yearlyChurnAnnual": 65,
    ...
  }
}
```

---

## Порядок выполнения

### Phase 1: API (backend) - DONE 2026-03-11
- [x] Добавить avgSpend30d, avgCAC30d в /dashboard/forecast
- [x] Добавить avgOrganic30d
- [x] Добавить weeklyShare из реальных данных

### Phase 2: Модель 1 (Automated Forecast) - DONE 2026-03-11
- [x] Использовать новые метрики из API (показываем в UI)
- [x] Добавить расчёт новых подписчиков (используя avgSpend30d / avgCAC30d)
- [x] Обновить forecast логику (показываем Spend, CAC, Organic, Weekly Share)

### Phase 3: Модель 2 (Scenario Planning) - DONE 2026-03-11
- [x] Разделить churn на weekly/yearly (weeklyChurnMonthly, yearlyChurnAnnual)
- [x] Добавить weeklyShare input
- [x] Переписать calculateForecast() с раздельными retention
- [x] Обновить UI inputs (Weekly Churn %/mo, Yearly Churn %/yr, Weekly Share %)

### Phase 4: Модель 3 (Prediction) - DONE 2026-03-11
- [x] Заменить CPI -> CAC (cacTarget instead of cpi)
- [x] Убрать Trial Rate, Conversion Rate
- [x] Упростить таблицу (убрали Installs, CPI)
- [x] Обновить расчёты (newSubs = spend / cac)

### Phase 5: Бектестирование на 12 когортах - DONE 2026-03-11
Каждая модель должна быть протестирована на исторических данных.

#### Методология бектеста:
1. Взять данные на дату T-12 месяцев (март 2025)
2. Запустить прогноз на 12 месяцев вперёд
3. Сравнить прогноз с фактическими данными
4. Рассчитать ошибку по каждому месяцу

#### Метрики валидации:
- **MAE** (Mean Absolute Error) - средняя абсолютная ошибка в $
- **MAPE** (Mean Absolute Percentage Error) - средняя % ошибка
- **Direction Accuracy** - правильно ли предсказали тренд (рост/падение)

#### Таблица бектеста для каждой модели:
```
| Month    | Actual  | Predicted | Error $ | Error % |
|----------|---------|-----------|---------|---------|
| 2025-04  | $XXk    | $XXk      | $XXk    | XX%     |
| 2025-05  | $XXk    | $XXk      | $XXk    | XX%     |
| ...      | ...     | ...       | ...     | ...     |
| 2026-03  | $XXk    | $XXk      | $XXk    | XX%     |
| AVERAGE  | -       | -         | $XXk    | XX%     |
```

#### Реализация:
- [x] Создать API endpoint `/dashboard/backtest`
- [x] Для каждой модели рассчитать прогноз с T-12
- [x] Сравнить с фактом из `/dashboard/main`
- [x] Показать таблицу валидации в UI
- [x] Добавить badge с точностью модели (±X%)

#### Модели в бектесте:
1. **Cohort-Based Model** - использует когорты подписчиков с churn для weekly и renewals для yearly
2. **Status Quo Model** - прогнозирует на основе метрик предыдущего месяца (spend, CAC, churn)
3. **Simple Average** - baseline модель (среднее за последние 3 месяца)

#### Целевая точность:
- Модель 1 (Status Quo): ±10% MAPE
- Модель 2 (Scenario): N/A (интерактивная)
- Модель 3 (Prediction): ±10% MAPE

---

## Ожидаемый результат

При одинаковых параметрах (CAC $59, Budget $40k, Churn 51%/65%):
- Все три модели должны показывать схожий тренд
- Модель 1: автоматический прогноз текущего состояния
- Модель 2: интерактивное сравнение сценариев
- Модель 3: детальное помесячное планирование
