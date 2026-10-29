import { RNG, type P2 } from '../core/math';
import { lookedMonsters } from '../data/monsters';
import type { Difficulty } from '../items/d2/types';
import { areaDef, areaForDepth, areaLevel, isBuilt, type AreaDef } from '../world/areas';
import { bfsDistances, dungeonFloor, generateDungeon, generateGallery, generateTown, isWild, themeForFloor, type Layout } from '../world/levelgen';
import type { TileMap } from '../world/tilemap';
import { generateWild } from '../world/wild';

/** dev showroom instead of the camp (see generateGallery) */
export const GALLERY = typeof location !== 'undefined' && location.search.includes('gallery');
import { Monster } from './monster';
import { MonsterGrid } from './monstergrid';
import { areaBoxes, presetMonster, spawnArea, type SpawnReport } from './spawn';
import { ITEM_BASES, UNKNOWN_BASE } from '../data/items';
import { createItem } from '../items/gen';
import { DelayedBlast, GroundItem, Hammer, Projectile, WorldObject } from './objects';
import { SHRINES } from '../data/shrines';
import { objectName } from './containers';

/** the box an area's tiles fill on a level's map: first and last column (x) and row (z), inclusive */
export interface AreaBox {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export class Level {
  layout: Layout;
  depth: number;
  monsters: Monster[] = [];
  projectiles: Projectile[] = [];
  hammers: Hammer[] = [];
  blasts: DelayedBlast[] = [];
  ground: GroundItem[] = [];
  objects: WorldObject[] = [];
  /** set when the renderer must rebuild static geometry */
  version = 0;
  /** the difficulty its monsters are of (Diablo II's columns for them) */
  readonly difficulty: Difficulty;
  /** what each of its areas was filled with (spawnArea), by area id */
  readonly spawned = new Map<number, SpawnReport>();
  /** the seconds the hero has spent on this map (Game.update): what its far corpses age by, none while the hero is on another */
  time = 0;
  boss: Monster | null = null;
  /** the last monsters to die on it, newest last: what the Fallen see die (D2's rooms keep their last four, D2Dungeon.cpp:1253-1260) */
  deaths: Monster[] = [];
  /** its aura-enchanted uniques (MonUMod 30), whose party auras the monsters round them fight with */
  auras: Monster[] = [];
  /**
   * the dungeon floor this level is as hard as, for its monsters and loot: its own floor in the
   * dungeon, the first floor's in the wilderness, 0 in the camp
   */
  floor: number;
  /** the area each tile is in (AreaDef ids, row by row): the layout's areaOf, or the depth's one area all over */
  readonly areas: Uint16Array;
  /**
   * the map as monsters walk it: on a map with a town and more, the town's tiles are shut to them
   * (D2Common Path.cpp PATH_IsTargetDestinationAllowed: a monster that may not be in town gets no
   * path into a DUNGEON_IsRoomInTown room); otherwise the map itself
   */
  readonly monsterMap: TileMap;
  /** the monsters by where they stand (monstersNear) */
  private readonly grid: MonsterGrid<Monster>;

