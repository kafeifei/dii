// Diablo II's numbers for a monster: its MonStats.txt row at a level in a difficulty, and what being a
// champion, a unique or a unique's minion does to them (MonUMod.txt). Pure functions; src/game/monster.ts
// makes a Monster of them, src/game/spawn.ts decides who is what.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f. Integer steps are D2's.
import { FRAMES_PER_SEC, M_PER_SUBTILE, MPS_PER_VELOCITY, VELOCITY_PER_SUBTILE } from '../../core/units';
import { D2X_DIFFICULTIES } from '../../data/d2x/difficulty';
import { D2X_MISSILES } from '../../data/d2x/missiles';
import { D2X_MONLVL } from '../../data/d2x/monlvl';
import { D2X_MONSTERS } from '../../data/d2x/monsters';
import { D2X_SKILLS } from '../../data/d2x/skills';
import { D2X_MONUMOD_CONSTANTS, D2X_MONUMODS } from '../../data/d2x/superuniques';
import type { D2xBands, D2xLenBands, D2xMonster } from '../../data/d2x/types';
import { percentOf } from './xp';

export type MonRank = 'normal' | 'champion' | 'unique' | 'minion' | 'boss';
export type AttackMode = 'a1' | 'a2' | 's1';

/** MonUMod.txt's constants column by row (MONSTERUNIQUE_GetMonUModTxtRecord(i)->dwConstants) */
const C = D2X_MONUMOD_CONSTANTS.map((c) => c.value);

/** the modifiers by id (MonUMod.txt; D2MOO's MONUMOD_*, D2Monsters.h:80-125) */
export const UMOD = new Map(D2X_MONUMODS.map((u) => [u.id, u]));
/** the champion types: champion, ghostly, fanatic, possessed, berserk (MonUMod.txt's champion column) */
export const CHAMPION_TYPES = D2X_MONUMODS.filter((u) => u.champion).map((u) => u.id);
/** what a champion's pack mates are made (MONUMOD_CHAMPMODS, MonsterRegion.cpp:690-697) */
export const CHAMPMODS = 16;

/** a MonLvl.txt value × a MonStats.txt % (DATATBLS_ApplyRatio, MonsterTbls.cpp:932-960: CalculatePercentage's steps) */
export const ratio = (value: number, pct: number) => percentOf(value, pct, 100);

/** MonLvl.txt's row at a level, kept to the table (DATATBLS_CalculateMonsterStatsByLevel, MonsterTbls.cpp:571-578) */
export function monLvl(level: number) {
  return D2X_MONLVL[Math.min(Math.max(0, level), D2X_MONLVL.length - 1)];
}

/**
 * The level a monster spawns at (MONSTER_InitializeStatsAndSkills, Monster.cpp:196-201): its row's own
 * in normal; in nightmare and hell the area's (MonLvlEx) unless the row is a boss or noRatio. Champions,
 * uniques and minions add theirs on top (monStats).
 */
export function spawnLevel(row: D2xMonster, difficulty: number, areaLevel: number): number {
  if (difficulty > 0 && !row.noRatio && !row.boss) return areaLevel;
  return row.diff[difficulty].level;
}

/** a monster's damage and to-hit in one attack mode */
export interface MonAttack {
  min: number;
  max: number;
  ar: number;
}

/**
 * A mode's damage and to-hit at a level (DATATBLS_CalculateMonsterStatsByLevel flags 8/16/32,
 * MonsterTbls.cpp:627-678; MonsterMode.cpp:216-238 reads them at the monster's level, the champion's
 * and unique's bonus included, as it attacks), with the damage % and to-hit % its modifiers give
 * (STAT_DAMAGEPERCENT; STAT_ITEM_TOHIT_PERCENT, SUnitDmg.cpp:2534). Undefined if it has no such mode.
 */
