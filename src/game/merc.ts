// The hero's hireling (M2a, docs/M2A-STEP0.md 2.3): Kashya's Rogue Scout. What the hero keeps of her,
// on the map or not, is Player.merc (MercState, saved with the hero as SaveV4.merc in the same write:
// src/game/save.ts); Merc is she as she stands on the map beside the hero (Game.merc), her numbers
// Diablo II's for her row and level (src/game/d2/hireling.ts mercStats) with her gear's on top. Here:
// Kashya's roster and hiring her (paid from the bag, then the stash; the last one's gear handed back
// to the hero first, counted item by item), raising her again, her gear on and off and the potions
// she drinks, her experience, falling with the hero, and her place beside the hero on every map. What
// she does in a fight is src/game/mercai.ts; what monsters do to her, combat.ts (mercStruck here).
//
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f, as in hireling.ts:
// SUnitNpc.cpp, SUnitDmg.cpp are source/D2Game/src/UNIT/, MonsterAI.cpp source/D2Game/src/MONSTER/,
// AiThink.cpp source/D2Game/src/AI/, PlrMsg.cpp source/D2Game/src/PLAYER/, ItemMode.cpp and
// Items.cpp (D2Game) source/D2Game/src/ITEMS/, SkillItem.cpp source/D2Game/src/SKILLS/, Items.cpp
// (D2Common) source/D2Common/src/Items/.
import { chance, dist, randInt, type P2 } from '../core/math';
import { MPS_PER_VELOCITY, M_PER_SUBTILE } from '../core/units';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { ITEM_BASES } from '../data/items';
import { QUEST_BY_KEY } from '../data/quests';
import { addStat, type StatBag, type StatKey } from '../data/stats';
import { isBroken } from '../items/d2/durability';
import { baseOf, displayName, globalItemStats, isUnknown, itemDefense, weaponDamage, type Item } from '../items/item';
import {
  actionWeights,
  gainXp,
  hireling,
  hirelingName,
  hireOffer,
  killShare,
  mayHire,
  mercDrinks,
  mercSkills,
  mercStats,
  mercWear,
  onOffer,
  pay,
  resurrectCost,
  rollRoster,
  takeFromRoster,
  freeHireling,
  type ActionWeights,
  type HireOffer,
  type MercSkill,
  type MercSlot,
  type RosterEntry,
  type WearRefusal,
} from './d2/hireling';
import { defense, difficulty } from './d2/stats';
import { Actor, type DamagePacket, type Resists } from './actor';
import { applyDamage, hitOdds } from './combat';
import type { Game } from './game';
import { layOutUnplaced } from './items';
import type { Level } from './level';
import type { Monster } from './monster';
import type { Player } from './player';
import { questState, QFLAG } from './quests/record';
import { forgetSight, thinkMerc } from './mercai';

/** the hero's side on a map, what monsters go for (Game.friendlies) */
export type Friendly = Player | Merc;

/**
 * The hero's hireling as the hero keeps her (Player.merc), on the map or not, dead or alive: what the
 * save keeps of her (save.ts MercSave, Diablo II's hireling save: her Hireling.txt row, her name's
 * row, level, experience, gear, life, death). `raw`: one this build can't read (a Hireling.txt row it
 * hasn't, a slot it hasn't, a field not what it should be: a later build's), kept as saved, never
 * played, and written back so; the other fields then say nothing
 */
export interface MercState {
  /** her Hireling.txt Id: her kind, act and difficulty (hireling.ts hireling) */
  hire: number;
  /** her name, a row of her act's names (hireling.ts hirelingName) */
  name: number;
  level: number;
  xp: number;
  /** what she wears: a helm, body armour and a weapon (hireling.ts mercSlot) */
  equipment: Partial<Record<MercSlot, Item>>;
  /** life left; unset is full */
  life?: number;
  /** dead, she waits at the camp to be paid back to life (hireling.ts resurrectCost) */
  dead: boolean;
  raw?: unknown;
}

/** her slots in the order her panel lays them out and her gear goes back to the hero */
export const MERC_SLOTS: readonly MercSlot[] = ['head', 'body', 'weapon'];

/** her MonStats row (roguehire): her speeds, light and sounds */
const ROW = D2X_MONSTERS.roguehire;

/** the hero's auras on her this frame (fight.ts updateAuras), D2's party auras: what they add to her */
export interface AuraOnMerc {
  /** Might's and Concentration's damage % */
  dmgPct: number;
  /** Resist All's resistances */
  res: number;
  /** Vigor's speed % */
  frw: number;
}

