import { randInt } from '../core/math';
import { D2_CUBE } from '../data/d2/cube';
import type { CubeSpec, D2Recipe } from '../data/d2/types';
import { ITEM_BASES, categoryOf, itypeOf, itypeSet } from '../data/items';
import { GEMS } from '../data/legendary';
import { d2Base } from './d2/bases';
import { maxSockets } from './d2/quality';
import type { Grid } from './grid';
import { pickBaseOfType } from './gen';
import { baseOf, displayName, itemReqLvl, qualityOf, type Item } from './item';
import { addCraftProps, makeItem, makeMagicWith, upgradeTo } from './make';

/** the cube's 3×4 space */
export const CUBE_W = 3;
export const CUBE_H = 4;

const GEM_GRADE: Record<string, number> = { gem0: 0, gem1: 1, gem2: 2, gem3: 3, gem4: 4 };
const GEM_KIND: Record<string, string> = { gema: 'amethyst', gemt: 'topaz', gems: 'sapphire', geme: 'emerald', gemr: 'ruby', gemd: 'diamond', gemz: 'skull' };
const GEM_BY_ID = Object.fromEntries(GEMS.map((g) => [g.id, g]));

/** does an item fit one ingredient of a recipe */
function fits(spec: CubeSpec, item: Item): boolean {
  const b = baseOf(item);
  const w = spec.what;
  let ok: boolean;
  if (w === 'any') ok = categoryOf(b.type) !== null;
  else if (w in GEM_GRADE) ok = GEM_BY_ID[b.id]?.grade === GEM_GRADE[w];
  else if (w in GEM_KIND) ok = GEM_BY_ID[b.id]?.gem === GEM_KIND[w];
  else if (ITEM_BASES[w]) ok = item.baseId === w;
  else ok = itypeSet(itypeOf(b)).has(w);
  if (!ok) return false;
  // qualities as D2 has them: a runeword is its base item's quality, but no recipe takes one
  if (item.rarity === 'runeword' && (spec.nor || spec.mag || spec.rar || spec.uni || spec.set)) return false;
  const q = qualityOf(item);
  if (spec.nor && q !== 'normal') return false;
  if (spec.mag && q !== 'magic') return false;
  if (spec.rar && q !== 'rare') return false;
  if (spec.uni && q !== 'unique') return false;
  if (spec.set && q !== 'set') return false;
  // normal / exceptional / elite: only bases that come in all three
  if ((spec.bas || spec.exc || spec.eli) && !b.tiers) return false;
  if (spec.bas && b.tier !== 0) return false;
  if (spec.exc && b.tier !== 1) return false;
  if (spec.eli && b.tier !== 2) return false;
  if (spec.sock === true && item.sockets === 0) return false;
  if (spec.nos && item.sockets > 0) return false;
  return true;
}

/** the items, matched one-for-one to the recipe's ingredients (nothing over, nothing missing) */
function assign(recipe: D2Recipe, items: Item[]): Item[] | null {
  const slots: CubeSpec[] = recipe.inputs.flatMap((s) => Array.from({ length: s.qty }, () => s));
  if (slots.length !== items.length) return null;
  const used = new Array(items.length).fill(false);
  const out: Item[] = [];
  const go = (i: number): boolean => {
    if (i === slots.length) return true;
    for (let k = 0; k < items.length; k++) {
      if (used[k] || !fits(slots[i], items[k])) continue;
      used[k] = true;
      out[i] = items[k];
      if (go(i + 1)) return true;
      used[k] = false;
    }
    return false;
  };
  return go(0) ? out : null;
}

export interface TransmuteResult {
  ok: boolean;
  message: string;
}

/**
 * Diablo II's Horadric Cube: the contents must be exactly one recipe's ingredients. Recipes come
 * from its CubeMain.txt (the ones this game has the items for), checked in the game's order.
 */
export function transmute(cube: Grid, clvl: number): TransmuteResult {
  const items = cube.items.map((p) => p.item);
  if (!items.length) return { ok: false, message: '魔盒是空的' };
  for (const recipe of D2_CUBE) {
    const matched = assign(recipe, items);
    if (!matched) continue;
    const results = craft(recipe, matched, clvl);
    if (!results) continue;
    for (const it of items) cube.remove(it);
    for (const r of results) cube.add(r);
    return { ok: true, message: `转化成功：${results.map((r) => displayName(r)).join('、')}` };
  }
  return { ok: false, message: '无法转化：魔盒里的东西对不上任何配方' };
}