export function attackAt(row: D2xMonster, difficulty: number, level: number, mode: AttackMode, dmgPct = 0, arPct = 0): MonAttack | undefined {
  const p = row.diff[difficulty][mode];
  if (!p) return undefined;
  const L = monLvl(level);
  const [min, max, th] = row.noRatio ? p : [ratio(L.dm[difficulty], p[0]), ratio(L.dm[difficulty], p[1]), ratio(L.th[difficulty], p[2])];
  return { min: min + percentOf(min, dmgPct, 100), max: max + percentOf(max, dmgPct, 100), ar: th + percentOf(th, arPct, 100) };
}

/** elemental damage an attack may carry: the type, % chance, min, max and length in frames */
export interface MonElem {
  type: string;
  pct: number;
  min: number;
  max: number;
  frames: number;
}

/**
 * A mode's elemental damage at a level (MonsterMode.cpp:262-330): MonStats El1–El3 for the mode, each
 * landing with its % chance, its damage a % of MonLvl's damage. Poison goes in ×10 a frame in 256ths
 * over twice the length (301-304), so `min`/`max` here are poison's whole damage over `frames`.
 */
export function attackElems(row: D2xMonster, difficulty: number, level: number, mode: AttackMode): MonElem[] {
  const L = monLvl(level);
  const out: MonElem[] = [];
  for (const e of row.diff[difficulty].el ?? []) {
    if (e.mode.toLowerCase() !== mode) continue;
    const [lo, hi] = row.noRatio ? e.dmg : [ratio(L.dm[difficulty], e.dmg[0]), ratio(L.dm[difficulty], e.dmg[1])];
    if (e.type === 'pois') {
      const frames = 2 * e.len;
      out.push({ type: e.type, pct: e.pct, min: (10 * lo * frames) / 256, max: (10 * hi * frames) / 256, frames });
    } else out.push({ type: e.type, pct: e.pct, min: lo, max: hi, frames: e.len });
  }
  return out;
}

/** a burst as a monster dies: as much physical as fire, the cold's chill in seconds, and its reach in metres */
export interface DeathBurst {
  phys: number;
  fire: number;
  cold: [number, number];
  chill: number;
  radius: number;
}

/**
 * A fire-enchanted champion's or unique's burst as it dies, not a minion's (MONSTERUNIQUE_FireEnchantedModeChange
 * sets it off only with bUnique, MonsterUnique.cpp:1052-1058; MONSTERUNIQUE_CastCorpseExplode,
 * 1062-1089): its row's MaxHP at its level × the difficulty's explosion % (D2R's
 * DifficultyLevels MonsterFireEnchantExplosionDamagePercent; the 1.13 code D2MOO follows reads
 * MonsterCEDamagePercent, which D2R split off for this), from 60 % of that up, rolled whole and put
 * in << 6 of 256ths: a quarter of it as physical and as much as fire, on what is within difficulty + 4 subtiles
 */
export function fireEnchantBurst(row: D2xMonster, difficulty: number, level: number, roll: (lo: number, hi: number) => number): DeathBurst {
  const t = row.diff[difficulty];
  const hp = row.noRatio ? t.hp[1] : ratio(monLvl(level).hp[difficulty], t.hp[1]);
  const max = percentOf(hp, D2X_DIFFICULTIES[difficulty].fireEnchantExplosionDamage, 100);
  const min = percentOf(max, 60, 100);
  // ITEMS_RollLimitedRandomNumber(max − min): [0, max − min)
  const v = min + (max > min ? roll(0, max - min - 1) : 0);
  return { phys: v / 4, fire: v / 4, cold: [0, 0], chill: 0, radius: (difficulty + 4) * M_PER_SUBTILE };
}

/**
 * How far a missile flies in its Range: its velocity at 75 % (Missiles.cpp:144-147), its Accel added
 * every fifth frame (PathMisc.cpp:1137-1157), a velocity point a sixteenth of a subtile a frame; metres
 */
export function missileReach(id: string, vel = D2X_MISSILES[id]?.vel?.base ?? 0): number {
  const m = D2X_MISSILES[id];
  if (!m) return 0;
  let v = Math.trunc((75 * (vel << 8)) / 100);
  let subtiles = 0;
  for (let f = 1, n = 0; f <= m.range[0] && v > 0; f++) {
    if (m.vel?.accel && ++n >= 5) {
      v = Math.max(0, v + m.vel.accel);
      n = 0;
    }
    subtiles += v / 256 / VELOCITY_PER_SUBTILE;
  }
  return subtiles * M_PER_SUBTILE;
}

