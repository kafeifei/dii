import type { P2 } from '../core/math';
import type { Elem } from '../data/monsters';
import type { FxKind } from '../game/fx';
import type { Effects } from './effects';
import { BOLT, GROUND, SPRITE, type SpriteOpts } from './sprites';

/**
 * The skills' effects drawn off the effect pictures (public/fx, sprites.ts): fire from Unity Labs'
 * flipbooks, lightning, glints, rings and swirls from Kenney's particles, smoke tinted for cold mist
 * and poison. Effects (effects.ts) calls these once its sheets are in, and falls back to its own
 * glows and lines till then and for anything not here.
 */

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const turn = () => Math.random() * TAU;
/** one of the four patches of crackling lightning */
const crackle = () => SPRITE.crackle + ((Math.random() * 4) | 0);
/** one of the forks of lightning */
const fork = () => (Math.random() * 4) | 0;

const COLD_MIST = '#cfe8ff';
const COLD = '#80c8ff';
const ICE = '#e0f4ff';
const SPARK_BLUE = '#b0c0ff';
const HOLY = '#ffe8a0';

/** a puff of the smoke sheet rolling over as it grows and thins: grey, tinted by `color` */
function puff(fx: Effects, o: Omit<SpriteOpts, 'frame'>) {
  fx.sheets.smoke.spawn({ frame: Math.random() * 64, fps: 24, rot: turn(), spin: rnd(-0.6, 0.6), life: 0.8, endSize: 2.4, add: 0.35, glow: 2.2, alpha: 0.4, ...o });
}

/** cold mist: a pale blue puff */
function mist(fx: Effects, x: number, y: number, z: number, size: number, o: Partial<SpriteOpts> = {}) {
  puff(fx, { x, y, z, size, color: COLD_MIST, ...o });
}

/** fire catching on something hit: tongues of flame licking up it and a ball of fire flaring */
export function flareUp(fx: Effects, x: number, z: number, size: number) {
  for (let i = 0; i < 3; i++) {
    const w = size * rnd(0.45, 0.65);
    fx.sheets.flame.spawn({ x: x + rnd(-0.25, 0.25), y: w * 0.9, z: z + rnd(-0.25, 0.25), face: 'up', size: w, aspect: 2, endSize: 0.6, life: rnd(0.35, 0.5), fadeIn: 0.15, frame: Math.random() * 64, fps: 60, color: '#ffb080' });
  }
  fx.sheets.fireball.spawn({ x, y: 0.9, z, size: size * 0.6, endSize: 1.5, life: 0.25, frame: Math.random() * 64, fps: 50, alpha: 0.6, color: '#ffa060' });
}

/** a ball of fire in flight, `s` times a fire bolt's: the ball, a tail narrowing off behind it, flames, smoke and embers it sheds */
function fireMissile(fx: Effects, x: number, y: number, z: number, dir: number, id: number, dt: number, s: number) {
  const t = performance.now() / 1000;
  const bx = -Math.sin(dir);
  const bz = -Math.cos(dir);
  const f = t * 45 + id * 17;
  const F = fx.sheets.fireball;
  F.draw({ x, y, z, size: 0.72 * s, frame: f, rot: id, color: '#ffe0c0', glow: 0.95 });
  for (let k = 1; k <= 6; k++) {
    const w = 1 - k / 7;
    F.draw({ x: x + bx * k * 0.09 * s, y, z: z + bz * k * 0.09 * s, size: 0.65 * s * w, frame: f + k * 9, rot: id + k, alpha: 0.85 * w, color: '#ffb080' });
  }
  for (let n = Math.random() < dt * 60 ? 2 : 1; n > 0; n--) {
    const k = rnd(0.15, 0.45) * s;
    F.spawn({ x: x + bx * k + rnd(-0.05, 0.05) * s, y: y + rnd(-0.05, 0.05), z: z + bz * k, vy: 0.5, size: 0.42 * s, endSize: 0.3, life: 0.18, frame: Math.random() * 64, fps: 45, alpha: 0.6, color: '#ff9a60', rot: turn() });
  }
  if (Math.random() < dt * 30 * s) fx.sheets.sprites.spawn({ x: x + bx * 0.3 * s, y, z: z + bz * 0.3 * s, vy: 0.6, frame: SPRITE.puff, size: 0.35 * s, endSize: 2.4, life: 0.8, color: '#1e1814', alpha: 0.4, add: 0, rot: turn(), spin: 1 });
  if (Math.random() < dt * 25 * s) fx.sheets.sprites.spawn({ x, y, z, vx: bx * 1.5 + rnd(-0.5, 0.5), vy: rnd(0.5, 1.5), vz: bz * 1.5 + rnd(-0.5, 0.5), frame: SPRITE.star, size: 0.14, life: 0.5, color: '#ffa040', glow: 1.6, gravity: 3, drag: 1.5 });
}

/**
 * A missile in flight: what's drawn off the pictures where it is this frame and what it leaves
 * behind (`dir` its heading, `id` to set each apart, `s` its size against the usual). 'art' when the
 * pictures are all of it, 'mesh' when its model stays and they add to it, null for neither.
 */
