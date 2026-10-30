// What the hireling does (M2a's M line): Diablo II's AI for a hireling (AITHINK_Fn… the "Hireable" AI,
// D2Game AI/AiThink.cpp, by line at D2MOO d9d394f): she follows her hero at their gait, is brought to
// them from far off, and out of the camp picks the nearest foe in sight and shoots it, now her plain
// arrow, now one of her skills (hireling.ts actionWeights and pickAction, their numbers from skillcalc
// through mercSkills): Fire Arrow and Cold Arrow turn part of the shot elemental, Exploding Arrow's
// shot bursts into fire where it lands, Freezing Arrow's freezes what is round it ('frze', not a
// chill: missiles.json freezingarrowexp3), and Inner Sight she switches on, an aura that takes defense
// off the foes round her. Her arrows roll D2's chance to hit as any missile with ToHit does.
import { chance, dist, randInt, type P2 } from '../core/math';
import { M_PER_SUBTILE } from '../core/units';
import { D2X_DIFFICULTIES } from '../data/d2x/difficulty';
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_SKILLS } from '../data/d2x/skills';
import type { ProjectileKind } from '../data/monsters';
import { actionWeights, pickAction, type ActionWeights, type MercSkill } from './d2/hireling';
import { aiDelay, frames } from './d2/monai';
import { missileFlight } from './d2/monstats';
import { resistance } from './d2/stats';
import { emptyPacket, type DamagePacket } from './actor';
import { applyDamage, hitOdds } from './combat';
import type { Game } from './game';
import type { Merc } from './merc';
import type { Monster } from './monster';
import { face, faceNow, stepToward } from './movement';
import { Projectile } from './objects';

const SUB = M_PER_SUBTILE;
const ROW = D2X_MONSTERS.roguehire;

/** past this from her hero she runs back to them (AiThink.cpp:9406-9419: the AI parameter's default, 24 subtiles) */
const FOLLOW_MAX = 24 * SUB;
/** past this she goes with them at their gait, walking or running (16 subtiles; AiThink.cpp:9435-9448) */
const FOLLOW_MIN = 16 * SUB;
/** a foe nearer her than this, out of town, she fights (AiThink.cpp:9466-9474: nDist < 25 subtiles) */
const ENGAGE = 25 * SUB;
/** nearer than this to her foe she may step back to her hero first (AiThink.cpp:9824-9839: 4 subtiles) */
const TOO_CLOSE = 4 * SUB;
/**
 * The frames of her shot (her A1): approximate, as D2's animdata for RG isn't imported; her bow's own
 * speed doesn't change it here
 */
export const SHOT_FRAMES = 15;
/** her shot's arrow leaves the bow half-way through, as a monster's (ai.ts) */
const LOOSE_AT = 0.5;

/** her think put off `n` frames (AITACTICS_IdleInNeutralMode) */
function idle(m: Merc, n: number) {
  m.thinkTimer = frames(n);
  m.goal = null;
  if (m.state !== 'hit' && m.state !== 'dead') m.setState('idle');
}

/** the distance D2 measures between two units, their sizes off (AIUTIL_GetDistanceToCoordinates_FullUnitSize), metres */
const gap = (a: { pos: P2; radius: number }, b: { pos: P2; radius: number }) => Math.max(0, dist(a.pos, b.pos) - a.radius - b.radius);

/** a roll under 100 (AI_RollPercentage) */
const pct = () => randInt(0, 99);

/**
 * Her step's AI (merc.ts updateMerc): a stagger runs out, a shot runs its frames and looses its
 * arrow half-way, a walk goes on to its end (D2 thinks nothing while she walks or runs: AiThink.cpp:
 * 9396-9401), and when her thought is due she thinks (think). Her aura pulses meanwhile
 */
