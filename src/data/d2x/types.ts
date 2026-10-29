// Types for the tables tools/d2-import.mjs generates in this folder: Diablo II's item data in the
// content scope (D2R before the Warlock expansion), with our names. Codes are D2's own: item codes
// (weapons/armor/misc), item type codes (ItemTypes.txt), property codes (Properties.txt, lower case).
// Names: `name` is what the game shows in Chinese and `nameEn` in English, ours wherever D2's is a
// proper noun (tools/d2-names); `en` is D2's official English, for reference only, never shown for a
// row that has a nameEn. Generic words (base items, gems, most skills) keep the official strings
// and have no nameEn: their English is `en`.
import type { D2Prop, GemKind } from '../d2/types';

export type { D2Prop, GemKind };

/**
 * A colour D2 shifts an item's picture to (Colors.txt, in row order): magic affixes' transformcolor,
 * uniques' and set items' invtransform, gems' transform. Light, dark and crystal ones, black, white
 * and bright white.
 */
export type D2xColor =
  | 'whit' | 'lgry' | 'dgry' | 'blac' | 'lblu' | 'dblu' | 'cblu' | 'lred' | 'dred' | 'cred' | 'lgrn'
  | 'dgrn' | 'cgrn' | 'lyel' | 'dyel' | 'lgld' | 'dgld' | 'lpur' | 'dpur' | 'oran' | 'bwht';

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
  /**
   * The pictures (ItemTypes.txt InvGfx1..VarInvGfx) an item of this type rolls one of when it is made
   * and keeps (rings, amulets, charms, jewels): it never shows its base's own
   */
  invGfx?: string[];
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
  /** our English name, for the renamed ones (tools/d2-names/bases.json) and runes ("Rune N") */
  nameEn?: string;
  en: string;
  type: string;
  /** gems: their grade type (gem0 chipped … gem4 perfect) */
  type2?: string;
  w: number;
  h: number;
  /**
   * Its picture: Items.txt invfile in lower case, a picture in the atlases (src/data/itempics.ts). The
   * normal, exceptional and elite bases of a line name the same one
   */
  inv: string;
  /** the picture a unique or set item of it shows when the unique or set item names none */
  invUnique?: string;
  invSet?: string;
  /** which of the picture's palette ranges a colour shifts (InvTrans: 2 grey, 5 and 8 grey and brown); unset none */
  invTrans?: number;
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
  /** a vendor never sells out of it: buying takes a copy (Items.txt PermStoreItem) */
  perm?: true;
  /** vendors stock magic ones of it too (Items.txt bitfield1, its first bit) */
  shopMagic?: true;
  /** tomes: what each scroll in it adds to its price (Books.txt CostPerCharge) */
  chargeCost?: number;
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
  /** a prefix is a word or two before the base ("Serrated"), a suffix starts with "of" */
  nameEn: string;
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
  /** the colour it shifts the item's picture to (transformcolor) */
  color?: D2xColor;
}

/** one word of a rare item's name (prefix word + suffix word), for these item types */
export interface D2xRareWord {
  id: number;
  name: string;
  /** one word: a rare item is "<prefix word> <suffix word>" in English */
  nameEn: string;
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
  nameEn: string;
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
  /** its own picture (invfile, lower case), and the colour its picture is shifted to (invtransform) */
  inv?: string;
  invColor?: D2xColor;
  props: D2Prop[];
}

export interface D2xSetItem {
  id: number;
  key: string;
  /** the set's id */
  set: string;
  name: string;
  nameEn: string;
  en: string;
  code: string;
  lvl: number;
  reqLvl: number;
  rarity: number;
  spawnable: boolean;
  costMult?: number;
  costAdd?: number;
  /** its own picture (invfile: none in the scope's table), and the colour its picture is shifted to (invtransform) */
  inv?: string;
  invColor?: D2xColor;
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
  nameEn: string;
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
  nameEn: string;
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
  /** "Rune N" */
  nameEn: string;
  num: number;
  /** what a socket and the icon show: the number */
  glyph: string;
}

