import type { P2 } from '../core/math';
import type { Elem } from '../data/monsters';
import type { Merc } from './merc';

export type Faction = 'player' | 'monster';
export type ActorState = 'idle' | 'move' | 'attack' | 'cast' | 'hit' | 'dead' | 'block' | 'charge';

/**
 * Who killed a monster (Game.killMonster, src/game/kills.ts): the hero, the hireling, or nobody (a
 * death no friendly dealt, as Blood Raven's raised dead falling with her): what the kill gives, and to whom
 */
export type Killer = 'hero' | Merc | null;

export interface Resists {
  fire: number;
  cold: number;
  light: number;
  poison: number;
  phys: number;
  /** a monster's magic resistance (D2's MagicResist) */
  magic?: number;
}

export interface DamagePacket {
  phys: number;
  fire: number;
  cold: number;
  light: number;
  magic: number;
  poison: number; // total over poisonLen seconds (3 if unset)
  poisonLen?: number;
  crit?: boolean;
  knockback?: number;
  chill?: number; // seconds
  source?: Actor | null;
  /** ignores hit-chance / block */
  spell?: boolean;
  lifeSteal?: number;
  manaSteal?: number;
  pierceRes?: number;
  /** "-X% to enemy fire/cold/lightning/poison resistance" */
  pierce?: Partial<Record<'fire' | 'cold' | 'light' | 'poison', number>>;
  /** whether to stagger */
  heavy?: boolean;
  // ── Diablo II weapon properties, carried by the player's strikes ──
  /** crushing blow and open wounds chances, % */
  cb?: number;
  ow?: number;
  /** extra % physical damage against undead and demons */
  vsUndead?: number;
  vsDemon?: number;
  /** freeze length bonus, slow %, blind, chance to make it flee %, stop it healing */
  freeze?: number;
  slow?: number;
  blind?: boolean;
  flee?: number;
  noHeal?: boolean;
  /** monster defense taken away per hit */
  defDown?: number;
  /** the attacker's level, for open wounds */
  alvl?: number;
  // ── a monster's blows ──
  /** the attack's own to-hit, its mode's (a monster's differs by attack mode) */
  ar?: number;
  /** mana burned off the hero (mana burn) */
  mana?: number;
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
  /** position before the current sim step; the renderer draws between the two */
  prevPos: P2;
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
  /** open wounds */
  bleedTime = 0;
  bleedDps = 0;
  /** whose poison and open wounds these are: who killed it, if they do (combat.ts applyDamage, strikeEffects) */
  poisonBy: Killer = 'hero';
  bleedBy: Killer = 'hero';
  /** "slows target by X%" */
  slowTime = 0;
  slowAmount = 0;
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
    this.prevPos = { ...pos };
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
    const chill = this.chillTime > 0 ? 1 - this.chillAmount : 1;
    const slow = this.slowTime > 0 ? 1 - this.slowAmount : 1;
    return Math.min(chill, slow);
  }

  abstract resists(): Resists;
}
