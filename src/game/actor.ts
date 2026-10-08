import type { P2 } from '../core/math';
import type { Elem } from '../data/monsters';

export type Faction = 'player' | 'monster';
export type ActorState = 'idle' | 'move' | 'attack' | 'cast' | 'hit' | 'dead' | 'block' | 'charge';

export interface Resists {
  fire: number;
  cold: number;
  light: number;
  poison: number;
  phys: number;
}

export interface DamagePacket {
  phys: number;
  fire: number;
  cold: number;
  light: number;
  magic: number;
  poison: number; // total over 3s
  crit?: boolean;
  knockback?: number;
  chill?: number; // seconds
  source?: Actor | null;
  /** ignores hit-chance / block */
  spell?: boolean;
  lifeSteal?: number;
  manaSteal?: number;
  pierceRes?: number;
  /** whether to stagger */
  heavy?: boolean;
}

export function emptyPacket(): DamagePacket {
  return { phys: 0, fire: 0, cold: 0, light: 0, magic: 0, poison: 0 };
}

export function packetTotal(p: DamagePacket): number {
  return p.phys + p.fire + p.cold + p.light + p.magic + p.poison;
}

let actorIds = 0;

export abstract class Actor {
  readonly id = ++actorIds;
  pos: P2;
  facing = 0;
  radius = 0.4;
  abstract faction: Faction;
  life = 1;
  maxLife = 1;
  state: ActorState = 'idle';
  stateTime = 0;
  /** total duration of the current timed state */
  stateDur = 0;
  /** for attacks: has the hit frame triggered */
  actionFired = false;
  path: P2[] | null = null;
  pathTarget: P2 | null = null;
  pathAge = 0;
  // status effects
  chillTime = 0;
  chillAmount = 0.5;
  poisonTime = 0;
  poisonDps = 0;
  stunTime = 0;
  knockVel: P2 = { x: 0, z: 0 };
  /** visual: seconds since last hit (for flash) */
  hitFlash = 0;
  dead = false;
  deathTime = 0;
  level = 1;
  // the element of the killing blow, used for death effects
  killedBy: Elem = 'phys';

  constructor(pos: P2) {
    this.pos = { ...pos };
  }

  get alive() {
    return !this.dead;
  }

  setState(s: ActorState, dur = 0) {
    this.state = s;
    this.stateTime = 0;
    this.stateDur = dur;
    this.actionFired = false;
  }

  /** movement multiplier from chill etc. */
  slowFactor(): number {
    return this.chillTime > 0 ? 1 - this.chillAmount : 1;
  }

  abstract resists(): Resists;
}
