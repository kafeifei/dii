import { D2X_MONSTERS } from './d2x/monsters';
import type { D2xMonster } from './d2x/types';

/** the body a monster is drawn with (src/render/specs.ts); the later ones are named for D2's MonStats ids */
export type MonsterModel =
  | 'zombie' | 'skeleton' | 'skelarcher' | 'imp' | 'shaman' | 'ghoul' | 'wraith' | 'spider' | 'demon' | 'butcher' | 'lich' | 'overlord'
  | 'skelmage' | 'bat' | 'yeti'
  | 'corruptrogue' | 'cr_lancer' | 'cr_archer' | 'quillrat' | 'bloodraven'
  // a placeholder with no body of its own: the foul crow nest (LOOKS.crownest)
  | 'nest';
export type Blood = 'red' | 'bone' | 'green' | 'ghost' | 'black' | 'fire';
export type Elem = 'phys' | 'fire' | 'cold' | 'light' | 'poison' | 'magic';
export type ProjectileKind = 'arrow' | 'firebolt' | 'iceshard' | 'poisonspit' | 'lightning' | 'fireball';

/**
 * How one of Diablo II's monster classes looks, sounds and moves in this game: everything about a
 * monster that D2's tables (src/data/d2x/monsters.ts) don't give, since D2 draws sprites where this
 * game has models. Its numbers, missiles and drops are its MonStats.txt row's (src/game/d2/monstats.ts).
 */
export interface MonsterLook {
  /** the class: its MonStats base row's id without the number (lookKey) */
  key: string;
  model: MonsterModel;
  /** drawn this much bigger than its model's own height (src/render/specs.ts) */
  scale: number;
  /** its body's radius, m */
  radius: number;
  blood: Blood;
  /** the procedural rig's colours (src/render/looks.ts), drawn when its model isn't loaded */
  color: string;
  color2: string;
  /** what its missile looks like (src/game/objects.ts); what it does is its D2 missile's */
  missile?: ProjectileKind;
  /** its death cry (src/audio/sounds.ts DEATH_SOUND): monster.die, die_bone, die_imp…; a big one dies as die_large */
  voice: Voice;
  /**
   * how far its blow reaches from its middle, m: its model's arm, which D2 doesn't give (its sprites
   * have none); D2's MonStats2 MeleeRng adds to it (src/game/ai.ts meleeReach)
   */
  range: number;
  /**
   * attacks a second: D2 times them by the frames in AnimData.d2, which d2data doesn't have, so these
   * are the game's own
   */
  attackSpeed: number;
  /** the clips of its attacks (a blow, or a shot) and of its casts (the shaman's raise and fire) */
  attack: string[];
  cast?: string[];
  /** which of the two a missile shot plays: the quill rat raises its quills on 'cast' */
  shootIn?: 'attack' | 'cast';
  /** a tint over its model, for a kind that shares another's */
  tint?: string;
  /**
   * What its shield hand may hold, MonStats2 SHv: D2 item codes, null for D2's nil. One of them is
   * rolled for each monster (Monster.shield); one of item type shield lets it block at its ToBlock
   * (src/game/combat.ts monsterBlock). Those that have it all have MonStats2's block mode (mBL)
   */
  shields?: readonly (string | null)[];
  /**
   * It never moves of itself, reels or is knocked back: MonStats velocity 0 and no WL, GH or KB mode
   * in MonStats2 (the foul crow nest's are DT NU DD SQ)
   */
  still?: true;
}

/**
 * The looks by D2 class. Act 1's monsters on the models made for them (the quill rat, the corrupted
 * rogues) or the nearest of the game's: zombies, the Fallen as imps, their shamans, D2's yetis (the
 * Brutes, sprite YE) as yetis, skeletons with their bows and staves. The rest stand in until they get
 * their own: ghosts as wraiths, the Arach as the spider, goatmen as demons, the Afflicted (Bighead) as
 * ghouls, the foul crows as bats, the Banished (Vampire) as the lich, the rat men (Fetish) as small
 * imps; the foul crow nest, with no model anywhere yet, is a PLACEHOLDER: a dead tree tinted dark.
 * Act 1's bosses take the floor bosses' bodies: the Smith the butcher's, Andariel the overlord's,
 * Griswold a big zombie's; Blood Raven has her own. Sizes are the game's: D2 gives sprites' heights (MonStats2 pixHeight), not models'.
 */
