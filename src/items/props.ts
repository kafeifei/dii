import { randInt } from '../core/math';
import type { D2Prop } from '../data/d2/types';
import { perLevelShift } from './d2/props';
import type { StatKey } from '../data/stats';
import type { ItemMod } from './item';

/** Diablo II property codes that map one-to-one onto a stat */
const SIMPLE: Record<string, StatKey> = {
  'dmg%': 'dmgPct', 'ac%': 'defPct', att: 'ar', 'att%': 'arPct', 'dmg-min': 'dmgMin', 'dmg-max': 'dmgMax',
  'res-all': 'resAll', 'res-fire': 'resFire', 'res-cold': 'resCold', 'res-ltng': 'resLight', 'res-pois': 'resPoison',
  'res-fire-max': 'maxResFire', 'res-cold-max': 'maxResCold', 'res-ltng-max': 'maxResLight', 'res-pois-max': 'maxResPoison',
  allskills: 'skillsAll', fireskill: 'fireSkills',
  swing1: 'ias', swing2: 'ias', swing3: 'ias', cast1: 'fcr', cast2: 'fcr', cast3: 'fcr',
  balance1: 'fhr', balance2: 'fhr', balance3: 'fhr', block1: 'fbr', block2: 'fbr', block3: 'fbr',
  move1: 'frw', move2: 'frw', move3: 'frw', block: 'block',
  str: 'str', dex: 'dex', vit: 'vit', enr: 'ene', 'all-stats': 'allAttr',
  hp: 'life', mana: 'mana', 'hp%': 'lifePct', 'mana%': 'manaPct',
  lifesteal: 'lifeSteal', manasteal: 'manaSteal', regen: 'lifeRegen', 'regen-mana': 'manaRegen',
  'heal-kill': 'lifePerKill', 'mana-kill': 'manaPerKill', 'demon-heal': 'demonHeal',
  'mag%': 'mf', 'gold%': 'gf', deadly: 'crit', crush: 'cb', openwounds: 'ow',
  'red-dmg': 'drFlat', 'red-dmg%': 'dr', 'red-mag': 'mdr',
  'abs-fire': 'absFire', 'abs-cold': 'absCold', 'abs-ltng': 'absLight', 'abs-mag': 'absMagic',
  'abs-fire%': 'absFirePct', 'abs-cold%': 'absColdPct', 'abs-ltng%': 'absLightPct',
  'dmg-undead': 'dmgUndead', 'att-undead': 'arUndead', 'dmg-demon': 'dmgDemon', 'att-demon': 'arDemon',
  'ignore-ac': 'ignoreDef', 'reduce-ac': 'targetDef', 'dmg-ac': 'monDefPerHit', 'dmg-to-mana': 'dmgToMana',
  light: 'lightRadius', thorns: 'thorns',
  'extra-fire': 'extraFire', 'extra-cold': 'extraCold', 'extra-ltng': 'extraLight', 'extra-pois': 'extraPoison', 'extra-mag': 'extraMagic',
  'pierce-fire': 'pierceFire', 'pierce-cold': 'pierceCold', 'pierce-ltng': 'pierceLight', 'pierce-pois': 'piercePoison',
  knock: 'knock', slow: 'slowTarget', freeze: 'freeze', 'half-freeze': 'halfFreeze', nofreeze: 'cantFreeze',
  stupidity: 'blind', noheal: 'preventHeal', rip: 'rip',
  ease: 'ease', cheap: 'cheap', 'ac-miss': 'defMissile', 'res-pois-len': 'poisonLenRes',
  indestruct: 'indestructible', ethereal: 'ethereal', stam: 'stamina', stamdrain: 'staminaDrain', 'regen-stam': 'staminaRegen',
  pierce: 'pierceArrow', explosivearrow: 'explosiveArrow', 'charge-noconsume': 'chargeNoConsume',
  addxp: 'xpPct', 'light-thorns': 'lightThorns', 'res-mag': 'resMagic', 'ac-hth': 'defMelee', reanimate: 'reanimate',
  'rep-quant': 'repQuant', stack: 'extraStack', magicarrow: 'magicArrow',
  'pierce-immunity-cold': 'sunder', 'pierce-immunity-fire': 'sunder', 'pierce-immunity-light': 'sunder',
  'pierce-immunity-poison': 'sunder', 'pierce-immunity-damage': 'sunder', 'pierce-immunity-magic': 'sunder',
};

