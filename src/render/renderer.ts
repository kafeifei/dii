import * as THREE from 'three';
import type { P2 } from '../core/math';
import { SKILL_BY_ID } from '../data/skills';
import type { Game, Picker } from '../game/game';
import type { Level } from '../game/level';
import type { Layout } from '../world/levelgen';
import type { Monster } from '../game/monster';
import type { GroundItem, Hammer, Projectile, WorldObject } from '../game/objects';
import type { Player } from '../game/player';
import { itemColor } from '../items/item';
import { T_FLOOR, T_PROP, T_WALL } from '../world/tilemap';
import { Effects } from './effects';
import { assets } from './assets';
import { monsterLook, playerLook, playerLookKey, vendorLook } from './looks';
import { ModelRig, type ModelSpec } from './models';
import { GRADES, Post } from './post';
import { ambientMotes, applyLavaGlow, Mist } from './atmosphere';
import { makeGround } from './ground';
import { skyAt, type SkyLook } from './sky';
import { SHRINE_BY_ID } from '../data/shrines';
import {
  assetProp, glowSprite, makeBarrel, makeBrazier, makeHouse, makeChest, makeDecor, makeGroundItem, makeHammer, makePortal, makeProjectile, makeStairs, makeTorch, makeTree, makeWaypoint, topCentroid,
} from './props';
import { Rig, type AnimInput, type RigLook } from './rig';
import { monsterSpec, npcSpec, playerSpec, vendorSpec } from './specs';
import { aimLineTexture, glowTexture, ringTexture, runeCircleTexture, shadowTexture, tileTexture } from './textures';

const CAM_YAW = Math.PI / 4;
const CAM_PITCH = 0.68; // ~39°
const CAM_DIST = 40;
/** the screen's right as a direction on the ground: the camera never turns, so it never changes (sounds pan by it) */
const SCREEN_RIGHT: P2 = { x: Math.cos(CAM_YAW), z: -Math.sin(CAM_YAW) };
const WALL_H = 1.9;
/**
 * Point lights for the nearest torches and for effects, per lighting setting: every point light
 * costs every lit pixel a pass, so only the nearest few get one.
 */
export const LIGHT_POOLS = { low: [2, 1], mid: [4, 3], high: [6, 5] } as const;
export type LightLevel = keyof typeof LIGHT_POOLS;
/** static props are batched per model per block this many tiles square, so blocks off screen are culled */
const PROP_BLOCK = 16;

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

/**
 * Map the texture by world position so one painted image spans several tiles: floors across x/z
 * (`size` metres per image), walls along each face and up from the floor.
 */
function applyWorldUv(mat: THREE.Material, mode: 'floor' | 'wall', size: number) {
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

/** theme tint for prop materials: [colour, amount] */
const PROP_TINT: Record<string, [string, number]> = {
  ice: ['#a8d0ff', 0.4],
  hell: ['#ff8a6a', 0.22],
  cave: ['#c8a088', 0.12],
};

const IDLE_ANIM: AnimInput = { state: 'idle', stateTime: 0, stateDur: 0, speed: 0, dead: false, deathTime: 0, hitFlash: 0, chilled: false, poisoned: false, blood: 'red', killedBy: 'phys' };

interface CharRig {
  root: THREE.Group;
  update(dt: number, a: AnimInput): void;
  dispose(): void;
}

/**
 * Opaque lit meshes cast the hero light's shadows and everything lit receives them; glows, decals
 * and other unlit or see-through things do neither.
 */
function castShadows(root: THREE.Object3D, cast = true) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const lit = mats.every((x) => !(x as THREE.MeshBasicMaterial).isMeshBasicMaterial && !x.transparent);
    m.castShadow = cast && lit;
    m.receiveShadow = lit;
  });
}

/** CC0 model when the packs loaded, procedural rig otherwise */
function makeCharRig(spec: () => ModelSpec, look: () => RigLook): CharRig {
  if (assets.ready && !assets.failed) {
    const s = spec();
    if (assets.get(s.model)) return new ModelRig(s);
  }
  return new Rig(look());
}

