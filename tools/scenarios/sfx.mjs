// Sound in the page (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/sfx.mjs --url "http://localhost:5174/?dev"
// Renders sounds through a fresh Sfx whose AudioContext is an OfflineAudioContext, Math.random
// seeded so that two renders synthesize the same samples, and compares each ear's peak: a sound at
// the listener is exactly as loud as the same sound played as UI; one to the side keeps its near
// ear and turns the far one down, all the way at the screen's edge; a far sound doesn't swallow a
// near one of the same recipe. Then the game's own Sfx: the renderer hands it the camera's view
// (the screen's right and half its width, after a resize and a zoom too), and the area's bed and
// music start with the AudioContext on the first click. Then recordings, served by this scenario
// as WAVs to a fresh Sfx given its own manifest: an effect decoded to mono, played as recorded a
// little off pitch, its variants taking turns, its leading silence (an AAC priming left in)
// skipped, synthesized until it's decoded and for good if its file is missing; the decoded buffers
// kept to a budget; an ambience loop played round its loop points with no gap, the bed when it's
// missing; a music track streamed through an <audio> element and crossfaded to the next area's
// composed music, which also stands in for a missing track; a line spoken at its own pitch once
// it's decoded, never over another, and not at all without a recording. And
// the composed music: the same samples for the same area, another piece for another, heard but
// quiet. Last, the game's own recordings against the synthesized sounds they replace, level for
// level, and the hero's lines against its loudest cues (shippedLevels). The last line is
// "SFX OK <summary>" or "SFX FAIL <reasons>".

/** a WAV of `secs` seconds, 16-bit, the same in both channels */
function wav(secs, fn, rate = 44100) {
  const n = Math.round(secs * rate);
  const b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, fn(i / rate))) * 32767);
    b.writeInt16LE(v, 44 + i * 4);
    b.writeInt16LE(v, 46 + i * 4);
  }
  return b;
}

const tone = (hz, amp) => (t) => amp * Math.sin(2 * Math.PI * hz * t);
/** the recordings this scenario serves under /audio/__test/; any other name there is a 404 */
const RECORDINGS = {
  'hit_a.wav': wav(0.4, tone(2000, 0.1)),
  'hit_b.wav': wav(0.4, tone(2500, 0.1)),
  // an effect as it would decode where a browser kept the AAC encoder's priming: 44 ms late
  'primed.wav': wav(0.4, (t) => (t < 0.049 ? 0 : tone(2000, 0.1)(t - 0.049))),
  // a loop between 0.5 and 2.5 s, silent before (an encoder's priming) and after (its padding)
  'loop.wav': wav(3, (t) => (t >= 0.5 && t < 2.5 ? tone(300, 0.3)(t) : 0)),
  'music.wav': wav(8, tone(220, 0.2)),
  // two lines, told apart by their pitch
  'line_a.wav': wav(0.6, tone(440, 0.2)),
  'line_b.wav': wav(0.6, tone(660, 0.2)),
};

