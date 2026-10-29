// Recorded sounds from ElevenLabs: effects, ambience loops and voice lines, by the list in
// tools/audio/list.mjs; and the areas' music, made with ACE-Step 1.5 on a GPU machine
// (tools/audio/acestep.py), which this only processes. Writes public/audio/<id>.<n>.m4a (take n of
// the id), the game's manifest src/audio/files.ts and public/audio/CREDITS.md.
//
//   node tools/ai-audio.mjs --dry [id…]          what would be generated, and the credits it would take
//   node tools/ai-audio.mjs --budget 6000 [id…]  generate it, stopping before this month's usage passes 6000
//   node tools/ai-audio.mjs [id…]                only process again what's kept, and rewrite the manifest
//   node tools/ai-audio.mjs --voices             the voices a speaker may have (GET /v1/voices): each one's
//                                                labels, description, and the models it's verified to read Mandarin with
//     id…       just these ids, or those under a prefix ending in '.' (combat. voice.paladin. music.)
//     --redo    make the chosen ids' takes again, though they're made (needs ids); music is
//               processed again from its raw take
//     --prune   delete files in public/audio/ that no take in the list makes any more, and those
//               made.json has no record of (they couldn't be credited)
//     --jobs f  write the music takes there's no raw take of as a jobs file for tools/audio/acestep.py
//
// It can be stopped and run again: a take is asked for once. tools/audio/made.json (committed) says
// what each file in public/audio/ was made from (the prompt or line too, for its credit), so another
// checkout doesn't pay for it again; a take whose entry has changed since plays on, credited as it
// was made, until --budget makes it again (music: until its new take is in audio-src/acestep/);
// audio-src/ (AUDIO_SRC, not committed) keeps ElevenLabs' raw output, to process again for free, and
// the state: each raw take, and the credits spent this month. The API key is in the macOS keychain
// (service elevenlabs-api-key), or ELEVENLABS_API_KEY.
//
// Music never calls ElevenLabs and costs no credits. A take's raw output is the one under
// audio-src/acestep/ whose sidecar records what the list asks for (tools/audio/music.mjs), whatever
// it's called; one there's none of is reported, to generate on a GPU machine, and the run goes on.
// made.json keeps a hash of the raw take it was processed from, so another one found in its place
// (made alike, but on another machine, say) is processed again.
//
// Processing (tools/audio/dsp.mjs): a DC blocker; effects and lines folded to mono, their silence
// trimmed and their ends faded; loudness to the kind's target (effects -16 LUFS short-term, lines -18,
// ambience -24 integrated, music -18 integrated) under a -1 dBFS ceiling (music -1.5); an ambience
// crossfaded into a seamless loop, its loop points recorded; music kept stereo, the model's silence
// cut off its end, its loudest swells ridden down (dsp.mjs ride), a short fade in and a 3 s fade out, no loop points (Stream loops the file, or
// plays the next). Then AAC in .m4a: 64 kbps mono, 96 kbps stereo, music 128 kbps; the music's file
// read back, its true peak under -1 dBFS, or limited lower and encoded again.
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RATE, ride, dcBlock, deinterleave, fade, interleave, loopBody, normalize, normalizeLoop, onset, padLoop, peak, toMono, trimSilence } from './audio/dsp.mjs';
import { describeMusic, findRaw, jobsFor, musicModel, musicRequest, sidecars, validateMusic } from './audio/music.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = path.join(ROOT, 'tools/audio/list.mjs');
const MADE = path.join(ROOT, 'tools/audio/made.json');
const OUT = path.join(ROOT, 'public/audio');
const FILES_TS = path.join(ROOT, 'src/audio/files.ts');
const CREDITS = path.join(OUT, 'CREDITS.md');
const SRC = path.resolve(process.env.AUDIO_SRC ?? path.join(ROOT, 'audio-src'));
const RAW = path.join(SRC, 'raw');
const STATE = path.join(SRC, 'state.json');
const TMP = path.join(SRC, 'tmp');
/** the music's raw takes, each with its sidecar (tools/audio/acestep.py), in folders of any name */
const ACESTEP = path.join(SRC, 'acestep');

/** credits a second of sound effect, as measured on the free tier (the character-cost header) */
const SFX_RATE = 10;
/** what a take of 'auto' duration is reckoned at, before it's made */
const AUTO_SECS = 4;
/** the longest it can come out: what --budget reckons it at, so that one can't overshoot by 260 credits */
const AUTO_MAX = 30;
/** the sound-effect model: the newer of ElevenLabs' two, at the same price */
const SFX_MODEL = 'eleven_text_to_sound_v3';
/**
 * The speech models in order of preference for Mandarin, the first one /v1/models offers (reads zh,
 * no alpha access) being used: v4 is ElevenLabs' newest and most expressive; v3 needs more prompt
 * work; multilingual v2 is the long-standing one.
 */
const TTS_MODELS = ['eleven_v4', 'eleven_v3', 'eleven_multilingual_v2'];
/** WAV at 48 kHz (free-tier accounts get it; 44.1 kHz PCM is Pro), MP3 if it's refused */
const FORMATS = ['wav_48000', 'mp3_44100_128'];
/** what changes how a raw take is processed: bump it to process every take again */
const PROC_VERSION = 2;

