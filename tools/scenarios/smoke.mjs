// End-to-end smoke test, the check every change runs (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/smoke.mjs --url "http://localhost:5174/?dev"        the paladin
//   node tools/play.mjs tools/scenarios/smoke.mjs --url "http://localhost:5174/?dev&sorc"   the sorceress
// Reloads the page with empty storage, then plays a short run through the real UI and the game's
// own API, the way a game goes now: the HUD and every panel, the debug panel's cheats, loot, the
// camp's services, out of the camp into Blood Moor on the one overworld map, down into the Den of
// Evil (every skill cast, kills and their drops, Corpsefire's stand-in), a town portal there and
// back, up out of the Den to its mouth, Cold Plains' waypoint used and travelled by through its
// panel (jumps on the one map, nothing rebuilt), the debug panel's area jumps, its trial ground and
// the difficulty, a jump out of the camp (Game.teleportWithin), and the save. Page errors and
// console errors count from the reload on, and fail the run. The last line is "SMOKE OK <summary>"
// or "SMOKE FAIL <reasons>".

/** the version writeSave in src/game/save.ts stamps on a save: bump it with that */
const SAVE_V = 4;
/** the save slot ?dev plays in (src/game/save.ts), apart from the real characters */
const DEV_SLOT = 'dii-save-dev';
/** how many monsters to kill in the Den of Evil */
const KILLS = 8;
/** the areas the run goes through (src/world/areas.ts CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL) */
const CAMP = 1;
const MOOR = 2;
const PLAINS = 3;
const DEN = 8;

