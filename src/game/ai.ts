// Diablo II's monster AI (D2Game/src/AI): each monster thinks when its last move or attack is done
// or its stand is up, finds the hero as D2 does and does what its MonStats AI does with its own
// parameters (src/game/d2/monai.ts has the rules that need no game). Its blows, missiles and
// casts, and what the champion and unique modifiers do in a fight, are here too.
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f; "AiThink.cpp" is
// D2Game/src/AI/AiThink.cpp, "AiTactics.cpp" D2Game/src/AI/AiTactics.cpp.
import { chance, dist, rand, randInt, type P2 } from '../core/math';
import { FRAMES_PER_SEC } from '../core/units';
import { D2X_DIFFICULTIES } from '../data/d2x/difficulty';
import { D2X_MISSILES } from '../data/d2x/missiles';
import { D2X_MONUMOD_CONSTANTS } from '../data/d2x/superuniques';
import { lookKey, monsterDef, type ProjectileKind } from '../data/monsters';
import { BURIAL_GROUNDS } from '../world/areas';
import { emptyPacket, type DamagePacket } from './actor';
import { applyDamage, monsterStrike } from './combat';
import * as A from './d2/monai';
import { attackAt, missileDamage, missileFlight, monLvl, skillMissile, type AttackMode } from './d2/monstats';
import type { Game } from './game';
import type { Friendly } from './merc';
import { Monster, type MonsterAct } from './monster';
import { face, faceNow, moveBy, stepToward } from './movement';
import { DelayedBlast, Projectile } from './objects';
import { Player } from './player';

const F = A.frames;
const SUB = A.subtiles(1);

/**
 * How far off a friendly may be a monster's target at all (docs/M2A.md 怪物: the nearer of the hero
 * and the hireling, neither in a town nor 55 subtiles or more off); its notice range decides after
 */
const TARGET_RANGE = A.subtiles(55);

/**
 * The hero's side a monster can go for: the hero and the hireling, alive, on this map
 * (Game.friendlies); a stand-in game (the seamless test's) has only its hero
 */
const friendlies = (g: Game): Friendly[] => g.friendlies?.() ?? (g.player.dead ? [] : [g.player]);

/** the friendly it goes for, as it last thought (Monster.target); with none, the hero, as every monster did before there was another */
const foe = (g: Game, m: Monster): Friendly => m.target ?? g.player;

/** a roll between two damage ends: a whole one, unless an end is fractional (poison's totals) */
const between = (lo: number, hi: number) => (Number.isInteger(lo) && Number.isInteger(hi) ? randInt(lo, Math.max(lo, hi)) : lo + Math.random() * Math.max(0, hi - lo));

/** D2's elemental damage onto a packet, by MonStats' El types; poison's is its whole damage, cold's chills for its frames */
function addElem(pk: DamagePacket, type: string, v: number, frames: number) {
  switch (type) {
    case 'fire':
      pk.fire += v;
      break;
    case 'ltng':
      pk.light += v;
      break;
    case 'cold':
      pk.cold += v;
      if (frames > 0) pk.chill = Math.max(pk.chill ?? 0, F(frames));
      break;
    case 'pois':
      pk.poison += v;
      if (frames > 0) pk.poisonLen = F(frames);
      break;
    case 'mag':
      pk.magic += v;
      break;
    case 'mana':
      pk.mana = (pk.mana ?? 0) + v;
      break;
  }
}

/** MonUMod constants 28 and 31: a spectral hit's damage, 66–100 % of MonLvl's (MonsterUnique.cpp:1392-1396) */
const SPECTRAL = [D2X_MONUMOD_CONSTANTS[28].value, D2X_MONUMOD_CONSTANTS[31].value];

/** what auras round a monster add to its attacks: damage %, to-hit %, attack rate % */
export interface AuraBuff {
  dmg: number;
  ar: number;
  rate: number;
}
const NO_BUFF: AuraBuff = { dmg: 0, ar: 0, rate: 0 };

/**
 * The party auras of the aura-enchanted uniques round it (Might, Blessed Aim, Fanaticism): each
 * aura once, the strongest of it in reach; Fanaticism's damage whole on its owner, half on the
 * rest (Skills.txt Fanaticism: passive ln56, aurastat ln56/2)
 */
export function auraBuff(g: Game, m: Monster): AuraBuff {
  const L = g.level;
  if (!L.auras.length) return NO_BUFF;
  const best = new Map<string, AuraBuff>();
  for (const o of L.auras) {
    const a = o.aura;
    if (!a || o.dead || dist(o.pos, m.pos) > a.n.radius) continue;
    const n = a.n;
    const b = { dmg: (n.dmgPct ?? 0) / (a.skill === 'Fanaticism' && o !== m ? 2 : 1), ar: n.arPct ?? 0, rate: n.ratePct ?? 0 };
    const had = best.get(a.skill);
    if (!had || b.dmg + b.ar + b.rate > had.dmg + had.ar + had.rate) best.set(a.skill, b);
  }
  if (!best.size) return NO_BUFF;
  const out = { dmg: 0, ar: 0, rate: 0 };
  for (const b of best.values()) {
    out.dmg += b.dmg;
    out.ar += b.ar;
    out.rate += b.rate;
  }
  return out;
}

/**
 * A blow of a monster's in an attack mode (MonsterMode.cpp:216-330): its physical damage and to-hit
 * at its level, the mode's elemental damage on its chance, its modifiers' on every blow (the
 * enchantments, ghostly's cold, mana burn), and a spectral hit's random element (MonsterUnique.cpp:1351-1427).
 * `buff`: the auras round it (auraBuff)
 */
export function monsterPacket(m: Monster, mode: AttackMode = m.mode, mult = 1, buff: AuraBuff = NO_BUFF): DamagePacket {
  const pk = emptyPacket();
  const a = attackAt(m.def.row, m.difficulty, m.level, mode, m.dmgPct + buff.dmg, m.arPct + buff.ar);
  if (a) {
    pk.phys = randInt(a.min, Math.max(a.min, a.max)) * mult;
    pk.ar = a.ar;
  } else pk.ar = m.ar;
  // the mode's elements this blow, by type: D2 sets each one's stats, so a later one of a type stands
  const el = new Map<string, { v: number; frames: number }>();
  for (const e of m.elems(mode)) {
    if (e.pct < 100 && !chance(e.pct / 100)) continue;
    el.set(e.type, { v: between(e.min, e.max), frames: e.frames });
  }
  if (m.hasOwn(27)) {
    // one of fire, lightning, magic, cold, poison at MonLvl's damage × 66–100 %, set over the mode's own
    // of that element; cold and poison last 40 frames more than the mode's own did. Poison's is a rate
    // in 256ths of a point a frame (STAT_POISONMINDAM), so its whole damage is that × its frames / 256
    const dm = monLvl(Math.max(1, m.level)).dm[m.difficulty];
    const type = ['fire', 'ltng', 'mag', 'cold', 'pois'][randInt(0, 4)];
    const v = randInt(Math.trunc((dm * SPECTRAL[0]) / 100), Math.trunc((dm * SPECTRAL[1]) / 100));
    const long = type === 'cold' || type === 'pois';
    const frames = long ? (el.get(type)?.frames ?? 0) + 40 : 0;
    el.set(type, { v: type === 'pois' ? (v * frames) / 256 : v, frames });
  }
  for (const [type, e] of el) addElem(pk, type, e.v * mult, e.frames);
  const plus = m.plus;
  if (plus.fire) pk.fire += randInt(plus.fire[0], plus.fire[1]) * mult;
  if (plus.light) pk.light += randInt(plus.light[0], plus.light[1]) * mult;
  if (plus.cold) addElem(pk, 'cold', randInt(plus.cold[0], plus.cold[1]) * mult, plus.coldFrames ?? 0);
  if (plus.mana) pk.mana = (pk.mana ?? 0) + randInt(plus.mana[0], plus.mana[1]);
  pk.source = m;
  return pk;
}