  /**
   * `depth`: the old map to make (levelgen.ts: the separate camp, the old wilderness, a floor of the
   * trial ground). `layout`: a map made already to host instead, the West overworld
   * (src/world/overworld.ts) or the Den of Evil (den.ts), as hard as the first floor, as wild.ts's is.
   * `difficulty`: the one its monsters spawn in
   */
  constructor(depth: number, seed: number, layout?: Layout, difficulty: Difficulty = 0) {
    this.depth = depth;
    this.difficulty = difficulty;
    const wild = isWild(depth);
    const area = areaForDepth(depth).id;
    this.floor = layout ? 1 : depth === 0 ? 0 : wild ? 1 : dungeonFloor(depth);
    this.layout = layout ?? (depth === 0 ? (GALLERY ? generateGallery(area) : generateTown(area)) : wild ? generateWild(seed) : generateDungeon(this.floor, seed, area));
    const L = this.layout;
    this.areas = L.areaOf ?? new Uint16Array(L.map.w * L.map.h).fill(area);
    this.monsterMap = this.shutTowns();
    this.grid = new MonsterGrid(L.map.w, L.map.h);
    if (L.stairs) {
      const o = new WorldObject('stairs', L.stairs, wild ? `通往${themeForFloor(1).name}` : `下行至第 ${this.floor + 1} 层`, 0.9);
      o.dest = areaForDepth(depth + 1).id;
      this.objects.push(o);
    }
    const shrineRng = new RNG(seed ^ 0x51ed);
    for (const s of L.shrines ?? []) {
      // one of any kind, as the wilderness's are; a maze's kind (ShrineSpot.kind) is the O line's to honour
      const def = shrineRng.pick(SHRINES);
      const o = new WorldObject('shrine', { x: s.x, z: s.z }, def.name, 0.6);
      o.shrine = def.id;
      this.objects.push(o);
    }
    for (const e of L.exits ?? []) {
      const o = new WorldObject('exit', { x: e.x, z: e.z }, e.name, 1.3);
      o.dest = areaForDepth(e.dest).id;
      o.inward = { x: e.nx, z: e.nz };
      this.objects.push(o);
    }
    // a cave mouth and the way back up are used; a road on is walked into, and closed while there's
    // no map of where it goes
    for (const e of L.entrances ?? []) {
      const road = e.kind === 'road';
      const closed = !isBuilt(e.dest);
      // named as the old maps' were: an exit by where it goes (前往…), stairs by the way (进入 通往…)
      const name = road ? `${e.name}${closed ? '（未开通）' : ''}` : `通往${e.name}`;
      const o = new WorldObject(road ? 'exit' : 'stairs', { x: e.x, z: e.z }, name, road ? 1.3 : 0.9);
      o.dest = e.dest;
      o.inward = { x: e.nx, z: e.nz };
      if (closed) o.closed = true;
      this.objects.push(o);
    }
    for (const w of L.waypoints) this.objects.push(new WorldObject('waypoint', w.pos, '传送点', 0.8));
    // the town's people and the stash are used where they stand; a campfire is only to look at. Kashya
    // ('hire') is a townsperson as the merchant is, her menu offering her hirelings (WorldObject.serves)
    for (const s of L.services) {
      if (s.kind === 'vendor' || s.kind === 'hire') {
        const o = new WorldObject('vendor', s.pos, s.kind === 'hire' ? (s.npc ?? '') : s.npc ? `商人 · ${s.npc}` : '商人', 0.5);
        o.npc = s.npc;
        o.npcId = s.npcId;
        if (s.kind === 'hire') o.serves = ['hire'];
        this.objects.push(o);
      } else if (s.kind === 'stash') {
        this.objects.push(new WorldObject('stash', s.pos, '储物箱', 0.8));
      }
    }
    // chests and barrels with what a maze's object groups say of them (objgroups.ts): the old
    // generators' plain spots are plain chests and barrels, as ever
    for (const c of L.chests) {
      // what each is called when hovered: the rename tables' (containers.ts objectName, rule 5)
      const o = new WorldObject('chest', { x: c.x, z: c.z }, objectName('chest', c) ?? '', 0.45);
      if (c.d2 !== undefined) o.d2 = c.d2;
      if (c.locked) o.locked = true;
      if (c.trap) o.trap = c.trap;
      if (c.sparkly) o.sparkly = c.sparkly;
      this.objects.push(o);
    }
    for (const b of L.barrels) {
      const o = new WorldObject('barrel', { x: b.x, z: b.z }, objectName('barrel', b) ?? '', 0.35);
      if (b.d2 !== undefined) o.d2 = b.d2;
      if (b.exploding) o.exploding = true;
      // one that came broken already (PreOperate, Objects.cpp:418-423) is spent from the start
      if (b.opened) o.used = true;
      this.objects.push(o);
    }
    // a maze's caskets and the graves among them, rogue corpses and wells (what using them does: interact.ts USE, containers.ts)
    for (const c of L.caskets ?? []) {
      const o = new WorldObject('casket', c.pos, objectName('casket', { d2: c.id, hole: c.hole }) ?? '', 0.5);
      o.d2 = c.id;
      if (c.hole) o.hole = true;
      if (c.opened) o.used = true;
      this.objects.push(o);
    }
    for (const c of L.remains ?? []) {
      const o = new WorldObject('remains', c.pos, objectName('remains', { d2: c.id }) ?? '', 0.5);
      o.d2 = c.id;
      if (c.flies) o.flies = true;
      this.objects.push(o);
    }
    for (const w of L.wells ?? []) {
      const o = new WorldObject('well', w.pos, objectName('well', { d2: w.id }) ?? '', 0.7);
      o.d2 = w.id;
      this.objects.push(o);
    }
    this.populate(seed);
    // the monsters its presets set down besides (spawn.ts presetMonster: the Burial Grounds' Blood Raven)
    for (const pm of L.presetMonsters ?? []) presetMonster(this, pm);
    if (GALLERY && !layout && this.inTown(L.start)) {
      // a monster of every look in a row, held still (the stun never wears off)
      const looks = lookedMonsters();
      looks.filter((d, i) => looks.findIndex((o) => o.key === d.key) === i).forEach((def, i) => {
        const m = new Monster(def, def.row.diff[0].level, 'normal', { x: 6 + (i % 9) * 5, z: 51 + Math.floor(i / 9) * 3.4 });
        m.stunTime = 1e9;
        this.monsters.push(m);
      });
      // and one of every item base lying on the floor
      Object.keys(ITEM_BASES).filter((id) => id !== UNKNOWN_BASE).forEach((id, i) => {
        this.ground.push(new GroundItem({ x: 5.5 + (i % 40) * 1.3, z: 36 + Math.floor(i / 40) * 1.6 }, createItem(id)));
      });
    }
  }

  get map() {
    return this.layout.map;
  }