/** the hireling on the map beside the hero: a friendly, as the hero is (faction 'player') */
export class Merc extends Actor {
  faction = 'player' as const;
  /** what the hero keeps of her (Player.merc); none for a stand-in made without one (the tests') */
  readonly kept: MercState | null;
  /** her defense, her level's and her gear's with her dexterity's (hireling.ts mercStats): what a blow at her is rolled against */
  defense = 0;
  /** her fire, cold, lightning and poison resistances, her level's and her gear's, before the difficulty's penalty and the cap (combat.ts applyDamage) */
  res: [number, number, number, number] = [0, 0, 0, 0];
  /**
   * her magic and gold find, her gear's: a monster she kills drops by hers and her hero's together
   * (D2GAME_DropTC: the killer's STAT_ITEM_MAGICBONUS plus its owner's, D2Game Items.cpp:2334-2341;
   * gold the same, 2549-2556: kills.ts rollLoot)
   */
  mf = 0;
  gf = 0;
  /** strength and dexterity, gear in: what her gear's requirements are checked against (hireling.ts mercWear) */
  str = 10;
  dex = 10;
  /** her attack rating: her level's and 5 a point of dexterity, her gear's flat and % on top */
  ar = 0;
  /** an arrow's physical damage before the % (her bow's, or her own with none) and the % on it (her gear's, her bow's dexterity bonus) */
  dmg: [number, number] = [1, 2];
  dmgPct = 0;
  /** what her own damage adds to an arrow her bow already deals some to (hireling.ts arrowBonus) */
  arrowAdd: [number, number] = [0, 0];
  /** her skills at her level with her gear's +skills, and how she picks among them (hireling.ts mercSkills, actionWeights) */
  skills: MercSkill[] = [];
  weights: ActionWeights = { plain: 1, skills: [], total: 1 };
  /** life a second (MonsterAI.cpp:260-261) and her gear's on top */
  regen = 0;
  /** her gear's +% experience, life after each kill and after each demon's (SkillItem.cpp EventFunc28, EventFunc18 heal the killer) */
  xpPct = 0;
  lifePerKill = 0;
  demonHeal = 0;
  /** her gear's walk and run speed %, D2's frw on a unit */
  frw = 0;
  /** the hero's auras on her this frame */
  aura: AuraOnMerc = { dmgPct: 0, res: 0, frw: 0 };
  /** the aura she has switched on of hers (Inner Sight: AiThink.cpp:9913-9917), until she falls or the map changes */
  auraOn: string | null = null;
  /** the potions she drank still healing her: a second's worth each frame, as the hero's (items.ts drink) */
  healQueue: { perSec: number; left: number }[] = [];
  /** when she last cried out at a blow (her hit sound) */
  hurtAt = -Infinity;
  /** her AI (mercai.ts): what she is after, when she thinks next, her miss streak's share (AiThink.cpp:9759-9795) */
  foe: Monster | null = null;
  thinkTimer = 0;
  aiParam = 0;
  /** the shot she is loosing: its skill (null: her plain arrow), at whom, fired yet */
  shot: { skill: string | null; target: Monster } | null = null;
  /** walking: to where, and how fast */
  goal: P2 | null = null;
  goalSpeed = 0;

  /** she at `pos`, from what the hero keeps of her: her life, defense and resistances at her level, her gear's in */
  constructor(pos: P2, state: MercState | null = null) {
    super(pos);
    this.kept = state;
    if (!state || state.raw !== undefined) return;
    this.recalc();
    this.life = Math.min(this.maxLife, state.life ?? this.maxLife);
    this.dead = state.dead;
    if (this.dead) {
      this.life = 0;
      this.state = 'dead';
      this.deathTime = 99;
    }
  }