/** what a D2 missile looks like here: the look's own for its shots, else by the missile's element */
function missileLook(m: Monster, id: string): ProjectileKind {
  const e = D2X_MISSILES[id]?.elem?.type;
  if (id.startsWith('andy') || id.startsWith('andariel')) return 'poisonspit';
  if (m.def.missile) return m.def.missile;
  return e === 'fire' ? 'firebolt' : e === 'cold' ? 'iceshard' : e === 'ltng' ? 'lightning' : e === 'pois' ? 'poisonspit' : 'arrow';
}

/**
 * A monster's D2 missile `id` at `level`, shot from the attack `mode` toward `at`: its own damage at
 * that level and the share of the mode's blow it carries (SrcDamage); one without ToHit always
 * lands. It flies at its Missiles.txt speed for its Range (missileFlight). A champion or unique
 * with multiple shots looses two more, at either side of the target a subtile off
 * (MONSTERUNIQUE_CreateMultishotMissiles, MonsterUnique.cpp:1592-1657), not for a NoMultiShot missile.
 */
export function shoot(g: Game, m: Monster, id: string, level: number, mode: AttackMode, at: P2, opts: { spread?: number; mult?: number; buff?: AuraBuff } = {}) {
  const mult = opts.mult ?? 1;
  const ms = D2X_MISSILES[id];
  if (!ms) return;
  const own = missileDamage(id, level);
  const kind = missileLook(m, id);
  const fl = missileFlight(id, level);
  const out = emptyPacket();
  out.source = m;
  if (own) {
    if (own.src > 0) Object.assign(out, monsterPacket(m, mode, own.src * mult, opts.buff));
    else out.ar = attackAt(m.def.row, m.difficulty, m.level, mode, m.dmgPct, m.arPct)?.ar ?? m.ar;
    out.phys += between(own.phys[0], own.phys[1]) * mult;
    if (own.elem) addElem(out, own.elem.type, between(own.elem.min, own.elem.max) * mult, own.elem.seconds * FRAMES_PER_SEC);
    out.spell = !ms.toHit;
  }
  const fire = (to: P2, a: number) => {
    const d = dist(m.pos, to) || 1;
    let dx = (to.x - m.pos.x) / d;
    let dz = (to.z - m.pos.z) / d;
    if (a) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    const start = { x: m.pos.x + dx * (m.radius + 0.2), z: m.pos.z + dz * (m.radius + 0.2) };
    const p = new Projectile(kind, start, { x: dx * fl.speed, z: dz * fl.speed }, m, 'monster', { ...out }, fl.life, kind === 'fireball' ? 0.35 : 0.22);
    if (kind === 'fireball') p.splash = 1.6;
    g.level.projectiles.push(p);
  };
  const spread = opts.spread ?? 0;
  fire(at, spread);
  if (m.hasOwn(29) && !ms.flags?.includes('noMultiShot')) {
    // D2's signs of the two differences, turned a quarter: a subtile beside the target either way
    const sx = Math.sign(m.pos.x - at.x);
    const sz = Math.sign(m.pos.z - at.z);
    fire({ x: at.x - sz * SUB, z: at.z + sx * SUB }, spread);
    fire({ x: at.x + sz * SUB, z: at.z - sx * SUB }, spread);
  }
  g.sfx.play(kind === 'arrow' ? 'combat.arrow' : kind === 'iceshard' ? 'skill.cold_cast' : kind === 'lightning' ? 'skill.lightning_cast' : kind === 'poisonspit' ? 'skill.poison_cast' : 'skill.fire_cast', { pos: m.pos, vol: 0.5 });
}

/**
 * How far its blow reaches, centre to the hero's edge: its look's arm, and MonStats2 MeleeRng more of
 * D2's unit distance, half a subtile each: UNITS_IsInMeleeRange hits within MeleeRng + 1 of
 * D2Common_10399 (Units.cpp:2984-2992), twice the octagonal gap between the two (Units.cpp:3700-3790)
 */
export function meleeReach(m: Monster): number {
  return m.def.range + A.unitGap(m.def.row.meleeRng);
}

/** the frames between an attack's end and its next thought (MonStats aidel) */
const delay = (m: Monster) => A.aiDelay(m.def.row, m.difficulty);
/** an AI parameter of its row in its difficulty */
const aip = (m: Monster, n: number) => A.aip(m.def.row, m.difficulty, n);
/** a roll under a % */
const roll = (pct: number) => A.rolls(pct, Math.random);
const lifePct = (m: Monster) => (100 * m.life) / Math.max(1, m.maxLife);

/** the hero as a monster's AI sees them as it thinks (D2's pAiTickParam) */
interface Target {
  /** the distance, subtiles (nTargetDistance) */
  d: number;
  /** within its blow's reach and in sight (bCombat) */
  combat: boolean;
}

// ───────────────────────── what a monster does ─────────────────────────

/** stand for `frames` before it thinks again (AITACTICS_IdleInNeutralMode, AiTactics.cpp:243-268) */
function stand(m: Monster, frames: number) {
  m.move = null;
  if (m.state !== 'idle') m.setState('idle');
  m.thinkTimer = F(Math.max(1, frames));
}

/**
 * A move: at the hero (to null) or to a spot, `bonus` % velocity more for it (AITACTICS_SetVelocity).
 * It goes `len` subtiles of path before it thinks again (the newDist SetVelocity may set; at most
 * PATH_MAX): at the hero PATH_STEP if none is set, to a spot all the way. At the hero it ends sooner
 * in its blow's reach (the game's), or, given `steps` (the WithSteps tactics, AiTactics.cpp:432-451),
 * as near as D2's steps stop it (A.stepStop)
 */
function go(g: Game, m: Monster, to: P2 | null, o: { bonus?: number; steps?: number; len?: number; fallback?: boolean; reach?: number } = {}) {
  const path = A.subtiles(Math.min(A.PATH_MAX, o.len ?? A.PATH_STEP));
  const left = !to ? path : o.len ? Math.min(dist(m.pos, to) + 0.5, path) : dist(m.pos, to) + 0.5;
  const near = !to && o.steps ? m.radius + foe(g, m).radius + A.stepStop(o.steps) : 0;
  m.move = {
    to: to && { ...to },
    speed: m.moveSpeed(o.bonus ?? 0),
    left,
    reach: o.reach ?? (to ? 0.15 : heroReach(g, m, near)),
    near,
    stuck: 0,
    fallback: o.fallback,
  };
  m.speed = m.move.speed;
  if (m.state !== 'move') m.setState('move');
}

/**
 * Where a move at its target ends, centre to centre: in its blow's reach once it sees them, else right
 * up to them, round what's between (the game's); or where its steps stop it (`near`), if farther
 */
function heroReach(g: Game, m: Monster, near: number): number {
  return Math.max(near, m.hasLos ? (meleeReach(m) + foe(g, m).radius) * 0.9 : 0.3);
}

/** a spot to walk to near `to` the monster can stand on, or null (D2's path to it would fail) */
function spot(g: Game, m: Monster, to: P2): P2 | null {
  const map = g.level.monsterMap;
  if (map.circleClear(to.x, to.z, m.radius)) return to;
  return map.nearestWalkable(to.x, to.z, 1.5);
}

/** walk to a spot near it (AITACTICS_WalkCloseToUnit, AiTactics.cpp:503-534) */
function wander(g: Game, m: Monster, n: number, bonus = 0) {
  const to = spot(g, m, A.wanderPoint(m.pos, n, Math.random));
  if (to) go(g, m, to, { bonus });
  else stand(m, 10);
}

/** walk off from its target (D2GAME_AICORE_Escape, AiTactics.cpp:454-478); whether it could */
function escape(g: Game, m: Monster, n: number, bonus = 0): boolean {
  const to = spot(g, m, A.escapePoint(m.pos, foe(g, m).pos, n));
  if (!to || dist(to, m.pos) < SUB) return false;
  go(g, m, to, { bonus });
  return true;
}

