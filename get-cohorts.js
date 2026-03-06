const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'auth.json')
  });
  const page = await context.newPage();

  const url = 'https://dash.qonversion.io/cohorts?project=PcnB70vn&metric=revenue&valueType=relative&revenueType=gross&from=1646092800&to=1772841599&relativeInterval=last48Months&account=8htsgud1';

  console.log('Loading cohorts...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  // Get table headers and data
  const data = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return { error: 'No table found' };

    // Get headers
    const headerRow = table.querySelector('thead tr');
    const headers = headerRow ? Array.from(headerRow.querySelectorAll('th')).map(h => h.textContent.trim()) : [];

    // Get rows
    const rows = [];
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(row => {
      const cells = Array.from(row.querySelectorAll('td')).map(c => c.textContent.trim());
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    return { headers, rows };
  });

  console.log('Headers:', JSON.stringify(data.headers));
  console.log('');
  console.log('Cohort data:');
  data.rows.forEach((row, i) => {
    // row[0] = cohort name (e.g. "Jun, 2023")
    // row[row.length - 2] = Sum (second to last)
    // row[row.length - 1] = ARPPU (last)
    const sum = row[row.length - 2];
    const arppu = row[row.length - 1];
    console.log(row[0] + ' | Sum: ' + sum + ' | ARPPU: ' + arppu);
  });

  await browser.close();
})();
