// Recorded sounds through the game's own Sfx (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/audio.mjs --url "http://localhost:5174/?dev"
// Makes a few tiny recordings with ffmpeg (sine tones, WAV and AAC in .m4a) in a temporary folder
// and serves them to the page as /audio/__verify/<name>; any other name there goes on to the dev
// server, which answers for a missing file as it would (its index page). Gives the live Sfx a
// manifest naming them and checks in the page: the AudioContext runs at no more than 48 kHz,
// whatever the output's rate; an effect is synthesized on its first play while its takes decode,
// then plays a take (folded to mono, a little off pitch, never the same take twice running); two ids
// of one recipe with recordings of their own both play at once; a missing file and a corrupt one are
// given up on, with a warning naming the file and what plays instead; a preload asked before the
// first click resolves only once it's decoded; an ambience layer's preloaded take is the one that
// plays; the decoded takes keep to a budget, least recently played going first, an ambience loop
// pinned while it plays; the loop plays round its loop points, in stereo; a music track streams
// through one of two reused <audio> elements into WebAudio, and one refused until a click comes in
// from silence; the composed music and the bed play on from one dungeon floor to the next; a missing
// track is replaced by the composed music; an interrupted AudioContext is resumed on the next click.
// The last line is "AUDIO OK <summary>" or "AUDIO FAIL <reasons>".
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.tmpdir(), 'dii-audio-scenario');

