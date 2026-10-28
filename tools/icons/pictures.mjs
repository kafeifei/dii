// The item pictures to paint: what D2 draws in an inventory cell, one entry per picture file, not
// per base. Built from D2R 2.7's tables (tools/.d2cache/ref27-*.json, the content scope's last
// tables), restricted to what the game imports (src/data/d2x: no Warlock content).
//
//   node tools/icons/pictures.mjs            the counts
//   node tools/icons/pictures.mjs --json     the whole list
//
// D2's rules, as followed here:
// - A base shows its invfile (Weapons/Armor/Misc.txt invfile). The normal, exceptional and elite tiers
//   of a line name the same file (Cap, War Hat and Shako all show invcap), so a picture is painted
//   once, as the line's normal-tier object; a few files serve several lines (claws, some quest items).
// - A base whose item type has VarInvGfx (ItemTypes.txt: rings 5, amulets 3, jewels 6, each charm
//   size 3) never shows its own invfile: the item rolls one of the type's InvGfx1..6 when it is made,
//   ITEMS_RollLimitedRandomNumber(seed, VarInvGfx) (D2MOO D2Game ITEMS/Items.cpp:748-751, the type
//   being the base's first type, ITEMS_GetVarInvGfxCount, D2Common Items/Items.cpp:707), and keeps it
//   in 3 bits of the save (D2Common Items/Items.cpp:5074, 6744-6760).
// - A unique shows UniqueItems.txt invfile, else its base's uniqueinvfile, else what its base shows;
//   a set item shows SetItems.txt invfile, else its base's setinvfile, else what its base shows (the
//   D2R data guide: invfile overrides the base's; uniqueinvfile/setinvfile are the base's picture
//   "when it is a Unique / Set quality item"). The base column decides only one unique in scope, the
//   Amulet of the Viper (vip: invvip, not an amulet variant); no set item names its own file.
// - Colour is not a picture: D2 recolours one with a palette shift (D2Common Items/Items.cpp
//   ITEMS_GetColor, 3693-3900: D2CMP_MixPalette(the base's InvTrans, a colour)), a magic or rare item
//   by the transformcolor of its first suffix that has one, else of its first prefix; a unique or set
//   item by its invtransform. The entries carry each base's InvTrans and each special item's
//   invtransform for that remap; no quality colour is painted on.
import { fileURLToPath } from 'node:url';
import { REF27, importTs, load, rows } from '../d2/load.mjs';

/** the picture groups, a description file and a picks file each (tools/icons/desc, tools/icons/picks) */
export const GROUPS = {
  blades: ['swor', 'axe', 'knif', 'club', 'mace', 'hamm', 'taxe', 'tkni', 'h2h', 'h2h2'],
  long: ['spea', 'pole', 'jave', 'staf', 'wand', 'scep', 'orb', 'aspe', 'ajav'],
  ranged: ['bow', 'xbow', 'abow', 'tpot', 'bowq', 'xboq'],
  body: ['tors', 'belt', 'boot', 'glov'],
  heads: ['helm', 'circ', 'phlm', 'pelt', 'head', 'shie', 'ashd'],
  // every other Misc.txt type: gems, runes, potions, scrolls, tomes, keys, quest items, body parts,
  // charms, jewels, rings, amulets, gold, the torch, the ear, the cube…
  misc: [],
};
const GROUP_OF = new Map(Object.entries(GROUPS).flatMap(([g, types]) => types.map((t) => [t, g])));
export const KINDS = ['base', 'variant', 'unique', 'set'];
/** the picks and made file a picture is recorded in: a unique's or set item's own picture in
 * uniques/sets (they are painted and reviewed as a stage of their own), every other in its group's */
export const listOf = (p) => (p.kind === 'unique' ? 'uniques' : p.kind === 'set' ? 'sets' : p.group);
export const LISTS = [...Object.keys(GROUPS), 'uniques', 'sets'];
const TABLES = ['weapons', 'armor', 'misc'];

/** file names as ids, in lower case (the rune files are spelt invrEl, invrTir…) */
const idOf = (file) => file.toLowerCase();

