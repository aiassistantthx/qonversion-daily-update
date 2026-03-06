const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SheetsUpdater = require('./sheets-updater');

const CONFIG = {
  spreadsheetId: '1XGhckU9SJfGXK94JFVBIpAuoCBoybBSKVnT0Q4mqKwM',
  sheet: 'fact',
  rows: {
    appleAdsCost: 7,
    sales: 19,
    newTrials: 55,
    newYearlySubscribers: 58,
    trialToPaidConversion: 64,
    cohortRevenue: 93
  },
  // Диапазон колонок для поиска дат (с конца таблицы)
  dateSearchRange: 'AMP1:ANZ1',
  // Базовая колонка (AMP = колонка 1030)
  baseColumn: 'AMP',
  baseColumnIndex: 1030,
  yearlyProducts: [
    'chat.yearly.null.v1.0423',
    'chat.yearly.null.v2.1006',
    'chat.yearly.null.v3.0725'
  ],
  cohortAdjustments: {
    'Jul 2025': -4225,
    'Feb 2022': -2700
  }
};

const LOG_FILE = path.join(__dirname, 'daily-update.log');
const REPORT_DIR = path.join(__dirname, 'reports');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function initBrowser() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'auth.json')
  });
  return { browser, context };
}

// ============ DATA COLLECTORS ============

async function getNewTrials(page) {
  log('Получаю New Trials...');
  await page.goto('https://dash.qonversion.io/analytics/trials', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(3000);
  await page.click('text=New Trials', { timeout: 5000 });
  await page.waitForTimeout(5000);

  const data = await extractTableData(page);
  log(`New Trials: ${JSON.stringify(data)}`);
  return data;
}

async function getSales(page) {
  log('Получаю Sales...');
  // Идём на страницу Revenue
  await page.goto('https://dash.qonversion.io/analytics/revenue', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(3000);

  // Кликаем на Sales (не Proceeds!)
  try {
    await page.click('text=Sales', { timeout: 3000 });
    await page.waitForTimeout(3000);
  } catch (e) {
    log('Не удалось кликнуть на Sales');
  }

  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'sales.png'),
    fullPage: true
  });

  // Извлекаем данные - ищем таблицу с After refunds или Proceeds
  const data = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return {};

    const headers = Array.from(table.querySelectorAll('thead th, thead td'))
      .map(cell => cell.textContent.trim());

    const result = {};
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      const label = cells[0]?.textContent.trim().toLowerCase() || '';

      if (label.includes('after refund') || label.includes('proceed') || label.includes('total')) {
        cells.forEach((cell, i) => {
          if (headers[i]) {
            result[headers[i]] = cell.textContent.trim();
          }
        });
      }
    });

    return result;
  });

  log(`Sales: ${JSON.stringify(data)}`);
  return data;
}

async function getTrialToPaidConversion(page) {
  log('Получаю Trial-to-Paid Conversion за последние 30 дней...');

  // Формируем URL с диапазоном 30 дней
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);

  const fromTs = Math.floor(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) / 1000);
  const toTs = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59) / 1000);

  const url = `https://dash.qonversion.io/analytics/trials?from=${fromTs}&to=${toTs}&project=PcnB70vn&account=8htsgud1`;

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(3000);

  // Кликаем на Trial-to-Paid Conversion
  try {
    await page.click('text=Trial-to-Paid', { timeout: 5000 });
    await page.waitForTimeout(5000);
  } catch (e) {
    log('Не удалось кликнуть на Trial-to-Paid');
  }

  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'trial-to-paid.png'),
    fullPage: true
  });

  const data = await extractTableData(page);
  log(`Trial-to-Paid: ${JSON.stringify(data)}`);
  return data;
}

