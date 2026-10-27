// What an item tooltip needs from D2's tables: the stats each property code sets (Properties.txt
// func1–7, stat1–7, val1–7), each stat's description (ItemStatCost.txt descpriority, descfunc,
// descval, descstrpos / descstrneg / descstr2 and its group dgrp*, and Multiply / Add / Encode for
// the price it adds to an item), and the client's own strings
// (durability, requirements, sockets, the name formats), all with the official Simplified Chinese
// of D2CE's string tables (item-modifiers, ui, and item-nameaffixes for Superior and Gemmed). These are generic words; a string with a proper noun the glossary
// replaces fails the import, as names do.
import { DATA, STR, load, record, rows, writeD2x } from './load.mjs';
import { glossaryOfficial } from './names.mjs';

/** the strings the tooltip and the item names use besides the stats' own (D2CE ui and item-modifiers) */
const TOOLTIP_KEYS = [
  // tooltip lines
  'ItemStats1a', 'ItemStats1b', 'ItemStats1d', 'ItemStats1e', 'ItemStats1f', 'ItemStats1h', 'ItemStats1i', 'ItemStats1l', 'ItemStats1m',
  'ItemStats1p', 'ItemStats1r', 'strItemStatThrowDamageRange', 'Socketable', 'strethereal', 'strItemModEtherealSocketed',
  'ModStre9s', 'ModStre9u', 'Charmdes', 'ExInsertSockets', 'StrGemX1', 'StrGemX2', 'StrGemX3', 'StrGemX4', 'BeltStorageModifierInfo',
  'increaseswithplaylevelX',
  // weapon class and speed
  'WeaponDescMace', 'WeaponDescAxe', 'WeaponDescSword - %s', 'WeaponDescDagger', 'WeaponDescH2H', 'WeaponDescOrb', 'WeaponDescJavelin', 'WeaponDescSpear', 'WeaponDescBow',
  'WeaponDescStaff', 'WeaponDescPoleArm', 'WeaponDescCrossBow', 'WeaponDescThrownPotion',
  'WeaponAttackFastest', 'WeaponAttackVeryFast', 'WeaponAttackFast', 'WeaponAttackNormal', 'WeaponAttackSlow', 'WeaponAttackVerySlow', 'WeaponAttackSlowest',
  // the damage pairs and groups the client puts on one line
  'strModEnhancedDamage', 'strModMinDamage', 'strModMinDamageRange', 'strModFireDamage', 'strModFireDamageRange', 'strModColdDamage',
  'strModColdDamageRange', 'strModLightningDamage', 'strModLightningDamageRange', 'strModMagicDamage', 'strModMagicDamageRange',
  'strModPoisonDamage', 'strModPoisonDamageRange', 'strModAllResistances', 'Moditem2allattrib',
  // item names
  'MagicFormat', 'ItemNameMagicFormatPrefixOnly', 'ItemNameMagicFormatSuffixOnly', 'RareFormat', 'HiqualityFormat', 'LowqualityFormat',
  'GemmedNormalName', 'Hiquality', 'Gemmed',
];

export async function buildStatDesc() {
  const [iscJ, propsJ] = await Promise.all([load(DATA, 'itemstatcost'), load(DATA, 'properties')]);
  const zh = {};
  for (const f of ['item-modifiers', 'ui', 'item-nameaffixes']) for (const e of rows(await load(STR, f))) zh[e.Key] ??= e.zhCN;
  const banned = glossaryOfficial();
  const text = (key, where) => {
    const s = zh[key];
    if (s === undefined) return undefined;
    const bad = banned.find((o) => s.includes(o));
    if (bad) throw new Error(`${where}: the string ${key} "${s}" has the official ${bad}`);
    return s;
  };

  // ── properties: the stats each code sets ──
  const properties = {};
  for (const r of rows(propsJ)) {
    if (!r.code) continue;
    const out = [];
    for (let i = 1; i <= 7; i++) {
      if (r[`func${i}`] === undefined) continue;
      const s = { func: r[`func${i}`] };
      if (r[`stat${i}`]) s.stat = r[`stat${i}`];
      if (r[`val${i}`] !== undefined) s.val = r[`val${i}`];
      out.push(s);
    }
    if (out.length) properties[String(r.code).toLowerCase()] = out;
  }

  // ── stats: every one a property sets, and every one with a description ──
  const used = new Set(Object.values(properties).flatMap((l) => l.map((s) => s.stat).filter(Boolean)));
  const stats = {};
  for (const r of rows(iscJ)) {
    if (!r.Stat || (!used.has(r.Stat) && !r.descfunc)) continue;
    const s = { id: r['*ID'] };
    if (r.descpriority !== undefined) s.pri = r.descpriority;
    if (r.descfunc) {
      s.func = r.descfunc;
      if (r.descval !== undefined) s.val = r.descval;
      const pos = text(r.descstrpos, r.Stat);
      const neg = text(r.descstrneg, r.Stat);
      if (pos !== undefined) s.pos = pos;
      if (neg !== undefined && neg !== pos) s.neg = neg;
      const s2 = text(r.descstr2, r.Stat);
      if (s2 !== undefined) s.str2 = s2;
    }
    if (r.dgrp) {
      s.grp = r.dgrp;
      s.grpFunc = r.dgrpfunc;
      if (r.dgrpval !== undefined) s.grpVal = r.dgrpval;
      const gp = text(r.dgrpstrpos, r.Stat);
      if (gp !== undefined) s.grpPos = gp;
    }
    // what a point of it adds to an item's price, and how its value is encoded (a skill, by time: D2Common Items.cpp:1841-1957)
    if (r.Multiply || r.Add) s.cost = [r.Multiply ?? 0, r.Add ?? 0];
    if (r.Encode) s.enc = r.Encode;
    if (r.op) {
      s.op = r.op;
      if (r['op param']) s.opParam = r['op param'];
      if (r['op base']) s.opBase = r['op base'];
    }
    stats[r.Stat] = s;
  }

  const tooltip = {};
  for (const k of TOOLTIP_KEYS) {
    const s = text(k, 'tooltip');
    if (s === undefined) throw new Error(`no string ${k}`);
    // the table keys Sword Class as "WeaponDescSword - %s"
    tooltip[k.replace(/ - %s$/, '')] = s;
  }

  writeD2x(
    'statdesc.ts',
    `import type { D2xPropStat, D2xStatDesc } from './types';\n\n` +
      `/** the stats each property code sets, in order (Properties.txt funcN / statN / valN), by lower-case code */\n` +
      `export const D2X_PROPERTIES: Record<string, D2xPropStat[]> = ${record(properties)};\n\n` +
      `/** each stat's tooltip description and price (ItemStatCost.txt), strings in the official Simplified Chinese */\n` +
      `export const D2X_STAT_DESC: Record<string, D2xStatDesc> = ${record(stats)};\n\n` +
      `/** the client's own tooltip and item-name strings, by string key */\n` +
      `export const D2X_TOOLTIP_STRINGS: Record<string, string> = ${record(tooltip)};\n`,
  );
  console.log(`statdesc: ${Object.keys(properties).length} properties, ${Object.keys(stats).length} stats, ${Object.keys(tooltip).length} strings`);
}
