import { CLASSES, type PlayerClass } from '../data/classes';
import { randInt, type P2 } from '../core/math';
import { categoryOf, ITEM_BASES, UNKNOWN_BASE, type Category } from '../data/items';
import { RUNEWORD_BY_ID, isOldRuneword, type OldRunewordId } from '../data/legendary';
import type { StatKey } from '../data/stats';
import { createItem } from '../items/gen';
import { isUnknown, type Item } from '../items/item';
import type { Grid, Placed } from '../items/grid';
import { Player, xpForLevel } from './player';
import { WILD_MAPS } from '../world/levelgen';
import { CAMP_AREA, areaForDepth, depthForArea } from '../world/areas';

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

/** what the keys of slot n's backups start with */
function backupPrefix(n: number): string {
  return `${BASE_KEY}-backup-${dev ? 'dev' : n}-`;
}

/** where a slot's save is copied before it is migrated from the version `tag` (versionTag) */
function backupKey(n: number, tag: string): string {
  return backupPrefix(n) + tag;
}

/** the keys of slot n's backups */
function backupsOf(n: number): string[] {
  const pre = backupPrefix(n);
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(pre)) out.push(k);
  }
  return out;
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

// ───────────────────────── the save, version 4 ─────────────────────────
// Every field the coming work needs, unset or empty until used, so the lines built side by side
// share one format. What this build doesn't play yet is written back as it was loaded.

/** what writeSave stamps on a save */
const SAVE_V = 4;

/** 0 normal, 1 nightmare, 2 hell */
export type Difficulty = 0 | 1 | 2;

/** what Diablo II keeps apart for each difficulty */
export interface DifficultySave {
  /** the areas whose waypoint has been touched, by area id (src/world/areas.ts) */
  waypoints: number[];
  /** each quest's progress, by quest key */
  quests: Record<string, number>;
}

/** the hired mercenary (Diablo II hireling.txt, its Version 100 rows) */
export interface MercSave {
  /** the hireling row it was hired from: its kind, act and difficulty */
  hire: number;
  /** its name, a row of its act's name list */
  name: number;
  level: number;
  xp: number;
  /** what it wears: a helm, body armour and a weapon */
  equipment: Partial<Record<'head' | 'body' | 'weapon', Item>>;
  /** life left; unset is full */
  life?: number;
  /** dead, it waits at the camp to be paid back to life */
  dead: boolean;
}

/** the body a hero leaves on dying, with all they wore, until they walk back over it */
export interface CorpseSave {
  area: number;
  pos: P2;
  difficulty: Difficulty;
  equipment: Player['equipment'];
}

/** how many of each line's migrations a save has had (MIGRATIONS): each line bumps only its own */
export interface MigrationCounts {
  items: number;
  world: number;
  skills: number;
}

export interface SaveV4 {
  v: 4;
  mig: MigrationCounts;
  name: string;
  cls: PlayerClass;
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
  cube: Placed[];
  cubeFound: boolean;
  /** items that fit nowhere, and ones this build doesn't know, waiting by the camp stash */
  unplaced: Item[];
  belt: Item[][];
  gold: number;
  stashGold: number;
  binds: (string | null)[];
  activeAura: string | null;
  /** the area the hero stood in (dead heroes resume in the camp) */
  area: number;
  /** the endless dungeon's deepest depth reached, in its depths (it goes when the dungeon does) */
  depthReached: number;
  /**
   * the seed the game in progress made its maps from (the seamless map's; unset until there is
   * one). As in Diablo II each new game makes the maps anew: the seed only carries one across a reload
   */
  worldSeed?: number;
  /** the difficulty being played, and the hardest one open */
  difficulty: Difficulty;
  unlocked: Difficulty;
  /** waypoints and quests in normal, nightmare and hell */
  progress: [DifficultySave, DifficultySave, DifficultySave];
  merc: MercSave | null;
  corpse: CorpseSave | null;
  /** the skills changed under the character: every skill point is handed back once */
  respec?: boolean;
  life?: number;
  mana?: number;
  time: number;
}