  /** her numbers again, from her level and her gear (on hiring, a level gained, gear on or off) */
  recalc() {
    const st = this.kept;
    if (!st || st.raw !== undefined) return;
    const s = mercStats(st.hire, st.level);
    const bag = mercGearStats(st);
    const all = bag.allAttr ?? 0;
    this.level = st.level;
    this.str = s.str + (bag.str ?? 0) + all;
    this.dex = s.dex + (bag.dex ?? 0) + all;
    this.maxLife = Math.max(1, Math.floor((s.life + (bag.life ?? 0)) * (1 + (bag.lifePct ?? 0) / 100)));
    // defense: her armour class (STAT_ARMORCLASS) with her gear's, a quarter of her dexterity, then the % (UNITS_GetDefense, Units.cpp:2349-2404)
    let armour = s.def + (bag.def ?? 0);
    for (const slot of MERC_SLOTS) {
      const it = st.equipment[slot];
      if (it && !isBroken(it) && it.defense !== undefined) armour += itemDefense(it, st.level);
    }
    this.defense = defense(this.dex, armour, bag.defPct ?? 0);
    // attack rating: STAT_TOHIT and 5 a point of dexterity, as any unit but a hero (SUnitDmg.cpp:2472), her gear's flat and % on top
    const ar = s.ar + 5 * this.dex + (bag.ar ?? 0);
    this.ar = ar + Math.trunc((ar * (bag.arPct ?? 0)) / 100);
    const all4 = bag.resAll ?? 0;
    this.res = [s.resist[0] + (bag.resFire ?? 0) + all4, s.resist[1] + (bag.resCold ?? 0) + all4, s.resist[2] + (bag.resLight ?? 0) + all4, s.resist[3] + (bag.resPoison ?? 0) + all4];
    this.mf = bag.mf ?? 0;
    this.gf = bag.gf ?? 0;
    this.xpPct = bag.xpPct ?? 0;
    this.lifePerKill = bag.lifePerKill ?? 0;
    this.demonHeal = bag.demonHeal ?? 0;
    this.frw = bag.frw ?? 0;
    this.regen = s.regen + (bag.lifeRegen ?? 0);
    // her arrows: her bow's damage with its dexterity bonus (D2Common Missile.cpp:612-623: the bow's
    // StrBonus and DexBonus on the owner's stats) and her gear's %, her own damage on top
    // (MONSTERUNIQUE_AddRogueHireMissileSecondaryDamage: hireling.ts arrowBonus); with no bow her own
    // damage alone (approximate: D2's unarmed rogue has no bow class to read)
    const bow = st.equipment.weapon;
    if (bow && !isBroken(bow)) {
      const b = baseOf(bow);
      this.dmg = weaponDamage(bow, st.level);
      this.dmgPct = (this.str * (b.strBonus ?? 0)) / 100 + (this.dex * (b.dexBonus ?? 0)) / 100 + (bag.dmgPctGlobal ?? 0);
      this.arrowAdd = [Math.max(0, s.dmg[0] - 1), Math.max(0, s.dmg[1] - 1)];
    } else {
      this.dmg = [s.dmg[0], Math.max(s.dmg[0], s.dmg[1])];
      this.dmgPct = bag.dmgPctGlobal ?? 0;
      this.arrowAdd = [0, 0];
    }
    this.dmg = [this.dmg[0] + (bag.dmgMin ?? 0), Math.max(this.dmg[0] + (bag.dmgMin ?? 0), this.dmg[1] + (bag.dmgMax ?? 0))];
    // her skills with her gear's +skills: +all skills count, class skills only for heroes (D2Skills.cpp:1924-2000)
    const plus = bag.skillsAll ?? 0;
    this.skills = mercSkills(st.hire, st.level, plus);
    this.weights = actionWeights(st.hire, st.level);
    this.life = Math.min(this.life, this.maxLife);
  }

  resists(): Resists {
    const r = this.aura.res;
    const [fire, cold, light, poison] = this.res;
    return { fire: fire + r, cold: cold + r, light: light + r, poison: poison + r, phys: 0 };
  }

  /** her walk and run, m/s: her row's Velocity and Run (D2's units), her gear's and the hero's Vigor's % on them, as chill slows her */
  speedOf(run: boolean): number {
    const pct = 100 + this.frw + this.aura.frw;
    return (((run ? ROW.run : ROW.velocity) * pct) / 100) * MPS_PER_VELOCITY * this.slowFactor();
  }

  /** her name, ours (tools/d2-names: hireling.ts hirelingName) */
  get displayName(): string {
    return this.kept ? mercName(this.kept) : (ROW.name ?? '佣兵');
  }
}

/** her name, ours, from what the hero keeps of her */
export function mercName(st: MercState): string {
  if (st.raw !== undefined) return '佣兵';
  return hirelingName(st.hire, st.name)?.name ?? mercKind(st);
}

/** her kind's name (流离者斥候) */
export function mercKind(st: MercState): string {
  return st.raw !== undefined ? '佣兵' : (hireling(st.hire).type ?? '佣兵');
}

/** what her gear gives: each worn piece that isn't broken (it never wears: hireling.ts MERC_GEAR_WEARS), at her level */
export function mercGearStats(st: MercState): StatBag {
  const bag: StatBag = {};
  for (const slot of MERC_SLOTS) {
    const it = st.equipment[slot];
    if (!it || isUnknown(it) || isBroken(it) || !ITEM_BASES[it.baseId]) continue;
    const g = globalItemStats(it, st.level);
    for (const k in g) addStat(bag, k as StatKey, g[k as StatKey]!);
  }
  return bag;
}

// ───────────────────────── where she is ─────────────────────────

/** the map each hireling on one stands on: she goes with the hero to every other */
const onLevel = new WeakMap<Merc, Level>();

/** whether the hero has a hireling she can play: one this build reads (a later build's isn't played, never replaced) */
const playable = (st: MercState | null): st is MercState => !!st && st.raw === undefined;

/** whether the hero has a hireling, dead or alive (QuestHost.hasMerc: the Sisters give none then, SUnitNpc.cpp:2896) */
export function hasMerc(g: Game): boolean {
  return !!g.player.merc;
}

/** a spot beside the hero on this map, behind them a little, for her to come in at */
function besideHero(g: Game): P2 {
  const p = g.player;
  const a = p.facing + Math.PI * 0.8;
  const want = { x: p.pos.x + Math.sin(a) * 1.3, z: p.pos.z + Math.cos(a) * 1.3 };
  return g.level.map.nearestWalkable(want.x, want.z) ?? { ...p.pos };
}

