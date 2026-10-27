// What the game's monsters, chests and barrels drop: Diablo II's treasure classes (src/items/d2/
// treasure.ts), made into items by src/items/gen.ts dropTc. The game's monsters keep their own
// stats, levels and AI in this build; each stands for the Act 1 monster closest to it
// (D2_MONSTER_OF), whose MonStats.txt classes it drops from at its own level and rank.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { D2X_MONSTERS } from '../data/d2x/monsters';
import type { D2xMonster } from '../data/d2x/types';
import { dropTc } from '../items/gen';
import type { Item } from '../items/item';
import { MATH_RAND } from '../items/make';
import { roll } from '../items/d2/rand';
import { chestTc, monsterTc, type TcRank } from '../items/d2/treasure';
import type { Difficulty, Rand } from '../items/d2/types';
import { areaLevel, type AreaDef } from '../world/areas';
import type { Monster, MonsterRank } from './monster';

/**
 * Each of the game's monsters (src/data/monsters.ts) as the Act 1 monster (D2X_MONSTERS) it is
 * closest to, by kind first, then the way it fights: melee ones get a row with the H2H classes,
 * casters and shooters one with the Cast, Miss or Quill classes. The floor bosses stand for Act 1's
 * bosses in the order they come down the dungeon: the Smith, Blood Raven, Andariel.
 */
export const D2_MONSTER_OF: Record<string, string> = {
  zombie: 'zombie1',
  skeleton: 'skeleton1',
  skelarcher: 'sk_archer1',
  imp: 'fallen1',
  shaman: 'fallenshaman1',
  // Ghoul is D2's third zombie
  ghoul: 'zombie3',
  spider: 'arach1',
  wraith: 'wraith1',
  // a big demon that fights hand to hand: the strongest goatmen, the Death Clan
  demon: 'goatman5',
  hellimp: 'fallen4',
  // fliers: the Foul Crows
  skullfly: 'foulcrow1',
  bat: 'foulcrow2',
  skelmage: 'skmage_fire1',
  // a spitter: the quill rats, which drop their own Quill classes
  mushroom: 'quillrat2',
  // D2's yetis are the Brutes (sprite YE)
  yeti: 'brute3',
  // a demon casting fire from afar: the Afflicted, Act 1's highest
  dragon: 'bighead1',
  butcher: 'smith',
  lich: 'bloodraven',
  overlord: 'andariel',
};

/** the Act 1 monster a game monster drops as */
export function d2MonsterOf(defId: string): D2xMonster | undefined {
  return D2X_MONSTERS[D2_MONSTER_OF[defId] ?? ''];
}

/** who the drop is for: the killer's magic find and gold find, and the difficulty played */
export interface Finder {
  mf: number;
  gf: number;
  difficulty: Difficulty;
}

/**
 * D2's monster kinds for the drop (MonsterMode.cpp:507-533): champions and uniques have their own
 * classes; a unique's minions are plain monsters, and the floor bosses are Act 1 bosses, which drop
 * their regular class
 */
const TC_RANK: Record<MonsterRank, TcRank> = { normal: 'regular', minion: 'regular', boss: 'regular', champion: 'champion', unique: 'unique' };

/** the class a game monster drops from, at its level and rank (d2/treasure.ts monsterTc) */
export function monsterLootTc(m: Pick<Monster, 'def' | 'rank' | 'level'>, difficulty: Difficulty): string | undefined {
  const mon = d2MonsterOf(m.def.id);
  // the game keeps no quest records yet: every kill counts as the first (Andariel's classes are her
  // quest one anyway); questDone comes from the hero's quest flags once there are some (MonsterMode.cpp:536-568)
  return mon && monsterTc(mon, { difficulty, rank: TC_RANK[m.rank], mlvl: m.level });
}

/**
 * A dead monster's drop (MONSTERMODE_DropTreasure, MonsterMode.cpp:491-573): its class's items at
 * its level, the item level of whatever a monster drops (ITEMS_GetItemLevelForNewItem,
 * Items.cpp:1624-1633)
 */
export function monsterLoot(m: Pick<Monster, 'def' | 'rank' | 'level'>, hero: Finder, rng: Rand = MATH_RAND): Item[] {
  const tc = monsterLootTc(m, hero.difficulty);
  if (!tc) return [];
  return dropTc(tc, m.level, { mf: hero.mf, gf: hero.gf, difficulty: hero.difficulty, hellBovine: D2_MONSTER_OF[m.def.id] === 'hellbovine', rng });
}

/**
 * What opening a chest or breaking a barrel drops. A chest drops in 3 of 4 (OBJECTS_OperateFunction04_Chest,
 * ObjMode.cpp:1296; a locked one twice, always, which this game has none of), a barrel in 21 of 100
 * (OBJECTS_OperateFunction05_Barrel, 2816). Either drops its area's Chest A, B or C at the area level
 * (ITEMS_GetItemLevelForNewItem for an object, Items.cpp:1636-1646), its items' quality rolled at
 * the class's index (ObjMode.cpp:3909-3958; d2/treasure.ts chestTc).
 */
export function containerLoot(kind: 'chest' | 'barrel', area: AreaDef, hero: Finder, rng: Rand = MATH_RAND): Item[] {
  const r = roll(rng, 100);
  if (kind === 'chest' ? r < 25 : r > 20) return [];
  const alvl = areaLevel(area);
  const tc = chestTc({ id: area.id, alvl }, hero.difficulty);
  return dropTc(tc.name, alvl, { mf: hero.mf, gf: hero.gf, difficulty: hero.difficulty, rollLvl: tc.index, rng });
}
