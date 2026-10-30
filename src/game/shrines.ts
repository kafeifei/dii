// Diablo II's shrines (D2MOO source/D2Game/src/OBJECTS at commit d9d394f): what a shrine object is
// once it has rolled its kind as it appears (Objects.cpp), and what touching it does (ObjMode.cpp),
// by Shrines.txt (src/data/d2x/shrines.ts) and Objects.txt (D2X_OBJECTS). Each is called by ours
// for it (tools/d2-names/shrines.json, rule 5).
import { RNG, dist, randInt, type P2 } from '../core/math';
import { FRAMES_PER_SEC, M_PER_SUBTILE } from '../core/units';
import { D2X_SHRINES, type D2xShrine } from '../data/d2x/shrines';
import { D2_BASES, isType } from '../items/d2/bases';
import { MATH_RAND } from '../items/make';
import { roll } from '../items/d2/rand';
import { createItem } from '../items/gen';
import { emptyPacket } from './actor';
import { d2LevelOf } from './containers';
import { charStats } from './d2/stats';
import { missileDamage, missileFlight } from './d2/monstats';
import type { Game } from './game';
import type { Level } from './level';
import type { Monster } from './monster';
import { DelayedBlast, Projectile, type WorldObject } from './objects';
import type { Player } from './player';
import { promoteByShrine } from './spawn';
import { openTownPortal } from './travel';
import type { AreaDef } from '../world/areas';

export { HEALTH_SHRINE, SHRINE_BECOMES, oldShrineObject, rollShrine, shrineClass, shrineOfClass, type ShrineRolls } from '../world/shrinekinds';
export { SKILL_SHRINE_LEVELS, blessingBonus, endBlessing, shrineColor, shrineName, shrineRow, type Blessing, type BlessingBonus } from './blessing';
import { SKILL_SHRINE_LEVELS, endBlessing, shrineColor, shrineRow, type Blessing } from './blessing';

/** the D2 level an area's shrines go by (containers.ts d2LevelOf: a rift floor's source, the trial ground's floors as the Den of Evil) */
export const shrineLevelOf = (a: AreaDef): number => d2LevelOf(a);

// ───────────────────────── the blessing ─────────────────────────

/**
 * A combat shrine's attack rating (OBJMODE_CalculateShrineStatBonus for tohit, ObjMode.cpp:2260-2264):
 * Arg0 % of OBJMODE_GetToHitPercentage (2195-2222): the hero's attack rate — their tohit, 5 × (dex − 7)
 * and the class's ToHitFactor (UNITS_GetAttackRate, Units.cpp:2407-2430), none with a throwing potion
 * in hand — × (their "+% attack rating" / 100, whole, + 1), and the ToHitFactor again
 */
export function combatShrineAr(p: Player, arg0: number): number {
  const d = p.stats;
  const cs = charStats(p.cls);
  const w = p.equipment.weapon;
  const potion = !!w && !!D2_BASES[w.baseId] && isType(D2_BASES[w.baseId], 'tpot');
  const rate = potion ? 0 : (d.bag.ar ?? 0) + 5 * (d.dex - 7) + cs.toHitFactor;
  const pct = rate * (Math.trunc((d.bag.arPct ?? 0) / 100) + 1) + cs.toHitFactor;
  return Math.trunc((arg0 * pct) / 100);
}

/** a blessing begun, or the same shrine's again: its time from the start (sub_6FD10EC0 sets a same state's expiry anew, Skills.cpp:1321-1335) */
function bless(g: Game, p: Player, s: D2xShrine) {
  const b: Blessing = { code: s.code, left: s.frames / FRAMES_PER_SEC };
  // the combat shrine's rating is worked out first, with what the hero has on now, its own last one too
  if (s.code === 7) b.ar = combatShrineAr(p, s.arg0);
  // the curse slot: a monster's curse on the hero ends (Amplify Damage, the cursed uniques')
  p.ampTime = 0;
  p.shrine = b;
  // the stamina shrine fills stamina at once (ObjMode.cpp:2281)
  if (s.code === 14) p.stamina = p.stats.maxStamina;
  p.markDirty();
}

/** the blessing's seconds running down, each step (Game.update); it ends at none (EVENTTYPE_REMOVESTATE) */
export function updateBlessing(g: Game, dt: number) {
  const p = g.player;
  if (!p.shrine || (p.shrine.left -= dt) > 0) return;
  endBlessing(p);
  g.hooks.message('祭坛的祝福消失了', '#9a9080', 2);
}

// ───────────────────────── touching one ─────────────────────────

/** when each shrine touched can be touched again, by its map's clock (Level.time) */
const resets = new WeakMap<WorldObject, number>();