async function getCohortRevenue(page) {
  log('Получаю Cohort Revenue...');
  const url = 'https://dash.qonversion.io/cohorts?project=PcnB70vn&metric=revenue&valueType=relative&revenueType=gross&from=1646092800&to=1772841599&relativeInterval=last48Months&account=8htsgud1';

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(8000);

  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'cohorts.png'),
    fullPage: true
  });

  // Извлекаем данные когорт
  const data = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return [];

    const rows = [];
    const allRows = table.querySelectorAll('tr');

    allRows.forEach((row, idx) => {
      const cells = Array.from(row.querySelectorAll('td, th'))
        .map(cell => cell.textContent.trim());
      if (cells.length > 0) {
        rows.push({
          index: idx,
          cohort: cells[0],
          total: cells[cells.length - 1],
          data: cells
        });
      }
    });

    return rows;
  });

  // Применяем корректировки
  const adjustedData = data.map(row => {
    let adjusted = { ...row };
    if (row.cohort === 'Jul 2025') {
      const value = parseFloat(row.total.replace(/[$,]/g, '')) || 0;
      adjusted.adjustedTotal = value + CONFIG.cohortAdjustments['Jul 2025'];
      adjusted.adjustment = CONFIG.cohortAdjustments['Jul 2025'];
    }
    if (row.cohort === 'Feb 2022') {
      const value = parseFloat(row.total.replace(/[$,]/g, '')) || 0;
      adjusted.adjustedTotal = value + CONFIG.cohortAdjustments['Feb 2022'];
      adjusted.adjustment = CONFIG.cohortAdjustments['Feb 2022'];
    }
    return adjusted;
  });

  log(`Cohort data rows: ${data.length}`);
  return adjustedData;
}

async function getAppleAdsCost(page) {
  log('Получаю Apple Ads Cost по дням...');

  const result = { byDate: {}, total: 0 };

  // Получаем данные за последние 7 дней, каждый день отдельно (UTC)
  const now = new Date();
  const days = [];

  for (let i = 7; i >= 0; i--) {
    const date = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - i,
      0, 0, 0
    ));

    const from = Math.floor(date.getTime() / 1000);
    const to = from + 86399; // +23:59:59

    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    days.push({ dateStr, from, to });
  }

  for (const day of days) {
    const url = `https://dash.qonversion.io/apple-search-ads?from=${day.from}&to=${day.to}&project=PcnB70vn&appleAdsType=campaigns&appleAdsRevenueType=gross&environment=0&account=8htsgud1`;

    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    // Ждём загрузки данных (они подгружаются асинхронно)
    await page.waitForTimeout(5000);

    // Извлекаем Spend через DOM структуру
    const spend = await page.evaluate(() => {
      // Ищем элемент с текстом "Spend" через TreeWalker
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.textContent.trim() === 'Spend') {
          // Нашли "Spend", ищем значение в родительском контейнере
          let parent = node.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const text = parent.textContent;
            const match = text.match(/Spend\s*\$?([\d,\.]+)([KMB])?/);
            if (match) {
              let val = parseFloat(match[1].replace(/,/g, ''));
              if (match[2] === 'K') val *= 1000;
              if (match[2] === 'M') val *= 1000000;
              return val;
            }
            parent = parent.parentElement;
          }
        }
      }

      return 0;
    });

    result.byDate[day.dateStr] = spend;
    result.total += spend;
    log(`  ${day.dateStr}: $${spend}`);
  }

  // Скриншот последнего дня
  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'apple-ads.png'),
    fullPage: true
  });

  log(`Apple Ads Cost Total: $${result.total}`);
  return result;
}

async function getNewYearlySubscribers(page) {
  log('Получаю New Yearly Subscribers...');

  // Идём на страницу New Subscriptions
  await page.goto('https://dash.qonversion.io/analytics/subscriptions', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });
  await page.waitForTimeout(3000);

  // Кликаем на New Subscriptions
  try {
    await page.click('text=New Subscriptions', { timeout: 5000 });
    await page.waitForTimeout(3000);
  } catch (e) {
    log('Не удалось кликнуть на New Subscriptions');
  }

  // Пробуем применить фильтр по продукту
  try {
    await page.click('text=Filter', { timeout: 3000 });
    await page.waitForTimeout(1000);

    // Ищем фильтр по продукту
    await page.click('text=Product', { timeout: 3000 });
    await page.waitForTimeout(1000);

    // Пробуем выбрать yearly продукты
    for (const product of CONFIG.yearlyProducts) {
      try {
        await page.click(`text=${product}`, { timeout: 1000 });
      } catch (e) {
        // Продукт не найден
      }
    }

    await page.click('text=Apply', { timeout: 3000 });
    await page.waitForTimeout(3000);
  } catch (e) {
    log('Не удалось применить фильтр по продуктам');
  }

  await page.screenshot({
    path: path.join(__dirname, 'screenshots', 'yearly-subs.png'),
    fullPage: true
  });

  const data = await extractTableData(page);
  log(`Yearly Subscribers: ${JSON.stringify(data)}`);
  return data;
}

// ============ HELPERS ============

// Преобразует номер колонки в буквенное обозначение Excel (1 = A, 27 = AA, etc.)
function columnIndexToLetter(index) {
  let result = '';
  while (index > 0) {
    index--;
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26);
  }
  return result;
}

