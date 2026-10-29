// How finely the game shows each model's pictures, for tools/build-models.mjs to size them by
// (a tools/play.mjs scenario):
//   node tools/play.mjs tools/texel-density.mjs --url "http://localhost:<port>/?dev&gallery"
// Writes tools/texel-density.json: for each model and material slot, the texels per metre its
// picture would give at 1024 px across, where the game draws the model biggest. Each mesh in the
// scene is matched to its model by the template geometry it shares (src/render/assets.ts); the
// world-space area of its triangles at that instance's scale (posed through the bones for a skinned
// body), against their area in the picture, gives its texels per metre, and a model keeps its lowest.
// That is a mesh's mean over its surface, weighted by area: where a model's UV islands are scaled
// unevenly, parts of it get fewer texels a metre than the number says (the 2026-10-29 review found
// w_spear, d_shelf_small_candles and h_lantern_standing with large parts at 0.16–0.56 of their mean),
// so those parts show softer than the mean promises. Those are small on screen and fine as cut; don't
// go by the number alone to shrink a big prop's pictures without looking at it in the game.
// Walked: the ?gallery showroom (every prop, item base and monster, the monsters as uniques), the
// hero holding each weapon and shield model, then plain games in four seeded worlds: the camp with
// its townsfolk, the overworld out to Cold Plains, the Den of Evil; and the sorceress. Scenery is
// strewn at sizes rolled as it's built and drawn, so a strewn model's biggest moves by a few percent
// from run to run. Run it again after changing how big something is drawn or adding models; a model
// it hasn't seen keeps its pictures as they are.
import fs from 'node:fs';

const OUT = new URL('./texel-density.json', import.meta.url);
/** the worlds walked, by the seed Math.random starts from */
const WORLDS = [1, 2, 3, 4];
/** three's material slots → glTF's */
const SLOTS = { map: 'baseColorTexture', emissiveMap: 'emissiveTexture', normalMap: 'normalTexture', roughnessMap: 'metallicRoughnessTexture', metalnessMap: 'metallicRoughnessTexture', aoMap: 'occlusionTexture' };

