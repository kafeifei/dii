import { CLASSES, type PlayerClass } from '../data/classes';
import { randInt, type P2 } from '../core/math';
import { categoryOf, ITEM_BASES, UNKNOWN_BASE, type Category } from '../data/items';
import { D2_RUNEWORDS } from '../data/d2/runewords';
import { isOldRuneword, type OldRunewordId } from '../data/legendary';
import type { StatKey } from '../data/stats';
import { uid } from '../core/math';
import { createItem } from '../items/gen';
import { isUnknown, type Item } from '../items/item';
import { townPortalFrom } from '../items/tomes';
import { OLD_BASES, toD2Item } from '../items/legacy';
import type { Grid, Placed } from '../items/grid';
import { changed, layOut, mergeStash, SHARED_PAGES, SharedStash, sameState, stashEntry, stashState, type StashEntry, type StashState } from '../items/stash';
import { Player, xpForLevel } from './player';
import { bodyItems, type Corpse } from './corpse';
import { loadQuestRecord, type QuestRecords } from './quests/record';
import { WILD_MAPS } from '../world/levelgen';
import { CAMP_AREA, areaForDepth, builtWaypoints, isBuilt } from '../world/areas';

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
  // ?dev's slots (?dev&slot=1, for two heroes in two tabs) have keys of their own; the first keeps the one it had
  if (dev) return n === 0 ? 'dii-save-dev' : `dii-save-dev-${n}`;
  // slot 0 keeps the key from before there were slots, so an old save shows up as the first character
  return n === 0 ? BASE_KEY : `${BASE_KEY}-${n}`;
}

