// Types for the tables tools/d2-import.mjs generates in this folder: Diablo II's item data in the
// content scope (D2R before the Warlock expansion), with our names. Codes are D2's own: item codes
// (weapons/armor/misc), item type codes (ItemTypes.txt), property codes (Properties.txt, lower case).
import type { D2Prop, GemKind } from '../d2/types';

export type { D2Prop, GemKind };

/** an item type (ItemTypes.txt) */
export interface D2xItemType {
  /** the English type name, for reference */
  name: string;
  /** what it also counts as (Equiv1/2): affixes, runewords and recipes name types up this chain */
  up?: string[];
  bodyLoc?: string[];
  /** the only class that can use it (ama, ass, bar, dru, nec, pal, sor) */
  cls?: string;
  /** the class whose skills its staff mods roll (wands nec, staves sor, scepters pal, …) */
  staffMods?: string;
  /** weight of the type when an automatic treasure class picks a base */
  rarity: number;
  /** most sockets at item level 1..socketLvls[0], up to socketLvls[1], and above */
  sockets: [number, number, number];
  socketLvls: [number, number];
  /** has automatic treasure classes (weap3, armo3, bow3, mele3, … in steps of 3 levels) */
  tc?: true;
  canRare?: true;
  /** only ever normal quality (potions, gems, runes, …) */
  normalOnly?: true;
  /** never normal: magic or better (rings, amulets, charms, jewels) */
  magicOnly?: true;
  throwable?: true;
  beltable?: true;
  stacks?: true;
  repair?: true;
  /** can be worn */
  equip?: true;
  /** the ammunition type it shoots, and for ammunition the type that shoots it */
  shoots?: string;
  quiver?: string;
  /** shop tab: weap, armo or misc */
  store?: string;
}

export type D2xNpc =
  | 'charsi' | 'gheed' | 'akara' | 'fara' | 'lysander' | 'drognan' | 'hratli' | 'alkor' | 'ormus'
  | 'elzix' | 'asheara' | 'cain' | 'halbu' | 'jamella' | 'larzuk' | 'malah' | 'anya';

/** how many an NPC stocks, normal (min–max) and magic (magicMin–magicMax), and the magic level cap */
export interface D2xShop {
  min?: number;
  max?: number;
  magicMin?: number;
  magicMax?: number;
  magicLvl?: number;
}

/** what weapons, armor and misc items share */
interface D2xBase {
  code: string;
  /** our name: the official one for generic words, renamed where it holds a proper noun */
  name: string;
  en: string;
  type: string;
  /** gems: their grade type (gem0 chipped … gem4 perfect) */
  type2?: string;
  w: number;
  h: number;
  /** item level the base drops from; reqLvl is the level to use it */
  qlvl: number;
  reqLvl: number;
  reqStr?: number;
  reqDex?: number;
  /** only this class can use it (bows and other classes' items still drop, sell and take sockets) */
  cls?: string;
  /** normal, exceptional and elite codes of this base, and which one this is */
  tiers?: [string, string, string];
  tier?: 0 | 1 | 2;
  /** weight within an automatic treasure class */
  rarity: number;
  spawnable: boolean;
  cost: number;
  gambleCost?: number;
  dur?: number;
  /** no durability: never wears out */
  noDur?: true;
  /** most sockets the base can have, and which gem mods apply: 0 weapon, 1 armor/helm, 2 shield */
  sockets?: number;
  gemType?: 0 | 1 | 2;
  /** added to the item level when rolling affixes (wands, staves, orbs, circlets) */
  magicLvl?: number;
  /** automagic group class items roll on their own (D2X_AUTOMAGIC by group) */
  autoPrefix?: number;
  /** stack size: [min, max, as dropped] */
  stack?: [number, number, number];
  /** the quest it belongs to; questDiff: only in the difficulty it was found in */
  quest?: number;
  questDiff?: true;
  /** what nightmare and hell shops sell in its place */
  upgrade?: [string | null, string | null];
  light?: number;
  missile?: number;
  /** % of strength and dexterity added to damage */
  strBonus?: number;
  dexBonus?: number;
  shop?: Partial<Record<D2xNpc, D2xShop>>;
}

