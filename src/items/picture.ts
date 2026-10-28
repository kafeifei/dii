// An item's inventory picture and the colour it is shown in, by Diablo II's rules on D2R 2.7's tables
// (imported into src/data/d2x by tools/d2-import.mjs). The pictures are our own paintings, one per D2
// picture file (public/icons/items, tools/ai-icons.mjs; tools/icons/pictures.mjs lists them by the
// same rules); src/ui/itempics.ts loads and recolours them. D2MOO references are to
// github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
//
// - A picture belongs to a file, not a base: a base shows its Items.txt invfile, and the normal,
//   exceptional and elite bases of a line name the same one (Cap, War Hat and Shako: invcap).
// - A ring, amulet, charm or jewel never shows its base's own file: it rolls one of its type's
//   InvGfx1..VarInvGfx when made (D2Game ITEMS/Items.cpp:748-751) and keeps it in the save (D2Common
//   Items/Items.cpp:6744-6760), so it never changes look: Item.gfx. Items made before it take one
//   from their uid, which the save keeps too.
// - A unique shows its UniqueItems.txt invfile, else its base's uniqueinvfile, else what its base
//   shows; a set item its SetItems.txt invfile, else its base's setinvfile, else what its base shows.
// - No quality colour is painted on: D2 shifts a picture's palette (ITEMS_GetColor, D2Common
//   Items/Items.cpp:3693-4015, the inventory's nTransType 1: D2CMP_MixPalette(the base's InvTrans, a
//   colour)). See colourCodeOf.
import { D2X_ITEM_TYPES } from '../data/d2x/itemtypes';
import { D2X_GEMS } from '../data/d2x/socketables';
import type { D2xAffix, D2xColor } from '../data/d2x/types';
import { affixRow, type AffixKind } from './d2/affixes';
import { D2_BASES, itemMaxSockets } from './d2/bases';
import { SET_ITEM_BY_ID, UNIQUE_BY_ID } from './d2/legendary';
import { qualityOf, type Item } from './item';

/** a hash of the uid (FNV-1a): the look an item made before Item.gfx keeps, the same on every load */
function uidLook(uid: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) h = Math.imul(h ^ uid.charCodeAt(i), 16777619) >>> 0;
  return h % n;
}

/**
 * Which of its type's n looks an item shows (0 … n − 1): what it rolled, clamped as
 * ITEMS_GetVarInvGfxString clamps it (D2Common Items/Items.cpp:731-760), else one from its uid
 */
export function lookOf(item: Item, n: number): number {
  if (item.gfx === undefined) return uidLook(item.uid, n);
  return Math.min(Math.max(item.gfx, 0), n - 1);
}

/** what a base shows as a plain item: its own picture, or the look the item rolled of its type's */
function basePicture(item: Item, code: string): string {
  const b = D2_BASES[code];
  const looks = D2X_ITEM_TYPES[b.type]?.invGfx;
  return looks ? looks[lookOf(item, looks.length)] : b.inv;
}

/**
 * The picture an item shows: a file name in public/icons/items (lower case), or null for an item on
 * no D2 base (one this build doesn't know)
 */
export function pictureOf(item: Item): string | null {
  const b = D2_BASES[item.baseId];
  if (!b) return null;
  const q = qualityOf(item);
  if (q === 'unique') {
    const own = item.uniqueRow === undefined ? undefined : UNIQUE_BY_ID.get(item.uniqueRow)?.inv;
    return own ?? b.invUnique ?? basePicture(item, b.code);
  }
  if (q === 'set') {
    const own = item.setRow === undefined ? undefined : SET_ITEM_BY_ID.get(item.setRow)?.inv;
    return own ?? b.invSet ?? basePicture(item, b.code);
  }
  return basePicture(item, b.code);
}

/** a row's colour; a row this build no longer has (an old save's) has none */
function rowColour(kind: AffixKind, id: number): D2xColor | undefined {
  let a: D2xAffix;
  try {
    a = affixRow(kind, id);
  } catch {
    return undefined;
  }
  return a.color;
}

const GEM_COLOUR = new Map(D2X_GEMS.map((g) => [g.id, g.color]));

/**
 * The colour D2 shifts the item's picture to (ITEMS_GetColor, D2Common Items/Items.cpp:3693-4015):
 * - magic and rare: the transformcolor of its first suffix that has one, else of its first prefix
 *   (3748-3810), else its automagic row's (3986-4012);
 * - unique and set: its invtransform, and nothing else (3812-3914);
 * - any other (low, normal, superior, crafted, and so a runeword): the Gems.txt transform of a gem in
 *   its first socket, when its base takes sockets (3916-3984), else its automagic row's.
 * The hero's colour states (3718-3734) don't colour a picture in the bag here.
 */
export function colourCodeOf(item: Item): D2xColor | null {
  const b = D2_BASES[item.baseId];
  if (!b) return null;
  const q = qualityOf(item);
  if (q === 'unique') return (item.uniqueRow === undefined ? undefined : UNIQUE_BY_ID.get(item.uniqueRow)?.invColor) ?? null;
  if (q === 'set') return (item.setRow === undefined ? undefined : SET_ITEM_BY_ID.get(item.setRow)?.invColor) ?? null;
  if (q === 'magic' || q === 'rare') {
    for (const id of item.suffixes ?? []) {
      const c = rowColour('suffix', id);
      if (c) return c;
    }
    for (const id of item.prefixes ?? []) {
      const c = rowColour('prefix', id);
      if (c) return c;
    }
  } else if (item.sockets > 0 && itemMaxSockets(b, item.ilvl) > 0) {
    // the first thing in its sockets, when it is a gem (ITEMS_CheckItemTypeId ITEMTYPE_GEM): not a rune or a jewel
    const first = item.socketed[0];
    const c = typeof first === 'string' ? GEM_COLOUR.get(first) : undefined;
    if (c) return c;
  }
  return (item.autoAffix === undefined ? undefined : rowColour('auto', item.autoAffix)) ?? null;
}

/** how an item's picture is shown: its file, and the colour and InvTrans its palette is shifted by (none: null) */
export interface ItemPicture {
  file: string;
  colour: { code: D2xColor; invTrans: number } | null;
}

/** the item's picture and colour; a base whose InvTrans is 0 shifts nothing */
export function itemPicture(item: Item): ItemPicture | null {
  const file = pictureOf(item);
  if (!file) return null;
  const code = colourCodeOf(item);
  const invTrans = D2_BASES[item.baseId].invTrans ?? 0;
  return { file, colour: code && invTrans ? { code, invTrans } : null };
}