export function missile(fx: Effects, kind: string, x: number, y: number, z: number, dir: number, id: number, dt: number, s: number): 'art' | 'mesh' | null {
  const t = performance.now() / 1000;
  const P = fx.sheets.sprites;
  const bx = -Math.sin(dir);
  const bz = -Math.cos(dir);
  switch (kind) {
    case 'firebolt':
      fireMissile(fx, x, y, z, dir, id, dt, 1);
      return 'art';
    case 'fireball':
      fireMissile(fx, x, y, z, dir, id, dt, 1.55);
      return 'art';
    case 'iceshard': {
      // the shard itself is its model: a cold glow about it, a glint at its point, mist trailing off it, frost falling
      P.draw({ x, y, z, frame: SPRITE.dot, size: 0.9 * s, color: '#4a9cff', alpha: 0.45 });
      P.draw({ x: x - bx * 0.2 * s, y, z: z - bz * 0.2 * s, frame: SPRITE.shine, size: 0.55 * s, rot: t * 3 + id, color: ICE, glow: 1.4 });
      for (let k = 1; k <= 5; k++) P.draw({ x: x + bx * k * 0.12 * s, y, z: z + bz * k * 0.12 * s, frame: SPRITE.dot, size: 0.45 * s * (1 - k / 6), color: '#8cc8ff', alpha: 0.6 * (1 - k / 6) });
      if (Math.random() < dt * 60) mist(fx, x + bx * 0.25, y, z + bz * 0.25, 0.3 * s, { endSize: 2.4, life: 0.5, alpha: 0.28, vy: 0.1 });
      if (Math.random() < dt * 20) P.spawn({ x: x + rnd(-0.1, 0.1), y, z: z + rnd(-0.1, 0.1), vy: -0.3, frame: SPRITE.glint, size: rnd(0.12, 0.2), life: 0.45, color: ICE, glow: 1.5, gravity: 1.5, rot: turn() });
      return 'mesh';
    }
    case 'poisonspit': {
      // a ball of venom roiling, dripping, trailing green fumes
      fx.sheets.smoke.draw({ x, y, z, frame: t * 30 + id * 7, size: 0.95, rot: id, color: '#86e040', glow: 3.5, add: 0.8, alpha: 0.9 });
      P.draw({ x, y, z, frame: SPRITE.dot, size: 0.6, color: '#60ff40', alpha: 0.6 });
      if (Math.random() < dt * 30) puff(fx, { x: x + bx * 0.25, y, z: z + bz * 0.25, size: 0.45, endSize: 2.2, life: 0.6, color: '#70c040', glow: 3, alpha: 0.35, add: 0.6 });
      if (Math.random() < dt * 14) P.spawn({ x, y, z, frame: SPRITE.dot, size: 0.09, life: 0.5, color: '#80ff50', glow: 1.3, gravity: 7 });
      return 'art';
    }
    case 'chargedbolt':
    case 'lightning': {
      // a ball of crackling lightning, flickering; a monster's bolt drags a fork of it behind
      P.draw({ x, y, z, frame: crackle(), size: 0.75 * s, rot: turn(), color: SPARK_BLUE, glow: 1.7 });
      P.draw({ x, y, z, frame: SPRITE.dot, size: 0.32 * s, color: '#e8eeff', glow: 1.2 });
      if (kind === 'lightning') fx.sheets.bolts.draw({ x, y, z, to: { x: x + bx * 1.3, y, z: z + bz * 1.3 }, frame: fork(), size: 0.4, color: SPARK_BLUE, glow: 1.5 });
      if (Math.random() < dt * 20) P.spawn({ x, y, z, vx: rnd(-1, 1), vy: rnd(-0.5, 1), vz: rnd(-1, 1), frame: SPRITE.star, size: 0.12, life: 0.25, color: '#d0dcff', glow: 1.6 });
      return 'art';
    }
    case 'holybolt': {
      // a holy star turning, a glow about it, sparkles strewn behind
      P.draw({ x, y, z, frame: SPRITE.glint, size: 0.75, rot: t * 4 + id, color: HOLY, glow: 1.3 });
      P.draw({ x, y, z, frame: SPRITE.dot, size: 0.5, color: '#fff0c0', alpha: 0.6 });
      if (Math.random() < dt * 30) P.spawn({ x: x + rnd(-0.1, 0.1), y: y + rnd(-0.1, 0.1), z: z + rnd(-0.1, 0.1), frame: SPRITE.sparkle, size: rnd(0.18, 0.3), life: 0.35, color: '#ffe080', glow: 1.4, rot: turn() });
      return 'art';
    }
  }
  return null;
}

/** a missile's end, where it hit or ran out; whether it drew one */
export function impact(fx: Effects, kind: string, p: P2): boolean {
  const { x, z } = p;
  const P = fx.sheets.sprites;
  switch (kind) {
    case 'firebolt':
      fx.sheets.explosion.spawn({ x, y: 1.0, z, size: 2.2, endSize: 1.2, life: 25 / 36, fps: 36, loop: false, add: 0.3, rot: turn() });
      P.spawn({ x, y: 1.0, z, frame: SPRITE.starBurst, size: 1.3, endSize: 0.4, life: 0.14, color: '#ffa050', rot: turn() });
      fx.sparks(x, 1, z, '#ff9040', 10, 3.5, 0.12, 0.35, 5);
      fx.flash(p, '#ff7a30', 14, 0.25, 5);
      return true;
    case 'fireball':
      // a hit bursts (fireblast); one run out just flares out
      P.spawn({ x, y: 1.0, z, frame: SPRITE.starBurst, size: 1.6, endSize: 0.5, life: 0.16, color: '#ffa050', rot: turn() });
      fx.sheets.fireball.spawn({ x, y: 1.0, z, size: 1.0, endSize: 1.8, life: 0.3, frame: Math.random() * 64, fps: 50, alpha: 0.7, color: '#ffa060' });
      return true;
    case 'iceshard':
      P.spawn({ x, y: 1.0, z, frame: SPRITE.shine, size: 1.0, endSize: 0.5, life: 0.18, color: ICE, glow: 1.5, rot: turn() });
      P.spawn({ x, y: 1.0, z, frame: SPRITE.debris, size: 0.5, endSize: 2.4, life: 0.32, color: '#c8ecff', add: 0.7, alpha: 0.9, rot: turn() });
      mist(fx, x, 1.0, z, 0.6, { endSize: 2.4, life: 0.7 });
      fx.sparks(x, 1, z, '#c0ecff', 6, 2.5, 0.1, 0.35, 6);
      fx.flash(p, COLD, 8, 0.2, 4);
      return true;
    case 'poisonspit':
      puff(fx, { x, y: 1.0, z, size: 0.7, endSize: 2.6, life: 0.8, color: '#70c040', glow: 3, alpha: 0.45, add: 0.6 });
      for (let i = 0; i < 6; i++) P.spawn({ x, y: 1.0, z, vx: rnd(-1.5, 1.5), vy: rnd(0.5, 2), vz: rnd(-1.5, 1.5), frame: SPRITE.dot, size: 0.1, life: 0.5, color: '#80ff50', glow: 1.3, gravity: 7 });
      return true;
    case 'chargedbolt':
    case 'lightning':
      P.spawn({ x, y: 1.0, z, frame: crackle(), size: 1.2, endSize: 1.4, life: 0.16, color: SPARK_BLUE, glow: 1.7, rot: turn() });
      P.spawn({ x, y: 1.0, z, frame: SPRITE.starBurst, size: 0.9, endSize: 0.4, life: 0.1, color: '#e8eeff', rot: turn() });
      fx.sparks(x, 1, z, '#e0e8ff', 6, 4, 0.08, 0.2, 0);
      fx.flash(p, '#a0b0ff', 10, 0.15, 4);
      return true;
    case 'holybolt':
      P.spawn({ x, y: 1.0, z, frame: SPRITE.halo, size: 1.0, endSize: 0.4, life: 0.2, color: HOLY, glow: 1.4, rot: turn() });
      fx.sparks(x, 1, z, '#ffe8a0', 6, 2.5, 0.1, 0.3, 2);
      return true;
  }
  return false;
}

