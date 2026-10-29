import * as THREE from 'three';
import { ITEM_BASES, lookOf, staffGem } from '../data/items';
import type { Monster } from '../game/monster';
import type { Player } from '../game/player';
import type { Item } from '../items/item';
import { assets, type ModelKey } from './assets';
import type { Attachment, ModelSpec, MoveClip } from './models';
import { glowSprite, heldModel, topCentroid } from './props';

// ── KayKit clip sets (shared rig) ──
const KK_MOVE: MoveClip[] = [
  { clip: 'Walking_A', ref: 1.9 },
  { clip: 'Running_A', ref: 4.6 },
];
const KK_HIT = ['Hit_A', 'Hit_B'];
const KK_1H = ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal'];
const KK_2H = ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'];
const KK_CHARGE: MoveClip = { clip: 'Running_B', ref: 7 };


/**
 * AI (Meshy) creatures carry their own clips; `walk` / `run` are the strides tools/meshy-merge.mjs
 * prints, measured at the 1.7 m height Meshy rigs at
 */
function meshyClips(h: number, walk: number, run: number, attack: string[], extra: Partial<ModelSpec['clips']> = {}): ModelSpec['clips'] {
  const k = (h * 0.9) / 1.7;
  return {
    idle: ['Idle'],
    move: [
      { clip: 'Walk', ref: walk * k },
      { clip: 'Run', ref: run * k },
    ],
    attack,
    hit: ['Hit'],
    death: ['Death'],
    ...extra,
  };
}

/**
 * body lengths a second the quill rat's planted paws sweep back in its walk at 1× (tools/tripo-merge.mjs
 * mon_quillrat, measured on the merged clip: 0.79-1.04, the four paws' mean)
 */
const QUILLRAT_STRIDE = 0.94;

/** one-piece AI creatures (ModelSpec.motion) have no clips at all */
const NO_CLIPS: ModelSpec['clips'] = { idle: [], move: [], attack: [], death: [] };

const RANK_TINT = {
  champion: { tint: '#5a7aff', emissive: '#14206a' },
  unique: { tint: '#e0a840', emissive: '#4a2e06' },
} as const;

/**
 * What D2's corrupted rogues carry (MonStats2 RHv / SHv / LHv; D2Game Monster.cpp:486-511
 * MONSTER_SetComponents rolls each piece evenly per monster): ours by the piece's look, a flail
 * as a mace, the curved and straight swords all as the one blade
 */
const ROGUE_RH: [ModelKey, number][] = [
  ['axe_1handed', 0.7], // axe
  ['w_club', 0.6], // clb
  ['w_mace', 0.6], // fla
  ['skeleton_blade', 0.62], // flc
  ['axe_1handed', 0.62], // hax
  ['skeleton_blade', 0.66], // lsd
  ['w_mace', 0.62], // mac
  ['skeleton_blade', 0.62], // scm
  ['skeleton_blade', 0.58], // ssd
  ['w_hammer', 0.6], // whm
  ['skeleton_blade', 0.62], // sbr
];
/** nil, buc, lrg, kit */
const ROGUE_SH: (ModelKey | null)[] = [null, 'skeleton_shield_small_a', 'skeleton_shield_large_a', 'skeleton_shield_large_a'];

/** an even pick that stays the same for a monster, a separate roll for each `salt` */
function roll<T>(m: Monster, list: readonly T[], salt: number): T {
  return list[(Math.imul(m.id + salt * 977, 2654435761) >>> 0) % list.length];
}

/**
 * Meshy's corrupted rogue (tools/meshy-chars.mjs mon_rogue_fallen) for all three: the hunter (D2
 * corruptrogue, BaseW 1hs) with a one-handed weapon and maybe a shield, the spearwoman (cr_lancer,
 * 2ht: pike, spear, trident) thrusting a spear, the ranger (cr_archer, a bow in the left hand)
 * shooting. Human-sized, a little over the hunched zombie as D2 draws them (MonStats2 pixHeight
 * 80-96 to its 72).
 */
