// Map generation: the camp, the wilderness and dungeon floors 1–5, a few seeds each, built the way
// the game builds them (new Level). Each must finish, start on walkable ground, and reach every
// way on from there: the stairs, the exits, and in the camp the waypoint, merchant and stash. Then
// the Layout's fields for M2a's maps: a floor made by hand with all of them gets the objects they say
// (chests and barrels with D2's word on them, caskets, corpses, wells), an old floor's say nothing new.
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

  // ── the Layout's fields for M2a's maps (docs/M2A-STEP0.md 2.4): a floor made by hand with every
  // one of them gets the objects they say, with what D2 says of each; an old map's objects are as
  // they were, none of them saying anything new but its chests, each one of the act's thirteen with its
  // trap and lock rolled (level.ts: as a preset's random chest) ──
  {
    const { generateDungeon } = await load('/src/world/levelgen.ts');
    const { spent } = await load('/src/game/objects.ts');
    const { dungeonArea } = await load('/src/world/areas.ts');
    const OLD_KINDS = ['chest', 'barrel', 'stairs', 'waypoint', 'shrine', 'exit'];
    const NEW_FIELDS = ['d2', 'locked', 'trap', 'sparkly', 'exploding', 'hole', 'flies', 'charges', 'serves'];
    const plain = new Level(WILD_MAPS + 2, SEEDS[1]);
    const { D2X_OBJECTS } = await load('/src/data/d2x/objects.ts');
    const ACT1 = D2X_OBJECTS[581].becomes;
    const rolled = (o) => ACT1.includes(o.d2) && (o.trap === undefined || (o.trap >= 1 && o.trap <= 8)) && (o.locked === undefined || o.locked === true) && NEW_FIELDS.every((k) => ['d2', 'trap', 'locked'].includes(k) || o[k] === undefined);
    const said = plain.objects.filter((o) => (o.kind === 'chest' ? !rolled(o) : NEW_FIELDS.some((k) => o[k] !== undefined)));
    if (said.length || plain.objects.some((o) => !OLD_KINDS.includes(o.kind))) problems.push(`an old floor: objects ${[...new Set(plain.objects.map((o) => o.kind))].join()}, ${said.length} saying something new`);
    const L = generateDungeon(2, SEEDS[1], dungeonArea(2));
    const s = L.start;
    const at = (dx, dz) => ({ x: s.x + dx, z: s.z + dz });
    const chests = L.chests.length;
    const barrels = L.barrels.length;
    L.chests = [{ ...at(1, 0), d2: 397, locked: true, trap: 3, sparkly: 'consolation' }, ...L.chests];
    L.barrels = [{ ...at(2, 0), d2: 11, exploding: true }, { ...at(3, 0), opened: true }, ...L.barrels];
    L.shrines = [{ ...at(0, 1), kind: 'health' }];
    L.caskets = [{ pos: at(0, 2), id: 5, hole: false, opened: false }, { pos: at(1, 2), id: 28, hole: true, opened: true }];
    L.remains = [{ pos: at(2, 2), id: 54, flies: true }];
    L.wells = [{ pos: at(3, 2), id: 130 }];
    L.cliffs = new Set([0, 1, 2]);
    L.cairn = { center: at(4, 4), stones: [at(4, 3), at(5, 4)] };
    L.presets = [{ kind: 'cairn', d2: 22, rect: { x: 1, y: 1, w: 8, h: 8 }, area: dungeonArea(2) }];
    L.presetMonsters = [{ pos: at(5, 5), monster: 'bloodraven', quest: 'a1q2' }];
    // Kashya's service (docs/M2A-STEP0.md 2.12): a townsperson as the merchant is, serving her hirelings
    const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
    L.services = [...L.services, { kind: 'hire', pos: at(6, 6), npc: D2X_MONSTERS.kashya.name, npcId: 'kashya' }];
    const lv = new Level(WILD_MAPS + 2, SEEDS[1], L);
    const of = (kind) => lv.objects.filter((o) => o.kind === kind);
    const ch = of('chest');
    if (ch.length !== chests + 1 || ch[0].d2 !== 397 || !ch[0].locked || ch[0].trap !== 3 || ch[0].sparkly !== 'consolation' || ch[0].pos.d2 !== undefined || ch.slice(1).some((o) => !rolled(o))) problems.push(`the hand-made floor's chests: ${JSON.stringify(ch.slice(0, 2).map((o) => ({ d2: o.d2, locked: o.locked, trap: o.trap, sparkly: o.sparkly, pos: o.pos })))}, ${ch.length} of ${chests + 1}`);
    const br = of('barrel');
    if (br.length !== barrels + 2 || br[0].d2 !== 11 || !br[0].exploding || br[0].used || !br[1].used || !spent(br[1])) problems.push(`the hand-made floor's barrels: ${JSON.stringify(br.slice(0, 2).map((o) => ({ d2: o.d2, exploding: o.exploding, used: o.used })))}`);
    const sh = of('shrine');
    if (sh.length !== 1 || !sh[0].shrine) problems.push(`the hand-made floor's shrine: ${JSON.stringify(sh.map((o) => o.shrine))}`);
    const cs = of('casket');
    if (cs.length !== 2 || cs[0].d2 !== 5 || cs[0].hole || cs[0].used || cs[1].d2 !== 28 || !cs[1].hole || !cs[1].used || !spent(cs[1]) || spent(cs[0])) problems.push(`the hand-made floor's caskets: ${JSON.stringify(cs.map((o) => ({ d2: o.d2, hole: o.hole, used: o.used })))}`);
    const rm = of('remains');
    if (rm.length !== 1 || rm[0].d2 !== 54 || !rm[0].flies || !rm[0].name) problems.push(`the hand-made floor's remains: ${JSON.stringify(rm.map((o) => ({ d2: o.d2, flies: o.flies, name: o.name })))}`);
    const wl = of('well');
    if (wl.length !== 1 || wl[0].d2 !== 130 || !wl[0].name || spent(wl[0])) problems.push(`the hand-made floor's well: ${JSON.stringify(wl.map((o) => ({ d2: o.d2, name: o.name })))}`);
    if (lv.layout.cliffs?.size !== 3 || lv.layout.cairn?.stones.length !== 2 || lv.layout.presets?.length !== 1 || lv.layout.presetMonsters?.length !== 1) problems.push('the hand-made floor lost a field it was made with');
    // the preset's monster put down where it says (spawn.ts presetMonster), the one with the quest, her party round her without it
    const pm = lv.monsters.filter((m) => m.def.id === 'bloodraven');
    const quested = lv.monsters.filter((m) => m.quest);
    if (pm.length !== 1 || pm[0].quest !== 'a1q2' || quested.length !== 1 || Math.hypot(pm[0].pos.x - s.x - 5, pm[0].pos.z - s.z - 5) > 1e-9 || pm[0].rank !== 'boss') problems.push(`the hand-made floor's preset monster: ${JSON.stringify(pm.map((m) => ({ quest: m.quest, rank: m.rank, x: m.pos.x - s.x, z: m.pos.z - s.z })))}, ${quested.length} with a quest`);
    const kashya = of('vendor').filter((o) => o.serves?.includes('hire'));
    if (kashya.length !== 1 || kashya[0].npcId !== 'kashya' || kashya[0].name !== D2X_MONSTERS.kashya.name || kashya[0].serves.join() !== 'hire') problems.push(`the hand-made floor's Kashya: ${JSON.stringify(kashya.map((o) => ({ name: o.name, npcId: o.npcId, serves: o.serves })))}`);
    // her place in the camp, among its services, where its rogue stood (that rogue gone from its people: M2a's M line)
    const { campPreset } = await load('/src/world/presets.ts');
    const { generateTown } = await load('/src/world/levelgen.ts');
    const cp = campPreset();
    const rogue = (generateTown(0).npcs ?? []).find((n) => n.model === 'rogue');
    const listed = cp.services.filter((s) => s.kind === 'hire');
    if (cp.hire.kind !== 'hire' || cp.hire.npcId !== 'kashya' || cp.hire.npc !== D2X_MONSTERS.kashya.name || cp.hire.pos.x !== rogue.x || cp.hire.pos.z !== rogue.z || listed.length !== 1 || listed[0] !== cp.hire) problems.push(`Kashya's place in the camp: ${JSON.stringify(cp.hire)}, services ${cp.services.map((s) => s.kind)}`);
    if (cp.npcs.some((n) => n.x === rogue.x && n.z === rogue.z)) problems.push(`the camp's rogue still stands where Kashya does: ${JSON.stringify(cp.npcs)}`);
    console.log(`  a floor with every new Layout field: ${ch.length} chests, ${br.length} barrels, a shrine, ${cs.length} caskets, ${rm.length} corpse, ${wl.length} well, Kashya serving her hirelings; an old floor's ${plain.objects.length} objects say nothing new; Kashya among the camp's services where its rogue stood`);
  }
  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
};