/** fire on the ground where something burst: a scorch left behind, a glow, flames */
function scorch(fx: Effects, x: number, z: number, r: number, life: number) {
  const G = fx.sheets.ground;
  G.spawn({ x, y: 0.03, z, face: 'flat', frame: GROUND.scorch, size: r * 2.2, life, fadeOut: 0.3, color: '#000000', add: 0, alpha: 0.65, rot: turn() });
  G.spawn({ x, y: 0.04, z, face: 'flat', frame: GROUND.glow, size: r * 2.6, endSize: 0.7, life: 0.6, color: '#ff5a10', glow: 1.3, alpha: 0.7, rot: turn() });
}

/** a ground ring running out from 0 to `r` */
function groundRing(fx: Effects, x: number, z: number, r: number, life: number, color: string, o: Partial<SpriteOpts> = {}) {
  fx.sheets.ground.spawn({ x, y: 0.05, z, face: 'flat', frame: GROUND.ring, size: 0.6, endSize: (r * 2) / 0.6, life, fadeOut: 0.6, color, glow: 1.2, rot: turn(), ...o });
}

/** a fire blast: a ball of fire blooming into smoke, a second and third about it, flames, embers, a scorch */
function fireBlast(fx: Effects, x: number, z: number, r: number, big: boolean) {
  const E = fx.sheets.explosion;
  const size = Math.max(1.6, r * (big ? 2.1 : 1.5)) + 0.4;
  E.spawn({ x, y: size * 0.42, z, size, endSize: 1.15, life: 25 / 34, fps: 34, loop: false, add: 0.3, rot: turn() });
  for (let i = 0; i < (big ? 3 : 2); i++) {
    const a = turn();
    const d = r * rnd(0.3, 0.6);
    const s = size * rnd(0.5, 0.7);
    E.spawn({ x: x + Math.sin(a) * d, y: s * 0.45, z: z + Math.cos(a) * d, size: s, endSize: 1.2, frame: rnd(0, 3), life: 22 / 30, fps: 30, loop: false, add: 0.3, rot: turn() });
  }
  fx.sheets.sprites.spawn({ x, y: 0.8, z, frame: SPRITE.starBurst, size: size * 0.9, endSize: 0.5, life: 0.12, color: '#ffb060', rot: turn() });
  for (let i = 0; i < (big ? 8 : 5); i++) {
    const a = turn();
    const d = r * rnd(0.2, 0.8);
    const w = rnd(0.5, 0.8) * (big ? 1.2 : 1);
    fx.sheets.flame.spawn({ x: x + Math.sin(a) * d, y: w, z: z + Math.cos(a) * d, face: 'up', size: w, aspect: 2, endSize: 0.6, life: rnd(0.45, 0.7), fadeIn: 0.2, frame: Math.random() * 64, fps: 55, color: '#ffb080' });
  }
  for (let i = 0; i < (big ? 30 : 16); i++) {
    const a = turn();
    const sp = rnd(1, 4) * Math.max(1, r * 0.7);
    fx.sheets.sprites.spawn({ x, y: 0.6, z, vx: Math.sin(a) * sp, vy: rnd(1.5, 5), vz: Math.cos(a) * sp, frame: SPRITE.star, size: rnd(0.12, 0.2), life: rnd(0.5, 0.9), color: '#ffa040', glow: 1.6, gravity: 6, drag: 1 });
  }
  scorch(fx, x, z, r, big ? 8 : 4);
}

/** cold bursting out: a ring of mist and frost running out to `r`, mist rolling out, ice glinting */
function coldBurst(fx: Effects, x: number, z: number, r: number, puffs: number, life: number) {
  const G = fx.sheets.ground;
  G.spawn({ x, y: 0.05, z, face: 'flat', frame: GROUND.smokeRing, size: 0.6, endSize: (r * 2.2) / 0.6, life, fadeOut: 0.6, color: '#d8f0ff', glow: 1.5, add: 0.5, alpha: 0.8, rot: turn() });
  groundRing(fx, x, z, r, life * 0.85, COLD, { glow: 1.1, alpha: 0.8 });
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * TAU + rnd(-0.1, 0.1);
    const sp = (r / life) * rnd(0.9, 1.4);
    mist(fx, x + Math.sin(a) * 0.3, rnd(0.3, 0.7), z + Math.cos(a) * 0.3, rnd(0.5, 0.7), { vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, drag: 1.6, endSize: 3, life: life * 1.4, alpha: 0.38 });
  }
  for (let i = 0; i < puffs * 0.7; i++) {
    const a = turn();
    const sp = (r / life) * rnd(0.5, 1.1);
    fx.sheets.sprites.spawn({ x, y: rnd(0.3, 1.1), z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, drag: 1.5, frame: Math.random() < 0.5 ? SPRITE.shine : SPRITE.glint, size: rnd(0.2, 0.38), life: rnd(0.4, 0.7), color: ICE, glow: 1.6, rot: turn(), spin: rnd(-3, 3) });
  }
}

type V3 = { x: number; y: number; z: number };

/**
 * A fork of lightning from `a` to `b`, broken into jagged lengths (`jag` of each, aside) each drawn
 * off the bolts sheet: a thin white core in a wider blue glow
 */
