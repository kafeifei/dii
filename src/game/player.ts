import { clamp, type P2 } from '../core/math';
import { CLASSES, type PlayerClass } from '../data/classes';
import { D2_CLASS, D2_TO_GAME, skillTab } from '../data/d2/skillmap';
import { D2_XP, D2_XP_RATIO } from '../data/d2/progression';
import { EQUIP_SLOTS, ITEM_BASES, type EquipSlot } from '../data/items';
import { D2X_CLASSES } from '../data/d2x/classes';
import { SET_ITEMS } from '../data/legendary';
import { SHRINE_BY_ID } from '../data/shrines';
import { SKILL_BY_ID, SKILLS, type SkillDef } from '../data/skills';
import { addStat, PARAM_STATS, poisonSeconds, type StatBag, type StatKey } from '../data/stats';
import { Grid } from '../items/grid';
import type { D2Prop } from '../data/d2x/types';
import { isBroken, replenish, replenishFrames } from '../items/d2/durability';
import { setBonuses } from '../items/d2/legendary';
import type { TradeCtx } from '../items/vendor';
import { propMods, rollMax } from '../items/props';
import { baseOf, classCode, globalItemStats, isIdentified, itemCategory, itemDefense, itemReqLvl, meetsReqs, paramMods, weaponDamage, type Item, type ItemMod } from '../items/item';
import { Actor, type Resists } from './actor';
import type { Monster } from './monster';
import type { Difficulty } from './save';

export const MAX_LEVEL = 99;

/** a skill bar entry that casts from an item's charges: `chg:<skill id>` */
export const CHARGE_PREFIX = 'chg:';

/** one charged skill on equipped gear */
export interface ChargeUse {
  id: string;
  item: Item;
  /** the mod's param (the Diablo II skill name), which keys item.charges */
  param: string;
  lvl: number;
  max: number;
  left: number;
}

/** cumulative xp needed to reach level L (Diablo II's experience table) */
export function xpForLevel(L: number): number {
  if (L <= 1) return 0;
  return D2_XP[Math.min(L, MAX_LEVEL) - 1];
}

/** fire skills, for "+X to fire skills": the sorceress's fire tree and Holy Fire */
const FIRE_SKILLS = new Set([...SKILLS.filter((s) => s.cls === 'sorceress' && s.tree === 0).map((s) => s.id), 'holy_fire']);

/** an aura in effect: the one the player switched on, or one an item gives */
export interface ActiveAura {
  id: string;
  lvl: number;
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
  /** every summed stat, for the Diablo II properties read where they act (combat, vendors…) */
  bag: StatBag;
  /** % damage per point of strength and dexterity, from the weapon */
  strBonus: number;
  dexBonus: number;
  /** auras from items, beside the one switched on */
  itemAuras: ActiveAura[];
  /** chance-to-cast mods and charged skills on equipped items */
  procs: ItemMod[];
  charged: { item: Item; mod: ItemMod }[];
  fire: [number, number];
  cold: [number, number];
  light: [number, number];
  magic: [number, number];
  poison: number;
  /** seconds the weapon's poison lasts */
  poisonLen: number;
  attacksPerSec: number;
  moveSpeed: number;
  castTime: number;
  hitRecovery: number;
}

export type Equipment = Partial<Record<EquipSlot, Item>>;

export class Player extends Actor {
  faction = 'player' as const;
  name = '无名者';
  cls: PlayerClass = 'paladin';
  xp = 0;
  base = { str: 25, dex: 20, vit: 25, ene: 15 };
  statPoints = 0;
  skillPoints = 1;
  skills: Record<string, number> = {};
  equipment: Equipment = {};
  inventory = new Grid(10, 4);
  /** Diablo II: Resurrected's personal stash */
  stash = new Grid(10, 10);
  /** the Horadric Cube's own 3×4 space */
  cube = new Grid(3, 4);
  /**
   * items from a save that fit nowhere (old saves, bigger D2 items), and the ones this build doesn't
   * know: they wait on the ground by the camp stash
   */
  unplaced: Item[] = [];
  /** has the cube turned up yet (it is found once) */
  cubeFound = false;
  /** belt[col] = stack of potions (index 0 is the bottom / next to use) */
  belt: Item[][] = [[], [], [], []];
  gold = 0;
  stashGold = 0;
  mana = 1;
  activeAura: string | null = null;
  holyShield = 0;
  /** seconds left on the sorceress's Frozen Armor */
  frozenArmor = 0;
  /** skills bound to slots: lmb, rmb, q, w, e, r */
  binds: (string | null)[] = ['attack', null, null, null, null, null];
  d!: Derived;
  private dirty = true;
  /** worn items the hero no longer meets the requirements of, which give nothing (D2's IFLAG_NOEQUIP: recalc) */
  private noEquip = new Set<Item>();
  cooldowns: Record<string, number> = {};
  // potion regen queues
  healQueue: { perSec: number; left: number }[] = [];
  manaQueue: { perSec: number; left: number }[] = [];
  depthReached = 0;
  /** the depths whose waypoints have been touched, in the difficulty being played */
  waypoints: number[] = [0];
  /** the difficulty being played (Game.setDifficulty): nothing plays harder yet, it is saved and shown and keeps its own waypoints */
  difficulty: Difficulty = 0;
  /** a shrine's blessing (one at a time) and its seconds left */
  shrine: { id: string; left: number } | null = null;
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

