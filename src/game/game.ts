import type { Input } from '../core/input';
import { chance, dist, rand, randInt, type P2 } from '../core/math';
import type { Sfx } from '../audio/sfx';
import { DROP_SOUND, ENTER_LINE, LARGE_MONSTER, heroLine, isNight, npcLine, soundsNear, type HeroLine, type VoiceId } from '../audio/sounds';
import { CLASSES, type PlayerClass } from '../data/classes';
import { SKILL_BY_ID } from '../data/skills';
import { D2_TO_GAME } from '../data/d2/skillmap';
import { createItem, isGold, newGameDrops, starterKit, type Drop } from '../items/gen';
import { CAMP_VENDORS, fillStore, Store } from '../items/vendor';
import { baseOf, displayName, isUnknown, type Item } from '../items/item';
import { fillableTome, isBookScroll, isTome, isTownPortal, mergeTome, readable, readFrom, scrollIntoTome, tomeCharges, tomeMax, townPortalFrom } from '../items/tomes';
import { coldEnchantBurst, fireEnchantBurst, lightEnchantBolts } from './d2/monstats';
import { autoBeltable, freeBeltColumn } from '../items/belt';
import { depositable, SharedStash, sharedBlock, withdrawable } from '../items/stash';
import type { Grid } from '../items/grid';
import { charStats, potionHeal } from './d2/stats';
import { deathPenalty, type DeathPenalty } from './d2/death';
import { killXp } from './d2/xp';
import { containerLoot, monsterLoot, type Finder } from './loot';
import { bodyItems, leaveBody, takeBody } from './corpse';
import { emptyPacket } from './actor';
import { blastDamage, corpseGone, monsterDied, notice, updateMonster } from './ai';
import { applyDamage, monsterStrike } from './combat';
import { nullFx, type Fx } from './fx';
import { GALLERY, Level } from './level';
import type { Monster } from './monster';
import { DelayedBlast, GroundItem, Projectile, WorldObject } from './objects';
import { CHARGE_PREFIX, Player } from './player';
import { castItemSkill, startCast, toggleAura, updatePlayer, type PlayerAction } from './playerctl';
import type { StatKey } from '../data/stats';
import type { Elem } from '../data/monsters';
import { claimedElsewhere, claimHero, handOver, heroTaken, isReadOnly, loadSave, loadShared, markInGame, mayWriteLast, neverWrite, playedElsewhere, reclaimHero, savedWaypoints, setSlot, slotNow, syncShared, waitHandOver, writeSave, writtenElsewhere, type Difficulty } from './save';
import { debugOpts } from './debug';
import { WILD_MAPS } from '../world/levelgen';
import { CAMP_AREA, DEN_OF_EVIL, areaDef, areaForDepth, areaLevel, builtWaypoints, depthForArea, dungeonArea, isBuilt, trialFloor, type AreaDef, type AreaKind } from '../world/areas';
import { BUILT as WEST_AREAS, generateOverworld, type Overworld } from '../world/overworld';
import { generateDen } from '../world/den';
import { SHRINE_BY_ID } from '../data/shrines';
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

const ACTIVE_RADIUS = 30;

/**
 * How fast a monster that isn't walking is pushed aside, m/s (Game.separate): a shuffle, as it has
 * no walk to it. D2's units don't push one another at all; they go round, or stop at, what stands.
 */
const STILL_PUSH = 0.3;

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

/** a seed for a map made anew */
const newSeed = () => (Math.random() * 2 ** 31) | 0;

/** seconds from one midnight to the next under the sky */
const DAY_LENGTH = 16 * 60;

/** the hero's life, as a share of its most, under which it says it's badly hurt: once, as it falls past */
const LOW_LIFE = 0.3;
/** it says so again only after its life has been back over this share, */
const LOW_LIFE_REARM = 0.5;
/** and this many seconds have gone by */
const LOW_LIFE_AGAIN = 30;
/**
 * seconds since walking out of a kind of area within which walking back into it says nothing: to and
 * fro over the camp's seam the hero doesn't remark on it at every step (as the area banner, src/ui/banner.ts)
 */
