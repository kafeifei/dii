import { randInt } from '../core/math';
import type { D2Prop } from '../data/d2/types';
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
};

/** "+X per character level" properties: the value is in eighths of a point per level */
const PER_LEVEL: Record<string, StatKey> = {
  'str/lvl': 'str', 'dex/lvl': 'dex', 'vit/lvl': 'vit', 'enr/lvl': 'ene', 'hp/lvl': 'life', 'mana/lvl': 'mana',
  'ac/lvl': 'def', 'att/lvl': 'ar', 'att%/lvl': 'arPct', 'dmg/lvl': 'dmgMax', 'deadly/lvl': 'crit',
  'mag%/lvl': 'mf', 'gold%/lvl': 'gf', 'dmg-dem/lvl': 'dmgDemon', 'dmg-und/lvl': 'dmgUndead', 'thorns/lvl': 'thorns',
};

const PROC: Record<string, StatKey> = {
  'hit-skill': 'procHit', 'gethit-skill': 'procStruck', 'att-skill': 'procAttack',
  'kill-skill': 'procKill', 'death-skill': 'procDeath', 'levelup-skill': 'procLevelUp',
};

/** on/off properties, which the tables may write without a value */
const FLAGS = new Set(['knock', 'ignore-ac', 'nofreeze', 'half-freeze', 'noheal', 'rip', 'stupidity', 'indestruct', 'ethereal', 'explosivearrow']);

const CLASS_CODES = new Set(['ama', 'sor', 'nec', 'pal', 'bar', 'dru', 'ass', 'war']);

export type Roll = (min: number, max: number) => number;
export const rollRandom: Roll = (min, max) => randInt(Math.min(min, max), Math.max(min, max));
/** the top of every range, for describing what a property can be */
export const rollMax: Roll = (min, max) => Math.max(min, max);

/**
 * Turns Diablo II properties into item mods. Properties that only work together (poison damage
 * and its length) are read as a set. On a weapon, flat defense counts toward the character's
 * defense; on armor it is the piece's own.
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
      add(PER_LEVEL[p.c], Number(p.p ?? p.min), { perLvl: true });
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
      // pois-max, pois-len, cold-len: read with their partner above; sock, levelreq: by the cube
    }
  }
  return out;
}
