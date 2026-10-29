import type { Input } from '../core/input';
import { dist, type P2 } from '../core/math';
import type { Sfx } from '../audio/sfx';
import { heroLine, isNight, type HeroLine } from '../audio/sounds';
import { CLASSES, type PlayerClass } from '../data/classes';
import { SKILL_BY_ID } from '../data/skills';
import { newGameDrops, starterKit, type Drop } from '../items/gen';
import { CAMP_VENDORS, Store } from '../items/vendor';
import type { Item } from '../items/item';
import { SharedStash } from '../items/stash';
import type { Grid } from '../items/grid';
import type { DeathPenalty } from './d2/death';
import type { Finder } from './loot';
import { updateMonster } from './ai';
import { nullFx, type Fx } from './fx';
import type { Level } from './level';
import { Maps, newSeed } from './maps';
import type { Monster } from './monster';
import { GroundItem, WorldObject, spent } from './objects';
import { CHARGE_PREFIX, Player } from './player';
import { startCast, toggleAura, updatePlayer, type PlayerAction } from './playerctl';
import { celebrateLevelUp, killMonster, killPlayer, onProc, rollLoot, wake } from './kills';
import { updateMerc, type Friendly, type Merc } from './merc';
import { layOutCorpses, respawn } from './bodies';
import { interact } from './interact';
import { npcLeft, npcSpoke, npcTalk, refreshShop, talkTo } from './townsfolk';
import { castTownPortal, closePortals, enterArea, enterLevel, enterTrial, openTownPortal, readTownPortal, teleportWithin, travel, travelToArea, updateArea, walkExits, type Trip } from './travel';
import { autoBeltInsert, beltInsert, drink, drinkable, dropBlock, dropFromBag, dropItem, heldGrids, layOutUnplaced, moveStashGold, pickupGround, readHeld, refuseDrop, spawnDrops, stashBlock, useBelt, type Finds } from './items';
import { chargedBolts, clearCorpses, monstersAround, separate, updateAuras, updateBlasts, updateHammers, updateProjectiles } from './fight';
import type { StatKey } from '../data/stats';
import type { Elem } from '../data/monsters';
import type { Killer } from './actor';
import { claimedElsewhere, claimHero, handOver, heroTaken, isReadOnly, loadSave, loadShared, markInGame, mayWriteLast, neverWrite, playedElsewhere, reclaimHero, savedWaypoints, setSlot, slotNow, syncShared, waitHandOver, writeSave, writtenElsewhere, type Difficulty } from './save';
import { CAMP_AREA, trialFloor, type AreaDef } from '../world/areas';
import { Quests } from './quests/control';
import type { Topic } from './quests/quest';
import { Rifts } from './rift';

export interface GameHooks {
  message(text: string, color?: string, dur?: number): void;
  openPanel(kind: 'shop' | 'stash' | 'waypoint' | 'rift'): void;
  levelChanged(level: Level): void;
  /** the hero came into an area: on entering a level (prev is the last level's), or walking or teleporting into another */
  areaChanged(area: AreaDef, prev: AreaDef | null): void;
  /**
   * the hero jumped across the map without leaving it, coming `how` (a waypoint, a town portal,
   * respawning; null: a tools' jump): the view goes there at once, and by a way in what the area is
   * made of is wanted first (Renderer.jumped)
   */
  teleported(how?: Arrival | null): void;
  playerDied(): void;
  inventoryChanged(): void;
  getCursorItem(): Item | null;
  setCursorItem(item: Item | null): void;
  hoveredGroundId(): number | null;
  levelUp(): void;
  /**
   * a townsperson spoken to: their menu, after `opening`, a line a quest has them say at once
   * (Game.talkTo). Without it (the node tests) the merchant's shop opens, as before there were menus
   */
  npcMenu?(obj: WorldObject, opening: Topic | null): void;
  /** a quest moved on: the quest log has news */
  questsChanged?(): void;
  /**
   * another tab has this hero now: this one has handed it over and stops (Game.heroElsewhere), or, a
   * reload still loading it, never starts it (Game.resume); or another tab played it while this page
   * was away, and the hero here, out of date, stops (Game.outdated); `how` says what became of the play here
   */
  heroGone?(how: HandOver): void;
  /** whether the last save went into storage (false: it couldn't, and the player should know until one does) */
  saveState?(ok: boolean): void;
  /** a scroll of identify read from the belt: the next item clicked is identified with it (the bag's identify cursor) */
  identifyWith?(scroll: Item): void;
}

export interface Picker {
  screenToGround(x: number, y: number): P2 | null;
  pickMonster(x: number, y: number, list: Monster[]): Monster | null;
  pickObject(x: number, y: number, list: WorldObject[]): WorldObject | null;
}

/** how the hero comes to where they arrive (Game.enterArea) */
export type Arrival = 'start' | 'stairs' | 'waypoint' | 'portal' | 'respawn' | 'exit';

/**
 * What became of the play here as another tab took the hero (GameHooks.heroGone): `saved`, it is all
 * in what that tab reads (the last write went in, or that tab wrote first with nothing played here
 * since the last write that did); `unsaved`, it isn't (storage refused the last write, that tab wrote
 * first over play here since, or this build never writes this save); `unplayed`, a reload gave the
 * hero up while its models were still coming, before anything here was read or played (Game.resume);
 * `stale`, another tab opened the hero while this page was away (the back-forward cache, frozen in the
 * background), played it and let it go: its play is in the save, and the hero here, out of date, is
 * never written over it (Game.outdated)
 */
export type HandOver = 'saved' | 'unsaved' | 'unplayed' | 'stale';

/** seconds from one midnight to the next under the sky */
const DAY_LENGTH = 16 * 60;

/** the hero's life, as a share of its most, under which it says it's badly hurt: once, as it falls past */
const LOW_LIFE = 0.3;
/** it says so again only after its life has been back over this share, */
const LOW_LIFE_REARM = 0.5;
/** and this many seconds have gone by */
const LOW_LIFE_AGAIN = 30;

