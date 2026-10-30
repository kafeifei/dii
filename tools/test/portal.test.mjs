// The hero's town portal, there and back (src/game/travel.ts openTownPortal, usePortal), in every
// kind of place: on the overworld that holds the camp (Blood Moor, Cold Plains, Stony Field, the
// Burial Grounds: both trips are jumps on one map), in the dungeons with maps of their own (the Den,
// the Cave's two levels, the Crypt, the Mausoleum), on a trial floor and on two floors of a rift. In
// three worlds, from open ground and from beside walls, trees and rocks, facing any way, cast as a
// player reads it (from a tome, Game.castTownPortal). D2's portal (D2MOO d9d394f: SkillItem.cpp:84,
// Skills.cpp:3008-3109, ObjMode.cpp:3125-3253): both ends open together, the far one by the hero
// with nothing between them, the camp's by the camp's start clear of its people and things, and
// with nothing tall between it (or the hero coming out of it) and the view; either
// end takes the hero to a step beside the other, on the map as it was left, announced as a way in
// (the view jumps, the area's name and minimap follow: the hooks), and the camp's end, the way back,
// closes both. A rift's own ways, portals too, are never taken for the hero's: the hero comes back
// by their own portal on a rift's floor, not at the floor's start, and the rift's way in stays in
// the camp. Then: walking about the camp first and back to the portal on foot; dying with it open,
// up again in the camp and back through it to where the body lies; a reload in the camp (a game in
// the same world, made anew: no portal left at either end, as D2's next game has none); and in the
// third world the hireling along all the way, coming out beside the hero every time (D2 moves a
// hireling with its owner on every teleport, SUnit.cpp:2372; here she follows onto a map the hero
// comes to, and across one past her 100 subtiles: merc.ts placeMerc, and the camp's end is farther
// than that from any ground a portal can open on). And many quicker trips from beside walls, trees
// and rocks in each area: a portal by one never opens past it, nor brings the hero back past it.
// (The view, the banner and the minimap themselves are looked at in the tomes scenario.)
const WORLDS = [1, 77, 0x5eed2a];
const DT = 1 / 60;
/** the far end opens a pace ahead of the hero (travel.ts AHEAD), or where they stand */
const AHEAD = 1.5;
/** how near the other end the hero comes out: a step (travel.ts OUT_STEP, IN_STEP: 1.3 m), or a little more round something */
const STEP = 2.5;
/** the most tiles walked from a portal to where the hero comes out, or from the hero to the far end: none round a wall */
const WALK = 3;
/** how far from the camp's start its end may stand (travel.ts CAMP_SPOT: 2.5 m), and how clear of the camp's things */
const CAMP_NEAR = 4;
const CLEAR_OF = 1.2;
/**
 * the view's way along the ground, toward the camera (src/render/views.ts CAM_YAW, a quarter turn
 * from +z), and how far behind a thing as tall as the camp gets (the obelisk, the lantern posts:
 * 2.6 m) the view can't see the ground, at its pitch (renderer.ts CAM_PITCH 0.68): 2.6 / tan 0.68
 * and a little
 */
const TOWARD_VIEW = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
const SHADOW = 3.8;
/** the quick trips from beside walls in each area of each world */
const QUICK = 30;