/**
 * Circle the hero (AITACTICS_WalkToTargetWithRandomPathType, AiTactics.cpp:613-638: path type 5 or
 * 6, half the time each): D2's two side-stepping paths, here an arc of `n` subtiles round them
 */
function circle(g: Game, m: Monster, n: number, bonus = 0) {
  const p = foe(g, m).pos;
  const r = Math.max(SUB, dist(m.pos, p));
  const a = Math.atan2(m.pos.x - p.x, m.pos.z - p.z) + ((chance(0.5) ? 1 : -1) * A.subtiles(n)) / r;
  const to = spot(g, m, { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r });
  if (to) go(g, m, to, { bonus });
  else stand(m, 10);
}

/** walk to `desired` subtiles from the hero, `step` at most (AITACTICS_MoveInRadiusToTarget, AiTactics.cpp:722-765) */
function keepAt(g: Game, m: Monster, step: number, desired: number, bonus = 0) {
  const p = foe(g, m).pos;
  const d = dist(m.pos, p) / SUB;
  const k = Math.min(Math.abs(d - desired), step) * Math.sign(d - desired);
  const l = Math.max(1e-6, dist(m.pos, p));
  const to = spot(g, m, { x: m.pos.x + ((p.x - m.pos.x) / l) * A.subtiles(k), z: m.pos.z + ((p.z - m.pos.z) / l) * A.subtiles(k) });
  if (to && dist(to, m.pos) > 0.05) go(g, m, to, { bonus });
  else stand(m, 10);
}

/** start an attack, a shot or a cast, in the state its look plays it in, at the auras' attack rate */
function begin(g: Game, m: Monster, act: MonsterAct) {
  m.move = null;
  m.act = act;
  if (act.kind === 'blow' || act.kind === 'missile') m.mode = act.mode as AttackMode;
  const cast = act.kind === 'raise' || act.kind === 'cry' || act.kind === 'summon' || act.kind === 'teleport' || (act.kind === 'missile' && m.def.shootIn === 'cast');
  const rate = 1 + auraBuff(g, m).rate / 100;
  m.setState(cast ? 'cast' : 'attack', 1 / (m.attackSpeed * rate * Math.max(0.1, m.slowFactor())));
  faceNow(m, act.corpse?.pos ?? act.to ?? foe(g, m).pos);
}

/** a blow in a mode */
const blow = (g: Game, m: Monster, mode: AttackMode) => begin(g, m, { kind: 'blow', mode });

/** A1 by a "% Attack1, else Attack2" parameter, A1 alone when it has no A2 (AITACTICS_ChangeModeAndTargetUnitToAttack1Or2, AiThink.cpp:253-263) */
function a1or2(m: Monster, a1Pct: number): AttackMode {
  if (!m.modes().includes('a2')) return 'a1';
  return roll(a1Pct) ? 'a1' : 'a2';
}

/** the difficulty's MonsterSkillBonus: what its skills' levels gain (Monster.cpp:247-262) */
const skillBonus = (m: Monster) => D2X_DIFFICULTIES[m.difficulty].monsterSkillBonus;

/** a shot from the mode its row has a missile for (MonStats2 MissA1…), at the skill bonus + 1 (MonsterMode.cpp:1341-1350) */
function shot(g: Game, m: Monster, mode: AttackMode, count = 1): boolean {
  const id = m.def.row.missiles?.[mode];
  if (!id || !D2X_MISSILES[id]) return false;
  begin(g, m, { kind: 'missile', mode, missile: id, level: skillBonus(m) + 1, count });
  return true;
}

/** a skill of its row's (MonStats Skill1–8) that flies a missile, cast in S1, at its level and the skill bonus */
function castSkill(g: Game, m: Monster, i: number): boolean {
  const s = m.def.row.skills?.[i];
  const id = s && skillMissile(m.def.row, s.skill);
  if (!s || !id) return false;
  begin(g, m, { kind: 'missile', mode: 's1', missile: id, level: s.lvl + skillBonus(m) });
  return true;
}

// ───────────────────────── the AIs ─────────────────────────

type Think = (g: Game, m: Monster, t: Target) => void;

/** AITHINK_Fn002_Skeleton (AiThink.cpp:308-335) */
function skeleton(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Skeleton;
  if (t.combat) {
    if (roll(aip(m, P.attack))) return blow(g, m, a1or2(m, aip(m, P.a1)));
  } else if (roll(aip(m, P.approach))) return go(g, m, null, { fallback: true });
  stand(m, aip(m, P.stall));
}

/** AITHINK_Fn003_Zombie (AiThink.cpp:339-364): shambles about until the hero is near, then lurches at them at +100 % */
function zombie(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Zombie;
  if (t.combat) return blow(g, m, a1or2(m, aip(m, P.a1)));
  // in the Burial Grounds (LEVEL_BURIALGROUNDS) they come at once
  const burial = g.level.areaAt(m.pos.x, m.pos.z).id === BURIAL_GROUNDS;
  if (m.wasHit || (t.d < aip(m, P.aware) && roll(aip(m, P.approach))) || burial) return go(g, m, null, { bonus: 100 });
  wander(g, m, 3);
}

/** AITHINK_Fn004_Bighead (AiThink.cpp:370-441) */
function bighead(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Bighead;
  if (!t.combat && m.wasHit) return void shot(g, m, 'a2');
  if (lifePct(m) >= aip(m, P.hurt)) {
    if (t.combat) return blow(g, m, 'a1');
    if (t.d < 15 && m.hasLos && roll(aip(m, P.fireHealthy)) && shot(g, m, 'a2')) return;
    return go(g, m, null, { fallback: true });
  }
  if (t.d >= 3) {
    if (t.d > 15) return go(g, m, null, { steps: 6 });
    if (m.hasLos && roll(aip(m, P.fireHurt)) && shot(g, m, 'a2')) return;
    if (roll(aip(m, P.circle))) return circle(g, m, 3);
    return stand(m, 10);
  }
  if (!escape(g, m, 5, 50)) shot(g, m, 'a2');
}

/** AITHINK_Fn005_BloodHawk (AiThink.cpp:445-509): the foul crows, swooping in and out */
function bloodHawk(g: Game, m: Monster, t: Target) {
  const P = A.AIP.BloodHawk;
  if (m.aiFlag === 1 && t.combat) {
    m.aiFlag = 0;
    return blow(g, m, 'a1');
  }
  m.aiFlag = 0;
  if (t.combat) {
    if (!roll(aip(m, P.attack)) && escape(g, m, 4, aip(m, P.runVel))) return;
    return blow(g, m, 'a1');
  }
  if (roll(aip(m, P.charge))) {
    m.aiFlag = 1;
    // the charge's path as long as the hero is far (SetVelocity's newDist, AiThink.cpp:474)
    return go(g, m, null, { bonus: aip(m, P.chargeVel), len: t.d });
  }
  if (t.d <= 3) {
    if (!escape(g, m, 4, aip(m, P.runVel))) blow(g, m, 'a1');
    return;
  }
  if (!roll(aip(m, P.wander))) wander(g, m, 3);
  else wander(g, m, 4, -50);
}

/**
 * AITHINK_Fn006_Fallen (AiThink.cpp:513-661). Any monster dying near it sends it running from the
 * hero at +50 % (12 subtiles each way) while the corpse dies; it comes back for a hero within its
 * aip2 or on its leader's cry, and its next blow needs no attack roll. A party's leader may cry
 * its pack on (S2) when the hero is within 15 subtiles: they walk at them and strike on their roll.
 */
