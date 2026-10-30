import { ITEM_BASES, lookOf } from '../data/items';
import type { Monster } from '../game/monster';
import type { Player } from '../game/player';
import type { RigLook, ShieldShape, WeaponShape, HelmShape } from './rig';

export function monsterLook(m: Monster): RigLook {
  const d = m.def;
  const champ = m.rank === 'champion';
  const uniq = m.rank === 'unique';
  const tint = champ ? '#4a6aff' : uniq ? '#d8a040' : null;
  const emissive = champ ? '#1a2a8a' : uniq ? '#5a3a08' : null;
  const scale = d.scale * (champ ? 1.1 : uniq ? 1.18 : 1);
  const base: RigLook = {
    type: 'humanoid',
    scale,
    skin: d.color,
    cloth: d.color2,
    head: 'human',
    weapon: 'none',
    tint,
    emissive,
  };
  switch (d.model) {
    case 'zombie':
      return { ...base, head: 'zombie', hunch: 0.35, cloth: '#3a3226', pants: '#2a241c', weapon: 'claws', bulk: 1.05 };
    case 'skeleton':
      return { ...base, head: 'skull', limb: 0.55, bulk: 0.85, cloth: d.color, pants: d.color, weapon: 'sword', weaponColor: '#7a6a50', shield: 'buckler', shieldColor: '#4a3a28', eyes: '#ff4020' };
    case 'skelarcher':
      return { ...base, head: 'skull', limb: 0.55, bulk: 0.85, cloth: d.color, pants: d.color, weapon: 'bow', eyes: '#ff4020' };
    case 'imp':
      return { ...base, head: 'imp', horns: true, hunch: 0.25, weapon: 'spear', weaponColor: '#8a7a6a', eyes: '#ffd020', pants: d.color2, cloth: d.color, limb: 0.9 };
    case 'shaman':
      return { ...base, head: 'imp', horns: true, hunch: 0.3, weapon: 'staff', weaponGlow: '#ff6020', eyes: '#ffd020', robe: '#5a1a3a', cloth: '#6a2a4a' };
    case 'ghoul':
      return { ...base, head: 'ghoul', hunch: 0.45, weapon: 'claws', limb: 0.9, bulk: 0.95, eyes: '#c0ff40', pants: '#2a2a20' };
    case 'spider':
      return { ...base, type: 'spider', eyes: '#ff2020' };
    case 'corruptrogue':
      return { ...base, cloth: '#4a2a3a', pants: '#2a1a20', skin: '#a08a8a', weapon: 'sword', weaponColor: '#8a8a90', eyes: '#ff3030' };
    case 'cr_lancer':
      return { ...base, cloth: '#4a2a3a', pants: '#2a1a20', skin: '#a08a8a', weapon: 'spear', weaponColor: '#8a7a6a', eyes: '#ff3030' };
    case 'cr_archer':
      return { ...base, cloth: '#4a2a3a', pants: '#2a1a20', skin: '#a08a8a', weapon: 'bow', eyes: '#ff3030' };
    case 'quillrat':
      return { ...base, type: 'spider', skin: '#5a4a3a', cloth: '#2a2018', eyes: '#ff8020' };
    case 'wraith':
      return { ...base, head: 'hood', robe: '#4a7aa8', cloth: '#5a8ab8', skin: '#a8d8ff', weapon: 'claws', floating: true, ghost: true, eyes: '#c0f0ff', limb: 0.6 };
    // the goatman's stand-in, till its model is in: a horned beastman
    case 'goatman':
      return { ...base, head: 'demon', horns: true, weapon: 'greataxe', bulk: 1.2, limb: 1.2, eyes: '#ffa020', pants: '#2a1a0a' };
    case 'butcher':
      return { ...base, head: 'zombie', bulk: 1.55, limb: 1.4, weapon: 'cleaver', weaponColor: '#9a8a80', cloth: '#d0c0a8', armor: '#6a1010', metal: 0, pants: '#3a2a20', hunch: 0.15, eyes: '#ff2020' };
    case 'lich':
      return { ...base, head: 'skull', helm: 'crown', limb: 0.6, robe: '#2a3a5a', cloth: '#3a4a6a', skin: '#c8d8e8', weapon: 'staff', weaponGlow: '#80d0ff', eyes: '#80e0ff', cape: '#1a2440' };
    case 'overlord':
      return { ...base, head: 'demon', horns: true, bulk: 1.3, limb: 1.3, weapon: 'greatsword', weaponColor: '#3a2a2a', weaponGlow: '#ff5a10', armor: '#2a1a1a', metal: 0.6, eyes: '#ffb020', cape: '#3a0808', emissive: '#2a0800' };
  }
  return base;
}