function strike(fx: Effects, a: V3, b: V3, width: number, life: number, jag = 0.55) {
  const B = fx.sheets.bolts;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.round(len / 0.9));
  const off = (len / n) * jag;
  const pts: V3[] = [a];
  for (let i = 1; i < n; i++) pts.push({ x: a.x + (dx * i) / n + rnd(-off, off), y: a.y + (dy * i) / n + rnd(-off, off) * 0.5, z: a.z + (dz * i) / n + rnd(-off, off) });
  pts.push(b);
  for (let i = 0; i < n; i++) {
    B.spawn({ ...pts[i], to: pts[i + 1], frame: BOLT.thread, size: width, life, fadeOut: 0.6, color: '#ffffff', glow: 1.6 });
    B.spawn({ ...pts[i], to: pts[i + 1], frame: fork(), size: width * 2, life: life * 1.2, fadeOut: 0.7, color: '#90a8ff', glow: 1.3 });
  }
}

/**
 * A skill's (or a monster's) burst off the pictures; whether it drew it (the rest stay with Effects).
 * Kinds as src/game/fx.ts FxKind.
 */
export function burst(fx: Effects, kind: FxKind, pos: P2, opts: { radius?: number; dir?: P2; color?: string; target?: P2 }): boolean {
  const { x, z } = pos;
  const P = fx.sheets.sprites;
  const G = fx.sheets.ground;
  switch (kind) {
    case 'holyfire': {
      // a ring of fire running out over the ground, flames leaping up round the paladin, embers
      const r = opts.radius ?? 4;
      groundRing(fx, x, z, r, 0.5, '#ff6a20');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + rnd(0, 0.3);
        const d = rnd(0.6, 1.5);
        const w = rnd(0.55, 0.9);
        fx.sheets.flame.spawn({ x: x + Math.sin(a) * d, y: w, z: z + Math.cos(a) * d, face: 'up', size: w, aspect: 2, endSize: 0.7, life: rnd(0.5, 0.75), fadeIn: 0.2, frame: Math.random() * 64, fps: 60, color: '#ffb080' });
      }
      for (let i = 0; i < 24; i++) {
        const a = turn();
        const d = Math.random() * r;
        if (!fx.onGround(x + Math.sin(a) * d, z + Math.cos(a) * d)) continue;
        P.spawn({ x: x + Math.sin(a) * d, y: 0.2, z: z + Math.cos(a) * d, vy: rnd(1.5, 4), frame: SPRITE.star, size: 0.18, life: rnd(0.6, 1), color: '#ffa040', glow: 1.5, gravity: -0.5, drag: 1, rot: turn() });
      }
      fx.flash(pos, '#ff6a20', 20, 0.35, r * 2);
      return true;
    }
    case 'freeze': {
      // holy freeze's pulse, frozen armor put on, a cold aura's pulse: kept near (a ring as wide as
      // the aura's reach runs out over the walls and the dark past them)
      const r = Math.min(opts.radius ?? 4, 3);
      coldBurst(fx, x, z, r, Math.round(8 + r * 2), 0.6);
      fx.flash(pos, '#80c0ff', 12, 0.3, r * 2);
      return true;
    }
    case 'frostnova': {
      const r = opts.radius ?? 3.5;
      coldBurst(fx, x, z, r, 30, 0.5);
      for (let i = 0; i < 4; i++) P.spawn({ x: x + rnd(-0.5, 0.5), y: 0.6, z: z + rnd(-0.5, 0.5), frame: SPRITE.debris, size: 0.6, endSize: 3, life: 0.35, color: '#c8ecff', add: 0.7, alpha: 0.8, rot: turn() });
      fx.flash(pos, '#60b0ff', 30, 0.35, r * 2.5);
      return true;
    }
    case 'ice_shatter': {
      const r = opts.radius ?? 1.6;
      coldBurst(fx, x, z, r, 14, 0.45);
      P.spawn({ x, y: 0.9, z, frame: SPRITE.shine, size: r * 1.3, endSize: 0.5, life: 0.2, color: ICE, glow: 1.6, rot: turn() });
      for (let i = 0; i < 3; i++) P.spawn({ x, y: 0.8, z, frame: SPRITE.debris, size: 0.5, endSize: (r * 2) / 0.5, life: 0.4, color: '#c8ecff', add: 0.7, alpha: 0.9, rot: turn() });
      fx.sparks(x, 0.6, z, '#c0ecff', 12, r * 2.5, 0.14, 0.5, 8);
      fx.flash(pos, COLD, 25, 0.3, r * 3);
      return true;
    }
    case 'hail': {
      // a shard come down out of the storm: its streak, the shatter, frost left on the ground
      const r = opts.radius ?? 0.9;
      P.spawn({ x: x + 0.5, y: 3.2, z: z + 0.5, to: { x, y: 0.15, z }, frame: SPRITE.beam, size: 0.28, life: 0.12, fadeOut: 1, color: ICE, glow: 1.5 });
      P.spawn({ x, y: 0.25, z, frame: SPRITE.shine, size: 0.8, endSize: 0.4, life: 0.16, color: ICE, glow: 1.5, rot: turn() });
      P.spawn({ x, y: 0.25, z, frame: SPRITE.debris, size: 0.4, endSize: (r * 1.6) / 0.4, life: 0.3, color: '#c8ecff', add: 0.7, alpha: 0.8, rot: turn() });
      mist(fx, x, 0.3, z, 0.4, { endSize: 3, life: 0.7, alpha: 0.3 });
      G.spawn({ x, y: 0.03, z, face: 'flat', frame: GROUND.glow, size: r * 1.6, life: 1.0, color: COLD, alpha: 0.16, rot: turn() });
      fx.sparks(x, 0.2, z, '#d0f0ff', 5, 2.5, 0.12, 0.3, 8);
      return true;
    }
    case 'lightning': {
      // heaven's wrath (and a lightning aura's pulse): forks out of the sky, the ground lit and scorched, sparks crawling over it
      const r = opts.radius ?? 2.5;
      for (let i = 0; i < 3; i++) {
        const top = { x: x + rnd(-1.5, 1.5), y: 13, z: z + rnd(-1.5, 1.5) };
        strike(fx, top, { x: x + rnd(-0.3, 0.3), y: 0.05, z: z + rnd(-0.3, 0.3) }, i ? 0.45 : 0.7, i ? 0.25 : 0.35);
      }
      P.spawn({ x, y: 6, z, to: { x, y: 0, z }, frame: SPRITE.beam, size: 1.1, life: 0.25, color: '#a0b0ff', alpha: 0.3 });
      G.spawn({ x, y: 0.04, z, face: 'flat', frame: GROUND.glow, size: r * 2.2, endSize: 0.8, life: 0.5, color: '#c0d0ff', glow: 1.3, rot: turn() });
      groundRing(fx, x, z, r, 0.4, '#d0dcff');
      G.spawn({ x, y: 0.03, z, face: 'flat', frame: GROUND.scorch, size: r * 1.2, life: 3, fadeOut: 0.3, color: '#000000', add: 0, alpha: 0.5, rot: turn() });
      P.spawn({ x, y: 0.4, z, frame: SPRITE.starBurst, size: 2.6, endSize: 0.5, life: 0.15, color: '#ffffff', rot: turn() });
      for (let i = 0; i < 7; i++) {
        const a = turn();
        const d = Math.random() * r;
        if (!fx.onGround(x + Math.sin(a) * d, z + Math.cos(a) * d)) continue;
        P.spawn({ x: x + Math.sin(a) * d, y: rnd(0.2, 0.8), z: z + Math.cos(a) * d, frame: crackle(), size: rnd(0.8, 1.3), life: rnd(0.15, 0.3), fadeOut: 0, color: SPARK_BLUE, glow: 1.6, rot: turn() });
      }
      fx.sparks(x, 0.3, z, '#e0e8ff', 30, 7, 0.12, 0.4, 6);
      fx.flash(pos, '#c0d0ff', 80, 0.3, 14, 3);
      return true;
    }
    case 'nova': {
      // a ring of crackling lightning running out over the ground, forks flung out along it
      const r = opts.radius ?? 4.5;
      const life = 0.4;
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU + rnd(-0.05, 0.05);
        const sp = (r - 0.8) / life;
        P.spawn({ x: x + Math.sin(a) * 0.8, y: rnd(0.5, 0.9), z: z + Math.cos(a) * 0.8, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, frame: crackle(), size: rnd(0.8, 1.1), endSize: 1.3, life, fadeIn: 0.25, fadeOut: 0.3, color: SPARK_BLUE, glow: 1.5, rot: turn(), spin: rnd(-8, 8) });
      }
      for (let i = 0; i < 6; i++) {
        const a = turn();
        const d = r * rnd(0.35, 0.6);
        strike(fx, { x: x + Math.sin(a) * 0.4, y: 0.9, z: z + Math.cos(a) * 0.4 }, { x: x + Math.sin(a) * d, y: 0.5, z: z + Math.cos(a) * d }, 0.3, rnd(0.1, 0.2), 0.5);
      }
      fx.flash(pos, '#b0c0ff', 60, 0.3, r * 2.5);
      return true;
    }
    case 'chain': {
      const t = opts.target ?? pos;
      strike(fx, { x, y: 1.1, z }, { x: t.x, y: 1.0, z: t.z }, 0.35, 0.3);
      P.spawn({ x: t.x, y: 1.0, z: t.z, frame: crackle(), size: 1.1, endSize: 1.4, life: 0.2, color: SPARK_BLUE, glow: 1.2, rot: turn() });
      fx.sparks(t.x, 1, t.z, '#e0e8ff', 8, 5, 0.1, 0.3, 2);
      fx.flash(t, '#c0d0ff', 18, 0.25, 6);
      return true;
    }
    case 'static': {
      // a blue flash over the ground and lightning crawling all over it
      const r = opts.radius ?? 4;
      P.spawn({ x, y: 0.1, z, face: 'flat', frame: SPRITE.thinRing, size: 0.5, endSize: (r * 2) / 0.5, life: 0.3, fadeOut: 0.6, color: '#c0ccff', glow: 1.3, alpha: 0.8 });
      for (let i = 0; i < 30; i++) {
        const a = turn();
        const d = Math.sqrt(Math.random()) * r;
        if (!fx.onGround(x + Math.sin(a) * d, z + Math.cos(a) * d)) continue;
        P.spawn({ x: x + Math.sin(a) * d, y: rnd(0.3, 1.2), z: z + Math.cos(a) * d, frame: crackle(), size: rnd(0.6, 1), life: rnd(0.18, 0.3), fadeOut: 0.2, color: '#c8d4ff', glow: 1.6, rot: turn() });
      }
      fx.flash(pos, '#a0b0ff', 40, 0.25, r * 2);
      return true;
    }
    case 'teleport': {
      // a violet swirl closing in on the spot, a shaft of light, sparkles rising
      G.spawn({ x, y: 0.05, z, face: 'flat', frame: GROUND.swirl, size: 2.6, endSize: 0.2, life: 0.45, fadeOut: 0.3, color: '#b0a0ff', glow: 1.4, rot: turn(), spin: 9 });
      P.spawn({ x, y: 1.6, z, face: 'up', frame: SPRITE.beam, size: 1.2, aspect: 2.8, endSize: 0.3, life: 0.4, color: '#c8b8ff', glow: 1.5 });
      for (let i = 0; i < 22; i++) {
        const a = turn();
        const d = rnd(0.1, 0.6);
        P.spawn({ x: x + Math.sin(a) * d, y: rnd(0, 1.6), z: z + Math.cos(a) * d, vy: rnd(1.5, 3.5), frame: Math.random() < 0.5 ? SPRITE.sparkle : SPRITE.glint, size: rnd(0.18, 0.32), life: rnd(0.4, 0.6), drag: 1, color: Math.random() < 0.5 ? '#d0c0ff' : '#ffffff', glow: 1.4, rot: turn() });
      }
      fx.flash(pos, '#a090ff', 40, 0.35, 7);
      return true;
    }
    case 'fireblast': {
      const r = opts.radius ?? 2.4;
      fireBlast(fx, x, z, r, false);
      fx.flash(pos, '#ff6010', 50, 0.45, r * 3);
      fx.shake(0.2);
      return true;
    }
    case 'flame': {
      // one tick of a fire wall's segment: a flame rising there, overlapping the next tick's (no light: dozens go off at once)
      // its bright foot sunk into the ground, a second tongue beside it to close the gaps
      const w = rnd(1.35, 1.7);
      fx.sheets.blaze.spawn({ x: x + rnd(-0.15, 0.15), y: w * 0.72, z: z + rnd(-0.15, 0.15), face: 'up', size: w, aspect: 2, endSize: 0.85, life: 0.8, fadeIn: 0.3, fadeOut: 0.35, frame: Math.random() * 64, fps: 40, color: '#ffa060', alpha: 0.9 });
      const v = rnd(0.8, 1.1);
      fx.sheets.flame.spawn({ x: x + rnd(-0.4, 0.4), y: v * 0.8, z: z + rnd(-0.4, 0.4), face: 'up', size: v, aspect: 2, endSize: 0.7, life: 0.6, fadeIn: 0.3, frame: Math.random() * 64, fps: 50, color: '#ff9a50', alpha: 0.8 });
      G.spawn({ x, y: 0.04, z, face: 'flat', frame: GROUND.glow, size: 1.6, life: 0.55, fadeIn: 0.3, color: '#ff5010', alpha: 0.16, rot: turn() });
      if (Math.random() < 0.4) P.spawn({ x: x + rnd(-0.3, 0.3), y: 0.6, z: z + rnd(-0.3, 0.3), vx: rnd(-0.3, 0.3), vy: rnd(1.5, 3), vz: rnd(-0.3, 0.3), frame: SPRITE.star, size: 0.14, life: 0.7, color: '#ffa040', glow: 1.6, gravity: -0.5, drag: 1 });
      return true;
    }
    case 'meteor_mark': {
      // the target ringed on the ground, and the meteor already on its way down out of the sky (it lands in a second: playerctl meteor)
      const r = opts.radius ?? 2.2;
      G.spawn({ x, y: 0.05, z, face: 'flat', frame: GROUND.ring, size: r * 2, endSize: 0.25, life: 1.0, fadeOut: 0.05, color: '#ff3a10', glow: 1.2, alpha: 0.75, rot: turn(), spin: 1.5 });
      G.spawn({ x, y: 0.04, z, face: 'flat', frame: GROUND.glow, size: r * 2, life: 1.0, fadeIn: 0.8, fadeOut: 0.05, color: '#ff4010', alpha: 0.4, rot: turn() });
      // in from the upper left of the view (the camera looks from +x, +z)
      const from = { x: x - 6, y: 7, z: z + 1 };
      const fall = 1.0;
      const v = { vx: (x - from.x) / fall, vy: (0.6 - from.y) / fall, vz: (z - from.z) / fall };
      const l = Math.hypot(v.vx, v.vy, v.vz);
      for (let k = 0; k < 10; k++) {
        const back = k * 0.42;
        const w = 1 - k / 11;
        fx.sheets.fireball.spawn({ x: from.x - (v.vx / l) * back, y: from.y - (v.vy / l) * back, z: from.z - (v.vz / l) * back, ...v, size: 1.7 * w, life: fall, fadeIn: 0.15, fadeOut: 0.02, frame: Math.random() * 64, fps: 40, alpha: k ? 0.85 * w : 1, color: k ? '#ffb080' : '#ffe0c0', rot: turn() });
      }
      return true;
    }
    case 'meteor': {
      // the meteor down: a great blast, smoke billowing up, the ground scorched and left burning
      const r = opts.radius ?? 2.2;
      fireBlast(fx, x, z, r, true);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + rnd(-0.3, 0.3);
        const d = r * rnd(0.25, 0.8);
        const w = rnd(1.3, 1.7);
        fx.sheets.blaze.spawn({ x: x + Math.sin(a) * d, y: w * 0.72, z: z + Math.cos(a) * d, face: 'up', size: w, aspect: 2, endSize: 0.5, life: rnd(1.4, 2.4), fadeIn: 0.12, fadeOut: 0.5, frame: Math.random() * 64, fps: 40, color: '#ffa060', alpha: 0.9 });
      }
      for (let i = 0; i < 6; i++) puff(fx, { x: x + rnd(-r, r) * 0.5, y: rnd(0.8, 1.6), z: z + rnd(-r, r) * 0.5, vy: rnd(0.5, 1), size: rnd(1, 1.4), endSize: 3, life: rnd(1.6, 2.4), fadeIn: 0.15, color: '#3a302a', glow: 1, add: 0, alpha: 0.55 });
      fx.flash(pos, '#ff5010', 120, 0.6, r * 5);
      fx.shake(0.5);
      return true;
    }
    case 'smite': {
      // sacred strike landing: a holy cross flaring on the one struck
      P.spawn({ x, y: 1, z, frame: SPRITE.cross, size: 1.5, endSize: 1.5, life: 0.25, color: HOLY, glow: 1.6, rot: turn() });
      P.spawn({ x, y: 1, z, frame: SPRITE.starBurst, size: 1.4, endSize: 0.4, life: 0.12, color: '#fff0c0', rot: turn() });
      fx.sparks(x, 1, z, '#ffe080', 12, 5, 0.12, 0.3, 5);
      fx.flash(pos, '#ffe0a0', 30, 0.2);
      return true;
    }
    case 'swing': {
      // a sweep through the air in front, waist high
      const d = opts.dir ?? { x: 0, z: 1 };
      const l = Math.hypot(d.x, d.z) || 1;
      const f = Math.atan2(d.x / l, d.z / l);
      P.spawn({ x: x + (d.x / l) * 0.35, y: 1.0, z: z + (d.z / l) * 0.35, face: 'flat', frame: SPRITE.sweep, size: 1.9, endSize: 1.15, life: 0.15, fadeOut: 0.8, rot: f + Math.PI, color: '#fff4e0', alpha: 0.45 });
      return true;
    }
    case 'charge': {
      // the paladin's rush: dust kicked up, a golden glint off him
      puff(fx, { x: x + rnd(-0.2, 0.2), y: 0.25, z: z + rnd(-0.2, 0.2), vy: 0.4, size: 0.5, endSize: 2.5, life: 0.6, color: '#6a6050', glow: 1.3, add: 0, alpha: 0.35 });
      P.spawn({ x: x + rnd(-0.2, 0.2), y: rnd(0.6, 1.4), z: z + rnd(-0.2, 0.2), frame: SPRITE.sparkle, size: 0.35, life: 0.3, color: '#ffd080', glow: 1.3, rot: turn() });
      return true;
    }
    case 'shield_buff': {
      // holy shield taken up: a ring of light round the paladin and a star flaring off him
      P.spawn({ x, y: 1, z, frame: SPRITE.halo, size: 2.4, endSize: 0.7, life: 0.5, color: '#fff4d0', alpha: 0.7, rot: turn() });
      P.spawn({ x, y: 1, z, frame: SPRITE.cross, size: 1.6, endSize: 1.4, life: 0.35, color: HOLY, alpha: 0.8, rot: turn() });
      groundRing(fx, x, z, 1.8, 0.6, '#fff0c0');
      for (let i = 0; i < 20; i++) {
        const a = turn();
        P.spawn({ x: x + Math.sin(a) * 0.5, y: rnd(0.3, 1.6), z: z + Math.cos(a) * 0.5, vx: Math.sin(a) * 0.6, vy: rnd(0.5, 1.5), vz: Math.cos(a) * 0.6, frame: SPRITE.sparkle, size: rnd(0.18, 0.3), life: rnd(0.5, 0.8), drag: 1, color: '#fff8e0', glow: 1.4, rot: turn() });
      }
      fx.flash(pos, '#fff8e0', 30, 0.6);
      return true;
    }
    case 'aura_switch': {
      // an aura taken up (or a shrine's blessing): its colour ringing out and rising
      const c = opts.color ?? '#ffffff';
      groundRing(fx, x, z, 2.5, 0.5, c);
      G.spawn({ x, y: 0.04, z, face: 'flat', frame: GROUND.swirl, size: 2.6, endSize: 0.4, life: 0.5, color: c, glow: 1.2, rot: turn(), spin: -6 });
      for (let i = 0; i < 18; i++) {
        const a = turn();
        const d = rnd(0.2, 1.2);
        P.spawn({ x: x + Math.sin(a) * d, y: rnd(0.1, 0.5), z: z + Math.cos(a) * d, vy: rnd(1, 2.5), frame: SPRITE.sparkle, size: rnd(0.18, 0.3), life: rnd(0.5, 0.8), drag: 0.8, color: c, glow: 1.4, rot: turn() });
      }
      return true;
    }
    case 'holyburst': {
      const c = opts.color ?? '#fff0c0';
      P.spawn({ x, y: 0.8, z, frame: SPRITE.sparkle, size: 1.1, endSize: 0.5, life: 0.22, color: c, glow: 1.4, rot: turn() });
      fx.sparks(x, 0.8, z, c, 12, 3, 0.16, 0.4, 0);
      return true;
    }
  }
  return false;
}