export default async function (page, shot, log) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.route('**/audio/__test/**', (route) => {
    const body = RECORDINGS[new URL(route.request().url()).pathname.split('/').pop()];
    return body ? route.fulfill({ status: 200, contentType: 'audio/wav', body }) : route.fulfill({ status: 404, body: 'not here' });
  });

  /** the game's Sfx sees what the camera shows: its view against the camera's own right and edge */
  const viewCheck = (what) =>
    ev((what) => {
      const g = window.game;
      const r = window.renderer;
      const v = g.sfx.view;
      if (!v) return [`${what}: the renderer gave Sfx no view`];
      const fails = [];
      const e = r.camera.matrixWorld.elements;
      const len = Math.hypot(e[0], e[2]);
      if (Math.abs(e[0] / len - v.right.x) > 1e-6 || Math.abs(e[2] / len - v.right.z) > 1e-6) fails.push(`${what}: Sfx's right ${JSON.stringify(v.right)}, the camera's (${e[0] / len}, ${e[2] / len})`);
      if (Math.abs(v.halfWidth - r.camera.right) > 1e-9) fails.push(`${what}: Sfx's half width ${v.halfWidth}, the camera's ${r.camera.right}`);
      // halfWidth metres along `right` from the hero is the screen's edge from where the hero is drawn
      const p = g.player.pos;
      const a = r.projectP(p, 0);
      const b = r.projectP({ x: p.x + v.right.x * v.halfWidth, z: p.z + v.right.z * v.halfWidth }, 0);
      if (Math.abs(b.x - a.x - r.width / 2) > 1 || Math.abs(b.y - a.y) > 1) fails.push(`${what}: the view's edge is drawn ${b.x - a.x}, ${b.y - a.y} px from the hero, not ${r.width / 2}, 0`);
      return fails;
    }, what);

  const fails = [];
  fails.push(...(await viewCheck('at the start')));
  await page.setViewportSize({ width: 700, height: 900 });
  await page.waitForTimeout(400);
  fails.push(...(await viewCheck('a narrow window')));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);
  // zoom out with the wheel, as far as it goes
  await ev(() => (window.game.input.wheel = 20));
  await page.waitForTimeout(1500);
  const zoomed = await ev(() => window.renderer.zoom);
  fails.push(...(await viewCheck(`zoomed to ${zoomed.toFixed(2)}`)));

  // the bed: the game entered the camp before there was an AudioContext, and it starts on the first click
  const before = await ev(() => ({ ctx: !!window.game.sfx.ctx, area: window.game.sfx.area, theme: window.game.level.layout.theme.key }));
  if (before.ctx) fails.push('an AudioContext before any click');
  if (before.area !== before.theme) fails.push(`Sfx's area is ${before.area}, the level's ${before.theme}`);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
  const after = await ev(() => ({ ctx: window.game.sfx.ctx?.state ?? null, bed: !!window.game.sfx.amb, music: window.game.sfx.music?.kind ?? null }));
  if (!after.ctx) fails.push('no AudioContext after a click');
  if (!after.bed) fails.push(`no bed playing in ${before.area} after the first click`);
  if (before.theme === 'town' && after.music !== 'town') fails.push(`the camp plays ${after.music} music, not the camp's`);

  const res = await ev(async () => {
    const g = window.game;
    const Sfx = g.sfx.constructor;
    const view = g.sfx.view;
    const RATE = 44100;
    const fails = [];
    const facts = {};
    const L = { x: 10, z: 10 };
    const at = (m, up = 0) => ({ x: L.x + view.right.x * m - view.right.z * up, z: L.z + view.right.z * m + view.right.x * up });

    /** a fresh Sfx rendering offline what `play` plays into it: each ear's peak, and its voices */
    async function render(play, before) {
      const realAC = window.AudioContext;
      const realRandom = Math.random;
      let seed = 20261026;
      Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      window.AudioContext = function () {
        return new OfflineAudioContext(2, RATE * 2, RATE);
      };
      let sfx;
      try {
        sfx = new Sfx();
        // the synthesized recipes, whatever recordings the game ships
        sfx.files = {};
        before?.(sfx);
        sfx.ensure();
        sfx.setView(view.right, view.halfWidth);
        sfx.setListener(L);
        play(sfx);
      } finally {
        window.AudioContext = realAC;
        Math.random = realRandom;
      }
      const voices = sfx.voices.length;
      const buf = await sfx.ctx.startRendering();
      const peak = (ch) => buf.getChannelData(ch).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      return { l: peak(0), r: peak(1), voices, bed: !!sfx.amb };
    }
    const near = (a, b, rel = 1e-4) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-9);
    const PAN_MAX = 0.7;

    for (const id of ['combat.hit', 'item.drop_unique', 'monster.die', 'player.level_up']) {
      const ui = await render((s) => s.play(id));
      const here = await render((s) => s.play(id, { pos: L }));
      facts[id] = ui.l.toFixed(4);
      if (!(ui.l > 0.001)) fails.push(`${id}: silent as UI (${ui.l})`);
      if (!near(ui.l, ui.r)) fails.push(`${id}: a UI sound isn't in the middle: ${ui.l} ${ui.r}`);
      if (!near(here.l, ui.l) || !near(here.r, ui.r)) fails.push(`${id}: at the listener ${here.l.toFixed(5)} / ${here.r.toFixed(5)}, as UI ${ui.l.toFixed(5)} / ${ui.r.toFixed(5)}`);
      // 3 m to the right: still full volume, the right ear unchanged, the left one down by the pan
      const pan = (3 / view.halfWidth) * PAN_MAX;
      const right = await render((s) => s.play(id, { pos: at(3) }));
      if (!near(right.r, ui.r)) fails.push(`${id}: 3 m right, the near ear ${right.r.toFixed(5)}, as UI ${ui.r.toFixed(5)}`);
      if (!near(right.l / right.r, 1 - pan, 1e-3)) fails.push(`${id}: 3 m right, the ears ${(right.l / right.r).toFixed(4)} apart, not ${(1 - pan).toFixed(4)}`);
      const left = await render((s) => s.play(id, { pos: at(-3) }));
      if (!near(left.l, ui.l) || !near(left.r / left.l, 1 - pan, 1e-3)) fails.push(`${id}: 3 m left ${left.l.toFixed(5)} / ${left.r.toFixed(5)}`);
      // up the screen: not panned
      const up = await render((s) => s.play(id, { pos: at(0, 3) }));
      if (!near(up.l, ui.l) || !near(up.r, ui.r)) fails.push(`${id}: 3 m up the screen ${up.l.toFixed(5)} / ${up.r.toFixed(5)}`);
    }
    // at the screen's edge and past it: panned all the way, no further, and never louder than UI
    // (a critical sound, heard however far that is)
    const ui = await render((s) => s.play('player.level_up'));
    for (const k of [1, 1.6, 3]) {
      const e = await render((s) => s.play('player.level_up', { pos: at(view.halfWidth * k) }));
      if (!near(e.l / e.r, 1 - PAN_MAX, 1e-3)) fails.push(`${k}× the edge: the ears ${(e.l / e.r).toFixed(4)} apart, not ${1 - PAN_MAX}`);
      if (!(e.r <= ui.r * 1.0001)) fails.push(`${k}× the edge: louder than UI (${e.r} > ${ui.r})`);
    }
    // the same recipe at once: the louder one is the one heard
    const farFirst = await render((s) => {
      s.play('monster.die', { pos: at(0, 20) });
      s.play('monster.die', { pos: L });
    });
    if (farFirst.voices !== 2) fails.push(`a near death after a far one in the same instant: ${farFirst.voices} voice(s)`);
    const nearFirst = await render((s) => {
      s.play('monster.die', { pos: L });
      s.play('monster.die', { pos: at(0, 20) });
    });
    if (nearFirst.voices !== 1) fails.push(`a far death after a near one in the same instant: ${nearFirst.voices} voices`);
    const shared = await render((s) => {
      s.play('item.gold', { pos: L });
      s.play('ui.coins');
    });
    if (shared.voices !== 1) fails.push(`two ids of one recipe in the same instant: ${shared.voices} voices`);
    // an area entered before the AudioContext: its bed starts with it
    const early = await render(
      () => {},
      (s) => s.enterArea('crypt'),
    );
    if (!early.bed) fails.push('the crypt entered before ensure(): no bed after it');
    return { fails, facts };
  });
  const rec = await ev(async () => {
    const g = window.game;
    const Sfx = g.sfx.constructor;
    const RATE = 44100;
    const fails = [];
    const facts = {};
    const check = (ok, what) => ok || fails.push(what);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const url = (f) => `/audio/__test/${f}`;
    const MANIFEST = {
      'combat.hit': { files: ['__test/hit_a.wav', '__test/hit_b.wav'] },
      'monster.die': { files: ['__test/missing.wav'] },
      'env.barrel': { files: ['__test/primed.wav'] },
      'amb.town': { files: ['__test/loop.wav'], loop: { start: 0.5, end: 2.5 } },
      'amb.wild': { files: ['__test/missing_loop.wav'] },
      'voice.paladin.no_mana': { files: ['__test/line_a.wav'] },
      'voice.paladin.bag_full': { files: ['__test/line_b.wav'] },
      'voice.paladin.unique': { files: ['__test/missing_line.wav'] },
    };
    /** a fresh Sfx on an OfflineAudioContext `secs` long, with the scenario's recordings */
    function offline(secs, files = MANIFEST) {
      const realAC = window.AudioContext;
      window.AudioContext = function () {
        return new OfflineAudioContext(2, Math.round(RATE * secs), RATE);
      };
      try {
        const s = new Sfx();
        s.files = files;
        s.ensure();
        return s;
      } finally {
        window.AudioContext = realAC;
      }
    }
    const stats = (d, from = 0, to = d.length) => {
      let peak = 0;
      let sum = 0;
      let crossings = 0;
      let first = -1;
      let last = -1;
      for (let i = from; i < to; i++) {
        peak = Math.max(peak, Math.abs(d[i]));
        sum += d[i] * d[i];
        if (i > from && (d[i - 1] < 0) !== (d[i] < 0)) {
          crossings++;
          if (first < 0) first = i;
          last = i;
        }
      }
      // a pure tone's frequency, from its zero crossings
      const hz = crossings > 1 ? ((crossings - 1) / 2) * (RATE / (last - first)) : 0;
      return { peak, rms: Math.sqrt(sum / (to - from)), hz };
    };
    const render = async (s) => (await s.ctx.startRendering()).getChannelData(0);

    // an effect: decoded to one channel, played as recorded and a little off its pitch
    let s = offline(0.6);
    await s.preload(['combat.hit']);
    const a = s.buffers.get(url('hit_a.wav'));
    const b = s.buffers.get(url('hit_b.wav'));
    check(a && b && a.numberOfChannels === 1 && b.numberOfChannels === 1, `the hit's takes decoded to ${a?.numberOfChannels} and ${b?.numberOfChannels} channels, not 1`);
    check(s.buffers.bytes === 2 * Math.round(0.4 * RATE) * 4, `two mono takes of 0.4 s take ${s.buffers.bytes} bytes`);
    const hzs = [];
    for (let k = 0; k < 6; k++) {
      s = offline(0.6);
      await s.preload(['combat.hit']);
      s.play('combat.hit');
      const st = stats(await render(s), 0, Math.round(0.35 * RATE));
      hzs.push(Math.round(st.hz));
      const base = Math.abs(st.hz - 2000) < Math.abs(st.hz - 2500) ? 2000 : 2500;
      check(Math.abs(st.hz / base - 1) <= 0.045, `a recorded hit plays at ${st.hz.toFixed(0)} Hz, more than 4% off ${base}`);
      // the take's 0.1, times the hit's level (0.8) and the master's (0.7): below the compressor
      check(Math.abs(st.peak - 0.1 * 0.8 * 0.7) < 0.006, `a recorded hit peaks at ${st.peak.toFixed(4)}, not ${(0.1 * 0.8 * 0.7).toFixed(4)}`);
    }
    facts.hit = hzs.join('/');
    check(new Set(hzs).size >= 4, `six recorded hits, pitches ${hzs}: not varied`);
    // the takes take turns
    s = offline(0.6);
    await s.preload(['combat.hit']);
    let prev = null;
    for (let k = 0; k < 10; k++) {
      const v = s.variant('combat.hit');
      check(v && v.buf !== prev, `take ${k}: the same one twice running`);
      prev = v?.buf;
    }
    // before it's decoded: synthesized, and decoding starts
    s = offline(0.6);
    s.play('combat.hit');
    const synth = stats(await render(s), 0, Math.round(0.35 * RATE));
    check(synth.peak > 0.01 && synth.hz < 1500, `the first hit, before its takes are decoded: ${JSON.stringify(synth)}, not the synthesized one`);
    await s.preload(['combat.hit']);
    check(s.buffers.has(url('hit_a.wav')) && s.buffers.has(url('hit_b.wav')), 'the first play did not decode its takes');
    // a missing file: synthesized for good
    s = offline(0.6);
    await s.preload(['monster.die']);
    check(s.failed.has('monster.die'), 'a missing file is not given up on');
    s.play('monster.die');
    check(stats(await render(s)).peak > 0.01, 'a sound whose file is missing is silent, not synthesized');
    // the priming left in: skipped, so the sound starts as one with none does, but for the 5 ms of
    // lead the pipeline leaves before a sound (src/audio/buffers.ts LEAD), not 44 ms later
    const onsetOf = async (id) => {
      s = offline(0.6);
      await s.preload([id]);
      s.play(id);
      return (await render(s)).findIndex((v) => Math.abs(v) > 0.005) / RATE;
    };
    const late = (await onsetOf('env.barrel')) - (await onsetOf('combat.hit'));
    facts.primedLate = `${(late * 1000).toFixed(1)} ms`;
    check(late > 0.003 && late < 0.007, `an effect with 44 ms of priming left in sounds ${(late * 1000).toFixed(1)} ms after one with none, not 5`);
    // the budget: room for one take, so the other goes
    s = offline(0.6);
    s.buffers.setBudget(Math.round(0.4 * RATE) * 4);
    await s.preload(['combat.hit']);
    const kept = ['hit_a.wav', 'hit_b.wav'].filter((f) => s.buffers.has(url(f)));
    check(kept.length === 1 && s.buffers.bytes <= s.buffers.budget, `a budget of one take kept ${kept}, ${s.buffers.bytes} bytes`);

    // an ambience loop: kept in stereo, round its loop points, so the silence either side never plays
    s = offline(8);
    s.musicBus.gain.value = 0;
    await s.preload(['amb.town']);
    check(s.buffers.get(url('loop.wav'))?.numberOfChannels === 2, 'an ambience loop was folded to mono');
    s.enterArea('town');
    await wait(50);
    const loop = await render(s);
    const W = Math.round(0.05 * RATE);
    let lo = Infinity;
    let hi = 0;
    for (let i = Math.round(2.1 * RATE); i + W <= loop.length; i += W) {
      const r = stats(loop, i, i + W).rms;
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    const whole = stats(loop, Math.round(2.1 * RATE));
    facts.loop = `${whole.rms.toFixed(4)} rms ${whole.hz.toFixed(0)} Hz`;
    check(lo > 0.85 * hi, `the loop dips to ${lo.toFixed(4)} from ${hi.toFixed(4)} over 50 ms: it plays its silence`);
    // the take's 0.3 sine, times the ambience bus (0.35) and the master (0.7); no bed under it
    check(Math.abs(whole.rms - (0.3 / Math.SQRT2) * 0.35 * 0.7) < 0.004 && Math.abs(whole.hz - 300) < 6, `the loop: ${JSON.stringify(whole)}, not the recording alone`);
    // a line: said once it's decoded, at its own pitch; one asked for meanwhile isn't said over it
    s = offline(1.5);
    s.play('voice.paladin.no_mana');
    s.play('voice.paladin.bag_full');
    await wait(150);
    const said = s.voices.filter((v) => v.id.startsWith('voice.')).map((v) => v.id);
    const line = stats(await render(s), 0, Math.round(0.5 * RATE));
    facts.line = `${line.hz.toFixed(1)} Hz, peak ${line.peak.toFixed(4)}`;
    check(said.join() === 'voice.paladin.no_mana', `two lines asked for at once: ${said.join(' ') || 'none'} said, not the first alone`);
    check(Math.abs(line.hz / 440 - 1) < 0.005, `a line plays at ${line.hz.toFixed(1)} Hz, not its own 440`);
    // as loud as its take's 0.2 times the line's level and the master's
    const LINE_VOL = (await import('/src/audio/sounds.ts')).LINE.vol;
    check(Math.abs(line.peak - 0.2 * LINE_VOL * 0.7) < 0.006, `a line peaks at ${line.peak.toFixed(4)}, not ${(0.2 * LINE_VOL * 0.7).toFixed(4)}`);
    // one with no recording isn't said, nor one whose file is missing, and neither keeps another from it
    s = offline(1.5);
    s.play('voice.paladin.level_up');
    s.play('voice.paladin.unique');
    await wait(150);
    check(s.failed.has('voice.paladin.unique'), 'a missing line is not given up on');
    s.play('voice.paladin.bag_full');
    await wait(150);
    const after = s.voices.filter((v) => v.id.startsWith('voice.')).map((v) => v.id);
    check(after.join() === 'voice.paladin.bag_full', `lines with no recording, then one with: ${after.join(' ') || 'none'} said`);
    check(Math.abs(stats(await render(s), 0, Math.round(0.5 * RATE)).hz / 660 - 1) < 0.005, 'the line said after a missing one is not the one asked for');

    // a missing loop: the bed
    s = offline(2);
    s.musicBus.gain.value = 0;
    s.enterArea('wild');
    await wait(100);
    check(s.failed.has('amb.wild') && !!s.amb, 'a missing ambience loop is not given up on');
    check(stats(await render(s)).rms > 0.001, 'no bed where the ambience loop is missing');

    // the composed music: heard, quiet, the same for the same area and not for another
    const music = {};
    const compose = async (area) => {
      const m = offline(12, {});
      m.ambBus.gain.value = 0;
      m.enterArea(area);
      m.music.advance(12);
      return { kind: m.music.kind, data: await render(m) };
    };
    for (const [area, kind] of [['town', 'town'], ['wild', 'outdoor'], ['crypt', 'dungeon']]) {
      const one = await compose(area);
      const st = stats(one.data);
      music[area] = `${(20 * Math.log10(st.rms)).toFixed(1)}/${(20 * Math.log10(st.peak)).toFixed(1)}`;
      check(one.kind === kind, `${area} composes ${one.kind}, not ${kind}`);
      check(st.rms > 0.001 && st.peak < 0.1 && st.rms < 0.02, `${area}'s music: rms ${st.rms.toFixed(5)}, peak ${st.peak.toFixed(4)}: silent or too loud`);
      if (area === 'crypt') {
        // the same but for rounding in the reverb's FFT (about 1e-8)
        const apart = (x, y) => x.reduce((m, v, i) => Math.max(m, Math.abs(v - y[i])), 0);
        const again = apart((await compose('crypt')).data, one.data);
        check(again < 1e-6, `the crypt's music differs from one render to the next, by up to ${again}`);
        const cave = apart((await compose('cave')).data, one.data);
        check(cave > 1e-3, `the cave's music is the crypt's (${cave} apart)`);
      }
    }
    facts.music = music;

    // a recorded track: streamed, then crossfaded to the next area's composed music
    const live = new Sfx();
    live.files = { 'music.town': { files: ['__test/music.wav'] }, 'music.wild': { files: ['__test/missing_music.wav'] } };
    live.enterArea('town');
    live.ensure();
    await wait(1200);
    const stream = live.music;
    check(stream?.el && !stream.el.paused && stream.el.currentTime > 0.3, `the camp's track isn't playing: ${stream?.el ? `paused ${stream.el.paused}, at ${stream.el.currentTime}` : 'no stream'}`);
    check(stream?.gain?.gain.value > 0.05, `the camp's track isn't fading in: ${stream?.gain?.gain.value}`);
    live.enterArea('crypt');
    check(live.music?.kind === 'dungeon', `the crypt after the camp plays ${live.music?.kind}`);
    await wait(3500);
    check(stream?.el?.paused && !stream.el.getAttribute('src'), 'the camp\'s track still holds its file after fading out');
    live.enterArea('wild');
    await wait(1500);
    check(live.failed.has('music.wild') && live.music?.kind === 'outdoor', `a missing track: ${live.music?.kind ?? 'nothing'} plays, given up on ${live.failed.has('music.wild')}`);
    live.music?.stop(0);
    live.amb?.stop();
    await live.ctx.close();
    return { fails, facts };
  });
  const lv = await shippedLevels(ev);
  fails.push(...res.fails, ...rec.fails, ...lv.fails, ...errors);
  await shot('sfx');
  log(fails.length ? `SFX FAIL ${fails.join(' | ')}` : `SFX OK peaks as UI ${JSON.stringify(res.facts)}; recorded ${JSON.stringify(rec.facts)}; shipped against what they replace ${JSON.stringify(lv.facts)}; zoom ${zoomed.toFixed(2)}`);
}

