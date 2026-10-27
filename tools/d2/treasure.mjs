// The treasure stage → src/data/d2x/treasure.ts: every treasure class Act 1's monsters,
// superuniques and chests drop from, in all three difficulties, following the classes they name and
// the group upgrades of nightmare and hell; and the automatic weapN/armoN/meleN/bowN/abowN classes,
// which TreasureClassEx.txt names but does not define, built the way the game builds them at load.
// tools/d2/validate.mjs checks the result against d2data's precalculated drop rates.
//
// TreasureClassEx.txt is D2R 2.7's, the last before the Warlock expansion. The pinned 3.x table
// reweighted rows when it wrote the expansion's entries into them (hell's Citem and Uitem classes,
// Andarielq), and the weights stay different with those entries taken out; the scope is the game
// before the expansion. Every class an Act 1 drop reaches is in 2.7.
//
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f, by file and line.
import { REF27, load, record, rows, tables, writeD2x } from './load.mjs';
import { OUT_OF_SCOPE_TC } from './scope.mjs';

/** quality factor columns → our keys (out of 1024) */
const QUALITY = { Unique: 'unique', Set: 'set', Rare: 'rare', Magic: 'magic' };
/** per-entry modifiers D2 parses (MonsterTbls.cpp:1047-1170): mul is the gold multiplier, c* override quality factors */
const ENTRY_MODS = { mul: 'goldMul', cu: 'unique', cs: 'set', cr: 'rare', cm: 'magic', ce: 'superior', cg: 'normal' };
/** TreasureClassEx.txt columns D2R added that the game does not take: ladder seasons, and noAlwaysSpawn of the terror zones' sunder charms */
const IGNORED_COLS = ['noAlwaysSpawn', 'firstLadderSeason', 'lastLadderSeason'];

/**
 * The automatic classes, as DATATBLS_CreateItemTypeTreasureClasses builds them (MonsterTbls.cpp:2752-2851):
 * for each item type with the TreasureClass flag, in ItemTypes.txt order, and each level 3, 6, … 96,
 * a class named type + level (weap3, armo6, …) with one pick and no group, holding every spawnable,
 * non-quest item of that type (by its type or type2, up the Equiv chain) whose qlvl is in
 * (level − 3, level], each weighted by the Rarity of the item's own type, at least 1 (2821-2826).
 * Throwing potions only go into their own type's classes (2810). `keep` narrows the items (scope).
 */
export function itemTypeTcs({ itemTypes, items, keep = () => true }) {
  const T = new Map(itemTypes.filter((t) => t.Code).map((t) => [t.Code, t]));
  const memo = new Map();
  const up = (code) => {
    if (memo.has(code)) return memo.get(code);
    const acc = new Set();
    const walk = (c) => {
      if (!c || acc.has(c) || !T.has(c)) return;
      acc.add(c);
      walk(T.get(c).Equiv1);
      walk(T.get(c).Equiv2);
    };
    walk(code);
    memo.set(code, acc);
    return acc;
  };
  const isType = (it, t) => up(it.type).has(t) || (!!it.type2 && up(it.type2).has(t));
  const out = new Map();
  for (const t of [...T.values()].sort((a, b) => a.lineNumber - b.lineNumber)) {
    if (!t.TreasureClass) continue;
    for (let lvl = 3; lvl <= 96; lvl += 3) {
      const entries = [];
      for (const it of items) {
        if (it.quest || !it.spawnable || !T.has(it.type) || !isType(it, t.Code)) continue;
        if (t.Code !== 'tpot' && isType(it, 'tpot')) continue;
        if (!((it.level ?? 0) > lvl - 3 && (it.level ?? 0) <= lvl) || !keep(it)) continue;
        entries.push({ item: it.code, prob: Math.max(1, T.get(it.type).Rarity ?? 0) });
      }
      out.set(`${t.Code}${lvl}`, { picks: 1, items: entries, auto: true });
    }
  }
  return out;
}

/** D2's items table: weapons, then armor, then misc, each in its own row order */
export const itemsInOrder = (...tbls) => tbls.flatMap((t) => rows(t).filter((r) => r.code).sort((a, b) => a.lineNumber - b.lineNumber));

/**
 * One treasure class row as the game reads it (DATATBLS_LoadTreasureClassExTxt, MonsterTbls.cpp:1325-1410):
 * picks 0 means 1; an entry of 4 characters or less that is an item code is that item, else it is a
 * treasure class, else a unique, else a set item (DATATBLS_ParseTreasureClassItem, 1187-1323);
 * entries with no chance are skipped (1190). `resolve(name)` says what a name is.
 */
