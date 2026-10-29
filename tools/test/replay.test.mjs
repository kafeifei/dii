// A scripted run of the normal game (src/game/game.ts), with Math.random swapped for a seeded
// generator (so the world seed, every map and every roll are fixed), compared at checkpoints with
// digests recorded here: the guard of M2a's step 0 (docs/M2A-STEP0.md 1.4). A new paladin in the camp
// walks out into Blood Moor, fights and kills, picks up, opens a chest, drinks, goes through a town
// portal and back, dies, comes back in the camp, takes the body back, uses Cold Plains' waypoint, goes
// down into the Den of Evil and up again, and changes difficulty. Each checkpoint digests the hero
// (where, life, mana, experience, gold, its items by uid), the monsters of the maps this game keeps
// (alive or dead, where), what lies on their ground, the quest records and the save it writes there.
//
// Moving code about (G1–G7) and the interfaces of step 0 must leave every digest as it is; only the
// length unit (step 0's ⑤) changes them on purpose, and that commit records them anew. A failure says
// which checkpoint and which part moved, and prints the whole table to paste in when the change is
// meant. Item uids carry the clock and a counter shared by every test of a run, so they are numbered
// by first sight, and the save's write time is left out. Math.random is given back however it ends.
import { createHash } from 'node:crypto';

const DT = 1 / 60;
const SEED = 0x5eed2a;

/**
 * the digests of each checkpoint, part by part (sha-256 of the part's JSON, first 16 hex digits), recorded 2026-10-29 at M2a step 0 ②;
 * den.monsters recorded again the same day as the D line rebuilt the Den from D2's maze, with its level's seed (every other part as it was)
 */
const RECORDED = {
  camp: { hero: '28a2901209dbab6f', monsters: '24ca960f975b3c74', ground: 'bb5bb1b3a77487ee', quests: '82e81eff8fdb5188', save: '6d3a476ce8832805' },
  fight: { hero: '9d3d5a02f2d5f52d', monsters: 'e13c147125362c81', ground: 'f6d08cdda7aa4ec0', quests: '82e81eff8fdb5188', save: 'd2a9c11627e7cbe9' },
  portal: { hero: '762e6f20ba09f967', monsters: '4459859c1343844d', ground: 'f6d08cdda7aa4ec0', quests: '82e81eff8fdb5188', save: 'cec21529e01728b8' },
  body: { hero: 'e9e0c94c4afaed28', monsters: '1c60d56619c97986', ground: 'f6d08cdda7aa4ec0', quests: '82e81eff8fdb5188', save: 'aa43ae3a3748a4ab' },
  waypoint: { hero: '0a49de5487ad267d', monsters: 'a23e6eb417ad35eb', ground: 'f6d08cdda7aa4ec0', quests: '82e81eff8fdb5188', save: 'bb77ce134b5f7f28' },
  den: { hero: 'f9fe373dff8d26d4', monsters: 'ebccc22970271c94', ground: '232bc5e7520fbf5e', quests: 'a7ce0e07f8306b66', save: '236f70197bd3611e' },
  nightmare: { hero: 'a3b4cc10c86272f0', monsters: '35498b168a6dbbf1', ground: 'bb5bb1b3a77487ee', quests: 'a7ce0e07f8306b66', save: '22e8a44fe960e5df' },
};

/** mulberry32: a small seeded generator in [0, 1), standing in for Math.random */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
/** a coordinate or amount, to a millionth */
const r6 = (v) => Math.round(v * 1e6) / 1e6;

