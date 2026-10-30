// Diablo II's skill and missile calcs, evaluated as the game does: the calc columns of Skills.txt,
// SkillDesc.txt and Missiles.txt as src/data/d2x keeps them (calc1, aurastatcalc1, EDmgSymPerCalc,
// a tooltip line's calcA…), the codes they read (SkillCalc.txt and MissCalc.txt: D2X_SKILL_CALC,
// D2X_MISSILE_CALC), and what they make in the game's units: damage and mana in points, lengths in
// seconds, radii in metres. Pure functions; who casts, and at what level, is the caller's CalcCtx.
// Nothing in the game reads it yet: the hireling's skills come first, the heroes' move over in A5.
//
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f, by file and line:
// Calc.cpp is source/Fog/src/Calc.cpp (the compiler and the evaluator), D2Skills.cpp and Missile.cpp
// source/D2Common/src/D2Skills.cpp and Units/Missile.cpp (what each code reads), SkillsTbls.cpp and
// MissilesTbls.cpp source/D2Common/src/DataTbls/ (the function names and links), MissMode.cpp
// source/D2Game/src/MISSILES/MissMode.cpp and Skills.cpp source/D2Game/src/SKILLS/Skills.cpp (how
// the game uses the numbers). Integer steps are D2's: int32 arithmetic, every / truncating.
import { FRAMES_PER_SEC } from '../../core/units';
import { D2X_MISSILE_CALC, D2X_SKILL_CALC } from '../../data/d2x/calc';
import { D2X_MISSILES } from '../../data/d2x/missiles';
import { D2X_SKILLS, D2X_SKILL_REFS, D2X_SKILL_STATS } from '../../data/d2x/skills';
import type { D2xCalc, D2xLenBands, D2xMissile, D2xSkill } from '../../data/d2x/types';
import { dm, frames, subtiles } from './monai';
import { bandsAt } from './monstats';
import { percentOf } from './xp';

/** the elements a passive mastery raises (SKILLS_CalculateMasteryBonus, D2Skills.cpp:2678-2703) */
export type MasteryElem = 'fire' | 'ltng' | 'cold' | 'pois';

