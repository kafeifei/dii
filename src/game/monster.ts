import type { P2 } from '../core/math';
import { D2_MON_XP } from '../data/d2/progression';
import { MOD_NAMES, type MonsterDef, type MonsterMod } from '../data/monsters';
import { Actor, type Resists } from './actor';

/**
 * Diablo II's experience for a monster level (MonLvl.txt), scaled by the monster's own share (its
 * xp × 7.5 is about D2's Exp%: a zombie gives 90, D2's 111). This game has no difficulties, so
 * the columns blend where D2's overlap: normal to 36, nightmare from 43, hell from 72.
 */
function monsterXp(mlvl: number): number {
  const [n, nm, h] = D2_MON_XP[Math.max(1, Math.min(D2_MON_XP.length, mlvl)) - 1];
  const mix = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  if (mlvl < 43) return mix(n, nm, (mlvl - 36) / 7);
  return mix(nm, h, (mlvl - 67) / 5);
}

export type MonsterRank = 'normal' | 'champion' | 'unique' | 'minion' | 'boss';

export class Monster extends Actor {
  faction = 'monster' as const;
  def: MonsterDef;
  rank: MonsterRank;
  mods: MonsterMod[];
  displayName: string;
  /** the superunique it is (D2X_SUPERUNIQUES key), which drops its own class; minions aren't */
  superUnique?: string;
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
  /** defense knocked off by "-X to monster defense per hit" */
  defLoss = 0;
  /** blinded: loses track of the player beyond arm's reach */
  blindTime = 0;
  /** "prevent monster heal" */
  noHealTime = 0;
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
    // growth flattens past level 16 (floor 9+), where gear upgrades start to come slower
    const hi = Math.max(0, l - 15);
    let life = def.life * (1 + (l - hi) * 0.34 + hi * 0.24);
    let dmgMul = 1 + (l - hi) * 0.13 + hi * 0.09;
    this.defense = Math.floor(def.def + mlvl * 6);
    this.ar = Math.floor(def.ar + mlvl * 7);
    this.speed = def.speed;
    this.attackSpeed = def.attackSpeed;
    let xp = monsterXp(mlvl) * def.xp * 7.5 / 100;
    this.res = {
      fire: def.res?.fire ?? 0,
      cold: def.res?.cold ?? 0,
      light: def.res?.light ?? 0,
      poison: def.res?.poison ?? 0,
      phys: def.res?.phys ?? 0,
    };
    switch (rank) {
      case 'champion':
        life *= 2.5;
        dmgMul *= 1.35;
        this.ar *= 1.4;
        this.speed *= 1.15;
        xp *= 3;
        break;
      case 'unique':
        life *= 3;
        dmgMul *= 1.4;
        this.ar *= 1.6;
        xp *= 5;
        break;
      case 'minion':
        life *= 1.3;
        dmgMul *= 1.1;
        xp *= 1.5;
        break;
      case 'boss':
        // bosses come back every four floors: keep their bulk from snowballing
        life *= 2.2 + l * 0.03;
        this.attackSpeed *= 0.8;
        xp *= 1;
        break;
    }
    for (const m of mods) {
      switch (m) {
        case 'strong':
          dmgMul *= 1.5;
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
    return Math.max(0, Math.floor(this.defense * (1 - this.convictDef / 100)) - this.defLoss);
  }

  modText(): string {
    return this.mods.map((m) => MOD_NAMES[m]).join('，');
  }
}