/**
 * Her on the map the hero is on (Game.merc), each step before she acts: made from what the hero keeps
 * of her the first time (a hero read or hired), beside the hero on a map just entered, or once she is
 * more than 100 subtiles off, as D2 moves her to her owner then (AiThink.cpp:9423-9427); none while she
 * is dead and her body is on no map the hero is on, or the hero has none, or one this build can't read
 */
export function placeMerc(g: Game) {
  const st = g.player.merc;
  let m = g.merc;
  if (m && m.kept !== st) m = g.merc = null;
  if (!playable(st)) return;
  if (st.dead && (!m || onLevel.get(m) !== g.level)) {
    if (m) g.merc = null;
    return;
  }
  if (!m) {
    m = new Merc(besideHero(g), st);
    g.merc = m;
    onLevel.set(m, g.level);
    g.hooks.mercChanged?.();
    return;
  }
  if (onLevel.get(m) !== g.level || (!m.dead && dist(m.pos, g.player.pos) > WARP)) warp(g, m);
}

/** her moved beside the hero, at once: what she was doing let go */
function warp(g: Game, m: Merc) {
  const at = besideHero(g);
  m.pos = { ...at };
  m.prevPos = { ...at };
  m.path = null;
  m.goal = null;
  m.shot = null;
  m.foe = null;
  if (m.state !== 'dead') m.setState('idle');
  if (onLevel.get(m) !== g.level) {
    m.auraOn = null;
    forgetSight(m);
  }
  onLevel.set(m, g.level);
}

/** past this far from the hero she is brought to them (AiThink.cpp:9423: 100 subtiles) */
const WARP = 100 * M_PER_SUBTILE;

// ───────────────────────── each step ─────────────────────────

/**
 * Her step (Game.update), after the hero's: put where she should be (placeMerc), her potions and
 * life coming back, poison, then her AI (mercai.ts thinkMerc); what the hero keeps of her (Player.merc)
 * follows her life. Nothing at all while the hero has no hireling, so a game without one is as before
 */
export function updateMerc(g: Game, dt: number) {
  placeMerc(g);
  const m = g.merc;
  // none, or a stand-in made without what a hero keeps (the tests'): nothing of hers runs
  if (!m || !m.kept) return;
  m.prevPos.x = m.pos.x;
  m.prevPos.z = m.pos.z;
  m.hitFlash = Math.max(0, m.hitFlash - dt * 6);
  if (m.dead) {
    m.deathTime += dt;
    return;
  }
  for (const q of m.healQueue) {
    const s = Math.min(q.left, dt);
    m.life = Math.min(m.maxLife, m.life + q.perSec * s);
    q.left -= s;
  }
  m.healQueue = m.healQueue.filter((q) => q.left > 0);
  m.life = Math.min(m.maxLife, m.life + m.regen * dt);
  if (m.chillTime > 0) m.chillTime -= dt;
  if (m.slowTime > 0) m.slowTime -= dt;
  if (m.poisonTime > 0) {
    m.poisonTime -= dt;
    m.life -= m.poisonDps * dt;
    if (m.life <= 0) {
      mercDied(g, m);
      return;
    }
  }
  thinkMerc(g, m, dt);
  keepLife(m);
}

/** what the hero keeps of her follows her life (unset at full, as the save writes it) */
function keepLife(m: Merc) {
  const st = m.kept;
  if (!st) return;
  st.life = m.dead ? 0 : m.life >= m.maxLife ? undefined : Math.max(1, Math.round(m.life));
}

/**
 * A monster's blow or missile at her (combat.ts monsterStrike): one that isn't a spell lands on
 * D2's hit roll, the blow's rating against her defense, with both levels (SUNITDMG_IsHitSuccessful,
 * as for the hero); she has no shield, so blocks nothing, and her gear never wears (hireling.ts
 * MERC_GEAR_WEARS). Whether it landed
 */
export function mercStruck(g: Game, m: Monster, merc: Merc, pk: DamagePacket, _melee = false): boolean {
  if (merc.dead) return false;
  if (!pk.spell && !chance(hitOdds(pk.ar ?? m.ar, merc.defense, m.level, merc.level))) return false;
  const before = merc.life;
  applyDamage(g, merc, pk, m.pos);
  if (!merc.dead) mercHurt(g, merc, before - merc.life);
  return true;
}

/**
 * Her hurt by a blow: her hit cry (no lines: docs/M2A.md 声音, HURT_SOUND's rogue), not more than
 * twice a second; a heavy one, past an eighth of her life, staggers her a moment (her GH mode;
 * approximate, D2's monster hit recovery isn't modelled for her)
 */
function mercHurt(g: Game, merc: Merc, taken: number) {
  if (taken <= 0) return;
  if (g.time - merc.hurtAt > 0.5) {
    merc.hurtAt = g.time;
    // HURT_SOUND.rogue
    g.sfx.play('monster.hurt_rogue', { pos: merc.pos });
  }
  if (taken > merc.maxLife / 8 && merc.state !== 'attack' && merc.state !== 'dead') {
    merc.setState('hit', 0.3);
    merc.shot = null;
  }
  keepLife(merc);
}

