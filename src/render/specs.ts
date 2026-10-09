import * as THREE from 'three';
import { ITEM_BASES } from '../data/items';
import type { Monster } from '../game/monster';
import type { Player } from '../game/player';
import type { Item } from '../items/item';
import { assets } from './assets';
import type { Attachment, ModelSpec, MoveClip } from './models';
import { glowSprite, topCentroid } from './props';

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

/** one-piece AI creatures (ModelSpec.motion) have no clips at all */
const NO_CLIPS: ModelSpec['clips'] = { idle: [], move: [], attack: [], death: [] };

const RANK_TINT = {
  champion: { tint: '#5a7aff', emissive: '#14206a' },
  unique: { tint: '#e0a840', emissive: '#4a2e06' },
} as const;

export function monsterSpec(m: Monster): ModelSpec {
  const d = m.def;
  const rank = m.rank === 'champion' || m.rank === 'unique' ? RANK_TINT[m.rank] : null;
  const sc = d.scale * (m.rank === 'champion' ? 1.1 : m.rank === 'unique' ? 1.18 : 1);
  const ranked = (s: ModelSpec): ModelSpec => (rank ? { ...s, tint: rank.tint, tintAmount: 0.4, emissive: rank.emissive } : s);
  switch (d.model) {
    case 'zombie': {
      const h = 1.75 * sc;
      return ranked({ model: 'mon_zombie', rig: 'quat', height: h, clips: meshyClips(h, 0.72, 4.26, ['Attack']) });
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
        clips: meshyClips(h, 1.42, 4.34, ['Attack', 'Attack2'], { block: ['Block'], revive: 'Revive' }),
      });
    }
    case 'skelarcher': {
      const h = 1.7 * sc;
      return ranked({
        model: 'mon_skelarcher',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_crossbow', hand: 'r', scale: 0.7, hold: 'pistol' }],
        clips: meshyClips(h, 1.39, 4.22, ['Attack'], { revive: 'Revive' }),
      });
    }
    case 'imp': {
      const hell = d.id === 'hellimp';
      const h = 1.85 * sc;
      const base: ModelSpec = {
        model: 'mon_imp',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_blade', hand: 'r', scale: 0.45, hold: 'grip' }],
        clips: meshyClips(h, 1.42, 4.09, ['Attack', 'Attack2']),
      };
      if (hell && !rank) return { ...base, tint: '#ff7a20', tintAmount: 0.45, emissive: '#3a0c00' };
      return ranked(base);
    }
    case 'shaman': {
      const h = 1.5 * sc;
      return ranked({
        model: 'mon_shaman',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: '#ff7a30', scale: 0.7, hold: 'upright' }],
        clips: meshyClips(h, 1.25, 4.04, ['Attack'], { cast: ['Cast'] }),
      });
    }
    case 'ghoul':
      return ranked({ model: 'mon_ghoul', rig: 'quat', height: 1.75 * sc, clips: meshyClips(1.75 * sc, 1.43, 4.69, ['Attack', 'Attack2']) });
    case 'spider':
      return ranked({ model: 'mon_spider', rig: 'quat', height: 1.5 * sc, fitWidth: true, motion: 'crawl', clips: NO_CLIPS });
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
        clips: meshyClips(h, 1.49, 4.61, ['Attack']),
      });
    }
    case 'demon':
      return ranked({ model: 'mon_demon', rig: 'quat', height: 1.45 * sc, emissive: '#2a0800', clips: meshyClips(1.45 * sc, 1.48, 4.83, ['Attack', 'Attack2']) });
    case 'skullfly':
      return ranked({ model: 'mon_skullfly', rig: 'quat', height: 0.95 * sc, float: 1.0, motion: 'hover', emissive: '#1a0c04', clips: NO_CLIPS });
    case 'skelmage': {
      const h = 1.7 * sc;
      return ranked({
        model: 'mon_skelmage',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: '#80c0ff', scale: 0.8, hold: 'upright' }],
        clips: meshyClips(h, 1.42, 4.34, ['Attack'], { cast: ['Cast'], revive: 'Revive' }),
      });
    }
    case 'bat':
      // wide wings: size by wingspan
      return ranked({ model: 'mon_bat', rig: 'quat', height: 2.5 * sc, fitWidth: true, float: 0.9, motion: 'flap', clips: NO_CLIPS });
    case 'mushroom': {
      const h = 1.75 * sc;
      return ranked({ model: 'mon_mushroom', rig: 'quat', height: h, clips: meshyClips(h, 1.33, 3.98, ['Attack']) });
    }
    case 'yeti': {
      const h = 1.75 * sc;
      return ranked({ model: 'mon_yeti', rig: 'quat', height: h, clips: meshyClips(h, 1.42, 4.68, ['Attack', 'Attack2']) });
    }
    case 'dragon':
      return ranked({ model: 'mon_dragon', rig: 'quat', height: 2.2 * sc, fitWidth: true, float: 0.5, motion: 'flap', emissive: '#200800', clips: NO_CLIPS });
    case 'butcher': {
      const h = 1.65 * sc;
      return {
        model: 'mon_butcher',
        rig: 'quat',
        height: h,
        attach: [{ model: 'w_cleaver', hand: 'r', scale: 0.9, hold: 'grip' }],
        clips: meshyClips(h, 1.4, 4.15, ['Attack', 'Attack2', 'Attack3'], { charge: { clip: 'Charge', ref: (5 * h * 0.9) / 1.7 } }),
      };
    }
    case 'lich': {
      const h = 1.7 * sc;
      return {
        model: 'mon_lich',
        rig: 'quat',
        height: h,
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: '#80d0ff', scale: 0.85, hold: 'upright' }],
        emissive: '#0a1830',
        clips: meshyClips(h, 1.38, 4.28, ['Attack'], { cast: ['Cast'] }),
      };
    }
    case 'overlord': {
      const h = 1.55 * sc;
      return { model: 'mon_overlord', rig: 'quat', height: h, emissive: '#2a0600', clips: meshyClips(h, 1.37, 4.24, ['Attack', 'Attack2']) };
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

const STAFF_GEM: Record<string, string> = { shortstaff: '#ff8a3a', longstaff: '#a0c0ff', gnarledstaff: '#80e090', battlestaff: '#60a0ff', warstaff: '#ff5a10' };

/** staff in world units, haft along +Y, the origin where the hand takes it */
function makeStaff(baseId: string | undefined, glow: string | null): THREE.Object3D {
  const t = assets.get('w_staff');
  if (t) {
    const g = new THREE.Group();
    const o = t.gltf.scene.clone(true);
    o.scale.setScalar(0.8);
    g.add(o);
    // a gem of the staff's colour glowing in its head
    const gem = glowSprite(glow ?? STAFF_GEM[baseId ?? ''] ?? '#ff8a3a', 0.4, 0.9);
    gem.position.copy(topCentroid(g, 0.1));
    g.add(gem);
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
  const color = glow ?? STAFF_GEM[baseId ?? ''] ?? '#ff8a3a';
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 }));
  gem.position.y = len + 0.06;
  g.add(gem);
  // held a little above the middle
  for (const c of g.children) c.position.y -= 0.9;
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
 * Meshy-generated paladin (tools/meshy-merge.mjs) is the default; ?aihero shows the earlier
 * AI hero (tools/ai-*.mjs pipeline), ?knight the KayKit knight
 */
