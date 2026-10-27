// Recorded sounds from ElevenLabs: effects, ambience loops and voice lines, by the list in
// tools/audio/list.mjs. Writes public/audio/<id>.<n>.m4a (take n of the id), the game's manifest
// src/audio/files.ts and public/audio/CREDITS.md.
//
//   node tools/ai-audio.mjs --dry [id…]          what would be generated, and the credits it would take
//   node tools/ai-audio.mjs --budget 6000 [id…]  generate it, stopping before this month's usage passes 6000
//   node tools/ai-audio.mjs [id…]                only process again what's kept, and rewrite the manifest
//     id…       just these ids, or those under a prefix ending in '.' (combat. voice.paladin.)
//     --redo    make the chosen ids' takes again, though they're made (needs ids)
//     --prune   delete files in public/audio/ that no take in the list makes any more, and those
//               made.json has no record of (they couldn't be credited)
//
// It can be stopped and run again: a take is asked for once. tools/audio/made.json (committed) says
// what each file in public/audio/ was made from (the prompt or line too, for its credit), so another
// checkout doesn't pay for it again; a take whose entry has changed since plays on, credited as it
// was made, until --budget makes it again;
// audio-src/ (AUDIO_SRC, not committed) keeps ElevenLabs' raw output, to process again for free, and
// the state: each raw take, and the credits spent this month. The API key is in the macOS keychain
// (service elevenlabs-api-key), or ELEVENLABS_API_KEY.
//
// Processing (tools/audio/dsp.mjs): a DC blocker; effects and lines folded to mono, their silence
// trimmed and their ends faded; loudness to the kind's target (effects -16 LUFS short-term, lines -18,
// ambience -24 integrated) under a -1 dBFS ceiling; an ambience crossfaded into a seamless loop, its
// loop points recorded. Then AAC in .m4a: 64 kbps mono, 96 kbps stereo.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RATE, dcBlock, deinterleave, fade, interleave, loopBody, normalize, normalizeLoop, onset, padLoop, toMono, trimSilence } from './audio/dsp.mjs';

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
};

const args = process.argv.slice(2);
const FLAGS = ['dry', 'budget', 'redo', 'prune'];
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
const filters = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--budget');
if (BUDGET !== undefined && !(BUDGET >= 0)) fail(`--budget ${opt('budget')}: a number of credits`);
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the list

const { default: LIST_ENTRIES, SPEAKERS = {} } = await import(pathToFileURL(LIST).href);
/** the game's ids, to check the list against: Node strips the types off sounds.ts itself */
const sounds = await import(pathToFileURL(path.join(ROOT, 'src/audio/sounds.ts')).href).catch((e) => {
  console.warn(`(the list's ids go unchecked: ${e.message})`);
  return null;
});

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
    if (e.variants !== undefined && !(Number.isInteger(e.variants) && e.variants >= 1)) problems.push(`${where}: variants ${e.variants}`);
    if (e.kind === 'voice') {
      if (!e.text) problems.push(`${where}: a voice line needs its text`);
      if (!e.id.startsWith('voice.') || e.id.split('.').length !== 3) problems.push(`${where}: a voice line is voice.<speaker>.<line>`);
      if (!SPEAKERS[speakerOf(e)]) problems.push(`${where}: no speaker ${speakerOf(e)} in SPEAKERS`);
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
  return list;
}

function speakerOf(e) {
  return e.voice ?? e.id.split('.')[1];
}

/** what's asked of ElevenLabs for take n, from the list alone: when it changes, the take is made again */
function request(e, n) {
  const k = KINDS[e.kind];
  if (e.kind === 'voice') {
    const sp = SPEAKERS[speakerOf(e)];
    return { kind: 'voice', text: e.text, voice: sp.voice, settings: { ...sp.settings, ...e.settings }, lang: sp.lang ?? 'zh', model: e.model ?? sp.model, n };
  }
  return { kind: e.kind, prompt: e.prompt, duration: e.duration ?? k.duration, influence: e.influence ?? k.influence, model: e.model, n };
}

