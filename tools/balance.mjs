// Runs several balance bots (tools/bot.mjs) in parallel and aggregates their results area by area.
// node tools/balance.mjs --runs 6 --to coldplains --minutes 120 --url "http://localhost:PORT/?dev"
//   [--class sorceress] [--start-area wild] [--level 1] [--dump wild,denofevil]
// The bots go from --start-area until past --to (area keys, src/world/areas.ts: camp, wild,
// denofevil, coldplains; or the trial ground's floor3 to floor15). Starts its own vite dev server
// when nothing answers at a localhost --url.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const runs = +opt('runs', 6);
const minutes = +opt('minutes', 120);
const url = opt('url', 'http://localhost:5174/?dev');
if (opt('depth') || opt('from')) {
  console.error('--depth and --from went with the depths: give the areas, --to coldplains (and --start-area)');
  process.exit(1);
}
/** what each bot is told: the class, the start, the last area, the level */
const botArgs = ['--to', opt('to', 'coldplains'), '--start-area', opt('start-area', 'wild'), '--level', opt('level', '1'), '--minutes', String(minutes)];
if (opt('class')) botArgs.push('--class', opt('class'));

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
    const child = spawn('node', ['tools/play.mjs', 'tools/bot.mjs', '--url', url, '--out', out, ...botArgs]);
    let buf = '';
    child.stdout.on('data', (d) => (buf += d));
    child.stderr.on('data', (d) => (buf += d));
    const kill = setTimeout(() => child.kill('SIGKILL'), 20 * 60 * 1000);
    child.on('close', () => {
      clearTimeout(kill);
      const line = buf.split('\n').find((l) => l.startsWith('BOT_RESULT '));
      const error = buf.split('\n').find((l) => l.startsWith('BOT_ERROR '));
      if (error) {
        console.error(error.slice('BOT_ERROR '.length));
        process.exit(1);
      }
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
// every bot walks the same route
const route = results[0].route;
// runs that stopped short: why
for (const r of results) {
  if (r.levels.length < route.length) console.log(`run stopped in ${route[r.levels.length]}: ${JSON.stringify(r.status)}\n  ${(r.stalls ?? []).join('\n  ')}`);
}

const med = (a) => {
  if (!a.length) return '-';
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const rows = [];
for (const [i, area] of route.entries()) {
  const lv = results.map((r) => r.levels.find((l) => l.area === area)).filter(Boolean);
  // it got there: it cleared every area before it
  const reached = results.filter((r) => r.levels.length >= i).length;
  const deaths = results.map((r) => r.deathList.filter((x) => x.area === area).length);
  const causes = {};
  for (const r of results) for (const x of r.deathList.filter((y) => y.area === area)) for (const [k, n] of Object.entries(x.causes)) causes[k.split('(')[0]] = (causes[k.split('(')[0]] ?? 0) + n;
  const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}:${n}`).join(' ');
  rows.push({
    area,
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

// --dump wild,denofevil: list the death situations in those areas
for (const d of (opt('dump', '') || '').split(',').filter(Boolean)) {
  const combos = {};
  for (const r of results) {
    for (const x of r.deathList.filter((y) => y.area === d)) {
      const k = Object.entries(x.causes).map(([m, n]) => `${n}×${m}`).sort().join(' + ') + (x.proj ? ` (proj ${x.proj})` : '');
      combos[k] = (combos[k] ?? 0) + 1;
    }
  }
  console.log(`\n${d} deaths:`);
  for (const [k, n] of Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${n}x  ${k}`);
}

server?.kill();