/** spells a dragged touch button lays on a spot of ground */
const AIM_SPOT = new Set(['meteor', 'blizzard', 'fire_wall', 'heavens_wrath', 'teleport']);
/** spells that go off around the caster: their touch button casts at once, there's nothing to aim */
const AIM_SELF = new Set(['static_field', 'nova', 'frost_nova']);
/** how far a touch aim reaches: a missile's line, a spot at full drag (about the edge of a phone's view) */
const AIM_LINE = 9;

/** where a dragged touch skill button would land (Game.aimPreview) */
export interface AimPreview {
  shape: 'line' | 'spot';
  /** the end of the line, or the middle of the spot */
  point: P2;
  /** the spot's size */
  radius: number;
  /** the enemy a line snaps to */
  target: Monster | null;
}

/** what the touch interact button would use */
export type TouchNear = { ground: GroundItem; obj?: undefined } | { obj: WorldObject; ground?: undefined };

export class Game {
  player: Player;
  /** the hireling on the map the hero is on, beside them (src/game/merc.ts); none yet */
  merc: Merc | null = null;
  level!: Level;
  /** the map the far end of the hero's town portal is on (the camp's end leads back to it) */
  portalLevel: Level | null = null;
  /** the trial ground's floor visited last (Maps.lastDungeon): the tools set it too (bot.mjs) */
  get lastDungeon(): Level | null {
    return this.maps.lastDungeon;
  }
  set lastDungeon(level: Level | null) {
    this.maps.lastDungeon = level;
  }
  /** what the game remembers of the hero's items (src/game/items.ts) */
  finds: Finds = { toldUnknown: false, remarked: new WeakSet<Item>() };
  /** the maps of this game, made as they're entered (src/game/maps.ts) */
  maps = new Maps(this);
  /**
   * the seed this game makes its maps from: a new one each game (D2Game GAME/Game.cpp
   * GAME_CreateNewEmptyGame seeds dwInitSeed afresh), the saved one carried across a reload
   */
  worldSeed = 0;
  /** what the game remembers of the hero's comings and goings (src/game/travel.ts) */
  trip: Trip = { atClosed: null, leftKind: new Map(), wentUnder: false };
  /** the monsters this sim step runs: those near the hero, and near the hireling (fight.ts monstersAround) */
  private stepped: Monster[] = [];
  /**
   * when each corpse last aged (Monster.deathTime), by its map's clock (Level.time): those far off,
   * not stepped, catch up as the dead are cleared, by the time the hero spent on that map
   */
  aged = new WeakMap<Monster, number>();
  /** the area the hero is in (Level.areaAt), announced through hooks.areaChanged when it changes */
  area: AreaDef | null = null;
  fx: Fx = nullFx;
  hooks!: GameHooks;
  picker!: Picker;
  time = 0;
  hitstop = 0;
  hover: { monster: Monster | null; object: WorldObject | null; ground: GroundItem | null } = { monster: null, object: null, ground: null };
  playerAction: PlayerAction | null = null;
  auraPulse = 0;
  saveTimer = 0;
  lmbMode: 'none' | 'move' | 'attack' | 'other' = 'none';
  /** the enemy the touch skill buttons last aimed at */
  private touchFoe: Monster | null = null;
  /** a touch skill button was held last frame */
  private touchFighting = false;
  /** phones: the touch controls are on (aimed casts, the target ring, the interact button) */
  touchMode = false;
  /** the dragged skill button's aim, for the renderer to draw */
  aimPreview: AimPreview | null = null;
  /** the enemy the skill buttons would go for now, ringed on the ground */
  touchTarget: Monster | null = null;
  /** what the interact button would use: the nearest item, chest, door or person in reach */
  touchNear: TouchNear | null = null;
  /** what the hero's last death cost (Diablo II's death penalty, game/d2/death.ts), for the death screen */
  lastDeath: DeathPenalty | null = null;
  /** the camp merchant's shelves (src/items/vendor.ts), stocked anew on each way into the camp */
  shop = new Store(CAMP_VENDORS);
  /**
   * D2R's shared stash pages, the player's rather than the hero's (src/items/stash.ts): read as each
   * game starts, kept in step with storage and other tabs by syncShared
   */
  shared = new SharedStash();
  /** what to tell the player about the shared pages as the game starts (save.ts loadShared) */
  private sharedNote: string | null = null;
  /** storage refused a save this game: said once */
  private toldUnsaved = false;
  /**
   * Game.time when the hero last went into storage (persist): while it hasn't moved on, nothing has
   * been played here since (heroClaimed)
   */
  private savedAt = -1;
  /** the time of day under the sky, 0 → 1 from midnight (src/render/sky.ts); it starts in the morning */
  clock = 0.3;
  /** how fast the day goes by (0 holds it, for screenshots: ?tod=) */
  clockRate = 1;
  paused = false;
  /**
   * another tab has this hero now (heroElsewhere): the game here has stopped for good, the pause menu
   * shut or not, as nothing done here would be kept
   */
  elsewhere = false;
  /**
   * a reload's hero, claimed as the page started (claimToResume) to be played on once the models are
   * in (resume): the page keeps the claim fresh meanwhile as a game's (main.ts), and another window
   * opening the hero before then has it (heroClaimed)
   */
  resumeClaimed = false;
  /** driven externally (balance bot): the page loop neither steps nor renders */
  headless = false;
  started = false;
  /** low_health: under LOW_LIFE last frame; back over LOW_LIFE_REARM since it was last said; the time it may be said again */
  private lowLife = { was: false, armed: true, quiet: 0 };
  /** it was night under the sky last frame (isNight) */
  private night = false;
  /** the quests of this game, made with it from the hero's record in the difficulty played (src/game/quests) */
  quests = new Quests(this);
  /** the rifts: the camp's obelisk, the one open now, the tiers cleared (src/game/rift.ts) */
  readonly rift = new Rifts(this);

  constructor(
    public input: Input,
    public sfx: Sfx,
  ) {
    this.player = new Player({ x: 0, z: 0 });
  }

  // ───────────────────────── lifecycle ─────────────────────────

