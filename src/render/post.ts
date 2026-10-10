import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** per-theme colour grade, applied after tone mapping */
export interface Grade {
  /** hue pushed into the darks and into the lights (split toning) */
  shadow: string;
  light: string;
  split: number;
  saturation: number;
  /** >1 deepens the darks */
  gamma: number;
  vignette: number;
  grain: number;
  bloom: number;
}

export const GRADES: Record<string, Grade> = {
  town: { shadow: '#2a3c66', light: '#ffd6a0', split: 0.45, saturation: 0.92, gamma: 1.04, vignette: 0.55, grain: 0.03, bloom: 0.35 },
  crypt: { shadow: '#3a3030', light: '#ffc890', split: 0.3, saturation: 0.9, gamma: 1.06, vignette: 0.6, grain: 0.035, bloom: 0.4 },
  cave: { shadow: '#40261e', light: '#ffbe8a', split: 0.3, saturation: 0.92, gamma: 1.06, vignette: 0.6, grain: 0.035, bloom: 0.4 },
  ice: { shadow: '#1c3058', light: '#d8eeff', split: 0.45, saturation: 0.9, gamma: 1.04, vignette: 0.55, grain: 0.03, bloom: 0.4 },
  // hell is red already: cool its darks toward violet so it is not one colour
  hell: { shadow: '#2c1a34', light: '#ffcc80', split: 0.35, saturation: 0.9, gamma: 1.05, vignette: 0.6, grain: 0.035, bloom: 0.65 },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
    uHueKeep: { value: 0.35 },
    uShadow: { value: new THREE.Vector3(1, 1, 1) },
    uLight: { value: new THREE.Vector3(1, 1, 1) },
    uSplit: { value: 0 },
    uSat: { value: 1 },
    uGamma: { value: 1 },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uAspect: { value: 1 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uExposure;
    uniform float uHueKeep;
    uniform vec3 uShadow;
    uniform vec3 uLight;
    uniform float uSplit;
    uniform float uSat;
    uniform float uGamma;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAspect;
    uniform float uTime;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // three's ACES fit, the curve the scenes were lit for when drawn straight to the screen
    vec3 aces(vec3 v) {
      const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      v = IN * v;
      v = (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
      return clamp(OUT * v, 0.0, 1.0);
    }
    vec3 srgb(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    void main() {
      vec3 hdr = max(texture2D(tDiffuse, vUv).rgb, 0.0) * uExposure / 0.6;
      // Drawn straight to the screen, each glowing thing was tone mapped on its own; summed in one
      // frame, a fireball over a lit floor would bleach to white. So: ACES for brightness, but keep
      // the hue, letting only what overflows a channel run toward white.
      vec3 per = aces(hdr);
      float lt = luma(per);
      vec3 keep = hdr * (lt / max(luma(hdr), 1e-5));
      float top = max(keep.r, max(keep.g, keep.b));
      keep = mix(keep, vec3(lt), clamp((top - 1.0) / max(top - lt, 1e-5), 0.0, 1.0));
      vec3 c = srgb(mix(per, keep, uHueKeep));
      c = pow(c, vec3(uGamma));
      float l = luma(c);
      c = mix(vec3(l), c, uSat);
      // split toning: tint the darks and the lights by hue, keeping black black
      c *= mix(vec3(1.0), uShadow, (1.0 - smoothstep(0.0, 0.45, l)) * uSplit);
      c *= mix(vec3(1.0), uLight, smoothstep(0.3, 1.0, l) * uSplit);
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(d) * 1.15);
      // film grain, which also dithers the long dark gradients
      float n = hash(gl_FragCoord.xy + fract(uTime) * 61.0) + hash(gl_FragCoord.yx * 1.37 + fract(uTime * 1.3) * 17.0) - 1.0;
      c += n * (uGrain * (0.35 + l) + 1.0 / 255.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

/** a colour by hue only: scaled to an average of 1, so tinting shifts hue more than brightness */
function hueOf(hex: string, out: THREE.Vector3) {
  const c = new THREE.Color(hex);
  return out.set(c.r, c.g, c.b).divideScalar(Math.max(1e-3, (c.r + c.g + c.b) / 3));
}

/**
 * Bloom on the HDR frame, then tone mapping, then the theme's grade, vignette and grain. Off, the
 * scene is drawn straight to the screen as before.
 */
export class Post {
  enabled = true;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private time = 0;

  constructor(
    private webgl: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    antialias: boolean,
  ) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: antialias ? 4 : 0 });
    this.composer = new EffectComposer(webgl, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    // only what is brighter than lit stone blooms: flames, embers, spells, glowing lava
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.25, 1.2);
    this.composer.addPass(this.bloom);
    // tone mapping and the conversion to sRGB happen in the grade
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.setGrade(GRADES.crypt);
  }

  setGrade(g: Grade) {
    const u = this.grade.uniforms;
    hueOf(g.shadow, u.uShadow.value);
    hueOf(g.light, u.uLight.value);
    u.uSplit.value = g.split;
    u.uSat.value = g.saturation;
    u.uGamma.value = g.gamma;
    u.uVignette.value = g.vignette;
    u.uGrain.value = g.grain;
    this.bloom.strength = g.bloom;
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }

  render(dt: number) {
    if (!this.enabled) {
      this.webgl.render(this.scene, this.camera);
      return;
    }
    this.time += dt;
    this.grade.uniforms.uTime.value = this.time;
    this.grade.uniforms.uExposure.value = this.webgl.toneMappingExposure;
    this.composer.render(dt);
  }
}
