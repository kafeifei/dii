// The body a Diablo II hero leaves on dying, and taking it back. D2 makes it where the hero fell
// once the death has played out (D2GAME_CORPSE_Handler, D2MOO PlrModes.cpp:429-650, called at
// 791-794): everything worn and the item on the cursor go on it (game/d2/death.ts corpseSplit), the
// inventory gold left drops beside it, and it holds 75 % of the experience lost. Its owner walking
// over it takes the experience back (PlrModes.cpp:713-722) and the items (sub_6FC4AB10 and
// sub_6FC4AD80, D2Game ItemMode.cpp:5240-5585). The save keeps one body with items and none of its
// experience (PLRSAVE2_WriteCorpsesSection, PlrSave2.cpp:404-450); read back, it waits in town
// (PLRSAVE2_ReadCorpses, PlrSave2.cpp:1104-1203, makes it with no room, for the town to place).
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import type { P2 } from '../core/math';
import type { PlayerClass } from '../data/classes';
import { EQUIP_SLOTS, type EquipSlot } from '../data/items';
import { baseOf, type Item } from '../items/item';
import { corpseSplit, MAX_CORPSES } from './d2/death';
import type { Equipment, Player } from './player';
import type { Difficulty } from './save';

export interface Corpse {
  /**
   * The map it lies on (a Level), or null for the camp: where a body read from a save waits, and one
   * whose map this game no longer has (the dungeon floor before last), as D2 keeps every area of a
   * game while this game keeps only some
   */
  level: object | null;
  /** where it lies; null until it is set down in the camp */
  pos: P2 | null;
  /** the area it fell in, by id (src/world/areas.ts) */
  area: number;
  difficulty: Difficulty;
  cls: PlayerClass;
  /** what was worn */
  equipment: Equipment;
  /** the item that was on the cursor */
  items: Item[];
  /** experience its owner gets back on taking it (death.ts deathPenalty corpseXp) */
  xp: number;
}

/** what dying leaves: the body, and the belt's potions past its first row, which go to the inventory or the ground */
export interface Remains {
  corpse: Corpse | null;
  loose: Item[];
  /** items that go on the ground instead: the hero has more than MAX_CORPSES bodies already (PlrModes.cpp:446-489) */
  dropped: Item[];
}

/**
 * Take everything the hero wears (and the cursor's item) off onto a body. The hero keeps the
 * inventory, stash and cube, and the first row of the belt (death.ts corpseSplit).
 */
export function leaveBody(p: Player, cursor: Item | null, at: { level: object; pos: P2; area: number }, xp: number): Remains {
  const split = corpseSplit(p.equipment, p.belt, cursor);
  p.equipment = {};
  p.belt = split.belt;
  while (p.belt.length < 4) p.belt.push([]);
  p.markDirty();
  const items = Object.values(split.equipment).filter((it): it is Item => !!it).concat(split.items);
  if (p.corpses.length > MAX_CORPSES) return { corpse: null, loose: split.loose, dropped: items };
  const corpse: Corpse = { level: at.level, pos: { ...at.pos }, area: at.area, difficulty: p.difficulty, cls: p.cls, equipment: split.equipment, items: split.items, xp };
  p.corpses.push(corpse);
  return { corpse, loose: split.loose, dropped: [] };
}

/** every item a body holds */
export function bodyItems(c: Corpse): Item[] {
  return [...Object.values(c.equipment).filter((it): it is Item => !!it), ...c.items];
}

/** the ring slot's twin (RRIN / LRIN, ItemMode.cpp:5422-5427) */
const OTHER: Partial<Record<EquipSlot, EquipSlot>> = { ring1: 'ring2', ring2: 'ring1' };

/**
 * Where a body's item goes back on (sub_6FC4AB10, ItemMode.cpp:5240): its own slot, or for a ring
 * the other ring's, when free; no shield beside a two-handed weapon, nor the other way round.
 */
function freeSlot(p: Player, slot: EquipSlot, it: Item): EquipSlot | null {
  const eq = p.equipment;
  if (slot === 'offhand' && eq.weapon && baseOf(eq.weapon).twoHanded) return null;
  if (slot === 'weapon' && baseOf(it).twoHanded && eq.offhand) return null;
  if (!eq[slot]) return slot;
  const other = OTHER[slot];
  return other && !eq[other] ? other : null;
}

/**
 * The hero takes a body back (sub_6FC4AD80, ItemMode.cpp:5383-5585): over and over while anything
 * moves, each worn item the hero meets the requirements of goes back on where it is free, else into
 * the inventory; then the rest, the cursor's item too, into the belt or the inventory. What fits
 * nowhere stays on the body. Returns how many items came back.
 */
export function takeBody(p: Player, c: Corpse, intoBelt: (it: Item) => boolean): number {
  let taken = 0;
  for (let moved = true; moved; ) {
    moved = false;
    for (const slot of EQUIP_SLOTS) {
      const it = c.equipment[slot];
      if (!it || !p.meetsReq(it)) continue;
      const to = freeSlot(p, slot, it);
      if (to) {
        p.equipment[to] = it;
        p.markDirty();
      } else if (!p.inventory.add(it)) continue;
      delete c.equipment[slot];
      taken++;
      moved = true;
    }
  }
  const stow = (it: Item) => intoBelt(it) || p.inventory.add(it);
  for (const slot of EQUIP_SLOTS) {
    const it = c.equipment[slot];
    if (it && stow(it)) {
      delete c.equipment[slot];
      taken++;
    }
  }
  const left = c.items.filter((it) => !stow(it));
  taken += c.items.length - left.length;
  c.items = left;
  return taken;
}