/** per kind: the defaults of the request, and how it's processed */
const KINDS = {
  sfx: { duration: 1, influence: 0.5, channels: 1, kbps: 64, lufs: -16, how: 'short', maxLimit: 6, trim: { lead: -40, tail: -50, pre: 0.005, post: 0.05 }, fadeIn: 0.002 },
  voice: { channels: 1, kbps: 64, lufs: -18, how: 'integrated', maxLimit: 3, trim: { lead: -45, tail: -50, pre: 0.03, post: 0.12 }, fadeIn: 0.01 },
  // a bed under everything, limited further: a campfire's odd loud pop stood 34 dB over its loudness
  loop: { duration: 20, influence: 0.3, channels: 2, kbps: 96, lufs: -24, how: 'integrated', maxLimit: 14, crossfade: 2, pad: 0.25 },
  // ACE-Step's takes stop dead 5 to 12 s short of the duration asked for, with a click or two in the
  // quiet after: cut at the last sound 50 dB under the peak, then faded out, as the track gives way
  // to its next take or to itself; they start at once, so the fade in only spares a click. Their
  // level in the mix is the entry's gain (Stream), so they're normalized like the voice. The codec
  // rings over what it's given: limited at -1 dBFS, music.town.2 came out of AAC at -0.9 true peak,
  // so it's limited at -1.5 and the file read back held under -1 (truePeak), or limited lower again
  music: { channels: 2, kbps: 128, lufs: -18, how: 'integrated', maxLimit: 3, ceiling: -1.5, truePeak: -1, trim: { lead: null, tail: -50, post: 0.1 }, fadeIn: 0.05, fadeOut: 3, ride: { over: 3, ratio: 3, ease: 2 } },
};

const args = process.argv.slice(2);
const FLAGS = ['dry', 'budget', 'redo', 'prune', 'jobs', 'voices'];
/** the flags followed by a value */
const VALUED = ['--budget', '--jobs'];
for (const a of args.filter((a) => a.startsWith('--'))) if (!FLAGS.includes(a.slice(2))) fail(`${a}? The flags are ${FLAGS.map((f) => `--${f}`).join(' ')}`);
const flag = (k) => args.includes(`--${k}`);
const opt = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY = flag('dry');
const REDO = flag('redo');
const PRUNE = flag('prune');
const BUDGET = opt('budget') === undefined ? undefined : Number(opt('budget'));
const JOBS = opt('jobs');
const filters = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
if (BUDGET !== undefined && !(BUDGET >= 0)) fail(`--budget ${opt('budget')}: a number of credits`);
if (flag('jobs') && (!JOBS || JOBS.startsWith('--'))) fail('--jobs <file>: where to write the jobs for tools/audio/acestep.py');
if (REDO && !filters.length) fail('--redo makes the chosen ids again: name them');

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
const hash = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);
/** a file's content, as hash names it */
const fileHash = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the list

const { default: LIST_ENTRIES, SPEAKERS = {}, HEROES = [] } = await import(pathToFileURL(LIST).href);
/** the game's ids, to check the list against: Node strips the types off sounds.ts itself */
const sounds = await import(pathToFileURL(path.join(ROOT, 'src/audio/sounds.ts')).href).catch((e) => {
  console.warn(`(the list's ids go unchecked: ${e.message})`);
  return null;
});
/** the heroes, whose lines are the moments in HERO_LINES (sounds.ts); any other speaker's are their own */
const heroes = await import(pathToFileURL(path.join(ROOT, 'src/data/classes.ts')).href).then(
  (m) => Object.keys(m.CLASSES),
  () => [],
);

function validate(list) {
  const problems = [];
  const seen = new Set();
  for (const e of list) {
    const where = `list: ${e.id ?? JSON.stringify(e)}`;
    if (typeof e.id !== 'string' || !/^[a-z]+(\.[a-z0-9_]+)+$/.test(e.id)) problems.push(`${where}: id is not category.name`);
    if (seen.has(e.id)) problems.push(`${where}: listed twice`);
    seen.add(e.id);
    if (!KINDS[e.kind]) {
      problems.push(`${where}: kind ${e.kind} is not ${Object.keys(KINDS).join(', ')}`);
      continue;
    }
    if (e.kind === 'music') {
      problems.push(...validateMusic(e));
      if (sounds && !sounds.AREA_FILES.includes(e.id)) console.warn(`${where}: no area plays it yet (src/audio/sounds.ts)`);
      continue;
    }
    if (e.variants !== undefined && !(Number.isInteger(e.variants) && e.variants >= 1)) problems.push(`${where}: variants ${e.variants}`);
    if (e.kind === 'voice') {
      // its text, or its texts: one take each
      if (e.texts !== undefined) {
        if (e.text !== undefined || e.variants !== undefined) problems.push(`${where}: texts are its takes: no text or variants beside them`);
        if (!Array.isArray(e.texts) || !e.texts.length || !e.texts.every((t) => typeof t === 'string' && t.trim())) problems.push(`${where}: texts ${JSON.stringify(e.texts)}`);
        else if (new Set(e.texts).size !== e.texts.length) problems.push(`${where}: a text said twice among its takes`);
      } else if (!e.text) problems.push(`${where}: a voice line needs its text`);
      if (!e.id.startsWith('voice.') || e.id.split('.').length !== 3) problems.push(`${where}: a voice line is voice.<speaker>.<line>`);
      if (!SPEAKERS[speakerOf(e)]) problems.push(`${where}: no speaker ${speakerOf(e)} in SPEAKERS`);
      const [, who, line] = e.id.split('.');
      if (sounds?.HERO_LINES && heroes.includes(who) && !sounds.HERO_LINES.includes(line)) problems.push(`${where}: ${line} is not a moment in HERO_LINES (src/audio/sounds.ts)`);
      continue;
    }
    if (!e.prompt) problems.push(`${where}: needs a prompt`);
    const d = e.duration ?? KINDS[e.kind].duration;
    if (d !== 'auto' && !(d >= 0.5 && d <= 30)) problems.push(`${where}: duration ${d} is not 0.5 to 30 s or 'auto'`);
    if (e.kind === 'loop' && !e.id.startsWith('amb.')) problems.push(`${where}: a loop is an area's ambience, amb.*`);
    if (sounds && e.kind === 'sfx' && !(e.id in sounds.SOUNDS)) problems.push(`${where}: not a sound id in src/audio/sounds.ts`);
    if (sounds && e.kind === 'loop' && !sounds.AREA_FILES.includes(e.id)) console.warn(`${where}: no area plays it yet (src/audio/sounds.ts)`);
  }
  if (problems.length) fail(problems.join('\n'));
  // a hero who speaks says something at every moment the game has a line for
  for (const who of heroes.filter((h) => list.some((e) => e.id.startsWith(`voice.${h}.`)))) {
    const missing = (sounds?.HERO_LINES ?? []).filter((line) => !seen.has(`voice.${who}.${line}`));
    if (missing.length) console.warn(`list: ${who} has no line for ${missing.join(', ')}`);
  }
  return list;
}

