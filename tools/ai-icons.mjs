// The item pictures, painted in style A on box (the GPU machine: 3× RTX 3090), the way
// tools/ai-audio.mjs makes the sounds. The list is tools/icons/pictures.mjs (one picture per D2
// picture file, not per base), each picture's words are tools/icons/desc/*.json, the style and
// settings tools/icons/style.mjs; the box side is tools/icons/box/ (its README says what each step
// does). Packs every pick's 2x picture (w×68 by h×68 px) into the atlas of its kind of thing,
// public/icons/items/<atlas>.webp (tools/icons/atlas.mjs), records what made each picture and where it
// is in tools/icons/made/<list>.json (a group's, or uniques/sets) and the atlases in
// made/atlases.json, and writes public/icons/CREDITS.md from those records and src/data/itempics.ts,
// the map the game cuts the pictures out by (src/ui/itempics.ts). The 1x candidates are for the review
// sheets only: on a 1x screen the game draws the 2x down and sharpens it as the export did.
//
//   node tools/ai-icons.mjs --dry [sel] [--prompts]   the jobs a run would send, and the picks it would apply
//   node tools/ai-icons.mjs --gen [sel]               paint the selection's candidates on box (a new run)
//   node tools/ai-icons.mjs --gen --run 3 [sel]       … adding them to run-03 (or attach to it while it runs)
//   node tools/ai-icons.mjs --pull --run 3            fetch run-03's candidates and sheets again
//   node tools/ai-icons.mjs                           apply the picks: pack public/icons/items/ from them
//     sel       --group blades,long  --kind base,variant,unique,set  --only invssd,invcap
//     --seeds   101,202 (default style.mjs SEEDS); --round n takes the n-th next four (seedsFor)
//     --desc f  descriptions from another file too (a trial: they override desc/*.json)
//     --review n  the review round the run's candidates are for: its sheets say so (<group>_r<n>_NN.png)
//
// Every step can be stopped and run again. A run is box:~/icons/full/run-NN (claimed with mkdir, so two
// sessions never share one) holding jobs.json, the paintings (gen/), cut-outs (cut/), candidates
// (cand/: <picture>_s<seed>.webp, .1x.webp, .json, and .4x.webp for the sheets only) and review sheets
// (sheets/<group>_NN.png); the candidates, sheets and guides come back into icons-src/run-NN/
// (ICONS_SRC; not committed). Box skips what a
// run already made, and a job id is its picture and seed, so a description changed after a run
// painted it needs a new run (it says so). The GPUs are box's business (run.py: free ones only, locked).
//
// Descriptions, tools/icons/desc/<file>.json: { "<picture>": { "desc": "…", "guide": "halberd",
// "fill": 0.8, "material": false, "ref": "base" | false | "<picture>", "note": "…" } }. desc names the
// object and its defining parts in generic terms and our own details; guide is a shape guide of
// box/guides.py; fill shrinks the object in its cells; material says whether the normal-tier
// material line goes in (style.mjs takesMaterial); ref, for a unique or set picture, is the picture
// whose pick is its reference image (default its base's: that base must be picked first).
// Picks, tools/icons/picks/<list>.json: { "<picture>": { "run": 3, "seed": 202 } }, a list being a base
// or variant picture's group, or uniques / sets for a unique's or set item's own picture. Rejects,
// tools/icons/rejects/<group>.json: a review's pictures sent back, each with the reason and its fix (new words,
// a guide, a fill); once applied and painted again they move to rejects/history/review-<n>.json.
// npm test -- icons checks the list's rules, the descriptions, the picks and public/icons/items/.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atlasOf, pack, pixelsOf } from './icons/atlas.mjs';
import { GROUPS, KINDS, LISTS, buildPictures, listOf } from './icons/pictures.mjs';
import { EXPORT, GRADE, MATTE, MODEL, NEGATIVE, SEEDS, STYLE, canvasFor, promptFor, seedsFor } from './icons/style.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'tools/icons');
const DESC = path.join(ICONS, 'desc');
const PICKS = path.join(ICONS, 'picks');
const MADE = path.join(ICONS, 'made');
const BOX_SRC = path.join(ICONS, 'box');
const OUT = path.join(ROOT, 'public/icons/items');
const CREDITS = path.join(ROOT, 'public/icons/CREDITS.md');
const MANIFEST = path.join(ROOT, 'src/data/itempics.ts');
const SRC = path.resolve(process.env.ICONS_SRC ?? path.join(ROOT, 'icons-src'));
const BOX = process.env.ICONS_BOX ?? 'box';
/** on box, under its home: the scripts, the runs and the GPU locks; and the env (uv, Python 3.12) */
const BOX_ROOT = 'icons/full';
const BOX_PY = 'icons/env/.venv/bin/python';
/** a picture's seconds on a 3090, plain and with a reference image (the samples), and a model load */
const SECS = { plain: 2.28, ref: 5.08, load: 12 };

