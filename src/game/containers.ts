// What using the objects a map sets down does: chests, barrels, shrines, and a maze's caskets (and the
// graves among them), rogue corpses and wells, each by Diablo II's operate function for it (D2MOO
// source/D2Game/src/OBJECTS/ObjMode.cpp at commit d9d394f: the table at 79-157), and what each is
// called when hovered, from the rename tables (src/data/d2x/objects.ts D2X_OBJECT_NAMES, rule 5).
// The rolls are the game's (Math.random), as a monster's drop is; D2 rolls them on its object seed.
import { RNG, dist, randInt, type P2 } from '../core/math';
import { FRAMES_PER_SEC, M_PER_SUBTILE } from '../core/units';
import { D2X_DIFFICULTIES } from '../data/d2x/difficulty';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_OBJECT_NAMES, D2X_OBJECTS } from '../data/d2x/objects';
import { ITEM_BASES } from '../data/items';
import { SHRINE_BY_ID } from '../data/shrines';
import { MATH_RAND } from '../items/make';
import { roll } from '../items/d2/rand';
import type { Rand } from '../items/d2/types';
import { createItem } from '../items/gen';
import { displayName, type Item } from '../items/item';
import { areaLevel, trialFloor, type AreaDef } from '../world/areas';
import { emptyPacket, type Actor } from './actor';
import { applyDamage } from './combat';
import { missileDamage, missileFlight } from './d2/monstats';
import type { Game } from './game';
import type { Level } from './level';
import { chestDrop, chestLoot, containerLoot } from './loot';
import { Merc } from './merc';
import { Monster } from './monster';
import { Projectile, type ObjKind, type WorldObject } from './objects';
import { Player } from './player';
import { spawnOne } from './spawn';

// ───────────────────────── names ─────────────────────────

/** an object's Name string key when the map gives no Objects.txt row of it, by kind (D2X_OBJECTS: chest 5, barrel 7, casket 3, hole 28, corpse 54, well 138) */
const NAME_KEY: Partial<Record<ObjKind, string>> = { chest: 'chest', barrel: 'Barrel', casket: 'Casket', remains: 'RogueCorpse', well: 'Well' };
/** the D2 kinds (D2xObject.kind, by OperateFn) a row must be of to name an object of ours */
const ROW_KINDS: Partial<Record<ObjKind, readonly string[]>> = { chest: ['chest'], barrel: ['barrel', 'explodingBarrel'], casket: ['casket'], remains: ['corpse'], well: ['well'] };
/** the string a locked chest hovers with, and a casket cluster's grave's (Objects.txt 28 HoleInGround) */
const LOCKED_CHEST = 'lockedchest';
const GRAVE = 'HoleAnim';

/**
 * What an object of `kind` is called when hovered, ours from the rename tables (D2X_OBJECT_NAMES):
 * by its Objects.txt row's Name string (`d2`, D2xObject.nameKey), else its kind's; a locked chest by
 * D2's lockedchest, a casket cluster's hole as the grave it is. Undefined for the kinds named
 * elsewhere (shrines by their blessing, the ways on by where they go, the townsfolk by who they are).
 */
export function objectName(kind: ObjKind, o: { d2?: number; locked?: boolean; hole?: boolean } = {}): string | undefined {
  if (kind === 'chest' && o.locked) return D2X_OBJECT_NAMES[LOCKED_CHEST]?.name;
  if (kind === 'casket' && o.hole) return D2X_OBJECT_NAMES[GRAVE]?.name;
  const row = o.d2 !== undefined ? D2X_OBJECTS[o.d2] : undefined;
  const own = row && ROW_KINDS[kind]?.includes(row.kind) ? D2X_OBJECT_NAMES[row.nameKey] : undefined;
  if (own) return own.name;
  const key = NAME_KEY[kind];
  return key ? D2X_OBJECT_NAMES[key]?.name : undefined;
}

// ───────────────────────── chests ─────────────────────────

/** D2's key (Misc.txt key, type key): a chest's lock takes one off a stack of them in the bag */
const isKey = (it: Item) => ITEM_BASES[it.baseId]?.type === 'key';

