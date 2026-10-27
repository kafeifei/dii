// Sound in the page (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/sfx.mjs --url "http://localhost:5174/?dev"
// Renders sounds through a fresh Sfx whose AudioContext is an OfflineAudioContext, Math.random
// seeded so that two renders synthesize the same samples, and compares each ear's peak: a sound at
// the listener is exactly as loud as the same sound played as UI; one to the side keeps its near
// ear and turns the far one down, all the way at the screen's edge; a far sound doesn't swallow a
// near one of the same recipe. Then the game's own Sfx: the renderer hands it the camera's view
// (the screen's right and half its width, after a resize and a zoom too), and the area's bed starts
// with the AudioContext on the first click. The last line is "SFX OK <summary>" or "SFX FAIL <reasons>".

export default async function (page, shot, log) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const ev = (fn, arg) => page.evaluate(fn, arg);

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
  const after = await ev(() => ({ ctx: window.game.sfx.ctx?.state ?? null, bed: !!window.game.sfx.amb }));
  if (!after.ctx) fails.push('no AudioContext after a click');
  if (!after.bed) fails.push(`no bed playing in ${before.area} after the first click`);

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
  fails.push(...res.fails, ...errors);
  await shot('sfx');
  log(fails.length ? `SFX FAIL ${fails.join(' | ')}` : `SFX OK peaks as UI ${JSON.stringify(res.facts)}; zoom ${zoomed.toFixed(2)}`);
}