const args = process.argv.slice(2);
const FLAGS = ['dry', 'gen', 'pull', 'prompts', 'run', 'group', 'kind', 'only', 'seeds', 'round', 'desc', 'review'];
const VALUED = ['run', 'group', 'kind', 'only', 'seeds', 'round', 'desc', 'review'];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith('--') || !FLAGS.includes(a.slice(2))) fail(`${a}? The flags are ${FLAGS.map((f) => `--${f}`).join(' ')}`);
  if (VALUED.includes(a.slice(2)) && (args[i + 1] === undefined || args[i + 1].startsWith('--'))) fail(`${a} needs a value`);
  if (VALUED.includes(a.slice(2))) i++;
}
const flag = (k) => args.includes(`--${k}`);
const opt = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const csv = (k) => opt(k)?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const DRY = flag('dry');
const GEN = flag('gen');
const PULL = flag('pull');
const RUN = opt('run') === undefined ? undefined : Number(opt('run'));
if (RUN !== undefined && !(Number.isInteger(RUN) && RUN > 0)) fail(`--run ${opt('run')}: a run number`);
if (PULL && RUN === undefined) fail('--pull needs --run');
const SEL = { group: csv('group'), kind: csv('kind'), only: csv('only') };
for (const g of SEL.group ?? []) if (!(g in GROUPS)) fail(`--group ${g}: the groups are ${Object.keys(GROUPS).join(', ')}`);
for (const k of SEL.kind ?? []) if (!KINDS.includes(k)) fail(`--kind ${k}: the kinds are ${KINDS.join(', ')}`);
const ROUND = opt('round') === undefined ? 0 : Number(opt('round'));
const SEED_LIST = opt('seeds') ? opt('seeds').split(',').map(Number) : ROUND ? seedsFor(ROUND) : SEEDS;
if (!SEED_LIST.every((s) => Number.isInteger(s) && s >= 0)) fail(`--seeds ${opt('seeds')}: whole numbers`);
const REVIEW = opt('review') === undefined ? undefined : Number(opt('review'));
if (REVIEW !== undefined && !(Number.isInteger(REVIEW) && REVIEW > 0)) fail(`--review ${opt('review')}: a review round, 1 or more`);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
const readJson = (file, empty) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : empty);
/** written whole, then renamed: a run stopped halfway leaves the last complete one */
function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, data);
  fs.renameSync(`${file}.tmp`, file);
}
const json = (v) => JSON.stringify(v, null, 1) + '\n';
const sha = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
const pad = (n) => String(n).padStart(2, '0');
const runName = (n) => `run-${pad(n)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- box

function sh(cmd, argv, { quiet = false, input } = {}) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', input, maxBuffer: 1 << 26, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', quiet ? 'pipe' : 'inherit'] });
  if (r.error) throw r.error;
  return r;
}
/** a command on box; its output, or throws */
function ssh(remote, opts = {}) {
  const r = sh('ssh', ['-o', 'BatchMode=yes', BOX, remote], { quiet: true, ...opts });
  if (r.status !== 0 && !opts.ok) throw new Error(`ssh ${BOX} '${remote}': ${r.stderr.trim() || `exit ${r.status}`}`);
  return opts.ok ? r : r.stdout;
}
/** rsync without --delete: what is on the other side and not here is left alone */
function rsync(from, to, extra = []) {
  const r = sh('rsync', ['-a', ...extra, from, to], { quiet: true });
  if (r.status !== 0) throw new Error(`rsync ${from} ${to}: ${r.stderr.trim()}`);
}
let home;
const boxHome = () => (home ??= ssh('printf %s "$HOME"').trim());
const boxRun = (n) => `${boxHome()}/${BOX_ROOT}/${runName(n)}`;

// ---- the list, the descriptions, the picks

const { pictures, byId } = await buildPictures();

/** the guides' names, from box/guides.py's GUIDES table (kept there, with the drawings) */
const GUIDES = new Set([...fs.readFileSync(path.join(BOX_SRC, 'guides.py'), 'utf8').matchAll(/^ {4}"([a-z0-9-]+)": \(/gm)].map((m) => m[1]));

function loadDir(dir, what) {
  const out = {};
  const from = {};
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const f of files) {
    for (const [id, v] of Object.entries(readJson(path.join(dir, f)))) {
      if (from[id]) fail(`${what}: ${id} is in both ${from[id]} and ${f}`);
      out[id] = v;
      from[id] = f;
    }
  }
  return { out, from };
}

function loadDescs() {
  const { out: d } = loadDir(DESC, 'tools/icons/desc');
  if (opt('desc')) Object.assign(d, readJson(path.resolve(opt('desc'))));
  const problems = [];
  for (const [id, e] of Object.entries(d)) {
    const p = byId.get(id);
    if (!p) problems.push(`desc ${id}: no such picture (node tools/icons/pictures.mjs --json)`);
    else if (typeof e.desc !== 'string' || e.desc.trim().length < 20) problems.push(`desc ${id}: needs a desc`);
    if (e.guide && !GUIDES.has(e.guide)) problems.push(`desc ${id}: no guide ${e.guide} in box/guides.py (${[...GUIDES].join(', ')})`);
    if (e.fill !== undefined && !(e.fill > 0.2 && e.fill <= 1)) problems.push(`desc ${id}: fill ${e.fill} is not 0.2 to 1`);
    if (e.ref !== undefined && e.ref !== false && e.ref !== 'base' && !byId.has(e.ref)) problems.push(`desc ${id}: ref ${e.ref} is no picture`);
  }
  if (problems.length) fail(problems.join('\n'));
  return d;
}

function loadPicks() {
  const { out: picks, from } = loadDir(PICKS, 'tools/icons/picks');
  const problems = [];
  for (const [id, p] of Object.entries(picks)) {
    if (!byId.has(id)) problems.push(`picks/${from[id]} ${id}: no such picture`);
    if (!Number.isInteger(p.run) || !Number.isInteger(p.seed)) problems.push(`picks/${from[id]} ${id}: needs { run, seed }`);
    else if (byId.has(id) && listOf(byId.get(id)) !== from[id].replace(/\.json$/, '')) problems.push(`picks/${from[id]} ${id}: belongs in picks/${listOf(byId.get(id))}.json`);
  }
  if (problems.length) fail(problems.join('\n'));
  return picks;
}

const DESCS = loadDescs();
const PICKED = loadPicks();

const selected = pictures.filter(
  (p) => (!SEL.group || SEL.group.includes(p.group)) && (!SEL.kind || SEL.kind.includes(p.kind)) && (!SEL.only || SEL.only.includes(p.id)),
);
if (SEL.only) for (const id of SEL.only) if (!byId.has(id)) fail(`--only ${id}: no such picture`);

/** a picture's line in the sheets and the log: its base's name, or the special items' (ours) */
const labelOf = (p) => (p.kind === 'unique' || p.kind === 'set' ? [...p.uniques, ...p.sets].map((s) => s.nameEn).join(' / ') : p.codes.find((c) => c.code === p.lead).en);

/** every name a picture's review row lists: its bases, normal tier first, or the special items' */
const servesOf = (p) =>
  p.kind === 'unique' || p.kind === 'set'
    ? [...p.uniques, ...p.sets].map((s) => s.nameEn)
    : [...p.codes].sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9)).map((c) => c.en).filter((n, i, a) => a.indexOf(n) === i);

/** the official names of the special items a picture shows: a prompt names ours, never theirs */
const officialOf = (p) => [...p.uniques, ...p.sets].map((s) => s.key).filter((k, i, a) => k.length > 5 && a.indexOf(k) === i);

/** the jobs of the selection, for run n (null: no run yet, the dry run's), and what was left out and why */
function jobsFor(n) {
  const jobs = [];
  const skipped = [];
  for (const p of selected) {
    const d = DESCS[p.id];
    if (!d) {
      skipped.push([p.id, 'no description']);
      continue;
    }
    const [width, height] = canvasFor(p.w, p.h);
    const special = p.kind === 'unique' || p.kind === 'set';
    const refPic = special ? (d.ref === undefined || d.ref === 'base' ? p.base?.[0] : d.ref || null) : d.ref || null;
    const refPick = refPic ? PICKED[refPic] : null;
    if (refPic && !refPick) {
      skipped.push([p.id, `its reference ${refPic} has no pick yet (or set "ref": false)`]);
      continue;
    }
    const prompt = promptFor(p, d, { guide: !!d.guide, baseRef: !!refPick });
    if (/diablo|blizzard/i.test(prompt)) fail(`desc ${p.id}: a prompt never names the game it follows`);
    const named = officialOf(p).filter((k) => prompt.toLowerCase().includes(k.toLowerCase()));
    if (named.length) fail(`desc ${p.id}: names ${named.join(', ')}, an official name: use ours`);
    const dir = n ? boxRun(n) : `<box>/${BOX_ROOT}/run-NN`;
    const ref = [];
    if (d.guide) ref.push(`${dir}/guides/${d.guide}_${width}x${height}.png`);
    if (refPick) ref.push(`${n ? `${boxHome()}/${BOX_ROOT}` : `<box>/${BOX_ROOT}`}/${runName(refPick.run)}/gen/${refPic}_s${refPick.seed}.png`);
    for (const seed of SEED_LIST) {
      jobs.push({
        id: `${p.id}_s${seed}`,
        picture: p.id,
        group: p.group,
        kind: p.kind,
        w: p.w,
        h: p.h,
        fill: d.fill ?? 1,
        label: labelOf(p),
        serves: servesOf(p),
        prompt,
        negative: NEGATIVE,
        width,
        height,
        seed,
        guide: d.guide ?? null,
        ref,
        baseRef: refPick ? { picture: refPic, run: refPick.run, seed: refPick.seed } : null,
      });
    }
  }
  return { jobs, skipped };
}

function estimate(jobs) {
  const secs = jobs.reduce((s, j) => s + (j.ref.length ? SECS.ref : SECS.plain), 0);
  const wall = secs / 3 + SECS.load;
  return `${(secs / 60).toFixed(1)} GPU min, ~${Math.ceil(wall / 60)} min on box's three GPUs`;
}

