import { chance, randInt, type P2 } from '../core/math';
import { isBlunt } from '../data/items';
import type { Elem } from '../data/monsters';
import { struckArmor, wearDown } from '../items/d2/durability';
import { baseOf, displayName, type Item } from '../items/item';
import { MATH_RAND } from '../items/make';
import { emptyPacket, type Actor, type DamagePacket } from './actor';
import { blockAnimGap, hitRecoveryOdds } from './d2/frames';
import { absorb, attackRating, charStats, hitChance, mitigate, resistance } from './d2/stats';
import type { Game } from './game';
import { Monster } from './monster';
import { Player } from './player';

/** Diablo II's chance to hit as odds (game/d2/stats.ts hitChance: 5–95 %, the levels counting) */
export function hitOdds(ar: number, def: number, alvl: number, dlvl: number): number {
  return hitChance(ar, def, alvl, dlvl) / 100;
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
  pk.vsUndead = (b.dmgUndead ?? 0) + (w && !p.unusable(w) && isBlunt(baseOf(w)) ? 50 : 0);
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
  const pl = isPlayer ? (target as Player) : null;
  // Diablo II's resistances (game/d2/stats.ts): the hero's already carry the difficulty's penalty
  // and caps (Player.recalc); a monster's lose the attacker's pierce, unless 100 or more
  const resOf = (e: 'fire' | 'cold' | 'light' | 'poison') => (pl ? res[e] : resistance(e, res[e], { monster: true, pierce: (pk.pierceRes ?? 0) + (pk.pierce?.[e] ?? 0) }));
  const m0 = target instanceof Monster ? target : null;
  // +X% damage to undead / demons is part of the physical damage bonus
  const vs = m0 ? (m0.def.undead ? (pk.vsUndead ?? 0) : 0) + (m0.def.demon ? (pk.vsDemon ?? 0) : 0) : 0;
  const b = pl?.stats.bag;
  // the hero's flat reductions come off first, "damage reduced by X" physical and "magic damage
  // reduced by X" the elements and magic, then the % (SUnitDmg.cpp:764-772, 1016-1025)
  const mdr = b?.mdr ?? 0;
  let phys = mitigate(pk.phys * (1 + vs / 100), pl ? pl.stats.dr : res.phys, b?.drFlat ?? 0);
  let fire = mitigate(pk.fire, resOf('fire'), mdr);
  let cold = mitigate(pk.cold, resOf('cold'), mdr);
  let light = mitigate(pk.light, resOf('light'), mdr);
  let magic = mitigate(pk.magic, 0, mdr);
  const poison = mitigate(pk.poison, resOf('poison'));
  if (pl && b) {
    // then absorption, the % and then the flat amount, turns what it stops into life (SUnitDmg.cpp:1036-1057)
    let healed = 0;
    const take = (v: number, pct: number, flat: number) => {
      const a = absorb(v, pct, flat);
      healed += a.life;
      return a.dmg;
    };
    fire = take(fire, b.absFirePct ?? 0, b.absFire ?? 0);
    cold = take(cold, b.absColdPct ?? 0, b.absCold ?? 0);
    light = take(light, b.absLightPct ?? 0, b.absLight ?? 0);
    magic = take(magic, 0, b.absMagic ?? 0);
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
    // hit recovery as Diablo II decides it (frames.ts hitRecoveryOdds), for its frames; it cuts
    // into an attack or a cast, never into another hit or a block (PlrModes.cpp:1586-1605)
    const busy = p.state === 'charge' || p.state === 'hit' || p.state === 'block';
    if (!busy && p.life > 0 && chance(hitRecoveryOdds(total, p.stats.maxLife))) {
      p.setState('hit', p.stats.hitRecovery);
      p.zealHitsLeft = 0;
    }
    if (total > p.stats.maxLife * 0.15) g.fx.shake(0.3);
    // thorns
    const src = pk.source;
    if (src instanceof Monster && p.stats.thorns > 0 && !pk.spell) {
      src.life -= p.stats.thorns;
      src.hitFlash = 0.6;
      if (src.life <= 0) g.killMonster(src, 'phys');
    }
    // "attacker takes lightning damage": the same for melee hits, less the attacker's lightning resistance
    const lt = p.stats.bag.lightThorns ?? 0;
    if (src instanceof Monster && lt > 0 && !pk.spell && !src.dead) {
      src.life -= lt * (1 - Math.min(100, src.resists().light) / 100);
      src.hitFlash = 0.6;
      if (src.life <= 0) g.killMonster(src, 'light');
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
  const d = p.stats;
  const b = d.bag;
  // the attack rating against this one: "+X to attack rating against undead / demons" is flat
  // rating, the skill's % goes with the items' on all of it (SUnitDmg.cpp:2507-2541)
  const arVs = (m.def.undead ? (b.arUndead ?? 0) : 0) + (m.def.demon ? (b.arDemon ?? 0) : 0);
  const ar = attackRating(charStats(p.cls), d.dex, (b.ar ?? 0) + arVs, (b.arPct ?? 0) + arBonusPct);
  // "ignore target's defense" (not on bosses), else "-X% target defense"
  const def = b.ignoreDef && m.rank !== 'boss' ? 0 : m.effectiveDefense() * (1 - Math.min(100, b.targetDef ?? 0) / 100);
  if (!chance(hitOdds(ar, def, p.level, m.level))) {
    g.fx.text(m.pos, '未命中', '#aaaaaa');
    return false;
  }
  applyDamage(g, m, pk, p.pos);
  g.onProc('procHit', m);
  // a landed melee hit wears the weapon (SUnitDmg.cpp:2331-2338)
  const w = p.equipment.weapon;
  if (w && wearDown(w, MATH_RAND) === 'broke') itemBroke(g, p, w);
  return true;
}

/** a worn item's last durability went: it gives nothing until repaired (ItemMode.cpp:5714-5733) */
function itemBroke(g: Game, p: Player, it: Item) {
  p.markDirty();
  g.hooks.message(`${displayName(it)}损坏了`, '#ff4040', 3);
  g.sfx.play('item.broken', { pos: p.pos });
  g.hooks.inventoryChanged();
}

/**
 * Monster melee/ranged attack on the player, with Diablo II's hit roll (the monster's own level,
 * rating and the hero's defense) and block; a landed melee blow wears the hero's armor
 */
export function monsterStrike(g: Game, m: Monster, p: Player, pk: DamagePacket, melee = false): void {
  if (p.dead) return;
  if (!pk.spell) {
    const d = p.stats;
    // a running hero is hit by every melee blow, and blocks a third as often (SUnitDmg.cpp:2589-2595, 2719-2722)
    const running = p.runningNow();
    if (!(melee && running) && !chance(hitOdds(m.ar, d.def, m.level, p.level))) return;
    const blk = running ? Math.trunc(d.block / 3) : d.block;
    if (blk > 0 && chance(blk / 100)) {
      // the blow is stopped; the block plays (cutting into an attack or cast) when the last one is
      // far enough back and the hero isn't already reeling or blocking (SUnitDmg.cpp:2003-2008)
      const free = p.state !== 'hit' && p.state !== 'block' && p.state !== 'charge';
      if (free && g.time - p.lastBlockTime > blockAnimGap(d.bag.fbr ?? 0)) {
        p.setState('block', d.blockTime);
        p.zealHitsLeft = 0;
        p.lastBlockTime = g.time;
      }
      g.fx.burst('block', p.pos, { dir: { x: m.pos.x - p.pos.x, z: m.pos.z - p.pos.z } });
      g.sfx.play('combat.block', { pos: p.pos });
      return;
    }
  }
  applyDamage(g, p, pk, m.pos);
  // the defender's half of SUNITDMG_DrainItemDurability (SUnitDmg.cpp:2341-2372)
  if (melee && !p.dead) {
    const hit = struckArmor(p.equipment, MATH_RAND);
    if (hit?.wear === 'broke') itemBroke(g, p, hit.item);
  }
}