export interface D2xWeapon extends D2xBase {
  /** one-handed damage, two-handed damage, thrown damage */
  dmg1?: [number, number];
  dmg2?: [number, number];
  throwDmg?: [number, number];
  twoHanded?: true;
  /** two-handed swords: one hand for barbarians */
  oneOrTwo?: true;
  /** weapon speed modifier: negative is faster */
  wsm: number;
  /** animation class one-handed, and two-handed when it differs */
  wclass: string;
  wclass2?: string;
  hitClass: string;
  /** melee reach added */
  range?: number;
  /** needs ammunition */
  quivered?: true;
}

export interface D2xArmor extends D2xBase {
  ac: [number, number];
  block?: number;
  /** walk and run slowdown */
  speed?: number;
  /** shield smite and boot kick damage */
  dmg?: [number, number];
  /** belts: potion slots */
  beltSlots?: number;
}

export interface D2xMisc extends D2xBase {
  beltable?: true;
  autobelt?: true;
  useable?: true;
  /** what using it does (pSpell: 1 identify, 2 town portal, 3 potion over time, 5 rejuvenate, 6 cure, …) */
  spell?: number;
  /** stats it grants with their amounts, over len frames (25 frames a second) */
  stats?: [string, number][];
  len?: number;
  state?: string;
  /** states it ends (poison, freeze, cold) */
  cures?: string[];
  /** gems: the next grade up */
  next?: string;
}

/** a magic prefix or suffix, or an automagic mod; id is its row in the table */
export interface D2xAffix {
  id: number;
  name: string;
  en: string;
  /** lowest item level it rolls on, and highest when set */
  level: number;
  maxLevel?: number;
  reqLvl: number;
  /** a hero of class reqCls needs level reqClsLvl instead of reqLvl (the charged-skill suffixes) */
  reqCls?: string;
  reqClsLvl?: number;
  /** only one affix per group on an item */
  group: number;
  /** spawn weight */
  freq: number;
  /** false: made only by cube recipes or not at all */
  spawnable: boolean;
  /** can roll on rare items */
  rare?: true;
  /** only on items for this class */
  cls?: string;
  /** rolls on these item types (or below them), not on etypes */
  itypes: string[];
  etypes?: string[];
  props: D2Prop[];
  /** price: cost × priceMul / 1024 + priceAdd */
  priceMul?: number;
  priceAdd?: number;
}

/** one word of a rare item's name (prefix word + suffix word), for these item types */
export interface D2xRareWord {
  id: number;
  name: string;
  en: string;
  itypes: string[];
  etypes?: string[];
}

/** a superior item's mods, and the kinds of item they roll on */
export interface D2xQualityMod {
  id: number;
  on: ('armor' | 'weapon' | 'shield' | 'scepter' | 'wand' | 'staff' | 'bow' | 'boots' | 'gloves' | 'belt')[];
  props: D2Prop[];
}

/** a low-quality item's prefix (crude, cracked, damaged, low quality) */
export interface D2xLowQuality {
  id: number;
  name: string;
  en: string;
}

export interface D2xUnique {
  /** the row's *ID; key is its UniqueItems.txt index (several rows can share one, like the jewel Rainbow Facet) */
  id: number;
  key: string;
  name: string;
  en: string;
  /** base item code */
  code: string;
  /** item level needed to drop, and level to use */
  lvl: number;
  reqLvl: number;
  rarity: number;
  spawnable: boolean;
  costMult?: number;
  costAdd?: number;
  /** only one may be carried */
  carry1?: true;
  /** D2's drop condition expression, as written (e.g. "cond('Difficulty', hell)") */
  dropCond?: string;
  props: D2Prop[];
}

