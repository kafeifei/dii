import * as THREE from 'three';
import type { P2 } from '../core/math';
import { SKILL_BY_ID } from '../data/skills';
import type { Game, Picker } from '../game/game';
import type { Level } from '../game/level';
import type { House, Layout, Npc, Torch } from '../world/levelgen';
import type { Prop, WallDecor } from '../world/furnish';
import { areaDef } from '../world/areas';
import { areaShares, lookMix, type AreaShare } from '../world/seams';
import type { Monster, MonsterAct } from '../game/monster';
import type { GroundItem, Hammer, Projectile, WorldObject } from '../game/objects';
import { itemColor } from '../items/item';
import { T_FLOOR, T_PROP, T_WALL } from '../world/tilemap';
import { Effects } from './effects';
import { assets, HERE, NEXT, NOW, TEXTURE_SLOTS, type Template } from './assets';
import { areaNeeds, levelNeeds, specNeeds } from './needs';
import { monsterLook, playerLook, playerLookKey, vendorLook } from './looks';
import { ModelRig, rigKey } from './models';
import { ownDepth, PropBatches, Scenery, sphereInFrustum, sphereInShadows, type Chunk, type PropPart, type StaticLight, type Viewers } from './chunks';
import { CAM_YAW, disposeView, NearViews, Pool, VIEW_FAR, VIEW_NEAR } from './views';
import { makeCharRig, makeObjectView, type CharRig, type ObjView } from './objviews';
import { applyOcclusionFade, applyWorldUv, WALL_HEIGHT, wallMaterials, type OccUniforms } from './walls';
import { clearFriends, friendStandIns, syncFriends } from './friends';
import { GRADES, Post, type Grade } from './post';
import { ambientMotes, applyLavaGlow, Mist } from './atmosphere';
import { blendAtmos, GROUND_LOOKS, lookOf, newAtmos, shiftGrade, type AreaLook, type WallKind } from './arealooks';
import { makeGround } from './ground';
import { skyAt, type SkyLook } from './sky';
import {
  assetProp, glowSprite, makeHouse, makeDecor, makeGroundItem, makeHammer, makeProjectile, makeTorch, makeTree, MODELS, sharedResource, topCentroid,
} from './props';
import type { AnimInput } from './rig';
import { monsterSpec, npcSpec, playerSpec } from './specs';
import { admitTile, aimLineTexture, ringTexture, runeCircleTexture, shadowTexture, tileTexture, tilesLoaded, tilesPending } from './textures';

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
/** a monster is drawn only this near the hero, or as far as the view reaches (its view is kept from views.ts VIEW_NEAR to VIEW_FAR) */
const MONSTER_SEEN = 28;
/**
 * A monster's bounds for culling, for one of scale 1 (its rig's own don't follow its clips): standing,
 * a sphere this wide round the middle of its body (the tallest are 1.7 m, the bats 2.3 m across),
 * reaching out to a swung weapon; for its shadow, one round the body alone (the weapon's is a thin
 * line, and the shadow test adds the soft edge); fallen, one this wide round a point this high, for
 * a body lying full length
 */
const MONSTER_BODY = 1.4;
const MONSTER_SHADE = 1;
const MONSTER_FALLEN: [radius: number, y: number] = [2, 0.4];
/** a champion's or a unique's body is drawn about this much bigger (specs.ts monsterSpec) */
const RANKED_SIZE = 1.2;
/**
 * Where two areas meet: the ground's looks blend over about twice this either side of the seam
 * (src/world/seams.ts lookMix); the mist, the grade and the specks by the areas' shares of the ground
 * this far round the hero (areaShares), so they have turned all the way by the time they are this
 * far into the next area
 */
const GROUND_SEAM = 2;
const AIR_SEAM = 12;
/**
 * How much more sky light a level a quest has lit gets (the Den of Evil cleared). D2 brightens the
 * den on the client (its packet 0x89); how much isn't in D2MOO, so this is by eye: about a dusk
 * outdoors, the hero's light still the brightest thing in it
 */
const LIT_BOOST = 2.2;
/** how much further than the view reaches on the ground a view is made: a tall thing below its edge shows */
const VIEW_MARGIN = 4;
/** the corners of the view, in clip space, for its reach on the ground */
const VIEW_CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;
/** the most time a rig out of view catches up on at once: every clip has played out by then */
const MAX_LAG = 5;
/** the torch lights and the lanterns' within this of the hero are the ones the light pools pick from */
const LIGHT_REACH = 22;
/** a campfire throws sparks while this near the middle of the view */
const CAMPFIRE_SEEN = 30;
/**
 * A level whose essentials (the models of the area the hero arrives in) still aren't in this long
 * after it's built is veiled, the world held, until they are: Diablo II veils its loading between areas
 */
const VEIL_MS = 1500;
/**
 * A frame's time for swapping in models that came for what stood in for them, past its first swap:
 * the rest wait for the next frame, so a phone's frame stays well under ~50 ms. A character's rig
 * (models.ts) costs more than its making: three works out its skinned body's bounds, bone by bone, as
 * it's first drawn; so one a frame
 */
const SWAP_MS = 4;

/** theme tint for prop materials: [colour, amount] */
const PROP_TINT: Record<string, [string, number]> = {
  ice: ['#a8d0ff', 0.4],
  hell: ['#ff8a6a', 0.22],
  cave: ['#c8a088', 0.12],
  grotto: ['#b8aa94', 0.12],
};

/** an attack mode's clip in its look's attack list (AnimInput.clip): A1 the first, A2 the second, S1 the third */
const MODE_CLIP: Partial<Record<MonsterAct['mode'], number>> = { a1: 0, a2: 1, s1: 2 };
const IDLE_ANIM: AnimInput = { state: 'idle', stateTime: 0, stateDur: 0, speed: 0, dead: false, deathTime: 0, hitFlash: 0, chilled: false, poisoned: false, blood: 'red', killedBy: 'phys' };

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
    if (m.castShadow) ownDepth(m);
  });
}

interface ActorView {
  rig: CharRig;
  shadow: THREE.Mesh;
  key?: string;
  /** the models its rig stands in for until they're in */
  waits?: Set<string> | null;
  /** a townsperson's place */
  npc?: Npc;
}

/** a monster's body: its rig, and what it is culled by (its round shadow is one of Blobs') */
interface MonsterBody {
  rig: CharRig;
  /** the pool the rig goes back to when the view is let go (rigKey); none to dispose it */
  pool: string | null;
  /** whether the camera sees it and whether its shadow can fall in view, this frame */
  cull: { main: boolean; shadow: boolean };
  /** the models it stands in for until they're in */
  waits: Set<string> | null;
}

/** something on the level made without models that weren't in (assets.watch), made again once they are */
interface StandIn {
  waits: Set<string>;
  /** whether a view reaches it now: only then are its models' pictures put on the GPU before the swap (out of view they go up as it's first drawn, as everything's always have) */
  seen(): boolean;
  /** made again with them, in its place; what that missed in turn (it waits again), if anything */
  swap(): Set<string> | null;
}

/** a level's essentials coming: since when, whether in, whether its veil is up, the frames rushed behind the veil since they came */
interface Essentials {
  since: number;
  done: boolean;
  shown: boolean;
  flushed: number;
}

/** a prop, wall hanging or house placed on a level before its model was in: placed once it comes, the house drawn in code meanwhile let go */
interface LatePlace {
  place(t: Template): void;
  standIn?: { chunk: Chunk; obj: THREE.Object3D };
}

/** a monster near the hero: its body made, or taken from the pool, once first drawn */
interface MonsterView {
  body: MonsterBody | null;
  /** the time it went unanimated, out of the view, to catch up on */
  lag: number;
}

/**
 * The round shadows under the monsters seen, in one draw: an instance each, set where they stand
 * every frame (a mesh each was a draw each, some 60 at a time in Blood Moor)
 */
class Blobs {
  mesh: THREE.InstancedMesh;
  private n = 0;
  private priming = false;
  private readonly m = new THREE.Matrix4();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly pos = new THREE.Vector3();
  private readonly size = new THREE.Vector3();

  constructor(
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private room = 128,
  ) {
    this.mesh = this.make();
  }

  /** the frame's shadows start over */
  begin() {
    this.n = 0;
  }

