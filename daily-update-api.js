/**
 * Daily Update Script - API Version (Enhanced)
 *
 * Получает данные из Qonversion Attribution API и обновляет Google Sheets.
 * Поддерживает расширенные метрики unit economics.
 *
 * Usage:
 *   node daily-update-api.js              # последние 10 дней
 *   node daily-update-api.js --days=30    # последние 30 дней
 *   node daily-update-api.js --from=2026-02-01 --to=2026-03-08
 *
 * ВАЖНО:
 * - Trial-to-Paid CR (row 64): дневные значения CR для каждой когорты из Qonversion Dashboard API
 *   Обновляется за 30 дней, последние 4 дня пропускаются (trial period не завершён)
 *   Источник: https://dash.qonversion.io/api/v1/analytics/chart/trial-to-paid
 *
 * - Cohort Revenue (row 93, B93:AJ93): ТРЕБУЕТ РУЧНОГО ОБНОВЛЕНИЯ через Playwright!
 *   Источник: https://dash.qonversion.io/cohorts (колонка "Sum", metric=revenue, revenueType=gross)
 *   Запуск: node cohort-revenue-scraper.js
 *   API эндпоинта для когортов НЕТ - только UI scraping.
 */

const fs = require('fs');
const path = require('path');
const SheetsUpdater = require('./sheets-updater');

// Load .env file
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

// ============ CONFIGURATION ============

const CONFIG = {
  spreadsheetId: '1XGhckU9SJfGXK94JFVBIpAuoCBoybBSKVnT0Q4mqKwM',
  sheet: 'fact',
  rows: {
    appleAdsCost: 7,       // Spend
    sales: 19,             // Revenue (After Refunds)
    newTrials: 55,         // New Trials
    newYearlySubscribers: 58, // New Yearly Subscribers
    trialToPaidConversion: 64, // Trial-to-Paid %
    cohortRevenue: 93      // Cohort LTV (updated via cohort-revenue-scraper.js only!)
  },
  // Trial-to-Paid CR settings
  trialToPaid: {
    updateDays: 30,        // Обновлять за последние 30 дней
    skipLastDays: 4,       // Пропускать последние 4 дня (trial period не завершён)
  },
  // API endpoints
  apiUrl: 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io',
  apiKey: process.env.DASHBOARD_API_KEY || '',
  // SSH fallback for when Traefik routing is broken
  ssh: {
    host: 'root@46.225.26.104',
    key: `${process.env.HOME}/.ssh/coolify`,
    // Use container name (DNS) instead of IP - more stable
    containerName: 'rwwc84wcsgkc48g88wsoco4o',
    containerPort: 3000,
  },
  // Базовая колонка (AMQ = колонка 1031 = 26.02.2026)
  // Используем UTC чтобы избежать проблем с DST
  baseDate: new Date(Date.UTC(2026, 1, 26)),
  baseColumnIndex: 1031,
};

const { execSync } = require('child_process');

// ============ CLI ARGS PARSING ============

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    days: 10,
    from: null,
    to: null,
    dryRun: false,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      options.days = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
    } else if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    }
  }

  return options;
}

// ============ LOGGING ============

const LOG_FILE = path.join(__dirname, 'daily-update.log');
const REPORT_DIR = path.join(__dirname, 'reports');

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ============ HELPERS ============

function columnIndexToLetter(index) {
  let result = '';
  while (index > 0) {
    index--;
    result = String.fromCharCode(65 + (index % 26)) + result;
    index = Math.floor(index / 26);
  }
  return result;
}

function findColumnIndexForDate(targetDate) {
  const diffDays = Math.floor((targetDate - CONFIG.baseDate) / (1000 * 60 * 60 * 24));
  return CONFIG.baseColumnIndex + diffDays;
}

function findColumnForDate(targetDate) {
  const colIndex = findColumnIndexForDate(targetDate);
  return columnIndexToLetter(colIndex);
}

function parseApiDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  // Используем UTC чтобы избежать проблем с DST
  return new Date(Date.UTC(year, month - 1, day));
}

// ============ VALIDATION ============

// Проверяет что baseColumnIndex соответствует реальным данным в таблице
// Возвращает { valid: true } или { valid: false, expected: X, actual: Y, suggestedFix: Z }
async function validateBaseColumnIndex(updater) {
  const baseCol = columnIndexToLetter(CONFIG.baseColumnIndex);
  const headers = await updater.readRange(`${CONFIG.sheet}!${baseCol}1`);

  if (!headers || !headers[0] || !headers[0][0]) {
    return { valid: false, error: `No header found in column ${baseCol}` };
  }

  const headerValue = headers[0][0]; // e.g., "26.02"
  const match = headerValue.match(/^(\d{1,2})\.(\d{1,2})$/);

  if (!match) {
    return { valid: false, error: `Invalid header format: ${headerValue}` };
  }

  const [, day, month] = match.map(Number);
  const expectedDay = CONFIG.baseDate.getUTCDate();
  const expectedMonth = CONFIG.baseDate.getUTCMonth() + 1;

  if (day === expectedDay && month === expectedMonth) {
    return { valid: true };
  }

  // Найдём правильный baseColumnIndex
  // Ищем колонку с датой baseDate в диапазоне ±10 от текущего индекса
  for (let offset = -10; offset <= 10; offset++) {
    const testCol = columnIndexToLetter(CONFIG.baseColumnIndex + offset);
    const testHeaders = await updater.readRange(`${CONFIG.sheet}!${testCol}1`);

    if (testHeaders && testHeaders[0] && testHeaders[0][0]) {
      const testMatch = testHeaders[0][0].match(/^(\d{1,2})\.(\d{1,2})$/);
      if (testMatch) {
        const [, testDay, testMonth] = testMatch.map(Number);
        if (testDay === expectedDay && testMonth === expectedMonth) {
          return {
            valid: false,
            error: `baseColumnIndex mismatch`,
            expected: `${expectedDay}.${String(expectedMonth).padStart(2, '0')}`,
            actual: headerValue,
            suggestedFix: CONFIG.baseColumnIndex + offset,
            currentIndex: CONFIG.baseColumnIndex
          };
        }
      }
    }
  }

  return {
    valid: false,
    error: `Could not find column with date ${expectedDay}.${String(expectedMonth).padStart(2, '0')}`,
    actual: headerValue
  };
}

// Проверяет записанные данные после обновления
async function validateWrittenData(updater, updates) {
  if (updates.length === 0) return { valid: true, checked: 0 };

  const errors = [];
  const samplesToCheck = Math.min(5, updates.length); // Проверяем до 5 случайных значений
  const indices = [];

  // Берём первые, последние и случайные
  indices.push(0);
  if (updates.length > 1) indices.push(updates.length - 1);
  if (updates.length > 2) indices.push(Math.floor(updates.length / 2));

  for (const idx of indices) {
    const update = updates[idx];
    const actual = await updater.readRange(update.range);
    const actualValue = actual?.[0]?.[0];

    // Сравниваем (учитываем что числа могут быть строками)
    const expectedStr = String(update.value);
    const actualStr = String(actualValue || '');

    // Для чисел сравниваем с округлением
    const expectedNum = parseFloat(expectedStr.replace('%', ''));
    const actualNum = parseFloat(actualStr.replace('%', '').replace(/,/g, ''));

    if (isNaN(expectedNum) || isNaN(actualNum)) {
      // Строковое сравнение
      if (expectedStr !== actualStr) {
        errors.push({ range: update.range, expected: update.value, actual: actualValue });
      }
    } else {
      // Числовое сравнение с допуском 1%
      if (Math.abs(expectedNum - actualNum) > Math.abs(expectedNum) * 0.01 + 1) {
        errors.push({ range: update.range, expected: update.value, actual: actualValue });
      }
    }
  }

  return {
    valid: errors.length === 0,
    checked: indices.length,
    errors: errors
  };
}

