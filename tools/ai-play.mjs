// 打开游戏(?dev),按住鼠标让主角跑动,连拍验证游戏内动画。
// 用法: node tools/ai-play.mjs <url> <outPrefix>
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

const [,, url, prefix] = process.argv;
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
await page.goto(url);
await page.waitForTimeout(3500);
// 朝右上按住鼠标跑动,边跑边拍
await page.mouse.move(800, 250);
await page.mouse.down();
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${prefix}_run${i}.png` });
}
await page.mouse.up();
// 停下回 idle
await page.waitForTimeout(800);
await page.screenshot({ path: `${prefix}_stop.png` });
await browser.close();
console.log('saved', prefix);
