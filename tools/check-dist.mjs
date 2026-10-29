// What a build ships, against what the hosts take: node tools/check-dist.mjs [dir] (dir defaults
// to dist/). npm run build runs it after vite build, so vercel build (which runs npm run build) and
// the internal host's flow (npm run build, then its deploy of ./dist) both stop on a dist that is
// over. It prints the files and bytes under each top-level folder; above BUDGET it says what is over
// and where the bulk is, and exits 1. A link in it that leads to nothing is named, and exits 1 too.
//
// The internal host takes at most 5000 files and 50 MB in one deploy (its MB is 1024 × 1024 bytes,
// as everywhere here) and serves them from Cloudflare, which takes no static asset over 25 MiB. The
// budget stops short of those, so the next big asset shows up while there is still room to pack or
// shrink it, not as an upload that fails.
//
// The budget's bytes were 40 MiB until 2026-10-29, when the voices merged (each hero line in four
// takes, and Akarelle's lines: 193 more files, 3.15 MiB) took the release line to 41.75 MiB, 38.60
// without them. It is 44 MiB since: still 6 under the internal host's hard 50 MiB (52,428,800 bytes). The
// pictures in the models and the ground textures were compressed next (the same day: 37.41 MiB),
// which leaves the room under it for M2a's art.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MiB = 1024 * 1024;

/** what one deploy to the internal host may hold, and one file at most (Cloudflare's asset limit) */
export const HOST_LIMIT = { files: 5000, bytes: 50 * MiB, fileBytes: 25 * MiB };
/** ours, with room under the internal host's: a build above any of these fails (44 MiB since the voices, 2026-10-29: see above) */
export const BUDGET = { files: 2000, bytes: 44 * MiB, fileBytes: 25 * MiB };

/** the row of the files right in the folder counted, beside its subfolders' */
export const TOP = '(top level)';

/** links under the folder counted that lead to nothing an upload can read: listFiles throws it once it has looked everywhere, naming each */
export class BrokenLinks extends Error {
  /** @param {{ path: string, to: string, why: string }[]} links */
  constructor(links) {
    super(`links to nothing an upload can read: ${links.map((l) => `${l.path} → ${l.to} (${l.why})`).join(', ')}`);
    this.name = 'BrokenLinks';
    this.links = links;
  }
}

/**
 * What `abs` is as an upload reads it, a link followed; for a link that leads nowhere, why it doesn't
 * @param {string} abs
 * @returns {{ st: fs.Stats } | { why: string }}
 */
function follow(abs) {
  try {
    return { st: fs.statSync(abs) };
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (!fs.lstatSync(abs).isSymbolicLink()) throw e;
    return { why: code === 'ENOENT' ? 'nothing is there' : code === 'ELOOP' ? 'a loop of links' : `it can't be read: ${code}` };
  }
}

/**
 * Every file under dir as an upload reads it: its path from dir ('/'-separated) and its size. A
 * symlink counts as what it points to; Finder's .DS_Store is left out, as neither host uploads it.
 * A symlink to nothing (its target gone, or a loop of links) can't be uploaded: once every folder is
 * walked, BrokenLinks names each of them, where they point and why they lead nowhere.
 * @param {string} dir
 * @returns {{ path: string, bytes: number }[]}
 */
export function listFiles(dir) {
  /** @type {{ path: string, bytes: number }[]} */
  const out = [];
  /** @type {{ path: string, to: string, why: string }[]} */
  const broken = [];
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
      const f = follow(a);
      if (!('st' in f)) broken.push({ path: r, to: fs.readlinkSync(a), why: f.why });
      else if (f.st.isDirectory()) walk(a, r);
      else if (f.st.isFile()) out.push({ path: r, bytes: f.st.size });
    }
    up.pop();
  };
  walk(dir, '');
  if (broken.length) throw new BrokenLinks(broken);
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
 * A size over a limit and the limit, in MiB, so the one never reads as the other: the size to two
 * places, or as many more as it takes to read as more than the limit (40 MiB and a byte is
 * 40.000001 MiB, not 40.00 "over the budget of 40 MiB"); the limit in whole MiB where it is whole,
 * else to the size's places. A byte is more than half a millionth of a MiB, so six places always
 * tell it from a whole MiB and seven from any limit.
 * @param {number} bytes more than `limit`
 * @param {number} limit
 * @returns {{ size: string, limit: string }}
 */
export function pastLimit(bytes, limit) {
  let places = 2;
  while (places < 7 && Number((bytes / MiB).toFixed(places)) <= Number((limit / MiB).toFixed(places))) places++;
  return { size: (bytes / MiB).toFixed(places), limit: Number.isInteger(limit / MiB) ? String(limit / MiB) : (limit / MiB).toFixed(places) };
}

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
    const over = pastLimit(t.bytes, budget.bytes);
    out.push(`${over.size} MiB in all, over the budget of ${over.limit} MiB (the internal host takes ${cap(HOST_LIMIT.bytes)} MiB): the biggest folders are ${biggest.map((r) => `${r.name} (${mib(r.bytes)} MiB)`).join(', ')}`);
  }
  for (const f of files) {
    if (f.bytes <= budget.fileBytes) continue;
    const over = pastLimit(f.bytes, budget.fileBytes);
    out.push(`${f.path} is ${over.size} MiB, over the ${over.limit} MiB one file may be (Cloudflare serves no bigger asset)`);
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
  let files;
  try {
    files = listFiles(dir);
  } catch (e) {
    if (!(e instanceof BrokenLinks)) throw e;
    const n = e.links.length;
    console.error(`check-dist: ${label} has ${n === 1 ? 'a link' : `${n} links`} to nothing, which no upload can read (tools/check-dist.mjs):`);
    for (const l of e.links) console.error(`  - ${l.path} links to ${l.to}: ${l.why}`);
    return 1;
  }
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
