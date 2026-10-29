// What using the objects a map sets down does: chests, barrels, shrines, and a maze's caskets (and the
// graves among them), rogue corpses and wells, each by Diablo II's operate function for it (D2MOO
// source/D2Game/src/OBJECTS/ObjMode.cpp at commit d9d394f: the table at 79-157), and what each is
// called when hovered, from the rename tables (src/data/d2x/objects.ts D2X_OBJECT_NAMES, rule 5).
// The rolls are the game's (Math.random), as a monster's drop is; D2 rolls them on its object seed.
import { RNG } from '../core/math';
import { D2X_OBJECT_NAMES, D2X_OBJECTS } from '../data/d2x/objects';
import { ITEM_BASES } from '../data/items';
import { SHRINE_BY_ID } from '../data/shrines';
import { MATH_RAND } from '../items/make';
import { roll } from '../items/d2/rand';
import type { Rand } from '../items/d2/types';
import { createItem } from '../items/gen';
import { displayName, type Item } from '../items/item';
import { areaLevel } from '../world/areas';
import type { Game } from './game';
import { chestDrop, chestLoot, containerLoot } from './loot';
import type { ObjKind, WorldObject } from './objects';
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
 * the Halls of the Dead, in Act 2). Its trap (rolled with it, WorldObject.trap) doesn't go off yet.
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
 * OperateFn 7, 2829-2888) drops nothing and raises nothing; its blast, which hurts what stands within
 * 3 subtiles and sets off its neighbours within 2, doesn't go off yet.
 */
export function openBarrel(g: Game, obj: WorldObject) {
  if (obj.used) return;
  obj.used = true;
  g.sfx.play('env.barrel', { pos: obj.pos });
  g.fx.burst('barrel', obj.pos);
  if (obj.exploding) return;
  const area = g.level.areaAt(obj.pos.x, obj.pos.z);
  if (obj.d2 !== undefined && trapMonsterRoll()) raiseTrapMonster(g, obj);
  g.spawnDrops(obj.pos, g.rollLoot((hero) => containerLoot('barrel', area, hero)));
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