export function thinkMerc(g: Game, m: Merc, dt: number) {
  sightPulse(g, m, dt);
  if (m.state === 'hit') {
    m.stateTime += dt;
    if (m.stateTime >= m.stateDur) idle(m, 5);
    return;
  }
  if (m.state === 'attack') {
    const s = m.shot;
    m.stateTime += dt * m.slowFactor();
    if (s && !s.target.dead && m.stateTime < m.stateDur * LOOSE_AT) face(m, s.target.pos, dt, 10);
    if (s && !m.actionFired && m.stateTime >= m.stateDur * LOOSE_AT) {
      m.actionFired = true;
      loose(g, m, s.skill, s.target);
    }
    if (m.stateTime >= m.stateDur) {
      m.shot = null;
      // the attack's end: she stands her AI delay before she thinks again (MonsterMode.cpp:1080-1115)
      idle(m, aiDelay(ROW, g.player.rules));
    }
    return;
  }
  if (m.goal) {
    m.thinkTimer -= dt;
    const arrived = stepToward(g, m, m.goal, m.goalSpeed, dt, 0.5, 1500);
    if (m.state !== 'move') m.setState('move');
    // a walk ends where it goes, or after a while to look again (D2 asks for a new path then)
    if (arrived || m.thinkTimer <= -0.8) idle(m, 0);
    return;
  }
  m.thinkTimer -= dt;
  if (m.thinkTimer > 0) return;
  think(g, m);
}

/** she walks to `to`, running or not, and thinks again on the way (thinkMerc) */
function walkTo(m: Merc, to: P2, run: boolean) {
  m.goal = { ...to };
  m.goalSpeed = m.speedOf(run);
  m.thinkTimer = 0;
  m.path = null;
  if (m.state !== 'move') m.setState('move');
}

/**
 * Her thought (the Hireable AI, AiThink.cpp:9394-9500): far from her hero she runs after them (past 24
 * subtiles) or keeps up with them at their gait while they walk or run (past 16); else, out of town,
 * the nearest foe in sight within 25 subtiles is fought (HirelingCombat); else now and then (5 %) she
 * steps closer to her hero, and stands
 */
function think(g: Game, m: Merc) {
  const p = g.player;
  if (p.dead) return idle(m, 10);
  const d = gap(m, p);
  // to a spot by them on her side, not onto them (D2 walks her to a formation offset, AiThink.cpp:9525-9560)
  if (d > FOLLOW_MAX) return walkTo(m, nearOwner(g, m), true);
  if (d > FOLLOW_MIN && p.state === 'move') return walkTo(m, nearOwner(g, m), p.runningNow());
  if (!g.level.inTown(m.pos)) {
    const t = selectTarget(g, m);
    if (t) {
      m.foe = t;
      return combat(g, m, t);
    }
  }
  m.foe = null;
  if (pct() < 5 && d > 2 * SUB) return walkTo(m, nearOwner(g, m), false);
  idle(m, 5);
}

/** a spot by her hero, on her side of them, to walk to */
function nearOwner(g: Game, m: Merc): P2 {
  const p = g.player.pos;
  const dx = m.pos.x - p.x;
  const dz = m.pos.z - p.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: p.x + (dx / l) * 1.2, z: p.z + (dz / l) * 1.2 };
}

/**
 * The foe she goes for (AIUTIL_SelectAiTargetWithCollisionCheck, AiUtil.cpp:1191-1244): the nearest
 * live monster hostile to the hero in her line of sight, within ENGAGE of her; none in a town
 */
export function selectTarget(g: Game, m: Merc): Monster | null {
  let best: Monster | null = null;
  let bd = ENGAGE;
  const L = g.level;
  for (const t of L.monstersNear(m.pos, ENGAGE + 2)) {
    if (t.dead || t.def.row.align !== 0 || L.inTown(t.pos)) continue;
    const d = gap(m, t);
    if (d >= bd) continue;
    if (!L.map.los(m.pos, t.pos)) continue;
    bd = d;
    best = t;
  }
  return best;
}

/**
 * Her fight with `t` (AITHINK_HirelingCombat, AiThink.cpp:9757-9840): she acts this thought on a roll
 * under min(param + 40 + 2 × level, 95), the param growing by 10 a thought she doesn't and back to 0
 * when she does; a ranged hireling then shoots (SelectHirelingAction) unless her foe is within 4
 * subtiles, when half the time she steps back to her hero first, if they are more than 4 off
 */
