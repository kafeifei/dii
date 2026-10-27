import * as THREE from 'three';
import type { GroundLook } from './arealooks';
import { sharedNoise } from './atmosphere';
import { tileTexture } from './textures';

/** how far the ground runs on past the map's edge, under the outer woods */
export const GROUND_MARGIN = 30;

/**
 * The ground under the sky, one plane for the whole map: four tiling surfaces blended by the
 * level's ground mix. The mix is per tile, so its edges are pushed about by noise and each surface
 * comes through where its own texture stands proud (grass tips over earth, stones out of the
 * track), which hides the tile grid. Past the map's edge it fades into `edge` (the sky's colour).
 *
 * A map of several areas wears a look for each (src/render/arealooks.ts): `looks`, with `lookMix`
 * each tile's share of them, four to a texel (src/world/seams.ts lookMix). Where two meet, the
 * shares are wobbled by noise and thresholded against more of it, so the next area's ground comes
 * in as ragged patches over a few tiles rather than a straight fade. Each texture is read once
 * however many looks use it.
 */
export function makeGround(w: number, h: number, mix: Uint8Array, looks: GroundLook[], lookMix: Uint8Array[] = []): { mesh: THREE.Mesh; edge: THREE.Color; dispose(): void } {
  const splat = dataTexture(mix, w, h);
  const blends = looks.length > 1 ? lookMix.map((m) => dataTexture(m, w, h)) : [];
  const nl = blends.length ? looks.length : 1;
  // the textures the looks read, each once: [name, metres per image]
  const texs: [string, number][] = [];
  const texOf = looks.slice(0, nl).map((l) =>
    l.layers.map(([name, m]) => {
      let i = texs.findIndex((t) => t[0] === name && t[1] === m);
      if (i < 0) i = texs.push([name, m]) - 1;
      return i;
    }),
  );
  const edge = new THREE.Color('#000000');
  const uniforms = {
    uSplat: { value: splat },
    uNoise: { value: sharedNoise() },
    uTex: { value: texs.map(([name]) => tileTexture(name)) },
    uScale: { value: texs.map(([, m]) => 1 / m) },
    uLook: { value: blends },
    uTint: { value: looks.slice(0, nl).map((l) => new THREE.Color(l.tint ?? '#ffffff').multiplyScalar(l.gain ?? 1)) },
    uDesat: { value: looks.slice(0, nl).map((l) => l.desat ?? 0) },
    uSize: { value: new THREE.Vector2(w, h) },
    uEdge: { value: edge },
  };
  const lw = (l: number) => `lw${l >> 2}.${'xyzw'[l & 3]}`;
  // each surface: every look's own texture for it, by the look's share
  const surface = (k: number) =>
    Array.from({ length: nl }, (_, l) => `${nl > 1 ? `${lw(l)} * ` : ''}shade(t${texOf[l][k]}, uDesat[${l}], uTint[${l}])`).join(' + ');
  const glsl = {
    decl: `uniform sampler2D uTex[${texs.length}];
        uniform float uScale[${texs.length}];
        uniform vec3 uTint[${nl}];
        uniform float uDesat[${nl}];
        ${blends.length ? `uniform sampler2D uLook[${blends.length}];` : ''}`,
    reads: texs.map((_, i) => `vec3 t${i} = texture2D(uTex[${i}], wp * uScale[${i}]).rgb;`).join('\n          '),
    // the looks' shares: wobbled further than the mix's, then each pushed toward 0 or 1 against a
    // finer noise where it is about half, so the seam frays into patches (a share of 0 stays 0 and
    // of 1 stays 1: the noise is kept between 0.3 and 0.7); and back to summing to one
    looks: blends.length
      ? `${blends.map((_, g) => `vec4 lw${g} = texture2D(uLook[${g}], (wp + wob * 7.0) / uSize);`).join('\n          ')}
          {
            float fray = 0.3 + 0.4 * texture2D(uNoise, wp * 0.17 + 0.31).g;
            ${blends.map((_, g) => `lw${g} = smoothstep(vec4(fray - 0.3), vec4(fray + 0.3), lw${g}) * 0.85 + lw${g} * 0.15;`).join('\n            ')}
            float lsum = ${blends.map((_, g) => `dot(lw${g}, vec4(1.0))`).join(' + ')};
            ${blends.map((_, g) => `lw${g} /= max(lsum, 1e-4);`).join('\n            ')}
          }`
      : '',
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
        ${glsl.decl}
        uniform vec2 uSize;
        uniform vec3 uEdge;
        float groundLum(vec3 c) { return dot(c, vec3(0.3, 0.55, 0.15)); }
        // a look's colour of a texture: some of its colour taken out, then tinted
        vec3 shade(vec3 c, float desat, vec3 tint) { return mix(c, vec3(groundLum(c)), desat) * tint; }`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec2 wp = vGroundPos.xz;
          // the mix, its tile edges pushed about by two lookups of the noise
          vec2 wob = vec2(texture2D(uNoise, wp * 0.061).g, texture2D(uNoise, wp * 0.061 + 0.5).g) - 0.5;
          vec4 w = texture2D(uSplat, (wp + wob * 2.2) / uSize);
          ${glsl.reads}
          ${glsl.looks}
          vec3 c0 = ${surface(0)};
          vec3 c1 = ${surface(1)};
          // the track is worn paler than the ground either side of it
          vec3 c2 = (${surface(2)}) * 1.3;
          vec3 c3 = ${surface(3)};
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
  const key = `ground-${nl}-${texOf.map((t) => t.join('')).join('.')}`;
  mat.customProgramCacheKey = () => key;
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
      for (const b of blends) b.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}

/** a per-tile RGBA map for the ground's shader, read smoothly between tiles */
function dataTexture(data: Uint8Array, w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