// Проверяет что заголовки последних колонок соответствуют расчёту
async function validateRecentHeaders(updater, lastDate) {
  const errors = [];

  // Проверяем последние 3 дня
  for (let i = 0; i < 3; i++) {
    const checkDate = new Date(lastDate);
    checkDate.setDate(checkDate.getDate() - i);

    const expectedCol = findColumnIndexForDate(checkDate);
    const colLetter = columnIndexToLetter(expectedCol);
    const headers = await updater.readRange(`${CONFIG.sheet}!${colLetter}1`);

    const expectedHeader = `${checkDate.getUTCDate()}.${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const actualHeader = headers?.[0]?.[0] || '';

    if (actualHeader !== expectedHeader) {
      errors.push({
        date: checkDate.toISOString().split('T')[0],
        column: colLetter,
        expected: expectedHeader,
        actual: actualHeader
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// ============ API FETCHERS ============

const QONVERSION_API_KEY = 'bfGiq4khkfuQNe-Dxmvuspxtboqmcuy-';
const QONVERSION_API_URL = `https://api.qonversion.io/v1/analytics/${QONVERSION_API_KEY}`;

// SSH-based API call (bypasses broken Traefik routing)
// Gets container IP dynamically and uses wget from coolify-proxy
function fetchViaSSH(endpoint) {
  const { host, key, containerName, containerPort } = CONFIG.ssh;

  // Find container name dynamically (suffix changes after redeploy)
  const findContainerCmd = `ssh -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${host} "docker ps --format '{{.Names}}' | grep '^${containerName}-'"`;

  let fullContainerName;
  try {
    fullContainerName = execSync(findContainerCmd, { encoding: 'utf-8', timeout: 10000 }).trim();
    if (!fullContainerName) {
      throw new Error('Container not found');
    }
  } catch (error) {
    throw new Error(`Failed to find container: ${error.message}`);
  }

  // Get container IP dynamically
  const getIpCmd = `ssh -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${host} "docker inspect ${fullContainerName} --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'"`;

  let containerIp;
  try {
    containerIp = execSync(getIpCmd, { encoding: 'utf-8', timeout: 10000 }).trim();
    if (!containerIp) {
      throw new Error('Container IP not found');
    }
  } catch (error) {
    throw new Error(`Failed to get container IP: ${error.message}`);
  }

  // Use the IP to make the API call
  const cmd = `ssh -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${host} "docker exec coolify-proxy wget -qO- --header='X-API-Key: ${CONFIG.apiKey}' 'http://${containerIp}:${containerPort}${endpoint}'"`;

  try {
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    return JSON.parse(result);
  } catch (error) {
    throw new Error(`SSH API error for ${endpoint}: ${error.message}`);
  }
}

async function fetchDashboardMain() {
  log('Fetching /dashboard/main...');

  // Try direct URL first
  try {
    const response = await fetch(`${CONFIG.apiUrl}/dashboard/main`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'X-API-Key': CONFIG.apiKey }
    });
    if (response.ok) {
      return response.json();
    }
  } catch (e) {
    log(`Direct API failed (${e.message}), falling back to SSH...`);
  }

  // Fallback to SSH
  return fetchViaSSH('/dashboard/main');
}

async function fetchWebhookStats() {
  log('Fetching /webhook/stats...');

  // Try direct URL first
  try {
    const response = await fetch(`${CONFIG.apiUrl}/webhook/stats`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'X-API-Key': CONFIG.apiKey }
    });
    if (response.ok) {
      return response.json();
    }
  } catch (e) {
    log(`Direct API failed (${e.message}), falling back to SSH...`);
  }

  // Fallback to SSH
  return fetchViaSSH('/webhook/stats');
}

