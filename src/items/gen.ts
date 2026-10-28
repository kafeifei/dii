// What the game drops and hands out: Diablo II's treasure classes (src/items/d2/treasure.ts) made
// into items for monsters, chests and barrels (dropTc; src/game/loot.ts says which class), and the
// game's own picks where D2 has no class to go by (the debug panel's gear, runes and gems). Every
// item is made Diablo II's way (src/items/make.ts): its quality by ItemRatio.txt with the hero's
// magic find and the treasure class's quality ratios, then affixes, uniques, set items and their
// properties.
import { pick, weightedPick } from '../core/math';
import type { PlayerClass } from '../data/classes';
import { D2_GOOD_TCS } from '../data/d2/progression';
import { D2X_CLASSES } from '../data/d2x/classes';
import { D2X_TREASURE_CLASSES } from '../data/d2x/treasure';
import { EQUIPPABLE_BASES, ITEM_BASES, categoryOf, itypeMatches, type ItemBase } from '../data/items';
import { GEMS } from '../data/legendary';
import type { TcQuality } from './d2/quality';
import { evalTc, goldAmount, TC_MAX_ITEMS, type TcOpts } from './d2/treasure';
import type { D2Quality, Difficulty, Rand } from './d2/types';
import { classCode, type Item } from './item';
import { applyRunewordTo, makeItem, MATH_RAND, type MakeSpec } from './make';

/**
 * A new item of a base. The default (`normal`, identified) is a plain one: a starting weapon, a
 * potion, a rune; pass a quality to have it made as one (D2's pItemDrop quality), else
 * makeItem rolls it. Made as D2 makes the starting kit (Player.cpp:180): never ethereal, no
 * sockets, its durability as rolled.
 */
export function createItem(baseId: string, quality: MakeSpec['quality'] = 'normal', ilvl = 1, more: Partial<MakeSpec> = {}): Item {
  return makeItem({ code: baseId, ilvl: Math.max(1, ilvl), quality, identified: true, noEth: true, noSockets: true, ...more });
}

/**
 * The unique rows dropped this game: D2 drops each unique once a game (D2Game Items.cpp:67-112,
 * ItemMode.cpp:6639), the next roll of one becoming rare; a new game starts the list over
 */
const DROPPED = new Set<number>();
export function newGameDrops() {
  DROPPED.clear();
}

export interface RollOpts {
  mf?: number;
  /** the difficulty dropped in: its socket cap and DropConditionCalc (d2/quality.ts) */
  difficulty?: 0 | 1 | 2;
  /** the dropper: 0 normal monster, 1 champion, 2 unique, 3 boss (their treasure classes' quality ratios) */
  quality?: number;
  base?: ItemBase;
  /** sold or handed out: made identified, as a vendor's stock is made (never ethereal, repaired) */
  identified?: boolean;
}

/**
 * The quality ratios of the treasure classes the droppers' items come from (TreasureClassEx.txt
 * Unique/Set/Rare/Magic, out of 1024): champions' and uniques' items (Act 1 Citem A, Uitem A) and a
 * boss's (Act 1 Super A); a normal monster's have none
 */
const TC_BY_RANK = ['', 'Act 1 Citem A', 'Act 1 Uitem A', 'Act 1 Super A'];
function tcQuality(rank: number): TcQuality | undefined {
  const tc = D2X_TREASURE_CLASSES[TC_BY_RANK[rank] ?? ''];
  return tc ? { unique: tc.unique, set: tc.set, rare: tc.rare, magic: tc.magic } : undefined;
}

function pickBase(ilvl: number, filter?: (b: ItemBase) => boolean): ItemBase {
  const candidates = EQUIPPABLE_BASES.filter((b) => b.qlvl <= ilvl && !b.noDrop && (!filter || filter(b)));
  // weapons and everything else drop about as often, as D2's weapon and armor treasure classes do,
  // however many bases each side has
  const nWeapons = candidates.filter((b) => categoryOf(b.type) === 'weapon').length;
  const weaponShare = nWeapons ? (candidates.length - nWeapons) / nWeapons : 1;
  return weightedPick(candidates, (b) => {
    // prefer items close to ilvl
    const gap = ilvl - b.qlvl;
    const w = (gap < 12 ? 3 : gap < 24 ? 1.5 : 0.6) * (categoryOf(b.type) === 'weapon' ? weaponShare : 1);
    return b.type === 'ring' || b.type === 'amulet' ? w * 0.5 : w;
  })!;
}

/** a random base of a D2 item type (a recipe's "any polearm") at an item level */
export function pickBaseOfType(itype: string, ilvl: number): ItemBase | null {
  const c = EQUIPPABLE_BASES.filter((b) => itypeMatches(b, [itype]) && !b.noDrop);
  if (!c.length) return null;
  const fit = c.filter((b) => b.qlvl <= ilvl);
  return pick(fit.length ? fit : c);
}

/** a piece of gear at an item level for the debug panel and the bot: the base the game picks (no class to go by), made with the hero's magic find */
export function rollEquipment(ilvl: number, opts: RollOpts = {}): Item {
  const base = opts.base ?? pickBase(ilvl);
  // sold or handed out: as a vendor's stock, never ethereal and repaired (SUnitNpc.cpp:206, 258)
  return makeItem({
    code: base.id,
    ilvl: Math.max(1, ilvl),
    mf: opts.mf ?? 0,
    tc: tcQuality(opts.quality ?? 0),
    difficulty: opts.difficulty,
    dropped: opts.identified ? undefined : DROPPED,
    identified: opts.identified,
    noEth: opts.identified,
    repaired: opts.identified,
  });
}

// ───────────────────────── runes and gems for the debug panel: D2's "Good" treasure classes ─────────────────────────

