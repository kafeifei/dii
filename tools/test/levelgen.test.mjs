// Map generation: the camp, the wilderness and dungeon floors 1–5, a few seeds each, built the way
// the game builds them (new Level). Each must finish, start on walkable ground, and reach every
// way on from there: the stairs, the exits, and in the camp the waypoint, merchant and stash.
const SEEDS = [1, 7, 0x5eed, 20261026];
const FLOORS = 5;
/** a map taking longer than this has stopped being a loading pause */
const SLOW_MS = 5000;

/** tiles reachable from the start, walking the four ways over walkable tiles */
function reachFrom(map, start) {
  const seen = new Uint8Array(map.w * map.h);
  const sx = Math.floor(start.x);
  const sz = Math.floor(start.z);
  const q = [sz * map.w + sx];
  seen[q[0]] = 1;
  for (let head = 0; head < q.length; head++) {
    const c = q[head];
    const x = c % map.w;
    const z = (c / map.w) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!map.walkable(x + dx, z + dz)) continue;
      const n = (z + dz) * map.w + x + dx;
      if (!seen[n]) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  return seen;
}

/** whether a reachable tile's middle is within `r` of the point */
function reaches(map, seen, p, r) {
  for (let z = Math.floor(p.z - r); z <= Math.floor(p.z + r); z++) {
    for (let x = Math.floor(p.x - r); x <= Math.floor(p.x + r); x++) {
      if (!map.inBounds(x, z) || !seen[z * map.w + x]) continue;
      if (Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) <= r) return true;
    }
  }
  return false;
}

export default async (load) => {
  const { Level } = await load('/src/game/level.ts');
  const { WILD_MAPS, isWild, dungeonFloor, levelLabel } = await load('/src/world/levelgen.ts');
  const depths = [0];
  for (let d = 1; d <= WILD_MAPS; d++) depths.push(d);
  for (let f = 1; f <= FLOORS; f++) depths.push(WILD_MAPS + f);

  const problems = [];
  for (const depth of depths) {
    // the camp is laid out by hand: one build covers it
    const seeds = depth === 0 ? SEEDS.slice(0, 1) : SEEDS;
    const times = [];
    for (const seed of seeds) {
      const what = `${levelLabel(depth)} (depth ${depth}, seed ${seed})`;
      const t = performance.now();
      const level = new Level(depth, seed);
      const ms = performance.now() - t;
      times.push(ms);
      const { map, start } = level.layout;
      if (ms > SLOW_MS) problems.push(`${what}: took ${Math.round(ms)} ms`);
      if (level.depth !== depth) problems.push(`${what}: built as depth ${level.depth}`);
      if (depth > WILD_MAPS && level.floor !== dungeonFloor(depth)) problems.push(`${what}: floor ${level.floor}`);
      if (!start || !map.walkableAt(start.x, start.z)) {
        problems.push(`${what}: no walkable start (${JSON.stringify(start)})`);
        continue;
      }
      const seen = reachFrom(map, start);
      const ways = level.objects.filter((o) => ['stairs', 'exit', 'waypoint', 'vendor', 'stash'].includes(o.kind));
      // the camp leads out through its gate; every other map has a way on and a way back
      const need = depth === 0 ? ['exit', 'waypoint', 'vendor', 'stash'] : isWild(depth) ? ['stairs', 'exit'] : ['stairs', 'waypoint'];
      for (const kind of need) if (!ways.some((o) => o.kind === kind)) problems.push(`${what}: no ${kind}`);
      for (const o of ways) {
        // exits are walked into (within their radius); the rest are used from beside them
        const r = o.kind === 'exit' ? o.radius : o.radius + 0.75;
        if (!reaches(map, seen, o.pos, r)) problems.push(`${what}: ${o.kind} at ${o.pos.x.toFixed(1)},${o.pos.z.toFixed(1)} can't be reached from the start`);
      }
      if (depth > 0 && !level.monsters.length) problems.push(`${what}: no monsters`);
    }
    const ms = times.map((x) => Math.round(x));
    console.log(`  depth ${depth} ${levelLabel(depth)}: ${ms.join(' / ')} ms`);
  }
  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
};
