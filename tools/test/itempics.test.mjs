// The game's item pictures (src/items/picture.ts, src/ui/recolour.ts, src/data/itempics.ts): the
// picture an item shows by D2's rule (one per file: a line's three tiers share it; a unique's own
// file, else its base's uniqueinvfile; a set item's base setinvfile; a ring's look rolled when made
// and kept through a save and a reload, an older item's from its uid), its colour by D2's
// ITEMS_GetColor (a magic item's first suffix with a colour, else its first prefix's; a unique's or
// set item's invtransform; a gem in a normal item's first socket; InvTrans 0 none), the remap the
// same as tools/icons/colours.py's, and every picture an item can show painted and listed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** tools/icons/colours.py on these pixels (python3, numpy float32): the TS port must agree within 1 (a clear one it leaves) */
const PY_IN = [[128, 128, 132, 255], [200, 200, 205, 255], [40, 40, 44, 255], [120, 80, 50, 255], [150, 110, 60, 200], [220, 180, 60, 255], [180, 30, 30, 255], [90, 70, 55, 255], [250, 250, 250, 128], [60, 90, 160, 255], [30, 20, 10, 0], [170, 140, 100, 255]];
const PY_OUT = {
  'cblu/8': [[73, 144, 238, 255], [183, 212, 251, 255], [23, 45, 75, 255], [53, 98, 160, 255], [68, 130, 210, 200], [220, 180, 60, 255], [180, 30, 30, 255], [43, 83, 136, 255], [255, 255, 255, 128], [60, 90, 160, 255], [17, 32, 52, 0], [108, 156, 219, 255]],
  'dred/2': [[147, 84, 81, 255], [188, 148, 146, 255], [62, 20, 18, 255], [120, 80, 50, 255], [150, 110, 60, 200], [220, 180, 60, 255], [180, 30, 30, 255], [90, 70, 55, 255], [217, 192, 191, 128], [60, 90, 160, 255], [30, 20, 10, 0], [170, 140, 100, 255]],
  'lgld/8': [[163, 140, 84, 255], [235, 219, 180, 255], [51, 44, 27, 255], [115, 96, 55, 255], [150, 126, 71, 200], [220, 180, 60, 255], [180, 30, 30, 255], [96, 80, 47, 255], [255, 255, 255, 128], [60, 90, 160, 255], [28, 24, 13, 0], [183, 154, 92, 255]],
  'blac/5': [[70, 69, 68, 255], [109, 108, 107, 255], [22, 22, 21, 255], [52, 47, 43, 255], [67, 62, 57, 200], [220, 180, 60, 255], [180, 30, 30, 255], [42, 40, 37, 255], [136, 135, 134, 128], [60, 90, 160, 255], [13, 12, 10, 0], [96, 88, 77, 255]],
  'bwht/8': [[182, 182, 179, 255], [251, 251, 251, 255], [57, 57, 57, 255], [128, 125, 120, 255], [167, 164, 158, 200], [220, 180, 60, 255], [180, 30, 30, 255], [106, 105, 102, 255], [255, 255, 255, 128], [60, 90, 160, 255], [32, 31, 30, 0], [201, 194, 181, 255]],
  'lgrn/2': [[105, 158, 92, 255], [193, 223, 186, 255], [33, 50, 29, 255], [120, 80, 50, 255], [150, 110, 60, 200], [220, 180, 60, 255], [180, 30, 30, 255], [90, 70, 55, 255], [255, 255, 255, 128], [60, 90, 160, 255], [30, 20, 10, 0], [170, 140, 100, 255]],
};

