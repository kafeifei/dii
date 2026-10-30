// An item's property lines, the way Diablo II's tooltip writes them: each property becomes the
// stats Properties.txt says it sets (D2X_PROPERTIES), stats of the same id and parameter add up,
// the pairs and groups the client writes as one line are joined (damage ranges, "+X% Enhanced
// Damage", all resistances, all attributes), and each line is the stat's ItemStatCost string
// (D2X_STAT_DESC, official Simplified Chinese) filled by its descfunc, highest descpriority first.
// D2MOO has no client: the descfuncs follow ItemStatCost.txt's documented meanings (Phrozen Keep)
// and D2R's strings, which carry their own printf placeholders (descfunc 19).
import { FRAMES_PER_SEC } from '../../core/units';
import { D2X_PROPERTIES, D2X_STAT_DESC, D2X_TOOLTIP_STRINGS } from '../../data/d2x/statdesc';
import type { D2Prop, D2xStatDesc } from '../../data/d2x/types';

/** what the lines need from the game: names it owns (skills, classes, trees, monsters) */
export interface DescribeCtx {
  /** character level, for per-level stats */
  clvl: number;
  /** a skill's shown name by its D2 name, and the class code it belongs to */
  skillName(skill: string): string;
  skillClass(skill: string): string | undefined;
  /** a class's name by its D2 code (ama, sor, …) */
  className(code: string): string;
  /** a skill tree's name by the skilltab parameter */
  tabName(tab: number): string;
  /** a monster's name by its hcIdx (reanimate) */
  monsterName?(id: number): string | undefined;
  /** charges left, by skill (charged properties show left/most) */
  charges?: Record<string, number>;
}

export interface DescLine {
  text: string;
  pri: number;
  /** the property codes behind it, and their parameters: the caller greys what does nothing here */
  codes: string[];
  props: D2Prop[];
}

/** PlayerClass.txt row → class code (item_addclassskills' parameter, Properties.txt val1) */
const CLASS_BY_ID = ['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war'];

/** D2R's printf: %d / %i / %+d / %s in turn, %N for argument N, %% a percent sign */
export function fmt(str: string, ...args: (number | string)[]): string {
  let i = 0;
  return str.replace(/%(%|\d|\+d|d|i|s)/g, (_m, k: string) => {
    if (k === '%') return '%';
    if (/^\d$/.test(k)) return String(args[+k] ?? '');
    const v = args[i++];
    if (k === '+d') return `${Number(v) >= 0 ? '+' : ''}${Math.trunc(Number(v))}`;
    if (k === 's') return String(v ?? '');
    return String(Math.trunc(Number(v ?? 0)));
  });
}

const S = D2X_TOOLTIP_STRINGS;

/** "(仅限<class>)" as D2R's SorOnly, PalOnly… strings write it (half-width brackets), with our class name */
export const classOnly = (cls: string) => `(仅限${cls})`;

interface Stat {
  stat: string;
  param?: string | number;
  /** the value (a proc's chance, a charge's most charges) */
  v: number;
  /** a proc's or charge's skill level, a pair's length */
  lvl?: number;
  codes: Set<string>;
  props: D2Prop[];
}

const desc = (stat: string): D2xStatDesc | undefined => D2X_STAT_DESC[stat];
const pri = (stat: string) => desc(stat)?.pri ?? 0;

/** the stats one rolled property sets, by its Properties.txt funcs */
function expand(p: D2Prop): Omit<Stat, 'codes' | 'props'>[] {
  const list = D2X_PROPERTIES[p.c];
  if (!list) return [];
  const out: Omit<Stat, 'codes' | 'props'>[] = [];
  const pair = list.some((s) => s.func === 15);
  let last = p.min;
  for (const s of list) {
    switch (s.func) {
      // one value, the next stats of func 3 reusing it (ItemMods.cpp:2972-3023)
      case 1:
      case 2:
      case 8:
      case 13:
        if (s.stat) out.push({ stat: s.stat, v: p.min });
        last = p.min;
        break;
      case 3:
        if (s.stat) out.push({ stat: s.stat, v: last });
        break;
      // dmg-min, dmg-max: the weapon's (and two-handed and thrown) min / max damage; dmg%: both %s
      case 5:
        out.push({ stat: 'mindamage', v: p.min });
        break;
      case 6:
        out.push({ stat: 'maxdamage', v: p.min });
        break;
      case 7:
        out.push({ stat: 'item_maxdamage_percent', v: p.min }, { stat: 'item_mindamage_percent', v: p.min });
        break;
      case 10:
        out.push({ stat: s.stat ?? 'item_addskill_tab', param: Number(p.p ?? s.val ?? 0), v: p.min });
        break;
      // procs: par the skill, min the chance, max the level
      case 11:
        if (s.stat) out.push({ stat: s.stat, param: p.p, v: p.min, lvl: p.max });
        break;
      case 15:
        if (s.stat) out.push({ stat: s.stat, v: p.min });
        break;
      case 16:
        if (s.stat) out.push({ stat: s.stat, v: p.max });
        break;
      // a pair's length, else a per-level amount (or rep-dur's value): par
      case 17:
        if (s.stat) out.push({ stat: s.stat, v: Number(p.p ?? (pair ? 0 : p.min)) });
        break;
      case 19:
        if (s.stat) out.push({ stat: s.stat, param: p.p, v: p.min, lvl: p.max });
        break;
      case 20:
        out.push({ stat: 'item_indesctructible', v: 1 });
        break;
      case 21:
        if (s.stat) out.push({ stat: s.stat, param: CLASS_BY_ID[s.val ?? 0], v: p.min });
        break;
      case 22:
      case 24:
        if (s.stat) out.push({ stat: s.stat, param: p.p, v: p.min });
        break;
      // sock (14), ethereal (23): what the item is, not a line; the rest are rolled into others
      default:
        break;
    }
  }
  return out;
}

