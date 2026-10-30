// The kind a Diablo II shrine object is (D2MOO source/D2Game/src/OBJECTS/Objects.cpp at commit d9d394f):
// what it rolls as it appears, by its Parm0 and the level, among Shrines.txt's rows
// (src/data/d2x/shrines.ts); and the object an old wilderness's shrine stands for. Only the tables: the maps
// (objgroups.ts, src/game/level.ts) roll them, src/game/shrines.ts does what each does.
import { D2X_OBJECTS } from '../data/d2x/objects';
import { D2X_SHRINES, D2X_WILD_SHRINES } from '../data/d2x/shrines';

/** what the rolls are drawn from: D2's seed (world/maze.ts D2Seed), roll() its low half, limited(n) SEED_RollLimitedRandomNumber */
export interface ShrineRolls {
  roll(): number;
  limited(n: number): number;
}

/** InitFn01 makes these another as it sets a shrine's kind (Objects.cpp:531-544): the exchange shrines the health and mana shrine, the Enirhs shrine the gem shrine */
export const SHRINE_BECOMES: Readonly<Record<number, number>> = { 4: 2, 5: 3, 16: 18 };
/** the shrine D2 makes a level's healing one (Objects.cpp:1605-1607): the health shrine */
export const HEALTH_SHRINE = 2;

/**
 * The shrines of each effect class in row order, as OBJRGN keeps them for the game (ObjRgn.cpp:47-78):
 * 0 the null shrine, 1 the specials, 2 the health shrines, 3 the mana ones, 4 the boons and refilling
 */
const BY_CLASS: number[][] = [];
for (const s of D2X_SHRINES) (BY_CLASS[s.effectClass] ??= []).push(s.code);

/**
 * The class a shrine object of Parm0 `p0` picks its kind among (InitFn01, Objects.cpp:493-516): 1 a
 * health shrine (class 2), 2 a mana one (3), more a boon (4) or, rand % 10 = 0, a special one (1);
 * 0 none, any shrine of the level
 */
export function shrineClass(p0: number, r: ShrineRolls): number {
  if (!p0) return 0;
  if (p0 === 1) return 2;
  if (p0 === 2) return 3;
  return r.roll() % 10 ? 4 : 1;
}

/**
 * OBJECTS_GetShrineId (Objects.cpp:551-581): one of class `cls`'s (class 0 or past 4 as class 2) at
 * random, picked again while it is above level `level` (its LevelMin, a Levels.txt Id), eight picks
 * at most: the last stands whatever its level
 */
export function shrineOfClass(cls: number, level: number, r: ShrineRolls): number {
  const list = BY_CLASS[!cls || cls > 4 ? 2 : cls];
  let code = 0;
  for (let i = 0; i < 8; i++) {
    code = list[r.limited(list.length)] || 1;
    if (level >= D2X_SHRINES[code].levelMin) break;
  }
  return code;
}

/**
 * The shrine a shrine object (D2X_OBJECTS id) becomes as it appears in D2 level `level`
 * (OBJECTS_InitFunction01_Shrine, Objects.cpp:489-548): by its Parm0's class (shrineClass,
 * shrineOfClass), or with Parm0 0 any row from 1 on, again up to eight times while above the level;
 * an exchange or the Enirhs shrine then made the health, mana or gem shrine (SHRINE_BECOMES).
 */
export function rollShrine(object: number, level: number, r: ShrineRolls): number {
  return rollShrineOfParm0(D2X_OBJECTS[object]?.parm?.[0] ?? 0, level, r);
}

/** a shrine's Parm0 by the kind a map gives one with no object (levelgen.ts ShrineSpot.kind; D2xObject.shrine) */
export const KIND_PARM0: Readonly<Record<string, number>> = { any: 0, health: 1, mana: 2, magic: 3 };

/** rollShrine for a shrine object of Parm0 `p0` */
export function rollShrineOfParm0(p0: number, level: number, r: ShrineRolls): number {
  let code = 0;
  if (p0) code = shrineOfClass(shrineClass(p0, r), level, r);
  else {
    for (let i = 0; i < 8; i++) {
      code = r.limited(D2X_SHRINES.length - 1) + 1;
      if (level >= D2X_SHRINES[code].levelMin) break;
    }
  }
  return SHRINE_BECOMES[code] ?? code;
}

/**
 * The shrine object an old map's shrine stands for in D2 level `level` (the old wilderness, wild.ts,
 * sets shrines where D2's cells would not be; the old dungeons set none): in the Act 1 wilderness
 * (Blood Moor to Tamoe Highland) the shrine cells' four subs in turn, the first by rand & 3
 * (D2X_WILD_SHRINES; DrlgOutdoors.cpp:595, 640). Undefined in any other level, an outdoor one D2 gives
 * no shrine cells (the Burial Grounds, Tristram: a rift's floors replaying them): no shrine stands
 * there. `wild` keeps the turn from one shrine to the next.
 */
export function oldShrineObject(level: number, r: ShrineRolls, wild: { next?: number }): number | undefined {
  const W = D2X_WILD_SHRINES;
  if (!W.levels.includes(level)) return undefined;
  wild.next ??= r.roll() & 3;
  const id = W.objects[wild.next % W.objects.length];
  wild.next = (wild.next + 1) % W.objects.length;
  return id;
}