/** who casts: what the codes read beyond the skill's own row */
export interface CalcCtx {
  /** the skill's level with its bonuses (lvl): what its level-banded columns and lnXY read; for a missile, the missile's level */
  lvl: number;
  /** the skill's base level, the points put in it (blvl); lvl if absent */
  blvl?: number;
  /** the caster's character level (ulvl) */
  ulvl?: number;
  /**
   * The caster's other skills by D2 name, what skill('X'.blvl) synergies read: a number is the base
   * level with no bonus, else both. A skill not listed is one it lacks, and every code of it reads 0.
   */
  skills?: Record<string, number | { blvl: number; lvl: number }>;
  /** the caster's passive masteries, % (STAT_PASSIVE_FIRE_MASTERY…): what enma, exma and the other "with mastery" codes add */
  mastery?: Partial<Record<MasteryElem, number>>;
  /** stat('name'.base|mod|accr): the caster's stat by ItemStatCost name (SkillsTbls.cpp:94-126, ItemMods.cpp:4366-4394) */
  stat?: (stat: string, kind: 'base' | 'mod' | 'accr') => number;
  /** rand(a, b): a roll in a…b, both in (ItemMods.cpp:4346-4363) */
  rand?: (min: number, max: number) => number;
  /**
   * D2MOO's evaluator ends a calc at the first ?: it runs (Calc.cpp:233-241: the case falls through
   * to the default return), so what follows is never added: Zeal's Sacrifice synergy is lost. Whether
   * D2R keeps that is not known; false evaluates on (A5 decides). Default true.
   */
  ternaryEnds?: boolean;
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// ───────────────────────── Fog's compiler ─────────────────────────
// A calc is compiled once to postfix by Fog's shunting yard (DATATBLS_CompileExpression,
// Calc.cpp:686-919) and run on a stack (DATATBLS_CalcEvaluateExpression, 169-246). Its quirks come
// along: a pending ?: is written out by any operator after it, so "c ? a + b : d" does not compile and
// "c ? a : b * d" is (c ? a : b) * d; a "-" after ?, :, ^, a comma or a function's ( is read as a
// subtraction; a ( left open is written out at the end and ends the calc there.

// Fog's AST node types (Calc.h FOGASTType), whose order the precedence table reads
const NONE = 0;
const CB = 1;
const PAREN = 2;
const SEP = 3;
const LT = 10;
const GT = 11;
const LE = 12;
const GE = 13;
const EQ = 14;
const NE = 15;
const ADD = 16;
const SUB = 17;
const MUL = 18;
const DIV = 19;
const POW = 20;
const NEG = 21;
const TERN = 22;
const COLON = 23;
/**
 * aASTOperatorPrecedence (Calc.cpp:351-376): a pending op is written out before a new one while its
 * entry is ≥ the new one's type (DATATABLS_CheckPrecendence, 380-390); a function never is
 */
const PREC = [COLON, CB, PAREN, SEP, 9, 9, 9, 9, 9, 9, NE, NE, NE, NE, NE, NE, SUB, SUB, DIV, DIV, POW, NEG, TERN, NONE];

/** the functions a skill calc may call and their parameters (SkillsTbls.cpp:9-50: sklvl 3, the rest 2) */
const SKILL_FNS: Record<string, number> = { min: 2, max: 2, rand: 2, skill: 2, miss: 2, stat: 2, sklvl: 3 };
/** a missile calc's (MissilesTbls.cpp:6-32; with no parameter count function every one takes 2, Calc.cpp:312-320) */
const MISSILE_FNS: Record<string, number> = { min: 2, max: 2, rand: 2, skill: 2, miss: 2 };

type Kind = 'skill' | 'missile';
/** a postfix node: a constant (a number, or a link's name or sublink's code, which Fog makes row ids), a code, a function, an operator */
type CalcNode = { k: 'raw'; v: number | string } | { k: 'code'; v: string } | { k: 'fn'; v: string; n: number } | { k: 'op'; v: number };

const compiled = new Map<string, CalcNode[]>();

function compile(src: string, kind: Kind): CalcNode[] {
  const key = `${kind}:${src}`;
  let prog = compiled.get(key);
  if (!prog) compiled.set(key, (prog = compileFog(src, kind)));
  return prog;
}

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9';
const isAlpha = (c: string | undefined) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
const isAlnum = (c: string | undefined) => isDigit(c) || isAlpha(c);

function compileFog(src: string, kind: Kind): CalcNode[] {
  const fns = kind === 'skill' ? SKILL_FNS : MISSILE_FNS;
  const codes = kind === 'skill' ? D2X_SKILL_CALC : D2X_MISSILE_CALC;
  const fail = (m: string): never => {
    throw new Error(`skillcalc: ${kind} calc "${src}": ${m}`);
  };
  const out: CalcNode[] = [];
  const ops: { t: number; fn?: string }[] = [];
  // nPendingParameters and bPendingValue (Calc.cpp:688-697)
  let params = 0;
  let pendingValue = false;
  const count = (op: { t: number; fn?: string }) => (op.t === CB ? fns[op.fn!] : op.t === NEG ? 1 : op.t === TERN ? 3 : op.t >= LT && op.t <= POW ? 2 : 0);
  const emit = (op: { t: number; fn?: string }) => {
    const n = count(op);
    if (params < n) fail('an operator lacks its operands');
    // a missile calc's miss() is past the four callbacks it has, so it pops nothing and pushes 0 (Calc.cpp:38-67)
    out.push(op.t === CB ? { k: 'fn', v: op.fn!, n: kind === 'missile' && op.fn === 'miss' ? 0 : n } : { k: 'op', v: op.t });
    params += 1 - n;
  };
  // DATATBLS_Evaluate_HandleNewOp (Calc.cpp:394-448)
  const newOp = (t: number) => {
    for (let prev = ops[ops.length - 1]; prev; prev = ops[ops.length - 1]) {
      if (prev.t === CB || prev.t >= COLON || PREC[prev.t] < t) break;
      emit(prev);
      ops.pop();
    }
    if (t === COLON || t === SEP) return;
    if (t === NONE) {
      if (!out.length) fail('nothing to evaluate');
      out.push({ k: 'op', v: NONE });
      return;
    }
    ops.push({ t });
  };
  const value = (n: CalcNode) => {
    out.push(n);
    params++;
    pendingValue = true;
  };
  // a link or sublink belongs to the function whose ( is open (ResolveConstantLink, Calc.cpp:451-470)
  const owner = (): string => {
    const top = ops[ops.length - 1];
    return top?.t === CB ? top.fn! : fail("a 'name' or .code outside skill(), miss(), stat() or sklvl()");
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    // spaces and the .txt export's quotes are skipped (Calc.cpp:578-581)
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '"') {
      i++;
      continue;
    }
    if (isDigit(c)) {
      let j = i;
      while (isDigit(src[j])) j++;
      // Fog adds the digits up in an int (Calc.cpp:583-590)
      value({ k: 'raw', v: Number(src.slice(i, j)) | 0 });
      i = j;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      let name = src.slice(i + 1, end < 0 ? src.length : end);
      const fn = owner();
      if (fn === 'skill' || fn === 'sklvl') {
        name = skillKey(name);
        if (!has(D2X_SKILLS, name) && !has(D2X_SKILL_REFS, name)) fail(`no skill ${name}`);
      } else if (fn === 'miss') {
        if (!has(D2X_MISSILES, name)) fail(`no missile ${name}`);
      } else if (fn === 'stat') {
        if (!has(D2X_SKILL_STATS, name)) fail(`no stat ${name}`);
      } else fail(`${fn}() takes no link`);
      value({ k: 'raw', v: name });
      i = end < 0 ? src.length : end + 1;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (isAlnum(src[j])) j++;
      const name = src.slice(i, j);
      let k = j;
      while (src[k] === ' ') k++;
      // a function is a known name before "(", in any case (SStrCmpI). Calc.cpp:558 tests its id for
      // truth, which would leave min(), id 0, no function; Charged Bolt's min(24,ln12) shows ≥ 0 is meant
      const fn = name.toLowerCase();
      if (src[k] === '(' && has(fns, fn)) {
        ops.push({ t: CB, fn });
        pendingValue = true;
        i = k + 1;
        continue;
      }
      // anything else is a code, case and all (FOG_GetLinkIndex on its 4 characters); Fog reads an unknown one as 0
      if (!has(codes, name)) fail(`${name} is no ${kind} calc code`);
      value({ k: 'code', v: name });
      i = j;
      continue;
    }
    i++;
    switch (c) {
      case '(':
        ops.push({ t: PAREN });
        break;
      case ')': {
        // Calc.cpp:716-773: write out back to the ( or the function, which is written out too
        if (!ops.length) fail('a ) with no (');
        for (;;) {
          const prev = ops[ops.length - 1];
          if (prev.t === PAREN) break;
          emit(prev);
          if (prev.t === CB) break;
          ops.pop();
          if (!ops.length) fail('a ) with no (');
        }
        ops.pop();
        break;
      }
      case ',':
        newOp(SEP);
        break;
      case '+':
        newOp(ADD);
        pendingValue = false;
        break;
      case '-':
        newOp(pendingValue ? SUB : NEG);
        pendingValue = false;
        break;
      case '*':
        newOp(MUL);
        pendingValue = false;
        break;
      case '/':
        newOp(DIV);
        pendingValue = false;
        break;
      case '?':
        newOp(TERN);
        break;
      case ':':
        newOp(COLON);
        break;
      case '^':
        newOp(POW);
        break;
      case '<':
      case '>':
        if (src[i] === '=') {
          i++;
          newOp(c === '<' ? LE : GE);
        } else newOp(c === '<' ? LT : GT);
        pendingValue = false;
        break;
      case '=':
      case '!':
        if (src[i] !== '=') fail(`a lone ${c}`);
        i++;
        newOp(c === '=' ? EQ : NE);
        pendingValue = false;
        break;
      case '.': {
        // a sublink: the code a link's function reads (Calc.cpp:498-531). skill() and sklvl() read
        // SkillCalc codes, miss() MissCalc codes, stat() base, mod or accr (SkillsTbls.cpp:54-190;
        // a missile calc's skill() falls back on SkillCalc codes too, MissilesTbls.cpp:36-117)
        let j = i;
        while (isAlnum(src[j])) j++;
        const code = src.slice(i, j);
        const fn = owner();
        const ok =
          fn === 'stat' ? code === 'base' || code === 'mod' || code === 'accr' : fn === 'miss' ? has(D2X_MISSILE_CALC, code) : fn === 'skill' || fn === 'sklvl' ? has(D2X_SKILL_CALC, code) : false;
        if (!ok) fail(`.${code} is no code ${fn}() reads`);
        value({ k: 'raw', v: code });
        i = j;
        break;
      }
      default:
        fail(`unexpected ${c}`);
    }
  }
  newOp(NONE);
  // a function left open is never written out, and the calc reads garbage; the import closes them
  if (ops.some((o) => o.t === CB)) fail('a function left open');
  return out;
}

