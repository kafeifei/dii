import * as THREE from 'three';
import { GRADES, type Grade } from './post';

/**
 * Day and night under the sky (the camp and the wilderness), as in Diablo II's outdoors. The time of
 * day runs 0 → 1 from midnight: night until 0.2, dawn at 0.25, day from 0.32 to 0.68, dusk at 0.75,
 * night again from 0.8. The sun comes up on the left of the screen, stands low over the camera's left
 * shoulder at noon (so the faces we look at are lit, not against the light) and goes down on the
 * right; its shadows swing round from right to left. The moon stands where the camp's always was.
 */

export interface SkyLook {
  /** 0 by night, 1 by day */
  day: number;
  /** from the ground toward the sun, or the moon by night */
  dir: THREE.Vector3;
  sun: THREE.Color;
  sunIntensity: number;
  sky: THREE.Color;
  bounce: THREE.Color;
  skyIntensity: number;
  /** the clear colour, and the haze the ground fades into past the map's edge */
  bg: THREE.Color;
  grade: Grade;
  /** how much the hero's own light, the lanterns and the fires count: most by night */
  lamps: number;
  /** the ground mist's thickness, as a share of the theme's */
  mist: number;
}

interface Key {
  t: number;
  day: number;
  sun: string;
  sunI: number;
  sky: string;
  bounce: string;
  skyI: number;
  bg: string;
  grade: Grade;
  lamps: number;
  mist: number;
}

const NIGHT: Omit<Key, 't'> = {
  day: 0, sun: '#8aa0d8', sunI: 0.9, sky: '#6f7aa8', bounce: '#0a0606', skyI: 1.54, bg: '#07080c', grade: GRADES.town, lamps: 1, mist: 1,
};
const DAWN: Omit<Key, 't'> = {
  day: 0.55, sun: '#ffc090', sunI: 1.9, sky: '#a89aa4', bounce: '#2e2420', skyI: 1.65, bg: '#4a4248',
  grade: { shadow: '#3a3448', light: '#ffd0a0', split: 0.3, saturation: 0.9, gamma: 1.01, vignette: 0.45, grain: 0.03, bloom: 0.25 },
  lamps: 0.55, mist: 0.6,
};
const DAY: Omit<Key, 't'> = {
  day: 1, sun: '#fff0dc', sunI: 2.3, sky: '#b4bec8', bounce: '#4a3e2e', skyI: 1.75, bg: '#5c6268',
  grade: { shadow: '#3a4252', light: '#fff2dc', split: 0.2, saturation: 0.86, gamma: 1.0, vignette: 0.4, grain: 0.025, bloom: 0.12 },
  lamps: 0.3, mist: 0.2,
};
const DUSK: Omit<Key, 't'> = {
  day: 0.5, sun: '#ffa060', sunI: 2.1, sky: '#a08070', bounce: '#3a2618', skyI: 1.6, bg: '#4a3426',
  grade: { shadow: '#3a2a3e', light: '#ffb878', split: 0.35, saturation: 0.95, gamma: 1.02, vignette: 0.5, grain: 0.03, bloom: 0.3 },
  lamps: 0.7, mist: 0.5,
};
const KEYS: Key[] = [
  { t: 0, ...NIGHT },
  { t: 0.2, ...NIGHT },
  { t: 0.25, ...DAWN },
  { t: 0.32, ...DAY },
  { t: 0.68, ...DAY },
  { t: 0.75, ...DUSK },
  { t: 0.8, ...NIGHT },
  { t: 1, ...NIGHT },
];
/** the sun is up between these; the light swaps between it and the moon there, at nothing */
const SUNRISE = 0.21;
const SUNSET = 0.79;
const MOON_DIR = new THREE.Vector3(-8, 20, 4).normalize();
const DEG = Math.PI / 180;

const look: SkyLook = {
  day: 0, dir: new THREE.Vector3(), sun: new THREE.Color(), sunIntensity: 0, sky: new THREE.Color(), bounce: new THREE.Color(),
  skyIntensity: 0, bg: new THREE.Color(), grade: { ...GRADES.town }, lamps: 1, mist: 1,
};
const ca = new THREE.Color();
const cb = new THREE.Color();
const mixHex = (a: string, b: string, k: number) => ca.set(a).lerp(cb.set(b), k);

/** the look at time of day `t` (one shared object, overwritten by the next call) */
export function skyAt(t: number): SkyLook {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const k = b.t > a.t ? THREE.MathUtils.smoothstep(t, a.t, b.t) : 0;
  const num = (x: number, y: number) => x + (y - x) * k;
  look.day = num(a.day, b.day);
  look.sun.copy(mixHex(a.sun, b.sun, k));
  look.sky.copy(mixHex(a.sky, b.sky, k));
  look.bounce.copy(mixHex(a.bounce, b.bounce, k));
  look.bg.copy(mixHex(a.bg, b.bg, k));
  look.skyIntensity = num(a.skyI, b.skyI);
  look.lamps = num(a.lamps, b.lamps);
  look.mist = num(a.mist, b.mist);
  const g = look.grade;
  g.shadow = `#${mixHex(a.grade.shadow, b.grade.shadow, k).getHexString()}`;
  g.light = `#${mixHex(a.grade.light, b.grade.light, k).getHexString()}`;
  g.split = num(a.grade.split, b.grade.split);
  g.saturation = num(a.grade.saturation, b.grade.saturation);
  g.gamma = num(a.grade.gamma, b.grade.gamma);
  g.vignette = num(a.grade.vignette, b.grade.vignette);
  g.grain = num(a.grade.grain, b.grade.grain);
  g.bloom = num(a.grade.bloom, b.grade.bloom);
  // the shadow-casting light: the sun across the day, the moon by night, faded out where they swap
  const swap = Math.min(1, Math.abs(t - SUNRISE) / 0.025, Math.abs(t - SUNSET) / 0.025);
  look.sunIntensity = num(a.sunI, b.sunI) * swap;
  if (t > SUNRISE && t < SUNSET) {
    const s = (t - SUNRISE) / (SUNSET - SUNRISE);
    const az = (160 - s * 140) * DEG;
    const el = (24 + Math.sin(s * Math.PI) * 36) * DEG;
    look.dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
  } else look.dir.copy(MOON_DIR);
  return look;
}