/**
 * A key for a locked chest (D2GAME_DoKeyCheck_6FC4A4B0, ItemMode.cpp:5077-5121): the first key in the
 * bag (inventory page 0: not the stash's, the cube's or the belt's), one off its stack, the stack gone
 * with its last; false when the bag has none
 */
export function useKey(g: Game): boolean {
  const p = g.player;
  const k = p.inventory.items.find((x) => isKey(x.item));
  if (!k) return false;
  const left = (k.item.qty ?? 1) - 1;
  if (left <= 0) p.inventory.remove(k.item);
  else k.item.qty = left;
  g.hooks.inventoryChanged();
  return true;
}

/**
 * A chest opened, once (OBJECTS_OperateFunction04_Chest, ObjMode.cpp:1251-1544): a locked one only
 * with a key, which it takes (1264-1278; no key, it stays shut and the hero is told), then drops
 * twice; a spark chest by 580's rules or 397's (loot.ts chestLoot). The treasure is its area's Chest
 * A, B or C at the area's level, as D2 rolls a chest's by its level's (loot.ts chestDrop). The
 * Horadric Cube waits in the first chest opened in an area of level 4 or more (plan A2; D2's is in
 * the Halls of the Dead, in Act 2). Its trap (rolled with it, WorldObject.trap) is set off after the
 * drop, as D2's OBJECTS_ChestEnd does (1241-1247: armTrap); the drop is the chest's either way.
 */
export function openChest(g: Game, obj: WorldObject) {
  const p = g.player;
  if (obj.used) return;
  if (obj.locked && !useKey(g)) {
    g.sfx.play('ui.denied', { pos: obj.pos });
    g.hooks.message('需要一把钥匙', '#c8c8c8', 2);
    return;
  }
  obj.used = true;
  g.sfx.play('env.chest', { pos: obj.pos });
  g.fx.burst('chest', obj.pos);
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  // (a plain chest, the old maps' among them, rolls as it always did: once for whether, once its drop)
  const drops = g.rollLoot((hero) => chestLoot(obj, area, hero));
  if (areaLevel(area) >= 4 && !p.cubeFound) {
    p.cubeFound = true;
    const box = createItem('box');
    drops.push({ kind: 'item', item: box });
    g.hooks.message(`你找到了${displayName(box)}！`, '#c8a86a', 4);
  }
  g.spawnDrops(obj.pos, drops);
  armTrap(g, obj, area);
}

// ───────────────────────── a chest's trap ─────────────────────────

/** what a trapped chest's trap does here, by D2's handler for it (OBJMODE_DispatchTrap's table, ObjMode.cpp:356-368) */
export type TrapKind = 'lightning' | 'firebolt' | 'poison' | 'nova' | 'fire' | 'monsters';

/** the frames from a chest's opening to its trap going off (EVENTTYPE_TRAP, D2GAME_SetTrapCallback, ObjMode.cpp:1574, 1583) */
export const TRAP_DELAY = 35;

/**
 * The D2 level an area of ours stands for, what a trap goes off by: its own levels.txt Id, a rift
 * floor's the Act 1 area it replays (AreaDef.rift); the trial ground's floors, the game's own, have
 * none and go as Act 1's Den of Evil (8) does, the old dungeon's first floor
 */
export function d2LevelOf(a: AreaDef): number {
  if (a.rift) return a.rift.source;
  return trialFloor(a.id) !== undefined ? 8 : a.id;
}

/**
 * The trap a chest rolled, (rand & 7) + 1 (Objects.cpp:642-649; WorldObject.trap), as it goes off in
 * D2 level `level` (OBJMODE_DispatchTrap, ObjMode.cpp:354-440): 1 lightning, 2 and 6 the fire bolt, 3
 * a poison cloud, 4 a nova, 5 and 7 fire, 8 and 9 the level's trap monsters (the table, 356-368);
 * but 8 is the fire bolt from level 75 (379-390), 3 below level 40 save level 25 (401-412), and 1 and
 * 4 below level 40 (423-439). Every area of the game is Act 1's, under 40: a trap there is the fire
 * bolt, fire or trap monsters. Null for none (0, or past the table).
 */