export const LOOKS: Record<string, MonsterLook> = {
  zombie: { key: 'zombie', model: 'zombie', scale: 1, radius: 0.42, blood: 'red', color: '#5d6b4a', color2: '#3a3326', voice: 'flesh', range: 1.1, attackSpeed: 0.8, attack: ['Attack'] },
  // its S2, the cry as it orders its pack on, on its stance: the imp has no cry of its own
  fallen: { key: 'fallen', model: 'imp', scale: 0.72, radius: 0.33, blood: 'red', color: '#a83a24', color2: '#3a1a10', voice: 'imp', range: 1.0, attackSpeed: 1.0, attack: ['Attack', 'Attack2'], cast: ['Idle'], shields: [null, 'sml', 'buc', 'tch'] },
  fallenshaman: {
    key: 'fallenshaman', model: 'shaman', scale: 0.8, radius: 0.34, blood: 'red', color: '#8a2a5a', color2: '#d8b040', missile: 'firebolt', voice: 'imp', range: 1.0,
    attackSpeed: 0.6, attack: ['Attack'], cast: ['Cast'], shootIn: 'cast',
  },
  // its bite on 'attack', its quills on 'cast' (src/render/legs.ts QuadRig poses both over a still)
  quillrat: { key: 'quillrat', model: 'quillrat', scale: 1, radius: 0.36, blood: 'red', color: '#5a4a3a', color2: '#2a2018', missile: 'arrow', voice: 'flesh', range: 0.9, attackSpeed: 0.8, attack: ['Idle'], cast: ['Idle'], shootIn: 'cast' },
  brute: { key: 'brute', model: 'yeti', scale: 1.4, radius: 0.6, blood: 'red', color: '#c8d8e8', color2: '#4a7a9a', voice: 'flesh', range: 1.4, attackSpeed: 0.8, attack: ['Attack', 'Attack2'] },
  corruptrogue: { key: 'corruptrogue', model: 'corruptrogue', scale: 1, radius: 0.38, blood: 'red', color: '#a08a8a', color2: '#4a2a3a', voice: 'rogue', range: 1.15, attackSpeed: 1.0, attack: ['Attack'], shields: [null, 'buc', 'lrg', 'kit'] },
  // the hunter's body; its spear's MonStats2 MeleeRng 2 reaches a subtile farther (meleeReach)
  cr_lancer: { key: 'cr_lancer', model: 'cr_lancer', scale: 1, radius: 0.38, blood: 'red', color: '#a08a8a', color2: '#4a2a3a', voice: 'rogue', range: 1.15, attackSpeed: 0.9, attack: ['Thrust'] },
  cr_archer: { key: 'cr_archer', model: 'cr_archer', scale: 1, radius: 0.38, blood: 'red', color: '#a08a8a', color2: '#4a2a3a', missile: 'arrow', voice: 'rogue', range: 1.15, attackSpeed: 0.75, attack: ['Shoot'] },
  skeleton: { key: 'skeleton', model: 'skeleton', scale: 1, radius: 0.38, blood: 'bone', color: '#d8d0bc', color2: '#6a5a40', voice: 'bone', range: 1.15, attackSpeed: 1.15, attack: ['Attack', 'Attack2'], shields: [null, 'buc', 'lrg', 'kit', 'sml'] },
  sk_archer: { key: 'sk_archer', model: 'skelarcher', scale: 1, radius: 0.38, blood: 'bone', color: '#cfc6b0', color2: '#4a3a28', missile: 'arrow', voice: 'bone', range: 1.15, attackSpeed: 0.75, attack: ['Attack'] },
  skmage_fire: {
    key: 'skmage_fire', model: 'skelmage', scale: 1, radius: 0.36, blood: 'bone', color: '#c8c0b0', color2: '#6a3a2a', missile: 'firebolt', voice: 'bone', range: 1.1, attackSpeed: 0.6,
    attack: ['Attack'], cast: ['Cast'],
  },
  skmage_ltng: {
    key: 'skmage_ltng', model: 'skelmage', scale: 1, radius: 0.36, blood: 'bone', color: '#c8c0b0', color2: '#3a4a6a', missile: 'lightning', voice: 'bone', range: 1.1, attackSpeed: 0.6,
    attack: ['Attack'], cast: ['Cast'],
  },
  skmage_pois: {
    key: 'skmage_pois', model: 'skelmage', scale: 1, radius: 0.36, blood: 'bone', color: '#c8c0b0', color2: '#3a6a3a', missile: 'poisonspit', voice: 'bone', range: 1.1, attackSpeed: 0.6,
    attack: ['Attack'], cast: ['Cast'],
  },
  wraith: { key: 'wraith', model: 'wraith', scale: 1.05, radius: 0.4, blood: 'ghost', color: '#9ad0ff', color2: '#2a4060', voice: 'bone', range: 1.2, attackSpeed: 0.9, attack: ['Attack'] },
  arach: { key: 'arach', model: 'spider', scale: 1, radius: 0.5, blood: 'green', color: '#2a2a22', color2: '#8a1a1a', voice: 'flesh', range: 1.2, attackSpeed: 1.4, attack: ['Idle'] },
  goatman: { key: 'goatman', model: 'demon', scale: 1.2, radius: 0.5, blood: 'red', color: '#6a4a2a', color2: '#2a1a0a', voice: 'goat', range: 1.3, attackSpeed: 1.0, attack: ['Attack', 'Attack2'], tint: '#8a6a40' },
  bighead: { key: 'bighead', model: 'ghoul', scale: 1.1, radius: 0.45, blood: 'green', color: '#5a7a68', color2: '#2a3a30', missile: 'lightning', voice: 'flesh', range: 1.2, attackSpeed: 0.7, attack: ['Attack', 'Attack2'] },
  foulcrow: { key: 'foulcrow', model: 'bat', scale: 0.8, radius: 0.36, blood: 'red', color: '#3a3030', color2: '#6a1a1a', voice: 'bird', range: 1.1, attackSpeed: 1.4, attack: [] },
  // PLACEHOLDER until the nest has a model (docs/M2A.md 美术: 鸟巢; none in models-src or public/models): the
  // graveyard pack's small dead tree, tinted the crows' dark red, standing where D2's nest (MonStats
  // crownest1: velocity 0, 3×3, pixHeight 128) stands. It has no arm (range 0) as D2's has no attack
  // (no A1 in MonStats): it hatches its crows (src/game/ai.ts foulCrowNest) and falls in once it has
  // hatched them all, its cry the crows' (MonStats sound crownest has none of the game's)
  crownest: { key: 'crownest', model: 'nest', scale: 1, radius: 0.7, blood: 'red', color: '#3a2e22', color2: '#6a1a1a', voice: 'bird', range: 0, attackSpeed: 0.5, attack: [], tint: '#4a1a12', still: true },
  vampire: {
    key: 'vampire', model: 'lich', scale: 1.1, radius: 0.45, blood: 'red', color: '#8a3a4a', color2: '#2a0a10', missile: 'fireball', voice: 'flesh', range: 1.2, attackSpeed: 0.6,
    attack: ['Attack'], cast: ['Cast'], tint: '#a03040',
  },
  fetish: { key: 'fetish', model: 'imp', scale: 0.6, radius: 0.3, blood: 'red', color: '#6a5a3a', color2: '#2a2010', voice: 'imp', range: 1.0, attackSpeed: 1.3, attack: ['Attack', 'Attack2'], tint: '#a08a50' },
  // Tristram's Griswold (M2b), on the zombie's body made big and iron-grey until he has his own: the rifts' sixth stretch's guardian (src/world/rift.ts)
  griswold: { key: 'griswold', model: 'zombie', scale: 1.5, radius: 0.6, blood: 'red', color: '#6a6a60', color2: '#3a2a20', voice: 'flesh', range: 1.4, attackSpeed: 0.8, attack: ['Attack'], tint: '#8a8a80' },
  smith: { key: 'smith', model: 'butcher', scale: 1.6, radius: 0.75, blood: 'red', color: '#7a5a4a', color2: '#5a0a0a', voice: 'flesh', range: 1.7, attackSpeed: 1.0, attack: ['Attack', 'Attack2', 'Attack3'] },
  // her own body (models-src/ai/mon_bloodraven.glb, recoloured red) with her long war bow (src/render/specs.ts
  // LONG_BOW): Shoot for her arrows and her Quick Strike, Cast for her Nest; a little taller than the
  // rangers, as D2 draws her (MonStats2 pixHeight 96 to their 80–96). Her cry a rogue's, a boss's death the large one
  bloodraven: {
    key: 'bloodraven', model: 'bloodraven', scale: 1.05, radius: 0.42, blood: 'red', color: '#8a2a2a', color2: '#d8b8a0', missile: 'arrow', voice: 'rogue', range: 1.15, attackSpeed: 0.8,
    attack: ['Shoot'], cast: ['Cast'],
  },
  andariel: {
    key: 'andariel', model: 'overlord', scale: 1.9, radius: 0.85, blood: 'fire', color: '#4a1410', color2: '#ff8030', missile: 'poisonspit', voice: 'flesh', range: 2.0, attackSpeed: 0.9,
    attack: ['Attack', 'Attack2'],
  },
};