function fallen(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Fallen;
  if (A.frightened(m, g.level.deaths)) {
    m.aiFlag = 1;
    m.cmd = 0;
    if (escape(g, m, 12, 50)) return;
  }
  // D2's guard for a thought mid-mode (AiThink.cpp:569-573); here it thinks in neutral (walk)
  if (m.state !== 'idle') return stand(m, 10);
  if (m.cmd === 0) {
    if (!t.combat && m.wasHit) return go(g, m, null);
    // a leader is its own minion owner (AIGENERAL_GetMinionOwner(pUnit) == pUnit)
    if (t.d < 15 && m.leads && roll(aip(m, P.command))) {
      for (const o of m.minions) if (!o.dead) o.cmd = 1;
      m.cmd = 1;
      return begin(g, m, { kind: 'cry', mode: 's2' });
    }
    if (!t.combat) {
      if (t.d <= aip(m, P.approachDist)) return go(g, m, null, { fallback: true });
      if (roll(30)) return wander(g, m, 3);
      return stand(m, 10);
    }
    if (!m.aiFlag && !roll(aip(m, P.attack))) {
      if (roll(30)) return begin(g, m, { kind: 'cry', mode: 's2' });
      return stand(m, 10);
    }
    m.aiFlag = 0;
    return blow(g, m, a1or2(m, aip(m, P.a1)));
  }
  if (m.cmd !== 1) {
    m.cmd = 0;
    return stand(m, 10);
  }
  if (t.combat) {
    if (!roll(aip(m, P.attack))) return stand(m, 5);
    return blow(g, m, a1or2(m, aip(m, P.a1)));
  }
  go(g, m, null);
  // a walk that can't be made drops the order (AiThink.cpp:656-659): see walk
  if (m.move) m.move.dropCmd = true;
}

/** AITHINK_Fn007_Brute (AiThink.cpp:665-688): walks at the hero, the faster the more it is hurt */
function brute(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Brute;
  if (t.combat) {
    if (roll(aip(m, P.attack))) return blow(g, m, a1or2(m, aip(m, P.a1)));
    if (roll(aip(m, P.attack))) return circle(g, m, 4);
    return stand(m, 15);
  }
  go(g, m, null, { bonus: A.bruteHaste(lifePct(m)), fallback: true });
}

/** AITHINK_Fn009_Wraith (AiThink.cpp:828-856) */
function wraith(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Wraith;
  if (t.combat) {
    if (roll(aip(m, P.attack))) return blow(g, m, 'a1');
  } else if (roll(aip(m, P.approach))) return keepAt(g, m, 12, 0);
  stand(m, aip(m, P.stall));
}

/** AITHINK_Fn010_CorruptRogue (AiThink.cpp:860-904): the huntmaiden runs in from afar at its MonAI Run Velocity */
function corruptRogue(g: Game, m: Monster, t: Target) {
  const P = A.AIP.CorruptRogue;
  if (t.d <= 20 - 3 * m.difficulty) {
    if (t.combat) {
      if (roll(aip(m, P.attack))) return blow(g, m, 'a1');
      return stand(m, aip(m, P.stall));
    }
    if (!roll(aip(m, P.approach))) return stand(m, aip(m, P.stall));
    if (!roll(aip(m, P.run))) return go(g, m, null, { fallback: true });
  }
  go(g, m, null, { bonus: aip(m, P.runVel), steps: 3 });
}

/** AITHINK_Fn012_019_Goatman_Swarm (AiThink.cpp:1643-1663) */
function goatman(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Goatman;
  if (t.combat) {
    if (roll(aip(m, P.attack))) return blow(g, m, 'a1');
  } else if (roll(aip(m, P.approach))) return go(g, m, null, { fallback: true });
  stand(m, aip(m, P.stall));
}

/**
 * AITHINK_Fn013_FallenShaman (AiThink.cpp:1127-1195): bites when at the hero, raises its fallen
 * (raiseTarget), orders them on, throws its fire within aip5 subtiles, circles them otherwise
 */
function fallenShaman(g: Game, m: Monster, t: Target) {
  const P = A.AIP.FallenShaman;
  if (t.combat && roll(aip(m, P.melee))) return blow(g, m, 'a1');
  const range = aip(m, P.raiseRange);
  const near = m.rank === 'unique' ? g.level.monstersNear(m.pos, A.subtiles(range)) : [];
  const corpse = A.raiseTarget(m, range, m.minions.map(raisable), near.map(raisable))?.m;
  if (roll(aip(m, P.command))) for (const o of m.minions) if (!o.dead) o.cmd = 1;
  if (corpse && roll(aip(m, P.command)) && clearOver(g, corpse)) return begin(g, m, { kind: 'raise', mode: 's1', corpse });
  const far = aip(m, P.shootRange);
  if (t.d < far && roll(aip(m, P.shoot)) && castSkill(g, m, 1)) return;
  if (m.hasLos && t.d < far && roll(aip(m, P.shoot)) && castSkill(g, m, 1)) return;
  if (roll(aip(m, P.melee))) return circle(g, m, 3);
  stand(m, 10);
}

/** a corpse as raiseTarget sees it */
function raisable(c: Monster) {
  return { m: c, pos: c.pos, dead: c.dead, deathTime: c.deathTime, rank: c.rank, kind: lookKey(c.def.row), spent: !c.corpseRaisable, owner: c.leader };
}

/**
 * nothing alive stands on a corpse, so it can get up there (MONSTERSPAWN_CheckSkillPlacement;
 * SkillMonst.cpp:1310-1312): no monster, no friendly (the hero, lying dead or not, as ever)
 */
function clearOver(g: Game, c: Monster): boolean {
  for (const o of g.level.monstersNear(c.pos, 1.5)) if (!o.dead && o !== c && dist(o.pos, c.pos) < (o.radius + c.radius) * 0.8) return false;
  for (const f of [g.player, ...friendlies(g)]) if (dist(f.pos, c.pos) < (f.radius + c.radius) * 0.8) return false;
  return true;
}

/** AITHINK_Fn014_QuillRat (AiThink.cpp:1050-1123): wanders until the hero is near, then shoots its quills (A2) and backs off */
function quillRat(g: Game, m: Monster, t: Target) {
  const P = A.AIP.QuillRat;
  if (t.combat) return blow(g, m, 'a1');
  if (m.wasHit) return void shot(g, m, 'a2');
  const walk = aip(m, P.walk);
  if (t.d >= aip(m, P.activate)) return wander(g, m, Math.max(3, walk));
  if (roll(aip(m, P.shoot))) return void shot(g, m, 'a2');
  if (!escape(g, m, walk)) {
    if (t.d < 4) return void shot(g, m, 'a2');
    wander(g, m, Math.max(3, walk));
  }
}

/** AITHINK_Fn035_CorruptArcher (AiThink.cpp:3480-3563) */
function corruptArcher(g: Game, m: Monster, t: Target) {
  const P = A.AIP.CorruptArcher;
  if (!m.hasLos) {
    if (!roll(50)) return stand(m, aip(m, P.stall));
    return circle(g, m, 3);
  }
  if (!t.combat && m.wasHit) return void shot(g, m, 'a1');
  if (t.d < 6 && roll(aip(m, P.run)) && escape(g, m, 12, 100)) return;
  const walkTo = aip(m, P.walkTo);
  if (walkTo > 0 && t.d > walkTo && roll(aip(m, P.approach))) return go(g, m, null, { bonus: 10, steps: walkTo });
  const always = aip(m, P.alwaysRun);
  if (t.d > always) return go(g, m, null, { bonus: 100, steps: always });
  if (roll(aip(m, P.shoot))) return void (shot(g, m, 'a1') || blow(g, m, 'a1'));
  stand(m, aip(m, P.stall));
}

/**
 * AITHINK_Fn036_CorruptLancer (AiThink.cpp:3567-3631): the spearmaiden runs in from beyond aip5
 * subtiles, her path steps her MeleeRng, and strikes from her spear's longer reach
 */
