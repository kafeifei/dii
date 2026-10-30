// How near the hero stands to use a thing, as D2 tests a player's click (src/game/reach.ts; D2MOO
// PlrMsg.cpp:446-640, Units.cpp:3604-3797): an object within two subtiles of its box, the corners
// cut, the far side a subtile further, worked out cell by cell against D2's code; a townsperson within
// 6 of D2's unit distance, the hero's body within 8, the stairs and cave mouths (warp tiles) within 4.
// The hero walks up to each kind until it is in reach and uses it there, never from further: so an
// exploding barrel's 3-subtile blast reaches the hero who breaks it coming at it straight, and from
// some of the slants D2's box lets the hero stop at 3 and 2 subtiles off, outside it, as in D2. Every way on, waypoint, shrine,
// chest and the rest on the maps the game makes can be stood in reach of from where the hero starts.
const SUB = 0.25;

export default async (load) => {
  await load('three');
  const R = await load('/src/game/reach.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Level } = await load('/src/game/level.ts');
  const { WorldObject } = await load('/src/game/objects.ts');
  const C = await load('/src/game/containers.ts');
  const { updatePlayer } = await load('/src/game/playerctl.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const { generateDungeon, WILD_MAPS } = await load('/src/world/levelgen.ts');
  const { dungeonArea, CAMP_AREA, DEN_OF_EVIL, CAVE_1, CAVE_2, CRYPT, MAUSOLEUM } = await load('/src/world/areas.ts');
  const { D2X_MONSTERS } = await load('/src/data/d2x/monsters.ts');
  const problems = [];
  const facts = [];
  const check = (ok, what) => ok || problems.push(what);
  /** the middle of subtile (x, y) */
  const at = (x, y) => ({ x: (x + 0.5) * SUB, z: (y + 0.5) * SUB });

  // ── the object test, cell by cell, against D2MOO's own (Units.cpp:3604-3684) ──
  {
    /** UNITS_IsObjectInInteractRange as D2MOO writes it, for a player (size 2 × 2) at (x1, y1) and an object of (sx, sy) at (x2, y2) */
    const d2 = (x1, y1, x2, y2, sx, sy) => {
      if (R.d2UnitDistance(at(x1, y1), 2, at(x2, y2), sx) === 0) return true;
      const nX = x2 - Math.trunc(sx / 2);
      const nY = y2 - Math.trunc(sy / 2);
      if (sx >= 1 && sy >= 1) {
        if (x1 >= nX - 2 && x1 <= sx + nX + 2 && y1 >= nY - 2 && y1 <= sy + nY + 2) {
          if (y1 >= nY - 1) {
            if (y1 <= sy + nY + 1) return true;
            if (x1 >= nX - 1) return !(x1 > sx + nX + 1);
          } else if (x1 >= nX - 1 && x1 <= sx + nX + 1) return true;
        }
        return false;
      }
      return !(x1 < nX - 1 || x1 > nX + 1 || y1 < nY - 1 || y1 > nY + 1);
    };
    const counts = [];
    for (const size of [
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
      [3, 3],
      [3, 2],
      [4, 4],
      [5, 3],
      [5, 5],
      [0, 0],
    ]) {
      let n = 0;
      for (let y = 80; y <= 120; y++)
        for (let x = 80; x <= 120; x++) {
          const ours = R.inObjectRange(at(x, y), at(100, 100), size);
          if (ours !== d2(x, y, 100, 100, size[0], size[1])) problems.push(`size ${size}: (${x - 100}, ${y - 100}) ours ${ours}`);
          if (ours) n++;
        }
      counts.push(`${size.join('×')} ${n}`);
    }
    // a barrel (1 × 1): two off its near sides, three off its far ones, the corners cut
    const barrel = [1, 1];
    const inB = (dx, dy) => R.inObjectRange(at(100 + dx, 100 + dy), at(100, 100), barrel);
    check(inB(-2, 0) && inB(3, 0) && inB(0, -2) && inB(0, 3) && !inB(-3, 0) && !inB(4, 0) && !inB(-2, -2) && !inB(3, 3) && inB(-1, -2) && inB(2, 3), 'a barrel\'s reach');
    facts.push(`objects in reach from subtiles: ${counts.join(', ')}`);
  }

  // ── a townsperson, the hero's body, a warp tile: D2's unit distance (Units.cpp:3700-3797) ──
  {
    const npc = D2X_MONSTERS.kashya.size[0];
    const d = (dx, dy, sb) => R.d2UnitDistance(at(100 + dx, 100 + dy), 2, at(100, 100), sb);
    check(d(6, 0, npc) <= R.NPC_REACH && d(7, 0, npc) > R.NPC_REACH && d(4, 4, npc) <= R.NPC_REACH && d(5, 5, npc) > R.NPC_REACH, `a townsperson: ${d(6, 0, npc)}, ${d(7, 0, npc)}, ${d(4, 4, npc)}, ${d(5, 5, npc)}`);
    check(d(7, 0, 2) <= R.BODY_REACH && d(8, 0, 2) > R.BODY_REACH, `the hero's body: ${d(7, 0, 2)}, ${d(8, 0, 2)}`);
    check(d(4, 0, 0) <= R.TILE_REACH && d(5, 0, 0) > R.TILE_REACH && d(3, 2, 0) <= R.TILE_REACH, `a warp tile: ${d(4, 0, 0)}, ${d(5, 0, 0)}, ${d(3, 2, 0)}`);
    check(d(0, 0, 2) === 0 && d(9, 0, 2) === 14, `the far branch: ${d(9, 0, 2)}`);
  }

  // ── walked up to and used there, each kind, from eight ways round ──
  localStorage.clear();
  save.setSlot(0);
  const game = new Game({}, new Sfx());
  game.hooks = { message() {}, openPanel() {}, levelChanged() {}, areaChanged() {}, teleported() {}, playerDied() {}, inventoryChanged() {}, getCursorItem: () => null, setCursorItem() {}, hoveredGroundId: () => null, levelUp() {} };
  game.newGame('够得着', 'paladin');
  const p = game.player;
  p.cubeFound = true;
  const lay = generateDungeon(2, 21, dungeonArea(2));
  lay.areaOf = new Uint16Array(lay.map.w * lay.map.h).fill(dungeonArea(2));
  lay.chests = [];
  lay.barrels = [];
  const lv = new Level(WILD_MAPS + 2, 21, lay, 0);
  lv.monsters = [];
  game.level = lv;
  game.sfx.play = () => {};
  // an open spot with room round it
  const map = lay.map;
  let mid = null;
  for (let z = 4; z < map.h - 4 && !mid; z++)
    for (let x = 4; x < map.w - 4 && !mid; x++) {
      let open = true;
      for (let dz = -4; dz <= 4 && open; dz++) for (let dx = -4; dx <= 4 && open; dx++) open = map.walkable(x + dx, z + dz);
      if (open) mid = { x: x + 0.5, z: z + 0.5 };
    }
  check(!!mid, 'no open ground to walk on');
  const kinds = [
    ['chest', { d2: 5 }],
    ['chest', { d2: 139 }],
    ['barrel', { d2: 7 }],
    ['shrine', { d2: 2, shrine: 12 }],
    ['casket', { d2: 3 }],
    ['remains', { d2: 54 }],
    ['well', { d2: 138 }],
    ['waypoint', {}],
    ['stash', {}],
  ];
  let walks = 0;
  const ends = new Map();
  const blast = { straight: 0, slant: 0, slantIn: 0 };
  for (const [kind, extra] of kinds) {
    for (let k = 0; k < 8 && mid; k++) {
      const a = (k / 8) * Math.PI * 2;
      const o = new WorldObject(kind, mid, C.objectName(kind, extra) ?? kind, 0.5);
      Object.assign(o, extra);
      lv.objects = [o];
      p.pos = { x: mid.x + Math.sin(a) * 3, z: mid.z + Math.cos(a) * 3 };
      p.intent = { kind: 'interact', obj: o };
      p.setState('idle');
      let usedAt = null;
      let prev = null;
      const real = game.interact.bind(game);
      game.interact = (obj) => {
        usedAt = { ...p.pos };
        if (obj.kind !== 'waypoint' && obj.kind !== 'stash') real(obj);
      };
      for (let i = 0; i < 25 * 6 && !usedAt; i++) {
        prev = { ...p.pos };
        updatePlayer(game, p, 1 / 25);
      }
      game.interact = real;
      walks++;
      if (!check(usedAt, `${kind} ${JSON.stringify(extra)} from way ${k}: never used`)) continue;
      // (the floor is a dungeon's: its waypoint D2's small inside one)
      check(R.inReach(usedAt, o, true), `${kind} from way ${k}: used out of reach at ${usedAt.x.toFixed(2)},${usedAt.z.toFixed(2)}`);
      // where it stood a step before was out of reach: it was used as it came in, not from further
      check(!R.inReach(prev, o, true), `${kind} from way ${k}: in reach a step further out, at ${prev.x.toFixed(2)},${prev.z.toFixed(2)}`);
      const d = Math.hypot(usedAt.x - mid.x, usedAt.z - mid.z);
      const e = ends.get(kind) ?? { min: Infinity, max: 0 };
      ends.set(kind, { min: Math.min(e.min, d), max: Math.max(e.max, d) });
      if (kind === 'barrel') {
        const inBlast = C.d2InRange(o.pos, usedAt, C.BLAST_RANGE);
        if (k % 2 === 0) {
          blast.straight++;
          check(inBlast, `a barrel broken coming straight from way ${k}: the hero ${d.toFixed(2)} m off, out of its blast`);
        } else {
          blast.slant++;
          if (inBlast) blast.slantIn++;
        }
      }
    }
  }
  facts.push(`${walks} walks up to things: used from ${[...ends].map(([k, e]) => `${k} ${e.min.toFixed(2)}–${e.max.toFixed(2)} m`).join(', ')}`);
  facts.push(`a barrel broken in its blast coming straight ${blast.straight} of ${blast.straight}, on a slant ${blast.slantIn} of ${blast.slant}`);
  // an exploding barrel broken as a player does: the hero in its blast
  {
    const o = new WorldObject('barrel', mid, C.objectName('barrel', { d2: 11 }) ?? '', 0.35);
    o.d2 = 11;
    o.exploding = true;
    lv.objects = [o];
    p.pos = { x: mid.x + 2.5, z: mid.z };
    p.intent = { kind: 'interact', obj: o };
    p.life = p.stats.maxLife;
    for (let i = 0; i < 25 * 6 && !o.used; i++) updatePlayer(game, p, 1 / 25);
    check(o.used && C.d2InRange(o.pos, p.pos, C.BLAST_RANGE), `an exploding barrel broken from ${Math.hypot(p.pos.x - mid.x, p.pos.z - mid.z).toFixed(2)} m: out of its blast`);
    facts.push(`an exploding barrel broken from ${Math.hypot(p.pos.x - mid.x, p.pos.z - mid.z).toFixed(2)} m, within its 3 subtiles${p.life < p.stats.maxLife ? ', the hero hurt' : ''}`);
  }

  // ── every thing on the game's maps can be stood in reach of from the start ──
  {
    const reachFrom = (m, s) => {
      const seen = new Uint8Array(m.w * m.h);
      const q = [Math.floor(s.z) * m.w + Math.floor(s.x)];
      seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) {
        const c = q[h];
        const x = c % m.w;
        const z = (c / m.w) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = (z + dz) * m.w + x + dx;
          if (m.walkable(x + dx, z + dz) && !seen[n]) {
            seen[n] = 1;
            q.push(n);
          }
        }
      }
      return seen;
    };
    const standable = (L, seen, o) => {
      const m = L.map;
      const indoors = L.areaAt(o.pos.x, o.pos.z).kind === 'dungeon';
      for (let y = Math.floor((o.pos.z - 3) / SUB); y <= Math.floor((o.pos.z + 3) / SUB); y++)
        for (let x = Math.floor((o.pos.x - 3) / SUB); x <= Math.floor((o.pos.x + 3) / SUB); x++) {
          const q = at(x, y);
          if (!m.inBounds(Math.floor(q.x), Math.floor(q.z)) || !seen[Math.floor(q.z) * m.w + Math.floor(q.x)]) continue;
          if (m.circleClear(q.x, q.z, p.radius * 0.7) && R.inReach(q, o, indoors)) return true;
        }
      return false;
    };
    let n = 0;
    const kindsSeen = new Set();
    for (const world of [1, 77, 4242]) {
      game.newWorld(world);
      for (const id of [CAMP_AREA, DEN_OF_EVIL, CAVE_1, CAVE_2, CRYPT, MAUSOLEUM]) {
        const L = game.maps.levelFor(id);
        const seen = reachFrom(L.map, L.layout.start);
        for (const o of L.objects) {
          if (o.kind === 'exit' || o.closed) continue;
          n++;
          kindsSeen.add(o.kind);
          check(standable(L, seen, o), `world ${world} area ${id}: ${o.kind} ${o.name} at ${o.pos.x.toFixed(1)},${o.pos.z.toFixed(1)} has no ground in reach the hero can walk to`);
        }
      }
    }
    // and the old maps (the separate camp, the old wilderness, the trial ground's floors)
    let old = 0;
    for (let depth = 0; depth <= WILD_MAPS + 5; depth++) {
      for (const seed of [3, 9]) {
        const L = new Level(depth, seed);
        const seen = reachFrom(L.map, L.layout.start);
        for (const o of L.objects) {
          if (o.kind === 'exit' || o.closed) continue;
          old++;
          check(standable(L, seen, o), `old map ${depth} seed ${seed}: ${o.kind} ${o.name} at ${o.pos.x.toFixed(1)},${o.pos.z.toFixed(1)} has no ground in reach the hero can walk to`);
        }
      }
    }
    facts.push(`${n} things on 3 worlds' maps (${[...kindsSeen].join(', ')}) and ${old} on the old maps each with ground in reach`);
  }

  if (problems.length) throw new Error(`${problems.length} problem(s):\n  ${problems.slice(0, 30).join('\n  ')}`);
  console.log(`  ${facts.join('; ')}`);
};
