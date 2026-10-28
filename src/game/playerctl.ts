import { SWING_SOUND } from '../audio/sounds';
import { angleTo, dist, rand, randInt, type P2 } from '../core/math';
import { ITEM_BASES } from '../data/items';
import { SKILL_BY_ID } from '../data/skills';
import { emptyPacket, type DamagePacket } from './actor';
import { applyDamage, playerPierce, playerStrike, playerWeaponPacket } from './combat';
import type { Game } from './game';
import type { Monster } from './monster';
import { DelayedBlast, Hammer, Projectile, type ProjKind } from './objects';
import { face, faceNow, moveBy, stepToward } from './movement';
import type { ChargeUse, Player } from './player';
import { castAnim, toSeconds } from './d2/frames';
import { charStats, manaRegenPerSec, runDrainPerSec, staminaRegenPerSec, type StaminaMode } from './d2/stats';

/** set while an item casts a skill (chance to cast, charges): the level it casts at */
let castLvl: number | undefined;
function sp_(p: Player, id: string) {
  return p.skillParams(id, castLvl);
}

export interface PlayerAction {
  skill: string;
  target: Monster | null;
  point: P2;
  /** cast from an item's charges: at this level */
  lvl?: number;
}

export function weaponReach(p: Player): number {
  const w = p.equipment.weapon;
  const b = w ? ITEM_BASES[w.baseId] : null;
  return 0.75 + (b?.twoHanded ? 0.3 : 0) + (b && b.h >= 4 ? 0.1 : 0);
}

function reachTo(p: Player, m: Monster): number {
  return weaponReach(p) + m.radius + p.radius;
}

export function skillCost(p: Player, skill: string): number {
  const def = SKILL_BY_ID[skill];
  if (!def) return 0;
  return def.mana(p.skillLevel(skill));
}

function payMana(g: Game, p: Player, skill: string): boolean {
  const cost = skillCost(p, skill);
  if (p.mana < cost) {
    g.sfx.play('ui.no_mana');
    g.hooks.message('法力不足', '#7a7aff', 0.8);
    g.say('no_mana');
    return false;
  }
  p.mana -= cost;
  return true;
}