export function parseTc(r, resolve) {
  const o = {};
  if (r.group) {
    o.group = r.group;
    o.level = r.level ?? 0;
  }
  o.picks = r.Picks || 1;
  if (r.NoDrop) o.noDrop = r.NoDrop;
  for (const [col, k] of Object.entries(QUALITY)) if (r[col]) o[k] = r[col];
  o.items = [];
  for (let i = 1; i <= 10; i++) {
    const raw = r[`Item${i}`];
    if (!raw || !(r[`Prob${i}`] > 0)) continue;
    const [what, ...mods] = String(raw).replace(/"/g, '').split(',').map((x) => x.trim());
    const kind = resolve(what);
    if (!kind) throw new Error(`treasureclassex ${r['Treasure Class']}: entry ${what} is no item, treasure class, unique or set item`);
    const e = { [kind]: what, prob: r[`Prob${i}`] };
    for (const m of mods) {
      const [k, v] = m.split('=');
      const key = Object.keys(ENTRY_MODS).find((p) => k.startsWith(p));
      if (!key || v === undefined) throw new Error(`treasureclassex ${r['Treasure Class']}: entry modifier ${m}`);
      // gold × mul / 256 (Items.cpp:2533-2536)
      if (key === 'mul') e.goldMul = +v / 256;
      else (e.quality ??= {})[ENTRY_MODS[key]] = +v;
    }
    o.items.push(e);
  }
  return o;
}

export async function buildTreasure({ bases, monsters, superuniques, areas }) {
  const [weaponsJ, armorJ, miscJ, itypesJ, uniqueJ, setItemsJ] = await tables('weapons', 'armor', 'misc', 'itemtypes', 'uniqueitems', 'setitems');
  const tcJ = await load(REF27, 'treasureclassex');
  const known = new Set(['Treasure Class', 'group', 'level', 'Picks', 'NoDrop', ...Object.keys(QUALITY), 'lineNumber', '*ItemProbSum', '*ItemProbTotal', '*TreasureClassDropChance', ...IGNORED_COLS]);
  for (let i = 1; i <= 10; i++) known.add(`Item${i}`).add(`Prob${i}`);
  for (const r of rows(tcJ)) for (const k of Object.keys(r)) if (!known.has(k)) throw new Error(`treasureclassex: column ${k} has no rule`);

  const ROWS = rows(tcJ).filter((r) => r['Treasure Class']).sort((a, b) => a.lineNumber - b.lineNumber);
  const BY_NAME = new Map(ROWS.map((r) => [r['Treasure Class'], r]));
  const ITEMS = itemsInOrder(weaponsJ, armorJ, miscJ);
  const ITEM_CODES = new Set(ITEMS.map((r) => r.code));
  const auto = itemTypeTcs({ itemTypes: rows(itypesJ), items: ITEMS, keep: (it) => bases.has(it.code) });
  const UNIQUE = new Set(rows(uniqueJ).map((r) => r.index).filter(Boolean));
  const SET = new Set(rows(setItemsJ).map((r) => r.index).filter(Boolean));
  const resolve = (w) => (w.length <= 4 && ITEM_CODES.has(w) ? 'item' : BY_NAME.has(w) || auto.has(w) ? 'tc' : UNIQUE.has(w) ? 'unique' : SET.has(w) ? 'set' : null);

  // In nightmare and hell (the expansion), a monster's own class moves up its group: past each next
  // row of the same group whose level is at most the monster's level (MonsterTbls.cpp:975-1003),
  // unless the monster is a boss or noRatio (Items.cpp:2576-2592). A class an entry names is looked
  // up at level 0 and never moves (2231). The walk goes row by row: a class's upgrade is the next row
  // of the table while it is of the same group.
  const next = new Map();
  for (let i = 0; i + 1 < ROWS.length; i++) if (ROWS[i].group && ROWS[i + 1].group === ROWS[i].group) next.set(ROWS[i]['Treasure Class'], ROWS[i + 1]['Treasure Class']);
  // the highest level an Act 1 monster reaches by difficulty: its area's level, +3 as a unique (MonsterUnique.cpp:268-275)
  const cap = [0, 1, 2].map((d) => Math.max(...areas.map((a) => a.lvl[d])) + 3);

  // ───────────────────────── what is reachable ─────────────────────────
  const roots = [];
  const root = (tc, d, upgrades, from) => tc && roots.push({ tc, d, upgrades, from });
  for (const m of Object.values(monsters)) {
    const up = !m.boss && !m.noRatio;
    m.diff.forEach((x, d) => Object.values(x.tc).forEach((tc) => root(tc, d, up, `monstats ${m.id}`)));
  }
  for (const s of superuniques) {
    const m = monsters[s.mon];
    s.tc.forEach((tc, d) => root(tc, d, !m.boss && !m.noRatio, `superunique ${s.key}`));
  }
  for (const a of areas) a.chestTc.forEach((tc, d) => root(tc, d, false, `chests of area ${a.id}`));

  const dropped = [];
  const seen = new Map();
  const queue = [];
  const reach = (name, from) => {
    if (seen.has(name) || queue.includes(name)) return;
    if (!BY_NAME.has(name) && !auto.has(name)) throw new Error(`${from}: treasure class ${name} does not exist`);
    queue.push(name);
  };
  /** a root's class and, in nightmare and hell, the upgrades a monster of up to cap's level can reach */
  const withUpgrades = (r) => {
    const out = [r.tc];
    if (r.upgrades && r.d > 0) for (let n = next.get(r.tc); n && (BY_NAME.get(n).level ?? 0) <= cap[r.d]; n = next.get(n)) out.push(n);
    return out;
  };
  for (const r of roots) for (const n of withUpgrades(r)) reach(n, r.from);
  while (queue.length) {
    const name = queue.shift();
    const tc = auto.get(name) ?? parseTc(BY_NAME.get(name), resolve);
    tc.had = tc.items.length;
    // out of scope: Warlock-era and terror-zone classes, and items the item stage left out
    tc.items = tc.items.filter((e) => {
      const why = e.tc && OUT_OF_SCOPE_TC.test(e.tc) ? 'class out of scope' : e.item && !bases.has(e.item) ? 'item not imported' : null;
      if (why) dropped.push({ tc: name, entry: e.tc ?? e.item, prob: e.prob, why });
      return !why;
    });
    if (tc.items.some((e) => e.unique || e.set)) throw new Error(`${name}: names a unique or set item, which the drop code does not take yet`);
    seen.set(name, tc);
    for (const e of tc.items) if (e.tc) reach(e.tc, name);
  }
  // A class left with nothing once the out-of-scope entries are gone held only out-of-scope content:
  // entries naming it go as well. A class empty in the tables themselves stays, as in the game, where
  // picking it drops nothing (bow15 and a few other automatic classes have no base at their levels).
  const emptied = (n) => seen.has(n) && seen.get(n).had > 0 && !seen.get(n).items.length;
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, tc] of seen) {
      const keep = tc.items.filter((e) => !(e.tc && emptied(e.tc)));
      if (keep.length === tc.items.length) continue;
      for (const e of tc.items.filter((x) => !keep.includes(x))) dropped.push({ tc: name, entry: e.tc, prob: e.prob, why: 'only out-of-scope content' });
      tc.items = keep;
      changed = true;
    }
  }
  // what is still reachable once those entries are gone
  const out = new Map();
  const visit = (n) => {
    if (out.has(n) || emptied(n)) return;
    out.set(n, seen.get(n));
    for (const e of seen.get(n).items) if (e.tc) visit(e.tc);
  };
  for (const r of roots) for (const n of withUpgrades(r)) visit(n);
  for (const tc of out.values()) delete tc.had;
  // `next` only where a monster's own class moves: the upgrade chains of nightmare and hell roots
  const moves = new Set(roots.filter((r) => r.upgrades && r.d > 0).flatMap((r) => withUpgrades(r)));
  for (const [name, tc] of out) if (moves.has(name) && moves.has(next.get(name)) && out.has(next.get(name))) tc.next = next.get(name);

  // ───────────────────────── write ─────────────────────────
  // explicit classes in table order, then the automatic ones
  const order = [...ROWS.map((r) => r['Treasure Class']).filter((n) => out.has(n)), ...[...auto.keys()].filter((n) => out.has(n))];
  const tcs = Object.fromEntries(order.map((n) => [n, out.get(n)]));
  const roots3 = [0, 1, 2].map((d) => [...new Set(roots.filter((r) => r.d === d).map((r) => r.tc))].length);
  writeD2x(
    'treasure.ts',
    `import type { D2xTreasureClass } from './types';\n\n` +
      `/**\n * Every treasure class Act 1 drops from, by name (D2R 2.7's TreasureClassEx.txt): what its\n * monsters, superuniques and chests name in each difficulty, their nightmare and hell upgrades, and\n * every class those name, with the automatic weapN/armoN/meleN/bowN/abowN classes built from the\n * imported bases (see D2xTreasureClass).\n */\n` +
      `export const D2X_TREASURE_CLASSES: Record<string, D2xTreasureClass> = ${record(tcs)};\n`,
  );
  const autoN = order.filter((n) => auto.has(n)).length;
  console.log(
    `treasure: ${order.length} treasure classes (${order.length - autoN} from the table, ${autoN} automatic), from ${roots3.join('/')} named by Act 1 in normal/nightmare/hell; ` +
      `${dropped.length} out-of-scope entries taken out`,
  );
  return { tcs, auto, dropped, roots, cap };
}

