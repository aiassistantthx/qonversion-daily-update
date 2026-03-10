#!/usr/bin/env node
/**
 * Find Qonversion Sales API endpoint by intercepting network requests
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, 'auth.json');

async function main() {
  console.log('Starting browser...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: fs.existsSync(AUTH_FILE) ? AUTH_FILE : undefined
  });

  const page = await context.newPage();

  // Intercept API requests
  const apiCalls = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('api.qonversion.io') || url.includes('/analytics/') || url.includes('/chart/')) {
      console.log('REQUEST:', request.method(), url);
      apiCalls.push({
        method: request.method(),
        url: url,
        headers: request.headers()
      });
    }
  });

  page.on('response', async response => {
    const url = response.url();
    if (url.includes('api.qonversion.io') && url.includes('chart')) {
      console.log('RESPONSE:', response.status(), url);
      try {
        const body = await response.json();
        console.log('DATA:', JSON.stringify(body.data?.code || body.data?.series?.[0]?.label, null, 2));
      } catch (e) {}
    }
  });

  // Go to revenue page
  console.log('\n1. Going to revenue page...');
  await page.goto('https://dash.qonversion.io/analytics/revenue', {
    waitUntil: 'networkidle',
    timeout: 60000
  });
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'revenue-page.png'), fullPage: true });

  // Click on Sales tab
  console.log('\n2. Clicking on Sales tab...');
  try {
    await page.click('text=Sales', { timeout: 5000 });
    await page.waitForTimeout(5000);
    console.log('Clicked Sales!');
  } catch (e) {
    console.log('Could not click Sales:', e.message);
  }

  // Take screenshot
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'sales-page.png'), fullPage: true });

  // Wait for user to inspect
  console.log('\n3. Intercepted API calls:');
  for (const call of apiCalls) {
    console.log(`  ${call.method} ${call.url}`);
  }

  console.log('\nKeeping browser open for 30 seconds...');
  await page.waitForTimeout(30000);

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);