// ───────────────────────── Fog's evaluator ─────────────────────────

interface Env {
  code(code: string): number;
  fn(fn: string, args: (number | string)[]): number;
  ternaryEnds: boolean;
}

/** int32 a ^ b: 1 for b ≤ 0, else b − 1 multiplications (Calc.cpp:145-158), by squaring here to the same 32 bits */
function pow(a: number, b: number): number {
  if (b <= 0) return 1;
  let r = 1;
  for (let x = a, e = b; e; e >>>= 1, x = Math.imul(x, x)) if (e & 1) r = Math.imul(r, x);
  return r;
}

/** DATATBLS_EvaluateBinaryOperator (Calc.cpp:102-164): int32, / truncating and 0 for / 0, comparisons 0 or 1 */
function binary(op: number, a: number, b: number): number {
  switch (op) {
    case LT:
      return +(a < b);
    case GT:
      return +(a > b);
    case LE:
      return +(a <= b);
    case GE:
      return +(a >= b);
    case EQ:
      return +(a === b);
    case NE:
      return +(a !== b);
    case ADD:
      return (a + b) | 0;
    case SUB:
      return (a - b) | 0;
    case MUL:
      return Math.imul(a, b);
    case DIV:
      return b === 0 ? 0 : Math.trunc(a / b) | 0;
    default:
      return pow(a, b);
  }
}

function run(prog: CalcNode[], env: Env, src: string): number {
  const st: (number | string)[] = [];
  // an empty stack pops 0 (DATATBLS_IntStackPop, Calc.cpp:8-16)
  const pop = () => (st.length ? st.pop()! : 0);
  const num = () => {
    const v = pop();
    if (typeof v !== 'number') throw new Error(`skillcalc: calc "${src}": '${v}' used as a number`);
    return v;
  };
  for (const n of prog) {
    if (n.k === 'raw') st.push(n.v);
    else if (n.k === 'code') st.push(env.code(n.v) | 0);
    else if (n.k === 'fn') {
      // parameters come off the stack last first (DATATBLS_EvaluateCalcCallback, Calc.cpp:38-67)
      const args: (number | string)[] = new Array(n.n);
      for (let j = n.n - 1; j >= 0; j--) args[j] = pop();
      st.push(env.fn(n.v, args) | 0);
    } else if (n.v === NEG) st.push(-num() | 0);
    else if (n.v === TERN) {
      const f = num();
      const t = num();
      const c = num();
      st.push(c ? t : f);
      if (env.ternaryEnds) return num();
    } else if (n.v >= LT && n.v <= POW) {
      const b = num();
      st.push(binary(n.v, num(), b));
    } else return num(); // the end, or a ( left open (Calc.cpp:240-241: any other node returns the top)
  }
  return 0;
}

// ───────────────────────── a skill's codes ─────────────────────────

/** the caster, shared by a calc and the skills and missiles it links to; self is the skill CalcCtx.lvl is for */
interface Unit {
  ctx: CalcCtx;
  self: string;
}

/** a skill evaluated at a level for a caster (D2SkillCalcStrc: pUnit, nSkillId, nSkillLevel) */
interface SkillEval {
  name: string;
  row: D2xSkill | undefined;
  L: number;
  unit: Unit;
  depth: number;
}

/** a missile at a level, for its owner (D2MissileCalcStrc) */
interface MissileEval {
  name: string;
  row: D2xMissile;
  L: number;
  unit: Unit;
  depth: number;
}

/** links nest (a synergy reads a skill, whose code reads a missile…); D2's data never loops, a bad one stops here */
const MAX_DEPTH = 16;

/** Skills.txt names as D2's linker matches them, ignoring case */
function skillKey(name: string): string {
  if (has(D2X_SKILLS, name) || has(D2X_SKILL_REFS, name)) return name;
  const lc = name.toLowerCase();
  return Object.keys(D2X_SKILLS).find((k) => k.toLowerCase() === lc) ?? Object.keys(D2X_SKILL_REFS).find((k) => k.toLowerCase() === lc) ?? name;
}

/** the caster's levels of a skill: CalcCtx's own for self, its skills list for the rest, 0 for one it lacks */
function levelsOf(u: Unit, name: string): { blvl: number; lvl: number } {
  if (name === u.self) return { blvl: u.ctx.blvl ?? u.ctx.lvl, lvl: u.ctx.lvl };
  const v = u.ctx.skills && has(u.ctx.skills, name) ? u.ctx.skills[name] : undefined;
  if (v === undefined) return { blvl: 0, lvl: 0 };
  return typeof v === 'number' ? { blvl: v, lvl: v } : v;
}

function skillAt(unit: Unit, name: string, depth: number): SkillEval {
  if (depth > MAX_DEPTH) throw new Error(`skillcalc: calcs linking past ${MAX_DEPTH} deep at ${name}`);
  const key = skillKey(name);
  return { name: key, row: has(D2X_SKILLS, key) ? D2X_SKILLS[key] : undefined, L: levelsOf(unit, key).lvl, unit, depth };
}

function rowOf(e: SkillEval): D2xSkill {
  if (!e.row) throw new Error(`skillcalc: ${e.name} is only named in the data (D2X_SKILL_REFS), so its codes cannot be read at level ${e.L}`);
  return e.row;
}

/** a calc of the skill at its level (SKILLS_EvaluateSkillFormula, D2Skills.cpp:478-492): none reads 0 */
function skillCalcIn(e: SkillEval, calc: D2xCalc | undefined): number {
  if (calc === undefined) return 0;
  if (typeof calc === 'number') return calc | 0;
  return run(compile(calc, 'skill'), skillEnv(e), calc);
}

function skillEnv(e: SkillEval): Env {
  return {
    code: (c) => skillCode(e, c),
    fn: (f, a) => skillFn(e, f, a),
    ternaryEnds: e.unit.ctx.ternaryEnds ?? true,
  };
}

const int = (v: number | string, what: string): number => {
  if (typeof v !== 'number') throw new Error(`skillcalc: '${v}' given where ${what} wants a number`);
  return v;
};
const str = (v: number | string, what: string): string => {
  if (typeof v !== 'string') throw new Error(`skillcalc: ${v} given where ${what} wants a link`);
  return v;
};

/** min, max and rand (Missile.cpp:1434-1475; the skill table points at the same, D2Skills.cpp:24-33) */
function commonFn(f: string, a: (number | string)[], ctx: CalcCtx): number | undefined {
  if (f === 'min') return Math.min(int(a[0], 'min()'), int(a[1], 'min()'));
  if (f === 'max') return Math.max(int(a[0], 'max()'), int(a[1], 'max()'));
  if (f === 'rand') {
    const lo = int(a[0], 'rand()');
    const hi = int(a[1], 'rand()');
    if (!ctx.rand) throw new Error('skillcalc: rand() needs CalcCtx.rand');
    return lo < hi ? ctx.rand(lo, hi) : lo;
  }
  return undefined;
}