/** the measuring, put in a page */
async function install(page) {
  await page.evaluate((SLOTS) => {
    const S = (window.__texels = { models: {} });
    const geoKey = new Map();
    const areas = new Map();
    /** a geometry's triangle area and its area in uv space (0–1), once */
    const areasOf = (g) => {
      let a = areas.get(g);
      if (a) return a;
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      const idx = g.index;
      const n = idx ? idx.count : pos.count;
      const at = (i) => (idx ? idx.getX(i) : i);
      let world = 0;
      let tex = 0;
      for (let t = 0; t < n; t += 3) {
        const a0 = at(t), a1 = at(t + 1), a2 = at(t + 2);
        const ux = pos.getX(a1) - pos.getX(a0), uy = pos.getY(a1) - pos.getY(a0), uz = pos.getZ(a1) - pos.getZ(a0);
        const vx = pos.getX(a2) - pos.getX(a0), vy = pos.getY(a2) - pos.getY(a0), vz = pos.getZ(a2) - pos.getZ(a0);
        world += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        if (uv) tex += 0.5 * Math.abs((uv.getX(a1) - uv.getX(a0)) * (uv.getY(a2) - uv.getY(a0)) - (uv.getX(a2) - uv.getX(a0)) * (uv.getY(a1) - uv.getY(a0)));
      }
      a = { world, tex };
      areas.set(g, a);
      return a;
    };
    const det3 = (e) => Math.abs(e[0] * (e[5] * e[10] - e[6] * e[9]) - e[4] * (e[1] * e[10] - e[2] * e[9]) + e[8] * (e[1] * e[6] - e[2] * e[5]));
    /** a skinned body's world-space area as it stands, through its bones */
    const posedArea = (o) => {
      const g = o.geometry;
      const idx = g.index;
      const cnt = g.attributes.position.count;
      const W = new Float32Array(cnt * 3);
      const v = new o.position.constructor();
      for (let i = 0; i < cnt; i++) {
        o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
        W[i * 3] = v.x;
        W[i * 3 + 1] = v.y;
        W[i * 3 + 2] = v.z;
      }
      let world = 0;
      const n = idx ? idx.count : cnt;
      for (let t = 0; t < n; t += 3) {
        const a = (idx ? idx.getX(t) : t) * 3, b = (idx ? idx.getX(t + 1) : t + 1) * 3, c = (idx ? idx.getX(t + 2) : t + 2) * 3;
        const ux = W[b] - W[a], uy = W[b + 1] - W[a + 1], uz = W[b + 2] - W[a + 2];
        const vx = W[c] - W[a], vy = W[c + 1] - W[a + 1], vz = W[c + 2] - W[a + 2];
        world += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      }
      return world;
    };
    S.measure = () => {
      for (const [key, t] of assets.templates) t.gltf.scene.traverse((o) => o.isMesh && geoKey.set(o.geometry, key));
      renderer.scene.updateMatrixWorld(true);
      renderer.scene.traverse((o) => {
        const key = o.isMesh && geoKey.get(o.geometry);
        if (!key) return;
        const la = areasOf(o.geometry);
        if (!(la.tex > 0)) return;
        let world;
        if (o.isSkinnedMesh) world = posedArea(o);
        else if (o.isInstancedMesh) {
          // its largest instance
          let s = 0;
          const m = new o.matrixWorld.constructor();
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, m);
            s = Math.max(s, Math.cbrt(det3(m.premultiply(o.matrixWorld).elements)));
          }
          world = la.world * s * s;
        } else world = la.world * Math.cbrt(det3(o.matrixWorld.elements)) ** 2;
        if (!(world > 0)) return;
        const rec = (S.models[key] ??= {});
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const [slot, gltf] of Object.entries(SLOTS)) {
            const img = m?.[slot]?.image;
            if (!img?.width) continue;
            // texels per metre at this size, then as if the picture were 1024 px across
            const at1024 = Math.sqrt((la.tex * 1024 * 1024) / world);
            if (!(rec[gltf] <= at1024)) rec[gltf] = at1024;
          }
        }
      });
    };
  }, SLOTS);
}