export interface D2xGem extends D2xSocketable {
  gem: GemKind;
  /** 0 chipped, 1 flawed, 2 standard, 3 flawless, 4 perfect */
  grade: number;
  next?: string;
  /** the colour it shifts a normal item's picture to from the item's first socket (Gems.txt transform) */
  color?: D2xColor;
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
  /** our name for the kind of hireling, and in English */
  type?: string;
  typeEn?: string;
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

// ───────────────────────── world: Act 1's areas, monsters and treasure ─────────────────────────

/** one value per difficulty: normal, nightmare, hell */
export type D2xTri<T = number> = [T, T, T];

/**
 * An Act 1 area (Levels.txt). A monster's level is its own D2xMonsterDiff.level in normal; in
 * nightmare and hell every monster that is not a boss or noRatio takes the area's lvl instead
 * (D2MOO Monster.cpp:196-201). Uniques, superuniques and their minions then add 3, champions 2 (see
 * D2xMonUMod). A dropped item's level is the dropping monster's level, at least 1 (Items.cpp:1624-1640).
 */
export interface D2xArea {
  id: number;
  /** Levels.txt Name, e.g. "Act 1 - Wilderness 1" */
  key: string;
  name: string;
  nameEn: string;
  en: string;
  /** area level by difficulty: the expansion's MonLvlEx columns */
  lvl: D2xTri;
  /** the classic game's MonLvl columns, for reference only */
  lvlClassic: D2xTri;
  /** D2's own size in tiles, by difficulty */
  size: D2xTri<[number, number]>;
  /** 1 maze (dungeon levels), 2 preset map, 3 outdoor */
  drlg: number;
  /** LvlTypes.txt id: the tile set */
  levelType: number;
  /** the area's waypoint, as its index in Act 1's waypoint list (0: the camp) */
  waypoint?: number;
  /** laid out together with this area */
  depend?: number;
  quest?: number;
  /** warps out: where each leads, and the LvlWarp tiles (D2X_WARPS) that can stand for it (one is used) */
  warps?: { to: number; tiles: number[] }[];
  /**
   * Areas it is walked to, no warp between, both ways: outdoor areas that meet edge to edge (D2MOO
   * DrlgOutPlace.cpp:29-47) and Levels.txt's Vis entries with no warp tile, the monastery's
   * (Monastery Gate–Outer Cloister–Barracks, Inner Cloister–Cathedral). D2 keeps the areas next to
   * the one the player is in active with it (DrlgDrlg.cpp:235-305).
   */
  walk?: number[];
  /**
   * Monster kinds per game: numMon picked without repeats from mon in normal, nmon in nightmare and
   * hell (only `spawns` monsters are kept, each weighted by its rarity; with rangedSpawn the first pick
   * is retried up to 20 times for a ranged one): D2MOO MonsterRegion.cpp:944-1006.
   */
  numMon: number;
  mon: string[];
  nmon: string[];
  /** normal difficulty's champions and uniques are made from these; nightmare and hell use the kinds spawned (MonsterChoose.cpp:156-167) */
  umon: string[];
  /** critters and their chance per room, % */
  critters?: { mon: string; pct: number }[];
  /** monster density (MonDen) by difficulty, on D2's scale for D2's area size */
  den: D2xTri;
  /** how many champion or unique packs, min–max by difficulty (MonUMin/MonUMax) */
  packs: D2xTri<[number, number]>;
  /** monsters wander between rooms */
  wander?: true;
  spcWalk?: number;
  rangedSpawn?: true;
  /** the class its chests and other containers drop, by difficulty (D2MOO ObjMode.cpp:3909-3955) */
  chestTc: D2xTri<string>;
  /** keys of the D2X_SUPERUNIQUES placed in it */
  superuniques?: string[];
}

/**
 * A monster's numbers in one difficulty (MonStats.txt). Unless the monster is noRatio, life, defense,
 * experience, to-hit and damage are percentages of the D2X_MONLVL row at the monster's level, in the
 * same difficulty: value = floor(monlvl × pct / 100) — DATATBLS_CalculateMonsterStatsByLevel
 * (D2MOO MonsterTbls.cpp:562-731, with DATATBLS_ApplyRatio at 932-960). Life is then rolled in
 * [min, max] (Monster.cpp:221-222). noRatio monsters keep these as absolute values.
 */
export interface D2xMonsterDiff {
  level: number;
  /** life min and max: % of monlvl hp */
  hp: [number, number];
  /** defense: % of monlvl ac */
  ac: number;
  /** experience: % of monlvl xp */
  xp: number;
  /** attack 1, attack 2, skill 1: min and max damage (% of monlvl dm) and to-hit (% of monlvl th) */
  a1?: [number, number, number];
  a2?: [number, number, number];
  s1?: [number, number, number];
  /** elemental damage added in a mode (A1, A2, S1, …): chance %, min and max (% of monlvl dm), length in frames (25 a second) */
  el?: { mode: string; type: string; pct: number; dmg: [number, number]; len: number }[];
  /** resists %: physical, magic, fire, lightning, cold, poison */
  res: [number, number, number, number, number, number];
  /** block % */
  block: number;
  /** % of the hero's life and mana leech that works on it */
  drain: number;
  /** speed change % while chilled (negative) */
  coldEffect: number;
  /** AI: frames between decisions, the AI's parameters aip1… (what they mean: D2X_MONSTER_AI) and its range */
  ai: { delay: number; dist?: number; params: number[] };
  /**
   * Treasure classes (D2X_TREASURE_CLASSES). A superunique drops its own D2xSuperUnique.tc, a
   * champion champ, a unique unique, anything else regular; quest replaces it while the killer has
   * not completed the monster's questTc (MonsterMode.cpp:491-573).
   */
  tc: { regular?: string; champ?: string; unique?: string; quest?: string };
}

/** a monster (MonStats.txt, with its MonStats2, MonProp and MonEquip rows) */
export interface D2xMonster {
  id: string;
  hcIdx: number;
  /** the first monster of its class, and the next one up (NextInClass) */
  base?: string;
  next?: string;
  /**
   * The NameStr string key; name is ours (absent for critters, camp dummies and traps, which show
   * none). A pet has none either: it shows the name of the skill that summons it (petOf, D2X_SKILLS).
   */
  nameKey: string;
  name?: string;
  /** with name: our English name */
  nameEn?: string;
  en?: string;
  petOf?: string;
  /** MonType.txt type (undead, demon, fallen, …): what modifiers and skills check */
  type?: string;
  /** its AI (the parameters' meaning: D2X_MONSTER_AI) and sprite code */
  ai: string;
  code: string;
  disabled?: true;
  /** the area a boss belongs to */
  area?: number;
  spawns?: true;
  melee?: true;
  npc?: true;
  town?: true;
  killable?: true;
  interact?: true;
  inventory?: true;
  switchAi?: true;
  opensDoors?: true;
  neverCount?: true;
  demon?: true;
  boss?: true;
  primeEvil?: true;
  flying?: true;
  /** its numbers are absolute, not percentages of D2X_MONLVL, and its level never follows the area */
  noRatio?: true;
  ranged?: true;
  noAura?: true;
  petIgnore?: true;
  zoo?: true;
  deathDmg?: true;
  noMultishot?: true;
  noPreventHeal?: true;
  sendSkills?: true;
  genericSpawn?: true;
  sparse?: true;
  placeSpawn?: true;
  /** can lead a pack (setBoss), and passes its modifiers to it (bossXfer) */
  setBoss?: true;
  bossXfer?: true;
  noTwoHanded?: true;
  undead?: 'low' | 'high';
  /** 0 hostile, 1 ally, 2 neutral */
  align: number;
  /** how many spawn together, min–max; party: the pack a leader brings, of its minions */
  group: [number, number];
  party?: [number, number];
  minions?: string[];
  /** what it summons or hatches (nests, Blood Raven's zombies), at an offset, in a mode */
  spawn?: { mon: string; x: number; y: number; mode?: string };
  /** walk and run speed, D2's scale */
  velocity: number;
  run: number;
  /** weight when an area picks its monster kinds */
  rarity: number;
  threat: number;
  /** life regained a frame: max life × regen / 4096 (Monster.cpp:228) */
  regen: number;
  /** crushing-blow-like critical chance % */
  crit?: number;
  skillDamage?: string;
  /** the weapon types it wields right and left */
  arms?: (string | null)[];
  shieldBlock?: number;
  /** skills (D2 names), their level and the mode they play in; the difficulty adds MonsterSkillBonus (Monster.cpp:247-262) */
  skills?: { skill: string; lvl: number; mode?: string }[];
  /** missiles by mode: a1, a2, s1–s4, c (cast), sq (sequence) */
  missiles?: Partial<Record<'a1' | 'a2' | 's1' | 's2' | 's3' | 's4' | 'c' | 'sq', string>>;
  sound?: string;
  uniqueSound?: string;
  diff: D2xTri<D2xMonsterDiff>;
  /** quest record and checkpoint that switch the drop to diff[].tc.quest */
  questTc?: { quest: number; cp: number };
  /** MonStats2: footprint in tiles, melee reach, heights, light */
  size: [number, number];
  meleeRng: number;
  height: number;
  overlayHeight: number;
  pixHeight: number;
  /** base weapon class of its animations (hth, 1hs, bow, …) */
  baseW: string;
  hitClass: number;
  light?: { radius: number; rgb: [number, number, number] };
  shadow?: true;
  noMap?: true;
  sel?: true;
  noSel?: true;
  alwaysSel?: true;
  shiftSel?: true;
  corpseSel?: true;
  attackable?: true;
  /** can be resurrected (by a shaman), in resurrectMode, or with resurrectSkill */
  revive?: true;
  resurrectMode?: string;
  resurrectSkill?: string;
  critter?: true;
  small?: true;
  large?: true;
  soft?: true;
  inert?: true;
  objCol?: true;
  deadCol?: true;
  unflatDead?: true;
  noUniqueShift?: true;
  /** MonProp: properties it spawns with, by difficulty (chance %, when not always) */
  props?: D2xTri<(D2Prop & { chance?: number })[]>;
  /** MonEquip: items it wields from spawn (onInit) or from a monster level on; quality is D2's (6 rare) */
  equip?: { item: string; loc: string; quality: number; level: number; onInit?: true }[];
}

/** a row of MonLvl.txt's expansion columns: what D2xMonsterDiff's percentages are of, by difficulty */
export interface D2xMonLvl {
  ac: D2xTri;
  th: D2xTri;
  hp: D2xTri;
  dm: D2xTri;
  xp: D2xTri;
}

/**
 * A champion or unique modifier (MonUMod.txt; D2MOO's MONUMOD_* ids, D2Monsters.h:83-125). Every
 * unique, superunique and champion, and their minions, get modifiers 1–4 (random name, life bonus,
 * light, +3 levels) on top (MonsterUnique.cpp:2548-2558): leveladd adds 3 levels and makes the
 * experience ×5 (268-275), champion takes 1 level back and 2/5 of the experience, so champions are
 * +2 and ×3 (278-298). A superunique has its own mods plus one random one per difficulty above normal
 * (2715-2727). xfer: minions get it too (2527).
 */
export interface D2xMonUMod {
  id: number;
  key: string;
  disabled?: true;
  xfer?: true;
  /** a champion type (ghostly, fanatic, possessed, berserk) */
  champion?: true;
  fpick?: number;
  /** monster types it never goes on */
  exclude?: string[];
  /** weight among champion and unique picks, by difficulty */
  cpick: D2xTri;
  upick: D2xTri;
}

/** a superunique (SuperUniques.txt) */
export interface D2xSuperUnique {
  key: string;
  name: string;
  nameEn: string;
  en: string;
  hcIdx: number;
  /** its monster (D2X_MONSTERS) */
  mon: string;
  /** its own modifiers (D2X_MONUMODS ids) */
  mods: number[];
  /**
   * Minions it comes with, min–max, as the table has them. They are its monster's minion1, or more
   * of its own monster when minion1 is empty (the Countess, Corpsefire, Bonebreak); when min and max
   * are both above 0, each goes up by the difficulty, 0–2 (D2MOO MonsterUnique.cpp:2475-2492, 2729-2735).
   */
  group: [number, number];
  autoPos?: true;
  /** can appear more than once a game */
  stacks?: true;
  replaceable?: true;
  /** its drop by difficulty */
  tc: D2xTri<string>;
  area?: number;
  sound?: string;
}

/**
 * A word random unique monsters are named from. In English the title ("the …") goes last, after the
 * prefix and the suffix, one word each: "Murk Canker the Sledge".
 */
export interface D2xUniqueNameWord {
  key: string;
  name: string;
  nameEn: string;
  en: string;
}

/** an entry of a treasure class: an item code or another class, its weight, and gold's multiplier or quality overrides */
export interface D2xTcEntry {
  item?: string;
  tc?: string;
  prob: number;
  /** gold amount × goldMul (D2's mul / 256, Items.cpp:2533-2536) */
  goldMul?: number;
  quality?: Partial<Record<'unique' | 'set' | 'rare' | 'magic' | 'superior' | 'normal', number>>;
}

/**
 * A treasure class (D2R 2.7's TreasureClassEx.txt, or one of the automatic weapN/armoN/meleN/bowN/
 * abowN). The drop (D2MOO D2GAME_DropTC_6FC51360, Items.cpp:2062-2560), for one player:
 * - picks > 0: picks rolls in [0, total prob + noDrop); below noDrop drops nothing, else the entry
 *   whose cumulative range holds it. With more players noDrop shrinks (2122-2164).
 * - picks < 0: the k-th of −picks drops is the entry whose cumulative range holds k, so entries
 *   drop prob times each, in order, at most −picks in all; noDrop is not rolled (2112-2118).
 * - an entry naming a class runs that class with its own picks (2229-2242); a class with nothing in
 *   it drops nothing (2106-2109). At most 6 items come out of one drop (2076-2078, 2540-2544).
 * - quality factors (out of 1024) pass down: a sub-class uses the larger of its own and the
 *   parent's (2244-2260); the item's quality roll lowers each chance by chance × factor / 1024
 *   (see D2xItemRatio).
 * - group and level: a monster's own class in nightmare and hell moves along `next` while that
 *   class's level is at most the monster's level, unless the monster is a boss or noRatio
 *   (MonsterTbls.cpp:975-1003, Items.cpp:2576-2592). A class named by an entry is looked up at
 *   level 0 and never moves (Items.cpp:2231).
 */
export interface D2xTreasureClass {
  group?: number;
  level?: number;
  picks: number;
  noDrop?: number;
  unique?: number;
  set?: number;
  rare?: number;
  magic?: number;
  items: D2xTcEntry[];
  /**
   * The next class of its group, a monster's own class moves up to. Only classes some Act 1 monster
   * names as its own in nightmare or hell, and the upgrades it can reach, have it; absent at the end
   * of the group or past every Act 1 monster's level. Never followed for a class an entry names.
   */
  next?: string;
  /** built by the importer the way the game builds it at load */
  auto?: true;
}

// ───────────────────────── skills, missiles, states ─────────────────────────
// Units, converted by the importer: damage and mana are points (D2's 256ths with HitShift and
// manashift applied; × 256 gives D2's integers back, but D2 floors a synergy where D2xSkill and
// D2xMissile say); skill effect lengths, cooldowns and a missile's elemental lengths are seconds
// (× 25, rounded, gives D2's frames back). A missile's own clock (range, activation, loops, hit
// delays) stays in D2 frames, D2X_FPS (25) a second. Params and calcs are D2's, in D2's units,
// named by their *Desc notes: an aura's len calc gives frames; its range calc and the radius params
// (Fire Ball's par1) give D2's distance unit, the sub-tile, which D2 searches by as it is
// (MonsterUnique.cpp:998), and a tooltip shows × 2/3 of it as yards (Might's ln12*2/3).
// The calc codes read D2's own numbers too, not the converted fields: the length codes (edln, m1el,
// edma…) give frames where elem.len is seconds, the codes D2X_SKILL_CALC marks (256ths) (usmc,
// edns…) give 256ths, the other damage and mana codes whole points; an evaluator converts back.

/**
 * A calc expression as D2 writes it, or a constant (D2X_SKILL_CALC / D2X_MISSILE_CALC name its
 * codes). Fog's rules (D2MOO Calc.cpp): int32 arithmetic, / truncates and gives 0 for / 0, a ^ b is
 * 1 for b ≤ 0, comparisons give 0 or 1, ?: lowest, then < <= > >= == !=, + -, * /, ^, unary −.
 * min, max, rand(a, b); skill('Name'.code) a code of another skill (blvl its base level), miss('name'.code),
 * stat('name'.base|mod|accr), sklvl('Name'.level.code) another skill's code at the level the first
 * code gives. A code Fog does not know reads 0; the importer fails on one instead, and it adds the
 * ) a calc leaves open, which Fog closes at the end.
 *
 * One rule is a quirk, not precedence: D2MOO's evaluator (Calc.cpp:233-241, the AST_Ternary case
 * falls through to the default return) ends the whole calc at the first ?: it reaches, so what the
 * postfix code holds after it is never added. Zeal's calc2, ((lvl < 5) ? 0 : …)+skill('Sacrifice'.blvl)*par8,
 * so loses its Sacrifice synergy. Whether D2R keeps the quirk is not known: the game decides (A5).
 */
export type D2xCalc = string | number;

/** a SkillCalc / MissCalc code: what it reads (desc), or a macro of other codes (expr) */
export interface D2xCalcCode {
  desc?: string;
  expr?: string;
}

/**
 * A value by D2's level bands (SKILLS_CalculateDamageBonusByLevel, D2Skills.cpp:2477-2505):
 * [base, a, b, c, d, e] → base + a·(L−1) for L ≤ 8, then + b per level for 9–16, c for 17–22,
 * d for 23–28, e from 29 (so L = 9 is base + 7a + b).
 */
export type D2xBands = [number, number, number, number, number, number];
/** a length by D2's bands (D2Skills.cpp:2742-2785): [base, a, b, c] → base + a·(L−1) to L 8, + b per level for 9–16, + c from 17; seconds */
export type D2xLenBands = [number, number, number, number];

/** a line of a skill's description: D2's line format, its texts (D2X_SKILL_TEXT keys, or a skill by name) and calcs */
export interface D2xSkillDescLine {
  line: number;
  a?: string | { skill: string };
  b?: string | { skill: string };
  calcA?: D2xCalc;
  calcB?: D2xCalc;
}

/** SkillDesc.txt: the skill's place in its class's trees and how its tooltip is built */
export interface D2xSkillDesc {
  /** tree 1–3 of the class (0: none), row 1–6, column 1–3 */
  page: number;
  row: number;
  col: number;
  listRow?: number;
  listPool?: number;
  manaText?: string;
  /** how the damage line shows (descdam), and the attack rating line (descatt) */
  dam?: number;
  att?: number;
  damCalc?: (D2xCalc | null)[];
  extraDam?: { elem: string | null; min: D2xCalc; max: D2xCalc }[];
  /** the missiles its m1…m3 calc codes read */
  missiles?: string[];
  /** desc, dsc2 and dsc3 lines; dsc3 is the synergy list */
  lines?: D2xSkillDescLine[];
  lines2?: D2xSkillDescLine[];
  lines3?: D2xSkillDescLine[];
  procText?: string;
  procLines?: number;
}

/** the stat a skill, aura or passive sets (ItemStatCost name, see D2X_SKILL_STATS), and its calc */
export interface D2xSkillStat {
  /** its column, the N of aurastatN / passivestatN: what astN and pstN read (a row may skip one) */
  col: number;
  stat: string;
  calc: D2xCalc;
}

export type D2xSkillFlag =
  | 'left' | 'right' | 'interrupt' | 'inTown' | 'passive' | 'aura' | 'periodic' | 'immediate' | 'repeat' | 'warp' | 'finishing'
  | 'progressive' | 'prgStack' | 'kick' | 'lob' | 'decQuant' | 'noAmmo' | 'durability' | 'useAttackRate' | 'alwaysHit' | 'manaOnDo'
  | 'attackNoMana' | 'enhanceable' | 'targetableOnly' | 'searchEnemyXY' | 'searchEnemyNear' | 'searchOpenXY' | 'targetCorpse'
  | 'targetPet' | 'targetAlly' | 'targetItem' | 'tgtPlaceCheck' | 'continueCastUnselected' | 'clearSelectedOnHold'
  | 'keepCursorOnKill' | 'scroll' | 'periodicClearAura' | 'itemTgtDo' | 'itemCheckStart' | 'requiresWeapon';

/**
 * A skill (Skills.txt with its SkillDesc.txt row), keyed by D2 name in D2X_SKILLS. At level L:
 * - mana: max(base + perLvl·(L−1), min) points; none when base and perLvl are both 0 (Skills.cpp:1063-1096).
 * - phys: D2xBands points, plus src's share of the weapon's damage on its own attack, then
 *   + floor(× sym / 100) of that sum, before HitShift (D2Skills.cpp:2539-2567, 2607-2635); the
 *   importer takes a phys synergy only with HitShift 8, where that floor is in whole points.
 * - elem: D2xBands points, then in 256ths (× 256), as D2 takes it after HitShift: + floor(× sym / 100),
 *   which min takes only when it is over 256 (a point) or its first band is set, then the caster's
 *   mastery, + floor(× mastery / 100) of that (D2Skills.cpp:2654-2671, 2717-2734); ÷ 256 for points.
 *   Fire Ball 1 with a 28% synergy: 1536 + floor(430.08) = 1966, 7.68 points (not 6 + floor(1.68)).
 *   Burning (Inferno, Blaze, Fire Wall) and poison are per frame over the length. With no type the
 *   E values are numbers its calcs read (edmn).
 * - elem.len: D2xLenBands seconds, its synergy floored in frames: n = len × 25, + floor(n × lenSym / 100)
 *   (D2Skills.cpp:2774-2782).
 * - toHit: base + perLvl·(L−1) percent, or the calc.
 * D2 runs most skills through hard-coded server functions (funcs, by number); the game implements
 * each skill's behaviour itself, reading the numbers here.
 */
export interface D2xSkill {
  /** Skills.txt *Id, the number item properties and saves use */
  id: number;
  /** what the game shows (our name, or the official generic one); monster skills have none */
  name?: string;
  /** our English name where name is ours (tools/d2-names/skills.json, or a runeword's); generic ones go by en */
  nameEn?: string;
  en?: string;
  /** class code (pal, sor, ama…); monster and item skills have none */
  cls?: string;
  /** why it is in: a class tree, an Act 1 monster, a champion or unique modifier, an Act 1 hireling, a summon's, a missile's damage */
  from: ('class' | 'monster' | 'umod' | 'hireling' | 'summon' | 'missile')[];
  reqLvl: number;
  reqSkills?: string[];
  maxLvl?: number;
  desc?: D2xSkillDesc;
  flags?: D2xSkillFlag[];
  /** none, h2h (melee), rng (ranged), both, loc (a place) */
  range?: string;
  /** the player's animation mode (SC cast, A1 attack…) and the monster's */
  anim?: string;
  monAnim?: string;
  /** attack sequences (Zeal, Smite…): which, and the frame input it waits for */
  seq?: { num: number; input: number };
  /** D2's server functions: start, each frame (do), stop, charge-up */
  funcs?: { start?: number; do?: number; stop?: number; prg?: number[] };
  mana?: { base: number; perLvl: number; min?: number; start?: number };
  toHit?: { base: number; perLvl: number } | { calc: D2xCalc };
  /**
   * src: the share of weapon damage it adds (SrcDam / 128). Its own attack adds that before HitShift
   * and so scales it by srcScale (2^HitShift / 256; absent: 1) with the rest, but its missiles add it
   * unshifted (D2Skills.cpp:2540-2567, Missile.cpp:544-551, 661-662). Cold Arrow (HitShift 7) is the
   * one taken skill where the two differ: srcScale 0.5.
   */
  phys?: { min: D2xBands; max: D2xBands; src?: number; srcScale?: number; sym?: D2xCalc };
  elem?: { type?: string; min?: D2xBands; max?: D2xBands; sym?: D2xCalc; len?: D2xLenBands; lenSym?: D2xCalc };
  /** Param1–14 by number, and their notes */
  params?: Record<number, number>;
  paramDesc?: Record<number, string>;
  /** calc1–10 by number (read as clc1…clc0), and their notes */
  calcs?: Record<number, D2xCalc>;
  calcDesc?: Record<number, string>;
  /**
   * an aura, or a buff or curse that works like one: the filter of whom it hits (bits), its states,
   * its length (frames) and radius (sub-tiles; a tooltip's yards are × 2/3) calcs, stats and events
   */
  aura?: { filter?: number; state?: string; targetState?: string; len?: D2xCalc; range?: D2xCalc; stats?: D2xSkillStat[]; events?: { event: string; func: number }[] };
  /** frames between an aura's pulses */
  perDelay?: D2xCalc;
  passive?: { state?: string; stats?: D2xSkillStat[]; itype?: string; weapons?: number };
  /** pets: their kind (PetType.txt: pets of one kind share the cap; null: none) and how many (D2 counts at least 1) */
  pet?: { type: string | null; max: D2xCalc };
  /** what it summons (a MonStats id), in which mode, with which skills at which level */
  summon?: { mon: string; mode: string | null; skills?: { skill: string; lvl: D2xCalc }[]; umod?: number; requiresPetType?: number };
  /** the missiles its functions fire (srv, srvA–C) and draw (clt, cltA–D) */
  missiles?: Partial<Record<'srv' | 'srvA' | 'srvB' | 'srvC' | 'clt' | 'cltA' | 'cltB' | 'cltC' | 'cltD', string>>;
  /** item types the main hand (a) and the other hand (b) must be and must not be, and which hand; a staff-mod roll checks a[0] (see D2xSkillRef.staffModType) */
  weapons?: { a?: string[]; aNot?: string[]; b?: string[]; bNot?: string[]; sel?: number };
  /** shape-shift restrictions: the mode and the states it allows */
  restrict?: { mode: number; states: string[] };
  /** cooldowns, seconds: this skill's and every skill's */
  delay?: { local: number; global: number };
  /** charge-up skills: their calcs, damage kind, charges to cast and used */
  charge?: { calcs: D2xCalc[]; dam: number; toCast: number; consumed: number };
  /** D2's hit result bits, hit flags and hit class (sound and effect of the hit) */
  hit?: { result: number; flags: number; class: number };
  /** cast from an item (charges, oskill, chance to cast): its server function and target kind */
  item?: { effect: number; target: number; useRestrict?: number };
  lineOfSight?: number;
  selectProc?: number;
  /** how monster AIs rank it */
  attackRank: number;
  aiBonus?: number;
  /** what charges or levels of it add to an item's price, with reqLvl */
  cost?: { mult: number; add: number };
}

/**
 * A skill the data names or an item rolls but the game does not implement: shown greyed, 本游戏未实现.
 * Every skill of a class whose items roll staff mods is here or in D2X_SKILLS, ids consecutive.
 */
export interface D2xSkillRef {
  id: number;
  name?: string;
  /** as D2xSkill's */
  nameEn?: string;
  en?: string;
  cls?: string;
  reqLvl: number;
  /** what an item's price takes of the charges and skills it carries, with reqLvl (D2Common Items.cpp:1814-1892) */
  cost?: { mult: number; add: number };
  /** the item type a staff-mod roll needs the item to be (itypea1): on any other it rolls again (D2Game ITEMS/Items.cpp:2716-2857) */
  staffModType?: string;
}

export type D2xMissileFlag =
  | 'collideKill' | 'lastCollide' | 'collideFriend' | 'collision' | 'canSlow' | 'returnFire' | 'getHit' | 'softHit' | 'pierce'
  | 'explosion' | 'alwaysExplode' | 'noMultiShot' | 'noUniqueMod' | 'half2HSrc' | 'applyMastery' | 'missileSkill' | 'canDestroy'
  | 'town' | 'srcTown' | 'subLoop';

/**
 * A missile (Missiles.txt), keyed by name in D2X_MISSILES. One with `skill`, or the missileSkill
 * flag (the skill that fired it), deals that skill's damage; otherwise its own phys and elem, by
 * the missile's level (Missile.cpp:505-560). Its own synergy, unlike a skill's elemental one, is
 * taken before HitShift: + floor(× sym / 100) in units of elem.symUnit points (Missile.cpp:1160-1174,
 * 1216-1230). Clock values are frames.
 */
export interface D2xMissile {
  id: number;
  /** D2's server functions: each frame, on hit, damage */
  funcs?: { do?: number; hit?: number; dmg?: number };
  /** speed Vel + floor(L × perLvl) up to max, × 0.75 when it moves (Missiles.cpp:118-145); accel per frame */
  vel?: { base: number; max: number; perLvl: number; accel: number };
  /** lifetime: [frames, frames per level] (Missiles.cpp:205-208) */
  range: [number, number];
  activate?: number;
  initSteps?: number;
  randStart?: number;
  /** the frames a subLoop missile loops between */
  loop?: [number, number];
  flags?: D2xMissileFlag[];
  size: number;
  /** 0 none, 1 players, 2 monsters, 3 both, 6 barriers, 7 missiles, 8 players, monsters and walls */
  collideType: number;
  collisionOverlap?: number;
  nextHit?: number;
  nextDelay?: number;
  knockBack?: number;
  toHit?: number;
  /**
   * bits of whom its damage hits fully, their positive resists, damage reduction and absorb skipped
   * (Missile.cpp:564-577, SUnitDmg.cpp:891-916, 1012-1033): 1 undead, 2 demons, 4 beasts (a monster
   * that is neither, or a target that is no monster). Whom it hits at all is its hit function's (hitParams).
   */
  holy?: number;
  damageRate?: number;
  radius?: number;
  skill?: string;
  /** the weapon damage it adds (SrcDamage / 128); srcNone: not even the skill's */
  src?: number;
  srcNone?: true;
  phys?: { min: D2xBands; max: D2xBands };
  /** symUnit: the points D2 floors the synergy in, 2^HitShift / 256 (absent: 1) */
  elem?: { type?: string; min?: D2xBands; max?: D2xBands; sym?: D2xCalc; symUnit?: number; len?: D2xLenBands };
  params?: Record<number, number>;
  paramDesc?: Record<number, string>;
  hitParams?: Record<number, number>;
  hitParamDesc?: Record<number, string>;
  dmgParams?: Record<number, number>;
  dmgParamDesc?: Record<number, string>;
  calcs?: { srv?: D2xCalc; hit?: D2xCalc; dmg?: D2xCalc };
  calcDesc?: { srv?: string; hit?: string; dmg?: string };
  /** missiles it makes: as it flies (srv), on hit (hit), on exploding, and the client's visual ones */
  sub?: { srv?: string[]; hit?: string[]; explosion?: string; clt?: string[]; cltHit?: string[] };
  hit?: { result: number; flags: number; class: number };
  light?: { radius: number; rgb: [number, number, number] };
}

export type D2xStateFlag =
  | 'playerStaysOnDeath' | 'monsterStaysOnDeath' | 'bossStaysOnDeath' | 'curable' | 'curse' | 'active' | 'undead' | 'aura' | 'exp'
  | 'transform' | 'restrict' | 'disguise' | 'meleeOnly' | 'noClear' | 'removedOnHit' | 'hide' | 'notOnDead' | 'bossInvulnerable'
  | 'shatter' | 'hideDead' | 'life' | 'green' | 'sunderFull' | 'sunderResReduce';

/** a state (States.txt), keyed by name in D2X_STATES */
export interface D2xState {
  id: number;
  /** states of one group replace each other (the sorceress's armors) */
  group?: number;
  /** the stat it shows on the character screen */
  stat?: string;
  flags?: D2xStateFlag[];
  /** the character screen numbers it turns blue or red: att, arm, dam, rf/rl/rc/rp (resists), stamina */
  blue?: string[];
  red?: string[];
  /** D2's server functions when set, removed, active */
  funcs?: { set?: number; rem?: number; active?: number };
  skill?: string;
  missile?: string;
  /** the taken skills whose D2 server code sets or checks it by id, where no table column names it */
  code?: string[];
}

// ───────────────────────── item tooltips ─────────────────────────

/** one stat a property code sets (Properties.txt funcN, statN, valN): the func says how the value lands */
export interface D2xPropStat {
  func: number;
  stat?: string;
  /** the func's fixed parameter: a class id for class skills (func 21), a tab for war-tab-rand */
  val?: number;
}

/**
 * A stat's tooltip line (ItemStatCost.txt). Lines go highest pri first; func is the descfunc, val
 * the descval (0 no value, 1 before the string, 2 after), pos / neg the strings for a positive and
 * a negative value (neg only where it differs), str2 the second string (per-level stats' "(based on
 * character level)"). A group (grp, the dgrp columns) is one line for all its stats when they are
 * all there with the same value: all attributes, all resistances. op, opParam and opBase are how
 * the stat counts (op 2–5 per-level: value × base >> param).
 */
export interface D2xStatDesc {
  id: number;
  pri?: number;
  func?: number;
  val?: number;
  pos?: string;
  neg?: string;
  str2?: string;
  grp?: number;
  grpFunc?: number;
  grpVal?: number;
  grpPos?: string;
  op?: number;
  opParam?: number;
  opBase?: string;
  /** what each point adds to an item's price, × its cost / 1024, and once per stat (Multiply, Add) */
  cost?: [number, number];
  /** how the value is packed: 1 a skill's level, 2 and 3 a skill and level in the layer (procs, charges), 4 by time */
  enc?: number;
}