const QUERY = typeof location !== 'undefined' ? location.search : '';
const AI_HERO = QUERY.includes('aihero');
const KNIGHT = QUERY.includes('knight');

/** in-game body height over the height Meshy rigs at (1.7 m): scales measured stride speeds */
const MESHY_K = (1.8 * 0.9) / 1.7;

/** gear for Meshy rigs, which have plain hands and no weapon slots (see Attachment.hold) */
function meshyGear(p: Player): Attachment[] {
  const eq = p.equipment;
  const wb = eq.weapon ? ITEM_BASES[eq.weapon.baseId] : null;
  const glow = weaponGlow(eq.weapon);
  const twoHanded = !!wb?.twoHanded;
  const attach: Attachment[] = [];
  if (wb?.type === 'staff') attach.push({ model: () => makeStaff(wb.id, glow), hand: 'r', hold: 'upright' });
  else if (wb?.type === 'sword') attach.push(twoHanded ? { model: 'w_greatsword', hand: 'r', glow, scale: 0.7, hold: 'grip' } : { model: 'skeleton_blade', hand: 'r', glow, scale: 0.65, hold: 'grip' });
  else if (wb?.type === 'axe') attach.push({ model: twoHanded ? 'axe_2handed' : 'axe_1handed', hand: 'r', glow, scale: 0.75, hold: 'grip' });
  else if (wb) attach.push({ model: () => makeMace(twoHanded, glow), hand: 'r', hold: 'grip' });
  if (eq.offhand) {
    const large = eq.offhand.baseId === 'towershield' || eq.offhand.baseId === 'gothicshield';
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
    const large = eq.offhand.baseId === 'towershield' || eq.offhand.baseId === 'gothicshield';
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
  if (eq.offhand) show.push(SHIELD_MESH[eq.offhand.baseId] ?? 'Round_Shield');
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
