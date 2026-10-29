// Diablo II's Act 1 hireling, the Rogue Scout of Hireling.txt's expansion rows (src/data/d2x/hirelings.ts):
// whom Kashya offers, at what level and price; her life, defense, attack rating, damage, resistances
// and skills at a level, with what the skills do (skillcalc.ts); her experience, what a kill gives her
// and how she levels; when she may be hired; what she may wear; and what paying her back to life
// costs. Pure functions over the data: the game, the save and the panels keep her and call these.
// Single player: D2's party sharing and the classic game's rules are left out.
//
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f, by file and line:
// Monsters.cpp is source/D2Common/src/Monsters/Monsters.cpp, MonsterTbls.cpp source/D2Common/src/
// DataTbls/MonsterTbls.cpp, Items.cpp source/D2Common/src/Items/Items.cpp, Units.cpp source/D2Common/
// src/Units/Units.cpp, D2Skills.cpp source/D2Common/src/D2Skills.cpp, D2Seed.h source/D2Common/include/
// D2Seed.h; MonsterAI.cpp and MonsterUnique.cpp source/D2Game/src/MONSTER/, SUnitNpc.cpp and SUnitDmg.cpp
// source/D2Game/src/UNIT/, PlrMsg.cpp and PlrSave2.cpp source/D2Game/src/PLAYER/, AiThink.cpp
// source/D2Game/src/AI/AiThink.cpp. Integer steps are D2's: int32, / truncating toward zero, >> flooring.
import { D2X_FPS } from '../../data/d2x/calc';
import { D2X_HIRELINGS, D2X_HIRELING_NAMES, D2X_HIRELING_XP } from '../../data/d2x/hirelings';
import { D2X_SKILLS } from '../../data/d2x/skills';
import type { D2xHireling, D2xHirelingBand } from '../../data/d2x/types';
import { itypeSet, type ItemBase } from '../../data/items';
import { isBroken } from '../../items/d2/durability';
import { baseOf, isIdentified, isUnknown, itemReqLvl, itemReqStats, type Item } from '../../items/item';
import type { Rng } from './population';
import { auraRadius, auraSeconds, auraStats, convertPct, elemDamage, elemSeconds, skillBlastRadius, toHitBonus, type CalcCtx } from './skillcalc';
import { killXp } from './xp';

/** a hireling's row by its Hireling.txt Id (what the save keeps as MercSave.hire), or the row itself */
export type HirelingRef = number | D2xHireling;

const BY_ID = new Map(D2X_HIRELINGS.map((h) => [h.id, h]));

export function hireling(h: HirelingRef): D2xHireling {
  if (typeof h !== 'number') return h;
  const row = BY_ID.get(h);
  if (!row) throw new Error(`hireling: no Hireling.txt Id ${h}`);
  return row;
}

/** C's / on int32: toward zero */
const idiv = (a: number, b: number) => Math.trunc(a / b);
/** C's >> on a signed int32 (MSVC shifts arithmetically): toward minus infinity */
const shr = (a: number, n: number) => Math.floor(a / 2 ** n);
/** the import divided the per-level columns (Str/Lvl, Dex/Lvl and Dmg/Lvl by 8, Resist…/Lvl by 4, LvlPerLvl by 32): D2's whole numbers back */
const whole = (v: number, d: number) => Math.round(v * d);

/**
 * The band her stats grow from: the highest at or below her level, else the first
 * (DATATBLS_GetHirelingTxtRecordFromIdAndLevel, MonsterTbls.cpp:1718-1754)
 */
export function bandAt(h: HirelingRef, level: number): D2xHirelingBand {
  const bands = hireling(h).bands;
  let best = bands[0];
  for (const b of bands) if (b.level <= level) best = b;
  return best;
}

/** the highest level she reaches: one below the heroes' (MonsterAI.cpp:220, SUnitDmg.cpp:3215) */
export const MERC_MAX_LEVEL = D2X_HIRELING_XP.maxLevel;

