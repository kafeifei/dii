import { ITEM_BASES } from '../data/items';
import type { Item } from '../items/item';
import type { Placed } from '../items/grid';
import { Player } from './player';

let KEY = 'dii-save-v1';
/** remembers, per browser tab, that a run is in progress so a reload drops straight back in */
const SESSION_KEY = 'dii-in-game';

/** ?dev runs (tests, bots) get their own slot so they never clobber the real save */
export function useDevSlot() {
  KEY = 'dii-save-dev';
}

export function markInGame(on: boolean) {
  try {
    if (on) sessionStorage.setItem(SESSION_KEY, '1');
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function wasInGame(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

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
  /** floor the player was on (0 = town); dead players resume in town */
  depth?: number;
  life?: number;
  mana?: number;
  time: number;
}

export function writeSave(p: Player, depth: number) {
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
    depth: p.dead ? 0 : depth,
    life: p.dead ? undefined : p.life,
    mana: p.dead ? undefined : p.mana,
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

export function loadSave(): { player: Player; depth: number } | null {
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
  p.life = Math.min(p.d.maxLife, Math.max(1, d.life ?? p.d.maxLife));
  p.mana = Math.min(p.d.maxMana, Math.max(0, d.mana ?? p.d.maxMana));
  return { player: p, depth: d.depth ?? 0 };
}
