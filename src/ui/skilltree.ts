import { CLASSES } from '../data/classes';
import { SKILL_BY_ID, classSkills, type SkillDef } from '../data/skills';
import { addClose, bindSkill, bindUsable, h, SLOT_KEYS, type UIContext } from './common';
import { skillIcon } from './icons';

/** the skills panel: the class's trees, one tab each; a click learns a skill */
export class SkillTree {
  /** the tree on show */
  private tab = 0;

  constructor(private ui: UIContext) {}

  render(R: HTMLElement) {
    const ui = this.ui;
    const p = ui.game.player;
    R.innerHTML = '';
    R.appendChild(h('h2', '', '技 能'));
    addClose(ui, R, 'right');
    const tabs = h('div', 'tabs');
    CLASSES[p.cls].trees.forEach((n, i) => {
      const t = h('div', `tab${i === this.tab ? ' on' : ''}`, n);
      t.onclick = () => {
        this.tab = i;
        ui.dirty = true;
      };
      tabs.appendChild(t);
    });
    R.appendChild(tabs);
    const tree = h('div', 'tree');
    const skills = classSkills(p.cls).filter((s) => s.tree === this.tab);
    // phones lay the tree on its side, so the tree and the skill keys fit one screen
    const flat = !!ui.touch;
    const pos = (s: SkillDef) => (flat ? { x: 6 + s.row * 76, y: 6 + s.col * 72 } : { x: 40 + s.col * 120, y: 12 + s.row * 82 });
    let svg = '<svg>';
    for (const s of skills) {
      for (const pre of s.prereqs) {
        const ps = SKILL_BY_ID[pre];
        if (ps.tree !== s.tree) continue;
        const a = pos(ps);
        const b = pos(s);
        const on = p.skillBase(pre) > 0;
        const [x1, y1, x2, y2] = flat ? [a.x + 56, a.y + 28, b.x, b.y + 28] : [a.x + 28, a.y + 56, b.x + 28, b.y];
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? '#c8a040' : '#3a2e20'}" stroke-width="3"/>`;
      }
    }
    svg += '</svg>';
    tree.innerHTML = svg;
    for (const s of skills) {
      const { x, y } = pos(s);
      const base = p.skillBase(s.id);
      const eff = p.skillLevel(s.id);
      const avail = p.canLearn(s);
      const el = h('div', `sk${eff === 0 ? ' locked' : ''}${avail ? ' avail' : ''}`);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.dataset.skill = s.id;
      el.innerHTML = `<img src="${skillIcon(s.id)}" /><div class="lv${eff > base ? ' bonus' : ''}">${eff || 0}</div>`;
      el.onclick = () => this.learn(s);
      tree.appendChild(el);
    }
    R.appendChild(tree);
    R.appendChild(h('div', 'skillpoints', `剩余技能点：${p.skillPoints}`));
    if (ui.touch) R.appendChild(this.renderBindPad());
  }

  /** phones: the skill buttons as the right thumb has them; a skill tapped in the tree, then one of these, binds it */
  private renderBindPad(): HTMLElement {
    const p = this.ui.game.player;
    const wrap = h('div', 'bindpad');
    wrap.appendChild(h('div', 'bindhint', '点一个技能，再点这里的按键装上<br/>直接点按键：从列表里挑'));
    const pad = h('div', 'pad');
    for (let i = 0; i < 6; i++) {
      const id = p.binds[i] ?? (i === 0 ? 'attack' : null);
      const s = h('div', `bslot${id && bindUsable(p, id) ? '' : ' empty'}`);
      if (id && bindUsable(p, id)) s.innerHTML = `<img src="${skillIcon(bindSkill(id))}" />`;
      s.dataset.bind = String(i);
      pad.appendChild(s);
    }
    wrap.appendChild(pad);
    return wrap;
  }

  /** a skill key in the skills panel tapped (touch): give it the skill picked in the tree, or with none, open the list */
  bindFromPanel(slot: number, skill: string | null, anchor: HTMLElement) {
    const ui = this.ui;
    if (!skill) return ui.picker.open(slot, anchor);
    const p = ui.game.player;
    const def = SKILL_BY_ID[skill];
    if (!def) return;
    if (def.kind === 'passive') return ui.message('被动技能学会就生效，不用装上', '#aaa', 1.6);
    if (p.skillLevel(skill) <= 0) return ui.message('还没学会这个技能', '#ff6060', 1.4);
    // already on another key: the two swap
    const other = p.binds.indexOf(skill);
    if (other >= 0 && other !== slot) p.binds[other] = p.binds[slot] ?? (other === 0 ? 'attack' : null);
    p.binds[slot] = skill;
    ui.sfx.play('ui.click');
    ui.message(`${def.name} 已装上`, '#c8a86a', 1.4);
    ui.dirty = true;
  }

  private learn(s: SkillDef) {
    const ui = this.ui;
    const p = ui.game.player;
    if (!p.canLearn(s)) {
      if (p.skillPoints <= 0) ui.message('没有可用的技能点', '#aaa', 1.2);
      else if (p.level < s.reqLevel) ui.message(`需要等级 ${s.reqLevel}`, '#ff6060', 1.2);
      else ui.message('需要先学习前置技能', '#ff6060', 1.2);
      return;
    }
    const first = p.skillBase(s.id) === 0;
    p.skills[s.id] = p.skillBase(s.id) + 1;
    p.skillPoints--;
    p.markDirty();
    ui.sfx.play('ui.skill_learn');
    if (first && s.kind !== 'passive') {
      const idx = p.binds.findIndex((b, i) => i >= 1 && !b);
      if (idx >= 0) {
        p.binds[idx] = s.id;
        ui.message(`${s.name} 已绑定到 ${SLOT_KEYS[idx]}`, '#c8a86a', 2);
      }
    }
    ui.dirty = true;
  }
}
