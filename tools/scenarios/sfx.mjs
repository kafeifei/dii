// Sound in the page (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/sfx.mjs --url "http://localhost:5174/?dev"
// Renders sounds through a fresh Sfx whose AudioContext is an OfflineAudioContext, Math.random
// seeded so that two renders synthesize the same samples, and compares each ear's peak: a sound at
// the listener is exactly as loud as the same sound played as UI; one to the side keeps its near
// ear and turns the far one down, all the way at the screen's edge; a far sound doesn't swallow a
// near one of the same recipe; a bed plays on into the next area when it's the same bed (the
// areas made by the game's own Level). Then the game's own Sfx: the renderer hands it the camera's view
// (the screen's right and half its width, after a resize and a zoom too), and the area's bed and
// music start with the AudioContext on the first click. Then recordings, served by this scenario
// as WAVs to a fresh Sfx given its own manifest: an effect decoded to mono, played as recorded a
// little off pitch, its variants taking turns, its leading silence (an AAC priming left in)
// skipped, synthesized until it's decoded and for good if its file is missing; the decoded buffers
// kept to a budget; an ambience loop played round its loop points with no gap, the bed when it's
// missing; a music track streamed through an <audio> element, faded in to its gain and crossfaded
// to the next area's composed music, which also stands in for a missing track; a line spoken at its own pitch once
// it's decoded, never over another, and not at all without a recording; a townsperson's line said at
// once over the hero's (cut off), as loud as NPC_LINE, its length told as it starts, the hero kept
// from speaking over it, and silent within SPEECH_CUT of being stopped; one whose recording comes
// late joining at the point its line's clock has reached (the take's own change of pitch heard
// where the clock puts it), faded in; a greeting said beside the hero's line, both heard whole, and
// the hero speaking over a greeting. And
// the composed music: the same samples for the same area, another piece for another, heard but
// quiet. Last, the game's own recordings against the synthesized sounds they replace, level for
// level, its music against the music composed in its place and under the ambience and the fighting
// it's heard with, every monster's death about as loud as a zombie's and well over the music, and
// every take of the hero's lines, and of the townsfolk's, against its loudest cues (shippedLevels).
// The last line is "SFX OK <summary>" or "SFX FAIL <reasons>".

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
  // a townsperson's line, told apart from the hero's by its pitch
  'speech.wav': wav(1.2, tone(330, 0.2)),
  // one whose pitch changes half a second in: where it joins its line late is heard by where that falls
  'speech2.wav': wav(1.2, (t) => (t < 0.5 ? tone(330, 0.2)(t) : tone(550, 0.2)(t))),
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
  const before = await ev(() => ({ ctx: !!window.game.sfx.ctx, area: window.game.sfx.area?.name, kind: window.game.area?.kind, same: window.game.sfx.area === window.game.area }));
  if (before.ctx) fails.push('an AudioContext before any click');
  if (!before.same) fails.push(`Sfx's area is ${before.area}, not the hero's`);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
  // the music: the camp's track streamed (the file it plays), or the camp's composed music
  const after = await ev(() => {
    const s = window.game.sfx;
    return { ctx: s.ctx?.state ?? null, bed: !!s.amb, music: s.music?.kind ?? s.music?.el?.getAttribute('src') ?? null, track: s.files['music.town']?.files ?? null };
  });
  if (!after.ctx) fails.push('no AudioContext after a click');
  if (!after.bed) fails.push(`no bed playing in ${before.area} after the first click`);
  const campMusic = after.track ? after.track.some((f) => after.music?.endsWith(`/audio/${f}`)) : after.music === 'town';
  if (before.kind === 'town' && !campMusic) fails.push(`the camp plays ${after.music} music, not the camp's (${after.track?.join(', ') ?? 'town'})`);

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
    // today's first maps' areas, from the game's own Level: the camp, the wilderness, two dungeon floors
    const Level = g.level.constructor;
    const areas = [];
    for (let d = 0; areas.filter((a) => a.kind === 'dungeon').length < 2; d++) {
      const lv = new Level(d, 1);
      areas.push(lv.areaAt(lv.layout.start.x, lv.layout.start.z));
    }
    const camp = areas[0];
    const wild = areas.find((a) => a.kind === 'outdoor');
    const [floor1, floor2] = areas.filter((a) => a.kind === 'dungeon');

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
      (s) => s.enterArea(floor1),
    );
    if (!early.bed) fails.push(`${floor1.name} entered before ensure(): no bed after it`);
    // from area to area the same bed plays on (floor to floor); another one takes over (the camp's
    // fire gives way to the wilderness's wind)
    const kept = [];
    await render((s) => {
      for (const a of [floor1, floor2, camp, wild, floor1]) {
        const last = s.amb;
        s.enterArea(a);
        if (last) kept.push(`${a.key} ${s.amb === last ? 'kept' : 'new'}`);
      }
    });
    const want = `${floor2.key} kept,${camp.key} new,${wild.key} new,${floor1.key} new`;
    if (kept.join() !== want) fails.push(`walking the areas the beds went ${kept.join()}, want ${want}`);
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
    const { areaDef, dungeonArea, CAMP_AREA, WILD_AREA } = await import('/src/world/areas.ts');
    const [camp, wild, crypt, cave] = [CAMP_AREA, WILD_AREA, dungeonArea(1), dungeonArea(5)].map(areaDef);
    const MANIFEST = {
      'combat.hit': { files: ['__test/hit_a.wav', '__test/hit_b.wav'] },
      'monster.die': { files: ['__test/missing.wav'] },
      'env.barrel': { files: ['__test/primed.wav'] },
      'amb.town': { files: ['__test/loop.wav'], loop: { start: 0.5, end: 2.5 } },
      'amb.wild': { files: ['__test/missing_loop.wav'] },
      'voice.paladin.no_mana': { files: ['__test/line_a.wav'] },
      'voice.paladin.bag_full': { files: ['__test/line_b.wav'] },
      'voice.paladin.unique': { files: ['__test/missing_line.wav'] },
      'voice.akara.test_line': { files: ['__test/speech.wav'] },
      'voice.akara.test_late': { files: ['__test/speech2.wav'], secs: [1.2] },
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
    s.enterArea(camp);
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
    // a townsperson's line (Sfx.speak): at once over the hero's, which is cut off; as loud as
    // NPC_LINE; its take's length told as it starts; the hero kept from speaking over it; stopped
    // 0.6 s in, silent within SPEECH_CUT, and its handle saying how far it got
    const { SPEECH_CUT } = await import('/src/audio/sfx.ts');
    const NPC_VOL = (await import('/src/audio/sounds.ts')).NPC_LINE.vol;
    s = offline(1.5);
    s.play('voice.paladin.no_mana');
    await wait(150);
    const sp = s.speak('voice.akara.test_line');
    const spSecs = await Promise.race([sp.started, wait(1500).then(() => 'never')]);
    s.play('voice.paladin.bag_full');
    await wait(150);
    const over = s.voices.filter((v) => v.id === 'voice.paladin.bag_full').length;
    void s.ctx.suspend(0.6).then(() => {
      sp.stop();
      void s.ctx.resume();
    });
    const spoke = await render(s);
    const during = stats(spoke, Math.round(0.1 * RATE), Math.round(0.55 * RATE));
    const gone = stats(spoke, Math.round((0.6 + SPEECH_CUT + 0.01) * RATE), Math.round(1.4 * RATE));
    facts.speech = `${during.hz.toFixed(1)} Hz, peak ${during.peak.toFixed(4)}, ${gone.peak.toExponential(1)} after it's stopped at ${sp.elapsed().toFixed(3)} s`;
    check(typeof spSecs === 'number' && Math.abs(spSecs - 1.2) < 0.02, `a townsperson's line of 1.2 s told as ${spSecs}`);
    check(Math.abs(during.hz / 330 - 1) < 0.005, `while she speaks: ${during.hz.toFixed(1)} Hz, not her 330 alone (the hero's 440 cut off)`);
    check(Math.abs(during.peak - 0.2 * NPC_VOL * 0.7) < 0.006, `a townsperson's line peaks at ${during.peak.toFixed(4)}, not ${(0.2 * NPC_VOL * 0.7).toFixed(4)}`);
    check(over === 0, 'the hero spoke over a townsperson');
    check(gone.peak < 1e-4, `stopped, her line still sounds at ${gone.peak.toFixed(5)}`);
    check(Math.abs(sp.elapsed() - 0.6) < 0.02, `stopped 0.6 s in, her line says ${sp.elapsed().toFixed(3)} s of it went by`);
    // her line's recording come 0.6 s late: it joins where its clock is (SPEECH_WAIT after it was
    // asked for, plus the time since), so the take's change of pitch at 0.5 s is heard at 0.5 s on
    // that clock, whenever the recording came; silent before, faded in
    const { SPEECH_WAIT } = await import('/src/audio/sfx.ts');
    s = offline(1.5);
    let open;
    const gate = new Promise((r) => (open = r));
    const decodeLate = s.buffers.decode;
    s.buffers.decode = (u, mono) => gate.then(() => decodeLate(u, mono));
    const lateLine = s.speak('voice.akara.test_late');
    let joinedAt = null;
    void s.ctx.suspend(0.6).then(async () => {
      open();
      await lateLine.started;
      joinedAt = s.ctx.currentTime;
      void s.ctx.resume();
    });
    const lateOut = await render(s);
    // where it starts sounding, and where its 330 Hz gives way to 550 (the first of two 550 Hz periods
    // running): both late by the master compressor's look-ahead alike, so it's the gap between them that counts
    const onset = lateOut.findIndex((v) => Math.abs(v) > 1e-4) / RATE;
    let swap = -1;
    for (let i = Math.round((onset + 0.07) * RATE), lastCross = -1, prevGap = 0; i < lateOut.length; i++) {
      if (!(lateOut[i - 1] < 0 && lateOut[i] >= 0)) continue;
      if (lastCross >= 0) {
        const gap = i - lastCross;
        if (prevGap && Math.abs(RATE / gap - 550) < 40 && Math.abs(RATE / prevGap - 550) < 40) {
          swap = (lastCross - prevGap) / RATE;
          break;
        }
        prevGap = gap;
      }
      lastCross = i;
    }
    // started at `joinedAt` + 5 ms, `joined` s into the take: its 0.5 s that much later
    const start = (joinedAt ?? NaN) + 0.005;
    const want = 0.5 - lateLine.joined;
    const delay = onset - start;
    const first = stats(lateOut, Math.round((onset + 0.07) * RATE), Math.round((swap - 0.01) * RATE));
    const second = stats(lateOut, Math.round((swap + 0.01) * RATE), Math.round((swap + 0.6) * RATE));
    const fading = stats(lateOut, Math.round(onset * RATE), Math.round((onset + 0.02) * RATE)).peak;
    facts.late = `asked at 0, in at ${joinedAt?.toFixed(3)}, joined ${lateLine.joined?.toFixed(3)} s in; the take's change of pitch ${(swap - onset).toFixed(4)} s after it came in (want ${want.toFixed(4)}), the compressor's look-ahead ${(delay * 1000).toFixed(1)} ms; ${first.hz.toFixed(0)} then ${second.hz.toFixed(0)} Hz`;
    check(joinedAt !== null && Math.abs(lateLine.joined - (start - SPEECH_WAIT)) < 0.002, `come late, her line joined ${lateLine.joined} s in, not where its clock was (${start} - ${SPEECH_WAIT})`);
    check(delay >= 0 && delay < 0.01, `her late recording came in at ${onset.toFixed(4)} s, not as it started (${start.toFixed(4)} s)`);
    check(Math.abs(first.hz / 330 - 1) < 0.01 && Math.abs(second.hz / 550 - 1) < 0.01, `joined late: ${first.hz.toFixed(1)} then ${second.hz.toFixed(1)} Hz, not 330 then 550`);
    check(Math.abs(swap - onset - want) < 0.002, `joined late, the take's 0.5 s came ${(swap - onset).toFixed(4)} s after it came in, not ${want.toFixed(4)}: not where its clock is`);
    check(fading < 0.5 * first.peak, `joined late it didn't fade in: ${fading.toFixed(4)} in its first 20 ms against ${first.peak.toFixed(4)}`);
    // a greeting (not solo) beside the hero's line: neither cut, each at its own level; and the hero speaking over one
    const amp = (d, from, to, hz) => {
      const w = (2 * Math.PI * hz) / RATE;
      const c = 2 * Math.cos(w);
      let s1 = 0;
      let s2 = 0;
      for (let i = from; i < to; i++) {
        const s0 = d[i] + c * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))) / (to - from);
    };
    s = offline(1.5);
    s.play('voice.paladin.no_mana');
    await wait(150);
    const word = s.speak('voice.akara.test_line', { solo: false });
    await Promise.race([word.started, wait(1500)]);
    const both = await render(s);
    const [a0, a1] = [Math.round(0.1 * RATE), Math.round(0.5 * RATE)];
    const heroAmp = amp(both, a0, a1, 440);
    const herAmp = amp(both, a0, a1, 330);
    facts.beside = `the hero's 440 Hz at ${heroAmp.toFixed(4)}, her greeting's 330 at ${herAmp.toFixed(4)}`;
    check(Math.abs(heroAmp - 0.2 * LINE_VOL * 0.7) < 0.004, `beside her greeting the hero's line is at ${heroAmp.toFixed(4)}, not ${(0.2 * LINE_VOL * 0.7).toFixed(4)}: cut off`);
    check(Math.abs(herAmp - 0.2 * NPC_VOL * 0.7) < 0.004, `her greeting beside the hero's line is at ${herAmp.toFixed(4)}, not ${(0.2 * NPC_VOL * 0.7).toFixed(4)}`);
    s = offline(1.5);
    const greet = s.speak('voice.akara.test_line', { solo: false });
    await Promise.race([greet.started, wait(1500)]);
    s.play('voice.paladin.bag_full');
    await wait(150);
    const spokeOver = s.voices.filter((v) => v.id === 'voice.paladin.bag_full').length;
    check(spokeOver === 1, `the hero kept from speaking over a greeting (${spokeOver} voices)`);

    // a missing loop: the bed
    s = offline(2);
    s.musicBus.gain.value = 0;
    s.enterArea(wild);
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
    for (const [area, kind] of [[camp, 'town'], [wild, 'outdoor'], [crypt, 'dungeon']]) {
      const one = await compose(area);
      const st = stats(one.data);
      music[area.key] = `${(20 * Math.log10(st.rms)).toFixed(1)}/${(20 * Math.log10(st.peak)).toFixed(1)}`;
      check(one.kind === kind, `${area.key} composes ${one.kind}, not ${kind}`);
      check(st.rms > 0.001 && st.peak < 0.1 && st.rms < 0.02, `${area.key}'s music: rms ${st.rms.toFixed(5)}, peak ${st.peak.toFixed(4)}: silent or too loud`);
      if (area === crypt) {
        // the same but for rounding in the reverb's FFT (about 1e-8)
        const apart = (x, y) => x.reduce((m, v, i) => Math.max(m, Math.abs(v - y[i])), 0);
        const again = apart((await compose(crypt)).data, one.data);
        check(again < 1e-6, `the crypt's music differs from one render to the next, by up to ${again}`);
        const other = apart((await compose(cave)).data, one.data);
        check(other > 1e-3, `the cave's music is the crypt's (${other} apart)`);
      }
    }
    facts.music = music;

    // a recorded track: streamed, then crossfaded to the next area's composed music
    const live = new Sfx();
    live.files = { 'music.town': { files: ['__test/music.wav'] }, 'music.wild': { files: ['__test/missing_music.wav'] } };
    live.enterArea(camp);
    live.ensure();
    await wait(1200);
    const stream = live.music;
    check(stream?.el && !stream.el.paused && stream.el.currentTime > 0.3, `the camp's track isn't playing: ${stream?.el ? `paused ${stream.el.paused}, at ${stream.el.currentTime}` : 'no stream'}`);
    check(stream?.gain?.gain.value > 0.05, `the camp's track isn't fading in: ${stream?.gain?.gain.value}`);
    live.enterArea(crypt);
    check(live.music?.kind === 'dungeon', `the crypt after the camp plays ${live.music?.kind}`);
    await wait(3500);
    check(stream?.el?.paused && !stream.el.getAttribute('src'), 'the camp\'s track still holds its file after fading out');
    live.enterArea(wild);
    await wait(1500);
    check(live.failed.has('music.wild') && live.music?.kind === 'outdoor', `a missing track: ${live.music?.kind ?? 'nothing'} plays, given up on ${live.failed.has('music.wild')}`);
    live.music?.stop(0);
    // a track fades in to its gain, as a loop plays at its own
    const Stream = stream?.constructor;
    const quiet = Stream && new Stream(live.ctx, live.players, [url('music.wav')], 0.2, () => {}, 0.4);
    await wait(1200);
    check(quiet && Math.abs(quiet.gain.gain.value - 0.4) < 1e-3, `a track at gain 0.4 faded in to ${quiet?.gain.gain.value}`);
    quiet?.stop(0);
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

