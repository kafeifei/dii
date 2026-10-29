// The audio pipeline's processing (tools/audio/dsp.mjs) and what it wrote: loudness reads as
// BS.1770 does (a full-scale 1 kHz tone is -3.01 LUFS in one channel, a mono file counting in both
// ears); normalizing lands on the target under the ceiling, limiting a spiky take no more than it
// may; silence is trimmed off both ends; a loop's end runs into its start without a jump, its padding
// repeating the body sample for sample; the manifest's loop points are those made.json recorded; and
// every recording in public/audio/ has a record in made.json and a credit in CREDITS.md naming what
// it was made from; the heroes' script (tools/audio/voice-lines.md) has the moments HERO_LINES names,
// and the list asks for its words. The music (tools/audio/music.mjs): an entry is checked against
// what ACE-Step takes; a take's raw output is the one whose sidecar records its request, sampler
// and all, whatever it's called and in whatever folder (linked in, too); and the tool itself, run
// on a list of its own in a scratch checkout: no ElevenLabs, a take it finds processed (stereo,
// trimmed, at its loudness, its true peak under -1 dBFS once encoded, named ACE-Step, no loop
// points, its gain in the manifest, credited with its seed, dated when it was made), one it doesn't
// reported to generate on a GPU machine and written as a job, without failing the run; another raw
// take in its place processed again; a take whose entry changed plays on, stale.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, dbOf, deinterleave, interleave, limit, loopBody, loudness, makeLoop, normalize, normalizeLoop, padLoop, peak, ride, trimSilence } from '../audio/dsp.mjs';
import { findRaw, jobsFor, matches, musicRequest, sidecarOf, sidecars, validateMusic } from '../audio/music.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** a seeded noise source, so a failure repeats */
function noise(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 31 - 1;
  };
}
const tone = (secs, hz, amp = 1) => Float32Array.from({ length: Math.round(secs * RATE) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));

