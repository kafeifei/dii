// D2 properties (Properties.txt codes) rolled into what an item keeps. Each code's function
// (Properties.txt func1, D2MOO D2Common ItemMods.cpp ITEMMODS_PropertyFuncNN) says what min, max
// and par mean: most roll one value from min to max, damage pairs and skill procs keep two numbers,
// per-level codes keep their amount per level. A rolled property is a D2Prop again, with min = max
// wherever D2 rolls one value, so the game's own propMods reads it unchanged. D2MOO references are
// to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { D2X_CLASSES } from '../../data/d2x/classes';
import type { D2Prop } from '../../data/d2x/types';
import { hasDurability, itemMaxSockets } from './bases';
import { CLASS_SKILL_BY_NAME, CLASS_SKILLS } from './classskills';
import { roll, rollRange } from './rand';
import type { D2Base, Rand } from './types';

/** C integer division, toward zero */
const idiv = (a: number, b: number) => Math.trunc(a / b);

/** funcs 15 / 16 (and 17 for the length): min is the low damage, max the high one, par a length (Properties.txt func1–3) */
const PAIRS = new Set(['dmg-fire', 'dmg-ltng', 'dmg-mag', 'dmg-cold', 'dmg-pois', 'dmg-norm', 'dmg-elem', 'dmg-throw']);
/** func 11: par a skill, min the % chance, max its level */
const PROCS = new Set(['hit-skill', 'gethit-skill', 'att-skill', 'kill-skill', 'death-skill', 'levelup-skill']);
/** func 17 without a level in it: the value is par (rep-dur, rep-quant), else rolled (fade) */
const FUNC17 = new Set(['fade', 'rep-dur', 'rep-quant']);

/** a "+N per character level" code (func 17, ItemStatCost op 2 / 4 / 5 with op base "level") */
export const isPerLevel = (c: string) => c.endsWith('/lvl');

/**
 * ItemStatCost "op param" of the per-level stats: the shift the level product takes (D2Common
 * D2StatList.cpp:231-330, value × level >> param). Eighths of a point per level, but attack rating
 * per level is in halves.
 */
const HALVES = new Set(['att/lvl', 'att%/lvl', 'att-dem/lvl', 'att-und/lvl']);
export const perLevelShift = (c: string) => (HALVES.has(c) ? 1 : 3);

/**
 * A rolled property's value at a character level: a per-level one's amount × clvl shifted down
 * (floored, D2StatList.cpp:250), anything else its rolled value (min).
 */
export function propValue(p: D2Prop, clvl = 1): number {
  if (!isPerLevel(p.c)) return p.min;
  return (Number(p.p ?? p.min) * clvl) >> perLevelShift(p.c);
}

/** rolled properties worked out at a character level, for showing them: per-level ones become flat (min = max) */
export function propsAt(props: readonly D2Prop[], clvl: number): D2Prop[] {
  return props.map((p) => {
    if (!isPerLevel(p.c)) return p;
    const v = propValue(p, clvl);
    return { ...p, min: v, max: v };
  });
}

// Skills.txt *Id of each class's first skill; its 30 skills follow in CLASS_SKILLS order
const SKILL_ID_BASE: Record<string, number> = { ama: 6, sor: 36, nec: 66, pal: 96, bar: 126, dru: 221, ass: 251 };
/** a class skill's D2 name by Skills.txt id, for skill-rand's id range */
function skillById(id: number): string | undefined {
  for (const [cls, base] of Object.entries(SKILL_ID_BASE)) if (id >= base && id < base + 30) return CLASS_SKILLS[cls]?.[id - base]?.[0];
  return undefined;
}

/** class codes by PlayerClass.txt row (ama 0 … ass 6): what randclassskill rolls */
const CLASS_BY_ID = Object.entries(D2X_CLASSES)
  .sort((a, b) => a[1].id - b[1].id)
  .map(([code]) => code);

/** Skills.txt maxlvl: 20 for every class skill, and D2 takes 20 where it is 0 (ItemMods.cpp:3667) */
const SKILL_MAX_LVL = 20;

/**
 * The level of a proc or charged skill (ItemMods.cpp:3635-3700 func 11, 3787-3860 func 19): max
 * when above 0; 0 is (ilvl − the skill's reqlevel) / 4 + 1 kept to 1 … 20; below 0, the item level
 * past the reqlevel over (99 − reqlevel) / −max, at least 1.
 */
export function skillLevel(skill: string, max: number, ilvl: number): number {
  if (max > 0) return max;
  const req = CLASS_SKILL_BY_NAME[skill]?.[1] ?? 0;
  if (max < 0) {
    const div = Math.max(idiv(Math.max(99 - req, 1), -max), 1);
    return Math.max(idiv(ilvl - req, div), 1);
  }
  return Math.min(Math.max(idiv(ilvl - req, 4) + 1, 1), SKILL_MAX_LVL);
}

/** randclassskill's skill levels: Properties.txt val1, which func 36 takes as the value (ItemMods.cpp:4130-4143) */
const RAND_CLASS_SKILL_LEVELS = 3;

