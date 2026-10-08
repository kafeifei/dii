import * as THREE from 'three';
import { glowTexture } from './textures';

export interface ParticleOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  color: THREE.Color | string;
  size: number;
  life: number;
  gravity?: number;
  drag?: number;
  /** size multiplier at end of life */
  endSize?: number;
  alpha?: number;
  /** stop on the floor */
  floor?: boolean;
}

const tmpColor = new THREE.Color();

export class Particles {
  readonly points: THREE.Points;
  private max: number;
  private count = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private baseCol: Float32Array;
  private size: Float32Array;
  private baseSize: Float32Array;
  private endSize: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private alpha: Float32Array;
  private floor: Uint8Array;
  private geo: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.baseCol = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.endSize = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.floor = new Uint8Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: glowTexture() }, uScale: { value: 40 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute vec4 aColor;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec4 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          float a = vColor.a * t.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor.rgb, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 10;
  }

  setScale(pxPerUnit: number) {
    this.material.uniforms.uScale.value = pxPerUnit;
  }

  spawn(o: ParticleOpts) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = o.x;
    this.pos[i3 + 1] = o.y;
    this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx ?? 0;
    this.vel[i3 + 1] = o.vy ?? 0;
    this.vel[i3 + 2] = o.vz ?? 0;
    const c = typeof o.color === 'string' ? tmpColor.set(o.color) : o.color;
    this.baseCol[i3] = c.r;
    this.baseCol[i3 + 1] = c.g;
    this.baseCol[i3 + 2] = c.b;
    this.baseSize[i] = o.size;
    this.endSize[i] = o.endSize ?? 0.3;
    this.life[i] = o.life;
    this.maxLife[i] = o.life;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.alpha[i] = o.alpha ?? 1;
    this.floor[i] = o.floor ? 1 : 0;
  }

  clear() {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  update(dt: number) {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // swap-remove
        const last = --this.count;
        if (i !== last) this.copy(last, i);
        continue;
      }
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr;
      this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
      this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.floor[i] && this.pos[i3 + 1] < 0.02) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3] *= 0.3;
        this.vel[i3 + 1] = 0;
        this.vel[i3 + 2] *= 0.3;
      }
      const t = this.life[i] / this.maxLife[i]; // 1 → 0
      this.size[i] = this.baseSize[i] * (this.endSize[i] + (1 - this.endSize[i]) * t);
      const i4 = i * 4;
      this.col[i4] = this.baseCol[i3];
      this.col[i4 + 1] = this.baseCol[i3 + 1];
      this.col[i4 + 2] = this.baseCol[i3 + 2];
      this.col[i4 + 3] = this.alpha[i] * Math.min(1, t * 2.5);
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  private copy(from: number, to: number) {
    const f3 = from * 3;
    const t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
      this.baseCol[t3 + k] = this.baseCol[f3 + k];
    }
    for (let k = 0; k < 4; k++) this.col[to * 4 + k] = this.col[from * 4 + k];
    this.size[to] = this.size[from];
    this.baseSize[to] = this.baseSize[from];
    this.endSize[to] = this.endSize[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.alpha[to] = this.alpha[from];
    this.floor[to] = this.floor[from];
  }
}
