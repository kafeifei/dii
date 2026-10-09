// 打开 preview.html 截一张图。用法: node tools/ai-shot.mjs "<url>" <out.png>
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

const [,, url, out] = process.argv;
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.goto(url);
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