/**
 * Her life gone (combat.ts applyDamage, her poison, the hero's death): she falls where she stands,
 * her death cry, and waits in the camp to be paid back to life (hireling.ts resurrectCost), her gear
 * on her; her body stays on this map until the hero leaves it
 */
export function mercDied(g: Game, merc: Merc) {
  if (merc.dead && merc.kept?.dead) return;
  merc.dead = true;
  merc.life = 0;
  merc.deathTime = 0;
  merc.setState('dead');
  merc.shot = null;
  merc.goal = null;
  merc.path = null;
  merc.auraOn = null;
  merc.healQueue = [];
  forgetSight(merc);
  if (merc.kept) {
    merc.kept.dead = true;
    merc.kept.life = 0;
  }
  // DEATH_SOUND.rogue
  g.sfx.play('monster.die_rogue', { pos: merc.pos });
  g.fx.death(merc, 'red', merc.killedBy);
  if (merc.kept) g.hooks.message(`${mercName(merc.kept)}倒下了：可以在${KASHYA}那里让她复活`, '#c8a86a', 4);
  g.hooks.mercChanged?.();
}

/** the camp's captain who hires them out, by her name in the rename table */
const KASHYA = D2X_MONSTERS.kashya.name;

/**
 * The hero fell (kills.ts killPlayer): she falls with them, as in Diablo II (docs/M2A.md 佣兵和任务),
 * on the map or off it
 */
export function fallWithHero(g: Game) {
  const st = g.player.merc;
  if (!playable(st) || st.dead) return;
  const m = g.merc;
  if (m && m.kept === st && !m.dead) mercDied(g, m);
  else {
    st.dead = true;
    st.life = 0;
    g.hooks.mercChanged?.();
  }
}

/** the healer's heal (townsfolk.ts vendorHeal) is hers too: D2 heals the hero's pets with them (SUnitNpc.cpp:2775) */
export function healMerc(g: Game): boolean {
  const m = g.merc;
  if (!m || m.dead) return false;
  const did = m.life < m.maxLife || m.poisonTime > 0 || m.chillTime > 0;
  m.life = m.maxLife;
  m.poisonTime = m.chillTime = m.slowTime = 0;
  keepLife(m);
  return did;
}

// ───────────────────────── experience ─────────────────────────

/**
 * What a kill gives her (SUNITDMG_DistributeExperience, SUnitDmg.cpp:2926-2991, before the hero's
 * own: 2981-2988): her whole share of one of hers, 86/256 of one of the hero's, none of nobody's
 * (hireling.ts killShare, her gear's +% in); alive, wherever she is (the pet lookup has no range,
 * and skips the dead). Added by gainXp: a new level remakes her at full life. The experience given
 */
export function mercKillXp(g: Game, m: Monster, killer: 'hero' | Merc | null): number {
  const st = g.player.merc;
  if (!playable(st) || st.dead || killer === null || m.noXp) return 0;
  const on = g.merc && g.merc.kept === st ? g.merc : null;
  const share = killShareFor(st, m, killer instanceof Merc, on?.xpPct ?? mercGearStats(st).xpPct ?? 0);
  if (share <= 0) return 0;
  const r = gainXp(st.hire, st.level, st.xp, share, g.player.level);
  st.xp = r.xp;
  if (r.levelled) {
    st.level = r.level;
    if (on) {
      on.recalc();
      on.life = on.maxLife;
      keepLife(on);
      g.fx.burst('levelup', on.pos);
    }
    g.hooks.message(`${mercName(st)}升到了 ${st.level} 级`, '#ffd24a', 3);
    g.hooks.mercChanged?.();
  }
  return share;
}

function killShareFor(st: MercState, m: Monster, hers: boolean, xpPct: number): number {
  return killShare(st.hire, st.level, m.xp, m.level, { killer: hers, addXpPct: xpPct });
}

/**
 * Her own kill's heal (SKILLITEM_EventFunc28_HealAfterKill, _EventFunc18_HealAfterDemonKill, SkillItem.cpp:
 * 1491-1557): the stat's events are on the unit that wears it (D2GAME_ITEMMODE_ServerStatlistCallback,
 * ItemMode.cpp:92-101) and go off for the killer alone (SUNITEVENT_Trigger(UNITEVENT_KILL, pAttacker),
 * SUnitDmg.cpp:1400), so her gear's heal her; mana after a kill is a hero's only (SkillItem.cpp:1460)
 */
export function mercOwnKill(g: Game, merc: Merc, m: Monster) {
  if (merc.dead) return;
  let heal = merc.lifePerKill;
  if (m.def.demon) heal += merc.demonHeal;
  if (heal > 0) merc.life = Math.min(merc.maxLife, merc.life + heal);
  keepLife(merc);
  if (merc.foe === m) merc.foe = null;
}

// ───────────────────────── Kashya: the roster, hiring, raising ─────────────────────────

