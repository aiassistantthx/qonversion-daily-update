const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: path.join(__dirname, 'auth.json')
  });
  const page = await context.newPage();

  const url = 'https://dash.qonversion.io/apple-search-ads?relativeInterval=today&project=PcnB70vn&appleAdsType=campaigns&appleAdsRevenueType=gross&environment=0&account=8htsgud1';

  console.log('Loading page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  // Ищем Spend через структуру DOM
  const spend = await page.evaluate(() => {
    // Метод 1: ищем элемент с текстом "Spend" и берём значение из родителя
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent.trim() === 'Spend') {
        // Нашли "Spend", ищем значение в том же контейнере
        let parent = node.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const text = parent.textContent;
          // Ищем паттерн: Spend потом $ и число
          const match = text.match(/Spend\s*\n?\s*\$?([\d,\.]+[KMB]?)/);
          if (match) {
            return { method: 'parent-search', value: match[1], raw: text.substring(0, 100) };
          }
          parent = parent.parentElement;
        }
      }
    }

    // Метод 2: ищем все метрики в верхней панели
    const metrics = [];
    const metricContainers = document.querySelectorAll('div');

    for (const div of metricContainers) {
      const text = div.textContent.trim();
      if (text.startsWith('Spend') && text.length < 50) {
        const match = text.match(/Spend\s*\$?([\d,\.]+[KMB]?)/);
        if (match) {
          metrics.push({ method: 'div-scan', value: match[1], raw: text });
        }
      }
    }

    if (metrics.length > 0) return metrics[0];

    return { method: 'not-found', value: null };
  });

  console.log('Spend result:', JSON.stringify(spend, null, 2));

  await browser.close();
})();