function rogueSpec(m: Monster, sc: number): ModelSpec {
  const h = 1.75 * sc;
  const base = { model: 'mon_rogue_fallen' as const, rig: 'quat' as const, height: h };
  const atk = (own: string[]) => (m.def.attack?.length ? m.def.attack : own);
  switch (m.def.model) {
    case 'cr_lancer':
      return { ...base, attach: [{ model: 'w_spear', hand: 'r', scale: 0.8, hold: 'level', aim: true }], clips: meshyClips(h, 1.42, 4.25, atk(['Thrust'])) };
    case 'cr_archer':
      return { ...base, attach: [{ model: makeBow, hand: 'l', hold: 'pistol', aim: true }], clips: meshyClips(h, 1.42, 4.25, atk(['Shoot'])) };
  }
  const [rh, scale] = roll(m, ROGUE_RH, 1);
  const sh = roll(m, ROGUE_SH, 2);
  const attach: Attachment[] = [{ model: rh, hand: 'r', scale, hold: 'grip' }];
  if (sh) attach.push({ model: sh, hand: 'l', scale: 0.65, hold: 'shield' });
  return { ...base, attach, clips: meshyClips(h, 1.42, 4.25, atk(['Attack'])) };
}

/** a short bow in world units: limbs along ±Y bowed toward +Z (the target), the grip at the origin */
function makeBow(): THREE.Object3D {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.8 });
  const tip = 0.55;
  const back = -0.16;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -tip, back),
    new THREE.Vector3(0, -tip * 0.55, -0.035),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, tip * 0.55, -0.035),
    new THREE.Vector3(0, tip, back),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.018, 5, false), wood));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.12, 6), new THREE.MeshStandardMaterial({ color: '#2a1a10', roughness: 0.9 }));
  g.add(grip);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, tip * 2, 3), new THREE.MeshStandardMaterial({ color: '#d8d0b8', roughness: 0.6 }));
  string.position.z = back;
  g.add(string);
  return g;
}

