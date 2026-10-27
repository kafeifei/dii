import { RNG, type P2 } from '../core/math';
import { MONSTERS } from '../data/monsters';
import { areaDef, areaForDepth, areaLevel, type AreaDef } from '../world/areas';
import { bfsDistances, dungeonFloor, generateDungeon, generateGallery, generateTown, isWild, themeForFloor, type Layout } from '../world/levelgen';
import { generateWild } from '../world/wild';

/** dev showroom instead of the camp (see generateGallery) */
const GALLERY = typeof location !== 'undefined' && location.search.includes('gallery');
import { Monster } from './monster';
import { areaBoxes, spawnArea } from './spawn';
import { ITEM_BASES } from '../data/items';
import { createItem } from '../items/gen';
import { DelayedBlast, GroundItem, Hammer, Projectile, WorldObject } from './objects';
import { SHRINES } from '../data/shrines';

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
  boss: Monster | null = null;
  /**
   * the dungeon floor this level is as hard as, for its monsters and loot: its own floor in the
   * dungeon, the first floor's in the wilderness, 0 in the camp
   */
  floor: number;
  /** the area each tile is in (AreaDef ids, row by row); today a map is one area, all of it */
  readonly areas: Uint16Array;

  constructor(depth: number, seed: number) {
    this.depth = depth;
    const wild = isWild(depth);
    const area = areaForDepth(depth).id;
    this.floor = depth === 0 ? 0 : wild ? 1 : dungeonFloor(depth);
    this.layout = depth === 0 ? (GALLERY ? generateGallery(area) : generateTown(area)) : wild ? generateWild(seed) : generateDungeon(this.floor, seed, area);
    const L = this.layout;
    this.areas = new Uint16Array(L.map.w * L.map.h).fill(area);
    if (L.stairs) this.objects.push(new WorldObject('stairs', L.stairs, wild ? `通往${themeForFloor(1).name}` : `下行至第 ${this.floor + 1} 层`, 0.9));
    const shrineRng = new RNG(seed ^ 0x51ed);
    for (const s of L.shrines ?? []) {
      const def = shrineRng.pick(SHRINES);
      const o = new WorldObject('shrine', s, def.name, 0.6);
      o.shrine = def.id;
      this.objects.push(o);
    }
    for (const e of L.exits ?? []) {
      const o = new WorldObject('exit', { x: e.x, z: e.z }, e.name, 1.3);
      o.dest = e.dest;
      o.inward = { x: e.nx, z: e.nz };
      this.objects.push(o);
    }
    for (const w of L.waypoints) this.objects.push(new WorldObject('waypoint', w.pos, '传送点', 0.8));
    // the town's people and the stash are used where they stand; a campfire is only to look at
    for (const s of L.services) {
      if (s.kind === 'vendor') {
        const o = new WorldObject('vendor', s.pos, s.npc ? `商人 · ${s.npc}` : '商人', 0.5);
        o.npc = s.npc;
        this.objects.push(o);
      } else if (s.kind === 'stash') {
        this.objects.push(new WorldObject('stash', s.pos, '储物箱', 0.8));
      }
    }
    for (const c of L.chests) this.objects.push(new WorldObject('chest', c, '宝箱', 0.45));
    for (const b of L.barrels) this.objects.push(new WorldObject('barrel', b, '木桶', 0.35));
    this.populate(seed);
    if (GALLERY && this.inTown(L.start)) {
      // every monster in a row, held still (the stun never wears off)
      Object.values(MONSTERS).forEach((def, i) => {
        const m = new Monster(def, 1, 'normal', { x: 6 + (i % 9) * 5, z: 51 + Math.floor(i / 9) * 3.4 });
        m.stunTime = 1e9;
        this.monsters.push(m);
      });
      // and one of every item base lying on the floor
      Object.keys(ITEM_BASES).forEach((id, i) => {
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

  /** the area level at a point: its monsters' and its loot's (areaLevel) */
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
   * lead there (`obj`, walked through or used). Null when nothing here leads there.
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
    // stairs lead one depth down (Game.interact)
    const obj = this.objects.find((o) => (o.kind === 'exit' && areaForDepth(o.dest).id === id) || (o.kind === 'stairs' && areaForDepth(this.depth + 1).id === id));
    return obj ? { pos: { ...obj.pos }, obj } : null;
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
      spawnArea(this, area, rng, { floor: this.floor, box, reach, from: L.start });
    }
  }

  /** coming back to a floor: survivors heal and go home, stray missiles are gone */
  reenter() {
    this.projectiles = [];
    this.hammers = [];
    this.blasts = [];
    for (const m of this.monsters) {
      if (m.dead) continue;
      m.life = m.maxLife;
      // back to where they were spawned, so nothing camps the waypoint
      m.pos = { ...m.homePos };
      m.chillTime = 0;
      m.poisonTime = 0;
      m.awake = false;
      m.path = null;
      m.setState('idle');
    }
  }
}