/** the main item of a recipe: the first ingredient that is equipment */
function mainItem(recipe: D2Recipe, matched: Item[]): Item | undefined {
  let i = 0;
  for (const s of recipe.inputs) {
    for (let k = 0; k < s.qty; k++, i++) if (categoryOf(baseOf(matched[i]).type)) return matched[i];
  }
  return undefined;
}

function outLevel(recipe: D2Recipe, main: Item | undefined, clvl: number): number {
  const lvl = (recipe.lvl ?? 0) + Math.floor(((recipe.plvl ?? 0) * clvl) / 100) + Math.floor(((recipe.ilvl ?? 0) * (main?.ilvl ?? 0)) / 100);
  return Math.max(1, Math.min(99, lvl || main?.ilvl || clvl));
}

function craft(recipe: D2Recipe, matched: Item[], clvl: number): Item[] | null {
  const out = recipe.output;
  const main = mainItem(recipe, matched);
  const w = out.what;
  const sockMod = recipe.mods?.find((m) => m.c === 'sock');

  // change the item in the cube: add sockets, or upgrade it to exceptional / elite (make.ts upgradeTo),
  // the recipe's level requirement going on as a crafted property
  if (w === 'useitem') {
    if (!main) return null;
    const b = baseOf(main);
    if (out.exc || out.eli) {
      const to = b.tiers?.[out.exc ? 1 : 2];
      if (!to || !ITEM_BASES[to]) return null;
      upgradeTo(main, to);
    }
    if (sockMod) {
      // as many as the base takes at its item level (D2 caps sockets by difficulty only on drops)
      const cap = maxSockets(d2Base(main.baseId), main.ilvl, 2);
      if (cap <= 0) return null;
      main.sockets = randInt(1, cap);
    }
    addCraftProps(main, recipe.mods ?? []);
    // the level it needs as made: a D2 item's by its rows, the levelreq among them; an item from
    // before them keeps its own (item.ts itemReqLvl), which the levelreq raises as it raises the rows'
    const add = (recipe.mods ?? []).filter((m) => m.c === 'levelreq').reduce((s, m) => s + m.min, 0);
    const old = main.mods.length > 0 || main.quality === undefined;
    main.reqLvl = old ? Math.max(main.reqLvl, ITEM_BASES[main.baseId].reqLvl ?? 1) + add : itemReqLvl(main);
    main.name = displayName(main);
    return [main];
  }

  // a new item: of the same base, or of a type, or a set one
  let baseId: string | undefined;
  const ilvl = outLevel(recipe, main, clvl);
  if (w === 'usetype') baseId = main?.baseId;
  else if (ITEM_BASES[w]) baseId = w;
  else baseId = pickBaseOfType(w, ilvl)?.id;
  if (!baseId) return null;
  // what it makes is made as D2 makes it, identified; pre= and suf= name a MagicPrefix / MagicSuffix row.
  // An output without the eth flag is never ethereal and one without sock gets no sockets of its
  // own (PlrTrade.cpp:779-795): the game's recipes have neither flag (tools/d2-import.mjs leaves
  // the eth ones out), their sockets come from the recipe's sock mod below
  const spec = { code: baseId, ilvl, identified: true, noEth: true, noSockets: true };
  let item: Item;
  if (out.pre !== undefined || out.suf !== undefined) {
    const kind = out.pre !== undefined ? 'prefix' : 'suffix';
    try {
      item = makeMagicWith(spec, kind, (out.pre ?? out.suf)!);
    } catch {
      return null;
    }
  } else item = makeItem({ ...spec, quality: out.rar ? 'rare' : out.mag ? 'magic' : 'normal' });
  if (sockMod) item.sockets = Math.min(baseOf(item).maxSockets ?? 0, randInt(sockMod.min, sockMod.max));
  addCraftProps(item, recipe.mods ?? []);
  return [item];
}
