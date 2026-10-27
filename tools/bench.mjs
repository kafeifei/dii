// Render benchmark on the real GPU: node tools/bench.mjs [--url http://localhost:5174/?dev] [--dpr 2] [--scenes camp,gate,wild,coldplains,denofevil,floor2,floor10,walk:camp,walk:wild] [--frames 900]
// Needs the dev server. Scenes go by area, named by their keys (src/world/areas.ts): 'camp', 'wild',
// 'coldplains', 'denofevil' and the trial ground's 'floor3' go to that area as a waypoint does, 'gate'
// stands in the camp by its way out. Each is drawn 40 times with a pixel read after every draw, so the
// time is what the GPU really takes per frame (rAF would hide it behind vsync).
// 'walk:<area>' (or 'walk', where the last scene left off) plays instead: the hero walks a route, from
// where they stand into each next area on this map (past a way off it, the Den's mouth, to one
// further on) and back, one sim step and one draw (with the
// pixel read) a frame, for --frames frames after ten drawn standing still. It gives the median, p95
// and p99 frame time (the sim's share as a mean: the page's clock ticks in 0.1 ms) and how the JS
// heap and the renderer's geometries, textures and shader programs changed from the first frame to
// the last. Monsters are held still throughout, so the route stays the same.
// Levels are generated afresh each run, so numbers vary a little between runs. Add &tod=0.5 to the url
// to bench the camp and the wilderness by day (shadows from the sun) rather than by the clock.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
const dir = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()[0];
const exe = process.env.CHROME ?? path.join(base, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const dpr = +opt('dpr', 2);
const frames = +opt('frames', 900);

// new headless with Metal: the real GPU, not SwiftShader; a heap that reads exactly and can be collected
const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
const t0 = Date.now();
await page.goto(opt('url', 'http://localhost:5174/?dev'));
await page.waitForFunction(() => window.game?.started && window.renderer, null, { timeout: 60000 });
console.log(`loaded in ${Date.now() - t0} ms`);
await page.waitForTimeout(1500);
const gpu = await page.evaluate(() => {
  const gl = renderer.webgl.getContext();
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return { name: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?', ratio: renderer.webgl.getPixelRatio() };
});
console.log(`${gpu.name}, device pixel ratio ${dpr}, drawn at ${gpu.ratio}`);

// helpers kept on the page
await page.evaluate(async () => {
  const { areaByKey, areaDef, nextArea } = await import('/src/world/areas.ts');
  const { findPath } = await import('/src/world/pathfinding.ts');
  const B = (window.__bench = {});
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  /** the next area's id from the one the hero is in (compared by id: the page's modules may be other copies) */
  const nextId = () => nextArea(areaByKey(game.area.key))?.id;
  /** go to an area by key, unless the hero is there already; false when there's no such area here */
  B.goTo = (key, fresh) => {
    const a = areaByKey(key);
    if (!a) return false;
    if (fresh || game.area?.id !== a.id) return game.travelToArea(a.id);
    return true;
  };
  /** the hero by the camp's way out, a few steps inside */
  B.gate = () => {
    const L = game.level;
    const way = L.wayTo(nextId(), game.player.pos);
    if (!way) return false;
    const inward = way.obj?.inward;
    const s = L.layout.start;
    const away = inward ?? { x: (s.x - way.pos.x) / (dist(s, way.pos) || 1), z: (s.z - way.pos.z) / (dist(s, way.pos) || 1) };
    const spot = L.map.nearestWalkable(way.pos.x + away.x * 5, way.pos.z + away.z * 5) ?? way.pos;
    const p = game.player;
    p.pos = { ...spot };
    p.prevPos = { ...spot };
    p.intent = null;
    p.path = null;
    return true;
  };
  /** hold every monster still */
  B.still = () => {
    for (const m of game.level.monsters) m.stunTime = 1e9;
  };
  /** drawn 40 times, after 10 to warm up */
  B.draw = () => {
    const gl = renderer.webgl.getContext();
    const px = new Uint8Array(4);
    const once = () => {
      renderer.render(1 / 60, 1);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    };
    for (let i = 0; i < 10; i++) once();
    const N = 40;
    const t = performance.now();
    for (let i = 0; i < N; i++) once();
    const ms = (performance.now() - t) / N;
    // one frame's draws, every pass of it (left to itself, the count starts over with each pass)
    const info = renderer.webgl.info;
    info.autoReset = false;
    info.reset();
    once();
    const { calls, triangles } = info.render;
    info.autoReset = true;
    return { ms: +ms.toFixed(2), calls, tris: triangles, textures: info.memory.textures, monsters: game.level.monsters.length };
  };
  /**
   * The walk's goals: toward the way into each next area while it is on this map (one big map),
   * passing a way off it (the Den's mouth) by for an area further along on it; else up to the last
   * such way, stopping `short` of it so the level stays; then back to the start
   */
  const goals = () => {
    const L = game.level;
    const p = game.player;
    const out = [];
    let from = { ...p.pos };
    let next = nextId();
    let off = null;
    for (let i = 0; i < 12 && next !== undefined; i++) {
      const way = L.wayTo(next, from);
      if (!way) break;
      if (way.obj) {
        off ??= { pos: way.pos, short: way.obj.radius + 2 };
        next = nextArea(areaDef(next))?.id;
        continue;
      }
      out.push({ pos: way.pos, short: 0 });
      off = null;
      from = way.pos;
      next = nextArea(areaByKey(L.areaAt(from.x, from.z).key))?.id;
    }
    if (off) out.push(off);
    return out.length ? [...out, ...out.slice(0, -1).reverse(), { pos: { ...p.pos }, short: 0 }] : [];
  };
  const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const heap = () => {
    // twice: what one collection frees can leave more for the next
    window.gc?.();
    window.gc?.();
    return performance.memory?.usedJSHeapSize ?? NaN;
  };
  B.walk = (frames) => {
    const L = game.level;
    const p = game.player;
    const map = L.map;
    const tour = goals();
    if (!tour.length) return { error: `no way on from ${game.area.key}` };
    const gl = renderer.webgl.getContext();
    const px = new Uint8Array(4);
    const STEP = 1 / 60;
    const total = [];
    let sim = 0;
    const areas = [game.area.key];
    let leg = 0;
    let goal = null;
    let path = [];
    let walked = 0;
    let stuck = 0;
    let still = 0;
    let last = { ...p.pos };
    const nextLeg = () => {
      goal = tour[leg++ % tour.length];
      path = findPath(map, p.pos, goal.pos, 1e6, p.radius * 0.7) ?? [goal.pos];
    };
    const info = renderer.webgl.info;
    const mem = () => ({ heap: heap(), geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? 0 });
    // warmed up standing still, as the scenes are
    for (let i = 0; i < 10; i++) {
      renderer.render(STEP, 1);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    }
    const m0 = mem();
    for (let i = 0; i < frames; i++) {
      if (!p.intent) {
        if (!path.length) nextLeg();
        p.intent = { kind: 'move', point: path.shift() };
      }
      const t0 = performance.now();
      game.update(STEP);
      const t1 = performance.now();
      renderer.render(STEP, 1);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      total.push(performance.now() - t0);
      sim += t1 - t0;
      // the route stops short of every way off the map
      if (game.level !== L) return { error: `walked off ${areas[0]} into ${game.area.key}` };
      if (goal.short && dist(p.pos, goal.pos) < goal.short) {
        path = [];
        p.intent = null;
      }
      if (game.area.key !== areas[areas.length - 1]) areas.push(game.area.key);
      const step = dist(p.pos, last);
      walked += step;
      last = { ...p.pos };
      // held up (a monster in the way): on to the next goal
      still = step < 0.001 ? still + 1 : 0;
      if (still > 60) {
        stuck++;
        still = 0;
        path = [];
        p.intent = null;
      }
    }
    const m1 = mem();
    total.sort((a, b) => a - b);
    const r = (v) => +v.toFixed(2);
    return {
      frames,
      median: r(pct(total, 0.5)),
      p95: r(pct(total, 0.95)),
      p99: r(pct(total, 0.99)),
      max: r(total[total.length - 1]),
      // a mean: the page's clock ticks in 0.1 ms, coarser than most sim steps
      sim: r(sim / frames),
      walked: Math.round(walked),
      legs: leg,
      stuck,
      areas: areas.join('→'),
      heap: (m1.heap - m0.heap) / 2 ** 20,
      geometries: m1.geometries - m0.geometries,
      textures: m1.textures - m0.textures,
      programs: m1.programs - m0.programs,
    };
  };
});

const sign = (n, unit = '') => `${n >= 0 ? '+' : ''}${n}${unit}`;
for (const s of opt('scenes', 'camp,gate,wild,coldplains,denofevil,floor2,floor10,walk:camp,walk:wild').split(',')) {
  const [kind, key] = s.startsWith('walk') ? ['walk', s.split(':')[1]] : ['draw', s];
  // 'gate' is in the camp; a walk goes afresh, so it starts where the area does
  const ok = await page.evaluate(([kind, key]) => (key === 'gate' ? __bench.goTo('camp') && __bench.gate() : !key || __bench.goTo(key, kind === 'walk')), [kind, key]);
  if (!ok) {
    console.log(`${s.padEnd(10)} no such area here`);
    continue;
  }
  await page.evaluate(() => __bench.still());
  // settle: models, textures and shaders for the new level
  await page.waitForTimeout(1200);
  if (kind === 'draw') {
    const r = await page.evaluate(() => __bench.draw());
    console.log(`${s.padEnd(10)} ${String(r.ms).padStart(6)} ms/frame  ${String(r.calls).padStart(4)} draws  ${String(Math.round(r.tris / 1000)).padStart(4)}k tris  ${r.textures} textures  ${r.monsters} monsters`);
  } else {
    const r = await page.evaluate((n) => __bench.walk(n), frames);
    if (r.error) {
      console.log(`${s.padEnd(10)} ${r.error}`);
      continue;
    }
    console.log(
      `${s.padEnd(10)} median ${r.median}  p95 ${r.p95}  p99 ${r.p99}  max ${r.max} ms/frame (sim ${r.sim})  ${r.frames} frames, ${r.walked} m in ${r.legs} legs${r.stuck ? `, stuck ${r.stuck}×` : ''}, ${r.areas}` +
        `  heap ${sign(+r.heap.toFixed(1), ' MB')}  geometries ${sign(r.geometries)}  textures ${sign(r.textures)}  programs ${sign(r.programs)}`,
    );
  }
}
await browser.close();
