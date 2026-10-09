import * as THREE from 'three';
import { ITEM_BASES } from '../data/items';
import type { Monster } from '../game/monster';
import type { Player } from '../game/player';
import type { Item } from '../items/item';
import type { Attachment, ModelSpec, MoveClip } from './models';

// ── KayKit clip sets (shared rig) ──
const KK_MOVE: MoveClip[] = [
  { clip: 'Walking_A', ref: 1.9 },
  { clip: 'Running_A', ref: 4.6 },
];
const KK_HIT = ['Hit_A', 'Hit_B'];
const KK_1H = ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal'];
const KK_2H = ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'];
const KK_CHARGE: MoveClip = { clip: 'Running_B', ref: 7 };

/** Quaternius creatures share clip names; scale stride refs with body size */
function quatClips(h: number, attack: string[]): ModelSpec['clips'] {
  const k = h / 1.7;
  return {
    idle: ['Idle', 'Flying_Idle', 'Spider_Idle'],
    move: [
      { clip: 'Walk', ref: 1.5 * k },
      { clip: 'Run', ref: 3.8 * k },
      { clip: 'Flying_Idle', ref: 1.0 * k },
      { clip: 'Fast_Flying', ref: 3.0 * k },
      { clip: 'Spider_Walk', ref: 3.0 * k },
    ],
    attack,
    hit: ['HitReact'],
    charge: { clip: 'Run', ref: 4 * k },
    death: ['Death', 'Spider_Death'],
  };
}

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
    case 'zombie':
      return ranked({ model: 'q_zombie', rig: 'quat', height: 1.75 * sc, clips: quatClips(1.75 * sc, ['Punch']) });
    case 'skeleton': {
      const elite = m.rank !== 'normal' || m.id % 3 === 0;
      return ranked({
        model: elite ? 'skeleton_warrior' : 'skeleton_minion',
        rig: 'kaykit',
        height: 1.7 * sc,
        attach: [
          { model: m.id % 4 === 1 ? 'skeleton_axe' : 'skeleton_blade', hand: 'r' },
          { model: elite ? 'skeleton_shield_large_a' : 'skeleton_shield_small_a', hand: 'l' },
        ],
        clips: { idle: ['Idle'], move: KK_MOVE, attack: KK_1H, hit: KK_HIT, block: ['Block_Hit'], death: ['Death_C_Skeletons'], revive: 'Death_C_Skeletons_Resurrect' },
      });
    }
    case 'skelarcher':
      return ranked({
        model: 'skeleton_rogue',
        rig: 'kaykit',
        height: 1.7 * sc,
        attach: [{ model: 'skeleton_crossbow', hand: 'r' }],
        clips: { idle: ['Idle'], move: KK_MOVE, attack: ['1H_Ranged_Shoot'], hit: KK_HIT, death: ['Death_C_Skeletons'], revive: 'Death_C_Skeletons_Resurrect' },
      });
    case 'imp': {
      const hell = d.id === 'hellimp';
      const base: ModelSpec = { model: 'q_demon_small', rig: 'quat', height: 1.85 * sc, clips: quatClips(1.85 * sc, ['Weapon', 'Punch']) };
      if (hell && !rank) return { ...base, tint: '#ff7a20', tintAmount: 0.45, emissive: '#3a0c00' };
      return ranked(base);
    }
    case 'shaman':
      return ranked({ model: 'q_tribal', rig: 'quat', height: 1.5 * sc, float: 0.45, clips: { ...quatClips(1.5 * sc, ['Headbutt', 'Punch']), cast: ['Yes'] } });
    case 'ghoul':
      return ranked({ model: 'q_orc', rig: 'quat', height: 1.75 * sc, tint: '#7a8a50', tintAmount: 0.3, clips: quatClips(1.75 * sc, ['Weapon', 'Punch']) });
    case 'spider':
      return ranked({ model: 'q_spider', rig: 'quat', height: 1.5 * sc, fitWidth: true, clips: { ...quatClips(1.5 * sc, ['Spider_Attack']), hit: [] } });
    case 'wraith':
      return ranked({
        model: 'q_ghost',
        rig: 'quat',
        height: 1.55 * sc,
        float: 0.35,
        tint: '#9ad8ff',
        tintAmount: 0.5,
        emissive: '#0c2a48',
        opacity: 0.82,
        clips: quatClips(1.55 * sc, ['Punch', 'Headbutt']),
      });
    case 'demon':
      return ranked({ model: 'q_demon_winged', rig: 'quat', height: 1.45 * sc, float: 0.3, emissive: '#2a0800', clips: quatClips(1.45 * sc, ['Punch', 'Headbutt']) });
    case 'skullfly':
      return ranked({ model: 'q_ghost_skull', rig: 'quat', height: 1.45 * sc, float: 0.5, clips: quatClips(1.2 * sc, ['Headbutt', 'Punch']) });
    case 'skelmage':
      return ranked({
        model: 'skeleton_mage',
        rig: 'kaykit',
        height: 1.7 * sc,
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: '#80c0ff' }],
        clips: { idle: ['Idle'], move: KK_MOVE, attack: ['Spellcast_Shoot'], hit: KK_HIT, death: ['Death_C_Skeletons'], revive: 'Death_C_Skeletons_Resurrect' },
      });
    case 'bat':
      // wide wings: size by wingspan
      return ranked({ model: m.rank === 'normal' || m.rank === 'minion' ? 'q_goleling' : 'q_goleling_evolved', rig: 'quat', height: 2.5 * sc, fitWidth: true, float: 0.7, clips: quatClips(1.4 * sc, ['Headbutt', 'Punch']) });
    case 'mushroom':
      return ranked({ model: 'q_mushroom_king', rig: 'quat', height: 1.75 * sc, clips: quatClips(1.75 * sc, ['Weapon', 'Punch']) });
    case 'yeti':
      return ranked({ model: 'q_yeti_b', rig: 'quat', height: 1.75 * sc, clips: quatClips(1.75 * sc, ['Punch', 'Weapon']) });
    case 'dragon':
      return ranked({ model: 'q_dragon_evolved', rig: 'quat', height: 2.2 * sc, fitWidth: true, float: 0.5, emissive: '#200800', clips: quatClips(1.6 * sc, ['Headbutt', 'Punch']) });
    case 'butcher':
      return {
        model: 'barbarian',
        rig: 'kaykit',
        height: 1.65 * sc,
        show: ['2H_Axe'],
        tint: '#c05040',
        tintAmount: 0.3,
        clips: { idle: ['2H_Melee_Idle'], move: KK_MOVE, attack: [...KK_2H, '2H_Melee_Attack_Spin'], hit: KK_HIT, charge: KK_CHARGE, death: ['Death_B'] },
      };
    case 'lich':
      return {
        model: 'skeleton_mage',
        rig: 'kaykit',
        height: 1.7 * sc,
        show: [],
        attach: [{ model: 'skeleton_staff', hand: 'r', glow: '#80d0ff' }],
        tint: '#a8d8ff',
        tintAmount: 0.55,
        emissive: '#0a1830',
        clips: { idle: ['Idle'], move: KK_MOVE, attack: ['Spellcast_Shoot'], cast: ['Spellcast_Raise', 'Spellcast_Shoot'], hit: KK_HIT, death: ['Death_C_Skeletons'] },
      };
    case 'overlord':
      return {
        model: 'q_demon_blue',
        rig: 'quat',
        height: 1.55 * sc,
        tint: '#b02818',
        tintAmount: 0.55,
        emissive: '#2a0600',
        clips: quatClips(1.55 * sc, ['Weapon', 'Punch']),
      };
  }
  return { model: 'q_zombie', rig: 'quat', height: 1.7 * sc, clips: quatClips(1.7 * sc, ['Punch']) };
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

