// The file-based audio engine and the composed music, without an AudioContext: the manifest of
// recordings (src/audio/files.ts) names real ids and files; the decoded-buffer cache keeps to its
// budget, oldest first, sparing what's pinned, and decodes each file once; variants don't repeat;
// an effect's leading silence (an AAC priming left in) is skipped;
// every area kind has its music; walking from area to area, an ambience or a music starts only
// where it changes; under the sky, the night has its own loops from dusk to dawn, the day's
// standing in for those not recorded; a Karplus–Strong string is in tune, decays and is the same
// for the same seed; the composer writes the same piece for the same area, in its mode, sparse but
// never silent for long; and the reverbs are short. tools/scenarios/sfx.mjs and audio.mjs play the
// same through WebAudio in a page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIO_EXT = /\.(m4a|mp3|ogg|opus|webm|wav)$/;
/** minutes of each score the composer is run for */
const MINUTES = 10;

export default async (load) => {
  const { SOUNDS, AREA_FILES, HERO_LINES, DUSK, DAWN, areaSound, areaFiles, isNight } = await load('/src/audio/sounds.ts');
  const { CLASSES } = await load('/src/data/classes.ts');
  const { FILES } = await load('/src/audio/files.ts');
  const { Buffers, BUDGET, bytesOf, pickVariant, leadIn, LEAD } = await load('/src/audio/buffers.ts');
  const { SCORES, Composer, pluck, mulberry, seedOf, midiHz, STRING_RATE, ROOM_MAX } = await load('/src/audio/score.ts');
  const { Sfx, MAX_RATE } = await load('/src/audio/sfx.ts');
  const { areaKey } = await load('/src/audio/sounds.ts');
  const { areaDef, areaList, dungeonArea, CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL } = await load('/src/world/areas.ts');
  const camp = areaDef(CAMP_AREA);
  const moor = areaDef(WILD_AREA);
  const plains = areaDef(COLD_PLAINS);
  const den = areaDef(DEN_OF_EVIL);
  const floor = (f) => areaDef(dungeonArea(f));
  /** the areas of normal play and a floor of each of the trial ground's themes */
  const AREAS = [...areaList(), ...[1, 5, 9, 13].map(floor)];
  const SCORE = { town: 'town', outdoor: 'outdoor', dungeon: 'dungeon' };
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);

  // the manifest: ids the game knows, files that are there, sane loop points
  for (const [id, f] of Object.entries(FILES)) {
    check(id in SOUNDS || AREA_FILES.includes(id) || /^voice\.[a-z0-9_]+\.[a-z0-9_]+$/.test(id), `files.ts: ${id} is neither a sound id, an area's recording nor a voice line`);
    // a hero's line is for a moment the game names (HERO_LINES)
    const [v, who, line] = id.split('.');
    if (v === 'voice' && who in CLASSES) check(HERO_LINES.includes(line), `files.ts: ${id}: ${line} is not in HERO_LINES`);
    check(Array.isArray(f.files) && f.files.length > 0, `files.ts: ${id} has no files`);
    for (const file of f.files ?? []) {
      check(AUDIO_EXT.test(file) && !file.startsWith('/') && !file.split('/').includes('..'), `files.ts: ${id}: ${file} is not an audio file under public/audio/`);
      check(fs.existsSync(path.join(root, 'public/audio', file)), `files.ts: ${id}: public/audio/${file} is missing`);
    }
    if (f.loop) check(f.loop.start >= 0 && f.loop.end > f.loop.start, `files.ts: ${id}: loop ${JSON.stringify(f.loop)}`);
    if (f.loop) check(id.startsWith('amb.'), `files.ts: ${id}: only ambience loops`);
    check(f.gain === undefined || f.gain > 0, `files.ts: ${id}: gain ${f.gain}`);
  }

  // the cache, with buffers that are only a size: 100 frames of mono is 400 bytes
  const fake = (frames, ch = 1) => ({ length: frames, numberOfChannels: ch });
  let decodes = [];
  const fail = new Set();
  const cache = new Buffers(async (url, mono) => {
    decodes.push(url);
    await null;
    if (fail.has(url)) throw new Error(`${url}: 404`);
    return fake(100, mono ? 1 : 2);
  }, 1200);
  check(BUDGET === 32 * 1024 * 1024, `the budget is ${BUDGET} bytes, not 32 MB`);
  // decoded at the context's rate, which is capped: the budget holds minutes of mono, not seconds
  check(MAX_RATE === 48000 && BUDGET / (MAX_RATE * 4) > 150, `${(BUDGET / (MAX_RATE * 4)).toFixed(0)} s of mono at ${MAX_RATE} Hz fit the budget`);
  check(bytesOf(fake(100, 2)) === 800, 'a buffer is not counted as 4 bytes a sample');
  const [a1, a2] = await Promise.all([cache.load('a', true), cache.load('a', true)]);
  check(a1 === a2 && decodes.length === 1, `two loads of one file at once decoded it ${decodes.length} times`);
  await cache.load('b', true);
  await cache.load('c', true);
  check(cache.bytes === 1200 && cache.has('a') && cache.has('b') && cache.has('c'), `three at the budget: ${cache.bytes} bytes`);
  // a was played since b: b is the oldest now
  cache.get('a');
  await cache.load('d', true);
  check(!cache.has('b') && cache.has('a') && cache.has('c') && cache.has('d') && cache.bytes === 1200, `over the budget, not the least recently played went: ${['a', 'b', 'c', 'd'].filter((u) => cache.has(u))}`);
  cache.pin('c');
  await cache.load('e', true);
  check(cache.has('c') && !cache.has('a') && cache.bytes === 1200, 'a pinned buffer was evicted, or the wrong one went');
  cache.setBudget(400);
  check(cache.has('c') && cache.bytes === 400, `budget cut to one buffer: kept ${['c', 'd', 'e'].filter((u) => cache.has(u))} (${cache.bytes} bytes), not the pinned one`);
  cache.unpin('c');
  await cache.load('f', false);
  check(cache.has('f') && cache.bytes === 800, `a buffer bigger than the budget, just decoded: ${cache.bytes} bytes`);
  decodes = [];
  fail.add('g');
  let threw = false;
  await cache.load('g', true).catch(() => (threw = true));
  check(threw && !cache.has('g'), 'a file that failed to load did not reject, or was kept');
  fail.delete('g');
  await cache.load('g', true);
  check(decodes.length === 2 && cache.has('g'), 'a failed file is not tried again when asked again');
  check(cache.get('nope') === undefined, 'a buffer that was never loaded');

  // variants: at random, never the same twice running while there's another
  const rand = mulberry(7);
  for (const ready of [[0, 1], [0, 1, 2], [2, 5, 7]]) {
    let last;
    const seen = new Set();
    for (let k = 0; k < 200; k++) {
      const i = pickVariant(ready, last, rand);
      check(ready.includes(i) && i !== last, `variant ${i} of ${ready} after ${last}`);
      seen.add(i);
      last = i;
    }
    check(seen.size === ready.length, `variants ${ready}: only ${[...seen]} ever played`);
  }
  check(pickVariant([3], 3, rand) === 3, 'the only variant ready was not played again');

  // an effect's silence before its sound, skipped when it plays: none in a file trimmed as the
  // pipeline does, the AAC priming's 44 ms where a browser would keep it
  const R = 48000;
  const ping = (silent) => Float32Array.from({ length: silent + R / 4 }, (_, i) => (i < silent ? 0 : 0.5 * Math.sin((i - silent) * 0.2) * Math.exp(-(i - silent) / 4000)));
  const trimmed = leadIn(ping(Math.round(LEAD * R)), R);
  const primed = leadIn(ping(Math.round(LEAD * R) + 2112), R);
  check(trimmed < 0.0005, `a trimmed effect skips ${trimmed} s`);
  check(Math.abs(primed - 2112 / R) < 0.0005, `an effect with the priming kept skips ${primed} s, not ${2112 / R}`);
  check(leadIn(new Float32Array(100), R) === 0, 'a silent buffer is skipped into');

  // the areas' music: the camp, the wilderness and the dungeons each their own, the title quiet
  for (const a of AREAS) {
    const want = SCORE[a.kind];
    const s = areaSound(a);
    check(s.score === want, `${a.key} composes ${s.score}, not ${want}`);
    check(s.music?.startsWith('music.') && s.amb?.every((id) => id.startsWith('amb.')), `${a.key}'s recordings: ${JSON.stringify(s)}`);
    check(areaFiles(a).every((id) => AREA_FILES.includes(id)), `${a.key}: areaFiles names one AREA_FILES doesn't`);
  }
  check(areaSound('title').score === undefined && areaFiles('title').length === 0, 'the title screen has music');
  const seeds = AREAS.map((a) => seedOf(areaKey(a)));
  check(new Set(seeds).size === seeds.length, `area seeds ${seeds}`);
  check(seedOf(3) === seedOf('3'), 'a numbered area seeds unlike its name');
  check(AREAS.every((a) => areaKey(a) === a.key) && areaKey('title') === 'title', 'an area is not keyed by its key, or a screen by its name');

  // from area to area, an ambience or a music starts only where it changes: the camp's fire and
  // music give way to the wilderness's wind and music, which play on from Blood Moor into Cold
  // Plains (one SoundEnv); from the Den of Evil down the trial ground's floors nothing starts again
  // whatever the theme; with loops of their own the camp and the wilderness each have theirs. Node
  // has no AudioContext, so one is pretended and what Sfx starts is only noted
  const walk = (files) => {
    const sfx = new Sfx();
    const started = [];
    sfx.files = files;
    sfx.ctx = {};
    sfx.track = (area) => (started.push(`music ${areaKey(area)}`), { stop() {} });
    sfx.ambience = (s) => (started.push(`amb ${s.amb?.find((id) => files[id]) ?? s.bed}`), { stop() {} });
    for (const area of [camp, moor, plains, den, floor(1), floor(5), floor(9), camp, 'title']) sfx.enterArea(area);
    return started.join(', ');
  };
  const quiet = 'music camp, amb town, music wild, amb wild, music denofevil, amb dungeon, music camp, amb town, music title, amb none';
  check(walk({}) === quiet, `with no recordings, walking the areas started: ${walk({})}; want ${quiet}`);
  const looped = { 'amb.town': { files: ['town.m4a'] }, 'amb.wild': { files: ['wild.m4a'] } };
  const want = 'music camp, amb amb.town, music wild, amb amb.wild, music denofevil, amb dungeon, music camp, amb amb.town, music title, amb none';
  check(walk(looped) === want, `with the camp's and the wilderness's loops, walking the areas started: ${walk(looped)}; want ${want}`);

  // the night: the sky's dusk and dawn half over; past dusk the camp and the wilderness play their
  // night's loops, slowly crossfaded where the hero is; with no night recorded the day's play on;
  // underground nothing changes
  check(DUSK > 0.75 && DUSK < 0.8 && DAWN > 0.2 && DAWN < 0.25, `dusk at ${DUSK}, dawn at ${DAWN}: not where the sky's are (src/render/sky.ts)`);
  check(isNight(0) && isNight(0.1) && isNight(0.9) && !isNight(0.3) && !isNight(0.5) && !isNight(0.7), 'isNight is not night from dusk to dawn');
  for (const a of AREAS) {
    const s = areaSound(a);
    const ambAt = (night) => areaFiles(a, night).filter((id) => id.startsWith('amb.')).join();
    if (a.kind !== 'dungeon') check(s.night?.length && ambAt(true) === s.night.join() && ambAt(false) === s.amb.join(), `${a.key}: no night of its own, or areaFiles doesn't give it (${JSON.stringify(s)})`);
    else check(!s.night && areaFiles(a, true).join() === areaFiles(a).join(), `${a.key}, underground, has a night: ${JSON.stringify(s)}`);
    for (const id of [...(s.amb ?? []), ...(s.night ?? [])]) check(AREA_FILES.includes(id), `${a.key}: ${id} is not in AREA_FILES`);
  }
  const nightWalk = (files) => {
    const sfx = new Sfx();
    const started = [];
    sfx.files = files;
    sfx.ctx = {};
    sfx.track = () => ({ stop() {} });
    sfx.ambience = (s, rise) => (started.push(`${sfx.layers(s).join('+') || s.bed}${rise > 2 ? ' slowly' : ''}`), { stop() {} });
    sfx.enterArea(camp);
    // noon, then dusk in the camp, the wilderness by night, a dungeon, dawn there, and back out
    for (const step of [0.5, 0.8, moor, den, 0.3, moor]) typeof step === 'number' ? sfx.setTime(step) : sfx.enterArea(step);
    return started.join(', ');
  };
  const nights = { ...looped, 'amb.town_night': { files: ['tn.m4a'] }, 'amb.wild_night': { files: ['wn.m4a'] } };
  const wantNight = 'amb.town, amb.town_night slowly, amb.wild_night, dungeon, amb.wild';
  check(nightWalk(nights) === wantNight, `with night loops, from noon to dusk and dawn the ambience went: ${nightWalk(nights)}; want ${wantNight}`);
  const wantDay = 'amb.town, amb.wild, dungeon, amb.wild';
  check(nightWalk(looped) === wantDay, `with no night loops, from noon to dusk and dawn the ambience went: ${nightWalk(looped)}; want ${wantDay}`);

  // a plucked string: in tune once played at its rate, ringing down, the same for the same seed
  for (const m of [40, 47, 52, 59, 64, 76, 82]) {
    const hz = midiHz(m);
    const { data, rate } = pluck(hz, { ring: 3, bright: 0.5, dur: 3 }, mulberry(m));
    let peak = 0;
    let mean = 0;
    for (const v of data) {
      peak = Math.max(peak, Math.abs(v));
      mean += v / data.length;
    }
    check(data.every(Number.isFinite) && Math.abs(peak - 1) < 1e-6, `string ${m}: peak ${peak}`);
    check(Math.abs(mean) < 0.002, `string ${m}: DC ${mean}`);
    // its period by autocorrelation over a stretch past the attack, refined between samples
    const from = Math.round(STRING_RATE * 0.1);
    const span = Math.round(STRING_RATE * 0.25);
    const want = STRING_RATE / (hz / rate);
    const ac = (lag) => {
      let s = 0;
      for (let i = from; i < from + span; i++) s += data[i] * data[i + lag];
      return s;
    };
    let best = 0;
    for (let lag = Math.floor(want * 0.8); lag <= Math.ceil(want * 1.2); lag++) if (best === 0 || ac(lag) > ac(best)) best = lag;
    const [y0, y1, y2] = [ac(best - 1), ac(best), ac(best + 1)];
    const period = best + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2);
    const cents = 1200 * Math.log2((STRING_RATE / period) * rate / hz);
    check(Math.abs(cents) < 6, `string ${m} (${hz.toFixed(1)} Hz) plays ${cents.toFixed(1)} cents off`);
    const rms = (a, b) => Math.sqrt(data.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
    // rung down by the end of its ring, high strings too, but not long before
    const tenth = Math.floor(data.length / 10);
    const [start, mid, end] = [rms(0, tenth), rms(4.5 * tenth, 5.5 * tenth), rms(data.length - tenth, data.length)];
    check(end < start * 0.03, `string ${m} still rings at the end: ${end.toFixed(5)} against ${start.toFixed(5)}`);
    check(mid > start * 0.005, `string ${m} has died halfway through its ring: ${mid.toFixed(5)} against ${start.toFixed(5)}`);
    const again = pluck(hz, { ring: 3, bright: 0.5, dur: 3 }, mulberry(m)).data;
    check(again.every((v, i) => v === data[i]), `string ${m} differs for the same seed`);
  }

  // the composer: the same piece for the same seed, in its mode, never silent for long
  const density = {};
  for (const [kind, def] of Object.entries(SCORES)) {
    check(def.room > 0 && def.room <= ROOM_MAX, `${kind}: a ${def.room} s reverb, over ${ROOM_MAX} s`);
    for (const c of def.chords) {
      check(c.next.every((i) => i >= 0 && i < def.chords.length && i !== def.chords.indexOf(c)), `${kind}: chord ${c.notes} moves to ${c.next}`);
      check(def.pad.tones.every((i) => i < c.notes.length), `${kind}: the pad holds a note chord ${c.notes} hasn't`);
    }
    const play = (seed) => {
      const c = new Composer(def, seed, 0);
      const out = [];
      for (let p = c.next(); p.t < MINUTES * 60; p = c.next()) out.push(p);
      return out;
    };
    for (const area of ['camp', 'wild', 'floor1', 'floor5']) {
      const seed = seedOf(area);
      const piece = play(seed);
      check(JSON.stringify(piece) === JSON.stringify(play(seed)), `${kind} for ${area}: not the same piece twice`);
      check(JSON.stringify(piece) !== JSON.stringify(play(seed + 1)), `${kind}: another seed, the same piece`);
      const notes = piece.flatMap((p) => p.notes);
      const chords = new Set(piece.map((p) => p.chord));
      check(chords.size >= Math.min(3, def.chords.length), `${kind} for ${area}: only chords ${[...chords]} in ${MINUTES} minutes`);
      check(piece[0].t >= 2 && piece[0].t <= 4, `${kind}: the first phrase at ${piece[0].t.toFixed(1)} s`);
      let last = 0;
      let longest = 0;
      for (const p of piece) {
        check(p.t >= last && p.notes.length > 0, `${kind}: a phrase at ${p.t} after ${last}, or empty`);
        for (const n of p.notes) {
          check(n.t >= p.t && n.vel > 0 && n.vel <= 1 && Math.abs(n.pan) <= 0.6, `${kind}: note ${JSON.stringify(n)}`);
          check(def.scale.includes((((n.midi - 40) % 12) + 12) % 12), `${kind}: note ${n.midi} is not in its mode`);
          check(n.midi >= 40 && n.midi <= 88, `${kind}: note ${n.midi} is off the guitar`);
        }
        longest = Math.max(longest, p.t - last);
        last = p.notes.reduce((t, n) => Math.max(t, n.t), p.t);
      }
      density[kind] = notes.length / MINUTES;
      // never long without a note, nor busy: between a camp's guitar and a dungeon's odd note
      const quiet = { town: 12, outdoor: 22, dungeon: 30 }[kind];
      check(longest <= quiet, `${kind} for ${area}: ${longest.toFixed(1)} s without a note`);
      check(density[kind] >= 3 && density[kind] <= 45, `${kind} for ${area}: ${density[kind].toFixed(1)} notes a minute`);
    }
  }
  check(density.town > density.outdoor && density.outdoor > density.dungeon, `deeper isn't sparser: ${JSON.stringify(density)}`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  const fmt = Object.entries(density).map(([k, d]) => `${k} ${d.toFixed(0)}`).join(', ');
  console.log(`  ${Object.keys(FILES).length} recorded ids; notes a minute: ${fmt}`);
};