/** the props' stats, the same stat and parameter summed (D2's stat list) */
function collect(props: readonly D2Prop[]): Map<string, Stat> {
  const m = new Map<string, Stat>();
  for (const p of props) {
    for (const e of expand(p)) {
      const key = `${e.stat}#${e.param ?? ''}`;
      const had = m.get(key);
      if (had) {
        had.v += e.v;
        if (e.lvl !== undefined) had.lvl = Math.max(had.lvl ?? 0, e.lvl);
        had.codes.add(p.c);
        had.props.push(p);
      } else m.set(key, { ...e, codes: new Set([p.c]), props: [p] });
    }
  }
  return m;
}

/** a per-level stat at the character level: value × level >> op param (D2StatList.cpp:231-330) */
function atLevel(d: D2xStatDesc | undefined, v: number, clvl: number): number {
  if (!d?.op || d.op < 2 || d.op > 5 || d.opBase !== 'level') return v;
  return (v * clvl) >> (d.opParam ?? 0);
}

/** one stat's line by its descfunc */
function lineOf(s: Stat, ctx: DescribeCtx): string | undefined {
  const d = desc(s.stat);
  if (!d?.func) return undefined;
  const v = atLevel(d, s.v, ctx.clvl);
  const str = v < 0 && d.neg ? d.neg : d.pos;
  if (str === undefined) return undefined;
  const per = d.str2 && d.op && d.op >= 2 && d.op <= 5 ? ` ${d.str2}` : '';
  const skill = () => ctx.skillName(String(s.param ?? ''));
  switch (d.func) {
    // value × 100 / 128 (howl)
    case 5:
      return fmt(str, Math.trunc((v * 100) / 128)) + per;
    // repairs 1 durability in 100 / value seconds
    case 11:
      return fmt(S.ModStre9u, 1, Math.trunc(100 / Math.max(1, v)));
    // the string, then the value (freeze, blind: descval 2)
    case 12:
      return `${str} +${v}`;
    // +N to a class's skills
    case 13:
      return `${fmt('%+d', v)} ${ctx.className(String(s.param))}技能等级`;
    // +N to a skill tree (class only)
    case 14: {
      const tab = Number(s.param ?? 0);
      return `${fmt('%+d', v)} ${ctx.tabName(tab)} ${classOnly(ctx.className(CLASS_BY_ID[Math.floor(tab / 3)] ?? ''))}`;
    }
    // N% chance to cast level L skill on an event
    case 15:
      return fmt(str, v, s.lvl ?? 1, skill());
    // level N aura when equipped (an aura's name already ending in 光环 isn't doubled)
    case 16:
      return fmt(str.replace(/%s光环/, skill().endsWith('光环') ? '%s' : '%s光环'), v, skill());
    // level L skill (left/most charges)
    case 24: {
      const left = ctx.charges?.[String(s.param)] ?? v;
      return fmt(str, s.lvl ?? 1, skill(), left, v);
    }
    // +N to a class skill (class only), +N to any skill
    case 27: {
      const cls = ctx.skillClass(String(s.param ?? ''));
      return fmt(str, v, skill(), cls ? classOnly(ctx.className(cls)) : '').trim();
    }
    case 28:
      return fmt(str, v, skill());
    // the reduction, its sign in the string
    case 29:
      return fmt(str, Math.abs(v));
    // N% reanimate as a monster
    case 23:
      return fmt(str, v, ctx.monsterName?.(Number(s.param)) ?? '怪物');
    // N% to a monster type: the game has no monster types to name
    case 22:
      return fmt(str, v) + ' ?';
    default:
      return fmt(str, v) + per;
  }
}

