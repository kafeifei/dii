import * as THREE from 'three';
import type { P2 } from '../core/math';
import { SKILL_BY_ID } from '../data/skills';
import type { Game, Picker } from '../game/game';
import type { Level } from '../game/level';
import type { Monster } from '../game/monster';
import type { GroundItem, Hammer, Projectile, WorldObject } from '../game/objects';
import { itemColor } from '../items/item';
import { T_FLOOR, T_WALL } from '../world/tilemap';
import { Effects } from './effects';
import { monsterLook, playerLook, playerLookKey, vendorLook } from './looks';
import {
  glowSprite, makeBarrel, makeHouse, makeChest, makeDecor, makeGroundItem, makeHammer, makePortal, makeProjectile, makeStairs, makeTorch, makeTree, makeWaypoint,
} from './props';
import { Rig, type AnimInput } from './rig';
import { floorTexture, runeCircleTexture, shadowTexture, wallTexture } from './textures';

const CAM_YAW = Math.PI / 4;
const CAM_PITCH = 0.68; // ~39°
const CAM_DIST = 40;
const WALL_H = 1.9;
const TORCH_LIGHTS = 5;
const FX_LIGHTS = 6;

interface OccUniforms {
  uPlayer: { value: THREE.Vector3 };
  uCamDir: { value: THREE.Vector2 };
}