export default async (load) => {
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  // BS.1770's reference: 0 dBFS at 1 kHz in one channel reads -3.01; mono counts as both ears
  const sine = tone(5, 997);
  const left = loudness([sine, new Float32Array(sine.length)], 'integrated');
  check(near(left, -3.01, 0.05), `a full-scale tone in one channel reads ${left.toFixed(2)} LUFS, not -3.01`);
  const mono = loudness([sine], 'integrated');
  check(near(mono, 0, 0.05), `a full-scale mono tone reads ${mono.toFixed(2)} LUFS, not 0 (both ears)`);
  const short = loudness([tone(0.3, 997, 0.5)], 'short');
  check(near(short, dbOf(0.5), 0.1), `a 0.3 s tone at -6 dBFS reads ${short.toFixed(2)} LUFS short-term (over its own length), not -6`);
  // the loudest 3 s, not the mean: a loud second after a quiet four
  const swell = Float32Array.from([...tone(4, 440, 0.01), ...tone(1, 440, 0.5)]);
  const st = loudness([swell], 'short');
  check(near(st, dbOf(0.5) + 10 * Math.log10(1 / 3) + 0.3, 1), `short-term ${st.toFixed(1)} LUFS for a loud last second`);
  // momentary, as a sound is heard: a 0.1 s tone a quarter of the window's energy, a long one at its level
  const blip = loudness([Float32Array.from([...tone(0.1, 997, 0.5), ...new Float32Array(RATE)])], 'momentary');
  check(near(blip, dbOf(0.5) + 10 * Math.log10(0.1 / 0.4), 0.1), `a 0.1 s tone at -6 dBFS reads ${blip.toFixed(2)} LUFS momentary, not -12`);
  const held = loudness([Float32Array.from([...tone(2, 997, 0.5), ...new Float32Array(RATE)])], 'momentary');
  check(near(held, dbOf(0.5), 0.1), `a 2 s tone at -6 dBFS reads ${held.toFixed(2)} LUFS momentary, not -6`);

  // to -16 under -1 dBFS: noise needs no limiting
  const rnd = noise(7);
  const hiss = Float32Array.from({ length: RATE }, () => rnd() * 0.05);
  const n1 = normalize([hiss], { lufs: -16, how: 'short' });
  check(near(loudness(n1.chs, 'short'), -16, 0.1) && n1.limited === 0, `noise normalized to ${loudness(n1.chs, 'short').toFixed(2)} LUFS, limited ${n1.limited}`);
  // a click on a quiet bed: limited by the most it may be, and left quieter than asked
  const spiky = Float32Array.from({ length: RATE / 2 }, (_, i) => (i === 1000 ? 0.9 : rnd() * 0.002));
  const n2 = normalize([spiky], { lufs: -16, how: 'short', maxLimit: 6 });
  check(dbOf(peak(n2.chs)) <= -0.99, `a limited take peaks at ${dbOf(peak(n2.chs)).toFixed(2)} dBFS, over -1`);
  check(n2.limited <= 6.01 && n2.limited >= 5.98 && n2.lufs < -16, `a click was limited ${n2.limited} dB (all of its 6) to ${n2.lufs} LUFS`);
  // a ping with a sharp attack: limiting it holds the ring down too, and one make-up pass stopped
  // short with the limit half used. It ends at the target, or limited by all it may be
  const rp = noise(3);
  const ping = Float32Array.from({ length: Math.round(0.3 * RATE) }, (_, i) => Math.sin(i * 0.3) * Math.exp(-i / (0.05 * RATE)) * 0.3 + (i < 40 ? rp() : 0));
  for (const lufs of [-16, -18, -20]) {
    const n3 = normalize([ping], { lufs, how: 'short', maxLimit: 6 });
    check(dbOf(peak(n3.chs)) <= -0.99 && (n3.short <= 0.05 || n3.limited >= 5.98), `a ping to ${lufs} LUFS: ${n3.short.toFixed(2)} dB short, limited ${n3.limited.toFixed(2)} of 6`);
  }
  const loud = limit([Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i / 7) * 2)], 0.5);
  check(peak(loud) <= 0.5 + 1e-6, `the limiter let ${peak(loud)} through a 0.5 ceiling`);

  // music ridden: 20 s quiet, 6 s 10 dB louder, 20 s quiet again. The rise comes down (by 2/3 of
  // what it's over the integrated loudness and 3 LU), the quiet passages stay as they were, and the
  // cut eases in and out rather than stepping
  const rise = Float32Array.from({ length: 46 * RATE }, (_, i) => 0.05 * Math.sin((2 * Math.PI * 330 * i) / RATE) * (i >= 20 * RATE && i < 26 * RATE ? 3.162 : 1));
  const ridden = ride([rise, rise], { over: 3, ratio: 3, ease: 2 });
  const lufsIn = (c, a, b) => loudness(c.map((x) => x.subarray(a * RATE, b * RATE)), 'integrated');
  const rose = lufsIn([rise, rise], 21, 25) - lufsIn([rise, rise], 2, 6);
  const fell = lufsIn(ridden.chs, 21, 25) - lufsIn(ridden.chs, 2, 6);
  check(rose > 9.9 && fell < rose - 2 && fell > 3, `a 10 dB swell ridden to ${fell.toFixed(1)} dB over the quiet, cut ${ridden.cut.toFixed(1)}`);
  check(Math.abs(lufsIn(ridden.chs, 2, 6) - lufsIn([rise, rise], 2, 6)) < 0.05 && Math.abs(lufsIn(ridden.chs, 40, 44) - lufsIn([rise, rise], 40, 44)) < 0.05, 'the quiet passages were ridden too');
  let worstStep = 0;
  // the gain at each 10 ms, read where the tone is well away from a zero crossing
  const gainAt = (i) => {
    while (Math.abs(rise[i]) < 0.02) i++;
    return dbOf(Math.abs(ridden.chs[0][i] / rise[i]));
  };
  for (let i = RATE; i + RATE / 100 < ridden.chs[0].length - RATE; i += RATE / 100) worstStep = Math.max(worstStep, Math.abs(gainAt(i + RATE / 100) - gainAt(i)));
  check(worstStep < 0.5, `the cut stepped by ${worstStep.toFixed(2)} dB in 10 ms`);

  // silence off both ends, keeping the margins
  const pad = new Float32Array(RATE / 2);
  const burst = Float32Array.from([...pad, ...tone(0.2, 440, 0.5), ...pad]);
  const trimmed = trimSilence([burst], { pre: 0.005, post: 0.05 });
  const want = Math.round(0.2 * RATE) + Math.round(0.005 * RATE) + Math.round(0.05 * RATE);
  check(Math.abs(trimmed[0].length - want) < 60, `trimmed to ${trimmed[0].length} frames, not about ${want}`);
  check(trimSilence([new Float32Array(100)]) === null, 'a silent take was not given up on');
  // music: only the tail
  const tailOnly = trimSilence([burst], { lead: null, post: 0.05 });
  check(tailOnly[0].length === pad.length + Math.round(0.25 * RATE) && tailOnly[0][0] === 0, `trimmed at the tail alone to ${tailOnly[0].length} frames`);

  // a loop: the body's end runs into its start, the padding repeats the body
  const hum = (ch) => Float32Array.from({ length: 5 * RATE }, (_, i) => 0.3 * Math.sin((2 * Math.PI * (220 + ch * 3) * i) / RATE) + 0.01 * rnd());
  const loop = makeLoop([hum(0), hum(1)], { crossfade: 1, pad: 0.25 });
  const p = Math.round(0.25 * RATE);
  check(loop.start === p && loop.end === p + 4 * RATE && loop.chs[0].length === loop.end + p, `loop ${loop.start}–${loop.end} of ${loop.chs[0].length} frames`);
  let same = true;
  for (const c of loop.chs) {
    for (let k = 0; k < p; k++) same &&= c[loop.end + k] === c[loop.start + k] && c[loop.start - 1 - k] === c[loop.end - 1 - k];
  }
  check(same, "a loop's padding isn't its body over again");
  const c0 = loop.chs[0];
  let step = 0;
  for (let i = loop.start + 1; i < loop.end; i++) step = Math.max(step, Math.abs(c0[i] - c0[i - 1]));
  const seam = Math.abs(c0[loop.start] - c0[loop.end - 1]);
  check(seam <= step * 1.2, `the seam jumps ${seam.toFixed(4)}, the loop's steps at most ${step.toFixed(4)}`);

  // a crackling loop, limited: still seamless, the crackle under the ceiling, the body at its loudness
  const crackle = (ch) => Float32Array.from({ length: 6 * RATE }, (_, i) => 0.05 * Math.sin((2 * Math.PI * (110 + ch) * i) / RATE) + (i % 24001 < 3 ? 0.9 : 0) + 0.002 * rnd());
  const body = loopBody([crackle(0), crackle(1)], { crossfade: 1 });
  const lv = normalizeLoop(body, { lufs: -24, how: 'integrated', maxLimit: 10 });
  const fire = padLoop(lv.chs, { pad: 0.25 });
  check(lv.chs[0].length === body[0].length && lv.limited > 0, `a crackling loop: ${lv.chs[0].length} frames from ${body[0].length}, limited ${lv.limited} dB`);
  check(dbOf(peak(fire.chs)) <= -0.99 && near(loudness(lv.chs, 'integrated'), lv.lufs, 0.01), `a limited loop peaks at ${dbOf(peak(fire.chs)).toFixed(2)} dBFS, ${lv.lufs.toFixed(1)} LUFS`);
  const f0 = fire.chs[0];
  let fstep = 0;
  for (let i = fire.start + 1; i < fire.end; i++) fstep = Math.max(fstep, Math.abs(f0[i] - f0[i - 1]));
  const fseam = Math.abs(f0[fire.start] - f0[fire.end - 1]);
  check(fseam <= fstep, `a limited loop's seam jumps ${fseam.toFixed(4)}, its steps at most ${fstep.toFixed(4)}`);

  const inter = interleave([Float32Array.of(1, 2, 3), Float32Array.of(4, 5, 6)]);
  const back = deinterleave(inter, 2);
  check(back[0].join() === '1,2,3' && back[1].join() === '4,5,6', `interleaving round trip: ${back.map((c) => c.join())}`);

  // what the pipeline wrote: the manifest's loop points are the ones it recorded for each take
  const made = JSON.parse(fs.existsSync(path.join(root, 'tools/audio/made.json')) ? fs.readFileSync(path.join(root, 'tools/audio/made.json'), 'utf8') : '{}');
  const { FILES } = await load('/src/audio/files.ts');
  for (const [id, f] of Object.entries(FILES)) {
    for (const file of f.files) {
      const m = made[file.replace(/\.m4a$/, '')];
      check(!!m, `files.ts: ${id}: ${file} isn't in tools/audio/made.json`);
      if (m) check(JSON.stringify(m.loop) === JSON.stringify(f.loop), `files.ts: ${id}: loop ${JSON.stringify(f.loop)}, ${file} was made to loop at ${JSON.stringify(m.loop)}`);
    }
    // a line's takes' lengths, known before they're fetched (a townsperson's text scrolls by them): made.json's, take by take
    if (id.startsWith('voice.')) {
      const want = f.files.map((file) => made[file.replace(/\.m4a$/, '')]?.secs);
      check(JSON.stringify(f.secs) === JSON.stringify(want), `files.ts: ${id}: secs ${JSON.stringify(f.secs)}, its takes were made ${JSON.stringify(want)} long`);
    } else check(f.secs === undefined, `files.ts: ${id} has secs: only a voice line's takes do`);
  }
  // every recording that ships is credited, with what it was asked for (the free tier's terms)
  const out = path.join(root, 'public/audio');
  const credits = fs.existsSync(path.join(out, 'CREDITS.md')) ? fs.readFileSync(path.join(out, 'CREDITS.md'), 'utf8') : '';
  const shipped = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => /\.(m4a|mp3|ogg|opus|webm|wav)$/.test(f)) : [];
  if (shipped.length) check(credits.includes('音效与配音由 ElevenLabs 生成'), 'public/audio/CREDITS.md does not say 音效与配音由 ElevenLabs 生成');
  for (const f of shipped) {
    const m = made[f.replace(/\.m4a$/, '')];
    check(!!m, `public/audio/${f} has no record in tools/audio/made.json: who made it?`);
    const row = credits.split('\n').find((l) => l.startsWith(`| \`${f}\` |`));
    check(!!row, `public/audio/${f} isn't credited in public/audio/CREDITS.md`);
    const asked = m && (m.prompt ?? m.text);
    if (row && m) check(!!asked && row.includes(asked.replace(/\|/g, '\\|')), `public/audio/${f}: CREDITS.md doesn't give what it was made from (${asked ?? 'not recorded in made.json'})`);
  }

  // the heroes' script names the moments the game has lines for, and the list asks for each hero's
  // words there as they're written, a take for each way of saying it (HERO_TAKES of them), in order
  const { HERO_LINES } = await load('/src/audio/sounds.ts');
  const script = fs.readFileSync(path.join(root, 'tools/audio/voice-lines.md'), 'utf8');
  const keys = [...script.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((m) => m[1]);
  check(keys.join() === HERO_LINES.join(), `tools/audio/voice-lines.md has ${keys.join(' ')}, src/audio/sounds.ts HERO_LINES ${HERO_LINES.join(' ')}`);
  const { default: list, SPEAKERS, HEROES } = await import(`${path.join(root, 'tools/audio/list.mjs')}?t=${Date.now()}`);
  /** the ways each hero has of saying each line: Sfx says one at random, not the last again */
  const HERO_TAKES = 4;
  for (const row of script.split('\n').filter((l) => l.startsWith('| `'))) {
    const key = row.match(/`([a-z0-9_]+)`/)[1];
    const cells = row.split('|').slice(1, -1);
    check(cells.length === 2 + HEROES.length, `tools/audio/voice-lines.md: ${key} has ${cells.length} cells, not key, when and one for each of ${HEROES.join(', ')}`);
    HEROES.forEach((who, i) => {
      const words = [...(cells[2 + i] ?? '').matchAll(/「([^」]+)」/g)].map((m) => m[1]);
      const e = list.find((e) => e.id === `voice.${who}.${key}`);
      check(JSON.stringify(e?.texts) === JSON.stringify(words), `tools/audio/list.mjs: voice.${who}.${key} says ${JSON.stringify(e?.texts)}, the script ${JSON.stringify(words)}`);
      check(words.length === HERO_TAKES && new Set(words).size === words.length, `tools/audio/voice-lines.md: ${who} says ${key} ${words.length} ways (${words.join(' ')}), not ${HERO_TAKES} different ones`);
    });
  }

  // the townsfolk's lines as the game says them: the list asks for each of Akara's, filled as shown
  // (it reads them off the review page, which tools/test/quests.test.mjs holds to the lines), under
  // the id the game plays it by (npcLine), her greetings and farewells a take each; nothing else
  const DLG = await load('/src/data/dialogue.ts');
  const { fillLine } = await load('/src/game/quests/quest.ts');
  const { npcLine } = await load('/src/audio/sounds.ts');
  const town = Object.fromEntries(DLG.spokenLines().map((s) => [npcLine(s.npc, s.id, s.quest), s.lines]));
  check(Object.keys(town).length === 9 && town['voice.akara.a1q1_remind_out'] && town['voice.akara.gossip2'], `the lines spoken aloud: ${Object.keys(town).join(' ')}`);
  for (const [id, lines] of Object.entries(town)) {
    const e = list.find((e) => e.id === id);
    const want = lines.map((l) => fillLine(l).zh);
    check(JSON.stringify(e?.texts) === JSON.stringify(want), `tools/audio/list.mjs: ${id} says ${JSON.stringify(e?.texts)}, the game ${JSON.stringify(want)}`);
  }
  check(DLG.GREETINGS.akara.greeting.length === 3 && DLG.GREETINGS.akara.farewell.length === 3, 'Akara has not three greetings and three farewells');
  // a word the voice misreads is given it respelled (SAY_AS): the take records the line as shown and what the voice was given
  const { SAY_AS = {} } = await import(`${path.join(root, 'tools/audio/list.mjs')}?t=${Date.now()}`);
  for (const [id, pairs] of Object.entries(SAY_AS)) {
    const e = list.find((x) => x.id === id);
    check(e?.kind === 'voice', `tools/audio/list.mjs: SAY_AS ${id} is no voice line`);
    (e?.texts ?? []).forEach((text, i) => {
      const said = pairs.reduce((s, [word, as]) => s.split(word).join(as), text);
      const m = made[`${id}.${i + 1}`];
      if (said !== text && m) check(m.text === text && m.said === said, `made.json: ${id}.${i + 1} says ${m.text}, given as ${m.said}, not ${said}`);
    });
  }
  const stray = list.filter((e) => e.kind === 'voice' && !HEROES.includes(e.id.split('.')[1]) && !(e.id in town));
  check(!stray.length, `tools/audio/list.mjs: townsfolk's lines the game doesn't say: ${stray.map((e) => e.id).join(' ')}`);
  check(!!SPEAKERS.akara?.voice && !HEROES.includes('akara'), `Akara's voice: ${JSON.stringify(SPEAKERS.akara)}`);

  // the music that ships: made by ACE-Step, credited as such with its seed, streamed whole (no loop points)
  for (const e of list.filter((e) => e.kind === 'music')) {
    check(!validateMusic(e).length, `tools/audio/list.mjs: ${validateMusic(e).join('; ')}`);
    e.takes.forEach((_, i) => {
      const name = `${e.id}.${i + 1}`;
      const m = made[name];
      if (!m) return;
      const req = musicRequest(e, i + 1);
      check(m.kind === 'music' && m.model === `ACE-Step 1.5 ${req.model} + ${req.lm}` && m.seed === req.seed, `made.json: ${name} was made by ${m.model}, seed ${m.seed}`);
      const row = credits.split('\n').find((l) => l.startsWith(`| \`${name}.m4a\` |`));
      check(!!row && row.includes('| 音乐 |') && row.includes(`种子 ${m.seed}`) && !row.includes('elevenlabs'), `CREDITS.md: ${name}: ${row}`);
    });
    if (FILES[e.id]) check(!FILES[e.id].loop, `files.ts: ${e.id} has loop points: Stream loops the whole file`);
  }
  if (shipped.some((f) => f.startsWith('music.'))) check(credits.includes('音乐由 ACE-Step 1.5 生成'), 'public/audio/CREDITS.md does not say 音乐由 ACE-Step 1.5 生成');

  musicEntries(check);
  musicRaw(check);
  musicRun(check);

  if (problems.length) throw new Error(problems.join('\n'));
};