// ───────────────────────── who is on offer ─────────────────────────

/**
 * The rows a difficulty hires from: its first, and those of the same level after it, in table order
 * (DATATBLS_GetNextHirelingTxtRecordFromActAndDifficulty, MonsterTbls.cpp:1844-1875): the first band
 * of fire and of cold. Every row here is Act 1's.
 */
export function rowsOnOffer(difficulty: 0 | 1 | 2): D2xHireling[] {
  const rows = D2X_HIRELINGS.filter((h) => h.difficulty === difficulty);
  return rows.filter((h) => h.bands[0].level === rows[0]?.bands[0].level);
}

/** the names an NPC hires out, keys into D2X_HIRELING_NAMES: her normal row's, which every difficulty shares (SUnitNpc.cpp:65, 970) */
export function rosterNames(seller = 'kashya'): string[] {
  const h = D2X_HIRELINGS.find((r) => r.seller === seller && r.difficulty === 0);
  if (!h) throw new Error(`hireling: ${seller} hires no one out`);
  return h.names;
}

/** a hireling's name, ours and in English, by its row of the names (MercSave.name) */
export function hirelingName(h: HirelingRef, name: number): { name: string; nameEn: string } | undefined {
  const key = hireling(h).names[name];
  return key === undefined ? undefined : D2X_HIRELING_NAMES[key];
}

/** how many are on offer at once (SUnitNpc.cpp:82) */
export const ROSTER_SIZE = 10;

/** one name on an NPC's roster (D2MercDataStrc) */
export interface RosterEntry {
  /** her row of the names (rosterNames), as MercSave.name keeps it */
  name: number;
  /** her own seed, which her element and level follow from (hireOffer) */
  seed: number;
  offered: boolean;
  hired: boolean;
}

/**
 * A new roster, a game's for one NPC (SUNITNPC_InitializeHirelingRoster, SUnitNpc.cpp:48-107): a seed
 * for every name in order, then ROSTER_SIZE picks, each a random name, or the next one along (round to
 * the first) that is neither offered nor hired; it stops early once every name is. D2 makes it the
 * first time the hire list opens (SUnitNpc.cpp:346-349).
 */
export function rollRoster(rng: Rng, count = rosterNames().length): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (let i = 0; i < count; i++) out.push({ name: i, seed: rng.int(0, 0xffffffff), offered: false, hired: false });
  for (let k = 0; k < ROSTER_SIZE && count > 0; k++) {
    const start = rng.int(0, count - 1);
    let i = start;
    for (;;) {
      if (!out[i].offered && !out[i].hired) {
        out[i].offered = true;
        break;
      }
      i = i + 1 >= count ? 0 : i + 1;
      if (i === start) return out;
    }
  }
  return out;
}

/** who the list shows: offered and not yet hired, in name order (D2GAME_NPC_BuildHirelingList, SUnitNpc.cpp:355-366) */
export function onOffer(roster: readonly RosterEntry[]): RosterEntry[] {
  return roster.filter((e) => e.offered && !e.hired);
}

/**
 * The roster once `name` is hired: when nobody is left on offer D2 rolls a new one, every name back
 * (SUnitNpc.cpp:1034-1050; after the free hireling, 2942-2958)
 */
export function takeFromRoster(roster: readonly RosterEntry[], name: number, rng: Rng): RosterEntry[] {
  const next = roster.map((e) => (e.name === name ? { ...e, hired: true } : { ...e }));
  return onOffer(next).length ? next : rollRoster(rng, roster.length);
}

/**
 * The Sisters' reward (D2GAME_NPC_AssignMercenary, SUnitNpc.cpp:2887-2939): the first on offer in name
 * order, for nothing; none when the hero has a hireling, dead or alive (2896). D2 gives none either
 * when the roster was never made (2891); make it first.
 */
