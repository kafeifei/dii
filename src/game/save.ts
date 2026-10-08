import { ITEM_BASES } from '../data/items';
import type { Item } from '../items/item';
import type { Placed } from '../items/grid';
import { Player } from './player';

const KEY = 'dii-save-v1';

interface SaveData {
  v: 1;
  name: string;
  level: number;
  xp: number;
  base: Player['base'];
  statPoints: number;
  skillPoints: number;
  skills: Record<string, number>;
  equipment: Player['equipment'];
  inventory: Placed[];
  stash: Placed[];
  belt: Item[][];
  gold: number;
  stashGold: number;
  binds: (string | null)[];
  activeAura: string | null;
  depthReached: number;
  waypoints: number[];
  time: number;
}

export function writeSave(p: Player) {
  const data: SaveData = {
    v: 1,
    name: p.name,
    level: p.level,
    xp: p.xp,
    base: p.base,
    statPoints: p.statPoints,
    skillPoints: p.skillPoints,
    skills: p.skills,
    equipment: p.equipment,
    inventory: p.inventory.items,
    stash: p.stash.items,
    belt: p.belt,
    gold: p.gold,
    stashGold: p.stashGold,
    binds: p.binds,
    activeAura: p.activeAura,
    depthReached: p.depthReached,
    waypoints: p.waypoints,
    time: Date.now(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
}

function validItem(it: Item | undefined | null): it is Item {
  return !!it && !!ITEM_BASES[it.baseId];
}

export function hasSave(): { name: string; level: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return { name: d.name, level: d.level };
  } catch {
    return null;
  }
}

export function deleteSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function loadSave(): Player | null {
  let d: SaveData;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  const p = new Player({ x: 0, z: 0 });
  p.name = d.name;
  p.level = d.level;
  p.xp = d.xp;
  p.base = d.base;
  p.statPoints = d.statPoints;
  p.skillPoints = d.skillPoints;
  p.skills = d.skills ?? {};
  p.equipment = {};
  for (const [slot, it] of Object.entries(d.equipment ?? {})) if (validItem(it)) p.equipment[slot as keyof Player['equipment']] = it;
  for (const pl of d.inventory ?? []) if (validItem(pl.item)) p.inventory.place(pl.item, pl.x, pl.y);
  for (const pl of d.stash ?? []) if (validItem(pl.item)) p.stash.place(pl.item, pl.x, pl.y);
  p.belt = (d.belt ?? [[], [], [], []]).map((col) => col.filter(validItem));
  while (p.belt.length < 4) p.belt.push([]);
  p.gold = d.gold ?? 0;
  p.stashGold = d.stashGold ?? 0;
  p.binds = d.binds ?? ['attack', null, null, null, null, null];
  p.activeAura = d.activeAura ?? null;
  p.depthReached = d.depthReached ?? 0;
  p.waypoints = d.waypoints ?? [0];
  p.markDirty();
  p.recalc();
  p.life = p.d.maxLife;
  p.mana = p.d.maxMana;
  return p;
}
