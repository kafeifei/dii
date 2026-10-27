// Builds the game's data from Diablo II: Resurrected's own data tables.
//
//   node tools/d2-import.mjs
//
// then `node tools/d2-validate.mjs` checks the generated src/data/d2x against D2's semantics.
//
// Sources, pinned (downloaded once into tools/.d2cache):
// - the game's .txt tables as JSON, patch 3.3 — github.com/blizzhackers/d2data
// - the game's string tables with the official Simplified Chinese — github.com/WalterCouto/D2CE
// Our names for the proper nouns are in tools/d2-names (see tools/d2/names.mjs).
//
// Two outputs:
// - src/data/d2/*.ts, the first import: weapons, magic affixes, runes, gems, runewords, Horadric
//   Cube recipes, experience and the rune/gem treasure classes (melee and caster weapons only).
//   The game's items are on src/data/d2x now; these stay for what still reads them: the cube's
//   recipes, experience and the Good classes, and old saves (src/items/legacy.ts: the weapon ids,
//   affix strings and runeword ids items were made with then).
// - src/data/d2x/*.ts, the full tables in the content scope (tools/d2/scope.mjs), one stage per
//   module in tools/d2/: items, then characters (classes, difficulties, experience, quality
//   ratios, NPC prices, gambling, hirelings), then world (Act 1's areas, monsters, the classes'
//   pets, superuniques) and treasure (every treasure class Act 1 drops from), checked against
//   d2data's precalculated drop rates in tools/d2/validation.md, then skills (the two classes'
//   trees, Act 1's monster, modifier and hireling skills, the names of every other skill items
//   carry or roll, their missiles and states, the calc tables), then the item tooltips' stat
//   descriptions and strings (tools/d2/statdesc.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { buildCharacters } from './d2/characters.mjs';
import { buildItems } from './d2/items.mjs';
import { DATA, ROOT, STR, load, rows } from './d2/load.mjs';
import { writeReport } from './d2/names.mjs';
import { buildSkills } from './d2/skills.mjs';
import { buildStatDesc } from './d2/statdesc.mjs';
import { buildTreasure } from './d2/treasure.mjs';
import { writeValidation } from './d2/validate.mjs';
import { buildWorld } from './d2/world.mjs';

const OUT = path.join(ROOT, 'src/data/d2');

const [weaponsJ, prefixJ, suffixJ, itypesJ, runesJ, gemsJ, miscJ, cubeJ, expJ, monlvlJ, tcJ, skillsJ] = await Promise.all(
  ['weapons', 'magicprefix', 'magicsuffix', 'itemtypes', 'runes', 'gems', 'misc', 'cubemain', 'experience', 'monlvl', 'treasureclassex', 'skills'].map((n) => load(DATA, n)),
);
const [namesS, runesS, affixS, skillsS] = await Promise.all(['item-names', 'item-runes', 'item-nameaffixes', 'skills'].map((n) => load(STR, n)));

const zh = (table) => Object.fromEntries(rows(table).map((e) => [e.Key, e.zhCN]));
const NAME = zh(namesS);
const RUNE_NAME = zh(runesS);
const AFFIX_NAME = zh(affixS);
const SKILL_STR = zh(skillsS);

// ───────────────────────── item types ─────────────────────────
const ITYPE = Object.fromEntries(rows(itypesJ).filter((r) => r.Code).map((r) => [r.Code, r]));
function ancestors(code, acc = new Set()) {
  if (!code || acc.has(code)) return acc;
  acc.add(code);
  const t = ITYPE[code];
  if (t) for (const p of [t.Equiv1, t.Equiv2]) ancestors(p, acc);
  return acc;
}

/** D2 weapon type → this game's item type */
const WEAPON_TYPES = {
  swor: 'sword', axe: 'axe', club: 'club', mace: 'mace', hamm: 'hammer', scep: 'scepter', wand: 'wand',
  knif: 'dagger', spea: 'spear', pole: 'polearm', staf: 'staff', orb: 'orb',
};
/** staff mods by class code (ItemTypes.txt StaffMods), for the classes this game has */
const STAFFMOD_CLASS = { sor: 'sorceress', pal: 'paladin' };
const CLASS_ONLY = { sor: 'sorceress', pal: 'paladin' };

