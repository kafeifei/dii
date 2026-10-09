import { chance, dist, rand, randInt, type P2 } from '../core/math';
import type { ProjectileKind } from '../data/monsters';
import { emptyPacket, type DamagePacket } from './actor';
import { applyDamage, monsterStrike } from './combat';
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

export function monsterPacket(m: Monster, mult = 1): DamagePacket {
  const pk = emptyPacket();
  const base = randInt(m.dmg[0], m.dmg[1]) * mult;
  const elem = m.def.meleeElem ?? 'phys';
  if (elem === 'phys') pk.phys = base;
  else if (elem === 'poison') {
    pk.phys = base * 0.5;
    pk.poison = base * 2;
  } else {
    pk.phys = base * 0.4;
    pk[elem] = base * 0.8;
  }
  if (m.mods.includes('fireench')) pk.fire += base * 0.6;
  if (m.mods.includes('coldench')) {
    pk.cold += base * 0.5;
    pk.chill = 2;
  }
  if (m.mods.includes('lightench')) pk.light += randInt(1, Math.ceil(base * 1.2));
  pk.source = m;
  return pk;
}

export function shoot(g: Game, m: Monster, kind: ProjectileKind, at: P2, spread = 0) {
  const speed = PROJ_SPEED[kind];
  const d = dist(m.pos, at) || 1;
  let dx = (at.x - m.pos.x) / d;
  let dz = (at.z - m.pos.z) / d;
  if (spread) {
    const c = Math.cos(spread);
    const s = Math.sin(spread);
    [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
  }
  const pk = monsterPacket(m);
  const elem = m.def.projectileElem ?? 'phys';
  const total = pk.phys + pk.fire + pk.cold + pk.light;
  const out = emptyPacket();
  out.source = m;
  if (elem === 'phys') out.phys = total;
  else if (elem === 'poison') out.poison = total * 2.5;
  else if (elem === 'magic') out.magic = total;
  else {
    out[elem] = total * 0.9;
    out.phys = total * 0.1;
  }
  if (elem === 'cold') out.chill = 2;
  const start = { x: m.pos.x + dx * (m.radius + 0.2), z: m.pos.z + dz * (m.radius + 0.2) };
  const p = new Projectile(kind, start, { x: dx * speed, z: dz * speed }, m, 'monster', out, 1.6, kind === 'fireball' ? 0.35 : 0.22);
  if (kind === 'fireball') p.splash = 1.6;
  g.level.projectiles.push(p);
  g.sfx.play(kind === 'arrow' ? 'arrow' : kind === 'iceshard' ? 'cold' : 'fire', 0.5);
}

function wakePack(g: Game, m: Monster) {
  for (const o of g.level.monsters) {
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
  if (m.poisonTime > 0) {
    m.poisonTime -= dt;
    m.life -= m.poisonDps * dt;
    if (m.life <= 0) {
      g.killMonster(m, 'poison');
      return;
    }
  }
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
      m.setState('attack', 0.45);
      m.actionFired = false;
    }
    return;
  }

  if (!m.awake) {
    if (p.dead) return;
    if ((dP < 10 && m.hasLos) || dP < 3) {
      m.awake = true;
      wakePack(g, m);
      if (m.rank === 'boss') {
        g.sfx.play('boss');
        g.hooks.message(`${m.displayName} 被惊醒了！`, '#c8a86a');
      }
    } else {
      m.setState('idle');
      return;
    }
  }
  if (p.dead) {
    // wander back home
    if (stepToward(g, m, m.homePos, m.speed * 0.5, dt, 0.5)) m.setState('idle');
    else if (m.state !== 'move') m.setState('move');
    return;
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
        if (m.attackCd <= 0) m.setState('attack', 1 / (m.attackSpeed * slow));
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
      if (dP < 3.2 && m.hasLos) {
        // back off
        const away = { x: m.pos.x + (m.pos.x - p.pos.x), z: m.pos.z + (m.pos.z - p.pos.z) };
        const before = { ...m.pos };
        stepToward(g, m, away, m.speed * 0.8 * slow, dt, 0.2, 200);
        if (dist(before, m.pos) < 0.01 && m.attackCd <= 0) m.setState('attack', 1 / (m.attackSpeed * slow));
        else if (m.state !== 'move') m.setState('move');
      } else if (dP <= range && m.hasLos) {
        face(m, p.pos, dt, 10);
        if (m.attackCd <= 0) m.setState('attack', 1 / (m.attackSpeed * slow));
        else if (m.state !== 'idle') {
          // strafe a little
          const side = { x: m.pos.x + (p.pos.z - m.pos.z) * 0.3 * m.strafeDir, z: m.pos.z - (p.pos.x - m.pos.x) * 0.3 * m.strafeDir };
          stepToward(g, m, side, m.speed * 0.4 * slow, dt, 0.2, 100);
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
  if (m.state === 'cast') {
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
      g.sfx.play('holy', 0.5);
    }
    m.target = null;
    return;
  }
  if (m.def.ai === 'ranged' || (m.def.ai === 'shaman' && m.def.projectile)) {
    // lead the target a little
    const lead = { x: p.pos.x, z: p.pos.z };
    shoot(g, m, m.def.projectile!, lead);
    if (m.rank === 'unique') {
      shoot(g, m, m.def.projectile!, lead, 0.18);
      shoot(g, m, m.def.projectile!, lead, -0.18);
    }
    return;
  }
  if (m.def.ai === 'boss' && m.def.projectile && dist(m.pos, p.pos) > m.def.range + p.radius + 0.6) {
    for (let i = -2; i <= 2; i++) shoot(g, m, m.def.projectile, p.pos, i * 0.16);
    return;
  }
  // melee
  const reach = m.def.range + p.radius + 0.7;
  if (dist(m.pos, p.pos) <= reach) {
    const pk = monsterPacket(m, m.rank === 'boss' && m.chargeTime > -1 ? 1.3 : 1);
    monsterStrike(g, m, p, pk);
    if (m.rank === 'boss') g.fx.shake(0.15);
  }
  g.sfx.play('swing', 0.5);
}

function shamanResurrect(g: Game, m: Monster): boolean {
  if (m.specialCd > 0) return false;
  for (const o of g.level.monsters) {
    if (!o.dead || !o.corpseRaisable || o.deathTime < 1.2 || o.def.model !== 'imp') continue;
    if (o.killedBy === 'fire' || o.killedBy === 'cold') continue;
    if (dist(o.pos, m.pos) > 7) continue;
    m.target = o;
    o.corpseRaisable = false; // reserved
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
        g.sfx.play('charge');
        return true;
      }
      break;
    case 'lich': {
      if (dP < 4.5) {
        const pk = emptyPacket();
        pk.cold = randInt(m.dmg[0], m.dmg[1]) * 1.2;
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
        for (let i = -3; i <= 3; i++) shoot(g, m, 'iceshard', p.pos, i * 0.14);
        m.setState('attack', 0.8);
        m.actionFired = true;
        m.specialCd = rand(2.5, 4);
        return true;
      }
      break;
    }
    case 'overlord': {
      if (dP < 4) {
        const pk = emptyPacket();
        pk.fire = randInt(m.dmg[0], m.dmg[1]) * 1.4;
        pk.source = m;
        pk.spell = true;
        g.level.blasts.push(new DelayedBlast({ ...m.pos }, 4, 0.5, pk, 'monster', 'fire', m));
        g.fx.burst('fireblast', m.pos, { radius: 4 });
        g.sfx.play('fire');
        m.setState('attack', 0.8);
        m.actionFired = true;
        m.specialCd = rand(5, 7);
        return true;
      }
      if (m.hasLos && dP < 12) {
        faceNow(m, p.pos);
        for (let i = -1; i <= 1; i++) shoot(g, m, 'fireball', p.pos, i * 0.25);
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
    for (const m of g.level.monsters) {
      if (!m.dead && dist(m.pos, b.pos) <= b.radius + m.radius) applyDamage(g, m, { ...b.dmg }, b.pos);
    }
  }
}