/** the Good class of the highest act and difficulty whose level the monster reaches */
function goodTc(mlvl: number) {
  let tc = D2_GOOD_TCS[0];
  for (const t of D2_GOOD_TCS) if (t.level <= mlvl) tc = t;
  return tc;
}

/**
 * gem types within a grade: six gems at 3, skulls at 2 (Chipped Gem … Perfect Gem classes); a drop
 * has its monster's level as its item level (D2Game Items.cpp:1622-1647), which a rune hands on to
 * the runeword it completes (make.ts insertFiller)
 */
export function rollGem(grade: number, ilvl = 1): Item {
  const g = weightedPick(GEMS.filter((x) => x.grade === grade), (x) => (x.gem === 'skull' ? 2 : 3))!;
  return createItem(g.id, 'normal', ilvl);
}

export function rollRune(mlvl: number): Item {
  const tc = goodTc(mlvl);
  const e = tc.entries.find((x) => x.kind === 'rune') ?? D2_GOOD_TCS.find((t) => t.entries.some((x) => x.kind === 'rune'))!.entries.find((x) => x.kind === 'rune')!;
  const [id] = weightedPick(e.runes!, (r) => r[1])!;
  return createItem(id, 'normal', mlvl);
}

/**
 * Gold is D2's gld misc item (Misc.txt), made with its amount as its gold stat (D2Game
 * Items.cpp:616-628; d2/treasure.ts goldAmount), kept here as its stack (qty); on the ground it lies
 * as a pile (game.ts spawnDrops)
 */
export const GOLD = 'gld';

export function makeGold(amount: number, ilvl = 1): Item {
  const it = createItem(GOLD, 'normal', ilvl);
  it.qty = Math.max(1, Math.floor(amount));
  return it;
}

export function isGold(item: Item): boolean {
  return item.baseId === GOLD;
}

export type Drop = { kind: 'item'; item: Item };

export interface TcDropOpts extends TcOpts {
  /** the killer's magic find and gold find % */
  mf?: number;
  gf?: number;
  /** the difficulty dropped in: its socket cap and DropConditionCalc (d2/quality.ts) */
  difficulty?: Difficulty;
  /** the level the items' quality is rolled at, when not their item level: a chest's (d2/quality.ts QualityRoll.rollLvl) */
  rollLvl?: number;
  /** D2GAME_DropTC's nQuality: every item made in this quality (a sparkling chest's magic), not rolled */
  quality?: D2Quality;
  /** dropped by a hell bovine (Cow King's Leathers) */
  hellBovine?: boolean;
  rng?: Rand;
}

/**
 * What one drop of a treasure class comes to at an item level (D2GAME_DropTC_6FC51360, Items.cpp:
 * 2062-2560): its picks (d2/treasure.ts evalTc, at most 6 items), each made at the item level with
 * the quality ratios its class chain passed it and the killer's magic find (Items.cpp:2316-2451,
 * 2505-2520), gold as a pile of goldAmount (× its mul, + gold find), and uniques once a game. D2
 * makes each item as its pick comes up; here the picks all come first, which drops the same.
 */
export function dropTc(name: string, ilvl: number, opts: TcDropOpts = {}): Item[] {
  const rng = opts.rng ?? MATH_RAND;
  const lvl = Math.max(1, ilvl);
  const max = opts.max ?? TC_MAX_ITEMS;
  return evalTc(name, rng, opts).map((p, i) =>
    p.code === GOLD
      ? // the item that reaches the cap ends the drop before gold find goes on (Items.cpp:2543-2559)
        makeGold(goldAmount(lvl, rng, p.goldMul, i + 1 >= max ? 0 : opts.gf), lvl)
      : makeItem(
          {
            code: p.code,
            ilvl: lvl,
            rollLvl: opts.rollLvl,
            mf: opts.mf ?? 0,
            tc: p.tc,
            quality: opts.quality,
            difficulty: opts.difficulty,
            hellBovine: opts.hellBovine,
            dropped: DROPPED,
          },
          rng,
        ),
  );
}

// ───────────────────────── runewords ─────────────────────────

/** the item a full set of runes makes a runeword of, made so (d2/legendary.ts) at the last rune's item level; false when they make none */
export function applyRuneword(item: Item, runeIlvl = item.ilvl): boolean {
  return applyRunewordTo(item, runeIlvl);
}

/**
 * A new hero's kit, Diablo II's from CharStats.txt item1 … item10 (PLAYER_CreateStartItem, D2Game
 * Player.cpp:167-266): normal, identified, never ethereal, no sockets, at full durability, what D2
 * wears in the right and left hands worn. A beltable item goes in the belt where it fits, the rest
 * in the bag: the four minor healing potions in the belt; the scrolls of town portal and identify
 * are beltable too, but start no column of their own (items/belt.ts freeBeltColumn) and go in the bag
 */
export function starterKit(cls: PlayerClass): { weapon?: Item; offhand?: Item; belt: Item[]; bag: Item[] } {
  const kit: { weapon?: Item; offhand?: Item; belt: Item[]; bag: Item[] } = { belt: [], bag: [] };
  for (const { code, n, loc } of D2X_CLASSES[classCode(cls)!]?.items ?? []) {
    for (let i = 0; i < n; i++) {
      const it = createItem(code, 'normal', 1, { repaired: true });
      if (loc === 'rarm' && !kit.weapon) kit.weapon = it;
      else if (loc === 'larm' && !kit.offhand) kit.offhand = it;
      else if (ITEM_BASES[code]?.type === 'potion') kit.belt.push(it);
      else kit.bag.push(it);
    }
  }
  return kit;
}

export function isEquipment(item: Item): boolean {
  return categoryOf(ITEM_BASES[item.baseId].type) !== null;
}
