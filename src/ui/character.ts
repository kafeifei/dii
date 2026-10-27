import { CLASSES } from '../data/classes';
import { xpForLevel } from '../game/player';
import { addClose, h, type UIContext } from './common';

/** the character sheet: level, attributes (and the points to spend on them), combat numbers, resistances */
export function renderChar(ui: UIContext, L: HTMLElement) {
  const p = ui.game.player;
  const d = p.stats;
  L.innerHTML = '';
  L.appendChild(h('h2', '', p.name));
  addClose(ui, L, 'left');
  const sheet = h('div', 'charsheet');
  const row = (lbl: string, v: string | number, cls = '', plus?: () => void) => {
    const r = h('div', 'row', `<span class="lbl">${lbl}</span><span style="display:flex;align-items:center"><span class="v ${cls}">${v}</span></span>`);
    if (plus) {
      const b = h('button', 'plus', '+');
      b.title = 'Shift+点击加 5 点';
      b.onclick = (e) => {
        plus();
        if (e.shiftKey) for (let i = 0; i < 4 && p.statPoints > 0; i++) plus();
      };
      r.lastElementChild!.appendChild(b);
    }
    sheet.appendChild(r);
  };
  row('等级', p.level);
  row('经验值', `${p.xp} / ${xpForLevel(p.level + 1)}`);
  row('职业', CLASSES[p.cls].name);
  sheet.appendChild(h('div', 'head', '属性'));
  if (p.statPoints > 0) sheet.appendChild(h('div', 'points', `剩余属性点：${p.statPoints}`));
  const add = (k: keyof typeof p.base) => () => {
    if (p.statPoints <= 0) return;
    p.base[k]++;
    p.statPoints--;
    p.markDirty();
    ui.dirty = true;
    ui.sfx.play('click');
  };
  const can = p.statPoints > 0;
  row('力量', d.str, d.str !== p.base.str ? 'boost' : '', can ? add('str') : undefined);
  row('敏捷', d.dex, d.dex !== p.base.dex ? 'boost' : '', can ? add('dex') : undefined);
  row('体力', d.vit, d.vit !== p.base.vit ? 'boost' : '', can ? add('vit') : undefined);
  row('精力', d.ene, d.ene !== p.base.ene ? 'boost' : '', can ? add('ene') : undefined);
  sheet.appendChild(h('div', 'head', '战斗'));
  const w = p.equipment.weapon;
  const mult = 1 + d.dmgPct / 100;
  row('伤害', `${Math.floor(Math.max(1, d.wMin) * mult)} - ${Math.floor(Math.max(1, d.wMax) * mult)}`);
  row('准确率', d.ar);
  row('防御', d.def);
  row('攻击速度', `${d.attacksPerSec.toFixed(2)} 次/秒`);
  if (p.equipment.offhand) row('格挡几率', `${Math.round(d.block)}%`);
  row('生命', `${Math.ceil(p.life)} / ${d.maxLife}`);
  row('法力', `${Math.ceil(p.mana)} / ${d.maxMana}`);
  sheet.appendChild(h('div', 'head', '抗性'));
  row('火焰抗性', `${d.res.fire}%`, 'res-fire');
  row('冰冷抗性', `${d.res.cold}%`, 'res-cold');
  row('闪电抗性', `${d.res.light}%`, 'res-light');
  row('毒素抗性', `${d.res.poison}%`, 'res-poison');
  if (d.mf) row('魔法装备几率', `+${d.mf}%`);
  if (d.frw) row('跑步速度', `+${d.frw}%`);
  void w;
  L.appendChild(sheet);
}
