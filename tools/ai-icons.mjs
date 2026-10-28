// The item pictures, painted in style A on box (the GPU machine: 3× RTX 3090), the way
// tools/ai-audio.mjs makes the sounds. The list is tools/icons/pictures.mjs (one picture per D2
// picture file, not per base), each picture's words are tools/icons/desc/*.json, the style and
// settings tools/icons/style.mjs; the box side is tools/icons/box/ (its README says what each step
// does). Writes public/icons/items/<picture>.webp (2x: w×68 by h×68 px) and <picture>.1x.webp (1x,
// sharpened), and records what made each in tools/icons/made/<group>.json.
//
//   node tools/ai-icons.mjs --dry [sel] [--prompts]   the jobs a run would send, and the picks it would apply
//   node tools/ai-icons.mjs --gen [sel]               paint the selection's candidates on box (a new run)
//   node tools/ai-icons.mjs --gen --run 3 [sel]       … adding them to run-03 (or attach to it while it runs)
//   node tools/ai-icons.mjs --pull --run 3            fetch run-03's candidates and sheets again
//   node tools/ai-icons.mjs                           apply the picks: write public/icons/items/ from them
//     sel       --group blades,long  --kind base,variant,unique,set  --only invssd,invcap
//     --seeds   101,202 (default style.mjs SEEDS); --round n takes the n-th next four (seedsFor)
//     --desc f  descriptions from another file too (a trial: they override desc/*.json)
//
// Every step can be stopped and run again. A run is box:~/icons/full/run-NN (claimed with mkdir, so two
// sessions never share one) holding jobs.json, the paintings (gen/), cut-outs (cut/), candidates
// (cand/: <picture>_s<seed>.webp, .1x.webp, .json) and review sheets (sheets/<group>_NN.png); the
// candidates and sheets come back into icons-src/run-NN/ (ICONS_SRC; not committed). Box skips what a
// run already made, and a job id is its picture and seed, so a description changed after a run
// painted it needs a new run (it says so). The GPUs are box's business (run.py: free ones only, locked).
//
// Descriptions, tools/icons/desc/<file>.json: { "<picture>": { "desc": "…", "guide": "halberd",
// "fill": 0.8, "material": false, "ref": "base" | false | "<picture>", "note": "…" } }. desc names the
// object and its defining parts in generic terms and our own details; guide is a shape guide of
// box/guides.py; fill shrinks the object in its cells; material says whether the normal-tier
// material line goes in (style.mjs takesMaterial); ref, for a unique or set picture, is the picture
// whose pick is its reference image (default its base's: that base must be picked first).
// Picks, tools/icons/picks/<group>.json: { "<picture>": { "run": 3, "seed": 202 } }.
// npm test -- icons checks the list's rules, the descriptions, the picks and public/icons/items/.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUPS, KINDS, buildPictures } from './icons/pictures.mjs';
import { EXPORT, GRADE, MATTE, MODEL, NEGATIVE, SEEDS, STYLE, canvasFor, promptFor, seedsFor } from './icons/style.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'tools/icons');
const DESC = path.join(ICONS, 'desc');
const PICKS = path.join(ICONS, 'picks');
const MADE = path.join(ICONS, 'made');
const BOX_SRC = path.join(ICONS, 'box');
const OUT = path.join(ROOT, 'public/icons/items');
const SRC = path.resolve(process.env.ICONS_SRC ?? path.join(ROOT, 'icons-src'));
const BOX = process.env.ICONS_BOX ?? 'box';
/** on box, under its home: the scripts, the runs and the GPU locks; and the env (uv, Python 3.12) */
const BOX_ROOT = 'icons/full';
const BOX_PY = 'icons/env/.venv/bin/python';
/** a picture's seconds on a 3090, plain and with a reference image (the samples), and a model load */
const SECS = { plain: 2.28, ref: 5.08, load: 12 };

const args = process.argv.slice(2);
const FLAGS = ['dry', 'gen', 'pull', 'prompts', 'run', 'group', 'kind', 'only', 'seeds', 'round', 'desc'];
const VALUED = ['run', 'group', 'kind', 'only', 'seeds', 'round', 'desc'];
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
    else if (byId.has(id) && byId.get(id).group !== from[id].replace(/\.json$/, '')) problems.push(`picks/${from[id]} ${id}: a ${byId.get(id).group} picture`);
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

function runStatus(n) {
  const r = ssh(`cat ${BOX_ROOT}/${runName(n)}/status.json 2>/dev/null`, { ok: true });
  const st = r.status === 0 && r.stdout.trim() ? JSON.parse(r.stdout) : null;
  if (st?.state === 'running') st.alive = ssh(`kill -0 ${st.pid} 2>/dev/null`, { ok: true }).status === 0;
  return st;
}