export function monsterSpec(m: Monster): ModelSpec {
  const d = m.def;
  const rank = m.rank === 'champion' || m.rank === 'unique' ? RANK_TINT[m.rank] : null;
  const sc = d.scale * (m.rank === 'champion' ? 1.1 : m.rank === 'unique' ? 1.18 : 1);
  // a champion's or unique's tint, else its look's own (a kind drawn on another's model)
  const ranked = (s: ModelSpec): ModelSpec => (rank ? { ...s, tint: rank.tint, tintAmount: 0.4, emissive: rank.emissive } : d.tint ? { ...s, tint: d.tint, tintAmount: 0.45 } : s);
  // the clips its look names for its attacks and casts (src/data/monsters.ts), else the model's own
  const atk = (own: string[]) => (d.attack?.length ? d.attack : own);
  const cast = (own: string[]) => (d.cast?.length ? d.cast : own);
  switch (d.model) {
    case 'zombie': {
      const h = 1.75 * sc;
      return ranked({ model: 'mon_zombie', rig: 'quat', height: h, clips: meshyClips(h, 0.72, 4.26, atk(['Attack'])) });
    }
    case 'skeleton': {
      const elite = m.rank !== 'normal' || m.id % 3 === 0;
      const h = 1.7 * sc;
      return ranked({
        model: elite ? 'mon_skeleton_elite' : 'mon_skeleton',
        rig: 'quat',
        height: h,
        attach: [
          m.id % 4 === 1 ? { model: 'skeleton_axe', hand: 'r', scale: 0.7, hold: 'grip' } : { model: 'skeleton_blade', hand: 'r', scale: 0.65, hold: 'grip' },
          { model: elite ? 'skeleton_shield_large_a' : 'skeleton_shield_small_a', hand: 'l', scale: 0.7, hold: 'shield' },
        ],
        clips: meshyClips(h, 1.42, 4.34, atk(['Attack', 'Attack2']), { block: ['Block'], revive: 'Revive' }),
      });
    }
    case 'skelarcher': {
      const h = 1.7 * sc;
      return ranked({
        model: 'mon_skelarcher',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_crossbow', hand: 'r', scale: 0.7, hold: 'pistol' }],
        clips: meshyClips(h, 1.39, 4.22, atk(['Attack']), { revive: 'Revive' }),
      });
    }
    case 'imp': {
      const h = 1.85 * sc;
      return ranked({
        model: 'mon_imp',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_blade', hand: 'r', scale: 0.45, hold: 'grip' }],
        clips: meshyClips(h, 1.42, 4.09, atk(['Attack', 'Attack2'])),
      });
    }
    case 'shaman': {
      const h = 1.5 * sc;
      return ranked({
        model: 'mon_shaman',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: '#ff7a30', scale: 0.7, hold: 'upright' }],
        clips: meshyClips(h, 1.25, 4.04, atk(['Attack']), { cast: cast(['Cast']) }),
      });
    }
    case 'ghoul':
      return ranked({ model: 'mon_ghoul', rig: 'quat', height: 1.75 * sc, clips: meshyClips(1.75 * sc, 1.43, 4.69, atk(['Attack', 'Attack2'])) });
    case 'spider': {
      // Tripo rig (tools/tripo-merge.mjs): its walk, everything else bent in code (src/render/legs.ts),
      // over a still pose. The back legs sweep 0.44 of the body's width per 0.42 s walk cycle.
      const w = 1.5 * sc;
      const still = ['Idle'];
      return ranked({
        model: 'mon_spider',
        rig: 'quat',
        height: w,
        fitWidth: true,
        legs: 'octopod',
        clips: { idle: still, move: [{ clip: 'Walk', ref: (0.44 * w * 0.9) / 0.42 }], attack: still, hit: [], death: still },
      });
    }
    case 'quillrat': {
      // Tripo rig (tools/tripo-merge.mjs): its walk, the rest posed in code (src/render/legs.ts
      // QuadRig) over the bind pose; the bite on 'attack', the quills on 'cast'. About half a
      // zombie's height, as D2 draws them (MonStats2 pixHeight, where the life bar sits: 48 to the
      // zombie's 72); its quills stand 0.69 of its length.
      const h = 0.85 * sc;
      const still = ['Idle'];
      return ranked({
        model: 'mon_quillrat',
        rig: 'quat',
        height: h,
        legs: 'quadruped',
        clips: { idle: still, move: [{ clip: 'Walk', ref: QUILLRAT_STRIDE * (h / 0.69) * 0.9 }], attack: still, cast: still, hit: [], death: still },
      });
    }
    case 'corruptrogue':
    case 'cr_lancer':
    case 'cr_archer':
      return ranked(rogueSpec(m, sc));
    case 'wraith': {
      const h = 1.55 * sc;
      return ranked({
        model: 'mon_wraith',
        rig: 'quat',
        height: h,
        float: 0.25,
        tint: '#9ad8ff',
        tintAmount: 0.25,
        emissive: '#0c2a48',
        opacity: 0.85,
        clips: meshyClips(h, 1.49, 4.61, atk(['Attack'])),
      });
    }
    case 'demon':
      return ranked({ model: 'mon_demon', rig: 'quat', height: 1.45 * sc, emissive: '#2a0800', clips: meshyClips(1.45 * sc, 1.48, 4.83, atk(['Attack', 'Attack2'])) });
    case 'skelmage': {
      const h = 1.7 * sc;
      return ranked({
        model: 'mon_skelmage',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: d.missile === 'firebolt' ? '#ff7a30' : d.missile === 'poisonspit' ? '#80ff60' : '#80c0ff', scale: 0.8, hold: 'upright' }],
        clips: meshyClips(h, 1.42, 4.34, atk(['Attack']), { cast: cast(['Cast']), revive: 'Revive' }),
      });
    }
    case 'bat':
      // wide wings: size by wingspan
      return ranked({ model: 'mon_bat', rig: 'quat', height: 2.5 * sc, fitWidth: true, float: 0.9, motion: 'flap', clips: NO_CLIPS });
    case 'nest':
      // PLACEHOLDER (src/data/monsters.ts LOOKS.crownest): a prop for a body, swaying a little and
      // keeling over when it dies (ModelSpec.motion), as tall over a zombie as D2's nest (pixHeight 128 to 72)
      return ranked({ model: 'h_tree_dead_small', rig: 'quat', height: 3 * sc, motion: 'hover', clips: NO_CLIPS });
    case 'yeti': {
      const h = 1.75 * sc;
      return ranked({ model: 'mon_yeti', rig: 'quat', height: h, clips: meshyClips(h, 1.42, 4.68, atk(['Attack', 'Attack2'])) });
    }
    case 'butcher': {
      const h = 1.65 * sc;
      return ranked({
        model: 'mon_butcher',
        rig: 'quat',
        height: h,
        attach: [{ model: 'w_cleaver', hand: 'r', scale: 0.9, hold: 'grip' }],
        clips: meshyClips(h, 1.4, 4.15, atk(['Attack', 'Attack2', 'Attack3']), { charge: { clip: 'Charge', ref: (5 * h * 0.9) / 1.7 } }),
      });
    }
    case 'lich': {
      const h = 1.7 * sc;
      return ranked({
        model: 'mon_lich',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: '#80d0ff', scale: 0.85, hold: 'upright' }],
        emissive: '#0a1830',
        clips: meshyClips(h, 1.38, 4.28, atk(['Attack']), { cast: cast(['Cast']) }),
      });
    }
    case 'overlord': {
      const h = 1.55 * sc;
      return ranked({ model: 'mon_overlord', rig: 'quat', height: h, emissive: '#2a0600', clips: meshyClips(h, 1.37, 4.24, atk(['Attack', 'Attack2'])) });
    }
  }
  return { model: 'mon_zombie', rig: 'quat', height: 1.7 * sc, clips: meshyClips(1.7 * sc, 0.72, 4.26, ['Attack']) };
}

