import { chance, dist, rand, randInt, type P2 } from '../core/math';
import { D2X_MISSILES } from '../data/d2x/missiles';
import { D2X_MONSTER_AI } from '../data/d2x/monsters';
import { D2X_MONUMOD_CONSTANTS } from '../data/d2x/superuniques';
import type { ProjectileKind } from '../data/monsters';
import { emptyPacket, type DamagePacket } from './actor';
import { applyDamage, monsterStrike } from './combat';
import { missileDamage, monLvl, type AttackMode } from './d2/monstats';
import type { Game } from './game';
import type { Monster } from './monster';
import { moveBy, face, faceNow, stepToward } from './movement';
import { DelayedBlast, Projectile } from './objects';

const PROJ_SPEED: Record<ProjectileKind, number> = {
  arrow: 13,
  firebolt: 9,
  iceshard: 10,
  poisonspit: 8,
  lightning: 16,
  fireball: 8,
};

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
      if (frames > 0) pk.chill = Math.max(pk.chill ?? 0, frames / 25);
      break;
    case 'pois':
      pk.poison += v;
      if (frames > 0) pk.poisonLen = frames / 25;
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

/**
 * A blow of a monster's in an attack mode (MonsterMode.cpp:216-330): its physical damage and to-hit
 * at its level, the mode's elemental damage on its chance, its modifiers' on every blow (the
 * enchantments, ghostly's cold, mana burn), and a spectral hit's random element (MonsterUnique.cpp:1351-1427)
 */