/** what's added off the pictures to a hit of `elem` on something at x, z */
export function hit(fx: Effects, x: number, z: number, heavy: boolean, elem: Elem) {
  const P = fx.sheets.sprites;
  const y = 0.9;
  switch (elem) {
    case 'fire':
      flareUp(fx, x, z, heavy ? 1.1 : 0.85);
      break;
    case 'cold':
      P.spawn({ x, y, z, frame: SPRITE.shine, size: heavy ? 0.9 : 0.65, endSize: 0.5, life: 0.18, color: ICE, glow: 1.1, rot: turn() });
      mist(fx, x, y, z, 0.4, { endSize: 2.2, life: 0.55, alpha: 0.25, glow: 1.4 });
      break;
    case 'light':
      P.spawn({ x, y, z, frame: crackle(), size: heavy ? 1.1 : 0.8, life: 0.15, fadeOut: 0.3, color: SPARK_BLUE, glow: 1.6, rot: turn() });
      break;
    case 'poison':
      puff(fx, { x, y, z, size: 0.45, endSize: 2.2, life: 0.6, color: '#70c040', alpha: 0.35, add: 0.4 });
      break;
    case 'magic':
      P.spawn({ x, y, z, frame: SPRITE.sparkle, size: heavy ? 0.9 : 0.65, endSize: 0.5, life: 0.18, color: '#c8b8ff', alpha: 0.6, rot: turn() });
      break;
  }
}

