// Models loading as they're wanted (src/render/assets.ts, needs.ts) and what stands in meanwhile
// (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/stream.mjs --url "http://localhost:5174/?dev&tod=0.5"
// In a context of its own whose network holds back the moor's pack, the dungeon pack and every monster
// body, the game starts on the title's models. On the moor: things stand in (props not drawn, decor
// and the way down drawn in code, monsters as procedural rigs); its files let through: every stand-in
// swapped, none left, no monster drawn in code. Into the Den with its pack still held: veiled after
// 1.5 s, the world held behind it (the game's clock stops); let through: the veil lifts, nothing
// stands in. Then straight onto a trial floor whose pack fails outright: the level shows on its stand-
// ins within its two tries, no veil left up, the file said to have failed; once it loads again a try
// in the background swaps them in. Page errors fail the run. Shots at each step; the last line is
// "STREAM OK …" or "STREAM FAIL …".
export default async function (page, shot, log) {
  const url = page.url().split('?')[0];
  const ctx = await page.context().browser().newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  pg.on('console', (m) => {
    // the 503s are the ones answered here
    if (m.type() === 'error' && !/status of 503/.test(m.text())) errors.push(`console ${m.text().slice(0, 200)}`);
  });
  // files held back are answered once let go; those marked down fail
  const held = new Map();
  const down = new Set();
  const letGo = (re) => {
    const q = held.get(re) ?? [];
    held.delete(re);
    for (const r of q) r.continue();
  };
  await ctx.route(/\/models\/.+\.glb/, (route) => {
    const u = route.request().url();
    if ([...down].some((re) => re.test(u))) return route.fulfill({ status: 503, body: 'down' });
    for (const [re, q] of held) if (re.test(u)) return void q.push(route);
    return route.continue();
  });
  const WILD = /packs\/wild\.glb/;
  const DUNGEON = /packs\/dungeon\.glb/;
  const MONSTERS = /\/mon_[a-z_]+\.glb/;
  for (const re of [WILD, DUNGEON, MONSTERS]) held.set(re, []);
  const fails = [];
  const facts = [];
  const expect = (ok, what) => ok || fails.push(what);
  const census = () =>
    pg.evaluate(() => {
      const r = window.renderer;
      const bodies = [...r.monsterViews.views.values()].filter((v) => v.body);
      return {
        standIns: r.standInCount(),
        props: r.lateProps.size,
        scenery: r.standIns.length,
        monsters: bodies.length,
        rigs: bodies.filter((v) => !v.body.rig.spec).length,
        veiled: r.veiled,
        failed: window.assets.stats().failed,
      };
    });
  const until = (f, ms = 30000) => pg.waitForFunction(f, null, { timeout: ms, polling: 100 }).then(() => true, () => false);
  const snap = (name) => shot(name, pg);
  try {
    await pg.goto(`${url}?dev&tod=0.5`);
    await until(() => window.game?.started);
    await pg.waitForTimeout(800);
    // to the moor's ruins, the monsters held still
    await pg.evaluate(() => {
      const g = window.game;
      const L = g.level;
      const p = L.layout.props.find((q) => L.areaAt(q.x, q.z).id === 2 && /h_pillar|d_rubble/.test(q.model)) ?? L.wayTo(2, g.player.pos).pos;
      g.teleportWithin(L.map.nearestWalkable(p.x + 2, p.z + 2) ?? p);
      for (const m of L.monsters) m.stunTime = 1e9;
    });
    await pg.waitForTimeout(1500);
    const held1 = await census();
    await snap('moor-standing-in');
    expect(held1.props > 0 && held1.rigs > 0, `the moor with its files held: ${JSON.stringify(held1)}`);
    letGo(WILD);
    letGo(MONSTERS);
    await until(() => !window.renderer.standInCount(), 60000);
    await pg.waitForTimeout(1200);
    const moor = await census();
    await snap('moor-swapped');
    expect(!moor.standIns && !moor.rigs && moor.monsters > 0, `the moor once its files came: ${JSON.stringify(moor)}`);
    facts.push(`moor: ${held1.standIns} standing in (${held1.props} prop models, ${held1.scenery} scenery, ${held1.rigs}/${held1.monsters} monsters as rigs), then ${moor.standIns}`);

    // the Den with its pack held: the veil after 1.5 s, the world held behind it
    await pg.evaluate(() => window.game.enterArea(8, 'stairs'));
    await pg.waitForTimeout(600);
    const early = await census();
    await pg.waitForTimeout(1600);
    const veil = await census();
    const [t1, shown] = await pg.evaluate(() => [window.game.time, !!document.querySelector('.overlay.veil.open')]);
    await pg.waitForTimeout(800);
    const t2 = await pg.evaluate(() => window.game.time);
    await snap('den-veiled');
    expect(!early.veiled && veil.veiled && shown, `the Den's veil: at 0.6 s ${early.veiled}, at 2.2 s ${veil.veiled}, shown ${shown}`);
    expect(t2 === t1, `the world ran behind the veil: its clock ${t1} → ${t2}`);
    letGo(DUNGEON);
    await until(() => !window.renderer.veiled);
    const lifted = await census();
    await pg.waitForTimeout(1000);
    await snap('den');
    expect(!lifted.veiled && !lifted.standIns, `the Den once its pack came: ${JSON.stringify(lifted)}`);
    facts.push(`den: veiled at 2.2 s with the world held, lifted with ${lifted.standIns} standing in`);

    // a pack that fails outright, straight onto a trial floor
    down.add(DUNGEON);
    await pg.goto(`${url}?dev&tod=0.5&lvl=2`);
    await until(() => window.game?.started && window.game.area?.key === 'floor2');
    await until(() => window.assets.stats().failed.length > 0, 15000);
    await pg.waitForTimeout(600);
    const failed = await census();
    await snap('floor-failed');
    expect(!failed.veiled && failed.standIns > 0 && failed.failed.includes('packs/dungeon'), `a failing pack: ${JSON.stringify(failed)}`);
    down.delete(DUNGEON);
    await until(() => !window.renderer.standInCount(), 30000);
    await pg.waitForTimeout(600);
    const back = await census();
    await snap('floor-tried-again');
    expect(!back.standIns && !back.failed.length, `the pack back up, tried again: ${JSON.stringify(back)}`);
    facts.push(`a pack failing: shown on ${failed.standIns} stand-ins, no veil; back up, ${back.standIns} left`);
  } catch (e) {
    fails.push(`error ${e.message}`);
  }
  for (const e of errors) fails.push(e);
  await ctx.close();
  log(fails.length ? `STREAM FAIL ${fails.join(' | ')}` : `STREAM OK: ${facts.join('; ')}`);
}