/**
 * Each line's migration steps: step i takes its count (SaveV4.mig) from i to i + 1. A step sees the
 * save in version 4's form and leaves unknown items alone. Loading doesn't touch version 4 items
 * otherwise: a base table change that saved items must follow (a reqLvl, say) ships as an items step
 */
export const MIGRATIONS: Record<keyof MigrationCounts, ((d: SaveV4) => void)[]> = { items: [], world: [], skills: [] };
const LINES = Object.keys(MIGRATIONS) as (keyof MigrationCounts)[];

/** a count for each line */
function counts(n: (line: keyof MigrationCounts) => number): MigrationCounts {
  const c = {} as MigrationCounts;
  for (const k of LINES) c[k] = n(k);
  return c;
}

/** the counts of a save with every migration this build has */
function migrationCounts(): MigrationCounts {
  return counts((k) => MIGRATIONS[k].length);
}

/** saves from before version 4, as far as loading them goes */
interface OldSave {
  /**
   * 3: depths count the wilderness outside the camp; 2: made with the Diablo II items; 1 (or none):
   * before them, or by their first release
   */
  v?: 1 | 2 | 3;
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
  cube?: Placed[];
  cubeFound?: boolean;
  unplaced?: Item[];
  belt: Item[][];
  gold: number;
  stashGold: number;
  binds: (string | null)[];
  activeAura: string | null;
  depthReached: number;
  /** depths with a waypoint touched */
  waypoints: number[];
  /** floor the player was on (0 = town); dead players resume in town */
  depth?: number;
  life?: number;
  mana?: number;
  time: number;
}

/** a save from a newer build: a version or a line's migration count this build doesn't have */
function isNewer(d: { v?: number; mig?: Partial<MigrationCounts> }): boolean {
  if ((d.v ?? 1) > SAVE_V) return true;
  // a line this build doesn't have counts as newer once it has migrated anything
  return Object.entries(d.mig ?? {}).some(([k, n]) => (n ?? 0) > (k in MIGRATIONS ? MIGRATIONS[k as keyof MigrationCounts].length : 0));
}

/** a save that loading will migrate: an older version, or a line's migrations not all run on it */
function isBehind(d: { v?: number; mig?: Partial<MigrationCounts> }): boolean {
  return (d.v ?? 1) < SAVE_V || LINES.some((k) => (d.mig?.[k] ?? 0) < MIGRATIONS[k].length);
}

/** what a save is backed up as before its first migration: its version, and from 4 on its counts */
function versionTag(d: { v?: number; mig?: Partial<MigrationCounts> }): string {
  const v = d.v ?? 1;
  return v < 4 ? String(v) : [v, ...LINES.map((k) => d.mig?.[k] ?? 0)].join('.');
}

/** the backup `raw` is of the character `d` (by name and class) */
function sameHero(raw: string | null, d: { name?: string; cls?: string }): boolean {
  try {
    const b = JSON.parse(raw ?? '') as { name?: string; cls?: string };
    return b.name === d.name && (b.cls ?? 'paladin') === (d.cls ?? 'paladin');
  } catch {
    return false;
  }
}

/** a backup key's tag (versionTag) as numbers: the version, then from 4 on the counts */
function backupTag(k: string): number[] {
  return k.slice(backupPrefix(slot).length).split('.').map(Number);
}

/**
 * Copy the save aside before it is migrated from `tag`; false when storage won't take it. What stays
 * for good: every copy from before version 4 and the hero's first one. Of the rest, only the latest
 */