function weaponShape(baseId: string | undefined): WeaponShape {
  if (!baseId) return 'none';
  const b = ITEM_BASES[baseId];
  switch (b.type) {
    case 'sword':
    case 'dagger':
      return b.twoHanded ? 'greatsword' : 'sword';
    case 'axe':
      return b.twoHanded ? 'greataxe' : 'axe';
    case 'club':
    case 'mace':
    case 'scepter':
    case 'hammer':
    case 'wand':
      return b.twoHanded ? 'maul' : 'mace';
    case 'staff':
      return 'staff';
    case 'spear':
    case 'polearm':
      return 'spear';
    default:
      return 'none';
  }
}

function shieldShape(baseId: string | undefined): ShieldShape {
  if (!baseId) return null;
  switch (baseId) {
    case 'buckler':
      return 'buckler';
    case 'roundshield':
      return 'round';
    case 'kiteshield':
      return 'kite';
    case 'towershield':
      return 'tower';
    case 'gothicshield':
      return 'gothic';
    default:
      return 'round';
  }
}

function helmShape(baseId: string | undefined): HelmShape {
  switch (baseId) {
    case 'cap':
      return 'cap';
    case 'skullcap':
      return 'skull';
    case 'helm':
      return 'helm';
    case 'fullhelm':
      return 'full';
    case 'greathelm':
      return 'great';
    case 'crown':
      return 'crown';
    default:
      return null;
  }
}

const ARMOR_COLORS: Record<string, [string, number]> = {
  quiltedarmor: ['#7a6a4a', 0],
  leatherarmor: ['#5a3a20', 0.05],
  ringmail: ['#6a6a70', 0.5],
  scalemail: ['#7a7060', 0.55],
  chainmail: ['#8a8a92', 0.6],
  breastplate: ['#a0a0a8', 0.75],
  platemail: ['#b8b8c0', 0.8],
  gothicplate: ['#4a4a52', 0.85],
};

const RARITY_TINT: Record<string, string | undefined> = {
  unique: '#c8a86a',
  set: '#30c030',
  runeword: '#c8a86a',
};

export function playerLook(p: Player): RigLook {
  const look = paladinLook(p);
  if (p.cls !== 'sorceress') return look;
  // procedural fallback when the sorceress model can't load: crimson robe, no tabard
  return { ...look, cloth: '#5a1a28', pants: '#3a2418', hair: '#140c08', tabard: undefined, robe: '#4a1430', armor: null, metal: 0, cape: null };
}

function paladinLook(p: Player): RigLook {
  const eq = p.equipment;
  const body = eq.body;
  const armorInfo = body ? ARMOR_COLORS[lookOf(body.baseId)] : undefined;
  const w = eq.weapon;
  const sh = eq.offhand;
  const helm = eq.head;
  const wGlow = w && (w.rarity === 'unique' || w.rarity === 'runeword' || w.rarity === 'set') ? (RARITY_TINT[w.rarity] ?? null) : null;
  let wGlowColor: string | null = wGlow ? wGlow : null;
  if (w) {
    if (w.mods.some((m) => m.stat === 'fireMax')) wGlowColor = '#ff5a10';
    else if (w.mods.some((m) => m.stat === 'coldMax')) wGlowColor = '#40a0ff';
    else if (w.mods.some((m) => m.stat === 'lightMax')) wGlowColor = '#e0e060';
  }
  return {
    type: 'humanoid',
    scale: 1,
    skin: '#d8a888',
    cloth: '#7a4a32',
    pants: '#5a4634',
    hair: '#4a3020',
    tabard: ['#d8d0bc', '#a81818'],
    armor: armorInfo ? armorInfo[0] : null,
    metal: armorInfo ? armorInfo[1] : 0,
    head: 'human',
    helm: helmShape(helm ? lookOf(helm.baseId) : undefined),
    helmColor: helm ? (helm.rarity === 'unique' ? '#b89a5a' : '#8a8a90') : undefined,
    weapon: weaponShape(w?.baseId),
    weaponColor: w?.rarity === 'unique' || w?.rarity === 'runeword' ? '#d8c8a0' : '#c0c0c8',
    weaponGlow: wGlowColor,
    shield: shieldShape(sh ? lookOf(sh.baseId) : undefined),
    shieldColor: sh?.rarity === 'unique' ? '#7a5a20' : sh?.rarity === 'set' ? '#2a4a2a' : '#5a3a22',
    shieldTrim: '#b0b0b8',
    cape: body && (body.rarity === 'unique' || body.rarity === 'set' || body.rarity === 'runeword' || body.rarity === 'rare') ? '#6a1414' : null,
  };
}

/** fingerprint used to rebuild the player rig when gear changes */
export function playerLookKey(p: Player): string {
  const e = p.equipment;
  return [p.cls, e.weapon?.uid, e.offhand?.uid, e.head?.uid, e.body?.uid].join('|');
}

export function vendorLook(): RigLook {
  return {
    type: 'humanoid',
    scale: 0.95,
    skin: '#d8a888',
    cloth: '#3a4a6a',
    head: 'human',
    weapon: 'none',
    robe: '#2a3a5a',
    cape: '#5a2a5a',
  };
}