// ---- a run on box

async function claimRun() {
  const local = fs.existsSync(SRC) ? fs.readdirSync(SRC).map((f) => /^run-(\d+)$/.exec(f)?.[1]).filter(Boolean).map(Number) : [];
  const remote = ssh(`mkdir -p ${BOX_ROOT} && ls ${BOX_ROOT}`).split('\n').map((f) => /^run-(\d+)$/.exec(f.trim())?.[1]).filter(Boolean).map(Number);
  for (let n = Math.max(0, ...local, ...remote) + 1; ; n++) {
    if (ssh(`mkdir ${BOX_ROOT}/${runName(n)}`, { ok: true }).status === 0) return n;
  }
}

/** whether run.py's pid lives on box: true, false, or null when ssh itself failed (exit 255: a
 * dropped connection says nothing about the run) */
function alive(pid) {
  const r = ssh(`kill -0 ${pid} 2>/dev/null && echo alive || echo gone`, { ok: true });
  return r.status === 0 ? r.stdout.trim() === 'alive' : null;
}

function runStatus(n) {
  const r = ssh(`cat ${BOX_ROOT}/${runName(n)}/status.json 2>/dev/null`, { ok: true });
  const st = r.status === 0 && r.stdout.trim() ? JSON.parse(r.stdout) : null;
  // unknown counts as alive: a second run.py must never start on a run that is still going
  if (st?.state === 'running') st.alive = alive(st.pid) !== false;
  return st;
}

