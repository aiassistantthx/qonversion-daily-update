const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Открываю Qonversion...');
  await page.goto('https://dash.qonversion.io/');

  console.log('');
  console.log('===========================================');
  console.log('Залогинься в браузере, затем нажми Enter');
  console.log('===========================================');
  console.log('');

  // Ждём ввода от пользователя
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Сохраняем состояние сессии
  await context.storageState({ path: 'auth.json' });
  console.log('Сессия сохранена в auth.json');

  await browser.close();
})();