  newGame(name: string, cls: PlayerClass = 'paladin') {
    // the slot's hero is this tab's: one another tab had there is no longer written by it
    claimHero();
    const cd = CLASSES[cls];
    const p = new Player({ x: 0, z: 0 });
    p.name = name || cd.defaultName;
    p.cls = cls;
    p.base = { ...cd.base };
    // Diablo II's kit from CharStats.txt (gen.ts starterKit): the weapon and shield worn, the
    // potions in the belt, a column each, the scrolls of town portal and identify in the bag
    const kit = starterKit(cls);
    if (kit.weapon) p.equipment.weapon = kit.weapon;
    if (kit.offhand) p.equipment.offhand = kit.offhand;
    for (const it of kit.belt) {
      const col = p.belt.find((c) => c.length < p.beltRows());
      if (col) col.push(it);
      else p.inventory.add(it);
    }
    for (const it of kit.bag) p.inventory.add(it);
    p.gold = 50;
    p.skills[cd.firstSkill] = 1;
    p.skillPoints = 0;
    p.binds = ['attack', cd.firstSkill, null, null, null, null];
    p.markDirty();
    p.recalc();
    p.life = p.d.maxLife;
    p.mana = p.d.maxMana;
    p.stamina = p.d.maxStamina;
    this.player = p;
    // a last game's item on the cursor stays with the hero it was saved with
    this.hooks.setCursorItem(null);
    this.openShared();
    this.started = true;
    this.newWorld(newSeed());
    markInGame(true);
    this.enterArea(CAMP_AREA, 'start');
    this.tellShared();
  }

  /**
   * Before continuing a hero another tab is playing (save.ts playedElsewhere): claimed, and that tab
   * given time to save it a last time and hand it over, so nothing done there is lost. True when it did
   */
  takeOver(slot: number): Promise<boolean> {
    setSlot(slot);
    claimHero();
    return waitHandOver();
  }

  /**
   * Resume a saved character (the current slot when none is given). Like a game of Diablo II it
   * starts in the camp, its maps made anew, the waypoints as they were; a `reload` mid-game plays on
   * in the same world, in the area it was saved in (the camp, if this build has no map of that)
   */
  continueGame(slot?: number, reload = false): boolean {
    if (slot !== undefined) setSlot(slot);
    // claimed before it is read: a tab playing it writes it a last time, then no more (save.ts claimHero)
    claimHero();
    const s = loadSave();
    if (!s) return false;
    this.player = s.player;
    // the item that was on the cursor goes back on it (D2: PlrSave.cpp:100-110)
    this.hooks.setCursorItem(s.cursor);
    this.openShared();
    this.started = true;
    this.newWorld(reload && s.worldSeed !== undefined ? s.worldSeed : newSeed());
    this.finds.toldUnknown = false;
    markInGame(true);
    // a save's area this build has no map of is the camp already (loadSave: isBuilt); one it has, but
    // can't make a map of now, is too, rather than a game on no map (docs/M2A.md 回滚兜底)
    if (!this.enterArea(reload ? s.area : CAMP_AREA, 'start')) this.enterArea(CAMP_AREA, 'start');
    // said once: the save won't be written this time
    if (s.readOnly) this.hooks.message(s.readOnly, '#ff8060', 10);
    this.tellShared();
    return true;
  }

  /**
   * A reload of this tab goes back to its hero (main.ts): claimed as the page starts, while the models
   * load, so a tab still playing it writes it a last time before it is read here (save.ts claimHero).
   * Until it is played on (resume) the page keeps the claim fresh as a game's (heartbeat), and another
   * window opening the hero meanwhile has it (heroClaimed)
   */
  claimToResume() {
    claimHero();
    this.resumeClaimed = true;
  }

  /**
   * The reload's hero, once the models are in: played on in the same world, where it was
   * (continueGame). Another window holding a fresh claim on it by now (its storage event not in yet)
   * is first waited for to save it a last time and hand it over, as from the title (takeOver), with
   * `waiting` called meanwhile. False when it isn't played on: given up to another window during the
   * load or that wait (heroClaimed), or no save
   */
  async resume(waiting?: () => void): Promise<boolean> {
    if (!this.resumeClaimed) return false;
    const slot = slotNow();
    if (playedElsewhere(slot)) {
      waiting?.();
      await this.takeOver(slot);
      // opened in yet another window while this one waited, its storage event still on the way: that one has it
      if (this.resumeClaimed && claimedElsewhere()) this.giveUpResume();
      if (!this.resumeClaimed) return false;
    }
    this.resumeClaimed = false;
    return this.continueGame(undefined, true);
  }

  /**
   * A reload's hero opened in another window before it is played on here: handed over at once, as
   * nothing here has been read or played since the reload (the page before saved it as it went), and
   * never started here
   */
  private giveUpResume() {
    this.resumeClaimed = false;
    handOver();
    this.tellGone('unplayed');
  }

  /**
   * The shared pages as a game starts, whoever the hero (save.ts loadShared): those of a hero who won't
   * be saved this time can be looked at only, as what moved between them would be lost. What fits on
   * none of them waits by the camp stash with the hero's own
   */
  private openShared() {
    const r = loadShared(isReadOnly(this.player) ? '这个角色这次不会保存：共享储物箱只能查看' : null);
    this.shared = r.stash;
    this.player.unplaced.push(...r.overflow);
    this.sharedNote = r.note;
    this.toldUnsaved = false;
    this.savedAt = -1;
    this.elsewhere = false;
    // a game started, however: no reload's claim waits to be played on any more
    this.resumeClaimed = false;
  }

  private tellShared() {
    if (this.sharedNote) this.hooks.message(this.sharedNote, '#ff8060', 8);
    this.sharedNote = null;
  }

  /**
   * a game's maps forgotten, the next ones made from `seed`; the uniques dropped and the last death
   * belong to the game gone (gen.ts newGameDrops)
   */
  private newWorld(seed: number) {
    this.worldSeed = seed;
    this.maps = new Maps(this);
    this.portalLevel = null;
    // a rift is a game's: the next game opens its own
    this.rift.forget();
    this.area = null;
    this.trip.atClosed = null;
    this.trip.leftKind.clear();
    this.trip.wentUnder = false;
    this.lastDeath = null;
    newGameDrops();
    this.startQuests();
  }

  /** the quests as a game starts, from the hero's record in the difficulty played (QUESTS_QuestInit) */
  private startQuests() {
    this.quests = new Quests(this);
    this.quests.start();
  }