export default async (load) => {
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, STONY_FIELD, BURIAL_GROUNDS, DEN_OF_EVIL, CAVE_1, CAVE_2, CRYPT, MAUSOLEUM, trialFloor } = await load('/src/world/areas.ts');
  const { isRiftArea } = await load('/src/world/rift.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { debugOpts } = await load('/src/game/debug.ts');
  const save = await load('/src/game/save.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  /** a check whose result is branched on: true when it holds */
  const holds = (ok, what) => !!ok || (problems.push(what), false);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const f = (v) => (v ? `(${v.x.toFixed(1)}, ${v.z.toFixed(1)})` : '-');
  /** tiles walked from `a` to `b` on `L`, tile to tile four ways (as levelgen.ts bfsDistances), within 8 of `a`: -1 if there's no such way */
  const walk = (L, a, b) => {
    const m = L.map;
    const [ax, az, bx, bz] = [Math.floor(a.x), Math.floor(a.z), Math.floor(b.x), Math.floor(b.z)];
    const R = 8;
    const key = (x, z) => (z - az + R) * (2 * R + 1) + (x - ax + R);
    const d = new Map([[key(ax, az), 0]]);
    const q = [[ax, az]];
    for (let i = 0; i < q.length; i++) {
      const [x, z] = q[i];
      const n = d.get(key(x, z));
      if (x === bx && z === bz) return n;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const nz = z + dz;
        if (Math.abs(nx - ax) > R || Math.abs(nz - az) > R || !m.walkable(nx, nz) || d.has(key(nx, nz))) continue;
        d.set(key(nx, nz), n + 1);
        q.push([nx, nz]);
      }
    }
    return -1;
  };
  /** a small seeded generator for the spots and facings, the game's own rolls left as they are */
  let seed = 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const godWas = debugOpts.god;
  debugOpts.god = true;
  localStorage.clear();
  sessionStorage.clear();
  save.setSlot(0);
  const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
  const game = new Game(input, new Sfx());
  game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
  /** what the view and the banner were told: the hooks the UI draws them by (ui.ts levelChanged, teleported, areaChanged) */
  const told = { levels: 0, jumps: [], areas: [] };
  const reset = () => Object.assign(told, { levels: 0, jumps: [], areas: [] });
  game.hooks = {
    message() {},
    openPanel() {},
    levelChanged: () => told.levels++,
    areaChanged: (a) => told.areas.push(a.id),
    teleported: (how) => told.jumps.push(how ?? null),
    playerDied() {},
    inventoryChanged() {},
    getCursorItem: () => null,
    setCursorItem() {},
    hoveredGroundId: () => null,
    levelUp() {},
  };
  const step = (n) => {
    for (let i = 0; i < n; i++) game.update(DT);
  };
  let trips = 0;
  /** and the quick ones by walls */
  let quick = 0;
  /** jumps the hireling was along for, alive */
  let followed = 0;
  const seen = new Set();

  try {
    game.newGame('门', 'paladin');
    let p = game.player;
    /** a tome of town portal with charges in the bag, the one the cast reads */
    const tome = () => {
      let t = p.inventory.items.find((x) => x.item.baseId === 'tbk')?.item;
      if (!t) {
        t = createItem('tbk');
        p.inventory.add(t);
      }
      t.qty = 20;
      return t;
    };
    /** the hero's portals on a map: rifts' ways left out */
    const ends = (L) => L.objects.filter((o) => o.kind === 'portal' && !o.rift);
    const riftWays = (L) => L.objects.filter((o) => o.rift).length;

    /**
     * what stands up between `at` on map `L` and the view (TOWARD_VIEW, SHADOW): its things (not the
     * flat ones: the waypoint's ring, a body, a portal's glow), its props and its people, by name
     */
    const hiders = (L, at) => {
      const things = [
        ...L.objects.filter((o) => o.kind !== 'waypoint' && o.kind !== 'corpse' && o.kind !== 'portal').map((o) => ({ pos: o.pos, r: o.radius, name: o.name })),
        ...(L.layout.props ?? []).map((pr) => ({ pos: pr.pos ?? pr, r: 0.4, name: pr.model })),
        ...(L.layout.npcs ?? []).map((n) => ({ pos: n, r: 0.5, name: n.name ?? 'a townsperson' })),
      ];
      return things
        .filter((t) => {
          const dx = t.pos.x - at.x;
          const dz = t.pos.z - at.z;
          const along = dx * TOWARD_VIEW.x + dz * TOWARD_VIEW.z;
          return along > 0 && along < SHADOW && Math.abs(dx * TOWARD_VIEW.z - dz * TOWARD_VIEW.x) < t.r + 0.6;
        })
        .map((t) => t.name);
    };
    /** spots in area `id` on the hero's map: open ground, or a tile beside something that blocks, at random in it */
    const spots = (id, open) => {
      const L = game.level;
      const m = L.map;
      const out = [];
      for (let z = 1; z < m.h - 1; z++)
        for (let x = 1; x < m.w - 1; x++) {
          if (!m.walkable(x, z) || L.areaAt(x + 0.5, z + 0.5).id !== id) continue;
          let by = false;
          for (let dz = -1; dz <= 1 && !by; dz++) for (let dx = -1; dx <= 1 && !by; dx++) by = !m.walkable(x + dx, z + dz);
          if (open ? !by && m.circleClear(x + 0.5, z + 0.5, 1.6) : by) out.push(open ? { x: x + 0.5, z: z + 0.5 } : { x: x + 0.15 + rnd() * 0.7, z: z + 0.15 + rnd() * 0.7 });
        }
      return out;
    };
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    /**
     * nothing near the hero to cut the cast short: the monsters within 30 m killed, and what their
     * deaths set off gone off before the cast, the hero standing again. A fire- or cold-enchanted
     * leader bursts 0.45 s or 0.1 s after it dies (kills.ts): killed here and left to it, its burst
     * struck the hero in the cast (on a rift's floor or the Cold Plains, about one run in twelve), the
     * hit recovery cut the cast short and the tome opened nothing. So do the monsters' missiles still
     * in flight
     */
    const quiet = () => {
      const L = game.level;
      const settled = () => !L.blasts.some((b) => b.faction === 'monster') && !L.projectiles.some((pr) => pr.faction === 'monster') && p.state === 'idle';
      for (let i = 0; i < 5 * 60; i++) {
        for (const m of L.monsters) if (!m.dead && dist(m.pos, p.pos) < 30) game.killMonster(m, 'phys');
        if (settled()) return;
        game.update(DT);
      }
      check(false, `the hero was not left standing quiet: ${L.blasts.length} blast(s), ${L.projectiles.filter((pr) => pr.faction === 'monster').length} monsters' missile(s) about, the hero ${p.state}`);
    };

    /** portal `o` walked to and used as a player clicks it (an interact intent: playerctl.ts), until the hero arrives somewhere by it */
    const useOnFoot = (o) => {
      p.intent = { kind: 'interact', obj: o };
      for (let i = 0; i < 30 * 60 && !told.levels && !told.jumps.length; i++) game.update(DT);
    };
    /**
     * a town portal cast where the hero stands (quiet, standing), as a player reads it, once: its two
     * ends, or null. The far end in the area the hero stands in (travel.ts openTownPortal: never a
     * pace over a seam)
     */
    const cast = (w) => {
      const L = game.level;
      const t = tome();
      const before = t.qty;
      const was = new Set(ends(L));
      const opened = () => ends(L).find((o) => !was.has(o) && !L.inTown(o.pos));
      const stood = L.areaAt(p.pos.x, p.pos.z);
      game.castTownPortal();
      const began = p.state;
      for (let i = 0; i < 90 && p.state === 'cast'; i++) game.update(DT);
      const far = opened();
      if (!holds(far && t.qty === before - 1, `${w}: the portal did not open from the tome (charges ${before} → ${t.qty}; the hero ${began === 'cast' ? `began the cast, then ${p.state}` : `did not begin it, ${began}`}; ${ends(L).length - was.size} new end(s) on this map, ${ends(L).filter((o) => !was.has(o) && L.inTown(o.pos)).length} of them in the camp)`)) return null;
      check(L.areaAt(far.pos.x, far.pos.z).id === stood.id, `${w}: the far end opened at ${f(far.pos)} in area ${L.areaAt(far.pos.x, far.pos.z).id}, the hero in area ${stood.id}`);
      // its ends as they stand on their maps, looked for as a player sees them (and as the game links them: Trip.portal)
      const campLevel = game.mapOf(CAMP_AREA);
      const camp = campLevel ? ends(campLevel).find((o) => campLevel.inTown(o.pos)) : undefined;
      const tp = game.trip.portal;
      check(tp?.far === far && tp.level === L && tp.camp === camp && tp.campLevel === campLevel, `${w}: the game's record of the portal is not its two ends`);
      return { far, camp, campLevel };
    };

    /**
     * The round trip from where the hero stands now (`w` says where): the portal cast, its ends
     * checked; into the camp through the far end (or, `die`, killed and up again there); `inCamp`
     * done there (a walk about it); back to the camp's end on foot and through it, checked against
     * where the far end stood
     */
    const trip = (w, { inCamp = null, die = false } = {}) => {
      const L = game.level;
      const camp = game.mapOf(CAMP_AREA);
      // (a rift's guardian may come and fall to this, leaving its way out: a portal of the rift's on the floor)
      quiet();
      const campWays = riftWays(camp);
      const floorWays = riftWays(L);
      const tp = cast(w);
      if (!tp) return;
      // where the hero stood as it opened (still through the cast), and the area its far end is in
      const stood = { ...p.pos };
      const far = tp.far;
      let end = tp.camp;
      const there = L.areaAt(far.pos.x, far.pos.z);
      const area = there.id;
      trips++;
      seen.add(isRiftArea(area) ? 'rift' : trialFloor(area) !== undefined ? 'trial' : area);
      // ── opened: both ends at once, each where D2 puts it ──
      check(end && ends(L).filter((o) => !L.inTown(o.pos)).length === 1 && ends(camp).filter((o) => camp.inTown(o.pos)).length === 1 && tp.campLevel === camp, `${w}: as it opened the portal's ends were not one out here and one in the camp (${ends(L).filter((o) => !L.inTown(o.pos)).length} out here, ${ends(camp).filter((o) => camp.inTown(o.pos)).length} in the camp)`);
      const w1 = walk(L, stood, far.pos);
      check(dist(stood, far.pos) <= AHEAD + 1e-6 && w1 >= 0 && w1 <= WALK, `${w}: the far end opened at ${f(far.pos)}, ${dist(stood, far.pos).toFixed(2)} m from the hero at ${f(stood)} and ${w1} tiles' walk`);
      /** the camp's end: by the camp's start, on open ground clear of its people and things, leading to the far end's area */
      const campEnd = () => {
        const s = camp.layout.start;
        const crowd = camp.objects.filter((o) => o !== end && dist(o.pos, end.pos) < o.radius + CLEAR_OF);
        check(camp.inTown(end.pos) && dist(end.pos, s) <= CAMP_NEAR && camp.map.circleClear(end.pos.x, end.pos.z, 0.6) && !crowd.length, `${w}: the camp's end at ${f(end.pos)}, ${dist(end.pos, s).toFixed(1)} m from the camp's start, ${crowd.map((o) => o.name).join(', ') || 'nothing'} on top of it`);
        check(end.dest === area && end.name === `传送门 · ${there.name}`, `${w}: the camp's end leads to ${end.dest} (${end.name}), not area ${area}`);
        const hidden = hiders(camp, end.pos);
        check(!hidden.length, `${w}: the camp's end at ${f(end.pos)} is behind ${hidden.join(', ')} as the view has it`);
      };
      if (end) campEnd();
      check(riftWays(camp) === campWays && riftWays(L) === floorWays, `${w}: opening the portal took a rift's way (camp ${campWays} → ${riftWays(camp)}, here ${floorWays} → ${riftWays(L)})`);
      // what the map holds as it is left: its monsters, the dead among them
      const monsters = [...L.monsters];
      const dead = new Set(monsters.filter((m) => m.dead));
      const life = new Map(monsters.map((m) => [m, m.life]));

      // ── into the camp: through the far end, or by dying ──
      reset();
      if (die) {
        debugOpts.god = false;
        game.killPlayer();
        debugOpts.god = true;
        check(p.dead, `${w}: the hero did not die`);
        step(90);
        game.respawn();
        step(2);
      } else useOnFoot(far);
      // (made only now, if not as it opened: checked late, so the rest of the trip is still tried)
      if (!end) {
        end = ends(camp).find((o) => camp.inTown(o.pos));
        if (!holds(end, `${w}: in the camp there is no end of the portal to go back through`)) return closeUp();
        campEnd();
      }
      const jumped = camp === L;
      check(game.level === camp && game.area.id === CAMP_AREA && told.areas.at(-1) === CAMP_AREA, `${w}: ${die ? 'up again' : 'through the far end'} the hero is in area ${game.area.id}${game.level === camp ? '' : ' off the camp map'}, the banner told ${told.areas.join() || 'nothing'}`);
      check(jumped ? told.levels === 0 && told.jumps.join() === (die ? 'respawn' : 'portal') : told.levels === 1 && !told.jumps.length, `${w}: into the camp the view was told ${told.levels} new map(s), jumps ${told.jumps.join() || 'none'}`);
      if (!die) {
        const hidden = hiders(camp, p.pos);
        check(!hidden.length, `${w}: coming out in the camp at ${f(p.pos)} the hero is behind ${hidden.join(', ')} as the view has it`);
        const w2 = walk(camp, end.pos, p.pos);
        check(dist(p.pos, end.pos) <= STEP && w2 >= 0 && w2 <= WALK, `${w}: the hero came out at ${f(p.pos)}, ${dist(p.pos, end.pos).toFixed(2)} m from the camp's end, ${w2} tiles' walk`);
      }
      check(camp.objects.includes(end) && L.objects.includes(far), `${w}: in the camp the portal is not open at both ends`);
      mercBeside(`${w}`, 'in the camp');
      inCamp?.();

      // ── back: to the camp's end on foot and through it ──
      reset();
      useOnFoot(end);
      check(told.levels || told.jumps.length, `${w}: the hero never got back through the camp's end (at ${f(p.pos)}, ${dist(p.pos, end.pos).toFixed(1)} m from it)`);
      check(game.level === L && game.area.id === area && told.areas.at(-1) === area, `${w}: back through the camp's end the hero is in area ${game.area.id}${game.level === L ? '' : ' on another map'}, the banner told ${told.areas.join() || 'nothing'}`);
      check(jumped ? told.levels === 0 && told.jumps.join() === 'portal' : told.levels === 1 && !told.jumps.length, `${w}: back the view was told ${told.levels} new map(s), jumps ${told.jumps.join() || 'none'}`);
      const w3 = walk(L, far.pos, p.pos);
      check(dist(p.pos, far.pos) <= STEP && w3 >= 0 && w3 <= WALK, `${w}: the hero came back at ${f(p.pos)}, ${dist(p.pos, far.pos).toFixed(2)} m from where the far end stood at ${f(far.pos)}, ${w3} tiles' walk`);
      check(!ends(L).length && !ends(camp).length && riftWays(camp) === campWays && riftWays(L) === floorWays, `${w}: back, ${ends(L).length + ends(camp).length} end(s) of the hero's portal left open, rift's ways camp ${campWays} → ${riftWays(camp)}, here ${floorWays} → ${riftWays(L)}`);
      // (the dead may have been cleared away meanwhile: fight.ts clearCorpses)
      const gone = monsters.filter((m) => !dead.has(m) && !L.monsters.includes(m));
      check(!gone.length && [...dead].every((m) => m.dead), `${w}: the map was not as it was left: ${gone.length} living monsters gone, ${[...dead].filter((m) => !m.dead).length} dead come back`);
      if (!jumped) check(monsters.every((m) => m.life === life.get(m) || m.dead), `${w}: the map's monsters were healed while the hero was away`);
      if (die) check(p.corpses.some((c) => c.level === L && c.pos && dist(c.pos, far.pos) < 4), `${w}: the body is not by the portal the hero came back through`);
      step(1);
      mercBeside(`${w}`, 'back by the far end');
    };
    /**
     * the hireling, alive, beside the hero after a jump, with nothing between them (merc.ts
     * besideHero: until 2026-10-30 she could come in past the wall, tree or rock behind a hero by
     * one, up to 3 m off)
     */
    const mercBeside = (w, where) => {
      if (!game.merc || game.merc.dead) return;
      followed++;
      const d = dist(game.merc.pos, p.pos);
      const open = game.level.map.los(p.pos, game.merc.pos);
      check(d < STEP && open, `${w}: the hireling is ${d.toFixed(1)} m from the hero ${where}${open ? '' : ', something between them'}`);
    };

    /**
     * `n` more portals in area `id` opened beside walls, trees and rocks facing any way, there and
     * back at once (Game.openTownPortal, what a cast opens, and used as the hero walks into it):
     * the far end never past what the hero stands by, nor the spot they come back to
     */
    const byWalls = (id, w, n) => {
      const L = game.level;
      const camp = game.mapOf(CAMP_AREA);
      const all = spots(id, false);
      // what each arrival does besides moving the hero (a save, the merchant's new stock) left out
      // for speed, swapped on the instance and given back after
      game.save = game.refreshShop = () => {};
      try {
        quickTrips(L, camp, all, w, n);
      } finally {
        delete game.save;
        delete game.refreshShop;
      }
    };
    const quickTrips = (L, camp, all, w, n) => {
      for (let k = 0; k < n; k++) {
        game.teleportWithin(pick(all));
        const stood = { ...p.pos };
        p.facing = rnd() * Math.PI * 2;
        const stoodIn = L.areaAt(stood.x, stood.z).id;
        game.openTownPortal();
        const far = ends(L).find((o) => !L.inTown(o.pos));
        if (!holds(far, `${w}: no portal opened out here at ${f(stood)} facing ${p.facing.toFixed(2)} (${ends(L).filter((o) => L.inTown(o.pos)).length} end(s) in the camp)`)) {
          closeUp();
          continue;
        }
        quick++;
        // in the hero's own area: at Blood Moor's gate facing in, a pace ahead was the camp's ground,
        // and the far end opened there (travel.ts openTownPortal, until 2026-10-30)
        check(L.areaAt(far.pos.x, far.pos.z).id === stoodIn, `${w}: the far end opened at ${f(far.pos)} in area ${L.areaAt(far.pos.x, far.pos.z).id}, the hero in area ${stoodIn}`);
        const w1 = walk(L, stood, far.pos);
        check(dist(stood, far.pos) <= AHEAD + 1e-6 && w1 >= 0 && w1 <= WALK, `${w}: the far end opened at ${f(far.pos)}, ${dist(stood, far.pos).toFixed(2)} m from the hero at ${f(stood)} and ${w1} tiles' walk`);
        game.interact(far);
        const end = ends(camp).find((o) => camp.inTown(o.pos));
        if (!holds(game.area.id === CAMP_AREA && end, `${w}: through the far end the hero is in area ${game.area.id}, ${end ? 'with' : 'no'} end in the camp`)) {
          closeUp();
          continue;
        }
        game.interact(end);
        const w3 = walk(L, far.pos, p.pos);
        check(game.level === L && dist(p.pos, far.pos) <= STEP && w3 >= 0 && w3 <= WALK, `${w}: the hero came back at ${f(p.pos)}${game.level === L ? '' : ' on another map'}, ${dist(p.pos, far.pos).toFixed(2)} m from where the far end stood at ${f(far.pos)}, ${w3} tiles' walk`);
        if (game.level !== L) return;
      }
    };
    /** after a trip that went wrong: the hero's portal closed, and any end of one left on the camp's map or the hero's */
    const closeUp = () => {
      game.closePortals();
      for (const L of [game.mapOf(CAMP_AREA), game.level]) if (L) L.objects = L.objects.filter((o) => o.kind !== 'portal' || o.rift);
    };
    /** trips from area `id` on the hero's map: from open ground, then beside walls facing any way */
    const trips3 = (id, w) => {
      for (const [k, open] of [[0, true], [1, false], [2, false]]) {
        const at = pick(spots(id, open));
        if (!holds(at, `${w}: no ${open ? 'open ground' : 'spot by a wall'} in area ${id}`)) continue;
        game.teleportWithin(at);
        p.facing = open ? 0 : rnd() * Math.PI * 2;
        trip(`${w}, ${open ? 'open ground' : `by a wall ${k}`}`, {
          // from open ground: a walk about the camp first, then back to the portal on foot
          inCamp: open
            ? () => {
                const s = game.level.layout.start;
                p.intent = { kind: 'move', point: game.level.map.nearestWalkable(s.x + 6, s.z - 5) };
                step(150);
              }
            : null,
        });
      }
    };

    for (const [wi, world] of WORLDS.entries()) {
      game.newWorld(world);
      game.enterArea(CAMP_AREA, 'start');
      const west = game.level;
      const W = `world ${world}`;
      seed = world;
      // the third world with the hireling along all the way
      if (wi === 2) {
        game.giveFreeMerc();
        step(2);
        check(game.merc && !game.merc.dead, `${W}: no hireling`);
      }
      const home = () => game.level !== west && game.enterArea(CAMP_AREA, 'waypoint');

      // ── the overworld: both trips jumps on the camp's map ──
      for (const [id, name] of [[WILD_AREA, 'Blood Moor'], [COLD_PLAINS, 'Cold Plains'], [STONY_FIELD, 'Stony Field'], [BURIAL_GROUNDS, 'the Burial Grounds']]) {
        home();
        trips3(id, `${W}, ${name}`);
      }
      // ── the dungeons: each a map of its own ──
      for (const [id, name] of [[DEN_OF_EVIL, 'the Den'], [CAVE_1, 'Cave Level 1'], [CAVE_2, 'Cave Level 2'], [CRYPT, 'the Crypt'], [MAUSOLEUM, 'the Mausoleum']]) {
        game.enterArea(id, 'stairs');
        check(game.level !== west && game.area.id === id, `${W}: not in ${name}`);
        trips3(id, `${W}, ${name}`);
      }
      // ── a trial floor ──
      home();
      game.enterTrial(1);
      check(trialFloor(game.area.id) === 1, `${W}: not on the trial ground's first floor`);
      trips3(game.area.id, `${W}, a trial floor`);
      // ── a rift: its first floor (its way home a portal too), then its second ──
      home();
      check(game.rift.begin(1), `${W}: rift tier 1 did not open`);
      const inWay = west.objects.find((o) => o.rift === 'in');
      game.interact(inWay);
      const floor1 = game.level;
      const area1 = game.area.id;
      check(isRiftArea(game.area.id) && floor1.objects.some((o) => o.rift === 'home'), `${W}: not on a rift's first floor`);
      trips3(game.area.id, `${W}, rift floor 1`);
      check(west.objects.includes(inWay), `${W}: the rift's way in is gone from the camp`);
      const down = floor1.objects.find((o) => o.kind === 'stairs' && isRiftArea(o.dest));
      if (holds(down, `${W}: rift floor 1 has no way down`)) {
        game.teleportWithin(floor1.map.nearestWalkable(down.pos.x + down.inward.x * 2, down.pos.z + down.inward.z * 2));
        game.interact(down);
        check(game.level !== floor1 && isRiftArea(game.area.id), `${W}: not on a rift's second floor`);
        trips3(game.area.id, `${W}, rift floor 2`);
        game.interact(game.level.objects.find((o) => o.kind === 'stairs' && o.dest === area1));
      }
      // the rift's own way home still goes home, by the obelisk
      game.interact(floor1.objects.find((o) => o.rift === 'home'));
      check(game.level === west && game.area.id === CAMP_AREA, `${W}: the rift's way home went to area ${game.area.id}`);
      game.rift.close();

      // ── dying with the portal open: up in the camp, back through it to the body ──
      if (wi < 2) {
        for (const [id, name] of [[STONY_FIELD, 'Stony Field'], [CRYPT, 'the Crypt']]) {
          if (id === CRYPT) game.enterArea(CRYPT, 'stairs');
          else home();
          game.teleportWithin(pick(spots(id, true)));
          trip(`${W}, ${name}, dying`, { die: true });
        }
      }

      // ── many more by walls, trees and rocks, there and back at once ──
      for (const [id, name] of [[WILD_AREA, 'Blood Moor'], [COLD_PLAINS, 'Cold Plains'], [STONY_FIELD, 'Stony Field'], [BURIAL_GROUNDS, 'the Burial Grounds']]) {
        home();
        byWalls(id, `${W}, ${name} (quick)`, QUICK);
      }
      for (const [id, name] of [[DEN_OF_EVIL, 'the Den'], [CAVE_1, 'Cave Level 1'], [CAVE_2, 'Cave Level 2'], [CRYPT, 'the Crypt'], [MAUSOLEUM, 'the Mausoleum']]) {
        game.enterArea(id, 'stairs');
        byWalls(id, `${W}, ${name} (quick)`, QUICK);
      }

      // ── a reload in the camp: the same world made anew, no portal left at either end ──
      home();
      game.teleportWithin(pick(spots(COLD_PLAINS, true)));
      quiet();
      const before = cast(`${W}, before the reload`);
      reset();
      if (before) useOnFoot(before.far);
      check(game.area.id === CAMP_AREA, `${W}: through the portal before the reload the hero is in area ${game.area.id}`);
      game.save();
      check(game.continueGame(undefined, true), `${W}: no save to reload`);
      p = game.player;
      const after = game.level;
      check(game.worldSeed === world && game.area.id === CAMP_AREA && after !== west && !after.objects.some((o) => o.kind === 'portal' && !o.rift), `${W}: reloaded in area ${game.area.id}, world ${game.worldSeed}, ${after.objects.filter((o) => o.kind === 'portal' && !o.rift).length} portal end(s) in the camp`);
      // and one opened anew goes and comes back as before
      game.teleportWithin(pick(spots(COLD_PLAINS, true)));
      trip(`${W}, Cold Plains after the reload`);
    }
  } finally {
    debugOpts.god = godWas;
  }

  check(seen.size === 11, `trips from only ${seen.size} kinds of place: ${[...seen].join()}`);
  check(followed >= 60, `the hireling was along, alive, for only ${followed} of the third world's jumps`);
  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(`  ${trips} round trips (the hireling along for ${followed} jumps) and ${quick} quick ones by walls in ${WORLDS.length} worlds (${seen.size} kinds of place: the overworld's four areas, the five dungeons, a trial floor, a rift's floors), each back a step from where the far end stood on the map as left; the camp's end clear by the camp's start; dying, walking about the camp, a reload, the hireling along`);
};