/** the skill table's callbacks (D2Skills.cpp:24-33, 430-476) */
function skillFn(e: SkillEval, f: string, a: (number | string)[]): number {
  const common = commonFn(f, a, e.unit.ctx);
  if (common !== undefined) return common;
  switch (f) {
    case 'skill':
      // another skill's code at the caster's level of it, bonuses in (sub_6FDAF6C0, 430-452)
      return skillCode(skillAt(e.unit, str(a[0], 'skill()'), e.depth + 1), str(a[1], 'skill()'));
    case 'miss':
      // a missile's code at this skill's level (sub_6FDAF780, 455-464)
      return missileCode(missileAt(e.unit, str(a[0], 'miss()'), e.L, e.depth + 1), str(a[1], 'miss()'));
    case 'stat': {
      const s = str(a[0], 'stat()');
      const kind = str(a[1], 'stat()') as 'base' | 'mod' | 'accr';
      if (!e.unit.ctx.stat) throw new Error(`skillcalc: stat('${s}'.${kind}) needs CalcCtx.stat`);
      return e.unit.ctx.stat(s, kind);
    }
    case 'sklvl': {
      // another skill's code at the level this skill's code gives (sub_6FDAF7A0, 467-476)
      const other = skillAt(e.unit, str(a[0], 'sklvl()'), e.depth + 1);
      return skillCode({ ...other, L: skillCode(e, str(a[1], 'sklvl()')) }, str(a[2], 'sklvl()'));
    }
  }
  throw new Error(`skillcalc: no function ${f}()`);
}

/** lnXY and dmXY (monai.ts dm): the params they read (D2Skills.cpp:77-127; D2R's Param9–20 pairs in the same pattern) */
const LN: Record<string, [number, number]> = { ln12: [1, 2], ln34: [3, 4], ln56: [5, 6], ln78: [7, 8], ln91: [9, 10], ln21: [11, 12], ln43: [13, 14], ln65: [15, 16], ln87: [17, 18], ln92: [19, 20] };
const DM: Record<string, [number, number]> = { dm12: [1, 2], dm34: [3, 4], dm56: [5, 6], dm78: [7, 8], dm91: [9, 10], dm21: [11, 12], dm43: [13, 14], dm65: [15, 16], dm87: [17, 18], dm92: [19, 20] };
/** parN: ParamN (D2Skills.cpp:129-151 for 1–8; D2R's par9, pa10…pa20) */
const PAR: Record<string, number> = { par1: 1, par2: 2, par3: 3, par4: 4, par5: 5, par6: 6, par7: 7, par8: 8, par9: 9, pa10: 10, pa11: 11, pa12: 12, pa13: 13, pa14: 14, pa15: 15, pa16: 16, pa17: 17, pa18: 18, pa19: 19, pa20: 20 };
/** clcN: calcN (D2Skills.cpp:356-366 for 1–4; D2R's clc5…clc9, and clc0 for calc10) */
const CLC: Record<string, number> = { clc1: 1, clc2: 2, clc3: 3, clc4: 4, clc5: 5, clc6: 6, clc7: 7, clc8: 8, clc9: 9, clc0: 10 };
/** pstN: passivecalcN, the passive stat in column N (D2Skills.cpp:389-402 for 1–5; D2R's pst6…ps14) */
const PST: Record<string, number> = { pst1: 1, pst2: 2, pst3: 3, pst4: 4, pst5: 5, pst6: 6, pst7: 7, pst8: 8, pst9: 9, ps10: 10, ps11: 11, ps12: 12, ps13: 13, ps14: 14 };
/** astN: aurastatcalcN, the aura stat in column N (D2Skills.cpp:371-386) */
const AST: Record<string, number> = { ast1: 1, ast2: 2, ast3: 3, ast4: 4, ast5: 5, ast6: 6 };
type DescRead = 'min' | 'max' | 'len' | 'range' | 'min256' | 'max256' | 'minMastery' | 'maxMastery';
/**
 * The descmissile (SkillDesc.txt, desc.missiles) a code reads, 0–2 (D2Skills.cpp:205-271). The
 * 256ths ones go by D2MOO's index, (code − 43) / 3 and (code − 44) / 3 (304-336, its own TODO
 * doubting it), so m2eo and m2ey read descmissile1, me3o and me3y descmissile2.
 */
const DESC_MISSILE: Record<string, [number, DescRead]> = {
  m1en: [0, 'min'], m1ex: [0, 'max'], m1el: [0, 'len'], m2en: [1, 'min'], m2ex: [1, 'max'], m2el: [1, 'len'], m3en: [2, 'min'], m3ex: [2, 'max'], m3el: [2, 'len'],
  m1rn: [0, 'range'], m2rn: [1, 'range'], m3rn: [2, 'range'],
  m1eo: [0, 'min256'], m1ey: [0, 'max256'], m2eo: [0, 'min256'], m2ey: [0, 'max256'], me3o: [1, 'min256'], me3y: [1, 'max256'],
  // D2R's, "with Elemental Mastery": the caster's mastery of the missile's element on it
  m1nm: [0, 'minMastery'], m1xm: [0, 'maxMastery'], m2nm: [1, 'minMastery'], m2xm: [1, 'maxMastery'], m3nm: [2, 'minMastery'], m3xm: [2, 'maxMastery'],
};
/** math, madm, macr: the passive stat whose calc they read, in the first five columns (D2Common_11032, D2Skills.cpp:3152-3190) */
const WEAPON_MASTERY: Record<string, string[]> = {
  math: ['passive_mastery_melee_th', 'passive_mastery_throw_th'],
  madm: ['passive_mastery_melee_dmg', 'passive_mastery_throw_dmg'],
  macr: ['passive_mastery_melee_crit', 'passive_mastery_throw_crit'],
};
/** the codes D2MOO reads as 0 below level 1, besides lnXY, dmXY but dm78, the descmissile and weapon mastery ones */
const LEVEL_CHECKED = new Set(['toht', 'mana', 'usmc', 'edmn', 'edmx', 'edns', 'edxs', 'enma', 'exma', 'enms', 'exms', 'edln', 'edma']);

