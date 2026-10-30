// The West overworld (src/world/overworld.ts): the camp, Blood Moor, Cold Plains, Stony Field and the
// Burial Grounds on one map. For twenty world seeds: laid out by D2's link rules, each made within the
// budget, the same map field for field for the same seed, the camp the camp the game has now, every
// seam shut but at its port and open through it, every port, waypoint and entrance reachable from the
// camp, the Den of Evil and Cold Plains' Cave cleared round as D2 places them, monsters' rooms on the
// sights, and the Layout's lists where Level looks for them. Stony Field's cliffs only along its north
// and west, the Underground Passage's mouth in them, the Cairn Stones with Rakanishu; the Burial
// Grounds' graveyard filling its inner cells on the cell grid, the Crypt's and the Mausoleum's ways in
// it and Blood Raven, the one preset monster, with her quest; trees between the areas only near them.
// The same at D2's own size and at twice ours, where the camp must still fit. Then a walled-up port
// must be blamed on the area it's in.
const SEEDS = [1, 7, 0x5eed, 20261026, 42, 1337, ...Array.from({ length: 14 }, (_, i) => (Math.imul(i + 1, 0x9e3779b1) >>> 0) || 1)];
/** plan: 大地图生成 ≤400 ms, for every seed */
const BUDGET_MS = 400;
/** OUT_SCALE turned down to D2's own size and up to twice ours: still whole, the camp still in it */
const SCALES = [1, 2];
const T_FLOOR = 1;
const T_WALL = 2;
/** the Underground Passage's first level, behind Stony Field's cliff (levels.txt 10) */
const PASSAGE = 10;
/** trees in the gaps between areas stand within this of one (overworld.ts WOODS_REACH), give or take a tree's jitter */
const WOODS_REACH = 32;

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
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL, STONY_FIELD, BURIAL_GROUNDS, CAVE_1, CRYPT, MAUSOLEUM, areaDef } = await load('/src/world/areas.ts');
  const { D2X_AREAS } = await load('/src/data/d2x/areas.ts');
  const { D2X_SUPERUNIQUES } = await load('/src/data/d2x/superuniques.ts');
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
    check(ow.boxes.length === 5 && ow.boxes.every((b) => b.built) && BUILT.join() === `${CAMP_AREA},${WILD_AREA},${COLD_PLAINS},${STONY_FIELD},${BURIAL_GROUNDS}`, `${what}: boxes ${ow.boxes.map((b) => `${b.area}${b.built ? '' : '?'}`).join(' ')}, built ${BUILT}`);
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
    // Kashya (a service, 'hire') stands where the camp's rogue stood: one fewer of its people (src/world/presets.ts)
    const kashya = ow.services.find((o) => o.kind === 'hire');
    const rogue = town.npcs.find((n) => n.model === 'rogue');
    check(!!kashya && near(kashya.pos, { x: rogue.x + ox, z: rogue.z + oz }), `${what}: Kashya isn't where the camp's rogue stood`);
    check(near(start, { x: town.start.x + ox, z: town.start.z + oz }) && (ow.npcs?.length ?? 0) === town.npcs.length - 1 && (ow.houses?.length ?? 0) === town.houses.length, `${what}: the camp's start, people or houses moved`);
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
    check(ow.seams.map((s) => `${s.a}-${s.b}`).sort().join(' ') === ['1-2', '2-3', '3-4', '3-17'].sort().join(' '), `${what}: seams ${ow.seams.map((s) => `${s.a}-${s.b}`).join(' ')}`);
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

    // ── waypoints as D2's: the camp's, Cold Plains' just inside the way from Blood Moor, Stony Field's; none in the Burial Grounds ──
    check(ow.waypoints.map((w) => w.area).join(' ') === `${CAMP_AREA} ${COLD_PLAINS} ${STONY_FIELD}` && ow.waypoints.every((w) => at(w.pos) === w.area), `${what}: waypoints ${ow.waypoints.map((w) => `${w.area}@${at(w.pos)}`).join(' ')}`);
    const fromMoor = ow.seams.find((s) => s.b === COLD_PLAINS);
    const wp = ow.waypoints.find((w) => w.area === COLD_PLAINS);
    check(wp && fromMoor && Math.hypot(wp.pos.x - fromMoor.tb.x, wp.pos.z - fromMoor.tb.z) < 2.5 * CELL, `${what}: Cold Plains' waypoint is far from the way in from Blood Moor`);

    // ── entrances: the Den of Evil far out in Blood Moor, Cold Plains' Cave, the Underground Passage in
    // Stony Field's cliff, the Crypt and the Mausoleum in the Burial Grounds, each named as the rename
    // table has it; no road on, every area on the map ──
    const caves = ow.entrances.filter((e) => e.kind === 'cave');
    const wayTo = (dest) => caves.find((e) => e.dest === dest);
    const den = wayTo(DEN_OF_EVIL);
    const named = (dest) => areaDef(dest)?.name ?? D2X_AREAS.find((a) => a.id === dest).name;
    const want = [[DEN_OF_EVIL, WILD_AREA], [CAVE_1, COLD_PLAINS], [PASSAGE, STONY_FIELD], [CRYPT, BURIAL_GROUNDS], [MAUSOLEUM, BURIAL_GROUNDS]];
    check(caves.length === want.length && want.every(([dest, area]) => wayTo(dest) && at(wayTo(dest)) === area && wayTo(dest).name === named(dest) && named(dest)), `${what}: caves ${caves.map((e) => `${e.dest}@${at(e)} ${e.name}`).join(', ')}`);
    check(!ow.entrances.some((e) => e.kind === 'road'), `${what}: roads on to ${ow.entrances.filter((e) => e.kind === 'road').map((e) => e.dest).join(' ')}`);
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
    // Cold Plains' Cave as the Den: far from the camp, the cells all round it free
    const cave1 = wayTo(CAVE_1);
    if (cave1) {
      const plainsRooms = ow.spawnRooms.filter((r) => at({ x: r.x + 4, z: r.y + 4 }) === COLD_PLAINS);
      check(far(cave1) >= 0.75 * Math.max(...plainsRooms.map((r) => far({ x: r.x + 4, z: r.y + 4 }))), `${what}: Cold Plains' Cave is near the camp`);
      const cx = Math.floor((cave1.x - plains.x) / CELL);
      const cz = Math.floor((cave1.z - plains.z) / CELL);
      check(cx >= 2 && cz >= 2 && cx <= plains.w / CELL - 3 && cz <= plains.h / CELL - 3, `${what}: Cold Plains' Cave is in cell ${cx},${cz}, next to the border`);
    }

    // ── Stony Field: cliffs along its north and west and nowhere else, open where its port runs through ──
    const stony = box(STONY_FIELD);
    const cliffBad = [];
    let north = 0;
    let west = 0;
    for (const i of ow.cliffs) {
      const x = i % map.w;
      const z = Math.floor(i / map.w);
      const dn = z - stony.z;
      const dw = x - stony.x;
      const ds = stony.z + stony.h - 1 - z;
      const de = stony.x + stony.w - 1 - x;
      const inBox = dn >= 0 && dw >= 0 && ds >= 0 && de >= 0;
      if (!inBox || map.get(x, z) !== T_WALL || areaOf[i] !== STONY_FIELD || Math.min(dn, dw) > CELL + 4 || Math.min(dn, dw) > Math.min(ds, de)) cliffBad.push(`${x},${z}`);
      if (dn <= dw) north++;
      else west++;
    }
    check(!cliffBad.length, `${what}: ${cliffBad.length} cliff tile(s) off Stony Field's north and west borders, or not walls (${cliffBad.slice(0, 4).join(' ')})`);
    // the cliff runs most of each side (the port's opening and the corners aside)
    check(north >= stony.w * 2 && west >= stony.h * 2, `${what}: ${north} cliff tiles along the north, ${west} along the west, of ${stony.w} and ${stony.h}`);
    // no woods' void left on those sides: past the land there it's all cliff
    let voidLeft = 0;
    for (let z = stony.z; z < stony.z + stony.h; z++) {
      for (let x = stony.x; x < stony.x + stony.w; x++) {
        const dn = z - stony.z;
        const dw = x - stony.x;
        const d = Math.min(dn, dw, stony.z + stony.h - 1 - z, stony.x + stony.w - 1 - x);
        if (d <= CELL + 4 && Math.min(dn, dw) === d && map.get(x, z) === 0) voidLeft++;
      }
    }
    check(!voidLeft, `${what}: ${voidLeft} tile(s) of woods' void along Stony Field's cliff sides`);
    // the Underground Passage's mouth at the cliff's foot, facing in, the cliff behind it
    const mouth = wayTo(PASSAGE);
    if (mouth) {
      const dn = mouth.z - stony.z;
      const dw = mouth.x - stony.x;
      const onNorth = dn < dw;
      check(Math.min(dn, dw) < CELL && (onNorth ? mouth.nz === 1 && mouth.nx === 0 : mouth.nx === 1 && mouth.nz === 0), `${what}: the passage's mouth is ${dn.toFixed(1)} from the north, ${dw.toFixed(1)} from the west, facing ${mouth.nx},${mouth.nz}`);
      const behind = { x: Math.floor(mouth.x - mouth.nx * 3.5), z: Math.floor(mouth.z - mouth.nz * 3.5) };
      check(ow.cliffs.has(behind.z * map.w + behind.x), `${what}: no cliff behind the passage's mouth`);
    }
    // the Cairn Stones in Stony Field, five round their middle, Rakanishu (his row's names) set down in them
    const rak = D2X_SUPERUNIQUES.find((u) => u.key === 'Rakanishu');
    const su = (ow.superUniques ?? []).filter((u) => u.key === 'Rakanishu');
    check(ow.cairn && at(ow.cairn.center) === STONY_FIELD && ow.cairn.stones.length === 5 && ow.cairn.stones.every((p) => { const d = Math.hypot(p.x - ow.cairn.center.x, p.z - ow.cairn.center.z); return d > 1.5 && d < 4 && map.get(Math.floor(p.x), Math.floor(p.z)) === 3; }), `${what}: the cairn ${JSON.stringify(ow.cairn)}`);
    check(su.length === 1 && ow.superUniques.length === 1 && su[0].monster === rak.mon && su[0].name === rak.name && ow.cairn && Math.hypot(su[0].pos.x - ow.cairn.center.x, su[0].pos.z - ow.cairn.center.z) < 1.5, `${what}: superuniques ${JSON.stringify(ow.superUniques)}`);
    check(ow.presets.some((p) => p.kind === 'cairn' && p.d2 === 160 && p.area === STONY_FIELD), `${what}: presets ${ow.presets.map((p) => p.kind).join(',')}`);

    // ── the Burial Grounds: the graveyard fills its inner cells, on the cell grid; its two ways and Blood Raven in it ──
    const barrow = box(BURIAL_GROUNDS);
    const yard = ow.presets.filter((p) => p.kind === 'barrow');
    const r = yard[0]?.rect;
    const innerW = barrow.w / CELL - 2;
    const innerH = barrow.h / CELL - 2;
    check(yard.length === 1 && r.x === barrow.x + CELL && r.y === barrow.z + CELL && r.w === innerW * CELL && r.h === innerH * CELL && (r.x - camp.x) % CELL === 0 && (r.y - camp.z) % CELL === 0, `${what}: the graveyard is ${JSON.stringify(r)} in ${JSON.stringify(barrow)}`);
    if (scale === OUT_SCALE) check(innerW === 4 && innerH === 6, `${what}: the graveyard is ${innerW}×${innerH} cells`);
    const inYard = (p) => r && p.x >= r.x && p.x < r.x + r.w && p.z >= r.y && p.z < r.y + r.h;
    check([CRYPT, MAUSOLEUM].every((d) => wayTo(d) && inYard(wayTo(d))), `${what}: the Crypt's and the Mausoleum's ways aren't in the graveyard`);
    const pm = ow.presetMonsters ?? [];
    check(pm.length === 1 && pm[0].monster === 'bloodraven' && pm[0].quest === 'a1q2' && inYard(pm[0].pos) && at(pm[0].pos) === BURIAL_GROUNDS, `${what}: preset monsters ${JSON.stringify(pm)}`);
    // the graveyard's every walkable tile walked to from the camp (the Furnisher kept it so)
    const yardRooms = ow.spawnRooms.filter((x) => at({ x: x.x + x.w / 2, z: x.y + x.h / 2 }) === BURIAL_GROUNDS);
    check(yardRooms.length === innerW * innerH && yardRooms.every((x) => inYard({ x: x.x, z: x.y })), `${what}: the Burial Grounds have ${yardRooms.length} monsters' rooms, the graveyard ${innerW * innerH} cells`);

    // ── trees in the gaps between areas only near one ──
    const farOut = ow.props.filter((p) => {
      let d = Infinity;
      for (const b of ow.boxes) {
        const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
        const dz = Math.max(b.z - p.z, 0, p.z - (b.z + b.h));
        d = Math.min(d, Math.hypot(dx, dz));
      }
      return d > WOODS_REACH + 1;
    });
    check(!farOut.length, `${what}: ${farOut.length} prop(s) more than ${WOODS_REACH} tiles from any area, e.g. ${farOut[0]?.model} at ${farOut[0]?.x.toFixed(1)},${farOut[0]?.z.toFixed(1)}`);

    // ── monsters' rooms: a cell each, the sights' and the cave's too; shrines, Bishibosh's camp ──
    const inRoom = (p) => ow.spawnRooms.some((r) => p.x >= r.x && p.x < r.x + r.w && p.z >= r.y && p.z < r.y + r.h);
    for (const area of [WILD_AREA, COLD_PLAINS, STONY_FIELD]) {
      const b = box(area);
      const rooms = ow.spawnRooms.filter((r) => at({ x: r.x + r.w / 2, z: r.y + r.h / 2 }) === area);
      // every inner cell but the camp's doorstep, a sight's four in one
      check(rooms.length >= ((b.w / CELL - 2) * (b.h / CELL - 2)) * 0.75, `${what}: area ${area} has ${rooms.length} spawn rooms`);
      check(rooms.some((r) => r.w === 2 * CELL), `${what}: area ${area} has no room on a sight`);
      check(ow.shrines.filter((p) => at(p) === area).length === 5, `${what}: area ${area} has ${ow.shrines.filter((p) => at(p) === area).length} shrines`);
    }
    // lvlprest.json Populate 1: the cave mouths, the fallen camp; and the shrines' cells are plain land in D2
    check([...(den ? [den] : []), ...(cave1 ? [cave1] : []), ...ow.elites, ...ow.shrines].every(inRoom), `${what}: a cave mouth, a monster camp or a shrine has no monsters' room`);
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