/**
 * "+X per character level" properties: the value is in eighths of a point per level, attack rating
 * in halves (ItemStatCost op param 3 and 1: d2/props.ts perLevelShift), which propMods turns into eighths
 */
const PER_LEVEL: Record<string, StatKey> = {
  'str/lvl': 'str', 'dex/lvl': 'dex', 'vit/lvl': 'vit', 'enr/lvl': 'ene', 'hp/lvl': 'life', 'mana/lvl': 'mana',
  'ac/lvl': 'def', 'att/lvl': 'ar', 'att%/lvl': 'arPct', 'dmg/lvl': 'dmgMax', 'deadly/lvl': 'crit',
  'mag%/lvl': 'mf', 'gold%/lvl': 'gf', 'dmg-dem/lvl': 'dmgDemon', 'dmg-und/lvl': 'dmgUndead', 'thorns/lvl': 'thorns',
  'abs-cold/lvl': 'absCold', 'abs-fire/lvl': 'absFire', 'ac%/lvl': 'defPct', 'att-dem/lvl': 'arDemon', 'att-und/lvl': 'arUndead',
  'dmg%/lvl': 'dmgMaxPct', 'dmg-cold/lvl': 'coldMax', 'dmg-fire/lvl': 'fireMax', 'dmg-ltng/lvl': 'lightMax',
  'res-cold/lvl': 'resCold', 'res-fire/lvl': 'resFire', 'res-ltng/lvl': 'resLight', 'res-pois/lvl': 'resPoison',
  'regen-stam/lvl': 'staminaRegen', 'stam/lvl': 'stamina', 'crush/lvl': 'cb', 'wounds/lvl': 'ow',
};


const PROC: Record<string, StatKey> = {
  'hit-skill': 'procHit', 'gethit-skill': 'procStruck', 'att-skill': 'procAttack',
  'kill-skill': 'procKill', 'death-skill': 'procDeath', 'levelup-skill': 'procLevelUp',
};

/** on/off properties, which the tables may write without a value */
const FLAGS = new Set(['knock', 'ignore-ac', 'nofreeze', 'half-freeze', 'noheal', 'rip', 'stupidity', 'indestruct', 'ethereal', 'explosivearrow']);

const CLASS_CODES = new Set(['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war']);

/**
 * What the item itself takes, not the wearer (src/items/make.ts): sockets, most durability and its
 * %, and the item level requirement a recipe adds. propMods leaves them out
 */
export const ITEM_STATE_CODES = new Set(['sock', 'dur', 'dur%', 'levelreq']);

/**
 * Codes the item rolls into others as it is made (d2/props.ts rollProps): a random class's skills
 * (randclassskill → its class code) and a random skill (skill-rand → skill)
 */
const ROLLED_INTO = ['randclassskill', 'skill-rand'];

/**
 * Every property code propMods reads, for tools/d2-import.mjs to check its tables against: keep in
 * step with the switch below. pois-max and pois-len are read together with pois-min.
 */
export const PROP_CODES: readonly string[] = [
  ...Object.keys(SIMPLE), ...Object.keys(PER_LEVEL), ...Object.keys(PROC), ...CLASS_CODES, ...ITEM_STATE_CODES, ...ROLLED_INTO,
  'ac', 'howl', 'rep-dur', 'dmg', 'dmg-norm', 'dmg-fire', 'dmg-ltng', 'dmg-cold', 'dmg-mag', 'dmg-elem', 'res-all-max',
  'fire-min', 'fire-max', 'ltng-min', 'ltng-max', 'cold-min', 'cold-max', 'mag-min', 'mag-max',
  'dmg-pois', 'pois-min', 'pois-max', 'pois-len', 'skill', 'oskill', 'aura', 'charged', 'skilltab',
];

