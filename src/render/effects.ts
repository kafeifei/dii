import * as THREE from 'three';
import type { P2 } from '../core/math';
import type { Blood, Elem } from '../data/monsters';
import type { Actor } from '../game/actor';
import type { Fx, FxKind } from '../game/fx';
import { Particles } from './particles';
import { bloodTexture, ringTexture } from './textures';

const BLOOD_COLORS: Record<Blood, string[]> = {
  red: ['#8a0a0a', '#b01010', '#600606'],
  bone: ['#d8d0bc', '#bab29e', '#e8e0cc'],
  green: ['#3a7a1a', '#4a9a20', '#2a5a10'],
  ghost: ['#a0d8ff', '#80c0ff', '#e0f4ff'],
  black: ['#1a1a1a', '#2a2a2a', '#0a0a0a'],
  fire: ['#ff8020', '#ffb040', '#ff5010'],
};

const ELEM_COLORS: Record<Elem, string> = {
  phys: '#ffe0c0',
  fire: '#ff7020',
  cold: '#80c8ff',
  light: '#fff080',
  poison: '#70ff40',
  magic: '#a0b0ff',
};

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  from: number;
  to: number;
  opacity: number;
}

interface Bolt {
  line: THREE.Line;
  t: number;
  dur: number;
}

interface Decal {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
}

interface FloatText {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  t: number;
  dur: number;
}

export interface FlashLight {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  t: number;
  dur: number;
  distance: number;
}

export class Effects implements Fx {
  add: Particles;
  norm: Particles;
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private decals: Decal[] = [];
  private texts: FloatText[] = [];
  flashes: FlashLight[] = [];
  shakeAmount = 0;
  private ringGeo = new THREE.PlaneGeometry(1, 1);
  private group = new THREE.Group();

  constructor(
    private scene: THREE.Scene,
    private textLayer: HTMLElement,
    private project: (v: THREE.Vector3) => { x: number; y: number },
  ) {
    this.add = new Particles(5000, true);
    this.norm = new Particles(3000, false);
    scene.add(this.add.points, this.norm.points, this.group);
  }

  clearLevel() {
    this.add.clear();
    this.norm.clear();
    for (const r of this.rings) this.group.remove(r.mesh);
    for (const b of this.bolts) this.group.remove(b.line);
    for (const d of this.decals) this.group.remove(d.mesh);
    for (const t of this.texts) t.el.remove();
    this.rings = [];
    this.bolts = [];
    this.decals = [];
    this.texts = [];
    this.flashes = [];
  }

