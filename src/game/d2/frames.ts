// Diablo II's speed breakpoints: how many frames (25 a second) an attack, a cast, a hit recovery and
// a block take for a class, its weapon class and its IAS, FCR, FHR and FBR. Pure functions:
// Player.recalc turns attackAnim, castAnim, hitRecoveryFrames and blockFrames into the seconds the
// hero's attack, cast, hit and block states last (toSeconds), and the 3D clips play over exactly
// that (playbackRate's clip length / seconds, src/render/models.ts), skills too (plan A3).
// The speed rules are D2MOO's (github.com/ThePhrozenKeep/D2MOO at commit d9d394f, D2Common
// Units/Units.cpp). The frame counts per class and weapon class are in the game's AnimData.d2, which
// d2data does not carry, so they are hand-entered from community tables: attacks from the Amazon
// Basin wiki's animation table (theamazonbasin.com/wiki/index.php/Attack_speed), casts, hit recovery
// and blocks from maxroll's "Breakpoints & Animations" (maxroll.gg/d2/resources/breakpoints-animations,
// updated 2026-02-10). tools/test/d2-frames.test.mjs checks the published breakpoint tables against
// them. Integer steps are D2's (C division truncates toward zero, hence Math.trunc).
import type { PlayerClass } from '../../data/classes';
import type { ClassCode } from './stats';

/** D2's game ticks a second: one animation frame a tick at the normal rate */
export const FRAMES_PER_SEC = 25;

/** seconds that many frames take */
export function toSeconds(frames: number): number {
  return frames / FRAMES_PER_SEC;
}

/** speed to play a clip `clipSeconds` long at so it lasts `frames` D2 frames */
export function playbackRate(clipSeconds: number, frames: number): number {
  return clipSeconds / toSeconds(Math.max(1, frames));
}

/** D2's weapon classes (ITEMS_GetWeaponClassId, Items.cpp:3573-3602); anything else is hand to hand */
export type WeaponClass = 'hth' | 'bow' | '1hs' | '1ht' | 'stf' | '2hs' | '2ht' | 'xbw' | 'ht1';
const WEAPON_CLASSES = new Set<string>(['bow', '1hs', '1ht', 'stf', '2hs', '2ht', 'xbw', 'ht1']);

/**
 * The class a weapon animates with: weapons.txt's 2handedwclass when wielded in two hands, as a
 * Paladin or Sorceress always wields a two-handed weapon (D2Composit.cpp:343-353); no weapon or an
 * unknown code is hand to hand (Items.cpp:3593-3601).
 */
export function weaponClass(w?: { wclass: string; wclass2?: string; twoHanded?: boolean } | null): WeaponClass {
  if (!w) return 'hth';
  const c = w.twoHanded ? (w.wclass2 ?? w.wclass) : w.wclass;
  return WEAPON_CLASSES.has(c) ? (c as WeaponClass) : 'hth';
}

/** one AnimData row: frames per direction, the rate in 256ths of a frame a tick, the action frame */
interface Anim {
  frames: number;
  speed: number;
  /** the frame the hit lands or the missile leaves on */
  action?: number;
}

type FrameClass = Extract<ClassCode, 'pal' | 'sor'>;
const CODE_OF: Record<string, FrameClass> = { paladin: 'pal', sorceress: 'sor', pal: 'pal', sor: 'sor' };
function code(cls: PlayerClass | FrameClass): FrameClass {
  const c = CODE_OF[cls];
  if (!c) throw new Error(`no animation data for ${cls}`);
  return c;
}

// attacks (A1): Amazon Basin's FramesPerDirection, AnimationSpeed and ActionFlagFrames for PA and SO
const ATTACK: Record<FrameClass, Partial<Record<WeaponClass, Anim>>> = {
  pal: {
    hth: { frames: 14, speed: 256, action: 7 },
    '1hs': { frames: 15, speed: 256, action: 7 },
    '2hs': { frames: 18, speed: 256, action: 8 },
    '1ht': { frames: 17, speed: 256, action: 8 },
    '2ht': { frames: 20, speed: 256, action: 8 },
    stf: { frames: 18, speed: 256, action: 9 },
    bow: { frames: 16, speed: 256, action: 8 },
    xbw: { frames: 20, speed: 256, action: 10 },
  },
  sor: {
    hth: { frames: 16, speed: 256, action: 9 },
    '1hs': { frames: 20, speed: 256, action: 12 },
    '2hs': { frames: 24, speed: 256, action: 14 },
    '1ht': { frames: 19, speed: 256, action: 11 },
    '2ht': { frames: 23, speed: 256, action: 13 },
    stf: { frames: 18, speed: 256, action: 11 },
    bow: { frames: 17, speed: 256, action: 9 },
    xbw: { frames: 20, speed: 256, action: 11 },
  },
};