/** how far a shipped recording may be from the level of what it replaces, in dB */
const MATCH_DB = 3;
/** the cues a hero's line is as loud as: its level up, a unique's stinger */
const LINE_CUES = ['player.level_up', 'item.drop_unique'];
/** how far a line may be from the loudest of them, in dB: the lines are normalized alike, but speech isn't a fanfare */
const LINE_MATCH_DB = 4;
/** the level themes standing in for areas (src/audio/sounds.ts), to find the area a loop is played in */
const AREAS = ['town', 'wild', 'crypt', 'cave', 'ice', 'hell'];

/**
 * The game's own recordings (src/audio/files.ts) against what they replace, rendered offline through
 * the whole chain the game plays them by (their level and gain, the master, its compressor): an
 * effect against its synthesized recipe, as UI, by its momentary loudness (BS.1770's 400 ms, so a
 * short sound counts as heard); an area's ambience loops, by day and by night, against its
 * synthesized bed, integrated once both have faded in, the music muted. The loudness is measured here
 * in Node with the meter the pipeline normalizes by (tools/audio/dsp.mjs). Each must be within
 * MATCH_DB: the synthesized mix is the one balanced by ear, and a recording normalized to -16 LUFS
 * once played 23 dB over its recipe. The heroes' lines (HERO_LINES) have nothing synthesized to match:
 * each, played as the game says it (LINE), is held to LINE_MATCH_DB of the loudest of the cues they
 * go with (LINE_CUES, synthesized), as the hero's loudest sounds. Any other shipped id the game can't
 * play this way fails: nothing vouches for it.
 */