/** procedural mace / maul in world units, handle along +Y from the grip */
function makeMace(twoHanded: boolean, glow: string | null): THREE.Object3D {
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

export function playerSpec(p: Player): ModelSpec {
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

export function vendorSpec(): ModelSpec {
  return {
    model: 'mage',
    rig: 'kaykit',
    height: 1.75,
    show: ['Mage_Hat', 'Mage_Cape', 'Spellbook'],
    clips: { idle: ['Idle'], move: KK_MOVE, attack: [], death: ['Death_A'] },
  };
}

/** decorative townsfolk */
export function npcSpec(model: string): ModelSpec {
  switch (model) {
    case 'barbarian':
      return {
        model: 'barbarian',
        rig: 'kaykit',
        height: 1.85,
        show: ['Barbarian_Hat', 'Barbarian_Cape', '2H_Axe'],
        clips: { idle: ['2H_Melee_Idle'], move: KK_MOVE, attack: [], death: ['Death_A'] },
      };
    case 'rogue_hooded':
      return {
        model: 'rogue_hooded',
        rig: 'kaykit',
        height: 1.75,
        show: ['Rogue_Cape', '2H_Crossbow'],
        clips: { idle: ['Idle_Combat', 'Idle'], move: KK_MOVE, attack: [], death: ['Death_A'] },
      };
    default:
      return {
        model: 'rogue',
        rig: 'kaykit',
        height: 1.75,
        show: ['Rogue_Cape', '1H_Crossbow'],
        clips: { idle: ['Idle_B', 'Idle'], move: KK_MOVE, attack: [], death: ['Death_A'] },
      };
  }
}