/**
 * The frame a player's attack starts on, skipping the animation's first frames: the Sorceress's (and
 * Amazon's) one hand to hand, two with a melee weapon, none with a bow (gaClassesWeaponFrameBonus,
 * Units.cpp:2676-2692); attack modes only (2714-2741).
 */
const START: Record<FrameClass, Partial<Record<WeaponClass, number>>> = {
  pal: {},
  sor: { hth: 1, '1hs': 2, '1ht': 2, stf: 2, '2hs': 2, '2ht': 2 },
};

// casts (SC): maxroll's casting base, animation speed and action flag
const CAST: Record<FrameClass, Anim> = {
  pal: { frames: 16, speed: 256, action: 9 },
  sor: { frames: 14, speed: 256, action: 7 },
};
/** Lightning and Chain Lightning play a 19-frame sequence instead (maxroll, "Lightning exception") */
const LIGHTNING_SEQ: Anim = { frames: 19, speed: 256 };

// hit recovery (GH): maxroll's hit base and animation speed; a Paladin with a spear or a staff
// (polearms animate as staves) recovers at 192
const GETHIT: Record<FrameClass, Anim> = {
  pal: { frames: 5, speed: 256 },
  sor: { frames: 8, speed: 256 },
};
const PAL_GETHIT_SPEAR: Anim = { frames: 5, speed: 192 };

// blocks (BL): maxroll's block base and animation speed
const BLOCK: Record<FrameClass, Anim> = {
  pal: { frames: 3, speed: 256 },
  sor: { frames: 5, speed: 256 },
};

/**
 * Item IAS, FCR, FHR and FBR after diminishing returns: 120 × x / (120 + x) (Units.cpp:1362-1367,
 * 1454-1458, 1514-1518, 1553-1557). Items only carry positive values.
 */
export function effectiveSpeed(pct: number): number {
  if (!pct) return 0;
  return Math.trunc((120 * pct) / (pct + 120));
}

/** an animation's rate at `ratePct` percent: AnimData's speed × rate / 100, at most 0x7FFF */
export function animSpeedAt(speed: number, ratePct: number): number {
  return Math.min(0x7fff, Math.trunc((ratePct * speed) / 100));
}

/**
 * Frames an animation of `len` frames lasts at `speed` 256ths of a frame a tick. A mode ends a tick
 * early, when the next step would reach the end (UNITS_IsAtEndOfFrameCycle, Units.cpp:1777-1789),
 * hence the −1; a sequence counts its frames down to zero instead (1030, 1070, 1783), with no −1.
 */
export function animFrames(len: number, speed: number, sequence = false): number {
  return Math.ceil((256 * len) / Math.max(1, speed)) - (sequence ? 0 : 1);
}

/** ticks until frame `action`, counted from `start` (the frame step, D2Common #10373, Units.cpp:1087-1114) */
function actionFrame(action: number, start: number, speed: number): number {
  return Math.ceil((256 * (action - start)) / Math.max(1, speed));
}

export interface AttackSpeed {
  /** item IAS, before diminishing returns */
  ias?: number;
  /** skill IAS (Fanaticism, Burst of Speed; negative for slows), added as is */
  skillIas?: number;
  /** the weapon's speed modifier (weapons.txt speed): negative is faster */
  wsm?: number;
  /** a sequence skill (Zeal, Jab, Strafe…) attacks 30 slower */
  sequence?: boolean;
}

/**
 * The attack rate in percent: STAT_ATTACKRATE (100 for a player, PlayerStats.cpp:56, less the
 * weapon's speed column, Items.cpp:5387, plus skill IAS) plus item EIAS, 30 less in a sequence,
 * held to 15–175 (Units.cpp:1362-1410), so EIAS + SIAS − WSM is capped at 75.
 */
export function attackRate(o: AttackSpeed = {}): number {
  const rate = 100 + effectiveSpeed(o.ias ?? 0) + (o.skillIas ?? 0) - (o.wsm ?? 0) - (o.sequence ? 30 : 0);
  return Math.max(15, Math.min(175, rate));
}

export interface AnimFrames {
  /** frames the whole animation takes */
  frames: number;
  /** frames until its action (the hit, the missile); absent where the source has none */
  action?: number;
}

/**
 * A normal attack (A1): the animation from its start frame at the attack rate (Units.cpp:1425),
 * ceil(256 × (FramesPerDirection − start) / speed) − 1.
 */
