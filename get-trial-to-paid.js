const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'auth.json')
  });
  const page = await context.newPage();

  // Set date range for last 30 days
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 30);

  const fromTs = Math.floor(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) / 1000);
  const toTs = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59) / 1000);

  const url = `https://dash.qonversion.io/analytics/trials?from=${fromTs}&to=${toTs}&project=PcnB70vn&account=8htsgud1`;

  console.log('Loading Trial-to-Paid for last 30 days...');
  console.log('URL:', url);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Click on Trial-to-Paid tab
  try {
    await page.click('text=Trial-to-Paid', { timeout: 5000 });
    await page.waitForTimeout(5000);
  } catch (e) {
    console.log('Could not click Trial-to-Paid tab');
  }

  // Extract table data
  const data = await page.evaluate(() => {
    const table = document.querySelector('table');
    if (!table) return { error: 'No table found' };

    const headers = Array.from(table.querySelectorAll('thead th, thead td'))
      .map(cell => cell.textContent.trim());

    const rows = [];
    table.querySelectorAll('tbody tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'))
        .map(cell => cell.textContent.trim());
      rows.push(cells);
    });

    return { headers, rows };
  });

  console.log('\nHeaders:', data.headers.join(' | '));
  console.log('\nTrial-to-Paid data:');

  // First row should have the conversion rates
  if (data.rows[0]) {
    data.headers.forEach((h, i) => {
      if (data.rows[0][i] && h.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)) {
        const value = data.rows[0][i];
        // Skip 0% values (last 4 days are not final)
        if (value !== '0%') {
          console.log(`${h}: ${value}`);
        }
      }
    });
  }

  await page.screenshot({ path: 'screenshots/trial-to-paid-30d.png', fullPage: true });
  await browser.close();
})();
