// The random rolls the D2 item modules share. D2 draws them from the item's own seed (a drop's
// picks from its monster's); here they come from whatever Rand the caller passes, in D2's order
// within an item. A drop's picks all come before its items are made (gen.ts dropTc), where D2 takes
// turns: the same odds, another order.
import type { Rand } from './types';

/** D2's ITEMS_RollLimitedRandomNumber: 0 … n − 1, and 0 when n ≤ 0 */
export function roll(rng: Rand, n: number): number {
  return n > 0 ? Math.floor(rng.next() * n) : 0;
}

/**
 * min … max inclusive, either way round (D2Common ItemMods.cpp:2806-2826
 * ITEMMODS_RollRandomValueInRange, and the same inline in every property function)
 */
export function rollRange(rng: Rand, min: number, max: number): number {
  if (min === max) return min;
  const lo = Math.min(min, max);
  return lo + roll(rng, Math.abs(max - min) + 1);
}