function nearestInFront(g: Game, p: Player, maxDist: number, preferDir = true): Monster | null {
  let best: Monster | null = null;
  let bestD = Infinity;
  const fx = Math.sin(p.facing);
  const fz = Math.cos(p.facing);
  for (const m of g.level.monstersTouching(p.pos, maxDist)) {
    if (m.dead) continue;
    const d = dist(m.pos, p.pos);
    if (d > maxDist + m.radius) continue;
    if (preferDir) {
      const dot = ((m.pos.x - p.pos.x) * fx + (m.pos.z - p.pos.z) * fz) / (d || 1);
      if (dot < 0.2) continue;
    }
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/**
 * begin a weapon attack (basic / sacred strike / zeal / charge finish): Diablo II's attack frames for
 * the class, weapon and IAS (Player.recalc), the blow landing on the animation's action frame
 */
export function startAttack(g: Game, p: Player, skill: string, target: Monster | null, point: P2, free = false): boolean {
  if (!free && skill !== 'attack' && !payMana(g, p, skill)) return false;
  const slow = p.slowFactor();
  let dur = p.stats.attackTime / slow;
  let at = p.stats.attackAction / slow;
  // the game's own zeal and charge, until the skills follow D2 (plan A5)
  if (skill === 'zeal') {
    dur /= 1.7;
    at /= 1.7;
  }
  if (skill === 'charge') {
    dur = 0.32;
    at = 0.16;
  }
  p.setState('attack', dur);
  p.actionAt = at;
  g.playerAction = { skill, target, point: { ...point } };
  faceNow(p, target ? target.pos : point);
  if (skill === 'zeal' && !free) p.zealHitsLeft = sp_(p, 'zeal').hits - 1;
  return true;
}

export function startCast(g: Game, p: Player, skill: string, point: P2, target: Monster | null, charge?: ChargeUse): boolean {
  const def = SKILL_BY_ID[skill];
  if (!def) return false;
  if ((p.cooldowns[skill] ?? 0) > 0) return false;
  // a charged skill costs a charge, not mana
  if (charge) {
    if (!p.useCharge(charge)) {
      g.hooks.message('充能已经用完了', '#aaa', 1);
      return false;
    }
  } else if (!payMana(g, p, skill)) return false;
  if (def.cooldown) p.cooldowns[skill] = def.cooldown;
  // D2's cast frames for the class and FCR; the Sorceress's Lightning and Chain Lightning play their
  // own sequence (game/d2/frames.ts castAnim), which says nothing of when the bolt leaves
  if (skill === 'chain_lightning' && p.cls === 'sorceress') {
    const seq = castAnim(p.cls, p.stats.fcr, { lightning: true });
    p.setState('cast', toSeconds(seq.frames));
    p.actionAt = toSeconds(seq.frames) * (p.stats.castAction / p.stats.castTime);
  } else {
    p.setState('cast', p.stats.castTime);
    p.actionAt = p.stats.castAction;
  }
  g.playerAction = { skill, target, point: { ...point }, lvl: charge?.lvl };
  faceNow(p, point);
  return true;
}

export function startCharge(g: Game, p: Player, target: Monster): boolean {
  if (!payMana(g, p, 'charge')) return false;
  p.setState('charge', 1.6);
  p.chargeTarget = target;
  g.playerAction = { skill: 'charge', target, point: { ...target.pos } };
  g.sfx.play('skill.charge', { pos: p.pos });
  return true;
}

export function toggleAura(g: Game, p: Player, skill: string) {
  if (p.activeAura === skill) {
    p.activeAura = null;
    g.hooks.message(`${SKILL_BY_ID[skill].name}：关闭`, '#aaa', 1);
  } else {
    p.activeAura = skill;
    g.fx.burst('aura_switch', p.pos, { color: SKILL_BY_ID[skill].color });
    g.sfx.play('skill.aura', { pos: p.pos });
  }
  p.markDirty();
}

function fireAttack(g: Game, p: Player) {
  const act = g.playerAction;
  if (!act) return;
  const reachExtra = 0.55;
  let target = act.target && !act.target.dead && dist(act.target.pos, p.pos) <= reachTo(p, act.target) + reachExtra ? act.target : null;
  if (!target) target = nearestInFront(g, p, weaponReach(p) + p.radius + 0.3);
  // by the weapon: a blade's thin whoosh (a two-handed one's long), a mace's or a staff's thick one; bare fists are blunt
  const w = p.equipment.weapon ? ITEM_BASES[p.equipment.weapon.baseId] : null;
  const swing = !w ? 'combat.swing_blunt' : (SWING_SOUND[w.type] ?? (w.twoHanded ? 'combat.swing_heavy' : 'combat.swing'));
  g.sfx.play(swing, { pos: p.pos });
  g.fx.burst('swing', p.pos, { dir: { x: Math.sin(p.facing), z: Math.cos(p.facing) } });
  if (!target) return;
  let ed = 0;
  let ar = 0;
  let knock = 0;
  let heavy = false;
  switch (act.skill) {
    case 'sacred_strike': {
      const sp = sp_(p, 'sacred_strike');
      ed = sp.ed;
      ar = sp.ar;
      knock = 6;
      heavy = true;
      g.fx.burst('smite', target.pos);
      break;
    }
    case 'zeal': {
      const sp = sp_(p, 'zeal');
      ed = sp.ed;
      ar = sp.ar;
      knock = 1.2;
      break;
    }
    case 'charge': {
      const sp = sp_(p, 'charge');
      ed = sp.ed;
      ar = sp.ar;
      knock = 11;
      heavy = true;
      break;
    }
    default:
      knock = 1.5;
  }
  const pk = playerWeaponPacket(p, ed);
  pk.knockback = Math.max(knock, p.stats.bag.knock ? 6 : 0);
  pk.heavy = heavy;
  g.onProc('procAttack', target);
  playerStrike(g, p, target, pk, ar);
}

function hammerPacket(p: Player) {
  const hp = sp_(p, 'blessed_hammer');
  let mult = 1;
  if (p.activeAura === 'concentration') mult += sp_(p, 'concentration').hammer / 100;
  const pk = emptyPacket();
  pk.magic = randInt(hp.min, hp.max) * mult;
  pk.spell = true;
  pk.source = p;
  pk.knockback = 1;
  return pk;
}

// ───────────────────────── sorceress ─────────────────────────

const EXTRA = { fire: 'extraFire', cold: 'extraCold', light: 'extraLight', magic: 'extraMagic' } as const;

/** a spell's damage, raised by "+X% fire/cold/lightning skill damage" and carrying "-X% enemy resistance" */
function spellPacket(p: Player, elem: 'fire' | 'cold' | 'light' | 'magic', min: number, max: number): DamagePacket {
  const pk = emptyPacket();
  pk[elem] = randInt(min, max) * (1 + (p.stats.bag[EXTRA[elem]] ?? 0) / 100);
  pk.source = p;
  pk.spell = true;
  pk.pierceRes = p.stats.pierceRes;
  pk.pierce = playerPierce(p);
  return pk;
}

/** a bolt fired from the caster toward the cast point */
function shootSpell(g: Game, p: Player, kind: ProjKind, speed: number, range: number, pk: DamagePacket, angle = p.facing, radius = 0.3): Projectile {
  const dir = { x: Math.sin(angle), z: Math.cos(angle) };
  const from = { x: p.pos.x + dir.x * 0.4, z: p.pos.z + dir.z * 0.4 };
  const pr = new Projectile(kind, from, { x: dir.x * speed, z: dir.z * speed }, p, 'player', pk, range / speed, radius);
  g.level.projectiles.push(pr);
  return pr;
}

function nearestMonster(g: Game, at: P2, maxDist: number, skip?: Set<number>): Monster | null {
  let best: Monster | null = null;
  let bestD = Infinity;
  for (const m of g.level.monstersTouching(at, maxDist)) {
    if (m.dead || skip?.has(m.id)) continue;
    const d = dist(m.pos, at) - m.radius;
    if (d <= maxDist && d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** cast point pulled in to `range` from the caster */
function clampedPoint(p: Player, pt: P2, range: number): P2 {
  const d = dist(p.pos, pt);
  if (d <= range) return { ...pt };
  const k = range / d;
  return { x: p.pos.x + (pt.x - p.pos.x) * k, z: p.pos.z + (pt.z - p.pos.z) * k };
}

function fireSorceressSpell(g: Game, p: Player, act: PlayerAction): boolean {
  const L = g.level;
  switch (act.skill) {
    case 'fire_bolt': {
      const sp = sp_(p, 'fire_bolt');
      shootSpell(g, p, 'firebolt', 15, 13, spellPacket(p, 'fire', sp.min, sp.max));
      g.sfx.play('skill.fire_cast', { pos: p.pos, vol: 0.5 });
      return true;
    }
    case 'fire_ball': {
      const sp = sp_(p, 'fire_ball');
      const pr = shootSpell(g, p, 'fireball', 12, 13, spellPacket(p, 'fire', sp.min, sp.max), p.facing, 0.35);
      pr.splash = sp.radius;
      g.sfx.play('skill.fire_cast', { pos: p.pos, vol: 0.6 });
      return true;
    }
    case 'fire_wall': {
      const sp = sp_(p, 'fire_wall');
      const c = clampedPoint(p, act.point, 12);
      const a = angleTo(p.pos, c);
      const side = { x: Math.cos(a), z: -Math.sin(a) };
      const n = Math.max(3, Math.round(sp.len / 0.7));
      const step = sp.len / (n - 1);
      const tick = 0.4;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * step;
        const pos = { x: c.x + side.x * off, z: c.z + side.z * off };
        if (!L.map.walkableAt(pos.x, pos.z)) continue;
        for (let t = 0; t < sp.dur; t += tick) {
          const pk = emptyPacket();
          pk.fire = Math.max(1, Math.round(sp.dps * tick * (1 + (p.stats.bag.extraFire ?? 0) / 100)));
          pk.source = p;
          pk.spell = true;
          pk.pierceRes = p.stats.pierceRes;
          pk.pierce = playerPierce(p);
          const b = new DelayedBlast(pos, 0.55, 0.05 + t, pk, 'player', 'fire', p);
          b.fx = 'flame';
          L.blasts.push(b);
        }
      }
      g.sfx.play('skill.fire_cast', { pos: p.pos, vol: 0.8 });
      return true;
    }
    case 'meteor': {
      const sp = sp_(p, 'meteor');
      const c = clampedPoint(p, act.target && !act.target.dead ? act.target.pos : act.point, 14);
      const b = new DelayedBlast(c, sp.radius, 1.0, spellPacket(p, 'fire', sp.min, sp.max), 'player', 'fire', p);
      b.dmg.heavy = true;
      b.fx = 'meteor';
      L.blasts.push(b);
      g.fx.burst('meteor_mark', c, { radius: sp.radius });
      g.sfx.play('skill.fire_cast', { pos: p.pos, vol: 0.4 });
      return true;
    }
    case 'charged_bolt': {
      const sp = sp_(p, 'charged_bolt');
      for (let i = 0; i < sp.bolts; i++) {
        const a = p.facing + (sp.bolts > 1 ? (i / (sp.bolts - 1) - 0.5) * 1.1 : 0) + rand(-0.08, 0.08);
        shootSpell(g, p, 'chargedbolt', rand(6.5, 8.5), 9, spellPacket(p, 'light', sp.min, sp.max), a, 0.28);
      }
      g.sfx.play('skill.lightning_cast', { pos: p.pos, vol: 0.4 });
      return true;
    }
    case 'static_field': {
      const sp = sp_(p, 'static_field');
      for (const m of L.monstersTouching(p.pos, sp.radius)) {
        if (m.dead || dist(m.pos, p.pos) > sp.radius + m.radius) continue;
        const pk = emptyPacket();
        // like D2, a share of current life that ignores resistances (halved on bosses)
        pk.magic = Math.max(1, Math.floor((m.life * sp.pct) / 100 / (m.rank === 'boss' ? 2 : 1)));
        pk.source = p;
        pk.spell = true;
        applyDamage(g, m, pk, p.pos);
      }
      g.fx.burst('static', p.pos, { radius: sp.radius });
      g.sfx.play('skill.lightning_cast', { pos: p.pos, vol: 0.6 });
      return true;
    }
    case 'nova': {
      const sp = sp_(p, 'nova');
      L.blasts.push(new DelayedBlast(p.pos, sp.radius, 0.08, spellPacket(p, 'light', sp.min, sp.max), 'player', 'lightning', p));
      g.fx.burst('nova', p.pos, { radius: sp.radius });
      g.sfx.play('skill.lightning_cast', { pos: p.pos, vol: 0.8 });
      return true;
    }
    case 'teleport': {
      const sp = sp_(p, 'teleport');
      const want = clampedPoint(p, act.point, sp.range);
      let dest = L.map.walkableAt(want.x, want.z) ? want : L.map.nearestWalkable(want.x, want.z, 2);
      // aimed into a wall: land at the last open spot on the way there
      for (let k = 1; !dest && k <= 40; k++) {
        const t = 1 - k / 40;
        const c = { x: p.pos.x + (want.x - p.pos.x) * t, z: p.pos.z + (want.z - p.pos.z) * t };
        if (L.map.walkableAt(c.x, c.z)) dest = c;
      }
      if (!dest) return true;
      g.fx.burst('teleport', p.pos);
      // heard where the hero leaves from: the listener is still there
      g.sfx.play('skill.teleport', { pos: p.pos });
      p.pos = { ...dest };
      p.prevPos = { ...dest };
      p.intent = null;
      g.fx.burst('teleport', dest);
      return true;
    }
    case 'chain_lightning': {
      const sp = sp_(p, 'chain_lightning');
      const reach = 14;
      let cur: Monster | null = act.target && !act.target.dead ? act.target : nearestMonster(g, act.point, 2.5);
      if (cur && dist(cur.pos, p.pos) > reach) cur = null;
      cur ??= nearestInFront(g, p, 10);
      if (!cur) {
        const end = clampedPoint(p, act.point, 10);
        g.fx.burst('chain', p.pos, { target: end });
      }
      let from = { ...p.pos };
      const hit = new Set<number>();
      for (let i = 0; i <= sp.jumps && cur; i++) {
        g.fx.burst('chain', from, { target: cur.pos });
        applyDamage(g, cur, spellPacket(p, 'light', sp.min, sp.max), from);
        hit.add(cur.id);
        from = { ...cur.pos };
        cur = nearestMonster(g, from, sp.range, hit);
      }
      g.sfx.play('skill.lightning_cast', { pos: p.pos, vol: 0.8 });
      return true;
    }
    case 'ice_bolt': {
      const sp = sp_(p, 'ice_bolt');
      const pk = spellPacket(p, 'cold', sp.min, sp.max);
      pk.chill = sp.chill;
      shootSpell(g, p, 'iceshard', 14, 13, pk);
      g.sfx.play('skill.cold_cast', { pos: p.pos, vol: 0.5 });
      return true;
    }
    case 'frozen_armor': {
      p.frozenArmor = sp_(p, 'frozen_armor').dur;
      p.markDirty();
      g.fx.burst('freeze', p.pos, { radius: 1.6 });
      g.sfx.play('skill.cold_cast', { pos: p.pos, vol: 0.7 });
      return true;
    }
    case 'frost_nova': {
      const sp = sp_(p, 'frost_nova');
      const pk = spellPacket(p, 'cold', sp.min, sp.max);
      pk.chill = sp.chill;
      L.blasts.push(new DelayedBlast(p.pos, sp.radius, 0.08, pk, 'player', 'frost', p));
      g.fx.burst('frostnova', p.pos, { radius: sp.radius });
      g.sfx.play('skill.cold_cast', { pos: p.pos, vol: 0.8 });
      return true;
    }
    case 'glacial_spike': {
      const sp = sp_(p, 'glacial_spike');
      const pk = spellPacket(p, 'cold', sp.min, sp.max);
      pk.chill = sp.chill;
      const pr = shootSpell(g, p, 'iceshard', 12, 13, pk, p.facing, 0.35);
      pr.splash = sp.radius;
      pr.splashKind = 'cold';
      g.sfx.play('skill.cold_cast', { pos: p.pos, vol: 0.6 });
      return true;
    }
    case 'blizzard': {
      const sp = sp_(p, 'blizzard');
      const c = clampedPoint(p, act.target && !act.target.dead ? act.target.pos : act.point, 14);
      for (let i = 0; i < sp.shards; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * sp.radius;
        const pos = { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r };
        const pk = spellPacket(p, 'cold', sp.min, sp.max);
        pk.chill = 1.5;
        const b = new DelayedBlast(pos, 0.9, 0.2 + (i / sp.shards) * sp.dur, pk, 'player', 'frost', p);
        b.fx = 'hail';
        L.blasts.push(b);
      }
      g.sfx.play('skill.cold_cast', { pos: p.pos, vol: 0.8 });
      return true;
    }
  }
  return false;
}

function fireSpell(g: Game, p: Player, act = g.playerAction) {
  if (!act) return;
  if (act.lvl && castLvl === undefined) {
    castLvl = act.lvl;
    try {
      fireSpellNow(g, p, act);
    } finally {
      castLvl = undefined;
    }
  } else fireSpellNow(g, p, act);
}

function fireSpellNow(g: Game, p: Player, act: PlayerAction) {
  if (fireSorceressSpell(g, p, act)) return;
  switch (act.skill) {
    case 'blessed_hammer': {
      g.level.hammers.push(new Hammer(p.pos, p.facing, hammerPacket(p)));
      g.sfx.play('skill.magic_cast', { pos: p.pos });
      break;
    }
    case 'heavens_wrath': {
      const hp = sp_(p, 'heavens_wrath');
      const pt = act.target && !act.target.dead ? act.target.pos : act.point;
      const target = { ...pt };
      const pk = emptyPacket();
      pk.light = randInt(hp.lmin, hp.lmax);
      pk.source = p;
      pk.spell = true;
      pk.heavy = true;
      pk.pierceRes = p.stats.pierceRes;
      g.level.blasts.push(new DelayedBlast(target, 2.6, 0.18, pk, 'player', 'lightning', p));
      g.fx.burst('lightning', target, { radius: 2.6 });
      g.sfx.play('skill.lightning_impact', { pos: target });
      g.fx.shake(0.35);
      const n = hp.bolts;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const bp = emptyPacket();
        bp.magic = hp.boltDmg;
        bp.source = p;
        bp.spell = true;
        const pr = new Projectile('holybolt', target, { x: Math.sin(a) * 9, z: Math.cos(a) * 9 }, p, 'player', bp, 0.9, 0.3, true);
        g.level.projectiles.push(pr);
      }
      break;
    }
    case 'holy_shield': {
      const hp = sp_(p, 'holy_shield');
      p.holyShield = hp.dur;
      p.markDirty();
      g.fx.burst('shield_buff', p.pos);
      g.sfx.play('skill.holy_cast', { pos: p.pos });
      break;
    }
    case 'townportal': {
      g.openTownPortal();
      break;
    }
  }
}

/**
 * An item casting a skill at its own level: "X% chance to cast level N skill on striking / when
 * struck / on attack / when you kill / when you die / when you level up". Only spells and buffs
 * this game has can be cast; the rest show greyed on the item.
 */
export function castItemSkill(g: Game, p: Player, skill: string, lvl: number, target: Monster | null) {
  const def = SKILL_BY_ID[skill];
  if (!def || (def.kind !== 'spell' && def.kind !== 'buff')) return;
  const facing = p.facing;
  const point = target ? { ...target.pos } : { x: p.pos.x + Math.sin(p.facing) * 4, z: p.pos.z + Math.cos(p.facing) * 4 };
  if (target) p.facing = angleTo(p.pos, target.pos);
  castLvl = Math.max(1, lvl);
  try {
    fireSpell(g, p, { skill, target, point });
  } finally {
    castLvl = undefined;
    p.facing = facing;
  }
}

export function updatePlayer(g: Game, p: Player, dt: number) {
  if (p.dead) return;
  const d = p.stats;
  // timers & regen
  for (const k in p.cooldowns) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
  if (p.holyShield > 0) {
    p.holyShield -= dt;
    if (p.holyShield <= 0) {
      p.holyShield = 0;
      p.markDirty();
      g.hooks.message('神圣之盾消散了', '#aaa', 1);
    }
  }
  if (p.frozenArmor > 0) {
    p.frozenArmor -= dt;
    if (p.frozenArmor <= 0) {
      p.frozenArmor = 0;
      p.markDirty();
      g.hooks.message('冰封装甲消散了', '#aaa', 1);
    }
  }
  p.life = Math.min(d.maxLife, p.life + d.lifeRegen * dt);
  // D2's mana regeneration: the pool in CharStats ManaRegen seconds, raised by "regenerate mana %"
  p.mana = Math.min(d.maxMana, p.mana + manaRegenPerSec(charStats(p.cls), d.maxMana, d.manaRegenPct) * dt);
  // run or walk: the switch (Ctrl held turns it over); out of town only with stamina left (PlrModes.cpp:190-200)
  const town = g.level.inTown(p.pos);
  p.running = p.runMode !== !!g.input?.ctrl && (town || p.stamina > 0);
  // stamina: running out of town spends it, the body armor's Speed making it faster
  // (PlrModes.cpp:256-293); out of it the hero walks. Standing and walking bring it back (1139-1186)
  if (p.runningNow() && !town) {
    const body = p.equipment.body;
    p.stamina -= runDrainPerSec(charStats(p.cls), { torsoSpeed: body ? (ITEM_BASES[body.baseId]?.armorSpeed ?? 0) : 0, drainPct: d.bag.staminaDrain ?? 0 }) * dt;
    if (p.stamina <= 0) {
      p.stamina = 0;
      p.running = false;
    }
  } else {
    const mode: StaminaMode = p.state === 'idle' ? 'stand' : p.state === 'move' && !p.running ? (town ? 'townWalk' : 'walk') : 'busy';
    p.stamina = Math.min(d.maxStamina, p.stamina + staminaRegenPerSec(d.maxStamina, mode, p.stamina, d.bag.staminaRegen ?? 0) * dt);
  }
  for (const q of p.healQueue) {
    const s = Math.min(q.left, dt);
    p.life = Math.min(d.maxLife, p.life + q.perSec * s);
    q.left -= s;
  }
  p.healQueue = p.healQueue.filter((q) => q.left > 0);
  for (const q of p.manaQueue) {
    const s = Math.min(q.left, dt);
    p.mana = Math.min(d.maxMana, p.mana + q.perSec * s);
    q.left -= s;
  }
  p.manaQueue = p.manaQueue.filter((q) => q.left > 0);
  if (p.chillTime > 0) p.chillTime -= dt;
  if (p.ampTime > 0) p.ampTime -= dt;
  if (p.convictTime > 0 && (p.convictTime -= dt) <= 0) p.convictRes = p.convictDef = 0;
  if (p.poisonTime > 0) {
    p.poisonTime -= dt;
    p.life -= p.poisonDps * dt;
    if (p.life <= 0) {
      g.killPlayer();
      return;
    }
  }
  const kv = p.knockVel;
  if (Math.abs(kv.x) + Math.abs(kv.z) > 0.05) {
    moveBy(g, p, kv.x * dt, kv.z * dt);
    const decay = Math.exp(-10 * dt);
    kv.x *= decay;
    kv.z *= decay;
  }

  switch (p.state) {
    case 'hit':
    case 'block':
      p.stateTime += dt;
      if (p.stateTime >= p.stateDur) p.setState('idle');
      return;
    case 'attack': {
      p.stateTime += dt;
      if (!p.actionFired && p.stateTime >= (p.actionAt >= 0 ? p.actionAt : p.stateDur * 0.5)) {
        p.actionFired = true;
        fireAttack(g, p);
      }
      if (p.stateTime >= p.stateDur) {
        const act = g.playerAction;
        if (p.zealHitsLeft > 0 && act) {
          p.zealHitsLeft--;
          let next = act.target && !act.target.dead && dist(act.target.pos, p.pos) <= reachTo(p, act.target) + 0.4 ? act.target : null;
          // zeal spreads to adjacent enemies
          const other = nearestInFront(g, p, weaponReach(p) + p.radius + 0.4, false);
          if (!next || (other && Math.random() < 0.4)) next = other;
          if (next) {
            startAttack(g, p, 'zeal', next, next.pos, true);
            return;
          }
          p.zealHitsLeft = 0;
        }
        p.setState('idle');
      }
      return;
    }
    case 'cast':
      p.stateTime += dt;
      if (!p.actionFired && p.stateTime >= (p.actionAt >= 0 ? p.actionAt : p.stateDur * 0.55)) {
        p.actionFired = true;
        fireSpell(g, p);
      }
      if (p.stateTime >= p.stateDur) p.setState('idle');
      return;
    case 'charge': {
      p.stateTime += dt;
      const t = p.chargeTarget;
      if (!t || t.dead || p.stateTime > p.stateDur) {
        p.setState('idle');
        p.chargeTarget = null;
        return;
      }
      const before = { ...p.pos };
      stepToward(g, p, t.pos, 13, dt, reachTo(p, t) * 0.9, 1500);
      if (Math.random() < 0.7) g.fx.burst('charge', p.pos, { dir: { x: Math.sin(p.facing), z: Math.cos(p.facing) } });
      if (dist(p.pos, t.pos) <= reachTo(p, t) + 0.1) {
        startAttack(g, p, 'charge', t, t.pos, true);
        p.chargeTarget = null;
      } else if (dist(before, p.pos) < 0.01 && p.stateTime > 0.15) {
        // blocked
        p.setState('idle');
        p.chargeTarget = null;
      }
      return;
    }
  }

  // idle / move → follow intent
  const it = p.intent;
  if (!it) {
    if (p.state === 'move') p.setState('idle');
    return;
  }
  const speed = p.moveSpeed() * p.slowFactor();
  switch (it.kind) {
    case 'steer': {
      // no path finding: walk where the stick points and slide along walls
      moveBy(g, p, it.dir.x * speed * dt, it.dir.z * speed * dt);
      face(p, { x: p.pos.x + it.dir.x, z: p.pos.z + it.dir.z }, dt);
      if (p.state !== 'move') p.setState('move');
      break;
    }
    case 'move': {
      if (stepToward(g, p, it.point, speed, dt, 0.12, 6000)) {
        p.intent = null;
        p.setState('idle');
      } else if (p.state !== 'move') p.setState('move');
      break;
    }
    case 'attack': {
      const t = it.target as Monster;
      if (t.dead) {
        p.intent = null;
        p.setState('idle');
        break;
      }
      const def = SKILL_BY_ID[it.skill];
      const dd = dist(p.pos, t.pos);
      if (def?.kind === 'spell') {
        startCast(g, p, it.skill, t.pos, t);
        if (!it.hold) p.intent = null;
        break;
      }
      if (it.skill === 'charge' && dd > reachTo(p, t) + 0.3 && dd < 12) {
        if (!startCharge(g, p, t)) p.intent = null;
        else if (!it.hold) p.intent = null;
        break;
      }
      // no swinging across furniture: in reach but blocked means walk around it
      const clear = dd < 0.9 || g.level.map.los(p.pos, t.pos);
      if (dd <= reachTo(p, t) && clear) {
        face(p, t.pos, dt, 20);
        // charge needs a run-up; adjacent targets just get a normal swing
        const skill = it.skill === 'charge' ? 'attack' : it.skill;
        const ok = startAttack(g, p, skill === 'attack' || p.skillLevel(skill) > 0 ? skill : 'attack', t, t.pos);
        if (!ok || !it.hold) p.intent = null;
      } else {
        stepToward(g, p, t.pos, speed, dt, clear ? reachTo(p, t) * 0.95 : 0.3, 6000);
        if (p.state !== 'move') p.setState('move');
      }
      break;
    }
    case 'cast': {
      const def = SKILL_BY_ID[it.skill];
      if (it.skill === 'attack' || def?.kind === 'attack') {
        // attack in place toward the point
        faceNow(p, it.point);
        startAttack(g, p, it.skill === 'charge' ? 'attack' : it.skill, null, it.point);
      } else {
        startCast(g, p, it.skill, it.point, it.target as Monster | null, it.charge);
      }
      p.intent = null;
      break;
    }
    case 'pickup': {
      const gi = it.ground;
      if (stepToward(g, p, gi.pos, speed, dt, 0.7, 6000)) {
        g.pickupGround(gi as never);
        p.intent = null;
        p.setState('idle');
      } else if (p.state !== 'move') p.setState('move');
      break;
    }
    case 'interact': {
      const o = it.obj as { pos: P2; radius: number };
      if (stepToward(g, p, o.pos, speed, dt, o.radius + 0.75, 6000)) {
        g.interact(it.obj as never);
        p.intent = null;
        p.setState('idle');
      } else if (p.state !== 'move') p.setState('move');
      break;
    }
  }
}

export function angleFromPlayer(p: Player, pt: P2) {
  return angleTo(p.pos, pt);
}
