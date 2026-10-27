// Dying and taking the body back, as Diablo II has it (src/game/corpse.ts), on the West overworld
// (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/corpse.mjs --url "http://localhost:5174/?dev&tod=0.5"
// Reloads with empty storage and gives the hero 4000 gold. Then three deaths:
//   1. in Blood Moor: the death screen names the gold lost (level %, D2) and what's left by the body;
//      its button brings the hero back in the camp on the same map, nothing rebuilt, wearing nothing.
//      The body lies where the hero fell, in the gear, with the gold left in a pile beside it; going
//      back and taking it puts every item back on where it was.
//   2. in the Den of Evil: back in the camp, the body stays in the den (a map the game keeps), found
//      there on going back in, and taken.
//   3. in Blood Moor again, then saved and played again: the body waits in the camp by the way in
//      (PLRSAVE2_ReadCorpses sets a saved body down in town), and taken there the save has none.
// Page and console errors fail the run. Shots: the death screen, the hero back in the camp, the body
// in Blood Moor, the gear back on, the body in the den, the saved body in the camp. The last line is
// "CORPSE OK …" or "CORPSE FAIL …".

/** src/world/areas.ts */
const CAMP_AREA = 1;
const WILD_AREA = 2;
const DEN_OF_EVIL = 8;
const GOLD = 4000;

