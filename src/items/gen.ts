// What the game drops and hands out, and how many: the game's own decisions for now (treasure
// classes come later). Every item is made Diablo II's way (src/items/make.ts): its quality by
// ItemRatio.txt with the hero's magic find and the treasure class's quality ratios, then affixes,
// uniques, set items and their properties.
import { chance, pick, randInt, weightedPick } from '../core/math';
import { D2_GOOD_TCS } from '../data/d2/progression';
import { D2X_TREASURE_CLASSES } from '../data/d2x/treasure';
import { EQUIPPABLE_BASES, ITEM_BASES, categoryOf, itypeMatches, type ItemBase } from '../data/items';
import { GEMS } from '../data/legendary';
import type { TcQuality } from './d2/quality';
import { type Item } from './item';
import { applyRunewordTo, makeItem, type MakeSpec } from './make';

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

/** an equipment drop at an item level: the base the game picks, made with the hero's magic find */
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

/** the potion tiers by the level they start dropping at (the game's own steps) */
const POTION_LVL: Record<string, number> = { hp1: 1, hp2: 8, hp3: 16, hp4: 26, mp1: 1, mp2: 8, mp3: 16, mp4: 26 };
export const POTIONS = Object.keys(POTION_LVL);

/** the potions of a kind dropping at an item level, the shop's too */
export function potionsFor(ilvl: number, kind: 'hp' | 'mp'): string[] {
  return POTIONS.filter((id) => id.startsWith(kind) && POTION_LVL[id] <= ilvl);
}

export function potionForLevel(ilvl: number, kind: 'hp' | 'mp' | 'rejuv'): Item {
  if (kind === 'rejuv') return createItem(ilvl >= 28 && chance(0.25) ? 'rvl' : 'rvs');
  return createItem(pick(potionsFor(ilvl, kind).slice(-2)));
}

// ───────────────────────── runes, gems, jewelry: D2's "Good" treasure classes ─────────────────────────

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

/** Jewelry A: rings, amulets, jewels and charms by their weights (TreasureClassEx.txt) */
const JEWELRY = D2X_TREASURE_CLASSES['Jewelry A'].items.filter((e) => e.item && ITEM_BASES[e.item]);

/** one pick from the Good class: jewelry (a ring, an amulet, a jewel or a charm), a gem or a rune */
export function rollGood(mlvl: number, mf: number, rank = 0, difficulty: 0 | 1 | 2 = 0): Item {
  const e = weightedPick(goodTc(mlvl).entries, (x) => x.w)!;
  if (e.kind === 'gem') return rollGem(e.grade!, mlvl);
  if (e.kind === 'rune') return createItem(weightedPick(e.runes!, (r) => r[1])![0], 'normal', mlvl);
  const j = weightedPick(JEWELRY, (x) => x.prob)!;
  return makeItem({ code: j.item!, ilvl: Math.max(1, mlvl), mf, tc: tcQuality(rank), difficulty, dropped: DROPPED });
}

/**
 * Gold is D2's gld misc item (Misc.txt), made with its amount as its gold stat (D2Game
 * Items.cpp:616-628), kept here as its stack (qty); on the ground it lies as a pile (game.ts
 * spawnDrops). The amount is the game's own until the drops follow D2's treasure classes.
 */
export const GOLD = 'gld';

export function makeGold(amount: number): Item {
  const it = createItem(GOLD);
  it.qty = Math.max(1, Math.floor(amount));
  return it;
}

export function isGold(item: Item): boolean {
  return item.baseId === GOLD;
}

export type Drop = { kind: 'item'; item: Item };

export function rollMonsterDrops(mlvl: number, quality: number, mf: number, gf: number, difficulty: 0 | 1 | 2 = 0): Drop[] {
  const picks = [1, 2, 4, 7][quality] ?? 1;
  const noDrop = [0.58, 0.25, 0.05, 0][quality] ?? 0.5;
  const drops: Drop[] = [];
  for (let i = 0; i < picks; i++) {
    if (chance(noDrop)) continue;
    const r = Math.random();
    if (r < 0.32) {
      // gold: D2's gld base, its amount the game's own
      const amount = Math.max(1, Math.floor(randInt(mlvl * 2, mlvl * 6 + 8) * (1 + gf / 100)));
      drops.push({ kind: 'item', item: makeGold(amount) });
    } else if (r < 0.58) {
      const rr = Math.random();
      drops.push({ kind: 'item', item: potionForLevel(mlvl, rr < 0.55 ? 'hp' : rr < 0.93 ? 'mp' : 'rejuv') });
    } else if (r < 0.64 + mlvl * 0.0015) {
      drops.push({ kind: 'item', item: rollGood(mlvl, mf, quality, difficulty) });
    } else {
      drops.push({ kind: 'item', item: rollEquipment(mlvl, { mf, quality, difficulty }) });
    }
  }
  // bosses always drop one more item
  if (quality >= 3) drops.push({ kind: 'item', item: rollEquipment(mlvl + 2, { mf, quality: 3, difficulty }) });
  return drops;
}

// ───────────────────────── runewords ─────────────────────────

/** the item a full set of runes makes a runeword of, made so (d2/legendary.ts) at the last rune's item level; false when they make none */
export function applyRuneword(item: Item, runeIlvl = item.ilvl): boolean {
  return applyRunewordTo(item, runeIlvl);
}

/** the starting kit's weapon and shield, and potions */
export function starterKit(weapon: string, offhand: string | null): { weapon: Item; offhand: Item | null; potions: Item[] } {
  return {
    weapon: createItem(weapon),
    offhand: offhand ? createItem(offhand) : null,
    potions: ['hp1', 'hp1', 'hp1', 'hp1', 'mp1', 'mp1'].map((id) => createItem(id)),
  };
}

export function isEquipment(item: Item): boolean {
  return categoryOf(ITEM_BASES[item.baseId].type) !== null;
}