function weaponGlow(w: Item | undefined): string | null {
  if (!w) return null;
  if (w.mods.some((m) => m.stat === 'fireMax')) return '#ff5a10';
  if (w.mods.some((m) => m.stat === 'coldMax')) return '#40a0ff';
  if (w.mods.some((m) => m.stat === 'lightMax')) return '#e0e060';
  if (w.rarity === 'unique' || w.rarity === 'runeword') return '#c8a86a';
  if (w.rarity === 'set') return '#30c030';
  return null;
}

const SHIELD_MESH: Record<string, string> = {
  buckler: 'Round_Shield',
  roundshield: 'Round_Shield',
  kiteshield: 'Badge_Shield',
  towershield: 'Rectangle_Shield',
  gothicshield: 'Spike_Shield',
};

/** mace / maul in world units, handle along +Y from the grip */
function makeMace(twoHanded: boolean, glow: string | null): THREE.Object3D {
  // the AI pieces were fitted over KayKit axes, so their grip sits at the origin like those
  const t = assets.get(twoHanded ? 'w_maul' : 'w_mace');
  if (t) {
    const o = t.gltf.scene.clone(true);
    o.scale.setScalar(twoHanded ? 0.75 : 0.65);
    return o;
  }
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: '#a8a8b0', metalness: 0.75, roughness: 0.35, emissive: glow ?? '#000000', emissiveIntensity: glow ? 0.6 : 0 });
  const len = twoHanded ? 1.0 : 0.6;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), wood);
  handle.position.y = len / 2 - 0.08;
  g.add(handle);
  if (twoHanded) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.36), metal);
    head.position.y = len - 0.08;
    g.add(head);
  } else {
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), metal);
    head.position.y = len - 0.1;
    g.add(head);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), metal);
      const a = (i * Math.PI) / 2;
      sp.position.set(Math.sin(a) * 0.1, len - 0.1, Math.cos(a) * 0.1);
      sp.rotation.set(Math.cos(a) * 1.57, 0, -Math.sin(a) * 1.57);
      g.add(sp);
    }
  }
  return g;
}

/** staff in world units, haft along +Y, the origin where the hand takes it */
function makeStaff(baseId: string | undefined, glow: string | null): THREE.Object3D {
  const t = assets.get('w_staff');
  if (t) {
    const g = new THREE.Group();
    const o = t.gltf.scene.clone(true);
    o.scale.setScalar(0.8);
    g.add(o);
    // a gem of the staff's colour glowing in its head
    const color = glow ?? staffGem(baseId ?? '');
    if (color) {
      const gem = glowSprite(color, 0.4, 0.9);
      gem.position.copy(topCentroid(g, 0.1));
      g.add(gem);
    }
    return g;
  }
  const g = new THREE.Group();
  const len = 1.7;
  const wood = new THREE.MeshStandardMaterial({ color: '#4a2c14', roughness: 0.85 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, len, 7), wood);
  shaft.position.y = len / 2;
  g.add(shaft);
  const claw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.013, 6, 12), new THREE.MeshStandardMaterial({ color: '#8a6a2a', metalness: 0.7, roughness: 0.4 }));
  claw.position.y = len + 0.03;
  claw.rotation.x = Math.PI / 2;
  g.add(claw);
  const color = glow ?? staffGem(baseId ?? '') ?? '#ff8a3a';
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 }));
  gem.position.y = len + 0.06;
  g.add(gem);
  // held a little above the middle
  for (const c of g.children) c.position.y -= 0.9;
  return g;
}
/** a sorceress's orb: the crystal glows in its tier's colour */
function makeOrb(baseId: string, glow: string | null): THREE.Object3D {
  const color = glow ?? staffGem(ITEM_BASES[baseId]?.tiers?.[1] ?? 'longstaff') ?? '#a0c0ff';
  const g = new THREE.Group();
  const t = assets.get('w_orb');
  if (t) {
    const o = t.gltf.scene.clone(true);
    o.scale.setScalar(0.75);
    g.add(o);
    const halo = glowSprite(color, 0.4, 0.75);
    halo.position.copy(topCentroid(g, 0.2));
    g.add(halo);
    return g;
  }
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.2 }));
  orb.position.y = 0.09;
  g.add(orb);
  const halo = glowSprite(color, 0.45, 0.8);
  halo.position.y = 0.09;
  g.add(halo);
  return g;
}