export function trapKind(trap: number | undefined, level: number): TrapKind | null {
  const t = (trap ?? 0) & 127;
  if (t <= 0 || t > 9) return null;
  if (t === 8) return level >= 75 ? 'firebolt' : 'monsters';
  if (t === 3) return level < 40 && level !== 25 ? 'firebolt' : 'poison';
  if ((t === 1 || t === 4) && level < 40) return 'firebolt';
  return (['lightning', 'firebolt', 'poison', 'nova', 'fire', 'firebolt', 'fire', 'monsters', 'monsters'] as const)[t - 1];
}

/** a chest's trap set off, waiting to go off (TRAP_DELAY) */
interface Pending {
  chest: WorldObject;
  kind: TrapKind;
  /** when, by the map's clock (Level.time) */
  at: number;
}

/** a trap fire burning on a chest (objects 162 and 160, D2xObject kind 'torch') */
interface Fire {
  chest: WorldObject;
  /** its Objects.txt row (D2X_OBJECTS) */
  id: number;
  pos: P2;
  /** when it next burns what stands in it, by the map's clock */
  next: number;
}

/** each map's traps waiting and fires burning: the map's for the session, as the maps are (maps.ts); none of it is saved, nor needs to be */
const traps = new WeakMap<Level, { pending: Pending[]; fires: Fire[] }>();
const trapsOf = (L: Level) => {
  let t = traps.get(L);
  if (!t) traps.set(L, (t = { pending: [], fires: [] }));
  return t;
};

/** whether a chest's trap is set off on `L` and yet to go off */
export const trapWaiting = (L: Level, chest: WorldObject): boolean => !!traps.get(L)?.pending.some((p) => p.chest === chest);

/**
 * A chest's trap set off as it opens (D2GAME_SetTrapCallback, ObjMode.cpp:1547-1587): it goes off
 * TRAP_DELAY frames later, and the chest sounds as it is set off (its sound 13, here env.trap). The
 * trap monsters' is set off unless the level's trap monster is the flying scimitar in Act 1
 * (1579-1585), which ours never is (spawn.ts trapMonster: a zombie or skeleton class).
 */
function armTrap(g: Game, chest: WorldObject, area: AreaDef) {
  const kind = trapKind(chest.trap, d2LevelOf(area));
  if (!kind) return;
  const L = g.level;
  trapsOf(L).pending.push({ chest, kind, at: L.time + TRAP_DELAY / FRAMES_PER_SEC });
  g.sfx.play('env.trap', { pos: chest.pos });
}

/** the trap monster a trap of fire bolts is (D2GAME_OBJECTS_TrapHandler2_6, ObjMode.cpp:1128: MONSTER_TRAP_FIREBOLT) */
const TRAP_FIREBOLT = 'trap-firebolt';
/** the fires a fire trap lights (D2GAME_OBJECTS_TrapHandler5_7, ObjMode.cpp:1087, 1099: OBJECT_FIRE_LARGE, OBJECT_FIRE_SMALL) */
const FIRE_LARGE = 162;
const FIRE_SMALL = 160;
/** a fire's first burn after it is lit (OBJECTS_InitFunction22_Fire, Objects.cpp:597), then every 15 + rand % 35 frames (ObjMode.cpp:350) */
const FIRE_FIRST = 25;
const fireAgain = () => (15 + roll(MATH_RAND, 35)) / FRAMES_PER_SEC;

