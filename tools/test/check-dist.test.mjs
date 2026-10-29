// tools/check-dist.mjs, the budget npm run build holds dist/ to: every file is counted under its
// top-level folder (nested ones too, the top level's own on a row of their own, a symlink as what it
// points to, a link back up the tree not walked forever, Finder's .DS_Store not at all) and the bytes
// add up exactly; the budget stays under what the internal host takes; at a limit passes and a file or a byte
// over fails, naming where the bulk is (the biggest folders for bytes, the fullest for files, the file
// itself); npm run build runs it right after vite build; and the command prints its table and exits
// 0 within the budget, 1 over it or with no folder to count.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET, MiB, TOP, HOST_LIMIT, listFiles, overBudget, table, tally } from '../check-dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tool = path.join(root, 'tools/check-dist.mjs');

export default async () => {
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-check-dist-'));
  try {
    // ── counting, on a small dist on disk ──
    const dist = path.join(tmp, 'dist');
    const put = (rel, bytes) => {
      const f = path.join(dist, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.alloc(bytes, 7));
    };
    put('index.html', 1778);
    put('manifest.webmanifest', 448);
    put('assets/index-x.js', 5000);
    put('models/hero.glb', 70000);
    put('models/packs/camp.glb', 120000);
    put('models/packs/deep/er/one.glb', 3);
    put('audio/a.m4a', 900);
    put('.DS_Store', 6148);
    put('models/.DS_Store', 6148);
    fs.mkdirSync(path.join(dist, 'empty'));
    fs.symlinkSync(path.join(dist, 'audio/a.m4a'), path.join(dist, 'audio/b.m4a'));
    fs.symlinkSync(dist, path.join(dist, 'models/loop'));
    const files = listFiles(dist);
    const want = ['assets/index-x.js', 'audio/a.m4a', 'audio/b.m4a', 'index.html', 'manifest.webmanifest', 'models/hero.glb', 'models/packs/camp.glb', 'models/packs/deep/er/one.glb'];
    check(same(files.map((f) => f.path).sort(), want), `files listed: ${files.map((f) => f.path).join(', ')}`);
    check(files.find((f) => f.path === 'audio/b.m4a')?.bytes === 900, 'a symlink counts as the file it points to');
    check(files.find((f) => f.path === 'models/packs/deep/er/one.glb')?.bytes === 3, 'a file four folders down is counted, with its size');
    const t = tally(files);
    check(t.files === 8 && t.bytes === 199029, `in all: ${t.files} files, ${t.bytes} bytes (want 8, 199029)`);
    const rows = t.folders.map((r) => [r.name, r.files, r.bytes]);
    const wantRows = [['models/', 3, 190003], ['assets/', 1, 5000], [TOP, 2, 2226], ['audio/', 2, 1800]];
    check(same(rows, wantRows), `by top-level folder, biggest first: ${JSON.stringify(rows)}`);
    const printed = table(t, 'dist/');
    check(/^dist\/ by top-level folder:/.test(printed), 'the table says what it counted');
    check(/models\/\s+3\s+190,003\s+0\.18\n/.test(printed) && /\(top level\)\s+2\s+2,226\s+0\.00\n/.test(printed) && /all\s+8\s+199,029\s+0\.19$/.test(printed), `the table:\n${printed}`);
    check(same(tally([]), { files: 0, bytes: 0, folders: [] }) && overBudget([]).length === 0, 'nothing counts as nothing and is within the budget');

    // ── the budget: room under what the internal host takes ──
    check(BUDGET.files === 2000 && BUDGET.bytes === 40 * 1024 * 1024 && BUDGET.fileBytes === 25 * 1024 * 1024, `the budget: ${JSON.stringify(BUDGET)}`);
    check(HOST_LIMIT.files === 5000 && HOST_LIMIT.bytes === 50 * 1024 * 1024 && HOST_LIMIT.fileBytes === 25 * 1024 * 1024, `the internal host: ${JSON.stringify(HOST_LIMIT)}`);
    check(BUDGET.files < HOST_LIMIT.files && BUDGET.bytes < HOST_LIMIT.bytes && BUDGET.fileBytes <= HOST_LIMIT.fileBytes, 'the budget is no looser than the internal host');

    // files: at the limit passes, one more fails and names the fullest folders, most first (by count,
    // not by bytes: models/ here is the biggest)
    const many = (n, folder, bytes = 1) => Array.from({ length: n }, (_, i) => ({ path: `${folder}/${i}.webp`, bytes }));
    check(overBudget(many(2000, 'icons')).length === 0, '2000 files are within the budget');
    const byCount = overBudget([...many(3, 'audio', 500), ...many(1990, 'icons'), ...many(7, 'models', 1000), ...many(1, 'textures'), { path: 'index.html', bytes: 1 }]);
    check(byCount.length === 1 && byCount[0].startsWith('2,002 files, over the budget of 2,000') && byCount[0].endsWith('the most are in icons/ (1,990), models/ (7), audio/ (3)'), `2002 files: ${byCount.join(' | ')}`);

    // bytes: 40 MiB in all passes, a byte more fails and names the three biggest folders
    const heavy = [{ path: 'audio/m.m4a', bytes: 12 * MiB }, { path: 'icons/i.webp', bytes: 3 * MiB }, { path: 'models/a.glb', bytes: 20 * MiB }, { path: 'textures/t.webp', bytes: 5 * MiB }];
    check(overBudget(heavy).length === 0, '40 MiB in all is within the budget');
    const byBytes = overBudget([...heavy, { path: 'index.html', bytes: 1 }]);
    check(byBytes.length === 1 && byBytes[0].startsWith('40.00 MiB in all, over the budget of 40 MiB') && byBytes[0].endsWith('the biggest folders are models/ (20.00 MiB), audio/ (12.00 MiB), textures/ (5.00 MiB)'), `40 MiB and a byte: ${byBytes.join(' | ')}`);

    // one file: 25 MiB passes, a byte more fails and names it, however small the rest
    check(overBudget([{ path: 'audio/long.m4a', bytes: 25 * MiB }]).length === 0, 'a 25 MiB file is within the budget');
    const byFile = overBudget([{ path: 'audio/long.m4a', bytes: 25 * MiB + 1 }, { path: 'index.html', bytes: 10 }]);
    check(byFile.length === 1 && byFile[0].startsWith('audio/long.m4a is 25.00 MiB, over the 25 MiB one file may be'), `a file of 25 MiB and a byte: ${byFile.join(' | ')}`);
    // all three at once, and a budget of the caller's own
    check(overBudget([...many(2001, 'icons'), { path: 'audio/long.m4a', bytes: 41 * MiB }]).length === 3, 'files, bytes and a file over at once are three findings');
    check(overBudget(files, { files: 7, bytes: 199029, fileBytes: 120000 }).length === 1, 'a budget passed in is the one checked');

    // ── wired into the build: right after vite build, so a dist over the budget fails it ──
    const build = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts.build;
    check(/(^|&& )vite build && node tools\/check-dist\.mjs$/.test(build), `npm run build: ${build}`);

    // ── the command ──
    const run = (...args) => spawnSync(process.execPath, [tool, ...args], { cwd: tmp, encoding: 'utf8' });
    const ok = run('dist');
    check(ok.status === 0, `within the budget it exits ${ok.status}: ${ok.stderr}`);
    check(ok.stdout.startsWith('dist/ by top-level folder:') && /all\s+8\s+199,029/.test(ok.stdout) && /within the budget: 8 of 2,000 files, 0\.19 of 40 MiB, the biggest file 0\.11 of 25 MiB \(models\/packs\/camp\.glb\)/.test(ok.stdout), `within the budget it prints:\n${ok.stdout}`);
    // over it: sparse files, so a big one costs no disk
    const big = path.join(tmp, 'big');
    fs.mkdirSync(path.join(big, 'audio'), { recursive: true });
    fs.mkdirSync(path.join(big, 'models'), { recursive: true });
    fs.writeFileSync(path.join(big, 'index.html'), '<!doctype html>');
    const sparse = (rel, bytes) => {
      fs.writeFileSync(path.join(big, rel), '');
      fs.truncateSync(path.join(big, rel), bytes);
    };
    sparse('audio/long.m4a', 25 * MiB + 1);
    sparse('models/a.glb', 16 * MiB);
    const over = run('big');
    check(over.status === 1, `over the budget it exits ${over.status}`);
    check(/models\/\s+1\s+16,777,216\s+16\.00/.test(over.stdout), `over the budget it still prints the table:\n${over.stdout}`);
    check(/big\/ is over its budget/.test(over.stderr) && /- 41\.00 MiB in all, over the budget of 40 MiB \(the internal host takes 50 MiB\): the biggest folders are audio\/ \(25\.00 MiB\), models\/ \(16\.00 MiB\), \(top level\) \(0\.00 MiB\)/.test(over.stderr) && /- audio\/long\.m4a is 25\.00 MiB, over the 25 MiB/.test(over.stderr), `over the budget it says:\n${over.stderr}`);
    const none = run('nothing');
    check(none.status === 1 && /there is no nothing\/ to count/.test(none.stderr), `with no folder it exits ${none.status}: ${none.stderr}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`  8 files in 4 top-level rows, links followed and a loop cut; ${BUDGET.files} files, ${BUDGET.bytes / MiB} MiB and a ${BUDGET.fileBytes / MiB} MiB file pass, one more fails naming where; npm run build runs it; the command exits 0 within, 1 over or without a folder`);
};