/** a game's roster (D2's is a game's, made the first time her list opens: SUnitNpc.cpp:346-349): for which world and difficulty */
interface Roster {
  seed: number;
  difficulty: number;
  entries: RosterEntry[];
}

const rosters = new WeakMap<Game, Roster>();

/** Math.random's rolls in D2's int(min, max) */
const RNG = { int: (min: number, max: number) => randInt(min, max) };

/** Kashya's roster this game: made on first asking (rollRoster), anew in another world or difficulty (each a game in D2) */
export function rosterOf(g: Game): RosterEntry[] {
  const p = g.player;
  let r = rosters.get(g);
  if (!r || r.seed !== g.worldSeed || r.difficulty !== p.difficulty) {
    r = { seed: g.worldSeed, difficulty: p.difficulty, entries: rollRoster(RNG) };
    rosters.set(g, r);
  }
  return r.entries;
}

/** a name on offer, with what hiring her is now: her row, level, price (hireling.ts hireOffer) and name */
export interface Offer {
  entry: RosterEntry;
  offer: HireOffer;
  name: string;
}

/** who Kashya offers now, in name order, at the hero's level and difficulty */
export function offers(g: Game): Offer[] {
  const p = g.player;
  return onOffer(rosterOf(g)).map((entry) => {
    const offer = hireOffer(entry.seed, p.level, p.difficulty);
    return { entry, offer, name: hirelingName(offer.id, entry.name)?.name ?? hireling(offer.id).type ?? '佣兵' };
  });
}

/** the Sisters' reward granted in this difficulty (a1q2's QFLAG.REWARDGRANTED): Kashya hires out before level 8 then (SUnitNpc.cpp:927-955) */
export function sistersRewarded(p: Player): boolean {
  return questState(p.quests[p.difficulty], QUEST_BY_KEY.a1q2.key, QFLAG.REWARDGRANTED);
}

/** whether Kashya hires out to the hero now (hireling.ts mayHire: level 8, or the Sisters' reward) */
export function mayHireNow(g: Game): boolean {
  return mayHire(g.player.level, sistersRewarded(g.player));
}

/** every item the hero has, the cursor's, the body's and the hireling's gear too: what a move of items must leave as many of */
export function heroItems(g: Game): Item[] {
  const p = g.player;
  const out: Item[] = [];
  for (const it of Object.values(p.equipment)) if (it) out.push(it);
  for (const grid of [p.inventory, p.stash, p.cube]) for (const x of grid.items) out.push(x.item);
  for (const col of p.belt) out.push(...col);
  out.push(...p.unplaced);
  for (const c of p.corpses) {
    for (const it of Object.values(c.equipment)) if (it) out.push(it as Item);
    out.push(...c.items);
  }
  const cur = g.hooks.getCursorItem();
  if (cur) out.push(cur);
  if (p.merc && p.merc.raw === undefined) for (const it of Object.values(p.merc.equipment)) if (it) out.push(it);
  return [...new Set(out)];
}

/** where one of her items went back to the hero */
export type GearHome = 'bag' | 'stash' | 'beside';

/**
 * The last hireling's gear handed back to the hero as a new one is hired (docs/M2A.md 佣兵和任务: D2
 * deletes it, which would break rule 1): each piece, head, body and bow in that order, into the bag,
 * else the personal stash, else beside the camp's stash (Player.unplaced, laid on the ground there
 * while the hero is in the camp). Where each went, in that order
 */
export function returnGear(g: Game, st: MercState): { item: Item; home: GearHome }[] {
  const p = g.player;
  const out: { item: Item; home: GearHome }[] = [];
  for (const slot of MERC_SLOTS) {
    const it = st.equipment[slot];
    if (!it) continue;
    delete st.equipment[slot];
    if (p.inventory.add(it)) out.push({ item: it, home: 'bag' });
    else if (p.stash.add(it)) out.push({ item: it, home: 'stash' });
    else {
      p.unplaced.push(it);
      out.push({ item: it, home: 'beside' });
    }
  }
  if (out.some((x) => x.home === 'beside') && g.level?.inTown(p.pos)) layOutUnplaced(g, g.level);
  if (out.length) g.hooks.inventoryChanged();
  return out;
}

/** why Kashya won't hire one out now, or null */
export type HireRefusal = 'level' | 'gold' | 'gone' | 'unreadable';

/**
 * Hiring a name on offer (D2GAME_NPC_HireMerc, SUnitNpc.cpp:960-1050): Kashya hires out from level 8 or
 * once the Sisters' reward is had (mayHire); her price paid from the bag, the rest from the stash (pay,
 * SUnitNpc.cpp:995-1009); the last hireling's gear back to the hero first (returnGear), counted item by
 * item; the new one at her offer's level and experience, beside the hero, the roster without her
 * (takeFromRoster), and the hero saved at once with her. A hireling this build can't read (a later
 * build's: MercState.raw) is never replaced, as her gear would be lost with her
 */
