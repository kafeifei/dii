// The item the Diablo II item system (A2) builds: Item plus the save-v4 fields. Nothing outside
// src/items/d2 uses it yet; the integration branch moves Item itself onto these fields.
import type { D2Prop, D2xArmor, D2xMisc, D2xWeapon } from '../../data/d2x/types';
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
  /**
   * staff mods: +N to class skills rolled onto wands, staves, orbs, scepters and class helms, as
   * D2's item_singleskill stats ("skill" properties with min = max = N)
   */
  staffMods?: D2Prop[];
  /** superior: its QualityItems row (D2X_QUALITY id); low quality: its LowQualityItems row */
  qualityRow?: number;
  /** UniqueItems / SetItems row (D2xUnique.id, D2xSetItem.id) */
  uniqueRow?: number;
  setRow?: number;
  /**
   * a unique's, set item's or runeword's rolled properties (props.ts: min = max where D2 rolled a
   * value; per-level ones keep their amount per level)
   */
  props?: D2Prop[];
  /**
   * a set item's green bonus slots 1..5 as rolled ([] for an empty slot), on by what else of its
   * set is worn; a slot's dur property is this item's most durability while the slot is on
   */
  setBonus?: D2Prop[][];
  /** charges left of each bonus slot's charged skills ({} for a slot without), used while the slot is on */
  setCharges?: Record<string, number>[];
  /** a runeword's Runes.txt row (D2xRuneword.id) */
  runewordRow?: string;
  /**
   * current and most durability, the item's own dur properties' points included (not a set bonus
   * slot's); unset on bases without durability
   */
  dur?: number;
  maxDur?: number;
  eth?: true;
  /** stack size of stackable bases (javelins, keys, tomes) */
  qty?: number;
  /** runes and gems by id, and jewels as whole items */
  socketed: (string | D2Item)[];
}