/** the frames from a shrine's touch to its reset: 1200 × its reset time in minutes + 1 (ObjMode.cpp:2423-2426) */
export const resetFrames = (s: D2xShrine): number => 1200 * s.reset + 1;

/**
 * The shrines on `L` touched and due to be touched again (OBJMODE_ResetShrine, ObjMode.cpp:252-262:
 * back to its neutral mode, no one's), each step, by the map's clock as the traps go
 */
export function updateShrines(L: Level) {
  for (const o of L.objects) {
    if (o.kind !== 'shrine' || !o.used) continue;
    const at = resets.get(o);
    if (at !== undefined && L.time + 1e-6 >= at) {
      o.used = false;
      resets.delete(o);
    }
  }
}

/**
 * A shrine touched (OBJECTS_OperateFunction02_Shrine, ObjMode.cpp:2359-2437): once in its neutral
 * mode, its handler by its kind's Code (the table, 2142-2168), then, with a reset time, it can be
 * touched again 1200 × that + 1 frames on (resetFrames); without (the experience shrine, the specials)
 * it stays spent. What it did is said in words of our own, under its name.
 */
export function useShrine(g: Game, obj: WorldObject) {
  if (obj.used) return;
  const s = shrineRow(obj.shrine);
  if (!s) return;
  obj.used = true;
  if (s.reset) resets.set(obj, g.level.time + resetFrames(s) / FRAMES_PER_SEC);
  const p = g.player;
  const said = touch(g, p, obj, s);
  g.fx.burst('aura_switch', p.pos, { color: shrineColor(s.code) });
  g.sfx.play('env.shrine', { pos: obj.pos });
  g.hooks.message(`${s.name}：${said}`, shrineColor(s.code), 3);
  g.say('shrine');
}

/** a shrine's handler (ObjMode.cpp:2142-2168) on the hero who touched it; what it did, in our words */
function touch(g: Game, p: Player, obj: WorldObject, s: D2xShrine): string {
  const d = p.stats;
  switch (s.code) {
    // refilling, health, mana: full (D2GAME_SHRINES_Refill, Health, FillMana, ObjMode.cpp:1651-1687)
    case 1:
      p.life = d.maxLife;
      p.mana = d.maxMana;
      return '生命与法力全部恢复';
    case 2:
      p.life = d.maxLife;
      return '生命全部恢复';
    case 3:
      p.mana = d.maxMana;
      return '法力全部恢复';
    case 17:
      return portalShrine(g);
    case 18:
      return gemShrine(g, p);
    case 19:
      return fireShrine(g, p, obj, s);
    case 20:
      return monsterShrine(g, p);
    case 21:
    case 22:
      return potionShrine(g, p, obj, s);
    default:
      if (s.code >= 6 && s.code <= 15) {
        bless(g, p, s);
        return boonText(s);
      }
      return '';
  }
}

/** what a boon does, in our words, its numbers the table's */
export function boonText(s: D2xShrine): string {
  switch (s.code) {
    case 6:
      return `防御提高 ${s.arg0}%`;
    case 7:
      return `攻击准确率提高 ${s.arg0}%，物理伤害提高 ${s.arg1}%`;
    case 8:
      return `火焰抗性 +${s.arg0}%`;
    case 9:
      return `冰冷抗性 +${s.arg0}%`;
    case 10:
      return `闪电抗性 +${s.arg0}%`;
    case 11:
      return `毒素抗性 +${s.arg0}%`;
    case 12:
      return `所有技能等级 +${SKILL_SHRINE_LEVELS}`;
    case 13:
      return `法力回复速度提高 ${s.arg0}%`;
    case 14:
      return '耐力回满，奔跑不再疲惫';
    case 15:
      return `获得的经验提高 ${s.arg0}%`;
    default:
      return '';
  }
}

// ───────────────────────── the special shrines ─────────────────────────

/**
 * The portal shrine (D2GAME_SHRINES_Portal, ObjMode.cpp:1718-1732): a town portal to the act's town,
 * the camp, where the hero stands, as a scroll's (travel.ts openTownPortal). D2's doesn't close the
 * hero's other town portal; the game keeps one a hero, so this one takes its place
 */
function portalShrine(g: Game): string {
  openTownPortal(g);
  return '一扇回营地的传送门打开了';
}

/** the chipped gems the gem shrine gives one of when it upgrades none, rand % 6 (ObjMode.cpp:1771-1796) */
const CHIPPED = ['gcw', 'gcr', 'gcg', 'gcb', 'gcy', 'gcv'];

/**
 * The gem shrine (D2GAME_SHRINES_Gem, ObjMode.cpp:1735-1802): the first gem in the bag that has a
 * better one (Misc.txt BetterGem; a skull is a gem too) is taken up and its better one dropped at the
 * hero's feet (OBJMODE_DropShrineGem, 1805-1851: the new gem, normal, on the ground beside them, the
 * old one out of the bag); with none, a random chipped gem (no skull) dropped there. The bag is the
 * inventory's page, not the stash's, the cube's or the belt's.
 */