/** this run's jobs.json on box, merged with the new jobs: one id is one picture and seed, painted once */
function mergeJobs(n, jobs) {
  const local = path.join(SRC, runName(n), 'jobs.json');
  const r = ssh(`cat ${BOX_ROOT}/${runName(n)}/jobs.json 2>/dev/null`, { ok: true });
  const was = r.status === 0 && r.stdout.trim() ? JSON.parse(r.stdout) : {};
  const old = was.jobs ?? [];
  const review = REVIEW ?? was.review;
  if (REVIEW && was.review && REVIEW !== was.review) fail(`${runName(n)} is review round ${was.review}'s: paint round ${REVIEW}'s in a new run`);
  const have = new Map(old.map((j) => [j.id, j]));
  const changed = [];
  const added = [];
  for (const j of jobs) {
    const o = have.get(j.id);
    if (!o) added.push(j);
    else if (o.prompt !== j.prompt || JSON.stringify(o.ref) !== JSON.stringify(j.ref) || o.fill !== j.fill) changed.push(j.id);
  }
  if (changed.length) fail(`${runName(n)} painted ${changed.join(', ')} from other words or references: paint them in a new run (leave out --run)`);
  const spec = {
    run: n,
    style: { id: STYLE.id, name: STYLE.name },
    model: MODEL,
    matte: MATTE,
    grade: GRADE,
    export: EXPORT,
    ...(review ? { review } : {}),
    jobs: [...old, ...added],
  };
  writeAtomic(local, json(spec));
  return { spec, added, local };
}

/** print the run's log from byte off on, until its status says done (or that it stopped) */
async function follow(n, off = 0) {
  const dir = `${BOX_ROOT}/${runName(n)}`;
  let carry = '';
  let misses = 0;
  const t0 = Date.now();
  for (;;) {
    const r = ssh(`cat ${dir}/status.json 2>/dev/null; echo; echo @@LOG@@; tail -c +${off + 1} ${dir}/logs/run.log 2>/dev/null; true`, { ok: true });
    // box out of reach for a moment (ssh's own exit 255): ask again rather than give the run up
    if (r.status !== 0) {
      if (++misses > 30) fail(`${runName(n)}: box unreachable for 5 min: ${r.stderr.trim()} (--gen --run ${n} follows it again)`);
      await sleep(10000);
      continue;
    }
    misses = 0;
    const out = r.stdout;
    const at = out.indexOf('\n@@LOG@@\n');
    const st = out.slice(0, at).trim();
    const text = out.slice(at + 9);
    off += Buffer.byteLength(text);
    const lines = (carry + text).split('\n');
    carry = lines.pop();
    for (const l of lines) console.log(`  ${l}`);
    const s = st ? JSON.parse(st) : null;
    if (s?.state === 'done') return s;
    if (s?.state === 'failed') fail(`${runName(n)} failed: ${s.error} (box:~/${dir}/logs/)`);
    // gone while the status says running: it may have just finished, so the status is read once more
    if (s?.state === 'running' && alive(s.pid) === false) {
      const again = runStatus(n);
      if (again?.state !== 'done' && again?.state !== 'failed') fail(`${runName(n)} stopped without a word: run it again (--gen --run ${n})`);
      continue;
    }
    // run.py marks itself running at once: still not, it never started (box:~/<run>/logs/run.log says why)
    if ((!s || s.state === 'starting') && Date.now() - t0 > 90000) fail(`${runName(n)} didn't start: box:~/${dir}/logs/run.log`);
    await sleep(s?.state === 'starting' ? 2000 : 10000);
  }
}

