// What a modified click on an item does, apart from the DOM (tools/test/ctrlclick.test.mjs): D2's
// shift+click on a potion in the bag (into the belt) and Diablo II: Resurrected's ctrl+click, which
// D2 1.x hasn't: from the bag into the stash's page shown or the cube, sold at a merchant, else
// dropped at the hero's feet; from the stash or the cube back into the bag.
import type { Grid } from '../items/grid';
import type { Item } from '../items/item';
import type { LeftPanel } from './common';

/** the item grids the panels show: the bag, the stash's page shown, the shop's stock, the cube */
export type GridKind = 'inv' | 'stash' | 'shop' | 'cube';

/** a Mac's browser: ctrl+click there is the system's right click, and cmd stands in for ctrl */
export const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');

/** a press on an item as the panels read it: its button, D2R's ctrl and D2's shift */
export interface Press {
  button: number;
  ctrl: boolean;
  shift: boolean;
}

/**
 * A pointer press as the panels read it. Ctrl, or cmd, is D2R's ctrl+click. On a Mac ctrl+click is
 * the system's right click, and a browser may say so (Firefox reports button 2): there it is still
 * the left button with ctrl, not the right click's use or equip (the context menu itself is kept
 * off, src/core/input.ts)
 */
export function readPress(e: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, mac = MAC): Press {
  if (mac && e.ctrlKey && e.button === 2) return { button: 0, ctrl: true, shift: e.shiftKey };
  return { button: e.button, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
}

/** where D2R's ctrl+click sends an item */
export type QuickMove = 'stash' | 'cube' | 'sell' | 'ground' | 'bag';

/**
 * Where D2R's ctrl+click sends an item clicked in grid `from` with the left panel `left` open: from
 * the bag into the stash's page shown or the cube, sold with a merchant's open, else (no panel, the
 * character's, the quest log, the waypoints) dropped on the ground; from the stash or the cube into
 * the bag. Null in the shop's stock, where a click buys
 */
export function quickMove(from: GridKind, left: LeftPanel): QuickMove | null {
  if (from === 'inv') return left === 'stash' ? 'stash' : left === 'cube' ? 'cube' : left === 'shop' ? 'sell' : 'ground';
  if (from === 'stash' || from === 'cube') return 'bag';
  return null;
}

/**
 * `it` out of `from` into the first space that takes it in `to` (Grid.add, D2's auto-placing); false,
 * and `it` left where it was, when no space does
 */
export function moveItem(it: Item, from: Grid, to: Grid): boolean {
  if (from === to || !from.contains(it) || !to.add(it)) return false;
  from.remove(it);
  return true;
}