function backUp(raw: string, d: { name?: string; cls?: string }, tag: string): boolean {
  try {
    const k = backupKey(slot, tag);
    const had = localStorage.getItem(k);
    // the same hero's copy at this tag is from before the first time (an older build may have
    // written the save back since); another hero's is a deleted character's
    if (had === null || !sameHero(had, d)) localStorage.setItem(k, raw);
    const others = backupsOf(slot).filter((b) => b !== k);
    // a hero's version and counts only grow: its first copy has the smallest
    const age = (b: string) => backupTag(b).reduce((a, n) => a + n, 0);
    const first = others.filter((b) => sameHero(localStorage.getItem(b), d)).sort((a, b) => age(a) - age(b))[0];
    for (const b of others) if (backupTag(b)[0] >= 4 && b !== first) localStorage.removeItem(b);
    return true;
  } catch {
    return false;
  }
}

/** an empty difficulty: no waypoint but the camp's, no quests */
function newProgress(): DifficultySave {
  return { waypoints: [CAMP_AREA], quests: {} };
}

/** waypoints the game keeps by depth, as the areas a save keeps them by */
function waypointAreas(depths: number[]): number[] {
  return [...new Set(depths.map((d) => areaForDepth(d).id))];
}

/** a save from before version 4 as version 4 writes it, at counts of 0; its items found unknown go into `fresh` */
function upgrade(o: OldSave, fresh: Set<Item>): SaveV4 {
  const from = o.v ?? 1;
  // the first D2 release (version 1 with the cube) took the old runewords apart
  const opts: MigrateOpts = { v: from, damaged: from < 2 && 'cube' in o };
  migrateDepths(o);
  const d: SaveV4 & Partial<Pick<OldSave, 'depth' | 'waypoints'>> = {
    ...o,
    v: 4,
    mig: counts(() => 0),
    cls: o.cls ?? 'paladin',
    xp: migrateXp(o.level, o.xp),
    cube: o.cube ?? [],
    cubeFound: o.cubeFound ?? false,
    unplaced: o.unplaced ?? [],
    area: areaForDepth(o.depth ?? 0).id,
    depthReached: o.depthReached ?? 0,
    difficulty: 0,
    unlocked: 0,
    progress: [{ waypoints: waypointAreas(o.waypoints ?? [0]), quests: {} }, newProgress(), newProgress()],
    merc: null,
    corpse: null,
  };
  delete d.depth;
  delete d.waypoints;
  mapItems(d, (it) => {
    const m = upgradeItem(it, opts);
    if (m !== it && isUnknown(m)) fresh.add(m);
    return m;
  });
  return d;
}

/** run the migrations a version 4 save hasn't had yet, each line's own */
function runMigrations(d: SaveV4) {
  for (const k of LINES) {
    const steps = MIGRATIONS[k];
    for (let i = d.mig[k]; i < steps.length; i++) steps[i](d);
    d.mig[k] = Math.max(d.mig[k], steps.length);
  }
}

/** each of the hero's items replaced by what `f` makes of it (not the mercenary's or the corpse's: this build doesn't play them) */
function mapItems(d: SaveV4, f: (it: Item) => Item) {
  // a save is read as it is: anything may be in a place an item should be
  const m = (it: Item): Item => (it && typeof it === 'object' ? f(it) : it);
  const eq = d.equipment ?? {};
  for (const k of Object.keys(eq) as (keyof typeof eq)[]) eq[k] = m(eq[k]!);
  for (const list of [d.inventory, d.stash, d.cube]) {
    if (Array.isArray(list)) for (const pl of list) if (pl && typeof pl === 'object') pl.item = m(pl.item);
  }
  if (Array.isArray(d.unplaced)) d.unplaced = d.unplaced.map(m);
  if (Array.isArray(d.belt)) d.belt = d.belt.map((col) => (Array.isArray(col) ? col.map(m) : col));
}

/** what stands in for an item whose base this build doesn't know: the item as saved, and where in the save's history */
function unknownItem(it: Item, v: number, mig: MigrationCounts, damaged = false): Item {
  const u = createItem(UNKNOWN_BASE);
  u.raw = { v, mig: { ...mig }, item: it };
  if (damaged) u.raw.damaged = true;
  return u;
}

