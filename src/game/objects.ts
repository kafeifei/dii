import type { P2 } from '../core/math';
import type { ProjectileKind } from '../data/monsters';
import type { Item } from '../items/item';
import type { Actor, DamagePacket, Faction } from './actor';
import type { FxKind } from './fx';

let objIds = 0;

export class GroundItem {
  readonly id = ++objIds;
  pos: P2;
  item: Item | null;
  gold: number;
  /** seconds since dropped (for the drop arc animation) */
  age = 0;
  from: P2;
  constructor(pos: P2, item: Item | null, gold = 0, from?: P2) {
    this.pos = { ...pos };
    this.item = item;
    this.gold = gold;
    this.from = from ? { ...from } : { ...pos };
  }
}

export type ObjKind = 'chest' | 'barrel' | 'stairs' | 'waypoint' | 'vendor' | 'stash' | 'portal';

export class WorldObject {
  readonly id = ++objIds;
  kind: ObjKind;
  pos: P2;
  used = false;
  name: string;
  radius: number;
  usedTime = 0;
  /** portal destination depth */
  dest = 0;
  constructor(kind: ObjKind, pos: P2, name: string, radius = 0.5) {
    this.kind = kind;
    this.pos = { ...pos };
    this.name = name;
    this.radius = radius;
  }
}

export type ProjKind = ProjectileKind | 'holybolt' | 'chargedbolt';

export class Projectile {
  readonly id = ++objIds;
  pos: P2;
  /** position before the current sim step; the renderer draws between the two */
  prevPos: P2;
  vel: P2;
  owner: Actor | null;
  faction: Faction;
  kind: ProjKind;
  dmg: DamagePacket;
  life: number;
  radius: number;
  pierce: boolean;
  hit = new Set<number>();
  dead = false;
  age = 0;
  /** for wobbling charged bolts */
  wobble = 0;
  /** explodes for AoE on impact */
  splash = 0;
  splashKind: 'fire' | 'cold' = 'fire';
  constructor(kind: ProjKind, pos: P2, vel: P2, owner: Actor | null, faction: Faction, dmg: DamagePacket, life = 2, radius = 0.25, pierce = false) {
    this.kind = kind;
    this.pos = { ...pos };
    this.prevPos = { ...pos };
    this.vel = { ...vel };
    this.owner = owner;
    this.faction = faction;
    this.dmg = dmg;
    this.life = life;
    this.radius = radius;
    this.pierce = pierce;
  }
}

export class Hammer {
  readonly id = ++objIds;
  center: P2;
  angle0: number;
  t = 0;
  dur = 2.0;
  dmg: DamagePacket;
  pos: P2;
  lastHit = new Map<number, number>();
  dead = false;
  constructor(center: P2, angle0: number, dmg: DamagePacket) {
    this.center = { ...center };
    this.angle0 = angle0;
    this.dmg = dmg;
    this.pos = { ...center };
  }
  radiusAt(t: number) {
    return 0.5 + t * 1.55;
  }
  angleAt(t: number) {
    return this.angle0 + t * 4.2;
  }
  update(dt: number) {
    this.t += dt;
    const r = this.radiusAt(this.t);
    const a = this.angleAt(this.t);
    this.pos = { x: this.center.x + Math.sin(a) * r, z: this.center.z + Math.cos(a) * r };
    if (this.t >= this.dur) this.dead = true;
  }
}

/** short-lived damage zone (death explosions, lightning strikes...) */
export class DelayedBlast {
  readonly id = ++objIds;
  constructor(
    public pos: P2,
    public radius: number,
    public delay: number,
    public dmg: DamagePacket,
    public faction: Faction,
    public kind: 'fire' | 'frost' | 'lightning' | 'holy',
    public source: Actor | null,
  ) {}
  done = false;
  /** effect shown when it goes off (spells laid out ahead of time: fire wall, blizzard, meteor) */
  fx: FxKind | null = null;
}