/**
 * A cold-enchanted champion's or unique's ring of frost as it dies (MONSTERUNIQUE_CastColdUniqueMissile,
 * MonsterUnique.cpp:1206-1215): 64 coldunique missiles out from it at half its level and Frost Nova's
 * velocity (Skills.cpp:3205-3238), each with the missile's own cold at that level
 */
export function coldEnchantBurst(level: number): DeathBurst {
  const own = missileDamage('coldunique', Math.max(1, Math.trunc(level / 2)));
  const e = own?.elem;
  return { phys: 0, fire: 0, cold: e ? [e.min, e.max] : [0, 0], chill: e?.seconds ?? 0, radius: missileReach('coldunique', D2X_MISSILES.frostnova?.vel?.base) };
}

/** a lightning-enchanted monster's charged bolts: each one's lightning, speed (m/s) and seconds (lightunique) */
export function lightEnchantBolts(level: number): { light: [number, number]; speed: number; life: number } {
  const m = D2X_MISSILES.lightunique;
  const e = missileDamage('lightunique', Math.max(1, Math.trunc(level / 2)))?.elem;
  return { light: e ? [e.min, e.max] : [0, 0], speed: ((m?.vel?.base ?? 0) * 75 * MPS_PER_VELOCITY) / 100, life: (m?.range[0] ?? 0) / FRAMES_PER_SEC };
}

/** D2's level bands (SKILLS_CalculateDamageBonusByLevel, D2Skills.cpp:2477-2505) */
export function bandsAt(b: D2xBands, level: number): number {
  const L = Math.max(1, level);
  const seg = (from: number, to: number) => Math.max(0, Math.min(L, to) - from + 1);
  return b[0] + b[1] * (Math.min(L, 8) - 1) + b[2] * seg(9, 16) + b[3] * seg(17, 22) + b[4] * seg(23, 28) + b[5] * Math.max(0, L - 28);
}

/** a length by D2's bands (D2Skills.cpp:2742-2785), in seconds as the table has it */
function lenAt(b: D2xLenBands, level: number): number {
  const L = Math.max(1, level);
  return b[0] + b[1] * (Math.min(L, 8) - 1) + b[2] * Math.max(0, Math.min(L, 16) - 8) + b[3] * Math.max(0, L - 16);
}

/** what a missile adds of its own: physical and elemental damage at its level */
export interface MissileDamage {
  /** the share of the attacker's mode damage it carries (SrcDamage / 128) */
  src: number;
  phys: [number, number];
  elem?: { type: string; min: number; max: number; seconds: number };
}

/**
 * A monster missile's own damage (Missiles.txt MinDamage/MaxDamage and EMin/EMax by level bands).
 * Poison's EMin/EMax are a frame's, so its whole damage is that × its length.
 */
export function missileDamage(id: string, level: number): MissileDamage | undefined {
  const m = D2X_MISSILES[id];
  if (!m) return undefined;
  const phys: [number, number] = m.phys ? [bandsAt(m.phys.min, level), bandsAt(m.phys.max, level)] : [0, 0];
  let elem: MissileDamage['elem'];
  if (m.elem?.type && m.elem.min && m.elem.max) {
    const seconds = m.elem.len ? lenAt(m.elem.len, level) : 0;
    const per = m.elem.type === 'pois' ? seconds * FRAMES_PER_SEC : 1;
    elem = { type: m.elem.type, min: bandsAt(m.elem.min, level) * per, max: bandsAt(m.elem.max, level) * per, seconds };
  }
  return { src: m.srcNone ? 0 : (m.src ?? 0), phys, elem };
}