/**
 * A version 4 save's item before the steps run: one of a base this build doesn't know goes unknown
 * (into `fresh`), an unknown one comes back once known (`restore`). Anything else stays as saved,
 * a later build's runeword with its mods
 */
function knownItem(it: Item, d: SaveV4, restore: boolean, fresh: Set<Item>): Item {
  if (fresh.has(it)) return it;
  if (it.raw) return (restore && restored(it.raw, d)) || it;
  if (ITEM_BASES[it.baseId]) return it;
  const u = unknownItem(it, d.v, d.mig);
  fresh.add(u);
  return u;
}

/** the item an unknown item holds, caught up with the save's migrations; null while still unknown */
function restored(raw: NonNullable<Item['raw']>, d: SaveV4): Item | null {
  const held = raw.item as Item | null;
  if (raw.v > SAVE_V || !held || typeof held !== 'object' || held.raw) return null;
  // worked on as a copy: while it stays unknown, what it holds stays as it was saved
  const copy = structuredClone(held);
  const it = raw.v < 4 ? upgradeItem(copy, { v: raw.v, damaged: !!raw.damaged }) : copy;
  if (isUnknown(it) || !ITEM_BASES[it.baseId]) return null;
  const from = counts((k) => raw.mig?.[k] ?? 0);
  if (LINES.every((k) => from[k] >= d.mig[k])) return it;
  // the steps it missed, on a copy of the save holding only it
  const shell: SaveV4 = { ...structuredClone({ ...d, equipment: {}, inventory: [], stash: [], cube: [], unplaced: [], belt: [] }), unplaced: [it] };
  for (const k of LINES) for (let i = from[k]; i < Math.min(d.mig[k], MIGRATIONS[k].length); i++) MIGRATIONS[k][i](shell);
  // found again by its uid: a step may add items, or remake this one (not found, it stays unknown)
  let out: Item | null = null;
  mapItems(shell, (x) => {
    if (x === it || (it.uid && x.uid === it.uid)) out ??= x;
    return x;
  });
  return out;
}

/** the save each loaded character came from: what this build doesn't play yet is written back from it */
const loaded = new WeakMap<Player, SaveV4>();
/** characters from a save this build must not write: a newer build's, or one it couldn't back up */
const readOnly = new WeakSet<Player>();