/** Meshy-generated sorceress (tools/meshy-sorceress.mjs); her own rig, staff held upright */
function sorceressSpec(p: Player): ModelSpec {
  return {
    model: 'sorceress',
    rig: 'quat',
    height: 1.8,
    attach: meshyGear(p),
    clips: {
      idle: ['Idle'],
      // stride speeds measured on the clips, scaled to the in-game body height (1.8 × 0.9)
      move: [
        { clip: 'Walk', ref: 1.31 },
        { clip: 'Run', ref: 3.95 },
      ],
      attack: ['Attack'],
      cast: ['Cast'],
      hit: ['Hit'],
      charge: { clip: 'Run', ref: 7 },
      death: ['Death'],
    },
  };
}

/**
 * Meshy-generated paladin (tools/meshy-merge.mjs) is the default; in `npm run dev`, ?aihero shows
 * the earlier AI hero (tools/ai-*.mjs pipeline), ?knight the KayKit knight (dev-models.ts: dist has
 * neither model)
 */
const QUERY = typeof location !== 'undefined' ? location.search : '';
const AI_HERO = import.meta.env.DEV && QUERY.includes('aihero');
const KNIGHT = import.meta.env.DEV && QUERY.includes('knight');

/** in-game body height over the height Meshy rigs at (1.7 m): scales measured stride speeds */
const MESHY_K = (1.8 * 0.9) / 1.7;

/** gear for Meshy rigs, which have plain hands and no weapon slots (see Attachment.hold) */
function meshyGear(p: Player): Attachment[] {
  const eq = p.equipment;
  const wb = eq.weapon ? ITEM_BASES[eq.weapon.baseId] : null;
  const glow = weaponGlow(eq.weapon);
  const attach: Attachment[] = [];
  const held = wb ? heldModel(wb) : null;
  if (wb?.type === 'staff') attach.push({ model: () => makeStaff(wb.id, glow), hand: 'r', hold: 'upright' });
  else if (wb?.type === 'orb') attach.push({ model: () => makeOrb(wb.id, glow), hand: 'r', hold: 'grip' });
  // spears and polearms are taller than their bearer: kept upright like a staff
  else if (held) attach.push({ model: held[0], hand: 'r', glow, scale: held[1], hold: wb!.type === 'spear' || wb!.type === 'polearm' ? 'upright' : 'grip' });
  if (eq.offhand) {
    const large = lookOf(eq.offhand.baseId) === 'towershield' || lookOf(eq.offhand.baseId) === 'gothicshield';
    attach.push({ model: large ? 'skeleton_shield_large_a' : 'skeleton_shield_small_a', hand: 'l', scale: 0.7, hold: 'shield' });
  }
  return attach;
}

function paladinSpec(p: Player): ModelSpec {
  const wb = p.equipment.weapon ? ITEM_BASES[p.equipment.weapon.baseId] : null;
  return {
    model: 'paladin',
    rig: 'quat',
    height: 1.8,
    attach: meshyGear(p),
    clips: {
      idle: ['Idle'],
      move: [
        { clip: 'Walk', ref: 0.7 * MESHY_K },
        { clip: 'Run', ref: 4.3 * MESHY_K },
      ],
      attack: wb?.twoHanded ? ['Attack2H', 'Attack2H2'] : ['Attack'],
      cast: ['Cast'],
      hit: ['Hit'],
      block: ['Block'],
      charge: { clip: 'Run', ref: 4.3 * MESHY_K },
      death: ['Death'],
    },
  };
}

