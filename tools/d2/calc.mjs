// D2's calc expressions (the calc, aurastatcalc, EDmgSymPerCalc… columns of Skills.txt, Missiles.txt
// and SkillDesc.txt). The game data keeps them as written; this parses each one the way D2 does, so
// a typo, an unknown code or a link to a row the data does not have fails the import, and collects
// what it links to (other skills, missiles, stats), which the skills stage then takes in.
//
// The grammar is Fog's (D2MOO source/Fog/src/Calc.cpp at commit d9d394f): integers, codes from
// SkillCalc.txt / MissCalc.txt, the functions min, max, rand, skill('Name'.code), miss('name'.code),
// stat('name'.base|mod|accr) and sklvl('Name'.level.code) (another skill's code at the level the
// first code gives), and the operators ?: (lowest), < <= > >= == !=, + -, * /, ^ and unary −
// (highest), left to right. Quotes are skipped (578-581). A ( left open closes at the end: Fog
// flushes it with the rest (902-904, 394-414), and a few D2R calcs rely on it (Fire Wall's
// synergy); check() hands back the text with the ) added, so the game's evaluator can be strict.
// Fog reads a code it does not know as 0 (the linker's "not found", 451-472); here that fails.

/** a calc column's value as D2 reads it: numbers stay, strings lose the quoting of the .txt export */
export function calcText(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/"/g, '').trim();
  return s === '' ? undefined : /^-?\d+$/.test(s) ? +s : s;
}

const OPS = ['<=', '>=', '==', '!=', '<', '>', '+', '-', '*', '/', '^', '?', ':', ',', '(', ')'];

function tokens(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // D2R's description calcs have decimals (-6.25); Fog itself only reads integers
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: +num[0] });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0] });
      i += id[0].length;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) throw new Error('unclosed quote');
      out.push({ t: 'link', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === '.') {
      const code = /^\.([A-Za-z0-9_]+)/.exec(src.slice(i));
      if (!code) throw new Error(`bad sublink at ${i}`);
      out.push({ t: 'sub', v: code[1] });
      i += code[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`unexpected ${c} at ${i}`);
    out.push({ t: 'op', v: op });
    i += op.length;
  }
  return out;
}

/** functions taking a 'name'.code link (sklvl's has a level before the code) */
const LINK_FNS = { skill: true, miss: true, stat: true, sklvl: true };
const PLAIN_FNS = { min: 2, max: 2, rand: 2 };
const STAT_CODES = new Set(['base', 'mod', 'accr']);
export const SKILL_FNS = new Set([...Object.keys(PLAIN_FNS), 'skill', 'miss', 'stat', 'sklvl']);
export const MISSILE_FNS = new Set([...Object.keys(PLAIN_FNS), 'skill', 'miss']);

/**
 * A checker for one kind of calc. `codes` are the calc codes it may name (SkillCalc.txt for skills
 * and descriptions, MissCalc.txt for missiles), `fns` the functions it may call; links are checked
 * with `has` (skill, missile, stat → bool). check(expr, where) → the { skills, missiles, stats } it
 * links to; it throws on anything D2 could not compile.
 */
export function calcChecker({ codes, fns, skillCodes, missCodes, has }) {
  return function check(expr, where) {
    const refs = { skills: new Set(), missiles: new Set(), stats: new Set(), text: expr };
    if (typeof expr === 'number') return refs;
    const fail = (m) => {
      throw new Error(`${where}: calc "${expr}": ${m}`);
    };
    let ts;
    try {
      ts = tokens(expr);
    } catch (e) {
      fail(e.message);
    }
    let p = 0;
    let open = 0;
    const isOp = (v) => ts[p]?.t === 'op' && ts[p].v === v;
    const eat = (v) => {
      if (!isOp(v)) fail(`expected ${v} at token ${p}`);
      p++;
    };
    const link = (fn) => {
      const l = ts[p++];
      if (fn === 'sklvl') {
        const lvl = ts[p++];
        if (lvl?.t !== 'sub' || !(codes.has(lvl.v) || /^\d+$/.test(lvl.v))) fail(`sklvl() wants 'Name'.level.code`);
      }
      const s = ts[p++];
      if (l?.t !== 'link' || s?.t !== 'sub') fail(`${fn}() wants 'name'.code`);
      if (fn === 'skill' || fn === 'sklvl') {
        if (!has.skill(l.v)) fail(`no skill ${l.v}`);
        if (!skillCodes.has(s.v)) fail(`${s.v} is no skill calc code`);
        refs.skills.add(l.v);
      } else if (fn === 'miss') {
        if (!has.missile(l.v)) fail(`no missile ${l.v}`);
        if (!missCodes.has(s.v)) fail(`${s.v} is no missile calc code`);
        refs.missiles.add(l.v);
      } else {
        if (!has.stat(l.v)) fail(`no stat ${l.v}`);
        if (!STAT_CODES.has(s.v)) fail(`${s.v} is no stat code`);
        refs.stats.add(l.v);
      }
    };
    const args = (n) => {
      let k = 1;
      ternary();
      while (isOp(',')) {
        p++;
        ternary();
        k++;
      }
      if (k !== n) fail(`wrong number of arguments`);
    };
    const primary = () => {
      const t = ts[p];
      if (!t) fail('ends early');
      if (t.t === 'num') return void p++;
      if (isOp('(')) {
        p++;
        ternary();
        if (p === ts.length) return void open++;
        return eat(')');
      }
      if (isOp('-')) {
        p++;
        return power();
      }
      if (t.t !== 'id') fail(`unexpected ${t.v}`);
      p++;
      const name = t.v.toLowerCase();
      if (!isOp('(')) {
        if (!codes.has(t.v)) fail(`${t.v} is no calc code`);
        return;
      }
      if (!fns.has(name)) fail(`${t.v}() is not a calc function here`);
      p++;
      if (LINK_FNS[name]) link(name);
      else args(PLAIN_FNS[name]);
      if (p === ts.length) return void open++;
      eat(')');
    };
    const power = () => {
      primary();
      while (isOp('^')) {
        p++;
        primary();
      }
    };
    const binary = (ops, next) => () => {
      next();
      while (ts[p]?.t === 'op' && ops.includes(ts[p].v)) {
        p++;
        next();
      }
    };
    const mul = binary(['*', '/'], power);
    const add = binary(['+', '-'], mul);
    const cmp = binary(['<', '<=', '>', '>=', '==', '!='], add);
    function ternary() {
      cmp();
      if (isOp('?')) {
        p++;
        ternary();
        eat(':');
        ternary();
      }
    }
    ternary();
    if (p !== ts.length) fail(`unexpected ${ts[p].v} at token ${p}`);
    if (open) refs.text = expr + ')'.repeat(open);
    return refs;
  };
}

/**
 * Missiles.txt Range in the pinned 3.x tables: a number, or 2.7's Range + lvl × LevRange folded into
 * one expression ("7 +  (lvl *  2)"). → [range, per level], in frames.
 */
export function missileRange(v, where) {
  if (v === undefined || typeof v === 'number') return [v ?? 0, 0];
  const m = /^\s*(\d+)\s*\+\s*\(\s*lvl\s*\*\s*(\d+)\s*\)\s*$/.exec(String(v));
  if (!m) throw new Error(`${where}: Range "${v}" is not range + (lvl * per level)`);
  return [+m[1], +m[2]];
}
