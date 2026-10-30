import { chance, randInt, type P2 } from '../core/math';
import { FRAMES_PER_SEC } from '../core/units';
import { D2X_ARMOR } from '../data/d2x/armor';
import { D2X_DIFFICULTIES } from '../data/d2x/difficulty';
import { isBlunt } from '../data/items';
import type { Elem } from '../data/monsters';
import { struckArmor, wearDown } from '../items/d2/durability';
import { baseOf, displayName, type Item } from '../items/item';
import { MATH_RAND } from '../items/make';
import { emptyPacket, type Actor, type DamagePacket, type Killer } from './actor';
import { blockAnimGap, hitRecoveryOdds } from './d2/frames';
import { amplifyCurse } from './d2/monai';
import { RES_FLOOR, absorb, attackRating, charStats, difficulty, hitChance, mitigate, resistance } from './d2/stats';
import type { Game } from './game';
import { Merc, mercDied, mercStruck, type Friendly } from './merc';
import { Monster } from './monster';
import { Player } from './player';
import { endBlessing } from './blessing';

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
  return (perFrame / 256) * FRAMES_PER_SEC;
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

/**
 * Who a blow's damage kills with (Game.killMonster): the hireling for her own, else the hero, whose
 * every other source is (their skills, items and auras; one with none counts as theirs too)
 */