/** SkillCalc codes this cannot read, and why. Of the data the game takes, only Inferno's tooltip names one (mps). */
export const UNSUPPORTED_CODES: Record<string, string> = {
  mps: "D2's mana a second halves mana + lvlmana before manashift (D2Skills.cpp:186-194), and the import keeps mana shifted (D2xSkill.mana)",
  skpt: 'the import leaves skpoints out',
  mapi: "D2R's throwing pierce mastery: not in D2MOO",
  manc: "D2R's throwing no-consume mastery: not in D2MOO",
  mair: "D2R's item requirement mastery: not in D2MOO",
  sctk: "D2R's channelling tick: the caster's state, no number of the data",
};
/** the MissCalc codes this cannot read: client columns the import leaves out, and a flying missile's frame */
export const UNSUPPORTED_MISSILE_CODES: Record<string, string> = Object.fromEntries([
  ...['cpa1', 'cpa2', 'cpa3', 'cpa4', 'cpa5', 'chp1', 'chp2', 'chp3', 'cl12', 'cd12', 'cl34', 'cd34', 'chl1', 'chd1', 'ccl1'].map((c) => [c, 'a client column the import leaves out']),
  ['fnum', "a flying missile's frame, no number of the data"],
]);

/** ln: par X + (lvl − 1) × par Y */
const ln = (L: number, x: number, y: number) => (x + Math.imul(L - 1, y)) | 0;
/** a skill's code at its level (SKILLS_GetSpecialParamValue, D2Skills.cpp:64-416, and D2R's additions) */
function skillCode(e: SkillEval, code: string): number {
  const L = e.L;
  if (code === 'lvl') return L; // 153-154
  if (code === 'blvl') return levelsOf(e.unit, e.name).blvl; // 286-295: the caster's skill, no bonuses
  if (code === 'ulvl') {
    // 279-284: the caster's level
    if (e.unit.ctx.ulvl === undefined) throw new Error('skillcalc: ulvl needs CalcCtx.ulvl');
    return e.unit.ctx.ulvl;
  }
  if (has(UNSUPPORTED_CODES, code)) throw new Error(`skillcalc: ${code} (${e.name}): ${UNSUPPORTED_CODES[code]}`);
  if (!has(D2X_SKILL_CALC, code)) throw new Error(`skillcalc: ${code} is no SkillCalc code`);
  // below level 1 these read 0 (each case's nSkillLevel > 0), whether or not the skill is imported whole
  const checked = LEVEL_CHECKED.has(code) || has(LN, code) || has(DESC_MISSILE, code) || has(WEAPON_MASTERY, code) || (has(DM, code) && code !== 'dm78');
  if (checked && L <= 0) return 0;
  const s = rowOf(e);
  const par = (n: number) => s.params?.[n] ?? 0;
  if (has(PAR, code)) return par(PAR[code]);
  if (has(LN, code)) return ln(L, par(LN[code][0]), par(LN[code][1]));
  if (has(DM, code)) return dm(L, par(DM[code][0]), par(DM[code][1]));
  if (has(CLC, code)) return skillCalcIn(e, s.calcs?.[CLC[code]]);
  // by column, not by place in the list: a row may skip a column
  if (has(PST, code)) return skillCalcIn(e, s.passive?.stats?.find((p) => p.col === PST[code])?.calc);
  if (has(AST, code)) return skillCalcIn(e, s.aura?.stats?.find((p) => p.col === AST[code])?.calc);
  if (has(WEAPON_MASTERY, code)) {
    const st = (s.passive?.stats ?? []).find((p) => p.col <= 5 && WEAPON_MASTERY[code].includes(p.stat));
    return st ? skillCalcIn(e, st.calc) : 0;
  }
  if (has(DESC_MISSILE, code)) {
    const [i, what] = DESC_MISSILE[code];
    const id = s.desc?.missiles?.[i];
    // a descmissile the row has not reads 0 (205-271)
    if (!id || !has(D2X_MISSILES, id)) return 0;
    const m = missileAt(e.unit, id, L, e.depth + 1);
    switch (what) {
      case 'min':
        return missileElem256(m, 'min') >> 8;
      case 'max':
        return missileElem256(m, 'max') >> 8;
      case 'min256':
        return missileElem256(m, 'min');
      case 'max256':
        return missileElem256(m, 'max');
      case 'len':
        return missileLenFrames(m);
      case 'range':
        return missileCode(m, 'rang');
      default: {
        const n = missileElem256(m, what === 'minMastery' ? 'min' : 'max');
        return (n + percentOf(n, masteryPct(e.unit.ctx, m.row.elem?.type), 100)) >> 8;
      }
    }
  }
  switch (code) {
    case 'edmn':
      return skillElem256(e, 'min', false) >> 8; // 156-157
    case 'edmx':
      return skillElem256(e, 'max', false) >> 8; // 159-160
    case 'edns':
      return skillElem256(e, 'min', false); // 273-274
    case 'edxs':
      return skillElem256(e, 'max', false); // 276-277
    case 'enma':
      return skillElem256(e, 'min', true) >> 8; // 338-339
    case 'exma':
      return skillElem256(e, 'max', true) >> 8; // 341-342
    case 'enms':
      return skillElem256(e, 'min', true); // 347-348
    case 'exms':
      return skillElem256(e, 'max', true); // 350-351
    case 'edln':
    case 'edma':
      return skillLenFrames(e); // 162-163, 344-345
    case 'toht': {
      // 165-177: ToHit + (lvl − 1) × LevToHit, or ToHitCalc
      const t = s.toHit;
      if (!t) return 0;
      return 'calc' in t ? skillCalcIn(e, t.calc) : t.base + (L - 1) * t.perLvl;
    }
    case 'mana':
      return mana256(s, L, false) >> 8; // 179-184
    case 'usmc':
      return mana256(s, L, false); // 297-302
    case 'len':
      return skillCalcIn(e, s.aura?.len); // 353-354: auralencalc
    case 'rng':
      return skillCalcIn(e, s.aura?.range); // 368-369: aurarangecalc
    case 'pets':
      return skillCalcIn(e, s.pet?.max); // 404-405: petmax
    // D2R's "Physical Damage Min (Skill Only)": the skill's own, no weapon (SKILLS_GetMinPhysDamage with a4 0, 2509-2572)
    case 'pnma':
      return skillPhys256(e, 'min') >> 8;
    case 'pxma':
      return skillPhys256(e, 'max') >> 8;
    case 'pnms':
      return skillPhys256(e, 'min');
    case 'pxms':
      return skillPhys256(e, 'max');
    // D2R's "Elemental Damage Mastery": the caster's mastery % of the skill's element (Meteor's tooltip)
    case 'mael':
      return masteryPct(e.unit.ctx, s.elem?.type);
  }
  throw new Error(`skillcalc: no reading of ${code}`);
}

