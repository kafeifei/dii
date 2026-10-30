// Diablo II's rules for who populates an area (D2MOO MonsterRegion.cpp, MonsterChoose.cpp,
// MonsterSpawn.cpp, MonsterUnique.cpp): the kinds a game's area draws on, how dense its packs come,
// which become champions or uniques, their modifiers, names and minions. Pure functions over an rng;
// src/game/spawn.ts places what they decide.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import { SUBTILES_PER_D2_TILE } from '../../core/units';
import { D2X_MONSTERS } from '../../data/d2x/monsters';
import { D2X_MONUMOD_CONSTANTS, D2X_UNIQUE_NAMES } from '../../data/d2x/superuniques';
import type { D2xMonster, D2xSuperUnique, D2xTri } from '../../data/d2x/types';
import { CHAMPION_TYPES, UMOD } from './monstats';

/** what the rules roll with: a whole number in [min, max] */
export interface Rng {
  int(min: number, max: number): number;
}

/** D2's ITEMS_RollLimitedRandomNumber(n): [0, n) */
const below = (rng: Rng, n: number) => (n > 0 ? rng.int(0, n - 1) : 0);

/** what an area's population is drawn from: Levels.txt's columns (D2xArea) */
export interface Region {
  numMon: number;
  mon: string[];
  nmon: string[];
  umon: string[];
  /** MonDen by difficulty */
  den: D2xTri;
  /** MonUMin–MonUMax by difficulty */
  packs: D2xTri<[number, number]>;
  rangedSpawn?: true;
}

/** a kind an area spawns this game, and its weight */
export interface Kind {
  id: string;
  rarity: number;
}

/**
 * The kinds an area draws on this game (MONSTERREGION_InitializeAll, MonsterRegion.cpp:944-1006):
 * NumMon (at most 13) picked evenly without repeats from mon in normal, nmon in nightmare and hell,
 * the first retried up to 20 times for a ranged one in a rangedSpawn area; only `spawns` rows are
 * kept, each with its Rarity (a pick of a row that isn't one is still used up)
 */
export function pickKinds(r: Region, difficulty: number, rng: Rng): Kind[] {
  const list = [...(difficulty > 0 ? r.nmon : r.mon)];
  const n = Math.min(r.numMon, 13, list.length);
  const kinds: Kind[] = [];
  for (let i = 0; i < n && list.length; i++) {
    let k = below(rng, list.length);
    if (i === 0 && r.rangedSpawn) {
      for (let j = 0; j < 20 && !D2X_MONSTERS[list[k]]?.ranged; j++) k = below(rng, list.length);
    }
    const [id] = list.splice(k, 1);
    const row = D2X_MONSTERS[id];
    if (row?.spawns) kinds.push({ id, rarity: row.rarity });
  }
  return kinds;
}

/**
 * One of the area's kinds by Rarity (MONSTERCHOOSE_GetPresetMonsterId, MonsterChoose.cpp:177-200): a
 * nest-like row (placeSpawn) gives what it spawns instead unless a roll of 100 is at most `keep`
 * (populating keeps the nest 20 times in 100, MonsterRegion.cpp:675; a champion 0)
 */
export function pickKind(kinds: readonly Kind[], rng: Rng, keep: number): string | undefined {
  if (!kinds.length) return undefined;
  const total = kinds.reduce((s, k) => s + k.rarity, 0);
  let r = below(rng, total) + 1;
  let pick = kinds[kinds.length - 1];
  for (const k of kinds) {
    r -= k.rarity;
    if (r <= 0) {
      pick = k;
      break;
    }
  }
  const row = D2X_MONSTERS[pick.id];
  if (row?.spawn && row.placeSpawn && rng.int(0, 99) > keep) return row.spawn.mon;
  return pick.id;
}

/** the monster a champion or unique pack is made of (MonsterChoose.cpp:164-175): in normal one of umon, evenly; else one of the kinds */
export function pickBossKind(r: Region, kinds: readonly Kind[], difficulty: number, rng: Rng): string | undefined {
  if (difficulty === 0) return r.umon.length ? r.umon[below(rng, r.umon.length)] : undefined;
  return pickKind(kinds, rng, 0);
}