  /** the area at a point; off the map, the nearest tile's */
  areaAt(x: number, z: number): AreaDef {
    const m = this.layout.map;
    const tx = Math.min(m.w - 1, Math.max(0, Math.floor(x)));
    const tz = Math.min(m.h - 1, Math.max(0, Math.floor(z)));
    return areaDef(this.areas[tz * m.w + tx])!;
  }

  /** the area level at a point in normal (areaLevel; a chest's goes by the difficulty played) */
  alvlAt(p: P2): number {
    return areaLevel(this.areaAt(p.x, p.z));
  }

  /** whether a point is in a town: no monsters there, the merchant restocks on the way in, no town portal out */
  inTown(p: P2): boolean {
    return this.areaAt(p.x, p.z).kind === 'town';
  }

  /**
   * Where to go from `from` to get into area `id`, for the tools that travel by area (the bot, the
   * bench's walk): the nearest walkable tile of it on this map, or else the exit or the stairs that
   * lead there (`obj`, walked through or used). Null when nothing open here leads there.
   */
  wayTo(id: number, from: P2): { pos: P2; obj?: WorldObject } | null {
    if (this.areaAt(from.x, from.z).id === id) return { pos: { ...from } };
    const m = this.layout.map;
    let best: P2 | null = null;
    let bestD = Infinity;
    for (let z = 0; z < m.h; z++) {
      for (let x = 0; x < m.w; x++) {
        if (this.areas[z * m.w + x] !== id || !m.walkable(x, z)) continue;
        const d = (x + 0.5 - from.x) ** 2 + (z + 0.5 - from.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: x + 0.5, z: z + 0.5 };
        }
      }
    }
    if (best) return { pos: best };
    const obj = this.objects.find((o) => (o.kind === 'exit' || o.kind === 'stairs') && o.dest === id && !o.closed);
    return obj ? { pos: { ...obj.pos }, obj } : null;
  }

  /**
   * The monsters within `r` of `p` (the dead too), for the loops that only look near the hero: the
   * AI, pushing apart, aiming and the views (MonsterGrid). Added to `out` when given
   */
  monstersNear(p: P2, r: number, out?: Monster[]): Monster[] {
    this.grid.sync(this.monsters);
    return this.grid.near(p, r, out);
  }

  /** the monsters whose bodies come within `r` of `p` (centres within r + their radius), as monstersNear */
  monstersTouching(p: P2, r: number, out?: Monster[]): Monster[] {
    this.grid.sync(this.monsters);
    return this.grid.touching(p, r, out);
  }

  /** after a sim step: the monsters it stepped, which may have moved, put where they stand now */
  monstersMoved(list: readonly Monster[]) {
    this.grid.sync(this.monsters);
    for (const m of list) this.grid.moved(m);
  }

  /** every area of the map gets its monsters once, as the map is made (src/game/spawn.ts says which); towns get none */
  private populate(seed: number) {
    const L = this.layout;
    const own = areaForDepth(this.depth).id;
    // where the hero can walk: one walk from the start across every area, made only if one gets monsters
    let reach: Int32Array | undefined;
    for (const [id, box] of areaBoxes(this)) {
      const area = areaDef(id)!;
      if (area.kind === 'town') continue;
      reach ??= bfsDistances(L.map, L.start);
      // an rng of its own, so what one area spawns never shifts another's; the map's own area keeps
      // the level's, as when every map was one area
      const rng = new RNG(seed ^ 0x9e3779b9 ^ (id === own ? 0 : Math.imul(id, 0x85ebca6b)));
      this.spawned.set(id, spawnArea(this, area, rng, { floor: this.floor, box, reach, from: L.start }));
    }
  }

  /** monsters keep out of a town that shares its map (monsterMap): its tiles, if the map has others */
  private shutTowns(): TileMap {
    const town = new Uint8Array(this.areas.length);
    let towns = 0;
    for (let i = 0; i < town.length; i++) if (areaDef(this.areas[i])!.kind === 'town') (town[i] = 1), towns++;
    return towns > 0 && towns < town.length ? this.map.without(town) : this.map;
  }

  /** coming back to a floor: survivors heal and go home, stray missiles are gone */
  reenter() {
    this.projectiles = [];
    this.hammers = [];
    this.blasts = [];
    for (const m of this.monsters) {
      if (m.dead) continue;
      m.life = m.maxLife;
      // back to where they were spawned, so nothing camps the waypoint; drawn there, not sliding
      // from where they were (only the monsters a step runs have prevPos kept)
      m.pos = { ...m.homePos };
      m.prevPos = { ...m.homePos };
      m.chillTime = 0;
      m.poisonTime = 0;
      m.awake = false;
      m.path = null;
      m.move = null;
      m.act = null;
      m.cmd = m.aiFlag = 0;
      m.taunted = false;
      m.setState('idle');
    }
    this.deaths.length = 0;
    // all of them home again: bucketed anew
    this.grid.sync(this.monsters, true);
  }
}