/** the caster's mastery of an element, % (SKILLS_CalculateMasteryBonus, D2Skills.cpp:2678-2703: freeze counts as cold) */
function masteryPct(ctx: CalcCtx, type: string | undefined): number {
  const m = ctx.mastery;
  if (!m || !type) return 0;
  if (type === 'fire') return m.fire ?? 0;
  if (type === 'ltng') return m.ltng ?? 0;
  if (type === 'cold' || type === 'frze') return m.cold ?? 0;
  if (type === 'pois') return m.pois ?? 0;
  return 0;
}

/** D2's 256ths of a value the import keeps in points (exact: it divided by a power of 2) */
const in256 = (points: number) => Math.round(points * 256);

/**
 * A skill's elemental damage in 256ths (SKILLS_GetMinElemDamage / GetMaxElemDamage, D2Skills.cpp:2644-2738):
 * (E + bands) << HitShift, + floor(× EDmgSymPerCalc / 100), which the min takes only over a point
 * or with its first band set, then with `mastery` + floor(× mastery / 100)
 */
function skillElem256(e: SkillEval, which: 'min' | 'max', mastery: boolean): number {
  const s = rowOf(e);
  if (e.L <= 0) return 0;
  const b = s.elem?.[which];
  let n = b ? in256(bandsAt(b, e.L)) : 0;
  const sym = s.elem?.sym;
  if (sym !== undefined && (which === 'max' || n > 256 || (b?.[1] ?? 0) !== 0)) {
    const pct = skillCalcIn(e, sym);
    if (pct) n += percentOf(n, pct, 100);
  }
  if (mastery) n += percentOf(n, masteryPct(e.unit.ctx, s.elem?.type), 100);
  return n;
}

/** a length by D2's bands, in frames: ELen + ELevLen1 × (lvl − 1) to 8, ELevLen2 a level to 16, ELevLen3 on (D2Skills.cpp:2756-2772) */
function lenBands(len: D2xLenBands | undefined, L: number): number {
  if (!len) return 0;
  const [base, a, b, c] = len.map((s) => Math.round(s * FRAMES_PER_SEC));
  if (L <= 8) return base + a * (L - 1);
  if (L <= 16) return base + 7 * a + b * (L - 8);
  return base + 7 * a + 8 * b + c * (L - 16);
}

/** a skill's elemental length in frames, + floor(× ELenSymPerCalc / 100) (SKILLS_GetElementalLength, D2Skills.cpp:2742-2785) */
function skillLenFrames(e: SkillEval): number {
  const s = rowOf(e);
  if (e.L <= 0) return 0;
  let n = lenBands(s.elem?.len, e.L);
  if (s.elem?.lenSym !== undefined) {
    const pct = skillCalcIn(e, s.elem.lenSym);
    if (pct) n += percentOf(n, pct, 100);
  }
  return n;
}

/**
 * Mana in 256ths: (mana + (lvl − 1) × lvlmana) << manashift (SKILLS_GetManaCosts, D2Skills.cpp:2464-2474).
 * What a cast takes counts from level 1 and is at least minmana << 8, and nothing when mana and
 * lvlmana are both 0, D2xSkill.mana absent (D2GAME_SKILLMANA_Consume, Skills.cpp:1061-1096).
 */
function mana256(s: D2xSkill, L: number, charged: boolean): number {
  const m = s.mana;
  if (!m) return 0;
  const n = in256(m.base) + (charged ? Math.max(0, L - 1) : L - 1) * in256(m.perLvl);
  return charged ? Math.max(n, (m.min ?? 0) * 256) : n;
}

/**
 * A skill's own physical damage in 256ths, the weapon's share in when `weapon` (whole points) is given
 * (SKILLS_GetMinPhysDamage / GetMaxPhysDamage, D2Skills.cpp:2509-2640): weapon × SrcDam / 128 +
 * MinDam + bands, + floor(× DmgSymPerCalc / 100), << HitShift. The import keeps it in points; it
 * takes a synergy only with HitShift 8, and srcScale gives the shift where a weapon share has another.
 */
function skillPhys256(e: SkillEval, which: 'min' | 'max', weapon?: number): number {
  const s = rowOf(e);
  if (s.flags?.includes('kick')) throw new Error(`skillcalc: ${e.name} kicks: its damage is the caster's strength and dexterity (2520-2537)`);
  const p = s.phys;
  if (!p) return 0;
  const unit = p.srcScale ?? 1;
  let raw = bandsAt(p[which], e.L) / unit;
  if (weapon !== undefined && p.src) raw += Math.trunc((weapon * Math.round(p.src * 128)) / 128);
  if (p.sym !== undefined) {
    const pct = skillCalcIn(e, p.sym);
    if (pct) raw += percentOf(raw, pct, 100);
  }
  return Math.round(raw * unit * 256);
}

// ───────────────────────── a missile's codes ─────────────────────────

function missileAt(unit: Unit, name: string, L: number, depth: number): MissileEval {
  if (depth > MAX_DEPTH) throw new Error(`skillcalc: calcs linking past ${MAX_DEPTH} deep at ${name}`);
  if (!has(D2X_MISSILES, name)) throw new Error(`skillcalc: no missile ${name}`);
  return { name, row: D2X_MISSILES[name], L, unit, depth };
}

/** a missile's calc at its level (MISSILE_EvaluateMissileFormula, Missile.cpp:1502-1551) */
function missileCalcIn(m: MissileEval, calc: D2xCalc | undefined): number {
  if (calc === undefined) return 0;
  if (typeof calc === 'number') return calc | 0;
  return run(compile(calc, 'missile'), missileEnv(m), calc);
}

function missileEnv(m: MissileEval): Env {
  return {
    code: (c) => missileCode(m, c),
    fn: (f, a) => {
      const common = commonFn(f, a, m.unit.ctx);
      if (common !== undefined) return common;
      // the owner's skill at its level, bonuses in (MISSILE_GetSpecialParamValueForSkillMissile, Missile.cpp:1477-1499)
      if (f === 'skill') return skillCode(skillAt(m.unit, str(a[0], 'skill()'), m.depth + 1), str(a[1], 'skill()'));
      // miss() has a name but no callback: the table has four (Missile.cpp:16-22), and one past it gives 0
      if (f === 'miss') return 0;
      throw new Error(`skillcalc: no missile function ${f}()`);
    },
    ternaryEnds: m.unit.ctx.ternaryEnds ?? true,
  };
}