/**
 * D2 rolls for a pack once per 3×3 subtiles of a room, a tile being 5×5 (D2GAME_PopulateRoom,
 * MonsterRegion.cpp:668-670): 25/9 rolls a tile
 */
export const ROLLS_PER_TILE = (SUBTILES_PER_D2_TILE * SUBTILES_PER_D2_TILE) / 9;

/** a pack comes on a roll of 100000 at most MonDen (capped at 10000; MonsterRegion.cpp:651-654, 672) */
export function packRoll(den: number, rng: Rng): boolean {
  return rng.int(0, 99999) <= Math.min(den, 10000);
}

/**
 * Whether a pack is a champion or unique one (MONSTERCHOOSE_GetBossSpawnType, MonsterChoose.cpp:218-235):
 * while under MonUMin, more likely the more of the area's rooms are done (`done` of `rooms`, the room
 * being populated counted); under MonUMax, 6 times in 100. `count` is the area's champions and uniques
 * so far (dwUniqueCount). A formation (the other 35 in 100) is a plain pack too (MonsterRegion.cpp:678-681).
 */
export function bossPack(count: number, packs: [number, number], done: number, rooms: number, rng: Rng): boolean {
  if (count < packs[0] && rooms && rng.int(0, 99) < Math.trunc((100 * done) / rooms)) return true;
  if (count < packs[1] && rng.int(0, 99) <= 5) return true;
  rng.int(0, 99);
  return false;
}

/** kinds whose plain packs are one each, their party making the pack (MonsterRegion.cpp:707: MONSTER_FALLEN1, MONSTER_SCARAB1 by nBaseId) */
const ONE_EACH = new Set(['fallen1', 'scarab1']);

/** a plain pack's size (MonsterRegion.cpp:700-712, 776-793): MinGrp–MaxGrp, the Fallen and scarabs one each */
export function groupSize(row: D2xMonster, rng: Rng): number {
  const [min, max] = ONE_EACH.has(row.base ?? row.id) ? [1, 1] : row.group;
  if (!min || !max || max < min) return 0;
  return min + below(rng, max - min + 1);
}

/** the party a monster with minions brings along (MONSTERSPAWN_SpawnMinionParty, MonsterSpawn.cpp:1109-1158): PartyMin–PartyMax of minion1 (and minion2 by turns) */
export function party(row: D2xMonster, rng: Rng): string[] {
  if (!row.minions?.length || !row.party) return [];
  const [min, max] = row.party;
  const n = min < max ? min + below(rng, max - min + 1) : min;
  return Array.from({ length: n }, (_, i) => row.minions![i % Math.min(2, row.minions!.length)]);
}

/** a champion or unique pack's leader is a champion 20 times in 100 (MonUMod constants row 0; MonsterUnique.cpp:2116-2121) */
export function isChampion(rng: Rng): boolean {
  return rng.int(0, 99) < D2X_MONUMOD_CONSTANTS[0].value;
}

/** a champion's pack mates: 1–3 more of it, made champions (MonsterRegion.cpp:688-697) */
export function championMates(rng: Rng): number {
  return below(rng, 3) + 1;
}

/** a modifier may go on a monster (MONSTERUNIQUE_CanAssignUMod, MonsterUnique.cpp:2236-2310) */
export function canAssign(row: D2xMonster, id: number): boolean {
  const u = UMOD.get(id);
  if (!u || u.disabled) return false;
  if (u.exclude?.includes(row.type ?? '')) return false;
  const t = row.diff[0];
  switch (u.fpick) {
    // teleport: it must have an Attack1 mode
    case 1:
      return !!(t.a1 || row.missiles?.a1 || (t.el ?? []).some((e) => e.mode === 'A1') || row.skills?.some((s) => s.mode === 'A1'));
    // multiple shots: not a melee one
    case 2:
      return !row.melee && !row.noMultishot;
    // extra fast: it must walk
    case 3:
      return row.velocity > 0;
  }
  return true;
}