/** the class of a MonStats row (MonsterLook.key): its base row's id without the number, 'skmage_pois3' → 'skmage_pois' */
export function lookKey(row: D2xMonster): string {
  return (row.base ?? row.id).replace(/\d+$/, '');
}

/** a monster as the game fights it: its D2 row and its look */
/**
 * A monster's kind of cry (MonsterDef.voice): its death sound by it (src/audio/sounds.ts DEATH_SOUND).
 * M2a's birds (the foul crows and their nests), goats (the goatmen) and rogues (the hireling, the
 * corrupted rogues, Blood Raven) have their own, recorded (src/audio/files.ts)
 */
export type Voice = 'flesh' | 'bone' | 'imp' | 'bird' | 'goat' | 'rogue';

export interface MonsterDef extends MonsterLook {
  /** the D2X_MONSTERS id, 'zombie1' */
  id: string;
  row: D2xMonster;
  /** its name (the rename table's, tools/d2-names/monsters.json) */
  name: string;
  /** MonStats Undead, Demon (what "+X% damage to undead/demons" counts), the boss flag */
  undead: boolean;
  demon: boolean;
  boss: boolean;
}

const DEFS = new Map<string, MonsterDef>();

/** the look of a MonStats row, if it has one */
export function lookOf(row: D2xMonster): MonsterLook | undefined {
  return LOOKS[lookKey(row)];
}

