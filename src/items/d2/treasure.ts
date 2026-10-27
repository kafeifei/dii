// Treasure classes, Diablo II's way (TreasureClassEx.txt as src/data/d2x/treasure.ts holds it):
// which class a monster or a chest drops from, and what one drop of a class comes to: item codes,
// each with the quality ratios it carries down the chain and gold's multiplier. Making the items is
// src/items/gen.ts's (dropTc), through make.ts.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { D2X_AREAS } from '../../data/d2x/areas';
import { D2X_TREASURE_CLASSES } from '../../data/d2x/treasure';
import type { D2xMonster, D2xSuperUnique, D2xTreasureClass } from '../../data/d2x/types';
import type { TcQuality } from './quality';
import { roll } from './rand';
import type { Difficulty, Rand } from './types';

export type TcTable = Record<string, D2xTreasureClass>;

/** one item a drop picked: its code, and what of the chain down to it goes on to the item */
export interface TcPick {
  code: string;
  /** the quality ratios (out of 1024) of the class it came from, with its parents' (inherit) */
  tc: TcQuality;
  /** gold's amount × this (the entry's mul / 256) */
  goldMul?: number;
  /** the class it was picked from */
  from: string;
}

export interface TcOpts {
  tcs?: TcTable;
  /**
   * The players the drop counts (Items.cpp:2122-2145): (players in the game − the killer's party
   * in the area) / 2 + that party, at most the monster's player count. This game has one.
   */
  players?: number;
  /** stop at this many items: 6 for a monster (Items.cpp:2075-2078) and a chest (ObjMode.cpp:3957-3958) */
  max?: number;
}

/** the most items one drop makes (Items.cpp:2075-2078) */
export const TC_MAX_ITEMS = 6;

/** the sum of a class's entries' chances: D2's nProb, added up as the entries load (MonsterTbls.cpp:876-902) */
export function totalProb(tc: D2xTreasureClass): number {
  let n = 0;
  for (const e of tc.items) n += e.prob;
  return n;
}

/**
 * A class's NoDrop for the players counted (Items.cpp:2122-2165): with more than one, the chance
 * that none of them would have had a drop, (noDrop / (total + noDrop)) to the power of players, put
 * back as a NoDrop weight against the class's total. One player keeps the table's.
 */
export function noDropFor(tc: D2xTreasureClass, players = 1): number {
  const nd = tc.noDrop ?? 0;
  if (!nd || players <= 1) return nd;
  const total = totalProb(tc);
  const inverse = 1 - (nd / (total + nd)) ** players;
  return inverse === 0 ? 0 : Math.trunc((total / inverse) * (1 - inverse));
}

/**
 * The entry whose share of the class's range holds r, 0 ≤ r < total: each entry's range starts
 * where the one before it ends (an entry's nProb is the running total before it, MonsterTbls.cpp:
 * 1233, 1256). That is the classic game's walk (Items.cpp:2190-2200). D2MOO's binary search for the
 * expansion (2202-2223) gives the entry before it when r falls on an entry's first value, which
 * would have a champion drop its item pick twice and never its potions, against d2data's
 * tcprecalc and every drop calculator: taken for a slip of the decompilation.
 */
function entryAt(tc: D2xTreasureClass, r: number) {
  let acc = 0;
  for (const e of tc.items) {
    acc += e.prob;
    if (r < acc) return e;
  }
  return tc.items[tc.items.length - 1];
}

/**
 * A class named by an entry takes each quality ratio from its parent, or its own where the parent
 * has none or its own is higher (Items.cpp:2244-2260): the higher of the two
 */
function inherit(parent: TcQuality, tc: D2xTreasureClass): TcQuality {
  const pick = (old = 0, own = 0) => (!old || own > old ? own : old);
  return {
    unique: pick(parent.unique, tc.unique),
    set: pick(parent.set, tc.set),
    rare: pick(parent.rare, tc.rare),
    magic: pick(parent.magic, tc.magic),
  };
}