export interface D2xSetItem {
  id: number;
  key: string;
  /** the set's id */
  set: string;
  name: string;
  en: string;
  code: string;
  lvl: number;
  reqLvl: number;
  rarity: number;
  spawnable: boolean;
  costMult?: number;
  costAdd?: number;
  props: D2Prop[];
  /**
   * How the bonus slots turn on (D2MOO D2Common Items.cpp sub_6FDA4380):
   * 0: always, like props; 1: slot n while the set's n-th other piece is worn (pieces in set order,
   * this one skipped); 2: slot n with n + 1 pieces of the set worn.
   */
  addFunc: number;
  /** bonus slots 1..5, each up to two properties */
  bonus?: D2Prop[][];
}

export interface D2xSet {
  id: string;
  name: string;
  en: string;
  /** set item keys, in set order */
  pieces: string[];
  /** with n pieces worn */
  partial: { n: number; props: D2Prop[] }[];
  /** with every piece worn */
  full: D2Prop[];
}

export interface D2xRuneword {
  id: string;
  name: string;
  en: string;
  /** rune numbers in order (1 = r01) */
  runes: number[];
  itypes: string[];
  etypes?: string[];
  /** the highest rune's level requirement */
  reqLvl: number;
  props: D2Prop[];
}

interface D2xSocketable {
  id: string;
  name: string;
  en: string;
  qlvl: number;
  reqLvl: number;
  cost: number;
  weapon: D2Prop[];
  /** helms and body armor */
  armor: D2Prop[];
  shield: D2Prop[];
}

export interface D2xRune extends D2xSocketable {
  num: number;
  /** what a socket and the icon show: the number */
  glyph: string;
}

export interface D2xGem extends D2xSocketable {
  gem: GemKind;
  /** 0 chipped, 1 flawed, 2 standard, 3 flawless, 4 perfect */
  grade: number;
  next?: string;
}

// ───────────────────────── characters, difficulty, economy ─────────────────────────
// D2MOO references are to github.com/ThePhrozenKeep/D2MOO at commit d9d394f.

/**
 * A class (CharStats.txt). A new hero has these attributes, life vit + hpadd, mana ene and stamina
 * `stamina` (D2MOO PlayerStats.cpp:42-53); the per-point growth only applies to points added after
 * that. Growth is in whole points (the table keeps quarters); D2 keeps the fractions and shows the
 * floored total.
 */
export interface D2xClass {
  /** PlayerClass.txt row: ama 0, sor 1, nec 2, pal 3, bar 4, dru 5, ass 6 */
  id: number;
  en: string;
  str: number;
  dex: number;
  vit: number;
  /** D2's "int" (energy) */
  ene: number;
  stamina: number;
  hpadd: number;
  lifePerLvl: number;
  manaPerLvl: number;
  staminaPerLvl: number;
  lifePerVit: number;
  staminaPerVit: number;
  manaPerEne: number;
  statPerLvl: number;
  skillPerLvl: number;
  /** attack rating = to-hit stats + 5 × (dex − 7) + toHitFactor (D2MOO Units.cpp:2407-2430) */
  toHitFactor: number;
  /** block % with a shield = (blockFactor + block stats) × (dex − 15) / (2 × level), at most 75 (Units.cpp:2462-2478) */
  blockFactor: number;
  /** seconds the base regeneration takes to refill mana from empty, before mana recovery bonuses (PlrModes.cpp:1207-1219) */
  manaRegen: number;
  /** walk and run speed, on the scale of monstats Velocity and Run */
  walk: number;
  run: number;
  /** stamina a second running outside town; × (torso armor speed / 10 + 1, floored) (PlrModes.cpp:265-286) */
  runDrain: number;
  /** % of a healing and a mana potion's effect (D2R columns) */
  hpPotion: number;
  mpPotion: number;
  /** D2R column, absent from D2MOO: by its name the shortest delay between casts, in frames (25 a second) */
  minCastDelay: number;
  light: number;
  /** the skill a new hero starts with (D2 skill name) */
  startSkill?: string;
  /**
   * The three skill trees: id is the skilltab property's parameter (class id × 3 + page − 1), page
   * the tree's SkillPage in SkillDesc.txt; name is the +skills line's wording (a generic term).
   */
  tabs: { id: number; page: 1 | 2 | 3; name: string; en: string }[];
  /** the starting kit: base code, count and where worn (rarm right hand, larm left) */
  items: { code: string; n: number; loc?: string }[];
}