/** a chest's trap going off (OBJMODE_DispatchTrap, ObjMode.cpp:354-440, by trapKind) */
function goOff(g: Game, p: Pending) {
  const c = p.chest;
  switch (p.kind) {
    case 'firebolt':
      trapBolt(g, c);
      break;
    case 'fire':
      lightFires(g, c);
      break;
    case 'monsters': {
      // (rand & 1) + 1 of the level's trap monster, risen at the chest (D2GAME_OBJECTS_TrapHandler8_9, ObjMode.cpp:1044-1062)
      const n = (roll(MATH_RAND, 2) & 1) + 1;
      for (let i = 0; i < n; i++) raiseTrapMonster(g, c);
      break;
    }
    // lightning, a poison cloud and a nova go off as such only from level 40 (trapKind), past Act 1:
    // no area of the game is there (objects.test checks every one), and their trap monsters
    // (trap-lightning, trap-poisoncloud, trap-nova) aren't in the data yet
    default:
      break;
  }
}

/**
 * A trap of fire bolts going off (D2GAME_OBJECTS_TrapHandler2_6, ObjMode.cpp:1123-1138): its trap
 * monster at the chest, which thinks by Trap-Missile (AITHINK_Fn077_TrapMissile, AiThink.cpp:6736-6761):
 * at the nearest of the hero's side within its aip1 subtiles (25, 30, 32 by difficulty) it shoots its
 * A1 missile, trapfirebolt, aip2 times (1), and is gone (its death mode, no treasure); with none in
 * reach it is gone at once. The missile is at a monster missile's level, the difficulty's
 * MonsterSkillBonus + 1 (MonsterMode.cpp:1341-1350): its own fire at that level (Missile.cpp:1127-1235),
 * no ToHit, so it lands, at its Missiles.txt speed for its Range (monstats.ts missileFlight). The game
 * makes no unit of the trap monster: the shot leaves the chest as the trap goes off, where D2's leaves
 * at its A1's missile frame (the 9A token's frames aren't in the data: a few frames, approximated away).
 */
function trapBolt(g: Game, chest: WorldObject) {
  const L = g.level;
  const row = D2X_MONSTERS[TRAP_FIREBOLT];
  const ai = row?.diff[L.difficulty]?.ai.params ?? [];
  const missile = row?.missiles?.a1;
  if (!missile) return;
  const reach = (ai[0] ?? 0) * M_PER_SUBTILE;
  let target: Actor | null = null;
  let best = Infinity;
  for (const f of g.friendlies?.() ?? [g.player]) {
    if (f.dead || L.inTown(f.pos)) continue;
    const d = dist(chest.pos, f.pos);
    if (d <= reach && d < best) {
      best = d;
      target = f;
    }
  }
  if (!target) return;
  const level = D2X_DIFFICULTIES[L.difficulty].monsterSkillBonus + 1;
  const dmg = missileDamage(missile, level);
  const fl = missileFlight(missile, level);
  const shots = ai[1] ?? 1;
  for (let i = 0; i < shots; i++) {
    const pk = emptyPacket();
    if (dmg?.elem?.type === 'fire') pk.fire = randInt(dmg.elem.min, Math.max(dmg.elem.min, dmg.elem.max));
    pk.spell = true;
    const d = dist(chest.pos, target.pos) || 1;
    const dx = (target.pos.x - chest.pos.x) / d;
    const dz = (target.pos.z - chest.pos.z) / d;
    L.projectiles.push(new Projectile('firebolt', chest.pos, { x: dx * fl.speed, z: dz * fl.speed }, null, 'monster', pk, fl.life, 0.22));
  }
  g.sfx.play('skill.fire_cast', { pos: chest.pos, vol: 0.6 });
}

/**
 * A fire trap going off (D2GAME_OBJECTS_TrapHandler5_7, ObjMode.cpp:1081-1102): the large fire on the
 * chest and, when the next subtile along x is still in the chest's room (here: floor), the small one
 * there. They burn on (OBJECTS_InitFunction22_Fire, Objects.cpp:584-598; OBJMODE_UpdateTrapProximity,
 * ObjMode.cpp:328-351): 25 frames after they are lit and every 15–49 frames after that, a fire burns
 * each player within its Parm0 + 1 of D2's unit distance (the large one 2, the small 1), alive, by
 * its Damage (trapDamage, fire); the hireling and the monsters are no players and walk through.
 */