export function monsterPacket(m: Monster, mode: AttackMode = m.mode, mult = 1): DamagePacket {
  const pk = emptyPacket();
  const a = m.attack(mode);
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
  if (m.has(27) && (m.rank === 'champion' || m.rank === 'unique')) {
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

/**
 * A missile of a monster's (its D2 missile, src/game/d2/monstats.ts monsterMissile) toward `at`: its
 * own damage at its level, and the share of the shooting mode's blow it carries (SrcDamage); one
 * without ToHit always lands. A champion or unique with multiple shots looses two more beside it
 * (MONSTERUNIQUE_CreateMultishotMissiles, MonsterUnique.cpp:1592-1657).
 */
export function shoot(g: Game, m: Monster, at: P2, spread = 0, mult = 1) {
  const kind: ProjectileKind = m.def.missile ?? 'arrow';
  const speed = PROJ_SPEED[kind];
  const ms = m.missile();
  const own = ms && missileDamage(ms.missile, ms.level);
  const out = emptyPacket();
  out.source = m;
  if (ms && own) {
    if (own.src > 0) {
      const blow = monsterPacket(m, ms.mode, own.src * mult);
      Object.assign(out, blow);
    } else out.ar = m.attack(ms.mode)?.ar ?? m.ar;
    out.phys += between(own.phys[0], own.phys[1]) * mult;
    if (own.elem) addElem(out, own.elem.type, between(own.elem.min, own.elem.max) * mult, own.elem.seconds * 25);
    out.spell = !D2X_MISSILES[ms.missile].toHit;
  } else Object.assign(out, monsterPacket(m, m.mode, mult));
  const fire = (a: number) => {
    const d = dist(m.pos, at) || 1;
    let dx = (at.x - m.pos.x) / d;
    let dz = (at.z - m.pos.z) / d;
    if (a) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    const start = { x: m.pos.x + dx * (m.radius + 0.2), z: m.pos.z + dz * (m.radius + 0.2) };
    const p = new Projectile(kind, start, { x: dx * speed, z: dz * speed }, m, 'monster', { ...out }, 1.6, kind === 'fireball' ? 0.35 : 0.22);
    if (kind === 'fireball') p.splash = 1.6;
    g.level.projectiles.push(p);
  };
  fire(spread);
  if (m.has(29) && (m.rank === 'champion' || m.rank === 'unique')) {
    fire(spread + 0.18);
    fire(spread - 0.18);
  }
  g.sfx.play(kind === 'arrow' ? 'combat.arrow' : kind === 'iceshard' ? 'skill.cold_cast' : kind === 'lightning' ? 'skill.lightning_cast' : kind === 'poisonspit' ? 'skill.poison_cast' : 'skill.fire_cast', { pos: m.pos, vol: 0.5 });
}

/**
 * The melee mode of a blow: A1 or A2 by its AI's "Attack1 (% Chance), else Attack2" parameter
 * (MonAI.txt), evenly when it has none, A1 alone when it has no A2 of its own
 */
function meleeMode(m: Monster): AttackMode {
  const t = m.def.row.diff[m.difficulty];
  const shot = m.missile()?.mode;
  const modes = (['a1', 'a2'] as const).filter((k) => t[k] && k !== shot);
  if (modes.length < 2) return modes[0] ?? 'a1';
  const k = (D2X_MONSTER_AI[m.def.row.ai] ?? []).findIndex((p) => p?.startsWith('"Attack1 (% Chance), else Attack2'));
  const pct = k >= 0 ? (t.ai.params[k] ?? 50) : 50;
  return chance(pct / 100) ? 'a1' : 'a2';
}

/** start a blow, a shot or a raise, in the state its look plays it in */
function begin(m: Monster, action: Monster['action'], slow: number) {
  m.action = action;
  if (action === 'melee') m.mode = meleeMode(m);
  const state = action === 'raise' ? 'cast' : action === 'shoot' ? (m.def.shootIn ?? 'attack') : 'attack';
  m.setState(state, 1 / (m.attackSpeed * slow));
}

function wakePack(g: Game, m: Monster) {
  for (const o of g.level.monstersNear(m.pos, 7)) {
    if (!o.awake && !o.dead && dist(o.pos, m.pos) < 7) o.awake = true;
  }
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
      g.killMonster(m, 'phys');
      return;
    }
  }
  if (m.poisonTime > 0) {
    m.poisonTime -= dt;
    m.life -= m.poisonDps * dt;
    if (m.life <= 0) {
      g.killMonster(m, 'poison');
      return;
    }
  }
  // D2's regen: STAT_HPREGEN a frame (Monster.cpp:228), none for champions and uniques, none while it can't heal
  if (m.regen > 0 && m.life < m.maxLife && m.noHealTime <= 0) m.life = Math.min(m.maxLife, m.life + m.regen * dt);
  m.attackCd -= dt;
  m.specialCd -= dt;
  m.losTimer -= dt;
  const kv = m.knockVel;
  if (Math.abs(kv.x) + Math.abs(kv.z) > 0.05) {
    moveBy(g, m, kv.x * dt, kv.z * dt);
    const decay = Math.exp(-9 * dt);
    kv.x *= decay;
    kv.z *= decay;
  }
  const slow = m.slowFactor();
  const dP = dist(m.pos, p.pos);
  if (m.losTimer <= 0) {
    m.losTimer = 0.25;
    m.hasLos = dP < 16 && g.level.map.los(m.pos, p.pos);
  }

  if (m.state === 'hit') {
    m.stateTime += dt;
    if (m.stateTime >= m.stateDur) m.setState('idle');
    return;
  }
  if (m.stunTime > 0) return;

  if (m.state === 'attack' || m.state === 'cast') {
    m.stateTime += dt * slow;
    if (!m.actionFired && m.stateTime >= m.stateDur * 0.5) {
      m.actionFired = true;
      fireAction(g, m);
    }
    if (m.stateTime < m.stateDur * 0.5) face(m, p.pos, dt, 8);
    if (m.stateTime >= m.stateDur) {
      m.setState('idle');
      m.attackCd = rand(0.15, 0.6) / slow;
    }
    return;
  }
  if (m.state === 'charge') {
    m.chargeTime -= dt;
    const sp = m.speed * 3.2;
    const dx = p.pos.x - m.pos.x;
    const dz = p.pos.z - m.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    moveBy(g, m, (dx / l) * sp * dt, (dz / l) * sp * dt);
    faceNow(m, p.pos);
    if (Math.random() < 0.5) g.fx.burst('dust', m.pos);
    if (dP < m.def.range + p.radius + 0.2 || m.chargeTime <= 0) {
      m.action = 'melee';
      m.setState('attack', 0.45);
      m.actionFired = false;
    }
    return;
  }

  // a hero in town is no target (D2Game AiUtil.cpp AIUTIL_CanSelectHostileTarget: not if
  // DUNGEON_IsRoomInTown); monsters by it on the same map let them be, as if they were dead
  const gone = p.dead || g.level.inTown(p.pos);
  if (!m.awake) {
    if (gone) return;
    if ((dP < 10 && m.hasLos) || dP < 3) {
      m.awake = true;
      wakePack(g, m);
      if (m.rank === 'boss' || m === g.level.boss) {
        g.sfx.play('monster.boss_wake', { pos: m.pos });
        g.hooks.message(`${m.displayName} 被惊醒了！`, '#c8a86a');
        g.say('boss_near');
      }
    } else {
      m.setState('idle');
      return;
    }
  }
  if (gone) {
    // wander back home
    if (stepToward(g, m, m.homePos, m.walkSpeed, dt, 0.5)) m.setState('idle');
    else if (m.state !== 'move') m.setState('move');
    return;
  }

  if (m.blindTime > 0) {
    // blinded: it only finds the player within arm's reach
    m.blindTime -= dt;
    if (dP > m.def.range + p.radius + 0.6) {
      if (m.state !== 'idle') m.setState('idle');
      return;
    }
  }
  if (m.fleeTime > 0) {
    m.fleeTime -= dt;
    const away = { x: m.pos.x + (m.pos.x - p.pos.x) * 2, z: m.pos.z + (m.pos.z - p.pos.z) * 2 };
    stepToward(g, m, away, m.speed * slow, dt, 0.2, 400);
    if (m.state !== 'move') m.setState('move');
    return;
  }

  const meleeReach = m.def.range + p.radius;
  switch (m.def.ai) {
    case 'melee':
    case 'boss': {
      if (m.def.ai === 'boss' && bossSpecial(g, m, dP)) return;
      // no swinging across furniture: within reach but blocked means walk around
      if (dP <= meleeReach && m.hasLos) {
        face(m, p.pos, dt, 10);
        if (m.attackCd <= 0) begin(m, 'melee', slow);
        else if (m.state !== 'idle') m.setState('idle');
      } else {
        stepToward(g, m, p.pos, m.speed * slow, dt, m.hasLos ? meleeReach * 0.9 : 0.3);
        if (m.state !== 'move') m.setState('move');
      }
      break;
    }
    case 'ranged':
    case 'shaman': {
      if (m.def.ai === 'shaman' && shamanResurrect(g, m)) return;
      const range = m.def.range;
      // one with a blow of its own (the quill rat's bite) strikes when the hero is at arm's reach
      const blow = m.modes().some((k) => k !== m.missile()?.mode);
      if (blow && dP <= meleeReach && m.hasLos && m.attackCd <= 0) {
        face(m, p.pos, dt, 10);
        begin(m, 'melee', slow);
      } else if (dP < 3.2 && m.hasLos) {
        // back off
        const away = { x: m.pos.x + (m.pos.x - p.pos.x), z: m.pos.z + (m.pos.z - p.pos.z) };
        const before = { ...m.pos };
        stepToward(g, m, away, m.walkSpeed * slow, dt, 0.2, 200);
        if (dist(before, m.pos) < 0.01 && m.attackCd <= 0) begin(m, 'shoot', slow);
        else if (m.state !== 'move') m.setState('move');
      } else if (dP <= range && m.hasLos) {
        face(m, p.pos, dt, 10);
        if (m.attackCd <= 0) begin(m, 'shoot', slow);
        else if (m.state !== 'idle') {
          // strafe a little
          const side = { x: m.pos.x + (p.pos.z - m.pos.z) * 0.3 * m.strafeDir, z: m.pos.z - (p.pos.x - m.pos.x) * 0.3 * m.strafeDir };
          stepToward(g, m, side, m.walkSpeed * 0.5 * slow, dt, 0.2, 100);
          if (chance(dt * 0.5)) m.strafeDir *= -1;
        }
      } else {
        stepToward(g, m, p.pos, m.speed * slow, dt, range * 0.8);
        if (m.state !== 'move') m.setState('move');
      }
      break;
    }
  }
}

