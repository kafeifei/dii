// Render benchmark on the real GPU: node tools/bench.mjs [--url http://localhost:5174/?dev] [--dpr 2] [--scenes camp,gate,1,3,7,11,15]
// Needs the dev server. Each scene is drawn 40 times with a pixel read after every draw, so the time
// is what the GPU really takes per frame (rAF would hide it behind vsync). Scenes: 'camp', 'gate'
// (the camp's way out), or a depth: 1 is the wilderness, the dungeon's floors follow. Levels are
// generated afresh each run, so numbers vary a little between runs. Add &tod=0.5 to the url to
// bench the camp and the wilderness by day (shadows from the sun) rather than by the clock.
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

// new headless with Metal: the real GPU, not SwiftShader
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--headless=new', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
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

for (const s of opt('scenes', 'camp,gate,1,3,7,11,15').split(',')) {
  const r = await page.evaluate(async (s) => {
    if (s === 'gate') {
      const st = game.level.objects.find((o) => o.kind === 'exit');
      game.player.pos.x = st.pos.x - 4;
      game.player.pos.z = st.pos.z - 3;
    } else if (s !== 'camp') game.enterLevel(+s, 'stairs');
    // hold everything still
    for (const m of game.level.monsters) m.stunTime = 1e9;
    await new Promise((r) => setTimeout(r, 1200));
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
    const info = renderer.webgl.info;
    return { scene: s, ms: +ms.toFixed(2), calls: info.render.calls, tris: info.render.triangles, textures: info.memory.textures, monsters: game.level.monsters.length };
  }, s);
  console.log(`${r.scene.padEnd(7)} ${String(r.ms).padStart(6)} ms/frame  ${String(r.calls).padStart(4)} draws  ${String(Math.round(r.tris / 1000)).padStart(4)}k tris  ${r.textures} textures  ${r.monsters} monsters`);
}
await browser.close();
