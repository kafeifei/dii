import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
function findChrome() {
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(p)) return p;
  }
}
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
await page.goto(process.argv[2]);
await page.waitForTimeout(3000);
for (let i = 0; i < 6; i++) {
  await page.screenshot({ path: `/tmp/ai-hero/burst${i}.png` });
  await page.waitForTimeout(90);
}
await browser.close();
