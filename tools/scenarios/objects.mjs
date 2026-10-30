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
// isn't. Page and console errors fail the run. Shots: the row with nothing used, each hovered with its
// name, the row used, each trap going off, the barrels before, in and after the chain. The last line
// is "OBJECTS OK …" or "OBJECTS FAIL …".

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
      const at = (dx, dz) => L.map.nearestWalkable(mid.x + dx, mid.z + dz) ?? { x: mid.x + dx, z: mid.z + dz };
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
      return r;
    });
    await frames(3);
    await shot('trap-firebolt');
    const boltHit = await ev(() => {
      const S = window.__o;
      const p = game.player;
      // a step at a time until it's gone: what the hero lost in the step it went (their regeneration a frame's)
      let taken = 0;
      for (let k = 0; k < 120; k++) {
        const flying = game.level.projectiles.some((x) => x.kind === 'firebolt');
        if (!flying) break;
        const before = p.life;
        S.step(1 / 60);
        if (!game.level.projectiles.some((x) => x.kind === 'firebolt')) taken = before - p.life;
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
      const c = L.map.nearestWalkable(S.fire.pos.x, S.fire.pos.z + 3) ?? { ...S.fire.pos };
      game.teleportWithin({ x: c.x, z: c.z - 2 });
      const sub = (v) => (Math.floor(v * 4) + 0.5) / 4;
      const o0 = { x: sub(c.x - 1), z: sub(c.z) };
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
  } catch (e) {
    fails.push(`${step}: ${e.message}`);
  }
  if (errors.length) fails.push(...errors.slice(0, 5));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (fails.length) log(`OBJECTS FAIL ${fails.join(' | ')} (${secs} s)`);
  else log(`OBJECTS OK ${facts.join(', ')} (${secs} s)`);
}