/** how take n is processed: when it changes, the raw take is processed again (free) */
function processing(e, key) {
  const k = KINDS[e.kind];
  return { v: PROC_VERSION, key, ...k, lufs: e.lufs ?? k.lufs, crossfade: e.crossfade ?? k.crossfade };
}

function takesOf(e) {
  return Array.from({ length: e.variants ?? 1 }, (_, i) => {
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

/** raw take to public/audio/<file>: what's in it, for made.json */
function processTake(t, raw) {
  const k = KINDS[t.e.kind];
  const p = processing(t.e, t.key);
  let chs = dcBlock(decode(raw, 2));
  let loop;
  let level;
  if (t.e.kind === 'loop') {
    // every take of an id loops at the same points: as long as the duration asked for
    if (t.req.duration !== 'auto') chs = chs.map((c) => c.subarray(0, Math.round(t.req.duration * RATE)));
    level = normalizeLoop(loopBody(chs, p), { lufs: p.lufs, how: k.how, maxLimit: k.maxLimit });
    const made = padLoop(level.chs, p);
    chs = made.chs;
    loop = { start: +(made.start / RATE).toFixed(6), end: +(made.end / RATE).toFixed(6) };
  } else {
    chs = trimSilence(k.channels === 1 ? toMono(chs) : chs, k.trim);
    if (!chs) throw new Error(`${t.name}: the take is silent`);
    level = normalize(chs, { lufs: p.lufs, how: k.how, maxLimit: k.maxLimit });
    chs = fade(level.chs, k.fadeIn, k.trim.post);
  }
  fs.mkdirSync(TMP, { recursive: true });
  const pcm = path.join(TMP, `${t.name}.f32`);
  const tmp = path.join(TMP, t.file);
  fs.writeFileSync(pcm, interleave(chs));
  // the free tier's terms: what's published names elevenlabs.io
  const tags = ['-metadata', `title=${t.name} (elevenlabs.io)`, '-metadata', 'comment=Generated with ElevenLabs, elevenlabs.io'];
  ffmpeg(['-y', '-f', 'f32le', '-ar', String(RATE), '-ac', String(chs.length), '-i', pcm, '-c:a', encoder(), '-b:a', `${k.kbps}k`, '-map_metadata', '-1', ...tags, '-movflags', '+faststart', tmp]);
  // read it back as a browser would (the edit list drops the encoder's priming): same length, same place
  const back = decode(tmp, chs.length);
  const extra = back[0].length - chs[0].length;
  if (extra < 0 || extra > 4096) throw new Error(`${t.name}: encoded to ${back[0].length} frames from ${chs[0].length}`);
  // (a few ms of slack for the codec's smearing: the priming left in would be 44 ms)
  if (!loop && Math.abs(onset(back) - onset(chs)) > RATE / 200) throw new Error(`${t.name}: the encoded file starts ${onset(back) - onset(chs)} frames off`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.renameSync(tmp, path.join(OUT, t.file));
  fs.rmSync(pcm);
  const secs = +(chs[0].length / RATE).toFixed(3);
  const round = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
  // short of its loudness only when limited by all the kind allows (dsp.mjs normalize)
  const over = (x, min) => (x >= min ? round(x) : undefined);
  return { secs, lufs: round(level.lufs), peak: round(level.peak), limited: over(level.limited, 0.05), short: over(level.short, 0.25), loop, encoder: encoder() };
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

const KIND_NAME = { sfx: '音效', loop: '环境声（循环）', voice: '配音' };
const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * Every recording in public/audio/, as made.json says it was made: they all ship, so each is credited,
 * whatever the list asks now (the list's takes first, in its order). One made.json has no record of
 * can't be, and the run names it for --prune.
 */
function credits(list, made) {
  const files = shipped();
  const listed = list.flatMap(takesOf).map((t) => t.file).filter((f) => files.includes(f));
  const rows = [];
  for (const f of [...listed, ...files.filter((f) => !listed.includes(f))]) {
    const m = made[f.replace(/\.m4a$/, '')];
    if (!m) continue;
    const what = m.kind === 'voice' ? `「${m.text}」` : m.prompt;
    rows.push(`| \`${f}\` | ${KIND_NAME[m.kind]} | ${cell(what ?? '?')} | ${m.model ?? '?'} | ${m.voice ?? '—'} | ${m.date ?? '?'} |`);
  }
  return `# 声音来源

**音效与配音由 ElevenLabs 生成**（[elevenlabs.io](https://elevenlabs.io)）：音效和环境声用它的文字生成音效（Sound Effects），配音用文字转语音（Text to Speech）和它的预置音色。账号是免费档：按 ElevenLabs 的条款，免费档生成的内容不能商用，发布时要注明 elevenlabs.io。每个文件的元数据里也写着 elevenlabs.io。

这些文件由 \`tools/ai-audio.mjs\` 按 \`tools/audio/list.mjs\` 生成：ElevenLabs 的原始输出留在 \`audio-src/\`（不入库），再用 ffmpeg 和 \`tools/audio/dsp.mjs\` 后期处理（去掉首尾静音、响度归一，环境声做成无缝循环）后编码成 AAC（.m4a）。没有录音的声音仍由代码实时合成（\`src/audio/sfx.ts\`），音乐是代码现场作曲的（\`src/audio/score.ts\`）。

本文件由 \`tools/ai-audio.mjs\` 生成，不要手改。\`public/audio/\` 里的每个录音都在下表，提示词或台词是生成它时用的那一版。

| 文件 | 类型 | 提示词或台词 | 模型 | 音色 | 生成于 |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

// ---- the run

const list = validate(LIST_ENTRIES);
const made = readJson(MADE, {});
// a record from before made.json kept what was asked: the list's, where it still asks for that take
for (const t of list.flatMap(takesOf)) {
  const m = made[t.name];
  if (m?.key === t.key && m.prompt === undefined && m.text === undefined) Object.assign(m, askedFor(t.req));
}
const state = readJson(STATE, { takes: {}, period: null });
const rawOf = (t) => {
  const s = state.takes[t.name];
  return s?.key === t.key && s.raw && fs.existsSync(path.join(SRC, s.raw)) ? path.join(SRC, s.raw) : null;
};

const toMake = [];
const toProcess = [];
const cantProcess = [];
let upToDate = 0;
for (const e of list.filter(chosen)) {
  for (const t of takesOf(e)) {
    const m = made[t.name];
    const out = fs.existsSync(path.join(OUT, t.file));
    if (REDO) toMake.push(t);
    else if (m?.key === t.key && out && m.proc === t.proc) upToDate++;
    else if (rawOf(t)) toProcess.push(t);
    else if (m?.key === t.key && out) cantProcess.push(t);
    else toMake.push(t);
  }
}
if (filters.length && !list.some(chosen)) fail(`no id in the list matches ${filters.join(' ')}`);
for (const t of cantProcess) console.warn(`${t.name}: processed by an older recipe, and its raw take isn't in ${path.relative(ROOT, RAW)} to process again`);

let sub = null;
// the paid API only when it's to be used (or for --dry): processing again works offline
if ((toMake.length && BUDGET !== undefined) || DRY) {
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
    credits: gen.cost,
    // the local day (sv's dates are YYYY-MM-DD)
    date: new Date(gen.at ?? Date.now()).toLocaleDateString('sv'),
    ...info,
  };
  saveMade();
  const m = made[t.name];
  const notes = [m.limited && `limited ${m.limited} dB`, m.short && `${m.short} dB short of ${processing(t.e, t.key).lufs}`, m.loop && `loop ${m.loop.start}–${m.loop.end} s`].filter(Boolean);
  console.log(`  ${t.name}: ${m.secs} s, ${m.lufs} LUFS, peak ${m.peak} dBFS${notes.map((n) => `, ${n}`).join('')}`);
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
    processOne(t, rawOf(t), state.takes[t.name]);
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
  console.log(`stale: ${t.name} was made from what its entry asked before: it plays on, credited as made, until --budget makes it again`);
}

const ids = writeManifest(list, made);
console.log(`src/audio/files.ts: ${ids} ids with recordings; public/audio/CREDITS.md`);
process.exit(errors ? 1 : 0);