interface ActorView {
  rig: CharRig;
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
  private post: Post;
  zoom = 7.2;
  private zoomTarget = 7.2;
  /** phones: the view is zoomed by screen height, so heroes stay a fair size on a small screen */
  private touchView = false;
  private camTarget = new THREE.Vector3();
  /** progress between the last two sim steps, for interpolated drawing */
  private alpha = 1;
  private levelGroup = new THREE.Group();
  private dynGroup = new THREE.Group();
  private occ: OccUniforms = { uPlayer: { value: new THREE.Vector3() }, uCamDir: { value: new THREE.Vector2(Math.sin(CAM_YAW), Math.cos(CAM_YAW)) } };
  private hemi = new THREE.HemisphereLight('#4a5070', '#100808', 0.4);
  private dir = new THREE.DirectionalLight('#8090c0', 0.3);
  /** fill on the camera side of the hero, so the faces we see are lit */
  private playerLight = new THREE.PointLight('#ffd0a0', 30, 13, 1.4);
  /**
   * Right above the hero, the one light that casts shadows: whatever stands around throws its shadow
   * outward, away from the hero. Not on the camera side, where a wall in front would shade the hero.
   */
  private heroLight = new THREE.PointLight('#ffd0a0', 30, 13, 1.4);
  private shadows = true;
  private mist: Mist | null = null;
  private lavaTime = { value: 0 };
  private torchLights: THREE.PointLight[] = [];
  private fxLights: THREE.PointLight[] = [];
  private staticLights: { pos: THREE.Vector3; color: THREE.Color; intensity: number; flicker: number; distance: number }[] = [];
  private flames: THREE.Sprite[] = [];
  private flameSpots: THREE.Vector3[] = [];
  private monsterViews = new Map<Monster, ActorView>();
  private playerView: ActorView | null = null;
  private vendorView: ActorView | null = null;
  private npcViews: ActorView[] = [];
  private propMats = new Map<string, THREE.Material>();
  private flameSpots2 = new Map<string, THREE.Vector3>();
  private groundViews = new Map<GroundItem, THREE.Group>();
  private projViews = new Map<Projectile, { group: THREE.Group; light: string | null }>();
  private hammerViews = new Map<Hammer, THREE.Group>();
  private objViews = new Map<WorldObject, ObjView>();
  private auraDecal: THREE.Mesh;
  private shieldGlow: THREE.Sprite;
  /** phones: the ring under the enemy the skill buttons go for, and a dragged button's aim */
  private targetRing: THREE.Mesh;
  private aimLine: THREE.Mesh;
  private aimSpot: THREE.Mesh;
  private shadowGeo = new THREE.PlaneGeometry(1, 1);
  private shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** an outdoor map's blended ground */
  private ground: ReturnType<typeof makeGround> | null = null;
  /** where the shadow-casting light stands from the view's centre: the sun or the moon outdoors */
  private sunOffset = new THREE.Vector3(-8, 20, 4);
  /** how much lanterns, fires and the hero's light count: all of it below ground and by night */
  private lamps = 1;
  /** 1 by night under the sky (or below ground), 0 by day: how dark past the hero's light */
  night = 1;
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
    antialias = true,
  ) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(this.pixelRatio);
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.15;
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.post = new Post(this.webgl, this.scene, this.camera, antialias);
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    const hs = this.heroLight.shadow;
    hs.mapSize.set(1024, 1024);
    hs.camera.near = 0.2;
    hs.bias = -0.004;
    hs.normalBias = 0.02;
    hs.radius = 3;
    // moonlight over the camp
    const ds = this.dir.shadow;
    ds.mapSize.set(2048, 2048);
    Object.assign(ds.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 60 });
    ds.camera.updateProjectionMatrix();
    ds.bias = -0.0008;
    ds.normalBias = 0.03;
    ds.radius = 2;
    this.scene.add(this.levelGroup, this.dynGroup, this.hemi, this.dir, this.dir.target, this.playerLight, this.heroLight);
    this.setLights('mid');
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
    const decal = (geo: THREE.BufferGeometry, map: THREE.Texture) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.renderOrder = 6;
      m.visible = false;
      this.scene.add(m);
      return m;
    };
    this.targetRing = decal(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringTexture());
    // from the hero (z = 0) out along +z, one unit long: scaled to the reach, turned to the aim
    this.aimLine = decal(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5), aimLineTexture());
    this.aimSpot = decal(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringTexture());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** bloom, tone mapping after it, and the theme's colour grade (the post effects setting) */
  setPost(on: boolean) {
    this.post.enabled = on;
    if (this.mist) this.mist.group.visible = on;
  }

  /** the hero light's shadows, and the moon's in the camp (the shadows setting) */
  setShadows(on: boolean) {
    this.shadows = on;
    this.applyShadows();
  }

  /** in the camp the moon throws the shadows; the hero's light there is faint */
  private applyShadows() {
    const outdoor = !!this.level?.layout.theme.outdoor;
    this.heroLight.castShadow = this.shadows && !outdoor;
    this.dir.castShadow = this.shadows && outdoor;
  }

  /** the pools of point lights (the lighting setting); the shaders recompile for the new count */
  setLights(level: LightLevel) {
    for (const l of [...this.torchLights, ...this.fxLights]) this.scene.remove(l);
    const [torches, fx] = LIGHT_POOLS[level];
    this.torchLights = Array.from({ length: torches }, () => new THREE.PointLight('#ff9040', 0, 9, 1.6));
    this.fxLights = Array.from({ length: fx }, () => new THREE.PointLight('#ffffff', 0, 8, 1.6));
    this.scene.add(...this.torchLights, ...this.fxLights);
  }

  /**
   * Device pixels per CSS pixel. 'auto': at most 1.5 — the fixed isometric view gains little from
   * more, and shading is most of the frame — stepped down (to 1:1) when frames keep running long.
   * Otherwise a fixed share of the screen's own resolution (the resolution setting).
   */
  private resolution: 'auto' | number = 'auto';
  private pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  private slowTime = 0;
  get renderScale() {
    return this.pixelRatio / window.devicePixelRatio;
  }
  setResolution(r: 'auto' | number) {
    this.resolution = r;
    this.pixelRatio = r === 'auto' ? Math.min(window.devicePixelRatio, 1.5) : Math.max(0.5, window.devicePixelRatio * r);
    this.slowTime = 0;
    this.webgl.setPixelRatio(this.pixelRatio);
    this.resize();
  }
  private adaptResolution(dt: number) {
    if (this.resolution !== 'auto' || document.visibilityState !== 'visible' || dt >= 0.1) return;
    // under ~45 fps for two seconds: one step down
    this.slowTime = dt > 1 / 45 ? this.slowTime + dt : Math.max(0, this.slowTime - dt * 0.5);
    if (this.slowTime > 2 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.slowTime = 0;
      this.webgl.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  setTouchView(on: boolean) {
    this.touchView = on;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // about 42 px a metre (a desktop at 800px tall gets 55): a phone on its side shows less ground
    if (this.touchView) this.zoom = this.zoomTarget = Math.max(3.4, Math.min(7.2, h / 84));
    this.width = w;
    this.height = h;
    this.webgl.setSize(w, h, false);
    this.post.setSize(w, h, this.webgl.getPixelRatio());
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
    // sounds pan all the way at the screen's edge, wherever the zoom puts it
    this.game.sfx.setView(SCREEN_RIGHT, this.camera.right);
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
      // prop instances borrow the model templates' geometry: keep it
      if (m.isMesh && (m as THREE.InstancedMesh).isInstancedMesh && !m.userData.sharedGeometry) m.geometry.dispose();
    });
    for (const n of this.npcViews) {
      n.rig.dispose();
      n.shadow.removeFromParent();
    }
    this.npcViews = [];
    this.levelGroup.clear();
    this.dynGroup.clear();
    this.fx.clearLevel();
    this.flames = [];
    this.flameSpots = [];
    this.staticLights = [];

    const L = level.layout;
    const theme = L.theme;
    const map = L.map;
    this.scene.background = new THREE.Color(theme.bg);
    this.sunOffset.set(-8, 20, 4);
    this.lamps = 1;
    this.night = 1;
    this.post.setGrade(GRADES[theme.key] ?? GRADES.crypt);
    this.hemi.color.set(theme.ambient);
    this.hemi.groundColor.set('#0a0606');
    this.hemi.intensity = theme.ambientIntensity * 2.8;
    const outdoor = !!theme.outdoor;
    this.dir.color.set(outdoor ? '#8aa0d8' : theme.ambient);
    this.dir.intensity = outdoor ? 0.9 : 0.25;
    this.applyShadows();
    // the hero's light, split between the shadow-casting light overhead and the camera-side fill
    this.heroLight.intensity = outdoor ? 11 : 25;
    this.playerLight.intensity = outdoor ? 7 : 15;

    // floor
    const floorTiles: [number, number][] = [];
    const wallTiles: [number, number][] = [];
    const pillarTiles: [number, number][] = [];
    const inHouse = (x: number, y: number) => (L.houses ?? []).some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.get(x, y);
        if (t === T_FLOOR || t === T_PROP) floorTiles.push([x, y]);
        else if (t === T_WALL && inHouse(x, y)) floorTiles.push([x, y]);
        else if (t === T_WALL) {
          if (L.pillars.has(y * map.w + x)) pillarTiles.push([x, y]);
          else wallTiles.push([x, y]);
        }
      }
    }
    // outdoor maps: one blended ground for the whole map; elsewhere a tile for each floor square
    this.ground?.dispose();
    this.ground = L.ground ? makeGround(map.w, map.h, L.ground, theme.key) : null;
    if (this.ground) {
      this.ground.edge.set(theme.bg);
      this.levelGroup.add(this.ground.mesh);
    }
    const m4 = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    let i = 0;
    let floor: THREE.InstancedMesh | null = null;
    if (!this.ground) {
      const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture(`${theme.key}_floor`), roughness: 0.95, metalness: 0 });
      applyWorldUv(floorMat, 'floor', 4);
      if (theme.key === 'hell') applyLavaGlow(floorMat, this.lavaTime);
      const floorGeo = new THREE.PlaneGeometry(1, 1);
      floorGeo.rotateX(-Math.PI / 2);
      floor = new THREE.InstancedMesh(floorGeo, floorMat, floorTiles.length + pillarTiles.length);
      const q = new THREE.Quaternion();
      for (const [x, y] of [...floorTiles, ...pillarTiles]) {
        m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), q, one);
        floor.setMatrixAt(i, m4);
        // ambient occlusion near walls, and a faint per-tile variation
        let walls = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.get(x + dx, y + dy) === T_WALL) walls++;
        const v = (0.95 + Math.random() * 0.1) * (1 - walls * 0.12);
        floor.setColorAt(i, col.setRGB(v, v, v));
        i++;
      }
      floor.instanceMatrix.needsUpdate = true;
      if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
      this.levelGroup.add(floor);
    }

    // walls
    const sideMat = new THREE.MeshStandardMaterial({ map: tileTexture(`${theme.key === 'wild' ? 'crypt' : theme.key}_wall`), roughness: 0.92 });
    // the wilderness's ruins are broken off low, so their tops show stone; other walls are capped in shadow
    const topMat =
      theme.key === 'wild'
        ? new THREE.MeshStandardMaterial({ map: tileTexture('crypt_wall'), roughness: 0.95 })
        : new THREE.MeshStandardMaterial({ color: new THREE.Color(theme.wall).lerp(new THREE.Color(theme.wallDark), 0.35), roughness: 1 });
    if (theme.key === 'wild') applyWorldUv(topMat, 'floor', 2);
    applyOcclusionFade(sideMat, this.occ);
    applyWorldUv(sideMat, 'wall', 2);
    applyOcclusionFade(topMat, this.occ);
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    wallGeo.translate(0, WALL_H / 2, 0);
    const walls = new THREE.InstancedMesh(wallGeo, [sideMat, sideMat, topMat, topMat, sideMat, sideMat], wallTiles.length);
    i = 0;
    for (const [x, y] of wallTiles) {
      // the town's palisade is uneven; the wilderness's walls are ruins, broken down low
      const hJ = level.areaAt(x + 0.5, y + 0.5).kind === 'town' ? 0.85 + Math.random() * 0.25 : theme.key === 'wild' ? 0.2 + Math.random() * 0.4 : 0.96 + Math.random() * 0.08;
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
      let pGeo: THREE.BufferGeometry;
      let pMat: THREE.Material = sideMat;
      const tpl = assets.ready ? assets.get('d_pillar_decorated') : undefined;
      const pMesh = tpl ? (tpl.gltf.scene.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined) : undefined;
      if (tpl && pMesh) {
        // bake the node transform + fit to one tile, ~WALL_H+0.3 tall
        pMesh.updateWorldMatrix(true, false);
        pGeo = pMesh.geometry.clone().applyMatrix4(pMesh.matrixWorld);
        pGeo.translate(-tpl.center.x, -tpl.min.y, -tpl.center.z);
        pGeo.scale(0.95 / tpl.size.x, (WALL_H + 0.3) / tpl.size.y, 0.95 / tpl.size.x);
        pMat = (pMesh.material as THREE.Material).clone();
        applyOcclusionFade(pMat, this.occ);
      } else {
        pGeo = new THREE.CylinderGeometry(0.36, 0.42, WALL_H + 0.3, 8);
        pGeo.translate(0, (WALL_H + 0.3) / 2, 0);
      }
      const pillars = new THREE.InstancedMesh(pGeo, pMat, pillarTiles.length);
      i = 0;
      for (const [x, y] of pillarTiles) {
        m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), new THREE.Quaternion(), one);
        pillars.setMatrixAt(i++, m4);
      }
      this.levelGroup.add(pillars);
    }

    // furniture, wall hangings and town buildings (instanced CC0 models)
    this.buildProps(L);
    // townsfolk
    for (const n of L.npcs ?? []) {
      const rig = makeCharRig(() => npcSpec(n.model), vendorLook);
      rig.root.position.set(n.x, 0, n.z);
      rig.root.rotation.y = n.rot;
      this.scene.add(rig.root);
      castShadows(rig.root);
      const shadow = this.makeShadow(0.4);
      shadow.position.set(n.x, 0.02, n.z);
      this.scene.add(shadow);
      this.npcViews.push({ rig, shadow });
    }

    // torches
    for (const t of L.torches) {
      const { group, flame } = makeTorch(theme.torch);
      group.position.set(t.x, 0, t.z);
      group.rotation.y = Math.atan2(t.nx, t.nz);
      this.levelGroup.add(group);
      this.flames.push(flame);
      group.updateMatrixWorld(true);
      this.flameSpots.push(flame.getWorldPosition(new THREE.Vector3()));
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
    castShadows(this.levelGroup);
    if (floor) floor.castShadow = false;
    if (this.ground) this.ground.mesh.castShadow = false;
    // ground mist, part of the post effects
    this.mist?.dispose();
    this.mist = new Mist(map.w, map.h, theme.key, (x, y) => map.get(x, y) === T_FLOOR || map.get(x, y) === T_PROP);
    this.mist.group.visible = this.post.enabled;
    this.levelGroup.add(this.mist.group);
    // static objects get views lazily in sync()
    this.syncObjects(level, 0);
    this.snapCamera();
  }

  /** the camera on the hero at once instead of following (a level built, a jump across the map) */
  snapCamera() {
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
            if (!ob.used) return;
            lid.rotation.x = Math.max(-1.9, lid.rotation.x - dt * 6);
            if (group.userData.looted === false) {
              group.userData.looted = true;
              group.traverse((c) => {
                const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
                if (m?.color) m.color.multiplyScalar(0.7);
              });
            }
          },
        };
      }
      case 'stash': {
        // the one chest in the camp, the gold-bound kind that opens in the dungeon too, made big and
        // set on a pool of warm light so it is easy to find
        const { group } = makeChest(false);
        group.rotation.y = Math.PI / 4 + Math.PI;
        group.scale.multiplyScalar(1.8);
        // lit from within, not by the camp's pooled lights, which go to whatever is nearest
        group.traverse((c) => {
          const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (!m?.color) return;
          m.color.multiplyScalar(1.5);
          m.emissive = new THREE.Color('#6a4210');
          m.emissiveIntensity = 0.55;
        });
        g.add(group);
        // and a pool of warm light on the ground around it, drawn without lights
        const pool = new THREE.Mesh(
          new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2),
          new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffa040', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        pool.position.y = 0.03;
        g.add(pool);
        return {
          group: g,
          update: () => void ((pool.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(this.time * 1.6) * 0.08),
          lightColor: '#ffb060',
          lightIntensity: 10,
        };
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
      case 'stairs': {
        // the way into the dungeon from under the sky is the big one, with braziers
        const town = !!this.level?.layout.theme.outdoor;
        // the stairway opens toward +z: turn it to face the camera
        const site = new THREE.Group();
        site.rotation.y = CAM_YAW;
        g.add(site);
        site.add(makeStairs(town));
        if (!town) {
          // further down: a dim glow from the stairwell, so the way on shows in a dark room
          const glow = glowSprite('#ff4a18', 2.2, 0.35);
          glow.position.set(0, 0.5, 0.25);
          site.add(glow);
          return { group: g, lightColor: '#ff5a28', lightIntensity: 8 };
        }
        // the way down from the camp: a red glow from the stairwell, rising embers and a brazier on
        // each side of the arch, all drawn without lights so they show from across the camp
        const glow = glowSprite('#ff4a18', 3.2, 0.55);
        glow.position.set(0, 0.6, 0.3);
        site.add(glow);
        const braziers = [-1.65, 1.65].map((x) => {
          const b = makeBrazier();
          b.position.set(x, 0, 1.0);
          site.add(b);
          return b.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), CAM_YAW);
        });
        return {
          group: g,
          update: () => {
            (glow.material as THREE.SpriteMaterial).opacity = 0.45 + Math.sin(this.time * 2.2) * 0.12;
            if (Math.random() < 0.6) {
              this.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 1.2, y: 0.1, z: o.pos.z + (Math.random() - 0.5) * 1.2, vy: 0.9 + Math.random() * 0.8, color: '#ff6a20', size: 0.09, life: 1.6 });
            }
            for (const b of braziers) {
              this.fx.add.spawn({ x: o.pos.x + b.x + (Math.random() - 0.5) * 0.18, y: 1.05, z: o.pos.z + b.z + (Math.random() - 0.5) * 0.18, vy: 1.2, color: Math.random() < 0.5 ? '#ffb040' : '#ff6020', size: 0.16, life: 0.45 });
            }
          },
          lightColor: '#ff6a30',
          lightIntensity: 26,
        };
      }
      case 'waypoint': {
        const { group, rune } = makeWaypoint();
        // bright enough to stay a blue glow over the lit stone once the frame is tone mapped
        (rune.material as THREE.MeshBasicMaterial).color.multiplyScalar(2.2);
        g.add(group);
        return {
          group: g,
          update: (dt) => {
            rune.rotation.z += dt * 0.3;
            (rune.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(this.time * 2) * 0.2;
          },
          lightColor: '#4a90ff',
          lightIntensity: 7,
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
      case 'shrine': {
        // the shrine stone, lit by its own colour until it has been touched
        const color = SHRINE_BY_ID[o.shrine ?? '']?.color ?? '#ffffff';
        const model = assetProp('h_shrine', 0.6);
        if (model) {
          model.rotation.y = CAM_YAW;
          g.add(model);
        }
        const glow = glowSprite(color, 1.8, 0.7);
        glow.position.y = 1.2;
        g.add(glow);
        const view: ObjView = {
          group: g,
          lightColor: color,
          lightIntensity: 9,
          update: (dt, ob) => {
            if (ob.used) {
              if (glow.visible) {
                glow.visible = false;
                view.lightColor = undefined;
              }
              return;
            }
            (glow.material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(this.time * 2.4) * 0.15;
            if (Math.random() < dt * 5) {
              this.fx.add.spawn({ x: o.pos.x + (Math.random() - 0.5) * 0.7, y: 0.3 + Math.random() * 0.9, z: o.pos.z + (Math.random() - 0.5) * 0.7, vy: 0.6, color, size: 0.1, life: 1.2 });
            }
          },
        };
        return view;
      }
      case 'vendor': {
        const rig = makeCharRig(vendorSpec, vendorLook);
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
      case 'corpse': {
        // the hero's body as it fell, in the gear left on it (game/corpse.ts)
        const c = o.corpse;
        if (!c) break;
        const body = { cls: c.cls, equipment: c.equipment } as Player;
        const rig = makeCharRig(() => playerSpec(body), () => playerLook(body));
        rig.root.rotation.y = (o.id * 2.39996) % (Math.PI * 2);
        g.add(rig.root);
        const lying: AnimInput = { state: 'dead', stateTime: 0, stateDur: 0, speed: 0, dead: true, deathTime: 2, hitFlash: 0, chilled: false, poisoned: false, blood: 'red', killedBy: 'phys' };
        // already down when first seen
        rig.update(5, lying);
        return { group: g, update: (dt) => rig.update(dt, lying) };
      }
    }
    return { group: g };
  }

  /** occlusion-faded, theme-tinted copy of a model material (cached) */
  private propMat(src: THREE.Material, theme: string): THREE.Material {
    const key = `${src.uuid}|${theme}`;
    let m = this.propMats.get(key);
    if (!m) {
      const c = (src as THREE.MeshStandardMaterial).clone();
      // KayKit atlases are pale; tone them into the dungeon light
      c.roughness = Math.max(c.roughness, 0.85);
      c.color.multiplyScalar(0.85);
      const tint = PROP_TINT[theme];
      if (tint) c.color.lerp(new THREE.Color(tint[0]), tint[1]);
      applyOcclusionFade(c, this.occ);
      m = c;
      this.propMats.set(key, m);
    }
    return m;
  }

  /** where a lit prop's flame sits, in the model's own space (cached per model) */
  private flameSpot(key: string): THREE.Vector3 | null {
    if (this.flameSpots2.has(key)) return this.flameSpots2.get(key)!;
    const t = assets.get(key);
    if (!t) return null;
    const meshes: THREE.Mesh[] = [];
    t.gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    let spot: THREE.Vector3;
    if (key.includes('lantern')) {
      // the glass: the smallest part of a multi-mesh model, else the middle of the lamp
      const boxes = meshes.map((m) => new THREE.Box3().setFromObject(m));
      const vol = (b: THREE.Box3) => b.getSize(new THREE.Vector3()).toArray().reduce((a, v) => a * v, 1);
      const b = boxes.length > 1 ? boxes.sort((a, c) => vol(a) - vol(c))[0] : boxes[0];
      spot = b.getCenter(new THREE.Vector3());
    } else spot = topCentroid(t.gltf.scene, t.size.y * 0.06);
    this.flameSpots2.set(key, spot);
    return spot;
  }

  private buildProps(L: Layout) {
    const theme = L.theme.key;
    const insts = new Map<string, THREE.Matrix4[]>();
    const add = (key: string, m: THREE.Matrix4) => {
      let l = insts.get(key);
      if (!l) insts.set(key, (l = []));
      l.push(m);
    };
    const yAxis = new THREE.Vector3(0, 1, 0);
    const light = (key: string, m: THREE.Matrix4, color: string, s: number) => {
      const spot = this.flameSpot(key);
      if (!spot) return;
      const pos = spot.clone().applyMatrix4(m);
      this.staticLights.push({ pos: pos.clone().setY(pos.y + 0.1), color: new THREE.Color(color), intensity: 7, flicker: 0.6, distance: 4.5 });
      const glow = glowSprite(color, 0.5 * Math.min(1.4, s / 0.5), 0.85);
      glow.position.copy(pos);
      glow.userData.base = glow.scale.x;
      this.levelGroup.add(glow);
      this.flames.push(glow);
    };
    for (const p of L.props) {
      const t = assets.get(p.model);
      if (!t) continue;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(yAxis, p.rot), new THREE.Vector3(p.scale, p.scale, p.scale));
      m.multiply(new THREE.Matrix4().makeTranslation(-t.center.x, -t.min.y, -t.center.z));
      add(p.model, m);
      if (p.light) light(p.model, m, p.light, p.scale);
    }
    for (const w of L.wallDecor) {
      const t = assets.get(w.model);
      if (!t) continue;
      // back of the piece against the wall face, centred on the spot
      const off = -t.min.z * w.scale + 0.02;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(w.x + w.nx * off, w.y, w.z + w.nz * off),
        new THREE.Quaternion().setFromAxisAngle(yAxis, Math.atan2(w.nx, w.nz)),
        new THREE.Vector3(w.scale, w.scale, w.scale),
      );
      m.multiply(new THREE.Matrix4().makeTranslation(-t.center.x, 0, 0));
      add(w.model, m);
      if (w.light) light(w.model, m, w.light, w.scale);
    }
    for (const hs of L.houses ?? []) {
      const t = hs.model ? assets.get(hs.model) : undefined;
      if (!t || !hs.model) {
        this.levelGroup.add(makeHouse(hs.w, hs.h, hs.x, hs.y));
        continue;
      }
      const rot = hs.rot ?? 0;
      const turned = Math.abs(Math.sin(rot)) > 0.5;
      const s = Math.min(hs.w / (turned ? t.size.z : t.size.x), hs.h / (turned ? t.size.x : t.size.z)) * 1.08;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(hs.x + hs.w / 2, 0, hs.y + hs.h / 2), new THREE.Quaternion().setFromAxisAngle(yAxis, rot), new THREE.Vector3(s, s, s));
      m.multiply(new THREE.Matrix4().makeTranslation(-t.center.x, -t.min.y, -t.center.z));
      add(hs.model, m);
    }
    const tmp = new THREE.Matrix4();
    for (const [key, all] of insts) {
      const t = assets.get(key)!;
      const blocks = new Map<string, THREE.Matrix4[]>();
      for (const pm of all) {
        const b = `${Math.floor(pm.elements[12] / PROP_BLOCK)},${Math.floor(pm.elements[14] / PROP_BLOCK)}`;
        const list = blocks.get(b);
        if (list) list.push(pm);
        else blocks.set(b, [pm]);
      }
      for (const list of blocks.values()) {
        t.gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = Array.isArray(mesh.material) ? mesh.material.map((x) => this.propMat(x, theme)) : this.propMat(mesh.material, theme);
          const im = new THREE.InstancedMesh(mesh.geometry, mat, list.length);
          list.forEach((pm, i) => im.setMatrixAt(i, tmp.multiplyMatrices(pm, mesh.matrixWorld)));
          im.instanceMatrix.needsUpdate = true;
          im.userData.sharedGeometry = true;
          im.computeBoundingSphere();
          this.levelGroup.add(im);
        });
      }
    }
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
        castShadows(v.group);
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

  /** where to draw a sim object this frame: between its last two sim steps */
  /** phones: a ring under the enemy the skill buttons go for (red once fighting it), and a dragged button's aim */
  private updateTouchMarks(pp: P2) {
    const g = this.game;
    const tgt = g.player.dead ? null : g.touchTarget;
    this.targetRing.visible = !!tgt && !tgt.dead;
    if (tgt && !tgt.dead) {
      const at = this.at(tgt);
      const mat = this.targetRing.material as THREE.MeshBasicMaterial;
      const locked = g.touchLocked;
      mat.color.set(locked ? '#ff4a2a' : '#ffb060');
      mat.opacity = (locked ? 0.85 : 0.5) + Math.sin(this.time * 6) * 0.1;
      this.targetRing.position.set(at.x, 0.04, at.z);
      this.targetRing.scale.setScalar((tgt.radius + 0.3) * 2.2);
    }
    const aim = g.player.dead ? null : g.aimPreview;
    this.aimLine.visible = !!aim;
    this.aimSpot.visible = aim?.shape === 'spot';
    if (!aim) return;
    const dx = aim.point.x - pp.x;
    const dz = aim.point.z - pp.z;
    const lineMat = this.aimLine.material as THREE.MeshBasicMaterial;
    lineMat.color.set('#ffd27a');
    lineMat.opacity = aim.shape === 'spot' ? 0.45 : 0.75;
    this.aimLine.position.set(pp.x, 0.05, pp.z);
    this.aimLine.rotation.y = Math.atan2(dx, dz);
    this.aimLine.scale.set(aim.shape === 'spot' ? 0.4 : 0.8, 1, Math.max(0.01, Math.hypot(dx, dz)));
    if (aim.shape === 'spot') {
      const spotMat = this.aimSpot.material as THREE.MeshBasicMaterial;
      spotMat.color.set('#ffd27a');
      spotMat.opacity = 0.8 + Math.sin(this.time * 8) * 0.15;
      this.aimSpot.position.set(aim.point.x, 0.05, aim.point.z);
      this.aimSpot.scale.setScalar(aim.radius * 2.2);
    }
  }

  /** the camp's and the wilderness's light at this time of day */
  private applySky(s: SkyLook) {
    this.dir.color.copy(s.sun);
    this.dir.intensity = s.sunIntensity;
    this.sunOffset.copy(s.dir).multiplyScalar(22);
    this.hemi.color.copy(s.sky);
    this.hemi.groundColor.copy(s.bounce);
    this.hemi.intensity = s.skyIntensity;
    (this.scene.background as THREE.Color).copy(s.bg);
    this.ground?.edge.copy(s.bg);
    if (this.post.enabled) this.post.setGrade(s.grade);
    this.mist?.setSky(s.sky, s.mist);
    this.lamps = s.lamps;
    this.night = 1 - s.day;
    // the hero's light is a lantern's: it matters by night, barely by day
    this.heroLight.intensity = 11 * (0.3 + 0.7 * s.lamps);
    this.playerLight.intensity = 7 * (0.3 + 0.7 * s.lamps);
  }

  private at(o: { pos: P2; prevPos: P2 }): P2 {
    const dx = o.pos.x - o.prevPos.x;
    const dz = o.pos.z - o.prevPos.z;
    // a jump (teleport, level change) snaps instead of sliding across the map
    if (dx * dx + dz * dz > 4) return o.pos;
    return { x: o.prevPos.x + dx * this.alpha, z: o.prevPos.z + dz * this.alpha };
  }

  render(dt: number, alpha = 1) {
    const g = this.game;
    const level = g.level;
    if (!level) return;
    this.time += dt;
    this.alpha = alpha;
    this.adaptResolution(dt);
    const p = g.player;
    const pp = this.at(p);

    // zoom
    if (g.input.wheel && !g.input.overUI) this.zoomTarget = Math.min(11, Math.max(4.5, this.zoomTarget + g.input.wheel * 0.6));
    if (Math.abs(this.zoomTarget - this.zoom) > 0.01) {
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 8);
      this.updateFrustum();
    }

    // camera follow
    this.camTarget.x += (pp.x - this.camTarget.x) * Math.min(1, dt * 10);
    this.camTarget.z += (pp.z - this.camTarget.z) * Math.min(1, dt * 10);
    const sh = this.fx.shakeAmount;
    const sx = sh > 0 ? (Math.random() - 0.5) * sh * 0.5 : 0;
    const sz = sh > 0 ? (Math.random() - 0.5) * sh * 0.5 : 0;
    const off = new THREE.Vector3(Math.sin(CAM_YAW) * Math.cos(CAM_PITCH), Math.sin(CAM_PITCH), Math.cos(CAM_YAW) * Math.cos(CAM_PITCH)).multiplyScalar(CAM_DIST);
    this.camera.position.set(this.camTarget.x + off.x + sx, off.y, this.camTarget.z + off.z + sz);
    this.camera.lookAt(this.camTarget.x + sx, 0, this.camTarget.z + sz);
    if (level.layout.theme.outdoor) this.applySky(skyAt(g.clock));
    this.dir.position.set(this.camTarget.x + this.sunOffset.x, this.sunOffset.y, this.camTarget.z + this.sunOffset.z);
    this.dir.target.position.set(this.camTarget.x, 0, this.camTarget.z);
    this.occ.uPlayer.value.set(pp.x, 0, pp.z);

    // player light
    const lr = p.stats.lightRadius;
    // offset toward the camera so the faces we actually see are lit
    this.playerLight.position.set(pp.x + 1.1, 2.6, pp.z + 1.1);
    this.playerLight.distance = (level.layout.theme.outdoor ? 11 : 14) + lr * 1.2;
    this.heroLight.position.set(pp.x, 3.4, pp.z);
    this.heroLight.distance = this.playerLight.distance;

    // player rig
    const key = playerLookKey(p);
    if (!this.playerView || this.playerView.key !== key) {
      if (this.playerView) {
        this.playerView.rig.dispose();
        this.playerView.shadow.removeFromParent();
      }
      const rig = makeCharRig(() => playerSpec(p), () => playerLook(p));
      // the light is overhead: the hero's own shadow would be a dark disc around the feet
      castShadows(rig.root, false);
      this.scene.add(rig.root);
      const shadow = this.makeShadow(p.radius);
      this.scene.add(shadow);
      this.playerView = { rig, shadow, key };
    }
    const pv = this.playerView;
    pv.rig.root.position.x = pp.x;
    pv.rig.root.position.z = pp.z;
    if (!p.dead) pv.rig.root.position.y = 0;
    pv.rig.root.rotation.y = smoothAngle(pv.rig.root.rotation.y, p.facing, dt * 18);
    // the hero's attacks, casts, hit recoveries and blocks last Diablo II's frames: the clips fit them exactly
    pv.rig.update(dt, { ...this.anim(p, p.moveSpeed() * p.slowFactor() * (p.state === 'charge' ? 2.5 : 1), 'red'), exact: true });
    pv.shadow.position.set(pp.x, 0.02, pp.z);

    for (const n of this.npcViews) n.rig.update(dt, IDLE_ANIM);

    // aura decal
    if (p.activeAura && !p.dead && p.skillLevel(p.activeAura) > 0) {
      const def = SKILL_BY_ID[p.activeAura];
      this.auraDecal.visible = true;
      (this.auraDecal.material as THREE.MeshBasicMaterial).color.set(def.color);
      const r = p.skillParams(p.activeAura).radius ?? 2.2;
      this.auraDecal.scale.setScalar(Math.min(r, 4) * 2 * 0.9);
      this.auraDecal.position.set(pp.x, 0.03, pp.z);
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
      this.shieldGlow.position.set(pp.x, 1.0, pp.z);
      this.shieldGlow.material.opacity = 0.2 + Math.sin(this.time * 3) * 0.05;
    }

    this.updateTouchMarks(pp);

    // monsters
    const seen = new Set<Monster>();
    for (const m of level.monsters) {
      const d2 = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
      let v = this.monsterViews.get(m);
      if (!v) {
        if (d2 > 30 * 30) continue;
        const rig = makeCharRig(() => monsterSpec(m), () => monsterLook(m));
        castShadows(rig.root);
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
      const mp = this.at(m);
      v.rig.root.position.x = mp.x;
      v.rig.root.position.z = mp.z;
      if (!m.dead) v.rig.root.rotation.y = smoothAngle(v.rig.root.rotation.y, m.facing, dt * 12);
      const hover = g.hover.monster === m;
      v.rig.update(dt, this.anim({ ...m, hitFlash: Math.max(m.hitFlash, hover ? 0.12 : 0) }, m.speed * m.slowFactor(), m.def.blood));
      v.shadow.position.set(mp.x, 0.02, mp.z);
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
      const prp = this.at(pr);
      v.group.position.set(prp.x, 1.0, prp.z);
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
    for (const f of this.flames) f.scale.setScalar((f.userData.base ?? 1) * (0.8 + Math.random() * 0.25));
    for (const f of this.flameSpots) {
      if (Math.random() < dt * 6) this.fx.add.spawn({ x: f.x + (Math.random() - 0.5) * 0.08, y: f.y + 0.05, z: f.z + (Math.random() - 0.5) * 0.08, vy: 0.7, color: '#ffa040', size: 0.14, life: 0.5 });
    }
    for (const s of level.layout.services) {
      if (s.kind !== 'campfire') continue;
      const c = s.pos;
      for (let k = 0; k < 3; k++) {
        if (Math.random() < dt * 30) this.fx.add.spawn({ x: c.x + (Math.random() - 0.5) * 0.5, y: 0.2, z: c.z + (Math.random() - 0.5) * 0.5, vy: 1.4 + Math.random(), vx: (Math.random() - 0.5) * 0.3, color: Math.random() < 0.5 ? '#ff6010' : '#ffb040', size: 0.4 + Math.random() * 0.3, life: 0.7, gravity: -0.5 });
      }
    }

    this.lavaTime.value += dt;
    this.mist?.update(dt);
    if (this.post.enabled) ambientMotes(this.fx, level.layout.theme.key, dt, pp, this.camTarget, this.night);
    this.assignLights();
    this.fx.update(dt);

    this.post.render(dt);
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
    for (let i = 0; i < this.torchLights.length; i++) {
      const l = this.torchLights[i];
      const c = cands[i];
      if (c && c.d < 22 * 22) {
        l.position.copy(c.pos);
        l.color.copy(c.color);
        l.distance = c.distance;
        l.intensity = c.intensity * this.lamps * (1 + (Math.random() - 0.5) * 0.25 * c.flicker);
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
    for (let i = 0; i < this.fxLights.length; i++) {
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
