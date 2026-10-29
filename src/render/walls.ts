import * as THREE from 'three';
import { THEMES, type Theme } from '../world/levelgen';
import type { WallKind } from './arealooks';
import { tileTexture } from './textures';

/** a wall's height as a share of WALL_H, by how it's built: at least the first, up to the first and the second */
export const WALL_HEIGHT: Record<WallKind, [number, number]> = { palisade: [0.85, 0.25], ruins: [0.2, 0.4], wall: [0.96, 0.08], cliff: [1.45, 0.18] };

export interface OccUniforms {
  uPlayer: { value: THREE.Vector3 };
  uCamDir: { value: THREE.Vector2 };
}

export function applyOcclusionFade(mat: THREE.Material, u: OccUniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = u.uPlayer;
    shader.uniforms.uCamDir = u.uCamDir;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOccWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 occW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          occW = instanceMatrix * occW;
        #endif
        vOccWorld = (modelMatrix * occW).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vOccWorld;
        uniform vec3 uPlayer;
        uniform vec2 uCamDir;
        float occBayer(vec2 p) {
          int x = int(mod(p.x, 4.0));
          int y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          return (m[i] + 0.5) / 16.0;
        }`,
      )
      .replace(
        'void main() {',
        `void main() {
        {
          vec2 rel = vOccWorld.xz - uPlayer.xz;
          float t = dot(rel, uCamDir);
          float pd = length(rel - uCamDir * t);
          float fade = (1.0 - smoothstep(1.3, 2.8, pd)) * smoothstep(-0.4, 0.5, t) * (1.0 - smoothstep(5.0, 7.0, t));
          fade *= smoothstep(0.15, 0.7, vOccWorld.y);
          if (fade * 0.85 > occBayer(gl_FragCoord.xy)) discard;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'occ-fade';
}

/**
 * Map the texture by world position so one painted image spans several tiles: floors across x/z
 * (`size` metres per image), walls along each face and up from the floor.
 */
export function applyWorldUv(mat: THREE.Material, mode: 'floor' | 'wall', size: number) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (shader, r) => {
    prev.call(mat, shader, r);
    const uv =
      mode === 'floor'
        ? 'vMapUv = wuvP.xz;'
        : `vec3 wuvW = normalize((modelMatrix * wuvN).xyz);
          vMapUv = vec2(abs(wuvW.x) > 0.5 ? -wuvP.z * sign(wuvW.x) : wuvP.x * sign(wuvW.z), wuvP.y);`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      {
        vec4 wuvP = vec4(position, 1.0);
        vec4 wuvN = vec4(normal, 0.0);
        #ifdef USE_INSTANCING
          wuvP = instanceMatrix * wuvP;
          wuvN = instanceMatrix * wuvN;
        #endif
        wuvP = modelMatrix * wuvP;
        ${uv}
        vMapUv /= ${size.toFixed(2)};
      }`,
    );
  };
  mat.customProgramCacheKey = () => `${prevKey}|world-uv-${mode}`;
}

/**
 * The walls' materials on a level of `theme`, as the area each stands in builds them (Renderer.buildLevel),
 * each kind's made the first time it's asked for: a box's faces, side, side, top, top, side, side
 */
export function wallMaterials(theme: Theme, occ: OccUniforms): (kind: WallKind) => THREE.Material[] {
  const wallMats = new Map<WallKind, THREE.Material[]>();
  return (kind: WallKind): THREE.Material[] => {
    const had = wallMats.get(kind);
    if (had) return had;
    // a cliff is the caves' rock for now, its look its own to come (M2a's A line)
    const t = kind === 'palisade' ? THEMES.town : kind === 'cliff' ? THEMES.cave : theme;
    const side = new THREE.MeshStandardMaterial({ map: tileTexture(kind === 'ruins' ? 'crypt_wall' : `${t.key}_wall`), roughness: 0.92 });
    const top =
      kind === 'ruins' || kind === 'cliff'
        ? new THREE.MeshStandardMaterial({ map: tileTexture(kind === 'ruins' ? 'crypt_wall' : `${t.key}_wall`), roughness: 0.95 })
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(t.wall).lerp(new THREE.Color(t.wallDark), 0.35), roughness: 1 });
    if (kind === 'ruins' || kind === 'cliff') applyWorldUv(top, 'floor', 2);
    applyOcclusionFade(side, occ);
    applyWorldUv(side, 'wall', 2);
    applyOcclusionFade(top, occ);
    const mats = [side, side, top, top, side, side];
    wallMats.set(kind, mats);
    return mats;
  };
}