/**
 * The game's own recordings (src/audio/files.ts) against what they replace, rendered offline through
 * the whole chain the game plays them by (their level and gain, the master, its compressor): an
 * effect against its synthesized recipe, as UI, by its momentary loudness (BS.1770's 400 ms, so a
 * short sound counts as heard); an area's ambience loops, by day and by night, against its
 * synthesized bed, integrated once both have faded in, the music muted. The loudness is measured here
 * in Node with the meter the pipeline normalizes by (tools/audio/dsp.mjs). Each must be within
 * MATCH_DB: the synthesized mix is the one balanced by ear, and a recording normalized to -16 LUFS
 * once played 23 dB over its recipe. A music track is held closer, to MUSIC_MATCH_DB of the music
 * composed in its place (musicLevels), which plays wherever it won't: it's heard for minutes on end.
 * And it's heard as MUSIC_LEVEL in src/audio/sfx.ts has it: under the ambience of each area it plays
 * in, well under the fighting (FIGHT), its loudest swells under it still (UNDER_FIGHT_DB).
 * The monsters' deaths (DEATHS), as played (recorded, or synthesized where they aren't), are each
 * no more than DEATH_UNDER_DB under a flesh-and-blood one's (monster.die), and every one of them
 * DEATH_OVER_MUSIC_DB over each track: a Fallen's death once sat 2 dB over the music, lost in it.
 * The heroes' lines (HERO_LINES) have nothing synthesized to match:
 * each take of each, played as the game says it (LINE), is held to LINE_MATCH_DB of the loudest of the cues they
 * go with (LINE_CUES, synthesized), as the hero's loudest sounds; so is each take of the townsfolk's
 * (data/dialogue.ts spokenLines), as Sfx.speak plays it (NPC_LINE), to those cues less the step D2
 * puts its townsfolk's speech under its heroes' (NPC_LINE.vol against LINE.vol, 210 of 255). Any
 * other shipped id the game can't play this way fails: nothing vouches for it.
 */