function lightFires(g: Game, chest: WorldObject) {
  const L = g.level;
  const t = trapsOf(L);
  const at = L.time + FIRE_FIRST / FRAMES_PER_SEC;
  t.fires.push({ chest, id: FIRE_LARGE, pos: { ...chest.pos }, next: at });
  const side = { x: chest.pos.x + M_PER_SUBTILE, z: chest.pos.z };
  if (L.map.walkableAt(side.x, side.z)) t.fires.push({ chest, id: FIRE_SMALL, pos: side, next: at });
  chest.fires = t.fires.filter((f) => f.chest === chest).map((f) => ({ x: f.pos.x, z: f.pos.z, large: f.id === FIRE_LARGE }));
  g.fx.burst('fireblast', chest.pos, { radius: 0.6 });
  g.sfx.play('skill.fire_impact', { pos: chest.pos, vol: 0.7 });
}

/** a fire burning what stands in it (OBJMODE_UpdateTrapProximity, ObjMode.cpp:328-351) */
function burn(g: Game, f: Fire) {
  const row = D2X_OBJECTS[f.id];
  const reach = (row?.parm?.[0] ?? 0) + 1;
  const p = g.player;
  // D2 looks only at the players in the fire's room: here at the hero, wherever
  if (!p.dead && d2Distance(f.pos, row?.size[0] ?? 0, p.pos, PLAYER_SIZE) <= reach) trapDamage(g, f.pos, row?.damage ?? 0, p, 'fire');
}

/**
 * The traps on a map going off and its trap fires burning, each step (Game.update): by the map's
 * clock, so a trap set off on a map the hero has left goes off when they're back, as D2's rooms wait
 */
export function updateTraps(g: Game, L: Level) {
  const t = traps.get(L);
  if (!t) return;
  // (a frame's sum of steps comes a hair under the frame count's time: what's due by a millionth of a second is due)
  const now = L.time + 1e-6;
  if (t.pending.length) {
    const due = t.pending.filter((p) => now >= p.at);
    if (due.length) {
      t.pending = t.pending.filter((p) => now < p.at);
      for (const p of due) goOff(g, p);
    }
  }
  for (const f of t.fires) {
    if (now < f.next) continue;
    f.next = L.time + fireAgain();
    burn(g, f);
  }
}

// ───────────────────────── an object's blow ─────────────────────────

/** D2's size of a player in subtiles (UNITS_GetUnitSizeX: COLLISION_UNIT_SIZE_SMALL, Units.cpp:206-207; D2Collision.h:22) */
const PLAYER_SIZE = 2;
/** a position's D2 subtile, a quarter of our tile (src/core/units.ts) */
const sub = (v: number) => Math.floor(v / M_PER_SUBTILE);

/**
 * D2's distance between two units of sizes `sa`, `sb` (UNITS_GetDistanceToOtherUnit, Units.cpp:3800-3848):
 * each axis's gap in subtiles less half of each one's size, none below 0, then (short + 2 × long) / 2
 */
export function d2Distance(a: P2, sa: number, b: P2, sb: number): number {
  const off = Math.trunc(sa / -2) - Math.trunc(sb / 2);
  const x = Math.max(0, Math.abs(sub(b.x) - sub(a.x)) + off);
  const y = Math.max(0, Math.abs(sub(b.z) - sub(a.z)) + off);
  return x <= y ? Math.trunc((x + 2 * y) / 2) : Math.trunc((y + 2 * x) / 2);
}

/** whether `b` is within `r` subtiles of `a` as the crow flies, by their subtiles (UNITS_IsInRange, Units.cpp:3892-3913) */
export function d2InRange(a: P2, b: P2, r: number): boolean {
  const x = sub(b.x) - sub(a.x);
  const y = sub(b.z) - sub(a.z);
  return x * x + y * y <= r * r;
}

