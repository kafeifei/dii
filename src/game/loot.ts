// What the game's monsters, chests and barrels drop: Diablo II's treasure classes (src/items/d2/
// treasure.ts), made into items by src/items/gen.ts dropTc. Every monster is one of D2's (its
// MonStats.txt row, Monster.def.row), which it drops from at its level and rank.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import type { D2xMonster } from '../data/d2x/types';
import { createItem, dropTc, makeGold } from '../items/gen';
import type { Item } from '../items/item';
import { MATH_RAND } from '../items/make';
import { roll } from '../items/d2/rand';
import { chestTc, monsterTc, type TcRank } from '../items/d2/treasure';
import type { D2Quality, Difficulty, Rand } from '../items/d2/types';
import { areaLevel, type AreaDef } from '../world/areas';
import type { MonsterRank } from './monster';
import { questTcDone, type QuestRecord } from './quests/record';

/** what a drop needs of a monster: its D2 row (Monster.def.row), rank, level, superunique and the difficulty it was made in */
export interface Dropper {
  def: { row: D2xMonster };
  rank: MonsterRank;
  level: number;
  superUnique?: string;
  /** its own (Monster.difficulty): its game's, D2's pGame->nDifficulty; the finder's when not given */
  difficulty?: Difficulty;
}

/**
 * who the drop is for: the killer's magic find and gold find, the difficulty played and their quest
 * record in it; 'done' where no kill is a quest's (a rift's floors: src/game/rift.ts), every quest
 * class dropping its regular one
 */
export interface Finder {
  mf: number;
  gf: number;
  difficulty: Difficulty;
  quests?: QuestRecord | 'done';
}

/**
 * D2's monster kinds for the drop (MonsterMode.cpp:507-533): champions and uniques have their own
 * classes; a unique's minions are plain monsters, and bosses (Blood Raven, Andariel) drop their
 * regular class
 */
const TC_RANK: Record<MonsterRank, TcRank> = { normal: 'regular', minion: 'regular', boss: 'regular', champion: 'champion', unique: 'unique' };

const SUPERUNIQUES = new Map(D2X_SUPERUNIQUES.map((s) => [s.key, s]));

/**
 * The class a monster drops from, at its level and rank (d2/treasure.ts monsterTc), in `difficulty`
 * (the monster's own when not given), for a killer with the quest record `quests` in that difficulty. A superunique (Monster.superUnique, its pack's
 * leader) drops its SuperUniques.txt class (MonsterMode.cpp:507-517). A monster with a quest class
 * (Andariel's Andarielq) drops that until the killer has done its quest (MonsterMode.cpp:536-568,
 * record.ts questTcDone): with no record, every kill is the first.
 */
export function monsterLootTc(m: Dropper, difficulty: Difficulty = m.difficulty ?? 0, quests?: QuestRecord | 'done'): string | undefined {
  const su = m.superUnique ? SUPERUNIQUES.get(m.superUnique) : undefined;
  const mon = su ? D2X_MONSTERS[su.mon] : m.def.row;
  const questDone = mon?.questTc ? quests === 'done' || questTcDone(quests, mon.questTc) : undefined;
  return mon && monsterTc(mon, { difficulty, rank: TC_RANK[m.rank], mlvl: m.level, su, questDone });
}

/**
 * A dead monster's drop (MONSTERMODE_DropTreasure, MonsterMode.cpp:491-573): its class's items at
 * its level, the item level of whatever a monster drops (ITEMS_GetItemLevelForNewItem,
 * Items.cpp:1624-1633), in the difficulty the monster is of (its game's: Monster.difficulty), the
 * killer's magic and gold find
 */
export function monsterLoot(m: Dropper, hero: Finder, rng: Rand = MATH_RAND): Item[] {
  const difficulty = m.difficulty ?? hero.difficulty;
  const tc = monsterLootTc(m, difficulty, hero.quests);
  if (!tc) return [];
  return dropTc(tc, m.level, { mf: hero.mf, gf: hero.gf, difficulty, hellBovine: m.def.row.id === 'hellbovine', rng });
}

/**
 * One drop of an object's (OBJMODE_DropFromChestTCWithQuality, ObjMode.cpp:3909-3958): its area's
 * Chest A, B or C at the area level in the difficulty played (ITEMS_GetItemLevelForNewItem for an
 * object, Items.cpp:1636-1646, by DATATBLS_GetMonsterLevelInArea, ObjMode.cpp:3929), its items'
 * quality rolled at the class's index (d2/treasure.ts chestTc), or every one made `quality` when
 * given (D2GAME_DropTC's nQuality: a spark chest's magic). The items in the order they came, the first
 * first: D2 hands back the first (ppDroppableItems[0]), none when the class dropped nothing.
 */
export function chestDrop(area: AreaDef, hero: Finder, quality?: D2Quality, rng: Rand = MATH_RAND): Item[] {
  const alvl = areaLevel(area, hero.difficulty);
  const tc = chestTc({ id: area.id, alvl }, hero.difficulty);
  return dropTc(tc.name, alvl, { mf: hero.mf, gf: hero.gf, difficulty: hero.difficulty, rollLvl: tc.index, quality, rng });
}

/**
 * What opening a chest or breaking a barrel drops. A chest drops in 3 of 4 (OBJECTS_OperateFunction04_Chest,
 * ObjMode.cpp:1296; a locked or sparkly one always: chestLoot), a barrel in 21 of 100
 * (OBJECTS_OperateFunction05_Barrel, 2816): one drop of its area's chest class (chestDrop).
 */
export function containerLoot(kind: 'chest' | 'barrel', area: AreaDef, hero: Finder, rng: Rand = MATH_RAND): Item[] {
  const r = roll(rng, 100);
  if (kind === 'chest' ? r < 25 : r > 20) return [];
  return chestDrop(area, hero, undefined, rng);
}