/** this run's jobs.json on box, merged with the new jobs: one id is one picture and seed, painted once */
function mergeJobs(n, jobs) {
  const local = path.join(SRC, runName(n), 'jobs.json');
  const r = ssh(`cat ${BOX_ROOT}/${runName(n)}/jobs.json 2>/dev/null`, { ok: true });
  const old = r.status === 0 && r.stdout.trim() ? JSON.parse(r.stdout).jobs : [];
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
    jobs: [...old, ...added],
  };
  writeAtomic(local, json(spec));
  return { spec, added, local };
}

/** print the run's log from byte off on, until its status says done (or that it stopped) */
async function follow(n, off = 0) {
  const dir = `${BOX_ROOT}/${runName(n)}`;
  let carry = '';
  const t0 = Date.now();
  for (;;) {
    const out = ssh(`cat ${dir}/status.json 2>/dev/null; echo; echo @@LOG@@; tail -c +${off + 1} ${dir}/logs/run.log 2>/dev/null`, { ok: true }).stdout;
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
    if (s?.state === 'running' && ssh(`kill -0 ${s.pid} 2>/dev/null`, { ok: true }).status !== 0) {
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
  for (const sub of ['cand', 'sheets', 'logs']) rsync(`${BOX}:${BOX_ROOT}/${runName(n)}/${sub}`, dst);
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

function apply() {
  const made = {};
  for (const g of Object.keys(GROUPS)) made[g] = readJson(path.join(MADE, `${g}.json`), {});
  const want = (id) => {
    const p = PICKED[id];
    const base = path.join(SRC, runName(p.run), 'cand', `${id}_s${p.seed}`);
    return { p, base, files: { '2x': `${base}.webp`, '1x': `${base}.1x.webp` }, side: `${base}.json` };
  };
  // what isn't here yet comes from box, a run at a time
  const missing = Object.keys(PICKED).filter((id) => !fs.existsSync(want(id).side));
  for (const run of new Set(missing.map((id) => PICKED[id].run))) {
    const ids = missing.filter((id) => PICKED[id].run === run);
    const dst = path.join(SRC, runName(run), 'cand');
    fs.mkdirSync(dst, { recursive: true });
    const list = ids.flatMap((id) => ['.webp', '.1x.webp', '.json'].map((x) => `${id}_s${PICKED[id].seed}${x}`)).join('\n') + '\n';
    const r = sh('rsync', ['-a', '--files-from=-', `${BOX}:${BOX_ROOT}/${runName(run)}/cand/`, dst], { quiet: true, input: list });
    if (r.status !== 0) fail(`the picks of ${runName(run)} aren't on box either: ${r.stderr.trim()}`);
  }
  let wrote = 0;
  let same = 0;
  const stale = [];
  for (const id of Object.keys(PICKED).sort()) {
    const pic = byId.get(id);
    const { p, files, side } = want(id);
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
      files: {},
    };
    for (const [scale, src] of Object.entries(files)) {
      const name = scale === '2x' ? `${id}.webp` : `${id}.${scale}.webp`;
      const dst = path.join(OUT, name);
      const h = sha(src);
      if (fs.existsSync(dst) && sha(dst) === h) same++;
      else {
        fs.mkdirSync(OUT, { recursive: true });
        fs.copyFileSync(src, dst);
        wrote++;
      }
      entry.files[scale] = { file: `public/icons/items/${name}`, sha1: h };
    }
    made[pic.group][id] = entry;
  }
  for (const [g, m] of Object.entries(made)) {
    const file = path.join(MADE, `${g}.json`);
    const sorted = Object.fromEntries(Object.entries(m).filter(([id]) => PICKED[id]).sort(([a], [b]) => a.localeCompare(b)));
    if (!Object.keys(sorted).length && !fs.existsSync(file)) continue;
    const text = json(sorted);
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) writeAtomic(file, text);
  }
  const picked = new Set(Object.keys(PICKED).flatMap((id) => [`${id}.webp`, `${id}.1x.webp`]));
  const extra = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith('.webp') && !picked.has(f)) : [];
  console.log(`picks: ${Object.keys(PICKED).length} pictures of ${pictures.length}, ${wrote} files written, ${same} already so`);
  if (stale.length) console.log(`  painted from older words than desc/ has now (paint them again?): ${stale.join(' ')}`);
  if (extra.length) console.log(`  in public/icons/items/ with no pick (left there): ${extra.join(' ')}`);
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
} else {
  if (PULL) pull(RUN);
  if (GEN) await gen();
  apply();
}