export function freeHireling(roster: readonly RosterEntry[], hasHireling: boolean): RosterEntry | null {
  if (hasHireling) return null;
  return roster.find((e) => e.offered && !e.hired) ?? null;
}

/**
 * D2's seed (D2Seed.h:39-60): SEED_InitLowSeed sets the low half and 666 as the high (D2Seed.cpp:26-30);
 * each roll is high + 0x6AC690C5 × low in 64 bits, its halves the next seed, its low half the roll
 */
export class D2Seed {
  private lo: bigint;
  private hi = 666n;
  constructor(low: number) {
    this.lo = BigInt(low >>> 0);
  }
  /** SEED_RollRandomNumber, as a uint32 */
  next(): number {
    const v = this.hi + 0x6ac690c5n * this.lo;
    this.lo = v & 0xffffffffn;
    this.hi = v >> 32n;
    return Number(this.lo);
  }
  /** SEED_RollLimitedRandomNumber: 0 … n − 1, masking when n is a power of two */
  below(n: number): number {
    if (n <= 0) return 0;
    return n & (n - 1) ? this.next() % n : this.next() & (n - 1);
  }
}

/**
 * Her level as hired: the band's, plus a roll of 0–4 but no more than the hero is above the band
 * (Monsters.cpp:100-109). A hero below the band hires at his own level. D2R's HiringMaxLevelDifference
 * (D2xHireling.maxLvlAbove) is not read: D2MOO has no such column, and the M2a decision follows D2MOO.
 */
export function hireLevel(bandLevel: number, heroLevel: number, roll: number): number {
  const above = heroLevel - bandLevel;
  return bandLevel + (roll >= above ? above : roll);
}

/** her price at a level: the first band's Gold × (100 + 15 × levels above it) / 100, at least Gold (Monsters.cpp:129-133) */
export function hirePrice(h: HirelingRef, level: number): number {
  const b = hireling(h).bands[0];
  return Math.max(b.gold, idiv(b.gold * (15 * (level - b.level) + 100), 100));
}

/** experience to reach level L at a band's Exp/Lvl: Exp/Lvl × L² × (L + 1) (MONSTERS_GetHirelingExpForNextLevel, Monsters.cpp:394-397) */
const xpOf = (level: number, perLvl: number) => perLvl * level * level * (level + 1);

/** what the list shows of a name on offer and what hiring her makes (MONSTERS_HirelingInit, Monsters.cpp:65-178) */
export interface HireOffer {
  /** the Hireling.txt Id she is hired as (MercSave.hire) */
  id: number;
  element: 'fire' | 'cold';
  level: number;
  price: number;
  /** her experience as hired: her level's threshold (Monsters.cpp:135-139) */
  xp: number;
}

/**
 * A name on offer, for a hero of `heroLevel` (MONSTERS_HirelingInit, Monsters.cpp:65-178): her seed
 * picks fire or cold among rowsOnOffer (93), then rolls her level (100); so she stays the same
 * woman, and her level and price move as the hero levels. D2's client works the list out the same way.
 */
export function hireOffer(seed: number, heroLevel: number, difficulty: 0 | 1 | 2): HireOffer {
  const rows = rowsOnOffer(difficulty);
  if (!rows.length) throw new Error(`hireling: nobody to hire in difficulty ${difficulty}`);
  const s = new D2Seed(seed);
  const h = rows[s.below(rows.length)];
  const level = hireLevel(h.bands[0].level, heroLevel, s.next() % 5);
  return { id: h.id, element: h.element, level, price: hirePrice(h, level), xp: Math.max(0, xpOf(level, h.bands[0].xpPerLvl)) };
}

/** the hero level from which Kashya hires out without the Sisters' reward (SUnitNpc.cpp:951) */
export const HIRE_MIN_LEVEL = 8;

/**
 * Whether Kashya hires out (SUNITNPC_HireMercenaryFromRoster, SUnitNpc.cpp:927-955): from level 8, or
 * once the Sisters' quest reward is granted in this difficulty (a1q2's QFLAG.REWARDGRANTED). D2 tests
 * the hero's level capped at 12 in normal (929-941), which changes nothing at 8.
 */