function gemShrine(g: Game, p: Player): string {
  for (const { item } of p.inventory.items) {
    const b = D2_BASES[item.baseId];
    const next = b && 'next' in b ? b.next : undefined;
    if (!b || !isType(b, 'gem') || !next || !D2_BASES[next]) continue;
    p.inventory.remove(item);
    g.hooks.inventoryChanged();
    g.spawnDrops(p.pos, [{ kind: 'item', item: createItem(next) }]);
    return '一颗宝石升级了';
  }
  g.spawnDrops(p.pos, [{ kind: 'item', item: createItem(CHIPPED[roll(MATH_RAND, CHIPPED.length)]) }]);
  return '一颗碎裂的宝石落在地上';
}

/** D2's room, 8 × 8 of its tiles: 40 subtiles a side (DrlgRoom; objgroups.ts SubRoom) */
const ROOM = 40 * M_PER_SUBTILE;
/**
 * Whether `b` is in `a`'s room or one of the eight round it: what UNITFINDS_FindAllMatchingUnitsInNeighboredRooms
 * looks through. D2's rooms are its maps'; here the 8 × 8-tile squares of the map from its corner
 */
export const nearRooms = (a: P2, b: P2): boolean => Math.abs(Math.floor(a.x / ROOM) - Math.floor(b.x / ROOM)) <= 1 && Math.abs(Math.floor(a.z / ROOM) - Math.floor(b.z / ROOM)) <= 1;

/** a shrine missile's level: the hero's level / 5, from 1 to 8 (ObjMode.cpp:1911-1920, 2055-2063, 2128-2136) */
export const shrineMissileLevel = (p: Player): number => Math.min(8, Math.max(1, Math.trunc(p.level / 5)));

/**
 * The fire shrine (D2GAME_SHRINES_Storm, ObjMode.cpp:1854-1925): every player and monster alive in the
 * shrine's room and the rooms round it (nearRooms) loses Arg0 % of the life it has, the hero and the
 * hireling too, a loss of life and not a blow (it cannot kill: half of what is left); then sixteen
 * fireballs (missile 62) of the hero's, at shrineMissileLevel, fly from the shrine at (±5x, ±5y)
 * subtiles off it, x and y 1 to 4, as the hero's Fire Ball of that level does.
 */
function fireShrine(g: Game, p: Player, obj: WorldObject, s: D2xShrine): string {
  const L = g.level;
  const cut = (life: number) => life - Math.trunc((Math.floor(life) * s.arg0) / 100);
  for (const f of g.friendlies?.() ?? [p]) if (!f.dead && nearRooms(obj.pos, f.pos)) f.life = cut(f.life);
  for (const m of L.monsters) if (!m.dead && nearRooms(obj.pos, m.pos)) m.life = cut(m.life);
  const lvl = shrineMissileLevel(p);
  const sp = p.skillParams('fire_ball', lvl);
  for (let x = 1; x < 5; x++) {
    for (let y = 1; y < 5; y++) {
      const to = { x: (x & 1 ? 5 : -5) * x * M_PER_SUBTILE, z: (y & 1 ? 5 : -5) * y * M_PER_SUBTILE };
      const len = Math.hypot(to.x, to.z) || 1;
      const pk = emptyPacket();
      pk.fire = randInt(sp.min, sp.max);
      pk.source = p;
      pk.spell = true;
      const pr = new Projectile('fireball', obj.pos, { x: (to.x / len) * FIREBALL.speed, z: (to.z / len) * FIREBALL.speed }, p, 'player', pk, FIREBALL.range / FIREBALL.speed, 0.35);
      pr.splash = sp.radius;
      L.projectiles.push(pr);
    }
  }
  g.fx.burst('fireblast', obj.pos, { radius: 2 });
  g.sfx.play('skill.fire_cast', { pos: obj.pos, vol: 0.8 });
  return '烈焰四溅，周围的一切失去了一半生命';
}
/** the hero's fireball's flight (playerctl.ts): metres a second, metres */
const FIREBALL = { speed: 12, range: 13 };

/**
 * The monster shrine (D2GAME_SHRINES_Monster, ObjMode.cpp:1952-1972): the nearest monster to the hero
 * that may be (OBJMODE_IsMonsterShrineCandidate, 1975-1994: an evil one, alive, standing or walking,
 * one that walks, no boss, no prime evil, none champion, unique or minion already) is made one
 * (MONSTERUNIQUE_AssignRandomUMods with champions allowed, MonsterUnique.cpp:2094-2207: a champion one
 * time in the MonUMod constant's, else a unique with the difficulty's count of modifiers) with its
 * minions (spawn.ts promoteByShrine). D2 looks in the hero's room and those round it (nearRooms).
 */