  /** one under a body of radius r at (x, z), as Renderer.makeShadow's */
  add(x: number, z: number, r: number) {
    if (this.n >= this.room) this.grow();
    this.m.compose(this.pos.set(x, 0.02, z), this.flat, this.size.setScalar(r * 2.8));
    this.mesh.setMatrixAt(this.n++, this.m);
  }

  /**
   * The next frame draws one of no size if it has none: the draw's shader is built then, with the
   * level, not mid-walk as the first monster comes into view (a long frame)
   */
  prime() {
    this.priming = true;
  }

  /** the frame's shadows uploaded, only as many as there are */
  end() {
    if (this.priming && !this.n) this.mesh.setMatrixAt(this.n++, this.m.makeScale(0, 0, 0));
    this.priming = false;
    const im = this.mesh;
    im.count = this.n;
    im.visible = this.n > 0;
    if (!this.n) return;
    im.instanceMatrix.clearUpdateRanges();
    im.instanceMatrix.addUpdateRange(0, this.n * 16);
    im.instanceMatrix.needsUpdate = true;
  }

  private make() {
    const im = new THREE.InstancedMesh(this.geo, this.mat, this.room);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    // placed anew round the view every frame: bounds worked out once would be stale
    im.frustumCulled = false;
    im.renderOrder = 3;
    return im;
  }

  private grow() {
    const old = this.mesh;
    this.room *= 2;
    this.mesh = this.make();
    this.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
    old.parent?.add(this.mesh);
    old.removeFromParent();
    old.dispose();
  }
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
  readonly dynGroup = new THREE.Group();
  private occ: OccUniforms = { uPlayer: { value: new THREE.Vector3() }, uCamDir: { value: new THREE.Vector2(Math.sin(CAM_YAW), Math.cos(CAM_YAW)) } };
  private hemi = new THREE.HemisphereLight('#4a5070', '#100808', 0.4);
  /** the sky light underground, as the level's theme sets it */
  private hemiBase = 0.4;
  /** how far a quest has lit this level up, 0 to 1, easing toward Game.isLit */
  private lit = 0;
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
  /** the level's walls, torches, decor and their lights by 16-tile chunk, in the scene where a view reaches */
  private scenery: Scenery | null = null;
  /** the level's props, culled instance by instance into the view and the shadow maps */
  private props: PropBatches | null = null;
  /** what sees the scene this frame: the camera, the sun's shadow camera, the hero's shadow-casting light */
  private viewers: Viewers = { main: new THREE.Frustum(), sun: null, sunDir: new THREE.Vector3(0, -1, 0), lamp: null };
  private lampSphere = new THREE.Sphere();
  private viewProj = new THREE.Matrix4();
  /** the rigs of monsters gone from view, for the next that look the same (rigKey) */
  private rigPool = new Pool<MonsterBody>((v) => v.rig.dispose());
  /** the round shadows under the monsters seen */
  private blobs: Blobs;
  /** how far from the hero the view reaches on the ground, at its furthest corner (updateViewers) */
  private viewReach = 0;
  private reachDir = new THREE.Vector3();
  private monsterViews = new NearViews<Monster, MonsterView>(
    () => ({ body: null, lag: 0 }),
    (_m, v) => this.freeMonsterView(v),
  );
  /** the level's monster list as last seen, and who is in it, to let go the views of those cleared away */
  private monsterList: Monster[] | null = null;
  private monsterCount = 0;
  private monsterSet = new Set<Monster>();
  private playerView: ActorView | null = null;
  private npcViews: ActorView[] = [];
  private propMats = new Map<string, THREE.Material>();
  private flameSpots2 = new Map<string, THREE.Vector3>();
  private groundViews = new NearViews<GroundItem, THREE.Group>(
    (gi) => this.makeGroundView(gi),
    (_gi, v) => {
      v.removeFromParent();
      disposeView(v, sharedResource);
    },
  );
  /** the item views that stand in for models not in yet, and those models */
  private groundWaits = new WeakMap<THREE.Group, Set<string>>();
  /** the level's scenery made without models not in yet (torches, decor, pillars), each swapped once they come */
  private standIns: StandIn[] = [];
  /** the props, wall hangings and houses waiting for their model, by its key */
  private lateProps = new Map<string, LatePlace[]>();
  /** what the level built last waits on before it is shown whole (its essentials) */
  private essentials: Essentials | null = null;
  /** models' pictures to put on the GPU before what waits for them is swapped in (warmed), a frame at a time */
  private warming: THREE.Texture[] = [];
  private onGpu = new WeakSet<THREE.Texture>();
  /** models with their pictures on the GPU, and those whose pictures are going there */
  private warm = new Set<string>();
  private cold = new Map<string, THREE.Texture[]>();
  /** when this frame's first swap was made (0: none yet), and whether a rig was swapped in; behind the veil everything ready swaps at once */
  private swapStart = 0;
  private rigSwapped = false;
  private rush = false;
  private projViews = new Map<Projectile, { group: THREE.Group; light: string | null }>();
  private hammerViews = new Map<Hammer, THREE.Group>();
  /** the war hammer's materials, and each lit blue for a blessed hammer (hammerView) */
  private hammerMats = new Map<THREE.Material, THREE.Material>();
  private objViews = new NearViews<WorldObject, ObjView>(
    (o) => this.makeObjView(o),
    (_o, v) => this.freeObjView(v),
  );
  /** the objects that had a view before: one made again shows them as they were left (views.ts) */
  readonly viewed = new WeakSet<WorldObject>();
  /** what is on the level this frame, and what of it is near: scratch for the views' sync */
  private seen = new Set<GroundItem | WorldObject>();
  private nearby: (GroundItem | WorldObject)[] = [];
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
  /** how each area of the level looks (src/render/arealooks.ts), by its id */
  private looks = new Map<number, AreaLook>();
  private lookById = (area: number) => this.looks.get(area)!;
  /** the level wears one look (it has one area): nothing to blend */
  private oneLook = true;
  /** the areas round the hero this frame and their shares of the ground (the tools read it) */
  readonly airShares: AreaShare[] = [];
  /** the air about the hero this frame: its areas' looks blended (the tools read it) */
  readonly atmos = newAtmos();
  /** the sky's grade, shifted by the air's */
  private grade: Grade = { ...GRADES.town };
  /** where the shadow-casting light stands from the view's centre: the sun or the moon outdoors */
  private sunOffset = new THREE.Vector3(-8, 20, 4);
  /** how much lanterns, fires and the hero's light count: all of it below ground and by night */
  private lamps = 1;
  /** 1 by night under the sky (or below ground), 0 by day: how dark past the hero's light */
  night = 1;
  time = 0;
  level: Level | null = null;
  pxPerUnit = 40;
  width = 1;
  height = 1;
  playerScreen = { x: 0, y: 0 };
  private tmpV = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    textLayer: HTMLElement,
    readonly game: Game,
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
    // a material of their own: the instanced draw is another shader than the single shadows'
    this.blobs = new Blobs(this.shadowGeo, this.shadowMat.clone());
    this.scene.add(this.blobs.mesh);
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
    // no model download but those the arrival waits on starts until the tile textures the level asks
    // for as it's built have come: its ground shows as soon as it did before models streamed
    let built = () => {};
    assets.hold(new Promise<void>((r) => (built = r)).then(() => tilesLoaded()));
    this.request(level);
    // clear
    this.standIns = [];
    this.lateProps.clear();
    this.monsterViews.clear();
    this.monsterList = null;
    this.blobs.begin();
    this.blobs.end();
    this.blobs.prime();
    // the rigs put by of monsters the new level hasn't go: they would only keep room and memory
    const looks = new Set(level.monsters.map((m) => rigKey(monsterSpec(m))));
    this.rigPool.retain((k) => looks.has(k));
    this.groundViews.clear();
    for (const p of this.projViews.values()) p.group.removeFromParent();
    this.projViews.clear();
    for (const h of this.hammerViews.values()) h.removeFromParent();
    this.hammerViews.clear();
    this.objViews.clear();
    this.scenery?.dispose();
    this.props?.dispose();
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
    clearFriends(this);
    this.levelGroup.clear();
    this.dynGroup.clear();
    this.fx.clearLevel();
    this.fx.loadSheets();
    this.fx.onGround = (x, z) => level.map.walkableAt(x, z);