function speakerOf(e) {
  return e.voice ?? e.id.split('.')[1];
}

/**
 * what's asked of ElevenLabs for take n, from the list alone: when it changes, the take is made
 * again. A music take's is what ACE-Step was asked: it picks another raw take
 */
function request(e, n) {
  const k = KINDS[e.kind];
  if (e.kind === 'music') return musicRequest(e, n);
  if (e.kind === 'voice') {
    const sp = SPEAKERS[speakerOf(e)];
    // (take n of a line with texts says the nth: the same request as a line of that text alone)
    return { kind: 'voice', text: e.texts ? e.texts[n - 1] : e.text, voice: sp.voice, settings: { ...sp.settings, ...e.settings }, lang: sp.lang ?? 'zh', model: e.model ?? sp.model, n };
  }
  return { kind: e.kind, prompt: e.prompt, duration: e.duration ?? k.duration, influence: e.influence ?? k.influence, model: e.model, n };
}

/** how take n is processed: when it changes, the raw take is processed again (free) */
function processing(e, key) {
  const k = KINDS[e.kind];
  return { v: PROC_VERSION, key, ...k, lufs: e.lufs ?? k.lufs, crossfade: e.crossfade ?? k.crossfade };
}

function takesOf(e) {
  return Array.from({ length: e.kind === 'music' ? e.takes.length : (e.texts?.length ?? e.variants ?? 1) }, (_, i) => {
    const n = i + 1;
    const req = request(e, n);
    const key = hash(req);
    return { e, n, name: `${e.id}.${n}`, file: `${e.id}.${n}.m4a`, req, key, proc: hash(processing(e, key)) };
  });
}

const chosen = (e) => !filters.length || filters.some((f) => (f.endsWith('.') ? e.id.startsWith(f) : e.id === f));

// ---- ElevenLabs

class ApiError extends Error {
  constructor(status, body) {
    let msg = body.slice(0, 400);
    try {
      const d = JSON.parse(body).detail;
      msg = typeof d === 'string' ? d : (d?.message ?? JSON.stringify(d));
    } catch {}
    super(`ElevenLabs ${status}: ${msg}`);
    this.status = status;
  }
}

let key;
/** read once, never printed or written down */
function apiKey() {
  key ??= process.env.ELEVENLABS_API_KEY || execFileSync('security', ['find-generic-password', '-s', 'elevenlabs-api-key', '-w'], { encoding: 'utf8' }).trim();
  return key;
}

async function api(pathname, { method = 'GET', query = {}, body } = {}) {
  const url = new URL(pathname, 'https://api.elevenlabs.io');
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { 'xi-api-key': apiKey(), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body && JSON.stringify(body),
    });
    if (res.ok) return res;
    const text = await res.text();
    // busy (free accounts get few requests at once) or a hiccup: wait and try again
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new ApiError(res.status, text);
  }
}

async function usage() {
  const s = await (await api('/v1/user/subscription')).json();
  return { used: s.character_count, limit: s.character_limit, reset: s.next_character_count_reset_unix, tier: s.tier };
}

/** the models and the voices, fetched when a voice line is to be made */
let speech;
async function speechInfo() {
  if (speech) return speech;
  const models = new Map((await (await api('/v1/models')).json()).map((m) => [m.model_id, m]));
  const zh = (id) => {
    const m = models.get(id);
    return m && m.can_do_text_to_speech && !m.requires_alpha_access && m.languages?.some((l) => l.language_id === 'zh');
  };
  const model = TTS_MODELS.find(zh);
  if (!model) throw new Error(`none of ${TTS_MODELS.join(', ')} reads Mandarin any more (GET /v1/models)`);
  const voices = (await (await api('/v1/voices')).json()).voices;
  speech = { models, model, voices };
  return speech;
}

function voiceOf(voices, want) {
  const v = voices.find((v) => v.voice_id === want) ?? voices.find((v) => v.name.split(' - ')[0].trim().toLowerCase() === want.toLowerCase());
  if (!v) throw new Error(`no voice ${want} among GET /v1/voices: ${voices.map((v) => v.name.split(' - ')[0]).join(', ')}`);
  if (!v.verified_languages?.some((l) => l.language === 'zh')) console.warn(`  voice ${v.name} isn't verified for Mandarin`);
  return v;
}

/** what a take is reckoned to cost before it's made; `worst`, the most it can (an 'auto' duration at its longest) */
function estimate(t, worst = false) {
  if (t.req.kind === 'voice') {
    const rate = speech?.models.get(t.req.model ?? speech.model)?.model_rates?.character_cost_multiplier ?? 1;
    return Math.ceil([...t.req.text].length * rate);
  }
  return Math.ceil((t.req.duration === 'auto' ? (worst ? AUTO_MAX : AUTO_SECS) : t.req.duration) * SFX_RATE);
}