/** the damage pairs the client writes as one "+ X-Y" line: min, max, the length's stat, and the strings */
const PAIRS: { min: string; max: string; len?: string; one: string; range: string }[] = [
  { min: 'mindamage', max: 'maxdamage', one: 'strModMinDamage', range: 'strModMinDamageRange' },
  { min: 'firemindam', max: 'firemaxdam', one: 'strModFireDamage', range: 'strModFireDamageRange' },
  { min: 'lightmindam', max: 'lightmaxdam', one: 'strModLightningDamage', range: 'strModLightningDamageRange' },
  { min: 'magicmindam', max: 'magicmaxdam', one: 'strModMagicDamage', range: 'strModMagicDamageRange' },
  { min: 'coldmindam', max: 'coldmaxdam', len: 'coldlength', one: 'strModColdDamage', range: 'strModColdDamageRange' },
  { min: 'poisonmindam', max: 'poisonmaxdam', len: 'poisonlength', one: 'strModPoisonDamage', range: 'strModPoisonDamageRange' },
];

/** the stats of each description group (dgrp), by group */
const GROUPS = new Map<number, string[]>();
for (const [stat, d] of Object.entries(D2X_STAT_DESC)) if (d.grp) GROUPS.set(d.grp, [...(GROUPS.get(d.grp) ?? []), stat]);

/** every line the props make, highest priority first (the item's own, a set bonus slot, a gem's list) */
export function describeProps(props: readonly D2Prop[], ctx: DescribeCtx): DescLine[] {
  const m = collect(props);
  // a stat its props sum to 0 leaves D2's stat list, so it has no line (D2StatList.cpp:745-755: removed
  // unless ItemStatCost keepzero, which only mana and stamina set): -1 and +1 light radius say nothing
  for (const [k, s] of m) if (s.v === 0) m.delete(k);
  const out: (DescLine & { id: number })[] = [];
  const take = (...keys: string[]) => {
    const got = keys.map((k) => m.get(`${k}#`));
    for (const k of keys) m.delete(`${k}#`);
    return got;
  };
  const push = (text: string, stats: (Stat | undefined)[], p: number, id: number) => {
    const s = stats.filter((x): x is Stat => !!x);
    out.push({ text, pri: p, id, codes: [...new Set(s.flatMap((x) => [...x.codes]))], props: s.flatMap((x) => x.props) });
  };

  // "+X% Enhanced Damage" when the min and max % are equal (one dmg% property, or several summed)
  const maxPct = m.get('item_maxdamage_percent#');
  const minPct = m.get('item_mindamage_percent#');
  if (maxPct && minPct && maxPct.v === minPct.v) {
    take('item_maxdamage_percent', 'item_mindamage_percent');
    push(fmt(S.strModEnhancedDamage, maxPct.v), [maxPct, minPct], pri('item_maxdamage_percent'), desc('item_maxdamage_percent')!.id);
  }
  for (const pr of PAIRS) {
    const lo = m.get(`${pr.min}#`);
    const hi = m.get(`${pr.max}#`);
    const len = pr.len ? m.get(`${pr.len}#`) : undefined;
    if (len) m.delete(`${pr.len}#`);
    if (!lo || !hi) {
      // a poison half without the other still shows its total; a lone length shows nothing
      continue;
    }
    take(pr.min, pr.max);
    const p = Math.max(pri(pr.min), pri(pr.max));
    const id = desc(pr.min)?.id ?? 0;
    if (pr.min === 'poisonmindam') {
      // poison is a rate in 256ths a frame over a length: the total shows, over whole seconds
      const frames = len?.v ?? 0;
      const a = Math.round((lo.v * frames) / 256);
      const b = Math.round((hi.v * frames) / 256);
      const sec = Math.trunc(frames / FRAMES_PER_SEC);
      push(a === b ? fmt(S[pr.one], a, sec) : fmt(S[pr.range], a, b, sec), [lo, hi, len], p, id);
    } else push(lo.v === hi.v ? fmt(S[pr.one], lo.v) : fmt(S[pr.range], lo.v, hi.v), [lo, hi, len], p, id);
  }
  // groups (all attributes, all resistances): one line when every stat of the group is there, equal
  for (const [g, stats] of GROUPS) {
    const got = stats.map((s) => m.get(`${s}#`));
    if (got.some((x) => !x) || got.some((x) => x!.v !== got[0]!.v)) continue;
    const str = g === 2 ? S.strModAllResistances : g === 1 ? S.Moditem2allattrib : desc(stats[0])?.grpPos;
    if (!str) continue;
    take(...stats);
    push(fmt(str, got[0]!.v), got, Math.max(...stats.map(pri)), Math.min(...stats.map((s) => desc(s)?.id ?? 0)));
  }
  for (const s of m.values()) {
    const text = lineOf(s, ctx);
    if (text) push(text, [s], pri(s.stat), desc(s.stat)?.id ?? 0);
  }
  out.sort((a, b) => b.pri - a.pri || a.id - b.id);
  return out.map(({ id: _id, ...l }) => l);
}

/** the per-level stats among props: their lines end in "(基于角色等级)" */
export const PER_LEVEL_NOTE = S.increaseswithplaylevelX;