// Преобразует дату в формат DD.MM
function formatDateDDMM(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

// Находит колонку для заданной даты
// dateMap: объект { 'DD.MM': columnLetter }
function findColumnForDate(dateMap, targetDate) {
  const dateStr = formatDateDDMM(targetDate);
  return dateMap[dateStr] || null;
}

// Строит карту дат -> колонок на основе известного диапазона
function buildDateColumnMap() {
  // Известные колонки (из последнего сканирования):
  // AMP = 26.02, AMQ = 27.02, AMR = 28.02, AMS = 01.03, AMT = 02.03,
  // AMU = 03.03, AMV = 04.03, AMW = 05.03, AMX = 06.03, ...
  const baseDate = new Date(2026, 1, 26); // 26 февраля 2026
  const baseColumnIndex = 1030; // AMP = 1030

  const dateMap = {};

  // Генерируем карту на 60 дней вперёд от базовой даты
  for (let i = 0; i < 60; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + i);
    const dateStr = formatDateDDMM(date);
    const colIndex = baseColumnIndex + i;
    const colLetter = columnIndexToLetter(colIndex);
    dateMap[dateStr] = colLetter;
  }

  return dateMap;
}

async function extractTableData(page) {
  return await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return {};

    const headers = Array.from(table.querySelectorAll('thead th, thead td'))
      .map(cell => cell.textContent.trim());

    const row = table.querySelector('tbody tr');
    if (!row) return {};

    const cells = Array.from(row.querySelectorAll('td'))
      .map(cell => cell.textContent.trim());

    const result = {};
    headers.forEach((h, i) => {
      if (cells[i] && h) result[h] = cells[i];
    });

    return result;
  });
}

// ============ REPORT GENERATOR ============

function generateReport(data, anomalies) {
  const date = new Date().toISOString().split('T')[0];

  let report = `# Daily Report: ${date}\n\n`;

  report += `## Собранные данные\n\n`;

  if (data.newTrials && Object.keys(data.newTrials).length > 0) {
    report += `### New Trials (последние 7 дней)\n`;
    Object.entries(data.newTrials).forEach(([k, v]) => {
      if (k !== 'Total' && k !== '') report += `- ${k}: ${v}\n`;
    });
    report += `- **Total: ${data.newTrials.Total || 'N/A'}**\n\n`;
  }

  if (data.sales && Object.keys(data.sales).length > 0) {
    report += `### Sales (Gross Revenue)\n`;
    Object.entries(data.sales).forEach(([k, v]) => {
      if (k !== 'All' && k !== '') report += `- ${k}: ${v}\n`;
    });
    report += '\n';
  }

  if (data.trialToPaid && Object.keys(data.trialToPaid).length > 0) {
    report += `### Trial-to-Paid Conversion\n`;
    report += `*Последние 4 дня (0%) не учитываются — данные ещё не финальные*\n\n`;
    Object.entries(data.trialToPaid).forEach(([k, v]) => {
      if (v !== '0%') report += `- ${k}: ${v}\n`;
    });
    report += '\n';
  }

  if (data.appleAds && data.appleAds.byDate) {
    report += `### Apple Ads Cost\n`;
    Object.entries(data.appleAds.byDate).forEach(([date, spend]) => {
      report += `- ${date}: $${spend.toFixed(2)}\n`;
    });
    report += `- **Total: $${data.appleAds.total.toFixed(2)}**\n\n`;
  }

  if (data.yearlySubscribers && Object.keys(data.yearlySubscribers).length > 0) {
    report += `### New Yearly Subscribers\n`;
    Object.entries(data.yearlySubscribers).forEach(([k, v]) => {
      report += `- ${k}: ${v}\n`;
    });
    report += '\n';
  }

  if (data.cohorts && data.cohorts.length > 0) {
    report += `### Cohort Revenue (последние когорты)\n`;
    data.cohorts.slice(0, 10).forEach(row => {
      if (row.cohort && row.total) {
        let line = `- ${row.cohort}: ${row.total}`;
        if (row.adjustment) {
          line += ` (корректировка: ${row.adjustment}, итого: $${row.adjustedTotal})`;
        }
        report += line + '\n';
      }
    });
    report += '\n';
  }

  report += `## Проверка аномалий\n\n`;

  if (anomalies.length === 0) {
    report += `✅ Всё стабильно, аномалий не обнаружено.\n\n`;
  } else {
    report += `⚠️ Обнаружены отклонения:\n\n`;
    anomalies.forEach(a => {
      report += `- ${a}\n`;
    });
    report += '\n';
  }

  report += `## Скриншоты\n\n`;
  report += `Сохранены в ~/scripts/qonversion/screenshots/\n`;

  return report;
}