function pull(n) {
  const dst = path.join(SRC, runName(n));
  fs.mkdirSync(dst, { recursive: true });
  for (const sub of ['cand', 'sheets', 'logs', 'guides']) rsync(`${BOX}:${BOX_ROOT}/${runName(n)}/${sub}`, dst);
  for (const f of ['jobs.json', 'status.json']) rsync(`${BOX}:${BOX_ROOT}/${runName(n)}/${f}`, dst);
  const sheets = fs.readdirSync(path.join(dst, 'sheets')).length;
  console.log(`${runName(n)}: candidates and ${sheets} sheets in ${path.relative(ROOT, dst) || dst}/`);
}

async function gen() {
  const { jobs: asked, skipped } = jobsFor(null);
  for (const [id, why] of skipped) if (why !== 'no description' || SEL.only) console.log(`  ${id}: left out, ${why}`);
  const undescribed = skipped.filter(([, why]) => why === 'no description').length;
  if (undescribed && !SEL.only) console.log(`  ${undescribed} selected pictures have no description yet: left out`);
  if (!asked.length) fail('nothing to paint in the selection');
  let n = RUN;
  let off = 0;
  const st = n ? runStatus(n) : null;
  if (st?.state === 'running' && st.alive) {
    console.log(`${runName(n)} is running: following it (run this again for jobs it doesn't have yet)`);
  } else {
    n ??= await claimRun();
    const { jobs } = jobsFor(n);
    const { added, local } = mergeJobs(n, jobs);
    console.log(`${runName(n)}: ${added.length} new jobs of the ${jobs.length} asked${added.length ? `, ${estimate(added)}` : ''}`);
    const dir = `${BOX_ROOT}/${runName(n)}`;
    ssh(`mkdir -p ${BOX_ROOT}/bin ${dir}/logs`);
    rsync(`${BOX_SRC}/`, `${BOX}:${BOX_ROOT}/bin/`, ['--exclude', '__pycache__', '--exclude', 'README.md']);
    rsync(local, `${BOX}:${dir}/jobs.json`);
    // the log is followed from here on, and the last run's status is not taken for this one's
    off = Number(ssh(`touch ${dir}/logs/run.log && wc -c < ${dir}/logs/run.log`).trim());
    ssh(`echo '{"state": "starting"}' > ${dir}/status.json && (setsid nohup ${BOX_PY} -I ${BOX_ROOT}/bin/run.py ${dir} >> ${dir}/logs/run.log 2>&1 < /dev/null &) && echo started`);
  }
  const done = await follow(n, off);
  console.log(`${runName(n)}: ${done.made}/${done.jobs} candidates`);
  pull(n);
}

// ---- applying the picks

/** the atlases' records: their files, sizes, what they were drawn from and how close they came out */
const ATLASES = path.join(MADE, 'atlases.json');
/** an atlas's WebP: the export's own (style.mjs EXPORT: lossy colour at its quality, lossless alpha, libwebp's slowest method) */
const ATLAS_WEBP = { quality: EXPORT.webpQuality, alphaQuality: 100, effort: 6 };
/** a picture drawn again in its atlas is at least this close to its 2x file (PSNR, dB; the worst of the first encode was 44) */
const MIN_PSNR = 40;

/**
 * The picks applied: every pick's 2x picture (its candidate, fetched from box when not here) packed
 * into the atlas of its kind of thing (tools/icons/atlas.mjs), public/icons/items/<atlas>.webp, an
 * atlas written only when what it is drawn from changed; the records (made/<list>.json: what made each
 * picture and where it is; made/atlases.json), the credits and src/data/itempics.ts written from them.
 */