/** what D2's roll for an object's blow reads of its target: its level, dexterity and defense (STAT_LEVEL, STAT_DEXTERITY, STAT_ARMORCLASS) */
function targetStats(t: Actor): { lvl: number; dex: number; ac: number } {
  if (t instanceof Player) return { lvl: t.level, dex: t.stats.dex, ac: t.stats.def };
  if (t instanceof Merc) return { lvl: t.level, dex: t.dex, ac: t.defense };
  // a monster has no dexterity (MonStats gives it none)
  if (t instanceof Monster) return { lvl: t.level, dex: 0, ac: t.defense };
  return { lvl: 1, dex: 0, ac: 0 };
}

/**
 * An object's blow on `t` (OBJEVAL_ApplyTrapObjectDamage, ObjEval.cpp:16-90): none in a town, nor
 * through a wall (its collision check); it lands on rand % 100 under the larger of 65 and
 * 2 × ((level + rand(level / 4)) & 255 − 5 × (dex / 2) − level) − defense + 125 (65 % on a hero of
 * 20 dexterity or more); then 1/32 to 1/8 of the life it has, and up to a point more, × the object's
 * Damage %, physical or fire. The defense read is the game's whole one, where D2's STAT_ARMORCLASS
 * hasn't the dexterity's quarter: the 65 % floor holds for every hero and hireling either way. The
 * blow goes through resistances and the rest as any (combat.ts applyDamage, as
 * SUNITDMG_CalculateTotalDamage does), and a kill of it is the object's (DamagePacket.byObject).
 * Returns the damage done.
 */
export function trapDamage(g: Game, from: P2, damagePct: number, t: Actor, type: 'phys' | 'fire', rng: Rand = MATH_RAND): number {
  const L = g.level;
  if (t.dead || L.inTown(t.pos) || !L.map.los(from, t.pos)) return 0;
  // STAT_HITPOINTS: the life it has, in 256ths
  const hp = Math.floor(Math.max(0, t.life) * 256);
  const min = Math.max(hp >> 5, 1);
  const max = Math.max(hp >> 3, min + 1);
  const { lvl, dex, ac } = targetStats(t);
  const l = Math.max(0, Math.floor(lvl));
  const param = 2 * (((l + roll(rng, l >> 2)) & 255) - 5 * (Math.floor(dex) >> 1) - l);
  const odds = Math.max(param - Math.floor(ac) + 125, 65);
  if (roll(rng, 100) >= odds) return 0;
  const d = Math.floor(((roll(rng, max - min + 256) + min) * damagePct) / 100);
  if (!d) return 0;
  const pk = emptyPacket();
  if (type === 'fire') pk.fire = d / 256;
  else pk.phys = d / 256;
  pk.spell = true;
  pk.byObject = true;
  return applyDamage(g, t, pk, from);
}

// ───────────────────────── barrels ─────────────────────────

/**
 * 18.08 % of the caskets and barrels opened raise a trap monster: rand % 10000 & 0xFFFFE000, a roll
 * of 8192 or more (ObjMode.cpp:2458, 2810)
 */
export const trapMonsterRoll = (rng: Rand = MATH_RAND): boolean => roll(rng, 10000) >= 8192;

/**
 * The level's trap monster up at an object (D2GAME_SpawnTrapMonster_6FC75B40, ObjMode.cpp:1065-1078;
 * spawn.ts spawnOne): awake, risen as the dead are
 */
function raiseTrapMonster(g: Game, obj: WorldObject) {
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  const m = spawnOne(g.level, area, obj.pos, new RNG((Math.random() * 0x7fffffff) | 0));
  if (!m) return;
  g.fx.burst('resurrect', m.pos);
  g.sfx.play('monster.resurrect', { pos: m.pos });
}

/**
 * A barrel broken open, once. One of the old maps' (no Objects.txt row) drops as ever, 21 in 100 (loot.ts
 * containerLoot); a maze's by OBJECTS_OperateFunction05_Barrel (ObjMode.cpp:2781-2826): its trap
 * monster first, 18.08 % (trapMonsterRoll), then the drop. An exploding barrel (Objects.txt 11,
 * OperateFn 7) blows up instead (explodeBarrel), and drops nothing and raises nothing.
 */
