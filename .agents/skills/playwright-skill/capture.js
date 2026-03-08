const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = 'http://localhost:5173';
const OUTPUT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

(async () => {
  console.log('Starting browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Navigating to login...');
    await page.goto(`${TARGET_URL}/login`);

    console.log('Logging in...');
    await page.fill('input[type="text"]', 'admin');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    console.log('Waiting for navigation to home...');
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    console.log('Navigating to docsort manage page...');
    await page.goto(`${TARGET_URL}/docsort/manage`);
    await page.waitForTimeout(3000);

    const managePath = path.join(OUTPUT_DIR, 'docsort_manage.png');
    console.log(`Taking screenshot: ${managePath}`);
    await page.screenshot({ path: managePath, fullPage: true });

    console.log('Navigating to docsort tools page...');
    await page.goto(`${TARGET_URL}/docsort/tools`);
    await page.waitForTimeout(3000);

    const toolsPath = path.join(OUTPUT_DIR, 'docsort_tools.png');
    console.log(`Taking screenshot: ${toolsPath}`);
    await page.screenshot({ path: toolsPath, fullPage: true });

    console.log('✅ Finished capturing screenshots.');

  } catch (error) {
    console.error('❌ Error during script execution:', error);
  } finally {
    await browser.close();
  }
})();