// attacks per second at weapon speed modifier 0, by animation class (the game's own scale)
const BASE_APS = { '1hs': 1.6, '1ht': 1.6, '2hs': 1.45, stf: 1.35, '2ht': 1.25 };

const idOf = (en) => en.toLowerCase().replace(/[^a-z0-9]/g, '');

// ───────────────────────── weapons ─────────────────────────
const W = rows(weaponsJ).filter((r) => r.code && r.spawnable && WEAPON_TYPES[r.type] && !r.quest);
const CODE_ID = Object.fromEntries(W.map((r) => [r.code, idOf(r.name)]));
const weapons = W.map((r) => {
  const two = !!r['2handed'];
  const wclass = two && r['1or2handed'] ? r['2handedwclass'] : r.wclass;
  const wsm = r.speed ?? 0;
  const tierCodes = [r.normcode, r.ubercode, r.ultracode];
  const tier = tierCodes.indexOf(r.code);
  const t = ITYPE[r.type];
  const out = {
    id: CODE_ID[r.code],
    code: r.code,
    name: NAME[r.code] ?? r.name,
    en: r.name,
    type: WEAPON_TYPES[r.type],
    itype: r.type,
    w: r.invwidth,
    h: r.invheight,
    qlvl: r.level,
    reqLvl: Math.max(1, r.levelreq ?? 0),
  };
  if (r.reqstr) out.reqStr = r.reqstr;
  if (r.reqdex) out.reqDex = r.reqdex;
  out.dmg = two ? [r['2handmindam'], r['2handmaxdam']] : [r.mindam, r.maxdam];
  if (two) out.twoHanded = true;
  out.speed = +(BASE_APS[wclass] * (1 - wsm / 100)).toFixed(3);
  out.wsm = wsm;
  out.maxSockets = r.gemsockets ?? 0;
  out.tier = tier < 0 ? 0 : tier;
  if (tierCodes.every((c) => CODE_ID[c])) out.tiers = tierCodes.map((c) => CODE_ID[c]);
  out.strBonus = r.StrBonus ?? 0;
  if (r.DexBonus) out.dexBonus = r.DexBonus;
  if (r['magic lvl']) out.magicLvl = r['magic lvl'];
  if (t?.StaffMods && STAFFMOD_CLASS[t.StaffMods]) out.staffMods = STAFFMOD_CLASS[t.StaffMods];
  if (t?.Class && CLASS_ONLY[t.Class]) out.cls = CLASS_ONLY[t.Class];
  out.price = Math.max(5, Math.round(r.cost * 0.4));
  return out;
});

// ───────────────────────── skills referenced by items ─────────────────────────
const SKILLS = rows(skillsJ).filter((s) => s.skill);
const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s['*Id'], s]));
const SKILL_BY_NAME = Object.fromEntries(SKILLS.map((s) => [s.skill.toLowerCase(), s]));
const usedSkills = new Map();
/** a skill parameter (name or number) → its D2 name, recording it for the skill table */
function skillParam(p) {
  const s = typeof p === 'number' ? SKILL_BY_ID[p] : SKILL_BY_NAME[String(p).toLowerCase()];
  if (!s) return String(p);
  usedSkills.set(s.skill, s);
  return s.skill;
}
const SKILL_PROPS = new Set(['skill', 'oskill', 'aura', 'hit-skill', 'gethit-skill', 'att-skill', 'kill-skill', 'death-skill', 'levelup-skill', 'charged']);
function prop(code, param, min, max) {
  const o = { c: code };
  if (param !== undefined && param !== null && param !== '') o.p = SKILL_PROPS.has(code) ? skillParam(param) : param;
  o.min = min ?? 0;
  o.max = max ?? o.min;
  return o;
}