export function mayHire(heroLevel: number, sistersRewarded: boolean): boolean {
  return heroLevel >= HIRE_MIN_LEVEL || sistersRewarded;
}

/**
 * Bringing her back (D2GAME_NPC_ResurrectMerc, SUnitNpc.cpp:1672-1733; MONSTERS_GetHirelingResurrectionCost,
 * Monsters.cpp:400-411): 15 × level² / 2, at most 50000, D2R's resurrectcost columns. She comes back
 * with full life by the hero.
 */
export function resurrectCost(h: HirelingRef, level: number): number {
  const r = hireling(h).resurrect;
  return Math.min(r.max, idiv(r.mul * level * level, r.div));
}

/**
 * Paying an NPC for her (hire, SUnitNpc.cpp:995-1009; raise, 1705-1719): inventory gold first, the
 * stash's for the rest; null when the two together fall short
 */
export function pay(cost: number, gold: number, stashGold: number): { gold: number; stashGold: number } | null {
  if (gold + stashGold < cost) return null;
  if (gold < cost) return { gold: 0, stashGold: stashGold - (cost - gold) };
  return { gold: gold - cost, stashGold };
}

// ───────────────────────── her stats ─────────────────────────

/** what she has at a level, before her gear (MONSTERAI_UpdateMercStatsAndSkills, MonsterAI.cpp:183-281) */
export interface MercStats {
  id: number;
  level: number;
  /** her band's level, and how far she is above it (below it: hired by a hero under the band) */
  band: number;
  levelUps: number;
  /** max life; D2 refills it at every level (MonsterAI.cpp:238-240) */
  life: number;
  str: number;
  dex: number;
  /** STAT_ARMORCLASS and STAT_TOHIT, as D2 sets them */
  def: number;
  ar: number;
  /**
   * What they come to with her dexterity: defense + dex / 4, as for any unit (UNITS_GetDefense,
   * Units.cpp:2362), and attack rating + 5 × dex, as for any unit but a hero (SUNITDMG_IsHitSuccessful,
   * SUnitDmg.cpp:2472); her gear's add on top
   */
  defense: number;
  attackRating: number;
  /** her own damage (STAT_SECONDARY_MIN/MAXDAMAGE): what it adds to an arrow is arrowBonus */
  dmg: [number, number];
  /** fire, cold, lightning, poison */
  resist: [number, number, number, number];
  /** life regained a second: STAT_HPREGEN is max life in 256ths / 2000, counted in 256ths a frame (MonsterAI.cpp:260-261) */
  regen: number;
  /** her experience at least at this level, and what the next asks (0 at the top) (MonsterAI.cpp:219-230) */
  xp: number;
  nextXp: number;
  /**
   * What each level above her band adds: its /Lvl columns, strength, dexterity and damage in eighths
   * and resistances in quarters made points (D2 floors the sum, not each level)
   */
  perLevel: { life: number; str: number; dex: number; def: number; ar: number; dmg: number; resist: [number, number, number, number] };
}

/**
 * Her stats at a level (MONSTERAI_UpdateMercStatsAndSkills, MonsterAI.cpp:183-261): with u her levels
 * above her band, life HP + u × HP/Lvl, at least 40; strength and dexterity + u × /Lvl / 8, at least 10;
 * defense and attack rating + u × /Lvl; damage + u × Dmg/Lvl / 8, the max at least 1; each resistance
 * + u × /Lvl / 4. D2 sums life unsigned, so far below a nightmare or hell band it would wrap: kept
 * at 40 here. D2MOO has one resistance column, D2R four (equal for her).
 */