function checkAnomalies(data) {
  const anomalies = [];
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(',', '');

  // Проверяем New Trials - резкое падение более 30% (игнорируем текущий день)
  if (data.newTrials) {
    const values = Object.entries(data.newTrials)
      .filter(([k]) => k.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/) && !k.includes(todayStr.split(' ')[1]))
      .map(([k, v]) => ({ date: k, value: parseInt(v.replace(/,/g, '')) || 0 }));

    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1].value;
      const curr = values[i].value;
      if (prev > 0 && curr < prev * 0.7) {
        anomalies.push(`New Trials: падение на ${Math.round((1 - curr/prev) * 100)}% (${values[i-1].date}: ${prev} → ${values[i].date}: ${curr})`);
      }
      if (prev > 0 && curr > prev * 1.5) {
        anomalies.push(`New Trials: рост на ${Math.round((curr/prev - 1) * 100)}% (${values[i-1].date}: ${prev} → ${values[i].date}: ${curr})`);
      }
    }
  }

  // Проверяем Trial-to-Paid Conversion - резкое падение
  if (data.trialToPaid) {
    const values = Object.entries(data.trialToPaid)
      .filter(([k, v]) => k.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/) && v !== '0%')
      .map(([k, v]) => ({ date: k, value: parseFloat(v.replace('%', '')) || 0 }));

    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1].value;
      const curr = values[i].value;
      if (prev > 0 && curr < prev * 0.6) {
        anomalies.push(`Trial-to-Paid: падение на ${Math.round((1 - curr/prev) * 100)}% (${values[i-1].date}: ${prev}% → ${values[i].date}: ${curr}%)`);
      }
    }
  }

  return anomalies;
}

// ============ GOOGLE SHEETS UPDATE ============

// Карта месяцев для когорт -> колонок
const COHORT_COLUMNS = {
  'Jun, 2023': 'B', 'Jul, 2023': 'C', 'Aug, 2023': 'D', 'Sep, 2023': 'E',
  'Oct, 2023': 'F', 'Nov, 2023': 'G', 'Dec, 2023': 'H', 'Jan, 2024': 'I',
  'Feb, 2024': 'J', 'Mar, 2024': 'K', 'Apr, 2024': 'L', 'May, 2024': 'M',
  'Jun, 2024': 'N', 'Jul, 2024': 'O', 'Aug, 2024': 'P', 'Sep, 2024': 'Q',
  'Oct, 2024': 'R', 'Nov, 2024': 'S', 'Dec, 2024': 'T', 'Jan, 2025': 'U',
  'Feb, 2025': 'V', 'Mar, 2025': 'W', 'Apr, 2025': 'X', 'May, 2025': 'Y',
  'Jun, 2025': 'Z', 'Jul, 2025': 'AA', 'Aug, 2025': 'AB', 'Sep, 2025': 'AC',
  'Oct, 2025': 'AD', 'Nov, 2025': 'AE', 'Dec, 2025': 'AF', 'Jan, 2026': 'AG',
  'Feb, 2026': 'AH', 'Mar, 2026': 'AI'
};