function combat(g: Game, m: Merc, t: Monster) {
  const use = Math.min(m.aiParam + 40 + 2 * m.level, 95);
  if (pct() >= use) {
    m.aiParam += 10;
    return idle(m, 10);
  }
  m.aiParam = 0;
  if (gap(m, t) >= TOO_CLOSE || pct() >= 50) return selectAction(g, m, t);
  if (gap(m, g.player) > TOO_CLOSE) return walkTo(m, nearOwner(g, m), true);
  selectAction(g, m, t);
}

/** her weights with and without an aura she has on: D2 passes over an AI-type-1 skill whose state she has (AiThink.cpp:9877) */
const weightCache = new Map<string, ActionWeights>();
function weightsFor(m: Merc): ActionWeights {
  const st = m.kept!;
  const key = `${st.hire}:${st.level}:${m.skills.map((s) => s.level).join(',')}:${m.auraOn ?? ''}`;
  let w = weightCache.get(key);
  if (!w) {
    w = actionWeights(st.hire, st.level, (skill) => skill === m.auraOn);
    weightCache.set(key, w);
  }
  return w;
}

/**
 * What she does at `t` (AITHINK_SelectHirelingAction, AiThink.cpp:9842-9946): a roll in 0 … the sum
 * of her weights (pickAction): her plain arrow (MonStats Skill1, RogueMissile, in A1), else a skill;
 * an aura one she switches on and stands 10 frames (9913-9917), the rest she shoots in its mode
 */
export function selectAction(g: Game, m: Merc, t: Monster) {
  const w = weightsFor(m);
  const skill = pickAction(w, randInt(0, w.total));
  if (skill && D2X_SKILLS[skill]?.aura) {
    m.auraOn = skill;
    g.fx.burst('holyburst', m.pos, { color: '#c0a0ff' });
    return idle(m, 10);
  }
  m.shot = { skill, target: t };
  m.goal = null;
  m.path = null;
  m.setState('attack', frames(SHOT_FRAMES) / Math.max(0.1, m.slowFactor()));
  faceNow(m, t.pos);
}

/** a skill's element as a packet's field */
const ELEM: Record<string, 'fire' | 'cold' | 'light' | 'poison' | 'magic'> = { fire: 'fire', cold: 'cold', frze: 'cold', ltng: 'light', light: 'light', pois: 'poison', poison: 'poison', mag: 'magic', magic: 'magic' };

/** a blast where an arrow lands: Exploding Arrow's fire, Freezing Arrow's cold and freeze */
export interface ArrowBlast {
  radius: number;
  elem: 'fire' | 'cold';
  min: number;
  max: number;
  /** seconds it freezes what it catches ('frze'), 0 for none */
  freeze: number;
}

/** one of her arrows: her rating with its skill's to-hit, and its blast if it has one */
export class MercArrow extends Projectile {
  constructor(
    kind: ProjectileKind,
    pos: P2,
    vel: P2,
    readonly shooter: Merc,
    dmg: DamagePacket,
    life: number,
    readonly ar: number,
    readonly blast: ArrowBlast | null,
    readonly skill: string | null,
  ) {
    super(kind, pos, vel, shooter, 'player', dmg, life, 0.22);
  }
  burst = false;
}

/** what an arrow of hers looks like: her plain one an arrow, a fire one a fire bolt, a cold one an ice shard */
function arrowLook(skill: MercSkill | null): ProjectileKind {
  const e = skill?.numbers.elem?.type;
  return e === 'fire' ? 'firebolt' : e === 'cold' || e === 'frze' ? 'iceshard' : 'arrow';
}

/**
 * Her arrow loosed at `t`: its missile (her plain one Missiles.txt arrow, a skill's its srvmissile) at
 * its speed for its range (monstats.ts missileFlight); its physical damage her bow's with her % and her
 * own on top (merc.ts recalc), the share Fire Arrow and Cold Arrow turn elemental (convertPct) and
 * their own elemental damage; a blast skill's damage goes in its blast instead (ArrowBlast). Her rating
 * gains the skill's to-hit, flat, as any unit's but a hero's (hireling.ts SkillNumbers.toHit)
 */