/** ask for the take: the audio, what it cost (the character-cost header), and what made it */
async function generate(t) {
  const r = t.req;
  let pathname;
  let body;
  const info = {};
  if (r.kind === 'voice') {
    const { models, model: auto, voices } = await speechInfo();
    const model = r.model ?? auto;
    const m = models.get(model);
    const voice = voiceOf(voices, r.voice);
    const settings = { ...r.settings };
    if (!m?.can_use_style) delete settings.style;
    if (!m?.can_use_speaker_boost) delete settings.use_speaker_boost;
    pathname = `/v1/text-to-speech/${voice.voice_id}`;
    body = { text: r.text, model_id: model, seed: parseInt(t.key.slice(0, 8), 16) };
    // pinned to Mandarin, as hanzi alone could pass for Japanese (multilingual v2 refuses a code)
    if (!model.startsWith('eleven_multilingual')) body.language_code = r.lang;
    if (Object.keys(settings).length) body.voice_settings = settings;
    Object.assign(info, { model, voice: voice.name.split(' - ')[0], voiceId: voice.voice_id });
  } else {
    pathname = '/v1/sound-generation';
    body = { text: r.prompt, model_id: r.model ?? SFX_MODEL, prompt_influence: r.influence };
    if (r.duration !== 'auto') body.duration_seconds = r.duration;
    if (r.kind === 'loop') body.loop = true;
    info.model = body.model_id;
  }
  for (const format of FORMATS) {
    let res;
    try {
      res = await api(pathname, { method: 'POST', query: { output_format: format }, body });
    } catch (e) {
      // a format the account may not have: the next one
      if (format !== FORMATS.at(-1) && [400, 403, 422].includes(e.status) && /format|tier|plan|subscri/i.test(e.message)) continue;
      throw e;
    }
    const type = res.headers.get('content-type') ?? '';
    const ext = type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : format.split('_')[0];
    const cost = Number(res.headers.get('character-cost'));
    return { data: Buffer.from(await res.arrayBuffer()), ext, format, cost: Number.isFinite(cost) && res.headers.has('character-cost') ? cost : estimate(t, true), requestId: res.headers.get('request-id') ?? undefined, ...info };
  }
}

// ---- processing

const ffmpeg = (a) => execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', ...a], { maxBuffer: 1 << 30 });
const decode = (file, channels) => deinterleave(ffmpeg(['-i', file, '-f', 'f32le', '-ac', String(channels), '-ar', String(RATE), 'pipe:1']), channels);
let aacEncoder;
/**
 * Apple's AAC encoder where there is one (macOS): cleaner at these rates than ffmpeg's own. Asked
 * when the first take is encoded, so that --dry needs no ffmpeg.
 */