/** a difficulty (DifficultyLevels.txt); percentages are whole percent */
export interface D2xDifficulty {
  id: 'normal' | 'nightmare' | 'hell';
  /** added to the hero's resistances */
  resistPenalty: number;
  /** % of the current level's experience span lost on death, never below the level's start (D2MOO Player.cpp:774-791) */
  deathXpLoss: number;
  /** added to monster skill levels (Monster.cpp:481) */
  monsterSkillBonus: number;
  /** freeze and chill lengths on monsters are divided by these (SUnitDmg.cpp:1570-1573, 1688-1690), curse lengths on them by aiCurseDivisor (SkillNec.cpp:464-466, 521-523) */
  monsterFreezeDivisor: number;
  monsterColdDivisor: number;
  aiCurseDivisor: number;
  /** the hero's life and mana leech is divided by these (SUnitDmg.cpp:1176-1187) */
  lifeStealDivisor: number;
  manaStealDivisor: number;
  /** % of their monumod damage and to-hit bonuses uniques and champions keep (MonsterUnique.cpp:306-310, 690-694) */
  uniqueDamageBonus: number;
  championDamageBonus: number;
  /**
   * % of the damage dealt, by attacker vs target: D2R's columns for what D2MOO hard-codes (17 vs
   * players, 25 hireling vs hireling, 200 and 400 from prime evils to revived units; SUnitDmg.cpp:814-862)
   */
  playerVsPlayer: number;
  playerVsMerc: number;
  playerVsPrimeEvil: number;
  hitReactBufferVsPlayer: number;
  hitReactBufferVsMonster: number;
  mercVsPlayer: number;
  mercVsMerc: number;
  /** a hireling's damage % against bosses (D2's HireableBossDamagePercent) */
  mercVsBoss: number;
  mercMaxStun: number;
  primeEvilVsPlayer: number;
  primeEvilVsMerc: number;
  primeEvilVsPet: number;
  petVsPlayer: number;
  /** a monster's death explosion: max damage % of its max life, min 60 % of that (MonsterMode.cpp:890-899) */
  corpseExplosionDamage: number;
  /** fire enchanted's death explosion, % (D2R column) */
  fireEnchantExplosionDamage: number;
  /** Static Field takes monsters no lower than this % of their life (SkillSor.cpp:427) */
  staticFieldMin: number;
  /**
   * Gambling (D2MOO SUnitNpc.cpp:2440-2556): item level = hero level − 5…+4, kept to 5–99; the
   * base is picked evenly from D2X_GAMBLE among those of qlvl ≤ item level, but the first two
   * offers are a ring and an amulet; it becomes exceptional with odds gambleUber × (item level −
   * exceptional qlvl) + 1 in 10000, failing that elite with gambleUltra × (… − elite qlvl) + 1;
   * then unique, set or rare with odds gambleUnique, gambleSet, gambleRare in 100000, else magic.
   */
  gambleRare: number;
  gambleSet: number;
  gambleUnique: number;
  gambleUber: number;
  gambleUltra: number;
  /** resistances never go below this */
  resistFloor: number;
}

/**
 * Experience from a kill by level difference (D2MOO SUNITDMG_ComputeExperienceGain, SUnitDmg.cpp:3044-3076):
 * a monster at or below the hero's level gives lower[min(hero − monster, 10)] of its experience; one
 * above gives higher[min(monster − hero, 10)] while the hero is below ratioFrom, and hero / monster of
 * it from then on. D2 floors each product.
 */
export interface D2xXpLevelDiff {
  lower: number[];
  higher: number[];
  ratioFrom: number;
}

/**
 * Quality odds of a dropped item (D2MOO Items.cpp:2329-2458), tried in order unique, set, rare (where
 * the type can be rare), magic, superior, normal, else low quality: chance = (ratio − (item level −
 * base qlvl) / div, floored) × 128, at least min; less the treasure class's quality factor (chance ×
 * factor / 1024); the quality is hit when a roll in [0, chance) is below 128. Magic find divides the
 * unique, set, rare and magic chances with diminishing returns.
 */
