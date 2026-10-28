// What a modified click on an item does, apart from the DOM (tools/test/ctrlclick.test.mjs): D2's
// shift+click on a potion in the bag (into the belt) and Diablo II: Resurrected's ctrl+click, which
// D2 1.x hasn't: from the bag into the stash's page shown or the cube, sold at a merchant, else
// dropped at the hero's feet; from the stash or the cube back into the bag.
import type { Grid } from '../items/grid';
import type { Item } from '../items/item';
import type { LeftPanel } from './common';

/** the item grids the panels show: the bag, the stash's page shown, the shop's stock, the cube */
export type GridKind = 'inv' | 'stash' | 'shop' | 'cube';

/** a press on an item as the panels read it: its button, D2R's ctrl and D2's shift */
export interface Press {
  button: number;
  ctrl: boolean;
  shift: boolean;
}

/**
 * A pointer press as the panels read it, by the button the browser reports. Ctrl, or cmd (a Mac's
 * own), is D2R's ctrl+click. A Mac's ctrl + left click comes as the left button with ctrl in every
 * browser now (Chrome, Safari, and Firefox since 80: Mozilla bug 1615732), its context menu kept off
 * (src/core/input.ts). A right click with ctrl held stays a right click (drink, use, equip): ctrl is
 * also held to walk or run (playerctl.ts), and a potion is drunk on the move
 */
export function readPress(e: { button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): Press {
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