    const L = level.layout;
    const theme = L.theme;
    const map = L.map;
    // how each of the level's areas looks (one, but on the overworld), and the ground's looks among them
    this.looks.clear();
    let last = -1;
    for (const a of level.areas) {
      if (a === last) continue;
      last = a;
      if (!this.looks.has(a)) this.looks.set(a, lookOf(areaDef(a)!, theme.key));
    }
    this.oneLook = new Set(this.looks.values()).size < 2;
    const grounds = [...new Set([...this.looks.values()].map((l) => l.ground))];
    const groundSlot = new Map([...this.looks].map(([a, l]) => [a, grounds.indexOf(l.ground)]));
    // a cliff where the layout says (Layout.cliffs), else as the area builds its walls
    const cliffs = level.layout.cliffs;
    const wallKind = (x: number, y: number): WallKind => (cliffs?.has(y * map.w + x) ? 'cliff' : this.looks.get(level.areas[y * map.w + x])!.walls);
    this.scene.background = new THREE.Color(theme.bg);
    this.sunOffset.set(-8, 20, 4);
    this.lamps = 1;
    this.night = 1;
    this.post.setGrade(GRADES[theme.key] ?? GRADES.crypt);
    this.hemi.color.set(theme.ambient);
    this.hemi.groundColor.set('#0a0606');
    this.hemiBase = this.hemi.intensity = theme.ambientIntensity * 2.8;
    this.lit = this.game.isLit(level) ? 1 : 0;
    const outdoor = !!theme.outdoor;
    this.dir.color.set(outdoor ? '#8aa0d8' : theme.ambient);
    this.dir.intensity = outdoor ? 0.9 : 0.25;
    this.applyShadows();
    // the hero's light, split between the shadow-casting light overhead and the camera-side fill
    this.heroLight.intensity = outdoor ? 11 : 25;
    this.playerLight.intensity = outdoor ? 7 : 15;