/** save the character, standing in the area `area` (one dead is saved in the camp, where it comes back) */
export function writeSave(p: Player, area: number) {
  if (readOnly.has(p)) return;
  const KEY = keyFor(slot);
  // what this build doesn't play yet (difficulty, progress, the mercenary, the corpse) is written from
  // the save loaded: a line that moves one onto Player or Game must write it from there instead
  const prev = loaded.get(p);
  const difficulty = prev?.difficulty ?? 0;
  const progress: SaveV4['progress'] = prev?.progress ?? [newProgress(), newProgress(), newProgress()];
  // waypoints in areas this build doesn't have stay touched
  const others = (progress[difficulty]?.waypoints ?? []).filter((a) => depthForArea(a) === undefined);
  progress[difficulty] = { ...progress[difficulty], quests: progress[difficulty]?.quests ?? {}, waypoints: [...new Set([...others, ...waypointAreas(p.waypoints)])] };
  const data: SaveV4 = {
    ...prev,
    v: SAVE_V,
    mig: migrationCounts(),
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
    unplaced: p.unplaced,
    belt: p.belt,
    gold: p.gold,
    stashGold: p.stashGold,
    binds: p.binds,
    activeAura: p.activeAura,
    area: p.dead ? CAMP_AREA : area,
    depthReached: p.depthReached,
    difficulty,
    unlocked: prev?.unlocked ?? 0,
    progress,
    merc: prev?.merc ?? null,
    corpse: prev?.corpse ?? null,
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
/** old bases that need more strength / dexterity as D2 bases: what they needed before */
const OLD_REQ: Record<string, [number, number]> = { longsword: [40, 20], greatsword: [75, 0], greataxe: [84, 0], runeblade: [104, 72] };
type ModRange = [StatKey, number, number];
/** the old invented runewords (OLD_RUNEWORD_IDS): items made from them stay as they are, but can't be made any more */
const OLD_RUNEWORDS: { id: OldRunewordId; name: string; runes: string[]; cats: Category[]; reqLvl: number; mods: ModRange[] }[] = [
  { id: 'rw_emberoath', name: '余烬誓言', runes: ['r_ember', 'r_dawn'], cats: ['weapon'], reqLvl: 6,
    mods: [['dmgPct', 60, 80], ['fireMin', 8, 8], ['fireMax', 18, 18], ['ias', 20, 20], ['lifeSteal', 3, 3]] },
  { id: 'rw_longnight', name: '长夜', runes: ['r_frost', 'r_shadow', 'r_dawn'], cats: ['body'], reqLvl: 22,
    mods: [['defPct', 80, 100], ['resCold', 30, 30], ['frw', 20, 20], ['fhr', 30, 30], ['life', 40, 40]] },
  { id: 'rw_thunderwrath', name: '雷霆之怒', runes: ['r_thunder', 'r_blood', 'r_thunder'], cats: ['weapon'], reqLvl: 18,
    mods: [['dmgPct', 120, 160], ['lightMin', 5, 5], ['lightMax', 80, 80], ['ias', 30, 30], ['crit', 20, 20]] },
  { id: 'rw_ironheart', name: '钢铁之心', runes: ['r_stone', 'r_oath'], cats: ['shield', 'body'], reqLvl: 30,
    mods: [['defPct', 120, 150], ['resAll', 25, 25], ['block', 20, 20], ['skillsAll', 1, 1], ['vit', 15, 15]] },
  { id: 'rw_starlight', name: '星辉', runes: ['r_star', 'r_dawn'], cats: ['helm'], reqLvl: 26,
    mods: [['defPct', 60, 80], ['skillsAll', 1, 1], ['mf', 30, 40], ['lightRadius', 3, 3], ['mana', 40, 40]] },
  { id: 'rw_windrunner', name: '逐风', runes: ['r_wind', 'r_venom'], cats: ['weapon'], reqLvl: 16,
    mods: [['dmgPct', 80, 110], ['ias', 40, 40], ['poisonDmg', 120, 120], ['frw', 25, 25]] },
  { id: 'rw_abyssking', name: '冥王', runes: ['r_abyss', 'r_blood', 'r_oath', 'r_shadow'], cats: ['weapon'], reqLvl: 38,
    mods: [['dmgPct', 250, 320], ['skillsAll', 2, 2], ['pierceRes', 20, 25], ['lifeSteal', 8, 8], ['crit', 30, 30], ['ias', 30, 30]] },
];

interface MigrateOpts {
  /** the version of the save the item is from, 1 to 3 */
  v: number;
  /**
   * the first D2 release already loaded it and turned the old runewords back into plain items with
   * their runes in: make them runewords again
   */
  damaged: boolean;
}

/** an old runeword the first D2 release took apart: its (now D2) runes, in a base it fits */
function strippedRuneword(it: Item) {
  if ((it.rarity !== 'normal' && it.rarity !== 'superior') || !it.sockets || it.socketed.length !== it.sockets) return undefined;
  const cat = categoryOf(ITEM_BASES[it.baseId].type);
  return OLD_RUNEWORDS.find((rw) => cat && rw.cats.includes(cat) && rw.runes.length === it.socketed.length && rw.runes.every((r, i) => OLD_RUNES[r] === it.socketed[i]));
}

/** an item from a save before version 4 as version 4 has it, or unknown when this build lacks its base */
function upgradeItem(it: Item, opts: MigrateOpts): Item {
  const was = it.baseId;
  const id = OLD_BASES[was] ?? OLD_RUNES[was] ?? was;
  if (!ITEM_BASES[id]) return unknownItem(it, opts.v, counts(() => 0), opts.damaged);
  it.baseId = id;
  // a white item that changed base takes the new base's name
  if (was !== it.baseId && (it.rarity === 'normal' || it.rarity === 'superior')) {
    it.name = `${it.sockets > 0 ? '有孔的' : ''}${it.rarity === 'superior' ? '优质的' : ''}${ITEM_BASES[it.baseId].name}`;
  }
  // a rune or gem this build doesn't know stays in its socket, doing nothing
  it.socketed = (it.socketed ?? []).map((r) => (typeof r === 'string' ? (OLD_RUNES[r] ?? r) : r));
  const b = ITEM_BASES[it.baseId];
  if (b.code && (it.rarity === 'normal' || it.rarity === 'superior')) it.reqLvl = Math.max(b.reqLvl ?? 1, 1);
  const rw = opts.damaged ? strippedRuneword(it) : undefined;
  if (rw) {
    it.rarity = 'runeword';
    it.runewordId = rw.id;
    it.name = rw.name;
    it.mods = it.mods.concat(rw.mods.map(([stat, lo, hi]) => ({ stat, value: randInt(lo, hi) })));
    it.reqLvl = Math.max(it.reqLvl, rw.reqLvl);
  }
  // a runeword that exists in neither list goes back to the socketed white item it was made on
  if (it.runewordId && !RUNEWORD_BY_ID[it.runewordId] && !isOldRuneword(it.runewordId)) {
    delete it.runewordId;
    it.rarity = 'normal';
    it.mods = [];
    it.name = b.name;
  }
  // from a save before the D2 items: keep the requirements it had
  if (opts.v < 2 && !it.legacy && categoryOf(b.type)) {
    const req = OLD_REQ[was] ?? OLD_REQ[it.baseId];
    it.legacy = {
      lvl: it.reqLvl,
      str: Math.min(b.reqStr ?? 0, req?.[0] ?? Infinity),
      dex: Math.min(b.reqDex ?? 0, req?.[1] ?? Infinity),
      runes: it.socketed.length,
    };
  }
  return it;
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
function restore(grid: Grid, placed: Placed[] | undefined, overflow: Item[], keep: (it: Item | undefined) => Item | null) {
  const later: Item[] = [];
  for (const pl of placed ?? []) {
    const it = keep(pl?.item);
    if (!it) continue;
    if (grid.canPlace(it, pl.x, pl.y)) grid.place(it, pl.x, pl.y);
    else later.push(it);
  }
  for (const it of later) if (!grid.add(it)) overflow.push(it);
}

/** saves from before the wilderness: their dungeon floors move one level deeper, behind it */
function migrateDepths(d: OldSave) {
  if ((d.v ?? 1) >= 3) return;
  const shift = (n: number) => (n > 0 ? n + WILD_MAPS : n);
  d.depth = shift(d.depth ?? 0);
  d.depthReached = shift(d.depthReached ?? 0);
  d.waypoints = (d.waypoints ?? [0]).map(shift);
  d.v = 3;
}

/** the depth a save resumes at, whatever its version */
function savedDepth(d: SaveV4 | OldSave): number {
  if ((d.v ?? 1) >= 4) return depthForArea((d as SaveV4).area) ?? 0;
  migrateDepths(d as OldSave);
  return (d as OldSave).depth ?? 0;
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
      const d = JSON.parse(raw) as SaveV4 | OldSave;
      out.push({ slot: n, name: d.name, level: d.level, cls: d.cls && CLASSES[d.cls] ? d.cls : 'paladin', depth: savedDepth(d), time: d.time ?? 0 });
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

/** a character gone; its backups stay, the way back should a migration have broken it */
export function deleteSave(n: number) {
  try {
    localStorage.removeItem(keyFor(n));
  } catch {
    /* ignore */
  }
}

/**
 * The current slot's character, its save brought up to date. `readOnly` says why it is never written
 * back, when it mustn't be (a newer build's save, or one that couldn't be backed up)
 */
export function loadSave(): { player: Player; depth: number; readOnly: string | null } | null {
  let raw: string | null;
  let o: SaveV4 | OldSave;
  try {
    raw = localStorage.getItem(keyFor(slot));
    if (!raw) return null;
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  const newer = isNewer(o);
  let why: string | null = null;
  if (newer) why = '这个存档来自更新的版本：可以继续玩，但这次不会保存';
  // the save as it was, before anything here changes it
  else if (isBehind(o) && !backUp(raw, o, versionTag(o))) why = '旧存档没能备份（存储空间满了？）：可以继续玩，但这次不会保存';
  /** the items found unknown in this load, the ones that go by the stash */
  const fresh = new Set<Item>();
  const d = (o.v ?? 1) < 4 ? upgrade(o as OldSave, fresh) : (o as SaveV4);
  d.mig = { ...counts(() => 0), ...d.mig };
  // before the steps, which see only what this build knows
  mapItems(d, (it) => knownItem(it, d, !newer, fresh));
  if (d.v === SAVE_V) runMigrations(d);
  const p = new Player({ x: 0, z: 0 });
  // what no longer fits goes to the stash, then the inventory, then by the camp stash, as does an
  // item just found unknown: nothing is thrown away
  p.unplaced = [];
  /** an item of the save; null when there's none, or it was just found unknown and went by the stash */
  const keep = (it: Item | null | undefined): Item | null => {
    if (!it || typeof it !== 'object') return null;
    if (fresh.has(it)) {
      p.unplaced.push(it);
      return null;
    }
    return it;
  };
  p.name = d.name;
  p.cls = d.cls && CLASSES[d.cls] ? d.cls : 'paladin';
  p.level = d.level;
  p.xp = d.xp;
  p.base = d.base;
  p.statPoints = d.statPoints;
  p.skillPoints = d.skillPoints;
  p.skills = d.skills ?? {};
  p.equipment = {};
  for (const [slot, it] of Object.entries(d.equipment ?? {})) {
    const m = keep(it);
    if (m) p.equipment[slot as keyof Player['equipment']] = m;
  }
  const overflow: Item[] = [];
  restore(p.inventory, d.inventory, overflow, keep);
  restore(p.stash, d.stash, overflow, keep);
  restore(p.cube, d.cube, overflow, keep);
  for (const it of d.unplaced ?? []) {
    const m = keep(it);
    if (m) p.unplaced.push(m);
  }
  for (const it of overflow) if (!p.stash.add(it) && !p.inventory.add(it)) p.unplaced.push(it);
  p.cubeFound = d.cubeFound ?? false;
  p.belt = (d.belt ?? [[], [], [], []]).map((col) => col.map(keep).filter((it): it is Item => !!it));
  while (p.belt.length < 4) p.belt.push([]);
  p.gold = d.gold ?? 0;
  p.stashGold = d.stashGold ?? 0;
  p.binds = d.binds ?? ['attack', null, null, null, null, null];
  p.activeAura = d.activeAura ?? null;
  p.depthReached = d.depthReached ?? 0;
  const touched = (d.progress?.[d.difficulty ?? 0]?.waypoints ?? []).map(depthForArea).filter((n): n is number => n !== undefined);
  p.waypoints = touched.length ? [...new Set(touched)].sort((a, b) => a - b) : [0];
  p.markDirty();
  p.recalc();
  p.life = Math.min(p.d.maxLife, Math.max(1, d.life ?? p.d.maxLife));
  p.mana = Math.min(p.d.maxMana, Math.max(0, d.mana ?? p.d.maxMana));
  loaded.set(p, d);
  if (why) readOnly.add(p);
  return { player: p, depth: depthForArea(d.area) ?? 0, readOnly: why };
}