export default async function (page, shot, log) {
  const t0 = Date.now();
  const errors = [];
  const fails = [];
  const facts = [];
  let step = 'start';
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  const until = async (fn, arg, what, timeout = 5000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 50 });
    } catch {
      throw new Error(`timed out waiting for ${what}`);
    }
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n = 6) =>
    ev(
      (n) =>
        new Promise((r) => {
          let k = 0;
          const f = () => (++k >= n ? r() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        }),
      n,
    );

  /** set the page's helpers up again (after a load): notes on levels built, god mode by hand */
  const helpers = () =>
    ev(async () => {
      const S = (window.__c = window.__c ?? {});
      S.levels = 0;
      S.debug = (await import('/src/game/debug.ts')).debugOpts;
      S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      const h = game.hooks;
      const level = h.levelChanged.bind(h);
      h.levelChanged = (l) => {
        S.levels++;
        level(l);
      };
      /** what the hero wears, slot by item uid */
      S.worn = () => Object.fromEntries(Object.entries(game.player.equipment).filter(([, it]) => it).map(([k, it]) => [k, it.uid]));
      S.bodies = () => game.level.objects.filter((o) => o.kind === 'corpse');
      /** a walkable spot in area `id` about `far` tiles from where its seam with `from` opens, toward `to` */
      S.spotIn = (id, from, to, far) => {
        const L = game.level;
        const ow = L.layout;
        const seam = (a, b) => ow.seams.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
        const s1 = seam(from, id);
        const s2 = seam(id, to);
        const p1 = s1.a === id ? s1.ta : s1.tb;
        const p2 = s2.a === id ? s2.ta : s2.tb;
        const d = S.dist(p1, p2);
        const t = Math.min(0.9, far / d);
        const p = { x: p1.x + (p2.x - p1.x) * t, z: p1.z + (p2.z - p1.z) * t };
        return L.map.nearestWalkable(p.x, p.z);
      };
      S.god = (on) => (S.debug.god = on);
    });

  /** die where the hero stands: god mode off for the blow, the death screen up, its button pressed */
  const dieAndReturn = async (what) => {
    const d = await ev(() => {
      const S = window.__c;
      const p = game.player;
      S.god(false);
      const before = { gold: p.gold, stash: p.stashGold, level: p.level, worn: S.worn() };
      const at = { ...p.pos };
      const area = game.level.areaAt(at.x, at.z).id;
      game.killPlayer();
      S.god(true);
      return { before, at, area, dead: p.dead, pen: game.lastDeath, mapBefore: game.level === S.west, inDen: game.level === S.den };
    });
    expect(d.dead, `${what}: the hero didn't die`);
    await until(() => document.querySelector('.overlay .death-title')?.closest('.overlay')?.classList.contains('open'), null, 'the death screen', 8000);
    const note = await ev(() => document.querySelector('.overlay .death-title').closest('.overlay').querySelector('.note').textContent);
    return { ...d, note };
  };
  const pressRespawn = () =>
    ev(() => {
      const o = document.querySelector('.overlay .death-title').closest('.overlay');
      o.querySelector('.btn').click();
    });

  const steps = {
    async load() {
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      await helpers();
      const s = await ev(() => {
        const S = window.__c;
        S.west = game.level;
        S.god(true);
        game.player.gold = 4000;
        game.player.stashGold = 0;
        return { worn: S.worn(), area: game.area?.id, level: game.player.level, cls: game.player.cls };
      });
      expect(Object.keys(s.worn).length >= 1, `the new hero wears ${Object.keys(s.worn).length} items`);
      expect(s.area === CAMP_AREA, `started in area ${s.area}`);
      facts.push(`${s.cls} level ${s.level}, wearing ${Object.keys(s.worn).join(' ')}`);
    },

    async wildDeath() {
      const spot = await ev(() => window.__c.spotIn(2, 1, 3, 18));
      expect(spot, 'no spot in Blood Moor');
      await ev((at) => game.teleportWithin(at), spot);
      await frames(4);
      const d = await dieAndReturn('Blood Moor');
      expect(d.area === WILD_AREA, `died in area ${d.area}, not Blood Moor`);
      // D2: min(level, 20) % of all the gold, the inventory's first (game/d2/death.ts)
      const lost = Math.trunc((GOLD * Math.min(d.before.level, 20)) / 100);
      expect(d.pen?.goldLost === lost, `lost ${d.pen?.goldLost} gold, D2 says ${lost}`);
      expect(d.note.includes(`失去 ${lost} 金币`) && d.note.includes(`${GOLD - lost} 金币`), `the death screen says "${d.note}"`);
      facts.push(`Blood Moor: -${lost} gold, ${GOLD - lost} by the body`);
      await shot('death-screen');
      await pressRespawn();
      await frames(8);
      const r = await ev((d) => {
        const S = window.__c;
        const p = game.player;
        const L = game.level;
        const bodies = S.bodies();
        const b = bodies[0];
        const pile = L.ground.find((g) => g.gold && S.dist(g.pos, d.at) < 1.5);
        return {
          same: L === S.west,
          levels: S.levels,
          area: game.area?.id,
          town: L.inTown(p.pos),
          worn: Object.keys(S.worn()).length,
          bodies: bodies.length,
          off: b ? S.dist(b.pos, d.at) : null,
          onBody: b ? Object.fromEntries(Object.entries(b.corpse.equipment).filter(([, it]) => it).map(([k, it]) => [k, it.uid])) : null,
          label: b?.label ?? b?.name,
          pile: pile?.gold ?? 0,
          gold: p.gold,
          life: p.life === p.stats.maxLife,
        };
      }, d);
      expect(r.same && r.levels === 0, `back on another map (same ${r.same}, ${r.levels} level(s) built)`);
      expect(r.area === CAMP_AREA && r.town, `came back in area ${r.area}, in town ${r.town}`);
      expect(r.worn === 0 && r.gold === 0, `came back wearing ${r.worn} items with ${r.gold} gold`);
      expect(r.life, 'came back without full life');
      expect(r.bodies === 1 && r.off !== null && r.off < 0.01, `bodies on the map ${r.bodies}, ${r.off} from where the hero fell`);
      expect(JSON.stringify(r.onBody) === JSON.stringify(d.before.worn), `the body wears ${JSON.stringify(r.onBody)}, the hero wore ${JSON.stringify(d.before.worn)}`);
      expect(r.pile === GOLD - lost, `the gold by the body is ${r.pile}, not ${GOLD - lost}`);
      await shot('back-in-camp');
      // back to the body, and take it
      const near = await ev((d) => game.level.map.nearestWalkable(d.at.x + 1.6, d.at.z + 1.1), d);
      await ev((at) => game.teleportWithin(at), near);
      await frames(10);
      await shot('body-in-blood-moor');
      const t = await ev(() => {
        const S = window.__c;
        const b = S.bodies()[0];
        game.interact(b);
        return { worn: S.worn(), bodies: S.bodies().length, kept: game.player.corpses.length };
      });
      expect(JSON.stringify(t.worn) === JSON.stringify(d.before.worn), `after taking the body the hero wears ${JSON.stringify(t.worn)}`);
      expect(t.bodies === 0 && t.kept === 0, `${t.bodies} bodies left on the map, ${t.kept} kept`);
      await frames(6);
      await shot('gear-back-on');
    },

    async denDeath() {
      const worn = await ev(() => window.__c.worn());
      const into = await ev(() => {
        const S = window.__c;
        const ok = game.enterArea(8, 'stairs');
        S.den = game.level;
        const L = game.level;
        const p = game.player;
        // a few tiles into the cave from the way in
        const at = L.map.nearestWalkable(p.pos.x + 4, p.pos.z + 4) ?? p.pos;
        game.teleportWithin(at);
        return { ok, area: game.area?.id, den: L !== S.west };
      });
      expect(into.ok && into.area === DEN_OF_EVIL && into.den, `into the den: ${JSON.stringify(into)}`);
      await frames(4);
      const d = await dieAndReturn('the Den of Evil');
      expect(d.inDen, 'died somewhere other than the den');
      await pressRespawn();
      await frames(8);
      const r = await ev(() => {
        const S = window.__c;
        return { west: game.level === S.west, area: game.area?.id, bodiesHere: S.bodies().length, kept: game.player.corpses.length, worn: Object.keys(S.worn()).length };
      });
      expect(r.west && r.area === CAMP_AREA, `came back to area ${r.area}, on the overworld ${r.west}`);
      expect(r.bodiesHere === 0 && r.kept === 1 && r.worn === 0, `in the camp ${r.bodiesHere} bodies, ${r.kept} kept, wearing ${r.worn}`);
      const back = await ev((d) => {
        const S = window.__c;
        game.enterArea(8, 'stairs');
        const b = S.bodies()[0];
        return { same: game.level === S.den, bodies: S.bodies().length, off: b ? S.dist(b.pos, d.at) : null, near: b && game.level.map.nearestWalkable(b.pos.x + 1.4, b.pos.z + 1) };
      }, d);
      expect(back.same, 'the den was made anew');
      expect(back.bodies === 1 && back.off !== null && back.off < 0.01, `bodies in the den ${back.bodies}, ${back.off} from where the hero fell`);
      if (back.near) await ev((at) => game.teleportWithin(at), back.near);
      await frames(10);
      await shot('body-in-den');
      const t = await ev(() => {
        const S = window.__c;
        const b = S.bodies()[0];
        if (b) game.interact(b);
        const w = S.worn();
        game.enterArea(1, 'waypoint');
        return { worn: w, kept: game.player.corpses.length, west: game.level === S.west };
      });
      expect(JSON.stringify(t.worn) === JSON.stringify(worn) && t.kept === 0, `after the den's body: wearing ${JSON.stringify(t.worn)}, ${t.kept} kept`);
      expect(t.west, 'the camp waypoint led off the overworld');
      facts.push('den: the body kept in the den and taken');
    },

    async savedBody() {
      const worn = await ev(() => window.__c.worn());
      const spot = await ev(() => window.__c.spotIn(2, 1, 3, 24));
      await ev((at) => game.teleportWithin(at), spot);
      await frames(4);
      await dieAndReturn('Blood Moor, to be saved');
      await pressRespawn();
      await frames(6);
      // saved and played again, as D2's save and exit then a new game: ?dev starts a fresh hero on a
      // reload, so the save is read back in the page (Game.continueGame, as the title's 继续 does)
      const saved = await ev(() => {
        game.save();
        const d = JSON.parse(localStorage.getItem('dii-save-dev'));
        const ok = game.continueGame();
        window.__c.west = game.level;
        return { ok, items: d?.corpse ? Object.values(d.corpse.equipment).filter(Boolean).length : 0, xp: d?.corpse?.xp };
      });
      expect(saved.ok, 'the save would not load');
      expect(saved.items >= 1 && saved.xp === undefined, `the save holds a body with ${saved.items} items and experience ${saved.xp}`);
      await frames(10);
      const r = await ev(() => {
        const S = window.__c;
        S.god(true);
        const L = game.level;
        const p = game.player;
        const b = S.bodies()[0];
        return {
          kept: p.corpses.length,
          onLevel: p.corpses[0]?.level === L,
          xp: p.corpses[0]?.xp,
          bodies: S.bodies().length,
          town: b ? L.inTown(b.pos) : null,
          fromStart: b ? S.dist(b.pos, L.layout.start) : null,
          worn: Object.keys(S.worn()).length,
          near: b && L.map.nearestWalkable(b.pos.x + 1.4, b.pos.z + 1),
        };
      });
      expect(r.kept === 1 && r.bodies === 1, `after the reload ${r.kept} bodies kept, ${r.bodies} on the map`);
      expect(r.town && r.fromStart < 6, `the saved body lies ${r.fromStart?.toFixed(1)} from the camp's start, in town ${r.town}`);
      expect(r.xp === 0 && r.worn === 0, `the saved body holds ${r.xp} experience; the hero wears ${r.worn}`);
      if (r.near) await ev((at) => game.teleportWithin(at), r.near);
      await frames(10);
      await shot('saved-body-in-camp');
      const t = await ev(() => {
        const S = window.__c;
        const b = S.bodies()[0];
        if (b) game.interact(b);
        game.save();
        const d = JSON.parse(localStorage.getItem('dii-save-dev'));
        return { worn: S.worn(), kept: game.player.corpses.length, savedCorpse: d ? d.corpse : 'no save' };
      });
      expect(JSON.stringify(t.worn) === JSON.stringify(worn) && t.kept === 0, `after the saved body: wearing ${JSON.stringify(t.worn)}, ${t.kept} kept`);
      expect(t.savedCorpse === null, `the save still has a body: ${JSON.stringify(t.savedCorpse)?.slice(0, 80)}`);
      facts.push(`saved: a body of ${saved.items} items, in the camp in the next game, taken`);
    },
  };

  for (const [name, fn] of Object.entries(steps)) {
    step = name;
    try {
      await fn();
    } catch (e) {
      fails.push(`${name}: ${e.message}`);
      break;
    }
  }
  for (const e of errors) fails.push(e);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(fails.length ? `CORPSE FAIL (${secs} s)\n  ${fails.join('\n  ')}` : `CORPSE OK (${secs} s): ${facts.join('; ')}`);
}
