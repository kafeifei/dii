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
// little off pitch, its variants taking turns, synthesized until it's decoded and for good if its
// file is missing; the decoded buffers kept to a budget; an ambience loop played round its loop
// points with no gap, the bed when it's missing; a music track streamed through an <audio> element
// and crossfaded to the next area's composed music, which also stands in for a missing track. And
// the composed music: the same samples for the same area, another piece for another, heard but
// quiet. The last line is "SFX OK <summary>" or "SFX FAIL <reasons>".

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
  // a loop between 0.5 and 2.5 s, silent before (an encoder's priming) and after (its padding)
  'loop.wav': wav(3, (t) => (t >= 0.5 && t < 2.5 ? tone(300, 0.3)(t) : 0)),
  'music.wav': wav(8, tone(220, 0.2)),
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
      'amb.town': { files: ['__test/loop.wav'], loop: { start: 0.5, end: 2.5 } },
      'amb.wild': { files: ['__test/missing_loop.wav'] },
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
  fails.push(...res.fails, ...rec.fails, ...errors);
  await shot('sfx');
  log(fails.length ? `SFX FAIL ${fails.join(' | ')}` : `SFX OK peaks as UI ${JSON.stringify(res.facts)}; recorded ${JSON.stringify(rec.facts)}; zoom ${zoomed.toFixed(2)}`);
}
