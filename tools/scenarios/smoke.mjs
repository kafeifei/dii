// End-to-end smoke test, the check every change runs (tools/play.mjs scenario):
//   node tools/play.mjs tools/scenarios/smoke.mjs --url "http://localhost:5174/?dev"        the paladin
//   node tools/play.mjs tools/scenarios/smoke.mjs --url "http://localhost:5174/?dev&sorc"   the sorceress
// Reloads the page with empty storage, then plays a short run through the real UI and the game's
// own API: the HUD and every panel, the debug panel's cheats, loot, the camp's services, the
// wilderness and the first dungeon floor (every skill cast, kills and their drops), a town portal
// there and back, a jump within the camp (Game.teleportWithin), and the save. Page errors and
// console errors count from the reload on, and fail the run. The last line is "SMOKE OK <summary>"
// or "SMOKE FAIL <reasons>".

/** the version writeSave in src/game/save.ts stamps on a save: bump it with that */
const SAVE_V = 3;
/** the save slot ?dev plays in (src/game/save.ts), apart from the real characters */
const DEV_SLOT = 'dii-save-dev';
/** how many monsters to kill on the dungeon floor */
const KILLS = 8;

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
      const s = await ev(() => ({ cls: game.player.cls, depth: game.level.depth, level: game.player.level }));
      expect(s.cls === cls, `started as ${s.cls}, the URL asks for ${cls}`);
      expect(s.depth === 0, `started at depth ${s.depth}, not in the camp`);
      facts.push(s.cls);
      // helpers for the steps below, kept on the page
      await ev(() => {
        const S = (window.__smoke = {});
        S.dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
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
          const o = game.level.objects.find((x) => x.kind === kind);
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
      await debugButton('随机装备', '5 件').click();
      const s2 = await state();
      expect(s2.ground === s1.ground + 5, `5 random gear dropped ${s2.ground - s1.ground}`);
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
      expect(opts.stored.loot === 5 && opts.stored.god === true, `stored debug settings ${JSON.stringify(opts.stored)}`);
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

    async wild() {
      const s = await ev(() => {
        game.travel(1);
        window.__smoke.wildArea = game.area.id;
        const banners = [...document.querySelectorAll('#messages > div')].filter((e) => e.textContent === game.area.name).length;
        return { depth: game.level.depth, area: game.area.kind, banners, exit: game.level.objects.some((o) => o.kind === 'exit' && o.dest === 0), stairs: game.level.objects.some((o) => o.kind === 'stairs'), monsters: game.level.monsters.length };
      });
      expect(s.depth === 1 && s.area === 'outdoor', `travel(1) went to depth ${s.depth}, a ${s.area} area`);
      expect(s.banners === 1, `the wilderness's name shown ${s.banners} times on the way in`);
      expect(s.exit && s.stairs, `the wilderness has exit ${s.exit}, stairs ${s.stairs}`);
      expect(s.monsters > 0, 'no monsters in the wilderness');
      await frames();
      await shot('wild');
    },

    async dungeon() {
      // down the stairs to the first dungeon floor
      const s = await ev(() => {
        game.enterLevel(2, 'stairs');
        return { depth: game.level.depth, waypoint: game.player.waypoints.includes(game.level.depth), monsters: game.level.monsters.length };
      });
      expect(s.depth === 2, `enterLevel(2) went to depth ${s.depth}`);
      expect(s.waypoint, 'the waypoint on the floor was not activated');
      expect(s.monsters > 0, 'no monsters on the floor');
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
      await shot('dungeon-skills');
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
        window.__smoke.dungeon = game.level;
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
        const out = {};
        game.interact(game.level.objects.find((o) => o.kind === 'portal'));
        out.town = game.level.depth;
        const back = game.level.objects.find((o) => o.kind === 'portal');
        out.backDest = back?.dest;
        if (back) game.interact(back);
        out.again = game.level.depth;
        out.same = game.level === window.__smoke.dungeon;
        out.left = game.level.objects.filter((o) => o.kind === 'portal').length;
        return out;
      });
      expect(s.town === 0, `the portal went to depth ${s.town}`);
      expect(s.backDest === 2, `the camp's portal leads to ${s.backDest}`);
      expect(s.again === 2 && s.same, `back through the portal: depth ${s.again}, same floor ${s.same}`);
      expect(s.left === 0, `${s.left} portal(s) still on the floor after coming back`);
    },

    async home() {
      const depth = await ev(() => {
        game.travel(0);
        return game.level.depth;
      });
      expect(depth === 0, `travel(0) went to depth ${depth}`);
    },

    async teleport() {
      // the camp's east part made wilderness for the test: a jump into it moves the view with the hero
      // and announces the area without rebuilding the scene; walking back is noticed by the frame loop
      const s = await ev(() => {
        const S = window.__smoke;
        const L = game.level;
        const map = L.map;
        const p = game.player;
        S.campArea = game.area.id;
        S.areasBefore = L.areas.slice();
        const east = Math.floor(map.w * 0.6);
        for (let z = 0; z < map.h; z++) for (let x = east; x < map.w; x++) L.areas[z * map.w + x] = S.wildArea;
        const spotIn = (x0, x1) => {
          for (let z = 4; z < map.h - 4; z++) for (let x = x0; x < x1; x++) if (map.circleClear(x + 0.5, z + 0.5, 0.45)) return { x: x + 0.5, z: z + 0.5 };
          return null;
        };
        const out = spotIn(east + 2, map.w - 4);
        S.home = spotIn(4, east - 2);
        if (!out || !S.home) return { error: 'no walkable spots either side of the camp' };
        let builds = 0;
        const build = renderer.buildLevel;
        renderer.buildLevel = (...a) => {
          builds++;
          return build.apply(renderer, a);
        };
        const view = renderer.levelGroup.children[0];
        game.teleportWithin(out);
        renderer.buildLevel = build;
        const cam = renderer.camTarget;
        return {
          moved: S.dist(p.pos, out),
          cam: Math.hypot(cam.x - out.x, cam.z - out.z),
          area: game.area.id,
          sfx: game.sfx.area === game.area,
          town: L.inTown(p.pos),
          same: game.level === L && renderer.levelGroup.children[0] === view,
          builds,
          banner: [...document.querySelectorAll('#messages > div')].some((e) => e.textContent === game.area.name),
        };
      });
      if (s.error) throw new Error(s.error);
      expect(s.moved < 0.01 && s.cam < 0.01, `the jump left the hero ${s.moved.toFixed(2)} m and the camera ${s.cam.toFixed(2)} m off the spot`);
      expect(s.area === (await ev(() => window.__smoke.wildArea)) && s.sfx && !s.town, `after the jump: area ${s.area}, the sound's the same ${s.sfx}, in town ${s.town}`);
      expect(s.same && s.builds === 0, `the jump rebuilt the scene (${s.builds} builds)`);
      expect(s.banner, "the wilderness's name wasn't shown after the jump");
      await frames();
      await shot('teleport');
      // walked back in (put there): the next frames see the camp again
      await ev(() => {
        const p = game.player;
        p.pos = { ...window.__smoke.home };
        p.prevPos = { ...p.pos };
      });
      await until((a) => game.area.id === a, await ev(() => window.__smoke.campArea), 'the camp to be noticed after walking back');
      await ev(() => game.level.areas.set(window.__smoke.areasBefore));
    },

    async save() {
      const s = await ev((slot) => {
        game.save();
        const p = game.player;
        const raw = localStorage.getItem(slot);
        const d = raw ? JSON.parse(raw) : null;
        const slots = Object.keys(localStorage).filter((k) => k.startsWith('dii-save'));
        return { d: d && { v: d.v, name: d.name, cls: d.cls, level: d.level, depth: d.depth, inv: d.inventory?.length, skills: d.skills }, slots, name: p.name, cls: p.cls, level: p.level, inv: p.inventory.items.length, skills: p.skills };
      }, DEV_SLOT);
      if (!expect(s.d, `nothing saved in ${DEV_SLOT}`)) return;
      expect(s.d.v === SAVE_V, `saved as version ${s.d.v}, expected ${SAVE_V}`);
      expect(s.d.name === s.name && s.d.cls === s.cls && s.d.level === s.level, `saved ${s.d.name}/${s.d.cls}/${s.d.level}, playing ${s.name}/${s.cls}/${s.level}`);
      expect(s.d.depth === 0 && s.d.inv === s.inv, `saved depth ${s.d.depth} with ${s.d.inv} items in the bag (has ${s.inv})`);
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