/**
 * One drop of a class (D2GAME_DropTC_6FC51360, Items.cpp:2062-2560), for one player:
 * - each of its picks (|picks|, at least 1) with picks > 0 rolls in [0, total + noDrop): below
 *   noDrop nothing comes of it, else the entry whose range holds what is left (2168-2187);
 * - with picks < 0 the k-th pick (k from 0) is the entry whose range holds k, no roll and no
 *   noDrop, until k reaches the total: entries drop as many times as their chance, in order, at
 *   most −picks in all (2112-2118);
 * - an entry naming a class runs that class there and then with its own picks, at level 0 (never
 *   moving up its group, 2231) and with the quality ratios inherited (2244-2260). D2 keeps a stack
 *   of 64 classes for it and hands the parent's place to the child when the parent has no picks
 *   left (2232-2242), which comes to this depth-first order. A class with nothing in it drops
 *   nothing (2106-2109);
 * - it stops at max items (2075-2078, 2543-2547).
 * Per-entry quality overrides (cu=, cs=…) only count in the classic game (2266-2283): not here.
 */
export function evalTc(name: string, rng: Rand, opts: TcOpts = {}): TcPick[] {
  const tcs = opts.tcs ?? D2X_TREASURE_CLASSES;
  const root = tcs[name];
  if (!root) throw new Error(`no treasure class ${name}`);
  const max = opts.max ?? TC_MAX_ITEMS;
  const players = opts.players ?? 1;
  const out: TcPick[] = [];
  /** false once max items are out: nothing more is picked anywhere */
  const run = (tcName: string, tc: D2xTreasureClass, q: TcQuality): boolean => {
    const total = totalProb(tc);
    const noDrop = noDropFor(tc, players);
    let left = Math.max(Math.abs(tc.picks), 1);
    while (total && left) {
      let r: number;
      if (tc.picks < 0) {
        r = -tc.picks - left;
        if (r >= total) break;
      } else {
        r = roll(rng, total + noDrop);
        if (r < noDrop) {
          left--;
          continue;
        }
        r -= noDrop;
      }
      left--;
      const e = entryAt(tc, r);
      if (e.tc) {
        const sub = tcs[e.tc];
        if (!sub) throw new Error(`treasure class ${tcName} names ${e.tc}, which is not there`);
        if (!run(e.tc, sub, inherit(q, sub))) return false;
        continue;
      }
      const pick: TcPick = { code: e.item!, tc: q, from: tcName };
      if (e.goldMul !== undefined) pick.goldMul = e.goldMul;
      out.push(pick);
      if (out.length >= max) return false;
    }
    return true;
  };
  run(name, root, { unique: root.unique ?? 0, set: root.set ?? 0, rare: root.rare ?? 0, magic: root.magic ?? 0 });
  return out;
}

/**
 * The class a drop starts from at a level (DATATBLS_GetTreasureClassExRecordFromIdAndLevel,
 * MonsterTbls.cpp:975-1003): with a level above 0 and a class in a group, the rows after it of the
 * same group while their level is at most the level. D2X_TREASURE_CLASSES has that next row as
 * `next` wherever an Act 1 monster can move to it.
 */
export function tcAtLevel(name: string, lvl: number, tcs: TcTable = D2X_TREASURE_CLASSES): string {
  let n = name;
  if (lvl <= 0) return n;
  for (let next = tcs[n]?.next; next && (tcs[next]?.level ?? 0) <= lvl; next = tcs[n].next) n = next;
  return n;
}

/** a monster's kind as its drop goes: a champion's or a unique's own classes, else its regular one (a minion's too) */
export type TcRank = 'regular' | 'champion' | 'unique';

export interface MonsterTcSpec {
  difficulty: Difficulty;
  rank: TcRank;
  /** the monster's level: its item level, and how far its class moves up its group in nightmare and hell */
  mlvl: number;
  /** a superunique drops its own class whatever its rank */
  su?: D2xSuperUnique;
  /**
   * The killer has done the monster's quest (questTc): completed it before, has its reward
   * pending, or has its checkpoint (MonsterMode.cpp:536-568). Until then a monster with a quest
   * class drops that, the first kill's (Andarielq).
   */
  questDone?: boolean;
}