  /** the map this game keeps that holds area `id`, if it has been made yet (none is made here) */
  mapOf(id: number): Level | null {
    return this.maps.mapOf(id);
  }

  /** whether a quest has lit `level` up (the Den of Evil, cleared in this game) */
  isLit(level: Level): boolean {
    return this.quests.lights(level);
  }

  save() {
    this.persist(true);
  }

  /**
   * The shared pages in step with storage and the other tabs (save.ts syncShared), the hero saved
   * straight after whenever they were written, so an item that went between the two is never in
   * neither. True when another tab's changes came in: what shows them is drawn again
   */
  syncShared(): boolean {
    return this.persist(false).adopted;
  }

  /**
   * The shared pages synced, then the hero saved: `always`, or because the pages were written.
   * `adopted`: another tab's changes to the pages came in; `saved`: the hero went into storage. Not
   * once another tab has the hero (save.ts heroTaken), but for this tab's `last` write of it: a claim
   * of another tab's found here before its storage event came (the autosave, the menu's save or a
   * sync got there first, or the event never came) hands the hero over just as the event would
   */
  private persist(always: boolean, last = false): { adopted: boolean; saved: boolean } {
    const none = { adopted: false, saved: false };
    // stopped for another tab (heroElsewhere): nothing more, the saves as the page goes away included
    if (!this.started || !this.level || this.elsewhere) return none;
    const p = this.player;
    if (!last && claimedElsewhere()) {
      this.heroClaimed();
      return none;
    }
    // written by a tab that has let it go again since: this page was frozen past its claim, the storage
    // events gone by while there was a claim to find (pageshow finds it as the back-forward cache gives the page back)
    if (!last && writtenElsewhere()) {
      this.outdated();
      return none;
    }
    const r = syncShared(this.shared);
    if (r.refund) p.gold += r.refund;
    if (r.overflow.length) {
      p.unplaced.push(...r.overflow);
      this.hooks.message(`共享储物箱放不下的 ${r.overflow.length} 件物品放在了营地的储物箱旁边`, '#c8a86a', 5);
      if (this.level.inTown(p.pos)) this.layOutUnplaced(this.level);
    }
    let saved = false;
    if (r.failed) {
      // the hero without the pages could lose what went from one to the other: neither, this time
      this.tellUnsaved();
    } else if (always || r.wrote || r.refund || r.overflow.length) {
      // the area the hero stands in, not the map's: one map may hold several
      saved = writeSave(p, this.level.areaAt(p.pos.x, p.pos.z).id, this.worldSeed, this.hooks.getCursorItem(), last);
      if (!saved && r.wrote) r.undo();
      // the rift tiers cleared here, the player's (src/game/riftsave.ts): when they can't be kept, the
      // unsaved badge stays up as for the hero, until they are
      const kept = this.rift.flush();
      if (!saved && !isReadOnly(p)) this.tellUnsaved();
      else if (saved && !kept) this.tellUnsaved();
      else if (saved) this.hooks.saveState?.(true);
      if (saved) this.savedAt = this.time;
    }
    if (r.adopted) this.hooks.inventoryChanged();
    return { adopted: r.adopted, saved };
  }

  private tellUnsaved() {
    // shown until a save goes in again: progress made meanwhile isn't kept
    this.hooks.saveState?.(false);
    if (this.toldUnsaved) return;
    this.toldUnsaved = true;
    this.hooks.message('存储空间不够，这次没能保存', '#ff6060', 6);
  }

  /**
   * Another tab claimed this hero (its storage event: save.ts claimHero; or a save here that found the
   * claim first: persist). Written here a last time if nothing has been written over it since and this
   * build writes it at all, so that tab, reading it after, has what was done here; then handed over,
   * never written here again, the game here stopped (D2R: a character is in one game at a time). A
   * reload still loading the hero gives it up instead, never starting it (giveUpResume). Once only
   */
  heroClaimed() {
    if (this.elsewhere || !claimedElsewhere()) return;
    if (!this.started) {
      if (this.resumeClaimed) this.giveUpResume();
      return;
    }
    const p = this.player;
    // the play here is in what the other tab reads: written now; or, that tab having written the hero
    // first (its wait for this one ran out: this tab frozen, hidden, in the back-forward cache), with
    // nothing played here since the last write that went in
    const saved = !isReadOnly(p) && (mayWriteLast() ? this.persist(true, true).saved : this.savedAt === this.time);
    heroTaken(p);
    // the other tab reads the hero only now, with what was done here in it (save.ts waitHandOver)
    handOver();
    this.heroElsewhere(saved ? 'saved' : 'unsaved');
  }

  /**
   * Back from the back-forward cache (main.ts pageshow), the hero let go as the page went (pagehide):
   * played here, or a reload's still loading. Another tab playing it now has it (heroClaimed); one that
   * opened it meanwhile, played and let it go again has written it since this tab last did, so the hero
   * here is out of date and stops (outdated); else it is this tab's again, played on. Nothing once this
   * tab has handed it over (elsewhere): claimed again, it would stop the tab playing it now, and beat on
   * so that it never handed over again
   */
  backFromCache() {
    if (!(this.started || this.resumeClaimed) || this.elsewhere) return;
    if (playedElsewhere(slotNow())) this.heroClaimed();
    // nothing read here yet: the reload reads whatever was written meanwhile once its models are in
    else if (!this.started) claimHero();
    else if (writtenElsewhere()) this.outdated();
    else reclaimHero();
  }

  /**
   * The hero written by another tab since this one last read or wrote it, with no claim of that tab's
   * left (writtenElsewhere): what is played here is out of date. Never written here again, so that
   * tab's play stays in the save for the hero picked again, here or anywhere; the game here stopped as
   * at a hand-over, with nothing to hand over, as nobody waits
   */
  private outdated() {
    neverWrite(this.player);
    this.heroElsewhere('stale');
  }