export async function buildPictures() {
  const [weapons, armor, misc, itypes, uniques27, sets27] = await Promise.all(
    ['weapons', 'armor', 'misc', 'itemtypes', 'uniqueitems', 'setitems'].map((n) => load(REF27, n).then(rows)),
  );
  const [{ D2X_WEAPONS }, { D2X_ARMOR }, { D2X_MISC }, { D2X_UNIQUES }, { D2X_SET_ITEMS }] = await Promise.all(
    ['weapons', 'armor', 'misc', 'uniques', 'sets'].map((m) => importTs(`src/data/d2x/${m}.ts`)),
  );
  const d2x = { weapons: D2X_WEAPONS, armor: D2X_ARMOR, misc: D2X_MISC };
  const raw = { weapons, armor, misc };
  const TYPE = new Map(itypes.filter((t) => t.Code).map((t) => [t.Code, t]));
  const variantsOf = (type) => {
    const t = TYPE.get(type);
    const n = +(t?.VarInvGfx ?? 0);
    return n ? Array.from({ length: n }, (_, i) => t[`InvGfx${i + 1}`]) : null;
  };

  const counts = { tables: {}, scope: {} };
  /** every base in scope, by code: its 2.7 row, its table, the game's entry (our names) */
  const BASE = new Map();
  for (const t of TABLES) {
    const inScope = new Map(d2x[t].map((b) => [b.code, b]));
    counts.tables[t] = { bases: raw[t].length, files: new Set(raw[t].map((r) => r.invfile)).size };
    const rs = raw[t].filter((r) => inScope.has(r.code));
    counts.scope[t] = { bases: rs.length, files: new Set(rs.map((r) => r.invfile)).size };
    for (const r of rs) BASE.set(r.code, { row: r, table: t, x: inScope.get(r.code) });
  }
  counts.tables.files = new Set(TABLES.flatMap((t) => raw[t].map((r) => r.invfile))).size;
  counts.scope.files = new Set([...BASE.values()].map((b) => b.row.invfile)).size;

  const groupOf = (b) => {
    const g = GROUP_OF.get(b.row.type);
    if (g) return g;
    if (b.table !== 'misc') throw new Error(`${b.row.code} (${b.table}): type ${b.row.type} is in no group`);
    return 'misc';
  };
  const codeEntry = (b) => ({
    code: b.row.code,
    en: b.x.en,
    name: b.x.name,
    tier: b.x.tier ?? null,
    type: b.row.type,
    w: b.row.invwidth,
    h: b.row.invheight,
    invTrans: +(b.row.InvTrans ?? 0),
  });
  const pushCode = (p, b) => {
    if (!p.codes.some((c) => c.code === b.row.code)) p.codes.push(codeEntry(b));
  };
  const lead = (b) => ({ w: b.row.invwidth, h: b.row.invheight, group: groupOf(b), type: b.row.type, family: TYPE.get(b.row.type)?.ItemType ?? b.row.type });

  const pictures = new Map();
  const add = (id, make) => {
    if (!pictures.has(id)) pictures.set(id, { ...make(), codes: [], uniques: [], sets: [] });
    return pictures.get(id);
  };

  // the bases' own pictures, and the variants their types roll instead
  for (const b of BASE.values()) {
    const vars = variantsOf(b.row.type);
    if (vars) {
      vars.forEach((file, i) => {
        pushCode(add(idOf(file), () => ({ id: idOf(file), file, kind: 'variant', ...lead(b), variant: { type: b.row.type, index: i, of: vars.length } })), b);
      });
    } else {
      pushCode(add(idOf(b.row.invfile), () => ({ id: idOf(b.row.invfile), file: b.row.invfile, kind: 'base', ...lead(b) })), b);
    }
  }
  /** what a base shows as a plain item: its own picture, or its type's variants */
  const shownBy = (b) => (variantsOf(b.row.type) ?? [b.row.invfile]).map(idOf);

  /**
   * A special item's picture: its own (kind unique or set, listing the base pictures it is a version
   * of) or one it shares with bases. who.shows says why: 'own' (its UniqueItems/SetItems invfile),
   * 'column' (its base's uniqueinvfile/setinvfile) or 'base' (what its base shows: every variant, for
   * a ring, amulet, jewel or charm, of which the item's own roll picks one).
   */
  const show = (kind, own, column, b, who) => {
    const file = own || column;
    who.shows = own ? 'own' : column ? 'column' : 'base';
    for (const id of file ? [idOf(file)] : shownBy(b)) {
      let p = pictures.get(id);
      if (!p) p = add(id, () => ({ id, file, kind, ...lead(b), base: [] }));
      p[kind === 'unique' ? 'uniques' : 'sets'].push(who);
      if (p.base) {
        pushCode(p, b);
        for (const bp of shownBy(b)) if (!p.base.includes(bp)) p.base.push(bp);
      }
    }
  };

  // uniques: UniqueItems.txt invfile, else the base's uniqueinvfile, else what the base shows
  const U27 = new Map(uniques27.map((r) => [r['*ID'], r]));
  counts.uniques = { scope: 0, ownFile: 0, baseFile: 0, baseShown: 0, recoloured: 0 };
  for (const u of D2X_UNIQUES) {
    const r = U27.get(u.id);
    const b = BASE.get(u.code);
    if (!r || !b || r.code !== u.code) throw new Error(`unique ${u.id} ${u.key}: not in 2.7's UniqueItems.txt on ${u.code}`);
    const c = counts.uniques;
    c.scope++;
    if (r.invtransform) c.recoloured++;
    if (r.invfile) c.ownFile++;
    else if (b.row.uniqueinvfile) c.baseFile++;
    else c.baseShown++;
    show('unique', r.invfile, b.row.uniqueinvfile, b, { id: u.id, key: u.key, name: u.name, nameEn: u.nameEn, code: u.code, invTransform: r.invtransform ?? null });
  }

  // set items: SetItems.txt invfile (none in 2.7), else the base's setinvfile, else what the base shows
  const S27 = new Map(sets27.map((r) => [r['*ID'], r]));
  counts.sets = { scope: 0, ownFile: 0, baseFile: 0, baseShown: 0, recoloured: 0 };
  for (const s of D2X_SET_ITEMS) {
    const r = S27.get(s.id);
    const b = BASE.get(s.code);
    if (!r || !b || r.item !== s.code) throw new Error(`set item ${s.id} ${s.key}: not in 2.7's SetItems.txt on ${s.code}`);
    const c = counts.sets;
    c.scope++;
    if (r.invtransform) c.recoloured++;
    if (r.invfile) c.ownFile++;
    else if (b.row.setinvfile) c.baseFile++;
    else c.baseShown++;
    show('set', r.invfile, b.row.setinvfile, b, { id: s.id, key: s.key, set: s.set, name: s.name, nameEn: s.nameEn, code: s.code, invTransform: r.invtransform ?? null });
  }

  const list = [...pictures.values()];
  for (const p of list) {
    // the base the description paints: the line's normal tier, the first in table order
    p.lead = (p.codes.find((c) => !c.tier) ?? p.codes[0]).code;
    const sizes = new Set(p.codes.map((c) => `${c.w}x${c.h}`));
    if (sizes.size > 1) p.otherSizes = [...sizes].filter((s) => s !== `${p.w}x${p.h}`);
  }
  const by = (k) => list.filter((p) => p.kind === k).length;
  counts.pictures = { base: by('base'), variant: by('variant'), unique: by('unique'), set: by('set'), all: list.length };
  counts.pictures.uniqueAlsoSet = list.filter((p) => p.kind === 'unique' && p.sets.length).length;
  counts.pictures.setAll = list.filter((p) => p.sets.length && p.base).length;
  counts.groups = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, list.filter((p) => p.group === g).length]));
  return { pictures: list, byId: pictures, counts };
}