    // the static scenery, by 16-tile chunk: only the chunks a view reaches are in the scene
    const scenery = (this.scenery = new Scenery(map.w, map.h));
    this.levelGroup.add(scenery.group);
    /** tiles by the chunk they're in */
    const byChunk = (tiles: [number, number][]) => {
      const out = new Map<Chunk, [number, number][]>();
      for (const t of tiles) {
        const c = scenery.at(t[0] + 0.5, t[1] + 0.5);
        const l = out.get(c);
        if (l) l.push(t);
        else out.set(c, [t]);
      }
      return out;
    };

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
    // outdoor maps: one blended ground for the whole map, each area's look fading into the next's
    // across their seams; elsewhere a tile for each floor square
    this.ground?.dispose();
    this.ground = L.ground
      ? makeGround(
          map.w,
          map.h,
          L.ground,
          grounds.map((k) => GROUND_LOOKS[k] ?? GROUND_LOOKS.wild),
          grounds.length > 1 ? lookMix(level.areas, map.w, map.h, (a) => groundSlot.get(a)!, grounds.length, GROUND_SEAM) : [],
        )
      : null;
    if (this.ground) {
      this.ground.edge.set(theme.bg);
      this.levelGroup.add(this.ground.mesh);
    }
    const m4 = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    const floors: THREE.InstancedMesh[] = [];
    // the tile textures it asks for (the ground's and the floor's by now, the walls' below) have the
    // network to themselves: the downloads under way that nothing waits on make way (assets.makeWay)
    const makeWay = () => {
      if (tilesPending()) assets.makeWay();
    };
    if (!this.ground) {
      const floorMat = new THREE.MeshStandardMaterial({ map: tileTexture(`${theme.key}_floor`), roughness: 0.95, metalness: 0 });
      applyWorldUv(floorMat, 'floor', 4);
      if (theme.key === 'hell') applyLavaGlow(floorMat, this.lavaTime);
      const floorGeo = new THREE.PlaneGeometry(1, 1);
      floorGeo.rotateX(-Math.PI / 2);
      const q = new THREE.Quaternion();
      for (const [c, tiles] of byChunk([...floorTiles, ...pillarTiles])) {
        const floor = new THREE.InstancedMesh(floorGeo, floorMat, tiles.length);
        tiles.forEach(([x, y], i) => {
          m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), q, one);
          floor.setMatrixAt(i, m4);
          // ambient occlusion near walls, and a faint per-tile variation
          let walls = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (map.get(x + dx, y + dy) === T_WALL) walls++;
          const v = (0.95 + Math.random() * 0.1) * (1 - walls * 0.12);
          floor.setColorAt(i, col.setRGB(v, v, v));
        });
        floor.instanceMatrix.needsUpdate = true;
        if (floor.instanceColor) floor.instanceColor.needsUpdate = true;
        c.group.add(floor);
        floors.push(floor);
      }
    }

    makeWay();

    // walls, as the area each stands in builds them: the camp's palisade is uneven, the wilderness's
    // ruins are broken off low (so their tops show stone), other walls are capped in shadow
    const wallMat = wallMaterials(theme, this.occ);
    const wallGeo = new THREE.BoxGeometry(1, WALL_H, 1);
    wallGeo.translate(0, WALL_H / 2, 0);
    const wallsBy = new Map<WallKind, [number, number][]>();
    for (const t of wallTiles) {
      const k = wallKind(t[0], t[1]);
      const l = wallsBy.get(k);
      if (l) l.push(t);
      else wallsBy.set(k, [t]);
    }
    for (const [kind, kindTiles] of wallsBy) {
      const [h0, hr] = WALL_HEIGHT[kind];
      for (const [c, tiles] of byChunk(kindTiles)) {
        const walls = new THREE.InstancedMesh(wallGeo, wallMat(kind), tiles.length);
        tiles.forEach(([x, y], i) => {
          m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), new THREE.Quaternion(), new THREE.Vector3(1, h0 + Math.random() * hr, 1));
          walls.setMatrixAt(i, m4);
          const v = 0.8 + Math.random() * 0.25;
          walls.setColorAt(i, col.setRGB(v, v, v));
        });
        walls.instanceMatrix.needsUpdate = true;
        if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
        c.group.add(walls);
      }
    }

    if (pillarTiles.length) {
      const column = wallMat(wallKind(pillarTiles[0][0], pillarTiles[0][1]))[0];
      const shape = this.pillarShape(column);
      const meshes: THREE.InstancedMesh[] = [];
      const chunks: Chunk[] = [];
      for (const [c, tiles] of byChunk(pillarTiles)) {
        chunks.push(c);
        const pillars = new THREE.InstancedMesh(shape.geo, shape.mat, tiles.length);
        tiles.forEach(([x, y], i) => {
          m4.compose(new THREE.Vector3(x + 0.5, 0, y + 0.5), new THREE.Quaternion(), one);
          pillars.setMatrixAt(i, m4);
        });
        c.group.add(pillars);
        meshes.push(pillars);
      }
      // the columns drawn in code stand in for the model until it's in
      if (!shape.model) {
        this.standIns.push({
          waits: new Set([MODELS.pillar]),
          seen: () => chunks.some((c) => c.attached),
          swap: () => {
            const s = this.pillarShape(column);
            if (!s.model) return new Set([MODELS.pillar]);
            for (const m of meshes) {
              m.geometry = s.geo;
              m.material = s.mat;
              m.boundingSphere = m.boundingBox = null;
              castShadows(m);
            }
            shape.geo.dispose();
            return null;
          },
        });
      }
    }
    // every tile texture it wears asked for: the hold lasts until they've come
    makeWay();
    built();

    // furniture, wall hangings and town buildings (instanced CC0 models)
    this.buildProps(L, scenery);
    // townsfolk
    for (const n of L.npcs ?? []) {
      const made = this.npcRig(n);
      const shadow = this.makeShadow(0.4);
      shadow.position.set(n.x, 0.02, n.z);
      this.scene.add(shadow);
      this.npcViews.push({ ...made, shadow, npc: n });
    }

    // torches; one drawn in code stands in until its model is in
    for (const t of L.torches) {
      const made = this.torch(t, theme.torch);
      const c = scenery.add(made.group, t.x, t.z);
      c.flames.push(made.flame);
      made.group.updateMatrixWorld(true);
      const spot = made.flame.getWorldPosition(new THREE.Vector3());
      c.spots.push(spot);
      c.lights.push({ pos: new THREE.Vector3(t.x + t.nx * 0.5, 1.9, t.z + t.nz * 0.5), color: new THREE.Color(theme.torch), intensity: 16, flicker: 1, distance: 8 });
      if (!made.waits) continue;
      let cur = made;
      let at = spot;
      this.standIns.push({
        waits: made.waits,
        seen: () => c.attached,
        swap: () => {
          const now = this.torch(t, theme.torch);
          scenery.swap(c, cur.group, now.group, [now.flame]);
          disposeView(cur.group, sharedResource);
          castShadows(now.group);
          c.flames[c.flames.indexOf(cur.flame)] = now.flame;
          const next = now.flame.getWorldPosition(new THREE.Vector3());
          c.spots[c.spots.indexOf(at)] = next;
          cur = now;
          at = next;
          return now.waits;
        },
      });
    }
    // decor; what's drawn in code stands in until its models are in
    const treeMats: THREE.Material[] = [];
    for (const d of L.decor) {
      const dead = d.kind === 'tree' && Math.random() < 0.3;
      const make = () => {
        const g = d.kind === 'tree' ? makeTree(d.scale, dead) : makeDecor(d.kind, theme.key);
        g.position.set(d.x, 0, d.z);
        g.rotation.y = d.rot;
        if (d.kind !== 'tree') g.scale.multiplyScalar(d.scale);
        return g;
      };
      const [g, waits] = assets.watch(make);
      if (d.kind === 'tree') {
        g.traverse((o) => {
          const mm = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (mm && !treeMats.includes(mm)) treeMats.push(mm);
        });
      }
      const c = scenery.add(g, d.x, d.z);
      if (d.kind === 'campfire') {
        c.lights.push({ pos: new THREE.Vector3(d.x, 0.8, d.z), color: new THREE.Color('#ff8030'), intensity: 45, flicker: 1.5, distance: 14 });
      }
      if (d.kind === 'crystal') c.lights.push({ pos: new THREE.Vector3(d.x, 0.6, d.z), color: new THREE.Color('#4a90d0'), intensity: 6, flicker: 0, distance: 5 });
      if (!waits) continue;
      let cur = g;
      this.standIns.push({
        waits,
        seen: () => c.attached,
        swap: () => {
          const [now, again] = assets.watch(make);
          if (d.kind === 'tree') this.fadeTree(now);
          scenery.swap(c, cur, now);
          disposeView(cur, sharedResource);
          castShadows(now);
          cur = now;
          return again;
        },
      });
    }
    for (const mm of treeMats) {
      const cloned = mm;
      applyOcclusionFade(cloned, this.occ);
      cloned.needsUpdate = true;
    }
    for (const c of scenery.all) castShadows(c.group);
    for (const f of floors) f.castShadow = false;
    scenery.finish();
    // each kind of wall's shaders made now, not on the first frame a chunk of them comes into view
    // (the wilderness's ruins are far from the camp: a hitch out on the moor)
    const warm = new THREE.Scene();
    for (const kind of wallsBy.keys()) {
      const w = new THREE.InstancedMesh(wallGeo, wallMat(kind), 1);
      w.setMatrixAt(0, m4.identity());
      w.setColorAt(0, col.setRGB(1, 1, 1));
      warm.add(w);
    }
    castShadows(warm);
    this.post.compile(warm, this.scene, this.camera);
    for (const w of warm.children) (w as THREE.InstancedMesh).dispose();
    if (this.ground) {
      castShadows(this.ground.mesh);
      this.ground.mesh.castShadow = false;
    }
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

  /**
   * A blessed hammer's view: the war hammer's model lit blue, lying flat to spin about its middle
   * (once it's in: asked for the first time one's wanted), else the one drawn in code (props.ts)
   */
  private hammerView(): THREE.Group {
    const t = assetProp('w_hammer', 0.85);
    if (!t) {
      void assets.ensure(['w_hammer'], HERE);
      return makeHammer();
    }
    t.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const was = m.material as THREE.Material;
      let lit = this.hammerMats.get(was);
      if (!lit) {
        lit = was.clone();
        if (lit instanceof THREE.MeshStandardMaterial) {
          lit.emissive.set('#4a6aff');
          lit.emissiveIntensity = 0.9;
        }
        this.hammerMats.set(was, lit);
      }
      m.material = lit;
    });
    const mid = new THREE.Box3().setFromObject(t).getCenter(new THREE.Vector3());
    t.position.sub(mid);
    const flat = new THREE.Group();
    flat.rotation.z = Math.PI / 2;
    flat.add(t);
    const g = new THREE.Group();
    g.add(flat);
    return g;
  }

  /**
   * The hero jumped across this map by a way in (a waypoint, a town portal, brought back to life:
   * Game.teleportWithin): the view goes there at once, and what the area they came to is made of is
   * asked for ahead of the rest of the map, veiled as a level is if it isn't in by VEIL_MS
   */
  jumped() {
    this.snapCamera();
    if (this.level) this.request(this.level);
  }

  /**
   * What `level` is made of asked for: the area the hero is in first (arriving, or jumped to), its
   * veil coming up if that isn't in by VEIL_MS; then the rest of it; then the areas its ways off lead
   * to (so going there is usually instant). Everything else streams in behind (main.ts). Files given
   * up on are asked for again (assets.ensure), not waited on
   */
  private request(level: Level) {
    const p = this.game.player.pos;
    const here = levelNeeds(level, level.areaAt(p.x, p.z).id);
    const first = [...here].filter((k) => !assets.settled(k));
    const arrival = assets.ensure(here, NOW);
    if (first.length) {
      const e: Essentials = { since: performance.now(), done: false, shown: false, flushed: 0 };
      this.essentials = e;
      void arrival.then(() => (e.done = true));
      // the downloads nothing waits on make way for them
      assets.makeWay();
    } else this.essentials = null;
    void assets.ensure(levelNeeds(level), HERE);
    const ways = new Set<number>();
    for (const o of level.objects) if ((o.kind === 'stairs' || o.kind === 'exit') && !o.closed && o.dest !== undefined) ways.add(o.dest);
    for (const id of ways) void assets.ensure(areaNeeds(id, level.difficulty), NEXT);
  }

  /** whether the level is veiled, the world held, while its essentials come (VEIL_MS) */
  get veiled(): boolean {
    return !!this.essentials?.shown;
  }

  /** a townsperson's rig where they stand, in the scene; the procedural one stands in while their models aren't in */
  private npcRig(n: Npc): { rig: CharRig; waits: Set<string> | null } {
    const made = makeCharRig(() => npcSpec(n.model), vendorLook);
    made.rig.root.position.set(n.x, 0, n.z);
    made.rig.root.rotation.y = n.rot;
    this.scene.add(made.rig.root);
    castShadows(made.rig.root);
    return made;
  }

  /** a torch on its wall, and the models it missed (drawn in code while they aren't in) */
  private torch(t: Torch, color: string): { group: THREE.Group; flame: THREE.Sprite; waits: Set<string> | null } {
    const [{ group, flame }, waits] = assets.watch(() => makeTorch(color));
    group.position.set(t.x, 0, t.z);
    group.rotation.y = Math.atan2(t.nx, t.nz);
    return { group, flame, waits };
  }

  /** a tree swapped in: its materials fade where it hides the hero, as the level's first trees' do */
  private fadeTree(g: THREE.Object3D) {
    g.traverse((o) => {
      const mm = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!mm || Array.isArray(mm)) return;
      applyOcclusionFade(mm, this.occ);
      mm.needsUpdate = true;
    });
  }

  /** the dungeon's pillar: the model fitted to a tile, about WALL_H + 0.3 tall, else a column drawn in code (`column` its material) */
  private pillarShape(column: THREE.Material): { geo: THREE.BufferGeometry; mat: THREE.Material; model: boolean } {
    const tpl = assets.get(MODELS.pillar);
    const pMesh = tpl ? (tpl.gltf.scene.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined) : undefined;
    if (tpl && pMesh) {
      // bake the node transform + fit to one tile, ~WALL_H+0.3 tall
      pMesh.updateWorldMatrix(true, false);
      const geo = pMesh.geometry.clone().applyMatrix4(pMesh.matrixWorld);
      geo.translate(-tpl.center.x, -tpl.min.y, -tpl.center.z);
      geo.scale(0.95 / tpl.size.x, (WALL_H + 0.3) / tpl.size.y, 0.95 / tpl.size.x);
      const mat = (pMesh.material as THREE.Material).clone();
      applyOcclusionFade(mat, this.occ);
      return { geo, mat, model: true };
    }
    const geo = new THREE.CylinderGeometry(0.36, 0.42, WALL_H + 0.3, 8);
    geo.translate(0, (WALL_H + 0.3) / 2, 0);
    return { geo, mat: column, model: false };
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

  /**
   * The level's props, wall hangings and houses, a batch a model (PropBatches). One whose model isn't
   * in yet is placed when it comes (lateProps, placeLate), a house drawn in code standing in meanwhile
   */
  private buildProps(L: Layout, scenery: Scenery) {
    const theme = L.theme.key;
    const props = (this.props = new PropBatches([this.dir.shadow.getFrustum(), this.heroLight.shadow.getFrustum()]));
    const yAxis = new THREE.Vector3(0, 1, 0);
    const light = (key: string, m: THREE.Matrix4, color: string, s: number) => {
      const spot = this.flameSpot(key);
      if (!spot) return;
      const pos = spot.clone().applyMatrix4(m);
      const glow = glowSprite(color, 0.5 * Math.min(1.4, s / 0.5), 0.85);
      glow.position.copy(pos);
      glow.userData.base = glow.scale.x;
      const c = scenery.add(glow, pos.x, pos.z, [glow]);
      scenery.addLight(c, { pos: pos.clone().setY(pos.y + 0.1), color: new THREE.Color(color), intensity: 7, flicker: 0.6, distance: 4.5 });
      c.flames.push(glow);
    };
    const prop = (p: Prop) => (t: Template) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.z), new THREE.Quaternion().setFromAxisAngle(yAxis, p.rot), new THREE.Vector3(p.scale, p.scale, p.scale));
      m.multiply(new THREE.Matrix4().makeTranslation(-t.center.x, -t.min.y, -t.center.z));
      props.add(p.model, m);
      if (p.light) light(p.model, m, p.light, p.scale);
    };
    const wall = (w: WallDecor) => (t: Template) => {
      // back of the piece against the wall face, centred on the spot
      const off = -t.min.z * w.scale + 0.02;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(w.x + w.nx * off, w.y, w.z + w.nz * off),
        new THREE.Quaternion().setFromAxisAngle(yAxis, Math.atan2(w.nx, w.nz)),
        new THREE.Vector3(w.scale, w.scale, w.scale),
      );
      m.multiply(new THREE.Matrix4().makeTranslation(-t.center.x, 0, 0));
      props.add(w.model, m);
      if (w.light) light(w.model, m, w.light, w.scale);
    };
    const house = (hs: House & { model: string }) => (t: Template) => {
      const rot = hs.rot ?? 0;
      const turned = Math.abs(Math.sin(rot)) > 0.5;
      const s = Math.min(hs.w / (turned ? t.size.z : t.size.x), hs.h / (turned ? t.size.x : t.size.z)) * 1.08;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(hs.x + hs.w / 2, 0, hs.y + hs.h / 2), new THREE.Quaternion().setFromAxisAngle(yAxis, rot), new THREE.Vector3(s, s, s));
      m.multiply(new THREE.Matrix4().makeTranslation(-t.center.x, -t.min.y, -t.center.z));
      props.add(hs.model, m);
    };
    const place = (key: string, at: LatePlace['place'], standIn?: () => LatePlace['standIn']) => {
      const t = assets.get(key);
      if (t) return at(t);
      // a model no file of this build carries never comes: left out, a house drawn in code, as always
      if (!assets.serves(key)) return void standIn?.();
      let list = this.lateProps.get(key);
      if (!list) this.lateProps.set(key, (list = []));
      list.push({ place: at, standIn: standIn?.() });
    };
    for (const p of L.props) place(p.model, prop(p));
    for (const w of L.wallDecor) place(w.model, wall(w));
    for (const hs of L.houses ?? []) {
      const standIn = () => {
        const obj = makeHouse(hs.w, hs.h, hs.x, hs.y);
        return { chunk: scenery.add(obj, hs.x + hs.w / 2, hs.y + hs.h / 2), obj };
      };
      if (!hs.model) standIn();
      else place(hs.model, house({ ...hs, model: hs.model }), standIn);
    }
    props.build((key) => this.propParts(key, theme));
    this.levelGroup.add(props.group);
  }

  /** a prop model's meshes in the theme's tint; opaque lit ones cast and take shadows (castShadows) */
  private propParts(key: string, theme: string): PropPart[] | null {
    const t = assets.get(key);
    if (!t) return null;
    const parts: PropPart[] = [];
    t.gltf.scene.updateMatrixWorld(true);
    t.gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = Array.isArray(mesh.material) ? mesh.material.map((x) => this.propMat(x, theme)) : this.propMat(mesh.material, theme);
      const mats = Array.isArray(material) ? material : [material];
      const lit = mats.every((x) => !(x as THREE.MeshBasicMaterial).isMeshBasicMaterial && !x.transparent);
      parts.push({ geometry: mesh.geometry, material, matrix: mesh.matrixWorld.clone(), lit });
    });
    return parts;
  }

  /** the props of the models that came placed, their houses drawn in code let go (as many as the frame's time allows) */
  private placeLate() {
    const L = this.level?.layout;
    if (!L || !this.props) return;
    let placed = false;
    for (const [key, list] of this.lateProps) {
      // placed once in: their pictures go up as each is first drawn, as every prop's always have
      if (!this.swappable([key], false)) continue;
      this.lateProps.delete(key);
      const t = assets.get(key)!;
      for (const l of list) {
        if (l.standIn) {
          l.standIn.obj.removeFromParent();
          disposeView(l.standIn.obj, sharedResource);
        }
        l.place(t);
      }
      placed = true;
    }
    if (placed) this.props.build((k) => this.propParts(k, L.theme.key));
  }

  makeShadow(r: number): THREE.Mesh {
    const s = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    s.rotation.x = -Math.PI / 2;
    s.scale.setScalar(r * 2.8);
    s.renderOrder = 3;
    return s;
  }

  /** an object's view, in the scene; one made without models that weren't in stands in until they are (waits) */
  private makeObjView(o: WorldObject): ObjView {
    const [v, waits] = assets.watch(() => makeObjectView(this, o));
    v.waits = waits;
    this.viewed.add(o);
    castShadows(v.group);
    this.dynGroup.add(v.group);
    return v;
  }

  private freeObjView(v: ObjView) {
    v.group.removeFromParent();
    v.free?.();
    disposeView(v.group, sharedResource);
  }

  /** the views of the objects near the hero (views.ts), animated */
  private syncObjects(level: Level, dt: number) {
    const p = this.game.player.pos;
    const seen = this.seen;
    const near = this.nearby;
    const [nearR, farR] = this.viewRadii();
    seen.clear();
    near.length = 0;
    for (const o of level.objects) {
      seen.add(o);
      if ((o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 <= nearR * nearR) near.push(o);
    }
    this.objViews.sync(p, near as WorldObject[], (o) => !seen.has(o), farR);
    for (const [o, had] of this.objViews.views) {
      let v = had;
      // made again once what it stood in for is in (the merchant and a corpse are rigs)
      if (v.waits && this.swappable(v.waits, true, o.kind === 'vendor' || o.kind === 'corpse')) {
        this.freeObjView(v);
        v = this.makeObjView(o);
        this.objViews.views.set(o, v);
      }
      v.update?.(dt, o);
    }
  }

  /**
   * How near the hero a view is made and how far it is kept (views.ts): VIEW_NEAR and VIEW_FAR, or
   * as much further as the view reaches past them, zoomed out on a wide screen
   */
  private viewRadii(): [near: number, far: number] {
    const near = Math.max(VIEW_NEAR, this.viewReach + VIEW_MARGIN);
    return [near, near + VIEW_FAR - VIEW_NEAR];
  }

  /**
   * a monster's body, its rig one put by for a monster that looked the same when there is one; the
   * procedural rig stands in while its models aren't in (waits)
   */
  private makeMonsterBody(m: Monster): MonsterBody {
    const spec = monsterSpec(m);
    let v = specNeeds(spec).every((k) => assets.has(k)) ? this.rigPool.take(rigKey(spec) ?? '') : undefined;
    if (v) (v.rig as ModelRig).reset();
    else {
      const { rig, waits } = makeCharRig(() => spec, () => monsterLook(m));
      castShadows(rig.root);
      // drawn where the camera sees it and into the shadow maps only where its shadow can fall in
      // view (the frame's `cull`): a skinned body's own bounds don't follow its clips
      const cull = { main: true, shadow: true };
      const shadows = [this.dir.shadow.getFrustum(), this.heroLight.shadow.getFrustum()];
      rig.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.frustumCulled = true;
        mesh.intersectsFrustum = (f: THREE.Frustum) => (shadows.includes(f) ? cull.shadow : cull.main);
      });
      // a stand-in isn't put by for others: it goes once its own models are in
      v = { rig, pool: waits ? null : rigKey(spec), cull, waits };
    }
    this.dynGroup.add(v.rig.root);
    v.rig.root.rotation.y = m.facing;
    return v;
  }

  /** a monster's view let go: its rig put by for the next that looks the same, or disposed */
  private freeMonsterView(v: MonsterView) {
    const b = v.body;
    if (!b) return;
    b.rig.root.removeFromParent();
    if (b.pool) this.rigPool.give(b.pool, b);
    else b.rig.dispose();
  }

  /** an item on the ground's view, a beam over the best; one drawn in code stands in while its model isn't in (groundWaits) */
  private makeGroundView(gi: GroundItem): THREE.Group {
    const [v, waits] = assets.watch(() => makeGroundItem(gi.item, gi.item ? itemColor(gi.item) : '#e8c040'));
    if (waits) this.groundWaits.set(v, waits);
    // turned by its id, not at random: the same way each time its view is made again
    v.rotation.y = ((gi.id * 0.618034) % 1) * Math.PI * 2;
    this.dynGroup.add(v);
    if (gi.item && (gi.item.rarity === 'unique' || gi.item.rarity === 'set' || gi.item.rarity === 'runeword')) {
      const beam = glowSprite(itemColor(gi.item), 0.9, 0.6);
      beam.position.y = 0.3;
      v.add(beam);
    }
    return v;
  }

  /** what the renderer keeps now, for the tools (tools/bench.mjs) */
  counts(): Record<string, number> {
    const shown = this.scenery?.visible.length ?? 0;
    return {
      'monster views': this.monsterViews.views.size,
      'monster rigs': [...this.monsterViews.views.values()].filter((v) => v.body).length,
      'rigs put by': this.rigPool.size,
      'item views': this.groundViews.views.size,
      'object views': this.objViews.views.size,
      'chunks shown': shown,
      'chunks in all': this.scenery?.all.length ?? 0,
      'props in view': this.props?.drawn.view ?? 0,
      'props in shadow': this.props?.drawn.shadow ?? 0,
      'stand-ins': this.standInCount(),
    };
  }

  /**
   * What on the level still stands in for models not in (scenery, props, people, objects, items, and
   * the monsters drawn so far), for the tools: none once everything has come and been swapped in
   */
  standInCount(): number {
    let n = this.standIns.length + this.lateProps.size;
    for (const v of this.monsterViews.views.values()) if (v.body?.waits) n++;
    for (const v of this.npcViews) if (v.waits) n++;
    if (this.playerView?.waits) n++;
    n += friendStandIns(this);
    for (const v of this.objViews.views.values()) if (v.waits) n++;
    for (const v of this.groundViews.views.values()) if (this.groundWaits.has(v)) n++;
    return n;
  }

  // ─────────────────────────── per-frame ───────────────────────────

  private anim(a: { state: AnimInput['state']; stateTime: number; stateDur: number; dead: boolean; deathTime: number; hitFlash: number; chillTime: number; poisonTime: number; killedBy: AnimInput['killedBy'] }, speed: number, blood: AnimInput['blood'], hitFlash = a.hitFlash): AnimInput {
    return {
      state: a.state,
      stateTime: a.stateTime,
      stateDur: a.stateDur,
      speed,
      dead: a.dead,
      deathTime: a.deathTime,
      hitFlash,
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

  /**
   * A tile texture that has loaded onto the GPU (admitTile: one a frame, the moment it's let on,
   * wherever it first shows), or else one of the pictures of models that came for what waits on them
   * (warmed); behind the veil, all of those
   */
  private uploadLoaded() {
    if (admitTile(this.webgl) && !this.rush) return;
    while (this.warming.length) {
      const t = this.warming.shift()!;
      if (this.onGpu.has(t)) continue;
      this.webgl.initTexture(t);
      this.onGpu.add(t);
      if (!this.rush) break;
    }
  }

  /** whether model `key` is in with its pictures on the GPU; those not there yet are queued for uploadLoaded */
  private warmed(key: string): boolean {
    if (this.warm.has(key)) return true;
    let pics = this.cold.get(key);
    if (!pics) {
      const t = assets.get(key);
      if (!t) return false;
      const list: THREE.Texture[] = [];
      t.gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          for (const slot of TEXTURE_SLOTS) {
            const tex = (mat as THREE.MeshStandardMaterial)[slot];
            if (tex && !this.onGpu.has(tex) && !list.includes(tex)) list.push(tex);
          }
        }
      });
      for (const tex of list) if (!this.warming.includes(tex)) this.warming.push(tex);
      this.cold.set(key, (pics = list));
    }
    if (pics.some((tex) => !this.onGpu.has(tex))) return false;
    this.cold.delete(key);
    this.warm.add(key);
    return true;
  }

  /**
   * Whether what stands in for `keys` may be swapped now: every one in, with its pictures on the GPU
   * when `warm` (what's in view: several going up in one frame would show), and the frame's time for
   * swaps not spent (SWAP_MS past its first; a character's `rig` one a frame; behind the veil, no limit)
   */
  private swappable(keys: Iterable<string>, warm = true, rig = false): boolean {
    let ready = true;
    for (const k of keys) if (warm ? !this.warmed(k) : !assets.has(k)) ready = false;
    if (!ready) return false;
    if (this.rush) return true;
    if (rig && this.rigSwapped) return false;
    const now = performance.now();
    if (!this.swapStart) this.swapStart = now;
    else if (now - this.swapStart > SWAP_MS) return false;
    if (rig) this.rigSwapped = true;
    return true;
  }

  /** the scenery standing in for models that came, swapped for them (as many as the frame's time allows) */
  private swapScenery() {
    if (!this.standIns.length) return;
    const left: StandIn[] = [];
    for (const s of this.standIns) {
      if (!this.swappable(s.waits, s.seen())) {
        left.push(s);
        continue;
      }
      const again = s.swap();
      if (again) left.push({ ...s, waits: again });
    }
    this.standIns = left;
  }

  /** the level's one look, as a share of the air (airShares) */
  private onlyShare(level: Level): AreaShare[] {
    const sh = this.airShares;
    if (sh.length !== 1) sh.length = 0;
    if (!sh.length) sh.push({ area: 0, w: 1 });
    sh[0].area = level.areas[0];
    sh[0].w = 1;
    return sh;
  }

  /** the light under the sky at this time of day, as the areas about the hero grade it (atmos) */
  private applySky(s: SkyLook) {
    this.dir.color.copy(s.sun);
    this.dir.intensity = s.sunIntensity;
    this.sunOffset.copy(s.dir).multiplyScalar(22);
    this.hemi.color.copy(s.sky);
    this.hemi.groundColor.copy(s.bounce);
    this.hemi.intensity = s.skyIntensity;
    (this.scene.background as THREE.Color).copy(s.bg);
    this.ground?.edge.copy(s.bg);
    if (this.post.enabled) this.post.setGrade(shiftGrade(s.grade, this.atmos.grade, this.grade));
    this.mist?.setSky(s.sky, s.mist, this.atmos.mist);
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
    // the veil comes up if the essentials aren't in by VEIL_MS; behind it, everything ready swaps at once
    const e = this.essentials;
    if (e && !e.shown) {
      if (e.done) this.essentials = null;
      else if (performance.now() - e.since > VEIL_MS) e.shown = true;
    }
    this.rush = this.veiled;
    this.swapStart = 0;
    this.rigSwapped = false;
    assets.drew(this.rush);
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
    // the air about the hero: their area's, or where areas meet each one's share of it
    const shares = this.oneLook ? this.onlyShare(level) : areaShares(level.areas, level.map.w, level.map.h, pp.x, pp.z, AIR_SEAM, this.airShares);
    blendAtmos(shares, this.lookById, this.atmos);
    if (level.layout.theme.outdoor) this.applySky(skyAt(g.clock));
    else {
      // a level a quest has lit (the Den of Evil cleared: D2's QUESTS_TriggerFX) brightens over a few seconds
      this.lit += ((g.isLit(level) ? 1 : 0) - this.lit) * Math.min(1, dt * 0.7);
      this.hemi.intensity = this.hemiBase * (1 + LIT_BOOST * this.lit);
    }
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

    // the scenery and props the views reach, for this frame's camera and lights
    this.updateViewers();
    this.uploadLoaded();
    // models that came for what stood in for them
    this.swapScenery();
    this.placeLate();

    // player rig
    const key = playerLookKey(p);
    const was = this.playerView;
    if (!was || was.key !== key || (was.waits && this.swappable(was.waits, true, true))) {
      if (was) {
        was.rig.dispose();
        was.shadow.removeFromParent();
      }
      const { rig, waits } = makeCharRig(() => playerSpec(p), () => playerLook(p));
      // the light is overhead: the hero's own shadow would be a dark disc around the feet
      castShadows(rig.root, false);
      this.scene.add(rig.root);
      const shadow = this.makeShadow(p.radius);
      this.scene.add(shadow);
      this.playerView = { rig, shadow, key, waits };
    }
    const pv = this.playerView!;
    pv.rig.root.position.x = pp.x;
    pv.rig.root.position.z = pp.z;
    if (!p.dead) pv.rig.root.position.y = 0;
    pv.rig.root.rotation.y = smoothAngle(pv.rig.root.rotation.y, p.facing, dt * 18);
    // the hero's attacks, casts, hit recoveries and blocks last Diablo II's frames: the clips fit them exactly
    pv.rig.update(dt, { ...this.anim(p, p.state === 'charge' ? p.stats.chargeSpeed : p.moveSpeed() * p.slowFactor(), 'red'), exact: true });
    pv.shadow.position.set(pp.x, 0.02, pp.z);

    // the camp's people stand still: animated, and drawn, only while the hero is about
    for (const n of this.npcViews) {
      const r = n.rig.root.position;
      const near = (r.x - p.pos.x) ** 2 + (r.z - p.pos.z) ** 2 <= VIEW_FAR * VIEW_FAR;
      if (near && n.waits && n.npc && this.swappable(n.waits, true, true)) {
        n.rig.dispose();
        Object.assign(n, this.npcRig(n.npc));
      }
      n.rig.root.visible = n.shadow.visible = near;
      if (near) n.rig.update(dt, IDLE_ANIM);
    }
    // the hero's friends (src/render/friends.ts)
    syncFriends(this, dt);

    // the aura about him: drawn off the effect pictures (spellfx.ts aura), else a rune circle in its colour
    const aura = p.activeAura && !p.dead && p.skillLevel(p.activeAura) > 0 ? p.activeAura : null;
    if (aura && this.fx.aura(aura, SKILL_BY_ID[aura].color, pp.x, pp.z, p.skillParams(aura).radius ?? 2.2, this.time, dt)) {
      this.auraDecal.visible = false;
    } else if (aura) {
      const def = SKILL_BY_ID[aura];
      this.auraDecal.visible = true;
      (this.auraDecal.material as THREE.MeshBasicMaterial).color.set(def.color);
      const r = p.skillParams(aura).radius ?? 2.2;
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
    const shielded = p.holyShield > 0 && !p.dead;
    this.shieldGlow.visible = shielded && !this.fx.shield(pp.x, pp.z, this.time, dt);
    if (this.shieldGlow.visible) {
      this.shieldGlow.position.set(pp.x, 1.0, pp.z);
      this.shieldGlow.material.opacity = 0.2 + Math.sin(this.time * 3) * 0.05;
    }

    this.updateTouchMarks(pp);

    // monsters: views of those near (views.ts), let go past VIEW_FAR or once cleared away; further
    // where the view reaches further
    if (level.monsters !== this.monsterList || level.monsters.length !== this.monsterCount) {
      this.monsterList = level.monsters;
      this.monsterCount = level.monsters.length;
      this.monsterSet = new Set(level.monsters);
    }
    const alive = this.monsterSet;
    const [nearR, farR] = this.viewRadii();
    const seen = Math.max(MONSTER_SEEN, this.viewReach + VIEW_MARGIN);
    this.monsterViews.sync(p.pos, level.monstersNear(p.pos, nearR), (m) => !alive.has(m), farR);
    const vw = this.viewers;
    this.blobs.begin();
    for (const [m, v] of this.monsterViews.views) {
      const d2 = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
      const near = d2 < seen * seen;
      const mp = this.at(m);
      // seen, or casting a shadow that can be: the body standing, or lying once fallen
      const k = Math.max(1, m.def.scale * (m.rank === 'normal' ? 1 : RANKED_SIZE));
      const r = (m.dead ? MONSTER_FALLEN[0] : MONSTER_BODY) * k;
      const y = m.dead ? MONSTER_FALLEN[1] * k : k;
      const main = near && sphereInFrustum(vw.main, mp.x, y, mp.z, r);
      const shadow = near && sphereInShadows(vw, mp.x, y, mp.z, m.dead ? r : MONSTER_SHADE * k);
      const drawn = main || shadow;
      // a stand-in body goes once its models are in: made again at once below if it's drawn, else
      // as it next is (out of sight it just goes, outside the frame's budget: nothing shows)
      if (v.body?.waits && (drawn ? this.swappable(v.body.waits, true, true) : [...v.body.waits].every((k) => assets.has(k)))) {
        this.freeMonsterView(v);
        v.body = null;
      }
      if (drawn && !v.body) {
        v.body = this.makeMonsterBody(m);
        // one first seen dead lies where its death has got to by now
        v.lag = m.dead ? Math.min(MAX_LAG, m.deathTime) : 0;
      }
      const b = v.body;
      if (!b) continue;
      b.cull.main = main;
      b.cull.shadow = shadow;
      if (main && !m.dead) this.blobs.add(mp.x, mp.z, m.radius);
      // one neither seen nor shadowing what is is out of the scene and not animated: it catches up
      // on the time it missed when it next is, so it comes into view where its clips have got to
      if (drawn !== (b.rig.root.parent !== null)) {
        if (drawn) this.dynGroup.add(b.rig.root);
        else b.rig.root.removeFromParent();
      }
      if (!drawn) {
        v.lag = Math.min(MAX_LAG, v.lag + dt);
        continue;
      }
      const step = dt + v.lag;
      v.lag = 0;
      b.rig.root.position.x = mp.x;
      b.rig.root.position.z = mp.z;
      if (!m.dead) b.rig.root.rotation.y = smoothAngle(b.rig.root.rotation.y, m.facing, step * 12);
      const hover = g.hover.monster === m;
      // (a copy of the monster with the hover's flash was a big object a monster a frame)
      const an = this.anim(m, m.speed * m.slowFactor(), m.def.blood, Math.max(m.hitFlash, hover ? 0.12 : 0));
      // the attack's clip is its mode's, A1's or A2's, as the AI chose it
      if (m.act && (m.state === 'attack' || m.state === 'cast')) an.clip = MODE_CLIP[m.act.mode];
      // one come up in S1 is drawn getting up for as long as it takes (Monster.riseUp)
      if (m.rise && !m.dead) an.rise = { t: level.time - m.rise.at, len: m.rise.len };
      b.rig.update(step, an);
      // elemental enchant auras
      if (!m.dead && m.mods.length && Math.random() < dt * 10) {
        // fire, cold and lightning enchanted (MonUMod 9, 18, 17)
        const c = m.has(9) ? 'fire' : m.has(18) ? 'cold' : m.has(17) ? 'light' : null;
        if (c) this.fx.enchanted(c, m.pos.x, m.pos.z);
      }
    }
    this.blobs.end();

    // ground items: views of those near, as the monsters'
    const gseen = this.seen;
    const gnear = this.nearby;
    gseen.clear();
    gnear.length = 0;
    for (const gi of level.ground) {
      gseen.add(gi);
      if ((gi.pos.x - p.pos.x) ** 2 + (gi.pos.z - p.pos.z) ** 2 <= nearR * nearR) gnear.push(gi);
    }
    this.groundViews.sync(p.pos, gnear as GroundItem[], (gi) => !gseen.has(gi), farR);
    for (const [gi, had] of this.groundViews.views) {
      let v = had;
      const waits = this.groundWaits.get(v);
      if (waits && this.swappable(waits)) {
        v.removeFromParent();
        disposeView(v, sharedResource);
        v = this.makeGroundView(gi);
        this.groundViews.views.set(gi, v);
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

    // projectiles
    const pseen = new Set<Projectile>();
    for (const pr of level.projectiles) {
      pseen.add(pr);
      let v = this.projViews.get(pr);
      // a glacial spike: an ice bolt half as big again
      const big = pr.kind === 'iceshard' && pr.splash ? 1.5 : 1;
      if (!v) {
        v = makeProjectile(pr.kind);
        v.group.scale.setScalar(big);
        this.dynGroup.add(v.group);
        this.projViews.set(pr, v);
      }
      const prp = this.at(pr);
      v.group.position.set(prp.x, 1.0, prp.z);
      v.group.rotation.y = Math.atan2(pr.vel.x, pr.vel.z);
      // drawn off the effect pictures where it has them, beside its model or for all of it (spellfx.ts missile), else its own glow and trail
      const look = this.fx.missile(pr.kind, prp.x, 1.0, prp.z, v.group.rotation.y, pr.id, dt, big);
      v.group.visible = look !== 'art';
      if (look) continue;
      const trail = pr.kind === 'firebolt' || pr.kind === 'fireball' ? '#ff6010' : pr.kind === 'iceshard' ? '#80c8ff' : pr.kind === 'holybolt' ? '#fff0b0' : pr.kind === 'chargedbolt' ? '#a0b0ff' : null;
      if (trail && Math.random() < 0.8) this.fx.add.spawn({ x: pr.pos.x, y: 1.0, z: pr.pos.z, vy: 0.3, color: trail, size: pr.kind === 'fireball' ? 0.5 : 0.25, life: 0.3 });
    }
    for (const [pr, v] of this.projViews) {
      if (!pseen.has(pr)) {
        v.group.removeFromParent();
        this.projViews.delete(pr);
        // impact puff
        if (this.fx.impact(pr.kind, pr.pos)) continue;
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
        v = this.hammerView();
        this.dynGroup.add(v);
        this.hammerViews.set(h, v);
      }
      v.position.set(h.pos.x, 0.9, h.pos.z);
      v.rotation.y += dt * 18;
      if (!this.fx.hammer(h.pos.x, h.pos.z, this.time, dt) && Math.random() < 0.9) this.fx.add.spawn({ x: h.pos.x, y: 0.9, z: h.pos.z, color: '#6080ff', size: 0.35, life: 0.35, vy: 0.2 });
    }
    for (const [h, v] of this.hammerViews) {
      if (!hseen.has(h)) {
        v.removeFromParent();
        this.hammerViews.delete(h);
      }
    }

    // objects
    this.syncObjects(level, dt);

    // torch flames flicker, in the chunks shown, and throw sparks where the camera sees them
    for (const c of this.scenery?.visible ?? []) {
      for (const f of c.flames) f.scale.setScalar((f.userData.base ?? 1) * (0.8 + Math.random() * 0.25));
      if (!c.inView) continue;
      for (const f of c.spots) {
        if (Math.random() < dt * 6) this.fx.add.spawn({ x: f.x + (Math.random() - 0.5) * 0.08, y: f.y + 0.05, z: f.z + (Math.random() - 0.5) * 0.08, vy: 0.7, color: '#ffa040', size: 0.14, life: 0.5 });
      }
    }
    for (const s of level.layout.services) {
      if (s.kind !== 'campfire') continue;
      const c = s.pos;
      // only a fire about the view: no sparks for the monster camps across the map
      if ((c.x - this.camTarget.x) ** 2 + (c.z - this.camTarget.z) ** 2 > CAMPFIRE_SEEN * CAMPFIRE_SEEN) continue;
      for (let k = 0; k < 3; k++) {
        if (Math.random() < dt * 30) this.fx.add.spawn({ x: c.x + (Math.random() - 0.5) * 0.5, y: 0.2, z: c.z + (Math.random() - 0.5) * 0.5, vy: 1.4 + Math.random(), vx: (Math.random() - 0.5) * 0.3, color: Math.random() < 0.5 ? '#ff6010' : '#ffb040', size: 0.4 + Math.random() * 0.3, life: 0.7, gravity: -0.5 });
      }
    }

    this.lavaTime.value += dt;
    this.mist?.update(dt);
    if (this.post.enabled) for (const [kind, rate] of this.atmos.motes) ambientMotes(this.fx, kind, dt, pp, this.camTarget, this.night, rate);
    this.assignLights();
    this.fx.update(dt);

    this.post.render(dt);
    const ps = this.project(new THREE.Vector3(p.pos.x, 1.0, p.pos.z));
    this.playerScreen = ps;
    // behind the veil once its essentials are in: two frames rushed (the pictures up, then what waited swapped in), then it lifts
    const ess = this.essentials;
    if (ess?.shown && ess.done && ++ess.flushed >= 2 && !this.warming.length) this.essentials = null;
  }

  /**
   * The camera's view and the shadow cameras this frame, the camera and the lights placed: the
   * scenery's chunks go in or out of the scene by them, and the props are culled to them
   */
  private updateViewers() {
    const v = this.viewers;
    this.camera.updateMatrixWorld();
    this.viewProj.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    v.main.setFromProjectionMatrix(this.viewProj);
    // the view's reach on the ground from the hero: its furthest corner, down the camera's line to y = 0
    const hero = this.game.player.pos;
    const ahead = this.camera.getWorldDirection(this.reachDir);
    let reach = 0;
    for (const [cx, cy] of VIEW_CORNERS) {
      const c = this.tmpV.set(cx, cy, -1).unproject(this.camera);
      const t = ahead.y < -1e-6 ? -c.y / ahead.y : 0;
      reach = Math.max(reach, Math.hypot(c.x + ahead.x * t - hero.x, c.z + ahead.z * t - hero.z));
    }
    this.viewReach = reach;
    if (this.dir.castShadow) {
      // as the shadow map will place it (WebGLShadowMap: LightShadow.updateMatrices)
      this.dir.updateMatrixWorld();
      this.dir.target.updateMatrixWorld();
      this.dir.shadow.updateMatrices(this.dir);
      v.sun = this.dir.shadow.getFrustum();
      v.sunDir.subVectors(this.dir.target.position, this.dir.position).normalize();
    } else v.sun = null;
    if (this.heroLight.castShadow) {
      // a point light's shadow reaches as far as the light does (its shadow camera's far plane)
      this.lampSphere.center.copy(this.heroLight.position);
      this.lampSphere.radius = this.heroLight.distance || this.heroLight.shadow.camera.far;
      v.lamp = this.lampSphere;
    } else v.lamp = null;
    this.scenery?.update(v);
    this.props?.cull(v);
  }

  private assignLights() {
    const p = this.game.player;
    const level = this.game.level;
    // static: torches, campfire, waypoint, portals; only the scenery's chunks round the hero are asked
    const cands: { pos: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; flicker: number; d: number }[] = [];
    this.scenery?.lightsNear(p.pos.x, p.pos.z, LIGHT_REACH, (s: StaticLight) => cands.push({ ...s, d: (s.pos.x - p.pos.x) ** 2 + (s.pos.z - p.pos.z) ** 2 }));
    for (const [o, v] of this.objViews.views) {
      if (v.lightColor) cands.push({ pos: new THREE.Vector3(o.pos.x, 1.2, o.pos.z), color: new THREE.Color(v.lightColor), intensity: v.lightIntensity ?? 10, distance: 7, flicker: 0.3, d: (o.pos.x - p.pos.x) ** 2 + (o.pos.z - p.pos.z) ** 2 });
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.torchLights.length; i++) {
      const l = this.torchLights[i];
      const c = cands[i];
      if (c && c.d < LIGHT_REACH * LIGHT_REACH) {
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