/** each stat's property code, for saying an old item's mods as D2 says its properties (the first code of a stat) */
const CODE_OF = new Map<StatKey, string>();
for (const [code, stat] of Object.entries(SIMPLE)) if (!CODE_OF.has(stat)) CODE_OF.set(stat, code);
const PER_LEVEL_CODE = new Map<StatKey, string>();
for (const [code, stat] of Object.entries(PER_LEVEL)) if (!PER_LEVEL_CODE.has(stat)) PER_LEVEL_CODE.set(stat, code);
const PROC_CODE = new Map(Object.entries(PROC).map(([code, stat]) => [stat, code]));
const PAIR_CODE: Partial<Record<StatKey, string>> = {
  def: 'ac', defLocal: 'ac', fireMin: 'fire-min', fireMax: 'fire-max', lightMin: 'ltng-min', lightMax: 'ltng-max',
  coldMin: 'cold-min', coldMax: 'cold-max', magicMin: 'mag-min', magicMax: 'mag-max',
};

/** the property code an old item's mod is said with, if one says it one for one */
function codeOf(m: ItemMod): string | undefined {
  if (m.perLvl) return PER_LEVEL_CODE.get(m.stat);
  if (PROC_CODE.has(m.stat)) return PROC_CODE.get(m.stat);
  switch (m.stat) {
    case 'skill':
    case 'oskill':
    case 'aura':
    case 'charged':
      return m.stat;
    case 'skillTab':
      return 'skilltab';
    case 'clsSkills':
      return m.param;
    default:
      return CODE_OF.get(m.stat) ?? PAIR_CODE[m.stat];
  }
}

/**
 * An old item's mods as the D2 properties that give them, so its tooltip lines read as the D2
 * items' do; what no property says one for one (poison's total, flee, the game's own stats) is
 * left in rest. The inverse of propMods for what it maps one to one.
 */
export function modProps(mods: readonly ItemMod[]): { props: D2Prop[]; rest: ItemMod[] } {
  const props: D2Prop[] = [];
  const rest: ItemMod[] = [];
  for (const m of mods) {
    const c = codeOf(m);
    if (!c) rest.push(m);
    // per level: back from eighths to the property's own steps
    else if (m.perLvl) {
      const n = m.value >> (3 - perLevelShift(c));
      props.push({ c, p: n, min: n, max: n });
    }
    // procs and charges: the chance or charges, and the skill level
    else if (PROC_CODE.has(m.stat) || m.stat === 'charged') props.push({ c, p: m.param, min: m.value, max: m.lvl ?? 1 });
    else if (m.stat === 'skillTab') props.push({ c, p: Number(m.param), min: m.value, max: m.value });
    else if (m.stat === 'skill' || m.stat === 'oskill' || m.stat === 'aura') props.push({ c, p: m.param, min: m.value, max: m.value });
    else props.push({ c, min: m.value, max: m.value });
  }
  return { props, rest };
}

export type Roll = (min: number, max: number) => number;
export const rollRandom: Roll = (min, max) => randInt(Math.min(min, max), Math.max(min, max));
/** the top of every range, for describing what a property can be */
export const rollMax: Roll = (min, max) => Math.max(min, max);

/**
 * Turns Diablo II properties into item mods. Properties that only work together (poison damage
 * and its length) are read as a set. On a weapon, flat defense counts toward the character's
 * defense; off one it is defLocal, an armor's own, which globalItemStats (src/items/item.ts) gives
 * the hero from anything without defense of its own (jewelry, charms, a jewel in a weapon).
 */
