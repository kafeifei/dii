import * as THREE from 'three';
import type { AreaDef } from '../world/areas';
import type { AreaShare } from '../world/seams';
import { MIST, THEME_MOTES, type MistLook, type MoteKind } from './atmosphere';
import type { Grade } from './post';

/**
 * How each area looks, so that walking out of one into the next on the overworld changes the
 * ground underfoot, the mist, the light's grade and the specks in the air, as Diablo II's areas
 * each wear their own variant of the act's tiles (levels.json SubTheme: Blood Moor 0, Cold Plains
 * 1, read by D2Common DrlgTileSub.cpp as lvlsub.json Prob[nSubTheme]). An area without a look of
 * its own (a dungeon's floor, the Den of Evil) looks like its map's theme, as every map did before.
 * Where two areas meet their looks blend (src/world/seams.ts): the ground's over a few tiles, the
 * rest by how far the hero stands from the seam. Day and night stay the sky's (src/render/sky.ts):
 * an area's grade is a shift of the sky's, so a Cold Plains night is a colder night.
 */

/** the ground's four surfaces for its mix (Layout.ground), in the mix's byte order: grass, earth, track, stone */
export interface GroundLook {
  /** [texture, metres per image] */
  layers: [string, number][];
  /** how much of the textures' colour is taken out (0 none, 1 grey), before `tint` */
  desat?: number;
  /** multiplied into all four, and `gain` times brighter */
  tint?: string;
  gain?: number;
}

const WILD_LAYERS: [string, number][] = [['wild_grass', 4], ['wild_dirt', 4.5], ['wild_road', 3.5], ['crypt_floor', 4]];

export const GROUND_LOOKS: Record<string, GroundLook> = {
  wild: { layers: WILD_LAYERS },
  // the camp's earth is its own trampled ground
  town: { layers: [['wild_grass', 4], ['town_floor', 4], ['wild_road', 3.5], ['crypt_floor', 4]] },
  // Cold Plains: the moor's ground gone pale and grey under the frost
  frost: { layers: WILD_LAYERS, desat: 0.3, tint: '#e4ecf0', gain: 1.12 },
};

/**
 * A shift of the sky's colour grade (src/render/post.ts Grade): its darks' and lights' hues moved
 * `tone` of the way to these, its saturation, gamma and bloom times these, `vignette` added
 */
export interface GradeShift {
  shadow: THREE.ColorRepresentation;
  light: THREE.ColorRepresentation;
  tone: number;
  saturation: number;
  gamma: number;
  vignette: number;
  bloom: number;
}

/** the sky's grade as it is */
export const NO_SHIFT: GradeShift = { shadow: '#ffffff', light: '#ffffff', tone: 0, saturation: 1, gamma: 1, vignette: 0, bloom: 1 };

/**
 * how a wall tile is built: the camp's tall palisade, the wilderness's ruins broken off low, a
 * dungeon's walls, a cliff (Layout.cliffs: Stony Field's north and west edges, docs/M2A.md 地图)
 */
export type WallKind = 'palisade' | 'ruins' | 'wall' | 'cliff';

export interface AreaLook {
  /** GROUND_LOOKS key */
  ground: string;
  walls: WallKind;
  /** the ground mist, under the sky thinned by day (SkyLook.mist) */
  mist: MistLook;
  /** under the sky; below ground a map's grade is its theme's */
  grade: GradeShift;
  /** specks in the air and how many of each */
  motes: [MoteKind, number][];
}

/** the areas with a look of their own, by AreaDef.key */
const AREA_LOOKS: Record<string, AreaLook> = {
  // the camp: warm firelight, a little lighter at the edges, fireflies at night
  camp: {
    ground: 'town',
    walls: 'palisade',
    mist: { color: '#7a86a0', opacity: 0.18 },
    grade: { shadow: '#3a3048', light: '#ffc488', tone: 0.3, saturation: 1.04, gamma: 0.99, vignette: -0.06, bloom: 1.1 },
    motes: [['fireflies', 1], ['seeds', 0.4]],
  },
  // Blood Moor: browner, murkier, the darks gone ruddy
  wild: {
    ground: 'wild',
    walls: 'ruins',
    mist: { color: '#867e88', opacity: 0.26 },
    grade: { shadow: '#40262a', light: '#ffd4a4', tone: 0.22, saturation: 0.95, gamma: 1.01, vignette: 0, bloom: 1 },
    motes: [['fireflies', 1], ['seeds', 1]],
  },
  // Cold Plains: a cold blue light, washed out, a thicker paler mist and frost on the wind
  coldplains: {
    ground: 'frost',
    walls: 'ruins',
    mist: { color: '#b4c4dc', opacity: 0.32 },
    grade: { shadow: '#1a2c58', light: '#e0eeff', tone: 0.4, saturation: 0.86, gamma: 1.02, vignette: 0.03, bloom: 0.9 },
    motes: [['frost', 1], ['fireflies', 0.25]],
  },
};

