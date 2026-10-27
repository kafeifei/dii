// The West overworld (src/world/overworld.ts): the camp, Blood Moor and Cold Plains on one map. For
// twenty world seeds: laid out by D2's link rules, each made within the budget, the same map field
// for field for the same seed, the camp the camp the game has now, every seam shut but at its port
// and open through it, every port, waypoint and entrance reachable from the camp, the Den of Evil
// cleared round as D2 places it, monsters' rooms on the sights, and the Layout's lists where Level
// looks for them. The same at D2's own size and at twice ours, where the camp must still fit. Then a
// walled-up port must be blamed on the area it's in.
const SEEDS = [1, 7, 0x5eed, 20261026, 42, 1337, ...Array.from({ length: 14 }, (_, i) => (Math.imul(i + 1, 0x9e3779b1) >>> 0) || 1)];
/** plan: 大地图生成 ≤400 ms, for every seed */
const BUDGET_MS = 400;
/** OUT_SCALE turned down to D2's own size and up to twice ours: still whole, the camp still in it */
const SCALES = [1, 2];
const T_FLOOR = 1;
const T_WALL = 2;

/** the paths where two values differ, typed arrays element by element, at most `max` */
function differences(a, b, path = '', out = [], max = 5) {
  if (out.length >= max) return out;
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b) || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) out.push(path);
  } else if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set)) out.push(path);
    else differences([...a], [...b], path, out, max);
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) out.push(path);
    else for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[k], b[k], `${path}.${k}`, out, max);
  } else if (!Object.is(a, b)) out.push(path);
  return out;
}