/** one modifier by weight among those `pick` weighs above 0 and the monster may have, `used` left out */
function weighed(row: D2xMonster, ids: readonly number[], weight: (id: number) => number, used: ReadonlySet<number>, rng: Rng): number {
  const picks = ids.filter((id) => weight(id) > 0 && !used.has(id) && canAssign(row, id));
  const total = picks.reduce((s, id) => s + weight(id), 0);
  let r = below(rng, total);
  for (const id of picks) {
    if (r < weight(id)) return id;
    r -= weight(id);
  }
  return 0;
}

const NON_CHAMPION = [...UMOD.values()].filter((u) => !u.champion).map((u) => u.id);

/** a champion's kind by MonUMod cpick (MonsterUnique.cpp:2123-2163): champion, ghostly, fanatic, possessed, berserk */
export function championType(row: D2xMonster, difficulty: number, rng: Rng): number {
  return weighed(row, CHAMPION_TYPES, (id) => UMOD.get(id)!.cpick[difficulty], new Set(), rng);
}

/** a non-champion modifier by upick, not one of `used` (MONSTERUNIQUE_RollNonChampionUMod, MonsterUnique.cpp:2312-2360) */
export function rollUMod(row: D2xMonster, difficulty: number, used: ReadonlySet<number>, rng: Rng): number {
  return weighed(row, NON_CHAMPION, (id) => UMOD.get(id)!.upick[difficulty], used, rng);
}

/** a unique's modifiers: the difficulty's number + 1, all different (MonsterUnique.cpp:2166-2190; RollLimited(1) is always 0) */
export function uniqueMods(row: D2xMonster, difficulty: number, rng: Rng): number[] {
  const mods: number[] = [];
  const used = new Set<number>();
  for (let i = 0; i < difficulty + 1; i++) {
    const m = rollUMod(row, difficulty, used, rng);
    if (!m) break;
    mods.push(m);
    used.add(m);
  }
  return mods;
}

/**
 * A superunique's modifiers (D2GAME_SpawnSuperUnique_6FC6F690, MonsterUnique.cpp:2686-2727): its own
 * (but the thief), then one more for each difficulty above normal
 */
export function superUniqueMods(su: D2xSuperUnique, row: D2xMonster, difficulty: number, rng: Rng): number[] {
  const mods = su.mods.filter((m) => m !== 24).slice(0, 3);
  const used = new Set(mods);
  for (let i = 0; i < difficulty; i++) {
    const m = rollUMod(row, difficulty, used, rng);
    if (!m) break;
    mods.push(m);
    used.add(m);
  }
  return mods;
}

/** the modifiers a unique's minions get too: the xfer ones (MonsterUnique.cpp:2509-2537) */
export function xferMods(mods: readonly number[]): number[] {
  return mods.filter((m) => UMOD.get(m)?.xfer);
}

/**
 * A unique's minions (MONSTERUNIQUE_SpawnMinions, MonsterUnique.cpp:2475-2492): its row's minion1, or
 * more of itself; a random unique brings 3–6 (MonsterUnique.cpp:2091), a superunique its table's
 * group, each end raised by the difficulty when both are above 0 (2729-2735)
 */
export function uniqueMinions(row: D2xMonster, rng: Rng, su?: D2xSuperUnique, difficulty = 0): { id: string; n: number } {
  let [min, max] = su ? su.group : [3, 6];
  if (su && min && max) {
    min += difficulty;
    max += difficulty;
  }
  return { id: row.minions?.[0] ?? row.id, n: min + below(rng, max - min + 1) };
}

/**
 * A random unique's name: a title, a prefix and a suffix, one of each (UniqueAppellation, UniquePrefix,
 * UniqueSuffix through our rename tables; tools/d2-names monster-*.json), the title first in Chinese.
 * D2MOO keeps only the seed the client names it by (MonsterUnique.cpp:170-176); the picks are even.
 */
export function uniqueName(rng: Rng): string {
  const w = D2X_UNIQUE_NAMES;
  return w.title[below(rng, w.title.length)].name + w.prefix[below(rng, w.prefix.length)].name + w.suffix[below(rng, w.suffix.length)].name;
}
