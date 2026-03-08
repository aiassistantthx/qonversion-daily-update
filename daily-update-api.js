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
  // API endpoint
  apiUrl: 'http://rwwc84wcsgkc48g88wsoco4o.46.225.26.104.sslip.io',
  // Базовая колонка (AMP = колонка 1030 = 26.02.2026)
  baseDate: new Date(2026, 1, 26),
  baseColumnIndex: 1030,
};

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

function findColumnForDate(targetDate) {
  const diffDays = Math.floor((targetDate - CONFIG.baseDate) / (1000 * 60 * 60 * 24));
  const colIndex = CONFIG.baseColumnIndex + diffDays;
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

async function fetchDashboardMain() {
  log('Fetching /dashboard/main...');
  const response = await fetch(`${CONFIG.apiUrl}/dashboard/main`);
  if (!response.ok) {
    throw new Error(`Dashboard API error: ${response.status}`);
  }
  return response.json();
}

async function fetchWebhookStats() {
  log('Fetching /webhook/stats...');
  const response = await fetch(`${CONFIG.apiUrl}/webhook/stats`);
  if (!response.ok) {
    throw new Error(`Webhook stats API error: ${response.status}`);
  }
  return response.json();
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

async function updateGoogleSheets(dashboardData, options) {
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

    // Sales (row 19)
    if (day.revenue > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.sales}`,
        value: Math.round(day.revenue)
      });
    }

    // Subscribers → Yearly Subscribers (row 58)
    if (day.subscribers > 0) {
      updates.push({
        range: `${CONFIG.sheet}!${column}${CONFIG.rows.newYearlySubscribers}`,
        value: day.subscribers
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

    log(`Got ${dashboardData.daily.length} daily records`);
    log(`Got ${dashboardData.monthly.length} monthly records`);

    // Вычисляем unit economics
    const metrics = calculateUnitEconomics(dashboardData);

    // Обновляем Google Sheets
    const updates = await updateGoogleSheets(dashboardData, options);

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