export interface RolledProps {
  props: D2Prop[];
  /** sock: the sockets the item comes with (func 14) */
  sockets?: number;
  /** ethereal: made ethereal (func 23) */
  eth?: true;
  /**
   * dur: points of most durability (Properties.txt dur, func 1 into maxdurability). Kept here and
   * not in props: the item's maxDur takes them, and the stat has no tooltip line (ItemStatCost
   * maxdurability has no descfunc), so props never count them twice. A set item's switched bonus
   * slot is the one exception: it keeps its own as a dur property (legendary.ts rollSetItem).
   */
  dur?: number;
  /** charged: charges left by skill, the starting count func 19 rolls */
  charges?: Record<string, number>;
}

/**
 * Rolls properties in order (ITEMMODS_AssignProperty, ItemMods.cpp:2329-2508, through
 * D2COMMON_11292_ItemAssignProperty, 4309-4334): `b` and `ilvl` are the item the functions work
 * on and its level, which funcs 11, 14, 19 and 23 read: the item's own base, or for a runeword its
 * last rune (makeRuneword). A value that rolls 0 is not added (ITEMMODS_AddPropertyToItemStatList,
 * ItemMods.cpp:2877-2885).
 */
export function rollProps(props: readonly D2Prop[], b: D2Base, ilvl: number, rng: Rand): RolledProps {
  const out: RolledProps = { props: [] };
  const one = (p: D2Prop, v: number) => {
    if (v) out.props.push({ ...p, min: v, max: v });
  };
  for (const p of props) {
    if (PAIRS.has(p.c)) {
      out.props.push({ ...p });
    } else if (PROCS.has(p.c)) {
      // a chance of 0 or less is 5% (ItemMods.cpp:3646-3648)
      out.props.push({ ...p, min: p.min > 0 ? p.min : 5, max: skillLevel(String(p.p), p.max, ilvl) });
    } else if (p.c === 'charged') {
      // func 19 (ItemMods.cpp:3787-3896): charges from min (0: 5; below 0: by the level), 1 … 255,
      // and it starts with n/8 + 1 … n of them
      const skill = String(p.p);
      const lvl = skillLevel(skill, p.max, ilvl);
      let n = p.min;
      if (!n) n = 5;
      else {
        if (n < 0) n = idiv(lvl * -n, 8) - n;
        n = n > 1 ? Math.min(n, 255) : 1;
      }
      out.props.push({ ...p, min: n, max: lvl });
      (out.charges ??= {})[skill] = roll(rng, n - (n >> 3)) + (n >> 3) + 1;
    } else if (isPerLevel(p.c) || FUNC17.has(p.c)) {
      // func 17 (ItemMods.cpp:4002-4064): par is the value; without one it rolls min … max
      const v = Number(p.p ?? 0) || rollRange(rng, p.min, p.max);
      if (v) out.props.push({ ...p, p: v, min: v, max: v });
    } else if (p.c === 'sock') {
      // func 14 (ItemMods.cpp:3703-3785): min … max, else par; at least 1, at most the item's
      // cells and ITEMS_GetMaxSockets (its GemSockets and its type's MaxSock at the item level)
      let n = rollRange(rng, p.min, p.max);
      if (n <= 0) n = Number(p.p ?? 0);
      n = Math.min(Math.max(n, 1), b.w * b.h, itemMaxSockets(b, ilvl));
      if (n > 0) {
        out.sockets = n;
        one(p, n);
      }
    } else if (p.c === 'ethereal') {
      // func 23 (ItemMods.cpp:4296-4305, 2531-2550): the flag and ×1.5 damage or defense, durability as it is
      if (hasDurability(b)) out.eth = true;
    } else if (p.c === 'indestruct') {
      // func 20 (ItemMods.cpp:4066-4082): the stat at 1, whatever the row says
      one(p, 1);
    } else if (p.c === 'dur') {
      // Properties.txt dur: func 1 into maxdurability (ItemMods.cpp:2828-2875), which leaves the
      // current durability alone (only func 13, dur%, repairs to the new most: 4233-4294)
      const v = rollRange(rng, p.min, p.max);
      if (v) out.dur = (out.dur ?? 0) + v;
    } else if (p.c === 'skill-rand') {
      // func 12 (ItemMods.cpp:4189-4231): a skill id rolled from min … max, at level par: an item_singleskill
      const id = rollRange(rng, p.min, p.max);
      const lvl = Number(p.p ?? 0);
      if (lvl) out.props.push({ c: 'skill', p: skillById(id) ?? String(id), min: lvl, max: lvl });
    } else if (p.c === 'randclassskill') {
      // func 36 (ItemMods.cpp:4130-4143): a class rolled from min … max gets +3 to its skills
      const cls = CLASS_BY_ID[rollRange(rng, p.min, p.max)];
      if (cls) out.props.push({ c: cls, min: RAND_CLASS_SKILL_LEVELS, max: RAND_CLASS_SKILL_LEVELS });
    } else {
      // funcs 1–10, 21, 22, 24: one value from min … max (func 3's later stats reuse func 1's, so
      // res-all and all-stats are one roll: ItemMods.cpp:2972-3023)
      one(p, rollRange(rng, p.min, p.max));
    }
  }
  return out;
}