/** what's added off the pictures to a death by `elem` */
export function death(fx: Effects, x: number, z: number, big: boolean, elem: Elem) {
  if (elem === 'fire') {
    flareUp(fx, x, z, big ? 1.6 : 1.25);
    for (let i = 0; i < 2; i++) puff(fx, { x: x + rnd(-0.3, 0.3), y: 1, z: z + rnd(-0.3, 0.3), vy: 0.7, size: 0.8, endSize: 2.5, life: 1.4, fadeIn: 0.2, color: '#2a2420', glow: 1, add: 0, alpha: 0.5 });
  } else if (elem === 'cold') {
    const P = fx.sheets.sprites;
    P.spawn({ x, y: 0.8, z, frame: SPRITE.debris, size: 0.6, endSize: 3, life: 0.4, color: '#c8ecff', add: 0.7, alpha: 0.9, rot: turn() });
    P.spawn({ x, y: 0.8, z, frame: SPRITE.shine, size: 1.3, endSize: 0.5, life: 0.22, color: ICE, glow: 1.1, rot: turn() });
    mist(fx, x, 0.7, z, 0.7, { endSize: 2.8, life: 0.9 });
  }
}

/** the mote each aura sends up, and how it goes round (src/data/skills.ts) */
const AURA_MOTE: Record<string, number> = {
  might: SPRITE.star,
  concentration: SPRITE.glint,
  conviction: SPRITE.halo,
  prayer: SPRITE.cross,
  resist_all: SPRITE.shine,
  vigor: SPRITE.sparkle,
  meditation: SPRITE.orb,
};

