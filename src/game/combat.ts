import { chance, clamp, randInt, type P2 } from '../core/math';
import type { Elem } from '../data/monsters';
import { emptyPacket, type Actor, type DamagePacket } from './actor';
import type { Game } from './game';
import { Monster } from './monster';
import { Player } from './player';

export function hitChance(ar: number, def: number, alvl: number, dlvl: number): number {
  // D2's formula, with a softer level term so early level gaps aren't brutal
  const c = 2 * (ar / Math.max(1, ar + def)) * ((alvl + 5) / (alvl + dlvl + 10));
  return clamp(c, 0.05, 0.95);
}

export function rollRange(r: [number, number]): number {
  if (r[1] <= 0) return 0;
  return randInt(Math.floor(r[0]), Math.max(Math.floor(r[0]), Math.floor(r[1])));
}

/** physical + elemental damage from the player's weapon and gear */
export function playerWeaponPacket(p: Player, edBonus: number): DamagePacket {
  const d = p.stats;
  const pk = emptyPacket();
  let phys = randInt(Math.max(1, d.wMin), Math.max(1, d.wMax)) * (1 + (d.dmgPct + edBonus) / 100);
  if (d.crit > 0 && chance(d.crit / 100)) {
    phys *= 2;
    pk.crit = true;
  }
  pk.phys = phys;
  pk.fire = rollRange(d.fire);
  pk.cold = rollRange(d.cold);
  pk.light = rollRange(d.light);
  pk.magic = rollRange(d.magic);
  pk.poison = d.poison;
  pk.lifeSteal = d.lifeSteal;
  pk.manaSteal = d.manaSteal;
  pk.pierceRes = d.pierceRes;
  if (pk.cold > 0 || d.chillOnHit) pk.chill = 1.5;
  pk.source = p;
  return pk;
}

function mainElem(pk: DamagePacket): Elem {
  let best: Elem = 'phys';
  let v = pk.phys;
  for (const e of ['fire', 'cold', 'light', 'magic', 'poison'] as const) {
    if (pk[e] > v) {
      v = pk[e];
      best = e;
    }
  }
  return best;
}

/**
 * Applies a damage packet to a target. Returns damage dealt (excluding poison DoT).
 */
