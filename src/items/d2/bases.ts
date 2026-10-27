// Base lookups for the D2 item code: bases by code, and item type checks up the Equiv chain.
import { D2X_ARMOR } from '../../data/d2x/armor';
import { D2X_ITEM_TYPES } from '../../data/d2x/itemtypes';
import { D2X_MISC } from '../../data/d2x/misc';
import type { D2xItemType } from '../../data/d2x/types';
import { D2X_WEAPONS } from '../../data/d2x/weapons';
import type { D2Base } from './types';

export const D2_BASES: Record<string, D2Base> = Object.fromEntries(
  [...D2X_WEAPONS, ...D2X_ARMOR, ...D2X_MISC].map((b) => [b.code, b]),
);

export function d2Base(code: string): D2Base {
  const b = D2_BASES[code];
  if (!b) throw new Error(`no D2 base ${code}`);
  return b;
}

/** the base's own item type (ItemTypes.txt row of its type column) */
export function ownType(b: D2Base): D2xItemType {
  return D2X_ITEM_TYPES[b.type];
}

const ancestorsCache = new Map<string, Set<string>>();
/** a type and everything it counts as (Equiv1/2, transitively) */
function ancestors(type: string): Set<string> {
  let s = ancestorsCache.get(type);
  if (s) return s;
  s = new Set([type]);
  for (const up of D2X_ITEM_TYPES[type]?.up ?? []) for (const a of ancestors(up)) s.add(a);
  ancestorsCache.set(type, s);
  return s;
}

/** whether the base is of item type `t` or one below it (D2's ITEMS_CheckItemTypeId) */
export function isType(b: D2Base, t: string): boolean {
  return ancestors(b.type).has(t);
}

export const isWeapon = (b: D2Base) => isType(b, 'weap');
export const isArmor = (b: D2Base) => isType(b, 'armo');

/** D2Common Items.cpp:2862-2876 ITEMS_HasDurability: a durability value and no nodurability flag */
export function hasDurability(b: D2Base): boolean {
  return !b.noDur && (b.dur ?? 0) > 0;
}
