const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    storageState: 'auth.json'
  });

  const page = await context.newPage();

  console.log('Загружаю дашборд...');
  await page.goto('https://dash.qonversion.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Проверяем что залогинены
  const url = page.url();
  if (url.includes('login') || url.includes('auth')) {
    console.log('Сессия истекла, нужно перелогиниться');
    await browser.close();
    process.exit(1);
  }

  console.log('Перехожу на страницу триалов...');

  // Ищем страницу с триалами - обычно это Analytics -> Trials
  await page.goto('https://dash.qonversion.io/analytics/trials', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Ждём загрузки данных
  await page.waitForTimeout(3000);

  // Делаем скриншот
  await page.screenshot({ path: 'trials-screenshot.png', fullPage: true });
  console.log('Скриншот сохранён: trials-screenshot.png');

  // Пробуем извлечь данные из страницы
  const pageContent = await page.content();

  // Ищем числа на странице, которые могут быть триалами
  const metrics = await page.evaluate(() => {
    const results = {};

    // Ищем элементы с метриками
    const metricElements = document.querySelectorAll('[class*="metric"], [class*="stat"], [class*="value"], [class*="number"]');
    metricElements.forEach((el, i) => {
      const text = el.textContent.trim();
      if (text && /^\d/.test(text)) {
        results[`metric_${i}`] = text;
      }
    });

    // Ищем все крупные числа
    const allText = document.body.innerText;
    const numbers = allText.match(/\d{1,3}(,\d{3})*(\.\d+)?/g) || [];
    results.numbers = numbers.slice(0, 20);

    return results;
  });

  console.log('Найденные метрики:', JSON.stringify(metrics, null, 2));

  await browser.close();
})();
