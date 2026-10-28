// What the game's monsters, chests and barrels drop: Diablo II's treasure classes (src/items/d2/
// treasure.ts), made into items by src/items/gen.ts dropTc. Every monster is one of D2's (its
// MonStats.txt row, Monster.def.row), which it drops from at its level and rank.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_SUPERUNIQUES } from '../data/d2x/superuniques';
import type { D2xMonster } from '../data/d2x/types';
import { dropTc } from '../items/gen';
import type { Item } from '../items/item';
import { MATH_RAND } from '../items/make';
import { roll } from '../items/d2/rand';
import { chestTc, monsterTc, type TcRank } from '../items/d2/treasure';
import type { Difficulty, Rand } from '../items/d2/types';
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

/** who the drop is for: the killer's magic find and gold find, the difficulty played and their quest record in it */
export interface Finder {
  mf: number;
  gf: number;
  difficulty: Difficulty;
  quests?: QuestRecord;
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
export function monsterLootTc(m: Dropper, difficulty: Difficulty = m.difficulty ?? 0, quests?: QuestRecord): string | undefined {
  const su = m.superUnique ? SUPERUNIQUES.get(m.superUnique) : undefined;
  const mon = su ? D2X_MONSTERS[su.mon] : m.def.row;
  const questDone = mon?.questTc ? questTcDone(quests, mon.questTc) : undefined;
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
 * What opening a chest or breaking a barrel drops. A chest drops in 3 of 4 (OBJECTS_OperateFunction04_Chest,
 * ObjMode.cpp:1296; a locked one twice, always, which this game has none of), a barrel in 21 of 100
 * (OBJECTS_OperateFunction05_Barrel, 2816). Either drops its area's Chest A, B or C at the area level
 * in the difficulty played (ITEMS_GetItemLevelForNewItem for an object, Items.cpp:1636-1646, by
 * DATATBLS_GetMonsterLevelInArea, ObjMode.cpp:3929), its items' quality rolled at the class's index
 * (ObjMode.cpp:3909-3958; d2/treasure.ts chestTc).
 */
export function containerLoot(kind: 'chest' | 'barrel', area: AreaDef, hero: Finder, rng: Rand = MATH_RAND): Item[] {
  const r = roll(rng, 100);
  if (kind === 'chest' ? r < 25 : r > 20) return [];
  const alvl = areaLevel(area, hero.difficulty);
  const tc = chestTc({ id: area.id, alvl }, hero.difficulty);
  return dropTc(tc.name, alvl, { mf: hero.mf, gf: hero.gf, difficulty: hero.difficulty, rollLvl: tc.index, rng });
}