/** the row's place in its class, BaseId → NextInClass (DATATBLS_GetMonsterChainInfo, MonsterTbls.cpp:434-456) */
export function chainIndex(row: D2xMonster): number {
  let i = 0;
  for (let id: string | undefined = row.base ?? row.id; id && i < 256; id = D2X_MONSTERS[id]?.next, i++) if (id === row.id) return i;
  return 0;
}

/**
 * A skill's server missile as a monster flies it: Shaman Fire and Unholy Bolt (SrvDo085) the
 * missile *ID its place in its class further on, shafire2 for fallenshaman2 (SkillMonst.cpp:176-187)
 */
export function skillMissile(row: D2xMonster, skill: string): string | undefined {
  const sk = D2X_SKILLS[skill];
  const id = sk?.missiles?.srvA ?? sk?.missiles?.srv;
  if (!id || !D2X_MISSILES[id]) return undefined;
  if (sk?.funcs?.do !== 85) return id;
  const want = D2X_MISSILES[id].id + chainIndex(row);
  return Object.keys(D2X_MISSILES).find((k) => D2X_MISSILES[k].id === want) ?? id;
}

/**
 * The missile a monster shoots and the level it flies at: an attack mode's (MonStats2 missiles) at
 * the difficulty's MonsterSkillBonus + 1 (MonsterMode.cpp:1341-1350), else a skill's server missile
 * (the shaman's fire) at the skill's level, which the difficulty raises as much (Monster.cpp:247-262, 481)
 */
export function monsterMissile(row: D2xMonster, difficulty: number): { mode: AttackMode; missile: string; level: number; skill?: string } | undefined {
  const bonus = D2X_DIFFICULTIES[difficulty].monsterSkillBonus;
  for (const mode of ['a1', 'a2', 's1'] as const) {
    const id = row.missiles?.[mode];
    if (id && D2X_MISSILES[id]) return { mode, missile: id, level: bonus + 1 };
  }
  for (const s of row.skills ?? []) {
    const id = skillMissile(row, s.skill);
    if (id) return { mode: 's1', missile: id, level: s.lvl + bonus, skill: s.skill };
  }
  return undefined;
}

/**
 * A missile's flight at a level: its speed in m/s, Vel + lvl × VelLev / 8 (perLvl, the import's
 * VelLev / 8), at 75 % (Missiles.cpp:120-147; MaxVel only caps one speeding up, not its start), and
 * its life in seconds, Range + LevRange/lvl (205-208)
 */
export function missileFlight(id: string, level: number): { speed: number; life: number } {
  const m = D2X_MISSILES[id];
  if (!m) return { speed: 0, life: 0 };
  const v = m.vel ? m.vel.base + Math.floor(Math.max(0, level) * m.vel.perLvl) : 0;
  return { speed: ((v * 75) / 100) * MPS_PER_VELOCITY, life: (m.range[0] + m.range[1] * level) / FRAMES_PER_SEC };
}

/** resistances in %, D2's six */
export interface MonRes {
  phys: number;
  magic: number;
  fire: number;
  light: number;
  cold: number;
  poison: number;
}

/** elemental damage a modifier puts on every attack, min–max, and cold's chill in frames */
export interface MonPlus {
  fire?: [number, number];
  light?: [number, number];
  cold?: [number, number];
  /** mana burn */
  mana?: [number, number];
  coldFrames?: number;
}

export interface MonStats {
  /** the level its life, defense and experience are worked out at (spawnLevel) */
  baseLevel: number;
  /** STAT_LEVEL: with the champion's or unique's levels, what its attacks, the hit roll and its drop go by */
  level: number;
  /** MinHP–MaxHP at the base level, before any bonus */
  hp: [number, number];
  life: number;
  defense: number;
  xp: number;
  /** life regained a second */
  regen: number;
  res: MonRes;
  /** STAT_DAMAGEPERCENT and STAT_ITEM_TOHIT_PERCENT from its modifiers */
  dmgPct: number;
  arPct: number;
  plus: MonPlus;
  /**
   * its velocity %: 75 for every monster (Monster.cpp:214) and its modifiers'; an AI adds to it move
   * by move (AITACTICS_SetVelocity, src/game/ai.ts), and the walk is MonStats Velocity × it, at
   * least 25 % (Units.cpp:1683-1702)
   */
  velPct: number;
  walk: number;
  /** % of the hero's leech that works on it (SUnitDmg.cpp:1154-1228) */
  drain: number;
  /** its speed while chilled, % change */
  coldEffect: number;
}

