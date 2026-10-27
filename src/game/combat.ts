import { chance, clamp, randInt, type P2 } from '../core/math';
import { isBlunt } from '../data/items';
import type { Elem } from '../data/monsters';
import { baseOf } from '../items/item';
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

/** the player's "-X% enemy resistance", overall and per element */
export function playerPierce(p: Player): DamagePacket['pierce'] {
  const b = p.stats.bag;
  return { fire: b.pierceFire ?? 0, cold: b.pierceCold ?? 0, light: b.pierceLight ?? 0, poison: b.piercePoison ?? 0 };
}

/** Diablo II's open wounds damage per second at a character level (bleeds for 8 seconds) */
function openWoundsDps(clvl: number): number {
  const perFrame = clvl < 16 ? 9 * clvl + 31 : clvl < 31 ? 18 * clvl - 104 : clvl < 46 ? 27 * clvl - 374 : clvl < 61 ? 36 * clvl - 779 : 45 * clvl - 1319;
  return (perFrame / 256) * 25;
}

/** physical + elemental damage from the player's weapon and gear */
export function playerWeaponPacket(p: Player, edBonus: number): DamagePacket {
  const d = p.stats;
  const b = d.bag;
  const w = p.equipment.weapon;
  const pk = emptyPacket();
  pk.cb = b.cb;
  pk.ow = b.ow;
  // blunt weapons do half again to the undead
  pk.vsUndead = (b.dmgUndead ?? 0) + (w && isBlunt(baseOf(w)) ? 50 : 0);
  pk.vsDemon = b.dmgDemon;
  pk.freeze = b.freeze;
  pk.slow = b.slowTarget;
  pk.blind = !!b.blind;
  pk.flee = b.flee;
  pk.noHeal = !!b.preventHeal;
  pk.defDown = b.monDefPerHit;
  pk.alvl = p.level;
  pk.pierce = playerPierce(p);
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
  pk.poisonLen = d.poisonLen;
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
  const cap = isPlayer ? 75 : 95;
  const mult = (r: number, e: 'fire' | 'cold' | 'light' | 'poison') => {
    const pierce = (pk.pierceRes ?? 0) + (pk.pierce?.[e] ?? 0);
    // resist reduction only half effective on immune monsters (D2-ish)
    const eff = r >= 100 ? r - pierce / 2 : r - pierce;
    return 1 - Math.min(cap, eff) / 100;
  };
  const m0 = target instanceof Monster ? target : null;
  // +X% damage to undead / demons is part of the physical damage bonus
  const vs = m0 ? (m0.def.undead ? (pk.vsUndead ?? 0) : 0) + (m0.def.demon ? (pk.vsDemon ?? 0) : 0) : 0;
  let phys = pk.phys * (1 + vs / 100) * (1 - res.phys / 100);
  let fire = pk.fire * mult(res.fire, 'fire');
  let cold = pk.cold * mult(res.cold, 'cold');
  let light = pk.light * mult(res.light, 'light');
  let magic = pk.magic;
  const poison = pk.poison * mult(res.poison, 'poison');
  const pl = isPlayer ? (target as Player) : null;
  if (pl) {
    // the wearer's defenses: % then flat physical reduction, flat magic reduction, then absorption,
    // which turns the damage it stops into life
    const b = pl.stats.bag;
    phys = Math.max(0, phys * (1 - pl.stats.dr / 100) - (b.drFlat ?? 0));
    magic = Math.max(0, magic - (b.mdr ?? 0));
    let healed = 0;
    const absorb = (v: number, pct: number, flat: number) => {
      const a = Math.min(v, (v * Math.min(40, pct)) / 100 + flat);
      healed += a;
      return v - a;
    };
    fire = absorb(fire, b.absFirePct ?? 0, b.absFire ?? 0);
    cold = absorb(cold, b.absColdPct ?? 0, b.absCold ?? 0);
    light = absorb(light, b.absLightPct ?? 0, b.absLight ?? 0);
    magic = absorb(magic, 0, b.absMagic ?? 0);
    if (healed > 0) pl.life = Math.min(pl.stats.maxLife, pl.life + healed);
  }
  const total = Math.max(0, phys) + Math.max(0, fire) + Math.max(0, cold) + Math.max(0, light) + Math.max(0, magic);
  target.life -= total;
  target.hitFlash = 1;
  if (pl && pl.stats.bag.dmgToMana) pl.mana = Math.min(pl.stats.maxMana, pl.mana + (total * pl.stats.bag.dmgToMana) / 100);
  if (poison > 0) {
    // "poison length reduced by X%" shortens it, and so the damage
    const base = pk.poisonLen ?? 3;
    const len = base * (pl ? Math.max(0.25, 1 - (pl.stats.bag.poisonLenRes ?? 0) / 100) : 1);
    const dps = poison / base;
    if (dps >= target.poisonDps || target.poisonTime <= 0) {
      // the hero says so as the poison takes hold, not as more of it lands
      if (pl && target.poisonTime <= 0) g.say('poisoned');
      target.poisonDps = dps;
      target.poisonTime = len;
    }
  }
  const noFreeze = pl ? !!pl.stats.bag.cantFreeze : false;
  if ((pk.cold > 0 || pk.chill) && !noFreeze) {
    const dur = ((pk.chill ?? 1.5) + Math.min(2, pk.cold * 0.02)) * (pl?.stats.bag.halfFreeze ? 0.5 : 1);
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
    strikeEffects(m, pk, res.phys);
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
    g.sfx.play(m.def.blood === 'bone' ? 'combat.hit_bone' : heavy ? 'combat.hit_heavy' : 'combat.hit', { pos: m.pos });
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
    if (total > 0) g.sfx.play('player.hurt', { pos: p.pos });
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
    if (src instanceof Monster && src.mods.includes('vampiric') && src.noHealTime <= 0) src.life = Math.min(src.maxLife, src.life + total * 0.25);
    if (src instanceof Monster && total > 0 && p.life > 0) g.onProc('procStruck', src);
    if (p.life <= 0) g.killPlayer();
  }
  return total;
}