export function killerOf(source: Actor | null | undefined): Killer {
  return source instanceof Merc ? source : 'hero';
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
  const mc = target instanceof Merc ? target : null;
  // Diablo II's resistances (game/d2/stats.ts): the hero's already carry the difficulty's penalty
  // and caps (Player.recalc); the hireling's take them as the hero's do, the hero's difficulty's
  // penalty and 75 at most (docs/M2A-STEP0.md 2.2); a monster's lose the attacker's pierce, unless 100 or more
  // a unique's Conviction round the hero takes its share off their resistances, at least −100 (RES_FLOOR)
  const convict = pl && pl.convictTime > 0 ? pl.convictRes : 0;
  const resOf = (e: 'fire' | 'cold' | 'light' | 'poison') =>
    pl ? Math.max(RES_FLOOR, res[e] - (e === 'poison' ? 0 : convict)) : mc ? resistance(e, res[e], { diff: difficulty(g.player.rules) }) : resistance(e, res[e], { monster: true, pierce: (pk.pierceRes ?? 0) + (pk.pierce?.[e] ?? 0) });
  const m0 = target instanceof Monster ? target : null;
  // +X% damage to undead / demons is part of the physical damage bonus
  const vs = m0 ? (m0.def.undead ? (pk.vsUndead ?? 0) : 0) + (m0.def.demon ? (pk.vsDemon ?? 0) : 0) : 0;
  const b = pl?.stats.bag;
  // the hero's flat reductions come off first, "damage reduced by X" physical and "magic damage
  // reduced by X" the elements and magic, then the % (SUnitDmg.cpp:764-772, 1016-1025)
  const mdr = b?.mdr ?? 0;
  // Amplify Damage on the hero: its −100 % damage resistance with theirs (STAT_DAMAGERESIST)
  const dr = pl ? Math.max(RES_FLOOR, pl.stats.dr - (pl.ampTime > 0 ? pl.ampRes : 0)) : res.phys;
  let phys = mitigate(pk.phys * (1 + vs / 100), dr, b?.drFlat ?? 0);
  let fire = mitigate(pk.fire, resOf('fire'), mdr);
  let cold = mitigate(pk.cold, resOf('cold'), mdr);
  let light = mitigate(pk.light, resOf('light'), mdr);
  // a monster's magic resistance (MonStats ResMa) counts; the hero has none
  let magic = mitigate(pk.magic, pl ? 0 : (res.magic ?? 0), mdr);
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
  // the leech goes by the physical damage up to the life it had (SUnitDmg.cpp:1150-1151)
  const physTaken = Math.min(Math.max(0, phys), Math.max(0, target.life));
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
      target.poisonBy = killerOf(pk.source);
    }
  }
  const noFreeze = pl ? !!pl.stats.bag.cantFreeze : false;
  if ((pk.cold > 0 || pk.chill) && !noFreeze) {
    // the blow's cold length: a monster's its D2 frames (MonStats El, its enchantments), on the hero
    // or the hireling; the hero's skills and gear (not D2's yet) their own, with the old bonus for the cold done
    const base = pl || mc ? (pk.chill ?? 0) : (pk.chill ?? 1.5) + Math.min(2, pk.cold * 0.02);
    chill(target, base, resOf('cold'), !!pl?.stats.bag.halfFreeze);
  }
  const dir = from ? { x: target.pos.x - from.x, z: target.pos.z - from.z } : { x: 0, z: 0 };
  const dl = Math.hypot(dir.x, dir.z) || 1;
  dir.x /= dl;
  dir.z /= dl;

  if (target instanceof Monster) {
    const m = target;
    // struck before it noticed the hero, it notices them as seeing them would have it, its pack with it (ai.ts notice)
    if (!m.awake && m.life > 0) g.wake(m);
    strikeEffects(m, pk, res.phys, resOf('cold'));
    // none knocks back or staggers one that has no knockback or get-hit mode (MonsterLook.still: the nest)
    if (pk.knockback && m.rank !== 'boss' && !m.def.still) {
      const kb = pk.knockback * (m.rank === 'unique' ? 0.5 : 1);
      m.knockVel.x += dir.x * kb;
      m.knockVel.z += dir.z * kb;
    }
    const heavy = pk.heavy || pk.crit || total > m.maxLife * 0.12;
    if (heavy && m.life > 0 && m.rank !== 'boss' && m.state !== 'dead' && !m.def.still) {
      m.setState('hit', m.rank === 'normal' || m.rank === 'minion' ? 0.28 : 0.15);
      // its AI state is the get-hit's 3 now, even after a hit with none (MonsterMode.cpp:1796-1812)
      m.hitHeld = false;
    } else if (total > 0 && m.life > 0 && m.state !== 'dead') {
      // a hit it takes with no get-hit, one it shrugs off or a soft one, is a hit to its AI all the
      // same: D2 sets AI state 19 (SUnitDmg.cpp:2117, 2134, 2143), a get-hit's to its next thought
      // and after its next mode (ai.ts think)
      m.wasHit = true;
      m.hitHeld = true;
    }
    // leech, as much of it as works on this monster (MonStats Drain), the hero's divided by the
    // difficulty's LifeStealDivisor and ManaStealDivisor in 64ths (SUnitDmg.cpp:1154-1228)
    const src = pk.source;
    if (src instanceof Player && !src.dead) {
      const levels = D2X_DIFFICULTIES[src.rules];
      const physDone = (physTaken * m.drain) / 100;
      const steal = (pct: number, div: number) => (physDone * Math.trunc((pct * 64) / (div || 1))) / 64 / 100;
      if (pk.lifeSteal) src.life = Math.min(src.stats.maxLife, src.life + steal(pk.lifeSteal, levels.lifeStealDivisor));
      if (pk.manaSteal) src.mana = Math.min(src.stats.maxMana, src.mana + steal(pk.manaSteal, levels.manaStealDivisor));
    }
    g.fx.hit(m, m.def.blood, dir, !!heavy, mainElem(pk));
    if (pk.crit) g.fx.text(m.pos, '致命一击', '#ffdd55');
    g.sfx.play(m.def.blood === 'bone' ? 'combat.hit_bone' : heavy ? 'combat.hit_heavy' : 'combat.hit', { pos: m.pos });
    if (heavy) {
      g.hitstop = Math.max(g.hitstop, pk.crit ? 0.07 : 0.045);
      g.fx.shake(pk.crit ? 0.25 : 0.12);
    }
    // a lightning-enchanted leader looses charged bolts when struck, not twice in 10 frames
    // (MONSTERUNIQUE_CastLightUniqueMissile, MonsterUnique.cpp:1152-1161)
    if (m.has(17) && (m.rank === 'champion' || m.rank === 'unique') && m.life > 0 && g.time - m.boltsAt >= 10 / FRAMES_PER_SEC) {
      m.boltsAt = g.time;
      g.chargedBolts(m);
    }
    if (m.life <= 0) g.killMonster(m, mainElem(pk), pk.byObject ? 'object' : killerOf(pk.source));
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
      if (src.life <= 0) g.killMonster(src, 'phys', 'hero');
    }
    // "attacker takes lightning damage": the same for melee hits, less the attacker's lightning resistance
    const lt = p.stats.bag.lightThorns ?? 0;
    if (src instanceof Monster && lt > 0 && !pk.spell && !src.dead) {
      src.life -= lt * (1 - Math.min(100, src.resists().light) / 100);
      src.hitFlash = 0.6;
      if (src.life <= 0) g.killMonster(src, 'light', 'hero');
    }
    // mana burn's (and the ghosts') mana drain
    if (pk.mana) p.mana = Math.max(0, p.mana - pk.mana);
    if (src instanceof Monster && total > 0 && p.life > 0) g.onProc('procStruck', src);
    if (p.life <= 0) g.killPlayer();
  } else if (mc) {
    // the hireling struck: what she does about it is hers (src/game/merc.ts)
    g.fx.hit(mc, 'red', dir, total > mc.maxLife * 0.1, mainElem(pk));
    if (mc.life <= 0) mercDied(g, mc);
  }
  return total;
}

/**
 * What a weapon strike's Diablo II properties do to a monster beyond damage: crushing blow,
 * open wounds, freezing, slowing, blinding, fear, no healing, lost defense.
 */