/** the D2 monster `id` (D2X_MONSTERS) as the game fights it; undefined for one with no look */
export function monsterDef(id: string): MonsterDef | undefined {
  const had = DEFS.get(id);
  if (had) return had;
  const row = D2X_MONSTERS[id];
  const look = row && lookOf(row);
  if (!row || !look || !row.name) return undefined;
  const def: MonsterDef = {
    ...look,
    id,
    row,
    name: row.name,
    undead: !!row.undead,
    demon: !!row.demon,
    boss: !!row.boss,
  };
  DEFS.set(id, def);
  return def;
}

/** every D2 monster with a look: what can be spawned and drawn */
export function lookedMonsters(): MonsterDef[] {
  return Object.keys(D2X_MONSTERS)
    .map((id) => monsterDef(id))
    .filter((d): d is MonsterDef => !!d);
}

/**
 * Champion and unique modifiers' names, by MonUMod id, in D2's generic words (MonUMod.txt): what the
 * target bar lists under a champion's or unique's name, the champion's kind first
 */
export const UMOD_NAMES: Record<number, string> = {
  5: '特别强壮',
  6: '特别快速',
  7: '诅咒',
  8: '抗魔',
  9: '火焰强化',
  16: '精英',
  17: '闪电强化',
  18: '冰冷强化',
  25: '法力燃烧',
  26: '传送',
  27: '幽灵攻击',
  28: '石肤',
  29: '多重射击',
  30: '光环强化',
  36: '幽魂',
  37: '狂热',
  38: '附身',
  39: '狂暴',
};