const cdb = (d: number) => D2X_DIFFICULTIES[d].championDamageBonus;
const add = (a: [number, number] | undefined, b: [number, number]): [number, number] => (a ? [a[0] + b[0], a[1] + b[1]] : b);
const fast = (velocity: number) => Math.min(100, Math.max(10, Math.trunc(2048 / velocity) - 128));

/**
 * A monster's numbers (MONSTER_InitializeStatsAndSkills, Monster.cpp:196-228): life rolled between
 * MinHP and MaxHP, defense and experience at its base level, regen max life × Regen / 4096 a frame;
 * then a champion's, unique's or minion's modifiers 1–4 (MonsterUnique.cpp:2548-2558: life bonus,
 * +3 levels and experience ×5) and its own (`mods`, MonUMod ids) in order, as
 * MONSTERUNIQUE_InitializeUMod runs them on the leader (bUnique) and on its minions (not).
 * `roll(lo, hi)` picks a whole number in [lo, hi].
 */
export function monStats(row: D2xMonster, difficulty: number, baseLevel: number, rank: MonRank, mods: readonly number[], roll: (lo: number, hi: number) => number): MonStats {
  const d = difficulty;
  const t = row.diff[d];
  const L = monLvl(baseLevel);
  const hp: [number, number] = row.noRatio ? [t.hp[0], t.hp[1]] : [ratio(L.hp[d], t.hp[0]), ratio(L.hp[d], t.hp[1])];
  let life = roll(hp[0], hp[1]);
  let defense = row.noRatio ? t.ac : ratio(L.ac[d], t.ac);
  let xp = row.noRatio ? t.xp : ratio(L.xp[d], t.xp);
  // in 256ths of a point a frame: (life << 8) × Regen >> 12 (Monster.cpp:228)
  let regenPerFrame = (life * 256 * row.regen) >> 12;
  let level = baseLevel;
  const [phys, magic, fire, light, cold, poison] = t.res;
  const res: MonRes = { phys, magic, fire, light, cold, poison };
  let dmgPct = 0;
  let arPct = 0;
  let armorPct = 0;
  // every monster starts at 75 % velocity (Monster.cpp:214)
  let velPct = 75;
  const plus: MonPlus = {};
  const leader = rank === 'champion' || rank === 'unique';
  const champion = rank === 'champion';

  if (leader || rank === 'minion') {
    // UMod2, the life bonus (MonsterUnique.cpp:179-235): a champion's or unique's, and no regen; a minion's
    const k = champion ? 4 + d : leader ? 7 + d : 1 + d;
    life += percentOf(life, C[k], 100);
    if (leader) regenPerFrame = 0;
    // UMod4: three levels, five times the experience (268-275)
    level += 3;
    xp *= 5;
  }

  /** UMod8's resistances (445-590), a leader's only, while it has fewer than two immunities */
  const resistant = (mod: number) => {
    if (!leader) return;
    if (mod === 28) defense *= 2;
    let imm = [res.fire, res.light, res.cold, res.poison, res.phys, res.magic].filter((v) => v >= 100).length;
    if (imm >= 2) return;
    switch (mod) {
      case 8:
        // magic resistant: +40 cold, fire, lightning, stopping at a second immunity
        for (const k of ['cold', 'fire', 'light'] as const) {
          if (imm >= 2) break;
          if (res[k] < 100) {
            res[k] += 40;
            if (res[k] >= 100) imm++;
          }
        }
        break;
      case 9:
        res.fire += 75;
        break;
      case 18:
        res.cold += 75;
        break;
      case 17:
        res.light += 75;
        break;
      case 23:
        res.poison += 75;
        break;
      case 25:
        res.magic += 20;
        break;
      case 27:
        // spectral hit: +20 to each under 75
        for (const k of ['cold', 'fire', 'light'] as const) {
          if (imm >= 2) break;
          if (res[k] < 75) {
            res[k] += 20;
            if (res[k] >= 100) imm++;
          }
        }
        break;
      case 28:
        res.phys += 50;
        break;
    }
  };
  /** an enchantment's damage on every attack at the level it has by then (720-930): a leader's share or a minion's */
  const enchant = (mod: number) => {
    const dm = monLvl(Math.max(1, level)).dm[d];
    const [lo, hi] = leader ? [C[28 + d], C[31 + d]] : [C[16 + d], C[19 + d]];
    const v: [number, number] = [Math.trunc((dm * lo) / 100), Math.trunc((dm * hi) / 100)];
    if (mod === 9) plus.fire = add(plus.fire, v);
    else if (mod === 17) plus.light = add(plus.light, v);
    else if (mod === 18) {
      plus.cold = add(plus.cold, v);
      plus.coldFrames = (plus.coldFrames ?? 0) + 5 * level + 100;
    } else if (mod === 25) plus.mana = add(plus.mana, v);
    resistant(mod);
  };
  /** UMod16, the champion (278-335): a level back, 2/5 of the experience off, damage and to-hit up, faster */
  const championize = (mod: number) => {
    level -= 1;
    xp -= 2 * Math.trunc(xp / 5);
    dmgPct += Math.trunc((C[11] * cdb(d)) / 100);
    arPct += Math.trunc((C[10] * cdb(d)) / 100);
    if (row.velocity <= 0 || mod === 36) return;
    velPct += mod === 37 ? fast(row.velocity) : 20;
  };

  for (const mod of mods) {
    switch (mod) {
      case 5: {
        // extra strong (658-700)
        const [dk, ak] = leader ? [15, 13] : [14, 12];
        dmgPct += Math.trunc((C[dk] * cdb(d)) / 100);
        arPct += Math.trunc((C[ak] * cdb(d)) / 100);
        break;
      }
      case 6:
        // extra fast (702-718), minions too
        if (row.velocity > 0) velPct += fast(row.velocity);
        break;
      case 8:
      case 27:
      case 28:
        resistant(mod);
        break;
      case 9:
      case 17:
      case 18:
      case 25:
        enchant(mod);
        break;
      case 16:
        if (champion) championize(mod);
        break;
      case 36: {
        // ghostly (338-382): 80 % physical resistance, a champion, cold on its blows for 150 frames
        if (!champion) break;
        res.phys = 80;
        championize(mod);
        const dm = monLvl(Math.max(1, level)).dm[d];
        plus.cold = add(plus.cold, [Math.trunc((dm * C[22 + d]) / 100), Math.trunc((dm * C[25 + d]) / 100)]);
        plus.coldFrames = (plus.coldFrames ?? 0) + 150;
        break;
      }
      case 37:
        // fanatic (384-392): −70 % defense
        if (!champion) break;
        armorPct = -70;
        championize(mod);
        break;
      case 38:
        // possessed (394-411): twice the life
        if (!champion) break;
        life *= 2;
        championize(mod);
        break;
      case 39:
        // berserk (413-434): a quarter of the life, +300 % damage and to-hit, and no UMod16 (no level back)
        if (!champion) break;
        life += percentOf(life, -75, 100);
        dmgPct += Math.trunc((300 * cdb(d)) / 100);
        arPct += Math.trunc((300 * cdb(d)) / 100);
        break;
      default:
        // curse, teleport, multishot, aura: what they do is how it fights, not its numbers
        break;
    }
  }

  defense += percentOf(defense, armorPct, 100);
  return {
    baseLevel,
    level,
    hp,
    life: Math.max(1, life),
    defense: Math.max(0, defense),
    xp,
    regen: (regenPerFrame * FRAMES_PER_SEC) / 256,
    res,
    dmgPct,
    arPct,
    plus,
    velPct,
    walk: (row.velocity * Math.max(25, velPct)) / 100,
    drain: t.drain,
    coldEffect: t.coldEffect,
  };
}