export function applyDamage(g: Game, target: Actor, pk: DamagePacket, from?: P2): number {
  if (target.dead) return 0;
  const res = target.resists();
  const isPlayer = target instanceof Player;
  const pierce = pk.pierceRes ?? 0;
  const cap = isPlayer ? 75 : 95;
  const mult = (r: number) => {
    // resist reduction only half effective on immune monsters (D2-ish)
    const eff = r >= 100 ? r - pierce / 2 : r - pierce;
    return 1 - Math.min(cap, eff) / 100;
  };
  let phys = pk.phys * (1 - res.phys / 100);
  if (isPlayer) phys *= 1 - (target as Player).stats.dr / 100;
  const fire = pk.fire * mult(res.fire);
  const cold = pk.cold * mult(res.cold);
  const light = pk.light * mult(res.light);
  const magic = pk.magic;
  const poison = pk.poison * mult(res.poison);
  const total = Math.max(0, phys) + Math.max(0, fire) + Math.max(0, cold) + Math.max(0, light) + Math.max(0, magic);
  target.life -= total;
  target.hitFlash = 1;
  if (poison > 0) {
    const dps = poison / 3;
    if (dps >= target.poisonDps || target.poisonTime <= 0) {
      target.poisonDps = dps;
      target.poisonTime = 3;
    }
  }
  if (pk.cold > 0 || pk.chill) {
    const dur = (pk.chill ?? 1.5) + Math.min(2, pk.cold * 0.02);
    target.chillTime = Math.max(target.chillTime, isPlayer ? dur * 0.5 : dur);
    target.chillAmount = isPlayer ? 0.35 : 0.5;
  }
  const dir = from ? { x: target.pos.x - from.x, z: target.pos.z - from.z } : { x: 0, z: 0 };
  const dl = Math.hypot(dir.x, dir.z) || 1;
  dir.x /= dl;
  dir.z /= dl;

  if (target instanceof Monster) {
    const m = target;
    m.awake = true;
    if (pk.knockback && m.rank !== 'boss') {
      const kb = pk.knockback * (m.rank === 'unique' ? 0.5 : 1);
      m.knockVel.x += dir.x * kb;
      m.knockVel.z += dir.z * kb;
    }
    const heavy = pk.heavy || pk.crit || total > m.maxLife * 0.12;
    if (heavy && m.life > 0 && m.rank !== 'boss' && m.state !== 'dead') {
      m.setState('hit', m.rank === 'normal' || m.rank === 'minion' ? 0.28 : 0.15);
    }
    // leech
    const src = pk.source;
    if (src instanceof Player && !src.dead) {
      const physDone = Math.max(0, phys);
      if (pk.lifeSteal) src.life = Math.min(src.stats.maxLife, src.life + (physDone * pk.lifeSteal) / 100);
      if (pk.manaSteal) src.mana = Math.min(src.stats.maxMana, src.mana + (physDone * pk.manaSteal) / 100);
    }
    g.fx.hit(m, m.def.blood, dir, !!heavy, mainElem(pk));
    if (pk.crit) g.fx.text(m.pos, '致命一击', '#ffdd55');
    g.sfx.play(m.def.blood === 'bone' ? 'hitbone' : heavy ? 'hitheavy' : 'hit', 0.8);
    if (heavy) {
      g.hitstop = Math.max(g.hitstop, pk.crit ? 0.07 : 0.045);
      g.fx.shake(pk.crit ? 0.25 : 0.12);
    }
    // lightning enchanted: charged bolts when struck
    if (m.mods.includes('lightench') && m.life > 0 && m.specialCd <= 0) {
      m.specialCd = 0.5;
      g.chargedBolts(m, 4 + Math.floor(Math.random() * 3));
    }
    if (m.life <= 0) g.killMonster(m, mainElem(pk));
  } else if (isPlayer) {
    const p = target as Player;
    p.lastDamageTime = g.time;
    g.fx.hit(p, 'red', dir, total > p.stats.maxLife * 0.1, mainElem(pk));
    if (total > 0) g.sfx.play('hurt', 0.7);
    // hit recovery, with a short poise window afterwards so packs can't stun-lock
    if (total > p.stats.maxLife / 12 && p.state !== 'charge' && p.state !== 'hit' && p.life > 0 && g.time > p.poiseUntil) {
      p.setState('hit', p.stats.hitRecovery);
      p.zealHitsLeft = 0;
      p.poiseUntil = g.time + p.stats.hitRecovery + 0.9;
    }
    if (total > p.stats.maxLife * 0.15) g.fx.shake(0.3);
    // thorns
    const src = pk.source;
    if (src instanceof Monster && p.stats.thorns > 0 && !pk.spell) {
      src.life -= p.stats.thorns;
      src.hitFlash = 0.6;
      if (src.life <= 0) g.killMonster(src, 'phys');
    }
    if (src instanceof Monster && src.mods.includes('manaburn')) p.mana = Math.max(0, p.mana - total * 0.6);
    if (src instanceof Monster && src.mods.includes('vampiric')) src.life = Math.min(src.maxLife, src.life + total * 0.5);
    if (p.life <= 0) g.killPlayer();
  }
  return total;
}

/** Player melee strike: hit roll then damage. Returns true if hit. */
export function playerStrike(g: Game, p: Player, m: Monster, pk: DamagePacket, arBonusPct: number): boolean {
  const ar = p.stats.ar * (1 + arBonusPct / 100);
  if (!chance(hitChance(ar, m.effectiveDefense(), p.level, m.level))) {
    g.fx.text(m.pos, '未命中', '#aaaaaa');
    return false;
  }
  applyDamage(g, m, pk, p.pos);
  return true;
}

/** Monster melee/ranged attack on the player, with hit roll and block */
export function monsterStrike(g: Game, m: Monster, p: Player, pk: DamagePacket): void {
  if (p.dead) return;
  if (!pk.spell) {
    if (!chance(hitChance(m.ar, p.stats.def, m.level, p.level))) return;
    const blk = p.stats.block;
    if (blk > 0 && p.state !== 'attack' && p.state !== 'cast' && chance(blk / 100)) {
      p.setState('block', 0.18);
      g.fx.burst('block', p.pos, { dir: { x: m.pos.x - p.pos.x, z: m.pos.z - p.pos.z } });
      g.sfx.play('block');
      return;
    }
  }
  applyDamage(g, p, pk, m.pos);
}