export function openBarrel(g: Game, obj: WorldObject) {
  if (obj.used) return;
  if (obj.exploding) return explodeBarrel(g, obj);
  obj.used = true;
  g.sfx.play('env.barrel', { pos: obj.pos });
  g.fx.burst('barrel', obj.pos);
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  if (obj.d2 !== undefined && trapMonsterRoll()) raiseTrapMonster(g, obj);
  g.spawnDrops(obj.pos, g.rollLoot((hero) => containerLoot('barrel', area, hero)));
}

/** an exploding barrel's blast reaches 3 subtiles (UNITS_IsInRange, ObjMode.cpp:2858, 2865), and sets off the exploding barrels within 2 of D2's unit distance (2872) */
export const BLAST_RANGE = 3;
export const CHAIN_RANGE = 2;
/** Objects.txt 11, BarrelExploding, and its size in subtiles (SizeX) */
const EXPLODING_BARREL = 11;
const BARREL_SIZE = 1;

/**
 * An exploding barrel set off, broken or by a neighbour's blast (OBJECTS_OperateFunction07_ExplodingBarrel,
 * ObjMode.cpp:2829-2888), once: the hero, the hireling (a monster unit in D2) and every monster within
 * 3 subtiles of it, alive, take its blow (trapDamage: physical, its Damage 100 %); then each exploding
 * barrel not yet gone off within 2 of D2's unit distance (a cluster's barrels are its step, 2
 * subtiles, apart) goes off with it, there and then, and so on down the chain. A monster it kills is
 * the object's: no one's experience, its drop by no one's finds (kills.ts). It drops nothing and
 * raises nothing. D2 looks only at the units in the barrel's room; here at any within its reach, in sight.
 */
export function explodeBarrel(g: Game, obj: WorldObject) {
  if (obj.used) return;
  obj.used = true;
  const L = g.level;
  g.sfx.play('env.explode', { pos: obj.pos });
  g.fx.burst('fireblast', obj.pos, { radius: 1.2 });
  const dmg = D2X_OBJECTS[obj.d2 ?? EXPLODING_BARREL]?.damage ?? D2X_OBJECTS[EXPLODING_BARREL]?.damage ?? 100;
  const hit = (t: Actor) => !t.dead && d2InRange(obj.pos, t.pos, BLAST_RANGE) && trapDamage(g, obj.pos, dmg, t, 'phys');
  for (const f of g.friendlies?.() ?? [g.player]) hit(f);
  for (const m of L.monstersNear(obj.pos, (BLAST_RANGE + 1) * M_PER_SUBTILE)) hit(m);
  for (const o of L.objects) {
    if (o !== obj && o.kind === 'barrel' && o.exploding && !o.used && d2Distance(obj.pos, BARREL_SIZE, o.pos, BARREL_SIZE) <= CHAIN_RANGE) explodeBarrel(g, o);
  }
}

// ───────────────────────── a maze's caskets, rogue corpses and wells ─────────────────────────

/**
 * A casket, or a grave of its cluster, opened (OBJECTS_OperateFunction01_Casket, ObjMode.cpp:2441-2472):
 * one drop of its area's chest class (loot.ts chestDrop); only when that drops something does it open,
 * for good, and raise the level's trap monster 18.08 % of the time (trapMonsterRoll); with nothing it
 * stays shut, to be tried again (2450)
 */
export function openCasket(g: Game, obj: WorldObject) {
  if (obj.used) return;
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  const drops = g.rollLoot((hero) => chestDrop(area, hero));
  if (!drops.length) return;
  obj.used = true;
  g.sfx.play('env.casket', { pos: obj.pos });
  g.fx.burst('casket', obj.pos);
  g.spawnDrops(obj.pos, drops);
  if (trapMonsterRoll()) raiseTrapMonster(g, obj);
}

/** a rogue's corpse searched, once (OBJECTS_OperateFunction14_Corpse, ObjMode.cpp:2585-2613): one drop of its area's chest class, whatever it comes to */
export function searchRemains(g: Game, obj: WorldObject) {
  if (obj.used) return;
  obj.used = true;
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  g.sfx.play('env.search', { pos: obj.pos });
  g.fx.burst('remains', obj.pos);
  g.spawnDrops(obj.pos, g.rollLoot((hero) => chestDrop(area, hero)));
}

