import { dist, rand, randInt, type P2 } from '../core/math';
import { lightEnchantBolts } from './d2/monstats';
import { emptyPacket } from './actor';
import { blastDamage, corpseGone } from './ai';
import { applyDamage, monsterStrike } from './combat';
import type { Game } from './game';
import type { Level } from './level';
import type { Friendly } from './merc';
import type { Monster } from './monster';
import { Projectile } from './objects';

export const ACTIVE_RADIUS = 30;

/** the hero's side, alive, on this map (Game.friendlies); a stand-in game (a test's) has only its hero */
const friendlies = (g: Game): Friendly[] => g.friendlies?.() ?? (g.player.dead ? [] : [g.player]);

/** the friendlies other than the hero: the hireling, alive, on this map */
const others = (g: Game): Friendly[] => friendlies(g).filter((f) => f !== g.player);

/**
 * The monsters a sim step runs (Game.update), added to `out`: those near the hero, alive or dead, in
 * the grid's order; then those near each other friendly that aren't in yet, so the hireling far off
 * isn't fought by monsters standing still (docs/M2A-STEP0.md 2.2)
 */
export function monstersAround(g: Game, out: Monster[]): Monster[] {
  const L = g.level;
  L.monstersNear(g.player.pos, ACTIVE_RADIUS, out);
  const rest = others(g);
  if (!rest.length) return out;
  const seen = new Set(out);
  for (const f of rest) {
    for (const m of L.monstersNear(f.pos, ACTIVE_RADIUS)) {
      if (seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

/**
 * How fast a monster that isn't walking is pushed aside, m/s (separate): a shuffle, as it has
 * no walk to it. D2's units don't push one another at all; they go round, or stop at, what stands.
 */
const STILL_PUSH = 0.3;

export function updateAuras(g: Game, dt: number) {
  const p = g.player;
  if (p.dead) return;
  // the aura switched on, and any from items (Insight's Meditation, Infinity's Conviction…)
  const auras: { id: string; lvl: number }[] = [];
  if (p.activeAura && p.skillLevel(p.activeAura) > 0) auras.push({ id: p.activeAura, lvl: p.skillLevel(p.activeAura) });
  for (const a of p.stats.itemAuras) if (!auras.some((x) => x.id === a.id)) auras.push(a);
  g.auraPulse -= dt;
  const pulse = g.auraPulse <= 0;
  if (pulse) g.auraPulse = 1;
  for (const a of auras) updateAura(g, a.id, a.lvl, pulse);
}

function updateAura(g: Game, aura: string, lvl: number, pulse: boolean) {
  const p = g.player;
  const sp = p.skillParams(aura, lvl);
  const radius = sp.radius ?? 5;
  const inRange = g.level.monstersTouching(p.pos, radius).filter((m) => !m.dead && dist(m.pos, p.pos) <= radius + m.radius);
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
    g.fx.burst(aura === 'holy_fire' ? 'holyfire' : 'freeze', p.pos, { radius });
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
      applyDamage(g, m, pk, p.pos);
    }
  }
}

/**
 * Bodies that overlap pushed apart, by their weights; a monster that isn't walking no faster than
 * STILL_PUSH, the rest of it on the hero, the hireling or the monster walking into it, which so goes
 * round it. The hero charging shoves what stands aside.
 */
export function separate(g: Game, dt: number) {
  const p = g.player;
  const near = (f: Friendly) => g.level.monstersNear(f.pos, ACTIVE_RADIUS).filter((m) => !m.dead && dist(m.pos, f.pos) < ACTIVE_RADIUS);
  const list = near(p);
  const rest = others(g);
  for (const f of rest) {
    const seen = new Set(list);
    for (const m of near(f)) if (!seen.has(m)) list.push(m);
  }
  const actors: { pos: P2; radius: number; w: number; still: boolean }[] = [];
  const charging = !p.dead && p.state === 'charge';
  if (!p.dead) actors.push({ pos: p.pos, radius: p.radius, w: charging ? 0.05 : 0.2, still: false });
  for (const f of rest) actors.push({ pos: f.pos, radius: f.radius, w: 0.2, still: false });
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
  if (!p.dead) p.pos = g.level.map.resolveCircle(p.pos, p.radius);
  for (const f of rest) f.pos = g.level.map.resolveCircle(f.pos, f.radius);
  // pushed about, monsters still keep out of a town (Level.monsterMap)
  for (const m of list) m.pos = g.level.monsterMap.resolveCircle(m.pos, m.radius);
}

export function updateProjectiles(g: Game, dt: number) {
  const L = g.level;
  const friends = friendlies(g);
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
      projectileImpact(g, pr);
      continue;
    }
    if (pr.faction === 'monster') {
      // the first of the hero's side it reaches, the hero first (one dead by now is passed)
      for (const p of friends) {
        if (p.dead || dist(pr.pos, p.pos) >= pr.radius + p.radius) continue;
        if (pr.owner && (pr.owner as Monster).def) monsterStrike(g, pr.owner as Monster, p, { ...pr.dmg });
        else applyDamage(g, p, { ...pr.dmg }, pr.pos);
        projectileImpact(g, pr);
        break;
      }
    } else {
      for (const m of L.monstersTouching(pr.pos, pr.radius)) {
        if (m.dead || pr.hit.has(m.id)) continue;
        if (dist(pr.pos, m.pos) < pr.radius + m.radius) {
          pr.hit.add(m.id);
          applyDamage(g, m, { ...pr.dmg }, pr.pos);
          if (!pr.pierce) {
            projectileImpact(g, pr);
            break;
          }
        }
      }
    }
    if (pr.life <= 0) pr.dead = true;
  }
  L.projectiles = L.projectiles.filter((x) => !x.dead);
}

