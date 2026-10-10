/** A property as Diablo II's tables write it (Properties.txt code, parameter, range) */
export interface D2Prop {
  c: string;
  /** a skill's D2 name for skill properties, otherwise a number (per-level divisor, skill tab, …) */
  p?: string | number;
  min: number;
  max: number;
}

export interface D2Affix {
  /** row in MagicPrefix.txt / MagicSuffix.txt: what cube recipes refer to */
  idx: number;
  name: string;
  en: string;
  level: number;
  maxLevel?: number;
  reqLvl: number;
  group: number;
  /** spawn weight; 0 = only made by a cube recipe */
  freq: number;
  noRare?: boolean;
  cls?: string;
  itypes: string[];
  etypes?: string[];
  props: D2Prop[];
}

interface D2Socketable {
  id: string;
  name: string;
  en: string;
  qlvl: number;
  reqLvl: number;
  price: number;
  weapon: D2Prop[];
  /** helms and body armor */
  armor: D2Prop[];
  shield: D2Prop[];
}

export interface D2Rune extends D2Socketable {
  /** the rune's own name, as it reads in a runeword ("艾尔") */
  letter: string;
}

export type GemKind = 'amethyst' | 'topaz' | 'sapphire' | 'emerald' | 'ruby' | 'diamond' | 'skull';

export interface D2Gem extends D2Socketable {
  gem: GemKind;
  /** 0 chipped, 1 flawed, 2 standard, 3 flawless, 4 perfect */
  grade: number;
}

export interface D2Runeword {
  id: string;
  name: string;
  en: string;
  runes: string[];
  itypes: string[];
  etypes?: string[];
  reqLvl: number;
  props: D2Prop[];
  ladder?: boolean;
}

/** one cube ingredient or the result: an item id, a D2 item type or group, with qualifiers */
export interface CubeSpec {
  what: string;
  qty: number;
  nor?: boolean;
  mag?: boolean;
  rar?: boolean;
  uni?: boolean;
  set?: boolean;
  bas?: boolean;
  exc?: boolean;
  eli?: boolean;
  sock?: boolean | number;
  nos?: boolean;
  pre?: number;
  suf?: number;
  mod?: boolean;
}

export interface D2Recipe {
  desc: string;
  inputs: CubeSpec[];
  output: Omit<CubeSpec, 'qty'> & { qty?: number };
  mods?: D2Prop[];
  /** output item level: lvl + plvl% of the character's level + ilvl% of the input's */
  ilvl?: number;
  plvl?: number;
  lvl?: number;
}