export function propMods(props: D2Prop[], onWeapon: boolean, roll: Roll = rollRandom): ItemMod[] {
  const out: ItemMod[] = [];
  const add = (stat: StatKey, value: number, extra?: Partial<ItemMod>) => {
    if (value || extra) out.push({ stat, value, ...extra });
  };
  const byCode = (c: string) => props.find((p) => p.c === c);
  for (const p of props) {
    const v = () => roll(p.min, p.max);
    if (SIMPLE[p.c]) {
      const val = v();
      add(SIMPLE[p.c], val === 0 && FLAGS.has(p.c) ? 1 : val);
      continue;
    }
    if (PER_LEVEL[p.c]) {
      // in eighths: attack rating's halves are four eighths each
      add(PER_LEVEL[p.c], Number(p.p ?? p.min) << (3 - perLevelShift(p.c)), { perLvl: true });
      continue;
    }
    if (PROC[p.c]) {
      out.push({ stat: PROC[p.c], value: p.min, lvl: p.max, param: String(p.p) });
      continue;
    }
    switch (p.c) {
      case 'ac':
        add(onWeapon ? 'def' : 'defLocal', v());
        break;
      case 'howl':
        // stored out of 128 (D2 describes it as value × 100 / 128 %)
        add('flee', Math.round((v() * 100) / 128));
        break;
      case 'rep-dur':
        // "repairs 1 durability in 100 / N seconds"
        add('repDur', Math.round(100 / Number(p.p ?? (p.min || 1))));
        break;
      case 'dmg':
        add('dmgMin', v());
        add('dmgMax', v());
        break;
      case 'dmg-norm':
        // funcs 15 and 16: min is the low damage, max the high one (Properties.txt)
        add('dmgMin', p.min);
        add('dmgMax', p.max);
        break;
      case 'res-all-max':
        // all four maximum resistances, one value (func 1 then 3: Properties.txt)
        for (const k of ['maxResFire', 'maxResCold', 'maxResLight', 'maxResPoison'] as const) add(k, v());
        break;
      case 'dmg-fire':
        add('fireMin', p.min);
        add('fireMax', p.max);
        break;
      case 'dmg-ltng':
        add('lightMin', p.min);
        add('lightMax', p.max);
        break;
      case 'dmg-cold':
        add('coldMin', p.min);
        add('coldMax', p.max);
        break;
      case 'dmg-mag':
        add('magicMin', p.min);
        add('magicMax', p.max);
        break;
      case 'dmg-elem':
        for (const e of ['fire', 'light', 'cold'] as const) {
          add(`${e}Min` as StatKey, p.min);
          add(`${e}Max` as StatKey, p.max);
        }
        break;
      case 'fire-min':
        add('fireMin', v());
        break;
      case 'fire-max':
        add('fireMax', v());
        break;
      case 'ltng-min':
        add('lightMin', v());
        break;
      case 'ltng-max':
        add('lightMax', v());
        break;
      case 'cold-min':
        add('coldMin', v());
        break;
      case 'cold-max':
        add('coldMax', v());
        break;
      case 'mag-min':
        add('magicMin', v());
        break;
      case 'mag-max':
        add('magicMax', v());
        break;
      case 'dmg-pois': {
        // poison is written as a rate (256ths per frame) over a length in frames: the total is what shows
        const len = Number(p.p ?? 75);
        add('poisonDmg', Math.max(1, Math.round((v() * len) / 256)));
        add('poisonLen', len);
        add('poisonSrc', 1);
        break;
      }
      case 'pois-min': {
        const len = byCode('pois-len')?.min ?? 75;
        const max = byCode('pois-max');
        add('poisonDmg', Math.max(1, Math.round(((max ? roll(max.min, max.max) : v()) * len) / 256)));
        add('poisonLen', len);
        add('poisonSrc', 1);
        break;
      }
      case 'skill':
        out.push({ stat: 'skill', value: v(), param: String(p.p) });
        break;
      case 'oskill':
        out.push({ stat: 'oskill', value: v(), param: String(p.p) });
        break;
      case 'aura':
        out.push({ stat: 'aura', value: v(), param: String(p.p) });
        break;
      case 'charged':
        out.push({ stat: 'charged', value: p.min, lvl: p.max, param: String(p.p) });
        break;
      case 'skilltab':
        out.push({ stat: 'skillTab', value: v(), param: String(p.p) });
        break;
      default:
        if (CLASS_CODES.has(p.c)) out.push({ stat: 'clsSkills', value: v(), param: p.c });
      // pois-max, pois-len, cold-len: read with their partner above; ITEM_STATE_CODES: by the item
    }
  }
  return out;
}
