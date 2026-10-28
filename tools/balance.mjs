// Runs several balance bots (tools/bot.mjs) in parallel and aggregates their results area by area.
// node tools/balance.mjs --runs 6 --to coldplains --minutes 120 --url "http://localhost:PORT/?dev"
//   [--class paladin,sorceress] [--start-area camp] [--level 1] [--dump wild,denofevil]
// The bots go from --start-area until past --to (area keys, src/world/areas.ts: camp, wild,
// denofevil, coldplains; or the trial ground's floor3 to floor15). --runs is per class; several
// classes, comma-separated, get a table each. Per area, the medians: its time, the level, gold and
// gear on leaving it, the deaths in it; then when the milestones came (the Den of Evil given,
// cleared, rewarded, Cold Plains' waypoint, the superuniques killed) and the town trips. Starts its
// own vite dev server when nothing answers at a localhost --url.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** this folder and the repository's root: the runs work from anywhere */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(HERE);

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
/** what each bot is told: the start, the last area, the level (and its class) */
const botArgs = ['--to', opt('to', 'coldplains'), '--start-area', opt('start-area', 'camp'), '--level', opt('level', '1'), '--minutes', String(minutes)];
const classes = (opt('class', '') || '').split(',').filter(Boolean);

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
  server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--port', u.port || '80', '--strictPort'], { stdio: 'ignore', cwd: ROOT });
  process.on('exit', () => server.kill());
  for (let t = 0; t < 60 && !(await reachable(url)); t++) await new Promise((r) => setTimeout(r, 500));
  if (!(await reachable(url))) {
    console.error(`dev server did not come up at ${u.origin}`);
    process.exit(1);
  }
}

const failures = [];
function runOne(i, cls) {
  return new Promise((resolve) => {
    const out = path.join(os.tmpdir(), `dii-balance-${process.pid}-${cls || 'any'}-${i}`);
    const child = spawn('node', [path.join(HERE, 'play.mjs'), path.join(HERE, 'bot.mjs'), '--url', url, '--out', out, ...botArgs, ...(cls ? ['--class', cls] : [])], { cwd: ROOT });
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

const med = (a) => {
  if (!a.length) return '-';
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const mmss = (s) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : s);
/** the commonest of some strings, and how many have it */
const commonest = (a) => {
  const n = {};
  for (const x of a) n[x] = (n[x] ?? 0) + 1;
  const [k, c] = Object.entries(n).sort((x, y) => y[1] - x[1])[0] ?? ['-', 0];
  return a.length > 1 ? `${k} (${c}/${a.length})` : k;
};

function report(label, results) {
  console.log(`\n══════ ${label}: ${results.length} runs ══════`);
  // every bot walks the same route
  const route = results[0].route;
  // runs that stopped short: why
  for (const r of results) {
    if (r.levels.length < route.length) console.log(`run stopped in ${route[r.levels.length]}: ${JSON.stringify(r.status)}\n  ${(r.stalls ?? []).join('\n  ')}`);
  }
  const rows = [];
  for (const [i, area] of route.entries()) {
    const lv = results.map((r) => r.levels.find((l) => l.area === area)).filter(Boolean);
    // it got there: it cleared every area before it
    const reached = results.filter((r) => r.levels.length >= i).length;
    const deaths = results.map((r) => r.deathList.filter((x) => x.area === area).length);
    const causes = {};
    for (const r of results) for (const x of r.deathList.filter((y) => y.area === area)) for (const [k, n] of Object.entries(x.causes)) causes[k.split('(')[0]] = (causes[k.split('(')[0]] ?? 0) + n;
    const top = Object.entries(causes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}:${n}`).join(' ');
    rows.push({
      area,
      reached: `${reached}/${results.length}`,
      'deaths med/avg': `${med(deaths)}/${(deaths.reduce((a, b) => a + b, 0) / Math.max(1, deaths.length)).toFixed(1)}`,
      time: mmss(med(lv.map((l) => l.secs))),
      'left at': mmss(med(lv.map((l) => l.t))),
      lvl: med(lv.map((l) => l.lvl)),
      gold: med(lv.map((l) => l.gold)),
      life: med(lv.map((l) => l.life)),
      def: med(lv.map((l) => l.def)),
      hit: `${med(lv.map((l) => l.hit ?? l.dmg))} ${commonest(lv.map((l) => l.attack ?? '-')).split(' ')[0]}`,
      'worn/magic+': `${med(lv.map((l) => l.worn ?? 0))}/${med(lv.map((l) => l.magicWorn ?? 0))}`,
      weapon: commonest(lv.map((l) => l.weapon ?? '-')),
      'killed by': top,
    });
  }
  console.table(rows);
  // the milestones: when (game time) and at what level, over the runs that had them
  const names = [...new Set(results.flatMap((r) => (r.events ?? []).map((e) => e.ev)))];
  const ev = names.map((name) => {
    const hits = results.map((r) => (r.events ?? []).find((e) => e.ev === name)).filter(Boolean);
    return { milestone: name, runs: `${hits.length}/${results.length}`, at: mmss(med(hits.map((e) => e.t))), lvl: med(hits.map((e) => e.lvl)), 'lvl range': `${Math.min(...hits.map((e) => e.lvl))}–${Math.max(...hits.map((e) => e.lvl))}` };
  });
  if (ev.length) console.table(ev);
  const t = (k) => med(results.map((r) => r.trips?.[k] ?? 0));
  console.log(`town trips ${t('town')} (portals read ${t('portals')}, by waypoint ${t('waypoints')}), jumps ${t('jumps')}, identified ${t('identified')}, sold ${t('sold')} for ${t('soldGold')} gold, repairs ${t('repairs')} gold (medians)`);
  for (const r of results) {
    const f = r.final;
    const magic = Object.values(f.eq ?? {}).filter((x) => !/\[(normal|superior|low)\]/.test(x)).length;
    console.log(`  L${f.lvl} life ${f.life} def ${f.def} gold ${f.gold}  ${f.eq?.weapon ?? '-'}; ${Object.keys(f.eq ?? {}).length} worn, ${magic} magic+; skills ${JSON.stringify(f.skills)}`);
  }
}

const t0 = Date.now();
const groups = classes.length ? classes : [''];
const all = await Promise.all(groups.map((cls) => Promise.all(Array.from({ length: runs }, (_, i) => runOne(i, cls)))));
console.log(`${all.flat().filter(Boolean).length}/${runs * groups.length} runs finished in ${Math.round((Date.now() - t0) / 1000)}s`);
if (failures.length) console.log(`a failed run's last output:\n${failures[0]}\n`);
for (const [k, cls] of groups.entries()) {
  const results = all[k].filter(Boolean);
  if (!results.length) continue;
  report(cls || results[0].final.cls, results);
  // --dump wild,denofevil: list the death situations in those areas
  for (const d of (opt('dump', '') || '').split(',').filter(Boolean)) {
    const combos = {};
    for (const r of results) {
      for (const x of r.deathList.filter((y) => y.area === d)) {
        const k2 = Object.entries(x.causes).map(([m, n]) => `${n}×${m}`).sort().join(' + ') + (x.proj ? ` (proj ${x.proj})` : '');
        combos[k2] = (combos[k2] ?? 0) + 1;
      }
    }
    console.log(`\n${d} deaths:`);
    for (const [k2, n] of Object.entries(combos).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${n}x  ${k2}`);
  }
}
if (!all.flat().some(Boolean)) process.exit(1);
server?.kill();
