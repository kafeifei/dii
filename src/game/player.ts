import { clamp, type P2 } from '../core/math';
import { EQUIP_SLOTS, ITEM_BASES, type EquipSlot } from '../data/items';
import { SET_ITEMS } from '../data/legendary';
import { SKILL_BY_ID, SKILLS, type SkillDef } from '../data/skills';
import { addStat, type StatBag, type StatKey } from '../data/stats';
import { Grid } from '../items/grid';
import { baseOf, globalItemStats, itemDefense, weaponDamage, type Item } from '../items/item';
import { Actor, type Resists } from './actor';
import type { Monster } from './monster';

export const MAX_LEVEL = 60;

/** cumulative xp needed to reach level L */
export function xpForLevel(L: number): number {
  if (L <= 1) return 0;
  return Math.floor(60 * Math.pow(L - 1, 2.4) + 100 * (L - 1));
}

export interface Derived {
  str: number;
  dex: number;
  vit: number;
  ene: number;
  maxLife: number;
  maxMana: number;
  wMin: number;
  wMax: number;
  dmgPct: number;
  ar: number;
  def: number;
  block: number;
  res: Resists;
  ias: number;
  frw: number;
  fcr: number;
  fhr: number;
  lifeSteal: number;
  manaSteal: number;
  lifeRegen: number;
  manaRegenPct: number;
  mf: number;
  gf: number;
  crit: number;
  thorns: number;
  lightRadius: number;
  skillsAll: number;
  lifePerKill: number;
  manaPerKill: number;
  dr: number;
  pierceRes: number;
  chillOnHit: boolean;
  fire: [number, number];
  cold: [number, number];
  light: [number, number];
  magic: [number, number];
  poison: number;
  attacksPerSec: number;
  moveSpeed: number;
  castTime: number;
  hitRecovery: number;
}

export type Equipment = Partial<Record<EquipSlot, Item>>;

export class Player extends Actor {
  faction = 'player' as const;
  name = '无名者';
  xp = 0;
  base = { str: 25, dex: 20, vit: 25, ene: 15 };
  statPoints = 0;
  skillPoints = 1;
  skills: Record<string, number> = {};
  equipment: Equipment = {};
  inventory = new Grid(10, 4);
  stash = new Grid(10, 8);
  /** belt[col] = stack of potions (index 0 is the bottom / next to use) */
  belt: Item[][] = [[], [], [], []];
  gold = 0;
  stashGold = 0;
  mana = 1;
  activeAura: string | null = null;
  holyShield = 0;
  /** skills bound to slots: lmb, rmb, q, w, e, r */
  binds: (string | null)[] = ['attack', null, null, null, null, null];
  d!: Derived;
  private dirty = true;
  cooldowns: Record<string, number> = {};
  // potion regen queues
  healQueue: { perSec: number; left: number }[] = [];
  manaQueue: { perSec: number; left: number }[] = [];
  depthReached = 0;
  waypoints: number[] = [0];
  // movement / action target
  intent: Intent | null = null;
  /** queued attack while animating */
  zealHitsLeft = 0;
  chargeTarget: Monster | null = null;
  lastDamageTime = 0;
  poiseUntil = 0;

  constructor(pos: P2) {
    super(pos);
    this.radius = 0.38;
    this.recalc();
    this.life = this.d.maxLife;
    this.mana = this.d.maxMana;
  }

  markDirty() {
    this.dirty = true;
  }

  get stats(): Derived {
    if (this.dirty) this.recalc();
    return this.d;
  }

  xpToNext(): number {
    return xpForLevel(this.level + 1);
  }

  beltRows(): number {
    const belt = this.equipment.waist;
    return 1 + (belt ? (ITEM_BASES[belt.baseId].beltRows ?? 0) : 0);
  }

  skillBase(id: string): number {
    return this.skills[id] ?? 0;
  }

  skillLevel(id: string): number {
    const b = this.skills[id] ?? 0;
    if (b <= 0) return 0;
    return b + (this.d?.skillsAll ?? 0);
  }

  synergy(def: SkillDef): number {
    if (!def.synergies) return 0;
    let s = 0;
    for (const syn of def.synergies) s += (this.skills[syn.skill] ?? 0) * syn.pct;
    return s;
  }

  skillParams(id: string, lvlOverride?: number) {
    const def = SKILL_BY_ID[id];
    const lvl = lvlOverride ?? this.skillLevel(id);
    return def.params(Math.max(1, lvl), this.synergy(def));
  }