async function updateGoogleSheets(data) {
  log('Обновление Google Sheets...');

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  // Сохраняем данные локально
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  const outputFile = path.join(__dirname, 'data', `update-${dateStr}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));

  // Инициализируем SheetsUpdater
  const updater = new SheetsUpdater(CONFIG.spreadsheetId);
  await updater.init();

  // Строим карту дат -> колонок
  const dateMap = buildDateColumnMap();

  const updates = [];

  // ========== ДНЕВНЫЕ ДАННЫЕ ==========
  // Обновляем данные за последние 8 дней
  for (let i = 0; i <= 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const column = findColumnForDate(dateMap, date);
    const dateKey = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    if (!column) continue;

    // Apple Ads Cost (row 7)
    if (data.appleAds && data.appleAds.byDate && data.appleAds.byDate[dateKey] !== undefined) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.appleAdsCost}`,
        value: Math.round(data.appleAds.byDate[dateKey])
      });
    }

    // Sales (row 19)
    if (data.sales && data.sales[dateKey]) {
      const val = parseFloat(data.sales[dateKey].replace(/[$,]/g, '')) || 0;
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.sales}`,
        value: Math.round(val)
      });
    }

    // New Trials (row 55)
    if (data.newTrials && data.newTrials[dateKey]) {
      const val = parseInt(data.newTrials[dateKey].replace(/,/g, '')) || 0;
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.newTrials}`,
        value: val
      });
    }

    // New Yearly Subscribers (row 58)
    if (data.yearlySubscribers && data.yearlySubscribers[dateKey]) {
      const val = parseInt(data.yearlySubscribers[dateKey].replace(/,/g, '')) || 0;
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.newYearlySubscribers}`,
        value: val
      });
    }
  }

  // ========== TRIAL-TO-PAID (за последние 30 дней, исключая 0%) ==========
  if (data.trialToPaid) {
    for (const [dateKey, value] of Object.entries(data.trialToPaid)) {
      if (!dateKey.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) continue;
      if (value === '0%') continue; // Пропускаем нефинальные данные

      // Парсим дату
      const parts = dateKey.split(' ');
      const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[0]);
      const day = parseInt(parts[1]);
      const year = month >= new Date().getMonth() ? 2025 : 2026; // Простая логика года
      const date = new Date(year, month, day);

      const column = findColumnForDate(dateMap, date);
      if (column) {
        const pct = parseFloat(value.replace('%', '')) / 100;
        updates.push({
          range: `${CONFIG.sheet}!${column}${CONFIG.rows.trialToPaidConversion}`,
          value: pct
        });
      }
    }
  }

  // ========== КОГОРТЫ (месячные данные) ==========
  if (data.cohorts && Array.isArray(data.cohorts)) {
    for (const cohort of data.cohorts) {
      if (!cohort.cohort || cohort.cohort === 'Total') continue;

      const column = COHORT_COLUMNS[cohort.cohort];
      if (!column) continue;

      // Берём Sum (предпоследний столбец) из data
      const sumValue = cohort.data ? cohort.data[cohort.data.length - 2] : null;
      if (sumValue) {
        const val = parseFloat(sumValue.replace(/[$,]/g, '')) || 0;
        updates.push({
          range: `${CONFIG.sheet}!${column}${CONFIG.rows.cohortRevenue}`,
          value: Math.round(val)
        });
      }
    }
  }

  // ========== ЗАПИСЫВАЕМ В GOOGLE SHEETS ==========
  if (updates.length > 0) {
    log(`Записываю ${updates.length} ячеек в Google Sheets...`);

    // Batch update (chunks of 50)
    const chunkSize = 50;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await updater.batchUpdate(chunk);
      log(`  Обновлено ${Math.min(i + chunkSize, updates.length)}/${updates.length}`);
    }

    log('Google Sheets обновлён успешно!');
  } else {
    log('Нет данных для обновления');
  }

  // Выводим в консоль
  console.log('\n--- GOOGLE SHEETS UPDATES ---');
  console.log(`Spreadsheet: ${CONFIG.spreadsheetId}`);
  console.log(`Total updates: ${updates.length}`);
  updates.slice(0, 10).forEach(u => {
    console.log(`  ${u.range} = ${u.value}`);
  });
  if (updates.length > 10) {
    console.log(`  ... и ещё ${updates.length - 10} ячеек`);
  }
  console.log('-----------------------------\n');

  return updates.length;
}

// ============ MAIN ============

async function main() {
  log('========================================');
  log('Starting daily update...');

  // Создаём директории
  fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const { browser, context } = await initBrowser();
  const page = await context.newPage();

  const collectedData = {};

  try {
    // Собираем все данные
    collectedData.newTrials = await getNewTrials(page);
    collectedData.sales = await getSales(page);
    collectedData.trialToPaid = await getTrialToPaidConversion(page);
    collectedData.appleAds = await getAppleAdsCost(page);
    collectedData.yearlySubscribers = await getNewYearlySubscribers(page);
    collectedData.cohorts = await getCohortRevenue(page);

    // Проверяем аномалии
    const anomalies = checkAnomalies(collectedData);

    // Генерируем отчёт
    const report = generateReport(collectedData, anomalies);
    const reportFile = path.join(REPORT_DIR, `report-${new Date().toISOString().split('T')[0]}.md`);
    fs.writeFileSync(reportFile, report);
    log(`Отчёт сохранён: ${reportFile}`);

    // Обновляем Google Sheets
    await updateGoogleSheets(collectedData);

    // Выводим отчёт
    console.log('\n' + '='.repeat(50));
    console.log('DAILY UPDATE COMPLETE');
    console.log('='.repeat(50));
    console.log(report);

  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