async function apply() {
  const made = {};
  for (const g of LISTS) made[g] = readJson(path.join(MADE, `${g}.json`), {});
  const want = (id) => {
    const p = PICKED[id];
    const base = path.join(SRC, runName(p.run), 'cand', `${id}_s${p.seed}`);
    return { p, src: `${base}.webp`, side: `${base}.json` };
  };
  // what isn't here yet comes from box, a run at a time
  const missing = Object.keys(PICKED).filter((id) => !fs.existsSync(want(id).side) || !fs.existsSync(want(id).src));
  for (const run of new Set(missing.map((id) => PICKED[id].run))) {
    const ids = missing.filter((id) => PICKED[id].run === run);
    const dst = path.join(SRC, runName(run), 'cand');
    fs.mkdirSync(dst, { recursive: true });
    const list = ids.flatMap((id) => ['.webp', '.json'].map((x) => `${id}_s${PICKED[id].seed}${x}`)).join('\n') + '\n';
    const r = sh('rsync', ['-a', '--files-from=-', `${BOX}:${BOX_ROOT}/${runName(run)}/cand/`, dst], { quiet: true, input: list });
    if (r.status !== 0) fail(`the picks of ${runName(run)} aren't on box either: ${r.stderr.trim()}`);
  }
  const stale = [];
  /** each pick: its picture, its 2x file and that file's hash, its record */
  const picks = {};
  for (const id of Object.keys(PICKED).sort()) {
    const pic = byId.get(id);
    const { p, src, side } = want(id);
    const st = readJson(side);
    if (st.job.picture !== id || st.job.seed !== p.seed) fail(`${side}: not ${id} s${p.seed}`);
    const d = DESCS[id];
    if (d && st.job.prompt !== promptFor(pic, d, { guide: !!d.guide, baseRef: !!st.job.baseRef })) stale.push(id);
    const entry = {
      run: p.run,
      seed: p.seed,
      kind: pic.kind,
      w: pic.w,
      h: pic.h,
      prompt: st.job.prompt,
      guide: st.job.guide,
      baseRef: st.job.baseRef,
      model: st.gen.repo,
      license: st.gen.license,
      matte: st.cut.matte,
      matteLicense: st.cut.matte_license,
      flags: { touchesEdge: st.cut.touches_edge, parts: st.cut.parts, shadow: st.cut.shadow },
    };
    picks[id] = { pic, src, sha1: sha(src), entry };
  }

  // the atlases, a kind of thing each
  const byAtlas = new Map();
  for (const [id, k] of Object.entries(picks)) {
    const a = atlasOf(k.pic);
    byAtlas.set(a, [...(byAtlas.get(a) ?? []), id]);
  }
  const was = readJson(ATLASES, {});
  const atlases = {};
  let wrote = 0;
  for (const [name, ids] of [...byAtlas].sort(([a], [b]) => a.localeCompare(b))) {
    for (const atlas of pack(name, ids.map((id) => ({ id, w: picks[id].pic.w, h: picks[id].pic.h })))) {
      const file = path.join(OUT, `${atlas.name}.webp`);
      // what it is drawn from: the pictures at their rects, the size and the encoding
      const rects = Object.entries(atlas.rects).sort(([a], [b]) => a.localeCompare(b));
      const inputs = crypto.createHash('sha1').update(JSON.stringify([atlas.w, atlas.h, ATLAS_WEBP, rects.map(([id, r]) => [id, r, picks[id].sha1])])).digest('hex').slice(0, 12);
      const old = was[atlas.name];
      if (old && old.inputs === inputs && fs.existsSync(file) && sha(file) === old.sha1) atlases[atlas.name] = old;
      else {
        atlases[atlas.name] = await drawAtlas(atlas, file, picks, inputs);
        wrote++;
      }
      // what each picture's rect shows as the atlas decodes: the game's map is checked against it (tools/test/itempics.test.mjs)
      const sharp = (await import('sharp')).default;
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const [id, rect] of rects) picks[id].entry.atlas = { file: `public/icons/items/${atlas.name}.webp`, rect, sha1: picks[id].sha1, pixels: pixelsOf(data, info.width, rect) };
    }
  }

  for (const [id, k] of Object.entries(picks)) made[listOf(k.pic)][id] = k.entry;
  for (const [g, m] of Object.entries(made)) {
    const file = path.join(MADE, `${g}.json`);
    const sorted = Object.fromEntries(Object.entries(m).filter(([id]) => PICKED[id]).sort(([a], [b]) => a.localeCompare(b)));
    if (!Object.keys(sorted).length && !fs.existsSync(file)) continue;
    const text = json(sorted);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) writeAtomic(file, text);
  }
  const atlasText = json(Object.fromEntries(Object.entries(atlases).sort(([a], [b]) => a.localeCompare(b))));
  if (!fs.existsSync(ATLASES) || fs.readFileSync(ATLASES, 'utf8') !== atlasText) writeAtomic(ATLASES, atlasText);
  const all = Object.assign({}, ...Object.values(made));
  writeCredits(all);
  writeManifest(all, atlases);
  // public/icons/items holds the atlases and nothing else: another .webp there is this tool's older output (a picture a file)
  const keep = new Set(Object.keys(atlases).map((n) => `${n}.webp`));
  const gone = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /\.webp(\.tmp)?$/.test(f) && !keep.has(f)) : [];
  for (const f of gone) fs.unlinkSync(path.join(OUT, f));
  const kb = Object.values(atlases).reduce((s, a) => s + a.bytes, 0) / 1024;
  const worst = Object.values(atlases).reduce((w, a) => (a.worstPsnr < w.worstPsnr ? a : w));
  console.log(`picks: ${Object.keys(PICKED).length} pictures of ${pictures.length} in ${keep.size} atlases (${kb.toFixed(0)} KB), ${wrote} written, ${keep.size - wrote} already so; closest to its 2x file at worst ${worst.worstPsnr} dB (${worst.worstPicture})`);
  if (gone.length) console.log(`  removed from public/icons/items/, not atlases: ${gone.length} files`);
  if (stale.length) console.log(`  painted from older words than desc/ has now (paint them again?): ${stale.join(' ')}`);
}

/**
 * An atlas drawn: each picture's 2x file copied to its rect (no blending: they never overlap),
 * encoded, decoded again and checked (every picture where its rect says and close to its file,
 * nothing outside the rects), then written whole; its record
 */