/** D2's "magic or better" a chest counts (dwQualityNo from ITEMQUAL_MAGIC to ITEMQUAL_TEMPERED, ObjMode.cpp:1302) */
const MAGIC_UP = new Set<D2Quality>(['magic', 'set', 'rare', 'unique', 'crafted']);
/** whether a drop's first item, the one D2 looks at, is magic or better */
export const magicOrBetter = (first: Item | undefined): boolean => !!first && MAGIC_UP.has((first.quality ?? first.rarity) as D2Quality);

/** what a chest is, for what it drops: locked (it took a key), a spark chest's rules (580's) or 397's */
export interface ChestKind {
  locked?: boolean;
  sparkly?: 'unique' | 'consolation';
}

/**
 * What opening a chest drops (OBJECTS_OperateFunction04_Chest, ObjMode.cpp:1251-1544), its key already
 * taken: a spark chest rolls its quality first, rare 5 times in 100, else magic (1282-1286); then
 * 397 drops by its own rules (consolationLoot), any other chest on a roll of 25 or more out of 100,
 * always when it was locked or sparkly (1296), once, twice when locked (1263-1278). A spark chest
 * none of whose drops' first item was magic or better drops again, up to 10 times, until one is
 * (1310-1322).
 */
export function chestLoot(chest: ChestKind, area: AreaDef, hero: Finder, rng: Rand = MATH_RAND): Item[] {
  let quality: D2Quality | undefined;
  if (chest.sparkly) quality = roll(rng, 100) < 5 ? 'rare' : 'magic';
  if (chest.sparkly === 'consolation') return consolationLoot(area, hero, rng);
  const out: Item[] = [];
  const r = roll(rng, 100);
  if (r < 25 && !chest.sparkly && !chest.locked) return out;
  let magic = 0;
  for (let n = chest.locked ? 2 : 1; n > 0; n--) {
    const d = chestDrop(area, hero, quality, rng);
    out.push(...d);
    if (magicOrBetter(d[0])) magic++;
  }
  if (chest.sparkly && !magic) {
    for (let n = 0; n < 10; n++) {
      const d = chestDrop(area, hero, quality, rng);
      out.push(...d);
      if (magicOrBetter(d[0])) break;
    }
  }
  return out;
}

/**
 * Objects.txt 397, the Mausoleum's sparkly chest (ObjMode.cpp:1327-1541): one roll of 10000. Under
 * 200 two tries at a unique, under 600 at a set item, under 1200 at a rare, done at the first that
 * comes magic or better; under 3200 up to 10 magic drops, done at the third magic one, or with
 * anything dropped; under 6200 up to 10 magic drops until two are magic, done with 7 others,
 * otherwise one plain drop if none came and gold piles up to 7 in all. The rest, and the tries that
 * came to nothing: up to 10 magic drops until one is, plain ones up to 4 with what came of them, 5
 * piles of gold and two each of the strong healing and mana potions (hp3, mp3). The gold and the
 * potions are made at the area level (OBJMODE_DropItemWithCodeAndQuality, 3873-3906), the gold's
 * amount 1 to 6 × it (D2GAME_InitItemStats, Items.cpp:616-628), no gold find.
 */
export function consolationLoot(area: AreaDef, hero: Finder, rng: Rand = MATH_RAND): Item[] {
  const out: Item[] = [];
  const ilvl = Math.max(1, areaLevel(area, hero.difficulty));
  /** one drop of the area's class, kept; its first item, or undefined when it dropped nothing (D2's pItem) */
  const drop = (q?: D2Quality): Item | undefined => {
    const d = chestDrop(area, hero, q, rng);
    out.push(...d);
    return d[0];
  };
  const gold = (n: number) => {
    for (let i = 0; i < n; i++) out.push(makeGold(Math.max(roll(rng, 5 * ilvl) + ilvl, 1), ilvl));
  };
  const r = roll(rng, 10000);
  /** two tries at a quality, done (true) at the first magic or better; nothing dropped ends the tries */
  const tries = (q: D2Quality): boolean => {
    for (let n = 2; n > 0; n--) {
      const it = drop(q);
      if (!it) return false;
      if (magicOrBetter(it)) return true;
    }
    return false;
  };
  let dropped = 0;
  if (r < 200) {
    if (tries('unique')) return out;
  } else if (r < 600) {
    if (tries('set')) return out;
  } else if (r < 1200) {
    if (tries('rare')) return out;
  } else if (r < 3200) {
    let magic = 0;
    for (let n = 0; n < 10; n++) {
      const it = drop('magic');
      if (it) {
        if (magicOrBetter(it)) magic++;
        dropped++;
      }
      if (magic >= 3) break;
    }
    if (dropped) return out;
  } else if (r < 6200) {
    let magic = 0;
    let others = 0;
    for (let n = 0; n < 10; n++) {
      const it = drop('magic');
      if (it) {
        if (magicOrBetter(it)) magic++;
        else others++;
      }
      if (magic >= 2) break;
    }
    if (others) {
      if (others >= 7) return out;
    } else if (drop()) others = 1;
    gold(7 - others);
    return out;
  }
  // (the tries above that came to nothing count none here: D2's nItemsDropped is 0 by now)
  let n = 0;
  for (let k = 0; k < 10; k++) {
    const it = drop('magic');
    if (it) {
      if (magicOrBetter(it)) break;
      n++;
    }
  }
  for (let k = n; k < 4; k++) drop();
  gold(5);
  for (const code of ['hp3', 'hp3', 'mp3', 'mp3']) out.push(createItem(code, 'normal', ilvl));
  return out;
}