function applyOcclusionFade(mat: THREE.Material, u: OccUniforms) {
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

interface ActorView {
  rig: Rig;
  shadow: THREE.Mesh;
  key?: string;
}

interface ObjView {
  group: THREE.Group;
  update?: (dt: number, o: WorldObject) => void;
  lightColor?: string;
  lightIntensity?: number;
}

export class Renderer implements Picker {
  readonly webgl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  fx: Effects;
  zoom = 7.2;
  private zoomTarget = 7.2;
  private camTarget = new THREE.Vector3();
  private levelGroup = new THREE.Group();
  private dynGroup = new THREE.Group();
  private occ: OccUniforms = { uPlayer: { value: new THREE.Vector3() }, uCamDir: { value: new THREE.Vector2(Math.sin(CAM_YAW), Math.cos(CAM_YAW)) } };
  private hemi = new THREE.HemisphereLight('#4a5070', '#100808', 0.4);
  private dir = new THREE.DirectionalLight('#8090c0', 0.3);
  private playerLight = new THREE.PointLight('#ffd0a0', 30, 13, 1.4);
  private torchLights: THREE.PointLight[] = [];
  private fxLights: THREE.PointLight[] = [];
  private staticLights: { pos: THREE.Vector3; color: THREE.Color; intensity: number; flicker: number; distance: number }[] = [];
  private flames: THREE.Sprite[] = [];
  private monsterViews = new Map<Monster, ActorView>();
  private playerView: ActorView | null = null;
  private vendorView: ActorView | null = null;
  private groundViews = new Map<GroundItem, THREE.Group>();
  private projViews = new Map<Projectile, { group: THREE.Group; light: string | null }>();
  private hammerViews = new Map<Hammer, THREE.Group>();
  private objViews = new Map<WorldObject, ObjView>();
  private auraDecal: THREE.Mesh;
  private shieldGlow: THREE.Sprite;
  private shadowGeo = new THREE.PlaneGeometry(1, 1);
  private shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private time = 0;
  private level: Level | null = null;
  pxPerUnit = 40;
  width = 1;
  height = 1;
  playerScreen = { x: 0, y: 0 };
  private tmpV = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    textLayer: HTMLElement,
    private game: Game,
  ) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.15;
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.scene.add(this.levelGroup, this.dynGroup, this.hemi, this.dir, this.dir.target, this.playerLight);
    for (let i = 0; i < TORCH_LIGHTS; i++) {
      const l = new THREE.PointLight('#ff9040', 0, 9, 1.6);
      this.torchLights.push(l);
      this.scene.add(l);
    }
    for (let i = 0; i < FX_LIGHTS; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 8, 1.6);
      this.fxLights.push(l);
      this.scene.add(l);
    }
    this.fx = new Effects(this.scene, textLayer, (v) => this.project(v));
    this.auraDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: runeCircleTexture('#ffffff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }),
    );
    this.auraDecal.rotation.x = -Math.PI / 2;
    this.auraDecal.renderOrder = 5;
    this.auraDecal.visible = false;
    this.scene.add(this.auraDecal);
    this.shieldGlow = glowSprite('#fff8d0', 1.8, 0.35);
    this.shieldGlow.visible = false;
    this.scene.add(this.shieldGlow);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.webgl.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.updateFrustum();
  }

  private updateFrustum() {
    const aspect = this.width / this.height;
    const hh = this.zoom;
    this.camera.left = -hh * aspect;
    this.camera.right = hh * aspect;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
    this.pxPerUnit = this.height / (2 * hh);
    const pr = this.webgl.getPixelRatio();
    this.fx.add.setScale(this.pxPerUnit * pr);
    this.fx.norm.setScale(this.pxPerUnit * pr);
  }

  // ─────────────────────────── level building ───────────────────────────

  buildLevel(level: Level) {
    this.level = level;
    // clear
    for (const v of this.monsterViews.values()) v.rig.dispose();
    this.monsterViews.clear();
    for (const g of this.groundViews.values()) g.removeFromParent();
    this.groundViews.clear();
    for (const p of this.projViews.values()) p.group.removeFromParent();
    this.projViews.clear();
    for (const h of this.hammerViews.values()) h.removeFromParent();
    this.hammerViews.clear();
    for (const o of this.objViews.values()) o.group.removeFromParent();
    this.objViews.clear();
    if (this.vendorView) {
      this.vendorView.rig.dispose();
      this.vendorView.shadow.removeFromParent();
      this.vendorView = null;
    }
    this.levelGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m as THREE.InstancedMesh).isInstancedMesh) m.geometry.dispose();
    });
    this.levelGroup.clear();
    this.dynGroup.clear();
    this.fx.clearLevel();
    this.flames = [];
    this.staticLights = [];

    const L = level.layout;
    const theme = L.theme;
    const map = L.map;
    this.scene.background = new THREE.Color(theme.bg);
    this.hemi.color.set(theme.ambient);
    this.hemi.groundColor.set('#0a0606');
    this.hemi.intensity = theme.ambientIntensity * 2.8;
    this.dir.color.set(level.depth === 0 ? '#8aa0d8' : theme.ambient);
    this.dir.intensity = level.depth === 0 ? 0.9 : 0.25;
    this.playerLight.intensity = level.depth === 0 ? 16 : 42;
    this.playerLight.distance = level.depth === 0 ? 10 : 13;

    // floor
    const floorTiles: [number, number][] = [];
    const wallTiles: [number, number][] = [];
    const pillarTiles: [number, number][] = [];
    const inHouse = (x: number, y: number) => (L.houses ?? []).some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, y);
        if (t === T_FLOOR) floorTiles.push([x, y]);
        else if (t === T_WALL && inHouse(x, y)) floorTiles.push([x, y]);
        else if (t === T_WALL) {
          if (L.pillars.has(y * map.w + x)) pillarTiles.push([x, y]);
          else wallTiles.push([x, y]);
        }
      }
    }
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(theme.texture, theme.floor), roughness: 0.95, metalness: 0 });
    const floorGeo = new THREE.PlaneGeometry(1, 1);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.InstancedMesh(floorGeo, floorMat, floorTiles.length + pillarTiles.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    const base = new THREE.Color(theme.floor);
    const alt = new THREE.Color(theme.floorAlt);
    let i = 0;
    for (const [x, y] of [...floorTiles, ...pillarTiles]) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.floor(Math.random() * 4) * Math.PI) / 2);
      m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), q, one);
      floor.setMatrixAt(i, m4);
      // ambient occlusion near walls
      let walls = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.get(x + dx, y + dy) === T_WALL) walls++;
      const ao = 1 - walls * 0.12;
      const v = 0.82 + Math.random() * 0.3;
      col.copy(base).lerp(alt, Math.random()).multiplyScalar((v * ao) / Math.max(0.2, base.r * 0 + 1));
      col.setRGB(v * ao, v * ao, v * ao);
      floor.setColorAt(i, col);
      i++;
    }
    floor.instanceMatrix.needsUpdate = true;
    if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
    this.levelGroup.add(floor);

    // walls
    const sideTex = wallTexture(theme.wallTexture, theme.wall);
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.92 });
    const topMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.wall).lerp(new THREE.Color(theme.wallDark), 0.35), roughness: 1 });
    applyOcclusionFade(sideMat, this.occ);
    applyOcclusionFade(topMat, this.occ);
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    wallGeo.translate(0, WALL_H / 2, 0);
    const walls = new THREE.InstancedMesh(wallGeo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat], wallTiles.length);
    i = 0;
    for (const [x, y] of wallTiles) {
      const hJ = level.depth === 0 ? 0.85 + Math.random() * 0.25 : 0.96 + Math.random() * 0.08;
      m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), new THREE.Quaternion(), new THREE.Vector3(1, hJ, 1));
      walls.setMatrixAt(i, m4);
      const v = 0.8 + Math.random() * 0.25;
      walls.setColorAt(i, col.setRGB(v, v, v));
      i++;
    }
    walls.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    this.levelGroup.add(walls);

    if (pillarTiles.length) {
      const pGeo = new THREE.CylinderGeometry(0.36, 0.42, WALL_H + 0.3, 8);
      pGeo.translate(0, (WALL_H + 0.3) / 2, 0);
      const pillars = new THREE.InstancedMesh(pGeo, sideMat, pillarTiles.length);
      i = 0;
      for (const [x, y] of pillarTiles) {
        m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), new THREE.Quaternion(), one);
        pillars.setMatrixAt(i++, m4);
      }
      this.levelGroup.add(pillars);
    }

    // houses (town)
    for (const hs of L.houses ?? []) this.levelGroup.add(makeHouse(hs.w, hs.h, hs.x, hs.y));

    // torches
    for (const t of L.torches) {
      const { group, flame } = makeTorch(theme.torch);
      group.position.set(t.x, 0, t.z);
      group.rotation.y = Math.atan2(t.nx, t.nz);
      this.levelGroup.add(group);
      this.flames.push(flame);
      this.staticLights.push({ pos: new THREE.Vector3(t.x + t.nx * 0.5, 1.9, t.z + t.nz * 0.5), color: new THREE.Color(theme.torch), intensity: 16, flicker: 1, distance: 8 });
    }
    // decor
    const treeMats: THREE.Material[] = [];
    for (const d of L.decor) {
      const g = d.kind === 'tree' ? makeTree(d.scale, Math.random() < 0.3) : makeDecor(d.kind, theme.key);
      g.position.set(d.x, 0, d.z);
      g.rotation.y = d.rot;
      if (d.kind !== 'tree') g.scale.multiplyScalar(d.scale);
      if (d.kind === 'tree') {
        g.traverse((o) => {
          const mm = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (mm && !treeMats.includes(mm)) treeMats.push(mm);
        });
      }
      this.levelGroup.add(g);
      if (d.kind === 'campfire') {
        this.staticLights.push({ pos: new THREE.Vector3(d.x, 0.8, d.z), color: new THREE.Color('#ff8030'), intensity: 45, flicker: 1.5, distance: 14 });
      }
      if (d.kind === 'crystal') this.staticLights.push({ pos: new THREE.Vector3(d.x, 0.6, d.z), color: new THREE.Color('#4a90d0'), intensity: 6, flicker: 0, distance: 5 });
    }
    for (const mm of treeMats) {
      const cloned = mm;
      applyOcclusionFade(cloned, this.occ);
      cloned.needsUpdate = true;
    }
    // static objects get views lazily in sync()
    this.syncObjects(level, 0);
    // snap camera
    const p = this.game.player;
    this.camTarget.set(p.pos.x, 0, p.pos.z);
  }

  private makeObjectView(o: WorldObject): ObjView {
    const g = new THREE.Group();
    g.position.set(o.pos.x, 0, o.pos.z);
    switch (o.kind) {
      case 'chest': {
        const { group, lid } = makeChest(false);
        group.rotation.y = Math.PI / 4 + Math.PI;
        g.add(group);
        return {
          group: g,
          update: (dt, ob) => {
            if (ob.used) lid.rotation.x = Math.max(-1.9, lid.rotation.x - dt * 6);
          },
        };
      }
      case 'stash': {
        const { group, lid } = makeChest(true);
        group.rotation.y = Math.PI / 4 + Math.PI;
        g.add(group);
        return { group: g, update: () => void lid };
      }
      case 'barrel': {
        const b = makeBarrel();
        g.add(b);
        return {
          group: g,
          update: (dt, ob) => {
            if (ob.used) {
              b.scale.y = Math.max(0.15, b.scale.y - dt * 6);
              b.scale.x = b.scale.z = Math.min(1.4, b.scale.x + dt * 2);
            }
          },
        };
      }
      case 'stairs':
        g.add(makeStairs(this.level?.depth === 0));
        return { group: g };
      case 'waypoint': {
        const { group, rune } = makeWaypoint();
        g.add(group);
        return {
          group: g,
          update: (dt) => {
            rune.rotation.z += dt * 0.3;
            (rune.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this.time * 2) * 0.2;
          },
          lightColor: '#4a90ff',
          lightIntensity: 14,
        };
      }
      case 'portal': {
        const color = o.dest === 0 ? '#4a8aff' : '#ff4a4a';
        const { group, disc, ring } = makePortal(color);
        g.add(group);
        group.scale.setScalar(0.01);
        return {
          group: g,
          update: (dt) => {
            group.scale.setScalar(Math.min(1, group.scale.x + dt * 3));
            disc.rotation.z += dt * 2;
            ring.rotation.z -= dt;
            (disc.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(this.time * 5) * 0.2;
            if (Math.random() < 0.5) this.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 0.8, y: 0.2 + Math.random() * 1.8, z: o.pos.z + (Math.random() - 0.5) * 0.8, vy: 0.8, color, size: 0.15, life: 0.8 });
          },
          lightColor: color,
          lightIntensity: 22,
        };
      }
      case 'vendor': {
        const rig = new Rig(vendorLook());
        g.add(rig.root);
        const shadow = this.makeShadow(0.5);
        this.dynGroup.add(shadow);
        shadow.position.set(o.pos.x, 0.02, o.pos.z);
        this.vendorView = { rig, shadow };
        return {
          group: g,
          update: (dt) => {
            const p = this.game.player;
            const ang = Math.atan2(p.pos.x - o.pos.x, p.pos.z - o.pos.z);
            rig.root.rotation.y += (ang - rig.root.rotation.y) * Math.min(1, dt * 3);
            rig.update(dt, { state: 'idle', stateTime: 0, stateDur: 0, speed: 0, dead: false, deathTime: 0, hitFlash: 0, chilled: false, poisoned: false, blood: 'red', killedBy: 'phys' });
          },
        };
      }
    }
    return { group: g };
  }

  private makeShadow(r: number): THREE.Mesh {
    const s = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.scale.setScalar(r * 2.8);
    s.renderOrder = 3;
    return s;
  }

  private syncObjects(level: Level, dt: number) {
    const seen = new Set<WorldObject>();
    for (const o of level.objects) {
      seen.add(o);
      let v = this.objViews.get(o);
      if (!v) {
        v = this.makeObjectView(o);
        this.objViews.set(o, v);
        this.dynGroup.add(v.group);
      }
      v.update?.(dt, o);
    }
    for (const [o, v] of this.objViews) {
      if (!seen.has(o)) {
        v.group.removeFromParent();
        this.objViews.delete(o);
      }
    }
  }

  // ─────────────────────────── per-frame ───────────────────────────

  private anim(a: { state: AnimInput['state']; stateTime: number; stateDur: number; dead: boolean; deathTime: number; hitFlash: number; chillTime: number; poisonTime: number; killedBy: AnimInput['killedBy'] }, speed: number, blood: AnimInput['blood']): AnimInput {
    return {
      state: a.state,
      stateTime: a.stateTime,
      stateDur: a.stateDur,
      speed,
      dead: a.dead,
      deathTime: a.deathTime,
      hitFlash: a.hitFlash,
      chilled: a.chillTime > 0,
      poisoned: a.poisonTime > 0,
      blood,
      killedBy: a.killedBy,
    };
  }

  render(dt: number) {
    const g = this.game;
    const level = g.level;
    if (!level) return;
    this.time += dt;
    const p = g.player;

    // zoom
    if (g.input.wheel && !g.input.overUI) this.zoomTarget = Math.min(11, Math.max(4.5, this.zoomTarget + g.input.wheel * 0.6));
    if (Math.abs(this.zoomTarget - this.zoom) > 0.01) {
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 8);
      this.updateFrustum();
    }

    // camera follow
    this.camTarget.x += (p.pos.x - this.camTarget.x) * Math.min(1, dt * 10);
    this.camTarget.z += (p.pos.z - this.camTarget.z) * Math.min(1, dt * 10);
    const sh = this.fx.shakeAmount;
    const sx = sh > 0 ? (Math.random() - 0.5) * sh * 0.5 : 0;
    const sz = sh > 0 ? (Math.random() - 0.5) * sh * 0.5 : 0;
    const off = new THREE.Vector3(Math.sin(CAM_YAW) * Math.cos(CAM_PITCH), Math.sin(CAM_PITCH), Math.cos(CAM_YAW) * Math.cos(CAM_PITCH)).multiplyScalar(CAM_DIST);
    this.camera.position.set(this.camTarget.x + off.x + sx, off.y, this.camTarget.z + off.z + sz);
    this.camera.lookAt(this.camTarget.x + sx, 0, this.camTarget.z + sz);
    this.dir.position.set(this.camTarget.x - 8, 20, this.camTarget.z + 4);
    this.dir.target.position.set(this.camTarget.x, 0, this.camTarget.z);
    this.occ.uPlayer.value.set(p.pos.x, 0, p.pos.z);

    // player light
    const lr = p.stats.lightRadius;
    // offset toward the camera so the faces we actually see are lit
    this.playerLight.position.set(p.pos.x + 1.1, 2.6, p.pos.z + 1.1);
    this.playerLight.distance = (level.depth === 0 ? 11 : 14) + lr * 1.2;

    // player rig
    const key = playerLookKey(p);
    if (!this.playerView || this.playerView.key !== key) {
      if (this.playerView) {
        this.playerView.rig.dispose();
        this.playerView.shadow.removeFromParent();
      }
      const rig = new Rig(playerLook(p));
      this.scene.add(rig.root);
      const shadow = this.makeShadow(p.radius);
      this.scene.add(shadow);
      this.playerView = { rig, shadow, key };
    }
    const pv = this.playerView;
    pv.rig.root.position.x = p.pos.x;
    pv.rig.root.position.z = p.pos.z;
    if (!p.dead) pv.rig.root.position.y = 0;
    pv.rig.root.rotation.y = smoothAngle(pv.rig.root.rotation.y, p.facing, dt * 18);
    pv.rig.update(dt, this.anim(p, p.stats.moveSpeed * p.slowFactor() * (p.state === 'charge' ? 2.5 : 1), 'red'));
    pv.shadow.position.set(p.pos.x, 0.02, p.pos.z);

    // aura decal
    if (p.activeAura && !p.dead && p.skillLevel(p.activeAura) > 0) {
      const def = SKILL_BY_ID[p.activeAura];
      this.auraDecal.visible = true;
      (this.auraDecal.material as THREE.MeshBasicMaterial).color.set(def.color);
      const r = p.skillParams(p.activeAura).radius ?? 2.2;
      this.auraDecal.scale.setScalar(Math.min(r, 4) * 2 * 0.9);
      this.auraDecal.position.set(p.pos.x, 0.03, p.pos.z);
      this.auraDecal.rotation.z += dt * 0.4;
      (this.auraDecal.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(this.time * 2) * 0.06;
      if (Math.random() < dt * 14) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 1.2;
        this.fx.add.spawn({ x: p.pos.x + Math.sin(a) * d, y: 0.1, z: p.pos.z + Math.cos(a) * d, vy: 1 + Math.random(), color: def.color, size: 0.12, life: 0.9 });
      }
    } else this.auraDecal.visible = false;
    this.shieldGlow.visible = p.holyShield > 0 && !p.dead;
    if (this.shieldGlow.visible) {
      this.shieldGlow.position.set(p.pos.x, 1.0, p.pos.z);
      this.shieldGlow.material.opacity = 0.2 + Math.sin(this.time * 3) * 0.05;
    }

    // monsters
    const seen = new Set<Monster>();
    for (const m of level.monsters) {
      const d2 = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
      let v = this.monsterViews.get(m);
      if (!v) {
        if (d2 > 30 * 30) continue;
        const rig = new Rig(monsterLook(m));
        this.dynGroup.add(rig.root);
        const shadow = this.makeShadow(m.radius);
        this.dynGroup.add(shadow);
        v = { rig, shadow };
        rig.root.rotation.y = m.facing;
        this.monsterViews.set(m, v);
      }
      seen.add(m);
      const visible = d2 < 28 * 28;
      v.rig.root.visible = visible;
      v.shadow.visible = visible && !m.dead;
      if (!visible) continue;
      v.rig.root.position.x = m.pos.x;
      v.rig.root.position.z = m.pos.z;
      if (!m.dead) v.rig.root.rotation.y = smoothAngle(v.rig.root.rotation.y, m.facing, dt * 12);
      const hover = g.hover.monster === m;
      v.rig.update(dt, this.anim({ ...m, hitFlash: Math.max(m.hitFlash, hover ? 0.12 : 0) }, m.speed * m.slowFactor(), m.def.blood));
      v.shadow.position.set(m.pos.x, 0.02, m.pos.z);
      // elemental enchant auras
      if (!m.dead && m.mods.length && Math.random() < dt * 10) {
        const c = m.mods.includes('fireench') ? '#ff6010' : m.mods.includes('coldench') ? '#80c8ff' : m.mods.includes('lightench') ? '#ffff80' : null;
        if (c) this.fx.add.spawn({ x: m.pos.x + (Math.random() - 0.5) * 0.6, y: 0.2 + Math.random() * 1.2, z: m.pos.z + (Math.random() - 0.5) * 0.6, vy: 0.8, color: c, size: 0.18, life: 0.6 });
      }
    }
    for (const [m, v] of this.monsterViews) {
      if (!seen.has(m)) {
        v.rig.dispose();
        v.shadow.removeFromParent();
        this.monsterViews.delete(m);
      }
    }

    // ground items
    const gseen = new Set<GroundItem>();
    for (const gi of level.ground) {
      gseen.add(gi);
      let v = this.groundViews.get(gi);
      if (!v) {
        v = makeGroundItem(gi.item, gi.item ? itemColor(gi.item) : '#e8c040');
        v.rotation.y = Math.random() * Math.PI * 2;
        this.dynGroup.add(v);
        this.groundViews.set(gi, v);
        if (gi.item && (gi.item.rarity === 'unique' || gi.item.rarity === 'set' || gi.item.rarity === 'runeword')) {
          const beam = glowSprite(itemColor(gi.item), 0.9, 0.6);
          beam.position.y = 0.3;
          v.add(beam);
        }
      }
      const t = Math.min(1, gi.age / 0.45);
      const x = gi.from.x + (gi.pos.x - gi.from.x) * t;
      const z = gi.from.z + (gi.pos.z - gi.from.z) * t;
      const y = t < 1 ? Math.sin(t * Math.PI) * 1.2 : 0;
      v.position.set(x, y, z);
      if (t < 1) {
        v.rotation.x = t * Math.PI * 4;
      } else v.rotation.x = 0;
    }
    for (const [gi, v] of this.groundViews) {
      if (!gseen.has(gi)) {
        v.removeFromParent();
        this.groundViews.delete(gi);
      }
    }

    // projectiles
    const pseen = new Set<Projectile>();
    for (const pr of level.projectiles) {
      pseen.add(pr);
      let v = this.projViews.get(pr);
      if (!v) {
        v = makeProjectile(pr.kind);
        this.dynGroup.add(v.group);
        this.projViews.set(pr, v);
      }
      v.group.position.set(pr.pos.x, 1.0, pr.pos.z);
      v.group.rotation.y = Math.atan2(pr.vel.x, pr.vel.z);
      const trail = pr.kind === 'firebolt' || pr.kind === 'fireball' ? '#ff6010' : pr.kind === 'iceshard' ? '#80c8ff' : pr.kind === 'holybolt' ? '#fff0b0' : pr.kind === 'chargedbolt' ? '#a0b0ff' : null;
      if (trail && Math.random() < 0.8) this.fx.add.spawn({ x: pr.pos.x, y: 1.0, z: pr.pos.z, vy: 0.3, color: trail, size: pr.kind === 'fireball' ? 0.5 : 0.25, life: 0.3 });
    }
    for (const [pr, v] of this.projViews) {
      if (!pseen.has(pr)) {
        v.group.removeFromParent();
        this.projViews.delete(pr);
        // impact puff
        const c = pr.kind === 'iceshard' ? '#a0e0ff' : pr.kind === 'arrow' ? '#a08060' : '#ff8030';
        this.fx.sparks(pr.pos.x, 1, pr.pos.z, c, 6, 2, 0.12, 0.25, 3);
      }
    }

    // hammers
    const hseen = new Set<Hammer>();
    for (const h of level.hammers) {
      hseen.add(h);
      let v = this.hammerViews.get(h);
      if (!v) {
        v = makeHammer();
        this.dynGroup.add(v);
        this.hammerViews.set(h, v);
      }
      v.position.set(h.pos.x, 0.9, h.pos.z);
      v.rotation.y += dt * 18;
      if (Math.random() < 0.9) this.fx.add.spawn({ x: h.pos.x, y: 0.9, z: h.pos.z, color: '#6080ff', size: 0.35, life: 0.35, vy: 0.2 });
    }
    for (const [h, v] of this.hammerViews) {
      if (!hseen.has(h)) {
        v.removeFromParent();
        this.hammerViews.delete(h);
      }
    }

    // objects
    this.syncObjects(level, dt);

    // torch flames flicker
    for (const f of this.flames) f.scale.setScalar(0.8 + Math.random() * 0.25);
    for (const t of level.layout.torches) {
      if (Math.random() < dt * 6) this.fx.add.spawn({ x: t.x + t.nx * 0.33 + (Math.random() - 0.5) * 0.08, y: 1.95, z: t.z + t.nz * 0.33 + (Math.random() - 0.5) * 0.08, vy: 0.7, color: '#ffa040', size: 0.14, life: 0.5 });
    }
    if (level.layout.campfire) {
      const c = level.layout.campfire;
      for (let k = 0; k < 3; k++) {
        if (Math.random() < dt * 30) this.fx.add.spawn({ x: c.x + (Math.random() - 0.5) * 0.5, y: 0.2, z: c.z + (Math.random() - 0.5) * 0.5, vy: 1.4 + Math.random(), vx: (Math.random() - 0.5) * 0.3, color: Math.random() < 0.5 ? '#ff6010' : '#ffb040', size: 0.4 + Math.random() * 0.3, life: 0.7, gravity: -0.5 });
      }
    }

    this.assignLights();
    this.fx.update(dt);

    this.webgl.render(this.scene, this.camera);
    const ps = this.project(new THREE.Vector3(p.pos.x, 1.0, p.pos.z));
    this.playerScreen = ps;
  }

  private assignLights() {
    const p = this.game.player;
    const level = this.game.level;
    // static: torches, campfire, waypoint, portals
    const cands: { pos: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; flicker: number; d: number }[] = [];
    for (const s of this.staticLights) cands.push({ ...s, d: (s.pos.x - p.pos.x) ** 2 + (s.pos.z - p.pos.z) ** 2 });
    for (const [o, v] of this.objViews) {
      if (v.lightColor) cands.push({ pos: new THREE.Vector3(o.pos.x, 1.2, o.pos.z), color: new THREE.Color(v.lightColor), intensity: v.lightIntensity ?? 10, distance: 7, flicker: 0.3, d: (o.pos.x - p.pos.x) ** 2 + (o.pos.z - p.pos.z) ** 2 });
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < TORCH_LIGHTS; i++) {
      const l = this.torchLights[i];
      const c = cands[i];
      if (c && c.d < 22 * 22) {
        l.position.copy(c.pos);
        l.color.copy(c.color);
        l.distance = c.distance;
        l.intensity = c.intensity * (1 + (Math.random() - 0.5) * 0.25 * c.flicker);
      } else l.intensity = 0;
    }
    // fx: projectiles, hammers, flashes
    const fx: { pos: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; d: number }[] = [];
    for (const f of this.fx.flashes) {
      const k = 1 - f.t / f.dur;
      fx.push({ pos: f.pos, color: f.color, intensity: f.intensity * k, distance: f.distance, d: (f.pos.x - p.pos.x) ** 2 + (f.pos.z - p.pos.z) ** 2 - 10 });
    }
    for (const [pr, v] of this.projViews) {
      if (!v.light) continue;
      fx.push({ pos: new THREE.Vector3(pr.pos.x, 1.0, pr.pos.z), color: new THREE.Color(v.light), intensity: 12, distance: 5, d: (pr.pos.x - p.pos.x) ** 2 + (pr.pos.z - p.pos.z) ** 2 });
    }
    for (const h of level.hammers) fx.push({ pos: new THREE.Vector3(h.pos.x, 1, h.pos.z), color: new THREE.Color('#6080ff'), intensity: 14, distance: 5, d: (h.pos.x - p.pos.x) ** 2 + (h.pos.z - p.pos.z) ** 2 });
    fx.sort((a, b) => a.d - b.d);
    for (let i = 0; i < FX_LIGHTS; i++) {
      const l = this.fxLights[i];
      const c = fx[i];
      if (c) {
        l.position.copy(c.pos);
        l.color.copy(c.color);
        l.distance = c.distance;
        l.intensity = c.intensity;
      } else l.intensity = 0;
    }
  }

  // ─────────────────────────── picking & projection ───────────────────────────

  project(v: THREE.Vector3): { x: number; y: number } {
    this.tmpV.copy(v).project(this.camera);
    return { x: (this.tmpV.x * 0.5 + 0.5) * this.width, y: (-this.tmpV.y * 0.5 + 0.5) * this.height };
  }

  projectP(p: P2, y: number) {
    return this.project(new THREE.Vector3(p.x, y, p.z));
  }

  screenToGround(x: number, y: number): P2 | null {
    const ndc = new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return { x: hit.x, z: hit.z };
  }

  pickMonster(x: number, y: number, list: Monster[]): Monster | null {
    let best: Monster | null = null;
    let bestD = Infinity;
    for (const m of list) {
      const h = 0.85 * m.def.scale * (m.rank === 'champion' ? 1.1 : m.rank === 'unique' ? 1.18 : 1);
      const s = this.project(new THREE.Vector3(m.pos.x, h, m.pos.z));
      const rx = m.radius * this.pxPerUnit * 1.3 + 8;
      const ry = h * this.pxPerUnit * 0.85 + 8;
      const dx = (x - s.x) / rx;
      const dy = (y - s.y) / ry;
      const d = dx * dx + dy * dy;
      if (d < 1 && d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  pickObject(x: number, y: number, list: WorldObject[]): WorldObject | null {
    let best: WorldObject | null = null;
    let bestD = Infinity;
    for (const o of list) {
      const h = o.kind === 'vendor' || o.kind === 'portal' ? 0.9 : o.kind === 'stairs' || o.kind === 'waypoint' ? 0.1 : 0.35;
      const s = this.project(new THREE.Vector3(o.pos.x, h, o.pos.z));
      const r = (o.kind === 'stairs' || o.kind === 'waypoint' ? 1.0 : o.radius + 0.15) * this.pxPerUnit;
      const ry = o.kind === 'vendor' || o.kind === 'portal' ? this.pxPerUnit * 1.0 : r * 0.75;
      const dx = (x - s.x) / r;
      const dy = (y - s.y) / ry;
      const d = dx * dx + dy * dy;
      if (d < 1 && d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }
}

function smoothAngle(cur: number, target: number, t: number): number {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, t);
}
