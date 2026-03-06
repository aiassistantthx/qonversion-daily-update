const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'auth.json')
  });
  const page = await context.newPage();

  // Берём вчера (Mar 5)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const from = Math.floor(yesterday.getTime() / 1000);
  const to = from + 86399;

  const url = `https://dash.qonversion.io/apple-search-ads?from=${from}&to=${to}&project=PcnB70vn&appleAdsType=campaigns&appleAdsRevenueType=gross&environment=0&account=8htsgud1`;

  console.log('URL:', url);
  console.log('Date:', yesterday.toDateString());

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  await page.screenshot({ path: 'screenshots/spend-debug.png', fullPage: true });

  // Получаем все метрики из верхней панели
  const metrics = await page.evaluate(() => {
    const text = document.body.innerText;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    // Ищем секцию с метриками (первые 100 строк)
    const metricsSection = lines.slice(0, 100);

    return metricsSection;
  });

  console.log('\nFirst 100 lines of page:');
  metrics.forEach((m, i) => console.log(`${i}: ${m}`));

  await browser.close();
})();
