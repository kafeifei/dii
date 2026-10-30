// A maze's objects in the real game, on a test map (tools/play.mjs scenario; lane D's dungeons aren't in yet):
//   node tools/play.mjs tools/scenarios/objects.mjs --url http://localhost:5185/ --dev --out <dir>
// On the trial ground's first floor, the hero in its first room, god mode on and its monsters held:
// one of each object a maze sets down in a row by the hero, as level.ts makes them (src/game/containers.ts
// objectName): a casket, a grave of its cluster, a rogue's corpse with flies, a well, a locked chest, the
// Cave Level 2 spark chest (580's rules), the Mausoleum's (397) and an exploding barrel. Each is hovered:
// the name the HUD shows is ours (D2X_OBJECT_NAMES), none the official one. Then each is used: the
// casket tried until it opens, the grave dug, the corpse searched, the well drunk from with the hero
// hurt (a drink taken, the glint on while one is left), the locked chest refused without a key and
// opened with one (the key gone), the spark chests opened, the barrel broken (no drop). What dropped
// all lands. Then three trapped spark chests, the game run on the scenario's steps: a trap of fire
// bolts (the chest drops, the bolt leaves it 35 frames on, none before, and burns the hero), of fire
// (two fires on the chest that burn the hero in them, not 3 m off) and of trap monsters (one or two
// zombies at the chest); and five exploding barrels a cluster's step apart, a plain one beside: the
// first broken, the five go off, the plain one stays, a monster by them is struck, the hero 2 m off
// isn't. An exploding barrel clicked as a player does: the hero walks to D2's reach of it and breaks
// it there, inside its blast. Then one shrine of each kind a shrine can be (D2's Shrines.txt) in a
// row, hovered: our names (X祭坛), never the official ones; a refilling, an armor and a skill altar
// touched: the refill fills, the armor blessing gives way to the skill one, which shows under the
// minimap with its 96 seconds. Page and console errors fail the run. Shots: the row with nothing used,
// each hovered with its name, the row used, each trap going off, the barrels before, in and after the
// chain, the barrel walked up to, the shrines' row, a shrine hovered, the shrines touched. The last
// line is "OBJECTS OK …" or "OBJECTS FAIL …".

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
  const until = async (fn, arg, what, timeout = 8000) => {
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

  try {
    step = 'the test map';
    await until(() => window.game?.player && window.renderer, null, 'the game');
    await ev(async () => {
      const S = (window.__o = {});
      S.debug = (await import('/src/game/debug.ts')).debugOpts;
      S.C = await import('/src/game/containers.ts');
      S.O = await import('/src/game/objects.ts');
      S.N = (await import('/src/data/d2x/objects.ts')).D2X_OBJECT_NAMES;
      S.make = (await import('/src/items/gen.ts')).createItem;
      /**
       * the nearest spot to `want`, looking round it out to `reach` m, that `ok` takes, else null: what
       * the steps below set down goes on open ground this way, as the first row does, never on the
       * nearest walkable spot alone, which on the floor's random room can be past one of its walls (a
       * trap's bolt flew into the wall; a barrel walked up to was come at round a corner, not head-on)
       * or on top of what was set down before (a shrine hovered showed the one on it)
       */
      S.find = (want, ok, reach = 6) => {
        for (let r = 0; r <= reach; r += 0.25)
          for (let a = 0; a < (r ? 16 : 1); a++) {
            const q = { x: want.x + Math.cos((a * Math.PI) / 8) * r, z: want.z + Math.sin((a * Math.PI) / 8) * r };
            if (ok(q)) return q;
          }
        return null;
      };
      S.said = [];
      const message = game.hooks.message.bind(game.hooks);
      game.hooks.message = (t, c, d) => {
        S.said.push(t);
        message(t, c, d);
      };
      S.debug.god = true;
      game.enterTrial(1);
    });
    await until(() => window.renderer.level === window.game.level && window.game.level.depth > 0, null, 'the trial floor built', 15000);
    await frames(10);
    const layout = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      // the floor's biggest room, its middle, cleared of the monsters and objects the old generator put round it; the rest held
      const room = [...L.layout.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
      const mid = L.map.nearestWalkable(room.x + room.w / 2, room.y + room.h / 2);
      const far = (q) => Math.hypot(q.x - mid.x, q.z - mid.z) > 12;
      L.monsters = L.monsters.filter((m) => far(m.pos));
      for (const m of L.monsters) {
        m.stunTime = 1e9;
        m.awake = false;
      }
      L.objects = L.objects.filter((o) => far(o.pos));
      game.teleportWithin(mid);
      p.intent = null;
      const row = [
        ['casket', { d2: 3 }],
        ['casket', { d2: 28, hole: true }],
        ['remains', { d2: 54, flies: true }],
        ['well', { d2: 138 }],
        ['chest', { d2: 5, locked: true }],
        ['chest', { d2: 176, sparkly: 'unique' }],
        ['chest', { d2: 397, sparkly: 'consolation' }],
        ['barrel', { d2: 11, exploding: true }],
      ];
      // two rows of four round the hero, 1.8 tiles apart, each on the nearest walkable spot clear of the
      // room's furniture and decor (which the map was built with) and of the others
      const out = [];
      const taken = [...L.layout.props.map((q) => ({ x: q.x, z: q.z })), ...L.layout.decor.map((q) => ({ x: q.x, z: q.z })), { ...mid }];
      const clear = (q) => L.map.circleClear(q.x, q.z, 0.5) && taken.every((t) => Math.hypot(t.x - q.x, t.z - q.z) > 1.3);
      row.forEach(([kind, extra], i) => {
        const want = { x: mid.x - 2.7 + (i % 4) * 1.8, z: mid.z + (i < 4 ? -1.8 : 1.8) };
        let spot = want;
        for (let r = 0; r < 4 && !clear(spot); r += 0.25) {
          for (let a = 0; a < 16; a++) {
            const q = { x: want.x + Math.cos((a * Math.PI) / 8) * r, z: want.z + Math.sin((a * Math.PI) / 8) * r };
            if (clear(q)) {
              spot = q;
              break;
            }
          }
        }
        taken.push(spot);
        const o = new S.O.WorldObject(kind, spot, S.C.objectName(kind, extra) ?? '', kind === 'well' ? 0.7 : 0.5);
        Object.assign(o, extra);
        L.objects.push(o);
        out.push({ id: o.id, kind, name: o.name, extra, pos: o.pos });
      });
      S.row = out.map((x) => L.objects.find((o) => o.id === x.id));
      return out;
    });
    await frames(20);
    await page.mouse.move(4, 4);
    await frames(4);
    await shot('objects-untouched');
    // and as near as the wheel goes (renderer.ts: zoom 4.5)
    await ev(() => (window.renderer.zoomTarget = 4.5));
    await frames(40);
    await shot('objects-untouched-near');

    step = 'hover names';
    const want = { casket: 'Casket', grave: 'HoleAnim', remains: 'RogueCorpse', well: 'Well', locked: 'lockedchest', chest: 'chest', barrel: 'Barrel' };
    const official = { Casket: '棺木', HoleAnim: '未被亵渎的坟墓', RogueCorpse: '死去的流亡者', Well: '井', lockedchest: '锁住的箱子', chest: '箱子', Barrel: '桶' };
    const names = await ev(() => window.__o.N);
    for (const [i, o] of layout.entries()) {
      const key = o.kind === 'casket' ? (o.extra.hole ? want.grave : want.casket) : o.kind === 'chest' ? (o.extra.locked ? want.locked : want.chest) : want[o.kind];
      const at = await ev(({ x, z }) => {
        const c = renderer.camera;
        c.updateMatrixWorld();
        const v = c.matrixWorldInverse.elements;
        const pm = c.projectionMatrix.elements;
        const mul = (m, [a, b, cc, d]) => [0, 1, 2, 3].map((r) => m[r] * a + m[4 + r] * b + m[8 + r] * cc + m[12 + r] * d);
        const e = mul(pm, mul(v, [x, 0.35, z, 1]));
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: r.left + ((e[0] / e[3] + 1) / 2) * r.width, y: r.top + ((1 - e[1] / e[3]) / 2) * r.height };
      }, o.pos);
      await page.mouse.move(at.x, at.y);
      await frames(6);
      const shown = await ev(() => ({ hover: game.hover.object?.id ?? null, label: document.querySelector('#target .name')?.textContent ?? '' }));
      expect(shown.hover === o.id && shown.label === names[key].name && shown.label !== official[key], `${o.kind} ${JSON.stringify(o.extra)}: hovered ${shown.hover} showing "${shown.label}", ours ${names[key].name}, official ${official[key]}`);
      if (i === 0 || i === 1 || i === 2 || i === 3 || i === 4) await shot(`hover-${o.kind}${o.extra.hole ? '-grave' : o.extra.locked ? '-locked' : ''}`);
      facts.push(`${shown.label}`);
    }
    await page.mouse.move(4, 4);

    step = 'used';
    const used = await ev(() => {
      const S = window.__o;
      const p = game.player;
      const L = game.level;
      const [casket, grave, remains, well, locked, spark, consol, barrel] = S.row;
      const r = {};
      const ground0 = L.ground.length;
      let tries = 0;
      while (!casket.used && tries < 60) {
        tries++;
        game.interact(casket);
      }
      r.casket = { used: casket.used, tries };
      tries = 0;
      while (!grave.used && tries < 60) {
        tries++;
        game.interact(grave);
      }
      r.grave = { used: grave.used, tries };
      game.interact(remains);
      r.remains = remains.used;
      p.life = p.stats.maxLife * 0.3;
      const life0 = p.life;
      game.interact(well);
      r.well = { left: S.C.wellCharges(well, game.time), healed: p.life > life0, spent: S.O.spent(well) };
      S.said.length = 0;
      game.interact(locked);
      r.lockedShut = !locked.used && S.said.some((t) => t.includes('钥匙'));
      const key = Object.assign(S.make('key'), { qty: 1 });
      r.keyIn = p.inventory.add(key);
      game.interact(locked);
      r.locked = { used: locked.used, keyGone: !p.inventory.contains(key) };
      game.interact(spark);
      game.interact(consol);
      r.spark = spark.used && consol.used;
      const g1 = L.ground.length;
      game.interact(barrel);
      r.barrel = { used: barrel.used, dropped: L.ground.length - g1 };
      r.dropped = L.ground.length - ground0;
      return r;
    });
    expect(used.casket.used && used.grave.used, `casket ${JSON.stringify(used.casket)}, grave ${JSON.stringify(used.grave)}`);
    expect(used.remains, 'the corpse not searched');
    expect(used.well.left === 1 && used.well.healed && !used.well.spent, `the well: ${JSON.stringify(used.well)}`);
    expect(used.lockedShut && used.keyIn && used.locked.used && used.locked.keyGone, `the locked chest: shut ${used.lockedShut}, opened ${JSON.stringify(used.locked)}`);
    expect(used.spark, 'a spark chest not opened');
    expect(used.barrel.used && used.barrel.dropped === 0, `the exploding barrel: ${JSON.stringify(used.barrel)}`);
    facts.push(`casket in ${used.casket.tries} tries, grave in ${used.grave.tries}, ${used.dropped} drops on the floor`);
    await frames(40);
    await shot('objects-used');
    const standIns = await ev(() => window.renderer.standInCount());
    expect(standIns === 0, `${standIns} stand-ins left with every model in`);

    step = 'stand-ins';
    // the casket's, the grave's and the well's models taken out of what's in (as if still coming), a
    // fresh row made: drawn in code, waiting on them; put back, the views are made again with them
    const before = await ev(async () => {
      const S = window.__o;
      const L = game.level;
      const { OBJECT_MODELS } = await import('/src/render/needs.ts');
      S.keys = Object.values(OBJECT_MODELS);
      S.saved = S.keys.map((k) => [k, assets.templates.get(k)]);
      for (const k of S.keys) assets.templates.delete(k);
      L.objects = L.objects.filter((o) => !S.row.includes(o));
      S.row2 = S.row.slice(0, 4).map((o0) => {
        const o = new S.O.WorldObject(o0.kind, o0.pos, o0.name, o0.radius);
        for (const k of ['d2', 'hole', 'flies']) if (o0[k] !== undefined) o[k] = o0[k];
        L.objects.push(o);
        return o;
      });
      return renderer.standInCount();
    });
    await frames(30);
    const waiting = await ev(() => window.renderer.standInCount());
    expect(waiting >= 3, `with the models out, ${waiting} stand-ins (before ${before}): the casket, the grave and the well should wait`);
    await shot('objects-stand-ins-near');
    await ev(() => {
      for (const [k, t] of window.__o.saved) if (t) assets.templates.set(k, t);
    });
    await frames(60);
    const left = await ev(() => window.renderer.standInCount());
    expect(left === 0, `the models back, ${left} stand-ins left`);
    await shot('objects-swapped-near');
    facts.push(`${waiting} stand-ins with the models out, ${left} once back`);

    step = 'chest traps';
    // three trapped spark chests (they always drop) 2.2 m round the hero, the rows taken away: a trap of
    // fire bolts (2), of fire (5) and of trap monsters (8), each opened and the game run on the scenario's
    // steps (Game.headless) to 35 frames on and past (containers.ts armTrap, updateTraps)
    const traps = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      L.objects = L.objects.filter((o) => !S.row.includes(o) && !(S.row2 ?? []).includes(o));
      // what the row dropped, counted above, taken off the floor: the shots below are of the traps and the barrels
      L.ground = [];
      const mid = { ...p.pos };
      // the trial floor's trap monster, as the Crypt's (spawn.ts trapMonster reads the kinds it drew)
      const area = L.areaAt(mid.x, mid.z);
      const rep = L.spawned.get(area.id);
      if (rep) rep.kinds = ['zombie1', ...rep.kinds];
      // each on open ground with a clear way to the hero, apart from the others (S.find)
      const set = [];
      const at = (dx, dz) => {
        const off = (q) => Math.hypot(q.x - mid.x, q.z - mid.z);
        const q = S.find({ x: mid.x + dx, z: mid.z + dz }, (q) => off(q) >= 1.5 && off(q) <= 5 && L.map.circleClear(q.x, q.z, 0.35) && L.map.los(mid, q) && set.every((t) => Math.hypot(t.x - q.x, t.z - q.z) > 1.2));
        if (!q) throw new Error(`no open ground in sight of the hero for a chest ${dx}, ${dz} off`);
        set.push(q);
        return q;
      };
      const chest = (trap, pos) => {
        const o = new S.O.WorldObject('chest', pos, S.C.objectName('chest', { d2: 176 }) ?? '', 0.45);
        Object.assign(o, { d2: 176, sparkly: 'unique', trap });
        L.objects.push(o);
        return o;
      };
      S.bolt = chest(2, at(2.2, 0));
      S.fire = chest(5, at(-2.2, 0));
      S.mons = chest(8, at(0, 2.2));
      /** the game run `secs` on 1/60 s steps, the page's loop held, as tools/bot.mjs runs it */
      S.step = (secs) => {
        const was = game.headless;
        game.headless = true;
        try {
          for (let k = 0; k < Math.round(secs * 60); k++) game.update(1 / 60);
        } finally {
          game.headless = was;
        }
      };
      return { mid, kinds: rep?.kinds.slice(0, 3) };
    });
    await ev(() => (window.renderer.zoomTarget = 5));
    await frames(30);
    // the fire bolt: set off as the chest opens, out of it 35 frames on, at the hero
    const bolt = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      p.life = p.stats.maxLife;
      const g0 = L.ground.length;
      game.interact(S.bolt);
      const r = { dropped: L.ground.length - g0, waiting: S.C.trapWaiting(L, S.bolt) };
      // (what it dropped counted, taken off the floor with the rest so the shots show the trap, not the labels)
      L.ground = [];
      S.step(1.3);
      r.early = L.projectiles.filter((x) => x.kind === 'firebolt').length;
      S.step(0.2);
      r.flying = L.projectiles.filter((x) => x.kind === 'firebolt' && x.owner === null).length;
      r.life0 = p.life;
      // the bolt held where it is for the shot, the page's loop kept off the game until it has landed:
      // run on, the bolt could reach the hero in the frames the shot took (it burnt them there, and
      // the steps below found it gone and nothing taken)
      game.headless = true;
      return r;
    });
    await frames(3);
    await shot('trap-firebolt');
    const boltHit = await ev(() => {
      const S = window.__o;
      const p = game.player;
      // a step at a time until it's gone: what the hero lost in the step it went (their regeneration a frame's)
      let taken = 0;
      try {
        for (let k = 0; k < 120; k++) {
          const flying = game.level.projectiles.some((x) => x.kind === 'firebolt');
          if (!flying) break;
          const before = p.life;
          S.step(1 / 60);
          if (!game.level.projectiles.some((x) => x.kind === 'firebolt')) taken = before - p.life;
        }
      } finally {
        game.headless = false;
      }
      return { taken, left: game.level.projectiles.filter((x) => x.kind === 'firebolt').length };
    });
    expect(bolt.dropped > 0 && bolt.waiting && bolt.early === 0 && bolt.flying === 1 && boltHit.left === 0 && boltHit.taken > 0, `the fire bolt trap: ${JSON.stringify(bolt)}, then ${JSON.stringify(boltHit)}`);
    facts.push(`a fire bolt trap: ${bolt.dropped} dropped, the bolt out at 35 frames, ${boltHit.taken.toFixed(1)} fire taken`);
    // fire: the large fire on the chest and the small one beside it, burning the hero who steps in
    const fire = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      const g0 = L.ground.length;
      game.interact(S.fire);
      const r = { dropped: L.ground.length - g0 };
      L.ground = [];
      S.step(2);
      r.fires = S.fire.fires?.length ?? 0;
      return r;
    });
    await ev(() => {
      const f = window.__o.fire.pos;
      game.teleportWithin(game.level.map.nearestWalkable(f.x + 1.3, f.z + 0.6) ?? f);
    });
    await frames(20);
    await shot('trap-fire');
    const burnt = await ev(() => {
      const S = window.__o;
      const p = game.player;
      p.pos = { x: S.fire.pos.x + 0.1, z: S.fire.pos.z };
      p.life = p.stats.maxLife;
      // a step at a time for 6 s: each drop of life a burn (their regeneration only adds)
      let burns = 0;
      let lost = 0;
      for (let k = 0; k < 360; k++) {
        const before = p.life;
        S.step(1 / 60);
        if (p.life < before - 1e-6) {
          burns++;
          lost += before - p.life;
        }
      }
      // and out of them, 3 m off, none
      p.pos = game.level.map.nearestWalkable(S.fire.pos.x + 3, S.fire.pos.z) ?? p.pos;
      let after = 0;
      for (let k = 0; k < 180; k++) {
        const before = p.life;
        S.step(1 / 60);
        if (p.life < before - 1e-6) after++;
      }
      return { burns, lost, after };
    });
    expect(fire.dropped > 0 && fire.fires >= 1 && burnt.burns > 0 && burnt.after === 0, `the fire trap: ${JSON.stringify(fire)}, the hero in it ${JSON.stringify(burnt)}`);
    facts.push(`a fire trap: ${fire.fires} fires, the hero in them burnt ${burnt.burns} times in 6 s (${burnt.lost.toFixed(0)} life), none 3 m off`);
    // the trap monsters: one or two of the floor's risen at the chest
    const mons = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      p.pos = { ...S.fire.pos, x: S.fire.pos.x + 2.6 };
      game.teleportWithin(L.map.nearestWalkable(S.mons.pos.x, S.mons.pos.z - 2) ?? p.pos);
      const n0 = L.monsters.length;
      const g0 = L.ground.length;
      game.interact(S.mons);
      const r = { dropped: L.ground.length - g0 };
      L.ground = [];
      S.step(1.5);
      const risen = L.monsters.slice(n0);
      for (const m of risen) m.stunTime = 1e9;
      r.risen = risen.map((m) => m.def.id);
      return r;
    });
    await frames(20);
    await shot('trap-monsters');
    expect(mons.dropped > 0 && (mons.risen.length === 1 || mons.risen.length === 2), `the trap monsters: ${JSON.stringify(mons)} (kinds ${traps.kinds?.join(' ')})`);
    facts.push(`a trap of monsters: ${mons.risen.join(' ')}`);

    step = 'a barrel chain';
    // five exploding barrels 2 subtiles apart and one a step aside: the first broken, all go off; a held
    // monster stood beside them is struck; the hero 2 m off isn't
    const chain = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      const sub = (v) => (Math.floor(v * 4) + 0.5) / 4;
      // where the barrels, the monster and the hero 2 m off stand round `c`: on open ground, nothing set
      // down before on it, the monster in sight of every barrel (S.find)
      const strip = (c) => {
        const o0 = { x: sub(c.x - 1), z: sub(c.z) };
        const barrels = [0, 0.5, 1, 1.5, 2, 2.5].map((dx) => ({ x: o0.x + dx, z: o0.z }));
        const mon = { x: o0.x + 1, z: o0.z + 0.5 };
        const hero = { x: c.x, z: c.z - 2 };
        const ok = [...barrels, mon, hero].every((q) => L.map.circleClear(q.x, q.z, 0.3) && L.objects.every((o) => Math.hypot(o.pos.x - q.x, o.pos.z - q.z) > 0.8)) && barrels.every((b) => L.map.los(b, mon));
        return ok ? o0 : null;
      };
      const c = S.find({ x: S.fire.pos.x, z: S.fire.pos.z + 3 }, strip);
      if (!c) throw new Error('no open ground for the barrels');
      game.teleportWithin({ x: c.x, z: c.z - 2 });
      const o0 = strip(c);
      S.chain = [0, 2, 4, 6, 8].map((dx) => {
        const o = new S.O.WorldObject('barrel', { x: o0.x + dx * 0.25, z: o0.z }, S.C.objectName('barrel', { d2: 11 }) ?? '', 0.35);
        Object.assign(o, { d2: 11, exploding: true });
        L.objects.push(o);
        return o;
      });
      const plain = new S.O.WorldObject('barrel', { x: o0.x + 2.5, z: o0.z }, S.C.objectName('barrel', { d2: 7 }) ?? '', 0.35);
      Object.assign(plain, { d2: 7 });
      L.objects.push(plain);
      S.plain = plain;
      const m = L.monsters.find((x) => !x.dead && !x.def.still);
      if (m) {
        m.pos = { x: o0.x + 1, z: o0.z + 0.5 };
        m.life = m.maxLife;
        // and where the level looks for it (Level.monstersMoved): one held far off is never stepped,
        // so its cell stayed where it stood and the blast, looking near the barrels, never found it
        L.monstersMoved([m]);
      }
      S.struck = m;
      return { monster: m?.def.id ?? null, life: m?.life ?? 0 };
    });
    await frames(30);
    await shot('barrels-before');
    const blown = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      const life0 = p.life;
      const g0 = L.ground.length;
      game.interact(S.chain[0]);
      return { gone: S.chain.filter((b) => b.used).length, plain: S.plain.used, hero: life0 - p.life, monster: S.struck ? S.struck.maxLife - S.struck.life : null, dropped: L.ground.length - g0 };
    });
    await frames(4);
    await shot('barrel-chain');
    await frames(40);
    await shot('barrel-chain-after');
    expect(blown.gone === 5 && !blown.plain && blown.hero === 0 && (chain.monster === null || blown.monster > 0), `the chain: ${JSON.stringify(blown)} (${JSON.stringify(chain)})`);
    facts.push(`a chain of ${blown.gone} exploding barrels, the plain one beside it whole, ${chain.monster ?? 'no monster'} struck for ${blown.monster?.toFixed(1)}, the hero 2 m off untouched`);

    step = 'an exploding barrel walked up to';
    // clicked as a player does (an interact intent): the hero walks till D2's reach (src/game/reach.ts)
    // and breaks it there, inside its 3-subtile blast
    const walked = await ev(() => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      // head-on: the barrel and the hero 3 m off along x on open ground, the way between them clear of
      // walls, of what was set down before and of the monsters (S.find)
      const lane = (c) => {
        const from = { x: c.x + 3, z: c.z };
        const along = [0, 0.5, 1, 1.5, 2, 2.5, 3].map((d) => ({ x: c.x + d, z: c.z }));
        const clear = (q) => L.objects.every((o) => Math.hypot(o.pos.x - q.x, o.pos.z - q.z) > 1) && L.monsters.every((m) => m.dead || Math.hypot(m.pos.x - q.x, m.pos.z - q.z) > 1.5);
        return L.map.circleClear(c.x, c.z, 0.45) && L.map.circleClear(from.x, from.z, 0.45) && L.map.los(from, c, 0.4) && along.every(clear);
      };
      const c = S.find({ x: S.fire.pos.x, z: S.fire.pos.z - 3 }, lane);
      if (!c) throw new Error('no open way 3 m long for the barrel walked up to');
      const o = new S.O.WorldObject('barrel', c, S.C.objectName('barrel', { d2: 11 }) ?? '', 0.35);
      Object.assign(o, { d2: 11, exploding: true });
      L.objects.push(o);
      game.teleportWithin({ x: c.x + 3, z: c.z });
      p.intent = { kind: 'interact', obj: o };
      for (let k = 0; k < 6 * 60 && !o.used; k++) S.step(1 / 60);
      return { used: o.used, off: Math.hypot(p.pos.x - c.x, p.pos.z - c.z), inBlast: S.C.d2InRange(o.pos, p.pos, S.C.BLAST_RANGE) };
    });
    await frames(4);
    await shot('barrel-walked-up');
    expect(walked.used && walked.inBlast, `an exploding barrel walked up to: ${JSON.stringify(walked)}`);
    facts.push(`an exploding barrel walked up to and broken ${walked.off.toFixed(2)} m off, in its blast`);

    step = 'shrines';
    // one of each kind a shrine can be in a row by the hero (src/game/shrines.ts), each hovered: our name
    // (tools/d2-names/shrines.json, X祭坛), never the official X圣坛; a boon touched shows under the
    // minimap with its seconds, a refill fills, the specials do what theirs do; a touched shrine dark
    const row = await ev(async () => {
      const S = window.__o;
      const L = game.level;
      const p = game.player;
      const { D2X_SHRINES } = await import('/src/data/d2x/shrines.ts');
      S.SH = await import('/src/game/shrines.ts');
      L.objects = L.objects.filter((o) => o.kind !== 'barrel' && o.kind !== 'chest');
      L.blasts = [];
      L.projectiles = [];
      const mid = { ...p.pos };
      const kinds = D2X_SHRINES.filter((s) => s.name).map((s) => s.code);
      // each on open ground, off the hero and as far from the others as the row's step (S.find)
      const placed = [];
      const spot = (i) => {
        const want = { x: mid.x - 4 + (i % 7) * 1.35, z: mid.z - 2.4 + Math.floor(i / 7) * 2.2 };
        const q = S.find(want, (q) => L.map.circleClear(q.x, q.z, 0.4) && Math.hypot(q.x - mid.x, q.z - mid.z) > 1 && placed.every((t) => Math.hypot(t.x - q.x, t.z - q.z) >= 1.2));
        if (!q) throw new Error(`no open ground for shrine ${i}`);
        placed.push(q);
        return q;
      };
      S.shrines = kinds.map((code, i) => {
        const o = new S.O.WorldObject('shrine', spot(i), S.SH.shrineName(code), 0.6);
        Object.assign(o, { d2: [2, 81, 83, 84][i % 4], shrine: code });
        L.objects.push(o);
        return o;
      });
      return S.shrines.map((o) => ({ id: o.id, code: o.shrine, name: o.name, pos: o.pos, official: D2X_SHRINES[o.shrine].en }));
    });
    await ev(() => (window.renderer.zoomTarget = 7));
    await frames(40);
    await page.mouse.move(4, 4);
    await shot('shrines-row');
    const shrineNames = JSON.parse(await ev(() => fetch('/tools/d2-names/shrines.json').then((r) => r.text()).catch(() => '{}')));
    for (const s of row.filter((x) => [1, 6, 7, 15, 19].includes(x.code))) {
      const at = await ev(({ x, z }) => {
        const c = renderer.camera;
        c.updateMatrixWorld();
        const v = c.matrixWorldInverse.elements;
        const pm = c.projectionMatrix.elements;
        const mul = (m, [a, b, cc, d]) => [0, 1, 2, 3].map((r) => m[r] * a + m[4 + r] * b + m[8 + r] * cc + m[12 + r] * d);
        const e = mul(pm, mul(v, [x, 0.5, z, 1]));
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: r.left + ((e[0] / e[3] + 1) / 2) * r.width, y: r.top + ((1 - e[1] / e[3]) / 2) * r.height };
      }, s.pos);
      await page.mouse.move(at.x, at.y);
      await frames(6);
      const shown = await ev(() => ({ hover: game.hover.object?.id ?? null, label: document.querySelector('#target .name')?.textContent ?? '' }));
      const off = Object.values(shrineNames).find((n) => n.name === s.name)?.official;
      expect(shown.hover === s.id && shown.label === s.name && /祭坛$/.test(shown.label) && shown.label !== off, `shrine ${s.code}: hovered ${shown.hover} showing "${shown.label}", ours ${s.name}, official ${off}`);
      if (s.code === 7) await shot('hover-shrine-combat');
    }
    await page.mouse.move(4, 4);
    const touched = await ev(() => {
      const S = window.__o;
      const p = game.player;
      const by = (c) => S.shrines.find((o) => o.shrine === c);
      const r = {};
      p.life = p.stats.maxLife * 0.4;
      p.mana = 0;
      game.interact(by(1));
      r.refill = p.life === p.stats.maxLife && p.mana === p.stats.maxMana;
      const def0 = p.stats.def;
      game.interact(by(6));
      r.armor = { code: p.shrine?.code, def: [def0, p.stats.def] };
      game.interact(by(12));
      r.skill = { code: p.shrine?.code, left: p.shrine && Math.round(p.shrine.left) };
      r.spent = by(1).used && by(6).used && S.O.spent(by(1));
      return r;
    });
    await frames(10);
    const blessing = await ev(() => document.querySelector('#blessing')?.textContent ?? '');
    await shot('shrines-touched');
    expect(touched.refill && touched.armor.code === 6 && touched.armor.def[1] > touched.armor.def[0] && touched.skill.code === 12 && touched.skill.left === 96 && touched.spent, `the shrines touched: ${JSON.stringify(touched)}`);
    expect(blessing.startsWith(row.find((s) => s.code === 12).name), `under the minimap: "${blessing}"`);
    facts.push(`${row.length} kinds of shrine hovered as ours (${row.slice(0, 3).map((s) => s.name).join(' ')} …), the skill altar's blessing "${blessing}" under the minimap`);
  } catch (e) {
    fails.push(`${step}: ${e.message}`);
  }
  if (errors.length) fails.push(...errors.slice(0, 5));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (fails.length) log(`OBJECTS FAIL ${fails.join(' | ')} (${secs} s)`);
  else log(`OBJECTS OK ${facts.join(', ')} (${secs} s)`);
}