// Получить daily trials, yearly subscribers и revenue из webhook events
async function fetchWebhookDaily(days = 14) {
  log('Fetching /webhook/daily...');

  let data;
  // Try direct URL first
  try {
    const response = await fetch(`${CONFIG.apiUrl}/webhook/daily?days=${days}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'X-API-Key': CONFIG.apiKey }
    });
    if (response.ok) {
      data = await response.json();
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (e) {
    log(`Direct API failed (${e.message}), falling back to SSH...`);
    data = fetchViaSSH(`/webhook/daily?days=${days}`);
  }

  // Преобразуем в удобный формат { 'YYYY-MM-DD': { trials, yearlySubscribers, converted, cohortRevenue, revenue } }
  const result = {};
  for (const day of data.daily || []) {
    result[day.date] = {
      trials: day.trials || 0,
      yearlySubscribers: day.yearlySubscribers || 0,
      converted: day.converted || 0,
      cohortRevenue: day.cohortRevenue || 0,
      revenue: day.revenue || 0,  // Daily gross revenue (Sales)
    };
  }
  log(`Got webhook daily data for ${Object.keys(result).length} days`);
  return result;
}

// Получить Sales (gross revenue) из Attribution API
// Это revenue из webhook событий - gross до комиссии Apple
async function fetchQonversionProceeds() {
  log('Fetching Sales from Qonversion Dashboard API...');

  // Load cookies from auth.json for authentication
  const authPath = path.join(__dirname, 'auth.json');
  if (!fs.existsSync(authPath)) {
    throw new Error('auth.json not found. Run: cd ~/scripts/qonversion && node login.js');
  }

  const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  const cookies = authData.cookies
    .filter(c => c.domain && c.domain.includes('qonversion'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  // Use dashboard API for gross sales (before Apple commission)
  const response = await fetch(
    'https://dash.qonversion.io/api/v1/analytics/chart/sales?unit=day&environment=1&project=PcnB70vn',
    {
      headers: {
        'Cookie': cookies
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Qonversion Dashboard API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success && data.data?.status === 401) {
    throw new Error('Qonversion auth expired. Run: cd ~/scripts/qonversion && node login.js');
  }

  // Преобразуем в удобный формат { 'YYYY-MM-DD': grossSales }
  const result = {};
  const salesSeries = data.data?.series?.find(s => s.label === 'After refunds');

  if (salesSeries?.data) {
    for (const point of salesSeries.data) {
      const date = new Date(point.start_time * 1000).toISOString().split('T')[0];
      const sales = point.value || 0;
      if (sales > 0) {
        result[date] = Math.round(sales * 100) / 100;
      }
    }
  }

  log(`Got sales for ${Object.keys(result).length} days (gross sales from dashboard API)`);
  return result;
}

// Получить Trial-to-Paid CR из Qonversion Dashboard API
// Возвращает дневные значения CR для каждой когорты
async function fetchTrialToPaid() {
  log('Fetching Trial-to-Paid from Qonversion Dashboard API...');

  const authPath = path.join(__dirname, 'auth.json');
  if (!fs.existsSync(authPath)) {
    throw new Error('auth.json not found. Run: cd ~/scripts/qonversion && node login.js');
  }

  const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
  const cookies = authData.cookies
    .filter(c => c.domain && c.domain.includes('qonversion'))
    .map(c => `${c.name}=${c.value}`)
    .join('; ');

  // Get last 60 days to have enough data for 30-day rolling average
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 60);
  const fromTs = Math.floor(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) / 1000);
  const toTs = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59) / 1000);

  const response = await fetch(
    `https://dash.qonversion.io/api/v1/analytics/chart/trial-to-paid?unit=day&environment=1&project=PcnB70vn&from=${fromTs}&to=${toTs}`,
    {
      headers: { 'Cookie': cookies }
    }
  );

  if (!response.ok) {
    throw new Error(`Qonversion Dashboard API error: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success && data.data?.status === 401) {
    throw new Error('Qonversion auth expired. Run: cd ~/scripts/qonversion && node login.js');
  }

  // Собираем дневные значения CR (точечные, не rolling average)
  const result = {};
  const series = data.data?.series?.find(s => s.label === 'Total');

  if (series?.data) {
    for (const point of series.data) {
      const date = new Date(point.start_time * 1000).toISOString().split('T')[0];
      const cr = point.value || 0;
      // Записываем только если CR > 0 (триал завершился)
      if (cr > 0) {
        result[date] = Math.round(cr * 10) / 10; // Округляем до 1 знака после запятой
      }
    }
  }

  log(`Got trial-to-paid CR for ${Object.keys(result).length} days`);
  return result;
}

// ============ UNIT ECONOMICS CALCULATIONS ============

function calculateUnitEconomics(dashboardData) {
  const metrics = {
    currentMonth: {},
    daily: [],
  };

  const cm = dashboardData.currentMonth;

  // Current month metrics
  metrics.currentMonth = {
    month: cm.month,
    spend: cm.spend,
    revenue: cm.revenue,
    subscribers: cm.subscribers,
    cop: cm.cop,  // Cost of Payment (same as CAC for subscribers)
    cac: cm.cop,  // Cost of Acquisition = Spend / Subscribers
    arpu: cm.subscribers > 0 ? cm.revenue / cm.subscribers : null,
    roas: cm.spend > 0 ? cm.revenue / cm.spend : null,
    ltvCacRatio: cm.cop > 0 && cm.revenue > 0 ? (cm.revenue / cm.subscribers) / cm.cop : null,
    crToPaid: cm.crToPaid,
    forecastSpend: cm.forecastSpend,
    forecastRevenue: cm.forecastRevenue,
    forecastRoas: cm.forecastSpend > 0 ? cm.forecastRevenue / cm.forecastSpend : null,
  };

  // Daily metrics with unit economics
  for (const day of dashboardData.daily) {
    const spend = day.spend || 0;
    const revenue = day.revenue || 0;
    const subs = day.subscribers || 0;

    metrics.daily.push({
      date: day.date,
      spend,
      revenue,
      subscribers: subs,
      cop: day.cop,
      copPredicted: day.copPredicted,
      roas: day.roas,
      // Calculated metrics
      cac: subs > 0 ? spend / subs : null,
      arpu: subs > 0 ? revenue / subs : null,
      cohortAge: day.cohortAge,
    });
  }

  return metrics;
}

// ============ REPORT GENERATOR ============

function generateReport(metrics, options) {
  const date = new Date().toISOString().split('T')[0];
  const cm = metrics.currentMonth;

  let report = `# Unit Economics Report: ${date}\n\n`;

  report += `## Current Month: ${cm.month}\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Spend | $${cm.spend?.toFixed(2) || 'N/A'} |\n`;
  report += `| Revenue | $${cm.revenue?.toFixed(2) || 'N/A'} |\n`;
  report += `| Subscribers | ${cm.subscribers || 0} |\n`;
  report += `| CAC (Cost of Acquisition) | $${cm.cac?.toFixed(2) || 'N/A'} |\n`;
  report += `| ARPU | $${cm.arpu?.toFixed(2) || 'N/A'} |\n`;
  report += `| ROAS | ${cm.roas?.toFixed(2) || 'N/A'}x |\n`;
  report += `| LTV/CAC Ratio | ${cm.ltvCacRatio?.toFixed(2) || 'N/A'} |\n`;
  report += `| Trial-to-Paid CR | ${cm.crToPaid?.toFixed(2) || 'N/A'}% |\n`;
  report += `\n`;

  report += `## Forecast\n\n`;
  report += `| Metric | Value |\n`;
  report += `|--------|-------|\n`;
  report += `| Forecast Spend | $${cm.forecastSpend?.toFixed(2) || 'N/A'} |\n`;
  report += `| Forecast Revenue | $${cm.forecastRevenue?.toFixed(2) || 'N/A'} |\n`;
  report += `| Forecast ROAS | ${cm.forecastRoas?.toFixed(2) || 'N/A'}x |\n`;
  report += `\n`;

  report += `## Daily Data (last ${options.days} days)\n\n`;
  report += `| Date | Spend | Revenue | Subs | CAC | ROAS |\n`;
  report += `|------|-------|---------|------|-----|------|\n`;

  const recentDays = metrics.daily.slice(-options.days).reverse();
  for (const day of recentDays) {
    report += `| ${day.date} `;
    report += `| $${day.spend?.toFixed(0) || 0} `;
    report += `| $${day.revenue?.toFixed(0) || 0} `;
    report += `| ${day.subscribers || 0} `;
    report += `| $${day.cac?.toFixed(0) || '-'} `;
    report += `| ${day.roas?.toFixed(2) || '-'} |\n`;
  }

  return report;
}

// ============ GOOGLE SHEETS UPDATE ============

async function ensureSheetHasEnoughColumns(updater, maxDate, options) {
  // Определяем нужную колонку для максимальной даты
  const requiredColumnIndex = findColumnIndexForDate(maxDate);

  // Получаем информацию о листе
  const info = await updater.getSheetInfo(CONFIG.sheet);

  if (info.columnCount >= requiredColumnIndex) {
    if (options.verbose) {
      log(`Sheet has enough columns: ${info.columnCount} >= ${requiredColumnIndex}`);
    }
    return { added: 0, copied: 0 };
  }

  // Нужно добавить колонки
  const columnsToAdd = requiredColumnIndex - info.columnCount;
  log(`Expanding sheet: adding ${columnsToAdd} columns (current: ${info.columnCount}, required: ${requiredColumnIndex})`);

  // Добавляем колонки
  await updater.appendColumns(info.sheetId, columnsToAdd);

  // Копируем последнюю заполненную колонку во все новые
  // Последняя заполненная = info.columnCount - 1 (0-based)
  const lastFilledColumn = info.columnCount - 1;
  const newColumnsStart = info.columnCount;

  log(`Copying column ${columnIndexToLetter(lastFilledColumn + 1)} to ${columnsToAdd} new columns...`);

  for (let i = 0; i < columnsToAdd; i++) {
    await updater.copyColumn(info.sheetId, lastFilledColumn, newColumnsStart + i);
  }

  // Обновляем заголовки дат для новых колонок (строка 1)
  const headerUpdates = [];
  for (let i = 0; i < columnsToAdd; i++) {
    const colIndex = info.columnCount + i + 1; // 1-based для columnIndexToLetter
    const colLetter = columnIndexToLetter(colIndex);

    // Вычисляем дату для этой колонки
    const daysFromBase = colIndex - CONFIG.baseColumnIndex;
    const date = new Date(CONFIG.baseDate);
    date.setDate(date.getDate() + daysFromBase);
    const dateStr = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;

    headerUpdates.push({
      range: `${CONFIG.sheet}!${colLetter}1`,
      value: dateStr
    });
  }

  if (headerUpdates.length > 0) {
    await updater.batchUpdate(headerUpdates);
    log(`Updated ${headerUpdates.length} date headers`);
  }

  return { added: columnsToAdd, copied: columnsToAdd };
}

async function updateGoogleSheets(updater, dashboardData, webhookDaily, trialToPaidData, options) {
  if (options.dryRun) {
    log('DRY RUN: Skipping Google Sheets update');
    return [];
  }

  const updates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Определяем диапазон дат
  let fromDate, toDate;
  if (options.from && options.to) {
    fromDate = new Date(options.from);
    toDate = new Date(options.to);
  } else {
    toDate = today;
    fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - options.days);
  }

  log(`Updating range: ${formatDate(fromDate)} to ${formatDate(toDate)}`);

  // Trial-to-Paid CR: обновляем за 30 дней, пропуская последние 4
  const trialToPaidSkipCutoff = new Date(today);
  trialToPaidSkipCutoff.setDate(trialToPaidSkipCutoff.getDate() - CONFIG.trialToPaid.skipLastDays);
  const trialToPaidFromDate = new Date(today);
  trialToPaidFromDate.setDate(trialToPaidFromDate.getDate() - CONFIG.trialToPaid.updateDays);

  // Определяем максимальную дату из данных
  let maxDataDate = fromDate;
  for (const day of dashboardData.daily) {
    const date = parseApiDate(day.date);
    if (date >= fromDate && date <= toDate && date > maxDataDate) {
      maxDataDate = date;
    }
  }

  // Расширяем таблицу если нужно (с копированием формул)
  const expansion = await ensureSheetHasEnoughColumns(updater, maxDataDate, options);
  if (expansion.added > 0) {
    log(`Sheet expanded: added ${expansion.added} columns, copied formatting to ${expansion.copied} columns`);
  }

  // ========== ДНЕВНЫЕ ДАННЫЕ ==========
  for (const day of dashboardData.daily) {
    const date = parseApiDate(day.date);

    // Фильтруем по диапазону
    if (date < fromDate || date > toDate) continue;

    const column = findColumnForDate(date);

    // Apple Ads Cost (row 7) - НЕ записываем нули
    if (day.spend > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.appleAdsCost}`,
        value: Math.round(day.spend)
      });
    } else {
      if (options.verbose) log(`  SKIP: Spend для ${day.date} = 0`);
    }

    // Webhook data for this day
    const webhookData = webhookDaily[day.date];

    // Sales (row 19) - берём из webhook events (gross revenue)
    const revenue = webhookData?.revenue || 0;
    if (revenue > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.sales}`,
        value: Math.round(revenue)
      });
    }

    // Yearly Subscribers (row 58) - берём из webhook events
    if (webhookData?.yearlySubscribers > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.newYearlySubscribers}`,
        value: webhookData.yearlySubscribers
      });
    }

    // New Trials (row 55) - берём из webhook events
    if (webhookData?.trials > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.newTrials}`,
        value: webhookData.trials
      });
    }

    // Trial-to-Paid Conversion Rate (row 64) - из Qonversion Dashboard API
    // Обновляем за 30 дней, но пропускаем последние 4 дня (trial period не завершён)
    const trialToPaidCR = trialToPaidData[day.date];
    if (trialToPaidCR > 0 && date <= trialToPaidSkipCutoff && date >= trialToPaidFromDate) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.trialToPaidConversion}`,
        value: `${trialToPaidCR.toFixed(1)}%`
      });
    }

    // Cohort Revenue (row 93) - НЕ обновляем автоматически!
    // Используй cohort-revenue-scraper.js для точных данных из Qonversion UI
    // Данные из webhook API неполные и не подходят для LTV когорты
  }

  // ========== ЗАПИСЫВАЕМ В GOOGLE SHEETS ==========
  if (updates.length > 0) {
    log(`Записываю ${updates.length} ячеек в Google Sheets...`);

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

  return updates;
}

// ============ MAIN ============

async function main() {
  const options = parseArgs();

  log('========================================');
  log(`Starting daily update (API version) - ${options.days} days`);
  if (options.from && options.to) {
    log(`Custom range: ${options.from} to ${options.to}`);
  }
  if (options.dryRun) {
    log('DRY RUN MODE - no changes will be made');
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });

  // Создаём updater для валидации и записи
  const updater = new SheetsUpdater(CONFIG.spreadsheetId);
  await updater.init();

  // ========== ВАЛИДАЦИЯ КОНФИГА ==========
  log('Validating baseColumnIndex...');
  const configValidation = await validateBaseColumnIndex(updater);
  if (!configValidation.valid) {
    if (configValidation.suggestedFix) {
      log(`WARNING: baseColumnIndex mismatch detected!`);
      log(`  Expected date: ${configValidation.expected}`);
      log(`  Actual in column ${columnIndexToLetter(CONFIG.baseColumnIndex)}: ${configValidation.actual}`);
      log(`  Auto-correcting: ${CONFIG.baseColumnIndex} → ${configValidation.suggestedFix}`);
      CONFIG.baseColumnIndex = configValidation.suggestedFix;
    } else {
      log(`ERROR: ${configValidation.error}`);
      throw new Error(`Config validation failed: ${configValidation.error}`);
    }
  } else {
    log('Config OK');
  }

  try {
    // Получаем данные из API
    const dashboardData = await fetchDashboardMain();
    const webhookDaily = await fetchWebhookDaily(options.days + 7); // +7 для буфера, теперь включает revenue
    const trialToPaidData = await fetchTrialToPaid();

    log(`Got ${dashboardData.daily.length} daily records`);
    log(`Got ${dashboardData.monthly.length} monthly records`);
    log(`Got trials/subscribers/revenue for ${Object.keys(webhookDaily).length} days from webhook`);
    log(`Got trial-to-paid CR for ${Object.keys(trialToPaidData).length} days from Qonversion`);

    // Вычисляем unit economics
    const metrics = calculateUnitEconomics(dashboardData);

    // Обновляем Google Sheets
    const updates = await updateGoogleSheets(updater, dashboardData, webhookDaily, trialToPaidData, options);

    // ========== ВАЛИДАЦИЯ ПОСЛЕ ЗАПИСИ ==========
    if (updates.length > 0) {
      log('Validating written data...');

      // Проверяем записанные значения
      const dataValidation = await validateWrittenData(updater, updates);
      if (!dataValidation.valid) {
        log(`WARNING: Data validation found ${dataValidation.errors.length} mismatches:`);
        for (const err of dataValidation.errors) {
          log(`  ${err.range}: expected ${err.expected}, got ${err.actual}`);
        }
      } else {
        log(`Data validation OK (checked ${dataValidation.checked} samples)`);
      }

      // Проверяем заголовки дат
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const headerValidation = await validateRecentHeaders(updater, today);
      if (!headerValidation.valid) {
        log(`WARNING: Header validation found ${headerValidation.errors.length} mismatches:`);
        for (const err of headerValidation.errors) {
          log(`  Column ${err.column} (${err.date}): expected "${err.expected}", got "${err.actual}"`);
        }
        log(`This may indicate baseColumnIndex drift. Check CONFIG.baseColumnIndex.`);
      } else {
        log('Header validation OK');
      }
    }

    // Генерируем отчёт
    const report = generateReport(metrics, options);
    const reportFile = path.join(REPORT_DIR, `report-${new Date().toISOString().split('T')[0]}.md`);
    fs.writeFileSync(reportFile, report);
    log(`Отчёт сохранён: ${reportFile}`);

    // Выводим summary
    const cm = metrics.currentMonth;
    console.log('\n' + '='.repeat(50));
    console.log('UNIT ECONOMICS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Month: ${cm.month}`);
    console.log(`  Spend:        $${cm.spend?.toFixed(2)}`);
    console.log(`  Revenue:      $${cm.revenue?.toFixed(2)}`);
    console.log(`  Subscribers:  ${cm.subscribers}`);
    console.log(`  CAC:          $${cm.cac?.toFixed(2)}`);
    console.log(`  ARPU:         $${cm.arpu?.toFixed(2)}`);
    console.log(`  ROAS:         ${cm.roas?.toFixed(2)}x`);
    console.log(`  LTV/CAC:      ${cm.ltvCacRatio?.toFixed(2)}`);
    console.log(`  CR to Paid:   ${cm.crToPaid?.toFixed(2)}%`);
    console.log('='.repeat(50));
    console.log(`Updates written: ${updates.length}`);
    console.log('');

    // Сохраняем данные локально
    const today = formatDate(new Date());
    const outputFile = path.join(__dirname, 'data', `api-update-${today}.json`);
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify({
      dashboard: dashboardData,
      metrics: metrics,
      updates: updates,
      options: options,
      timestamp: new Date().toISOString()
    }, null, 2));
    log(`Данные сохранены: ${outputFile}`);

  } catch (error) {
    log(`ERROR: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