export function hire(g: Game, name: number): { ok: true; merc: MercState; returned: { item: Item; home: GearHome }[] } | { ok: false; why: HireRefusal } {
  const p = g.player;
  if (!mayHireNow(g)) return { ok: false, why: 'level' };
  if (p.merc && p.merc.raw !== undefined) return { ok: false, why: 'unreadable' };
  const o = offers(g).find((x) => x.entry.name === name);
  if (!o) return { ok: false, why: 'gone' };
  const paid = pay(o.offer.price, p.gold, p.stashGold);
  if (!paid) return { ok: false, why: 'gold' };
  const before = heroItems(g).length;
  p.gold = paid.gold;
  p.stashGold = paid.stashGold;
  const returned = p.merc ? returnGear(g, p.merc) : [];
  const st: MercState = { hire: o.offer.id, name, level: o.offer.level, xp: o.offer.xp, equipment: {}, dead: false };
  takeOn(g, st);
  const roster = rosters.get(g);
  if (roster) roster.entries = takeFromRoster(roster.entries, name, RNG);
  const after = heroItems(g).length;
  if (after !== before) throw new Error(`hire: the hero had ${before} items, ${after} after`);
  g.sfx.play('ui.coins');
  g.hooks.message(`雇佣了${o.name}（${o.offer.level} 级）`, '#c8a86a', 3);
  g.save();
  return { ok: true, merc: st, returned };
}

/** the hero's hireling is `st` now: on the map at once, beside the hero */
function takeOn(g: Game, st: MercState) {
  g.player.merc = st;
  g.merc = null;
  placeMerc(g);
  g.hooks.mercChanged?.();
}

/**
 * The Sisters' reward (QuestHost.giveFreeMerc, D2GAME_NPC_AssignMercenary, SUnitNpc.cpp:2887-2939): the
 * first on offer in name order, for nothing; none when the hero has a hireling, dead or alive. True
 * when one was given (saved at once with the hero)
 */
export function giveFreeMerc(g: Game): boolean {
  const roster = rosterOf(g);
  const e = freeHireling(roster, hasMerc(g));
  if (!e) return false;
  const p = g.player;
  const o = hireOffer(e.seed, p.level, p.difficulty);
  takeOn(g, { hire: o.id, name: e.name, level: o.level, xp: o.xp, equipment: {}, dead: false });
  const r = rosters.get(g);
  if (r) r.entries = takeFromRoster(r.entries, e.name, RNG);
  g.save();
  return true;
}

/** what raising her costs now (hireling.ts resurrectCost: 15 × level² / 2, at most 50000), or null when she isn't dead */
export function raiseCost(g: Game): number | null {
  const st = g.player.merc;
  if (!playable(st) || !st.dead) return null;
  return resurrectCost(st.hire, st.level);
}

/**
 * Her paid back to life at Kashya (D2GAME_NPC_ResurrectMerc, SUnitNpc.cpp:1672-1733): the cost from the
 * bag, then the stash, once; she comes back at full life beside the hero (SUNITNPC_ResurrectHireling,
 * 1062-1090), her gear on her, and the hero is saved with her
 */
export function resurrect(g: Game): boolean {
  const st = g.player.merc;
  const cost = raiseCost(g);
  if (!st || cost === null) return false;
  const p = g.player;
  const paid = pay(cost, p.gold, p.stashGold);
  if (!paid) return false;
  p.gold = paid.gold;
  p.stashGold = paid.stashGold;
  st.dead = false;
  st.life = undefined;
  g.merc = null;
  placeMerc(g);
  g.sfx.play('ui.coins');
  g.hooks.message(`${mercName(st)}复活了`, '#c8a86a', 3);
  g.hooks.mercChanged?.();
  g.save();
  return true;
}

// ───────────────────────── her gear and potions ─────────────────────────

/** why the hireling can't be handed anything now: dead, or not near (PlrMsg.cpp:3895-3899: she alive, in a room by the hero's) */
export type HandRefusal = 'none' | 'dead' | 'far';

/** how near she must be to be handed things: the rooms by the hero's (approximate: two of D2's rooms, 20 m) */
const HAND_REACH = 20;

/** whether she can be handed an item now, or why not */
export function handable(g: Game): HandRefusal | null {
  const st = g.player.merc;
  if (!playable(st)) return 'none';
  if (st.dead) return 'dead';
  const m = g.merc;
  if (!m || m.kept !== st || dist(m.pos, g.player.pos) > HAND_REACH) return 'far';
  return null;
}

/** what the hero's refused hand-over says */
export const WEAR_SAYS: Record<WearRefusal | HandRefusal, string> = {
  quest: '任务物品不能给她',
  unidentified: '先辨识这件物品',
  broken: '这件物品坏了',
  'not-hers': '她用不了这件物品',
  class: '她用不了这件物品',
  str: '她的力量不够',
  dex: '她的敏捷不够',
  level: '她的等级不够',
  none: '你没有佣兵',
  dead: '她已经倒下了',
  far: '她离你太远了',
};