/**
 * The picture an item shows, by the rules above. item: { code, quality ('unique' | 'set' | another),
 * id (the UniqueItems/SetItems *ID, for those two), varIndex (the InvGfx index it rolled) }.
 */
export function pictureOf(byId, item) {
  const pick = (p) => p.kind !== 'variant' || p.variant.index === (item.varIndex ?? 0) % p.variant.of;
  const key = item.quality === 'unique' ? 'uniques' : item.quality === 'set' ? 'sets' : null;
  if (key) {
    for (const p of byId.values()) {
      const who = p[key].find((s) => s.id === item.id);
      if (who && (who.shows !== 'base' || pick(p))) return p.id;
    }
  }
  for (const p of byId.values()) if ((p.kind === 'base' || p.kind === 'variant') && p.codes.some((c) => c.code === item.code) && pick(p)) return p.id;
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pictures, counts: c } = await buildPictures();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(pictures, null, 1) + '\n');
  } else {
    const tb = (o) => TABLES.map((t) => `${t} ${o[t].bases} → ${o[t].files}`).join(', ');
    const p = c.pictures;
    console.log(`2.7's tables, bases → files: ${tb(c.tables)}; ${c.tables.files} files in all`);
    console.log(`in the game (src/data/d2x): ${tb(c.scope)}; ${c.scope.files} files in all`);
    console.log(`uniques ${c.uniques.scope}: ${c.uniques.ownFile} name their own file, ${c.uniques.baseFile} take the base's uniqueinvfile, ${c.uniques.baseShown} show their base; ${c.uniques.recoloured} recoloured (invtransform)`);
    console.log(`set items ${c.sets.scope}: ${c.sets.ownFile} name their own file, ${c.sets.baseFile} take the base's setinvfile, ${c.sets.baseShown} show their base; ${c.sets.recoloured} recoloured (invtransform)`);
    console.log(`pictures to paint: ${p.all} = ${p.base} base + ${p.variant} variants + ${p.unique} unique + ${p.set} set (${p.setAll} set pictures, ${p.uniqueAlsoSet} of them also a unique's)`);
    console.log(`by group: ${Object.entries(c.groups).map(([g, n]) => `${g} ${n}`).join(', ')}`);
  }
}