/**
 * The class a monster drops from (MONSTERMODE_DropTreasure, MonsterMode.cpp:491-573): a
 * superunique's own SuperUniques.txt column, nothing when it is empty (its monster's unique class
 * only for a superunique with no row, 508-517), a champion's, a unique's or the regular one, by
 * difficulty; the quest class instead while the killer has not done
 * the quest. In nightmare and hell (the expansion) it then moves up its group to the monster's
 * level, unless the monster is a boss or noRatio (sub_6FC52110, Items.cpp:2576-2592). Undefined
 * for a monster that drops nothing.
 */
export function monsterTc(mon: D2xMonster, spec: MonsterTcSpec, tcs: TcTable = D2X_TREASURE_CLASSES): string | undefined {
  const d = spec.difficulty;
  const t = mon.diff[d].tc;
  let name = spec.su ? spec.su.tc[d] : spec.rank === 'champion' ? t.champ : spec.rank === 'unique' ? t.unique : t.regular;
  if (mon.questTc && t.quest && !spec.questDone) name = t.quest;
  if (!name || !tcs[name]) return undefined;
  return tcAtLevel(name, d > 0 && !mon.noRatio && !mon.boss ? spec.mlvl : 0, tcs);
}

// ───────────────────────── chests ─────────────────────────

const AREAS = new Map(D2X_AREAS.map((a) => [a.id, a]));
const DIFF_TAG = ['', ' (N)', ' (H)'];

/**
 * Which of its act's Chest A, B or C a chest (or barrel, urn, …) drops from, 0–2
 * (OBJMODE_DropFromChestTCWithQuality, ObjMode.cpp:3909-3955): where the area level falls in thirds
 * of the act's span, from its first wilderness (Blood Moor, area 2) to its last area (Catacombs
 * Level 4, 37), by the difficulty's area levels
 */
export function chestTcIndex(alvl: number, difficulty: Difficulty): number {
  const lo = AREAS.get(2)!.lvl[difficulty];
  const hi = AREAS.get(37)!.lvl[difficulty];
  const step = Math.trunc((Math.abs(hi - lo) + 1) / 3);
  return alvl >= lo + step ? (alvl >= lo + 2 * step ? 2 : 1) : 0;
}

/**
 * The class a container in an area drops from, and its index (0–2), which D2 also hands the drop
 * as the level its items' quality is rolled at (ObjMode.cpp:3958, D2GAME_DropTC's nLvl): an Act 1
 * area's own (D2xArea.chestTc), else the Act 1 class its area level comes to (chestTcIndex)
 */
export function chestTc(area: { id: number; alvl: number }, difficulty: Difficulty): { name: string; index: number } {
  const own = AREAS.get(area.id)?.chestTc[difficulty];
  if (own) return { name: own, index: 'ABC'.indexOf(own.slice(-1)) };
  const index = chestTcIndex(area.alvl, difficulty);
  return { name: `Act 1${DIFF_TAG[difficulty]} Chest ${'ABC'[index]}`, index };
}

// ───────────────────────── gold ─────────────────────────

/**
 * A gold pile's amount: 1 to 6 × the item level as it is made (D2GAME_InitItemStats, Items.cpp:
 * 616-628), × the entry's mul / 256 (2533-2536), then the killer's gold find on top (2549-2559),
 * which the pile that reaches the drop's cap doesn't get (gen.ts dropTc)
 */
export function goldAmount(ilvl: number, rng: Rand, goldMul?: number, gf = 0): number {
  let n = Math.max(roll(rng, 5 * ilvl) + ilvl, 1);
  if (goldMul) n = Math.floor((Math.round(goldMul * 256) * n) / 256);
  return Math.trunc(((gf + 100) * n) / 100);
}
