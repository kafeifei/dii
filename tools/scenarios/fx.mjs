// The skills' effects up close, for looking at (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/fx.mjs --url http://localhost:5185/ --dev --out <dir>          the paladin's
//   node tools/play.mjs tools/scenarios/fx.mjs --url http://localhost:5185/ --dev --sorc --out <dir>   the sorceress's
// FX=fire_bolt,holy_fire picks the skills (default: every one of the class's that is cast or worn);
// FX_OFF=1 keeps the effect pictures (public/fx) from loading, for the looks they fall back to.
// In the Den of Evil, the hero kept alive (the debug panel's god mode) and the camera close: each
// skill at level 20, used on the nearest monster, shot a few times as it goes off (a bolt in flight
// and as it lands, an aura as it pulses). Page and console errors fail the run. The last line is
// "FX OK <skills shot>" or "FX FAIL <reasons>".
const DEN = 8;

export default async function (page, shot, log) {
  const errors = [];
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // the pictures FX_OFF turned away are no error
    if (m.type() === 'error' && !(process.env.FX_OFF && m.text().includes('net::ERR_FAILED'))) errors.push(`console: ${m.text()}`);
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);

  if (process.env.FX_OFF) await page.route('**/fx/*.webp', (r) => r.abort());
  await ev(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ timeout: 60000 });
  await page.waitForFunction(() => window.game?.started && window.game.level, null, { timeout: 60000 });
  const cls = await ev(async () => {
    const { debugOpts } = await import('/src/game/debug.ts');
    debugOpts.god = true;
    return game.player.cls;
  });
  await ev((id) => game.travelToArea(id), DEN);
  await page.waitForFunction((id) => game.area?.id === id && !renderer.standInCount(), DEN, { timeout: 30000 });
  await ev(() => window.assets?.ensureAll());
  await page.waitForFunction(() => !renderer.standInCount(), null, { timeout: 30000 });
  // the area's name goes by first
  await wait(3500);

  const all = {
    paladin: ['holy_fire', 'holy_freeze', 'might', 'blessed_hammer', 'heavens_wrath', 'sacred_strike', 'holy_shield'],
    sorceress: ['fire_bolt', 'fire_ball', 'fire_wall', 'meteor', 'charged_bolt', 'nova', 'chain_lightning', 'ice_bolt', 'frost_nova', 'glacial_spike', 'blizzard', 'static_field', 'teleport'],
  }[cls];
  const want = process.env.FX ? process.env.FX.split(',').filter((id) => all.includes(id)) : all;
  const done = [];
  for (const id of want) {
    // the hero 6.5 m from the nearest monster (2.5 for a blow or an aura), in sight of it, the camera close
    const r = await ev(
      ({ id }) => {
        const p = game.player;
        const map = game.level.map;
        const def = p.skillDef?.(id);
        const near = ['holy_fire', 'holy_freeze', 'might', 'sacred_strike', 'holy_shield', 'frost_nova', 'nova', 'static_field'].includes(id);
        const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
        const alive = game.level.monsters.filter((m) => !m.dead).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos));
        for (const m of alive) {
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            const d = near ? 2.5 : 6.5;
            const spot = { x: m.pos.x + Math.sin(a) * d, z: m.pos.z + Math.cos(a) * d };
            if (!map.circleClear(spot.x, spot.z, 0.45) || !map.los(spot, m.pos)) continue;
            game.teleportWithin(spot);
            p.intent = null;
            p.path = null;
            p.skills[id] = 20;
            p.mana = p.stats.maxMana;
            p.life = p.stats.maxLife;
            renderer.zoom = renderer.zoomTarget = near ? 4.6 : 5.4;
            window.__fx = { m, def };
            return { ok: true };
          }
        }
        return { error: 'no monster to use it on' };
      },
      { id },
    );
    if (r.error) {
      errors.push(`${id}: ${r.error}`);
      continue;
    }
    await wait(300);
    await ev((id) => {
      const { m } = window.__fx;
      game.player.mana = game.player.stats.maxMana;
      game.useSkillAt(id, m, { ...m.pos }, true);
    }, id);
    // a bolt in flight, landing, and what it leaves; an aura's pulses
    for (const ms of [90, 120, 200, 600]) {
      await wait(ms);
      await shot(id);
    }
    await ev(() => {
      game.player.intent = null;
    });
    done.push(id);
    await wait(400);
  }
  log(errors.length ? `FX FAIL ${errors.slice(0, 5).join('; ')}` : `FX OK ${cls}: ${done.join(' ')}`);
}