function strikeEffects(m: Monster, pk: DamagePacket, physRes: number, coldRes: number) {
  const big = m.rank === 'boss' || m.rank === 'unique' || m.rank === 'champion';
  if (pk.cb && m.life > 0 && chance(pk.cb / 100)) {
    // a quarter of its current life (an eighth for bosses, champions and uniques), less physical resistance
    m.life -= m.life * (big ? 0.125 : 0.25) * (1 - physRes / 100);
  }
  if (pk.ow && chance(pk.ow / 100)) {
    m.bleedDps = Math.max(m.bleedDps, openWoundsDps(pk.alvl ?? 1) / (m.rank === 'boss' ? 4 : 1));
    m.bleedTime = 8;
    m.bleedBy = killerOf(pk.source);
  }
  if (pk.freeze) {
    // the hero's freeze length (not D2's yet), less the monster's cold resistance as a cold length
    // is; a boss, champion or unique is only chilled for it, the rest frozen for it over the
    // difficulty's MonsterFreezeDivisor if cold slows them at all (SUNITDMG_ApplyFreezeState, SUnitDmg.cpp:1645-1733;
    // champions are MONTYPEFLAG_UNIQUE too, MonsterUnique.cpp:2464, 3000)
    const t = (0.4 + 0.25 * pk.freeze) * (1 - Math.min(100, coldRes) / 100);
    if (m.rank === 'boss' || m.rank === 'champion' || m.rank === 'unique' || m.def.row.boss) chill(m, t, 0, false);
    else if (m.coldEffect < 0 && t > 0) {
      const f = t / D2X_DIFFICULTIES[m.difficulty].monsterFreezeDivisor;
      m.stunTime = Math.max(m.stunTime, f);
      m.chillTime = Math.max(m.chillTime, f);
    }
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

/**
 * A cold length (seconds) taking hold (SUNITDMG_ApplyColdState, SUnitDmg.cpp:1552-1624): less the
 * defender's cold resistance as it applies (`res`; 769-770, 1020-1024), halved by "half freeze
 * duration" (874-878); a monster's over the difficulty's MonsterColdDivisor, and none on one cold
 * doesn't slow (1562-1574). The slow is the monster's MonStats ColdEffect, the hero's −50 % (85-99)
 */
function chill(target: Actor, len: number, res: number, half: boolean) {
  const m = target instanceof Monster ? target : null;
  const effect = m ? m.coldEffect : -50;
  if (effect >= 0) return;
  let t = (len * (100 - Math.min(100, res))) / 100;
  if (half) t /= 2;
  if (m) t /= D2X_DIFFICULTIES[m.difficulty].monsterColdDivisor;
  if (t <= 0) return;
  target.chillTime = Math.max(target.chillTime, t);
  target.chillAmount = Math.min(0.9, -effect / 100);
}

/** the item codes of type shield (Armor.txt shie): what a monster's SH piece must be to block with */
const SHIELDS = new Set(D2X_ARMOR.filter((a) => a.type === 'shie').map((a) => a.code));

/**
 * A monster's chance to block, % (UNITS_GetBlockRate, Units.cpp:2481-2543): its ToBlock (MonStats,
 * its difficulty's; STAT_TOBLOCK, Monster.cpp:212), at most 75, when its shield hand holds a shield
 * (MonStats2 SH, Monster.shield: an item of type shield, Units.cpp:2509-2531; a Fallen's torch
 * isn't), or always for one that blocks without (MonStats NoShldBlock, D2R's ShieldBlockOverride 1:
 * Andariel, Units.cpp:2486, 2538-2543); else none
 */
export function monsterBlock(m: Monster): number {
  const row = m.def.row;
  if (row.shieldBlock !== 1 && !(m.shield && SHIELDS.has(m.shield))) return 0;
  return Math.min(75, row.diff[m.difficulty].block ?? 0);
}

/**
 * A monster blocks a blow that would have landed (SUNITDMG_ApplyBlockOrDodge, SUnitDmg.cpp:2707-2734,
 * after the hit roll, SUnitDmg.cpp:2612-2649): no damage, nothing set off by a hit, no wear (2312-2339).
 * It plays its block (MONMODE_BLOCK) if its look has a shield to block with (MonStats2 mBL: every one
 * that holds one), cutting into what it was doing as a get-hit does; one blocking without (Andariel)
 * has no block mode and only knows it was struck (AI state 19; SUnitDmg.cpp:2096-2118)
 */
function monsterBlocked(g: Game, m: Monster, from: P2) {
  if (m.def.shields?.length && m.state !== 'dead') {
    m.act = null;
    m.move = null;
    // AnimData's BL frames aren't in d2data: as long as its get-hit (applyDamage)
    m.setState('block', 0.28);
  } else {
    m.wasHit = true;
    m.hitHeld = true;
  }
  g.fx.burst('block', m.pos, { dir: { x: from.x - m.pos.x, z: from.z - m.pos.z } });
  g.sfx.play('combat.block', { pos: m.pos });
}

/**
 * Player melee strike: the hit roll, the monster's block, then damage (SUNITDMG_GetResultFlags,
 * SUnitDmg.cpp:2578-2657). Whether it landed.
 */
export function playerStrike(g: Game, p: Player, m: Monster, pk: DamagePacket, arBonusPct: number): boolean {
  const d = p.stats;
  const b = d.bag;
  // the attack rating against this one: "+X to attack rating against undead / demons" is flat
  // rating, the skill's % goes with the items' on all of it (SUnitDmg.cpp:2507-2541)
  const arVs = (m.def.undead ? (b.arUndead ?? 0) : 0) + (m.def.demon ? (b.arDemon ?? 0) : 0);
  const ar = attackRating(charStats(p.cls), d.dex, (b.ar ?? 0) + arVs, (b.arPct ?? 0) + arBonusPct);
  // "ignore target's defense", not on champions, uniques or bosses; else "-X% target defense", half
  // of it on bosses and superuniques (SUnitDmg.cpp:2477-2494)
  const plain = m.rank === 'normal' || m.rank === 'minion';
  const frac = Math.min(100, Math.max(0, Math.trunc((b.targetDef ?? 0) / (m.rank === 'boss' || m.superUnique ? 2 : 1))));
  const def = b.ignoreDef && plain ? 0 : m.effectiveDefense() - Math.trunc((m.effectiveDefense() * frac) / 100);
  if (!chance(hitOdds(ar, def, p.level, m.level))) {
    g.fx.text(m.pos, '未命中', '#aaaaaa');
    return false;
  }
  // a block is rolled only when it has a chance at one (SUnitDmg.cpp:2714-2718)
  const blk = monsterBlock(m);
  if (blk > 0 && chance(blk / 100)) {
    monsterBlocked(g, m, p.pos);
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
 * Monster melee/ranged attack on one of the hero's side: the hireling's is hers (merc.ts mercStruck);
 * the hero's with Diablo II's hit roll (SUNITDMG_IsHitSuccessful, SUnitDmg.cpp:2446-2563: the attack
 * mode's rating, pk.ar, against the hero's defense, with both levels; a unique's Conviction round
 * them takes its share of that defense off) and block; a landed melee blow wears the hero's armor.
 * Whether it landed.
 */
export function monsterStrike(g: Game, m: Monster, t: Friendly, pk: DamagePacket, melee = false): boolean {
  if (t instanceof Merc) return mercStruck(g, m, t, pk, melee);
  const p = t;
  if (p.dead) return false;
  if (!pk.spell) {
    const d = p.stats;
    const def = p.convictTime > 0 ? d.def - Math.trunc((d.def * p.convictDef) / 100) : d.def;
    // a running hero is hit by every melee blow, and blocks a third as often (SUnitDmg.cpp:2589-2595, 2719-2722)
    const running = p.runningNow();
    if (!(melee && running) && !chance(hitOdds(pk.ar ?? m.ar, def, m.level, p.level))) return false;
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
      return false;
    }
  }
  applyDamage(g, p, pk, m.pos);
  // the defender's half of SUNITDMG_DrainItemDurability (SUnitDmg.cpp:2341-2372)
  if (melee && !p.dead) {
    const hit = struckArmor(p.equipment, MATH_RAND);
    if (hit?.wear === 'broke') itemBroke(g, p, hit.item);
  }
  if (m.hasOwn(7)) curse(g, m, p);
  return true;
}

/**
 * A cursed unique's (MonUMod 7) hit that lands casts Amplify Damage three times in four on the
 * hero within its reach (MONSTERUNIQUE_CastAmplifyDamage, MonsterUnique.cpp:984-1050: the umod's
 * successful-hit callback, run as a hit lands, SUnitDmg.cpp:1289): at mlvl / 5 + 1, the hero's damage resistance down by its
 * par5 for its length
 */
function curse(g: Game, m: Monster, p: Player) {
  if (randInt(0, 3) < 1) return;
  const c = amplifyCurse(m.level);
  if (Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z) > c.radius + p.radius + m.radius) return;
  if (p.ampTime <= 0) {
    g.fx.text(p.pos, '伤害加深', '#c04040');
    g.fx.burst('holyburst', p.pos, { color: '#a02030' });
  }
  p.ampTime = Math.max(p.ampTime, c.seconds);
  p.ampRes = c.res;
  // a curse takes the one curse slot, a shrine's blessing's (sub_6FD10EC0, D2Game Skills.cpp:1289-1345: the
  // shrine states are curses, States.txt curse): the blessing ends
  if (p.shrine) endBlessing(p);
}