type MissileParams = 'params' | 'hitParams' | 'dmgParams';
/** sl12 and the rest: param pairs by level, which D2MOO reads at any level (Missile.cpp:1372-1412) */
const MISSILE_LN: Record<string, [MissileParams, number, number, 'ln' | 'dm']> = {
  sl12: ['params', 1, 2, 'ln'], sd12: ['params', 1, 2, 'dm'], sl34: ['params', 3, 4, 'ln'], sd34: ['params', 3, 4, 'dm'],
  shl1: ['hitParams', 1, 2, 'ln'], shd1: ['hitParams', 1, 2, 'dm'], dl12: ['dmgParams', 1, 2, 'ln'], dd12: ['dmgParams', 1, 2, 'dm'],
};
/** Param1–5, sHitPar1–3, dParam1–2 (Missile.cpp:1285-1337) */
const MISSILE_PAR: Record<string, [MissileParams, number]> = {
  par1: ['params', 1], par2: ['params', 2], par3: ['params', 3], par4: ['params', 4], par5: ['params', 5],
  hpa1: ['hitParams', 1], hpa2: ['hitParams', 2], hpa3: ['hitParams', 3], dpa1: ['dmgParams', 1], dpa2: ['dmgParams', 2],
};

/** a missile's code at its level (MISSILE_GetSpecialParamValue, Missile.cpp:1271-1420, and D2R's) */
function missileCode(m: MissileEval, code: string): number {
  const r = m.row;
  if (has(UNSUPPORTED_MISSILE_CODES, code)) throw new Error(`skillcalc: ${code} (${m.name}): ${UNSUPPORTED_MISSILE_CODES[code]}`);
  if (!has(D2X_MISSILE_CALC, code)) throw new Error(`skillcalc: ${code} is no MissCalc code`);
  const p = (k: MissileParams, n: number) => r[k]?.[n] ?? 0;
  if (has(MISSILE_PAR, code)) return p(...MISSILE_PAR[code]);
  if (has(MISSILE_LN, code)) {
    const [k, x, y, f] = MISSILE_LN[code];
    return f === 'ln' ? ln(m.L, p(k, x), p(k, y)) : dm(m.L, p(k, x), p(k, y));
  }
  switch (code) {
    case 'lvl':
      return m.L; // 1339-1340
    case 'edmn':
      return missileElem256(m, 'min') >> 8; // 1342-1343
    case 'edmx':
      return missileElem256(m, 'max') >> 8; // 1345-1346
    case 'edln':
      return missileLenFrames(m); // 1348-1349
    case 'edns':
      return missileElem256(m, 'min'); // 1351-1352
    case 'edxs':
      return missileElem256(m, 'max'); // 1354-1355
    case 'damn':
      return missilePhys256(m, 'min') >> 8; // 1357-1358
    case 'damx':
      return missilePhys256(m, 'max') >> 8; // 1360-1361
    case 'dmns':
      return missilePhys256(m, 'min'); // 1363-1364
    case 'dmxs':
      return missilePhys256(m, 'max'); // 1366-1367
    case 'rang':
      return r.range[0] + m.L * r.range[1]; // 1369-1370: Range + lvl × LevRange
    // D2R's: its server calc's value, its Radius column
    case 'scl1':
      return missileCalcIn(m, r.calcs?.srv);
    case 'rad':
      return r.radius ?? 0;
  }
  throw new Error(`skillcalc: no reading of missile ${code}`);
}

/**
 * A missile's own elemental damage in 256ths (MISSILE_GetMinElemDamage / GetMaxElemDamage,
 * Missile.cpp:1127-1235): E + bands, + floor(× EDmgSymPerCalc / 100) before the shift, so in
 * elem.symUnit points, << HitShift
 */
function missileElem256(m: MissileEval, which: 'min' | 'max'): number {
  const e = m.row.elem;
  const b = e?.[which];
  if (!b) return 0;
  if (e?.sym === undefined) return in256(bandsAt(b, m.L));
  const unit = e.symUnit ?? 1;
  let raw = Math.round(bandsAt(b, m.L) / unit);
  const pct = missileCalcIn(m, e.sym);
  if (pct) raw += percentOf(raw, pct, 100);
  return Math.round(raw * unit * 256);
}

/** a missile's own physical damage in 256ths (MISSILE_GetMinDamage / GetMaxDamage, Missile.cpp:1002-1110) */
function missilePhys256(m: MissileEval, which: 'min' | 'max'): number {
  const b = m.row.phys?.[which];
  return b ? in256(bandsAt(b, m.L)) : 0;
}

/** a missile's elemental length in frames, ELen alone below level 1 (MISSILE_GetElementalLength, Missile.cpp:1238-1268) */
function missileLenFrames(m: MissileEval): number {
  return lenBands(m.row.elem?.len, Math.max(1, m.L));
}

// ───────────────────────── the codes and calcs, for callers ─────────────────────────

function checkLevel(name: string, v: number | undefined) {
  if (v !== undefined && (!Number.isInteger(v) || v < 0)) throw new Error(`skillcalc: ${name} ${v} is no level`);
}

function top(skill: string, ctx: CalcCtx): SkillEval {
  if (!has(D2X_SKILLS, skill)) throw new Error(`skillcalc: no skill ${skill} in D2X_SKILLS`);
  checkLevel('lvl', ctx.lvl ?? NaN);
  checkLevel('blvl', ctx.blvl);
  return { name: skill, row: D2X_SKILLS[skill], L: ctx.lvl, unit: { ctx, self: skill }, depth: 0 };
}

function topMissile(missile: string, ctx: CalcCtx): MissileEval {
  checkLevel('lvl', ctx.lvl ?? NaN);
  return missileAt({ ctx, self: '' }, missile, ctx.lvl, 0);
}

/** one SkillCalc.txt code of a skill (ln34, edmn, toht, len, clc1…), D2's integer: what a calc naming it reads. `skill` is a D2X_SKILLS key. */
export function skillValue(skill: string, code: string, ctx: CalcCtx): number {
  return skillCode(top(skill, ctx), code);
}

/**
 * A calc of a skill, D2's integer: one of its columns (elem.sym, aura.stats[0].calc, a tooltip line's
 * calcA…) or any expression in its codes. A number is itself; none is 0.
 */
export function skillCalc(skill: string, calc: D2xCalc | undefined, ctx: CalcCtx): number {
  return skillCalcIn(top(skill, ctx), calc);
}

/** one MissCalc.txt code of a missile (dl12, hpa1, rang…) at CalcCtx.lvl, the missile's level */
export function missileValue(missile: string, code: string, ctx: CalcCtx): number {
  return missileCode(topMissile(missile, ctx), code);
}