export function mercStats(h: HirelingRef, level: number): MercStats {
  const row = hireling(h);
  const b = bandAt(row, level);
  const u = level - b.level;
  const life = Math.max(b.hp + u * b.hpPerLvl, 40);
  const str = Math.max(b.str + idiv(u * whole(b.strPerLvl, 8), 8), 10);
  const dex = Math.max(b.dex + idiv(u * whole(b.dexPerLvl, 8), 8), 10);
  const def = Math.max(b.def + u * b.defPerLvl, 0);
  const ar = Math.max(b.ar + u * b.arPerLvl, 0);
  const dmgUp = idiv(u * whole(b.dmgPerLvl, 8), 8);
  const resist = b.resist.map((r, k) => Math.max(r + idiv(u * whole(b.resistPerLvl[k], 4), 4), 0)) as MercStats['resist'];
  const regen256 = idiv(life * 256, 2000);
  return {
    id: row.id,
    level,
    band: b.level,
    levelUps: u,
    life,
    str,
    dex,
    def,
    ar,
    defense: def + idiv(dex, 4),
    attackRating: ar + 5 * dex,
    dmg: [Math.max(b.dmg[0] + dmgUp, 0), Math.max(b.dmg[1] + dmgUp, 1)],
    resist,
    regen: (regen256 * D2X_FPS) / 256,
    xp: xpAt(row, level),
    nextXp: nextXp(row, level),
    perLevel: { life: b.hpPerLvl, str: b.strPerLvl, dex: b.dexPerLvl, def: b.defPerLvl, ar: b.arPerLvl, dmg: b.dmgPerLvl, resist: [...b.resistPerLvl] },
  };
}

/**
 * What her damage adds to each arrow she shoots that already deals some (her bow's): dmg − 1 at both
 * ends, the sum kept at 0 or more (MONSTERUNIQUE_AddRogueHireMissileSecondaryDamage, MonsterUnique.cpp:
 * 1283-1308, her missiles' umod function, 1984, put on her at MonsterAI.cpp:141)
 */
export function arrowBonus(dmg: readonly [number, number]): [number, number] {
  return [dmg[0] - 1, dmg[1] - 1];
}

// ───────────────────────── her skills ─────────────────────────

/** what one of her skills does at her level, from skillcalc.ts */
export interface SkillNumbers {
  /** what an arrow of it deals of its element, points (Fire, Cold, Exploding, Freezing Arrow) */
  elem?: { type: string; min: number; max: number };
  /** how long its element holds on what it hits, seconds: Cold Arrow's chill, Freezing Arrow's freeze */
  elemSeconds?: number;
  /** its attack rating bonus: added flat for her, as for any unit but a hero, whose is a % (SUnitDmg.cpp:2472, 2516) */
  toHit?: number;
  /** % of the arrow's physical damage it turns into its element (D2R's Fire and Cold Arrow) */
  convertPct?: number;
  /** the blast where it lands, metres (Exploding Arrow's fire, Freezing Arrow's freeze) */
  blast?: number;
  /** an aura, buff or curse: what it puts on, for how long and how far round (Inner Sight on her foes) */
  aura?: { stats: { stat: string; value: number }[]; seconds: number; radius: number };
}

export interface MercSkill {
  /** its D2X_SKILLS key */
  skill: string;
  /** the level her band gives (what synergies read), and with her gear's bonus */
  base: number;
  level: number;
  /** the animation mode she casts it in (4: attack 1), and its weight in her choice (actionWeights) */
  mode: number;
  chance: number;
  chancePerLvl: number;
  numbers: SkillNumbers;
}