/** a well's numbers when the map gives no Objects.txt row of it: the Act 1 caves' (138 Fountain8: Parm 750, 128, 1, 3) */
const CAVE_WELL = { uses: 2, regen: 30.04, restore: 0.5, life: true, mana: true };
const wellOf = (o: WorldObject) => (o.d2 !== undefined ? D2X_OBJECTS[o.d2]?.well : undefined) ?? CAVE_WELL;
/** when each drink taken from a well comes back (Game.time), soonest first */
const refills = new WeakMap<WorldObject, number[]>();

/**
 * A well's drinks left at game time `now` (WorldObject.charges): 2 × Parm2 when it appears (InitFn 16,
 * Objects.cpp:601-604); each drink comes back (Parm0 + 1) frames after it was taken, 30.04 s for the
 * caves' (its AITHINK event, ObjMode.cpp:3802, OBJMODE_RegenerateWell 265-305), never past the full
 */
export function wellCharges(o: WorldObject, now: number): number {
  const w = wellOf(o);
  if (o.charges === undefined) o.charges = w.uses;
  const due = refills.get(o);
  while (due?.length && due[0] <= now) {
    due.shift();
    o.charges = Math.min(w.uses, o.charges + 1);
  }
  return o.charges;
}

/**
 * A drink from a well (OBJECTS_OperateFunction22_Well, ObjMode.cpp:3711-3807), when it has one left:
 * Parm1/256 of the hero's life (Parm3 & 2) and mana (Parm3 & 1) and of their stamina back, each up to
 * full; poison, freezing and the other curable states (States.txt curable: chill and the curses, here
 * Amplify Damage) cured; the hireling, the hero's pet, healed full and cured (OBJMODE_PetIterate_Heal,
 * 3810-3835). It takes a drink only when one of those did something; a well stays to be used again,
 * never spent (D2 leaves it selectable), dry until its drinks come back (wellCharges).
 */
export function drinkWell(g: Game, obj: WorldObject) {
  if (wellCharges(obj, g.time) <= 0) return;
  const p = g.player;
  const w = wellOf(obj);
  const s = p.stats;
  let did = false;
  if (w.life && p.life < s.maxLife) {
    p.life = Math.min(s.maxLife, p.life + s.maxLife * w.restore);
    did = true;
  }
  if (w.mana && p.mana < s.maxMana) {
    p.mana = Math.min(s.maxMana, p.mana + s.maxMana * w.restore);
    did = true;
  }
  if (p.stamina < s.maxStamina) {
    p.stamina = Math.min(s.maxStamina, p.stamina + s.maxStamina * w.restore);
    did = true;
  }
  if (p.poisonTime > 0 || p.chillTime > 0 || p.ampTime > 0) {
    p.poisonTime = p.chillTime = p.ampTime = 0;
    did = true;
  }
  const m = g.merc;
  if (m && !m.dead) {
    if (m.life < m.maxLife) {
      m.life = m.maxLife;
      did = true;
    }
    if (m.poisonTime > 0 || m.chillTime > 0) {
      m.poisonTime = m.chillTime = 0;
      did = true;
    }
  }
  if (!did) return;
  obj.charges = (obj.charges ?? w.uses) - 1;
  const due = refills.get(obj) ?? [];
  due.push(g.time + w.regen);
  refills.set(obj, due);
  g.sfx.play('env.well', { pos: obj.pos });
  g.fx.burst('well', obj.pos);
}

// ───────────────────────── shrines ─────────────────────────

/** a shrine used, once: its blessing on the hero */
export function useShrine(g: Game, obj: WorldObject) {
  const p = g.player;
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
  g.fx.burst('aura_switch', p.pos, { color: def.color });
  g.sfx.play('env.shrine', { pos: obj.pos });
  g.hooks.message(`${def.name}：${def.desc}`, def.color, 3);
  g.say('shrine');
}
