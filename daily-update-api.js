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
 */

const fs = require('fs');
const path = require('path');
const SheetsUpdater = require('./sheets-updater');

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
    cohortRevenue: 93      // Cohort LTV
  },
  // API endpoints
  apiUrl: 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io',
  apiKey: '0f2c53cb2211180b5d731a9ed90dd5ccac0e55f9286c2ddf',
  // SSH fallback for when Traefik routing is broken
  ssh: {
    host: 'root@46.225.26.104',
    key: `${process.env.HOME}/.ssh/coolify`,
    // Use container name (DNS) instead of IP - more stable
    containerName: 'rwwc84wcsgkc48g88wsoco4o',
    containerPort: 3000,
  },
  // Базовая колонка (AMP = колонка 1030 = 26.02.2026)
  baseDate: new Date(2026, 1, 26),
  baseColumnIndex: 1030,
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
  return new Date(year, month - 1, day);
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// ============ API FETCHERS ============

const QONVERSION_API_KEY = 'bfGiq4khkfuQNe-Dxmvuspxtboqmcuy-';
const QONVERSION_API_URL = `https://api.qonversion.io/v1/analytics/${QONVERSION_API_KEY}`;

// SSH-based API call (bypasses broken Traefik routing)
// Uses docker exec to call API from inside the coolify network
function fetchViaSSH(endpoint) {
  const { host, key, containerName, containerPort } = CONFIG.ssh;
  // Use docker exec with a proxy container that has curl, or use wget
  // Traefik container has wget, use it to reach the app via Docker DNS
  const cmd = `ssh -i "${key}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${host} "docker exec coolify-proxy wget -qO- --header='X-API-Key: ${CONFIG.apiKey}' 'http://${containerName}:${containerPort}${endpoint}'"`;

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

// Получить daily trials и yearly subscribers из webhook events
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

  // Преобразуем в удобный формат { 'YYYY-MM-DD': { trials, yearlySubscribers, converted, cohortRevenue } }
  const result = {};
  for (const day of data.daily || []) {
    result[day.date] = {
      trials: day.trials || 0,
      yearlySubscribers: day.yearlySubscribers || 0,
      converted: day.converted || 0,
      cohortRevenue: day.cohortRevenue || 0,
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

async function updateGoogleSheets(dashboardData, qonversionProceeds, webhookDaily, options) {
  if (options.dryRun) {
    log('DRY RUN: Skipping Google Sheets update');
    return [];
  }

  const updater = new SheetsUpdater(CONFIG.spreadsheetId);
  await updater.init();

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

    // Sales (row 19) - берём из Qonversion API
    const revenue = qonversionProceeds[day.date] || 0;
    if (revenue > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.sales}`,
        value: Math.round(revenue)
      });
    }

    // Yearly Subscribers (row 58) - берём из webhook events
    const webhookData = webhookDaily[day.date];
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

    // Trial-to-Paid Conversion Rate (row 64) - только для когорт с достаточным возрастом
    // Используем данные когорты на N дней раньше (cohortAge = 7 дней)
    const cohortDate = new Date(date);
    cohortDate.setDate(cohortDate.getDate() - 7);
    const cohortDateStr = formatDate(cohortDate);
    const cohortData = webhookDaily[cohortDateStr];
    if (cohortData?.trials > 0 && cohortData?.converted > 0) {
      const crToPaid = (cohortData.converted / cohortData.trials * 100).toFixed(1);
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.trialToPaidConversion}`,
        value: `${crToPaid}%`
      });
    }

    // Cohort Revenue (row 93) - revenue для когорты этого дня
    if (webhookData?.cohortRevenue > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.cohortRevenue}`,
        value: Math.round(webhookData.cohortRevenue)
      });
    }
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

  try {
    // Получаем данные из API
    const dashboardData = await fetchDashboardMain();
    const qonversionProceeds = await fetchQonversionProceeds();
    const webhookDaily = await fetchWebhookDaily(options.days + 7); // +7 для буфера

    log(`Got ${dashboardData.daily.length} daily records`);
    log(`Got ${dashboardData.monthly.length} monthly records`);
    log(`Got proceeds for ${Object.keys(qonversionProceeds).length} days from Qonversion`);
    log(`Got trials/subscribers for ${Object.keys(webhookDaily).length} days from webhook`);

    // Вычисляем unit economics
    const metrics = calculateUnitEconomics(dashboardData);

    // Обновляем Google Sheets
    const updates = await updateGoogleSheets(dashboardData, qonversionProceeds, webhookDaily, options);

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