/** a skill's numbers for a caster (CalcCtx): only those it has */
export function skillNumbers(skill: string, ctx: CalcCtx): SkillNumbers {
  const row = D2X_SKILLS[skill];
  if (!row) throw new Error(`hireling: no skill ${skill} in D2X_SKILLS`);
  const out: SkillNumbers = {};
  const e = elemDamage(skill, ctx);
  if (e.type) out.elem = { type: e.type, min: e.min, max: e.max };
  const secs = elemSeconds(skill, ctx);
  if (secs > 0) out.elemSeconds = secs;
  if (row.toHit) out.toHit = toHitBonus(skill, ctx);
  const missile = row.missiles?.srv;
  const pct = missile ? convertPct(missile, ctx) : 0;
  if (pct > 0) out.convertPct = pct;
  const blast = skillBlastRadius(skill, ctx);
  if (blast !== undefined) out.blast = blast;
  if (row.aura) out.aura = { stats: auraStats(skill, ctx), seconds: auraSeconds(skill, ctx), radius: auraRadius(skill, ctx) };
  return out;
}

/**
 * Her skills at a level (MonsterAI.cpp:263-280): each of her band's once her level reaches its
 * reqlevel (Skills.txt), at Level + (u × LvlPerLvl >> 5), kept to 0–32; one at 0 she lacks. `bonus`
 * is her gear's +skills on one she has (+all, +elemental, +one skill: SKILLS_GetBonusSkillLevel,
 * D2Skills.cpp:1924-2000; class skills count only for heroes, 1944), the total kept to 0–99
 * (SKILLS_GetSkillLevel, 2003-2032). The numbers read her other skills' levels for synergies.
 */
export function mercSkills(h: HirelingRef, level: number, bonus: number | ((skill: string) => number) = 0): MercSkill[] {
  const b = bandAt(h, level);
  const u = level - b.level;
  const has: { s: D2xHirelingBand['skills'][number]; base: number; level: number }[] = [];
  for (const s of b.skills) {
    if (level < s.reqLvl) continue;
    const base = Math.min(Math.max(s.level + shr(u * whole(s.lvlPerLvl, 32), 5), 0), 32);
    if (base <= 0) continue;
    const add = typeof bonus === 'number' ? bonus : bonus(s.skill);
    has.push({ s, base, level: Math.min(Math.max(base + add, 0), 99) });
  }
  const skills: CalcCtx['skills'] = Object.fromEntries(has.map((k) => [k.s.skill, { blvl: k.base, lvl: k.level }]));
  return has.map((k) => ({
    skill: k.s.skill,
    base: k.base,
    level: k.level,
    mode: k.s.mode,
    chance: k.s.chance,
    chancePerLvl: k.s.chancePerLvl,
    numbers: skillNumbers(k.s.skill, { lvl: k.level, blvl: k.base, ulvl: level, skills }),
  }));
}

/** her choice of attack: a roll in 0 … total, where below `plain` she shoots her plain arrow */
export interface ActionWeights {
  plain: number;
  /** her skills in order, each taking the rolls from the last bound up to its own */
  skills: { skill: string; upTo: number }[];
  total: number;
}

/**
 * How she picks what to shoot (AITHINK_SelectHirelingAction, AiThink.cpp:9842-9946): DefaultChance for
 * her plain arrow (MonStats Skill1, RogueMissile, AiThink.cpp:9926-9928), then each skill she has adds
 * Chance + max(u, 0) × ChancePerLvl / 4; D2 rolls 0 … the sum (9896). `skip` leaves out a skill D2
 * passes over: one of AI type 1 whose state she already has (9877).
 */
export function actionWeights(h: HirelingRef, level: number, skip?: (skill: string) => boolean): ActionWeights {
  const row = hireling(h);
  const b = bandAt(row, level);
  const diff = Math.max(level - b.level, 0);
  let total = row.defaultChance;
  const skills: ActionWeights['skills'] = [];
  for (const s of mercSkills(row, level)) {
    if (skip?.(s.skill)) continue;
    total += s.chance + Math.floor((diff * s.chancePerLvl) / 4);
    skills.push({ skill: s.skill, upTo: total });
  }
  return { plain: row.defaultChance, skills, total };
}

/** what a roll in 0 … total picks (AiThink.cpp:9898-9919): a skill, or null for her plain arrow */
export function pickAction(w: ActionWeights, roll: number): string | null {
  if (roll < w.plain) return null;
  for (const s of w.skills) if (roll <= s.upTo) return s.skill;
  return null;
}

