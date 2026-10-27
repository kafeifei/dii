// The game's items from before the Diablo II bases (saves up to version 4 at items migration 0):
// their bases by the game's own ids, the D2 code each became, and the save step that moves an old
// item onto it. Nothing is lost: an old item keeps its mods, name, defense and, where the D2 base
// asks more, its old requirements (Item.legacy).
import type { ItemType } from '../data/items';
import { ITEM_BASES, categoryOf } from '../data/items';
import { D2_PREFIXES, D2_SUFFIXES } from '../data/d2/affixes';
import type { D2Affix } from '../data/d2/types';
import { D2_WEAPONS } from '../data/d2/weapons';
import { RUNEWORD_BY_ID } from '../data/legendary';
import { D2X_PREFIXES, D2X_SUFFIXES } from '../data/d2x/affixes';
import { D2X_TOOLTIP_STRINGS as S } from '../data/d2x/statdesc';
import { D2X_GEMS, D2X_RUNES } from '../data/d2x/socketables';
import { d2Base, isType } from './d2/bases';
import { fmt } from './d2/describe';
import type { D2Quality } from './d2/types';
import type { Item, Socketed } from './item';

/** an old base, as far as old saves need it */
export interface OldBase {
  id: string;
  /** the D2 base it became */
  code: string;
  type: ItemType;
  qlvl: number;
  reqLvl?: number;
  reqStr?: number;
  reqDex?: number;
  /** its D2 code when it already was a D2 base (the weapons, runes, gems) */
  d2?: string;
}

/**
 * The game's own 32 armor bases, each to the real D2 base that matches it (plan M0 item 8): by
 * slot, size and place in the progression. Several shared an id with a D2 base of other numbers
 * (roundshield, a level 25 exceptional shield in D2, is the Small Shield here)
 */
const OLD_ARMOR: [id: string, code: string, type: ItemType, qlvl: number, reqStr?: number][] = [
  ['buckler', 'buc', 'shield', 1], ['roundshield', 'sml', 'shield', 5, 22], ['kiteshield', 'kit', 'shield', 12, 47],
  ['towershield', 'tow', 'shield', 20, 75], ['gothicshield', 'gts', 'shield', 30, 90],
  ['cap', 'cap', 'helm', 1], ['skullcap', 'skp', 'helm', 5, 15], ['helm', 'hlm', 'helm', 11, 26], ['fullhelm', 'fhl', 'helm', 18, 41],
  ['greathelm', 'ghm', 'helm', 26, 63], ['crown', 'crn', 'helm', 34, 80],
  ['quiltedarmor', 'qui', 'armor', 1], ['leatherarmor', 'lea', 'armor', 3, 15], ['ringmail', 'rng', 'armor', 9, 36],
  ['scalemail', 'scl', 'armor', 14, 44], ['chainmail', 'chn', 'armor', 18, 48], ['breastplate', 'brs', 'armor', 22, 65],
  ['platemail', 'plt', 'armor', 28, 82], ['gothicplate', 'gth', 'armor', 36, 105],
  ['leathergloves', 'lgl', 'gloves', 2], ['heavygloves', 'vgl', 'gloves', 8], ['chaingloves', 'mgl', 'gloves', 16, 25], ['gauntlets', 'hgl', 'gloves', 26, 60],
  ['boots', 'lbt', 'boots', 2], ['heavyboots', 'vbt', 'boots', 8, 18], ['chainboots', 'mbt', 'boots', 16, 30], ['greaves', 'hbt', 'boots', 26, 70],
  ['sash', 'lbl', 'belt', 2], ['lightbelt', 'vbl', 'belt', 7], ['belt', 'mbl', 'belt', 14, 25], ['heavybelt', 'tbl', 'belt', 20, 45],
  ['platebelt', 'hbl', 'belt', 30, 60],
];

/** every base an old save can hold, by its old id */
export const OLD_BASES: Record<string, OldBase> = {};
for (const w of D2_WEAPONS) OLD_BASES[w.id] = { id: w.id, code: w.code!, d2: w.code, type: w.type, qlvl: w.qlvl, reqLvl: w.reqLvl, reqStr: w.reqStr, reqDex: w.reqDex };
// old armor needed level 80% of its quality level, at least 1 (src/items/gen.ts createItem then)
for (const [id, code, type, qlvl, reqStr] of OLD_ARMOR) OLD_BASES[id] = { id, code, type, qlvl, reqLvl: Math.max(1, Math.floor(qlvl * 0.8)), reqStr };
OLD_BASES.ring = { id: 'ring', code: 'rin', type: 'ring', qlvl: 1 };
OLD_BASES.amulet = { id: 'amulet', code: 'amu', type: 'amulet', qlvl: 1 };
for (const [id, q] of [['hp1', 1], ['hp2', 8], ['hp3', 16], ['hp4', 26], ['mp1', 1], ['mp2', 8], ['mp3', 16], ['mp4', 26]] as const) OLD_BASES[id] = { id, code: id, type: 'potion', qlvl: q };
OLD_BASES.rejuv = { id: 'rejuv', code: 'rvs', type: 'potion', qlvl: 10 };
OLD_BASES.rejuvfull = { id: 'rejuvfull', code: 'rvl', type: 'potion', qlvl: 28 };
for (const r of D2X_RUNES) OLD_BASES[r.id] = { id: r.id, code: r.id, d2: r.id, type: 'rune', qlvl: r.qlvl, reqLvl: r.reqLvl };
for (const g of D2X_GEMS) OLD_BASES[g.id] = { id: g.id, code: g.id, d2: g.id, type: 'gem', qlvl: g.qlvl, reqLvl: g.reqLvl };
OLD_BASES.cube = { id: 'cube', code: 'box', type: 'cube', qlvl: 0 };