function fireAction(g: Game, m: Monster) {
  const p = g.player;
  if (m.action === 'raise') {
    // resurrect handled by the cast target
    const corpse = m.target as Monster | null;
    if (corpse && corpse.dead) {
      corpse.dead = false;
      corpse.life = corpse.maxLife;
      corpse.deathTime = 0;
      corpse.setState('idle');
      corpse.awake = true;
      corpse.corpseRaisable = true;
      g.fx.burst('resurrect', corpse.pos);
      g.sfx.play('monster.resurrect', { pos: corpse.pos });
    }
    m.target = null;
    return;
  }
  if (m.action === 'shoot') {
    shoot(g, m, { x: p.pos.x, z: p.pos.z });
    return;
  }
  const big = m.rank === 'boss' || m === g.level.boss;
  if (m.def.ai === 'boss' && m.def.missile && dist(m.pos, p.pos) > m.def.range + p.radius + 0.6) {
    for (let i = -2; i <= 2; i++) shoot(g, m, p.pos, i * 0.16);
    return;
  }
  // melee
  const reach = m.def.range + p.radius + 0.7;
  if (dist(m.pos, p.pos) <= reach) {
    const pk = monsterPacket(m, m.mode, big && m.chargeTime > -1 ? 1.3 : 1);
    monsterStrike(g, m, p, pk, true);
    if (big) g.fx.shake(0.15);
  }
  g.sfx.play('monster.swing', { pos: m.pos });
}

