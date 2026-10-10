import { CLASSES, type PlayerClass } from '../data/classes';
import { ITEM_BASES } from '../data/items';
import { RUNEWORD_BY_ID } from '../data/legendary';
import type { Item } from '../items/item';
import type { Grid, Placed } from '../items/grid';
import { Player, xpForLevel } from './player';

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
  /** the Horadric Cube's contents, and whether it has been found */
  cube?: Placed[];
  cubeFound?: boolean;
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
    cube: p.cube.items,
    cubeFound: p.cubeFound,
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

// ── saves from before the Diablo II items (2026-10) ──
/** weapon bases that are gone, to the D2 base nearest them */
const OLD_BASES: Record<string, string> = { runeblade: 'runesword', cleaver: 'militarypick', sacredmace: 'flangedmace' };
/** the twelve invented runes, to D2 runes of the same kind */
const OLD_RUNES: Record<string, string> = {
  r_dawn: 'r01', r_ember: 'r08', r_frost: 'r10', r_thunder: 'r09', r_venom: 'r07', r_stone: 'r05',
  r_wind: 'r13', r_blood: 'r11', r_shadow: 'r06', r_star: 'r12', r_oath: 'r17', r_abyss: 'r22',
};

/** bring an item from an older save up to date; false when it can't be */
function migrate(it: Item | undefined | null): it is Item {
  if (!it) return false;
  const was = it.baseId;
  it.baseId = OLD_BASES[it.baseId] ?? OLD_RUNES[it.baseId] ?? it.baseId;
  if (!ITEM_BASES[it.baseId]) return false;
  // a white item that changed base takes the new base's name
  if (was !== it.baseId && (it.rarity === 'normal' || it.rarity === 'superior')) {
    it.name = `${it.sockets > 0 ? '有孔的' : ''}${it.rarity === 'superior' ? '优质的' : ''}${ITEM_BASES[it.baseId].name}`;
  }
  it.socketed = (it.socketed ?? []).map((r) => OLD_RUNES[r] ?? r).filter((r) => !!ITEM_BASES[r]);
  // a runeword that no longer exists goes back to the socketed white item it was made on
  if (it.runewordId && !RUNEWORD_BY_ID[it.runewordId]) {
    delete it.runewordId;
    it.rarity = 'normal';
    it.mods = [];
    it.name = ITEM_BASES[it.baseId].name;
  }
  const b = ITEM_BASES[it.baseId];
  if (b.code && (it.rarity === 'normal' || it.rarity === 'superior')) it.reqLvl = Math.max(b.reqLvl ?? 1, 1);
  return true;
}

/**
 * Experience from before Diablo II's table (cap 60, a much flatter curve): keep how far the
 * character was through its level
 */
function migrateXp(level: number, xp: number): number {
  if (level <= 1 || xp >= xpForLevel(level)) return xp;
  const old = (L: number) => (L <= 1 ? 0 : Math.floor(60 * Math.pow(L - 1, 2.3) + 100 * (L - 1)));
  const f = Math.max(0, Math.min(0.999, (xp - old(level)) / Math.max(1, old(level + 1) - old(level))));
  return Math.floor(xpForLevel(level) + f * (xpForLevel(level + 1) - xpForLevel(level)));
}

/** put saved items back where they were, or anywhere they fit if their size changed */
function restore(grid: Grid, placed: Placed[] | undefined, overflow: Item[]) {
  const later: Item[] = [];
  for (const pl of placed ?? []) {
    if (!migrate(pl.item)) continue;
    if (grid.canPlace(pl.item, pl.x, pl.y)) grid.place(pl.item, pl.x, pl.y);
    else later.push(pl.item);
  }
  for (const it of later) if (!grid.add(it)) overflow.push(it);
}

function validItem(it: Item | undefined | null): it is Item {
  return migrate(it);
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
  p.xp = migrateXp(d.level, d.xp);
  p.base = d.base;
  p.statPoints = d.statPoints;
  p.skillPoints = d.skillPoints;
  p.skills = d.skills ?? {};
  p.equipment = {};
  for (const [slot, it] of Object.entries(d.equipment ?? {})) if (validItem(it)) p.equipment[slot as keyof Player['equipment']] = it;
  const overflow: Item[] = [];
  restore(p.inventory, d.inventory, overflow);
  restore(p.stash, d.stash, overflow);
  restore(p.cube, d.cube, overflow);
  // anything that no longer fits where it was goes to the stash, then the inventory
  for (const it of overflow) if (!p.stash.add(it)) p.inventory.add(it);
  p.cubeFound = d.cubeFound ?? false;
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