// ───────────────────────── magic affixes ─────────────────────────
const WEAPON_ITYPES = new Set();
for (const r of W) for (const a of ancestors(r.type)) WEAPON_ITYPES.add(a);
// affixes the cube recipes name by row (pre=/suf=), which may be for jewelry or shields
const CUBE_AFFIX = { prefix: new Set(), suffix: new Set() };
for (const r of rows(cubeJ)) {
  for (const k of ['output', 'output b', 'output c']) {
    const m = String(r[k] ?? '').match(/(pre|suf)=(\d+)/g) ?? [];
    for (const x of m) CUBE_AFFIX[x.startsWith('pre') ? 'prefix' : 'suffix'].add(+x.slice(4));
  }
}
function affixes(table, kind) {
  const out = [];
  for (const [idx, r] of Object.entries(table)) {
    if (!r.Name) continue;
    const itypes = [1, 2, 3, 4, 5, 6, 7].map((i) => r[`itype${i}`]).filter(Boolean);
    const etypes = [1, 2, 3, 4, 5].map((i) => r[`etype${i}`]).filter(Boolean);
    const spawns = r.spawnable && r.frequency > 0 && itypes.some((t) => WEAPON_ITYPES.has(t));
    if (!spawns && !CUBE_AFFIX[kind].has(+idx)) continue;
    const props = [1, 2, 3].filter((i) => r[`mod${i}code`]).map((i) => prop(r[`mod${i}code`], r[`mod${i}param`], r[`mod${i}min`], r[`mod${i}max`]));
    const a = { idx: +idx, name: AFFIX_NAME[r.Name] ?? r.Name, en: r.Name, level: r.level ?? 0 };
    if (r.maxlevel) a.maxLevel = r.maxlevel;
    a.reqLvl = r.levelreq ?? 0;
    a.group = r.group ?? 0;
    a.freq = spawns ? r.frequency : 0;
    if (!r.rare) a.noRare = true;
    if (r.classspecific) a.cls = r.classspecific;
    a.itypes = itypes;
    if (etypes.length) a.etypes = etypes;
    a.props = props;
    out.push(a);
  }
  return out;
}
const prefixes = affixes(prefixJ, 'prefix');
const suffixes = affixes(suffixJ, 'suffix');

// ───────────────────────── runes and gems ─────────────────────────
const MISC = Object.fromEntries(rows(miscJ).filter((r) => r.code).map((r) => [r.code, r]));
const GEM_TYPES = { gema: 'amethyst', gemt: 'topaz', gems: 'sapphire', geme: 'emerald', gemr: 'ruby', gemd: 'diamond', gemz: 'skull' };
const GEM_GRADE = ['Chipped', 'Flawed', '', 'Flawless', 'Perfect'];
const mods3 = (r, k) =>
  [1, 2, 3]
    .filter((i) => r[`${k}Mod${i}Code`])
    .map((i) => prop(r[`${k}Mod${i}Code`], r[`${k}Mod${i}Param`], r[`${k}Mod${i}Min`], r[`${k}Mod${i}Max`]));
const runes = [];
const gems = [];
for (const r of rows(gemsJ)) {
  const m = MISC[r.code];
  if (!m || !m.spawnable) continue;
  const base = {
    id: r.code,
    name: NAME[r.code] ?? RUNE_NAME[r.code] ?? r.name,
    en: r.name,
    qlvl: m.level ?? 0,
    reqLvl: Math.max(1, m.levelreq ?? 0),
    price: Math.max(5, Math.round(m.cost * 0.4)),
    weapon: mods3(r, 'weapon'),
    armor: mods3(r, 'helm'),
    shield: mods3(r, 'shield'),
  };
  if (m.type === 'rune') {
    runes.push({ ...base, letter: RUNE_NAME[`${r.code}L`] ?? r.name.replace(' Rune', '') });
  } else if (GEM_TYPES[m.type]) {
    const grade = GEM_GRADE.findIndex((g) => (g ? r.name.startsWith(g) : !GEM_GRADE.some((x) => x && r.name.startsWith(x))));
    gems.push({ ...base, gem: GEM_TYPES[m.type], grade });
  }
}
runes.sort((a, b) => a.id.localeCompare(b.id));

