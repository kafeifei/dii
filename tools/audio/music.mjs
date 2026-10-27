// The music takes of tools/audio/list.mjs (kind 'music'), for tools/ai-audio.mjs: made with ACE-Step
// 1.5 on a GPU machine (tools/audio/acestep.py), never asked of ElevenLabs. A take is named by what
// made it, the job ACE-Step was given (caption, bpm, key, time signature, duration), its seed, the
// DiT model, the LM and the sampler; its raw output is found by that among the sidecars the
// generator writes beside each take (audio-src/acestep/**/<name>.json), whatever the take is called.
import fs from 'node:fs';
import path from 'node:path';

/** a job's fields as the list names them, and as ACE-Step (so a sidecar) does: the list says prompt for its caption */
export const FIELDS = { prompt: 'caption', bpm: 'bpm', key: 'key', time: 'time', duration: 'duration', seed: 'seed', model: 'model', lm: 'lm', steps: 'steps', guidance: 'guidance', shift: 'shift' };
const JOB = Object.keys(FIELDS);
/** the sampler's, which the list may leave to the model's */
const SAMPLER = ['steps', 'guidance', 'shift'];

/**
 * How a model is sampled unless the list says otherwise, as both generators run it (tools/audio/
 * acestep.py, and audio-src/acestep/gen-reference.py, whose sidecars don't say): the turbo models are
 * distilled to 8 steps without guidance (ACE-Step's GenerationParams, acestep/inference.py:
 * inference_steps "8 for turbo, 32–100 for base model", guidance_scale "only support for non-turbo
 * model"); the others take 64 with guidance 7
 */
export const sampler = (model) => (/turbo/.test(String(model)) ? { steps: 8, guidance: 1, shift: 3 } : { steps: 64, guidance: 7, shift: 3 });