// ───────────────────────── experience and levels ─────────────────────────

/** her experience at least, at a level: its threshold at her band's Exp/Lvl (MonsterAI.cpp:226-230); what she has as hired */
export function xpAt(h: HirelingRef, level: number): number {
  return xpOf(level, bandAt(h, level).xpPerLvl);
}

/**
 * What her next level asks (STAT_NEXTEXP, MonsterAI.cpp:219-224): its threshold at her current band's
 * Exp/Lvl, 0 at the top. Reaching a band's first level this way, she is lifted to that band's own
 * threshold (xpAt), which asks more.
 */
export function nextXp(h: HirelingRef, level: number): number {
  return level < MERC_MAX_LEVEL ? xpOf(level + 1, bandAt(h, level).xpPerLvl) : 0;
}

/**
 * The level an amount of experience makes, counted up from 1 as her levelling does (SUnitDmg.cpp:
 * 3227-3234), at most MERC_MAX_LEVEL. D2 rebuilds a saved hireling's level this way (PlrSave2.cpp:
 * 1242-1265), though D2MOO's loop, as decompiled, ends one level past it.
 */
export function levelForXp(h: HirelingRef, xp: number): number {
  let level = 1;
  while (level < MERC_MAX_LEVEL && xp >= nextXp(h, level)) level++;
  return level;
}

/** the share she gets of a kill she did not make: 86 / 256 (SUnitDmg.cpp:2984-2987) */
const SHARE_256 = Math.round(D2X_HIRELING_XP.notKillerShare * 256);
/** at most this part of her level's span a kill (SUnitDmg.cpp:3124: >> 6) */
const CAP_DIV = Math.round(1 / D2X_HIRELING_XP.perKillCap);

/**
 * What a kill credited to her hero gives her (SUNITDMG_DistributeExperience, SUnitDmg.cpp:2926-2991):
 * a monster's experience as a hero of her level would get it, her gear's +% in (killXp, the same
 * SUNITDMG_ComputeExperienceGain), at most 1/64 of her level's span (3118-3125), then 86/256 of that
 * when she did not make the kill. The hero gets his whole share either way; a dead hireling gets
 * nothing (the pet lookup skips the dead, 2979). gainXp adds it.
 */
export function killShare(h: HirelingRef, level: number, monXp: number, monLevel: number, o: { killer: boolean; addXpPct?: number }): number {
  const perLvl = bandAt(h, level).xpPerLvl;
  const gain = killXp(monXp, level, monLevel, o.addXpPct ?? 0);
  const capped = Math.min(gain, Math.floor((xpOf(level + 1, perLvl) - xpOf(level, perLvl)) / CAP_DIV));
  return o.killer ? capped : Math.floor((SHARE_256 * capped) / 256);
}

/**
 * Experience added to her (SUNITDMG_AddExperienceForHireling, SUnitDmg.cpp:3194-3243): none while she
 * is at or above her hero's level or at the top; otherwise she climbs while the total reaches her
 * next level's threshold at the band she started the kill in, up to MERC_MAX_LEVEL. A new level
 * remakes her stats (mercStats, full life) and lifts her experience to its threshold (MonsterAI.cpp:
 * 226-230), which at a band's first level is more than she had.
 */
export function gainXp(h: HirelingRef, level: number, xp: number, gained: number, heroLevel: number): { level: number; xp: number; levelled: boolean } {
  if (gained <= 0 || level >= heroLevel || level >= MERC_MAX_LEVEL) return { level, xp, levelled: false };
  const total = xp + gained;
  const perLvl = bandAt(h, level).xpPerLvl;
  let next = level;
  do {
    if (xpOf(next + 1, perLvl) > total) break;
    next++;
  } while (next < MERC_MAX_LEVEL);
  if (next === level) return { level, xp: total, levelled: false };
  return { level: next, xp: Math.max(total, xpAt(h, next)), levelled: true };
}