  /**
   * This hero is another tab's now: the shared pages only looked at from here on, and the player told
   * what became of the play here (`how`), as nothing here is kept any more
   */
  private heroElsewhere(how: HandOver) {
    if (!this.shared.readOnly) {
      this.shared.readOnly = '这个角色已在另一个窗口打开：这里只能查看';
      this.hooks.inventoryChanged();
    }
    // nothing done here would be kept from now on, so the game here stops rather than play on unsaved
    // (and stays stopped: PauseMenu.toggle leaves it paused once the menu is shut)
    this.elsewhere = true;
    this.paused = true;
    this.tellGone(how);
  }

  /** the player told another tab has the hero: the hand-over notice (UI.heroGone), or without one a message */
  private tellGone(how: HandOver) {
    if (this.hooks.heroGone) this.hooks.heroGone(how);
    else this.hooks.message('这个角色已在另一个窗口打开：这里不再保存', '#ff8060', 10);
  }

  // ───────────────────────── items (src/game/items.ts) ─────────────────────────

  heldGrids(): Grid[] {
    return heldGrids(this);
  }

  stashBlock(page: number, it: Item): string | null {
    return stashBlock(this, page, it);
  }

  moveStashGold(page: number, op: 'deposit' | 'withdraw'): number {
    return moveStashGold(this, page, op);
  }

  hasMap(id: number): boolean {
    return this.maps.hasMap(id);
  }

  // ───────────────────────── travel (src/game/travel.ts) ─────────────────────────

  enterArea(id: number, how: Arrival): boolean {
    return enterArea(this, id, how);
  }

  enterLevel(depth: number, how: Arrival) {
    enterLevel(this, depth, how);
  }

  enterTrial(floor: number, d?: Difficulty) {
    enterTrial(this, floor, d);
  }

  closePortals() {
    closePortals(this);
  }

  teleportWithin(pos: P2, how: Arrival | null = null) {
    teleportWithin(this, pos, how);
  }

  private updateArea(entered = false, how: Arrival | 'walk' | null = null) {
    updateArea(this, entered, how);
  }

  /** the hero says its line for the moment: Sfx has it say one at a time, and the same one not too often */
  say(line: HeroLine) {
    this.sfx.play(heroLine(this.player.cls, line));
  }

  /** life falling under LOW_LIFE: once as it falls past, then not again until it's been back up */
  private watchLife() {
    const p = this.player;
    const s = this.lowLife;
    const share = p.dead ? 1 : p.life / p.stats.maxLife;
    const low = share < LOW_LIFE;
    if (share >= LOW_LIFE_REARM) s.armed = true;
    if (low && !s.was && s.armed && this.time >= s.quiet) {
      this.say('low_health');
      s.armed = false;
      s.quiet = this.time + LOW_LIFE_AGAIN;
    }
    s.was = low;
  }

  private layOutUnplaced(level: Level) {
    layOutUnplaced(this, level);
  }

  refreshShop() {
    refreshShop(this);
  }

  respawn() {
    respawn(this);
  }

  // ───────────────────────── frame update ─────────────────────────

  update(dt: number) {
    if (!this.started || this.paused) return;
    this.time += dt;
    this.clock = (this.clock + (dt * this.clockRate) / DAY_LENGTH) % 1;
    this.sfx.setTime(this.clock);
    const L = this.level;
    L.time += dt;
    // night falls on the hero out in the wilderness
    const night = isNight(this.clock);
    if (night && !this.night && this.area?.kind === 'outdoor') this.say('night_falls');
    this.night = night;
    // where things were before this step, to draw between steps: the hero, the missiles and the
    // monsters the last step ran, the only ones that move (and those it runs now, below)
    const keep = (a: { pos: P2; prevPos: P2 }) => {
      a.prevPos.x = a.pos.x;
      a.prevPos.z = a.pos.z;
    };
    keep(this.player);
    for (const pr of L.projectiles) keep(pr);
    for (const m of this.stepped) keep(m);
    // sounds are heard from where the hero stands
    this.sfx.setListener(this.player.pos);
    this.updateHover();
    this.handleInput();
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    const p = this.player;
    if (p.shrine && (p.shrine.left -= dt) <= 0) {
      p.shrine = null;
      p.markDirty();
      this.hooks.message('神殿的祝福消失了', '#9a9080', 2);
    }
    updatePlayer(this, p, dt);
    if (this.merc) updateMerc(this, this.merc, dt);
    // self-repairing items mend a point now and then, on the shared pages too while they can change
    p.mendItems(dt, this.shared.readOnly ? [] : this.shared.pages);
    this.quests.update(dt);
    // only the monsters near the hero (and the hireling) act; the rest are out of play until one
    // comes back (MonsterGrid), and so cost nothing. They go in the grid's order, cell by cell, not
    // the list's: one added to the level during a step would wait for the next (none is: spawn.ts
    // fills a map as it is made, and a raised corpse is one of those already)
    const stepped = this.stepped;
    stepped.length = 0;
    monstersAround(this, stepped);
    for (const m of stepped) {
      m.prevPos.x = m.pos.x;
      m.prevPos.z = m.pos.z;
      m.hitFlash = Math.max(0, m.hitFlash - dt * 6);
      m.convictRes = 0;
      m.convictDef = 0;
      updateMonster(this, m, dt);
      if (m.dead) this.aged.set(m, L.time);
    }
    p.hitFlash = Math.max(0, p.hitFlash - dt * 6);
    this.watchLife();
    updateAuras(this, dt);
    separate(this, dt);
    // the ones that walked, were knocked back or pushed apart: into the cells they're in now
    L.monstersMoved(stepped);
    updateProjectiles(this, dt);
    updateHammers(this, dt);
    updateBlasts(this, L, dt);
    // ground items: animate & auto-pickup gold
    for (const gi of L.ground) {
      gi.age += dt;
      if (gi.gold > 0 && gi.age > 0.5 && !p.dead && dist(gi.pos, p.pos) < 1.1) this.pickupGround(gi);
    }
    for (const o of L.objects) if (o.used) o.usedTime += dt;
    if (walkExits(this, L)) return;
    this.updateArea(false, 'walk');
    this.layOutCorpses();
    clearCorpses(this, L);
    this.saveTimer += dt;
    if (this.saveTimer > 8) {
      this.saveTimer = 0;
      this.save();
    }
  }

