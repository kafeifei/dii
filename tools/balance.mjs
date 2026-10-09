// Runs several balance bots in parallel and aggregates per-floor results.
// node tools/balance.mjs --runs 6 --depth 16 --minutes 120 --url "http://localhost:PORT/?dev"
// Starts its own vite dev server when nothing answers at a localhost --url.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const runs = +opt('runs', 6);
const depth = +opt('depth', 16);
const minutes = +opt('minutes', 120);
const url = opt('url', 'http://localhost:5174/?dev');
const from = +opt('from', 1);

async function reachable(u) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await reachable(url))) {
  const u = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) {
    console.error(`nothing answers at ${url}`);
    process.exit(1);
  }
  console.log(`no dev server at ${u.origin}, starting one`);
  server = spawn('node_modules/.bin/vite', ['--port', u.port || '80', '--strictPort'], { stdio: 'ignore' });
  process.on('exit', () => server.kill());
  for (let t = 0; t < 60 && !(await reachable(url)); t++) await new Promise((r) => setTimeout(r, 500));
  if (!(await reachable(url))) {
    console.error(`dev server did not come up at ${u.origin}`);
    process.exit(1);
  }
}

function runOne(i) {
  return new Promise((resolve) => {
    const out = path.join(os.tmpdir(), `dii-balance-${process.pid}-${i}`);
    const child = spawn('node', ['tools/play.mjs', 'tools/bot.mjs', '--url', url, '--out', out], {
      env: { ...process.env, DEPTH: String(depth), MINUTES: String(minutes) },
    });
    let buf = '';
    child.stdout.on('data', (d) => (buf += d));
    child.stderr.on('data', (d) => (buf += d));
    const kill = setTimeout(() => child.kill('SIGKILL'), 20 * 60 * 1000);
    child.on('close', () => {
      clearTimeout(kill);
      const line = buf.split('\n').find((l) => l.startsWith('BOT_RESULT '));
      if (line) resolve(JSON.parse(line.slice('BOT_RESULT '.length)));
      else {
        failures.push(buf.trim().split('\n').slice(-15).join('\n'));
        resolve(null);
      }
    });
  });
}

const failures = [];
const t0 = Date.now();
const results = (await Promise.all(Array.from({ length: runs }, (_, i) => runOne(i)))).filter(Boolean);
console.log(`${results.length}/${runs} runs finished in ${Math.round((Date.now() - t0) / 1000)}s\n`);
if (failures.length) console.log(`a failed run's last output:\n${failures[0]}\n`);
if (!results.length) process.exit(1);
// runs that stopped short: why
for (const r of results) {
  const top = Math.max(0, ...r.levels.map((l) => l.depth));
  if (top < depth) console.log(`run stopped at floor ${top + 1}: ${JSON.stringify(r.status)}\n  ${(r.stalls ?? []).join('\n  ')}`);
}

const med = (a) => {
  if (!a.length) return '-';
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const rows = [];
for (let d = from; d <= depth; d++) {
  const lv = results.map((r) => r.levels.find((l) => l.depth === d)).filter(Boolean);
  const reached = results.filter((r) => r.levels.some((l) => l.depth >= d) || r.deathList.some((x) => x.depth >= d)).length;
  const deaths = results.map((r) => r.deathList.filter((x) => x.depth === d).length);
  const causes = {};
  for (const r of results) for (const x of r.deathList.filter((y) => y.depth === d)) for (const [k, n] of Object.entries(x.causes)) causes[k.split('(')[0]] = (causes[k.split('(')[0]] ?? 0) + n;
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}:${n}`).join(' ');
  rows.push({
    depth: d,
    reached: `${reached}/${results.length}`,
    cleared: lv.length,
    'deaths(med/avg)': `${med(deaths)}/${(deaths.reduce((a, b) => a + b, 0) / Math.max(1, deaths.length)).toFixed(1)}`,
    secs: med(lv.map((l) => l.secs)),
    lvl: med(lv.map((l) => l.lvl)),
    life: med(lv.map((l) => l.life)),
    def: med(lv.map((l) => l.def)),
    res: med(lv.map((l) => l.res)),
    dmg: med(lv.map((l) => l.dmg)),
    top,
  });
}
console.table(rows);

// --dump 11,12: list the death situations on those floors
for (const d of (opt('dump', '') || '').split(',').filter(Boolean).map(Number)) {
  const combos = {};
  for (const r of results) {
    for (const x of r.deathList.filter((y) => y.depth === d)) {
      const k = Object.entries(x.causes).map(([m, n]) => `${n}×${m}`).sort().join(' + ') + (x.proj ? ` (proj ${x.proj})` : '');
      combos[k] = (combos[k] ?? 0) + 1;
    }
  }
  console.log(`\nfloor ${d} deaths:`);
  for (const [k, n] of Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${n}x  ${k}`);
}

server?.kill();