/** own rig + embedded clips; gear shows as hand attachments only (no body submeshes to toggle) */
function aiPlayerSpec(p: Player): ModelSpec {
  const eq = p.equipment;
  const wb = eq.weapon ? ITEM_BASES[eq.weapon.baseId] : null;
  const glow = weaponGlow(eq.weapon);
  const twoHanded = !!wb?.twoHanded;
  const attach: Attachment[] = [];
  if (wb?.type === 'sword') attach.push({ model: 'skeleton_blade', hand: 'r', glow, scale: twoHanded ? 0.95 : 0.7 });
  else if (wb?.type === 'axe') attach.push({ model: twoHanded ? 'axe_2handed' : 'axe_1handed', hand: 'r', glow, scale: 0.75 });
  else if (wb) attach.push({ model: () => makeMace(twoHanded, glow), hand: 'r' });
  if (eq.offhand) {
    const large = lookOf(eq.offhand.baseId) === 'towershield' || lookOf(eq.offhand.baseId) === 'gothicshield';
    attach.push({ model: large ? 'skeleton_shield_large_a' : 'skeleton_shield_small_a', hand: 'l', scale: 0.75 });
  }
  return {
    model: 'ai_hero',
    rig: 'quat',
    height: 1.8,
    attach,
    clips: {
      idle: ['Idle'],
      move: [
        { clip: 'Walk', ref: 1.9 },
        { clip: 'Run', ref: 4.6 },
      ],
      attack: wb ? ['Attack', 'Attack2'] : ['Attack'],
      cast: ['Cast'],
      hit: ['Hit'],
      charge: { clip: 'Run', ref: 7 },
      death: ['Death'],
    },
  };
}

export function playerSpec(p: Player): ModelSpec {
  if (p.cls === 'sorceress') return sorceressSpec(p);
  if (AI_HERO) return aiPlayerSpec(p);
  if (!KNIGHT) return paladinSpec(p);
  const eq = p.equipment;
  const wb = eq.weapon ? ITEM_BASES[eq.weapon.baseId] : null;
  const glow = weaponGlow(eq.weapon);
  const show: string[] = [];
  const attach: Attachment[] = [];
  const twoHanded = !!wb?.twoHanded;
  let glowMesh: string | null = null;
  if (wb?.type === 'sword') {
    glowMesh = twoHanded ? '2H_Sword' : '1H_Sword';
    show.push(glowMesh);
  } else if (wb?.type === 'axe') attach.push({ model: twoHanded ? 'axe_2handed' : 'axe_1handed', hand: 'r', glow });
  else if (wb) attach.push({ model: () => makeMace(twoHanded, glow), hand: 'r' });
  if (eq.offhand) show.push(SHIELD_MESH[lookOf(eq.offhand.baseId)] ?? 'Round_Shield');
  if (eq.head) show.push('Knight_Helmet');
  const body = eq.body;
  if (body && (body.rarity === 'rare' || body.rarity === 'unique' || body.rarity === 'set' || body.rarity === 'runeword')) show.push('Knight_Cape');
  return {
    model: 'knight',
    rig: 'kaykit',
    height: 1.8,
    show,
    attach,
    glow: glow && glowMesh ? { meshes: [glowMesh], color: glow } : null,
    clips: {
      idle: twoHanded ? ['2H_Melee_Idle'] : ['Idle'],
      move: KK_MOVE,
      attack: twoHanded ? KK_2H : wb ? KK_1H : ['Unarmed_Melee_Attack_Punch_A'],
      cast: ['Spellcast_Shoot'],
      hit: KK_HIT,
      block: ['Block_Hit'],
      charge: KK_CHARGE,
      death: ['Death_A', 'Death_B'],
    },
  };
}

/** Meshy-generated camp folk: they stand around; walk / run come free with the rig */
function npcModel(model: ModelSpec['model'], height: number, walk: number, run: number): ModelSpec {
  const k = (height * 0.9) / 1.7;
  return {
    model,
    rig: 'quat',
    height,
    clips: { idle: ['Idle'], move: [{ clip: 'Walk', ref: walk * k }, { clip: 'Run', ref: run * k }], attack: [], death: [] },
  };
}

export function vendorSpec(): ModelSpec {
  return npcModel('npc_vendor', 1.7, 1.47, 4.78);
}

/** decorative townsfolk */
export function npcSpec(model: string): ModelSpec {
  switch (model) {
    case 'barbarian':
      return npcModel('npc_mercenary', 1.95, 1.4, 4.23);
    case 'rogue_hooded':
      return npcModel('npc_warden', 1.8, 1.39, 4.18);
    default:
      return npcModel('npc_rogue', 1.75, 1.4, 4.56);
  }
}