/** an aura about the paladin as long as it's on, at x, z (`r` its reach, `t` the time) */
export function aura(fx: Effects, id: string, color: string, x: number, z: number, r: number, t: number, dt: number) {
  const G = fx.sheets.ground;
  const P = fx.sheets.sprites;
  if (id === 'holy_fire') {
    // a glow and a swirl on the ground, flames licking up round his feet
    G.draw({ x, y: 0.035, z, face: 'flat', frame: GROUND.glow, size: Math.min(r, 1.6) * 2, rot: t * 0.25, color: '#ff5a10', alpha: 0.3 + Math.sin(t * 2) * 0.05 });
    G.draw({ x, y: 0.04, z, face: 'flat', frame: GROUND.swirl, size: 2.3, rot: -t * 1.4, color: '#ff8030', alpha: 0.45 });
    G.draw({ x, y: 0.045, z, face: 'flat', frame: GROUND.swirl, size: 1.6, rot: t * 2.1 + 2, color: '#ffb050', alpha: 0.35 });
    const a = turn();
    const d = rnd(0.5, 1);
    if (Math.random() < dt * 14 && fx.onGround(x + Math.sin(a) * d, z + Math.cos(a) * d)) {
      const w = rnd(0.35, 0.6);
      fx.sheets.flame.spawn({ x: x + Math.sin(a) * d, y: w, z: z + Math.cos(a) * d, face: 'up', size: w, aspect: 2, endSize: 0.6, life: rnd(0.6, 0.9), fadeIn: 0.35, frame: Math.random() * 64, fps: 50, color: '#ffa070' });
    }
    return;
  }
  if (id === 'holy_freeze') {
    // frost on the ground, mist curling low about his feet, ice glinting in the air
    G.draw({ x, y: 0.035, z, face: 'flat', frame: GROUND.glow2, size: Math.min(r, 1.6) * 2, rot: t * 0.2, color: '#3a90ff', alpha: 0.3 + Math.sin(t * 1.5) * 0.04 });
    G.draw({ x, y: 0.04, z, face: 'flat', frame: GROUND.swirl2, size: 2.4, rot: -t * 0.6, color: COLD, alpha: 0.4 });
    const a = turn();
    const d = rnd(0.4, 1.3);
    if (Math.random() < dt * 9 && fx.onGround(x + Math.sin(a) * d, z + Math.cos(a) * d)) {
      mist(fx, x + Math.sin(a) * d, 0.25, z + Math.cos(a) * d, rnd(0.5, 0.8), { vx: Math.sin(a) * 0.3, vy: 0.1, vz: Math.cos(a) * 0.3, endSize: 2, life: 1.4, fadeIn: 0.35, alpha: 0.24 });
    }
    if (Math.random() < dt * 10) {
      const a = turn();
      const d = rnd(0.3, 1.4);
      P.spawn({ x: x + Math.sin(a) * d, y: rnd(0.2, 1.4), z: z + Math.cos(a) * d, vy: 0.3, frame: SPRITE.glint, size: rnd(0.15, 0.25), life: 0.6, fadeIn: 0.3, color: ICE, glow: 1.5, rot: turn() });
    }
    return;
  }
  // the rest: a glow and two swirls in its colour, motes of it rising
  G.draw({ x, y: 0.035, z, face: 'flat', frame: GROUND.glow, size: Math.min(r, 1.6) * 2, rot: t * 0.25, color, alpha: 0.26 + Math.sin(t * 2) * 0.04 });
  G.draw({ x, y: 0.04, z, face: 'flat', frame: GROUND.swirl, size: 2.3, rot: -t * 1.1, color, alpha: 0.38 });
  G.draw({ x, y: 0.045, z, face: 'flat', frame: GROUND.swirl2, size: 1.6, rot: t * 1.7 + 2, color, alpha: 0.3 });
  const a = turn();
  const d = rnd(0.2, 1.2);
  if (Math.random() < dt * 12 && fx.onGround(x + Math.sin(a) * d, z + Math.cos(a) * d)) {
    P.spawn({ x: x + Math.sin(a) * d, y: 0.15, z: z + Math.cos(a) * d, vy: rnd(1, 1.6), frame: AURA_MOTE[id] ?? SPRITE.sparkle, size: rnd(0.16, 0.26), life: 0.9, fadeIn: 0.2, color, glow: 1.4, rot: turn() });
  }
}