function corruptLancer(g: Game, m: Monster, t: Target) {
  const P = A.AIP.CorruptLancer;
  const steps = Math.max(1, m.def.row.meleeRng);
  if (t.d > aip(m, P.alwaysRun)) {
    go(g, m, null, { bonus: 100, steps });
    m.aiFlag = 1;
    return;
  }
  if (t.combat) {
    if (!m.aiFlag && !roll(aip(m, P.attack))) return stand(m, aip(m, P.stall));
    m.aiFlag = 0;
    return blow(g, m, 'a1');
  }
  if (roll(aip(m, P.approach))) {
    if (roll(aip(m, P.run))) return go(g, m, null, { bonus: 100, steps });
    return go(g, m, null, { steps: 3 });
  }
  stand(m, aip(m, P.stall));
}

/** AITHINK_Fn037_SkeletonBow (AiThink.cpp:3635-3683) */
function skeletonBow(g: Game, m: Monster, t: Target) {
  const P = A.AIP.SkeletonBow;
  if (m.wasHit && m.hasLos) return void shot(g, m, 'a1');
  if (m.hasLos && t.d < 20) {
    if (roll(aip(m, P.shoot))) return void shot(g, m, 'a1');
    if (roll(20)) return circle(g, m, 3);
    return stand(m, aip(m, P.stall));
  }
  if (roll(aip(m, P.approach))) return keepAt(g, m, aip(m, P.steps), aip(m, P.keep));
  stand(m, 20);
}

/** AITHINK_Fn064_SkeletonMage (AiThink.cpp:5640-5700) */
function skeletonMage(g: Game, m: Monster, t: Target) {
  const P = A.AIP.SkeletonMage;
  const near = aip(m, P.approachDist);
  if (m.hasLos) {
    if (t.d > near && roll(aip(m, P.approach))) return go(g, m, null, { bonus: 10, steps: near });
    if (t.d <= aip(m, P.tooClose) && roll(aip(m, P.walkAway))) {
      if (!escape(g, m, 5, 25)) shot(g, m, 'a1') || blow(g, m, 'a1');
      return;
    }
    if (t.d < aip(m, P.fireDist) && roll(aip(m, P.shoot)) && shot(g, m, 'a1')) return;
  }
  if (t.d <= near || !roll(aip(m, P.approach))) {
    if (!roll(aip(m, P.circle))) return stand(m, aip(m, P.stall));
    return circle(g, m, 4);
  }
  go(g, m, null, { bonus: 10, steps: near });
}

/**
 * The AIs not built yet (Arach's webs, the Vampire's spells, the Fetish's attack loop): at the hero
 * and a blow, or a shot from afar if it has a missile; the game's, not D2's
 */
function fallback(g: Game, m: Monster, t: Target) {
  if (t.combat) return blow(g, m, a1or2(m, 50));
  const ms = m.missile();
  if (ms && m.hasLos && dist(m.pos, foe(g, m).pos) < A.subtiles(15) && roll(50)) {
    const i = ms.skill ? (m.def.row.skills ?? []).findIndex((s) => s.skill === ms.skill) : -1;
    if (i >= 0 ? castSkill(g, m, i) : shot(g, m, ms.mode)) return;
  }
  go(g, m, null, { fallback: true });
}

/** AITHINK_Fn098_Smith (AiThink.cpp:8750-8761): at the hero and a blow, walking faster as he is hurt */
function smith(g: Game, m: Monster, t: Target) {
  if (t.combat) return blow(g, m, 'a1');
  go(g, m, null, { bonus: A.smithHaste(lifePct(m)), fallback: true });
}

/**
 * AITHINK_Fn034_Andariel (AiThink.cpp:3427-3476), her AI as D2 has it; her two skills
 * approximated: the Spray (SrvDo088, SkillMonst.cpp:330-…) as a fan of eight andarielspray
 * missiles across D2's nine directions round the hero (a quarter turn), the Poison Bolt
 * (AndyPoisonBolt, in A1) one andypoisonbolt
 */
function andariel(g: Game, m: Monster, t: Target) {
  const P = A.AIP.Andariel;
  if (t.combat) {
    if (roll(aip(m, P.sprayMelee))) return begin(g, m, { kind: 'spray', mode: 'sq' });
    return blow(g, m, 'a1');
  }
  if (roll(aip(m, P.stall))) return stand(m, 5);
  if (roll(aip(m, P.ranged))) {
    if (roll(aip(m, P.sprayRanged))) return begin(g, m, { kind: 'spray', mode: 'sq' });
    return begin(g, m, { kind: 'missile', mode: 'a1', missile: 'andypoisonbolt', level: 1 + skillBonus(m) });
  }
  go(g, m, null, { fallback: true });
}

/**
 * AITHINK_Fn059_BloodRaven (AiThink.cpp:10356-10520), her AI as D2 has it: kept within 50 subtiles of
 * where she stands at first, running at the hero from beyond 20, raising zombies near them now and
 * then (Nest: approximated as one of her party's zombies at the spot, which gives no experience
 * and drops nothing, SkillMonst.cpp:697-735), else her arrows (A1, raven1), a Quick Strike (raven1
 * as well, at full damage: SkillMonst.cpp:757-790) the more often the harder the difficulty, or
 * a step aside; up close she backs off
 */
function bloodRaven(g: Game, m: Monster, t: Target) {
  const p = foe(g, m).pos;
  const home = m.homePos;
  if (t.d > 45) return stand(m, 5);
  const heroHome = dist(p, home) / SUB;
  if (heroHome >= 50 || dist(m.pos, home) / SUB > 50 || (m.aiFlag === 2 && dist(m.pos, home) / SUB > 5)) {
    m.aiFlag = 2;
    return go(g, m, home, { bonus: 100 });
  }
  if (m.aiFlag === 2) m.aiFlag = 0;
  if (t.d > 20 && heroHome < 50) {
    const to = spot(g, m, A.wanderPoint(p, Math.max(Math.trunc(t.d / 2), 12), Math.random));
    if (to) return go(g, m, to, { bonus: 100 });
  }
  m.aiCount += 3;
  const summons = m.minions.filter((o) => o.noXp).length;
  if (!t.combat && summons < 2 * m.difficulty + 8 && roll(m.aiCount)) {
    const to = spot(g, m, A.wanderPoint(p, 5 + randInt(0, 14), Math.random));
    if (to) {
      m.aiCount = 0;
      return begin(g, m, { kind: 'summon', mode: 'sq', to });
    }
  }
  if (t.d > 5) {
    if (roll(5) && heroHome < 50) {
      const to = spot(g, m, A.wanderPoint(p, 12, Math.random));
      if (to) return go(g, m, to, { bonus: 100 });
    }
    if (m.hasLos && !m.wasHit && roll(80)) {
      // Quick Strike: her sequence looses it; MonSeq.txt, which says how often, isn't imported, so three arrows
      if (roll(10 * (m.difficulty + 4))) return void shot(g, m, 'a1', 3);
      return void shot(g, m, 'a1');
    }
    return circle(g, m, 4, 50);
  }
  if (roll(30) && t.d < 12 && escape(g, m, 12 - Math.trunc(t.d), 100)) return;
  shot(g, m, 'a1');
}

/** the AIs by MonStats AI */
const THINK: Record<string, Think> = {
  Skeleton: skeleton,
  Zombie: zombie,
  Bighead: bighead,
  BloodHawk: bloodHawk,
  Fallen: fallen,
  Brute: brute,
  Wraith: wraith,
  CorruptRogue: corruptRogue,
  Goatman: goatman,
  FallenShaman: fallenShaman,
  QuillRat: quillRat,
  Andariel: andariel,
  CorruptArcher: corruptArcher,
  CorruptLancer: corruptLancer,
  SkeletonBow: skeletonBow,
  SkeletonMage: skeletonMage,
  Smith: smith,
  BloodRaven: bloodRaven,
};

// ───────────────────────── thinking ─────────────────────────

/**
 * whether it sees its target (foe), `dP` off, within its notice range (UNITS_TestCollisionWithUnit,
 * COLLIDE_MISSILE_BARRIER): looked at every 0.25 s, and as it thinks
 */
function sight(g: Game, m: Monster, dP: number) {
  m.losTimer = 0.25;
  m.hasLos = dP < A.subtiles(A.noticeRange(m.def.row, m.difficulty)) + 1 && g.level.map.los(m.pos, foe(g, m).pos);
}