  // ─────────── particle helpers ───────────
  sparks(x: number, y: number, z: number, color: string, n: number, speed: number, size = 0.15, life = 0.4, gravity = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add.spawn({ x, y, z, vx: Math.sin(a) * s, vy: Math.random() * speed * 0.8, vz: Math.cos(a) * s, color, size: size * (0.6 + Math.random() * 0.8), life: life * (0.6 + Math.random() * 0.8), gravity, drag: 2 });
    }
  }

  glow(x: number, y: number, z: number, color: string, size: number, life: number) {
    this.add.spawn({ x, y, z, color, size, life, endSize: 1.2 });
  }

  flash(p: P2, color: string, intensity: number, dur: number, distance = 6, y = 1) {
    this.flashes.push({ pos: new THREE.Vector3(p.x, y, p.z), color: new THREE.Color(color), intensity, t: 0, dur, distance });
  }

  ring(p: P2, color: string, from: number, to: number, dur: number, opacity = 0.9, y = 0.06) {
    const m = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ map: ringTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, y, p.z);
    m.scale.setScalar(from * 2);
    m.renderOrder = 15;
    this.group.add(m);
    this.rings.push({ mesh: m, t: 0, dur, from, to, opacity });
  }

  decal(p: P2, color: string, size: number, dur = 20) {
    const m = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({ map: bloodTexture((Math.random() * 1000) | 0), color, transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(p.x, 0.015 + Math.random() * 0.005, p.z);
    m.scale.setScalar(size);
    m.renderOrder = 2;
    this.group.add(m);
    this.decals.push({ mesh: m, t: 0, dur });
    if (this.decals.length > 120) {
      const old = this.decals.shift()!;
      this.group.remove(old.mesh);
      (old.mesh.material as THREE.Material).dispose();
    }
  }

  lightningBolt(from: THREE.Vector3, to: THREE.Vector3, color: string, dur = 0.25, jag = 0.5) {
    const pts: THREE.Vector3[] = [];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = from.clone().lerp(to, t);
      if (i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * jag, (Math.random() - 0.5) * jag * 0.5, (Math.random() - 0.5) * jag));
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    line.renderOrder = 25;
    this.group.add(line);
    this.bolts.push({ line, t: 0, dur });
    for (const p of pts) this.glow(p.x, p.y, p.z, color, 0.5, dur * 1.5);
  }

  // ─────────── Fx interface ───────────
  hit(target: Actor, blood: Blood, dir: P2, heavy: boolean, elem: Elem) {
    const y = 0.9;
    const x = target.pos.x;
    const z = target.pos.z;
    const cols = BLOOD_COLORS[blood];
    const n = heavy ? 18 : 9;
    for (let i = 0; i < n; i++) {
      const s = 1.5 + Math.random() * (heavy ? 4 : 2.5);
      const spread = 0.8;
      this.norm.spawn({
        x, y, z,
        vx: (dir.x + (Math.random() - 0.5) * spread) * s,
        vy: 1 + Math.random() * 3,
        vz: (dir.z + (Math.random() - 0.5) * spread) * s,
        color: cols[(Math.random() * cols.length) | 0],
        size: 0.09 + Math.random() * 0.1,
        life: 0.5 + Math.random() * 0.4,
        gravity: 12,
        endSize: 0.7,
        floor: true,
      });
    }
    // impact spark
    this.sparks(x, y, z, ELEM_COLORS[elem], heavy ? 10 : 5, heavy ? 5 : 3, 0.14, 0.25, 4);
    this.glow(x, y, z, ELEM_COLORS[elem], heavy ? 1.4 : 0.8, 0.12);
    if (elem === 'fire') this.sparks(x, y, z, '#ff6010', 8, 2, 0.25, 0.5, -2);
    if (elem === 'cold') this.sparks(x, y, z, '#a0e0ff', 8, 3, 0.15, 0.5, 3);
    if (elem === 'light') this.sparks(x, y, z, '#ffffa0', 8, 6, 0.1, 0.25, 0);
    if ((blood === 'red' || blood === 'green') && Math.random() < (heavy ? 0.8 : 0.35)) {
      this.decal({ x: x + dir.x * 0.4 + (Math.random() - 0.5) * 0.4, z: z + dir.z * 0.4 + (Math.random() - 0.5) * 0.4 }, cols[0], 0.5 + Math.random() * 0.5);
    }
  }

  death(target: Actor, blood: Blood, elem: Elem) {
    const x = target.pos.x;
    const z = target.pos.z;
    const cols = BLOOD_COLORS[blood];
    const big = target.radius > 0.55;
    for (let i = 0; i < (big ? 50 : 26); i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 4;
      this.norm.spawn({ x, y: 0.8, z, vx: Math.sin(a) * s, vy: 1 + Math.random() * 4, vz: Math.cos(a) * s, color: cols[(Math.random() * cols.length) | 0], size: 0.1 + Math.random() * 0.12, life: 0.7 + Math.random() * 0.5, gravity: 12, floor: true, endSize: 0.8 });
    }
    if (blood === 'red' || blood === 'green') this.decal(target.pos, cols[2], big ? 2.4 : 1.4, 30);
    if (blood === 'fire' || elem === 'fire') {
      this.sparks(x, 0.8, z, '#ff6010', 25, 3, 0.35, 0.8, -3);
      this.flash(target.pos, '#ff6010', 25, 0.4);
    }
    if (elem === 'cold') {
      this.sparks(x, 0.8, z, '#c0ecff', 30, 4, 0.18, 0.8, 8);
      this.flash(target.pos, '#80c0ff', 15, 0.3);
    }
    if (blood === 'ghost') this.sparks(x, 1, z, '#a0d8ff', 30, 2, 0.3, 1, -1);
    // dust puff
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      this.norm.spawn({ x: x + Math.sin(a) * 0.3, y: 0.15, z: z + Math.cos(a) * 0.3, vx: Math.sin(a) * 0.8, vy: 0.3, vz: Math.cos(a) * 0.8, color: '#5a5048', size: 0.5, life: 0.8, drag: 2, alpha: 0.35, endSize: 2 });
    }
  }

  burst(kind: FxKind, pos: P2, opts: { radius?: number; dir?: P2; color?: string; target?: P2 } = {}) {
    const { x, z } = pos;
    switch (kind) {
      case 'holyfire': {
        const r = opts.radius ?? 4;
        this.ring(pos, '#ff6a20', 0.5, r, 0.6, 0.8);
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * r;
          this.add.spawn({ x: x + Math.sin(a) * d, y: 0.1, z: z + Math.cos(a) * d, vy: 1.5 + Math.random() * 2, color: Math.random() < 0.5 ? '#ff6010' : '#ffa030', size: 0.3 + Math.random() * 0.3, life: 0.6, gravity: -1 });
        }
        this.flash(pos, '#ff6a20', 20, 0.35, r * 2);
        break;
      }
      case 'freeze': {
        const r = opts.radius ?? 4;
        this.ring(pos, '#80c8ff', 0.5, r, 0.7, 0.7);
        for (let i = 0; i < 30; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * r;
          this.add.spawn({ x: x + Math.sin(a) * d, y: 0.1 + Math.random() * 0.5, z: z + Math.cos(a) * d, vy: 0.5, color: '#c0ecff', size: 0.15 + Math.random() * 0.15, life: 0.9, gravity: 0.5 });
        }
        break;
      }
      case 'lightning': {
        const r = opts.radius ?? 2.5;
        const to = new THREE.Vector3(x, 0.05, z);
        for (let i = 0; i < 3; i++) {
          const from = new THREE.Vector3(x + (Math.random() - 0.5) * 2, 14, z + (Math.random() - 0.5) * 2);
          this.lightningBolt(from, to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6)), i === 0 ? '#ffffff' : '#a0b0ff', 0.3, 1.2);
        }
        this.ring(pos, '#c0c8ff', 0.3, r, 0.4, 1);
        this.sparks(x, 0.3, z, '#e0e8ff', 40, 7, 0.15, 0.4, 6);
        this.flash(pos, '#c0d0ff', 80, 0.3, 14, 3);
        break;
      }
      case 'frostnova': {
        const r = opts.radius ?? 3.5;
        this.ring(pos, '#80d0ff', 0.3, r, 0.5, 1);
        for (let i = 0; i < 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          this.add.spawn({ x, y: 0.4, z, vx: Math.sin(a) * r * 2.2, vz: Math.cos(a) * r * 2.2, color: '#c0ecff', size: 0.3, life: 0.45, drag: 1.5 });
        }
        this.flash(pos, '#60b0ff', 30, 0.35, r * 2.5);
        break;
      }
      case 'fireblast': {
        const r = opts.radius ?? 2.4;
        this.ring(pos, '#ff6010', 0.3, r, 0.45, 1);
        for (let i = 0; i < 50; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = Math.random() * r * 2.5;
          this.add.spawn({ x, y: 0.5, z, vx: Math.sin(a) * s, vy: Math.random() * 3, vz: Math.cos(a) * s, color: Math.random() < 0.5 ? '#ff5010' : '#ffb040', size: 0.4 + Math.random() * 0.4, life: 0.6, drag: 2, gravity: -2 });
        }
        this.flash(pos, '#ff6010', 50, 0.45, r * 3);
        this.shake(0.2);
        break;
      }
      case 'levelup': {
        this.ring(pos, '#ffd24a', 0.3, 3, 0.9, 1);
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * 0.8;
          this.add.spawn({ x: x + Math.sin(a) * d, y: Math.random() * 0.4, z: z + Math.cos(a) * d, vy: 2 + Math.random() * 4, color: Math.random() < 0.5 ? '#ffe080' : '#ffffff', size: 0.2 + Math.random() * 0.2, life: 1.2, drag: 1 });
        }
        this.flash(pos, '#ffe080', 60, 1.0, 10, 2);
        break;
      }
      case 'potion_hp':
        for (let i = 0; i < 14; i++) this.add.spawn({ x: x + (Math.random() - 0.5) * 0.6, y: 0.2 + Math.random(), z: z + (Math.random() - 0.5) * 0.6, vy: 1.2, color: '#ff4040', size: 0.15, life: 0.7 });
        break;
      case 'potion_mp':
        for (let i = 0; i < 14; i++) this.add.spawn({ x: x + (Math.random() - 0.5) * 0.6, y: 0.2 + Math.random(), z: z + (Math.random() - 0.5) * 0.6, vy: 1.2, color: '#4070ff', size: 0.15, life: 0.7 });
        break;
      case 'portal':
        this.ring(pos, '#4080ff', 0.2, 1.5, 0.6, 1);
        this.sparks(x, 1, z, '#80b0ff', 30, 3, 0.2, 0.8, 0);
        this.flash(pos, '#4080ff', 30, 0.6);
        break;
      case 'block': {
        const d = opts.dir ?? { x: 0, z: 1 };
        const l = Math.hypot(d.x, d.z) || 1;
        this.sparks(x + (d.x / l) * 0.4, 1, z + (d.z / l) * 0.4, '#ffe8a0', 12, 4, 0.1, 0.3, 6);
        break;
      }
      case 'dust':
        this.norm.spawn({ x: x + (Math.random() - 0.5) * 0.4, y: 0.1, z: z + (Math.random() - 0.5) * 0.4, vy: 0.4, color: '#6a6050', size: 0.45, life: 0.6, alpha: 0.3, endSize: 2, drag: 2 });
        break;
      case 'charge':
        this.add.spawn({ x: x + (Math.random() - 0.5) * 0.4, y: 0.6 + Math.random() * 0.8, z: z + (Math.random() - 0.5) * 0.4, color: '#ffd080', size: 0.35, life: 0.35 });
        this.norm.spawn({ x, y: 0.1, z, vy: 0.4, color: '#6a6050', size: 0.5, life: 0.5, alpha: 0.35, endSize: 2, drag: 2 });
        break;
      case 'resurrect':
        this.ring(pos, '#ff4060', 0.2, 1.2, 0.6, 1);
        this.sparks(x, 0.5, z, '#ff6080', 20, 2, 0.25, 0.8, -2);
        this.flash(pos, '#ff3050', 20, 0.5);
        break;
      case 'smite': {
        this.glow(x, 1, z, '#fff0b0', 2, 0.18);
        this.sparks(x, 1, z, '#ffe080', 16, 5, 0.14, 0.35, 5);
        this.flash(pos, '#ffe0a0', 30, 0.2);
        break;
      }
      case 'swing': {
        const d = opts.dir ?? { x: 0, z: 1 };
        for (let i = 0; i < 6; i++) {
          const t = (i / 5 - 0.5) * 1.6;
          const c = Math.cos(t);
          const s = Math.sin(t);
          const dx = d.x * c - d.z * s;
          const dz = d.x * s + d.z * c;
          this.add.spawn({ x: x + dx * 0.9, y: 1.0, z: z + dz * 0.9, color: '#ffffff', size: 0.18, life: 0.12, alpha: 0.35 });
        }
        break;
      }
      case 'chest':
        this.sparks(x, 0.5, z, '#ffe080', 20, 2.5, 0.15, 0.7, 2);
        this.flash(pos, '#ffd080', 15, 0.5);
        break;
      case 'barrel':
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 1 + Math.random() * 3;
          this.norm.spawn({ x, y: 0.4, z, vx: Math.sin(a) * s, vy: 2 + Math.random() * 3, vz: Math.cos(a) * s, color: '#6a4a2a', size: 0.12, life: 0.8, gravity: 12, floor: true });
        }
        break;
      case 'aura_switch':
        this.ring(pos, opts.color ?? '#ffffff', 0.3, 2.5, 0.5, 0.9);
        this.sparks(x, 0.3, z, opts.color ?? '#ffffff', 20, 2, 0.2, 0.6, -2);
        break;
      case 'shield_buff':
        this.ring(pos, '#ffffff', 0.3, 1.8, 0.6, 1);
        this.sparks(x, 1, z, '#fff8e0', 30, 2, 0.2, 0.8, 0);
        this.flash(pos, '#fff8e0', 30, 0.6);
        break;
      case 'unique_drop': {
        const c = opts.color ?? '#c8a86a';
        for (let i = 0; i < 30; i++) this.add.spawn({ x: x + (Math.random() - 0.5) * 0.2, y: Math.random() * 0.5, z: z + (Math.random() - 0.5) * 0.2, vy: 3 + Math.random() * 5, color: c, size: 0.2, life: 1.0, drag: 0.5 });
        this.flash(pos, c, 25, 1.2);
        break;
      }
      case 'gold':
        this.sparks(x, 0.3, z, '#ffe080', 6, 1.5, 0.1, 0.4, 4);
        break;
      case 'holyburst':
        this.sparks(x, 0.8, z, '#fff0c0', 14, 3, 0.18, 0.4, 0);
        break;
    }
  }

  shake(amount: number) {
    this.shakeAmount = Math.min(1, this.shakeAmount + amount);
  }

  text(pos: P2, text: string, color: string, big = false) {
    const el = document.createElement('div');
    el.className = 'float-text' + (big ? ' big' : '');
    el.textContent = text;
    el.style.color = color;
    this.textLayer.appendChild(el);
    this.texts.push({ el, pos: new THREE.Vector3(pos.x, 1.9, pos.z), t: 0, dur: 1.1 });
  }

  update(dt: number) {
    this.add.update(dt);
    this.norm.update(dt);
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.5);
    for (const r of this.rings) {
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const e = 1 - Math.pow(1 - k, 2);
      r.mesh.scale.setScalar((r.from + (r.to - r.from) * e) * 2);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.opacity * (1 - k);
    }
    this.rings = this.rings.filter((r) => {
      if (r.t >= r.dur) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    for (const b of this.bolts) {
      b.t += dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - b.t / b.dur) * (Math.random() < 0.3 ? 0.4 : 1);
    }
    this.bolts = this.bolts.filter((b) => {
      if (b.t >= b.dur) {
        this.group.remove(b.line);
        b.line.geometry.dispose();
        (b.line.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    for (const d of this.decals) {
      d.t += dt;
      if (d.t > d.dur - 3) (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * ((d.dur - d.t) / 3));
    }
    this.decals = this.decals.filter((d) => {
      if (d.t >= d.dur) {
        this.group.remove(d.mesh);
        (d.mesh.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
    for (const t of this.texts) {
      t.t += dt;
      const s = this.project(t.pos);
      t.el.style.transform = `translate(${s.x}px, ${s.y - t.t * 40}px) translate(-50%, -50%)`;
      t.el.style.opacity = String(Math.min(1, 2.5 * (1 - t.t / t.dur)));
    }
    this.texts = this.texts.filter((t) => {
      if (t.t >= t.dur) {
        t.el.remove();
        return false;
      }
      return true;
    });
  }
}