/**
 * The item on the cursor handed to her (D2GAME_PACKETCALLBACK_Rcv0x61_DropPickupMercItem, PlrMsg.cpp:
 * 3875-3987): a potion she drinks is drunk (mercDrinks, 3916-3923); else she wears it in its slot
 * (hireling.ts mercWear), what she wore there coming back on the cursor. The cursor is set to what it
 * holds after (GameHooks.setCursorItem: the same item when refused, with why) before the hero is saved,
 * at once when anything moved, so the save has each item once: on her, or on the cursor
 */
export function handToMerc(g: Game, item: Item): { cursor: Item | null; refused?: string } {
  const why = handable(g);
  if (why) return { cursor: item, refused: WEAR_SAYS[why] };
  const st = g.player.merc!;
  const m = g.merc!;
  if (mercDrinks(item)) {
    mercDrink(g, m, item);
    g.hooks.setCursorItem(null);
    g.save();
    return { cursor: null };
  }
  const r = mercWear(item, { level: st.level, str: m.str, dex: m.dex }, st.hire);
  if ('refused' in r) {
    // quest items, unidentified and broken ones D2 passes over without a word (PlrMsg.cpp:3909-3914); the rest she refuses aloud (3973-3976)
    g.sfx.play('ui.cant_use');
    return { cursor: item, refused: WEAR_SAYS[r.refused] };
  }
  const old = st.equipment[r.slot] ?? null;
  st.equipment[r.slot] = item;
  g.hooks.setCursorItem(old);
  m.recalc();
  g.sfx.play('item.equip');
  g.hooks.mercChanged?.();
  g.save();
  return { cursor: old };
}

/**
 * What she wears in `slot` taken off onto the cursor (alive and near, as handing her anything; the
 * cursor empty): on the cursor (GameHooks.setCursorItem) before the hero is saved, at once
 */
export function takeFromMerc(g: Game, slot: MercSlot): { item: Item | null; refused?: string } {
  const why = handable(g);
  if (why) return { item: null, refused: WEAR_SAYS[why] };
  if (g.hooks.getCursorItem()) return { item: null };
  const st = g.player.merc!;
  const it = st.equipment[slot];
  if (!it) return { item: null };
  delete st.equipment[slot];
  g.hooks.setCursorItem(it);
  g.merc!.recalc();
  g.sfx.play('item.equip');
  g.hooks.mercChanged?.();
  g.save();
  return { item: it };
}

/**
 * A potion she drinks (SKILLITEM_pSpell03_Potion, SkillItem.cpp:140-240): healing over its length, the
 * amount doubled for a unit that is no hero (ITEMS_GetBonusLifeBasedOnClass, D2Common Items.cpp:4571-4576;
 * she has no vitality to double it again), a rejuvenation's share at once (pSpell05), a thawing or
 * antidote's cure (pSpell09). The potion is used up
 */
export function mercDrink(g: Game, m: Merc, item: Item) {
  const b = baseOf(item);
  if (b.heal) {
    const sec = b.healSec ?? 3;
    m.healQueue.push({ perSec: (2 * b.heal) / sec, left: sec });
    g.fx.burst('potion_hp', m.pos);
  }
  if (b.rejuv) {
    m.life = Math.min(m.maxLife, m.life + m.maxLife * b.rejuv);
    g.fx.burst('potion_hp', m.pos);
  }
  // a thawing potion (wms) thaws her, an antidote (yps) cures her poison
  if (item.baseId === 'wms') m.chillTime = 0;
  if (item.baseId === 'yps') m.poisonTime = 0;
  g.sfx.play('item.drink', { pos: m.pos });
  keepLife(m);
}

/**
 * Shift and a belt key: its bottom potion given to her (D2's bUseOnMerc, PlrMsg.cpp:2516, ItemMode.cpp:
 * 4484-4491: a healing, thawing or antidote potion, on her if the hero has her); another kind is used
 * as the key alone would (Game.useBelt). Whether she drank it
 */
export function beltToMerc(g: Game, col: number): boolean {
  const p = g.player;
  const stack = p.belt[col];
  const it = stack?.[0];
  if (!it || p.dead) return false;
  if (!mercDrinks(it) || handable(g)) {
    g.useBelt(col);
    return false;
  }
  stack.shift();
  mercDrink(g, g.merc!, it);
  g.hooks.inventoryChanged();
  g.hooks.mercChanged?.();
  g.save();
  return true;
}

/** her resistances as her panel shows them: the hero's difficulty's penalty taken, at most 75, as a blow finds them (combat.ts applyDamage) */
export function shownResists(g: Game, m: Merc): [number, number, number, number] {
  const d = difficulty(g.player.rules);
  const r = m.resists();
  return [r.fire, r.cold, r.light, r.poison].map((v) => Math.max(-100, Math.min(75, v + d.resistPenalty))) as [number, number, number, number];
}

/** an item's name as her panel shows it */
export const itemLabel = (it: Item) => displayName(it);