export function loose(g: Game, m: Merc, skillId: string | null, t: Monster) {
  const sk = skillId ? (m.skills.find((s) => s.skill === skillId) ?? null) : null;
  const n = sk?.numbers;
  const missile = (skillId && D2X_SKILLS[skillId]?.missiles?.srv) || 'arrow';
  const fl = missileFlight(missile, sk?.level ?? 1);
  const pk = emptyPacket();
  let phys = randInt(Math.floor(m.dmg[0]), Math.max(Math.floor(m.dmg[0]), Math.floor(m.dmg[1])));
  phys *= 1 + (m.dmgPct + m.aura.dmgPct) / 100;
  if (m.arrowAdd[1] > 0) phys += randInt(m.arrowAdd[0], m.arrowAdd[1]);
  const elem = n?.elem ? ELEM[n.elem.type] : undefined;
  if (n?.convertPct && elem) {
    const turned = (phys * n.convertPct) / 100;
    phys -= turned;
    pk[elem] += turned;
  }
  let blast: ArrowBlast | null = null;
  if (n?.blast !== undefined && n.elem && (elem === 'fire' || elem === 'cold')) {
    blast = { radius: n.blast, elem, min: n.elem.min, max: n.elem.max, freeze: n.elem.type === 'frze' || skillId === 'Freezing Arrow' ? (n.elemSeconds ?? 0) : 0 };
  } else if (n?.elem && elem) {
    pk[elem] += n.elem.min + Math.random() * (n.elem.max - n.elem.min);
    if (elem === 'cold') pk.chill = n.elemSeconds ?? 0;
  }
  pk.phys = phys;
  pk.source = m;
  pk.alvl = m.level;
  const dx = t.pos.x - m.pos.x;
  const dz = t.pos.z - m.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / l, z: dz / l };
  const from = { x: m.pos.x + dir.x * (m.radius + 0.2), z: m.pos.z + dir.z * (m.radius + 0.2) };
  const ar = m.ar + (n?.toHit ?? 0);
  const arrow = new MercArrow(arrowLook(sk), from, { x: dir.x * fl.speed, z: dir.z * fl.speed }, m, pk, fl.life, ar, blast, skillId);
  g.level.projectiles.push(arrow);
  g.sfx.play(blast?.elem === 'fire' || elem === 'fire' ? 'skill.fire_cast' : elem === 'cold' ? 'skill.cold_cast' : 'combat.arrow', { pos: m.pos, vol: 0.45 });
}

/**
 * Her arrow reaching a monster (fight.ts updateProjectiles): D2's chance to hit, her rating against its
 * defense with both levels (the missile's ToHit, SUNITDMG_IsHitSuccessful), its damage if it lands; a
 * blast arrow bursts all the same (its missile's alwaysExplode)
 */
export function arrowStrike(g: Game, pr: MercArrow, t: Monster) {
  if (chance(hitOdds(pr.ar, t.effectiveDefense(), pr.shooter.level, t.level))) applyDamage(g, t, { ...pr.dmg }, pr.pos);
  else g.fx.text(t.pos, '未命中', '#aaaaaa');
  arrowBurst(g, pr, t.pos);
}

/**
 * Its blast where it ends (a wall, a monster, the end of its flight: alwaysExplode), once: every
 * monster within it takes the blast's element, a spell's (no hit roll), and Freezing Arrow's are frozen
 */