  canLearn(def: SkillDef): boolean {
    if (this.skillPoints <= 0) return false;
    if (this.level < def.reqLevel) return false;
    if ((this.skills[def.id] ?? 0) >= 20) return false;
    return def.prereqs.every((p) => (this.skills[p] ?? 0) > 0);
  }

  meetsReq(item: Item): boolean {
    const b = baseOf(item);
    const d = this.stats;
    return this.level >= item.reqLvl && d.str >= (b.reqStr ?? 0) && d.dex >= (b.reqDex ?? 0);
  }

  recalc() {
    this.dirty = false;
    const bag: StatBag = {};
    const eq = this.equipment;
    // items
    const setCounts: Record<string, number> = {};
    for (const slot of EQUIP_SLOTS) {
      const it = eq[slot];
      if (!it) continue;
      const g = globalItemStats(it);
      for (const k in g) addStat(bag, k as StatKey, g[k as StatKey]!);
      if (it.setItemId) {
        const s = SET_ITEMS[it.setItemId];
        if (s) setCounts[s.set.id] = (setCounts[s.set.id] ?? 0) + 1;
      }
    }
    for (const sid in setCounts) {
      const set = Object.values(SET_ITEMS).find((s) => s.set.id === sid)!.set;
      for (const [cnt, bonus] of Object.entries(set.bonuses)) {
        if (setCounts[sid] >= +cnt) for (const [k, v] of bonus) addStat(bag, k, v);
      }
    }
    const skillsAll = bag.skillsAll ?? 0;
    const lvlOf = (id: string) => {
      const b = this.skills[id] ?? 0;
      return b > 0 ? b + skillsAll : 0;
    };
    // auras & buffs
    if (this.activeAura) {
      const al = lvlOf(this.activeAura);
      if (al > 0) {
        const def = SKILL_BY_ID[this.activeAura];
        const p = def.params(al, this.synergy(def));
        switch (this.activeAura) {
          case 'might':
            addStat(bag, 'dmgPctGlobal', p.dmg);
            break;
          case 'concentration':
            addStat(bag, 'dmgPctGlobal', p.dmg);
            break;
          case 'holy_fire':
            addStat(bag, 'fireMin', p.min * 4);
            addStat(bag, 'fireMax', p.max * 4);
            break;
          case 'holy_freeze':
            addStat(bag, 'coldMin', p.min * 3);
            addStat(bag, 'coldMax', p.max * 3);
            break;
          case 'resist_all':
            addStat(bag, 'resAll', p.res);
            break;
          case 'vigor':
            addStat(bag, 'frw', p.frw);
            addStat(bag, 'lifeRegen', p.regen);
            break;
          case 'meditation':
            addStat(bag, 'manaRegen', p.regen);
            break;
          case 'conviction':
            addStat(bag, 'pierceRes', 0); // applied to enemies directly
            break;
          default:
            break;
        }
      }
    }
    let shieldDefPct = 0;
    if (this.holyShield > 0 && lvlOf('holy_shield') > 0) {
      const p = SKILL_BY_ID.holy_shield.params(lvlOf('holy_shield'), 0);
      shieldDefPct = p.def;
      addStat(bag, 'block', p.block);
      addStat(bag, 'dr', p.dr);
    }

    const allAttr = bag.allAttr ?? 0;
    const str = this.base.str + (bag.str ?? 0) + allAttr;
    const dex = this.base.dex + (bag.dex ?? 0) + allAttr;
    const vit = this.base.vit + (bag.vit ?? 0) + allAttr;
    const ene = this.base.ene + (bag.ene ?? 0) + allAttr;

    const L = this.level;
    let maxLife = 30 + 3 * (L - 1) + 2 * vit + (bag.life ?? 0);
    maxLife *= 1 + (bag.lifePct ?? 0) / 100;
    let maxMana = 10 + 1.5 * (L - 1) + 2 * ene + (bag.mana ?? 0);
    maxMana *= 1 + (bag.manaPct ?? 0) / 100;

    // weapon
    const w = eq.weapon;
    let wMin = 1;
    let wMax = 3;
    let apsBase = 1.5;
    if (w) {
      [wMin, wMax] = weaponDamage(w);
      apsBase = baseOf(w).speed ?? 1.4;
    }
    wMin += bag.dmgMin ?? 0;
    wMax += bag.dmgMax ?? 0;
    const dmgPct = str + (bag.dmgPctGlobal ?? 0); // 1% per strength point, D2 style

    const ar = Math.floor((dex * 5 - 35 + (bag.ar ?? 0)) * (1 + (bag.arPct ?? 0) / 100) + 20);
    let def = Math.floor(dex / 4);
    for (const slot of EQUIP_SLOTS) {
      const it = eq[slot];
      if (it && it.defense !== undefined) def += itemDefense(it);
    }
    def += bag.def ?? 0;
    def = Math.floor(def * (1 + shieldDefPct / 100));

    const sh = eq.offhand;
    let block = 0;
    if (sh) {
      const bb = baseOf(sh).block ?? 0;
      block = clamp(((bb + (bag.block ?? 0)) * (dex + 15)) / (L * 2 + 20) * 0.9, 0, 75);
    }

    const resAll = bag.resAll ?? 0;
    const res: Resists = {
      fire: clamp((bag.resFire ?? 0) + resAll, -100, 75),
      cold: clamp((bag.resCold ?? 0) + resAll, -100, 75),
      light: clamp((bag.resLight ?? 0) + resAll, -100, 75),
      poison: clamp((bag.resPoison ?? 0) + resAll, -100, 75),
      phys: 0,
    };

    const ias = bag.ias ?? 0;
    const effIas = (120 * ias) / (120 + ias);
    const attacksPerSec = apsBase * (1 + effIas / 100);
    const frw = bag.frw ?? 0;
    const moveSpeed = 4.6 * (1 + ((150 * frw) / (150 + frw)) / 100);
    const fcr = bag.fcr ?? 0;
    const castTime = 0.62 / (1 + ((120 * fcr) / (120 + fcr)) / 100);
    const fhr = bag.fhr ?? 0;
    const hitRecovery = 0.32 / (1 + fhr / 100);

    this.d = {
      str, dex, vit, ene,
      maxLife: Math.floor(maxLife),
      maxMana: Math.floor(maxMana),
      wMin, wMax, dmgPct, ar, def, block, res,
      ias, frw, fcr, fhr,
      lifeSteal: bag.lifeSteal ?? 0,
      manaSteal: bag.manaSteal ?? 0,
      lifeRegen: bag.lifeRegen ?? 0,
      manaRegenPct: bag.manaRegen ?? 0,
      mf: bag.mf ?? 0,
      gf: bag.gf ?? 0,
      crit: Math.min(75, bag.crit ?? 0),
      thorns: bag.thorns ?? 0,
      lightRadius: bag.lightRadius ?? 0,
      skillsAll,
      lifePerKill: bag.lifePerKill ?? 0,
      manaPerKill: bag.manaPerKill ?? 0,
      dr: Math.min(50, bag.dr ?? 0),
      pierceRes: bag.pierceRes ?? 0,
      chillOnHit: (bag.chillOnHit ?? 0) > 0,
      fire: [bag.fireMin ?? 0, bag.fireMax ?? 0],
      cold: [bag.coldMin ?? 0, bag.coldMax ?? 0],
      light: [bag.lightMin ?? 0, bag.lightMax ?? 0],
      magic: [bag.magicMin ?? 0, bag.magicMax ?? 0],
      poison: bag.poisonDmg ?? 0,
      attacksPerSec,
      moveSpeed,
      castTime,
      hitRecovery,
    };
    if (this.life > this.d.maxLife) this.life = this.d.maxLife;
    if (this.mana > this.d.maxMana) this.mana = this.d.maxMana;
  }

  resists(): Resists {
    return this.stats.res;
  }

  learnableSkills(): SkillDef[] {
    return SKILLS.filter((s) => this.canLearn(s));
  }

  /** returns number of levels gained */
  gainXp(amount: number): number {
    if (this.level >= MAX_LEVEL) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      gained++;
      this.statPoints += 5;
      this.skillPoints += 1;
    }
    if (gained) {
      this.markDirty();
      this.recalc();
      this.life = this.d.maxLife;
      this.mana = this.d.maxMana;
    }
    return gained;
  }
}

export type Intent =
  | { kind: 'move'; point: P2 }
  | { kind: 'attack'; target: Monster; skill: string; hold?: boolean }
  | { kind: 'cast'; skill: string; point: P2; target: Monster | null }
  | { kind: 'pickup'; ground: { pos: P2 } & object }
  | { kind: 'interact'; obj: { pos: P2 } & object };