/**
 * What a weapon strike's Diablo II properties do to a monster beyond damage: crushing blow,
 * open wounds, freezing, slowing, blinding, fear, no healing, lost defense.
 */
function strikeEffects(m: Monster, pk: DamagePacket, physRes: number) {
  const big = m.rank === 'boss' || m.rank === 'unique' || m.rank === 'champion';
  if (pk.cb && m.life > 0 && chance(pk.cb / 100)) {
    // a quarter of its current life (an eighth for bosses, champions and uniques), less physical resistance
    m.life -= m.life * (big ? 0.125 : 0.25) * (1 - physRes / 100);
  }
  if (pk.ow && chance(pk.ow / 100)) {
    m.bleedDps = Math.max(m.bleedDps, openWoundsDps(pk.alvl ?? 1) / (m.rank === 'boss' ? 4 : 1));
    m.bleedTime = 8;
  }
  if (pk.freeze && m.rank !== 'boss') {
    const t = 0.4 + 0.25 * pk.freeze;
    m.stunTime = Math.max(m.stunTime, t);
    m.chillTime = Math.max(m.chillTime, t);
  }
  if (pk.slow) {
    m.slowTime = 3;
    m.slowAmount = Math.min(0.75, pk.slow / 100);
  }
  if (pk.blind && m.rank !== 'boss') m.blindTime = 3;
  if (pk.flee && m.rank !== 'boss' && chance(pk.flee / 100)) m.fleeTime = 2.5;
  if (pk.noHeal) m.noHealTime = 10;
  if (pk.defDown) m.defLoss += pk.defDown;
}

/** Player melee strike: hit roll then damage. Returns true if hit. */
export function playerStrike(g: Game, p: Player, m: Monster, pk: DamagePacket, arBonusPct: number): boolean {
  const b = p.stats.bag;
  const arVs = (m.def.undead ? (b.arUndead ?? 0) : 0) + (m.def.demon ? (b.arDemon ?? 0) : 0);
  const ar = (p.stats.ar + arVs) * (1 + arBonusPct / 100);
  // "ignore target's defense" (not on bosses), else "-X% target defense"
  const def = b.ignoreDef && m.rank !== 'boss' ? 0 : m.effectiveDefense() * (1 - Math.min(100, b.targetDef ?? 0) / 100);
  if (!chance(hitChance(ar, def, p.level, m.level))) {
    g.fx.text(m.pos, '未命中', '#aaaaaa');
    return false;
  }
  applyDamage(g, m, pk, p.pos);
  g.onProc('procHit', m);
  return true;
}

/** Monster melee/ranged attack on the player, with hit roll and block */
export function monsterStrike(g: Game, m: Monster, p: Player, pk: DamagePacket): void {
  if (p.dead) return;
  if (!pk.spell) {
    if (!chance(hitChance(m.ar, p.stats.def, m.level, p.level))) return;
    const blk = p.stats.block;
    if (blk > 0 && p.state !== 'attack' && p.state !== 'cast' && chance(blk / 100)) {
      p.setState('block', 0.18 / (1 + (p.stats.bag.fbr ?? 0) / 100));
      g.fx.burst('block', p.pos, { dir: { x: m.pos.x - p.pos.x, z: m.pos.z - p.pos.z } });
      g.sfx.play('combat.block', { pos: p.pos });
      return;
    }
  }
  applyDamage(g, p, pk, m.pos);
}