async function drawAtlas(atlas, file, picks, inputs) {
  const sharp = (await import('sharp')).default;
  const px = Buffer.alloc(atlas.w * atlas.h * 4);
  const srcs = {};
  for (const [id, [x, y, w, h]] of Object.entries(atlas.rects)) {
    const { data, info } = await sharp(picks[id].src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== w || info.height !== h) fail(`${picks[id].src}: ${info.width}x${info.height} px, not ${w}x${h}`);
    for (let row = 0; row < h; row++) data.copy(px, ((y + row) * atlas.w + x) * 4, row * w * 4, (row + 1) * w * 4);
    srcs[id] = data;
  }
  const buf = await sharp(px, { raw: { width: atlas.w, height: atlas.h, channels: 4 } }).webp(ATLAS_WEBP).toBuffer();
  const back = await sharp(buf).ensureAlpha().raw().toBuffer();
  const covered = new Uint8Array(atlas.w * atlas.h);
  let worst = { psnr: Infinity, id: '' };
  for (const [id, [x, y, w, h]] of Object.entries(atlas.rects)) {
    const s = srcs[id];
    let se = 0;
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const i = (row * w + col) * 4;
        const k = (y + row) * atlas.w + x + col;
        covered[k] = 1;
        // premultiplied colour and alpha: what shows over the cell
        for (let c = 0; c < 3; c++) {
          const d = (s[i + c] * s[i + 3] - back[k * 4 + c] * back[k * 4 + 3]) / 255;
          se += d * d;
        }
        se += (s[i + 3] - back[k * 4 + 3]) ** 2;
      }
    }
    const psnr = 10 * Math.log10((255 * 255 * w * h * 4) / Math.max(se, 1e-9));
    if (psnr < worst.psnr) worst = { psnr, id };
  }
  for (let k = 0; k < covered.length; k++) if (!covered[k] && back[k * 4 + 3]) fail(`atlas ${atlas.name}: a pixel shows outside its pictures, at ${k % atlas.w},${Math.floor(k / atlas.w)}`);
  if (worst.psnr < MIN_PSNR) fail(`atlas ${atlas.name}: ${worst.id} comes out ${worst.psnr.toFixed(1)} dB from its 2x file (under ${MIN_PSNR})`);
  writeAtomic(file, buf);
  return {
    file: `public/icons/items/${atlas.name}.webp`,
    w: atlas.w,
    h: atlas.h,
    pictures: Object.keys(atlas.rects).length,
    bytes: buf.length,
    sha1: sha(file),
    webp: ATLAS_WEBP,
    worstPsnr: Math.round(worst.psnr * 10) / 10,
    worstPicture: worst.id,
    inputs,
  };
}

/**
 * src/data/itempics.ts: the atlases with a version from each file's hash (the game asks for
 * <atlas>.webp?v=<version>, so an atlas made again is never shown from an old cache), and every
 * picture the game has, by file name, with its atlas and rect; a picture not listed keeps the
 * code-drawn icon without a request
 */
function writeManifest(made, atlases) {
  const ids = Object.keys(made).filter((id) => PICKED[id]).sort();
  const names = Object.keys(atlases).sort();
  const text = `// Generated by tools/ai-icons.mjs from the picks (tools/icons/made). Do not edit.

/** the atlases in public/icons/items, by name: a version of each file, for its URL */
export const ITEM_ATLASES: Record<string, string> = {
${names.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(atlases[n].sha1.slice(0, 8))},`).join('\n')}
};

