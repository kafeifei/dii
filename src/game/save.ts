import { CLASSES, type PlayerClass } from '../data/classes';
import { ITEM_BASES } from '../data/items';
import type { Item } from '../items/item';
import type { Placed } from '../items/grid';
import { Player } from './player';

const BASE_KEY = 'dii-save-v1';
export const MAX_SLOTS = 8;
/** remembers, per browser tab, that a run is in progress so a reload drops straight back in */
const SESSION_KEY = 'dii-in-game';
/** ...and which character it was */
const SLOT_KEY = 'dii-slot';

let dev = false;
/** the character slot the running game reads and writes */
let slot = (() => {
  try {
    const n = Number(sessionStorage.getItem(SLOT_KEY));
    return Number.isInteger(n) && n >= 0 && n < MAX_SLOTS ? n : 0;
  } catch {
    return 0;
  }
})();

function keyFor(n: number): string {
  if (dev) return 'dii-save-dev';
  // slot 0 keeps the key from before there were slots, so an old save shows up as the first character
  return n === 0 ? BASE_KEY : `${BASE_KEY}-${n}`;
}

/** ?dev runs (tests, bots) get their own slot so they never clobber the real saves */
export function useDevSlot() {
  dev = true;
}

export function setSlot(n: number) {
  slot = n;
  try {
    sessionStorage.setItem(SLOT_KEY, String(n));
  } catch {
    /* ignore */
  }
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
  /** missing in saves from before classes existed: those are paladins */
  cls?: PlayerClass;
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
  const KEY = keyFor(slot);
  const data: SaveData = {
    v: 1,
    name: p.name,
    cls: p.cls,
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

export interface SaveSummary {
  slot: number;
  name: string;
  level: number;
  cls: PlayerClass;
  depth: number;
  time: number;
}

/** every saved character, most recently played first */
export function listSaves(): SaveSummary[] {
  const out: SaveSummary[] = [];
  for (let n = 0; n < (dev ? 1 : MAX_SLOTS); n++) {
    try {
      const raw = localStorage.getItem(keyFor(n));
      if (!raw) continue;
      const d = JSON.parse(raw) as SaveData;
      out.push({ slot: n, name: d.name, level: d.level, cls: d.cls && CLASSES[d.cls] ? d.cls : 'paladin', depth: d.depth ?? 0, time: d.time ?? 0 });
    } catch {
      /* unreadable slot: treat as empty */
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

/** first empty slot, or null when all are taken */
export function freeSlot(): number | null {
  const used = new Set(listSaves().map((s) => s.slot));
  for (let n = 0; n < MAX_SLOTS; n++) if (!used.has(n)) return n;
  return null;
}

export function deleteSave(n: number) {
  try {
    localStorage.removeItem(keyFor(n));
  } catch {
    /* ignore */
  }
}

export function loadSave(): { player: Player; depth: number } | null {
  let d: SaveData;
  try {
    const raw = localStorage.getItem(keyFor(slot));
    if (!raw) return null;
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  const p = new Player({ x: 0, z: 0 });
  p.name = d.name;
  p.cls = d.cls && CLASSES[d.cls] ? d.cls : 'paladin';
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