export default async (load) => {
  const { generateOverworld, unreachable, BUILT } = await load('/src/world/overworld.ts');
  const { CELL, OUT_SCALE, cellsOf } = await load('/src/world/zone.ts');
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL, STONY_FIELD, BURIAL_GROUNDS, areaDef } = await load('/src/world/areas.ts');
  const { generateTown } = await load('/src/world/levelgen.ts');
  const { Level } = await load('/src/game/level.ts');
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const near = (a, b, d = 1e-6) => Math.hypot(a.x - b.x, a.z - b.z) <= d;
  const town = generateTown(CAMP_AREA);

  /** everything a world must be, made from `seed` at `scale` */
  const checkWorld = (ow, seed, scale, what) => {
    const { map, areaOf, start } = ow;
    const at = (p) => areaOf[Math.floor(p.z) * map.w + Math.floor(p.x)];
    const box = (area) => ow.boxes.find((b) => b.area === area);
    check(ow.seed === seed && !ow.unreached.length, `${what}: made from seed ${ow.seed}, ${ow.unreached.length} thing(s) out of reach`);

    // ── the layout: D2's sizes, whole cells, no overlaps, Blood Moor long toward Cold Plains, the camp at the west ──
    const camp = box(CAMP_AREA);
    const moor = box(WILD_AREA);
    const plains = box(COLD_PLAINS);
    check(ow.boxes.length === 5 && [STONY_FIELD, BURIAL_GROUNDS].every((a) => box(a) && !box(a).built) && BUILT.every((a) => box(a)?.built), `${what}: boxes ${ow.boxes.map((b) => `${b.area}${b.built ? '' : '?'}`).join(' ')}`);
    const cells = (b) => `${b.w / CELL}x${b.h / CELL}`;
    // the camp's is D2's 56×40, but never smaller than the camp
    const fit = (n) => Math.ceil(n / CELL);
    check(cells(camp) === `${Math.max(cellsOf(56, scale), fit(town.map.w))}x${Math.max(cellsOf(40, scale), fit(town.map.h))}`, `${what}: the camp is ${cells(camp)} cells`);
    check(cells(plains) === `${cellsOf(80, scale)}x${cellsOf(80, scale)}` && cells(box(STONY_FIELD)) === cells(plains), `${what}: Cold Plains ${cells(plains)}, Stony Field ${cells(box(STONY_FIELD))}`);
    check(cells(box(BURIAL_GROUNDS)) === `${cellsOf(40, scale)}x${cellsOf(48, scale)}`, `${what}: the Burial Grounds are ${cells(box(BURIAL_GROUNDS))}`);
    const beside = moor.x + moor.w === plains.x || plains.x + plains.w === moor.x;
    check(cells(moor) === (beside ? `${cellsOf(96, scale)}x${cellsOf(56, scale)}` : `${cellsOf(56, scale)}x${cellsOf(96, scale)}`), `${what}: Blood Moor is ${cells(moor)} with Cold Plains ${beside ? 'beside' : 'above or below'} it`);
    for (const b of ow.boxes) {
      check([b.x - camp.x, b.z - camp.z, b.w, b.h].every((v) => v % CELL === 0), `${what}: area ${b.area} is off the cell grid`);
      for (const o of ow.boxes) if (o !== b && b.x < o.x + o.w && o.x < b.x + b.w && b.z < o.z + o.h && o.z < b.z + b.h) problems.push(`${what}: areas ${b.area} and ${o.area} overlap`);
      if (b !== camp) check(b.x >= camp.x + camp.w, `${what}: area ${b.area} reaches west of the camp's east edge`);
    }
    check(camp.x + camp.w === moor.x && camp.z >= moor.z && camp.z + camp.h <= moor.z + moor.h, `${what}: the camp doesn't lie along Blood Moor's west side`);

    // ── the map: every tile has an area, each box is its area's, the ground's weights add up ──
    check(areaOf.length === map.w * map.h && ow.ground.length === map.w * map.h * 4, `${what}: areaOf or ground is the wrong size`);
    for (const b of ow.boxes.filter((x) => x.built)) {
      let wrong = 0;
      for (let z = b.z; z < b.z + b.h; z++) for (let x = b.x; x < b.x + b.w; x++) if (areaOf[z * map.w + x] !== b.area) wrong++;
      check(!wrong, `${what}: ${wrong} tiles of area ${b.area}'s box are another's`);
    }
    check([...areaOf].every((a) => BUILT.includes(a)), `${what}: a tile is in an area that isn't built`);
    let off = 0;
    for (let i = 0; i < map.w * map.h; i++) {
      const s = ow.ground[i * 4] + ow.ground[i * 4 + 1] + ow.ground[i * 4 + 2] + ow.ground[i * 4 + 3];
      if (Math.abs(s - 255) > 4) off++;
    }
    check(!off, `${what}: ${off} tiles' ground weights don't add up to 255`);

    // ── the camp is today's camp, whole, at its place in the world ──
    const ox = camp.x;
    const oz = camp.z + Math.floor((camp.h - town.map.h) / 2);
    check(oz >= camp.z && oz + town.map.h <= camp.z + camp.h && ox + town.map.w <= camp.x + camp.w, `${what}: the camp runs out of its area`);
    let changed = 0;
    for (let z = 0; z < town.map.h; z++) for (let x = 0; x < town.map.w; x++) if (town.map.get(x, z) !== 0 && map.get(ox + x, oz + z) !== town.map.get(x, z)) changed++;
    check(!changed, `${what}: ${changed} of the camp's tiles differ from generateTown's`);
    for (const s of town.services) check(ow.services.some((o) => o.kind === s.kind && o.npc === s.npc && near(o.pos, { x: s.pos.x + ox, z: s.pos.z + oz })), `${what}: the camp's ${s.kind} isn't where it is in the camp`);
    check(near(start, { x: town.start.x + ox, z: town.start.z + oz }) && (ow.npcs?.length ?? 0) === town.npcs.length && (ow.houses?.length ?? 0) === town.houses.length, `${what}: the camp's start, people or houses moved`);
    check(!ow.exits.length, `${what}: ${ow.exits.length} walk-through exits on a seamless map`);

    // ── Level's view of it: the start in the camp, the areas' levels ──
    // the Level the game makes over it (?dev&overworld: Game.enterWest); the rest is in seamless.test.mjs
    const level = new Level(1, seed, ow);
    check(map.walkableAt(start.x, start.z) && level.inTown(start), `${what}: the start isn't on the camp's ground`);
    for (const area of BUILT) {
      const b = box(area);
      const def = level.areaAt(b.x + b.w / 2, b.z + b.h / 2);
      check(def === areaDef(area) && level.alvlAt({ x: b.x + 1, z: b.z + 1 }) === areaDef(area).alvl[0], `${what}: Level sees area ${area}'s middle as ${def?.key}`);
    }

    // ── the seams: open through the port, shut everywhere else ──
    check(ow.seams.length === 2 && ow.seams.some((s) => s.a === CAMP_AREA && s.b === WILD_AREA) && ow.seams.some((s) => s.a === WILD_AREA && s.b === COLD_PLAINS), `${what}: seams ${ow.seams.map((s) => `${s.a}-${s.b}`).join(' ')}`);
    for (const s of ow.seams) {
      check(map.walkableAt(s.ta.x, s.ta.z) && map.walkableAt(s.tb.x, s.tb.z) && at(s.ta) === s.a && at(s.tb) === s.b && near(s.ta, s.tb, 1.01), `${what}: the ${s.a}-${s.b} seam's opening isn't two walkable tiles side by side`);
    }
    const crossings = new Map(ow.seams.map((s) => [s, 0]));
    for (let z = 0; z < map.h; z++) {
      for (let x = 0; x < map.w; x++) {
        for (const [dx, dz] of [[1, 0], [0, 1]]) {
          const a = areaOf[z * map.w + x];
          const b = areaOf[(z + dz) * map.w + x + dx];
          if (x + dx >= map.w || z + dz >= map.h || a === b || !map.walkable(x, z) || !map.walkable(x + dx, z + dz)) continue;
          const s = ow.seams.find((s) => Math.hypot(x + 0.5 - s.ta.x, z + 0.5 - s.ta.z) < 4.5);
          if (s) crossings.set(s, crossings.get(s) + 1);
          else problems.push(`${what}: areas ${a} and ${b} meet at ${x},${z}, away from any port`);
        }
      }
    }
    for (const [s, n] of crossings) check(n >= 3, `${what}: the ${s.a}-${s.b} opening is ${n} tiles wide`);
    const bad = unreachable(ow);
    check(!bad.length, `${what}: can't reach ${bad.map((b) => `area ${b.area}'s ${b.what}`).join(', ')}`);

    // ── waypoints as D2's: the camp's, and Cold Plains' just inside the way from Blood Moor ──
    check(ow.waypoints.map((w) => w.area).join(' ') === `${CAMP_AREA} ${COLD_PLAINS}` && ow.waypoints.every((w) => at(w.pos) === w.area), `${what}: waypoints ${ow.waypoints.map((w) => `${w.area}@${at(w.pos)}`).join(' ')}`);
    const fromMoor = ow.seams.find((s) => s.b === COLD_PLAINS);
    const wp = ow.waypoints.find((w) => w.area === COLD_PLAINS);
    check(wp && fromMoor && Math.hypot(wp.pos.x - fromMoor.tb.x, wp.pos.z - fromMoor.tb.z) < 2.5 * CELL, `${what}: Cold Plains' waypoint is far from the way in from Blood Moor`);

    // ── entrances: the Den of Evil far out in Blood Moor, the roads on to Stony Field and the Burial Grounds ──
    const caves = ow.entrances.filter((e) => e.kind === 'cave');
    const den = caves[0];
    check(caves.length === 1 && den.dest === DEN_OF_EVIL && at(den) === WILD_AREA && den.name === areaDef(DEN_OF_EVIL).name, `${what}: caves ${caves.map((e) => `${e.dest}@${at(e)}`).join(' ')}`);
    const roadsOn = ow.entrances.filter((e) => e.kind === 'road').map((e) => `${e.dest}@${at(e)}`).sort().join(' ');
    check(roadsOn === [`${STONY_FIELD}@${COLD_PLAINS}`, `${BURIAL_GROUNDS}@${COLD_PLAINS}`].sort().join(' '), `${what}: roads on ${roadsOn}`);
    const cc = { x: camp.x + camp.w / 2, z: camp.z + camp.h / 2 };
    const far = (p) => {
      const dx = Math.abs(p.x - cc.x);
      const dz = Math.abs(p.z - cc.z);
      return Math.max(dx, dz) + Math.min(dx, dz) / 2;
    };
    const moorRooms = ow.spawnRooms.filter((r) => at({ x: r.x + 4, z: r.y + 4 }) === WILD_AREA);
    if (den) {
      check(far(den) >= 0.75 * Math.max(...moorRooms.map((r) => far({ x: r.x + 4, z: r.y + 4 }))), `${what}: the Den of Evil is near the camp`);
      // D2 wants the cells all round the mouth free (TestOutdoorLevelPreset, nOffset 1, nFlags 15), so never the ring by the border
      const cx = Math.floor((den.x - moor.x) / CELL);
      const cz = Math.floor((den.z - moor.z) / CELL);
      check(cx >= 2 && cz >= 2 && cx <= moor.w / CELL - 3 && cz <= moor.h / CELL - 3, `${what}: the Den of Evil is in cell ${cx},${cz} of ${cells(moor)}, next to the border`);
    }

    // ── monsters' rooms: a cell each, the sights' and the cave's too; shrines, Bishibosh's camp ──
    const inRoom = (p) => ow.spawnRooms.some((r) => p.x >= r.x && p.x < r.x + r.w && p.z >= r.y && p.z < r.y + r.h);
    for (const area of [WILD_AREA, COLD_PLAINS]) {
      const b = box(area);
      const rooms = ow.spawnRooms.filter((r) => at({ x: r.x + r.w / 2, z: r.y + r.h / 2 }) === area);
      // every inner cell but the camp's doorstep, a sight's four in one
      check(rooms.length >= ((b.w / CELL - 2) * (b.h / CELL - 2)) * 0.75, `${what}: area ${area} has ${rooms.length} spawn rooms`);
      check(rooms.some((r) => r.w === 2 * CELL), `${what}: area ${area} has no room on a sight`);
      check(ow.shrines.filter((p) => at(p) === area).length === 5, `${what}: area ${area} has ${ow.shrines.filter((p) => at(p) === area).length} shrines`);
    }
    // lvlprest.json Populate 1: the cave mouth, the fallen camp; and the shrines' cells are plain land in D2
    check([...(den ? [den] : []), ...ow.elites, ...ow.shrines].every(inRoom), `${what}: the den, a monster camp or a shrine has no monsters' room`);
    check(ow.spawnRooms.every((r) => at({ x: r.x + r.w / 2, z: r.y + r.h / 2 }) !== CAMP_AREA), `${what}: a spawn room in the camp`);
    const doorstep = ow.seams.find((s) => s.a === CAMP_AREA);
    check(!inRoom({ x: doorstep.tb.x + Math.sign(doorstep.tb.x - doorstep.ta.x) * CELL, z: doorstep.tb.z + Math.sign(doorstep.tb.z - doorstep.ta.z) * CELL }), `${what}: monsters wait on the camp's doorstep`);
    check(ow.elites.length >= 1 && ow.elites.every((p) => at(p) === COLD_PLAINS), `${what}: monster camps in ${ow.elites.map(at).join(' ') || 'nowhere'}`);
    for (const list of ['chests', 'barrels', 'shrines', 'elites']) check(ow[list].every((p) => map.walkableAt(p.x, p.z)), `${what}: one of the ${list} isn't on walkable ground`);
  };

  const times = [];
  let rerolls = 0;
  for (const seed of SEEDS) {
    const what = `seed ${seed}`;
    const t = performance.now();
    const ow = generateOverworld(seed);
    const ms = performance.now() - t;
    times.push(ms);
    check(ms <= BUDGET_MS, `${what}: took ${Math.round(ms)} ms, over the ${BUDGET_MS} ms budget`);
    rerolls += ow.rerolls;
    checkWorld(ow, seed, OUT_SCALE, what);
    // ── the same seed, the same map, every field of it ──
    const diff = differences(generateOverworld(seed), ow);
    check(!diff.length, `${what}: made twice, the maps differ at ${diff.join(' ')}`);
  }
  const a = generateOverworld(SEEDS[0]);
  const b = generateOverworld(SEEDS[1]);
  check(a.map.w !== b.map.w || a.map.h !== b.map.h || a.map.tiles.some((v, i) => v !== b.map.tiles[i]), 'two seeds made the same map');

  // ── the one knob: D2's size and twice ours, the camp whole in its area at both ──
  const scaled = [];
  for (const scale of SCALES) {
    for (const seed of SEEDS.slice(0, 3)) {
      const t = performance.now();
      const ow = generateOverworld(seed, scale);
      const ms = performance.now() - t;
      scaled.push(`${scale}×: ${Math.round(ms)}`);
      check(ms <= BUDGET_MS, `seed ${seed} at ${scale}×: took ${Math.round(ms)} ms, over the ${BUDGET_MS} ms budget`);
      checkWorld(ow, seed, scale, `seed ${seed} at ${scale}×`);
    }
  }

  // ── a port walled up is the fault of the area it's walled in, the one nearest the camp first ──
  for (const side of ['tb', 'ta']) {
    const ow = generateOverworld(SEEDS[0]);
    const s = ow.seams.find((x) => x.b === COLD_PLAINS);
    const p = s[side];
    const across = Math.abs(s.ta.x - s.tb.x) > 0.5;
    for (let k = -6; k <= 6; k++) ow.map.set(Math.floor(p.x + (across ? 0 : k)), Math.floor(p.z + (across ? k : 0)), T_WALL);
    const bad = unreachable(ow);
    const want = side === 'tb' ? COLD_PLAINS : WILD_AREA;
    check(bad.length && bad[0].area === want, `walling up the ${side === 'tb' ? 'Cold Plains' : 'Blood Moor'} side of their seam blames ${bad[0]?.area ?? 'nobody'}, not ${want}`);
    for (let k = -6; k <= 6; k++) ow.map.set(Math.floor(p.x + (across ? 0 : k)), Math.floor(p.z + (across ? k : 0)), T_FLOOR);
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  console.log(`  ${SEEDS.length} seeds: ${times.map((x) => Math.round(x)).join(' / ')} ms (each within ${BUDGET_MS}), ${rerolls} area(s) made again; ${scaled.join(' / ')} ms`);
};