export function arrowBurst(g: Game, pr: MercArrow, at: P2) {
  const b = pr.blast;
  if (!b || pr.burst) return;
  pr.burst = true;
  g.fx.burst(b.freeze > 0 ? 'frostnova' : 'fireblast', at, { radius: b.radius });
  g.sfx.play(b.elem === 'cold' ? 'skill.cold_impact' : 'skill.fire_impact', { pos: at, vol: 0.6 });
  for (const t of g.level.monstersTouching(at, b.radius)) {
    if (t.dead || dist(at, t.pos) > b.radius + t.radius) continue;
    const pk = emptyPacket();
    pk[b.elem] = b.min + Math.random() * (b.max - b.min);
    pk.spell = true;
    pk.source = pr.shooter;
    if (b.freeze > 0) pk.chill = 0;
    applyDamage(g, t, pk, at);
    if (b.freeze > 0 && !t.dead) freeze(t, b.freeze);
  }
}

/**
 * A freeze taking hold of a monster (SUNITDMG_ApplyFreezeState, SUnitDmg.cpp:1645-1733), as combat.ts
 * strikeEffects does the hero's: less its cold resistance; a boss, champion or unique only chilled for
 * it, the rest frozen for it over the difficulty's MonsterFreezeDivisor if cold slows them at all
 */
export function freeze(t: Monster, secs: number) {
  const res = resistance('cold', t.resists().cold, { monster: true });
  const len = secs * (1 - Math.min(100, res) / 100);
  if (len <= 0) return;
  if (t.rank === 'boss' || t.rank === 'champion' || t.rank === 'unique' || t.def.row.boss) {
    t.chillTime = Math.max(t.chillTime, len);
    t.chillAmount = Math.min(0.9, Math.max(t.chillAmount, -t.coldEffect / 100));
    return;
  }
  if (t.coldEffect >= 0) return;
  const f = len / D2X_DIFFICULTIES[t.difficulty].monsterFreezeDivisor;
  t.stunTime = Math.max(t.stunTime, f);
  t.chillTime = Math.max(t.chillTime, f);
}

// ───────────────────────── Inner Sight ─────────────────────────

/** what her Inner Sight took off each monster's defense, and until when (her aura's length past its last pulse) */
const sights = new WeakMap<Merc, Map<Monster, { amount: number; until: number }>>();
/** her aura pulses once a second, as the hero's (fight.ts updateAuras) */
const pulses = new WeakMap<Merc, number>();

/**
 * Her aura on (Inner Sight, AiThink.cpp:9913-9917): each second the foes within its radius lose its
 * defense (aurastat armorclass, skillcalc auraStats) for its length; what it took comes back as that
 * runs out, or as she falls or goes to another map (forgetSight)
 */
export function sightPulse(g: Game, m: Merc, dt: number) {
  const map = sights.get(m);
  if (map) {
    for (const [t, s] of map) {
      if (g.time < s.until && !t.dead) continue;
      t.defLoss = Math.max(0, t.defLoss - s.amount);
      map.delete(t);
    }
  }
  if (!m.auraOn || m.dead) return;
  const left = (pulses.get(m) ?? 0) - dt;
  if (left > 0) {
    pulses.set(m, left);
    return;
  }
  pulses.set(m, 1);
  const a = m.skills.find((s) => s.skill === m.auraOn)?.numbers.aura;
  if (!a) return;
  const def = -(a.stats.find((s) => s.stat === 'armorclass')?.value ?? 0);
  if (def <= 0) return;
  const into = map ?? new Map<Monster, { amount: number; until: number }>();
  sights.set(m, into);
  for (const t of g.level.monstersTouching(m.pos, a.radius)) {
    if (t.dead || t.def.row.align !== 0 || dist(t.pos, m.pos) > a.radius + t.radius) continue;
    const had = into.get(t);
    if (had) {
      had.until = g.time + a.seconds;
      continue;
    }
    t.defLoss += def;
    into.set(t, { amount: def, until: g.time + a.seconds });
  }
}

/** what her Inner Sight took given back at once: she fell, or is on another map */
export function forgetSight(m: Merc) {
  const map = sights.get(m);
  if (!map) return;
  for (const [t, s] of map) t.defLoss = Math.max(0, t.defLoss - s.amount);
  map.clear();
}

/** whether a monster is under her Inner Sight now (the tests) */
export function underSight(m: Merc, t: Monster): boolean {
  return !!sights.get(m)?.has(t);
}
