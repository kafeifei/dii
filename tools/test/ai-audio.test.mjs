// The audio pipeline's processing (tools/audio/dsp.mjs) and what it wrote: loudness reads as
// BS.1770 does (a full-scale 1 kHz tone is -3.01 LUFS in one channel, a mono file counting in both
// ears); normalizing lands on the target under the ceiling, limiting a spiky take no more than it
// may; silence is trimmed off both ends; a loop's end runs into its start without a jump, its padding
// repeating the body sample for sample; the manifest's loop points are those made.json recorded; and
// every recording in public/audio/ has a record in made.json and a credit in CREDITS.md naming what
// it was made from; the heroes' script (tools/audio/voice-lines.md) has the moments HERO_LINES names,
// and the list asks for its words.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, dbOf, deinterleave, interleave, limit, loopBody, loudness, makeLoop, normalize, normalizeLoop, padLoop, peak, trimSilence } from '../audio/dsp.mjs';

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

  // silence off both ends, keeping the margins
  const pad = new Float32Array(RATE / 2);
  const burst = Float32Array.from([...pad, ...tone(0.2, 440, 0.5), ...pad]);
  const trimmed = trimSilence([burst], { pre: 0.005, post: 0.05 });
  const want = Math.round(0.2 * RATE) + Math.round(0.005 * RATE) + Math.round(0.05 * RATE);
  check(Math.abs(trimmed[0].length - want) < 60, `trimmed to ${trimmed[0].length} frames, not about ${want}`);
  check(trimSilence([new Float32Array(100)]) === null, 'a silent take was not given up on');

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
  // words there as they're written
  const { HERO_LINES } = await load('/src/audio/sounds.ts');
  const script = fs.readFileSync(path.join(root, 'tools/audio/voice-lines.md'), 'utf8');
  const keys = [...script.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((m) => m[1]);
  check(keys.join() === HERO_LINES.join(), `tools/audio/voice-lines.md has ${keys.join(' ')}, src/audio/sounds.ts HERO_LINES ${HERO_LINES.join(' ')}`);
  const { default: list, SPEAKERS } = await import(`${path.join(root, 'tools/audio/list.mjs')}?t=${Date.now()}`);
  for (const row of script.split('\n').filter((l) => l.startsWith('| `'))) {
    const key = row.match(/`([a-z0-9_]+)`/)[1];
    const words = [...row.matchAll(/「([^」]+)」/g)].map((m) => m[1]);
    Object.keys(SPEAKERS).forEach((who, i) => {
      const e = list.find((e) => e.id === `voice.${who}.${key}`);
      check(e?.text === words[i], `tools/audio/list.mjs: voice.${who}.${key} says ${e?.text}, the script ${words[i]}`);
    });
  }

  if (problems.length) throw new Error(problems.join('\n'));
};