  private updateHover() {
    const inp = this.input;
    const gid = this.hooks.hoveredGroundId();
    const ground = gid !== null ? this.level.ground.find((g) => g.id === gid) ?? null : null;
    let monster: Monster | null = null;
    let object: WorldObject | null = null;
    if (!ground && !inp.overUI) {
      const near = this.level.monstersNear(this.player.pos, 22).filter((m) => !m.dead && dist(m.pos, this.player.pos) < 22);
      monster = this.picker.pickMonster(inp.mx, inp.my, near);
      if (!monster) object = this.picker.pickObject(inp.mx, inp.my, this.level.objects.filter((o) => !spent(o)));
    }
    this.hover = { monster, object, ground };
  }

  private handleInput() {
    const inp = this.input;
    const p = this.player;
    if (p.dead) return;
    const point = this.picker.screenToGround(inp.mx, inp.my) ?? p.pos;
    const h = this.hover;

    // number keys: belt
    for (let i = 0; i < 4; i++) if (inp.pressed.has(String(i + 1))) this.useBelt(i);

    // touch: the stick wins, so walking away from a fight works while a button is still held; a
    // button pressed while walking still casts a spell, but doesn't start a melee chase
    const touchSkill = (i: number) => p.binds[i] ?? (i === 0 ? 'attack' : undefined);
    const dir = inp.stick ? this.stickDir(inp.stick) : null;
    if (dir) {
      if (this.touchFighting && p.intent?.kind === 'attack') p.intent.hold = false;
      p.intent = { kind: 'steer', dir };
      for (const i of inp.touchPressed) {
        const sk = touchSkill(i);
        if (sk && (sk.startsWith(CHARGE_PREFIX) || SKILL_BY_ID[sk]?.kind === 'spell')) this.touchSkill(sk, true);
      }
      this.touchFighting = false;
    } else if (inp.touchHeld.size || inp.touchPressed.size) {
      for (let i = 0; i < 6; i++) {
        const sk = touchSkill(i);
        if (sk && (inp.touchHeld.has(i) || inp.touchPressed.has(i))) this.touchSkill(sk, inp.touchPressed.has(i));
      }
    } else {
      // let go of the button: finish the swing, don't keep attacking
      if (this.touchFighting && p.intent?.kind === 'attack') p.intent.hold = false;
      this.touchFighting = false;
      if (p.intent?.kind === 'steer') p.intent = null;
    }
    if (this.touchMode) this.touchExtras();

    // left mouse
    if (inp.lmbPressed) {
      const cursor = this.hooks.getCursorItem();
      if (cursor) {
        // the cube and an item this build can't read stay on the cursor (dropBlock)
        if (!this.refuseDrop(cursor)) {
          this.dropItem(cursor);
          this.hooks.setCursorItem(null);
        }
        this.lmbMode = 'other';
      } else if (h.ground) {
        p.intent = { kind: 'pickup', ground: h.ground };
        this.lmbMode = 'other';
      } else if (h.monster) {
        // on a phone, the tapped enemy is the one the skill buttons go for from now on
        this.touchFoe = h.monster;
        this.useSkillAt(p.binds[0] ?? 'attack', h.monster, point, true);
        this.lmbMode = 'attack';
      } else if (h.object) {
        p.intent = { kind: 'interact', obj: h.object };
        this.lmbMode = 'other';
      } else if (inp.shift) {
        p.intent = { kind: 'cast', skill: p.binds[0] ?? 'attack', point, target: null };
        this.lmbMode = 'attack';
      } else {
        p.intent = { kind: 'move', point };
        this.lmbMode = 'move';
      }
    } else if (inp.lmb && inp.worldDown) {
      if (this.lmbMode === 'move') {
        if (p.intent?.kind === 'move' || !p.intent) p.intent = { kind: 'move', point };
      } else if (this.lmbMode === 'attack' && inp.shift && (p.state === 'idle' || p.state === 'move')) {
        p.intent = { kind: 'cast', skill: p.binds[0] ?? 'attack', point, target: null };
      } else if (this.lmbMode === 'attack' && !p.intent && h.monster && (p.state === 'idle' || p.state === 'move')) {
        this.useSkillAt(p.binds[0] ?? 'attack', h.monster, point, false);
      }
    } else if (!inp.lmb) {
      if (p.intent?.kind === 'attack' && this.lmbMode === 'attack') p.intent.hold = false;
      this.lmbMode = 'none';
    }

    // right mouse
    const rskill = p.binds[1];
    if (rskill && (inp.rmbPressed || (inp.rmb && inp.worldRDown))) {
      this.useSkillAt(rskill, h.monster, point, inp.rmbPressed);
    }
    // hotkeys
    const keys = ['q', 'w', 'e', 'r'];
    for (let i = 0; i < 4; i++) {
      const sk = p.binds[2 + i];
      if (!sk) continue;
      const k = keys[i];
      if (inp.pressed.has(k) || (inp.keys.has(k) && !inp.overUI)) this.useSkillAt(sk, h.monster, point, inp.pressed.has(k));
    }
  }

  /** the stick's push on screen as a direction on the ground; null inside the dead zone */
  private stickDir(s: { x: number; y: number }): P2 | null {
    if (Math.hypot(s.x, s.y) < 0.2) return null;
    return this.screenDir(s.x, s.y);
  }

  /** a way on screen (x right, y up) as a direction on the ground */
  private screenDir(x: number, y: number): P2 | null {
    // the view is orthographic, so any two screen points give the same ground direction
    const a = this.picker.screenToGround(400, 400);
    const b = this.picker.screenToGround(400 + x * 100, 400 - y * 100);
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  }

  /**
   * The enemy the touch skill buttons go for: the one they last went for (or that was tapped) while
   * still close and in sight, else the nearest in sight within 10m, one ahead counting as up to a
   * third nearer than one behind.
   */
  private autoFoe(): Monster | null {
    const p = this.player;
    const map = this.level.map;
    const f = this.touchFoe;
    if (f && !f.dead && dist(f.pos, p.pos) < 12 && map.los(p.pos, f.pos)) return f;
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    let foe: Monster | null = null;
    let best = Infinity;
    for (const m of this.level.monstersNear(p.pos, 10)) {
      const d = dist(m.pos, p.pos);
      if (m.dead || d >= 10) continue;
      const ahead = d > 0.01 ? ((m.pos.x - p.pos.x) * fx + (m.pos.z - p.pos.z) * fz) / d : 1;
      const score = d * (1.3 - 0.3 * ahead);
      if (score < best && map.los(p.pos, m.pos)) {
        foe = m;
        best = score;
      }
    }
    return foe;
  }

