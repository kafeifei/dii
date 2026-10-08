import type { P2 } from '../core/math';
import { MOD_NAMES, type MonsterDef, type MonsterMod } from '../data/monsters';
import { Actor, type Resists } from './actor';

export type MonsterRank = 'normal' | 'champion' | 'unique' | 'minion' | 'boss';

export class Monster extends Actor {
  faction = 'monster' as const;
  def: MonsterDef;
  rank: MonsterRank;
  mods: MonsterMod[];
  displayName: string;
  dmg: [number, number];
  defense: number;
  ar: number;
  speed: number;
  attackSpeed: number;
  xp: number;
  res: Resists;
  awake = false;
  target: Actor | null = null;
  attackCd = 0;
  fleeTime = 0;
  thinkTimer = Math.random() * 0.3;
  /** shaman resurrect cooldown */
  specialCd = 2 + Math.random() * 3;
  homePos: P2;
  /** debuffs from player auras (reapplied each tick) */
  convictRes = 0;
  convictDef = 0;
  corpseRaisable = true;
  /** the pack leader (for minions) */
  leader: Monster | null = null;
  strafeDir = Math.random() < 0.5 ? 1 : -1;
  lastHitBy = 0;
  hasLos = false;
  losTimer = Math.random() * 0.25;
  chargeTime = 0;

  constructor(def: MonsterDef, mlvl: number, rank: MonsterRank, pos: P2, mods: MonsterMod[] = []) {
    super(pos);
    this.def = def;
    this.rank = rank;
    this.mods = mods;
    this.level = mlvl;
    this.homePos = { ...pos };
    this.radius = def.radius * (rank === 'champion' || rank === 'unique' ? 1.12 : 1);
    const l = mlvl - 1;
    let life = def.life * (1 + l * 0.34);
    let dmgMul = 1 + l * 0.13;
    this.defense = Math.floor(def.def + mlvl * 6);
    this.ar = Math.floor(def.ar + mlvl * 9);
    this.speed = def.speed;
    this.attackSpeed = def.attackSpeed;
    let xp = def.xp * (1 + l * 0.27);
    this.res = {
      fire: def.res?.fire ?? 0,
      cold: def.res?.cold ?? 0,
      light: def.res?.light ?? 0,
      poison: def.res?.poison ?? 0,
      phys: def.res?.phys ?? 0,
    };
    switch (rank) {
      case 'champion':
        life *= 3;
        dmgMul *= 1.5;
        this.ar *= 1.5;
        this.speed *= 1.15;
        xp *= 3;
        break;
      case 'unique':
        life *= 4;
        dmgMul *= 1.7;
        this.ar *= 1.8;
        xp *= 5;
        break;
      case 'minion':
        life *= 1.6;
        dmgMul *= 1.2;
        xp *= 1.5;
        break;
      case 'boss':
        life *= 9 + l * 0.15;
        dmgMul *= 1.6;
        xp *= 1;
        break;
    }
    for (const m of mods) {
      switch (m) {
        case 'strong':
          dmgMul *= 1.8;
          break;
        case 'fast':
          this.speed *= 1.4;
          this.attackSpeed *= 1.35;
          break;
        case 'magicres':
          this.res.fire += 40;
          this.res.cold += 40;
          this.res.light += 40;
          break;
        case 'stoneskin':
          this.defense *= 3;
          this.res.phys += 40;
          break;
        default:
          break;
      }
    }
    this.maxLife = Math.max(1, Math.floor(life));
    this.life = this.maxLife;
    this.dmg = [Math.max(1, Math.floor(def.dmg[0] * dmgMul)), Math.max(2, Math.floor(def.dmg[1] * dmgMul))];
    this.xp = Math.floor(xp);
    this.displayName = def.name;
  }

  resists(): Resists {
    const c = this.convictRes;
    return {
      fire: this.res.fire - c,
      cold: this.res.cold - c,
      light: this.res.light - c,
      poison: this.res.poison - c,
      phys: this.res.phys,
    };
  }

  effectiveDefense(): number {
    return Math.floor(this.defense * (1 - this.convictDef / 100));
  }

  modText(): string {
    return this.mods.map((m) => MOD_NAMES[m]).join('，');
  }

  /** quality tier used by loot tables */
  lootQuality(): number {
    switch (this.rank) {
      case 'champion':
        return 1;
      case 'unique':
        return 2;
      case 'boss':
        return 3;
      default:
        return 0;
    }
  }
}