const REENTRY = 4;

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
  level!: Level;
  /** the map the far end of the hero's town portal is on (the camp's end leads back to it) */
  portalLevel: Level | null = null;
  /** the trial ground's floor visited last, kept so waypoint trips and deaths don't reroll it */
  lastDungeon: Level | null = null;
  /** the unknown items by the stash were pointed out this game: they may wait there for long */
  private toldUnknown = false;
  /**
   * The maps of this game, each made the first time it's entered and kept while the game lasts, as
   * Diablo II keeps a game's levels: the West overworld (the camp, Blood Moor and Cold Plains on one
   * map), the Den of Evil, and ?gallery's showroom standing in for the camp
   */
  private west: Level | null = null;
  private den: Level | null = null;
  private gallery: Level | null = null;
  /**
   * the seed this game makes its maps from: a new one each game (D2Game GAME/Game.cpp
   * GAME_CreateNewEmptyGame seeds dwInitSeed afresh), the saved one carried across a reload
   */
  worldSeed = 0;
  /** the closed way the hero is at, told once until they step off it */
  private atClosed: WorldObject | null = null;
  /** the monsters this sim step runs: those near the hero (Level.monstersNear) */
  private stepped: Monster[] = [];
  /**
   * when each corpse last aged (Monster.deathTime), by its map's clock (Level.time): those far off,
   * not stepped, catch up as the dead are cleared, by the time the hero spent on that map
   */
  private aged = new WeakMap<Monster, number>();
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
  /** the finds the hero has remarked on: picked up again, an item isn't new */
  private remarked = new WeakSet<Item>();
  /** when the hero last walked out of each kind of area (Game.time), for REENTRY */
  private leftKind = new Map<AreaKind, number>();
  /** the hero has been underground this game: enter_dungeon is said the first time */
  private wentUnder = false;
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
    this.toldUnknown = false;
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
    this.west = this.den = this.gallery = this.lastDungeon = this.portalLevel = null;
    // a rift is a game's: the next game opens its own
    this.rift.forget();
    this.area = null;
    this.atClosed = null;
    this.leftKind.clear();
    this.wentUnder = false;
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
    if (WEST_AREAS.includes(id)) return this.west;
    if (id === DEN_OF_EVIL) return this.den;
    return null;
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

  /** the grids the hero's items lie in, the shared pages too while they can change, for reading a scroll or tome from */
  heldGrids(): Grid[] {
    const p = this.player;
    return [p.inventory, p.stash, ...(this.shared.readOnly ? [] : this.shared.pages), p.cube];
  }

  /** why `it` can't go on page `page` of the stash (0 the hero's own, 1… the shared ones), or null */
  stashBlock(page: number, it: Item): string | null {
    return page > 0 ? (this.shared.readOnly ?? sharedBlock(it)) : null;
  }

  /**
   * Gold into or out of the page of the stash shown (0 the hero's own, Player.stashGold; 1… a shared
   * one's own, as D2R keeps it). As much as fits, D2's way (src/items/stash.ts); how much moved
   */
  moveStashGold(page: number, op: 'deposit' | 'withdraw'): number {
    const p = this.player;
    const sh = this.shared;
    if (page > 0 && (sh.readOnly || page > sh.gold.length)) return 0;
    const banked = page > 0 ? sh.gold[page - 1] : p.stashGold;
    const n = op === 'deposit' ? depositable(p.gold, banked) : -withdrawable(banked, p.gold, p.level);
    p.gold -= n;
    if (page > 0) sh.gold[page - 1] += n;
    else p.stashGold += n;
    return Math.abs(n);
  }

  /** whether this build has a map of area `id`: the areas of normal play (isBuilt) and the trial ground's floors */
  hasMap(id: number): boolean {
    return isBuilt(id) || trialFloor(id) !== undefined || this.rift.levelFor(id) !== null;
  }

  /**
   * The map that holds area `id` in this game, made the first time it's asked for: the overworld for
   * its areas, the Den of Evil's own, a trial floor (a new one when `fresh`, else the one left last).
   * Null when this build has none
   */
  private levelFor(id: number, fresh = false): Level | null {
    if (id === CAMP_AREA && GALLERY) return (this.gallery ??= new Level(0, this.worldSeed));
    const rift = this.rift.levelFor(id);
    if (rift) return rift;
    if (WEST_AREAS.includes(id)) {
      if (!this.west) {
        const ow = generateOverworld(this.worldSeed);
        // its monsters in the difficulty played (a new difficulty is a new game: setDifficulty)
        this.west = new Level(WILD_MAPS, ow.seed, ow, this.player.difficulty);
        this.rift.furnishCamp(this.west);
      }
      return this.west;
    }
    if (id === DEN_OF_EVIL) {
      // its own seed from the world's, so a reload finds the same den
      const seed = (Math.imul(this.worldSeed ^ 0x0de0f, 0x9e3779b1) + DEN_OF_EVIL) >>> 0;
      return (this.den ??= new Level(WILD_MAPS, seed, generateDen(seed), this.player.difficulty));
    }
    if (trialFloor(id) === undefined) return null;
    const depth = depthForArea(id)!;
    // like D2: going back to the floor you left (waypoint, after dying) finds it as you left it
    if (!fresh && this.lastDungeon?.depth === depth && this.lastDungeon.difficulty === this.player.difficulty) return this.lastDungeon;
    return (this.lastDungeon = new Level(depth, newSeed(), undefined, this.player.difficulty));
  }

  /**
   * Go to area `id`, onto the map that holds it, arriving `how`: by a stair or an exit at the way
   * back to where they came from, by waypoint beside its waypoint, through a town portal at its
   * other end, else where the area starts. On the map the hero is on already it is a jump
   * (teleportWithin): nothing is rebuilt. False when this build has no map of it
   */
  enterArea(id: number, how: Arrival): boolean {
    if (how === 'portal') return this.throughPortal(id);
    const level = this.levelFor(id, how === 'stairs');
    if (!level) return false;
    const at = this.arrival(level, id, how, this.area?.id);
    this.arrive(level, at.pos, true, how, at.facing);
    return true;
  }

  /** the old way in, by depth (?dev&lvl, tools): 0 the camp, WILD_MAPS Blood Moor, deeper the trial ground's floors */
  enterLevel(depth: number, how: Arrival) {
    this.enterArea(areaForDepth(depth).id, how);
  }

  /** the debug panel's trial ground: floor `floor` of the endless dungeon, made anew, played in difficulty `d` */
  enterTrial(floor: number, d?: Difficulty) {
    // the new difficulty's game begins on this floor, made once (setDifficulty would make one where the hero is)
    if (d !== undefined) this.switchDifficulty(d);
    this.sfx.play('env.waypoint', { pos: this.player.pos });
    this.enterArea(dungeonArea(floor), 'stairs');
  }

  /**
   * The hero set down at `at` on `level`: a jump on the map they're on, else onto it, its view built
   * anew; a map kept from earlier is found as it was left, its survivors healed and home again
   * (`reenter`, not through a town portal), coming `how`
   */
  private arrive(level: Level, at: P2, reenter: boolean, how: Arrival, facing?: number) {
    const p = this.player;
    this.atClosed = null;
    if (level === this.level) this.teleportWithin(at, how);
    else {
      if (reenter) level.reenter();
      this.level = level;
      // on a rift's floor its tier's difficulty's rules hold for the hero, the one played's anywhere else
      const ruled = this.rift.difficultyOf(level);
      if (ruled !== p.ruled) {
        p.ruled = ruled;
        p.markDirty();
      }
      this.placePlayer(at);
      this.hooks.levelChanged(level);
      // a new level is always announced, even in the same area as the last
      this.updateArea(true, how);
    }
    if (facing !== undefined) p.facing = facing;
    const here = this.area?.id ?? CAMP_AREA;
    if (trialFloor(here) !== undefined) p.depthReached = Math.max(p.depthReached, depthForArea(here)!);
    this.save();
  }

  /** where on `level` the hero comes to area `id` by `how`, coming from area `from` */
  private arrival(level: Level, id: number, how: Arrival, from?: number): { pos: P2; facing?: number } {
    // out of a rift, by its obelisk
    const out = this.rift.arrival(id, how, from);
    if (out) return out;
    // by the way back to where they came from, a step in from it, facing in
    if ((how === 'stairs' || how === 'exit') && from !== undefined) {
      const back = level.objects.find((o) => (o.kind === 'stairs' || o.kind === 'exit') && o.dest === from && level.areaAt(o.pos.x, o.pos.z).id === id);
      if (back?.inward) {
        const d = back.radius + 1.6;
        return { pos: { x: back.pos.x + back.inward.x * d, z: back.pos.z + back.inward.z * d }, facing: Math.atan2(back.inward.x, back.inward.z) };
      }
    }
    // by waypoint, beside it (D2Game OBJECTS/ObjMode.cpp OBJMODE_TravelViaWaypoint warps the hero to the waypoint)
    const wp = how === 'waypoint' ? this.waypointIn(level, id) : undefined;
    if (wp) return { pos: { x: wp.pos.x + 1.2, z: wp.pos.z + 0.6 } };
    return { pos: this.areaStart(level, id) };
  }

  /** area `id`'s waypoint on `level`, if it has one there */
  private waypointIn(level: Level, id: number): WorldObject | undefined {
    return level.objects.find((o) => o.kind === 'waypoint' && level.areaAt(o.pos.x, o.pos.z).id === id);
  }

  /**
   * Where area `id` starts on `level`: the map's start if it's in it (the camp's, a dungeon's), else
   * beside its waypoint, else a couple of steps in from the seam on the camp's side (Blood Moor past
   * the camp's gate), else its tile nearest the start
   */
  private areaStart(level: Level, id: number): P2 {
    const L = level.layout;
    if (level.areaAt(L.start.x, L.start.z).id === id) return L.start;
    const wp = this.waypointIn(level, id);
    if (wp) return { x: wp.pos.x + 1.2, z: wp.pos.z + 0.6 };
    const ow = L as Partial<Overworld>;
    const rank = (a: number) => ow.order?.indexOf(a) ?? 0;
    const seam = ow.seams?.filter((sm) => sm.a === id || sm.b === id).sort((x, y) => rank(x.a === id ? x.b : x.a) - rank(y.a === id ? y.b : y.a))[0];
    if (seam) {
      const [inside, out] = seam.b === id ? [seam.tb, seam.ta] : [seam.ta, seam.tb];
      return { x: 3 * inside.x - 2 * out.x, z: 3 * inside.z - 2 * out.z };
    }
    return level.wayTo(id, L.start)?.pos ?? L.start;
  }

  /**
   * Through the town portal: from its far end into the camp, where its other end stands by the
   * start; from that end back to where it was opened, both ends closing (D2: the portal closes once
   * its owner comes back through it). On one map either way is a jump. With no portal open the way
   * back goes as a waypoint would
   */
  private throughPortal(id: number): boolean {
    const L = this.portalLevel;
    const far = L?.objects.find((o) => o.kind === 'portal' && !L.inTown(o.pos));
    if (id === CAMP_AREA) {
      const camp = this.levelFor(CAMP_AREA)!;
      camp.objects = camp.objects.filter((o) => !(o.kind === 'portal' && camp.inTown(o.pos)));
      const s = camp.layout.start;
      const pt = { x: s.x - 2.5, z: s.z + 0.5 };
      const there = far && L ? L.areaAt(far.pos.x, far.pos.z) : undefined;
      const portal = new WorldObject('portal', pt, `传送门 · ${there?.name ?? '?'}`, 0.6);
      portal.dest = there?.id ?? CAMP_AREA;
      camp.objects.push(portal);
      this.arrive(camp, { x: pt.x + 1.2, z: pt.z + 0.6 }, false, 'portal');
      return true;
    }
    this.closePortals();
    if (!L || !far) return this.enterArea(id, 'waypoint');
    this.arrive(L, { x: far.pos.x + 1, z: far.pos.z + 0.8 }, false, 'portal');
    return true;
  }

  /** the hero's town portal gone, both its ends, wherever they are */
  closePortals() {
    // a rift's own ways (src/game/rift.ts) aren't the hero's portal
    for (const L of [this.west, this.den, this.gallery, this.lastDungeon, this.portalLevel, ...this.rift.levels()]) if (L) L.objects = L.objects.filter((o) => o.kind !== 'portal' || o.rift);
    this.portalLevel = null;
  }

  /**
   * Move the hero elsewhere on this map without leaving it (a waypoint, a town portal or respawning
   * on the overworld, coming `how`; the tools' jumps, no way in): the view jumps there and a new area
   * is announced, nothing is rebuilt.
   */
  teleportWithin(pos: P2, how: Arrival | null = null) {
    this.placePlayer(pos);
    this.hooks.teleported(how);
    this.updateArea(false, how);
  }

  /** the hero set down on walkable ground near `pos`, standing still, whatever they were doing dropped */
  private placePlayer(pos: P2) {
    const p = this.player;
    const safe = this.level.map.nearestWalkable(pos.x, pos.z) ?? pos;
    p.pos = { ...safe };
    p.prevPos = { ...safe };
    p.intent = null;
    p.path = null;
    p.setState('idle');
    p.knockVel = { x: 0, z: 0 };
    p.zealHitsLeft = 0;
    p.chargeTarget = null;
    this.playerAction = null;
    this.lmbMode = 'none';
    this.sfx.setListener(p.pos);
  }

  /**
   * announce the hero's area when it changed (or always, `entered` a level): its banner, its
   * ambience and music, and what the hero says coming to it. `how` they came: on foot over a seam
   * ('walk'), by a way in (Arrival), or null for a jump the tools made
   */
  private updateArea(entered = false, how: Arrival | 'walk' | null = null) {
    const p = this.player;
    const area = this.level.areaAt(p.pos.x, p.pos.z);
    if (area === this.area && !entered) return;
    const prev = this.area;
    this.area = area;
    // into the camp, by any way in: the merchant has new stock, as D2's do each time the hero comes
    // back to town, and what fits nowhere waits by the stash
    if (area.kind === 'town' && (entered || prev?.kind !== 'town')) {
      this.refreshShop();
      this.layOutUnplaced(this.level);
    }
    // its ambience at this time of day, and its music, over the last area's; walked over a seam, a
    // switch back so soon after the last waits a moment (Sfx SWITCH_HOLD)
    this.sfx.setTime(this.clock);
    this.sfx.enterArea(area, how === 'walk');
    // the quests hear of it (ChangedLevel); one may give the hero a line of its own to say
    const quest = this.quests.areaChanged(area, prev);
    // in the camp, what its people may say now is fetched ahead, the line they'll say next first
    this.fetchAhead();
    // decode what's heard here and in the areas next to it, so it plays recorded from the first time
    // (in the camp, after that line: Sfx.preload)
    void this.sfx.preload(soundsNear(area, this.areasNext(area), isNight(this.clock), p.cls));
    const line = (prev && how !== 'respawn' && quest) || this.arrivalLine(area, prev, how);
    if (prev && prev.kind !== area.kind) this.leftKind.set(prev.kind, this.time);
    if (area.kind === 'dungeon') this.wentUnder = true;
    if (line) this.say(line);
    this.hooks.areaChanged(area, prev);
  }

  /**
   * What the hero says coming into `area` from `prev`: walking out of the camp, back into it,
   * underground the first time this game; not as a game starts or a dead hero is brought back, nor
   * walking back into a kind of area left a moment ago (REENTRY)
   */
  private arrivalLine(area: AreaDef, prev: AreaDef | null, how: Arrival | 'walk' | null): HeroLine | null {
    if (!prev || prev.kind === area.kind || how === 'start' || how === 'respawn') return null;
    if (area.kind === 'dungeon' && this.wentUnder) return null;
    if (how === 'walk' && this.time - (this.leftKind.get(area.kind) ?? -Infinity) < REENTRY) return null;
    return ENTER_LINE[area.kind];
  }

  /** the areas next to `area` on this map: across its seams, and where its ways on lead (stairs, exits, a portal) */
  private areasNext(area: AreaDef): AreaDef[] {
    const L = this.level;
    const out = new Set<number>();
    for (const sm of (L.layout as Partial<Overworld>).seams ?? []) {
      if (sm.a === area.id) out.add(sm.b);
      else if (sm.b === area.id) out.add(sm.a);
    }
    for (const o of L.objects) {
      const way = o.kind === 'stairs' || o.kind === 'exit' || o.kind === 'portal';
      if (way && !o.closed && o.dest !== undefined && L.areaAt(o.pos.x, o.pos.z) === area) out.add(o.dest);
    }
    out.delete(area.id);
    return [...out].flatMap((id) => areaDef(id) ?? []);
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

  /**
   * put the items that fit nowhere (old saves, bigger D2 items), and the ones this build doesn't
   * know, on the ground around the stash
   */
  private layOutUnplaced(level: Level) {
    const p = this.player;
    // the camp is kept while the game lasts: what lies there already stays where it is
    const fresh = p.unplaced.filter((it) => !level.ground.some((g) => g.item === it));
    if (!fresh.length) return;
    const stash = level.objects.find((o) => o.kind === 'stash' && level.inTown(o.pos));
    const at = stash ? stash.pos : level.layout.start;
    fresh.forEach((it, i) => {
      const a = (i / fresh.length) * Math.PI * 2;
      const r = 1.6 + (i % 2) * 0.7;
      const spot = level.map.nearestWalkable(at.x + Math.sin(a) * r, at.z + Math.cos(a) * r) ?? at;
      level.ground.push(new GroundItem(spot, it, 0));
    });
    const unknown = fresh.filter(isUnknown).length;
    if (unknown < fresh.length) this.hooks.message(`${fresh.length - unknown} 件物品背包和储物箱都放不下，放在了储物箱旁边`, '#c8a86a', 5);
    if (unknown && !this.toldUnknown) {
      this.hooks.message(`${unknown} 件物品这个版本认不出，原样放在了储物箱旁边`, '#c8a86a', 5);
      this.toldUnknown = true;
    }
  }

  refreshShop() {
    // Diablo II's camp shelves for the one merchant: Charsi's weapons and armour, Akara's staves, potions, scrolls and tomes
    this.shop = fillStore(CAMP_VENDORS, Math.max(1, this.player.level), this.player.difficulty);
  }

  respawn() {
    const p = this.player;
    // the body stays where the hero fell, with the gear, as the death plays out (game/corpse.ts)
    if (p.dead) this.leaveCorpse();
    p.dead = false;
    p.recalc();
    p.life = p.stats.maxLife;
    p.mana = p.stats.maxMana;
    p.stamina = p.stats.maxStamina;
    p.poisonTime = 0;
    p.chillTime = 0;
    // the curses and auras' marks go with the death (STATES_UpdateStayDeathFlags, PlrModes.cpp:1379-1390: what doesn't stay through it)
    p.ampTime = p.ampRes = 0;
    p.convictTime = p.convictRes = p.convictDef = 0;
    p.healQueue = [];
    p.manaQueue = [];
    // in the camp again, as D2 brings a dead hero back in town
    this.enterArea(CAMP_AREA, 'respawn');
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
    // self-repairing items mend a point now and then, on the shared pages too while they can change
    p.mendItems(dt, this.shared.readOnly ? [] : this.shared.pages);
    this.quests.update(dt);
    // only the monsters near the hero act; the rest are out of play until the hero comes back
    // (MonsterGrid), and so cost nothing. They go in the grid's order, cell by cell, not the list's:
    // one added to the level during a step would wait for the next (none is: spawn.ts fills a map
    // as it is made, and a raised corpse is one of those already)
    const stepped = this.stepped;
    stepped.length = 0;
    L.monstersNear(p.pos, ACTIVE_RADIUS, stepped);
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
    this.updateAuras(dt);
    this.separate(dt);
    // the ones that walked, were knocked back or pushed apart: into the cells they're in now
    L.monstersMoved(stepped);
    this.updateProjectiles(dt);
    this.updateHammers(dt);
    for (const b of L.blasts) {
      b.delay -= dt;
      if (b.delay <= 0 && !b.done) {
        b.done = true;
        if (b.fx) this.fx.burst(b.fx, b.pos, { radius: b.radius });
        blastDamage(this, b);
      }
    }
    L.blasts = L.blasts.filter((b) => !b.done);
    // ground items: animate & auto-pickup gold
    for (const gi of L.ground) {
      gi.age += dt;
      if (gi.gold > 0 && gi.age > 0.5 && !p.dead && dist(gi.pos, p.pos) < 1.1) this.pickupGround(gi);
    }
    for (const o of L.objects) if (o.used) o.usedTime += dt;
    // exits are walked through
    if (!p.dead) {
      const exit = L.objects.find((o) => o.kind === 'exit' && dist(o.pos, p.pos) < o.radius);
      if (exit?.closed) this.tellClosed(exit);
      else if (exit) {
        this.enterArea(exit.dest, 'exit');
        return;
      } else this.atClosed = null;
    }
    this.updateArea(false, 'walk');
    this.layOutCorpses();
    // corpse cleanup; the corpses far off, which no step aged, catch up first, on the time spent on
    // this map: those on a map the hero is away from keep, as when every corpse was stepped (D2
    // instead keeps 1 in 3 ordinary corpses of a room it untiles, none of uniques or minions: D2Game
    // UNIT/SUnitInactive.cpp SUNITINACTIVE_CompressUnitIfNeeded)
    if (L.monsters.length > 0 && Math.random() < 0.02) {
      for (const m of L.monsters) {
        if (!m.dead) continue;
        m.deathTime += L.time - (this.aged.get(m) ?? L.time);
        this.aged.set(m, L.time);
      }
      const kept = L.monsters.filter((m) => !m.dead || m.deathTime < 40);
      // a new list is bucketed anew (Level.monstersNear): only when one went; the gone leave their packs' lists too
      if (kept.length < L.monsters.length) {
        for (const m of L.monsters) if (m.dead && m.deathTime >= 40) corpseGone(this, m);
        L.monsters = kept;
      }
    }
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
      if (!monster) object = this.picker.pickObject(inp.mx, inp.my, this.level.objects.filter((o) => !(o.used && (o.kind === 'chest' || o.kind === 'barrel' || o.kind === 'shrine'))));
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
      if (o.used && (o.kind === 'chest' || o.kind === 'barrel' || o.kind === 'shrine')) continue;
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

  // ───────────────────────── combat helpers ─────────────────────────

  private updateAuras(dt: number) {
    const p = this.player;
    if (p.dead) return;
    // the aura switched on, and any from items (Insight's Meditation, Infinity's Conviction…)
    const auras: { id: string; lvl: number }[] = [];
    if (p.activeAura && p.skillLevel(p.activeAura) > 0) auras.push({ id: p.activeAura, lvl: p.skillLevel(p.activeAura) });
    for (const a of p.stats.itemAuras) if (!auras.some((x) => x.id === a.id)) auras.push(a);
    this.auraPulse -= dt;
    const pulse = this.auraPulse <= 0;
    if (pulse) this.auraPulse = 1;
    for (const a of auras) this.updateAura(a.id, a.lvl, pulse);
  }

  private updateAura(aura: string, lvl: number, pulse: boolean) {
    const p = this.player;
    const sp = p.skillParams(aura, lvl);
    const radius = sp.radius ?? 5;
    const inRange = this.level.monstersTouching(p.pos, radius).filter((m) => !m.dead && dist(m.pos, p.pos) <= radius + m.radius);
    if (aura === 'holy_freeze') {
      for (const m of inRange) {
        m.chillTime = Math.max(m.chillTime, 0.3);
        m.chillAmount = sp.slow / 100;
      }
    }
    if (aura === 'conviction') {
      for (const m of inRange) {
        m.convictRes = sp.res;
        m.convictDef = sp.def;
      }
    }
    if (!pulse) return;
    if (aura === 'prayer') {
      if (p.life < p.stats.maxLife) p.life = Math.min(p.stats.maxLife, p.life + sp.heal);
    } else if (aura === 'holy_fire' || aura === 'holy_freeze') {
      this.fx.burst(aura === 'holy_fire' ? 'holyfire' : 'freeze', p.pos, { radius });
      for (const m of inRange) {
        const pk = emptyPacket();
        if (aura === 'holy_fire') pk.fire = randInt(sp.min, sp.max);
        else {
          pk.cold = randInt(sp.min, sp.max);
          pk.chill = 1;
        }
        pk.source = p;
        pk.spell = true;
        pk.pierceRes = p.stats.pierceRes;
        applyDamage(this, m, pk, p.pos);
      }
    }
  }

  /**
   * Bodies that overlap pushed apart, by their weights; a monster that isn't walking no faster than
   * STILL_PUSH, the rest of it on the hero or the monster walking into it, which so goes round it.
   * The hero charging shoves what stands aside.
   */
  private separate(dt: number) {
    const p = this.player;
    const list = this.level.monstersNear(p.pos, ACTIVE_RADIUS).filter((m) => !m.dead && dist(m.pos, p.pos) < ACTIVE_RADIUS);
    const actors: { pos: P2; radius: number; w: number; still: boolean }[] = [];
    const charging = !p.dead && p.state === 'charge';
    if (!p.dead) actors.push({ pos: p.pos, radius: p.radius, w: charging ? 0.05 : 0.2, still: false });
    for (const m of list) actors.push({ pos: m.pos, radius: m.radius, w: m.rank === 'boss' ? 0.25 : 1, still: m.state !== 'move' && m.fleeTime <= 0 });
    const cap = STILL_PUSH * dt;
    const n = actors.length;
    for (let i = 0; i < n; i++) {
      const a = actors[i];
      for (let j = i + 1; j < n; j++) {
        const b = actors[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const r = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = r - d;
        const nx = d2 > 1e-6 ? dx / d : Math.random() - 0.5;
        const nz = d2 > 1e-6 ? dz / d : Math.random() - 0.5;
        let sa = (push * a.w) / (a.w + b.w);
        let sb = push - sa;
        if (!(charging && i === 0)) {
          if (a.still && sa > cap) {
            if (!b.still) sb += sa - cap;
            sa = cap;
          }
          if (b.still && sb > cap) {
            if (!a.still) sa += sb - cap;
            sb = cap;
          }
        }
        a.pos.x -= nx * sa;
        a.pos.z -= nz * sa;
        b.pos.x += nx * sb;
        b.pos.z += nz * sb;
      }
    }
    if (!p.dead) p.pos = this.level.map.resolveCircle(p.pos, p.radius);
    // pushed about, monsters still keep out of a town (Level.monsterMap)
    for (const m of list) m.pos = this.level.monsterMap.resolveCircle(m.pos, m.radius);
  }

  private updateProjectiles(dt: number) {
    const L = this.level;
    const p = this.player;
    for (const pr of L.projectiles) {
      pr.age += dt;
      pr.life -= dt;
      if (pr.kind === 'chargedbolt') {
        const a = (Math.random() - 0.5) * 6 * dt;
        const c = Math.cos(a);
        const s = Math.sin(a);
        pr.vel = { x: pr.vel.x * c - pr.vel.z * s, z: pr.vel.x * s + pr.vel.z * c };
      }
      pr.pos.x += pr.vel.x * dt;
      pr.pos.z += pr.vel.z * dt;
      if (!L.map.walkableAt(pr.pos.x, pr.pos.z)) {
        this.projectileImpact(pr);
        continue;
      }
      if (pr.faction === 'monster') {
        if (!p.dead && dist(pr.pos, p.pos) < pr.radius + p.radius) {
          if (pr.owner && (pr.owner as Monster).def) monsterStrike(this, pr.owner as Monster, p, { ...pr.dmg });
          else applyDamage(this, p, { ...pr.dmg }, pr.pos);
          this.projectileImpact(pr);
        }
      } else {
        for (const m of L.monstersTouching(pr.pos, pr.radius)) {
          if (m.dead || pr.hit.has(m.id)) continue;
          if (dist(pr.pos, m.pos) < pr.radius + m.radius) {
            pr.hit.add(m.id);
            applyDamage(this, m, { ...pr.dmg }, pr.pos);
            if (!pr.pierce) {
              this.projectileImpact(pr);
              break;
            }
          }
        }
      }
      if (pr.life <= 0) pr.dead = true;
    }
    L.projectiles = L.projectiles.filter((x) => !x.dead);
  }

  private projectileImpact(pr: Projectile) {
    pr.dead = true;
    if (pr.splash > 0) {
      const cold = pr.splashKind === 'cold';
      this.fx.burst(cold ? 'ice_shatter' : 'fireblast', pr.pos, { radius: pr.splash });
      this.sfx.play(cold ? 'skill.cold_impact' : 'skill.fire_impact', { pos: pr.pos, vol: 0.6 });
      const p = this.player;
      if (pr.faction === 'monster' && !p.dead && dist(pr.pos, p.pos) < pr.splash + p.radius && !pr.hit.has(p.id)) {
        applyDamage(this, p, { ...pr.dmg, spell: true }, pr.pos);
      } else if (pr.faction === 'player') {
        // the monster hit head-on already took the full packet
        for (const m of this.level.monstersTouching(pr.pos, pr.splash)) {
          if (!m.dead && !pr.hit.has(m.id) && dist(pr.pos, m.pos) < pr.splash + m.radius) applyDamage(this, m, { ...pr.dmg, spell: true }, pr.pos);
        }
      }
    }
  }

  private updateHammers(dt: number) {
    const L = this.level;
    for (const h of L.hammers) {
      h.update(dt);
      for (const m of L.monstersTouching(h.pos, 0.55)) {
        if (m.dead) continue;
        if (dist(h.pos, m.pos) > 0.55 + m.radius) continue;
        const last = h.lastHit.get(m.id);
        if (last !== undefined && h.t - last < 0.5) continue;
        h.lastHit.set(m.id, h.t);
        applyDamage(this, m, { ...h.dmg }, h.center);
      }
    }
    L.hammers = L.hammers.filter((h) => !h.dead);
  }

  /**
   * A lightning-enchanted monster's charged bolts (MONSTERUNIQUE_CastLightUniqueMissile, MonsterUnique.cpp:1139-1191):
   * two toward each of the four ways round it, lightunique missiles at half its level with their own
   * lightning, at their velocity (75 %, the hero's scale) for their Range, wandering as charged bolts do
   */
  chargedBolts(m: Monster) {
    const b = lightEnchantBolts(m.level);
    for (let i = 0; i < 8; i++) {
      const a = (Math.floor(i / 2) * Math.PI) / 2 + rand(-0.5, 0.5);
      const pk = emptyPacket();
      pk.light = randInt(b.light[0], b.light[1]);
      pk.source = m;
      pk.spell = true;
      const pr = new Projectile('chargedbolt', m.pos, { x: Math.sin(a) * b.speed, z: Math.cos(a) * b.speed }, null, 'monster', pk, b.life, 0.2);
      this.level.projectiles.push(pr);
    }
    this.sfx.play('skill.lightning_cast', { pos: m.pos, vol: 0.25 });
  }

  /** a monster struck before it noticed the hero: it notices them, its pack with it, as seeing them has it (src/game/ai.ts notice) */
  wake(m: Monster) {
    notice(this, m);
  }

  killMonster(m: Monster, elem: Elem) {
    if (m.dead) return;
    const p = this.player;
    m.dead = true;
    m.life = 0;
    m.deathTime = 0;
    m.killedBy = elem;
    m.setState('dead');
    m.path = null;
    m.move = null;
    m.act = null;
    // a cold kill shatters it (the renderer draws it so): no shaman raises it (D2's freeze state, STATES_CheckStateMaskUdeadOnUnit)
    m.corpseRaisable = elem !== 'cold';
    this.aged.set(m, this.level.time);
    monsterDied(this, m);
    // Diablo II's experience for the kill (SUNITDMG_ComputeExperienceGain: game/d2/xp.ts killXp):
    // the level gap's two tables, ExpRatio, then "+X% experience gained" and the shrine's on top;
    // none for a raised or summoned one, nor a drop (UNITFLAG_NOXP | UNITFLAG_NOTC)
    const addPct = (p.shrine ? (SHRINE_BY_ID[p.shrine.id].xpPct ?? 0) : 0) + (p.stats.bag.xpPct ?? 0);
    const gained = m.noXp ? 0 : p.gainXp(Math.floor(killXp(m.xp, p.level, m.level, addPct) * debugOpts.xp));
    if (gained > 0) {
      this.onProc('procLevelUp', null);
      this.celebrateLevelUp();
    }
    const d = p.stats;
    this.onProc('procKill', m);
    if (m.def.demon && d.bag.demonHeal) p.life = Math.min(d.maxLife, p.life + d.bag.demonHeal);
    if (d.lifePerKill) p.life = Math.min(d.maxLife, p.life + d.lifePerKill);
    if (d.manaPerKill) p.mana = Math.min(d.maxMana, p.mana + d.manaPerKill);
    // loot
    if (!m.noXp) this.spawnDrops(m.pos, this.rollLoot((hero) => monsterLoot(m, hero)));
    // the quests count it (MonsterKilled): the Den of Evil's last one done
    this.quests.monsterKilled(m);
    // and the rift's progress
    this.rift.killed(m);
    // fx
    this.fx.death(m, m.def.blood, elem);
    // its look's death cry (src/data/monsters.ts voice), a big one's or a boss's the large one
    const big = m.rank === 'boss' || m.def.scale >= LARGE_MONSTER;
    const snd = m.def.voice === 'bone' ? 'monster.die_bone' : big ? 'monster.die_large' : m.def.voice === 'imp' ? 'monster.die_imp' : 'monster.die';
    this.sfx.play(snd, { pos: m.pos });
    // a fire-enchanted (MonUMod 9) leader bursts as it dies, a cold-enchanted (18) one freezes round it
    // (src/game/d2/monstats.ts): only a champion's or unique's mode change sets them off, not its minions'
    // (MonsterUnique.cpp:1052-1058, 2016-2020: bUnique is MONTYPEFLAG_UNIQUE, which a minion hasn't)
    if (m.hasOwn(9)) {
      const b = fireEnchantBurst(m.def.row, m.difficulty, m.level, randInt);
      const pk = emptyPacket();
      pk.phys = b.phys;
      pk.fire = b.fire;
      pk.spell = true;
      pk.source = m;
      this.level.blasts.push(new DelayedBlast(m.pos, b.radius, 0.45, pk, 'monster', 'fire', m));
      setTimeout(() => {
        this.fx.burst('fireblast', m.pos, { radius: b.radius });
        this.sfx.play('skill.fire_impact', { pos: m.pos, vol: 0.7 });
      }, 400);
    }
    if (m.hasOwn(18)) {
      const b = coldEnchantBurst(m.level);
      const pk = emptyPacket();
      pk.cold = randInt(b.cold[0], b.cold[1]);
      pk.chill = b.chill;
      pk.spell = true;
      pk.source = m;
      this.level.blasts.push(new DelayedBlast(m.pos, b.radius, 0.1, pk, 'monster', 'frost', m));
      this.fx.burst('frostnova', m.pos, { radius: b.radius });
      this.sfx.play('skill.cold_impact', { pos: m.pos, vol: 0.7 });
    }
    if (m.rank === 'boss') {
      this.fx.shake(0.8);
      this.hooks.message(`${m.displayName} 被击败了！`, '#c8a86a', 4);
      this.say('boss_dead');
      this.save();
    }
  }

  /** chance-to-cast mods on the player's gear, for one kind of event */
  /** the burst, sound and message of a level gained */
  celebrateLevelUp() {
    const p = this.player;
    this.fx.burst('levelup', p.pos);
    this.sfx.play('player.level_up', { pos: p.pos });
    this.hooks.message(`等级提升！你现在是 ${p.level} 级`, '#ffd24a', 3);
    this.say('level_up');
    this.hooks.levelUp();
  }

  /** loot from a monster or a container (src/game/loot.ts) for the hero, rolled once more for each extra pass the debug panel asks for */
  private rollLoot(roll: (hero: Finder) => Item[]): Drop[] {
    const s = this.player.stats;
    const p = this.player;
    // a rift's floors drop in its tier's difficulty, never a quest's class: its kills are no quest's
    const hero: Finder = { mf: s.mf, gf: s.gf, difficulty: p.rules, quests: p.ruled === null ? p.quests[p.difficulty] : 'done' };
    const drops: Drop[] = [];
    for (let i = 0; i < debugOpts.loot; i++) for (const item of roll(hero)) drops.push({ kind: 'item', item });
    return drops;
  }

  onProc(kind: StatKey, target: Monster | null) {
    const p = this.player;
    for (const m of p.stats.procs) {
      if (m.stat !== kind || !chance(m.value / 100)) continue;
      castItemSkill(this, p, (SKILL_BY_ID[m.param ?? ''] ? m.param : D2_TO_GAME[m.param ?? ''])!, m.lvl ?? 1, target && !target.dead ? target : null);
    }
  }

  killPlayer() {
    const p = this.player;
    if (p.dead) return;
    if (debugOpts.god) {
      p.life = p.d.maxLife;
      return;
    }
    this.onProc('procDeath', null);
    p.dead = true;
    p.life = 0;
    p.setState('dead');
    p.intent = null;
    // Diablo II's death penalty as the death starts (PLAYER_ApplyDeathPenalty: game/d2/death.ts):
    // min(level, 20) % of all the gold, the inventory's first, and in nightmare and hell some of
    // the level's experience; the gold left in the inventory drops by the body (leaveCorpse). The
    // shared pages' gold is out of reach of it, as in D2R
    const pen = deathPenalty({ level: p.level, xp: p.xp, gold: p.gold, stashGold: p.stashGold, diff: p.rules });
    p.gold = pen.goldDropped;
    p.stashGold = pen.stashGold;
    p.xp = pen.xp;
    this.lastDeath = pen;
    this.sfx.play('player.death', { pos: p.pos });
    this.fx.death(p, 'red', 'phys');
    this.hooks.playerDied();
  }

  /**
   * The body left where the hero fell once the death has played out (D2GAME_CORPSE_Handler,
   * PlrModes.cpp:429-650): all that was worn and the cursor's item on it (game/corpse.ts), the belt's
   * potions past its first row into the inventory or onto the ground, the inventory's gold in a
   * pile beside it
   */
  private leaveCorpse() {
    const p = this.player;
    const L = this.level;
    const cursor = this.hooks.getCursorItem();
    if (cursor) this.hooks.setCursorItem(null);
    const r = leaveBody(p, cursor, { level: L, pos: p.pos, area: L.areaAt(p.pos.x, p.pos.z).id }, this.lastDeath?.corpseXp ?? 0);
    const ground = [...r.dropped, ...r.loose.filter((it) => !p.inventory.add(it))];
    if (ground.length) this.spawnDrops(p.pos, ground.map((item): Drop => ({ kind: 'item', item })));
    if (p.gold > 0) {
      L.ground.push(new GroundItem(p.pos, null, p.gold, p.pos));
      p.gold = 0;
    }
    this.layOutCorpses();
    this.hooks.inventoryChanged();
  }

  /**
   * Each body on the map it lies on. One whose map this game has let go of (a trial floor two
   * floors back), and one read from a save, waits in the camp by the way in, as D2 sets a saved body
   * down in town (PLRSAVE2_ReadCorpses, PlrSave2.cpp:1104-1203). Cheap enough to run every frame.
   */
  private layOutCorpses() {
    const p = this.player;
    if (!p.corpses.length) return;
    const L = this.level;
    // the maps this game keeps (levelFor), and the one the hero is on
    const live = new Set<object>([L]);
    for (const l of [this.west, this.den, this.gallery, this.lastDungeon, this.portalLevel, ...this.rift.levels()]) if (l) live.add(l);
    // the map holding the camp: the overworld, or ?gallery's showroom (its start is the camp's)
    const camp = L.inTown(L.layout.start);
    p.corpses.forEach((c, i) => {
      if (c.level && !live.has(c.level)) {
        c.level = null;
        c.pos = null;
      }
      if (!(c.level === L || (!c.level && camp)) || L.objects.some((o) => o.corpse === c)) return;
      let pos = c.level ? c.pos : null;
      if (!pos) {
        const a = 2.4 + i * 0.9;
        pos = L.map.nearestWalkable(L.layout.start.x + Math.sin(a) * 2.2, L.layout.start.z + Math.cos(a) * 2.2) ?? L.layout.start;
      }
      const o = new WorldObject('corpse', pos, `${p.name}的尸体`, 0.7);
      o.corpse = c;
      L.objects.push(o);
    });
  }

  /**
   * The hero takes a body back: the experience it holds, given back as it is (PlrModes.cpp:713-722),
   * then its items (game/corpse.ts takeBody). What fits nowhere stays on it.
   */
  private takeCorpse(o: WorldObject) {
    const p = this.player;
    const c = o.corpse;
    if (!c) return;
    if (c.xp > 0) {
      const gained = p.gainXp(c.xp);
      c.xp = 0;
      if (gained) {
        this.onProc('procLevelUp', null);
        this.celebrateLevelUp();
      }
    }
    const taken = takeBody(p, c, (it) => this.beltInsert(it));
    if (bodyItems(c).length) {
      this.hooks.message('背包放不下尸体上剩下的物品', '#ff6060', 2);
      this.sfx.play('ui.no_room');
    } else {
      this.level.objects = this.level.objects.filter((x) => x !== o);
      p.corpses = p.corpses.filter((x) => x !== c);
      this.sfx.play('item.equip', { pos: p.pos });
    }
    if (taken) {
      p.markDirty();
      this.hooks.inventoryChanged();
    }
  }

  spawnDrops(pos: P2, drops: Drop[]) {
    const map = this.level.map;
    for (const d of drops) {
      let spot: P2 = pos;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 1.1;
        const c = { x: pos.x + Math.sin(a) * r, z: pos.z + Math.cos(a) * r };
        if (map.walkableAt(c.x, c.z) && map.los(pos, c)) {
          spot = c;
          break;
        }
      }
      if (isGold(d.item)) {
        // gold lies as a pile, picked up into the purse
        this.level.ground.push(new GroundItem(spot, null, d.item.qty ?? 1, pos));
        this.sfx.play('item.gold', { pos: spot });
      } else {
        this.level.ground.push(new GroundItem(spot, d.item, 0, pos));
        const it = d.item;
        const b = baseOf(it);
        // each kind of item lands with its own sound (a rune's is its stinger); a unique's stinger goes over it
        const drop = DROP_SOUND[b.type] ?? 'item.drop';
        this.sfx.play(drop, { pos: spot });
        if (it.rarity === 'unique' || it.rarity === 'set') {
          this.sfx.play('item.drop_unique', { pos: spot });
          this.fx.burst('unique_drop', spot, { color: it.rarity === 'set' ? '#22d422' : '#c8a86a' });
        } else if (b.type === 'rune') this.fx.burst('unique_drop', spot, { color: '#ffa31a' });
      }
    }
  }

  dropItem(item: Item) {
    const p = this.player;
    const a = p.facing;
    const spot = { x: p.pos.x + Math.sin(a) * 0.8, z: p.pos.z + Math.cos(a) * 0.8 };
    const ok = this.level.map.walkableAt(spot.x, spot.z) ? spot : { ...p.pos };
    this.level.ground.push(new GroundItem(ok, item, 0, p.pos));
    const dropped = DROP_SOUND[baseOf(item).type] ?? 'item.drop';
    this.sfx.play(dropped, { pos: ok });
  }

  /**
   * Why `item` can't be put on the ground, or null: the cube, whose contents are kept apart
   * (Player.cube), and an item this build can't read (isUnknown), kept as it was for a build that
   * can. Nothing the hero holds is thrown away by a click; ground items aren't kept in the save
   */
  dropBlock(item: Item): string | null {
    if (baseOf(item).type === 'cube') return '魔盒不能丢在地上：里面的东西会跟着丢失';
    if (isUnknown(item)) return '这个版本认不出这件物品，不能丢在地上';
    return null;
  }

  /** `item` can't go on the ground (dropBlock): the hero is told, and true */
  refuseDrop(item: Item): boolean {
    const why = this.dropBlock(item);
    if (!why) return false;
    this.hooks.message(why, '#ff6060', 2);
    this.sfx.play('ui.cant_use');
    return true;
  }

  /**
   * An item ctrl+clicked in the bag with no stash, cube or merchant open: out of the bag onto the
   * ground by the hero, as from the cursor (dropItem), in the camp too. D2R's: D2 1.x drops only what
   * is on the cursor (Rcv0x17_DropItemOnGround, D2Game PlrMsg.cpp:1851-1877). Not by a dead hero,
   * nor the cube or an item this build can't read (refuseDrop, which says why)
   */
  dropFromBag(item: Item): boolean {
    const p = this.player;
    if (p.dead || !this.level || !p.inventory.contains(item) || this.refuseDrop(item)) return false;
    p.inventory.remove(item);
    this.dropItem(item);
    // a charm works from the bag only (Player.activeCharms)
    p.markDirty();
    return true;
  }

  // ───────────────────────── items & interaction ─────────────────────────

  /**
   * Put `item` in the belt where Diablo II would (items/belt.ts freeBeltColumn): beside its own
   * kind, else a potion D2 belts by itself into an empty column. False, and nothing moved, when there
   * is no such place
   */
  beltInsert(item: Item): boolean {
    const p = this.player;
    const col = freeBeltColumn(p.belt, p.beltRows(), item);
    if (col < 0) return false;
    p.belt[col].push(item);
    return true;
  }

  /**
   * An item picked up or bought into the belt, where D2 puts one by itself (items/belt.ts
   * autoBeltable: a potion, never a scroll): false, and nothing moved, when it doesn't go there
   */
  autoBeltInsert(item: Item): boolean {
    return autoBeltable(this.player.belt, item) && this.beltInsert(item);
  }

  /** whether the hero holds `it` where it can be read from: a grid (heldGrids) or the belt */
  private holds(it: Item): boolean {
    return this.heldGrids().some((g) => g.contains(it)) || this.player.belt.some((c) => c.includes(it));
  }

  /**
   * Read a scroll or tome the hero holds (tomes.ts readFrom): a tome loses a charge, a scroll is used
   * up, one in the belt too. False when it isn't held or there is nothing left to read
   */
  readHeld(it: Item): boolean {
    if (readFrom(this.heldGrids(), it)) return true;
    const col = this.player.belt.find((c) => c.includes(it));
    if (!col || !readable(it)) return false;
    col.splice(col.indexOf(it), 1);
    return true;
  }

  pickupGround(gi: GroundItem) {
    const L = this.level;
    const idx = L.ground.indexOf(gi);
    if (idx < 0) return;
    const p = this.player;
    if (gi.gold > 0) {
      p.gold += gi.gold;
      L.ground.splice(idx, 1);
      this.sfx.play('item.gold', { pos: gi.pos });
      this.fx.text(gi.pos, `${gi.gold} 金币`, '#e8d890');
      this.hooks.inventoryChanged();
      return;
    }
    const item = gi.item!;
    const taken = () => {
      L.ground.splice(idx, 1);
      const k = p.unplaced.indexOf(item);
      if (k >= 0) p.unplaced.splice(k, 1);
      this.sfx.play('item.pickup', { pos: gi.pos });
    };
    // a scroll goes into a tome of its kind in the bag with room, a tome's charges into one (the
    // rest stay on it, on the ground), as D2 picks them up (ItemMode.cpp:1173-1191, tomes.ts)
    const tome = isBookScroll(item) ? fillableTome(p.inventory, item) : undefined;
    if (tome && scrollIntoTome(item, tome)) {
      taken();
      this.hooks.message(`${displayName(item)}放进了${displayName(tome)}（${tomeCharges(tome)}/${tomeMax(tome)}）`, '#c8a86a', 1.2);
      this.hooks.inventoryChanged();
      return;
    }
    const merged = isTome(item) ? mergeTome(p.inventory, item) : undefined;
    if (merged) {
      if (merged.gone) taken();
      else this.sfx.play('item.pickup', { pos: gi.pos });
      this.hooks.message(`${displayName(item)}的卷轴并进了背包里的那本（${tomeCharges(merged.into)}/${tomeMax(merged.into)}）`, '#c8a86a', 1.2);
      this.hooks.inventoryChanged();
      return;
    }
    if (this.autoBeltInsert(item) || p.inventory.add(item)) {
      taken();
      // a find worth a word, the first time it's picked up
      const find: HeroLine | null = item.rarity === 'unique' ? 'unique' : item.rarity === 'set' ? 'set_item' : baseOf(item).type === 'rune' ? 'rune' : null;
      if (find && !this.remarked.has(item)) {
        this.remarked.add(item);
        this.say(find);
      }
      this.hooks.inventoryChanged();
    } else {
      this.hooks.message('背包已满', '#ff6060', 1.5);
      this.sfx.play('ui.no_room');
      this.say('bag_full');
    }
  }

  /** a potion this game has an effect for: healing, mana, rejuvenation (not stamina, antidote, thawing yet) */
  drinkable(item: Item): boolean {
    const b = baseOf(item);
    return b.type === 'potion' && !!(b.heal || b.manaHeal || b.rejuv);
  }

  drink(item: Item) {
    const p = this.player;
    const b = baseOf(item);
    // D2's potions: their Misc.txt amount over their length, by the class's share (CharStats
    // HealthPotionPercent / ManaPotionPercent: game/d2/stats.ts potionHeal)
    const cs = charStats(p.cls);
    if (b.heal) {
      const sec = b.healSec ?? 3;
      p.healQueue.push({ perSec: potionHeal(cs, 'life', b.heal) / sec, left: sec });
      this.fx.burst('potion_hp', p.pos);
    }
    if (b.manaHeal) {
      const sec = b.manaSec ?? 3;
      p.manaQueue.push({ perSec: potionHeal(cs, 'mana', b.manaHeal) / sec, left: sec });
      this.fx.burst('potion_mp', p.pos);
    }
    if (b.rejuv) {
      p.life = Math.min(p.stats.maxLife, p.life + p.stats.maxLife * b.rejuv);
      p.mana = Math.min(p.stats.maxMana, p.mana + p.stats.maxMana * b.rejuv);
      this.fx.burst('potion_hp', p.pos);
      this.fx.burst('potion_mp', p.pos);
    }
    this.sfx.play('item.drink', { pos: p.pos });
  }

  /**
   * The belt's column `col` used (its key, or a right click on it): its bottom item drunk, or a
   * scroll read as from the bag, town portal cast, identify's cursor taken up
   */
  useBelt(col: number) {
    const p = this.player;
    if (p.dead) return;
    const stack = p.belt[col];
    if (!stack) return;
    if (!stack.length) return this.say('no_potion');
    if (isTownPortal(stack[0])) return this.castTownPortal(stack[0]);
    if (stack[0].baseId === 'isc') return this.hooks.identifyWith?.(stack[0]);
    if (!this.drinkable(stack[0])) return;
    const item = stack.shift()!;
    this.drink(item);
    this.hooks.inventoryChanged();
  }

  interact(obj: WorldObject) {
    const p = this.player;
    if (this.rift.use(obj)) return;
    switch (obj.kind) {
      case 'chest': {
        if (obj.used) return;
        obj.used = true;
        this.sfx.play('env.chest', { pos: obj.pos });
        this.fx.burst('chest', obj.pos);
        // the area it stands in's Chest A, B or C at the area's level, as D2 rolls a chest's treasure
        // class by its level's (src/game/loot.ts containerLoot; D2Game OBJECTS/ObjMode.cpp
        // OBJMODE_DropFromChestTCWithQuality: DATATBLS_GetMonsterLevelInArea)
        const area = this.level.areaAt(obj.pos.x, obj.pos.z);
        const drops = this.rollLoot((hero) => containerLoot('chest', area, hero));
        // the Horadric Cube waits in the first chest opened in an area of level 4 or more (plan A2;
        // D2's is in the Halls of the Dead, in Act 2)
        if (areaLevel(area) >= 4 && !p.cubeFound) {
          p.cubeFound = true;
          const box = createItem('box');
          drops.push({ kind: 'item', item: box });
          this.hooks.message(`你找到了${displayName(box)}！`, '#c8a86a', 4);
        }
        this.spawnDrops(obj.pos, drops);
        break;
      }
      case 'barrel': {
        if (obj.used) return;
        obj.used = true;
        this.sfx.play('env.barrel', { pos: obj.pos });
        this.fx.burst('barrel', obj.pos);
        // the area's classes at its level, as a chest's
        const area = this.level.areaAt(obj.pos.x, obj.pos.z);
        this.spawnDrops(obj.pos, this.rollLoot((hero) => containerLoot('barrel', area, hero)));
        break;
      }
      case 'stairs':
        if (obj.closed) this.tellClosed(obj);
        else this.enterArea(obj.dest, 'stairs');
        break;
      case 'waypoint': {
        // using a waypoint activates it, in the difficulty being played (D2Game OBJECTS/ObjMode.cpp
        // OBJECTS_OperateFunction23_Waypoint: WAYPOINTS_ActivateWaypoint on pWaypointData[nDifficulty])
        const a = this.level.areaAt(obj.pos.x, obj.pos.z);
        if (!p.waypoints.includes(a.id) && builtWaypoints([a.id]).includes(a.id)) {
          p.waypoints = builtWaypoints([...p.waypoints, a.id]);
          this.hooks.message('传送点已激活', '#c8a86a', 2);
          this.say('waypoint');
          this.save();
        }
        this.hooks.openPanel('waypoint');
        break;
      }
      case 'vendor':
        this.talkTo(obj);
        break;
      case 'stash':
        this.hooks.openPanel('stash');
        break;
      case 'corpse':
        this.takeCorpse(obj);
        break;
      case 'exit':
        if (obj.closed) this.tellClosed(obj);
        else this.enterArea(obj.dest, 'exit');
        break;
      case 'shrine': {
        if (obj.used) return;
        obj.used = true;
        const def = SHRINE_BY_ID[obj.shrine ?? ''];
        if (!def) return;
        if (def.refill) {
          p.life = p.stats.maxLife;
          p.mana = p.stats.maxMana;
        } else {
          p.shrine = { id: def.id, left: def.secs };
          p.markDirty();
        }
        this.fx.burst('aura_switch', p.pos, { color: def.color });
        this.sfx.play('env.shrine', { pos: obj.pos });
        this.hooks.message(`${def.name}：${def.desc}`, def.color, 3);
        this.say('shrine');
        break;
      }
      case 'portal':
        this.sfx.play('env.portal_enter', { pos: obj.pos });
        this.enterArea(this.level.inTown(obj.pos) ? obj.dest : CAMP_AREA, 'portal');
        break;
    }
  }

  /** a way on to an area this build has no map of yet: said once while the hero is at it */
  private tellClosed(obj: WorldObject) {
    if (this.atClosed === obj) return;
    this.atClosed = obj;
    this.hooks.message(`通往${areaDef(obj.dest)?.name ?? '那里'}的路还没有开通`, '#aaa', 2);
  }

  /**
   * Speaking to a townsperson, as in Diablo II: Akara's heal first (D2GAME_NPC_Heal, SUnitNpc.cpp:
   * 2784-2802), then the line a quest has them say at once, if any (QUESTS_NPCActivateSpeeches: a
   * SCROLLMENU_MESSAGE line, such as Akara giving the Den of Evil), then their menu. That line is
   * returned (the tests hear it through npcSpoke)
   */
  talkTo(obj: WorldObject): Topic | null {
    this.vendorHeal(obj);
    const opening = obj.npcId ? this.quests.opening(obj.npcId) : null;
    if (this.hooks.npcMenu) this.hooks.npcMenu(obj, opening);
    else this.hooks.openPanel('shop');
    return opening;
  }

  /** what the townsperson says under 交谈: a quest's word for the hero, else their small talk */
  npcTalk(obj: WorldObject): Topic | null {
    return obj.npcId ? this.quests.talk(obj.npcId) : null;
  }

  /** a townsperson's line heard to the end, or cut short: a quest given, a reward handed over */
  npcSpoke(topic: Topic) {
    this.quests.spoke(topic);
    // what they'd say next has changed (the quest given: its reminder; their small talk's next line)
    this.fetchAhead();
  }

  /**
   * While the hero is in the camp, what its people may say next is fetched ahead (Sfx.prefetch, the
   * files only, decoded when they're said): on a slow connection a line said at once (Akara's quest,
   * her reward) would otherwise come late, a greeting after its moment. Each one's line a quest has
   * them open with first, then their greetings, what 交谈 has them say and their farewells, as things
   * stand; asked again as they change (a line heard, the hero back in the camp). The first of them is
   * the line said next: Sfx fetches it before anything else it fetches or warms here
   */
  private fetchAhead() {
    if (this.area?.kind !== 'town') return;
    const ids: VoiceId[] = [];
    const say = (t: Topic | null) => t && ids.push(npcLine(t.npc, t.id, t.quest));
    for (const o of this.level.objects) {
      if (!o.npcId) continue;
      say(this.quests.opening(o.npcId));
      ids.push(npcLine(o.npcId, 'greeting'));
      say(this.quests.nextTalk(o.npcId));
      ids.push(npcLine(o.npcId, 'farewell'));
    }
    this.sfx.prefetch(ids);
  }

  /** the hero turned from a townsperson (their menu shut) */
  npcLeft(obj: WorldObject) {
    if (obj.npcId) this.quests.left(obj.npcId);
  }

  /** like Akara in Diablo II: talking to the merchant puts life and mana back to full and cures poison, chill and the rest */
  private vendorHeal(vendor: WorldObject) {
    const p = this.player;
    const s = p.stats;
    if (p.life >= s.maxLife && p.mana >= s.maxMana && p.poisonTime <= 0 && p.chillTime <= 0 && p.bleedTime <= 0 && p.slowTime <= 0) return;
    p.life = s.maxLife;
    p.mana = s.maxMana;
    p.poisonTime = p.chillTime = p.bleedTime = p.slowTime = p.stunTime = 0;
    this.fx.burst('potion_hp', p.pos);
    this.fx.burst('potion_mp', p.pos);
    this.sfx.play('env.vendor_heal', { pos: p.pos });
    this.hooks.message(`${vendor.npc ?? '商人'}为你恢复了生命与法力`, '#c8a86a', 2);
  }

  openTownPortal() {
    const L = this.level;
    if (L.inTown(this.player.pos)) {
      this.hooks.message('你已经在营地里了', '#aaa', 1.5);
      this.say('cant_here');
      return;
    }
    // one town portal a hero: a new one closes the last, both its ends
    this.closePortals();
    const p = this.player;
    const a = p.facing;
    let pt = { x: p.pos.x + Math.sin(a) * 1.5, z: p.pos.z + Math.cos(a) * 1.5 };
    if (!L.map.circleClear(pt.x, pt.z, 0.4)) pt = { ...p.pos };
    const portal = new WorldObject('portal', pt, '回城传送门', 0.6);
    portal.dest = CAMP_AREA;
    L.objects.push(portal);
    this.portalLevel = L;
    this.fx.burst('portal', pt);
    this.sfx.play('env.portal_open', { pos: pt });
  }

  /**
   * Read a town portal (the P key, a right-click on a tome or scroll of town portal, or its belt
   * column used): the hero casts it from `from`, else from the bag's tome of town portal, then a
   * scroll of it in the bag, then one in the belt (tomes.ts townPortalFrom). Nothing to read it
   * from, or a tome with no charge left: the hero says so. In the camp nothing is read, as D2's town
   * portal fails there and uses nothing
   */
  castTownPortal(from?: Item) {
    const p = this.player;
    if (p.dead || !(p.state === 'idle' || p.state === 'move')) return;
    if (this.level.inTown(p.pos)) {
      this.hooks.message('你已经在营地里了', '#aaa', 1.5);
      this.say('cant_here');
      return;
    }
    const src = from ?? townPortalFrom(p.inventory, p.belt);
    if (!src || !isTownPortal(src) || !readable(src)) return this.noTownPortal(src);
    p.setState('cast', 0.7);
    this.playerAction = { skill: 'townportal', target: null, point: { ...p.pos }, item: src };
    p.intent = null;
  }

  /**
   * The cast town portal opens: its scroll is used up, or its tome loses a charge, now (a cast cut
   * short uses none). Read from `from` while the hero still holds it, in a grid or the belt, with
   * something left to read, else from what the bag and the belt have now
   */
  readTownPortal(from?: Item) {
    const p = this.player;
    if (this.level.inTown(p.pos)) return;
    const held = from && this.holds(from) && readable(from) ? from : townPortalFrom(p.inventory, p.belt);
    if (!held || !this.readHeld(held)) return this.noTownPortal(from);
    this.openTownPortal();
    this.hooks.inventoryChanged();
  }

  /**
   * No town portal to read: the hero says so (a message: no recorded line of theirs is for it), an
   * empty tome that it has nothing left
   */
  private noTownPortal(tome?: Item) {
    const empty = tome && isTome(tome);
    this.hooks.message(empty ? `${displayName(tome)}里没有卷轴了` : '没有城镇传送卷轴了', '#ff6060', 1.5);
    this.sfx.play('ui.cant_use');
  }

  /** by waypoint to area `id`: on the map the hero is on, a jump (teleportWithin). False when this build has no map of it */
  travel(id: number): boolean {
    if (!this.hasMap(id)) return false;
    this.sfx.play('env.waypoint', { pos: this.player.pos });
    return this.enterArea(id, 'waypoint');
  }

  /**
   * Go to an area as a waypoint does, touched or not, for the tools (the debug panel, the bench, the
   * bot): beside its waypoint, or where it starts. False when this build has no map of it
   */
  travelToArea(id: number): boolean {
    return this.travel(id);
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
    if (was && was !== this.gallery && here !== undefined) {
      if (trialFloor(here) !== undefined) this.enterArea(here, 'stairs');
      else this.enterArea(CAMP_AREA, 'waypoint');
    }
    this.save();
  }

  /** another difficulty's game, the hero not yet moved into it: its waypoints and penalties, no maps of the old one. False if it is the one played */
  private switchDifficulty(d: Difficulty): boolean {
    const p = this.player;
    if (d === p.difficulty) return false;
    // the waypoints so far stay with the difficulty they were touched in
    this.save();
    p.difficulty = d;
    // the resistances take the new difficulty's penalty
    p.markDirty();
    p.waypoints = savedWaypoints(p, d);
    this.closePortals();
    this.west = this.den = this.lastDungeon = null;
    // a game in another difficulty: its quests from that difficulty's record (D2 plays a difficulty a game)
    this.startQuests();
    return true;
  }
}