/** a friendly that is no target: dead, or in a town (AIUTIL_CanSelectHostileTarget: not if DUNGEON_IsRoomInTown) */
const gone = (g: Game, f: Friendly) => f.dead || g.level.inTown(f.pos);

/** its target is no target any more (gone) */
const lost = (g: Game, m: Monster) => gone(g, foe(g, m));

/** none of the hero's side is a target anywhere: all of them dead or in a town */
const noneLeft = (g: Game) => friendlies(g).every((f) => gone(g, f));

/**
 * The friendly a monster at `from` goes for (docs/M2A.md 怪物): the nearest of the hero's side that
 * is alive, not in a town and within 55 subtiles (TARGET_RANGE); null when none is. Its notice
 * range, sight and blindness then decide whether it finds them (findTarget)
 */
export function friendlyTarget(g: Game, m: Monster, from: P2 = m.pos): Friendly | null {
  let best: Friendly | null = null;
  let bd = TARGET_RANGE;
  for (const f of friendlies(g)) {
    if (gone(g, f)) continue;
    const d = dist(from, f.pos);
    if (d < bd || (d === bd && !best)) {
      best = f;
      bd = d;
    }
  }
  return best;
}

/**
 * The hero as its target (AIUTIL_FindAiTarget, AiUtil.cpp:672-879): within its notice range (MonStats
 * aidist, else 35 subtiles), and in a dungeon in sight until it has noticed them; null if not.
 * Noticing them wakes its pack with it. D2 looks for sight only in a room that isn't LOS-drawn
 * (AiUtil.cpp:684-704, !DUNGEON_CheckLOSDraw); the wilderness's rooms are (DRLGROOM_CheckLOSDraw,
 * DrlgDrlgRoom.cpp:483-493: the type-1 rooms DRLGOUTPLACE_CreateOutdoorRoomEx makes, DrlgOutPlace.cpp:2740-2749),
 * a maze's preset rooms aren't: out there a monster notices a hero behind a tree or a rock as well.
 */
function findTarget(g: Game, m: Monster, dP: number): Target | null {
  // the friendly it goes for this thought (think: friendlyTarget), `dP` off
  const p = m.target;
  // after a walk at them it couldn't make, this once by sight, wherever it is (AI flag 0x40, AiUtil.cpp:684-688)
  const mustSee = m.mustSee;
  m.mustSee = false;
  if (!p) return null;
  const d = dP / SUB;
  if (d >= A.noticeRange(m.def.row, m.difficulty)) return null;
  if (!m.hasLos && (mustSee || (!m.awake && g.level.areaAt(m.pos.x, m.pos.z).kind === 'dungeon'))) return null;
  // blinded by the hero's weapon: it finds them only within arm's reach
  if (m.blindTime > 0 && dP > meleeReach(m) + p.radius + 0.6) return null;
  if (!m.awake) notice(g, m);
  return { d, combat: dP <= meleeReach(m) + p.radius && m.hasLos };
}

/**
 * It has noticed the hero, or was struck before it had (Game.wake), and its pack with it: D2 has
 * each find them on its own, but a pack stands together and so comes on together; here it does so
 * at once. A boss says so.
 */
export function notice(g: Game, m: Monster) {
  m.awake = true;
  for (const o of m.pack ?? []) if (!o.dead) o.awake = true;
  if (m.rank === 'boss' || m === g.level.boss) {
    g.sfx.play('monster.boss_wake', { pos: m.pos });
    g.hooks.message(`${m.displayName} 被惊醒了！`, '#c8a86a');
    g.say('boss_near');
  }
}

/**
 * with no target: home if it had the hero's side and none of them is a target any more (the game's:
 * none waits at a camp's gate), wandering if just hit, else it stands; `dP` the hero's distance, or its target's
 */
function noTarget(g: Game, m: Monster, dP: number) {
  if (m.awake && noneLeft(g) && dist(m.pos, m.homePos) > 0.5) return go(g, m, m.homePos, { reach: 0.5 });
  // just hit and nothing to fight back: it moves off (AITACTICS_FindTargetOrIdleInNeutralMode, AiTactics.cpp:40-48)
  if (m.wasHit) return wander(g, m, 5);
  stand(m, A.idleWithoutTarget(dP / SUB));
}

/**
 * What every monster's AI does first (AITHINK_HandleMonsterAiPreActions, AiThink.cpp:17526-17600):
 * a unique, a champion or a boss that first sees the hero within 20 subtiles stops a moment (its
 * taunt; D2 plays its MonSounds taunt with it, SUNIT_AttachSound(pUnit, 16), AiThink.cpp:17537,
 * which the game has no sound for); a teleporting one (MonUMod 26, AI flag 0x20) blinks away 15
 * times in 100 of the 40 in 100 it thinks of it, if it is hurt below 30 % or keeps its distance
 * and the hero is within 10 subtiles, and if hurt heals its level in life a quarter of those times
 */
function preActions(g: Game, m: Monster, t: Target): boolean {
  if ((m.rank === 'unique' || m.rank === 'champion' || m.rank === 'boss' || m.def.boss) && !m.taunted && t.d < 20) {
    m.taunted = true;
    stand(m, 20);
    return true;
  }
  if (!m.hasOwn(26) || !roll(40)) return false;
  const hurt = lifePct(m) < 30;
  const melee = !!m.def.row.melee || lookKey(m.def.row) === 'bighead';
  if ((!hurt && (melee || t.d >= 10)) || randInt(0, 99) >= 15) return false;
  // MONSTERREGION_FindSpawnLocation finds it a spot in the room it stands in (blinkSpot)
  const to = blinkSpot(g, m);
  if (!to) return false;
  if (hurt && roll(25) && m.noHealTime <= 0) m.life = Math.min(m.maxLife, m.life + m.level);
  begin(g, m, { kind: 'teleport', mode: 'a1', to });
  return true;
}

/** a D2 room: an outdoor one's 8 × 8 tiles (DRLGOUTPLACE_CreateOutdoorRoomEx, DrlgOutdoors.cpp:824), 5 subtiles a tile */
const ROOM = A.subtiles(40);

/**
 * A spot to teleport to (MONSTERREGION_FindSpawnLocation, MonsterRegion.cpp:30-138): 20 tries at
 * random in the room it stands in, a subtile in from its edges, where it can stand. The game's
 * maps have no D2 rooms: here the room-sized square of a grid over the map that it stands in, in
 * its own area (a D2 room is in one level) and not in a town
 */
function blinkSpot(g: Game, m: Monster): P2 | null {
  const L = g.level;
  const map = L.monsterMap;
  const x0 = Math.floor(m.pos.x / ROOM) * ROOM;
  const z0 = Math.floor(m.pos.z / ROOM) * ROOM;
  const area = L.areaAt(m.pos.x, m.pos.z).id;
  for (let k = 0; k < 20; k++) {
    const p = { x: x0 + A.subtiles(rand(1, 39)), z: z0 + A.subtiles(rand(1, 39)) };
    if (map.circleClear(p.x, p.z, m.radius) && L.areaAt(p.x, p.z).id === area && !L.inTown(p)) return p;
  }
  return null;
}

/**
 * The minion leash, before it looks for the hero (D2GAME_AICORE_MinionLeash_6FCF0D10,
 * AiThink.cpp:17427-17469): a unique's minion more than 20 subtiles from it, while it lives, walks
 * back to a spot 19 off it (A.LEASH); one that can't walk, or whose unique is dead, has no owner
 * from then on. Whether it went, or tried to.
 */
