import * as THREE from 'three';
import { sharedNoise } from './atmosphere';
import { tileTexture } from './textures';

/**
 * Each outdoor theme's four surfaces for its ground mix (Layout.ground), in the mix's byte order:
 * grass, earth, track, stone. [texture, metres per image]
 */
const LAYERS: Record<string, [string, number][]> = {
  wild: [['wild_grass', 4], ['wild_dirt', 4.5], ['wild_road', 3.5], ['crypt_floor', 4]],
  // the camp's earth is its own trampled ground
  town: [['wild_grass', 4], ['town_floor', 4], ['wild_road', 3.5], ['crypt_floor', 4]],
};

/** how far the ground runs on past the map's edge, under the outer woods */
export const GROUND_MARGIN = 30;

/**
 * The ground under the sky, one plane for the whole map: four tiling textures blended by the
 * level's ground mix. The mix is per tile, so its edges are pushed about by noise and each surface
 * comes through where its own texture stands proud (grass tips over earth, stones out of the
 * track), which hides the tile grid. Past the map's edge it fades into `edge` (the sky's colour).
 */
export function makeGround(w: number, h: number, mix: Uint8Array, theme: string): { mesh: THREE.Mesh; edge: THREE.Color; dispose(): void } {
  const layers = LAYERS[theme] ?? LAYERS.wild;
  const splat = new THREE.DataTexture(mix, w, h);
  splat.magFilter = THREE.LinearFilter;
  splat.minFilter = THREE.LinearFilter;
  splat.needsUpdate = true;
  const edge = new THREE.Color('#000000');
  const uniforms = {
    uSplat: { value: splat },
    uNoise: { value: sharedNoise() },
    uLayers: { value: layers.map(([name]) => tileTexture(name)) },
    uScale: { value: layers.map(([, m]) => 1 / m) },
    uSize: { value: new THREE.Vector2(w, h) },
    uEdge: { value: edge },
  };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroundPos;
        uniform sampler2D uSplat;
        uniform sampler2D uNoise;
        uniform sampler2D uLayers[4];
        uniform float uScale[4];
        uniform vec2 uSize;
        uniform vec3 uEdge;
        float groundLum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 wp = vGroundPos.xz;
          // the mix, its tile edges pushed about by two lookups of the noise
          vec2 wob = vec2(texture2D(uNoise, wp * 0.061).g, texture2D(uNoise, wp * 0.061 + 0.5).g) - 0.5;
          vec4 w = texture2D(uSplat, (wp + wob * 2.2) / uSize);
          vec3 c0 = texture2D(uLayers[0], wp * uScale[0]).rgb;
          vec3 c1 = texture2D(uLayers[1], wp * uScale[1]).rgb;
          // the track is worn paler than the ground either side of it
          vec3 c2 = texture2D(uLayers[2], wp * uScale[2]).rgb * 1.3;
          vec3 c3 = texture2D(uLayers[3], wp * uScale[3]).rgb;
          // height blend: a surface's bright bits come through first, so the edges between them are
          // ragged clumps rather than smooth fades
          vec4 a = w + vec4(groundLum(c0), groundLum(c1), groundLum(c2), groundLum(c3)) * 0.6 * step(0.02, w);
          float top = max(max(a.x, a.y), max(a.z, a.w)) - 0.18;
          vec4 b = max(a - top, 0.0);
          vec3 col = (c0 * b.x + c1 * b.y + c2 * b.z + c3 * b.w) / max(1e-4, b.x + b.y + b.z + b.w);
          // broad light and dark patches, so the repeat of the textures doesn't show from afar
          float big = texture2D(uNoise, wp * 0.013).g;
          col *= 0.82 + big * 0.36;
          diffuseColor.rgb *= col;
        }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        {
          vec2 out2 = max(-vGroundPos.xz, vGroundPos.xz - uSize);
          float past = max(out2.x, out2.y);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uEdge, smoothstep(${(GROUND_MARGIN * 0.35).toFixed(1)}, ${(GROUND_MARGIN * 0.95).toFixed(1)}, past));
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'ground-splat';
  const size = new THREE.Vector2(w + GROUND_MARGIN * 2, h + GROUND_MARGIN * 2);
  const geo = new THREE.PlaneGeometry(size.x, size.y).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(w / 2, 0, h / 2);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    edge,
    dispose() {
      splat.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
