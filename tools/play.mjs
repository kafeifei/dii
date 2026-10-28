// Headless test runner: node tools/play.mjs <scenario.mjs> [--url http://localhost:5174/?dev] [--out dir] [--w 1280] [--h 800]
// A scenario exports `default async function (page, shot, log)`. The run exits 1 when the scenario
// throws or logs a result line of FAIL ("SMOKE FAIL …": a word in capitals, then FAIL), 2 when the
// page crashes or the browser goes away, else 0.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const scenario = args[0];
const url = opt('url', 'http://localhost:5174/?dev');
const out = opt('out', path.join(os.tmpdir(), 'dii-shots'));
const width = +opt('w', 1280);
const height = +opt('h', 800);
fs.mkdirSync(out, { recursive: true });

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

const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
// a crashed renderer would otherwise leave the scenario waiting forever
page.on('crash', () => {
  console.log('[page crashed]');
  process.exit(2);
});
let closing = false;
browser.on('disconnected', () => {
  if (!closing) process.exit(2);
});
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
if (url.includes('dev')) await page.waitForFunction(() => window.game?.started, null, { timeout: 30000 });
await page.waitForTimeout(1200);
let n = 0;
const shot = async (name) => {
  const file = path.join(out, `${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  console.log('shot', file);
};
/** a scenario's result line, failed: its name in capitals, then FAIL */
const FAILED = /^[A-Z][A-Z0-9_-]* FAIL\b/;
let failed = false;
const log = (...a) => {
  console.log(...a);
  if (a.some((x) => typeof x === 'string' && x.split('\n').some((l) => FAILED.test(l)))) failed = true;
};
const mod = await import(path.resolve(scenario));
try {
  await mod.default(page, shot, log);
} catch (e) {
  console.log('[scenario error]', e);
  failed = true;
}
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
closing = true;
await browser.close();
if (failed) process.exitCode = 1;