// what ACE-Step 1.5 takes (acestep/constants.py: BPM_MIN/MAX, DURATION_MIN/MAX,
// VALID_TIME_SIGNATURES, and VALID_KEYSCALES, a note, an accidental, major or minor; and
// GenerationParams in acestep/inference.py: a caption "< 512 characters")
const BPM = [30, 300];
const DURATION = [10, 600];
const TIMES = ['2', '3', '4', '6'];
const KEY = /^[A-G](#|b|♯|♭)? (major|minor)$/;
const CAPTION = 512;
/** what else an entry of this kind may say: its takes, and its level */
const OTHER = ['id', 'kind', 'takes', 'gain', 'lufs'];

/** what's wrong with a music entry, one line each */
export function validateMusic(e) {
  const problems = [];
  const where = `list: ${e.id}`;
  if (!/^music\.[a-z0-9_]+$/.test(e.id)) problems.push(`${where}: a music track is music.<name>`);
  for (const k of Object.keys(e)) if (!JOB.includes(k) && !OTHER.includes(k)) problems.push(`${where}: ${k} is not a field of a music entry (${[...JOB, ...OTHER].join(', ')})`);
  if (e.seed !== undefined) problems.push(`${where}: a seed is a take's (takes: [{ seed }])`);
  if (e.gain !== undefined && !(e.gain > 0)) problems.push(`${where}: gain ${e.gain}`);
  if (!Array.isArray(e.takes) || !e.takes.length) {
    problems.push(`${where}: needs its takes, each by its seed`);
    return problems;
  }
  const seen = new Set();
  e.takes.forEach((take, i) => {
    const at = `${where} take ${i + 1}`;
    for (const k of Object.keys(take)) if (!JOB.includes(k)) problems.push(`${at}: ${k} is not a field of a take (${JOB.join(', ')})`);
    const r = musicRequest(e, i + 1);
    if (typeof r.prompt !== 'string' || !r.prompt.trim()) problems.push(`${at}: needs a prompt (ACE-Step's caption)`);
    // characters as Python counts them, not UTF-16 units
    else if ([...r.prompt].length >= CAPTION) problems.push(`${at}: the prompt is ${[...r.prompt].length} characters: ACE-Step's caption is under ${CAPTION}`);
    if (!(r.bpm >= BPM[0] && r.bpm <= BPM[1])) problems.push(`${at}: bpm ${r.bpm} is not ${BPM.join(' to ')}`);
    if (!KEY.test(String(r.key))) problems.push(`${at}: key ${r.key} is not a note and major or minor ('D minor', 'F# major')`);
    if (!TIMES.includes(String(r.time))) problems.push(`${at}: time ${r.time} is not ${TIMES.join(', ')} beats in a bar`);
    if (!(r.duration >= DURATION[0] && r.duration <= DURATION[1])) problems.push(`${at}: duration ${r.duration} is not ${DURATION.join(' to ')} s`);
    if (!Number.isInteger(r.seed) || r.seed < 0) problems.push(`${at}: seed ${r.seed} is not a whole number`);
    for (const k of ['model', 'lm']) if (typeof r[k] !== 'string' || !r[k]) problems.push(`${at}: needs its ${k}`);
    if (!Number.isInteger(r.steps) || r.steps < 1) problems.push(`${at}: steps ${r.steps} is not a whole number of them`);
    for (const k of ['guidance', 'shift']) if (typeof r[k] !== 'number' || !(r[k] > 0)) problems.push(`${at}: ${k} ${r[k]} is not a number over 0`);
    const same = JSON.stringify(sidecarOf(r));
    if (seen.has(same)) problems.push(`${at}: the same take as an earlier one`);
    seen.add(same);
  });
  return problems;
}

/** take n of the entry (1-based), as the list asks for it: the take's own fields, else its entry's, else the model's sampler */
export function musicRequest(e, n) {
  const take = e.takes[n - 1];
  const r = { kind: 'music' };
  for (const f of JOB) r[f] = take[f] ?? e[f];
  const s = sampler(r.model);
  for (const f of SAMPLER) r[f] ??= s[f];
  r.n = n;
  return r;
}

/** the request in ACE-Step's terms, as a sidecar records it */
export function sidecarOf(req) {
  return Object.fromEntries(JOB.map((f) => [FIELDS[f], req[f]]));
}

/**
 * A sidecar records what made the request: every field the same (a number and its digits alike).
 * One that doesn't give the sampler's (gen-reference.py's) was sampled as its model is by default,
 * as that generator ran it.
 */
export const matches = (meta, req) => {
  const rec = { ...sampler(meta.model), ...meta };
  return JOB.every((f) => rec[FIELDS[f]] !== undefined && String(rec[FIELDS[f]]) === String(req[f]));
};

/**
 * Every take under `dir` (audio-src/acestep): each <name>.json sidecar with its <name>.wav beside it,
 * in path order, so that of two recording the same take the same one is found each time. A folder
 * linked in (the GPU machine's output, mounted or copied elsewhere) is walked like any other, once.
 */
export function sidecars(dir) {
  const out = [];
  const walked = new Set();
  const walk = (d) => {
    const real = fs.realpathSync(d);
    if (walked.has(real)) return;
    walked.add(real);
    for (const ent of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, ent.name);
      // a link's Dirent is the link's own: what it points at says whether it's a folder (none, if it's broken)
      if (ent.isDirectory() || (ent.isSymbolicLink() && fs.statSync(p, { throwIfNoEntry: false })?.isDirectory())) walk(p);
      else if (ent.name.endsWith('.json')) {
        const wav = p.replace(/\.json$/, '.wav');
        if (!fs.existsSync(wav)) continue;
        let meta;
        try {
          meta = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch {
          continue;
        }
        // a jobs file, or anything else that isn't one take's record
        if (meta && typeof meta === 'object' && !Array.isArray(meta)) out.push({ json: p, wav, meta });
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** the raw take the request was made as: the first sidecar that matches it, or null */
export const findRaw = (cars, req) => cars.find((c) => matches(c.meta, req)) ?? null;

/** what made it, for made.json, CREDITS.md and the file's metadata */
export const musicModel = (req) => `ACE-Step 1.5 ${req.model} + ${req.lm}`;

/** one line of what a take is: its model, seed, job, and sampler where it's not the model's */
export function describeMusic(req) {
  const s = sampler(req.model);
  const own = SAMPLER.some((f) => req[f] !== s[f]) ? `, ${req.steps} steps, guidance ${req.guidance}, shift ${req.shift}` : '';
  return `${req.model} + ${req.lm}, seed ${req.seed}, ${req.bpm} BPM, ${req.key}, ${req.time} beats, ${req.duration} s${own}: ${req.prompt}`;
}

/**
 * The jobs for tools/audio/acestep.py that make these takes ({ e, n } each): their entries of the
 * list, in its terms, with only those takes, each with its sampler as the list reckons it (so the
 * generator's own defaults don't decide what the take is named by)
 */
export function jobsFor(takes) {
  const byId = new Map();
  for (const { e, n } of takes) {
    if (!byId.has(e.id)) byId.set(e.id, { id: e.id, ...Object.fromEntries(JOB.filter((f) => e[f] !== undefined).map((f) => [f, e[f]])), takes: [] });
    const req = musicRequest(e, n);
    byId.get(e.id).takes.push({ ...e.takes[n - 1], ...Object.fromEntries(SAMPLER.map((f) => [f, req[f]])) });
  }
  return [...byId.values()];
}