/** the painted pictures, by file name: the atlas each is in and its rect there, in px (68 a cell: the 2x picture) */
export const ITEM_PICTURES: Record<string, readonly [atlas: string, x: number, y: number, w: number, h: number]> = {
${ids.map((id) => `  ${JSON.stringify(id)}: [${JSON.stringify(path.basename(made[id].atlas.file, '.webp'))}, ${made[id].atlas.rect.join(', ')}],`).join('\n')}
};
`;
  if (!fs.existsSync(MANIFEST) || fs.readFileSync(MANIFEST, 'utf8') !== text) writeAtomic(MANIFEST, text);
}

/** public/icons/CREDITS.md from the records of what is picked: the models and licences they name, the counts */
function writeCredits(made) {
  const entries = Object.entries(made).filter(([id]) => PICKED[id]);
  if (!entries.length) return;
  const models = new Map();
  const count = (step, repo, license) => {
    const k = `${step}\t${repo}\t${license}`;
    models.set(k, (models.get(k) ?? 0) + 1);
  };
  for (const [, m] of entries) {
    count('作画', m.model, m.license);
    count('抠图', m.matte, m.matteLicense);
  }
  const kinds = { base: '底材', variant: '外观变体（戒指、护符、珠宝、护身符）', unique: '暗金专属', set: '套装专属' };
  const by = (k) => entries.filter(([, m]) => m.kind === k).length;
  const rows = [...models].map(([k, n]) => {
    const [step, repo, license] = k.split('\t');
    return `| ${step} | [${repo}](https://huggingface.co/${repo}) | ${license} | ${n} |`;
  });
  const text = `# 物品图来源

背包里的物品图（\`public/icons/items/\`）全部是为本游戏生成的：在我们自己的 GPU 机器上用开源模型按同一种风格（${STYLE.name}）画出来，不是任何游戏的美术资源。

| 步骤 | 模型 | 许可 | 图数 |
| --- | --- | --- | --- |
${rows.join('\n')}

两个模型都是开放许可，可以商用、修改。

图怎么分照《暗黑破坏神 II》（D2R 2.7 的表，\`tools/icons/pictures.mjs\`）：一张图对应一个 invfile，同一条底材线的普通、扩展、精英三档共用一张；戒指、护符、珠宝、护身符各有几种外观，物品生成时定下一种；一部分暗金和套装物品有自己的图，其余显示底材的图。物品的颜色不画在图上：D2 给图调色，我们的近似见 \`tools/icons/colours.py\`（游戏里同样的算法在 \`src/ui/recolour.ts\`）。

原版的图只用来认清每件物品是什么（种类、比例、标志性的部件），从不交给模型（不做图生图、不当参考图），也不描、不量。每张图的文字描述（\`tools/icons/desc/\`）和形状参考（\`tools/icons/box/guides.py\` 画的通用平面形状）都是我们自己写、自己画的；暗金和套装的图以我们自己的底材图为参考重新设计。每张图导出前都和对应的原版图比过相似度（\`tools/icons/similarity.py\`，只用 numpy 和 PIL），分数到界线的重画，接近界线的再并排对照看过。

| 图 | 张数 |
| --- | --- |
${Object.entries(kinds).map(([k, zh]) => `| ${zh} | ${by(k)} |`).join('\n')}
| 合计 | ${entries.length} |

游戏里的图按种类拼成图集（\`<图集>.webp\`，如 \`swords.webp\`、\`potions.webp\`，分法见 \`tools/icons/atlas.mjs\`），图集里每张图是它的 2×（一格 68 px），一个面板只取它用到的那几张图集；每张图在哪张图集、哪个位置写在 \`src/data/itempics.ts\`。一个 CSS 像素对一个设备像素的屏幕上，游戏把 2× 缩成 1×，再做一次和导出 1× 时一样的轻微锐化。图名是 D2 的 invfile 名，小写。每张图的提示词、种子、批次、形状参考、模型和它在图集里的位置记在 \`tools/icons/made/<列表>.json\`，图集记在 \`tools/icons/made/atlases.json\`。

本文件由 \`tools/ai-icons.mjs\` 生成，不要手改。
`;
  if (!fs.existsSync(CREDITS) || fs.readFileSync(CREDITS, 'utf8') !== text) writeAtomic(CREDITS, text);
}

// ---- main

if (DRY) {
  const { jobs, skipped } = jobsFor(null);
  const pics = new Map();
  for (const j of jobs) pics.set(j.picture, [...(pics.get(j.picture) ?? []), j]);
  for (const [id, js] of pics) {
    const j = js[0];
    const ref = [j.guide && `guide ${j.guide}`, j.baseRef && `base ${j.baseRef.picture} (run ${j.baseRef.run} s${j.baseRef.seed})`].filter(Boolean).join(', ');
    console.log(`${id.padEnd(9)} ${j.kind.padEnd(7)} ${j.group.padEnd(6)} ${`${j.w}x${j.h}`.padEnd(4)} ${j.width}x${j.height} seeds ${js.map((x) => x.seed).join(',')}${ref ? `  [${ref}]` : ''}  ${j.label}`);
    if (flag('prompts')) console.log(`    ${j.prompt}\n`);
  }
  const undescribed = skipped.filter(([, why]) => why === 'no description').map(([id]) => id);
  for (const [id, why] of skipped) if (why !== 'no description') console.log(`${id.padEnd(9)} left out: ${why}`);
  if (undescribed.length) console.log(`${undescribed.length} with no description yet: ${undescribed.slice(0, 16).join(' ')}${undescribed.length > 16 ? ' …' : ''}`);
  console.log(`${pics.size} pictures, ${jobs.length} jobs, ${estimate(jobs)}; ${skipped.length} of the ${selected.length} selected left out`);
  console.log(`picks: ${Object.keys(PICKED).length} pictures (${Object.keys(DESCS).length} described of ${pictures.length})`);
  const plan = new Map();
  for (const id of Object.keys(PICKED)) {
    const p = byId.get(id);
    plan.set(atlasOf(p), [...(plan.get(atlasOf(p)) ?? []), { id, w: p.w, h: p.h }]);
  }
  const packed = [...plan].sort(([a], [b]) => a.localeCompare(b)).flatMap(([k, items]) => pack(k, items));
  console.log(`atlases: ${packed.map((a) => `${a.name} ${Object.keys(a.rects).length} (${a.w}x${a.h})`).join(', ')}`);
} else {
  if (PULL) pull(RUN);
  if (GEN) await gen();
  await apply();
}