  /** whether the ringed enemy is one the buttons are already fighting (or that was tapped) */
  get touchLocked() {
    return !!this.touchTarget && this.touchTarget === this.touchFoe;
  }

  /** a touch skill button tapped or held: at that enemy, or straight ahead with nobody around */
  private touchSkill(skill: string, isPress: boolean) {
    const p = this.player;
    const foe = this.autoFoe();
    this.touchFoe = foe;
    this.touchFighting = true;
    const point = foe ? foe.pos : { x: p.pos.x + Math.sin(p.facing) * 5, z: p.pos.z + Math.cos(p.facing) * 5 };
    this.useSkillAt(skill, foe, point, isPress);
  }

  /** phones: casts aimed by dragging a button, the interact button, and what the renderer marks */
  private touchExtras() {
    const inp = this.input;
    const p = this.player;
    const skillOf = (i: number) => p.binds[i] ?? (i === 0 ? 'attack' : undefined);
    const aim = inp.touchAim;
    const aiming = aim && !aim.cancel ? skillOf(aim.slot) : undefined;
    this.aimPreview = aiming ? this.aimAt(aiming, aim!) : null;
    const done = inp.touchAimed;
    const cast = done ? skillOf(done.slot) : undefined;
    const a = cast ? this.aimAt(cast, done!) : null;
    if (cast && a) {
      if (a.target) this.touchFoe = a.target;
      this.useSkillAt(cast, a.target, a.point, true);
    }
    const near = this.touchNear;
    if (inp.touchInteract && near) p.intent = near.ground ? { kind: 'pickup', ground: near.ground } : { kind: 'interact', obj: near.obj };
    this.touchTarget = this.aimPreview ? this.aimPreview.target : this.autoFoe();
    this.touchNear = this.nearestUsable();
  }

  /** whether a touch button's skill is aimed by dragging it: a spell that isn't cast around the caster */
  aimable(skill: string): boolean {
    const id = skill.startsWith(CHARGE_PREFIX) ? skill.slice(CHARGE_PREFIX.length) : skill;
    return SKILL_BY_ID[id]?.kind === 'spell' && !AIM_SELF.has(id);
  }

  /**
   * A dragged skill button's aim: the drag's way from the hero, and for a spell laid on the ground,
   * as far out as the drag is long. A missile's line snaps to the enemy closest to it.
   */
  aimAt(skill: string, v: { x: number; y: number }): AimPreview | null {
    if (!this.aimable(skill)) return null;
    const id = skill.startsWith(CHARGE_PREFIX) ? skill.slice(CHARGE_PREFIX.length) : skill;
    const dir = this.screenDir(v.x, v.y);
    if (!dir) return null;
    const p = this.player;
    if (AIM_SPOT.has(id)) {
      const sp = p.skillParams(id);
      const d = Math.max(1.5, Math.min(1, Math.hypot(v.x, v.y)) * Math.min(AIM_LINE, sp.range ?? AIM_LINE));
      const radius = sp.radius ?? (id === 'heavens_wrath' ? 2.6 : 1);
      return { shape: 'spot', point: { x: p.pos.x + dir.x * d, z: p.pos.z + dir.z * d }, radius, target: null };
    }
    let target: Monster | null = null;
    let best = Infinity;
    for (const m of this.level.monstersNear(p.pos, AIM_LINE + 2)) {
      const dx = m.pos.x - p.pos.x;
      const dz = m.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (m.dead || d > AIM_LINE + 2 || d < 0.01) continue;
      // within about 25° of the line, the nearer the line the better
      const off = Math.acos(Math.max(-1, Math.min(1, (dx * dir.x + dz * dir.z) / d)));
      if (off > 0.45) continue;
      const score = off * 6 + d / AIM_LINE;
      if (score < best && this.level.map.los(p.pos, m.pos)) {
        best = score;
        target = m;
      }
    }
    return { shape: 'line', point: { x: p.pos.x + dir.x * AIM_LINE, z: p.pos.z + dir.z * AIM_LINE }, radius: 0, target };
  }

  /** the nearest thing in reach to pick up or use: an item, a chest or barrel not yet opened, stairs, a waypoint, the stash, a portal, the merchant */
  private nearestUsable(): TouchNear | null {
    const p = this.player;
    let best: TouchNear | null = null;
    let bd = 2.4;
    for (const gi of this.level.ground) {
      const d = dist(gi.pos, p.pos);
      if (gi.item && d < bd) {
        bd = d;
        best = { ground: gi };
      }
    }
    for (const o of this.level.objects) {
      if (spent(o)) continue;
      const d = dist(o.pos, p.pos) - o.radius;
      if (d < bd) {
        bd = d;
        best = { obj: o };
      }
    }
    return best;
  }

  useSkillAt(skill: string, monster: Monster | null, point: P2, isPress: boolean) {
    if (skill.startsWith(CHARGE_PREFIX)) return this.useChargeAt(skill.slice(CHARGE_PREFIX.length), monster, point, isPress);
    const p = this.player;
    const def = SKILL_BY_ID[skill];
    if (skill !== 'attack' && (!def || p.skillLevel(skill) <= 0)) return;
    const busy = !(p.state === 'idle' || p.state === 'move');
    if (skill === 'attack' || def.kind === 'attack') {
      if (monster) {
        if (p.intent?.kind === 'attack' && p.intent.target === monster && p.intent.skill === skill) {
          p.intent.hold = true;
          return;
        }
        p.intent = { kind: 'attack', target: monster, skill, hold: true };
      } else if (isPress && skill !== 'charge') {
        p.intent = { kind: 'cast', skill, point, target: null };
      }
      return;
    }
    if (def.kind === 'aura') {
      if (isPress) toggleAura(this, p, skill);
      return;
    }
    if (def.kind === 'passive') return;
    // spells & buffs
    if (!isPress && busy) return;
    if (!busy) {
      startCast(this, p, skill, monster ? monster.pos : point, monster);
      p.intent = null;
    } else if (isPress) {
      p.intent = { kind: 'cast', skill, point, target: monster };
    }
  }

