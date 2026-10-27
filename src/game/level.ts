import { RNG, type P2 } from '../core/math';
import { ALL_MODS, MONSTERS, UNIQUE_FIRST, UNIQUE_SECOND, bossForDepth, type MonsterDef, type MonsterMod } from '../data/monsters';
import { areaDef, areaForDepth, type AreaDef } from '../world/areas';
import { bfsDistances, dungeonFloor, generateDungeon, generateGallery, generateTown, isWild, themeForFloor, type Layout, type Room } from '../world/levelgen';
import { generateWild } from '../world/wild';

/** dev showroom instead of the camp (see generateGallery) */
const GALLERY = typeof location !== 'undefined' && location.search.includes('gallery');
import { Monster, type MonsterRank } from './monster';
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
    if (!this.inTown(L.start)) this.populate(seed);
    else if (GALLERY) {
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

  /** the area level at a point: its monsters' and its loot's (normal, until there are difficulties) */
  alvlAt(p: P2): number {
    return this.areaAt(p.x, p.z).alvl[0];
  }

  /** whether a point is in a town: no monsters there, the merchant restocks on the way in, no town portal out */
  inTown(p: P2): boolean {
    return this.areaAt(p.x, p.z).kind === 'town';
  }

  private populate(seed: number) {
    const rng = new RNG(seed ^ 0x9e3779b9);
    const L = this.layout;
    const reach = bfsDistances(L.map, L.start);
    const reachable = (p: P2) => {
      const i = Math.floor(p.z) * L.map.w + Math.floor(p.x);
      return L.map.walkableAt(p.x, p.z) && reach[i] >= 0;
    };
    const f = this.floor;
    const mlvl = this.alvlAt(L.start);
    const pool = Object.values(MONSTERS).filter((m) => m.weight > 0 && f >= m.minDepth && f <= m.maxDepth);
    const pickDef = (): MonsterDef => {
      let total = 0;
      for (const m of pool) total += m.weight;
      let r = rng.next() * total;
      for (const m of pool) {
        r -= m.weight;
        if (r <= 0) return m;
      }
      return pool[0];
    };
    const randomIn = (room: Room): P2 | null => {
      for (let k = 0; k < 20; k++) {
        const p = { x: rng.range(room.x + 0.6, room.x + room.w - 0.6), z: rng.range(room.y + 0.6, room.y + room.h - 0.6) };
        if (reachable(p)) return p;
      }
      return null;
    };
    const near = (c: P2, r: number): P2 => {
      for (let k = 0; k < 12; k++) {
        const p = { x: c.x + rng.range(-r, r), z: c.z + rng.range(-r, r) };
        if (reachable(p) && L.map.circleClear(p.x, p.z, 0.3)) return p;
      }
      return { ...c };
    };

    const rooms = L.spawnRooms.filter((r) => r !== L.bossRoom);
    // early floors are gentler: one unique pack and no champions on floor 1
    const uniqueCount = f <= 1 ? 1 : 1 + (rng.chance(0.5) ? 1 : 0);
    const championCount = f <= 1 ? 0 : f <= 3 ? rng.int(1, 2) : rng.int(1, 3);
    const order = rooms.map((_, i) => i);
    // shuffle deterministic
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((ri, idx) => {
      const room = rooms[ri];
      const packs = room.w * room.h > 90 ? 2 : 1;
      for (let p = 0; p < packs; p++) {
        const c = randomIn(room);
        if (!c) continue;
        const def = pickDef();
        const kind: MonsterRank = idx < uniqueCount && p === 0 ? 'unique' : idx < uniqueCount + championCount && p === 0 ? 'champion' : 'normal';
        this.spawnPack(def, kind, c, mlvl, rng, near);
      }
    });
    // extra wanderers in corridors
    const extra = 4 + f;
    for (let k = 0; k < extra; k++) {
      const x = rng.int(1, L.map.w - 2) + 0.5;
      const z = rng.int(1, L.map.h - 2) + 0.5;
      const p = { x, z };
      if (!reachable(p) || Math.hypot(x - L.start.x, z - L.start.z) < 12) continue;
      const def = pickDef();
      this.spawnPack(def, 'normal', p, mlvl, rng, near, 2);
    }
    // the wilderness's monster camps: an elite pack by each fire
    for (const c of L.elites ?? []) {
      const melee = pool.filter((d) => d.ai === 'melee');
      this.spawnPack(rng.pick(melee.length ? melee : pool), 'champion', near(c, 1), mlvl, rng, near);
    }
    // boss
    if (L.bossRoom) {
      const def = bossForDepth(f);
      const c = { x: L.bossRoom.x + L.bossRoom.w / 2, z: L.bossRoom.y + L.bossRoom.h / 2 + 1.5 };
      const boss = new Monster(def, mlvl + 3, 'boss', near(c, 0.5));
      this.boss = boss;
      this.monsters.push(boss);
      // retinue: melee bodyguards (a ranged escort stacked on a caster boss is a wall of missiles)
      const guards = pool.filter((d) => d.ai === 'melee');
      const ret = guards.length ? rng.pick(guards) : MONSTERS.skeleton;
      for (let i = 0; i < 3; i++) this.monsters.push(new Monster(ret, mlvl, 'normal', near(c, 3)));
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

  spawnPack(def: MonsterDef, rank: MonsterRank, c: P2, mlvl: number, rng: RNG, near: (c: P2, r: number) => P2, maxCount?: number) {
    let count = rng.int(def.pack[0], def.pack[1]);
    if (maxCount) count = Math.min(count, maxCount);
    if (rank === 'champion') {
      const mods: MonsterMod[] = rng.chance(0.5) ? [rng.pick(ALL_MODS)] : [];
      const n = rng.int(2, 4);
      for (let i = 0; i < n; i++) {
        const m = new Monster(def, mlvl + 2, 'champion', near(c, 1.8), mods);
        m.displayName = `${def.name}（精英）`;
        this.monsters.push(m);
      }
      return;
    }
    if (rank === 'unique') {
      const mods: MonsterMod[] = [];
      const nm = rng.int(1, Math.min(3, 1 + Math.floor(this.floor / 4)));
      while (mods.length < nm) {
        const m = rng.pick(ALL_MODS);
        if (!mods.includes(m)) mods.push(m);
      }
      const boss = new Monster(def, mlvl + 2, 'unique', c, mods);
      boss.displayName = rng.pick(UNIQUE_FIRST) + rng.pick(UNIQUE_SECOND);
      this.monsters.push(boss);
      const minions = rng.int(3, 5);
      const minionMods = mods.filter((m) => m === 'fireench' || m === 'coldench' || m === 'lightench');
      for (let i = 0; i < minions; i++) {
        const mm = new Monster(def, mlvl + 1, 'minion', near(c, 2), minionMods);
        mm.leader = boss;
        this.monsters.push(mm);
      }
      return;
    }
    for (let i = 0; i < count; i++) this.monsters.push(new Monster(def, mlvl, 'normal', near(c, 1.6)));
    if (def.escort) {
      const n = rng.int(def.escort.count[0], def.escort.count[1]);
      const ed = MONSTERS[def.escort.id];
      if (ed && this.floor >= ed.minDepth) for (let i = 0; i < n; i++) this.monsters.push(new Monster(ed, mlvl, 'normal', near(c, 2.2)));
    }
  }
}
