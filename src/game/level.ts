import { RNG, type P2 } from '../core/math';
import { ALL_MODS, MONSTERS, UNIQUE_FIRST, UNIQUE_SECOND, bossForDepth, monsterLevel, type MonsterDef, type MonsterMod } from '../data/monsters';
import { bfsDistances, generateDungeon, generateGallery, generateTown, type Layout, type Room } from '../world/levelgen';

/** dev showroom instead of the camp (see generateGallery) */
const GALLERY = typeof location !== 'undefined' && location.search.includes('gallery');
import { Monster, type MonsterRank } from './monster';
import { ITEM_BASES } from '../data/items';
import { createItem } from '../items/gen';
import { DelayedBlast, GroundItem, Hammer, Projectile, WorldObject } from './objects';

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
  name: string;
  boss: Monster | null = null;

  constructor(depth: number, seed: number) {
    this.depth = depth;
    this.layout = depth === 0 ? (GALLERY ? generateGallery() : generateTown()) : generateDungeon(depth, seed);
    this.name = depth === 0 ? this.layout.theme.name : `${this.layout.theme.name} · 第 ${depth} 层`;
    const L = this.layout;
    if (L.stairs) this.objects.push(new WorldObject('stairs', L.stairs, depth === 0 ? '通往墓穴' : `下行至第 ${depth + 1} 层`, 0.9));
    if (L.waypoint) this.objects.push(new WorldObject('waypoint', L.waypoint, '传送点', 0.8));
    if (L.vendor) this.objects.push(new WorldObject('vendor', L.vendor, '商人 · 艾莉娜', 0.5));
    if (L.stash) this.objects.push(new WorldObject('stash', L.stash, '储物箱', 0.8));
    for (const c of L.chests) this.objects.push(new WorldObject('chest', c, '宝箱', 0.45));
    for (const b of L.barrels) this.objects.push(new WorldObject('barrel', b, '木桶', 0.35));
    if (depth > 0) this.populate(seed);
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

  private populate(seed: number) {
    const rng = new RNG(seed ^ 0x9e3779b9);
    const L = this.layout;
    const reach = bfsDistances(L.map, L.start);
    const reachable = (p: P2) => {
      const i = Math.floor(p.z) * L.map.w + Math.floor(p.x);
      return L.map.walkableAt(p.x, p.z) && reach[i] >= 0;
    };
    const mlvl = monsterLevel(this.depth);
    const pool = Object.values(MONSTERS).filter((m) => m.weight > 0 && this.depth >= m.minDepth && this.depth <= m.maxDepth);
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
    const uniqueCount = this.depth <= 1 ? 1 : 1 + (rng.chance(0.5) ? 1 : 0);
    const championCount = this.depth <= 1 ? 0 : this.depth <= 3 ? rng.int(1, 2) : rng.int(1, 3);
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
    const extra = 4 + this.depth;
    for (let k = 0; k < extra; k++) {
      const x = rng.int(1, L.map.w - 2) + 0.5;
      const z = rng.int(1, L.map.h - 2) + 0.5;
      const p = { x, z };
      if (!reachable(p) || Math.hypot(x - L.start.x, z - L.start.z) < 12) continue;
      const def = pickDef();
      this.spawnPack(def, 'normal', p, mlvl, rng, near, 2);
    }
    // boss
    if (L.bossRoom) {
      const def = bossForDepth(this.depth);
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
      const nm = rng.int(1, Math.min(3, 1 + Math.floor(this.depth / 4)));
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
      if (ed && this.depth >= ed.minDepth) for (let i = 0; i < n; i++) this.monsters.push(new Monster(ed, mlvl, 'normal', near(c, 2.2)));
    }
  }
}