/** what the keys of slot n's backups start with */
function backupPrefix(n: number): string {
  return `${BASE_KEY}-backup-${dev ? `dev${n || ''}` : n}-`;
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

/** ?dev runs (tests, bots) get slots of their own so they never clobber the real saves: slot `n` of them (?dev&slot=n) */
export function useDevSlot(n = 0) {
  dev = true;
  slot = Number.isInteger(n) && n >= 0 && n < MAX_SLOTS ? n : 0;
}

/** the character slot the running game reads and writes */
export function slotNow(): number {
  return slot;
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

// ───────────────────────── one tab per hero ─────────────────────────
// A hero is played in one tab at a time. Each tab writes its hero whole, so two tabs with one hero
// would each write over what the other moved to or from the shared pages, and an item would end up
// in neither. D2R's rule is the same: a character is in one game at a time, and logging in again
// drops the session before. The tab that opens a hero last has it (claimHero, before it reads the
// save); the tab that had it is told by a storage event, writes it once more if nothing has been
// written over it since (mayWriteLast), and then never again (heroTaken).

/** this page's own: made anew on each load, as a duplicated tab copies sessionStorage */
const TAB = uid('tab');
/** the save this tab has claimed, and its text as this tab last read or wrote it */
let held: string | null = null;
let lastText: string | null = null;

/** where the claim on a hero's save is kept: which tab has it */
function claimKey(key: string): string {
  return `dii-tab:${key}`;
}

/**
 * who plays a hero: the tab, when it last said it was there (heartbeat), and once it has given the
 * hero up, the tab it gave it to (handOver)
 */
interface Claim {
  tab: string;
  time: number;
  handedTo?: string;
}

/** how often a tab playing a hero says it is still there, and how long until a silent one counts as gone */
const BEAT_MS = 3000;
const GONE_MS = 10000;

function readClaim(key: string): Claim | null {
  try {
    const c = JSON.parse(localStorage.getItem(claimKey(key)) ?? 'null');
    return c && typeof c === 'object' && typeof c.tab === 'string' ? (c as Claim) : null;
  } catch {
    return null;
  }
}

function writeClaim(key: string, c: Claim) {
  try {
    localStorage.setItem(claimKey(key), JSON.stringify(c));
  } catch {
    /* storage unavailable: nothing is written either */
  }
}

/** The current slot's hero is this tab's from now on: a tab that had it stops writing it */
export function claimHero() {
  held = keyFor(slot);
  lastText = null;
  lastBeat = Date.now();
  writeClaim(held, { tab: TAB, time: lastBeat });
}

let lastBeat = 0;

/** While playing: the claim kept fresh, so a tab opening this hero knows this one is still here */
export function heartbeat() {
  if (!held || Date.now() - lastBeat < BEAT_MS) return;
  lastBeat = Date.now();
  const c = readClaim(held);
  if (c?.tab === TAB) writeClaim(held, { tab: TAB, time: lastBeat });
}

/** The page going away (after its last save): the claim let go, so its own reload needn't wait for it */
export function releaseHero() {
  if (!held) return;
  const c = readClaim(held);
  if (c?.tab === TAB) {
    try {
      localStorage.removeItem(claimKey(held));
    } catch {
      /* ignore */
    }
  }
}

/** whether slot n's hero is being played in another tab that is still there */
export function playedElsewhere(n: number): boolean {
  const c = readClaim(keyFor(n));
  return !!c && c.tab !== TAB && !c.handedTo && Date.now() - c.time < GONE_MS;
}

/**
 * The tab that had the hero, after its last write: it tells the tab that claimed it that it may read
 * the save now (waitHandOver)
 */
export function handOver() {
  if (!held) return;
  const c = readClaim(held);
  if (c && c.tab !== TAB) writeClaim(held, { ...c, handedTo: c.tab });
}

/**
 * After claiming a hero another tab was playing: until that tab has written it a last time and handed
 * it over, or `ms` went by (a tab frozen in the background, or closed without letting go). True when
 * it was handed over
 */
export async function waitHandOver(ms = 3000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (held && readClaim(held)?.handedTo === TAB) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

/** the key of the claim on the hero this tab plays, for its storage events; null before one is claimed */
export function heroClaimKey(): string | null {
  return held && claimKey(held);
}

/** whether another tab has claimed the hero this tab plays since this one did */
export function claimedElsewhere(): boolean {
  if (!held) return false;
  try {
    const c = JSON.parse(localStorage.getItem(claimKey(held)) ?? 'null');
    return !!c && typeof c === 'object' && c.tab !== TAB;
  } catch {
    return false;
  }
}

/**
 * Whether another tab has claimed hero `p` since this one did: then `p` is never written here again.
 * The claim is read each time, so a tab that missed the storage event (frozen in the background) stops too
 */
export function heroTaken(p: Player): boolean {
  if (!claimedElsewhere()) return false;
  readOnly.add(p);
  return true;
}

/**
 * Whether this tab may write its hero once more after another claimed it: only while the save is
 * still as this tab last read or wrote it, so nothing that tab wrote is written over (a reload
 * claims the hero as the page starts and reads it once the models are in, after this last write)
 */
export function mayWriteLast(): boolean {
  if (!held) return false;
  try {
    return localStorage.getItem(held) === lastText;
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
export const DIFFICULTIES: readonly Difficulty[] = [0, 1, 2];

/** what Diablo II keeps apart for each difficulty */
export interface DifficultySave {
  /** the areas whose waypoint has been touched, by area id (src/world/areas.ts) */
  waypoints: number[];
  /**
   * each quest's word of Diablo II's quest flags, by quest key (a1q1…: src/game/quests/record.ts),
   * as written in the game played; loading resets what belonged to that game (loadQuestRecord)
   */
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

/**
 * the body a hero leaves on dying, with all they wore, until they walk back over it: as Diablo II
 * saves one (PlrSave2.cpp:404-450), the first that holds items, without the experience on it;
 * loaded, it waits in the camp (src/game/corpse.ts)
 */
export interface CorpseSave {
  area: number;
  pos: P2;
  difficulty: Difficulty;
  equipment: Player['equipment'];
  /** the item that was on the cursor */
  items?: Item[];
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
  /**
   * the uid of the item of `unplaced` that was on the cursor, back on it as the game starts (D2 saves
   * the cursor's item so: PlrSave.cpp:100-110). Written among `unplaced`, so a build that doesn't know
   * this field still has the item, by the camp stash; unset when there was none
   */
  cursor?: string;
  belt: Item[][];
  gold: number;
  /** the personal page's gold (the shared pages' is theirs: SharedSave) */
  stashGold: number;
  binds: (string | null)[];
  activeAura: string | null;
  /**
   * the area the hero stood in (dead heroes are saved in the camp). A game anew starts in the camp;
   * a reload mid-game plays on here, if this build has the area (isBuilt)
   */
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
export const MIGRATIONS: Record<keyof MigrationCounts, ((d: SaveV4) => void)[]> = {
  items: [
    // 1: the Diablo II bases. Every item, the mercenary's and the corpse's too, moves from the game's
    // own base ids onto D2 codes (src/items/legacy.ts), keeping its mods, name, defense and, where
    // the D2 base asks more, its old requirements
    (d) => {
      mapItems(d, toD2Item);
      for (const eq of [d.merc?.equipment]) {
        if (!eq || typeof eq !== 'object') continue;
        for (const k of Object.keys(eq) as (keyof typeof eq)[]) {
          const it = eq[k];
          if (it && typeof it === 'object' && !isUnknown(it as Item)) eq[k] = toD2Item(it as Item) as never;
        }
      }
    },
    // 2: a town portal takes a scroll of town portal or a charge of its tome now; it was free on its
    // key (P). A hero whose bag holds neither is given a tome of town portal, once, so nobody is left
    // stranded out in the wilds by the change. Nothing is taken from anyone
    (d) => giveTownPortal(d),
  ],
  world: [],
  skills: [],
};

/**
 * Items migration 2: a tome of town portal with as many charges as its Misc.txt spawnstack (5)
 * into the bag of a hero with no town portal to read there (tomes.ts townPortalFrom): where it
 * fits, else by the camp stash with whatever else fits nowhere
 */
function giveTownPortal(d: SaveV4) {
  if (!Array.isArray(d.inventory)) d.inventory = [];
  const bag = new Player({ x: 0, z: 0 }).inventory;
  for (const pl of d.inventory) if (pl && typeof pl === 'object' && pl.item && typeof pl.item === 'object' && ITEM_BASES[pl.item.baseId]) bag.place(pl.item, pl.x, pl.y);
  if (townPortalFrom(bag)) return;
  const tome = createItem('tbk');
  tome.qty = ITEM_BASES.tbk.stack?.[2] ?? 5;
  const at = bag.findSpace(tome);
  if (at) d.inventory.push({ item: tome, x: at.x, y: at.y });
  else d.unplaced = [...(Array.isArray(d.unplaced) ? d.unplaced : []), tome];
}

/** the items migration that moved items onto D2 codes: saves before it name bases by the game's old ids */
const D2_BASES_STEP = 1;

/** whether a base id is one this build knows, in a save at items migration count `n` */
function knownBase(id: string, n: number): boolean {
  return n < D2_BASES_STEP ? !!OLD_BASES[id] : !!ITEM_BASES[id];
}
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
  return (d.v ?? 1) > SAVE_V || migNewer(d.mig);
}

/** migration counts past this build's: a line this build doesn't have counts once it has migrated anything */
function migNewer(mig: Partial<MigrationCounts> | undefined): boolean {
  return Object.entries(mig ?? {}).some(([k, n]) => (n ?? 0) > (k in MIGRATIONS ? MIGRATIONS[k as keyof MigrationCounts].length : 0));
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

/** the waypoints `p` can use in difficulty `d`, as last saved or loaded: the touched ones this build has (builtWaypoints) */
export function savedWaypoints(p: Player, d: Difficulty): number[] {
  return builtWaypoints(loaded.get(p)?.progress?.[d]?.waypoints ?? []);
}

/** an empty difficulty: no waypoint but the camp's, no quests */
function newProgress(): DifficultySave {
  return { waypoints: [CAMP_AREA], quests: {} };
}

/** an old save's waypoints, kept by depth, as the areas version 4 keeps them by */
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

/** each of the hero's items, the body's too, replaced by what `f` makes of it (not the mercenary's: this build doesn't play it) */
function mapItems(d: SaveV4, f: (it: Item) => Item) {
  // a save is read as it is: anything may be in a place an item should be
  const m = (it: Item): Item => (it && typeof it === 'object' ? f(it) : it);
  const body = d.corpse && typeof d.corpse === 'object' ? d.corpse : null;
  for (const eq of [d.equipment ?? {}, body?.equipment ?? {}]) {
    if (eq && typeof eq === 'object') for (const k of Object.keys(eq) as (keyof typeof eq)[]) eq[k] = m(eq[k]!);
  }
  if (body && Array.isArray(body.items)) body.items = body.items.map(m);
  for (const list of [d.inventory, d.stash, d.cube]) {
    if (Array.isArray(list)) for (const pl of list) if (pl && typeof pl === 'object') pl.item = m(pl.item);
  }
  if (Array.isArray(d.unplaced)) d.unplaced = d.unplaced.map(m);
  if (Array.isArray(d.belt)) d.belt = d.belt.map((col) => (Array.isArray(col) ? col.map(m) : col));
}

/** what stands in for an item whose base this build doesn't know: the item as saved, and where in the save's history */
function unknownItem(it: Item, v: number, mig: MigrationCounts, damaged = false): Item {
  const u: Item = { uid: uid('i'), baseId: UNKNOWN_BASE, rarity: 'normal', ilvl: 1, name: ITEM_BASES[UNKNOWN_BASE].name, mods: [], sockets: 0, socketed: [], reqLvl: 1 };
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
  if (knownBase(it.baseId, d.mig.items)) return it;
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
  const from = counts((k) => raw.mig?.[k] ?? 0);
  if (isUnknown(it) || !knownBase(it.baseId, from.items)) return null;
  if (LINES.every((k) => from[k] >= d.mig[k])) return it;
  // the steps it missed, on a copy of the save holding only it
  const shell: SaveV4 = { ...structuredClone({ ...d, equipment: {}, inventory: [], stash: [], cube: [], unplaced: [], belt: [], corpse: null }), unplaced: [it] };
  for (const k of LINES) for (let i = from[k]; i < Math.min(d.mig[k], MIGRATIONS[k].length); i++) MIGRATIONS[k][i](shell);
  // found again by its uid: a step may add items, or remake this one (not found, it stays unknown)
  let out: Item | null = null;
  mapItems(shell, (x) => {
    if (x === it || (it.uid && x.uid === it.uid)) out ??= x;
    return x;
  });
  return out;
}

/**
 * the save each character was loaded from, or last written as: what this build doesn't play yet is
 * written back from it, and so are the difficulties not being played
 */
const loaded = new WeakMap<Player, SaveV4>();
/** characters from a save this build must not write: a newer build's, or one it couldn't back up */
const readOnly = new WeakSet<Player>();

/** whether the character is never written this time (a newer build's save, or one that couldn't be backed up) */
export function isReadOnly(p: Player): boolean {
  return readOnly.has(p);
}

/**
 * Save the character, standing in the area `area` (one dead is saved in the camp, where it comes
 * back), in the game whose maps come from `worldSeed`, holding `cursor` on the cursor; `last`: this
 * tab's last write of a hero another tab has claimed (mayWriteLast). False when it wasn't written: a
 * character never written, one another tab has, or storage that refused it
 */
export function writeSave(p: Player, area: number, worldSeed?: number, cursor?: Item | null, last = false): boolean {
  if (readOnly.has(p)) return false;
  const KEY = keyFor(slot);
  // a hero no game here claimed (tests) is claimed now; one another tab has claimed since isn't written
  if (held !== KEY) claimHero();
  else if (!(last && mayWriteLast()) && heroTaken(p)) return false;
  // what this build doesn't play yet (the mercenary, the other difficulties' waypoints) is written
  // from the save loaded or last written: a line that moves one onto Player or Game must write it from there instead
  const prev = loaded.get(p);
  const difficulty = p.difficulty;
  // the quests from the hero, every difficulty's (the records keep the quests this build doesn't know)
  const progress = DIFFICULTIES.map((d) => ({ ...newProgress(), ...prev?.progress?.[d], quests: { ...p.quests[d] } })) as SaveV4['progress'];
  // waypoints in areas this build doesn't have (an old dungeon floor's, a later build's) stay touched
  const touched = Array.isArray(progress[difficulty].waypoints) ? progress[difficulty].waypoints : [];
  const usable = builtWaypoints(touched);
  const others = touched.filter((a) => !usable.includes(a));
  progress[difficulty].waypoints = [...new Set([...others, ...p.waypoints])];
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
    unplaced: cursor ? [...p.unplaced, cursor] : p.unplaced,
    cursor: cursor?.uid,
    belt: p.belt,
    gold: p.gold,
    stashGold: p.stashGold,
    binds: p.binds,
    activeAura: p.activeAura,
    area: p.dead ? CAMP_AREA : area,
    depthReached: p.depthReached,
    worldSeed: worldSeed ?? prev?.worldSeed,
    difficulty,
    // the one played is open, if only through the debug panel
    unlocked: Math.max(prev?.unlocked ?? 0, difficulty) as Difficulty,
    progress,
    merc: prev?.merc ?? null,
    corpse: corpseSave(p),
    life: p.dead ? undefined : p.life,
    mana: p.dead ? undefined : p.mana,
    time: Date.now(),
  };
  // a character never loaded keeps its other difficulties' progress from one write to the next
  loaded.set(p, data);
  try {
    const text = JSON.stringify(data);
    localStorage.setItem(KEY, text);
    lastText = text;
    return true;
  } catch {
    // storage unavailable, or full
    return false;
  }
}

/** the body the save keeps: the first that holds items, as Diablo II keeps one (PlrSave2.cpp:404-450) */
function corpseSave(p: Player): CorpseSave | null {
  const c = p.corpses.find((x) => bodyItems(x).length);
  if (!c) return null;
  const out: CorpseSave = { area: c.area, pos: c.pos ? { ...c.pos } : { x: 0, z: 0 }, difficulty: c.difficulty, equipment: c.equipment };
  if (c.items.length) out.items = c.items;
  return out;
}

// ── saves from before the Diablo II items (2026-10) ──
/**
 * The D2 runewords there were at items migration 0 (the first D2 import's, src/data/d2), the ones
 * since left out of the content scope included: an item made from one keeps it
 */
const OLD_D2_RUNEWORDS = new Set(D2_RUNEWORDS.map((r) => r.id));
/** weapon bases that were gone before the D2 bases, to the D2 weapon nearest them (old ids) */
const OLD_WEAPONS: Record<string, string> = { runeblade: 'runesword', cleaver: 'militarypick', sacredmace: 'flangedmace' };
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
  const cat = categoryOf(OLD_BASES[it.baseId].type);
  return OLD_RUNEWORDS.find((rw) => cat && rw.cats.includes(cat) && rw.runes.length === it.socketed.length && rw.runes.every((r, i) => OLD_RUNES[r] === it.socketed[i]));
}

/**
 * An item from a save before version 4 as version 4 had it at items migration 0 (the game's own
 * base ids, src/items/legacy.ts OLD_BASES), or unknown when there was no such base. Its names are
 * worked out from its base now (displayName), so a white item's isn't changed here
 */
function upgradeItem(it: Item, opts: MigrateOpts): Item {
  const was = it.baseId;
  const id = OLD_WEAPONS[was] ?? OLD_RUNES[was] ?? was;
  if (!OLD_BASES[id]) return unknownItem(it, opts.v, counts(() => 0), opts.damaged);
  it.baseId = id;
  // a rune or gem this build doesn't know stays in its socket, doing nothing
  it.socketed = (it.socketed ?? []).map((r) => (typeof r === 'string' ? (OLD_RUNES[r] ?? r) : r));
  const b = OLD_BASES[it.baseId];
  if (b.d2 && (it.rarity === 'normal' || it.rarity === 'superior')) it.reqLvl = Math.max(b.reqLvl ?? 1, 1);
  const rw = opts.damaged ? strippedRuneword(it) : undefined;
  if (rw) {
    it.rarity = 'runeword';
    it.runewordId = rw.id;
    it.name = rw.name;
    it.mods = it.mods.concat(rw.mods.map(([stat, lo, hi]) => ({ stat, value: randInt(lo, hi) })));
    it.reqLvl = Math.max(it.reqLvl, rw.reqLvl);
  }
  // a runeword that exists in neither list goes back to the socketed white item it was made on
  if (it.runewordId && !OLD_D2_RUNEWORDS.has(it.runewordId) && !isOldRuneword(it.runewordId)) {
    delete it.runewordId;
    it.rarity = 'normal';
    it.mods = [];
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

/** the area a save was made in, whatever its version */
function savedArea(d: SaveV4 | OldSave): number {
  if ((d.v ?? 1) >= 4) return (d as SaveV4).area;
  migrateDepths(d as OldSave);
  return areaForDepth((d as OldSave).depth ?? 0).id;
}

export interface SaveSummary {
  slot: number;
  name: string;
  level: number;
  cls: PlayerClass;
  /** where it was saved */
  area: number;
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
      out.push({ slot: n, name: d.name, level: d.level, cls: d.cls && CLASSES[d.cls] ? d.cls : 'paladin', area: savedArea(d), time: d.time ?? 0 });
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

/** a save loaded (loadSave) */
export interface Loaded {
  player: Player;
  /**
   * the area a reload mid-game plays on in: where it was saved if this build has it (isBuilt), else
   * the camp, as for every save from before version 4 (their depths were the endless dungeon's)
   */
  area: number;
  /** the seed of the game it was saved in, for a reload to play on in the same world */
  worldSeed?: number;
  /** why it is never written back, when it mustn't be (a newer build's save, or one that couldn't be backed up) */
  readOnly: string | null;
  /** the item that was on the cursor, to go back on it */
  cursor: Item | null;
}

/** The current slot's character, its save brought up to date */
export function loadSave(): Loaded | null {
  let raw: string | null;
  let o: SaveV4 | OldSave;
  try {
    raw = localStorage.getItem(keyFor(slot));
    if (!raw) return null;
    // as this tab read it: another tab claiming the hero later finds whether it was written over since (mayWriteLast)
    if (held === keyFor(slot)) lastText = raw;
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
  const old = (o.v ?? 1) < 4;
  const d = old ? upgrade(o as OldSave, fresh) : (o as SaveV4);
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
  // the item that was on the cursor lies among those by the stash (writeSave): back on the cursor from there
  const onCursor = typeof d.cursor === 'string' ? p.unplaced.findIndex((it) => it.uid === d.cursor && !isUnknown(it)) : -1;
  const cursor = onCursor >= 0 ? p.unplaced.splice(onCursor, 1)[0] : null;
  p.cubeFound = d.cubeFound ?? false;
  p.belt = (d.belt ?? [[], [], [], []]).map((col) => col.map(keep).filter((it): it is Item => !!it));
  while (p.belt.length < 4) p.belt.push([]);
  p.gold = d.gold ?? 0;
  p.stashGold = d.stashGold ?? 0;
  p.binds = d.binds ?? ['attack', null, null, null, null, null];
  p.activeAura = d.activeAura ?? null;
  p.depthReached = d.depthReached ?? 0;
  p.difficulty = DIFFICULTIES.includes(d.difficulty) ? d.difficulty : 0;
  p.waypoints = builtWaypoints(d.progress?.[p.difficulty]?.waypoints ?? []);
  // each difficulty's quest record, for a new game (D2 reads all three so: PlrSave2.cpp:1615-1621)
  p.quests = DIFFICULTIES.map((x) => loadQuestRecord(d.progress?.[x]?.quests)) as QuestRecords;
  // the body left on dying waits in the camp, with no experience on it (src/game/corpse.ts)
  p.corpses = [];
  const body = d.corpse && typeof d.corpse === 'object' ? d.corpse : null;
  if (body) {
    const c: Corpse = { level: null, pos: null, area: body.area ?? CAMP_AREA, difficulty: DIFFICULTIES.includes(body.difficulty) ? body.difficulty : p.difficulty, cls: p.cls, equipment: {}, items: [], xp: 0 };
    for (const [slot, it] of Object.entries(body.equipment ?? {})) {
      const m = keep(it);
      if (m) c.equipment[slot as keyof Player['equipment']] = m;
    }
    for (const it of Array.isArray(body.items) ? body.items : []) {
      const m = keep(it);
      if (m) c.items.push(m);
    }
    if (bodyItems(c).length) p.corpses.push(c);
  }
  // what follows from the level and attributes is worked out anew (Diablo II's CharStats: Player.recalc)
  p.markDirty();
  p.recalc();
  p.life = Math.min(p.d.maxLife, Math.max(1, d.life ?? p.d.maxLife));
  p.mana = Math.min(p.d.maxMana, Math.max(0, d.mana ?? p.d.maxMana));
  p.stamina = p.d.maxStamina;
  loaded.set(p, d);
  if (why) readOnly.add(p);
  return { player: p, area: !old && isBuilt(d.area) ? d.area : CAMP_AREA, worldSeed: typeof d.worldSeed === 'number' ? d.worldSeed : undefined, readOnly: why, cursor };
}

// ───────────────────────── the shared stash ─────────────────────────
// D2R's shared pages (src/items/stash.ts) are the player's, every hero's: a record of their own beside
// the heroes' saves, versioned and migrated as a save is (its items by MIGRATIONS' steps), backed up
// before it is, read as each game starts (loadShared) and written as it changes (syncShared). Two
// tabs of the game may both have it open: each reads it again before writing, and when the other
// wrote in between, puts its own changes on top of the other's (mergeStash) instead of over them.

const SHARED_KEY = 'dii-shared';
/** what syncShared stamps on the record: 2, each page's gold its own (1 had one pool for them all) */
const SHARED_V = 2;

/** the key the shared pages are kept under: ?dev runs keep their own, as they do a save */
export function sharedKey(): string {
  return dev ? 'dii-shared-dev' : SHARED_KEY;
}

/** what the keys of the record's backups start with; a migration's tag (its version and counts) follows */
function sharedBackupPrefix(): string {
  return `${SHARED_KEY}-backup-${dev ? 'dev-' : ''}`;
}

export interface SharedSave {
  v: typeof SHARED_V;
  mig: MigrationCounts;
  /** each shared page's items, where they lie */
  pages: Placed[][];
  /** each shared page's gold, as D2R keeps it (version 1 had one pool for them all: read as 共享 1's) */
  gold: number[];
  /** new with each write: a tab that last read another one knows it changed since */
  rev: string;
  /**
   * the rev of the record the writer had last read, its changes measured from: a tab whose own
   * later write the writer hadn't seen yet (storage reaches other tabs a moment late) merges from there
   */
  base?: string;
  time: number;
}

/** what this tab last read or wrote of the record: what its changes are measured from */
interface SharedSeen {
  /** the record's text as read or written (null: there was none) */
  raw: string | null;
  /** its rev */
  rev: string | null;
  state: StashState;
  /** loading changed it (migrated it, moved items off it): written at the next sync though nothing else changes */
  dirty: boolean;
  /** the last few records this tab read or wrote, by rev: the base of another tab's write made on one of them */
  known: Map<string, StashState>;
}
/** how many records a tab remembers */
const SHARED_KNOWN = 8;

/** the record `rev` as this tab read or wrote it, remembered */
function remember(seen: SharedSeen, rev: string | null, state: StashState) {
  if (!rev) return;
  seen.known.delete(rev);
  seen.known.set(rev, state);
  for (const k of seen.known.keys()) if (seen.known.size > SHARED_KNOWN) seen.known.delete(k);
}
const sharedSeen = new WeakMap<SharedStash, SharedSeen>();

/** the record as this build reads it */
interface SharedRead {
  /** each page's gold */
  gold: number[];
  rev: string | null;
  /** the rev the writer had last read */
  base: string | null;
  /** its items as this build has them, where they lay */
  entries: StashEntry[];
  /** a newer build's: never written */
  newer: boolean;
  /** reading changed it: migrations ran, an item became unknown or came back */
  changed: boolean;
  /** it needed backing up first and couldn't be */
  unbacked: boolean;
}

/**
 * The record's text as this build has it; null when it can't be read. Its items go through what a
 * save's do (knownItem, the migration steps) on a save holding them in its stash, in order: a step
 * replaces an item where it is and leaves the rest alone
 */
function readShared(raw: string): SharedRead | null {
  let o: Partial<SharedSave>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const v = typeof o.v === 'number' ? o.v : 1;
  const newer = v > SHARED_V || migNewer(o.mig);
  const behind = !newer && (v < SHARED_V || LINES.some((k) => (o.mig?.[k] ?? 0) < MIGRATIONS[k].length));
  const unbacked = behind && !backUpShared(raw, [v, ...LINES.map((k) => o.mig?.[k] ?? 0)].join('.'));
  const where: { page: number; x: number; y: number }[] = [];
  const stash: Placed[] = [];
  (Array.isArray(o.pages) ? o.pages : []).forEach((pg, page) => {
    for (const pl of Array.isArray(pg) ? pg : []) {
      if (!pl || typeof pl !== 'object' || !pl.item || typeof pl.item !== 'object') continue;
      stash.push({ item: pl.item, x: pl.x, y: pl.y });
      where.push({ page, x: Number(pl.x), y: Number(pl.y) });
    }
  });
  const d = { v: SAVE_V, mig: { ...counts(() => 0), ...o.mig }, equipment: {}, inventory: [], stash, cube: [], unplaced: [], belt: [], corpse: null, merc: null } as unknown as SaveV4;
  const before = stash.map((pl) => pl.item);
  const fresh = new Set<Item>();
  mapItems(d, (it) => knownItem(it, d, !newer && !unbacked, fresh));
  if (!newer && !unbacked) runMigrations(d);
  // read from the save after the steps, in case one made the list anew (in order, as mapItems does)
  const after = Array.isArray(d.stash) && d.stash.length === stash.length ? d.stash : stash;
  // version 1's one pool is 共享 1's now: D2R keeps gold by page (the version is behind, so it was backed up above)
  const g: unknown = o.gold;
  const gold = Array.isArray(g) ? g : [g];
  return {
    gold: Array.from({ length: SHARED_PAGES }, (_, i) => Math.max(0, Math.floor(Number(gold[i])) || 0)),
    rev: typeof o.rev === 'string' ? o.rev : null,
    base: typeof o.base === 'string' ? o.base : null,
    entries: after.map((pl, i) => stashEntry(pl.item, where[i].page, where[i].x, where[i].y)),
    newer,
    changed: behind || after.some((pl, i) => pl.item !== before[i]),
    unbacked,
  };
}

/**
 * Copy the record aside before it is migrated from `tag`; false when storage won't take it. The
 * first copy at a tag stays; of them all, the oldest and this one are kept
 */
function backUpShared(raw: string, tag: string): boolean {
  try {
    const pre = sharedBackupPrefix();
    const k = pre + tag;
    if (localStorage.getItem(k) === null) localStorage.setItem(k, raw);
    const all: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const b = localStorage.key(i);
      if (b?.startsWith(pre) && /^\d/.test(b.slice(pre.length))) all.push(b);
    }
    const age = (b: string) => b.slice(pre.length).split('.').reduce((a, n) => a + Number(n), 0);
    const first = all.sort((a, b) => age(a) - age(b))[0];
    for (const b of all) if (b !== first && b !== k) localStorage.removeItem(b);
    return true;
  } catch {
    return false;
  }
}

/** an unreadable record, kept aside as it is; false when storage won't take it */
function keepUnreadable(raw: string): boolean {
  try {
    localStorage.setItem(`${sharedBackupPrefix()}unreadable-${Date.now()}`, raw);
    return true;
  } catch {
    return false;
  }
}

/**
 * The shared pages as a game starts, for any hero in any difficulty. `locked` says why this time they
 * must not change (a hero who won't be saved). What fits on no page goes to `overflow`, for the hero
 * to find by the camp stash; `note` is what the player should be told
 */
export function loadShared(locked: string | null = null): { stash: SharedStash; overflow: Item[]; note: string | null } {
  const s = new SharedStash();
  const seen: SharedSeen = { raw: null, rev: null, state: stashState(s), dirty: false, known: new Map() };
  sharedSeen.set(s, seen);
  s.readOnly = locked;
  let raw: string | null;
  try {
    raw = localStorage.getItem(sharedKey());
  } catch {
    s.readOnly ??= '存储不可用：共享储物箱这次只能查看';
    return { stash: s, overflow: [], note: s.readOnly };
  }
  if (raw === null) return { stash: s, overflow: [], note: null };
  const r = readShared(raw);
  seen.raw = raw;
  if (!r) {
    // kept aside as it was, it is written over by the pages as they start, empty; if it can't be, it isn't
    if (keepUnreadable(raw)) {
      seen.dirty = !s.readOnly;
      return { stash: s, overflow: [], note: '共享储物箱的记录读不出来：已原样另存一份，这次从空的开始' };
    }
    s.readOnly ??= '共享储物箱的记录读不出来，也没能另存（存储空间满了？）：这次只能查看';
    return { stash: s, overflow: [], note: s.readOnly };
  }
  seen.rev = r.rev;
  if (r.newer) s.readOnly ??= '共享储物箱来自更新的版本：这次只能查看';
  else if (r.unbacked) s.readOnly ??= '共享储物箱没能备份（存储空间满了？）：这次只能查看';
  s.gold = r.gold;
  const overflow = layOut(s, r.entries);
  seen.state = stashState(s);
  // read-only, what fits nowhere stays in the record unseen; else it goes to the hero, out of the record at the next write
  if (s.readOnly) return { stash: s, overflow: [], note: s.readOnly === locked ? null : s.readOnly };
  for (const it of overflow) seen.state.entries.set(it.uid, stashEntry(it, -1, 0, 0));
  remember(seen, r.rev, seen.state);
  seen.dirty = r.changed || overflow.length > 0;
  return { stash: s, overflow, note: overflow.length ? `共享储物箱放不下的 ${overflow.length} 件物品放在了储物箱旁边` : null };
}

/** what syncShared did */
export interface SharedSync {
  /** another tab's changes came in: the pages hold something new */
  adopted: boolean;
  /** this tab's pages were written: the hero must be saved now too, or the write undone */
  wrote: boolean;
  /** items that fit on no page once both tabs' were laid out, for the hero */
  overflow: Item[];
  /** gold put in here that the pool had no room for once both tabs' was added, back to the hero */
  refund: number;
  /** this tab's changes couldn't be written (storage full): the hero mustn't be saved without them */
  failed: boolean;
  /** the record put back as it was before this write, for when the hero's save then fails */
  undo(): void;
}

/**
 * The shared pages in step with storage. The record is read again first: when another tab wrote it
 * since this one last read it, that tab's changes come in under this one's (mergeStash). Then, if
 * this tab's pages differ from the record, they are written.
 */
export function syncShared(s: SharedStash): SharedSync {
  const out: SharedSync = { adopted: false, wrote: false, overflow: [], refund: 0, failed: false, undo() {} };
  const seen = sharedSeen.get(s);
  if (!seen || s.readOnly) return out;
  const key = sharedKey();
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    out.failed = seen.dirty || !sameState(stashState(s), seen.state);
    return out;
  }
  let base = seen.state;
  if (raw !== seen.raw && raw !== null) {
    const r = readShared(raw);
    if (r?.newer || r?.unbacked) {
      // a newer build wrote it: this tab leaves it alone from now on; what was put in here since it
      // last wrote goes back to the hero, by the camp stash (what was taken out the record still has)
      s.readOnly = r.newer ? '共享储物箱被更新的版本改过了：这次只能查看' : '共享储物箱没能备份（存储空间满了？）：这次只能查看';
      const now = stashState(s);
      out.overflow = putSince(seen.state, now);
      out.refund = now.gold.reduce((n, g, i) => n + Math.max(0, g - (seen.state.gold[i] ?? 0)), 0);
      s.gold = r.gold;
      // what the record holds, to look at; what fits nowhere stays in it unseen
      layOut(s, r.entries);
      out.adopted = true;
      return out;
    }
    if (!r && !keepUnreadable(raw)) {
      out.failed = true;
      return out;
    }
    if (r) {
      const theirs: StashState = { entries: new Map(), gold: r.gold };
      for (const e of r.entries) {
        if (!e.item.uid || theirs.entries.has(e.item.uid)) e.item.uid = uid('i');
        theirs.entries.set(e.item.uid, e);
      }
      // measured from what that tab had read: the last record this one saw, or, when that tab wrote
      // before this one's last write reached it (storage gets to other tabs a moment late), the
      // record it had read
      const from = (r.base !== null && r.base !== seen.rev && seen.known.get(r.base)) || seen.state;
      const m = mergeStash(from, stashState(s), theirs);
      s.gold = m.gold;
      out.overflow = layOut(s, m.keep, m.mine);
      out.refund = m.refund;
      out.adopted = true;
      base = theirs;
      Object.assign(seen, { raw, rev: r.rev, state: theirs });
      remember(seen, r.rev, theirs);
      seen.dirty ||= r.changed;
    }
  }
  const now = stashState(s);
  if (raw === seen.raw && !seen.dirty && sameState(now, seen.state)) return out;
  const rec: SharedSave = { v: SHARED_V, mig: migrationCounts(), pages: s.pages.map((g) => g.items), gold: s.gold, rev: uid('s'), time: Date.now() };
  if (seen.rev) rec.base = seen.rev;
  const text = JSON.stringify(rec);
  try {
    localStorage.setItem(key, text);
  } catch {
    out.failed = true;
    return out;
  }
  const was = seen.rev;
  Object.assign(seen, { raw: text, rev: rec.rev, state: now, dirty: false });
  remember(seen, rec.rev, now);
  out.wrote = true;
  out.undo = () => {
    try {
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    } catch {
      /* it stays as written: the hero's next save catches up */
    }
    // measured from what is there again, this tab's changes are written at the next sync
    Object.assign(seen, { raw, rev: was, state: base, dirty: true });
    seen.known.delete(rec.rev);
  };
  return out;
}

/**
 * What this tab put in since `base`, and the items it changed since (a rune socketed…) as copies of
 * their own: for the hero, when the record can't take them
 */
function putSince(base: StashState, now: StashState): Item[] {
  const out: Item[] = [];
  for (const e of now.entries.values()) {
    const b = base.entries.get(e.item.uid);
    if (!b) out.push(e.item);
    // a mend alone isn't a change: the record has the item still
    else if (changed(e, b)) out.push({ ...e.item, uid: uid('i') });
  }
  return out;
}
