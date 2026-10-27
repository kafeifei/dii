// D2 properties → D2Prop { c, p?, min, max } (src/data/d2/types.ts), and the coverage check: every
// code an imported row uses must be one src/items/props.ts reads, or be listed in KNOWN_UNMAPPED with
// the reason, so a new table never loses properties silently (propMods drops codes it does not know).
import { importTs, rows, tables } from './load.mjs';
import { WARLOCK, isWarlockTab } from './scope.mjs';

/**
 * property codes the game does not read, and why. The item system (src/items/props.ts) reads every
 * other one: what it has no effect for yet it maps to a stat the tooltip greys (本游戏未实现).
 */
export const KNOWN_UNMAPPED = {
  'cold-len': 'chill length in frames: the game chills for a fixed time (dmg-cold and cold-min/max still read)',
  // looks only: the tooltip has no line for them either (ItemStatCost has no descfunc)
  bloody: 'extra blood, visuals only',
  fade: 'fade state, visuals only',
  state: 'a full-set glow state, visuals only',
};

/** codes whose parameter is a skill (by id or name) */
export const SKILL_PROPS = new Set(['skill', 'oskill', 'aura', 'hit-skill', 'gethit-skill', 'att-skill', 'kill-skill', 'death-skill', 'levelup-skill', 'charged']);

export async function propReader() {
  const [skillsJ, classJ] = await tables('skills', 'playerclass');
  // class ids are PlayerClass.txt's row order (ama 0 … ass 6), the Warlock last
  const warlockId = rows(classJ).sort((a, b) => a.lineNumber - b.lineNumber).map((r) => r.Code).indexOf(WARLOCK);
  if (warlockId !== 7) throw new Error(`PlayerClass.txt: the Warlock is class ${warlockId}, not the last (7)`);
  const SKILLS = rows(skillsJ).filter((s) => s.skill);
  const byId = new Map(SKILLS.map((s) => [s['*Id'], s]));
  const byName = new Map(SKILLS.map((s) => [s.skill.toLowerCase(), s]));
  /** D2 skill name → its row, for every skill an imported row refers to */
  const skills = new Map();
  const unknownSkills = new Set();
  const skillOf = (p) => (typeof p === 'number' || /^\d+$/.test(p) ? byId.get(+p) : byName.get(String(p).toLowerCase()));

  /**
   * One property; the code is lower-cased (the tables write "Gethit-skill" as well as "gethit-skill").
   * A code starting with * is commented out in the tables and the game skips it: null.
   */
  function prop(code, param, min, max) {
    if (String(code).startsWith('*')) return null;
    const o = { c: String(code).trim().toLowerCase() };
    if (param !== undefined && param !== null && param !== '') {
      if (SKILL_PROPS.has(o.c)) {
        const s = skillOf(param);
        if (s) skills.set(s.skill, s);
        else unknownSkills.add(`${o.c}:${param}`);
        o.p = s ? s.skill : String(param);
      } else o.p = param;
    }
    o.min = min ?? 0;
    o.max = max ?? o.min;
    // randclassskill rolls a class id from min to max (Properties.txt): the expansion widened Hellfire
    // Torch's 0–6 to take in the Warlock, so the range stops at the class before it
    if (o.c === 'randclassskill' && o.min < warlockId && o.max >= warlockId) o.max = warlockId - 1;
    return o;
  }
  /** a property that only means something to the Warlock: its class skills, skill tabs, skills, or a random class that can only be it */
  const isWarlock = (o) =>
    o.c === WARLOCK ||
    (o.c === 'skilltab' && isWarlockTab(o.p)) ||
    (SKILL_PROPS.has(o.c) && skillOf(o.p)?.charclass === WARLOCK) ||
    (o.c === 'randclassskill' && o.min >= warlockId);
  return { prop, isWarlock, skills, unknownSkills, skillOf };
}

/** records which codes the kept rows use; check() fails on any the game neither reads nor lists */
export function coverage() {
  const used = new Map();
  return {
    add(where, props) {
      for (const p of props) {
        if (!used.has(p.c)) used.set(p.c, new Map());
        const m = used.get(p.c);
        m.set(where, (m.get(where) ?? 0) + 1);
      }
    },
    async check() {
      const { PROP_CODES } = await importTs('src/items/props.ts');
      const mapped = new Set(PROP_CODES);
      const where = (c) => [...used.get(c)].map(([w, n]) => `${w} ${n}`).join(', ');
      const missing = [...used.keys()].filter((c) => !mapped.has(c) && !KNOWN_UNMAPPED[c]).sort();
      const listed = [...used.keys()].filter((c) => KNOWN_UNMAPPED[c]).length;
      const stale = Object.keys(KNOWN_UNMAPPED).filter((c) => mapped.has(c));
      if (stale.length) throw new Error(`KNOWN_UNMAPPED lists codes props.ts now reads: ${stale.join(', ')}`);
      console.log(`properties: ${used.size} codes, ${used.size - listed - missing.length} read by props.ts, ${listed} known unmapped`);
      if (missing.length) throw new Error(`unmapped property codes:\n${missing.map((c) => `  ${c}: ${where(c)}`).join('\n')}`);
    },
  };
}