function leash(g: Game, m: Monster): boolean {
  const o = m.leashTo;
  if (!o) return false;
  // one without MonStats2's walk mode keeps none: here one that has no velocity (none of Act 1's minions)
  if (o.dead || !m.def.row.velocity) {
    m.leashTo = null;
    return false;
  }
  if (!A.pastLeash(m.pos, o.pos, m.def.row.size[0])) return false;
  // a spot it can't stand on, nor near: nothing this thought, as a walk D2 can't make (think stands it a moment)
  const to = spot(g, m, A.wanderPoint(o.pos, A.LEASH_WANDER, Math.random));
  if (to) go(g, m, to, { len: A.LEASH_PATH });
  return true;
}

/**
 * it thinks (AITHINK_ExecuteMonsterAiTick, AiThink.cpp:17340-17411) where it stood as this step began
 * (`from`): the friendly it goes for chosen (friendlyTarget), its line of sight to them looked at afresh
 */
function think(g: Game, m: Monster, from: P2) {
  m.thinkTimer = 0;
  m.target = friendlyTarget(g, m, from);
  const dP = dist(from, foe(g, m).pos);
  sight(g, m, dP);
  if (!leash(g, m)) {
    const t = findTarget(g, m, dP);
    if (!t) noTarget(g, m, dP);
    else if (!preActions(g, m, t)) (THINK[m.def.row.ai] ?? fallback)(g, m, t);
  }
  // an AI that chose nothing (a shot it has no missile for) stands a moment, as D2's idles
  if (m.state === 'idle' && !m.move && m.thinkTimer <= 0) stand(m, 10);
  // D2 keeps the get-hit as its AI state (sub_6FCF2E70, AiUtil.cpp:1276-1280) until its next mode
  // other than neutral (MonsterMode.cpp:1796-1812): a stand keeps it for the next thought. A hit
  // with no get-hit (19) is a get-hit's (3) after that mode, gone after the next
  if (m.move || m.state !== 'idle') {
    if (m.hitHeld) m.hitHeld = false;
    else m.wasHit = false;
  }
}

/**
 * The move under way, a step of it; false once it has ended (reached, its steps gone, or stuck),
 * when D2 thinks again at once (MonsterMode.cpp:766-770)
 */
function walk(g: Game, m: Monster, dt: number): boolean {
  const mv = m.move!;
  const p = foe(g, m);
  if (!mv.to && lost(g, m)) {
    m.move = null;
    return false;
  }
  const before = { x: m.pos.x, z: m.pos.z };
  const sp = mv.speed * m.slowFactor();
  // at the hero: as its sight of them now has it
  if (!mv.to) mv.reach = heroReach(g, m, mv.near ?? 0);
  const reached = stepToward(g, m, mv.to ?? p.pos, sp, dt, mv.reach, mv.to ? 600 : 3000);
  const moved = dist(before, m.pos);
  mv.left -= moved;
  mv.stuck = moved < sp * dt * 0.2 ? mv.stuck + dt : 0;
  if (!reached && mv.left > 0 && mv.stuck < 0.4) return true;
  m.move = null;
  m.setState('idle');
  if (!reached && mv.stuck >= 0.4) {
    if (mv.dropCmd) m.cmd = 0;
    // MoveToTarget's flags 7 (AiTactics.cpp:340-366): a walk it can't make has it look for the hero
    // by sight next (1), and 70 % a wander instead, else a stand (2)
    if (mv.fallback) {
      m.mustSee = true;
      if (roll(70)) wander(g, m, 4);
      else stand(m, 10);
      return true;
    }
  }
  return false;
}

export function updateMonster(g: Game, m: Monster, dt: number) {
  const p = g.player;
  if (m.dead) {
    m.deathTime += dt;
    return;
  }
  // statuses
  if (m.chillTime > 0) m.chillTime -= dt;
  if (m.stunTime > 0) m.stunTime -= dt;
  if (m.slowTime > 0) m.slowTime -= dt;
  if (m.noHealTime > 0) m.noHealTime -= dt;
  if (m.bleedTime > 0) {
    m.bleedTime -= dt;
    m.life -= m.bleedDps * dt;
    if (m.life <= 0) {
      g.killMonster(m, 'phys', m.bleedBy);
      return;
    }
  }
  if (m.poisonTime > 0) {
    m.poisonTime -= dt;
    m.life -= m.poisonDps * dt;
    if (m.life <= 0) {
      g.killMonster(m, 'poison', m.poisonBy);
      return;
    }
  }
  // D2's regen: STAT_HPREGEN a frame (Monster.cpp:228), none for champions and uniques, none while it can't heal
  if (m.regen > 0 && m.life < m.maxLife && m.noHealTime <= 0) m.life = Math.min(m.maxLife, m.life + m.regen * dt);
  const kv = m.knockVel;
  if (Math.abs(kv.x) + Math.abs(kv.z) > 0.05) {
    moveBy(g, m, kv.x * dt, kv.z * dt);
    const decay = Math.exp(-9 * dt);
    kv.x *= decay;
    kv.z *= decay;
  }
  const slow = m.slowFactor();
  // where it stands as it starts this step: what it thinks from, after the walk below
  const from = { x: m.pos.x, z: m.pos.z };
  const t = foe(g, m);
  m.losTimer -= dt;
  if (m.losTimer <= 0) sight(g, m, dist(m.pos, t.pos));
  if (m.aura) auraAround(g, m, dt);

  if (m.state === 'hit') {
    m.stateTime += dt;
    // D2's next thought is set for a frame: the get-hit's count against a stand it broke off
    m.thinkTimer -= dt;
    if (m.stateTime < m.stateDur) return;
    // its get-hit done, knowing it was hit: back in neutral it thinks after its AI delay if its
    // thought is due by now, else when it comes (MONSTERMODE_StartNeutral, MonsterMode.cpp:1080-1112)
    const left = m.thinkTimer;
    m.act = null;
    m.move = null;
    m.wasHit = true;
    stand(m, delay(m));
    if (left > 0) m.thinkTimer = left;
    return;
  }
  // stunned or frozen: nothing (AiThink.cpp:17353-17357)
  if (m.stunTime > 0) return;

  if (m.state === 'attack' || m.state === 'cast') {
    // its target stepped into a town (or fell) mid-swing: no target any more, the swing is dropped
    if (lost(g, m) && (m.act?.kind === 'blow' || m.act?.kind === 'missile' || m.act?.kind === 'spray')) {
      m.act = null;
      stand(m, delay(m));
      return;
    }
    m.stateTime += dt * slow;
    if (!m.actionFired && m.stateTime >= m.stateDur * 0.5) {
      m.actionFired = true;
      fire(g, m);
    }
    if (m.stateTime < m.stateDur * 0.5 && m.act?.kind !== 'raise' && m.act?.kind !== 'summon') face(m, t.pos, dt, 8);
    if (m.stateTime >= m.stateDur) {
      m.act = null;
      // an attack's end: it stands its AI delay before it thinks again (MonsterMode.cpp:1080-1115)
      stand(m, delay(m));
    }
    return;
  }
  if (m.fleeTime > 0) {
    // the hero's weapon made it flee: away from them, whomever it was after
    m.fleeTime -= dt;
    const away = { x: m.pos.x + (m.pos.x - p.pos.x) * 2, z: m.pos.z + (m.pos.z - p.pos.z) * 2 };
    stepToward(g, m, away, m.walkSpeed * slow, dt, 0.2, 400);
    if (m.state !== 'move') m.setState('move');
    return;
  }
  if (m.move) {
    if (walk(g, m, dt)) return;
  } else {
    m.thinkTimer -= dt;
    if (m.thinkTimer > 0) return;
  }
  think(g, m, from);
}

// ───────────────────────── what goes off ─────────────────────────