export function attackAnim(cls: PlayerClass | FrameClass, wclass: WeaponClass, o: AttackSpeed = {}): AnimFrames {
  const c = code(cls);
  const a = ATTACK[c][wclass];
  if (!a) throw new Error(`no ${wclass} attack for ${cls}`);
  const start = START[c][wclass] ?? 0;
  const speed = animSpeedAt(a.speed, attackRate({ ...o, sequence: false }));
  return { frames: animFrames(a.frames - start, speed), action: actionFrame(a.action ?? a.frames, start, speed) };
}

/**
 * A cast: rate 100 + EFCR, at most 175 (Units.cpp:1514-1526). `lightning` is the Sorceress's
 * Lightning and Chain Lightning sequence, which takes FCR too (UNITS_IsSeqAnimSpeedModulatedByFCR,
 * Units.cpp:1476-1506); the source gives it no reliable action frame.
 */
export function castAnim(cls: PlayerClass | FrameClass, fcr: number, o: { lightning?: boolean } = {}): AnimFrames {
  const c = code(cls);
  if (o.lightning && c !== 'sor') throw new Error(`no Lightning sequence for ${cls}`);
  const a = o.lightning ? LIGHTNING_SEQ : CAST[c];
  const speed = animSpeedAt(a.speed, Math.min(175, 100 + effectiveSpeed(fcr)));
  const frames = animFrames(a.frames, speed, !!o.lightning);
  return a.action === undefined ? { frames } : { frames, action: actionFrame(a.action, 0, speed) };
}

/** hit recovery: rate 50 + EFHR, no cap (Units.cpp:1553-1560); a Paladin's spear or staff is slower */
export function hitRecoveryFrames(cls: PlayerClass | FrameClass, fhr: number, wclass: WeaponClass = 'hth'): number {
  const c = code(cls);
  const a = c === 'pal' && (wclass === '2ht' || wclass === 'stf') ? PAL_GETHIT_SPEAR : GETHIT[c];
  return animFrames(a.frames, animSpeedAt(a.speed, 50 + effectiveSpeed(fhr)));
}

/**
 * The odds a blow puts a hero into hit recovery (SUNITDMG_ShouldSkipHitRecovery, D2Game
 * SUnitDmg.cpp:2161-2230): never under a point, nor under maxLife / divisor; under twice that it is
 * skipped half the time, and under four times that a further quarter of the time. The divisor is
 * the attack's hit class's: 8 for one-handed swings at small targets, thrusts, bows and
 * crossbows, 32 for two-handed swings at small targets and clubs, 64 for two-handed swings at
 * large ones, 16 for the rest. A frozen hero, and poison alone, never get hit (2163-2172).
 */
export function hitRecoveryOdds(dmg: number, maxLife: number, divisor = 16): number {
  const d = Math.trunc(dmg * 256);
  const max = Math.trunc(maxLife * 256);
  if (d < 256 || d < Math.trunc(max / divisor)) return 0;
  let odds = 1;
  if (d < Math.trunc(max / (divisor / 2))) odds *= 0.5;
  if (d < Math.trunc(max / (divisor / 4))) odds *= 0.75;
  return odds;
}

/**
 * Seconds before a block plays its animation again: blocks keep stopping blows, but the hero only
 * goes back into the block mode once FBR / 8 + 15 frames have passed since the last one
 * (SUnitDmg.cpp:2003-2008, STAT_LASTBLOCKFRAME); `fbr` is the item total, before diminishing returns.
 */
export function blockAnimGap(fbr: number): number {
  return toSeconds(Math.trunc(fbr / 8) + 15);
}

/** a block: rate 50 + EFBR, 100 + EFBR under Holy Shield, no cap (Units.cpp:1448-1471) */
export function blockFrames(cls: PlayerClass | FrameClass, fbr: number, holyShield = false): number {
  const a = BLOCK[code(cls)];
  return animFrames(a.frames, Math.max(1, animSpeedAt(a.speed, (holyShield ? 100 : 50) + effectiveSpeed(fbr))));
}

/**
 * A breakpoint table: the least percentage from 0 to `max` that gives each frame count, as
 * [pct, frames] pairs, e.g. breakpoints((f) => castAnim('sor', f).frames).
 */
export function breakpoints(framesAt: (pct: number) => number | undefined, max = 400): [number, number][] {
  const out: [number, number][] = [];
  let last: number | undefined;
  for (let pct = 0; pct <= max; pct++) {
    const f = framesAt(pct);
    if (f !== undefined && f !== last) out.push([pct, f]);
    last = f;
  }
  return out;
}
