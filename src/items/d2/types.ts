// The item the Diablo II item system (A2) builds: Item plus the save-v4 fields. Nothing outside
// src/items/d2 uses it yet; the integration branch moves Item itself onto these fields.
import type { D2xArmor, D2xMisc, D2xWeapon } from '../../data/d2x/types';
import type { Item } from '../item';

/**
 * D2's item qualities (D2MOO D2Common D2Items.h ITEMQUAL_*: inferior, normal, superior, magic,
 * set, rare, unique, crafted). A runeword is a normal or superior item with a flag, not a quality.
 */
export type D2Quality = 'low' | 'normal' | 'superior' | 'magic' | 'set' | 'rare' | 'unique' | 'crafted';

export type D2Base = D2xWeapon | D2xArmor | D2xMisc;

/** 0 normal, 1 nightmare, 2 hell */
export type Difficulty = 0 | 1 | 2;

/** a random source with next() in [0, 1), like core/math's RNG; tests pass a seeded one */
export interface Rand {
  next(): number;
}

export interface D2Item extends Omit<Item, 'socketed'> {
  /** baseId is a D2 base code (weapons/armor/misc); old bases map onto one with `legacy` set */
  quality: D2Quality;
  identified: boolean;
  /** rows (D2xAffix.id) of the magic prefixes and suffixes it rolled, and of its automagic mod */
  prefixes?: number[];
  suffixes?: number[];
  autoAffix?: number;
  /** a rare or crafted item's name words: rows of the rare prefix and suffix tables */
  rareName?: [number, number];
  /** superior: its QualityItems row (D2X_QUALITY id); low quality: its LowQualityItems row */
  qualityRow?: number;
  /** UniqueItems / SetItems row (D2xUnique.id, D2xSetItem.id) */
  uniqueRow?: number;
  setRow?: number;
  /** current and most durability; unset on bases without durability */
  dur?: number;
  maxDur?: number;
  eth?: true;
  /** stack size of stackable bases (javelins, keys, tomes) */
  qty?: number;
  /** runes and gems by id, and jewels as whole items */
  socketed: (string | D2Item)[];
}