  /** item bonuses to skills, worked out in recalc */
  private skillBonus: { one: Record<string, number>; other: Record<string, number>; all: number; cls: number; tab: number[]; fire: number } = { one: {}, other: {}, all: 0, cls: 0, tab: [0, 0, 0], fire: 0 };

  /**
   * A skill's level with gear. As in Diablo II: a bonus to one skill grants it even with no points
   * spent; +all, +class, +tree and +fire skills only add to skills that have a level already; a
   * skill of another class given by an item ("oskill") gets nothing else.
   */
  skillLevel(id: string): number {
    if (this.dirty) this.recalc();
    const def = SKILL_BY_ID[id];
    const sb = this.skillBonus;
    if (def && def.cls !== this.cls) return sb.other[id] ?? 0;
    const b = (this.skills[id] ?? 0) + (sb.one[id] ?? 0);
    if (b <= 0) return 0;
    return b + sb.all + sb.cls + (def ? sb.tab[def.tree] : 0) + (FIRE_SKILLS.has(id) ? sb.fire : 0);
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

  /** charged skills on equipped gear that this game can cast (Holy Thunder's Chain Lightning…) */
  chargedSkills(): ChargeUse[] {
    if (this.dirty) this.recalc();
    const out: ChargeUse[] = [];
    for (const { item, mod } of this.stats.charged) {
      const param = mod.param ?? '';
      const id = SKILL_BY_ID[param] ? param : D2_TO_GAME[param];
      const kind = id ? SKILL_BY_ID[id].kind : null;
      if (!id || (kind !== 'spell' && kind !== 'buff')) continue;
      out.push({ id, item, param, lvl: mod.lvl ?? 1, max: mod.value, left: item.charges?.[param] ?? mod.value });
    }
    return out;
  }

  /** the charges a skill bar entry casts from: the highest level that has some left */
  chargeFor(id: string): ChargeUse | undefined {
    const all = this.chargedSkills().filter((c) => c.id === id);
    return all.filter((c) => c.left > 0).sort((a, b) => b.lvl - a.lvl)[0] ?? all[0];
  }

  useCharge(c: ChargeUse): boolean {
    const left = c.item.charges?.[c.param] ?? c.max;
    if (left <= 0) return false;
    (c.item.charges ??= {})[c.param] = left - 1;
    return true;
  }

  /**
   * Self-repairing items mend (d2/durability.ts replenish), wherever the hero keeps them: D2 runs
   * an item's own event wherever it is (ItemMode.cpp:4975-5030). Frames carried over are kept per item
   */
  mendItems(dt: number) {
    this.mendClock += dt;
    if (this.mendClock < 0.5) return;
    const frames = this.mendClock * 25;
    this.mendClock = 0;
    const all = [...Object.values(this.equipment), ...[this.inventory, this.stash, this.cube].flatMap((g) => g.items.map((x) => x.item))];
    for (const it of all) {
      if (!it || !replenishFrames(it)) continue;
      const before = it.dur;
      this.mending.set(it, replenish(it, frames, this.mending.get(it) ?? 0));
      if (before !== undefined && before !== it.dur) this.markDirty();
    }
  }

  private mendClock = 0;
  private mending = new WeakMap<Item, number>();

  /** what the hero's prices go by: the difficulty and "reduces all vendor prices" (D2's item_reducedprices) */
  tradeCtx(): TradeCtx {
    return { difficulty: this.difficulty, reduced: this.stats.bag.cheap ?? 0 };
  }

  canLearn(def: SkillDef): boolean {
    if (def.cls !== this.cls) return false;
    if (this.skillPoints <= 0) return false;
    if (this.level < def.reqLevel) return false;
    if ((this.skills[def.id] ?? 0) >= 20) return false;
    return def.prereqs.every((p) => (this.skills[p] ?? 0) > 0);
  }

  /** whether the hero can use the item (items/item.ts meetsReqs) */
  meetsReq(item: Item): boolean {
    const d = this.stats;
    return meetsReqs(item, { level: this.level, str: d.str, dex: d.dex, cls: this.cls });
  }

  /** the charms in the bag that count: identified, their level met (D2: charms work from the inventory only) */
  activeCharms(): Item[] {
    return this.inventory.items
      .map((x) => x.item)
      .filter((it) => ITEM_BASES[it.baseId]?.type === 'charm' && isIdentified(it) && this.level >= itemReqLvl(it, classCode(this.cls)));
  }

  /** whether a worn item gives nothing: broken, or the hero no longer meets its requirements (recalc) */
  unusable(item: Item): boolean {
    if (this.dirty) this.recalc();
    return this.noEquip.has(item) || isBroken(item);
  }

  /**
   * What is worn that works, D2GAME_ITEMS_UpdateInventoryItems's way (ItemMode.cpp:1995-2091): in
   * slot order an item the hero no longer meets the requirements of is flagged unusable and its
   * strength and dexterity leave at once; then each flagged one the hero now meets comes back, again
   * until none does. A worn item's own strength and dexterity count toward its own requirements
   * (ITEMS_CheckStatRequirement outside equipping, Items.cpp:1019-1040), the sets' bonuses don't
   * (they follow from what works). An item taken off loses its flag (D2 clears it as an item goes
   * on, ItemMode.cpp:1617-1619). A broken item gives nothing at all, its set's count included
   * (ItemMode.cpp:2000-2098 skip IFLAG_BROKEN, Items.cpp:4459).
   */
  private usableWorn(charms: Item[]): Item[] {
    const L = this.level;
    const worn = EQUIP_SLOTS.map((s) => this.equipment[s]).filter((it): it is Item => !!it && !isBroken(it));
    for (const it of this.noEquip) if (!worn.includes(it)) this.noEquip.delete(it);
    const strDex = (it: Item) => {
      const g = globalItemStats(it, L);
      return [(g.str ?? 0) + (g.allAttr ?? 0), (g.dex ?? 0) + (g.allAttr ?? 0)];
    };
    const who = { level: L, str: this.base.str, dex: this.base.dex, cls: this.cls };
    const count = (it: Item, k: number) => {
      const [s, d] = strDex(it);
      who.str += k * s;
      who.dex += k * d;
    };
    for (const it of [...charms, ...worn]) if (!this.noEquip.has(it)) count(it, 1);
    for (const it of worn) {
      if (this.noEquip.has(it) || meetsReqs(it, who)) continue;
      this.noEquip.add(it);
      count(it, -1);
    }
    for (let again = true; again; ) {
      again = false;
      for (const it of worn) {
        if (!this.noEquip.has(it) || !meetsReqs(it, who)) continue;
        this.noEquip.delete(it);
        count(it, 1);
        again = true;
      }
    }
    return worn.filter((it) => !this.noEquip.has(it));
  }

  recalc() {
    this.dirty = false;
    const bag: StatBag = {};
    // items
    const setCounts: Record<string, number> = {};
    const params: { item: Item; mod: ItemMod }[] = [];
    // what is worn and works, and the charms in the bag, which work from there
    const charms = this.activeCharms();
    const worn = this.usableWorn(charms);
    const usable = new Set(worn);
    const eq = Object.fromEntries(EQUIP_SLOTS.map((s) => [s, usable.has(this.equipment[s]!) ? this.equipment[s] : null])) as typeof this.equipment;
    for (const it of [...worn, ...charms]) {
      const g = globalItemStats(it, this.level);
      for (const k in g) addStat(bag, k as StatKey, g[k as StatKey]!);
      for (const mod of paramMods(it)) params.push({ item: it, mod });
      if (it.setItemId) {
        const s = SET_ITEMS[it.setItemId];
        if (s) setCounts[s.set.id] = (setCounts[s.set.id] ?? 0) + 1;
      }
    }
    // Diablo II's sets: each worn set item's green slots and its set's partial and full bonuses,
    // by the pieces that work (Items.cpp:4459 skips a piece flagged unusable; d2/legendary.ts
    // setBonuses), as the tooltip counts them (item.ts setLines). A slot's enhanced defense and
    // damage are its own item's (its ITEMSET stat list, Items.cpp:7423-7491): an armor's defense, a
    // weapon's damage, and off a weapon the hero's damage % as the item's own would be
    const setWorn = worn.filter((it) => it.setRow !== undefined);
    const sets = setBonuses(setWorn);
    const setProps: D2Prop[] = sets.sets.flatMap((s) => [...s.partial, ...s.full]);
    const localPct = new Map<Item, { def: number; dmg: number }>();
    setWorn.forEach((it, i) => {
      sets.slots[i].forEach((on, k) => {
        if (!on) return;
        for (const p of it.setBonus?.[k] ?? []) {
          if ((p.c === 'ac%' && it.defense !== undefined) || (p.c === 'dmg%' && itemCategory(it) === 'weapon')) {
            const l = localPct.get(it) ?? { def: 0, dmg: 0 };
            if (p.c === 'ac%') l.def += p.min;
            else l.dmg += p.min;
            localPct.set(it, l);
          } else setProps.push(p);
        }
      });
    });
    for (const m of propMods(setProps, true, rollMax)) {
      if (PARAM_STATS.has(m.stat)) params.push({ item: setWorn[0], mod: m });
      // a set's damage % goes on the hero's damage, not one weapon's
      else addStat(bag, m.stat === 'dmgPct' ? 'dmgPctGlobal' : m.stat, m.perLvl ? Math.floor((m.value * this.level) / 8) : m.value);
    }
    // the old invented sets, by count
    for (const sid in setCounts) {
      const set = Object.values(SET_ITEMS).find((s) => s.set.id === sid)!.set;
      for (const [cnt, bonus] of Object.entries(set.bonuses)) {
        if (setCounts[sid] >= +cnt) for (const [k, v] of bonus) addStat(bag, k, v);
      }
    }
    // a shrine's blessing
    const blessing = this.shrine ? SHRINE_BY_ID[this.shrine.id] : undefined;
    for (const [k, v] of Object.entries(blessing?.stats ?? {})) addStat(bag, k as StatKey, v);
    const skillsAll = bag.skillsAll ?? 0;
    // skill bonuses from items
    const myCls = this.cls === 'sorceress' ? 'sor' : 'pal';
    const sb = { one: {} as Record<string, number>, other: {} as Record<string, number>, all: skillsAll, cls: 0, tab: [0, 0, 0], fire: bag.fireSkills ?? 0 };
    const itemAuras: ActiveAura[] = [];
    const procs: ItemMod[] = [];
    const charged: { item: Item; mod: ItemMod }[] = [];
    for (const { item, mod } of params) {
      const id = SKILL_BY_ID[mod.param ?? ''] ? mod.param! : D2_TO_GAME[mod.param ?? ''];
      const own = id && SKILL_BY_ID[id].cls === this.cls;
      switch (mod.stat) {
        case 'skill':
          if (id && own) sb.one[id] = (sb.one[id] ?? 0) + mod.value;
          break;
        case 'oskill':
          if (id) (own ? sb.one : sb.other)[id] = ((own ? sb.one : sb.other)[id] ?? 0) + mod.value;
          break;
        case 'clsSkills':
          if (D2_CLASS[mod.param ?? ''] === this.cls) sb.cls += mod.value;
          break;
        case 'skillTab': {
          const t = skillTab(Number(mod.param));
          if (t.cls === myCls) sb.tab[t.tree] += mod.value;
          break;
        }
        case 'aura':
          if (id && SKILL_BY_ID[id].kind === 'aura') itemAuras.push({ id, lvl: mod.value });
          break;
        case 'charged':
          if (id) charged.push({ item, mod });
          break;
        default:
          if (id) procs.push(mod);
      }
    }
    this.skillBonus = sb;
    const lvlOf = (id: string) => this.skillLevel(id);
    // auras & buffs: the one switched on, and any an item gives (the same aura twice keeps the higher)
    const auras: ActiveAura[] = [];
    if (this.activeAura && lvlOf(this.activeAura) > 0) auras.push({ id: this.activeAura, lvl: lvlOf(this.activeAura) });
    for (const a of itemAuras) {
      const same = auras.find((x) => x.id === a.id);
      if (!same) auras.push(a);
      else same.lvl = Math.max(same.lvl, a.lvl);
    }
    for (const aura of auras) {
      {
        const al = aura.lvl;
        const def = SKILL_BY_ID[aura.id];
        const p = def.params(al, this.synergy(def));
        switch (aura.id) {
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
    if (this.frozenArmor > 0 && lvlOf('frozen_armor') > 0) {
      shieldDefPct += SKILL_BY_ID.frozen_armor.params(lvlOf('frozen_armor'), 0).def;
    }
    // passives
    if (lvlOf('warmth') > 0) addStat(bag, 'manaRegen', SKILL_BY_ID.warmth.params(lvlOf('warmth'), 0).regen);

    const allAttr = bag.allAttr ?? 0;
    const str = this.base.str + (bag.str ?? 0) + allAttr;
    const dex = this.base.dex + (bag.dex ?? 0) + allAttr;
    const vit = this.base.vit + (bag.vit ?? 0) + allAttr;
    const ene = this.base.ene + (bag.ene ?? 0) + allAttr;

    const L = this.level;
    const cd = CLASSES[this.cls];
    let maxLife = cd.life0 + cd.lifePerLvl * (L - 1) + 2 * vit + (bag.life ?? 0);
    maxLife *= 1 + (bag.lifePct ?? 0) / 100;
    let maxMana = cd.mana0 + cd.manaPerLvl * (L - 1) + 2 * ene + (bag.mana ?? 0);
    maxMana *= 1 + (bag.manaPct ?? 0) / 100;

    // weapon
    const w = eq.weapon;
    let wMin = 1;
    let wMax = 3;
    let apsBase = 1.5;
    let strBonus = 100;
    let dexBonus = 0;
    if (w) {
      const wb = baseOf(w);
      [wMin, wMax] = weaponDamage(w, L, false, localPct.get(w)?.dmg ?? 0);
      apsBase = wb.speed ?? 1.4;
      // D2: most weapons gain 1% damage per strength point, daggers 0.75% per strength and dexterity
      if (wb.strBonus !== undefined) {
        strBonus = wb.strBonus;
        dexBonus = wb.dexBonus ?? 0;
      }
    }
    wMin += bag.dmgMin ?? 0;
    wMax += bag.dmgMax ?? 0;
    const dmgPct = (str * strBonus) / 100 + (dex * dexBonus) / 100 + (bag.dmgPctGlobal ?? 0);

    const ar = Math.floor((dex * 5 - 35 + (bag.ar ?? 0)) * (1 + (bag.arPct ?? 0) / 100) + 20);
    let def = Math.floor(dex / 4);
    for (const slot of EQUIP_SLOTS) {
      const it = eq[slot];
      if (it && it.defense !== undefined) def += itemDefense(it, L, localPct.get(it)?.def ?? 0);
    }
    def += bag.def ?? 0;
    def = Math.floor(def * (1 + (shieldDefPct + (blessing?.defPct ?? 0)) / 100));

    const sh = eq.offhand;
    let block = 0;
    if (sh && baseOf(sh).type === 'shield') {
      // the shield's block with the class's BlockFactor (CharStats.txt), into the game's own curve
      const bb = (baseOf(sh).block ?? 0) + (D2X_CLASSES[classCode(this.cls) ?? '']?.blockFactor ?? 0);
      block = clamp(((bb + (bag.block ?? 0)) * (dex + 15)) / (L * 2 + 20) * 0.9, 0, 75);
    }

    const resAll = bag.resAll ?? 0;
    // the cap is 75%, raised by "+X% maximum resistance" (at most 95%)
    const cap = (k: StatKey) => Math.min(95, 75 + (bag[k] ?? 0));
    const res: Resists = {
      fire: clamp((bag.resFire ?? 0) + resAll, -100, cap('maxResFire')),
      cold: clamp((bag.resCold ?? 0) + resAll, -100, cap('maxResCold')),
      light: clamp((bag.resLight ?? 0) + resAll, -100, cap('maxResLight')),
      poison: clamp((bag.resPoison ?? 0) + resAll, -100, cap('maxResPoison')),
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
      bag,
      strBonus,
      dexBonus,
      itemAuras,
      procs,
      charged,
      fire: [bag.fireMin ?? 0, bag.fireMax ?? 0],
      cold: [bag.coldMin ?? 0, bag.coldMax ?? 0],
      light: [bag.lightMin ?? 0, bag.lightMax ?? 0],
      magic: [bag.magicMin ?? 0, bag.magicMax ?? 0],
      poison: bag.poisonDmg ?? 0,
      poisonLen: poisonSeconds(bag),
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
    // D2 keeps less of the experience earned from level 70 on (ExpRatio, out of 1024)
    this.xp += Math.floor((amount * (D2_XP_RATIO[this.level] ?? 1024)) / 1024);
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
  /** the touch stick: walk this way (unit length) for as long as it is held */
  | { kind: 'steer'; dir: P2 }
  | { kind: 'attack'; target: Monster; skill: string; hold?: boolean }
  | { kind: 'cast'; skill: string; point: P2; target: Monster | null; charge?: ChargeUse }
  | { kind: 'pickup'; ground: { pos: P2 } & object }
  | { kind: 'interact'; obj: { pos: P2 } & object };