export default async (load) => {
  const problems = [];
  const check = (ok, what) => ok || problems.push(what);
  const P = await load('/src/items/picture.ts');
  const { recolourPixels, rangesOf } = await load('/src/ui/recolour.ts');
  const { ITEM_PICTURES } = await load('/src/data/itempics.ts');
  const { createItem } = await load('/src/items/gen.ts');
  const { makeMagicWith } = await load('/src/items/make.ts');
  const { D2_BASES } = await load('/src/items/d2/bases.ts');
  const { D2X_ITEM_TYPES } = await load('/src/data/d2x/itemtypes.ts');
  const { D2X_UNIQUES } = await load('/src/data/d2x/uniques.ts');
  const { D2X_SET_ITEMS } = await load('/src/data/d2x/sets.ts');
  const { D2X_PREFIXES, D2X_SUFFIXES, D2X_AUTOMAGIC } = await load('/src/data/d2x/affixes.ts');
  const { D2X_GEMS } = await load('/src/data/d2x/socketables.ts');
  const { RNG } = await load('/src/core/math.ts');
  const save = await load('/src/game/save.ts');
  const { Player } = await load('/src/game/player.ts');
  const { CAMP_AREA } = await load('/src/world/areas.ts');
  const unique = (en) => D2X_UNIQUES.find((u) => u.en === en);
  const setItem = (en) => D2X_SET_ITEMS.find((s) => s.en === en);
  const shows = (it) => {
    const p = P.itemPicture(it);
    return p ? `${p.file}${p.colour ? ` ${p.colour.code}/${p.colour.invTrans}` : ''}` : null;
  };
  const eq = (it, want, what) => check(shows(it) === want, `${what}: shows ${shows(it)}, not ${want}`);

  // ── a line's three tiers share one picture, whatever their quality's colour ──
  for (const [codes, file] of [[['cap', 'xap', 'uap'], 'invcap'], [['2ax', '72a', '92a'], 'inv2ax'], [['lsd', '9ls', '7ls'], 'invlsd']]) {
    for (const c of codes) eq(createItem(c), file, `a normal ${D2_BASES[c].en}`);
  }

  // ── uniques: their own picture, else the base's with only their colour ──
  const gnasher = unique('The Gnasher');
  check(gnasher?.inv === 'invhaxu' && !gnasher.invColor, `The Gnasher's own picture: ${gnasher?.inv}`);
  eq(createItem('hax', 'unique', 20, { row: gnasher.id }), 'invhaxu', 'The Gnasher (own picture, no colour)');
  eq(createItem('hax'), 'invhax', 'a plain hand axe beside it');
  const bladebone = unique('Bladebone');
  check(!bladebone.inv && !D2_BASES['2ax'].invUnique && bladebone.invColor === 'lgry', `Bladebone: ${bladebone.inv} ${bladebone.invColor}`);
  eq(createItem('2ax', 'unique', 30, { row: bladebone.id }), 'inv2ax lgry/2', 'Bladebone (its base\'s picture in light grey, InvTrans 2)');
  const maelstrom = unique('Maelstrom');
  eq(createItem('ywn', 'unique', 30, { row: maelstrom.id }), 'invywn dblu/8', 'Maelstrom (a wand: InvTrans 8)');
  // the base's uniqueinvfile, where the unique names none: the Amulet of the Viper
  const viper = unique('Amulet of the Viper');
  eq(createItem('vip', 'unique', 10, { row: viper.id }), 'invvip', 'the Amulet of the Viper');

  // ── set items: none names its own picture; on a base with a setinvfile they show it ──
  check(D2X_SET_ITEMS.every((s) => !s.inv), 'a set item names its own picture: the scope\'s SetItems.txt has none');
  const ward = setItem("Civerb's Ward");
  check(D2_BASES.lrg.invSet === 'invlrgu', `the large shield's setinvfile: ${D2_BASES.lrg.invSet}`);
  eq(createItem('lrg', 'set', 20, { row: ward.id }), 'invlrgu lyel/2', "Civerb's Ward (the base's set picture, light yellow)");
  eq(createItem('lrg'), 'invlrg', 'a plain large shield beside it');
  const heel = setItem("Hsarus' Iron Heel");
  eq(createItem('mbt', 'set', 20, { row: heel.id }), 'invmbt dred/8', "Hsarus' Iron Heel (no set picture: its base's, dark red)");

  // ── magic and rare: the first suffix with a colour, else the first prefix's ──
  const rng = new RNG(7);
  const stab = D2X_SUFFIXES.find((a) => a.en === 'of Stability');
  const saintly = D2X_PREFIXES.find((a) => a.en === 'Saintly');
  const skill = D2X_SUFFIXES.find((a) => a.en === 'of Skill');
  check(stab.color === 'dyel' && saintly.color === 'dgld' && !skill.color, `the affixes' colours: ${stab.color} ${saintly.color} ${skill.color}`);
  const capOfStab = makeMagicWith({ code: 'cap', ilvl: 30, identified: true }, 'suffix', stab.id, rng);
  eq(capOfStab, 'invcap dyel/8', 'a cap of Stability (its suffix\'s colour, whatever its prefix)');
  const plainCap = createItem('cap');
  eq({ ...plainCap, rarity: 'magic', quality: 'magic', prefixes: [saintly.id], suffixes: [stab.id] }, 'invcap dyel/8', 'a Saintly cap of Stability: the suffix first');
  eq({ ...plainCap, rarity: 'magic', quality: 'magic', prefixes: [saintly.id], suffixes: [skill.id] }, 'invcap dgld/8', 'a Saintly cap of Skill: the prefix, the suffix having none');
  eq({ ...plainCap, rarity: 'rare', quality: 'rare', prefixes: [saintly.id], suffixes: [skill.id] }, 'invcap dgld/8', 'a rare cap the same');
  // crafted items aren't magic or rare to ITEMS_GetColor: their affixes colour nothing
  eq({ ...plainCap, rarity: 'crafted', quality: 'crafted', prefixes: [saintly.id], suffixes: [stab.id] }, 'invcap', 'a crafted cap');
  // a base whose InvTrans is 0 shifts nothing: a shrunken head
  check(!D2_BASES.ne1.invTrans, `ne1's InvTrans: ${D2_BASES.ne1.invTrans}`);
  eq({ ...createItem('ne1'), rarity: 'magic', quality: 'magic', suffixes: [stab.id] }, D2_BASES.ne1.inv, 'a magic shrunken head of Stability (InvTrans 0)');

  // ── a normal item: a gem in its first socket colours it, a rune doesn't; the automagic row ──
  const sword = { ...createItem('lsd', 'normal', 30), sockets: 2 };
  const ruby = D2X_GEMS.find((g) => g.id === 'gfr');
  eq({ ...sword, socketed: ['gfr', 'r01'] }, `invlsd ${ruby.color}/2`, 'a long sword with a flawed ruby first');
  eq({ ...sword, socketed: ['r01', 'gfr'] }, 'invlsd', 'a long sword with a rune first');
  eq({ ...sword, rarity: 'runeword', quality: 'normal', socketed: ['r01', 'r02'] }, 'invlsd', 'a runeword of runes');
  const autoCol = D2X_AUTOMAGIC.find((a) => a.color);
  eq({ ...createItem('cap'), autoAffix: autoCol.id }, `invcap ${autoCol.color}/8`, 'a cap with a coloured automagic row');

  // ── variants: rolled when made, kept by the save, the same after a reload; an older item's from its uid ──
  const ringLooks = D2X_ITEM_TYPES.ring.invGfx;
  check(ringLooks?.length === 5 && D2X_ITEM_TYPES.amul.invGfx?.length === 3 && D2X_ITEM_TYPES.jewl.invGfx?.length === 6 && D2X_ITEM_TYPES.scha.invGfx?.join() === 'invch1,invch4,invch7', 'the types\' looks: rings 5, amulets 3, jewels 6, small charms invch1/4/7');
  const rings = Array.from({ length: 40 }, () => createItem('rin', 'magic', 20));
  check(rings.every((r) => Number.isInteger(r.gfx) && r.gfx >= 0 && r.gfx < 5), `rings made without a look: ${rings.map((r) => r.gfx).join()}`);
  check(new Set(rings.map((r) => P.pictureOf(r))).size === 5, `40 rings show ${new Set(rings.map((r) => P.pictureOf(r))).size} of the 5 looks`);
  check(rings.every((r) => P.pictureOf(r) === ringLooks[r.gfx]), 'a ring shows the look it rolled');
  const old = { ...createItem('amu', 'magic', 20) };
  delete old.gfx;
  const nag = unique('Nagelring');
  const nagel = createItem('rin', 'unique', 20, { row: nag.id });
  check(!nag.inv && ringLooks.includes(P.pictureOf(nagel)), `Nagelring names no picture: its ring look (${P.pictureOf(nagel)})`);
  // through a real save and a reload
  localStorage.clear();
  save.setSlot(0);
  const p = new Player({ x: 0, z: 0 });
  const kept = [...rings.slice(0, 12), old, nagel, createItem('jew', 'magic', 30), createItem('cm1', 'magic', 30), createItem('cm3', 'magic', 30)];
  for (const it of kept) check(p.inventory.add(it) || p.stash.add(it), `no room for ${it.baseId}`);
  const before = Object.fromEntries(kept.map((it) => [it.uid, P.pictureOf(it)]));
  check(save.writeSave(p, CAMP_AREA), 'the hero wasn\'t written');
  for (let n = 0; n < 2; n++) {
    const again = save.loadSave();
    const items = [...again.player.inventory.items, ...again.player.stash.items].map((x) => x.item);
    for (const [uid, pic] of Object.entries(before)) {
      const it = items.find((x) => x.uid === uid);
      check(it && P.pictureOf(it) === pic, `reload ${n + 1}: ${it?.baseId ?? uid} shows ${it && P.pictureOf(it)}, was ${pic}`);
    }
    save.writeSave(again.player, CAMP_AREA);
  }
  check(P.pictureOf(structuredClone(old)) === P.pictureOf(old) && P.pictureOf(JSON.parse(JSON.stringify(old))) === P.pictureOf(old), 'an amulet from before keeps its look copied');

  // ── every picture an item can show is painted and listed, and every listed one has both files ──
  const can = new Set();
  for (const b of Object.values(D2_BASES)) {
    for (const f of D2X_ITEM_TYPES[b.type]?.invGfx ?? [b.inv]) can.add(f);
    if (b.invUnique && D2X_UNIQUES.some((u) => u.code === b.code && !u.inv)) can.add(b.invUnique);
    if (b.invSet && D2X_SET_ITEMS.some((s) => s.code === b.code)) can.add(b.invSet);
  }
  for (const u of D2X_UNIQUES) if (u.inv) can.add(u.inv);
  // the quest items' and such with no picture painted keep the drawn icon: count them
  const unpainted = [...can].filter((f) => !ITEM_PICTURES[f]);
  check(unpainted.length === 0, `pictures an item can show that aren't painted: ${unpainted.join(' ')}`);
  const dir = path.join(root, 'public/icons/items');
  for (const f of Object.keys(ITEM_PICTURES)) for (const n of [`${f}.webp`, `${f}.1x.webp`]) check(fs.existsSync(path.join(dir, n)), `src/data/itempics.ts lists ${f}, but ${n} is missing`);
  check(Object.keys(ITEM_PICTURES).length === 400, `${Object.keys(ITEM_PICTURES).length} pictures listed, not 400`);

  // ── the colours: every one an item can take has a ramp; the remap is colours.py's ──
  const colours = new Set([...D2X_PREFIXES, ...D2X_SUFFIXES, ...D2X_AUTOMAGIC].map((a) => a.color).concat(D2X_UNIQUES.map((u) => u.invColor), D2X_SET_ITEMS.map((s) => s.invColor), D2X_GEMS.map((g) => g.color)).filter(Boolean));
  for (const c of colours) check(recolourPixels(new Uint8ClampedArray([128, 128, 128, 255]), c, 2), `no ramp for ${c}`);
  check(rangesOf(0) === null && rangesOf(2)?.brown === false && rangesOf(5)?.brown && rangesOf(8)?.brown, 'InvTrans 0 none, 2 grey, 5 and 8 grey and brown');
  for (const [k, want] of Object.entries(PY_OUT)) {
    const [c, inv] = k.split('/');
    const px = new Uint8ClampedArray(PY_IN.flat());
    recolourPixels(px, c, +inv);
    // a clear pixel is left as it was (colours.py shifts it too, unseen)
    const off = want.flat().map((v, i) => (PY_IN[i >> 2][3] === 0 ? Math.abs(PY_IN[i >> 2][i & 3] - px[i]) : Math.abs(v - px[i])));
    check(Math.max(...off) <= 1, `${k}: the remap is off colours.py's by ${Math.max(...off)} (${[...px].join()})`);
  }

  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`  tiers share a picture; own and column pictures for uniques and set items; colours by suffix, prefix, invtransform, gem; ${kept.length} variants kept through 2 reloads; ${can.size} pictures an item can show, all painted; ${colours.size} colours, the remap within 1 of colours.py`);
};