async function shippedLevels(ev) {
  const { RATE, loudness } = await import('../audio/dsp.mjs');
  const { SOUNDS, HERO_LINES, LINE, NPC_LINE, areaSound } = await import('../../src/audio/sounds.ts');
  const LINE_VOL = LINE.vol;
  // the classes through the page: src/data/classes.ts imports the generated tables without an
  // extension, which only Vite resolves
  const classes = await ev(async () => Object.keys((await import('/src/data/classes.ts')).CLASSES));
  const files = await ev(() => window.game.sfx.files);
  // what the townsfolk say aloud, by the ids Sfx.speak is given (src/ui/npc.ts)
  const townIds = await ev(async () => {
    const { spokenLines } = await import('/src/data/dialogue.ts');
    const { npcLine } = await import('/src/audio/sounds.ts');
    return spokenLines().map((s) => npcLine(s.npc, s.id, s.quest));
  });
  // the areas of normal play (src/world/areas.ts), to find the one a loop is played in; then Act 1's
  // defined but not built yet (levels.txt Ids under 40), whose recordings can ship ahead of their maps
  // (M2a's Crypt and Mausoleum: amb.crypt, music.crypt)
  const AREAS = await ev(async () => {
    const A = await import('/src/world/areas.ts');
    const ahead = [];
    for (let id = 1; id < 40; id++) if (!A.isBuilt(id) && A.areaDef(id)) ahead.push(A.areaDef(id));
    return [...A.areaList(), ...ahead];
  });
  const fails = [];
  const facts = {};
  const jobs = [];
  const loops = new Map();
  const heroLines = [];
  const townLines = [];
  /** the music tracks, and the areas that compose their music while they have none */
  const tracks = [];
  /** voice.<class>.<line>, a moment the game has a line for */
  const heroLine = (id) => {
    const [v, who, line, more] = id.split('.');
    return v === 'voice' && classes.includes(who) && HERO_LINES.includes(line) && more === undefined;
  };
  for (const id of Object.keys(files)) {
    if (id in SOUNDS) jobs.push({ kind: 'sfx', id, ids: [id] });
    else if (id.startsWith('amb.')) {
      const day = AREAS.find((a) => areaSound(a).amb?.includes(id));
      const night = AREAS.find((a) => areaSound(a).night?.includes(id));
      if (!day && !night) fails.push(`shipped ${id}: no area plays it`);
      else {
        const at = day ? `${day.key} by day` : `${night.key} by night`;
        const loop = loops.get(at) ?? { area: day ?? night, night: !day, ids: [] };
        loop.ids.push(id);
        loops.set(at, loop);
      }
    } else if (id.startsWith('music.')) {
      const areas = AREAS.filter((a) => areaSound(a).music === id);
      if (!areas.length) fails.push(`shipped ${id}: no area plays it`);
      else tracks.push({ id, areas });
    } else if (heroLine(id)) heroLines.push(id);
    else if (townIds.includes(id)) townLines.push(id);
    else fails.push(`shipped ${id}: nothing in the game plays it`);
  }
  // every take of a line, each by itself: Sfx says any one of them
  for (const id of heroLines) for (const file of files[id].files) jobs.push({ kind: 'line', id, file, ids: [id] });
  for (const id of townLines) for (const file of files[id].files) jobs.push({ kind: 'speech', id, file, ids: [id] });
  for (const id of LINE_CUES) jobs.push({ kind: 'cue', id, ids: [] });
  for (const { area, night, ids } of loops.values()) jobs.push({ kind: 'amb', id: ids.join('+'), area, night, ids });
  // the ambience a track is heard over where it plays: the area's loops by day and by night, those
  // measured above (rendered where they're first played); with none recorded, its synthesized bed (the den)
  const layersOf = (a, night) => ((night ? areaSound(a).night : areaSound(a).amb) ?? []).filter((id) => files[id]).join('+');
  for (const { areas } of tracks) for (const a of areas) if (!layersOf(a, false)) jobs.push({ kind: 'bed', id: `bed:${a.key}`, area: a, night: false, ids: [] });
  // the fighting the music is under
  for (const id of FIGHT) if (!files[id]) jobs.push({ kind: 'blow', id, ids: [] });
  const out = await ev(
    async ({ jobs, RATE }) => {
      // a line's takes measured here: all of them as PCM would be more than the page can hand back
      const { loudness } = await import('/tools/audio/dsp.mjs');
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
        const inArea = job.kind === 'amb' || job.kind === 'bed';
        const short = job.kind === 'sfx' || job.kind === 'cue' || job.kind === 'blow';
        const secs = inArea ? 8 : short ? 3 : 4;
        const realAC = window.AudioContext;
        window.AudioContext = function () {
          return new OfflineAudioContext(2, RATE * secs, RATE);
        };
        let s;
        try {
          s = seeded(() => {
            const s = new Sfx();
            // a line's take alone, where the job is one take (and its length alone)
            const one = (f) => ({ ...f, files: [job.file], secs: f.secs && [f.secs[f.files.indexOf(job.file)]] });
            s.files = recorded ? Object.fromEntries(job.ids.map((id) => [id, job.file ? one(files[id]) : files[id]])) : {};
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
        seeded(() => (inArea ? s.enterArea(job.area) : job.kind === 'speech' ? s.speak(job.id) : s.play(job.id)));
        // the loops start once their (preloaded) takes resolve, a line once its take is checked as decoded
        if (!short) await wait(50);
        const buf = await s.ctx.startRendering();
        if (job.kind === 'line' || job.kind === 'speech') return { failed, lufs: loudness([buf.getChannelData(0), buf.getChannelData(1)], 'momentary') };
        return { failed, chs: [b64(buf.getChannelData(0)), b64(buf.getChannelData(1))] };
      }
      const res = [];
      for (const job of jobs) {
        const one = { ...job, gain: job.ids.map((id) => files[id].gain ?? 1) };
        // a line has nothing synthesized; a cue, a bed and an unrecorded blow are only their synthesized selves
        const spoken = job.kind === 'line' || job.kind === 'speech';
        if (job.kind === 'sfx' || job.kind === 'amb' || spoken) one.rec = await render(job, true);
        if (!spoken) one.synth = await render(job, false);
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
  // the townsfolk a step under the heroes, as D2 has them
  const under = 20 * Math.log10(NPC_LINE.vol / LINE_VOL);
  for (const [kind, vol, what, name, step] of [
    ['line', LINE_VOL, 'LINE', 'hero lines', 0],
    ['speech', NPC_LINE.vol, 'NPC_LINE', "townsfolk's lines", under],
  ]) {
    const lines = [];
    for (const r of out) {
      if (r.kind !== kind || r.rec.failed.length) continue;
      const d = r.rec.lufs - cue.lufs;
      lines.push(d);
      const off = d - step;
      if (!(Math.abs(off) <= LINE_MATCH_DB)) fails.push(`shipped ${r.file}: ${d.toFixed(1)} dB ${d > 0 ? 'louder' : 'quieter'} than ${cue.id} (${cue.lufs.toFixed(1)} LUFS momentary)${step ? `, ${(-step).toFixed(1)} dB under it as the townsfolk are` : ''}: ${what}.vol ${+(vol * 10 ** (-off / 20)).toPrecision(2)} in src/audio/sounds.ts would match`);
    }
    if (!lines.length) continue;
    const mean = lines.reduce((a, b) => a + b, 0) / lines.length;
    const said = new Set(out.filter((r) => r.kind === kind).map((r) => r.id)).size;
    facts[kind === 'line' ? 'voice.*' : 'speech'] = `${said} ${name} in ${lines.length} takes ${Math.min(...lines).toFixed(1)} to ${Math.max(...lines).toFixed(1)} dB (mean ${mean.toFixed(1)}) against ${cue.id}, ${cue.lufs.toFixed(1)} LUFS momentary${step ? `, held ${step.toFixed(1)} dB under it` : ''}`;
  }
  for (const r of out) {
    if (!r.rec) continue;
    if (r.rec.failed.length) {
      fails.push(`shipped ${r.rec.failed.join(', ')}: wouldn't load`);
      continue;
    }
    const level = (chs) => {
      const c = chs.map(pcm);
      return r.kind === 'sfx' ? loudness(c, 'momentary') : loudness(c.map((x) => x.subarray(3 * RATE)), 'integrated');
    };
    if (r.kind === 'line' || r.kind === 'speech') continue;
    const rec = level(r.rec.chs);
    const synth = level(r.synth.chs);
    const d = rec - synth;
    const against = r.kind === 'sfx' ? 'its synthesized sound' : `the ${r.area.key} bed${r.night ? ' by night' : ''}`;
    facts[r.id] = `${rec.toFixed(1)} vs ${synth.toFixed(1)} LUFS ${r.kind === 'sfx' ? 'momentary' : 'integrated'} (${d >= 0 ? '+' : ''}${d.toFixed(1)} dB, gain ${r.gain.join('/')})`;
    if (!(Math.abs(d) <= MATCH_DB)) {
      // the gain that would match, the compressor aside
      const want = r.gain.map((g) => +(g * 10 ** (-d / 20)).toPrecision(2));
      fails.push(`shipped ${r.id}: ${d.toFixed(1)} dB ${d > 0 ? 'louder' : 'quieter'} than ${against} (${facts[r.id]}): gain ${want.join('/')} in tools/audio/list.mjs would match`);
    }
  }
  // what the music is heard with: each area's ambience (its loops by day and by night, or its bed),
  // integrated as above, and the fighting, the loudest 400 ms of a blow or a death as recorded (or
  // synthesized, where it isn't), the middle one of them
  const integrated = (chs) => loudness(chs.map((c) => pcm(c).subarray(3 * RATE)), 'integrated');
  const ambOf = (area) =>
    [false, true].flatMap((night) => {
      const ids = layersOf(area, night);
      const r = ids ? out.find((x) => x.kind === 'amb' && x.night === night && x.ids.join('+') === ids) : !night && out.find((x) => x.kind === 'bed' && x.area.key === area.key);
      return r ? [{ what: `${area.key} ${r.kind === 'bed' ? 'bed' : night ? 'by night' : 'by day'}`, lufs: integrated((r.rec ?? r.synth).chs) }] : [];
    });
  const blows = FIGHT.map((id) => {
    const r = out.find((x) => (x.kind === 'sfx' || x.kind === 'blow') && x.id === id);
    return { id, lufs: momentary((r.rec && !r.rec.failed.length ? r.rec : r.synth).chs) };
  }).sort((a, b) => a.lufs - b.lufs);
  const fight = (blows[(blows.length - 1) >> 1].lufs + blows[blows.length >> 1].lufs) / 2;
  facts.fighting = `${fight.toFixed(1)} LUFS momentary (${blows.map((b) => `${b.id} ${b.lufs.toFixed(1)}`).join(', ')})`;
  // every monster's death as loud as a flesh-and-blood one's, near enough: as played, recorded or
  // synthesized, the vol that would bring it there (it sets both)
  const levelOf = (id) => blows.find((b) => b.id === id).lufs;
  const die = levelOf('monster.die');
  for (const id of DEATHS) {
    const d = levelOf(id) - die;
    facts[`${id} as heard`] = `${d >= 0 ? '+' : ''}${d.toFixed(1)} dB on monster.die`;
    if (!(d >= -DEATH_UNDER_DB)) fails.push(`${id}: ${(-d).toFixed(1)} dB under monster.die (${levelOf(id).toFixed(1)} vs ${die.toFixed(1)} LUFS momentary), past ${DEATH_UNDER_DB}: vol ${+((SOUNDS[id].vol ?? 1) * 10 ** (-d / 20)).toPrecision(2)} in src/audio/sounds.ts would match`);
  }
  for (const r of await musicLevels(ev, tracks, RATE)) {
    if (r.failed) {
      fails.push(`shipped ${r.id}: ${r.failed}`);
      continue;
    }
    // heard as MUSIC_LEVEL (src/audio/sfx.ts) has it: under the ambience of each area it plays in,
    // and never over the fighting, its level well under it, as the music composed in its place sits,
    // and its loudest 3 s under it still
    const ambs = r.areas.flatMap(ambOf);
    const level = r.recorded.reduce((a, b) => (b.lufs > a.lufs ? b : a));
    // and every death well over it, each by itself: a death the music covers is lost
    for (const id of ['monster.die', ...DEATHS]) {
      const over = levelOf(id) - level.lufs;
      if (!(over >= DEATH_OVER_MUSIC_DB)) fails.push(`${id}: ${over.toFixed(1)} dB over ${r.id} (${levelOf(id).toFixed(1)} LUFS momentary, the music ${level.lufs.toFixed(1)} integrated), not ${DEATH_OVER_MUSIC_DB}`);
    }
    const loudest = r.recorded.reduce((a, b) => (b.short > a.short ? b : a));
    const quietest = ambs.reduce((a, b) => (b.lufs < a.lufs ? b : a), ambs[0]);
    const room = [
      { why: `${UNDER_AMB_DB} dB under the ambience of ${quietest?.what}, ${quietest?.lufs.toFixed(1)}`, db: (quietest?.lufs ?? Infinity) - UNDER_AMB_DB - level.lufs },
      { why: `${UNDER_FIGHT_DB} dB under the fighting, ${fight.toFixed(1)}`, db: fight - UNDER_FIGHT_DB - level.lufs },
      { why: `its loudest 3 s (${loudest.short.toFixed(1)}, ${loudest.file}) ${LOUDEST_UNDER_FIGHT_DB} dB under the fighting`, db: fight - LOUDEST_UNDER_FIGHT_DB - loudest.short },
    ];
    const scoreLoudest = Math.max(...r.composed.map((c) => c.short));
    facts[`${r.id} heard with`] = `ambience ${ambs.map((a) => `${a.what} ${a.lufs.toFixed(1)}`).join(', ')}; ${(fight - level.lufs).toFixed(1)} dB under the fighting, its loudest 3 s ${(fight - loudest.short).toFixed(1)} (composed ${(fight - scoreLoudest).toFixed(1)})`;
    if (!ambs.length) fails.push(`shipped ${r.id}: no ambience measured where it plays`);
    const short = room.filter((x) => !(x.db >= 0));
    if (short.length) {
      const most = Math.min(...short.map((x) => x.db));
      // two figures, rounded down: rounded to the nearest it could still fall short
      const want = r.gain * 10 ** (most / 20);
      const step = 10 ** (Math.floor(Math.log10(want)) - 1);
      fails.push(`shipped ${r.id} (${level.lufs.toFixed(1)} LUFS integrated, ${level.file}): not ${short.map((x) => x.why).join(', nor ')}: gain ${+(Math.floor(want / step) * step).toPrecision(2)} in tools/audio/list.mjs would be`);
    }
    const composed = r.composed.reduce((s, c) => s + c.lufs, 0) / r.composed.length;
    const ds = r.recorded.map((x) => x.lufs - composed);
    const d = ds.reduce((s, x) => s + x, 0) / ds.length;
    const each = r.composed.map((c) => `${c.key} ${c.lufs.toFixed(1)}`).join(', ');
    facts[r.id] = `${r.recorded.map((x) => x.lufs.toFixed(1)).join('/')} vs ${composed.toFixed(1)} LUFS integrated composed (${each}; ${d >= 0 ? '+' : ''}${d.toFixed(1)} dB, gain ${r.gain})`;
    const worst = ds.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0);
    if (!(Math.abs(worst) <= MUSIC_MATCH_DB)) {
      fails.push(`shipped ${r.id}: ${worst.toFixed(1)} dB ${worst > 0 ? 'louder' : 'quieter'} than the music composed in its place (${facts[r.id]}): gain ${+(r.gain * 10 ** (-d / 20)).toPrecision(2)} in tools/audio/list.mjs would match`);
    }
  }
  return { fails, facts };
}

/** the monsters' deaths other than a flesh-and-blood one's (monster.die), by kind, of those recorded (src/audio/sounds.ts DEATH_SOUND) */
const DEATHS = ['monster.die_imp', 'monster.die_large', 'monster.die_bone'];
/** how far under monster.die one may be, in dB: a Fallen's sat 5 dB under, all but lost in the music */
const DEATH_UNDER_DB = 1.5;
/** how far over the music each death is at least, in dB (tools/scenarios/music.mjs LIVE_FIGHT_DB, live) */
const DEATH_OVER_MUSIC_DB = 6;

/** how far a shipped track may be from the music composed in its place, in dB */
const MUSIC_MATCH_DB = 1.5;
/** the blows and deaths of a fight, the loudest sounds the music must stay under */
const FIGHT = ['combat.hit', 'combat.hit_heavy', 'combat.hit_bone', 'combat.block', 'monster.die', 'monster.die_imp', 'monster.die_large', 'monster.die_bone'];
/**
 * How far a track's integrated loudness is under the ambience it plays over, and under the fighting
 * (the middle one of FIGHT, momentary), at least; and how far its loudest 3 s is under the fighting.
 * The music composed in its place sits 6 to 7 dB under the fighting; a recording, with more to its
 * swells, is held there too, and its swells kept under the blows.
 */
const UNDER_AMB_DB = 1;
const UNDER_FIGHT_DB = 6;
const LOUDEST_UNDER_FIGHT_DB = 1.5;
/** seconds of composed music measured, once it has faded in (MUSIC_IN, src/audio/sfx.ts) */
const SCORE_SECS = 90;
const SCORE_FROM = 6;

/**
 * Each music track against the music composed in its place (src/audio/score.ts), rendered offline
 * through the chain the game plays both by (the music bus, the master, its compressor), the
 * ambience muted: every take of the track whole, as an <audio> element streams it into its gain
 * (Stream: an OfflineAudioContext can't stream, so the file is decoded and played into the same
 * gain), and the score of each area that plays the track, from its fade-in on. Integrated loudness,
 * by the meter the pipeline normalizes by (tools/audio/dsp.mjs), here measured in the page: a take
 * is two and a half minutes, too much PCM to hand back to Node.
 */
function musicLevels(ev, tracks, RATE) {
  if (!tracks.length) return [];
  return ev(
    async ({ tracks, RATE, SECS, FROM }) => {
      const { loudness } = await import('/tools/audio/dsp.mjs');
      const Sfx = window.game.sfx.constructor;
      const files = window.game.sfx.files;
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
      /** a fresh Sfx rendering `secs` offline, nothing in it but music */
      const fresh = (secs) => {
        const realAC = window.AudioContext;
        window.AudioContext = function () {
          return new OfflineAudioContext(2, Math.round(RATE * secs), RATE);
        };
        try {
          return seeded(() => {
            const s = new Sfx();
            s.files = {};
            s.ensure();
            s.ambBus.gain.value = 0;
            return s;
          });
        } finally {
          window.AudioContext = realAC;
        }
      };
      /** its integrated loudness, and its loudest 3 s (short) and 400 ms (momentary) */
      const lufsOf = (buf, from = 0) => {
        const chs = [buf.getChannelData(0).subarray(from * RATE), buf.getChannelData(1).subarray(from * RATE)];
        return { lufs: loudness(chs, 'integrated'), short: loudness(chs, 'short'), momentary: loudness(chs, 'momentary') };
      };
      const out = [];
      for (const { id, areas } of tracks) {
        const f = files[id];
        const gain = f.gain ?? 1;
        const composed = [];
        for (const area of areas) {
          const s = fresh(SECS);
          seeded(() => s.enterArea(area));
          s.music.advance(SECS);
          composed.push({ key: area.key, ...lufsOf(await s.ctx.startRendering(), FROM) });
        }
        const recorded = [];
        let failed = null;
        for (const file of f.files) {
          let data;
          try {
            // served where the dev server serves public/
            const res = await fetch(`/audio/${file}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            data = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(await res.arrayBuffer());
          } catch (e) {
            failed = `${file} wouldn't load (${e.message})`;
            break;
          }
          const s = fresh(data.duration);
          const src = s.ctx.createBufferSource();
          src.buffer = data;
          const g = s.ctx.createGain();
          g.gain.value = gain;
          src.connect(g).connect(s.musicBus);
          src.start(0);
          recorded.push({ file, ...lufsOf(await s.ctx.startRendering()) });
        }
        out.push({ id, areas, gain, composed, recorded, failed });
      }
      return out;
    },
    { tracks, RATE, SECS: SCORE_SECS, FROM: SCORE_FROM },
  );
}