export interface D2xItemRatio {
  /** exceptional or elite weapons and armor */
  uber: boolean;
  /** bases whose own item type is for one class */
  cls: boolean;
  unique: { ratio: number; div: number; min: number };
  set: { ratio: number; div: number; min: number };
  rare: { ratio: number; div: number; min: number };
  magic: { ratio: number; div: number; min: number };
  superior: { ratio: number; div: number };
  normal: { ratio: number; div: number };
}

/**
 * An NPC's prices (NPC.txt), as fractions of the item's value; D2 floors each step (D2MOO
 * Items.cpp:2387-2497). maxPay caps what the NPC pays for one item, by difficulty.
 */
export interface D2xNpcPrices {
  heroBuys: number;
  heroSells: number;
  repair: number;
  maxPay: [number, number, number];
  /** once the quest's reward is granted or pending, these multiply on top */
  quests?: { quest: string; heroBuys: number; heroSells: number; repair: number }[];
}

/**
 * One level band of a hireling (Hireling.txt). With levelUps = hireling level − band level, each stat
 * is base + levelUps × perLvl, floored; life at least 40, str and dex at least 10, max damage at
 * least 1 (D2MOO MonsterAI.cpp:217-254). Experience to reach level L is xpPerLvl × L² × (L + 1)
 * (Monsters.cpp:394-397).
 */
export interface D2xHirelingBand {
  level: number;
  /** hire price: gold × (100 + 15 × levelUps) / 100, at least gold (Monsters.cpp:129-133) */
  gold: number;
  xpPerLvl: number;
  hp: number;
  hpPerLvl: number;
  def: number;
  defPerLvl: number;
  str: number;
  strPerLvl: number;
  dex: number;
  dexPerLvl: number;
  ar: number;
  arPerLvl: number;
  dmg: [number, number];
  dmgPerLvl: number;
  /** fire, cold, lightning, poison */
  resist: [number, number, number, number];
  resistPerLvl: [number, number, number, number];
  /**
   * Skill level = level + levelUps × lvlPerLvl, floored, kept to 0–32, once the hireling's level
   * reaches the skill's reqLvl (MonsterAI.cpp:262-279). mode is the animation mode it plays in
   * (4: attack 1); chance and chancePerLvl weight the AI's choice of skill (D2MOO does not read them yet).
   */
  skills: { skill: string; reqLvl: number; mode: number; chance: number; chancePerLvl: number; level: number; lvlPerLvl: number }[];
}

export interface D2xHireling {
  id: number;
  /** the difficulty it is hired in: 0 normal, 1 nightmare, 2 hell */
  difficulty: 0 | 1 | 2;
  element: 'fire' | 'cold';
  /** monstats id of the unit, and of the NPC who hires it out */
  monster: string;
  seller: string;
  /** the class it counts as (D2R column): its skills are this class's */
  cls: string;
  /** our name for the kind of hireling */
  type?: string;
  /** keys into D2X_HIRELING_NAMES, one picked per hireling on offer */
  names: string[];
  defaultChance: number;
  /**
   * D2R column, absent from D2MOO: by its name, how far above the hero an offered hireling's level
   * may be. D2MOO offers band level + 0…4, no higher than the hero (Monsters.cpp:99-109).
   */
  maxLvlAbove: number;
  /** resurrection cost: min(max, mul × level² / div) (Monsters.cpp:400-410 has the same) */
  resurrect: { mul: number; div: number; max: number };
  /** level bands, lowest first: the first is the one on offer */
  bands: D2xHirelingBand[];
}

/**
 * A hireling's experience: it earns from kills like a hero of its level (the D2X_XP_LEVEL_DIFF and
 * D2X_XP_RATIO rules), notKillerShare of that when someone else made the kill (SUnitDmg.cpp:2983-2988),
 * at most perKillCap of its current level's span per kill (SUnitDmg.cpp:3124), up to maxLevel.
 */
export interface D2xHirelingXp {
  maxLevel: number;
  notKillerShare: number;
  perKillCap: number;
}
