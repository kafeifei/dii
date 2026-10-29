// The west block's dungeon mazes (src/world/maze.ts, dungeons.ts, objgroups.ts), as dungeons.md 3.6
// asks: D2's seed against 64-bit arithmetic; the room graph by LvlMaze's rooms in each difficulty
// (the Den always 3, Cave Level 1 4–7, the crypts 12–14, 24–26, 36–38), its special rooms dead ends,
// its theme rooms as D2 rolls them; then whole levels: everything reachable from the way in, the
// ways in and out against the rock at the end of their dead ends, the bosses in their rooms, the
// spark chests where they belong, D2's object rules kept and carried in the Layout (each object's
// row, lock, trap, spark; caskets, corpses, wells; the special rooms as presets), nothing loose lying
// on an object, no light in a cave but the hero's and torches in a crypt, the same level for the same
// seed, and each under 200 ms (median and max over 20 seeds printed).
const GRAPH_SEEDS = 300;
const LEVEL_SEEDS = 20;
const SLOW_MS = 200;

export default async (load) => {
  const { DUNGEONS, dungeonSpec, generateDungeonLevel } = await load('/src/world/dungeons.ts');
  const { D2Seed, mazeGraph } = await load('/src/world/maze.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { D2X_SUPERUNIQUES } = await load('/src/data/d2x/superuniques.ts');
  const { D2X_OBJECTS } = await load('/src/data/d2x/objects.ts');
  const { T_FLOOR } = await load('/src/world/tilemap.ts');
  const { PROP_DEFS } = await load('/src/world/furnish.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const AREA = new Map(D2X_AREAS.map((a) => [a.id, a]));
  const DEN = 8;
  const CAVE1 = 9;
  const CAVE2 = 13;
  const CRYPT = 18;
  const MAUSOLEUM = 19;

  // ── D2's seed: low × 0x6AC690C5 + high, in 64 bits (D2Seed.h:39-46) ──
  {
    const s = new D2Seed(0xdeadbeef);
    let lo = 0xdeadbeefn;
    let hi = 666n;
    for (let i = 0; i < 20000; i++) {
      const v = hi + 0x6ac690c5n * lo;
      lo = v & 0xffffffffn;
      hi = v >> 32n;
      if (BigInt(s.roll()) !== lo || BigInt(s.hi) !== hi) {
        problems.push(`D2Seed parts from 64-bit arithmetic at roll ${i}`);
        break;
      }
    }
    // SEED_RollLimitedRandomNumber: a power of two by its low bits, else %; no roll for 0
    const a = new D2Seed(7);
    const b = new D2Seed(7);
    check(a.limited(8) === (b.roll() & 7) && a.limited(15) === b.roll() % 15 && a.limited(0) === 0 && a.lo === b.lo, 'D2Seed.limited is not SEED_RollLimitedRandomNumber');
  }

  // ── the room graphs ──
  const ranges = { [DEN]: [[3, 3], [3, 3], [3, 3]], [CAVE1]: [[4, 7], [4, 7], [4, 7]], [CRYPT]: [[12, 14], [24, 26], [36, 38]], [MAUSOLEUM]: [[12, 14], [24, 26], [36, 38]] };
  const seen = new Map();
  for (const [area, byDiff] of Object.entries(ranges).map(([a, r]) => [Number(a), r])) {
    for (let diff = 0; diff < 3; diff++) {
      const [lo, hi] = byDiff[diff];
      const counts = new Map();
      for (let k = 1; k <= GRAPH_SEEDS; k++) {
        const spec = dungeonSpec(area, k * 7919 + diff, diff);
        const g = mazeGraph(spec);
        const what = `area ${area} difficulty ${diff} seed ${spec.seed}`;
        counts.set(g.length, (counts.get(g.length) ?? 0) + 1);
        check(g.length >= lo && g.length <= hi, `${what}: ${g.length} rooms, LvlMaze makes ${lo}–${hi}`);
        // a grid: one room a place, links both ways between rooms side by side, the shape the links make
        const at = new Set(g.map((r) => `${r.gx},${r.gy}`));
        check(at.size === g.length, `${what}: two rooms in one place`);
        g.forEach((r, i) => {
          let mask = 0;
          for (const j of r.links) {
            const o = g[j];
            const dx = o.gx - r.gx;
            const dy = o.gy - r.gy;
            check(Math.abs(dx) + Math.abs(dy) === 1 && o.links.includes(i), `${what}: room ${i} links to ${j}, not side by side both ways`);
            mask |= dx < 0 ? 1 : dx > 0 ? 2 : dy > 0 ? 4 : 8;
          }
          check(mask === r.mask && r.links.length > 0, `${what}: room ${i}'s shape ${r.mask} isn't its links' ${mask}`);
        });
        // every room reached from the first
        const reached = new Set([0]);
        const q = [0];
        while (q.length) for (const j of g[q.shift()].links) if (!reached.has(j)) reached.add(j), q.push(j);
        check(reached.size === g.length, `${what}: ${g.length - reached.size} rooms cut off`);
        // the specials: each once, each a dead end
        const sp = g.filter((r) => r.special >= 0);
        check(sp.length === spec.specials.length && new Set(sp.map((r) => r.special)).size === sp.length, `${what}: specials ${sp.map((r) => r.special)}`);
        check(sp.every((r) => r.links.length === 1), `${what}: a special room that isn't a dead end`);
        // theme rooms: none in the Den, never a special, at most max(2, ⌊rooms/5⌋ + 1) (DrlgMaze.cpp:3177-3183)
        const themes = g.filter((r) => r.theme);
        const most = area === DEN ? 0 : Math.max(2, Math.floor(g.length / 5) + 1);
        check(themes.length <= most && themes.every((r) => r.special < 0), `${what}: ${themes.length} theme rooms, at most ${most}`);
        if (area === CRYPT || area === MAUSOLEUM) seen.set(`full${area}/${diff}`, (seen.get(`full${area}/${diff}`) ?? 0) + (themes.length === most ? 1 : 0));
        // a theme room's preset is its shape's + 15, the rest their shape's (caves from 52, crypts from 108)
        const base = spec.style === 'cave' ? 52 : 108;
        for (const r of g) if (r.special < 0) check(r.preset === base + r.mask + (r.theme ? 15 : 0), `${what}: preset ${r.preset} for shape ${r.mask}`);
      }
      if (area === CAVE1 && diff === 0) {
        // all four sizes come up, six rooms most often (dungeons.md 1.3: 7 %, 23 %, 43 %, 27 %)
        const share = (n) => (counts.get(n) ?? 0) / GRAPH_SEEDS;
        check([4, 5, 6, 7].every((n) => share(n) > 0.02) && share(6) > share(5) && share(6) > share(7), `Cave Level 1's sizes: ${[...counts].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n}: ${c}`).join(', ')}`);
        console.log(`  Cave Level 1 grew to ${[4, 5, 6, 7].map((n) => `${n} rooms ${Math.round(share(n) * 100)} %`).join(', ')} over ${GRAPH_SEEDS} seeds`);
      }
    }
  }
  // the crypts nearly always get all their theme rooms
  for (const [k, v] of seen) check(v / GRAPH_SEEDS > 0.95, `${k}: all theme rooms in only ${v} of ${GRAPH_SEEDS}`);
  // the same seed grows the same maze; another seed another
  const g1 = JSON.stringify(mazeGraph(dungeonSpec(CRYPT, 4242, 1)));
  check(g1 === JSON.stringify(mazeGraph(dungeonSpec(CRYPT, 4242, 1))) && g1 !== JSON.stringify(mazeGraph(dungeonSpec(CRYPT, 4243, 1))), 'a crypt is not grown the same for the same seed only');

  // ── whole levels ──
  const kinds = [
    ['the Den of Evil', DEN, 0],
    ['Cave Level 1', CAVE1, 0],
    ['Cave Level 2', CAVE2, 0],
    ['the Crypt in normal', CRYPT, 0],
    ['the Crypt in nightmare', CRYPT, 1],
    ['the Crypt in hell', CRYPT, 2],
    ['the Mausoleum in normal', MAUSOLEUM, 0],
    ['the Mausoleum in hell', MAUSOLEUM, 2],
  ];
  const sparkOf = new Map();
  for (const [label, area, diff] of kinds) {
    const times = [];
    const def = DUNGEONS[area];
    const row = AREA.get(area);
    for (let k = 1; k <= LEVEL_SEEDS; k++) {
      const seed = k * 104729 + area;
      const t = performance.now();
      const { layout: L, extra: X } = generateDungeonLevel(area, seed, diff);
      times.push(performance.now() - t);
      const what = `${label} (seed ${seed})`;
      const { map } = L;
      if (!map.walkableAt(L.start.x, L.start.z)) {
        problems.push(`${what}: the start isn't on floor`);
        continue;
      }
      // a walk from the way in reaches every floor tile
      const dist = new Int32Array(map.w * map.h).fill(-1);
      const q = [Math.floor(L.start.z) * map.w + Math.floor(L.start.x)];
      dist[q[0]] = 0;
      for (let h = 0; h < q.length; h++) {
        const c = q[h];
        const x = c % map.w;
        const z = (c / map.w) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (z + dz) * map.w + x + dx;
          if (map.walkable(x + dx, z + dz) && dist[n] < 0) (dist[n] = dist[c] + 1), q.push(n);
        }
      }
      let floor = 0;
      for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === T_FLOOR) floor++;
      check(floor === q.length, `${what}: ${floor - q.length} floor tiles out of reach`);
      const onFloor = (p) => map.walkableAt(p.x, p.z) && dist[Math.floor(p.z) * map.w + Math.floor(p.x)] >= 0;
      const near = (p, r) => {
        for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++) for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++) if (map.inBounds(x, z) && dist[z * map.w + x] >= 0) return true;
        return false;
      };
      // the ways in and out: where the area's warps say, used from beside them
      const up = (L.entrances ?? []).filter((e) => e.kind === 'up');
      const upTo = row.warps.find((w) => w.tiles.includes(4) || w.tiles.includes(8)).to;
      check(up.length === 1 && up[0].dest === upTo && up[0].name === AREA.get(upTo).name, `${what}: ways up ${JSON.stringify(up.map((e) => e.dest))}, the area's warp goes to ${upTo}`);
      const down = (L.entrances ?? []).filter((e) => e.kind !== 'up');
      check(area === CAVE1 ? down.length === 1 && down[0].dest === CAVE2 && down[0].kind === 'cave' : down.length === 0, `${what}: ways down ${JSON.stringify(down.map((e) => e.dest))}`);
      for (const e of L.entrances ?? []) {
        check(near(e, 1.5) && Math.hypot(e.nx, e.nz) > 0.99, `${what}: the way to ${e.dest} can't be reached, or faces nowhere`);
        // who comes in through it stands on floor in front of it
        check(map.walkableAt(e.x + e.nx * 2, e.z + e.nz * 2), `${what}: no floor in front of the way to ${e.dest}`);
      }
      check(Math.hypot(L.start.x - up[0].x, L.start.z - up[0].z) < 2.5, `${what}: the start is not by the way up`);
      // a way in or out against the end of its dead end: rock right behind it, none of the floor
      // going on past its back (the review's 2–3 tiles behind the caves' stairs)
      for (const e of L.entrances ?? []) {
        const back = [-1.5, 0, 1.5].map((s) => ({ x: e.x - e.nx * 1.2 - e.nz * s * 0.5, z: e.z - e.nz * 1.2 + e.nx * s * 0.5 }));
        check(back.every((b) => !map.walkableAt(b.x, b.z)), `${what}: floor behind the way to ${e.dest}`);
      }
      // a level of its area all over, no waypoint (Waypoint 255), no old trial stairs, in its look
      // (the caves the grotto's, the crypts the old crypts': dungeons.ts dungeonSpec)
      check(L.areaOf.length === map.w * map.h && L.areaOf.every((a) => a === area), `${what}: tiles of another area`);
      check(!L.waypoints.length && !L.stairs && L.theme === dungeonSpec(area, seed, diff).theme && X.style === def.style, `${what}: waypoints ${L.waypoints.length}, stairs ${!!L.stairs}, look ${L.theme.key}`);
      // the boss in its own room, the area's superunique
      const boss = X.specials.find((s) => s.kind === 'boss');
      const su = row.superuniques?.[0];
      if (su) {
        const u = L.superUniques ?? [];
        const r = boss && X.cells[boss.cell].rect;
        const inRoom = (p) => r && p.x >= r.x && p.x < r.x + r.w && p.z >= r.y && p.z < r.y + r.h;
        check(u.length === 1 && u[0].key === su && u[0].monster === D2X_SUPERUNIQUES.find((s) => s.key === su).mon && inRoom(u[0].pos) && onFloor(u[0].pos), `${what}: superuniques ${JSON.stringify(u.map((x) => x.key))} at ${u.map((x) => `${x.pos.x.toFixed(1)},${x.pos.z.toFixed(1)}`)}`);
        if (area === DEN) check(Math.hypot(u[0].pos.x - L.start.x, u[0].pos.z - L.start.z) > 15, `${what}: the Den's superunique within 15 of the start`);
      } else check(!(L.superUniques ?? []).length && !boss, `${what}: a boss where the area has none`);
      // the spark chests: Cave Level 2's a 580 one, the Mausoleum's 397 in its chest room, none elsewhere
      const sparks = X.chests.filter((c) => c.sparkly);
      const room = X.specials.find((s) => s.kind === 'treasure');
      const inside = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.z >= r.y && p.z < r.y + r.h;
      if (area === CAVE2) check(sparks.length === 1 && sparks[0].placeholder === 580 && !sparks[0].consolation && D2X_OBJECTS[580].becomes.includes(sparks[0].id) && sparks[0].pos.z < map.h / 3, `${what}: spark chests ${JSON.stringify(sparks)}`);
      else if (area === MAUSOLEUM) check(sparks.length === 1 && sparks[0].id === 397 && sparks[0].consolation && room && inside(sparks[0].pos, X.cells[room.cell].rect), `${what}: spark chests ${JSON.stringify(sparks)}`);
      else check(!sparks.length, `${what}: ${sparks.length} spark chests`);
      for (const c of sparks) sparkOf.set(area, (sparkOf.get(area) ?? 0) + 1);
      // the Layout's lists are the extra's, in its order, with what D2 rolled for each (the fields
      // the game's objects take: level.ts), and its special rooms by their lvlprest Def
      const at = (p, o) => p.x === o.pos.x && p.z === o.pos.z;
      const spark = (o) => (o.sparkly ? (o.consolation ? 'consolation' : 'unique') : undefined);
      check(L.chests.length === X.chests.length && L.chests.every((c, i) => at(c, X.chests[i]) && c.d2 === X.chests[i].id && !!c.locked === X.chests[i].locked && (c.trap ?? 0) === X.chests[i].trap && c.sparkly === spark(X.chests[i])), `${what}: Layout.chests isn't MazeExtra.chests`);
      check(L.barrels.length === X.barrels.length && L.barrels.every((b, i) => at(b, X.barrels[i]) && b.d2 === X.barrels[i].id && !!b.exploding === X.barrels[i].exploding && !!b.opened === X.barrels[i].opened), `${what}: Layout.barrels isn't MazeExtra.barrels`);
      check(L.shrines.length === X.shrines.length && L.shrines.every((s, i) => at(s, X.shrines[i]) && s.kind === X.shrines[i].kind), `${what}: Layout.shrines isn't MazeExtra.shrines`);
      check(L.caskets === X.caskets && L.remains === X.remains && L.wells === X.wells, `${what}: Layout's caskets, remains or wells aren't the extra's`);
      const pre = X.cells.filter((c) => c.special >= 0);
      check(area === CAVE2 ? L.presets.length === 1 && L.presets[0].kind === 'hall' && L.presets[0].d2 === 104 : L.presets.length === pre.length && L.presets.every((r, i) => r.d2 === pre[i].preset && r.kind === def.specials[pre[i].special].kind && r.area === area), `${what}: presets ${JSON.stringify(L.presets.map((r) => [r.kind, r.d2]))}`);
      // nothing the dressing puts loose on the floor lies on an object (the review: bones on Cave Level 2's wells)
      const loose = L.props.filter((x) => !PROP_DEFS[x.model]?.solid);
      const all0 = [...X.chests, ...X.barrels, ...X.shrines, ...X.caskets, ...X.remains, ...X.wells];
      const onIt = loose.filter((x) => all0.some((o) => Math.max(Math.abs(x.x - o.pos.x), Math.abs(x.z - o.pos.z)) < 1));
      check(!onIt.length, `${what}: ${onIt.map((x) => x.model).join(', ')} on an object`);
      // in a cave no light but the hero's: no torches, nothing lit on the floor or the walls
      if (def.style === 'cave') check(!L.torches.length && !L.props.some((x) => x.light) && !L.wallDecor.some((w) => w.light), `${what}: a light in a cave`);
      else check(L.torches.length > 0, `${what}: a crypt without torches`);
      // every object on floor the way in reaches, and of the kinds its level rolls
      const all = [...X.chests, ...X.barrels, ...X.shrines, ...X.caskets, ...X.remains, ...X.wells];
      check(all.every((o) => onFloor(o.pos)), `${what}: ${all.filter((o) => !onFloor(o.pos)).length} objects off the reached floor`);
      if (def.style === 'cave') check(!X.caskets.length && !X.barrels.length && X.chests.every((c) => c.sparkly || c.placeholder === 581), `${what}: crypt objects in a cave`);
      else check(!X.remains.length && !X.wells.length, `${what}: cave objects in a crypt`);
      // D2's limits (ObjRgn.cpp:182-251): shrines at most 10 and ⌊rooms/8⌋ + 1, 50 subtiles (12.5 tiles) apart both ways; wells 4, 100 (25)
      const cap = Math.floor(X.objRooms.length / 8) + 1;
      check(X.shrines.length <= Math.min(10, cap) && X.wells.length <= Math.min(4, cap), `${what}: ${X.shrines.length} shrines, ${X.wells.length} wells for ${X.objRooms.length} rooms`);
      const apart = (list, d) => list.every((a, i) => list.every((b, j) => i === j || (Math.abs(a.pos.x - b.pos.x) >= d && Math.abs(a.pos.z - b.pos.z) >= d)));
      check(apart(X.shrines, 12.5) && apart(X.wells, 25), `${what}: shrines or wells too close`);
      // at most 8 barrels a room (PopulateFn4)
      for (const r of X.objRooms) check(X.barrels.filter((b) => inside(b.pos, r)).length <= 8, `${what}: more than 8 barrels in a room`);
      // the monsters' rooms: none reaching within 6 tiles' walk of the start
      check(L.spawnRooms.length > 0, `${what}: no rooms for monsters`);
      for (const r of L.spawnRooms) {
        let close = false;
        for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (dist[z * map.w + x] >= 0 && dist[z * map.w + x] <= 6) close = true;
        check(!close, `${what}: a monsters' room within 6 tiles of the start`);
      }
      // the same seed, the same level
      if (k === 1) {
        const again = generateDungeonLevel(area, seed, diff);
        const sum = (r) => JSON.stringify([Array.from(r.layout.map.tiles), r.layout.start, r.layout.entrances, r.layout.superUniques, r.layout.props, r.layout.decor, r.layout.torches, r.extra]);
        const other = generateDungeonLevel(area, seed + 1, diff);
        check(sum(again) === sum({ layout: L, extra: X }), `${what}: not the same level a second time`);
        // Cave Level 2's hall is one map whatever the seed; only what its rooms roll changes
        if (area === CAVE2) check(Array.from(other.layout.map.tiles).join() === Array.from(L.map.tiles).join(), `${what}: the hall changed with the seed`);
        else check(Array.from(other.layout.map.tiles).join() !== Array.from(L.map.tiles).join(), `${what}: another seed made the same map`);
      }
    }
    times.sort((a, b) => a - b);
    const med = times[times.length >> 1];
    const max = times[times.length - 1];
    console.log(`  ${label}: median ${med.toFixed(1)} ms, max ${max.toFixed(1)} ms over ${LEVEL_SEEDS} seeds`);
    check(max < SLOW_MS, `${label}: ${max.toFixed(0)} ms for a level`);
  }
  check(sparkOf.get(CAVE2) === LEVEL_SEEDS && sparkOf.get(MAUSOLEUM) === 2 * LEVEL_SEEDS, `spark chests: ${JSON.stringify([...sparkOf])}`);

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
};