/** a music entry as the list has them: the camp's two takes, the second from a job of its own */
const ENTRY = {
  id: 'music.test',
  kind: 'music',
  prompt: 'a slow solo guitar, instrumental',
  bpm: 66,
  key: 'D minor',
  time: 3,
  duration: 150,
  model: 'acestep-v15-turbo',
  lm: 'acestep-5Hz-lm-1.7B',
  takes: [{ seed: 101 }, { seed: 113, prompt: 'a lonely guitar, instrumental', key: 'E minor' }],
  gain: 0.5,
};

/** an entry is held to what ACE-Step takes (acestep/constants.py), its takes each by seed */
function musicEntries(check) {
  check(validateMusic(ENTRY).length === 0, `a good entry: ${validateMusic(ENTRY).join('; ')}`);
  const bad = (change, want) => {
    const e = { ...ENTRY, ...change };
    const p = validateMusic(e).join('; ');
    check(want.test(p), `${JSON.stringify(change)}: "${p}", not ${want}`);
  };
  bad({ id: 'tune.test' }, /music\.<name>/);
  bad({ bpm: 10 }, /bpm 10 is not 30 to 300/);
  bad({ key: 'H minor' }, /key H minor/);
  bad({ time: 5 }, /time 5 is not 2, 3, 4, 6/);
  bad({ duration: 5 }, /duration 5 is not 10 to 600/);
  bad({ lm: undefined }, /needs its lm/);
  bad({ takes: [] }, /needs its takes/);
  bad({ seed: 4 }, /a seed is a take's/);
  bad({ variants: 2 }, /variants is not a field/);
  bad({ takes: [{ seed: 1.5 }] }, /seed 1.5 is not a whole number/);
  bad({ takes: [{ seed: 7, caption: 'x' }] }, /caption is not a field of a take/);
  bad({ takes: [{ seed: 7 }, { seed: 7 }] }, /the same take as an earlier one/);
  bad({ gain: 0 }, /gain 0/);
  // ACE-Step's caption is under 512 characters, counted as Python does
  bad({ prompt: 'x'.repeat(512) }, /the prompt is 512 characters: ACE-Step's caption is under 512/);
  check(!validateMusic({ ...ENTRY, prompt: '琴'.repeat(511) }).length, `a caption of 511 characters: ${validateMusic({ ...ENTRY, prompt: '琴'.repeat(511) }).join('; ')}`);
  bad({ steps: 0 }, /steps 0 is not a whole number/);
  bad({ guidance: -1 }, /guidance -1 is not a number over 0/);
  bad({ takes: [{ seed: 7, shift: '3' }] }, /shift 3 is not a number over 0/);
  // a take's own fields over its entry's; the same take another seed is another take
  const r2 = musicRequest(ENTRY, 2);
  check(r2.seed === 113 && r2.key === 'E minor' && r2.bpm === 66 && r2.prompt.startsWith('a lonely'), `take 2 asks for ${JSON.stringify(r2)}`);
  // the sampler: the model's, unless the list gives it
  check(r2.steps === 8 && r2.guidance === 1 && r2.shift === 3, `a turbo take is sampled ${r2.steps} steps, guidance ${r2.guidance}, shift ${r2.shift}`);
  const xl = musicRequest({ ...ENTRY, model: 'acestep-v15-xl-sft' }, 1);
  check(xl.steps === 64 && xl.guidance === 7 && xl.shift === 3, `an XL take is sampled ${xl.steps} steps, guidance ${xl.guidance}, shift ${xl.shift}`);
  const own = musicRequest({ ...ENTRY, guidance: 5, takes: [{ seed: 1, steps: 32 }] }, 1);
  check(own.steps === 32 && own.guidance === 5 && own.shift === 3, `a take's own sampler: ${JSON.stringify(own)}`);
  check(validateMusic({ ...ENTRY, takes: [{ seed: 7 }, { seed: 7, steps: 16 }] }).length === 0, 'another sampler is another take');
  // the jobs for acestep.py are entries of the list, with only the takes asked for, each with its sampler
  const jobs = jobsFor([{ e: ENTRY, n: 2 }]);
  check(jobs.length === 1 && jobs[0].id === 'music.test' && jobs[0].bpm === 66 && JSON.stringify(jobs[0].takes) === JSON.stringify([{ ...ENTRY.takes[1], steps: 8, guidance: 1, shift: 3 }]) && !('gain' in jobs[0]), `the job for take 2: ${JSON.stringify(jobs)}`);
}

/** a take's raw output: the sidecar that records its request, whatever the file's called and wherever it's linked from */
function musicRaw(check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-acestep-'));
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-acestep-box-'));
  try {
    const put = (rel, meta, wav = true) => {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(`${p}.json`, typeof meta === 'string' ? meta : JSON.stringify(meta));
      if (wav) fs.writeFileSync(`${p}.wav`, '');
    };
    const one = musicRequest(ENTRY, 1);
    // as the generator writes them: ACE-Step's caption, the time signature as a string, the job's other fields
    const car = { id: 'music.test', takes: 3, first: 4, ...sidecarOf(one), time: '3', secs: 56.2 };
    put('turbo/music.test.6', { ...car, seed: 102 });
    put('turbo/music.test.9', car);
    put('xl/music.test.1', { ...car, model: 'acestep-v15-xl-sft' });
    put('turbo/broken', '{ not json');
    put('turbo/jobs', [car]);
    put('turbo/lost', car, false);
    check(matches(car, one) && !matches({ ...car, seed: 102 }, one) && !matches({ ...car, caption: `${car.caption}.` }, one), 'a sidecar matches its own request and no other');
    const { lm: _, ...noLm } = car;
    check(!matches(noLm, one), 'a sidecar that leaves the LM out matches');
    // sampled otherwise, it's another take; one that doesn't say (gen-reference.py's) was sampled as its model is
    check(!matches({ ...car, steps: 16 }, one) && !matches({ ...car, guidance: 3 }, one), 'a take sampled otherwise matches');
    const { steps: _s, guidance: _g, shift: _h, ...unsampled } = car;
    const xlOne = musicRequest({ ...ENTRY, model: 'acestep-v15-xl-sft' }, 1);
    check(matches(unsampled, one) && !matches({ ...unsampled, model: xlOne.model }, one), "a sidecar that doesn't give its sampler isn't read as its model's");
    check(matches({ ...unsampled, model: xlOne.model }, xlOne) && !matches({ ...car, model: xlOne.model }, xlOne), "an XL take isn't told by its sampler");
    // the GPU machine's output linked in: walked once, however it's linked
    const two = musicRequest(ENTRY, 2);
    fs.writeFileSync(path.join(box, 'music.test.2.json'), JSON.stringify({ id: 'music.test', ...sidecarOf(two) }));
    fs.writeFileSync(path.join(box, 'music.test.2.wav'), '');
    fs.symlinkSync(box, path.join(dir, 'from-box'));
    fs.symlinkSync(box, path.join(dir, 'turbo/again'));
    fs.symlinkSync(dir, path.join(dir, 'xl/up'));
    fs.symlinkSync(path.join(dir, 'gone'), path.join(dir, 'broken-link'));
    const cars = sidecars(dir);
    check(cars.length === 4, `${cars.length} sidecars read, not the 4 with a take beside them: ${cars.map((c) => path.relative(dir, c.json)).join(' ')}`);
    check(findRaw(cars, one)?.wav === path.join(dir, 'turbo/music.test.9.wav'), `take 1 found as ${findRaw(cars, one)?.wav}`);
    check(findRaw(cars, { ...one, model: 'acestep-v15-xl-sft' })?.wav === path.join(dir, 'xl/music.test.1.wav'), 'the XL take not told from the turbo one');
    check(findRaw(cars, two)?.wav === path.join(dir, 'from-box/music.test.2.wav'), `take 2, in a folder linked in, found as ${findRaw(cars, two)?.wav}`);
    check(findRaw(cars, musicRequest({ ...ENTRY, takes: [{ seed: 5 }] }, 1)) === null, 'a take found, though nothing made it');
    check(sidecars(path.join(dir, 'none')).length === 0, 'a missing folder has sidecars');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(box, { recursive: true, force: true });
  }
}

/**
 * A WAV of 16-bit stereo at 48 kHz: `secs` of a quiet chord, then `silence` s of it gone; or with
 * `clicks`, a quiet tone and a burst of square wave four times a second, which AAC rings 2 dB over
 */
function wav(secs, silence, clicks = false) {
  const n = Math.round((secs + silence) * RATE);
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const chord = 0.2 * Math.sin(2 * Math.PI * 147 * t) + 0.1 * Math.sin(2 * Math.PI * 220 * t) * (1 + Math.sin(t));
    const click = 0.03 * Math.sin(2 * Math.PI * 147 * t) + (t % 0.25 < 0.003 ? 0.8 * Math.sign(Math.sin(2 * Math.PI * 2500 * t)) : 0);
    const v = t < secs ? (clicks ? click : chord) : 0;
    b.writeInt16LE(Math.round(v * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(v * 0.8 * 32767), 46 + i * 4);
  }
  return b;
}

/**
 * The tool on a list of its own, in a scratch checkout of it: what it writes, what it reports, and
 * that music never asks ElevenLabs (no key here: it would fail to reach it). Skipped without ffmpeg,
 * and without Apple's AAC encoder in it (aac_at, macOS only; Linux CI has neither): the tool encodes
 * with it where there is one, every shipped take was made with it, and the run's numbers are its own.
 * ffmpeg's own encoder rings on the clicks below near 0 dBFS however far they are limited, so the
 * tool refuses that take there.
 */
function musicRun(check) {
  const has = (cmd) => spawnSync(cmd, ['-version'], { stdio: 'ignore' }).status === 0;
  if (!has('ffmpeg') || !has('ffprobe')) {
    console.log('     (ai-audio: no ffmpeg, so the music run is skipped)');
    return;
  }
  if (!/\baac_at\b/.test(spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '')) {
    console.log('     (ai-audio: ffmpeg has no Apple AAC encoder (aac_at, macOS), so the music run is skipped)');
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-ai-audio-'));
  try {
    for (const f of ['tools/ai-audio.mjs', 'tools/audio/dsp.mjs', 'tools/audio/music.mjs']) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    }
    fs.mkdirSync(path.join(tmp, 'src/audio'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src/audio/files.ts'), "import type { FileId } from './sounds';\n\nexport const FILES: Partial<Record<FileId, SoundFiles>> = {};\n");
    const list = (entry) => fs.writeFileSync(path.join(tmp, 'tools/audio/list.mjs'), `export const SPEAKERS = {};\nexport default [${JSON.stringify(entry)}];\n`);
    const run = (...args) => {
      const r = spawnSync(process.execPath, [path.join(tmp, 'tools/ai-audio.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, AUDIO_SRC: path.join(tmp, 'audio-src'), ELEVENLABS_API_KEY: 'none' } });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const short = { ...ENTRY, duration: 12 };
    list(short);
    // take 1 is there, under a name of its own; take 2 isn't
    const raw = path.join(tmp, 'audio-src/acestep/turbo/music.test.6');
    fs.mkdirSync(path.dirname(raw), { recursive: true });
    fs.writeFileSync(`${raw}.wav`, wav(9, 3));
    fs.writeFileSync(`${raw}.json`, JSON.stringify({ id: 'music.test', ...sidecarOf(musicRequest(short, 1)), time: '3' }));
    // made on another machine and copied keeping its time (scp -p): its sidecar doesn't say when
    const madeAt = new Date(2026, 0, 2, 12);
    for (const ext of ['wav', 'json']) fs.utimesSync(`${raw}.${ext}`, madeAt, madeAt);

    const dry = run('--dry');
    check(dry.code === 0, `--dry exited ${dry.code}: ${dry.out}`);
    check(/music to generate on a GPU machine with tools\/audio\/acestep\.py: 1: music\.test\.2\b/.test(dry.out), `--dry doesn't list take 2 to generate: ${dry.out}`);
    check(/to process again \(free\): 1: music\.test\.1\b/.test(dry.out), `--dry doesn't list take 1 to process: ${dry.out}`);
    check(!/ElevenLabs/.test(dry.out) && /to make: 0 takes/.test(dry.out), `--dry on music asked ElevenLabs: ${dry.out}`);

    const jobs = path.join(tmp, 'jobs.json');
    const made = run('--jobs', jobs);
    check(made.code === 0, `the run exited ${made.code}: ${made.out}`);
    check(/music\.test\.2 .*seed 113/.test(made.out), `the run doesn't report take 2 to generate: ${made.out}`);
    const job = fs.existsSync(jobs) ? JSON.parse(fs.readFileSync(jobs, 'utf8')) : null;
    check(job?.length === 1 && job[0].takes.length === 1 && job[0].takes[0].seed === 113 && job[0].takes[0].steps === 8 && job[0].prompt === short.prompt, `the jobs written: ${JSON.stringify(job)}`);
    const record = () => JSON.parse(fs.readFileSync(path.join(tmp, 'tools/audio/made.json'), 'utf8'))['music.test.1'];
    const rec = record();
    check(rec?.kind === 'music' && rec.model === 'ACE-Step 1.5 acestep-v15-turbo + acestep-5Hz-lm-1.7B' && rec.seed === 101 && rec.steps === 8 && rec.prompt === short.prompt, `made.json: ${JSON.stringify(rec)}`);
    check(rec?.date === '2026-01-02', `made.json: dated ${rec?.date}, not 2026-01-02, when its files were made`);
    check(rec?.credits === undefined && rec?.raw === 'acestep/turbo/music.test.6.wav' && /^[0-9a-f]{12}$/.test(rec?.rawHash ?? ''), `made.json: a music take cost ${rec?.credits} credits, from ${rec?.raw} (${rec?.rawHash})`);
    // trimmed of its 3 s of silence (the cut a tenth of a second past the last sound), at its loudness, never limited
    check(Math.abs(rec?.secs - 9.1) < 0.1 && rec?.lufs === -18 && rec?.limited === undefined, `the take came out ${rec?.secs} s at ${rec?.lufs} LUFS, limited ${rec?.limited}`);
    const m4a = path.join(tmp, 'public/audio/music.test.1.m4a');
    /** the file's true peak as ffmpeg's ebur128 reads it (to a tenth of a dB) */
    const ebur = () => Number(/True peak:\s+Peak:\s+(-?[\d.]+) dBFS/.exec(spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-i', m4a, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr)?.[1]);
    check(rec?.truePeak <= -1 && ebur() <= -1, `music.test.1.m4a's true peak: ${rec?.truePeak} dBFS as made.json has it, ${ebur()} as ebur128 reads it`);
    const probe = fs.existsSync(m4a) ? execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=channels,bit_rate:format_tags=comment,title', '-of', 'json', m4a], { encoding: 'utf8' }) : '{}';
    const info = JSON.parse(probe);
    const tags = info.format?.tags ?? {};
    check(info.streams?.[0]?.channels === 2 && Math.abs(info.streams[0].bit_rate / 1000 - 128) < 8, `music.test.1.m4a: ${probe}`);
    check(/ACE-Step 1\.5/.test(tags.title) && /ACE-Step 1\.5 acestep-v15-turbo \+ acestep-5Hz-lm-1\.7B, seed 101/.test(tags.comment) && !/elevenlabs/i.test(probe), `music.test.1.m4a is tagged ${JSON.stringify(tags)}`);
    const files = fs.readFileSync(path.join(tmp, 'src/audio/files.ts'), 'utf8');
    check(files.includes("  'music.test': { files: ['music.test.1.m4a'], gain: 0.5 },"), `files.ts: ${files}`);
    const credits = fs.readFileSync(path.join(tmp, 'public/audio/CREDITS.md'), 'utf8');
    check(credits.includes('音乐由 ACE-Step 1.5 生成') && credits.includes('音效与配音由 ElevenLabs 生成'), 'CREDITS.md names ACE-Step for the music, and ElevenLabs for the rest');
    check(credits.includes(`| \`music.test.1.m4a\` | 音乐 | ${short.prompt}（66 BPM，D minor，每小节 3 拍，12 秒） | ACE-Step 1.5 acestep-v15-turbo + acestep-5Hz-lm-1.7B，种子 101 | — |`), `CREDITS.md: ${credits.split('\n').find((l) => l.includes('music.test.1'))}`);

    // once more: up to date, nothing processed again
    const again = run('--dry');
    check(/up to date: 1/.test(again.out) && /to process again \(free\): 0/.test(again.out), `run again: ${again.out}`);

    // another raw take in its place, recorded alike (made again, on another machine): processed again.
    // Clicks the codec rings 2 dB over, so the file comes out over -1 dBFS and is limited lower; its
    // sidecar says when it was made
    fs.writeFileSync(`${raw}.wav`, wav(9, 3, true));
    const at = '2026-03-04T12:00:00+0000';
    fs.writeFileSync(`${raw}.json`, JSON.stringify({ id: 'music.test', ...sidecarOf(musicRequest(short, 1)), at }));
    const swapped = run('--dry');
    check(/to process again \(free\): 1: music\.test\.1\b/.test(swapped.out), `another raw take in its place isn't processed again: ${swapped.out}`);
    const clicks = run();
    const rec2 = record();
    check(clicks.code === 0 && /music\.test\.1: -?[\d.]+ dBFS true peak once encoded: limited at -[\d.]+ dBFS instead/.test(clicks.out), `the clicks weren't limited lower (exit ${clicks.code}): ${clicks.out}`);
    check(rec2?.rawHash !== rec?.rawHash && rec2?.truePeak <= -1 && ebur() <= -1 && rec2?.limited > 0, `the clicks: ${JSON.stringify(rec2)}, ${ebur()} dBFS true peak as ebur128 reads it`);
    check(rec2?.date === new Date(at).toLocaleDateString('sv'), `made.json: dated ${rec2?.date}, not ${at} as its sidecar says`);
    check(/up to date: 1/.test(run('--dry').out), 'the clicks processed again on the next run');

    // --redo with no raw take to process again: says so, and leaves the file
    fs.renameSync(path.join(tmp, 'audio-src/acestep'), path.join(tmp, 'audio-src/away'));
    const redo = run('--redo', 'music.test');
    check(redo.code === 0 && /music\.test\.1: --redo asks to process it again, but its raw take isn't in \S*audio-src\/acestep: the file stays as it is/.test(redo.out) && !/older recipe/.test(redo.out), `--redo without the raw take: ${redo.out}`);
    check(record()?.rawHash === rec2?.rawHash && fs.existsSync(m4a), '--redo without the raw take changed the take');
    fs.renameSync(path.join(tmp, 'audio-src/away'), path.join(tmp, 'audio-src/acestep'));

    // another seed for take 1, not made yet: the take there plays on, credited as made, and the run doesn't fail
    list({ ...short, takes: [{ seed: 999 }, short.takes[1]] });
    const stale = run();
    check(stale.code === 0, `a stale take failed the run: ${stale.out}`);
    check(/stale: music\.test\.1 was made from what its entry asked before: it plays on, credited as made, until its new take is generated \(tools\/audio\/acestep\.py\)/.test(stale.out), `not reported stale: ${stale.out}`);
    check(/music\.test\.1 .*seed 999/.test(stale.out), `the new take 1 isn't reported to generate: ${stale.out}`);
    check(fs.readFileSync(path.join(tmp, 'src/audio/files.ts'), 'utf8').includes("files: ['music.test.1.m4a']") && fs.existsSync(m4a), 'the stale take was dropped');

    // a bad entry stops the run, naming what's wrong
    list({ ...short, bpm: 400 });
    const bad = run('--dry');
    check(bad.code === 1 && /list: music\.test take 1: bpm 400 is not 30 to 300/.test(bad.out), `a bad entry: exit ${bad.code}, ${bad.out}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
