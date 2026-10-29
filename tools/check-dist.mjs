// What a build ships, against what the hosts take: node tools/check-dist.mjs [dir] (dir defaults
// to dist/). npm run build runs it after vite build, so vercel build (which runs npm run build) and
// the internal host's flow (npm run build, then its deploy of ./dist) both stop on a dist that is
// over. It prints the files and bytes under each top-level folder; above BUDGET it says what is over
// and where the bulk is, and exits 1.
//
// The internal host takes at most 5000 files and 50 MB in one deploy (its MB is 1024 × 1024 bytes,
// as everywhere here) and serves them from Cloudflare, which takes no static asset over 25 MiB. The
// budget stops short of those, so the next big asset shows up while there is still room to pack or
// shrink it, not as an upload that fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MiB = 1024 * 1024;

/** what one deploy to the internal host may hold, and one file at most (Cloudflare's asset limit) */
export const HOST_LIMIT = { files: 5000, bytes: 50 * MiB, fileBytes: 25 * MiB };
/** ours, with room under the internal host's: a build above any of these fails */
export const BUDGET = { files: 2000, bytes: 40 * MiB, fileBytes: 25 * MiB };

/** the row of the files right in the folder counted, beside its subfolders' */
export const TOP = '(top level)';

/**
 * Every file under dir as an upload reads it: its path from dir ('/'-separated) and its size. A
 * symlink counts as what it points to; Finder's .DS_Store is left out, as neither host uploads it.
 * @param {string} dir
 * @returns {{ path: string, bytes: number }[]}
 */
export function listFiles(dir) {
  /** @type {{ path: string, bytes: number }[]} */
  const out = [];
  // the real paths of the folders being walked: a link back up to one would never end
  /** @type {string[]} */
  const up = [];
  /** @param {string} abs @param {string} rel */
  const walk = (abs, rel) => {
    const real = fs.realpathSync(abs);
    if (up.includes(real)) return;
    up.push(real);
    for (const name of fs.readdirSync(abs).sort()) {
      if (name === '.DS_Store') continue;
      const a = path.join(abs, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = fs.statSync(a);
      if (st.isDirectory()) walk(a, r);
      else if (st.isFile()) out.push({ path: r, bytes: st.size });
    }
    up.pop();
  };
  walk(dir, '');
  return out;
}

/**
 * The files and bytes in all and under each top-level folder ('models/'; the top level's own files
 * under TOP), the biggest folder first
 * @param {{ path: string, bytes: number }[]} files
 */
export function tally(files) {
  /** @type {Map<string, { name: string, files: number, bytes: number }>} */
  const rows = new Map();
  let bytes = 0;
  for (const f of files) {
    const cut = f.path.indexOf('/');
    const name = cut < 0 ? TOP : f.path.slice(0, cut + 1);
    let row = rows.get(name);
    if (!row) rows.set(name, (row = { name, files: 0, bytes: 0 }));
    row.files++;
    row.bytes += f.bytes;
    bytes += f.bytes;
  }
  const folders = [...rows.values()].sort((a, b) => b.bytes - a.bytes || b.files - a.files || a.name.localeCompare(b.name));
  return { files: files.length, bytes, folders };
}

/** @param {number} n */
const count = (n) => n.toLocaleString('en-US');
/** @param {number} bytes a size as measured, in MiB */
const mib = (bytes) => (bytes / MiB).toFixed(2);
/** @param {number} bytes a limit, in whole MiB where it is whole */
const cap = (bytes) => (Number.isInteger(bytes / MiB) ? String(bytes / MiB) : mib(bytes));

/**
 * What is over the budget, a sentence each naming where the bulk is: the biggest folders for the
 * bytes, the fullest for the files, the file itself for one too big; none when all is within it
 * @param {{ path: string, bytes: number }[]} files
 * @param {{ files: number, bytes: number, fileBytes: number }} [budget]
 * @returns {string[]}
 */
export function overBudget(files, budget = BUDGET) {
  const t = tally(files);
  const out = [];
  if (t.files > budget.files) {
    const fullest = [...t.folders].sort((a, b) => b.files - a.files || b.bytes - a.bytes).slice(0, 3);
    out.push(`${count(t.files)} files, over the budget of ${count(budget.files)} (the internal host takes ${count(HOST_LIMIT.files)}): the most are in ${fullest.map((r) => `${r.name} (${count(r.files)})`).join(', ')}`);
  }
  if (t.bytes > budget.bytes) {
    const biggest = t.folders.slice(0, 3);
    out.push(`${mib(t.bytes)} MiB in all, over the budget of ${cap(budget.bytes)} MiB (the internal host takes ${cap(HOST_LIMIT.bytes)} MiB): the biggest folders are ${biggest.map((r) => `${r.name} (${mib(r.bytes)} MiB)`).join(', ')}`);
  }
  for (const f of files) {
    if (f.bytes > budget.fileBytes) out.push(`${f.path} is ${mib(f.bytes)} MiB, over the ${cap(budget.fileBytes)} MiB one file may be (Cloudflare serves no bigger asset)`);
  }
  return out;
}

/**
 * The table the build prints: files and bytes under each top-level folder, then all of them
 * @param {ReturnType<typeof tally>} t
 * @param {string} label what was counted, e.g. 'dist/'
 */
export function table(t, label) {
  const line = (/** @type {string} */ name, /** @type {number} */ files, /** @type {number} */ bytes) => [name, count(files), count(bytes), (bytes / MiB).toFixed(2)];
  const rows = [['folder', 'files', 'bytes', 'MiB'], ...t.folders.map((r) => line(r.name, r.files, r.bytes)), line('all', t.files, t.bytes)];
  const w = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i].length)));
  return [`${label} by top-level folder:`, ...rows.map((r) => `  ${r[0].padEnd(w[0])}  ${r[1].padStart(w[1])}  ${r[2].padStart(w[2])}  ${r[3].padStart(w[3])}`)].join('\n');
}

/** @returns {number} the exit code */
function main() {
  const dir = path.resolve(process.argv[2] ?? path.join(ROOT, 'dist'));
  const rel = path.relative(process.cwd(), dir);
  const label = `${rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : dir}/`;
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`check-dist: there is no ${label} to count (vite build writes it)`);
    return 1;
  }
  const files = listFiles(dir);
  const t = tally(files);
  console.log(table(t, label));
  const over = overBudget(files);
  if (over.length) {
    console.error(`\n${label} is over its budget (tools/check-dist.mjs):`);
    for (const o of over) console.error(`  - ${o}`);
    return 1;
  }
  const big = files.reduce((a, f) => (f.bytes > a.bytes ? f : a), { path: 'none', bytes: 0 });
  console.log(`within the budget: ${count(t.files)} of ${count(BUDGET.files)} files, ${mib(t.bytes)} of ${cap(BUDGET.bytes)} MiB, the biggest file ${mib(big.bytes)} of ${cap(BUDGET.fileBytes)} MiB (${big.path})`);
  return 0;
}

// run as a command, not when a test imports it; exitCode rather than exit() so piped output is all written
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