// ───────────────────────── runewords ─────────────────────────
const RUNE_REQ = Object.fromEntries(runes.map((r) => [r.id, r.reqLvl]));
const runewords = rows(runesJ)
  .filter((r) => r.complete)
  .map((r) => {
    const rs = [1, 2, 3, 4, 5, 6].map((i) => r[`Rune${i}`]).filter(Boolean);
    const props = [1, 2, 3, 4, 5, 6, 7].filter((i) => r[`T1Code${i}`]).map((i) => prop(r[`T1Code${i}`], r[`T1Param${i}`], r[`T1Min${i}`], r[`T1Max${i}`]));
    const en = r['*Rune Name'];
    const o = { id: r.Name, name: RUNE_NAME[r.Name] ?? en, en, runes: rs };
    o.itypes = [1, 2, 3, 4, 5, 6].map((i) => r[`itype${i}`]).filter(Boolean);
    const et = [1, 2, 3].map((i) => r[`etype${i}`]).filter(Boolean);
    if (et.length) o.etypes = et;
    o.reqLvl = Math.max(...rs.map((x) => RUNE_REQ[x] ?? 1));
    o.props = props;
    if (r.firstLadderSeason) o.ladder = true;
    return o;
  });

// ───────────────────────── Horadric Cube ─────────────────────────
// Recipes whose inputs and outputs all exist in this game. Left out: quest items, keys, organs,
// essences and the Uber recipes; crafting (needs jewels and D2's armor bases); repairs (no
// durability); arrows, bolts, throwing weapons; low-quality items; anything needing the Stone of
// Jordan or the special potions (exploding, thawing, antidote, strangling gas).
const GAME_POTIONS = { hpot: 1, mpot: 1, rvs: 1, rvl: 1 };
function parseSpec(s) {
  const [what, ...flags] = String(s).replace(/"/g, '').split(',');
  const o = { what: what.trim() };
  for (const f of flags) {
    const [k, v] = f.trim().split('=');
    if (k === 'qty') o.qty = +v;
    else if (['pre', 'suf', 'sock', 'lvl'].includes(k)) o[k] = v === undefined ? true : +v;
    else o[k] = true;
  }
  return o;
}
const SUPPORTED_THINGS = new Set([
  ...Object.keys(GAME_POTIONS), ...runes.map((r) => r.id), ...gems.map((g) => g.id),
  'gem0', 'gem1', 'gem2', 'gem3', 'gem4', 'gema', 'gemt', 'gems', 'geme', 'gemr', 'gemd', 'gemz',
  'any', 'weap', 'armo', 'tors', 'helm', 'shld', 'amul', 'ring', 'belt', 'amu', 'rin', 'usetype', 'useitem',
  ...WEAPON_ITYPES, ...W.map((r) => r.code),
]);
const UNSUPPORTED_FLAGS = ['low', 'noe', 'rep', 'rch', 'eth', 'upg', 'crf'];
const cube = [];
for (const r of rows(cubeJ)) {
  if (!r.enabled || r.op) continue;
  const ins = [1, 2, 3, 4, 5, 6, 7].map((i) => r[`input ${i}`]).filter(Boolean).map(parseSpec);
  const out = parseSpec(r.output);
  if (r['output b'] || r['output c']) continue;
  const all = [...ins, out];
  if (!all.every((s) => SUPPORTED_THINGS.has(s.what))) continue;
  if (all.some((s) => UNSUPPORTED_FLAGS.some((f) => s[f]))) continue;
  const mods = [1, 2, 3, 4, 5].filter((i) => r[`mod ${i}`]).map((i) => prop(r[`mod ${i}`], r[`mod ${i} param`], r[`mod ${i} min`], r[`mod ${i} max`]));
  const o = { desc: r.description, inputs: ins.map((s) => ({ ...s, qty: s.qty ?? 1 })), output: out };
  if (mods.length) o.mods = mods;
  if (r.ilvl) o.ilvl = r.ilvl;
  if (r.plvl) o.plvl = r.plvl;
  if (r.lvl) o.lvl = r.lvl;
  cube.push(o);
}
// item codes in recipes → this game's ids
for (const rc of cube) for (const s of [...rc.inputs, rc.output]) if (CODE_ID[s.what]) s.what = CODE_ID[s.what];

// ───────────────────────── experience ─────────────────────────
const expRows = rows(expJ).filter((r) => typeof r.Level === 'number');
/** XP[L] = total experience to reach level L+1 (XP[0] = 0) */
const xpTable = expRows.filter((r) => r.Level <= 98).map((r) => r.Paladin);
const expRatio = expRows.filter((r) => r.Level <= 99).map((r) => r.ExpRatio);
const monXp = rows(monlvlJ)
  .filter((r) => typeof r.Level === 'number' && r.Level >= 1 && r.Level <= 110)
  .map((r) => [r.XP, r['XP(N)'], r['XP(H)']]);

// ───────────────────────── rune and gem treasure classes ─────────────────────────
const TC = Object.fromEntries(rows(tcJ).filter((r) => r['Treasure Class']).map((r) => [r['Treasure Class'], r]));
const tcItems = (name) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((i) => TC[name][`Item${i}`]).map((i) => [TC[name][`Item${i}`], TC[name][`Prob${i}`]]);
/** each rune's chance within one "Runes N" class */
function runeOdds(name, scale = 1, acc = {}) {
  const items = tcItems(name);
  const total = items.reduce((s, [, p]) => s + p, 0);
  for (const [it, p] of items) {
    if (it.startsWith('Runes')) runeOdds(it, (scale * p) / total, acc);
    else acc[it] = (acc[it] ?? 0) + (scale * p) / total;
  }
  return acc;
}
const GOOD = ['Act 1 Good', 'Act 2 Good', 'Act 3 Good', 'Act 4 Good', 'Act 5 Good', 'Act 1 (N) Good', 'Act 2 (N) Good', 'Act 3 (N) Good', 'Act 4 (N) Good', 'Act 5 (N) Good', 'Act 1 (H) Good', 'Act 2 (H) Good', 'Act 3 (H) Good', 'Act 4 (H) Good', 'Act 5 (H) Good'];
const GEM_TC = { 'Chipped Gem': 0, 'Flawed Gem': 1, 'Normal Gem': 2, 'Flawless Gem': 3, 'Perfect Gem': 4 };
const goodTcs = GOOD.map((name) => {
  const entries = [];
  for (const [it, w] of tcItems(name)) {
    if (it.startsWith('Jewelry')) entries.push({ kind: 'jewelry', w });
    else if (it in GEM_TC) entries.push({ kind: 'gem', grade: GEM_TC[it], w });
    else if (it.startsWith('Runes')) {
      const odds = runeOdds(it);
      entries.push({ kind: 'rune', w, runes: Object.entries(odds).sort().map(([k, v]) => [k, +v.toFixed(6)]) });
    }
  }
  return { name, level: TC[name].level, entries };
});

// ───────────────────────── write ─────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const HEAD = `// Generated by tools/d2-import.mjs from Diablo II: Resurrected's data tables. Do not edit.\n`;
const json = (v) => JSON.stringify(v);
const list = (arr) => `[\n${arr.map((x) => `  ${json(x)},`).join('\n')}\n]`;
function write(file, body) {
  fs.writeFileSync(path.join(OUT, file), HEAD + body);
  console.log(`${file}: ${(body.length / 1024).toFixed(0)} KB`);
}
write('weapons.ts', `import type { ItemBase } from '../items';\n\nexport const D2_WEAPONS: ItemBase[] = ${list(weapons)};\n`);
write(
  'affixes.ts',
  `import type { D2Affix } from './types';\n\nexport const D2_PREFIXES: D2Affix[] = ${list(prefixes)};\n\nexport const D2_SUFFIXES: D2Affix[] = ${list(suffixes)};\n`,
);
write(
  'socketables.ts',
  `import type { D2Gem, D2Rune } from './types';\n\nexport const D2_RUNES: D2Rune[] = ${list(runes)};\n\nexport const D2_GEMS: D2Gem[] = ${list(gems)};\n`,
);
write('runewords.ts', `import type { D2Runeword } from './types';\n\nexport const D2_RUNEWORDS: D2Runeword[] = ${list(runewords)};\n`);
write('cube.ts', `import type { D2Recipe } from './types';\n\nexport const D2_CUBE: D2Recipe[] = ${list(cube)};\n`);
const itypes = {};
for (const c of new Set([...WEAPON_ITYPES, 'armo', 'tors', 'helm', 'shld', 'glov', 'boot', 'belt', 'ring', 'amul', 'misc', 'rune', 'gem', 'sock', 'miss', 'circ', 'pala', 'seco', 'clas'])) {
  const t = ITYPE[c];
  if (t) itypes[c] = { up: [t.Equiv1, t.Equiv2].filter(Boolean), sockets: [t.MaxSockets1 ?? 0, t.MaxSockets2 ?? 0, t.MaxSockets3 ?? 0] };
}
write('itypes.ts', `/** D2 item types: parents (Equiv1/2) and max sockets by item level 1-25 / 26-40 / 41+ */\nexport const D2_ITYPES: Record<string, { up: string[]; sockets: [number, number, number] }> = ${json(itypes)};\n`);
const skillTable = Object.fromEntries(
  [...usedSkills.values()].sort((a, b) => a['*Id'] - b['*Id']).map((s) => [s.skill, { id: s['*Id'], name: SKILL_STR[`skillname${s['*Id']}`] ?? SKILL_STR[`Skillname${s['*Id']}`] ?? s.skill, cls: s.charclass ?? null, reqLvl: s.reqlevel ?? 1 }]),
);
write('skills.ts', `/** the D2 skills items refer to, by D2 name: official Chinese name, class and required level */\nexport const D2_SKILLS: Record<string, { id: number; name: string; cls: string | null; reqLvl: number }> = ${json(skillTable)};\n`);
write(
  'progression.ts',
  `/** total experience to reach level L+1, index L (D2 experience.txt) */\nexport const D2_XP: number[] = ${json(xpTable)};\n\n/** experience kept at character level L, out of 1024 */\nexport const D2_XP_RATIO: number[] = ${json(expRatio)};\n\n/** monster experience by monster level 1-110: [normal, nightmare, hell] (monlvl.txt) */\nexport const D2_MON_XP: [number, number, number][] = ${json(monXp)};\n\n/** the "Act N Good" treasure classes: jewelry, gems by grade and runes, by monster level */\nexport const D2_GOOD_TCS: { name: string; level: number; entries: { kind: 'jewelry' | 'gem' | 'rune'; w: number; grade?: number; runes?: [string, number][] }[] }[] = ${list(goodTcs)};\n`,
);
console.log(`${weapons.length} weapons, ${prefixes.length}+${suffixes.length} affixes, ${runes.length} runes, ${gems.length} gems, ${runewords.length} runewords, ${cube.length} cube recipes, ${usedSkills.size} skills`);

// ───────────────────────── the full tables ─────────────────────────
const { bases, baseNames, skills: itemSkills, staffMods } = await buildItems();
const { hirelingSkills } = await buildCharacters({ bases });
const world = await buildWorld({ bases });
const treasure = await buildTreasure({ bases, ...world });
await buildSkills({ itemSkills, staffMods, hirelingSkills, ...world, bases });
await buildStatDesc();
await writeValidation({ ...treasure, bases, baseNames });
writeReport();