  /** cast a skill from an item's charges (no mana; one charge per cast) */
  private useChargeAt(skill: string, monster: Monster | null, point: P2, isPress: boolean) {
    const p = this.player;
    const charge = p.chargeFor(skill);
    if (!charge) return;
    if (charge.left <= 0) {
      if (isPress) this.hooks.message('充能已经用完了，找商人补充', '#aaa', 1.2);
      return;
    }
    const busy = !(p.state === 'idle' || p.state === 'move');
    if (!isPress && busy) return;
    if (!busy) {
      startCast(this, p, skill, monster ? monster.pos : point, monster, charge);
      p.intent = null;
    } else if (isPress) {
      p.intent = { kind: 'cast', skill, point, target: monster, charge };
    }
  }

  // ───────────────────────── combat helpers (src/game/fight.ts) ─────────────────────────

  /**
   * The hero's side on this map, alive, what monsters go for (ai.ts friendlyTarget) and their blows,
   * missiles and blasts land on: the hero, and the hireling with them (docs/M2A-STEP0.md 2.2)
   */
  friendlies(): Friendly[] {
    const out: Friendly[] = [];
    if (!this.player.dead) out.push(this.player);
    if (this.merc && !this.merc.dead) out.push(this.merc);
    return out;
  }

  chargedBolts(m: Monster) {
    chargedBolts(this, m);
  }

  // ───────────────────────── kills (src/game/kills.ts) ─────────────────────────

  wake(m: Monster) {
    wake(this, m);
  }

  killMonster(m: Monster, elem: Elem, killer: Killer = 'hero') {
    killMonster(this, m, elem, killer);
  }

  celebrateLevelUp() {
    celebrateLevelUp(this);
  }

  rollLoot(roll: (hero: Finder) => Item[], by: Killer = 'hero'): Drop[] {
    return rollLoot(this, roll, by);
  }

  onProc(kind: StatKey, target: Monster | null) {
    onProc(this, kind, target);
  }

  killPlayer() {
    killPlayer(this);
  }

  // ───────────────────────── bodies (src/game/bodies.ts) ─────────────────────────

  private layOutCorpses() {
    layOutCorpses(this);
  }

  // ───────────────────────── items (src/game/items.ts) ─────────────────────────

  spawnDrops(pos: P2, drops: Drop[]) {
    spawnDrops(this, pos, drops);
  }

  dropItem(item: Item) {
    dropItem(this, item);
  }

  dropBlock(item: Item): string | null {
    return dropBlock(this, item);
  }

  refuseDrop(item: Item): boolean {
    return refuseDrop(this, item);
  }

  dropFromBag(item: Item): boolean {
    return dropFromBag(this, item);
  }

  beltInsert(item: Item): boolean {
    return beltInsert(this, item);
  }

  autoBeltInsert(item: Item): boolean {
    return autoBeltInsert(this, item);
  }

  readHeld(it: Item): boolean {
    return readHeld(this, it);
  }

  pickupGround(gi: GroundItem) {
    pickupGround(this, gi);
  }

  drinkable(item: Item): boolean {
    return drinkable(this, item);
  }

  drink(item: Item) {
    drink(this, item);
  }

  useBelt(col: number) {
    useBelt(this, col);
  }

  // ───────────────────────── interaction (src/game/interact.ts, containers.ts) ─────────────────────────

  interact(obj: WorldObject) {
    interact(this, obj);
  }

  // ───────────────────────── townsfolk (src/game/townsfolk.ts) ─────────────────────────

  talkTo(obj: WorldObject): Topic | null {
    return talkTo(this, obj);
  }

  npcTalk(obj: WorldObject): Topic | null {
    return npcTalk(this, obj);
  }

  npcSpoke(topic: Topic) {
    npcSpoke(this, topic);
  }

  npcLeft(obj: WorldObject) {
    npcLeft(this, obj);
  }

  // ───────────────────────── travel (src/game/travel.ts) ─────────────────────────

  openTownPortal() {
    openTownPortal(this);
  }

  castTownPortal(from?: Item) {
    castTownPortal(this, from);
  }

  readTownPortal(from?: Item) {
    readTownPortal(this, from);
  }

  travel(id: number): boolean {
    return travel(this, id);
  }

  travelToArea(id: number): boolean {
    return travelToArea(this, id);
  }

  /**
   * Play on in another difficulty (the debug panel): its waypoints, which Diablo II keeps apart for
   * each difficulty, its treasure classes, its area levels, its monsters, its resistance and death
   * penalties. In D2 that is another game, begun in the act's town: the maps are made anew in the
   * same world (what lay on the ground goes with the old ones) and the hero starts at the camp's
   * waypoint, not among the new difficulty's packs (a trial floor: at a new floor's start)
   */
  setDifficulty(d: Difficulty) {
    const p = this.player;
    const here = this.level ? this.level.areaAt(p.pos.x, p.pos.z).id : undefined;
    const was = this.level;
    if (!this.switchDifficulty(d)) return;
    if (was && was !== this.maps.gallery && here !== undefined) {
      if (trialFloor(here) !== undefined) this.enterArea(here, 'stairs');
      else this.enterArea(CAMP_AREA, 'waypoint');
    }
    this.save();
  }

  /** another difficulty's game, the hero not yet moved into it: its waypoints and penalties, no maps of the old one. False if it is the one played */
  switchDifficulty(d: Difficulty): boolean {
    const p = this.player;
    if (d === p.difficulty) return false;
    // the waypoints so far stay with the difficulty they were touched in
    this.save();
    p.difficulty = d;
    // the resistances take the new difficulty's penalty
    p.markDirty();
    p.waypoints = savedWaypoints(p, d);
    this.closePortals();
    this.maps.forget();
    // a game in another difficulty: its quests from that difficulty's record (D2 plays a difficulty a game)
    this.startQuests();
    return true;
  }
}