async function shippedLevels(ev) {
  const { RATE, loudness } = await import('../audio/dsp.mjs');
  const { SOUNDS, HERO_LINES, LINE, areaSound } = await import('../../src/audio/sounds.ts');
  const LINE_VOL = LINE.vol;
  const { CLASSES } = await import('../../src/data/classes.ts');
  const files = await ev(() => window.game.sfx.files);
  const fails = [];
  const facts = {};
  const jobs = [];
  const loops = new Map();
  const heroLines = [];
  /** voice.<class>.<line>, a moment the game has a line for */
  const heroLine = (id) => {
    const [v, who, line, more] = id.split('.');
    return v === 'voice' && who in CLASSES && HERO_LINES.includes(line) && more === undefined;
  };
  for (const id of Object.keys(files)) {
    if (id in SOUNDS) jobs.push({ kind: 'sfx', id, ids: [id] });
    else if (id.startsWith('amb.')) {
      const day = AREAS.find((a) => areaSound(a).amb?.includes(id));
      const night = AREAS.find((a) => areaSound(a).night?.includes(id));
      if (!day && !night) fails.push(`shipped ${id}: no area plays it`);
      else {
        const at = day ? `${day} by day` : `${night} by night`;
        loops.set(at, [...(loops.get(at) ?? []), id]);
      }
    } else if (id.startsWith('music.')) facts[id] = 'streamed music: not compared';
    else if (heroLine(id)) heroLines.push(id);
    else fails.push(`shipped ${id}: nothing in the game plays it`);
  }
  for (const id of heroLines) jobs.push({ kind: 'line', id, ids: [id] });
  for (const id of LINE_CUES) jobs.push({ kind: 'cue', id, ids: [] });
  for (const [at, ids] of loops) jobs.push({ kind: 'amb', id: ids.join('+'), area: at.split(' ')[0], night: at.endsWith('night'), ids });
  const out = await ev(
    async ({ jobs, RATE }) => {
      const Sfx = window.game.sfx.constructor;
      const files = window.game.sfx.files;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const b64 = (f) => {
        const u = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
        let s = '';
        for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
        return btoa(s);
      };
      /** `go` run with Math.random seeded, so the recipe and the take's pitch come out the same each time */
      const seeded = (go) => {
        const real = Math.random;
        let seed = 20261026;
        Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        try {
          return go();
        } finally {
          Math.random = real;
        }
      };
      async function render(job, recorded) {
        const secs = job.kind === 'amb' ? 8 : job.kind === 'sfx' || job.kind === 'cue' ? 3 : 4;
        const realAC = window.AudioContext;
        window.AudioContext = function () {
          return new OfflineAudioContext(2, RATE * secs, RATE);
        };
        let s;
        try {
          s = seeded(() => {
            const s = new Sfx();
            s.files = recorded ? Object.fromEntries(job.ids.map((id) => [id, files[id]])) : {};
            s.ensure();
            return s;
          });
        } finally {
          window.AudioContext = realAC;
        }
        s.musicBus.gain.value = 0;
        if (recorded) await s.preload(job.ids);
        const failed = job.ids.filter((id) => s.failed.has(id));
        // midnight, for the night's loops
        if (job.night) s.setTime(0);
        seeded(() => (job.kind === 'amb' ? s.enterArea(job.area) : s.play(job.id)));
        // the loops start once their (preloaded) takes resolve, a line once its take is checked as decoded
        if (job.kind !== 'sfx' && job.kind !== 'cue') await wait(50);
        const buf = await s.ctx.startRendering();
        return { failed, chs: [b64(buf.getChannelData(0)), b64(buf.getChannelData(1))] };
      }
      const res = [];
      for (const job of jobs) {
        const one = { ...job, gain: job.ids.map((id) => files[id].gain ?? 1) };
        // a line has nothing synthesized, a cue is only its synthesized self
        if (job.kind !== 'cue') one.rec = await render(job, true);
        if (job.kind !== 'line') one.synth = await render(job, false);
        res.push(one);
      }
      return res;
    },
    { jobs, RATE },
  );
  const pcm = (b64) => {
    const b = Buffer.from(b64, 'base64');
    return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  };
  const momentary = (chs) => loudness(chs.map(pcm), 'momentary');
  const cues = out.filter((r) => r.kind === 'cue').map((r) => ({ id: r.id, lufs: momentary(r.synth.chs) }));
  const cue = cues.reduce((a, b) => (b.lufs > a.lufs ? b : a), cues[0]);
  const lines = [];
  for (const r of out) {
    if (r.kind !== 'line' || r.rec.failed.length) continue;
    const d = momentary(r.rec.chs) - cue.lufs;
    lines.push(d);
    if (!(Math.abs(d) <= LINE_MATCH_DB)) fails.push(`shipped ${r.id}: ${d.toFixed(1)} dB ${d > 0 ? 'louder' : 'quieter'} than ${cue.id} (${cue.lufs.toFixed(1)} LUFS momentary): LINE.vol ${+(LINE_VOL * 10 ** (-d / 20)).toPrecision(2)} in src/audio/sounds.ts would match`);
  }
  if (lines.length) {
    const mean = lines.reduce((a, b) => a + b, 0) / lines.length;
    facts['voice.*'] = `${lines.length} hero lines ${Math.min(...lines).toFixed(1)} to ${Math.max(...lines).toFixed(1)} dB (mean ${mean.toFixed(1)}) against ${cue.id}, ${cue.lufs.toFixed(1)} LUFS momentary`;
  }
  for (const r of out) {
    if (r.kind === 'cue') continue;
    if (r.rec.failed.length) {
      fails.push(`shipped ${r.rec.failed.join(', ')}: wouldn't load`);
      continue;
    }
    const level = (chs) => {
      const c = chs.map(pcm);
      return r.kind === 'sfx' ? loudness(c, 'momentary') : loudness(c.map((x) => x.subarray(3 * RATE)), 'integrated');
    };
    if (r.kind === 'line') continue;
    const rec = level(r.rec.chs);
    const synth = level(r.synth.chs);
    const d = rec - synth;
    const against = r.kind === 'sfx' ? 'its synthesized sound' : `the ${r.area} bed${r.night ? ' by night' : ''}`;
    facts[r.id] = `${rec.toFixed(1)} vs ${synth.toFixed(1)} LUFS ${r.kind === 'sfx' ? 'momentary' : 'integrated'} (${d >= 0 ? '+' : ''}${d.toFixed(1)} dB, gain ${r.gain.join('/')})`;
    if (!(Math.abs(d) <= MATCH_DB)) {
      // the gain that would match, the compressor aside
      const want = r.gain.map((g) => +(g * 10 ** (-d / 20)).toPrecision(2));
      fails.push(`shipped ${r.id}: ${d.toFixed(1)} dB ${d > 0 ? 'louder' : 'quieter'} than ${against} (${facts[r.id]}): gain ${want.join('/')} in tools/audio/list.mjs would match`);
    }
  }
  return { fails, facts };
}
