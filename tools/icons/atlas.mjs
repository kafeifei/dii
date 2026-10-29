// The atlases the item pictures ship in: tools/ai-icons.mjs packs every pick's 2x picture into
// public/icons/items/<atlas>.webp and writes where each one is to src/data/itempics.ts; the game
// fetches an atlas the first time a panel shows one of its pictures and cuts the picture out
// (src/ui/itempics.ts). An atlas holds one kind of thing, so a panel loads little: the belt's potions
// come without the runes, a sword without the shields, a unique's own picture without the other
// uniques'. On tools/scenarios/icons.mjs's phone stash page (44 pictures) an atlas per picture group
// would load about 1.6 MB, these about 0.9 MB.
//
// Everything is in cells of 68 px (the 2x picture: an inventory cell is 34 CSS px), so a picture's
// rect is exactly its cells and keeps the export's transparent margin (2 CSS px) around the object.

/** a cell of the 2x pictures, in px (src/ui/icons.ts CELL × 2) */
export const CELL = 68;
/** an atlas's longest side, in px: a kind of thing that wouldn't fit is split (ours are near 1000 px) */
export const MAX_SIDE = 4096;

/** the atlas of each item type (ItemTypes.txt codes, tools/icons/pictures.mjs GROUPS) */
const FAMILY = {
  swor: 'swords', knif: 'swords', tkni: 'swords', h2h: 'swords', h2h2: 'swords',
  axe: 'axes', taxe: 'axes',
  club: 'maces', mace: 'maces', hamm: 'maces',
  spea: 'spears', pole: 'spears', jave: 'spears', aspe: 'spears', ajav: 'spears',
  staf: 'staves', wand: 'staves', scep: 'staves', orb: 'staves',
  bow: 'bows', abow: 'bows', xbow: 'bows', tpot: 'bows', bowq: 'bows', xboq: 'bows',
  tors: 'armour',
  belt: 'gear', boot: 'gear', glov: 'gear',
  helm: 'helms', circ: 'helms', phlm: 'helms', pelt: 'helms', head: 'helms',
  shie: 'shields', ashd: 'shields',
  // the misc group by use: what is used up, what goes in a socket, what is worn; the rest (quest
  // items, body parts, the ear, the torch) is 'quest'
  hpot: 'potions', mpot: 'potions', rpot: 'potions', spot: 'potions', wpot: 'potions', apot: 'potions',
  elix: 'potions', herb: 'potions', scro: 'potions', book: 'potions', key: 'potions', gold: 'potions',
  gems: 'gems', geme: 'gems', gemr: 'gems', gema: 'gems', gemd: 'gems', gemt: 'gems', gemz: 'gems',
  rune: 'runes',
  ring: 'jewellery', amul: 'jewellery', jewl: 'jewellery', scha: 'jewellery', mcha: 'jewellery', lcha: 'jewellery',
};

/**
 * The atlas a picture is packed in: its kind of thing for a base or variant picture; a unique's own
 * picture with the other uniques' of its base's group (few are ever shown, each a single item); the
 * five set pictures together
 */
export function atlasOf(p) {
  if (p.kind === 'set') return 'sets';
  if (p.kind === 'unique') return p.group === 'blades' ? 'uniques-blades' : p.group === 'long' || p.group === 'ranged' ? 'uniques-long' : 'uniques-armour';
  return FAMILY[p.type] ?? (p.group === 'misc' ? 'quest' : p.group);
}

/** the items (in cells) placed on a skyline wc cells wide: each where it sits lowest, then leftmost */
function skyline(items, wc) {
  const top = new Array(wc).fill(0);
  const at = [];
  for (const it of items) {
    let bx = 0;
    let by = Infinity;
    for (let x = 0; x + it.w <= wc; x++) {
      let y = 0;
      for (let k = x; k < x + it.w; k++) y = Math.max(y, top[k]);
      if (y < by) [bx, by] = [x, y];
    }
    for (let k = bx; k < bx + it.w; k++) top[k] = by + it.h;
    at.push({ ...it, x: bx, y: by });
  }
  return { at, hc: Math.max(...top) };
}

/** the items packed at the width in cells that takes the least area (then the squarest), or null when none fits MAX_SIDE */
function packOne(items) {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const max = Math.floor(MAX_SIDE / CELL);
  const cells = sorted.reduce((s, it) => s + it.w * it.h, 0);
  const widest = Math.max(...sorted.map((it) => it.w));
  let best = null;
  for (let wc = Math.max(widest, Math.floor(Math.sqrt(cells)) - 4); wc <= Math.min(max, Math.ceil(Math.sqrt(cells)) + 8); wc++) {
    const { at, hc } = skyline(sorted, wc);
    if (hc > max) continue;
    const area = wc * hc;
    if (!best || area < best.area || (area === best.area && Math.abs(wc - hc) < Math.abs(best.wc - best.hc))) best = { at, wc, hc, area };
  }
  return best;
}

/**
 * One atlas's pictures packed: items [{ id, w, h }] in cells; returns [{ name, w, h, rects: { id:
 * [x, y, w, h] } }] in px. Deterministic (tallest first, then widest, then by id). A kind of thing
 * that won't fit MAX_SIDE a side is split in its given order (a family stays together) into
 * name-1, name-2 …, as few as fit.
 */
export function pack(name, items) {
  if (!items.length) return [];
  for (let parts = 1; parts <= items.length; parts++) {
    const per = Math.ceil(items.length / parts);
    const chunks = [];
    for (let i = 0; i < items.length; i += per) chunks.push(items.slice(i, i + per));
    const packed = chunks.map(packOne);
    if (packed.some((p) => !p)) continue;
    return packed.map((p, i) => ({
      name: chunks.length === 1 ? name : `${name}-${i + 1}`,
      w: p.wc * CELL,
      h: p.hc * CELL,
      rects: Object.fromEntries(p.at.map((it) => [it.id, [it.x * CELL, it.y * CELL, it.w * CELL, it.h * CELL]])),
    }));
  }
  throw new Error(`atlas ${name}: a picture is larger than ${MAX_SIDE} px`);
}