function shamanResurrect(g: Game, m: Monster): boolean {
  if (m.specialCd > 0) return false;
  for (const o of g.level.monstersNear(m.pos, 7)) {
    // its Resurrect raises the Fallen (AiThink.cpp's FallenShaman AI)
    if (!o.dead || !o.corpseRaisable || o.deathTime < 1.2 || o.def.key !== 'fallen') continue;
    if (o.killedBy === 'fire' || o.killedBy === 'cold') continue;
    if (dist(o.pos, m.pos) > 7) continue;
    m.target = o;
    o.corpseRaisable = false; // reserved
    m.action = 'raise';
    m.setState('cast', 0.8);
    faceNow(m, o.pos);
    m.specialCd = rand(5, 8);
    return true;
  }
  m.specialCd = 1;
  return false;
}

function bossSpecial(g: Game, m: Monster, dP: number): boolean {
  if (m.specialCd > 0) return false;
  const p = g.player;
  switch (m.def.model) {
    case 'butcher':
      if (dP > 3.5 && dP < 10 && m.hasLos) {
        m.setState('charge');
        m.chargeTime = 1.4;
        m.specialCd = rand(5, 7);
        g.sfx.play('monster.charge', { pos: m.pos });
        return true;
      }
      break;
    case 'lich': {
      if (dP < 4.5) {
        const pk = emptyPacket();
        pk.cold = randInt(m.dmg[0], m.dmg[1]);
        pk.chill = 3;
        pk.source = m;
        pk.spell = true;
        g.level.blasts.push(new DelayedBlast({ ...m.pos }, 4.5, 0.35, pk, 'monster', 'frost', m));
        g.fx.burst('frostnova', m.pos, { radius: 4.5 });
        m.setState('attack', 0.7);
        m.actionFired = true;
        m.specialCd = rand(4, 6);
        return true;
      }
      if (m.hasLos && dP < 11) {
        faceNow(m, p.pos);
        // a fan of five: at range most of it misses, up close it still hurts
        for (let i = -2; i <= 2; i++) shoot(g, m, p.pos, i * 0.17, 0.55);
        m.setState('attack', 0.8);
        m.actionFired = true;
        m.specialCd = rand(3, 4.5);
        return true;
      }
      break;
    }
    case 'overlord': {
      if (dP < 4) {
        // Andariel's spray stands in as this burst: her blow's damage, as poison
        const blow = monsterPacket(m, 'a1');
        const pk = emptyPacket();
        pk.poison = (blow.phys + blow.poison) * 1.1;
        pk.poisonLen = 2;
        pk.source = m;
        pk.spell = true;
        g.level.blasts.push(new DelayedBlast({ ...m.pos }, 4, 0.5, pk, 'monster', 'poison', m));
        g.fx.burst('poisoncloud', m.pos, { radius: 4 });
        g.sfx.play('skill.poison_cast', { pos: m.pos });
        m.setState('attack', 0.8);
        m.actionFired = true;
        m.specialCd = rand(5, 7);
        return true;
      }
      if (m.hasLos && dP < 12) {
        faceNow(m, p.pos);
        for (let i = -1; i <= 1; i++) shoot(g, m, p.pos, i * 0.25, 0.7);
        m.setState('attack', 0.8);
        m.actionFired = true;
        m.specialCd = rand(2.5, 4);
        return true;
      }
      break;
    }
  }
  return false;
}

/** damage from an exploding corpse etc. */
export function blastDamage(g: Game, b: DelayedBlast) {
  if (b.faction === 'monster') {
    const p = g.player;
    if (!p.dead && dist(p.pos, b.pos) <= b.radius + p.radius) applyDamage(g, p, { ...b.dmg }, b.pos);
  } else {
    for (const m of g.level.monstersTouching(b.pos, b.radius)) {
      if (!m.dead && dist(m.pos, b.pos) <= b.radius + m.radius) applyDamage(g, m, { ...b.dmg }, b.pos);
    }
  }
}