/** an attack's or cast's moment: the blow lands, the missile flies, the corpse gets up */
function fire(g: Game, m: Monster) {
  const p = foe(g, m);
  const act = m.act;
  if (!act) return;
  switch (act.kind) {
    case 'blow': {
      const big = m.rank === 'boss' || m === g.level.boss;
      if (dist(m.pos, p.pos) <= meleeReach(m) + p.radius + 0.7) {
        monsterStrike(g, m, p, monsterPacket(m, act.mode as AttackMode, 1, auraBuff(g, m)), true);
        if (big) g.fx.shake(0.15);
      }
      g.sfx.play('monster.swing', { pos: m.pos });
      return;
    }
    case 'missile': {
      const n = act.count ?? 1;
      for (let i = 0; i < n; i++) shoot(g, m, act.missile!, act.level ?? 1, act.mode as AttackMode, p.pos, { spread: (i - (n - 1) / 2) * 0.08, buff: auraBuff(g, m) });
      return;
    }
    case 'spray': {
      const level = 1 + skillBonus(m);
      for (let i = 0; i < 8; i++) shoot(g, m, 'andarielspray', level, 'a1', p.pos, { spread: ((i - 3.5) / 3.5) * (Math.PI / 4) });
      return;
    }
    case 'raise':
      if (act.corpse) raise(g, m, act.corpse);
      return;
    case 'teleport':
      if (act.to) {
        g.fx.burst('teleport', m.pos);
        m.pos = { ...act.to };
        m.prevPos = { ...act.to };
        m.path = null;
        g.fx.burst('teleport', m.pos);
        g.sfx.play('skill.teleport', { pos: m.pos, vol: 0.5 });
      }
      return;
    case 'summon':
      if (act.to) summon(g, m, act.to);
      return;
    case 'cry':
      return;
  }
}

/**
 * A shaman's Resurrect (SKILLS_SrvDo097_Resurrect, SkillMonst.cpp:1291-1340): the corpse, still
 * there and with nothing standing on it, gets up with all its life (SKILLS_ResurrectUnit,
 * SkillMonst.cpp:1254-1287), its kill undone, and gives no experience or drop when killed again
 */
function raise(g: Game, m: Monster, c: Monster) {
  if (!c.dead || !c.corpseRaisable || !clearOver(g, c)) return;
  c.dead = false;
  c.life = c.maxLife;
  c.deathTime = 0;
  c.killedBy = 'phys';
  c.noXp = true;
  c.poisonTime = c.bleedTime = c.chillTime = c.stunTime = 0;
  c.awake = m.awake;
  c.aiFlag = c.cmd = 0;
  c.act = null;
  c.move = null;
  // it gets up in its resurrect mode (MonStats2 ResurrectMode, S1 for the Fallen): it stands as long
  stand(c, A.DEATH_FRAMES);
  g.fx.burst('resurrect', c.pos);
  g.sfx.play('monster.resurrect', { pos: c.pos });
}

/** Blood Raven's Nest: one of her party's zombies at the spot, hers (SkillMonst.cpp:697-735: UNITFLAG_NOXP | UNITFLAG_NOTC) */
function summon(g: Game, m: Monster, at: P2) {
  const id = m.def.row.minions?.[0];
  const def = id && monsterDef(id);
  if (!def) return;
  const z = new Monster(def, def.row.diff[m.difficulty].level, 'minion', at, [], { difficulty: m.difficulty });
  z.noXp = true;
  z.awake = true;
  z.follow(m);
  g.level.monsters.push(z);
  g.fx.burst('resurrect', at);
  g.sfx.play('monster.resurrect', { pos: at });
}

/**
 * An aura-enchanted unique's aura on the hero's side (MonUMod 30): Holy Freeze's slow on whoever is
 * in it, Conviction's resistances and defense on the hero (the hireling's come with her), the holy
 * auras' damage on each of them every perdelay
 */
function auraAround(g: Game, m: Monster, dt: number) {
  const a = m.aura!;
  const n = a.n;
  const inside = friendlies(g).filter((f) => dist(m.pos, f.pos) <= n.radius + f.radius && !g.level.inTown(f.pos));
  for (const p of inside) {
    if (n.res !== undefined && p instanceof Player) {
      p.convictTime = 0.3;
      p.convictRes = Math.max(p.convictRes, n.res);
      p.convictDef = Math.max(p.convictDef, n.def ?? 0);
    }
    if (n.slow) {
      p.chillTime = Math.max(p.chillTime, 0.3);
      p.chillAmount = Math.max(p.chillTime > 0.3 ? p.chillAmount : 0, n.slow / 100);
    }
  }
  if (!n.pulse) return;
  m.auraPulse -= dt;
  if (m.auraPulse > 0) return;
  m.auraPulse = n.pulse.every;
  g.fx.burst(n.pulse.elem === 'fire' ? 'holyfire' : n.pulse.elem === 'cold' ? 'freeze' : 'lightning', m.pos, { radius: n.radius });
  for (const p of inside) {
    const pk = emptyPacket();
    pk[n.pulse.elem] = between(n.pulse.min, n.pulse.max);
    pk.spell = true;
    pk.source = m;
    applyDamage(g, p, pk, m.pos);
  }
}

/**
 * A monster has died: the Fallen near it see it die (Level.deaths, their rooms' last deaths), and a
 * party's leader passes its lead on if its row says so (BossXfer), else leaves its minions
 * masterless, as a unique always does (AIGENERAL_UpdateMinionList, AiGeneral.cpp:563-629)
 */
export function monsterDied(g: Game, m: Monster) {
  const d = g.level.deaths;
  d.push(m);
  if (d.length > 16) d.shift();
  if (!m.leads || !m.minions.length) return;
  // a party's leader owns its minions with its row's BossXfer (AI flag 2, MonsterSpawn.cpp:1117-1120),
  // a unique or superunique without it, whatever its row (AIGENERAL_SetOwnerData(…, 1, 1, 0), MonsterUnique.cpp:2470)
  if (m.def.row.bossXfer && m.rank !== 'unique') {
    // D2's minion list is newest first (here last), and the first of it whose unit is still there,
    // lying dead or not, leads the rest and the dead leader (AiGeneral.cpp:583-620; one cleared from
    // the map has left the list, corpseGone). It puts the dead leader at the head of its own list,
    // then each of the rest at the head in turn, newest first: here after its own, the dead leader,
    // then the rest newest first, so the first of them spawned is its list's head
    const next = m.minions[m.minions.length - 1];
    next.leader = null;
    next.minions = [...next.minions, m, ...m.minions.slice(0, -1).reverse()];
    for (const o of next.minions) o.leader = next;
    next.leads = true;
    m.leads = false;
    m.minions = [];
    return;
  }
  // each owned by none, dead or not (AiGeneral.cpp:574-580), so raised it raises none of them (a
  // unique's minions' leash goes with it as they next think: leash)
  // (raiseTarget); it keeps its list, and its orders still reach them (AIGENERAL_AllocCommandsForMinions,
  // AiGeneral.cpp:214-235, copies its order to every unit on its owner's list, whoever owns it)
  for (const o of m.minions) o.leader = null;
}

/**
 * A corpse gone from its map (Game.update's cleanup): off its leader's minion list and the level's
 * last deaths too, so no shaman raises a corpse that isn't there and no lead passes to it (D2's
 * corpse unit is freed with it, and a resurrect needs a corpse in the room, SkillMonst.cpp:1291-1340)
 */
export function corpseGone(g: Game, m: Monster) {
  // a raise already begun at it fizzles (raise)
  m.corpseRaisable = false;
  const l = m.leader;
  const i = l ? l.minions.indexOf(m) : -1;
  if (i >= 0) l!.minions.splice(i, 1);
  const d = g.level.deaths;
  const j = d.indexOf(m);
  if (j >= 0) d.splice(j, 1);
}

/** damage from an exploding corpse etc.: a monster's on each of the hero's side in it */
export function blastDamage(g: Game, b: DelayedBlast) {
  if (b.faction === 'monster') {
    for (const p of friendlies(g)) if (!p.dead && dist(p.pos, b.pos) <= b.radius + p.radius) applyDamage(g, p, { ...b.dmg }, b.pos);
  } else {
    for (const m of g.level.monstersTouching(b.pos, b.radius)) {
      if (!m.dead && dist(m.pos, b.pos) <= b.radius + m.radius) applyDamage(g, m, { ...b.dmg }, b.pos);
    }
  }
}
