import { randInt } from '../core/math';
import { D2_PREFIXES, D2_SUFFIXES } from '../data/d2/affixes';
import { D2_CUBE } from '../data/d2/cube';
import type { CubeSpec, D2Recipe } from '../data/d2/types';
import { ITEM_BASES, categoryOf, itypeOf, itypeSet, maxSocketsAt } from '../data/items';
import { GEMS } from '../data/legendary';
import type { Grid } from './grid';
import { createItem, magicWithAffix, pickBaseOfType } from './gen';
import { baseOf, type Item } from './item';

/** the cube's 3×4 space */
export const CUBE_W = 3;
export const CUBE_H = 4;

/** D2 codes this game names differently */
const ALIAS: Record<string, string> = { rvs: 'rejuv', rvl: 'rejuvfull', amu: 'amulet', rin: 'ring' };
const GEM_GRADE: Record<string, number> = { gem0: 0, gem1: 1, gem2: 2, gem3: 3, gem4: 4 };
const GEM_KIND: Record<string, string> = { gema: 'amethyst', gemt: 'topaz', gems: 'sapphire', geme: 'emerald', gemr: 'ruby', gemd: 'diamond', gemz: 'skull' };
const GEM_BY_ID = Object.fromEntries(GEMS.map((g) => [g.id, g]));

/** does an item fit one ingredient of a recipe */
function fits(spec: CubeSpec, item: Item): boolean {
  const b = baseOf(item);
  const w = ALIAS[spec.what] ?? spec.what;
  let ok: boolean;
  if (w === 'any') ok = categoryOf(b.type) !== null;
  else if (w === 'hpot') ok = b.type === 'potion' && !!b.heal;
  else if (w === 'mpot') ok = b.type === 'potion' && !!b.manaHeal;
  else if (w in GEM_GRADE) ok = GEM_BY_ID[b.id]?.grade === GEM_GRADE[w];
  else if (w in GEM_KIND) ok = GEM_BY_ID[b.id]?.gem === GEM_KIND[w];
  else if (ITEM_BASES[w]) ok = item.baseId === w;
  else ok = itypeSet(itypeOf(b)).has(w);
  if (!ok) return false;
  if (spec.nor && item.rarity !== 'normal') return false;
  if (spec.mag && item.rarity !== 'magic') return false;
  if (spec.rar && item.rarity !== 'rare') return false;
  if (spec.uni && item.rarity !== 'unique') return false;
  if (spec.set && item.rarity !== 'set') return false;
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
    return { ok: true, message: `转化成功：${results.map((r) => r.name).join('、')}` };
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
  const w = ALIAS[out.what] ?? out.what;
  const sockMod = recipe.mods?.find((m) => m.c === 'sock');
  const reqMod = recipe.mods?.find((m) => m.c === 'levelreq');

  // change the item in the cube: add sockets, or upgrade it to exceptional / elite
  if (w === 'useitem') {
    if (!main) return null;
    const b = baseOf(main);
    if (out.exc || out.eli) {
      const to = b.tiers?.[out.exc ? 1 : 2];
      if (!to || !ITEM_BASES[to]) return null;
      main.baseId = to;
      if (main.rarity === 'normal' || main.rarity === 'superior') main.name = ITEM_BASES[to].name;
      main.reqLvl = Math.max(ITEM_BASES[to].reqLvl ?? 1, main.reqLvl + (reqMod?.min ?? 0));
    }
    if (sockMod) {
      const cap = maxSocketsAt(b, main.ilvl);
      if (cap <= 0) return null;
      main.sockets = randInt(1, cap);
      main.name = `有孔的${b.name}`;
    }
    return [main];
  }

  // a new item: of the same base, or of a type, or a set one
  let baseId: string | undefined;
  const ilvl = outLevel(recipe, main, clvl);
  if (w === 'usetype') baseId = main?.baseId;
  else if (ITEM_BASES[w]) baseId = w;
  else baseId = pickBaseOfType(w, ilvl)?.id;
  if (!baseId) return null;
  const rarity = out.rar ? 'rare' : out.mag && !out.pre && !out.suf ? 'magic' : 'normal';
  const item = createItem(baseId, rarity, ilvl);
  if (out.pre !== undefined || out.suf !== undefined) {
    const kind = out.pre !== undefined ? 'prefix' : 'suffix';
    const a = (kind === 'prefix' ? D2_PREFIXES : D2_SUFFIXES).find((x) => x.idx === (out.pre ?? out.suf));
    if (!a) return null;
    magicWithAffix(item, kind, a);
  }
  if (sockMod) {
    const n = randInt(sockMod.min, sockMod.max);
    item.sockets = Math.min(baseOf(item).maxSockets ?? 0, n);
  }
  return [item];
}