/** holy shield up: a faint ring of light about him, sparkles coming off it */
export function shield(fx: Effects, x: number, z: number, t: number, dt: number) {
  const P = fx.sheets.sprites;
  P.draw({ x, y: 1.0, z, frame: SPRITE.halo, size: 1.9, rot: t * 0.5, color: '#fff0c0', alpha: 0.32 + Math.sin(t * 3) * 0.05 });
  if (Math.random() < dt * 6) {
    const a = turn();
    P.spawn({ x: x + Math.sin(a) * 0.5, y: rnd(0.5, 1.5), z: z + Math.cos(a) * 0.5, vy: 0.5, frame: SPRITE.sparkle, size: rnd(0.15, 0.22), life: 0.6, fadeIn: 0.3, color: '#fff8e0', glow: 1.3, rot: turn() });
  }
}

/** a blessed hammer spinning out: a blue swish round it and sparkles shed */
export function hammer(fx: Effects, x: number, z: number, t: number, dt: number) {
  const P = fx.sheets.sprites;
  P.draw({ x, y: 0.9, z, frame: SPRITE.arc, size: 1.5, rot: -t * 14, color: '#7090ff', glow: 1.3, alpha: 0.85 });
  P.draw({ x, y: 0.9, z, frame: SPRITE.dot, size: 1.0, color: '#4a6aff', alpha: 0.35 });
  if (Math.random() < dt * 30) P.spawn({ x: x + rnd(-0.2, 0.2), y: 0.9 + rnd(-0.2, 0.2), z: z + rnd(-0.2, 0.2), vy: 0.3, frame: SPRITE.sparkle, size: rnd(0.15, 0.28), life: 0.4, color: '#a8b8ff', glow: 1.5, rot: turn() });
}

/** a monster enchanted with fire, cold or lightning: what comes off it now and then */
export function enchanted(fx: Effects, kind: 'fire' | 'cold' | 'light', x: number, z: number) {
  const ox = x + rnd(-0.3, 0.3);
  const oz = z + rnd(-0.3, 0.3);
  if (kind === 'fire') {
    const w = rnd(0.25, 0.4);
    fx.sheets.flame.spawn({ x: ox, y: rnd(0.4, 1.1), z: oz, vy: 0.5, face: 'up', size: w, aspect: 2, endSize: 0.5, life: 0.5, fadeIn: 0.3, frame: Math.random() * 64, fps: 50, color: '#ffa070' });
  } else if (kind === 'cold') {
    mist(fx, ox, rnd(0.3, 1.2), oz, 0.35, { vy: 0.2, endSize: 2, life: 0.8, fadeIn: 0.3, alpha: 0.25 });
  } else {
    fx.sheets.sprites.spawn({ x: ox, y: rnd(0.3, 1.4), z: oz, frame: crackle(), size: rnd(0.4, 0.6), life: 0.12, fadeOut: 0, color: SPARK_BLUE, glow: 1.6, rot: turn() });
  }
}
