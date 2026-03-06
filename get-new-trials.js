const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: 'auth.json' });
  const page = await context.newPage();

  console.log('Загружаю New Trials...');
  await page.goto('https://dash.qonversion.io/analytics/trials', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await page.waitForTimeout(3000);

  // Кликаем на New Trials
  await page.click('text=New Trials', { timeout: 5000 });
  await page.waitForTimeout(5000);

  // Извлекаем ВСЕ данные из таблицы, включая скрытые колонки
  const tableData = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return null;

    const headers = [];
    const headerCells = table.querySelectorAll('thead th, thead td');
    headerCells.forEach(cell => headers.push(cell.textContent.trim()));

    const rows = [];
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(row => {
      const rowData = {};
      const cells = row.querySelectorAll('td');
      cells.forEach((cell, i) => {
        if (headers[i]) {
          rowData[headers[i]] = cell.textContent.trim();
        }
      });
      rows.push(rowData);
    });

    return { headers, rows };
  });

  if (tableData) {
    console.log('\nЗаголовки таблицы:', tableData.headers.join(' | '));
    console.log('\nДанные:');
    tableData.rows.forEach(row => {
      console.log(JSON.stringify(row));
    });
  }

  // Также получим главную метрику
  const mainMetric = await page.evaluate(() => {
    const el = document.querySelector('h1, h2, [class*="metric-value"], [class*="total"]');
    return el ? el.textContent.trim() : null;
  });

  console.log('\nГлавная метрика:', mainMetric);

  await browser.close();
})();