export default async function (page, shot, log) {
  const t0 = Date.now();
  const errors = [];
  const fails = [];
  const facts = [];
  /** each learned skill's kind (attack, spell, aura…), from the skill tree's step */
  const kinds = {};
  let step = 'start';
  // a missing button or panel should fail the run quickly, not after Playwright's 30 s
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  /** a check that doesn't stop the run */
  const expect = (ok, what) => {
    if (!ok) fails.push(`${step}: ${what}`);
    return !!ok;
  };
  /** wait for a condition in the page; a timeout stops the run */
  const until = async (fn, arg, what, timeout = 5000) => {
    try {
      await page.waitForFunction(fn, arg, { timeout, polling: 50 });
    } catch {
      throw new Error(`timed out waiting for ${what}`);
    }
  };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const key = async (k, cond, what) => {
    await page.keyboard.press(k);
    await until(cond, null, what);
  };
  /** a button in one row of the open debug panel */
  const debugButton = (row, name) =>
    page
      .locator('.overlay.settings.open .setting')
      .filter({ has: page.locator('.label > span', { hasText: new RegExp(`^${row}$`) }) })
      .getByRole('button', { name, exact: true });
  /** a couple of frames, so what changed is drawn before a screenshot */
  const frames = () => ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const steps = {
    async load() {
      // from a clean slate: no save, no debug settings, no run in progress
      await ev(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.reload({ timeout: 60000 });
      await until(() => window.game?.started && window.game.level, null, 'the game to start', 60000);
      const cls = new URL(page.url()).searchParams.has('sorc') ? 'sorceress' : 'paladin';
      const s = await ev(() => ({ cls: game.player.cls, area: game.area?.id, overworld: Array.isArray(game.level.layout.seams), level: game.player.level }));
      expect(s.cls === cls, `started as ${s.cls}, the URL asks for ${cls}`);
      expect(s.area === CAMP && s.overworld, `started in area ${s.area}, on the overworld ${s.overworld}`);
      facts.push(s.cls);
      // helpers for the steps below, kept on the page
      await ev(() => {
        const S = (window.__smoke = {});
        S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
        S.west = game.level;
        // the levels built from here on (renderer.buildLevel: a map entered, not a jump on one)
        S.builds = 0;
        const build = renderer.buildLevel;
        renderer.buildLevel = function (...a) {
          S.builds++;
          return build.apply(this, a);
        };
        /** the hero set down somewhere on this map, as a jump does */
        S.put = (spot) => {
          game.teleportWithin(game.level.map.nearestWalkable(spot.x, spot.z) ?? spot);
          game.player.intent = null;
        };
        /** the nearest living monster, with the player put 2 m from it, in sight of it */
        S.engage = () => {
          const p = game.player;
          const map = game.level.map;
          const alive = game.level.monsters.filter((m) => !m.dead).sort((a, b) => S.dist(a.pos, p.pos) - S.dist(b.pos, p.pos));
          for (const m of alive) {
            if (S.dist(m.pos, p.pos) < 3 && map.los(p.pos, m.pos)) return m;
            for (let k = 0; k < 16; k++) {
              const a = (k / 16) * Math.PI * 2;
              const spot = { x: m.pos.x + Math.sin(a) * 2, z: m.pos.z + Math.cos(a) * 2 };
              if (!map.circleClear(spot.x, spot.z, 0.45) || !map.los(spot, m.pos)) continue;
              p.pos = { ...spot };
              p.prevPos = { ...spot };
              p.intent = null;
              p.path = null;
              return m;
            }
          }
          return null;
        };
        /** the player put beside a camp object (a service panel shuts when you walk off from it) */
        S.goTo = (kind) => {
          const o = game.level.objects.find((x) => x.kind === kind && game.level.inTown(x.pos));
          if (!o) return false;
          const p = game.player;
          const spot = game.level.map.nearestWalkable(o.pos.x + o.radius + 0.8, o.pos.z) ?? o.pos;
          p.pos = { ...spot };
          p.prevPos = { ...spot };
          p.intent = null;
          p.path = null;
          return true;
        };
      });
    },

    async hud() {
      const s = await ev(() => ({
        hud: !!document.querySelector('#hud')?.getClientRects().length,
        orbs: document.querySelectorAll('#hud .orb').length,
        slots: document.querySelectorAll('#hud .skills > *').length,
        overlays: [...document.querySelectorAll('#ui > .overlay.open')].map((o) => o.textContent.trim().slice(0, 12)),
        canvas: document.getElementById('world').width > 0,
      }));
      expect(s.hud, 'the HUD is not shown');
      expect(s.orbs === 2, `${s.orbs} orbs on the HUD`);
      expect(s.slots > 0, 'no skill slots on the HUD');
      expect(!s.overlays.length, `an overlay is still open: ${s.overlays.join(' | ')}`);
      expect(s.canvas, 'the canvas has no size');
    },

    async panels() {
      await key('i', () => game.hooks.right === 'inv' && !!document.querySelector('.panel.right.open.inv [data-uid]'), 'the inventory to open');
      await key('i', () => !game.hooks.right && !document.querySelector('.panel.open'), 'the inventory to close');
      await key('c', () => game.hooks.left === 'char' && document.querySelector('.panel.left.open h2')?.textContent === game.player.name, 'the character sheet to open');
      await key('c', () => !game.hooks.left && !document.querySelector('.panel.open'), 'the character sheet to close');
      await key('t', () => game.hooks.right === 'skills' && !!document.querySelector('.panel.right.open.skillsp .sk'), 'the skill tree to open');
      await key('t', () => !game.hooks.right && !document.querySelector('.panel.open'), 'the skill tree to close');
      await key('Tab', () => !!document.querySelector('#automap.open'), 'the automap to open');
      await key('Tab', () => !document.querySelector('#automap.open'), 'the automap to close');
      await key('Escape', () => game.paused && !!document.querySelector('.overlay.open .btn.resume'), 'the pause menu to open');
      await key('Escape', () => !game.paused && !document.querySelector('.overlay.open'), 'the pause menu to close');
      await key('Backquote', () => game.paused && !!document.querySelector('.overlay.settings.open .debug-note'), 'the debug panel to open');
      await key('Backquote', () => !document.querySelector('.overlay.settings.open'), 'the debug panel to close');
      await key('Escape', () => !game.paused && !document.querySelector('.overlay.open'), 'the pause menu under it to close');
    },

    async debug() {
      await key('Backquote', () => !!document.querySelector('.overlay.settings.open .debug-note'), 'the debug panel to open');
      const state = () =>
        ev(() => {
          const p = game.player;
          const items = game.level.ground.filter((g) => g.item);
          return { level: p.level, statPoints: p.statPoints, skillPoints: p.skillPoints, ground: items.length, uniques: items.filter((g) => g.item.rarity === 'unique').length };
        });
      const s0 = await state();
      await debugButton('等级', '+10').click();
      const s1 = await state();
      expect(s1.level === s0.level + 10, `+10 levels went from ${s0.level} to ${s1.level}`);
      expect(s1.statPoints === s0.statPoints + 50 && s1.skillPoints === s0.skillPoints + 10, `+10 levels gave ${s1.statPoints - s0.statPoints} stat and ${s1.skillPoints - s0.skillPoints} skill points`);
      // god mode, so the fights below can't end the run
      await debugButton('无敌', '开').click();
      // the item level: set for the loot buttons, then by the hero again (the camp's area level is 0)
      const ilvls = () => ev((n) => game.level.ground.slice(-n).map((g) => g.item?.ilvl), 1);
      await debugButton('物品等级', '99').click();
      await debugButton('随机装备', '1 件').click();
      const set = await ilvls();
      await debugButton('物品等级', '自动').click();
      const s1b = await state();
      await debugButton('随机装备', '5 件').click();
      const s2 = await state();
      expect(set[0] === 99, `with the item level at 99 the gear dropped at ${set[0]}`);
      expect(s2.ground === s1b.ground + 5, `5 random gear dropped ${s2.ground - s1b.ground}`);
      const auto = await ev(() => game.level.ground.slice(-5).map((g) => g.item?.ilvl));
      expect(auto.every((l) => l === s2.level), `back on auto, gear dropped at item levels ${auto.join(', ')}, the hero is level ${s2.level}`);
      await debugButton('指定品质', '暗金').click();
      const s3 = await state();
      expect(s3.ground === s2.ground + 1 && s3.uniques === s2.uniques + 1, `the unique button dropped ${s3.ground - s2.ground} item(s), ${s3.uniques - s2.uniques} unique`);
      await debugButton('经验', '×10').click();
      // plenty of loot rolls, so a handful of kills is sure to drop something
      await debugButton('掉落', '×5').click();
      const opts = await ev(() => {
        const on = (row) => [...document.querySelectorAll('.overlay.settings.open .setting')].find((r) => r.querySelector('.label > span')?.textContent === row)?.querySelector('button.on')?.textContent;
        return { stored: JSON.parse(localStorage.getItem('dii-debug') ?? '{}'), xp: on('经验') };
      });
      expect(opts.stored.xp === 10 && opts.xp === '×10', `xp ×10 shows ${opts.xp}, stored ${opts.stored.xp}`);
      expect(opts.stored.loot === 5 && opts.stored.god === true && opts.stored.ilvl === 0, `stored debug settings ${JSON.stringify(opts.stored)}`);
      await key('Backquote', () => !document.querySelector('.overlay.settings.open'), 'the debug panel to close');
      await key('Escape', () => !game.paused && !document.querySelector('.overlay.open'), 'the pause menu to close');
      await frames();
      await shot('camp-loot');
      facts.push(`lvl ${s3.level}`);
    },

    async pickup() {
      const r = await ev(() => {
        const p = game.player;
        const out = { picked: 0, left: 0, wrong: [] };
        for (const gi of game.level.ground.filter((g) => g.item)) {
          const it = gi.item;
          const room = !!p.inventory.findSpace(it);
          game.pickupGround(gi);
          const taken = !game.level.ground.includes(gi);
          const held = p.inventory.contains(it);
          if (taken && held) out.picked++;
          else if (!taken && !room) out.left++;
          else out.wrong.push(`${it.name}: room ${room}, taken ${taken}, in the bag ${held}`);
        }
        return out;
      });
      expect(!r.wrong.length, `pickups went wrong: ${r.wrong.join('; ')}`);
      expect(r.picked > 0, 'nothing was picked up');
      facts.push(`picked ${r.picked}/${r.picked + r.left}`);
    },

    async services() {
      for (const [panel, obj] of [['shop', 'vendor'], ['stash', 'stash'], ['waypoint', 'waypoint']]) {
        expect(await ev((o) => window.__smoke.goTo(o), obj), `no ${obj} in the camp`);
        // the last panel's contents stay in place while shut: wait for this one's own
        await ev(() => document.querySelectorAll('.panel > *').forEach((e) => (e.dataset.stale = '1')));
        await ev((k) => game.hooks.openPanel(k), panel);
        await until((k) => game.hooks.left === k && !!document.querySelector('.panel.left.open h2:not([data-stale])'), panel, `the ${panel} panel to open`);
        const s = await ev(() => ({ items: document.querySelectorAll('.panel.left.open [data-uid]').length, wps: document.querySelectorAll('.panel.left.open .wp').length, bag: !!document.querySelector('.panel.right.open.inv') }));
        if (panel === 'shop') expect(s.items > 0 && s.bag, `the shop shows ${s.items} items, bag open ${s.bag}`);
        if (panel === 'stash') expect(s.bag, 'the bag is not open beside the stash');
        if (panel === 'waypoint') expect(s.wps > 0, 'the waypoint panel lists nothing');
        if (panel === 'shop') await shot('shop');
        // it stays open while you stand there
        await frames();
        expect(await ev((k) => game.hooks.left === k, panel), `the ${panel} panel shut by itself`);
        await key('Escape', () => !game.hooks.left && !game.hooks.right && !document.querySelector('.panel.open'), `the ${panel} panel to close`);
      }
    },

    async learn() {
      // spend the new points in the skill tree, one point in each skill that opens up
      await key('t', () => game.hooks.right === 'skills' && !!document.querySelector('.panel.right.open.skillsp .sk'), 'the skill tree to open');
      const learned = [];
      const tabs = await ev(() => document.querySelectorAll('.panel.right.open .tabs .tab').length);
      for (let pass = 0; pass < 6; pass++) {
        let any = false;
        for (let t = 0; t < tabs; t++) {
          await page.locator('.panel.right.open .tabs .tab').nth(t).click();
          await until((i) => document.querySelectorAll('.panel.right.open .tabs .tab')[i]?.classList.contains('on'), t, `skill tab ${t}`);
          for (;;) {
            Object.assign(kinds, await ev(() => Object.fromEntries(game.player.learnableSkills().map((s) => [s.id, s.kind]))));
            const id = await ev(() => document.querySelector('.panel.right.open .sk.avail.locked')?.dataset.skill ?? null);
            if (!id) break;
            await page.locator(`.panel.right.open .sk[data-skill="${id}"]`).click();
            await until((s) => game.player.skillBase(s) === 1 && !document.querySelector(`.panel.right.open .sk.locked[data-skill="${s}"]`), id, `${id} to be learned`);
            learned.push(id);
            any = true;
          }
        }
        if (!any) break;
      }
      await page.mouse.move(4, 4);
      await key('t', () => !game.hooks.right && !document.querySelector('.panel.open'), 'the skill tree to close');
      expect(learned.length > 0, 'no skill could be learned');
      facts.push(`learned ${learned.length}`);
    },

    async moor() {
      // out of the camp past its gate, on the same map: nothing is built
      const s = await ev(() => {
        const S = window.__smoke;
        const L = game.level;
        const gate = L.layout.seams.find((x) => x.a === 1 && x.b === 2);
        const dx = gate.tb.x - gate.ta.x;
        const dz = gate.tb.z - gate.ta.z;
        let spot = null;
        for (let k = 6; k < 40 && !spot; k++) {
          const c = { x: gate.tb.x + dx * k, z: gate.tb.z + dz * k };
          if (L.map.circleClear(c.x, c.z, 0.6) && L.areaAt(c.x, c.z).id === 2) spot = c;
        }
        if (!spot) return { error: 'no open ground past the camp gate' };
        S.moor = spot;
        const builds = S.builds;
        // the area's name on the way in (src/ui/banner.ts), counted
        const banner = document.getElementById('area-banner');
        const shown = +(banner.dataset.shown ?? 0);
        S.put(spot);
        const banners = banner.dataset.area === game.area.key ? +(banner.dataset.shown ?? 0) - shown : 0;
        const mouth = L.objects.find((o) => o.kind === 'stairs' && o.dest === 8);
        S.mouth = mouth;
        return {
          area: game.area.id,
          kind: game.area.kind,
          same: game.level === S.west && S.builds === builds,
          banners,
          mouth: !!mouth && L.areaAt(mouth.pos.x, mouth.pos.z).id === 2,
          open: L.objects.filter((o) => o.kind === 'exit' && !o.closed).length,
          monsters: L.monsters.filter((m) => !m.dead && L.areaAt(m.pos.x, m.pos.z).id === 2).length,
        };
      });
      if (s.error) throw new Error(s.error);
      expect(s.area === MOOR && s.kind === 'outdoor' && s.same, `out past the gate: area ${s.area} (${s.kind}), on the same map without a build ${s.same}`);
      expect(s.banners === 1, `Blood Moor's name shown ${s.banners} times on the way in`);
      expect(s.mouth && !s.open, `Blood Moor's way down ${s.mouth}, ${s.open} open exit(s) off the map`);
      expect(s.monsters > 0, 'no monsters in Blood Moor');
      await frames();
      await shot('blood-moor');
    },

    async den() {
      // down the Den of Evil's mouth: a map of its own
      const s = await ev(() => {
        const S = window.__smoke;
        const m = S.mouth;
        S.put({ x: m.pos.x + m.inward.x * 2, z: m.pos.z + m.inward.z * 2 });
        const builds = S.builds;
        game.interact(m);
        const L = game.level;
        S.den = L;
        const cf = L.monsters.find((x) => x.rank === 'unique' && x.displayName === '尸焰');
        return {
          area: game.area.id,
          built: S.builds - builds,
          other: L !== S.west,
          theme: L.layout.theme.key,
          monsters: L.monsters.length,
          corpsefire: !!cf,
          up: L.objects.some((o) => o.kind === 'stairs' && o.dest === 2),
        };
      });
      expect(s.area === DEN && s.other && s.built === 1, `down the mouth: area ${s.area}, its own map ${s.other}, ${s.built} build(s)`);
      expect(s.theme === 'cave' && s.up && s.monsters > 0 && s.corpsefire, `the den: ${s.theme}, a way up ${s.up}, ${s.monsters} monsters, Corpsefire's stand-in ${s.corpsefire}`);
      await frames();
      await shot('den-of-evil');
    },

    async cast() {
      const list = await ev(() => {
        const p = game.player;
        const ids = new Set([...p.binds.filter((b) => b), ...Object.keys(p.skills).filter((id) => p.skillLevel(id) > 0)]);
        return [...ids];
      });
      const cast = [];
      for (const id of list) {
        const kind = id === 'attack' ? 'attack' : kinds[id];
        if (kind === 'passive') continue;
        const r = await ev((id) => {
          const S = window.__smoke;
          const p = game.player;
          const L = game.level;
          if (!S.target || S.target.dead) S.target = S.engage();
          const m = S.target;
          if (!m) return { error: 'no monster left' };
          p.mana = p.stats.maxMana;
          S.before = { mana: p.mana, life: m.life, missiles: L.projectiles.length + L.hammers.length + L.blasts.length };
          game.useSkillAt(id, m, { ...m.pos }, true);
          return {};
        }, id);
        if (r.error) throw new Error(r.error);
        // it went off: an aura on, a swing (or a hit), a spell begun
        await until(
          ({ id, kind }) => {
            const p = game.player;
            const L = game.level;
            const { before } = window.__smoke;
            const m = window.__smoke.target;
            if (kind === 'aura') return p.activeAura === id;
            if (kind === 'attack') return p.state === 'attack' || p.state === 'charge' || m.dead || m.life < before.life;
            return p.state === 'cast' || p.mana < before.mana || L.projectiles.length + L.hammers.length + L.blasts.length > before.missiles;
          },
          { id, kind },
          `${id} (${kind ?? 'unknown kind'}) to be used`,
        );
        // and finished, so its effect has run
        await until(() => game.player.state === 'idle' || game.player.state === 'move' || game.player.state === 'hit', null, `${id} to finish`);
        await ev(() => {
          game.player.intent = null;
        });
        cast.push(id);
      }
      await frames();
      await shot('den-skills');
      facts.push(`${cast.length} skills cast (${cast.join(' ')})`);
    },

    async kill() {
      const r = await ev((n) => {
        const p = game.player;
        const L = game.level;
        const xp0 = p.xp;
        const ground0 = L.ground.length;
        const dist = window.__smoke.dist;
        const victims = L.monsters.filter((m) => !m.dead).sort((a, b) => dist(a.pos, p.pos) - dist(b.pos, p.pos)).slice(0, n);
        for (const m of victims) game.killMonster(m, 'phys');
        return { killed: victims.filter((m) => m.dead).length, tried: victims.length, xp: p.xp - xp0, drops: L.ground.length - ground0 };
      }, KILLS);
      expect(r.tried > 0, 'no monsters to kill');
      expect(r.killed === r.tried, `${r.killed}/${r.tried} died`);
      expect(r.xp > 0, `killing ${r.killed} gave ${r.xp} xp`);
      expect(r.drops > 0, `killing ${r.killed} dropped nothing`);
      facts.push(`${r.killed} kills (+${r.xp} xp, ${r.drops} drops)`);
    },

    async xpRate() {
      // the debug panel's ×10, seen in the game: a monster gives ten times what its twin does at ×1
      // (made at the player's level, so the level gap takes nothing off and the numbers are big)
      const twin = () =>
        ev(() => {
          const S = window.__smoke;
          const p = game.player;
          const L = game.level;
          S.model ??= L.monsters.find((m) => !m.dead && m.rank === 'normal');
          const m = S.model;
          if (!m) return null;
          const t = new m.constructor(m.def, p.level, 'normal', { ...m.pos });
          L.monsters.push(t);
          const xp0 = p.xp;
          const lvl0 = p.level;
          game.killMonster(t, 'phys');
          return { xp: p.xp - xp0, levelled: p.level !== lvl0 };
        });
      const setRate = async (name) => {
        await key('Backquote', () => !!document.querySelector('.overlay.settings.open .debug-note'), 'the debug panel to open');
        await debugButton('经验', name).click();
        await key('Backquote', () => !document.querySelector('.overlay.settings.open'), 'the debug panel to close');
        await key('Escape', () => !game.paused && !document.querySelector('.overlay.open'), 'the pause menu to close');
      };
      const ten = await twin();
      if (!expect(ten, 'no normal monster to copy')) return;
      await setRate('×1');
      const one = await twin();
      await setRate('×10');
      // a level gained between the two kills changes the level gap, and so the xp
      if (ten.levelled || one.levelled) return;
      expect(ten.xp > 0 && ten.xp >= one.xp * 10 && ten.xp < (one.xp + 1) * 10, `a kill gave ${ten.xp} xp at ×10, ${one.xp} at ×1`);
      facts.push(`xp ${ten.xp} at ×10 vs ${one.xp}`);
    },

    async portal() {
      await ev(() => {
        game.player.intent = null;
      });
      // cast once the player is free to (a monster's hit holds the cast up)
      await until(
        () => {
          const p = game.player;
          if (game.level.objects.some((o) => o.kind === 'portal')) return true;
          if (p.state === 'idle' || p.state === 'move') game.castTownPortal();
          return false;
        },
        null,
        'the town portal to open',
        8000,
      );
      const s = await ev(() => {
        const S = window.__smoke;
        const out = {};
        const b0 = S.builds;
        game.interact(game.level.objects.find((o) => o.kind === 'portal'));
        out.town = game.area.id;
        out.west = game.level === S.west;
        const back = game.level.objects.find((o) => o.kind === 'portal' && game.level.inTown(o.pos));
        out.backDest = back?.dest;
        if (back) game.interact(back);
        out.again = game.area.id;
        out.same = game.level === S.den;
        out.left = game.level.objects.filter((o) => o.kind === 'portal').length + S.west.objects.filter((o) => o.kind === 'portal').length;
        out.builds = S.builds - b0;
        return out;
      });
      expect(s.town === CAMP && s.west, `the portal went to area ${s.town}, on the overworld ${s.west}`);
      expect(s.backDest === DEN, `the camp's portal leads to ${s.backDest}`);
      expect(s.again === DEN && s.same && s.builds === 2, `back through the portal: area ${s.again}, the same den ${s.same}, ${s.builds} build(s)`);
      expect(s.left === 0, `${s.left} portal(s) still open after coming back`);
    },

    async denExit() {
      // up out of the den: at its mouth on the overworld as it was left
      const s = await ev(() => {
        const S = window.__smoke;
        const up = game.level.objects.find((o) => o.kind === 'stairs' && o.dest === 2);
        game.interact(up);
        return { area: game.area.id, west: game.level === S.west, mouth: S.dist(game.player.pos, S.mouth.pos) };
      });
      expect(s.area === MOOR && s.west && s.mouth < 3.5, `up out of the den: area ${s.area}, the same overworld ${s.west}, ${s.mouth.toFixed(1)} from the mouth`);
    },

    async plains() {
      // Cold Plains' waypoint: used, it's activated; its panel's camp and then Cold Plains are jumps on this map
      const s = await ev(() => {
        const S = window.__smoke;
        const L = game.level;
        const wp = L.objects.find((o) => o.kind === 'waypoint' && L.areaAt(o.pos.x, o.pos.z).id === 3);
        if (!wp) return { error: 'no waypoint in Cold Plains' };
        S.put({ x: wp.pos.x + 1.2, z: wp.pos.z + 0.6 });
        const before = [...game.player.waypoints];
        game.interact(wp);
        return { area: game.area.id, before, after: [...game.player.waypoints], said: [...document.querySelectorAll('#messages > div')].some((e) => e.textContent === '传送点已激活') };
      });
      if (s.error) throw new Error(s.error);
      expect(s.area === PLAINS && s.before.join() === String(CAMP) && s.after.join() === `${CAMP},${PLAINS}` && s.said, `using Cold Plains' waypoint in area ${s.area}: waypoints ${s.before.join()} → ${s.after.join()}, said so ${s.said}`);
      await until(() => game.hooks.left === 'waypoint' && document.querySelectorAll('.panel.left.open .wp').length === 2, null, "Cold Plains' waypoint panel with two waypoints");
      await frames();
      await shot('waypoint-panel');
      const b0 = await ev(() => window.__smoke.builds);
      const pick = async (name, area) => {
        await page.locator('.panel.left.open .wp', { hasText: name }).click();
        await until((a) => game.area?.id === a, area, `the waypoint to area ${area}`);
        // the pick shuts the panel on the next frame: wait for it, so one opened next is drawn anew
        await until(() => !document.querySelector('.panel.left.open'), null, 'the waypoint panel to shut');
      };
      await pick(await ev(() => game.level.areaAt(game.level.layout.start.x, game.level.layout.start.z).name), CAMP);
      // the camp's waypoint lists Cold Plains, the current one marked
      expect(await ev(() => window.__smoke.goTo('waypoint')), 'no waypoint in the camp');
      await ev(() => game.hooks.openPanel('waypoint'));
      await until(() => game.hooks.left === 'waypoint' && document.querySelectorAll('.panel.left.open .wp').length === 2 && !!document.querySelector('.panel.left.open .wp.cur'), null, "the camp's waypoint panel");
      await pick(await ev(() => document.querySelector('.panel.left.open .wp:not(.cur)')?.textContent ?? ''), PLAINS);
      const r = await ev((b0) => ({ builds: window.__smoke.builds - b0, west: game.level === window.__smoke.west }), b0);
      expect(r.builds === 0 && r.west, `by waypoint to the camp and back: ${r.builds} build(s), on the overworld ${r.west}`);
      // picking a waypoint shuts the panel
      await until(() => !game.hooks.left && !document.querySelector('.panel.open'), null, 'the waypoint panel to shut');
      facts.push('den and Cold Plains');
    },

    async home() {
      const area = await ev(() => {
        game.travel(1);
        return game.area.id;
      });
      expect(area === CAMP, `travel to the camp went to area ${area}`);
    },

    async jump() {
      // the debug panel's area list: normal play's areas in order, the hero's picked; its trial ground
      const open = () => key('Backquote', () => !!document.querySelector('.overlay.settings.open .debug-note'), 'the debug panel to open');
      const left = (what) => until(() => !game.paused && !document.querySelector('.overlay.open'), null, `the panel to shut after ${what}`);
      const row = (name) => page.locator('.overlay.settings.open .setting').filter({ has: page.locator('.label > span', { hasText: new RegExp(`^${name}$`) }) });
      await open();
      const list = await ev(() => {
        const r = [...document.querySelectorAll('.overlay.settings.open .setting')].find((x) => x.querySelector('.label > span')?.textContent === '前往');
        const s = r?.querySelector('select');
        const opts = [...(s?.options ?? [])];
        return { values: opts.map((o) => o.value), value: s?.value, here: String(game.area.id) };
      });
      expect(list.values.join() === [CAMP, MOOR, DEN, PLAINS].join() && list.value === list.here, `the area list is ${list.values.join()}, ${list.value} picked (the hero is in ${list.here})`);
      await row('前往').locator('select').selectOption(String(DEN));
      await debugButton('前往', '去').click();
      await left('going to the den');
      expect((await ev(() => game.area.id)) === DEN, 'the list did not lead to the den');
      // the next one on
      await open();
      await debugButton('前往', '下一个').click();
      await left('going on');
      const b = await ev(() => ({ id: game.area.id, west: game.level === window.__smoke.west }));
      expect(b.id === PLAINS && b.west, `next from the den went to area ${b.id}, on the overworld ${b.west}`);
      // the trial ground: a floor and a difficulty picked, then the next floor down
      await open();
      await row('试炼场').locator('select').first().selectOption('3');
      await debugButton('试炼场', '进入').click();
      await left('going to the trial ground');
      const t = await ev(() => ({ key: game.area.key, depth: game.level.depth, wps: [...game.player.waypoints] }));
      expect(t.key === 'floor3' && t.wps.join() === `${CAMP},${PLAINS}`, `the trial ground's floor 3 is ${t.key}, waypoints ${t.wps.join()}`);
      await open();
      await debugButton('前往', '下一个').click();
      await left('going on down');
      const t2 = await ev(() => ({ key: game.area.key, depth: game.level.depth }));
      expect(t2.key === 'floor4' && t2.depth === t.depth + 1, `next from floor 3 went to ${t2.key} at depth ${t2.depth}`);
      // and home
      await open();
      await row('前往').locator('select').selectOption(String(CAMP));
      await debugButton('前往', '去').click();
      await left('going home');
      expect((await ev(() => game.area.id)) === CAMP, 'the camp in the list did not lead to the camp');
      facts.push('area jumps and the trial ground');
    },

    async difficulty() {
      await key('Backquote', () => !!document.querySelector('.overlay.settings.open .debug-note'), 'the debug panel to open');
      const read = () =>
        ev((slot) => {
          const d = JSON.parse(localStorage.getItem(slot) ?? 'null');
          const row = [...document.querySelectorAll('.overlay.settings.open .setting')].find((r) => r.querySelector('.label > span')?.textContent === '难度');
          return {
            diff: game.player.difficulty,
            wps: [...game.player.waypoints],
            camp: game.area.id,
            saved: d && { difficulty: d.difficulty, unlocked: d.unlocked, normal: d.progress?.[0]?.waypoints, nightmare: d.progress?.[1]?.waypoints },
            shown: row?.querySelector('button.on')?.textContent,
            note: document.querySelector('.overlay.settings.open .debug-note')?.textContent ?? '',
          };
        }, DEV_SLOT);
      const s0 = await read();
      expect(s0.diff === 0 && s0.shown === '普通' && s0.wps.length > 1, `starting out: difficulty ${s0.diff} (${s0.shown}), waypoints ${s0.wps.join(' ')}`);
      await debugButton('难度', '噩梦').click();
      const s1 = await read();
      expect(s1.diff === 1 && s1.shown === '噩梦' && s1.note.includes('噩梦'), `nightmare picked: difficulty ${s1.diff}, ${s1.shown} shown, the note says ${s1.note}`);
      expect(s1.saved?.difficulty === 1 && s1.saved.unlocked >= 1, `nightmare picked, saved ${JSON.stringify(s1.saved)}`);
      // waypoints go by difficulty: nightmare's are only the camp's, normal's are kept
      expect(JSON.stringify(s1.wps) === JSON.stringify([CAMP]) && JSON.stringify(s1.saved?.nightmare) === JSON.stringify([CAMP]), `nightmare's waypoints ${s1.wps.join(' ')}, saved ${JSON.stringify(s1.saved?.nightmare)}`);
      expect(JSON.stringify(s1.saved?.normal) === JSON.stringify(s0.wps), `normal's saved waypoints ${JSON.stringify(s1.saved?.normal)}, it had ${s0.wps.join(' ')}`);
      await debugButton('难度', '普通').click();
      const s2 = await read();
      expect(s2.diff === 0 && s2.saved?.difficulty === 0 && JSON.stringify(s2.wps) === JSON.stringify(s0.wps), `back to normal: difficulty ${s2.diff}, saved ${s2.saved?.difficulty}, waypoints ${s2.wps.join(' ')}`);
      await key('Backquote', () => !document.querySelector('.overlay.settings.open'), 'the debug panel to close');
      await key('Escape', () => !game.paused && !document.querySelector('.overlay.open'), 'the pause menu to close');
      facts.push('difficulty saved');
    },

    async teleport() {
      // a jump out of the camp into Blood Moor moves the view with the hero and announces the area
      // without rebuilding the scene; walking back is noticed by the frame loop
      const s = await ev(() => {
        const S = window.__smoke;
        const L = game.level;
        const p = game.player;
        S.home = { ...p.pos };
        const out = L.map.nearestWalkable(S.moor.x, S.moor.z) ?? S.moor;
        const builds = S.builds;
        const view = renderer.levelGroup.children[0];
        game.teleportWithin(out);
        const cam = renderer.camTarget;
        return {
          moved: S.dist(p.pos, out),
          cam: Math.hypot(cam.x - out.x, cam.z - out.z),
          area: game.area.id,
          sfx: game.sfx.area === game.area,
          town: L.inTown(p.pos),
          same: game.level === L && renderer.levelGroup.children[0] === view,
          builds: S.builds - builds,
          banner: (({ dataset, classList }) => dataset.area === game.area.key && classList.contains('show'))(document.getElementById('area-banner')),
        };
      });
      expect(s.moved < 0.01 && s.cam < 0.01, `the jump left the hero ${s.moved.toFixed(2)} m and the camera ${s.cam.toFixed(2)} m off the spot`);
      expect(s.area === MOOR && s.sfx && !s.town, `after the jump: area ${s.area}, the sound's the same ${s.sfx}, in town ${s.town}`);
      expect(s.same && s.builds === 0, `the jump rebuilt the scene (${s.builds} builds)`);
      expect(s.banner, "Blood Moor's name wasn't shown after the jump");
      await frames();
      await shot('teleport');
      // walked back in (put there): the next frames see the camp again
      await ev(() => {
        const p = game.player;
        p.pos = { ...window.__smoke.home };
        p.prevPos = { ...p.pos };
      });
      await until((a) => game.area.id === a, CAMP, 'the camp to be noticed after walking back');
    },

    async save() {
      const s = await ev((slot) => {
        game.save();
        const p = game.player;
        const raw = localStorage.getItem(slot);
        const d = raw ? JSON.parse(raw) : null;
        const slots = Object.keys(localStorage).filter((k) => k.startsWith('dii-save'));
        return {
          d: d && {
            v: d.v,
            mig: d.mig,
            name: d.name,
            cls: d.cls,
            level: d.level,
            area: d.area,
            depth: d.depth,
            waypoints: d.progress?.[d.difficulty]?.waypoints,
            diffs: d.progress?.length,
            merc: d.merc,
            corpse: d.corpse,
            inv: d.inventory?.length,
            skills: d.skills,
            seed: d.worldSeed,
          },
          slots,
          name: p.name,
          cls: p.cls,
          level: p.level,
          inv: p.inventory.items.length,
          skills: p.skills,
          seed: game.worldSeed,
        };
      }, DEV_SLOT);
      if (!expect(s.d, `nothing saved in ${DEV_SLOT}`)) return;
      expect(s.d.v === SAVE_V, `saved as version ${s.d.v}, expected ${SAVE_V}`);
      expect(s.d.mig && typeof s.d.mig.items === 'number' && typeof s.d.mig.world === 'number' && typeof s.d.mig.skills === 'number', `saved migration counts ${JSON.stringify(s.d.mig)}`);
      expect(s.d.name === s.name && s.d.cls === s.cls && s.d.level === s.level, `saved ${s.d.name}/${s.d.cls}/${s.d.level}, playing ${s.name}/${s.cls}/${s.level}`);
      expect(s.d.area === CAMP && s.d.depth === undefined && s.d.inv === s.inv && s.d.seed === s.seed, `saved area ${s.d.area}, depth ${s.d.depth}, seed ${s.d.seed} (the game's ${s.seed}), with ${s.d.inv} items in the bag (has ${s.inv})`);
      // Cold Plains' waypoint was used, kept by area for this difficulty
      expect(s.d.diffs === 3 && JSON.stringify(s.d.waypoints) === JSON.stringify([CAMP, PLAINS]), `saved waypoints ${JSON.stringify(s.d.waypoints)} over ${s.d.diffs} difficulties`);
      expect(s.d.merc === null && s.d.corpse === null, `saved merc ${JSON.stringify(s.d.merc)}, corpse ${JSON.stringify(s.d.corpse)}`);
      expect(JSON.stringify(s.d.skills) === JSON.stringify(s.skills), 'the saved skills differ');
      expect(s.slots.length === 1, `save keys written: ${s.slots.join(', ')}`);
      facts.push(`saved v${s.d.v}`);
    },
  };

  try {
    for (const [name, fn] of Object.entries(steps)) {
      step = name;
      await fn();
    }
    step = 'end';
  } catch (e) {
    fails.push(`${step}: ${String(e.message ?? e).split('\n')[0]}`);
  }
  await page.waitForTimeout(100);
  const errs = [...new Set(errors)];
  if (errs.length) fails.push(`${errs.length} page error(s): ${errs.slice(0, 5).join(' | ')}`);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(fails.length ? `SMOKE FAIL ${fails.join('; ')} (${secs} s)` : `SMOKE OK ${facts.join(', ')} in ${secs} s`);
}