export default async (load) => {
  const { CAMP_AREA, WILD_AREA, COLD_PLAINS, DEN_OF_EVIL } = await load('/src/world/areas.ts');
  const { Game } = await load('/src/game/game.ts');
  const { Sfx } = await load('/src/audio/sfx.ts');
  const save = await load('/src/game/save.ts');
  const { debugOpts } = await load('/src/game/debug.ts');

  const realRandom = Math.random;
  const debugWas = { xp: debugOpts.xp, loot: debugOpts.loot, god: debugOpts.god };
  Math.random = seeded(SEED);
  Object.assign(debugOpts, { xp: 1, loot: 1, god: false });
  const got = {};
  try {
    localStorage.clear();
    sessionStorage.clear();
    save.setSlot(0);
    const input = { pressed: new Set(), keys: new Set(), touchPressed: new Set(), touchHeld: new Set(), stick: null, lmb: false, rmb: false, lmbPressed: false, rmbPressed: false, overUI: true, mx: 0, my: 0 };
    const game = new Game(input, new Sfx());
    game.picker = { screenToGround: () => null, pickMonster: () => null, pickObject: () => null };
    let cursor = null;
    game.hooks = {
      message() {},
      openPanel() {},
      levelChanged() {},
      areaChanged() {},
      teleported() {},
      playerDied() {},
      inventoryChanged() {},
      getCursorItem: () => cursor,
      setCursorItem: (it) => (cursor = it),
      hoveredGroundId: () => null,
      levelUp() {},
    };
    const step = (n) => {
      for (let i = 0; i < n; i++) game.update(DT);
    };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const nearest = (list, from) => list.reduce((best, x) => (!best || dist(x.pos, from) < dist(best.pos, from) ? x : best), null);
    /** beside `pos`, on open ground */
    const beside = (pos, off = 1.2) => game.level.map.nearestWalkable(pos.x + off, pos.z) ?? pos;

    // ── the digests ──
    /** item uids numbered by first sight: the same item is the same number at every checkpoint */
    const uids = new Map();
    const uidOf = (u) => {
      if (!uids.has(u)) uids.set(u, uids.size);
      return uids.get(u);
    };
    const item = (it) => (it ? `${uidOf(it.uid)}:${it.baseId}:${it.rarity}:${it.ilvl}` : null);
    const placed = (g) => g.items.map((pl) => [pl.x, pl.y, item(pl.item)]);
    let saveKey = null;
    const digest = () => {
      const p = game.player;
      const hero = {
        cls: p.cls,
        level: p.level,
        xp: p.xp,
        pos: [r6(p.pos.x), r6(p.pos.z)],
        life: r6(p.life),
        mana: r6(p.mana),
        gold: p.gold,
        stashGold: p.stashGold,
        dead: p.dead,
        area: game.area?.id,
        difficulty: p.difficulty,
        waypoints: p.waypoints,
        worldSeed: game.worldSeed,
        equipment: Object.keys(p.equipment)
          .sort()
          .map((k) => [k, item(p.equipment[k])]),
        inventory: placed(p.inventory),
        belt: p.belt.map((c) => c.map(item)),
        stash: placed(p.stash),
        cube: placed(p.cube),
        unplaced: p.unplaced.map(item),
        corpses: p.corpses.map((c) => [c.area, c.pos && [r6(c.pos.x), r6(c.pos.z)]]),
      };
      // the maps this game keeps: the overworld (the camp, Blood Moor, Cold Plains) and the Den
      const maps = [game.mapOf(CAMP_AREA), game.mapOf(DEN_OF_EVIL)];
      const monsters = maps.map((L) => L && L.monsters.map((m) => [m.def.id, m.rank, m.dead ? 1 : 0, r6(m.pos.x), r6(m.pos.z)]));
      const ground = maps.map((L) => L && L.ground.map((g) => [r6(g.pos.x), r6(g.pos.z), g.gold, item(g.item)]));
      const quests = p.quests;
      game.save();
      // slot 0's: dii-save-v1, or dii-save-dev once a test before this one in the run went to ?dev's slots
      saveKey ??= [...Array(localStorage.length)].map((_, i) => localStorage.key(i)).find((k) => /^dii-save-(v1|dev)$/.test(k));
      const text = saveKey ? localStorage.getItem(saveKey) : null;
      const written = text && JSON.parse(text, (k, v) => (typeof v === 'string' && (k === 'uid' || k === 'cursor') ? uidOf(v) : v));
      if (written) delete written.time;
      return { hero: hash(hero), monsters: hash(monsters), ground: hash(ground), quests: hash(quests), save: hash(written) };
    };
    const checkpoint = (name) => (got[name] = digest());

    // ── a new hero in the camp ──
    game.newGame('回放', 'paladin');
    const west = game.level;
    const ow = west.layout;
    const p = game.player;
    step(30);
    checkpoint('camp');

    // ── out into Blood Moor: a fight, kills, finds picked up, a chest ──
    const gate = ow.seams.find((s) => s.a === CAMP_AREA);
    const out = { x: gate.tb.x - gate.ta.x, z: gate.tb.z - gate.ta.z };
    let moor = null;
    for (let k = 6; k < 40 && !moor; k++) {
      const c = { x: gate.tb.x + out.x * k, z: gate.tb.z + out.z * k };
      if (ow.map.circleClear(c.x, c.z, 0.6) && west.areaAt(c.x, c.z).id === WILD_AREA) moor = c;
    }
    if (!moor) throw new Error('no open ground past the camp gate');
    game.teleportWithin(moor);
    step(60);
    const inMoor = () => west.monsters.filter((m) => !m.dead && m.rank === 'normal' && west.areaAt(m.pos.x, m.pos.z).id === WILD_AREA);
    const foe = nearest(inMoor(), p.pos);
    game.teleportWithin(beside(foe.pos, 2.5));
    for (let t = 0; t < 30 * 60 && !foe.dead && !p.dead; t++) {
      game.useSkillAt('attack', foe, foe.pos, t === 0);
      game.update(DT);
    }
    if (p.dead || !foe.dead) throw new Error(`the scripted fight went wrong: the hero ${p.dead ? 'died' : 'lives'}, the ${foe.def.id} ${foe.dead ? 'died' : 'lives'}`);
    // kills by the tools' hand until a few things besides gold lie about: one is picked up, the rest stay
    const finds = () => west.ground.filter((g) => g.item && dist(g.pos, p.pos) < 40);
    for (let k = 0; k < 60 && (k < 8 || finds().length < 3); k++) game.killMonster(nearest(inMoor(), p.pos), 'phys');
    step(40);
    const find = nearest(finds(), p.pos);
    if (!find) throw new Error('nothing dropped to pick up');
    game.teleportWithin(find.pos);
    game.pickupGround(find);
    const pile = nearest(west.ground.filter((g) => g.gold > 0), p.pos);
    if (pile) game.teleportWithin(pile.pos);
    step(40);
    const chest = nearest(west.objects.filter((o) => o.kind === 'chest' && !o.used && !west.inTown(o.pos)), p.pos);
    game.teleportWithin(beside(chest.pos));
    game.interact(chest);
    step(45);
    const fromChest = nearest(west.ground.filter((g) => g.item && dist(g.pos, chest.pos) < 4), chest.pos);
    if (fromChest) game.pickupGround(fromChest);
    step(30);
    checkpoint('fight');

    // ── hurt, a potion from the belt; a town portal to the camp and back ──
    // low enough that the whole of a minor healing potion (Misc.txt hp1: over 7.68 s) counts, no cap reached
    p.life = Math.floor(p.d.maxLife / 6);
    game.useBelt(0);
    step(8 * 60);
    if (p.dead) throw new Error('the hero died drinking');
    game.castTownPortal();
    for (let t = 0; t < 180 && !west.objects.some((o) => o.kind === 'portal'); t++) game.update(DT);
    const far = west.objects.find((o) => o.kind === 'portal' && !west.inTown(o.pos));
    if (!far) throw new Error('no town portal opened');
    game.interact(far);
    step(30);
    game.interact(west.objects.find((o) => o.kind === 'portal' && west.inTown(o.pos)));
    step(30);
    checkpoint('portal');

    // ── a death, up again in the camp, the body taken back ──
    game.killPlayer();
    step(90);
    game.respawn();
    step(30);
    const body = west.objects.find((o) => o.kind === 'corpse' && !west.inTown(o.pos));
    if (!body) throw new Error('no body where the hero fell');
    game.teleportWithin(beside(body.pos, 0.6));
    game.interact(body);
    step(60);
    checkpoint('body');

    // ── Cold Plains' waypoint used, to the camp by it and back ──
    game.travel(COLD_PLAINS);
    const wp = west.objects.find((o) => o.kind === 'waypoint' && west.areaAt(o.pos.x, o.pos.z).id === COLD_PLAINS);
    game.interact(wp);
    step(30);
    game.travel(CAMP_AREA);
    step(30);
    game.travel(COLD_PLAINS);
    step(60);
    checkpoint('waypoint');

    // ── down into the Den of Evil and up again ──
    const mouth = west.objects.find((o) => o.kind === 'stairs' && o.dest === DEN_OF_EVIL);
    game.teleportWithin({ x: mouth.pos.x + mouth.inward.x * 2, z: mouth.pos.z + mouth.inward.z * 2 });
    game.interact(mouth);
    const den = game.level;
    step(120);
    game.interact(den.objects.find((o) => o.kind === 'stairs' && o.dest === WILD_AREA));
    step(30);
    checkpoint('den');

    // ── nightmare: another game in the same world ──
    game.setDifficulty(1);
    step(60);
    checkpoint('nightmare');
  } finally {
    Math.random = realRandom;
    Object.assign(debugOpts, debugWas);
  }

  const moved = [];
  for (const [name, parts] of Object.entries(got)) {
    for (const [part, d] of Object.entries(parts)) if (RECORDED[name]?.[part] !== d) moved.push(`${name}.${part}`);
  }
  if (moved.length || Object.keys(RECORDED).length !== Object.keys(got).length) {
    const table = Object.entries(got)
      .map(([name, parts]) => `  ${name}: { ${Object.entries(parts).map(([k, v]) => `${k}: '${v}'`).join(', ')} },`)
      .join('\n');
    throw new Error(`the replay moved at ${moved.join(', ') || 'its checkpoints'}; this run's digests:\nconst RECORDED = {\n${table}\n};`);
  }
  console.log(`  ${Object.keys(got).length} checkpoints (${Object.keys(got).join(', ')}), 5 digests each, as recorded`);
};