const encoder = () => (aacEncoder ??= /\baac_at\b/.test(execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' })) ? 'aac_at' : 'aac');

/**
 * A file's true peak in dBFS, read back as a player would: its peak 4x oversampled (ITU-R BS.1770-4
 * Annex 2), resampled to 192 kHz as ffmpeg's ebur128 does for its true peak
 */
function truePeak(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-i', file, '-af', `aresample=${RATE * 4},astats=measure_perchannel=none:measure_overall=Peak_level`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const m = /Peak level dB: (-?inf|-?\d+(?:\.\d+)?)/.exec(r.stderr ?? '');
  if (r.status !== 0 || !m) throw new Error(`${file}: ffmpeg gave no true peak: ${(r.stderr ?? r.error?.message ?? '').slice(-300)}`);
  return m[1].endsWith('inf') ? -Infinity : Number(m[1]);
}

/** raw take to public/audio/<file>: what's in it, for made.json */
function processTake(t, raw) {
  const k = KINDS[t.e.kind];
  const p = processing(t.e, t.key);
  let chs = dcBlock(decode(raw, 2));
  let loop;
  let level;
  /** the music normalized under a lower ceiling, and let be limited that much more, so it keeps its loudness */
  let lower;
  if (t.e.kind === 'loop') {
    // every take of an id loops at the same points: as long as the duration asked for
    if (t.req.duration !== 'auto') chs = chs.map((c) => c.subarray(0, Math.round(t.req.duration * RATE)));
    level = normalizeLoop(loopBody(chs, p), { lufs: p.lufs, how: k.how, maxLimit: k.maxLimit });
    const made = padLoop(level.chs, p);
    chs = made.chs;
    loop = { start: +(made.start / RATE).toFixed(6), end: +(made.end / RATE).toFixed(6) };
  } else if (t.e.kind === 'music') {
    // faded before it's measured, so it ends at its loudness
    chs = trimSilence(chs, k.trim);
    if (!chs) throw new Error(`${t.name}: the take is silent`);
    // its loudest swells brought down, so it can sit under the fighting at the level of the music
    // composed in its place (tools/scenarios/sfx.mjs): the XL takes swelled 7 LU over their loudness
    const rode = ride(chs, k.ride);
    const faded = fade(rode.chs, k.fadeIn, k.fadeOut);
    lower = (ceiling) => normalize(faded, { lufs: p.lufs, how: k.how, ceiling, maxLimit: k.maxLimit + k.ceiling - ceiling });
    level = lower(k.ceiling);
    chs = level.chs;
  } else {
    chs = trimSilence(k.channels === 1 ? toMono(chs) : chs, k.trim);
    if (!chs) throw new Error(`${t.name}: the take is silent`);
    level = normalize(chs, { lufs: p.lufs, how: k.how, maxLimit: k.maxLimit });
    chs = fade(level.chs, k.fadeIn, k.trim.post);
  }
  fs.mkdirSync(TMP, { recursive: true });
  const pcm = path.join(TMP, `${t.name}.f32`);
  const tmp = path.join(TMP, t.file);
  // the free tier's terms: what's published names elevenlabs.io; the music names what made it
  const tags =
    t.e.kind === 'music'
      ? ['-metadata', `title=${t.name} (ACE-Step 1.5)`, '-metadata', `comment=Generated with ${musicModel(t.req)}, seed ${t.req.seed}: github.com/ACE-Step/ACE-Step-1.5`]
      : ['-metadata', `title=${t.name} (elevenlabs.io)`, '-metadata', 'comment=Generated with ElevenLabs, elevenlabs.io'];
  const encode = () => {
    fs.writeFileSync(pcm, interleave(chs));
    ffmpeg(['-y', '-f', 'f32le', '-ar', String(RATE), '-ac', String(chs.length), '-i', pcm, '-c:a', encoder(), '-b:a', `${k.kbps}k`, '-map_metadata', '-1', ...tags, '-movflags', '+faststart', tmp]);
  };
  encode();
  // the codec's overshoot is limited away, not turned down: under a ceiling that far below the PCM's
  // peak (which may be under the ceiling already: a click rang 2 dB over itself), and a tenth of a
  // dB more, as it doesn't come down dB for dB; encoded again
  let tp;
  if (k.truePeak !== undefined) {
    let ceiling = k.ceiling;
    for (let tries = 0; (tp = truePeak(tmp)) > k.truePeak; tries++) {
      if (tries === 3) throw new Error(`${t.name}: still ${tp.toFixed(2)} dBFS true peak once encoded, over ${k.truePeak}, limited at ${ceiling.toFixed(2)}`);
      ceiling = Math.min(ceiling, level.peak) - (tp - k.truePeak + 0.1);
      console.log(`  ${t.name}: ${tp.toFixed(2)} dBFS true peak once encoded: limited at ${ceiling.toFixed(2)} dBFS instead`);
      level = lower(ceiling);
      chs = level.chs;
      encode();
    }
  }
  // read it back as a browser would (the edit list drops the encoder's priming): same length, same place
  const back = decode(tmp, chs.length);
  const extra = back[0].length - chs[0].length;
  if (extra < 0 || extra > 4096) throw new Error(`${t.name}: encoded to ${back[0].length} frames from ${chs[0].length}`);
  // (a few ms of slack for the codec's smearing: the priming left in would be 44 ms). Where it starts
  // at five levels, the median: a priming left in moves every one alike, while the codec nudging a
  // syllable or a click across one level moves only that one (by a tenth of the peak alone, takes
  // that lined up sample for sample failed by 700 to 1200 frames)
  const pk = peak(chs);
  const offs = [0.05, 0.1, 0.2, 0.3, 0.5].map((k) => onset(back, pk * k) - onset(chs, pk * k)).sort((a, b) => a - b);
  const off = offs[2];
  if (!loop && Math.abs(off) > RATE / 200) throw new Error(`${t.name}: the encoded file starts ${off} frames off`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.renameSync(tmp, path.join(OUT, t.file));
  fs.rmSync(pcm);
  const secs = +(chs[0].length / RATE).toFixed(3);
  const round = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
  // short of its loudness only when limited by all the kind allows (dsp.mjs normalize)
  const over = (x, min) => (x >= min ? round(x) : undefined);
  // peak: the PCM's before it's encoded; truePeak: the file's, as it ships (music)
  return { secs, lufs: round(level.lufs), peak: round(level.peak), truePeak: tp === undefined ? undefined : +tp.toFixed(2), limited: over(level.limited, 0.05), short: over(level.short, 0.25), loop, encoder: encoder() };
}

// ---- the manifest and the credits

/**
 * The takes there are files for: made from what the list asks now, or from what it asked before the
 * entry changed (stale). A stale take plays on, credited as it was made, until --budget makes it again.
 */
function present(e, made) {
  return takesOf(e).filter((t) => made[t.name] && fs.existsSync(path.join(OUT, t.file)));
}
const isStale = (t, made) => made[t.name].key !== t.key;

/** the recordings in public/audio/ (<id>.<n>.m4a): what ships, each named as its record in made.json */
const shipped = () => (fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /\.\d+\.m4a$/.test(f)).sort() : []);
/** what a take was asked for, kept in its record for its credit */
const askedFor = (req) => (req.kind === 'voice' ? { text: req.text } : { prompt: req.prompt });

function writeManifest(list, made) {
  const lines = [];
  for (const e of list) {
    let takes = present(e, made);
    if (!takes.length) continue;
    const loop = made[takes[0].name].loop;
    if (loop) {
      // one id, one pair of loop points (src/audio/files.ts): a take that came out another length can't join
      const odd = takes.filter((t) => JSON.stringify(made[t.name].loop) !== JSON.stringify(loop));
      for (const t of odd) console.warn(`  ${t.name} loops at ${JSON.stringify(made[t.name].loop)}, not ${JSON.stringify(loop)} as ${takes[0].name}: left out`);
      takes = takes.filter((t) => !odd.includes(t));
    }
    const parts = [`files: [${takes.map((t) => `'${t.file}'`).join(', ')}]`];
    if (loop) parts.push(`loop: { start: ${loop.start}, end: ${loop.end} }`);
    if (e.gain !== undefined && e.gain !== 1) parts.push(`gain: ${e.gain}`);
    lines.push(`  '${e.id}': { ${parts.join(', ')} },`);
  }
  const src = fs.readFileSync(FILES_TS, 'utf8');
  const at = src.indexOf('export const FILES');
  if (at < 0) throw new Error(`${FILES_TS}: no "export const FILES" to replace`);
  const decl = 'export const FILES: Partial<Record<FileId, SoundFiles>> = ';
  writeAtomic(FILES_TS, `${src.slice(0, at)}${decl}${lines.length ? `{\n${lines.join('\n')}\n}` : '{}'};\n`);
  writeAtomic(CREDITS, credits(list, made));
  return lines.length;
}

const KIND_NAME = { sfx: '音效', loop: '环境声（循环）', voice: '配音', music: '音乐' };
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
/** a credit's prompt and model: a music take's job and seed with them, which made it as much as its caption */
const creditOf = (m) =>
  m.kind === 'music'
    ? { what: `${m.prompt}（${m.bpm} BPM，${m.scale}，每小节 ${m.time} 拍，${m.duration} 秒）`, model: `${m.model}，种子 ${m.seed}` }
    : { what: m.kind === 'voice' ? `「${m.text}」` : m.prompt, model: m.model };

/**
 * Every recording in public/audio/, as made.json says it was made: they all ship, so each is credited,
 * whatever the list asks now (the list's takes first, in its order). One made.json has no record of
 * can't be, and the run names it for --prune.
 */
function credits(list, made) {
  const files = shipped();
  const listed = list.flatMap(takesOf).map((t) => t.file).filter((f) => files.includes(f));
  const rows = [];
  let music = false;
  for (const f of [...listed, ...files.filter((f) => !listed.includes(f))]) {
    const m = made[f.replace(/\.m4a$/, '')];
    if (!m) continue;
    music ||= m.kind === 'music';
    const { what, model } = creditOf(m);
    rows.push(`| \`${f}\` | ${KIND_NAME[m.kind]} | ${cell(what ?? '?')} | ${cell(model ?? '?')} | ${m.voice ?? '—'} | ${m.date ?? '?'} |`);
  }
  const ace = music
    ? `\n**音乐由 ACE-Step 1.5 生成**（[github.com/ACE-Step/ACE-Step-1.5](https://github.com/ACE-Step/ACE-Step-1.5)）：代码和模型权重都是 MIT 许可，生成的音频可以自由使用。音乐是在我们自己的 GPU 机器上用 \`tools/audio/acestep.py\` 生成的，不经过 ElevenLabs；每首的提示词（caption）、速度、调性、拍号、模型和种子见下表，这些文件的元数据里写的是 ACE-Step。\n`
    : '';
  const score = music ? '还没有录音的区域，音乐由代码现场作曲' : '音乐是代码现场作曲的';
  return `# 声音来源

**音效与配音由 ElevenLabs 生成**（[elevenlabs.io](https://elevenlabs.io)）：音效和环境声用它的文字生成音效（Sound Effects），配音用文字转语音（Text to Speech）和它的预置音色。账号是免费档：按 ElevenLabs 的条款，免费档生成的内容不能商用，发布时要注明 elevenlabs.io。这些文件的元数据里也写着 elevenlabs.io。
${ace}
这些文件由 \`tools/ai-audio.mjs\` 按 \`tools/audio/list.mjs\` 生成：原始输出留在 \`audio-src/\`（不入库），再用 ffmpeg 和 \`tools/audio/dsp.mjs\` 后期处理（去掉首尾静音、响度归一，环境声做成无缝循环，音乐淡出）后编码成 AAC（.m4a）。没有录音的声音仍由代码实时合成（\`src/audio/sfx.ts\`），${score}（\`src/audio/score.ts\`）。

本文件由 \`tools/ai-audio.mjs\` 生成，不要手改。\`public/audio/\` 里的每个录音都在下表，提示词或台词是生成它时用的那一版。

| 文件 | 类型 | 提示词或台词 | 模型 | 音色 | 生成于 |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

// ---- the run

// the voices to give a speaker: no credits, nothing written
if (flag('voices')) {
  const { voices } = await (await api('/v1/voices')).json();
  for (const v of voices) {
    const zh = (v.verified_languages ?? []).filter((l) => l.language === 'zh').map((l) => [l.model_id, l.accent, l.locale].filter(Boolean).join(' '));
    const labels = Object.entries(v.labels ?? {}).map(([k, x]) => `${k} ${x}`).join(', ');
    console.log(`${v.name.split(' - ')[0].padEnd(10)} ${v.voice_id}  ${v.category}  ${labels}`);
    console.log(`  ${v.name}${v.description ? `: ${v.description}` : ''}`);
    console.log(`  Mandarin: ${zh.length ? zh.join('; ') : 'not verified'}`);
  }
  process.exit(0);
}

const list = validate(LIST_ENTRIES);
const made = readJson(MADE, {});
// a record from before made.json kept what was asked: the list's, where it still asks for that take
for (const t of list.flatMap(takesOf)) {
  const m = made[t.name];
  if (m?.key === t.key && m.prompt === undefined && m.text === undefined) Object.assign(m, askedFor(t.req));
}
const state = readJson(STATE, { takes: {}, period: null });
let cars;
/** a music take's raw output: the take under audio-src/acestep/ whose sidecar records its request */
const musicRaw = (t) => findRaw((cars ??= sidecars(ACESTEP)), t.req);
const rawOf = (t) => {
  if (t.e.kind === 'music') return musicRaw(t)?.wav ?? null;
  const s = state.takes[t.name];
  return s?.key === t.key && s.raw && fs.existsSync(path.join(SRC, s.raw)) ? path.join(SRC, s.raw) : null;
};
/**
 * A music take whose raw take here isn't the one its file was processed from: its sidecar says the
 * same, but it's another recording (made again on another GPU, say). None here says nothing: the
 * file stands, as made.json records it
 */
const rawChanged = (t, m) => {
  if (t.e.kind !== 'music') return false;
  const raw = musicRaw(t);
  return !!raw && fileHash(raw.wav) !== m.rawHash;
};

const toMake = [];
/** music takes there's no raw take of: made on a GPU machine (tools/audio/acestep.py), not here */
const toGenerate = [];
const toProcess = [];
const cantProcess = [];
let upToDate = 0;
for (const e of list.filter(chosen)) {
  for (const t of takesOf(e)) {
    const m = made[t.name];
    const out = fs.existsSync(path.join(OUT, t.file));
    const music = e.kind === 'music';
    if (REDO && !music) toMake.push(t);
    else if (!REDO && m?.key === t.key && out && m.proc === t.proc && !rawChanged(t, m)) upToDate++;
    else if (rawOf(t)) toProcess.push(t);
    else if (m?.key === t.key && out) cantProcess.push(t);
    else (music ? toGenerate : toMake).push(t);
  }
}
if (filters.length && !list.some(chosen)) fail(`no id in the list matches ${filters.join(' ')}`);
const GPU = 'to generate on a GPU machine with tools/audio/acestep.py';
/** a path as it's shown: from the checkout, where it's in it */
const shown = (p) => (path.relative(ROOT, p).startsWith('..') ? p : path.relative(ROOT, p));
for (const t of cantProcess) {
  // (only music gets here with --redo: the rest is made again)
  const why = made[t.name].proc === t.proc ? '--redo asks to process it again' : 'processed by an older recipe';
  console.warn(`${t.name}: ${why}, but its raw take isn't in ${shown(t.e.kind === 'music' ? ACESTEP : RAW)}: the file stays as it is`);
}
if (toGenerate.length) {
  console.log(`music ${GPU} (no sidecar under ${shown(ACESTEP)} records them; --jobs <file> writes their jobs):`);
  for (const t of toGenerate) console.log(`  music ${t.name.padEnd(30)} ${describeMusic(t.req).slice(0, 150)}`);
}
if (JOBS) {
  writeAtomic(JOBS, `${JSON.stringify(jobsFor(toGenerate), null, 2)}\n`);
  console.log(`${JOBS}: ${toGenerate.length} music takes for tools/audio/acestep.py`);
}

let sub = null;
// the paid API only when it's to be used (or for --dry, unless it's music alone): processing again works offline
const eleven = list.some((e) => chosen(e) && e.kind !== 'music');
if ((toMake.length && BUDGET !== undefined) || (DRY && eleven)) {
  try {
    sub = await usage();
    if (toMake.some((t) => t.req.kind === 'voice')) await speechInfo();
  } catch (e) {
    if (!DRY) fail(`can't reach ElevenLabs: ${e.message}`);
    console.log(`(can't reach ElevenLabs: ${e.message})`);
  }
}
/**
 * Credits used this month: the subscription's count lags a few minutes behind, so it's also what this
 * tool knows it spent since (state.period), whichever is more.
 */
const usedNow = () => Math.max(sub.used, state.period?.reset === sub.reset ? state.period.used : 0);
const resetDay = (s) => new Date(s.reset * 1000).toISOString().slice(0, 10);
if (sub) console.log(`ElevenLabs (${sub.tier}): ${usedNow()} of ${sub.limit} credits used this month, renews ${resetDay(sub)}`);

const describe = (t) => {
  const r = t.req;
  const what = r.kind === 'voice' ? `「${r.text}」 ${[...r.text].length} chars, ${r.voice}, ${r.model ?? speech?.model ?? TTS_MODELS[0]}` : `${r.duration === 'auto' ? 'auto' : `${r.duration} s`}  ${r.prompt.slice(0, 70)}`;
  const most = estimate(t, true) > estimate(t) ? ` (up to ${estimate(t, true)})` : '';
  return `  ${r.kind.padEnd(5)} ${t.name.padEnd(30)} ~${String(estimate(t)).padStart(4)}${most}  ${what}`;
};
const total = toMake.reduce((s, t) => s + estimate(t), 0);
/** if every 'auto' take came out at its longest: what --budget goes by */
const worst = toMake.reduce((s, t) => s + estimate(t, true), 0);
const upTo = worst > total ? `, up to ${worst}` : '';

if (DRY) {
  console.log(`to make: ${toMake.length} takes, ~${total} credits${upTo}`);
  for (const t of toMake) console.log(describe(t));
  if (toGenerate.length) console.log(`music ${GPU}: ${toGenerate.length}: ${toGenerate.map((t) => t.name).join(' ')}`);
  console.log(`to process again (free): ${toProcess.length}${toProcess.length ? `: ${toProcess.map((t) => t.name).join(' ')}` : ''}`);
  console.log(`up to date: ${upToDate}`);
  if (sub) {
    const after = usedNow() + total;
    const most = usedNow() + worst;
    console.log(`would leave ${after}${most > after ? ` (up to ${most})` : ''} of ${sub.limit} used${BUDGET !== undefined ? (most > BUDGET ? `: past --budget ${BUDGET}, it would stop before that` : `: within --budget ${BUDGET}`) : ''}`);
  }
  process.exit(0);
}

let spent = 0;
let errors = 0;
const saveState = () => writeAtomic(STATE, `${JSON.stringify(state, null, 2)}\n`);
const saveMade = () => writeAtomic(MADE, `${JSON.stringify(Object.fromEntries(Object.entries(made).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);

/**
 * What made a music take, from its sidecar: ACE-Step's models, the seed, the job and the sampler, the
 * raw take's hash, and when: the sidecar's time (tools/audio/acestep.py writes it), else its files'
 * (gen-reference.py's don't say), which is when they were made where they were copied keeping it
 * (scp -p, as the README's commands do), else when they were copied. It cost no credits
 */
function musicGen(t) {
  const { json, wav, meta } = musicRaw(t);
  const r = t.req;
  const at = Date.parse(meta.at);
  return {
    model: musicModel(r),
    at: Number.isFinite(at) ? at : Math.min(fs.statSync(json).mtimeMs, fs.statSync(wav).mtimeMs),
    extra: { seed: r.seed, bpm: r.bpm, scale: r.key, time: r.time, duration: r.duration, steps: r.steps, guidance: r.guidance, shift: r.shift, raw: path.relative(SRC, wav), rawHash: fileHash(wav) },
  };
}

/** process the raw take and record it in made.json; `gen` is what made it, or its record in the state */
function processOne(t, raw, gen) {
  const info = processTake(t, raw);
  made[t.name] = {
    key: t.key,
    proc: t.proc,
    kind: t.e.kind,
    model: gen.model,
    voice: gen.voice,
    ...askedFor(t.req),
    ...gen.extra,
    credits: gen.cost,
    // the local day (sv's dates are YYYY-MM-DD)
    date: new Date(gen.at ?? Date.now()).toLocaleDateString('sv'),
    ...info,
  };
  saveMade();
  const m = made[t.name];
  const notes = [m.limited && `limited ${m.limited} dB`, m.short && `${m.short} dB short of ${processing(t.e, t.key).lufs}`, m.loop && `loop ${m.loop.start}–${m.loop.end} s`].filter(Boolean);
  const tp = m.truePeak === undefined ? '' : ` (${m.truePeak} true peak once encoded)`;
  console.log(`  ${t.name}: ${m.secs} s, ${m.lufs} LUFS, peak ${m.peak} dBFS${tp}${notes.map((n) => `, ${n}`).join('')}`);
}

if (toMake.length && BUDGET === undefined) {
  console.log(`${toMake.length} takes to make (~${total} credits${upTo}): pass --budget <credits used this month to stop at>, or --dry to see them`);
} else if (toMake.length) {
  const before = usedNow();
  console.log(`making ${toMake.length} takes (~${total} credits${upTo}), up to --budget ${BUDGET}`);
  for (const t of toMake) {
    // the most it can cost: an 'auto' take may come out 30 s long
    const est = estimate(t, true);
    if (usedNow() + est > BUDGET) {
      console.log(`stopped: ${t.name} (up to ${est}) would take the month past ${BUDGET} (${usedNow()} used); ${toMake.length - toMake.indexOf(t)} takes left`);
      break;
    }
    console.log(describe(t));
    let gen;
    try {
      gen = await generate(t);
    } catch (e) {
      // what the account can't do stops the run; a refused request is that take's alone
      if ([401, 402, 403].includes(e.status)) fail(e.message);
      console.error(`  ${t.name}: ${e.message}`);
      errors++;
      continue;
    }
    const raw = path.join(RAW, `${t.name}.${gen.ext}`);
    writeAtomic(raw, gen.data);
    spent += gen.cost;
    state.period = { reset: sub.reset, used: usedNow() + gen.cost };
    const s = { key: t.key, raw: path.relative(SRC, raw), req: t.req, format: gen.format, model: gen.model, voice: gen.voice, voiceId: gen.voiceId, cost: gen.cost, requestId: gen.requestId, at: new Date().toISOString() };
    state.takes[t.name] = s;
    saveState();
    try {
      processOne(t, raw, s);
    } catch (e) {
      console.error(`  ${t.name}: ${e.message} (the raw take is kept: run again to process it)`);
      errors++;
    }
  }
  const after = await usage().catch(() => null);
  console.log(
    `credits: ${before} used before, ${usedNow()} after (${spent} spent, by the API's character-cost)${after ? `; the subscription says ${after.used} of ${after.limit}${after.used < usedNow() ? ', it lags a few minutes' : ''}` : ''}`,
  );
}

for (const t of toProcess) {
  try {
    console.log(`  process ${t.name}`);
    processOne(t, rawOf(t), t.e.kind === 'music' ? musicGen(t) : state.takes[t.name]);
  } catch (e) {
    console.error(`  ${t.name}: ${e.message}`);
    errors++;
  }
}

// what no take in the list makes any more (credited while it's there), and what made.json has no
// record of (which can't be)
const wanted = new Set(list.flatMap(takesOf).map((t) => t.file));
for (const f of shipped()) {
  const name = f.replace(/\.m4a$/, '');
  const why = !made[name] ? 'not made by this tool, so not credited' : !wanted.has(f) ? 'unused, credited while it ships' : null;
  if (!why) continue;
  if (PRUNE) {
    fs.rmSync(path.join(OUT, f));
    delete made[name];
  }
  console.log(`${PRUNE ? 'deleted' : `${why} (--prune deletes it)`}: public/audio/${f}`);
}
if (PRUNE) saveMade();
for (const t of list.flatMap((e) => present(e, made)).filter((t) => isStale(t, made))) {
  const until = t.e.kind === 'music' ? `its new take is generated (tools/audio/acestep.py) and put under ${shown(ACESTEP)}` : '--budget makes it again';
  console.log(`stale: ${t.name} was made from what its entry asked before: it plays on, credited as made, until ${until}`);
}

const ids = writeManifest(list, made);
console.log(`src/audio/files.ts: ${ids} ids with recordings; public/audio/CREDITS.md`);
// the townsfolk's lines come off the dialogue's review page, which says what each take says
if ([...toMake, ...toProcess].some((t) => t.e.kind === 'voice' && !HEROES.includes(speakerOf(t.e)) && made[t.name]?.key === t.key)) {
  console.log("the townsfolk's takes changed: node tools/dialogue-review.mjs marks them on tools/d2-names/DIALOGUE-zh.md");
}
process.exit(errors ? 1 : 0);