/** the look of an area that has none of its own, on a map of theme `theme` */
function themeLook(theme: string): AreaLook {
  return {
    ground: theme,
    walls: theme === 'town' ? 'palisade' : theme === 'wild' ? 'ruins' : 'wall',
    mist: MIST[theme] ?? MIST.crypt,
    grade: NO_SHIFT,
    motes: THEME_MOTES[theme] ? [[THEME_MOTES[theme], 1]] : [],
  };
}

/** how area `area` looks on a map of theme `theme` */
export function lookOf(area: AreaDef, theme: string): AreaLook {
  return AREA_LOOKS[area.key] ?? themeLook(theme);
}

/** whether an area has a look of its own (the tests ask) */
export function hasOwnLook(area: AreaDef): boolean {
  return area.key in AREA_LOOKS;
}

/** the air about the hero: the looks of the areas round them, blended by their shares */
export interface Atmos {
  mist: { color: THREE.Color; opacity: number };
  grade: GradeShift & { shadow: THREE.Color; light: THREE.Color };
  /** each kind of speck and its rate, summed over the areas */
  motes: [MoteKind, number][];
}

export function newAtmos(): Atmos {
  return {
    mist: { color: new THREE.Color(), opacity: 0 },
    grade: { ...NO_SHIFT, shadow: new THREE.Color(1, 1, 1), light: new THREE.Color(1, 1, 1) },
    motes: [],
  };
}

const ca = new THREE.Color();

/**
 * The looks of the areas `shares` names (src/world/seams.ts areaShares), blended into `out`: the
 * mist's colour and thickness and the grade's numbers by share, its hues by share and tone (so a
 * half-and-half blend is half of each shift), the specks' rates summed by share.
 */
export function blendAtmos(shares: readonly AreaShare[], look: (area: number) => AreaLook, out: Atmos): Atmos {
  const m = out.mist;
  const g = out.grade;
  m.color.setRGB(0, 0, 0);
  m.opacity = 0;
  g.shadow.setRGB(0, 0, 0);
  g.light.setRGB(0, 0, 0);
  g.tone = g.saturation = g.gamma = g.vignette = g.bloom = 0;
  out.motes.length = 0;
  for (const { area, w } of shares) {
    const L = look(area);
    m.color.add(ca.set(L.mist.color).multiplyScalar(w));
    m.opacity += L.mist.opacity * w;
    const s = L.grade;
    const t = s.tone * w;
    g.shadow.add(ca.set(s.shadow).multiplyScalar(t));
    g.light.add(ca.set(s.light).multiplyScalar(t));
    g.tone += t;
    g.saturation += s.saturation * w;
    g.gamma += s.gamma * w;
    g.vignette += s.vignette * w;
    g.bloom += s.bloom * w;
    for (const [kind, rate] of L.motes) {
      const had = out.motes.find((x) => x[0] === kind);
      if (had) had[1] += rate * w;
      else out.motes.push([kind, rate * w]);
    }
  }
  // the hues are tone-weighted means: back to colours
  if (g.tone > 1e-6) {
    g.shadow.multiplyScalar(1 / g.tone);
    g.light.multiplyScalar(1 / g.tone);
  } else {
    g.shadow.setRGB(1, 1, 1);
    g.light.setRGB(1, 1, 1);
  }
  return out;
}

const cb = new THREE.Color();
const hex = (base: string, to: THREE.ColorRepresentation, k: number) => `#${ca.set(base).lerp(cb.set(to), k).getHexString()}`;

/** grade `base` (the sky's) shifted by `s`, into `out` */
export function shiftGrade(base: Grade, s: GradeShift, out: Grade): Grade {
  out.shadow = hex(base.shadow, s.shadow, s.tone);
  out.light = hex(base.light, s.light, s.tone);
  out.split = base.split;
  out.saturation = base.saturation * s.saturation;
  out.gamma = base.gamma * s.gamma;
  out.vignette = Math.max(0, base.vignette + s.vignette);
  out.grain = base.grain;
  out.bloom = base.bloom * s.bloom;
  return out;
}