/** an old base's name as items were named with it (the first D2 import's weapon names) */
const OLD_NAME: Record<string, string> = Object.fromEntries(D2_WEAPONS.map((w) => [w.id, w.name]));

/** our name of the affix an old item was named with: the d2x row of its English name that fits the base */
function newAffixName(kind: 'prefix' | 'suffix', old: D2Affix, code: string): string | undefined {
  const b = d2Base(code);
  const rows = (kind === 'prefix' ? D2X_PREFIXES : D2X_SUFFIXES).filter((a) => a.en === old.en);
  const fit = rows.find((a) => a.itypes.some((t) => isType(b, t)) && !a.etypes?.some((t) => isType(b, t))) ?? rows[0];
  return fit?.name;
}

/**
 * An old magic weapon's name with our affix names: the first D2 release named them suffix, prefix,
 * base with the official affix strings (the rows it doesn't keep). Read back by those strings, it
 * becomes the same name in our words (MagicFormat); undefined when the name doesn't read that way
 */
export function renamedOldMagic(name: string, oldId: string, code: string): string | undefined {
  const base = OLD_NAME[oldId];
  if (!base || !name.endsWith(base)) return undefined;
  const rest = name.slice(0, -base.length);
  const b = ITEM_BASES[code];
  for (const suf of [undefined, ...D2_SUFFIXES]) {
    if (suf && !rest.startsWith(suf.name)) continue;
    const after = suf ? rest.slice(suf.name.length) : rest;
    const pre = after ? D2_PREFIXES.find((p) => p.name === after) : undefined;
    if (after && !pre) continue;
    const pn = pre && newAffixName('prefix', pre, code);
    const sn = suf && newAffixName('suffix', suf, code);
    if ((pre && !pn) || (suf && !sn)) return undefined;
    if (pn && sn) return fmt(S.MagicFormat, pn, b.name, sn);
    if (pn) return fmt(S.ItemNameMagicFormatPrefixOnly, pn, b.name);
    if (sn) return fmt(S.ItemNameMagicFormatSuffixOnly, b.name, sn);
  }
  return undefined;
}

/** an old base id → the D2 code it became, for the bases there were */
export function codeOfOld(id: string): string | undefined {
  return OLD_BASES[id]?.code;
}

/**
 * An item from before the D2 bases moved onto its D2 base: the code, its quality, a runeword's row,
 * full durability of the new base; what it was made with stays (mods, name, defense). Where the D2
 * base asks more strength, dexterity or level than the old one did, it keeps the old requirements.
 * A jewel in a socket moves with it. Unknown items (no old base) are left as they are.
 */
export function toD2Item(it: Item): Item {
  const old = OLD_BASES[it.baseId];
  if (!old || !ITEM_BASES[old.code]) return it;
  const b = ITEM_BASES[old.code];
  it.baseId = old.code;
  it.socketed = (it.socketed ?? []).map((s: Socketed) => (typeof s === 'string' ? (codeOfOld(s) ?? s) : toD2Item(s)));
  it.quality = (it.rarity === 'runeword' ? 'normal' : it.rarity) as D2Quality;
  // a magic D2 weapon was named with the official affix strings: the same name in ours
  if (old.d2 && it.rarity === 'magic' && categoryOf(b.type)) it.name = renamedOldMagic(it.name, old.id, old.code) ?? it.name;
  if (it.runewordId && RUNEWORD_BY_ID[it.runewordId]) it.runewordRow = it.runewordId;
  if (b.dur && it.maxDur === undefined) {
    it.maxDur = b.dur;
    it.dur = b.dur;
  }
  if (!it.legacy && categoryOf(b.type)) {
    const lvl = it.rarity === 'normal' || it.rarity === 'superior' ? Math.min(it.reqLvl, Math.max(1, b.reqLvl ?? 1)) : it.reqLvl;
    const str = Math.min(b.reqStr ?? 0, old.reqStr ?? 0);
    const dex = Math.min(b.reqDex ?? 0, old.reqDex ?? 0);
    // only where it would ask more than before
    if (lvl < Math.max(1, b.reqLvl ?? 1) || str < (b.reqStr ?? 0) || dex < (b.reqDex ?? 0) || !old.d2) {
      it.legacy = { lvl, str, dex, runes: it.socketed.length };
    }
  }
  return it;
}