/** a sine tone from ffmpeg's lavfi source, in stereo */
function sine(file, hz, secs, codec = []) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${secs}:sample_rate=44100`, '-ac', '2', ...codec, path.join(dir, file)]);
}

export default async function (page, shot, log) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const aac = ['-c:a', 'aac', '-b:a', '96k'];
  sine('hit_a.wav', 1000, 0.3);
  sine('hit_b.m4a', 1500, 0.3, aac);
  sine('fire.m4a', 700, 0.3, aac);
  sine('loop.m4a', 300, 3, aac);
  sine('loop_b.m4a', 330, 3, aac);
  sine('music.m4a', 220, 6, aac);
  sine('music_b.m4a', 247, 6, aac);
  fs.writeFileSync(path.join(dir, 'corrupt.m4a'), 'this is not audio, only text with an .m4a name');
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=start_time,duration,duration_ts,time_base', '-of', 'json', path.join(dir, 'loop.m4a')]).toString());
  log(`  ffprobe loop.m4a: ${JSON.stringify(probe.streams?.[0] ?? {})}`);

  const TYPES = { wav: 'audio/wav', m4a: 'audio/mp4' };
  let served = 0;
  await page.route('**/audio/__verify/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) return route.continue();
    served++;
    return route.fulfill({ status: 200, contentType: TYPES[name.split('.').pop()], body: fs.readFileSync(file) });
  });
  const base = new URL(page.url()).origin;
  const missing = await fetch(`${base}/audio/__verify/missing.wav`);
  log(`  a missing file from the dev server: HTTP ${missing.status} ${missing.headers.get('content-type')}`);

  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().startsWith('sound ')) warnings.push(m.text());
  });

  // a preload asked before the first click: it waits for the AudioContext that click makes
  const early = await page.evaluate(async () => {
    const Sfx = window.game.sfx.constructor;
    const s = new Sfx();
    s.files = { 'combat.hit': { files: ['__verify/hit_a.wav'] } };
    let done = false;
    window.__early = { s, p: s.preload(['combat.hit']).then(() => (done = true)) };
    await new Promise((r) => setTimeout(r, 300));
    return done;
  });
  // the first click makes the game's AudioContext (and the one above, by hand, as a click would)
  await page.mouse.click(640, 400);
  await page.waitForFunction(() => window.game.sfx.ctx?.state === 'running', null, { timeout: 5000 });

  const res = await page.evaluate(async (early) => {
    const snd = window.game.sfx;
    const ctx = snd.ctx;
    const fails = [];
    const facts = {};
    const check = (ok, what) => ok || fails.push(what);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms, what) => {
      const t0 = performance.now();
      while (!fn()) {
        if (performance.now() - t0 > ms) {
          fails.push(`timed out: ${what}`);
          return false;
        }
        await wait(20);
      }
      return performance.now() - t0;
    };
    const url = (f) => `/audio/__verify/${f}`;
    const MANIFEST = {
      'combat.hit': { files: ['__verify/hit_a.wav', '__verify/hit_b.m4a'] },
      'skill.fire_cast': { files: ['__verify/fire.m4a'] },
      'skill.fire_impact': { files: ['__verify/hit_a.wav'] },
      'monster.die': { files: ['__verify/missing.wav'] },
      'item.gold': { files: ['__verify/corrupt.m4a'] },
      'amb.wild': { files: ['__verify/loop.m4a', '__verify/loop_b.m4a'], loop: { start: 0.5, end: 2.5 } },
      'amb.dungeon': { files: ['__verify/missing_loop.m4a'] },
      'music.wild': { files: ['__verify/music.m4a'] },
      'music.town': { files: ['__verify/music_b.m4a'] },
      'music.dungeon': { files: ['__verify/missing_music.m4a'] },
    };

    // 0. the context's rate: the output's, capped (this Mac's DAC may run at 384 kHz)
    const device = new AudioContext();
    facts.ctx = `${ctx.state} ${ctx.sampleRate} Hz (the output's ${device.sampleRate} Hz)`;
    await device.close();
    check(ctx.sampleRate <= 48000, `the AudioContext runs at ${ctx.sampleRate} Hz`);

    // the preload asked before the first click: not done before it, done after
    const { s: e, p } = window.__early;
    check(!early, 'a preload before the first click resolved before there was an AudioContext');
    e.ensure();
    await Promise.race([p, wait(3000)]);
    check(e.buffers?.has(url('hit_a.wav')), 'a preload before the first click: not decoded once the click made an AudioContext');
    await e.ctx.close();

    // what every buffer source and oscillator starts: a recording, the synth's noise, or a tone
    const urlOf = new WeakMap();
    const decode = snd.buffers.decode;
    const decoded = [];
    snd.buffers.decode = async (u, mono) => {
      decoded.push(u.split('/').pop());
      const b = await decode(u, mono);
      urlOf.set(b, u.split('/').pop());
      return b;
    };
    const starts = [];
    const srcStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      const b = this.buffer;
      starts.push({
        what: b === snd.noiseBuf ? 'noise' : (urlOf.get(b) ?? (b?.sampleRate === 16000 ? 'string' : 'other')),
        ch: b?.numberOfChannels,
        rate: this.playbackRate.value,
        loop: this.loop,
        loopStart: this.loopStart,
        loopEnd: this.loopEnd,
        offset: a[1] ?? 0,
      });
      return srcStart.apply(this, a);
    };
    let tones = 0;
    const oscStart = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...a) {
      tones++;
      return oscStart.apply(this, a);
    };
    /** play `id` and say what it started, synchronously: a recording, or the synthesized recipe */
    const play = (id) => {
      const s0 = starts.length;
      const t0 = tones;
      snd.play(id);
      const mine = starts.slice(s0);
      const rec = mine.filter((s) => s.what.includes('.'));
      return { rec, synth: tones - t0 + mine.filter((s) => s.what === 'noise').length };
    };
    // the same sound again within 35 ms is the same event: space the plays out
    const gap = () => wait(60);

    check(Object.keys(snd.files).length === 0, `the shipped manifest isn't empty: ${Object.keys(snd.files)}`);
    check(snd.buffers.bytes === 0, `${snd.buffers.bytes} bytes decoded before any recording was named`);
    snd.files = MANIFEST;

    // 1. an effect: synthesized on its first play, which starts its takes decoding
    let pl = play('combat.hit');
    check(pl.rec.length === 0 && pl.synth > 0, `the first hit, before decoding: ${JSON.stringify(pl)}`);
    const ms = await until(() => snd.buffers.has(url('hit_a.wav')) && snd.buffers.has(url('hit_b.m4a')), 3000, 'the hit takes to decode after the first play');
    facts.decodeMs = Math.round(ms);
    const a = snd.buffers.get(url('hit_a.wav'));
    const b = snd.buffers.get(url('hit_b.m4a'));
    for (const [n, buf] of [['wav', a], ['m4a', b]]) {
      check(buf?.numberOfChannels === 1, `the ${n} take decoded to ${buf?.numberOfChannels} channels, not mono`);
      check(buf?.sampleRate === ctx.sampleRate, `the ${n} take is at ${buf?.sampleRate} Hz, the context at ${ctx.sampleRate}`);
    }
    facts.takes = `wav ${a?.length} / m4a ${b?.length} frames (0.3 s is ${Math.round(0.3 * ctx.sampleRate)})`;
    check(snd.buffers.bytes === (a.length + b.length) * 4, `the cache counts ${snd.buffers.bytes} bytes for two mono takes of ${a.length} and ${b.length}`);

    // 2. now recorded: one take or the other, never the same twice running, a little off pitch
    const order = [];
    const rates = [];
    for (let k = 0; k < 8; k++) {
      await gap();
      pl = play('combat.hit');
      check(pl.rec.length === 1 && pl.synth === 0, `hit ${k}: ${JSON.stringify(pl)}, not one recording`);
      if (!pl.rec[0]) continue;
      order.push(pl.rec[0].what === 'hit_a.wav' ? 'a' : 'b');
      rates.push(pl.rec[0].rate);
      check(pl.rec[0].ch === 1 && Math.abs(pl.rec[0].rate - 1) <= 0.04 + 1e-6, `hit ${k}: ${JSON.stringify(pl.rec[0])}`);
    }
    facts.takesPlayed = order.join('');
    check(order.every((v, i) => i === 0 || v !== order[i - 1]), `the same take twice running: ${order.join('')}`);
    check(new Set(rates.map((r) => r.toFixed(3))).size >= 5, `eight hits, rates ${rates}: not varied`);
    // a UI sound plays at its own pitch
    snd.files = { ...MANIFEST, 'ui.click': { files: ['__verify/hit_a.wav'] } };
    await snd.preload(['ui.click']);
    pl = play('ui.click');
    check(pl.rec.length === 1 && pl.rec[0].rate === 1, `a recorded ui.click: ${JSON.stringify(pl.rec)}`);
    snd.files = MANIFEST;
    // a fire's cast and its impact share a recipe, but with recordings of their own both are heard at once
    await snd.preload(['skill.fire_cast', 'skill.fire_impact']);
    await gap();
    const both = [play('skill.fire_cast'), play('skill.fire_impact')];
    check(both.every((x) => x.rec.length === 1), `a recorded fire cast and impact in the same instant: ${JSON.stringify(both)}`);

    // 3. a missing file and a corrupt one: tried once, given up on, synthesized for the session
    for (const id of ['monster.die', 'item.gold']) {
      await gap();
      pl = play(id);
      check(pl.rec.length === 0 && pl.synth > 0, `${id}'s first play: ${JSON.stringify(pl)}`);
      await until(() => snd.failed.has(id), 3000, `${id} to be given up on`);
      await gap();
      pl = play(id);
      check(pl.rec.length === 0 && pl.synth > 0, `${id} after its file failed: ${JSON.stringify(pl)}`);
    }
    await snd.preload(['monster.die']);
    check(!snd.buffers.has(url('missing.wav')), 'a missing file was cached');

    // 4. the budget: room for two takes, the least recently played goes first (the fire, here)
    for (const f of ['fire.m4a', 'hit_a.wav', 'hit_b.m4a']) snd.buffers.get(url(f));
    snd.buffers.setBudget(a.length * 4 + b.length * 4);
    const has = (...fs) => fs.map((f) => (snd.buffers.has(url(f)) ? f : `!${f}`)).join(' ');
    facts.budget1 = `${has('hit_a.wav', 'hit_b.m4a', 'fire.m4a')} (${snd.buffers.bytes}/${snd.buffers.budget} B)`;
    check(!snd.buffers.has(url('fire.m4a')) && snd.buffers.has(url('hit_a.wav')) && snd.buffers.has(url('hit_b.m4a')), `two takes' budget, the oldest of three went: ${facts.budget1}`);
    snd.buffers.get(url('hit_b.m4a'));
    await snd.preload(['skill.fire_cast']);
    facts.budget2 = `${has('hit_a.wav', 'hit_b.m4a', 'fire.m4a')} (${snd.buffers.bytes}/${snd.buffers.budget} B)`;
    check(!snd.buffers.has(url('hit_a.wav')) && snd.buffers.has(url('hit_b.m4a')) && snd.buffers.has(url('fire.m4a')), `a third take over a budget of two: ${facts.budget2}`);
    check(snd.buffers.bytes <= snd.buffers.budget, `${snd.buffers.bytes} bytes over a budget of ${snd.buffers.budget}`);
    // the hit with one take evicted: plays the other, and decodes the evicted one again
    await gap();
    pl = play('combat.hit');
    check(pl.rec.length === 1 && pl.rec[0].what === 'hit_b.m4a', `the hit with a take evicted: ${JSON.stringify(pl)}`);
    await until(() => snd.buffers.has(url('hit_a.wav')), 3000, 'the evicted take to decode again');
    snd.buffers.setBudget(32 * 1024 * 1024);

    // 5. an ambience loop and a streamed track: the wilderness. Its layer has two takes: preloading
    // decodes one, and that's the one that plays
    const tap = ctx.createAnalyser();
    tap.fftSize = 2048;
    snd.musicBus.connect(tap);
    const level = () => {
      const d = new Float32Array(tap.fftSize);
      tap.getFloatTimeDomainData(d);
      return Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);
    };
    decoded.length = 0;
    await snd.preload(['amb.wild']);
    const pre = decoded.filter((f) => f.startsWith('loop'));
    check(pre.length === 1, `preloading an ambience layer of two takes decoded ${pre.join(', ') || 'none'}`);
    const s0 = starts.length;
    snd.enterArea('wild');
    await until(() => starts.slice(s0).some((s) => s.what.startsWith('loop')), 3000, 'the wilderness loop to start');
    const loop = starts.slice(s0).find((s) => s.what.startsWith('loop'));
    facts.loop = loop && `${loop.what}: ch ${loop.ch}, loop ${loop.loop} ${loop.loopStart}–${loop.loopEnd} from ${loop.offset}`;
    check(loop?.what === pre[0], `the preloaded take was ${pre[0]}, the one played ${loop?.what}`);
    check(decoded.filter((f) => f.startsWith('loop')).length === 1, `entering the wilderness decoded another take: ${decoded}`);
    check(loop?.loop && loop.ch === 2 && loop.loopStart === 0.5 && loop.loopEnd === 2.5 && loop.offset === 0.5, `the ambience loop: ${JSON.stringify(loop)}`);
    // pinned while it plays: a budget of nothing keeps it and lets the rest go
    snd.buffers.setBudget(0);
    const loopBuf = snd.buffers.get(url(loop?.what));
    facts.pinned = `${snd.buffers.bytes} B kept at a budget of 0 (the loop is ${loopBuf ? loopBuf.length * loopBuf.numberOfChannels * 4 : '?'} B)`;
    check(loopBuf && snd.buffers.bytes === loopBuf.length * loopBuf.numberOfChannels * 4, `a budget of 0 with the loop playing: ${facts.pinned}`);
    const stream = snd.music;
    const players = snd.players.all.map((x) => x.el);
    check(players.length === 2 && players.includes(stream?.el), `the track isn't on one of the two pooled elements (${players.length} of them)`);
    await until(() => stream?.el && !stream.el.paused && stream.el.currentTime > 0.8, 4000, 'the wilderness track to stream');
    await wait(1200);
    // its 220 Hz sine at -18 dBFS, through the bus (0.5), partway into its 5 s fade
    facts.musicRms = level().toFixed(4);
    check(level() > 0.005, `the streamed track doesn't reach WebAudio: rms ${level()} on the music bus`);

    // 6. the camp's track, refused until a click as iOS would: silent until it plays, then fading in
    const realPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('no click yet', 'NotAllowedError'));
    };
    snd.enterArea('town');
    const camp = snd.music;
    check(camp?.el && camp.el !== stream.el && players.includes(camp.el), 'the camp\'s track is not on the other pooled element');
    await wait(1000);
    const held = camp?.gain.gain.value;
    check(camp?.el.paused && held === 0, `a track refused without a click: paused ${camp?.el.paused}, gain ${held}`);
    HTMLMediaElement.prototype.play = realPlay;
    // the click: Sfx.ensure plays it, and only then does it fade in
    snd.ensure();
    await until(() => !camp.el.paused && camp.el.currentTime > 0.3, 3000, 'the camp track to play after a click');
    const g1 = camp.gain.gain.value;
    await wait(1000);
    const g2 = camp.gain.gain.value;
    facts.lateFade = `${g1.toFixed(3)} then ${g2.toFixed(3)} a second later`;
    check(g1 < 0.3 && g2 > g1 + 0.1 && g2 < 0.7, `a track started late doesn't fade in from silence: ${facts.lateFade}`);

    // 7. a dungeon with neither file: the bed and the composed music; the camp's track lets go,
    // and both play on into the next floor
    snd.enterArea('crypt');
    await until(() => snd.failed.has('amb.dungeon') && snd.failed.has('music.dungeon'), 4000, 'the missing dungeon loop and track to be given up on');
    await wait(400);
    check(snd.music?.kind === 'dungeon', `a missing track: the dungeon plays ${snd.music?.kind ?? 'nothing'}, not its composed music`);
    check(!!snd.amb, 'no bed under the dungeon');
    const [score, bed] = [snd.music, snd.amb];
    snd.enterArea('cave');
    check(snd.music === score && snd.amb === bed, 'from the crypt to the cave the music or the bed started again');
    await wait(3400);
    for (const [n, st] of [['wilderness', stream], ['camp', camp]]) check(st?.el?.paused && !st.el.getAttribute('src'), `the ${n} track holds on to its file after fading out: paused ${st?.el?.paused}, src ${st?.el?.getAttribute('src')}`);
    check(snd.players.all.every((x) => !x.owner), 'a pooled element is still held after both tracks faded out');
    // the loop is let go too, and with nothing pinned a budget of 0 empties the cache
    snd.buffers.setBudget(0);
    facts.afterLeaving = `${snd.buffers.bytes} B at a budget of 0`;
    check(snd.buffers.bytes === 0, `${snd.buffers.bytes} bytes still decoded after leaving with a budget of 0`);
    snd.buffers.setBudget(32 * 1024 * 1024);
    // three tracks in quick succession: the third takes the element given out longest ago
    snd.enterArea('wild');
    const t1 = snd.music;
    snd.enterArea('town');
    const t2 = snd.music;
    snd.enterArea('wild');
    const t3 = snd.music;
    check(t3.el === t1.el && t2.el !== t1.el && t1.el.getAttribute('src') !== null, 'three tracks at once: the third did not take the first one\'s element');
    snd.enterArea('crypt');

    // 8. interrupted (WebKit, a phone call): the next click resumes it
    let resumed = 0;
    const realResume = ctx.resume;
    Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'interrupted' });
    ctx.resume = () => (resumed++, Promise.resolve());
    snd.ensure();
    delete ctx.state;
    ctx.resume = realResume;
    check(resumed === 1, `an interrupted AudioContext: ${resumed} resume() on a click`);

    // 9. how this browser decodes AAC's front: does it drop the encoder's priming, as the edit list asks?
    const raw = await (await fetch(url('loop.m4a'))).arrayBuffer();
    const dec = await new OfflineAudioContext(1, 44100, 44100).decodeAudioData(raw);
    const d = dec.getChannelData(0);
    facts.aacFront = `${dec.length} frames at ${dec.sampleRate} Hz (3 s is ${3 * dec.sampleRate}); first sound at frame ${d.findIndex((v) => Math.abs(v) > 0.01)}`;

    AudioBufferSourceNode.prototype.start = srcStart;
    OscillatorNode.prototype.start = oscStart;
    snd.buffers.decode = decode;
    snd.musicBus.disconnect(tap);
    snd.files = {};
    return { fails, facts };
  }, early);
  await shot('audio');
  for (const [k, v] of Object.entries(res.facts)) log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  log(`  served ${served} recordings; warnings:\n    ${warnings.join('\n    ') || 'none'}`);
  // each names the file, and what plays in its place
  const WANT = { 'monster.die': ['missing.wav', 'synthesized instead'], 'item.gold': ['corrupt.m4a', 'synthesized instead'], 'amb.dungeon': ['missing_loop.m4a', 'the synthesized bed instead'], 'music.dungeon': ['missing_music.m4a', 'the composed music instead'] };
  for (const [id, words] of Object.entries(WANT)) {
    const w = warnings.find((x) => x.startsWith(`sound ${id}:`));
    if (!w || !words.every((x) => w.includes(x))) res.fails.push(`the warning for ${id}: ${w ?? 'none'}, not naming ${words.join(' and ')}`);
  }
  log(res.fails.length ? `AUDIO FAIL ${res.fails.join(' | ')}` : `AUDIO OK ${res.facts.ctx}, takes ${res.facts.takesPlayed}, decoded in ${res.facts.decodeMs} ms, budget ${res.facts.budget2}, music rms ${res.facts.musicRms}, late fade ${res.facts.lateFade}`);
}