const frames = (page, n = 4) =>
  page.evaluate(
    (n) =>
      new Promise((r) => {
        let k = 0;
        const f = () => (++k >= n ? r() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
    n,
  );

/** the hero and the camera at x, z, zoomed far out so every chunk of scenery is in the scene; measured once all is in */
async function measureAt(page, x, z, zoom = 60) {
  await page.evaluate(
    ([x, z, zoom]) => {
      const p = game.player;
      p.pos.x = p.prevPos.x = x;
      p.pos.z = p.prevPos.z = z;
      renderer.camTarget.x = x;
      renderer.camTarget.z = z;
      renderer.zoom = renderer.zoomTarget = zoom;
      renderer.updateFrustum();
    },
    [x, z, zoom],
  );
  await frames(page, 8);
  await page.evaluate(() => window.assets.ensureAll());
  await page.waitForFunction(() => !window.renderer.standInCount(), null, { timeout: 60000, polling: 200 });
  await frames(page, 4);
  await page.evaluate(() => window.__texels.measure());
}

export default async function (page, shot, log) {
  page.setDefaultTimeout(120000);
  const all = {};
  const merge = async (pg) => {
    const got = await pg.evaluate(() => window.__texels.models);
    for (const [k, slots] of Object.entries(got)) for (const [s, v] of Object.entries(slots)) if (!(all[k]?.[s] <= v)) (all[k] ??= {})[s] = v;
  };

  // the showroom, walked in a grid: monsters and items on the floor have views only near the hero.
  // Its monsters made uniques first, any body already made let go to be made again so: a unique is
  // drawn biggest (src/render/specs.ts monsterSpec, 1.18×), and any of them can be one
  if (!(await page.evaluate(() => location.search.includes('gallery')))) throw new Error('give the ?dev&gallery url');
  await page.evaluate(() => {
    for (const m of game.level.monsters) m.rank = 'unique';
    for (const v of renderer.monsterViews.views.values()) {
      if (!v.body) continue;
      renderer.freeMonsterView(v);
      v.body = null;
    }
  });
  await install(page);
  const [w, h] = await page.evaluate(() => [game.level.map.w, game.level.map.h]);
  for (let z = 6; z < h - 4; z += 6) for (let x = 6; x < w - 4; x += 10) await measureAt(page, x, z);
  // the hero holding each weapon and shield model (staves and orbs are drawn in code)
  const held = await page.evaluate(async () => {
    const { ITEM_BASES } = await import('/src/data/items.ts');
    const { createItem } = await import('/src/items/gen.ts');
    const { heldModel } = await import('/src/render/props.ts');
    const by = new Map();
    for (const b of Object.values(ITEM_BASES)) {
      const m = heldModel(b);
      if (m && b.type !== 'staff' && b.type !== 'orb' && !by.has(m[0])) by.set(m[0], b);
    }
    window.__equip = (id) => {
      const p = game.player;
      const b = ITEM_BASES[id];
      if (b.type === 'shield') p.equipment.offhand = createItem(id);
      else p.equipment.weapon = createItem(id);
      p.markDirty();
      p.recalc();
    };
    return [...by.values()].map((b) => b.id);
  });
  for (const id of held) {
    await page.evaluate((id) => window.__equip(id), id);
    await measureAt(page, 8, 8, 10);
  }
  await merge(page);

  // plain games: the camp, the overworld and the Den of Evil of each of WORLDS (scenery is strewn at
  // sizes rolled per world, so a model's biggest is the biggest of a few), then the sorceress in the camp
  const url = new URL(page.url());
  url.search = url.search.replace(/&?gallery/, '');
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const world = await ctx.newPage();
  world.setDefaultTimeout(120000);
  await world.goto(url.href);
  await world.waitForFunction(() => window.game?.started, null, { timeout: 120000 });
  await install(world);
  for (const seed of WORLDS) {
    // a new game from Math.random seeded so: the same worlds every run
    await world.evaluate((seed) => {
      let s = seed >>> 0;
      Math.random = () => {
        s += 0x6d2b79f5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      game.newGame('测试骑士', 'paladin');
    }, seed);
    const L = await world.evaluate(() => [game.level.map.w, game.level.map.h, game.player.pos.x, game.player.pos.z]);
    await measureAt(world, L[2], L[3]);
    for (let z = 10; z < L[1]; z += 25) for (let x = 10; x < L[0]; x += 40) await measureAt(world, x, z);
    await world.evaluate(() => game.enterArea(8, 'stairs'));
    await world.waitForTimeout(2000);
    const D = await world.evaluate(() => [game.level.map.w, game.level.map.h]);
    for (let z = 8; z < D[1]; z += 16) for (let x = 8; x < D[0]; x += 16) await measureAt(world, x, z, 40);
  }
  await world.evaluate(() => game.newGame('测试法师', 'sorceress'));
  const s = await world.evaluate(() => [game.player.pos.x, game.player.pos.z]);
  await measureAt(world, s[0], s[1], 10);
  await merge(world);
  await ctx.close();

  // a model a line
  const rows = Object.keys(all)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(Object.fromEntries(Object.entries(all[k]).map(([s, v]) => [s, Math.round(v)])))}`);
  const about = 'texels per metre each picture would give at 1024 px across, where the game draws the model biggest (tools/texel-density.mjs)';
  fs.writeFileSync(OUT, `{\n "about": ${JSON.stringify(about)},\n "models": {\n${rows.join(',\n')}\n }\n}\n`);
  log(`TEXELS OK ${rows.length} models measured, written to tools/texel-density.json`);
}