function projectileImpact(g: Game, pr: Projectile) {
  pr.dead = true;
  if (pr.splash > 0) {
    const cold = pr.splashKind === 'cold';
    g.fx.burst(cold ? 'ice_shatter' : 'fireblast', pr.pos, { radius: pr.splash });
    g.sfx.play(cold ? 'skill.cold_impact' : 'skill.fire_impact', { pos: pr.pos, vol: 0.6 });
    if (pr.faction === 'monster') {
      for (const p of friendlies(g)) if (!p.dead && dist(pr.pos, p.pos) < pr.splash + p.radius && !pr.hit.has(p.id)) applyDamage(g, p, { ...pr.dmg, spell: true }, pr.pos);
    } else if (pr.faction === 'player') {
      // the monster hit head-on already took the full packet
      for (const m of g.level.monstersTouching(pr.pos, pr.splash)) {
        if (!m.dead && !pr.hit.has(m.id) && dist(pr.pos, m.pos) < pr.splash + m.radius) applyDamage(g, m, { ...pr.dmg, spell: true }, pr.pos);
      }
    }
  }
}

export function updateHammers(g: Game, dt: number) {
  const L = g.level;
  for (const h of L.hammers) {
    h.update(dt);
    for (const m of L.monstersTouching(h.pos, 0.55)) {
      if (m.dead) continue;
      if (dist(h.pos, m.pos) > 0.55 + m.radius) continue;
      const last = h.lastHit.get(m.id);
      if (last !== undefined && h.t - last < 0.5) continue;
      h.lastHit.set(m.id, h.t);
      applyDamage(g, m, { ...h.dmg }, h.center);
    }
  }
  L.hammers = L.hammers.filter((h) => !h.dead);
}

/**
 * A lightning-enchanted monster's charged bolts (MONSTERUNIQUE_CastLightUniqueMissile, MonsterUnique.cpp:1139-1191):
 * two toward each of the four ways round it, lightunique missiles at half its level with their own
 * lightning, at their velocity (75 %, the hero's scale) for their Range, wandering as charged bolts do
 */
export function chargedBolts(g: Game, m: Monster) {
  const b = lightEnchantBolts(m.level);
  for (let i = 0; i < 8; i++) {
    const a = (Math.floor(i / 2) * Math.PI) / 2 + rand(-0.5, 0.5);
    const pk = emptyPacket();
    pk.light = randInt(b.light[0], b.light[1]);
    pk.source = m;
    pk.spell = true;
    const pr = new Projectile('chargedbolt', m.pos, { x: Math.sin(a) * b.speed, z: Math.cos(a) * b.speed }, null, 'monster', pk, b.life, 0.2);
    g.level.projectiles.push(pr);
  }
  g.sfx.play('skill.lightning_cast', { pos: m.pos, vol: 0.25 });
}

/** the blasts on `L` (DelayedBlast: a fire- or cold-enchanted leader's death) going off as their delay runs out */
export function updateBlasts(g: Game, L: Level, dt: number) {
  for (const b of L.blasts) {
    b.delay -= dt;
    if (b.delay <= 0 && !b.done) {
      b.done = true;
      if (b.fx) g.fx.burst(b.fx, b.pos, { radius: b.radius });
      blastDamage(g, b);
    }
  }
  L.blasts = L.blasts.filter((b) => !b.done);
}

/** the dead on `L` that have lain long enough gone */
export function clearCorpses(g: Game, L: Level) {
  // corpse cleanup; the corpses far off, which no step aged, catch up first, on the time spent on
  // this map: those on a map the hero is away from keep, as when every corpse was stepped (D2
  // instead keeps 1 in 3 ordinary corpses of a room it untiles, none of uniques or minions: D2Game
  // UNIT/SUnitInactive.cpp SUNITINACTIVE_CompressUnitIfNeeded)
  if (L.monsters.length > 0 && Math.random() < 0.02) {
    for (const m of L.monsters) {
      if (!m.dead) continue;
      m.deathTime += L.time - (g.aged.get(m) ?? L.time);
      g.aged.set(m, L.time);
    }
    const kept = L.monsters.filter((m) => !m.dead || m.deathTime < 40);
    // a new list is bucketed anew (Level.monstersNear): only when one went; the gone leave their packs' lists too
    if (kept.length < L.monsters.length) {
      for (const m of L.monsters) if (m.dead && m.deathTime >= 40) corpseGone(g, m);
      L.monsters = kept;
    }
  }
}