function monsterShrine(g: Game, p: Player): string {
  let best: Monster | null = null;
  let bd = Infinity;
  for (const m of g.level.monsters) {
    if (!shrineCandidate(m) || !nearRooms(p.pos, m.pos)) continue;
    const d = dist(m.pos, p.pos);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (!best) return '四周静悄悄的';
  promoteByShrine(g.level, best, new RNG((Math.random() * 0x7fffffff) | 0));
  return '附近的一只怪物变得强大';
}

/** whether a monster is one the monster shrine may make stronger (OBJMODE_IsMonsterShrineCandidate, ObjMode.cpp:1975-1994) */
export function shrineCandidate(m: Monster): boolean {
  const row = m.def.row;
  if (m.dead || m.rank !== 'normal' || row.boss || row.primeEvil || row.npc || (row.align ?? 0) !== 0) return false;
  if (!(m.state === 'idle' || m.state === 'move')) return false;
  // MonStats2's walk mode and a height: the nests and the like stand still
  return (row.velocity ?? 0) > 0;
}

/** where the exploding and poison shrines' potions fly, in subtiles off the shrine (ObjMode.cpp:2039-2040, 2112-2113) */
const POTION_TO: readonly [number, number][] = [
  [-6, 6],
  [-6, -6],
  [0, 6],
  [0, -6],
  [6, 6],
  [6, -6],
];

/**
 * The exploding and poison shrines (D2GAME_SHRINES_Exploding, Poison, ObjMode.cpp:1997-2140):
 * Arg0 + rand(Arg1 − Arg0) potions, exploding (opm) or choking gas (gpm), one each, dropped at the
 * hero's feet; then six of their missiles (explosivepotion 45, chokinggaspoition 48) of the hero's,
 * at shrineMissileLevel, thrown from the shrine at the six spots of POTION_TO. Each bursts where it
 * lands (Missiles.txt alwaysExplode), after its flight (16 a frame, D2's units): the exploding one's
 * fire and physical damage in its 3-subtile radius (sHitPar1), the gas one's poison (its cloud,
 * chokinggascloud, as one blast of its poison over its 2 seconds, the cloud's own drift left out).
 */
function potionShrine(g: Game, p: Player, obj: WorldObject, s: D2xShrine): string {
  const L = g.level;
  const gas = s.code === 22;
  const n = s.arg0 + roll(MATH_RAND, Math.max(0, s.arg1 - s.arg0));
  const drops = Array.from({ length: n }, () => ({ kind: 'item' as const, item: createItem(gas ? 'gpm' : 'opm') }));
  for (const d of drops) d.item.qty = 1;
  g.spawnDrops(p.pos, drops);
  const missile = gas ? 'chokinggaspoition' : 'explosivepotion';
  const lvl = shrineMissileLevel(p);
  const dmg = missileDamage(missile, lvl);
  // its speed, D2's Vel at 75 % in metres a second (monstats.ts missileFlight)
  const speed = missileFlight(missile, lvl).speed || 1;
  for (const [ox, oy] of POTION_TO) {
    const at = { x: obj.pos.x + ox * M_PER_SUBTILE, z: obj.pos.z + oy * M_PER_SUBTILE };
    if (!L.map.walkableAt(at.x, at.z)) continue;
    const pk = emptyPacket();
    pk.source = p;
    pk.spell = true;
    if (dmg) {
      pk.phys = randInt(dmg.phys[0], Math.max(dmg.phys[0], dmg.phys[1]));
      if (dmg.elem?.type === 'fire') pk.fire = randInt(dmg.elem.min, Math.max(dmg.elem.min, dmg.elem.max));
      if (dmg.elem?.type === 'pois') {
        pk.poison = randInt(dmg.elem.min, Math.max(dmg.elem.min, dmg.elem.max));
        pk.poisonLen = dmg.elem.seconds;
      }
    }
    const flight = (Math.hypot(ox, oy) * M_PER_SUBTILE) / speed;
    const b = new DelayedBlast(at, (gas ? GAS_RADIUS : 3) * M_PER_SUBTILE, flight, pk, 'player', gas ? 'poison' : 'fire', p);
    b.fx = gas ? 'poisoncloud' : 'fireblast';
    L.blasts.push(b);
  }
  g.sfx.play('env.explode', { pos: obj.pos, vol: 0.6 });
  return gas ? '毒气药水四散飞溅' : '爆炸药水四散飞溅';
}
/** a choking gas potion's cloud, subtiles round where it lands: its ring of chokinggascloud missiles (sHitPar1, 2: density 2, 2; their size 2), approximate */
const GAS_RADIUS = 4;