// ───────────────────────── her gear ─────────────────────────

/** where she wears an item: a hireling has a head, a body and a weapon (her bow holds both hands) */
export type MercSlot = 'head' | 'body' | 'weapon';

/** each hireling's weapons by monster (PlrMsg.cpp:3931-3966): the Rogue's bows, Amazon bows among them (abow counts as bow) */
const MERC_WEAPONS: Record<string, string[]> = { roguehire: ['bow'] };

/**
 * Where a base goes on her (PlrMsg.cpp:3925-3940): any helm (circlets, primal helms and pelts count
 * as helms) or body armour, and her own weapons; nothing else (no shields, gloves, belts, boots or
 * jewellery, nor crossbows for the Rogue)
 */
export function mercSlot(b: ItemBase, h: HirelingRef = D2X_HIRELINGS[0]): MercSlot | null {
  const t = itypeSet(b.itype);
  if (t.has('helm')) return 'head';
  if (t.has('tors')) return 'body';
  if ((MERC_WEAPONS[hireling(h).monster] ?? []).some((w) => t.has(w))) return 'weapon';
  return null;
}

/**
 * Why she takes no item: 'quest', 'unidentified' and 'broken' D2 passes over without a word
 * (PlrMsg.cpp:3909-3914); the rest she refuses aloud (sound 0x55, 3973-3976)
 */
export type WearRefusal = 'quest' | 'unidentified' | 'broken' | 'not-hers' | 'class' | 'str' | 'dex' | 'level';

/** her strength, dexterity (gear in) and level, what an item's requirements are checked against */
export interface MercWearer {
  level: number;
  str: number;
  dex: number;
}

/**
 * Whether she takes an item the hero hands her (D2GAME_PACKETCALLBACK_Rcv0x61_DropPickupMercItem,
 * PlrMsg.cpp:3875-3987): no quest item, identified, not broken; one of her slots (mercSlot); then
 * ITEMS_CheckRequirements against her own stats (Items.cpp:1046-1165): strength, dexterity and level
 * met (a hero's class-level affix asks its plain level of her: her class id is no hero's), and no
 * class item, except D2R 2.7's equivalentcharclass (D2xHireling.cls, 'ama': Amazon bows), which
 * generalises D2MOO's Act 5 barbarian case (1149-1156). The first reason found is returned. The game
 * checks she is alive and near the hero (3895-3899); potions come first (mercDrinks).
 */
export function mercWear(item: Item, who: MercWearer, h: HirelingRef = D2X_HIRELINGS[0]): { slot: MercSlot } | { refused: WearRefusal } {
  const b = baseOf(item);
  if (!b || isUnknown(item)) return { refused: 'not-hers' };
  if (b.quest) return { refused: 'quest' };
  if (!isIdentified(item)) return { refused: 'unidentified' };
  if (isBroken(item)) return { refused: 'broken' };
  const slot = mercSlot(b, h);
  if (!slot) return { refused: 'not-hers' };
  if (b.classCode && b.classCode !== hireling(h).cls) return { refused: 'class' };
  const req = itemReqStats(item);
  if (who.str <= 0 || who.str < req.str) return { refused: 'str' };
  if (who.dex <= 0 || who.dex < req.dex) return { refused: 'dex' };
  if (who.level < itemReqLvl(item)) return { refused: 'level' };
  return { slot };
}

/** a potion she drinks when handed it: healing (rejuvenations count), thawing, antidote (PlrMsg.cpp:3916-3923) */
export function mercDrinks(item: Item): boolean {
  const b = baseOf(item);
  if (!b || isUnknown(item)) return false;
  const t = itypeSet(b.itype);
  return t.has('hpot') || t.has('wpot') || t.has('apot');
}

/** her gear never wears: only a hero's weapon and armour lose durability (SUnitDmg.cpp:2332, 2341) */
export const MERC_GEAR_WEARS = false;