/** a calc of a missile (calcs.srv, .hit, .dmg, elem.sym…) at CalcCtx.lvl */
export function missileCalc(missile: string, calc: D2xCalc | undefined, ctx: CalcCtx): number {
  return missileCalcIn(topMissile(missile, ctx), calc);
}

// ───────────────────────── in the game's units ─────────────────────────

/**
 * What a skill deals of its element, points: what its own attack and its missiles take, enms–exms
 * ÷ 256 (synergy and the caster's mastery in, Missile.cpp:554-561). `type` is its EType; with none
 * (Inner Sight, Prayer) the E columns are only numbers its calcs read.
 */
export function elemDamage(skill: string, ctx: CalcCtx): { type: string | null; min: number; max: number } {
  const e = top(skill, ctx);
  return { type: rowOf(e).elem?.type ?? null, min: skillElem256(e, 'min', true) / 256, max: skillElem256(e, 'max', true) / 256 };
}

/** how long its element holds (a chill, a freeze, a burn), seconds: edln frames ÷ 25, ELenSymPerCalc in */
export function elemSeconds(skill: string, ctx: CalcCtx): number {
  return frames(skillLenFrames(top(skill, ctx)));
}

/**
 * The physical damage a skill adds itself, points. With `weapon` (the weapon's damage, whole points)
 * its SrcDam share is in, as the skill's own attack takes it; its missiles add the weapon unshifted
 * on their own (Missile.cpp:545-551, 640-662), so leave it out for them.
 */
export function physDamage(skill: string, ctx: CalcCtx, weapon?: [number, number]): { min: number; max: number } {
  const e = top(skill, ctx);
  return { min: skillPhys256(e, 'min', weapon?.[0]) / 256, max: skillPhys256(e, 'max', weapon?.[1]) / 256 };
}

/** the mana a cast takes, points: minmana its floor, none for a skill with no cost (Skills.cpp:1061-1096) */
export function manaCost(skill: string, lvl: number): number {
  return mana256(rowOf(top(skill, { lvl })), lvl, true) / 256;
}

/** the attack rating bonus, % (toht) */
export function toHitBonus(skill: string, ctx: CalcCtx): number {
  return skillCode(top(skill, ctx), 'toht');
}

/** how far an aura, buff or curse reaches, metres: aurarangecalc in sub-tiles, the unit D2 searches by (SrvDo006, SkillAma.cpp:384-403) */
export function auraRadius(skill: string, ctx: CalcCtx): number {
  return subtiles(skillCode(top(skill, ctx), 'rng'));
}

/** how long a buff or curse holds, seconds: auralencalc in frames (Inner Sight's, SkillAma.cpp:396) */
export function auraSeconds(skill: string, ctx: CalcCtx): number {
  return frames(skillCode(top(skill, ctx), 'len'));
}

/** the stats an aura, buff or curse puts on, by ItemStatCost name, in D2's units (Inner Sight's armorclass −40; Prayer's hitpoints in 256ths) */
export function auraStats(skill: string, ctx: CalcCtx): { stat: string; value: number }[] {
  const e = top(skill, ctx);
  return (rowOf(e).aura?.stats ?? []).map((s) => ({ stat: s.stat, value: skillCalcIn(e, s.calc) }));
}

/** the stats a passive (or an aura's own side, Holy Fire's attack damage) sets, by ItemStatCost name, in D2's units */
export function passiveStats(skill: string, ctx: CalcCtx): { stat: string; value: number }[] {
  const e = top(skill, ctx);
  return (rowOf(e).passive?.stats ?? []).map((s) => ({ stat: s.stat, value: skillCalcIn(e, s.calc) }));
}

/**
 * How far round its hit a missile's blast reaches, metres (MISSMODE_SrvHit01, MissMode.cpp:2087-2127):
 * its sHitPar1 sub-tiles, or when that is 0 its skill's calc1 at the missile's level (CalcCtx.lvl), at
 * least 1; CalcCtx.skills gives the caster's levels. Undefined for a missile whose hit is no blast.
 */
export function blastRadius(missile: string, ctx: CalcCtx): number | undefined {
  const m = topMissile(missile, ctx);
  if (m.row.funcs?.hit !== 1) return undefined;
  let r = m.row.hitParams?.[1] ?? 0;
  if (r <= 0) {
    const skill = m.row.skill;
    if (!skill || !has(D2X_SKILLS, skill)) return undefined;
    r = Math.max(skillCode({ ...skillAt(m.unit, skill, 1), L: ctx.lvl }, 'clc1'), 1);
  }
  return subtiles(r);
}

/**
 * The blast of a skill's shot, metres: its server missile's, or the first of that missile's hit
 * sub-missiles that blasts, the way Exploding Arrow's and Freezing Arrow's arrows make one where they
 * hit (MISSMODE_SrvHit04, MissMode.cpp:2673-2707). Undefined when nothing blasts.
 */
export function skillBlastRadius(skill: string, ctx: CalcCtx): number | undefined {
  const s = rowOf(top(skill, ctx));
  const id = s.missiles?.srv ?? s.missiles?.srvA;
  if (!id || !has(D2X_MISSILES, id)) return undefined;
  const m = D2X_MISSILES[id];
  const at: CalcCtx = { ...ctx, skills: { ...ctx.skills, [skill]: { blvl: ctx.blvl ?? ctx.lvl, lvl: ctx.lvl } } };
  if (m.funcs?.hit === 1) return blastRadius(id, at);
  for (const sub of m.sub?.hit ?? []) if (D2X_MISSILES[sub]?.funcs?.hit === 1) return blastRadius(sub, at);
  return undefined;
}

/**
 * The share of the shot's physical damage a missile turns elemental, % (MISSMODE_SrvDmg01,
 * MissMode.cpp:4314-4339): its DmgCalc1 at its level, kept to 100; 0 for a missile without that
 * damage function. D2R's Fire Arrow and Cold Arrow: 3 + 2 a level.
 */
export function convertPct(missile: string, ctx: CalcCtx): number {
  const m = topMissile(missile, ctx);
  if (m.row.funcs?.dmg !== 1) return 0;
  const pct = missileCalcIn(m, m.row.calcs?.dmg);
  return pct <= 0 ? 0 : Math.min(pct, 100);
}

/** a missile's own elemental damage, points, and length, seconds: one that deals no skill's (Fist of the Heavens' bolts) */
export function missileElem(missile: string, ctx: CalcCtx): { type: string | null; min: number; max: number; seconds: number } {
  const m = topMissile(missile, ctx);
  return { type: m.row.elem?.type ?? null, min: missileElem256(m, 'min') / 256, max: missileElem256(m, 'max') / 256, seconds: frames(missileLenFrames(m)) };
}
