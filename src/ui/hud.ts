import { SKILLS, SKILL_BY_ID } from '../data/skills';
import { UMOD_NAMES } from '../data/monsters';
import { CHARGE_PREFIX, xpForLevel } from '../game/player';
import { skillCost } from '../game/playerctl';
import { baseOf } from '../items/item';
import { townPortalsIn } from '../items/tomes';
import { bindSkill, bindUsable, h, SLOT_KEYS, type UIContext } from './common';
import { itemIcon, skillIcon } from './icons';
import { readPress } from './quickmove';

/**
 * The HUD: the bottom bar (belt, skill slots, the panel buttons, the xp bar) and the orbs, and what
 * shows over the world: the level-up hint, the name and life of what's hovered, the messages.
 */
export class Hud {
  /** the skill slots (on a touch screen TouchControls makes them skill buttons) */
  readonly skillsEl: HTMLElement;
  private lifeOrb: HTMLElement;
  private manaOrb: HTMLElement;
  private beltEl: HTMLElement;
  private xpFill: HTMLElement;
  private stamFill: HTMLElement;
  private runEl: HTMLElement;
  private btns: Record<string, HTMLButtonElement> = {};
  private target: HTMLElement;
  private messagesEl: HTMLElement;
  private hintEl: HTMLElement;
  private msgs: { el: HTMLDivElement; t: number; dur: number }[] = [];

  constructor(
    private ui: UIContext,
    root: HTMLElement,
    /** a panel button clicked: the same as its key */
    button: (k: string) => void,
  ) {
    const r = root;
    const hud = h('div');
    hud.id = 'hud';
    const bar = h('div', 'hud-bar ui-block');
    this.beltEl = h('div', 'belt');
    this.skillsEl = h('div', 'skills');
    const buttons = h('div', 'hud-buttons');
    const btnDefs: [string, string, string][] = [
      ['char', '角', '角色 (C)'],
      ['inv', '包', '背包 (I)'],
      ['skills', '技', '技能树 (T)'],
      ['quests', '任', '任务日志 (L)'],
      ['portal', '门', '回城传送 (P)'],
      ['map', '图', '地图 (Tab)'],
      ['menu', '≡', '菜单 (Esc)'],
    ];
    for (const [k, label, title] of btnDefs) {
      const b = h('button', 'hbtn', `${label}<span class="badge">!</span>`);
      b.title = title;
      b.onclick = () => button(k);
      // the town portals the bag holds, as D2 shows a tome's on its skill's icon
      if (k === 'portal') b.appendChild(h('span', 'count'));
      buttons.appendChild(b);
      this.btns[k] = b;
    }
    bar.append(this.beltEl, this.skillsEl, buttons);
    const xp = h('div', 'xpbar');
    this.xpFill = h('div');
    xp.appendChild(this.xpFill);
    bar.appendChild(xp);
    // Diablo II's stamina bar, with its run/walk switch: running spends it out of town
    const stam = h('div', 'stambar');
    stam.title = '耐力：在营地外跑步会消耗（点击切换跑步/行走，按住 Ctrl 临时反过来）';
    this.stamFill = h('div', 'fill');
    this.runEl = h('span', 'run');
    stam.append(this.stamFill, this.runEl);
    stam.onclick = () => {
      const p = ui.game.player;
      p.runMode = !p.runMode;
      ui.sfx.play('ui.click');
    };
    bar.appendChild(stam);
    this.lifeOrb = h('div', 'orb life ui-block', '<div class="fill"></div><div class="gloss"></div><div class="val"></div>');
    this.manaOrb = h('div', 'orb mana ui-block', '<div class="fill"></div><div class="gloss"></div><div class="val"></div>');
    hud.append(bar, this.lifeOrb, this.manaOrb);
    r.appendChild(hud);

    this.hintEl = h('div', 'lvlup-hint');
    r.appendChild(this.hintEl);

    this.target = h('div');
    this.target.id = 'target';
    this.target.innerHTML = '<div class="name"></div><div class="bar"><div></div></div><div class="mods"></div>';
    r.appendChild(this.target);

    this.messagesEl = h('div');
    this.messagesEl.id = 'messages';
    r.appendChild(this.messagesEl);
  }

  message(text: string, color = '#d8d0c0', dur = 2.5) {
    const el = h('div');
    el.textContent = text;
    el.style.color = color;
    this.messagesEl.appendChild(el);
    this.msgs.push({ el, t: 0, dur });
    if (this.msgs.length > 5) {
      const old = this.msgs.shift()!;
      old.el.remove();
    }
  }

  private onBeltDown(col: number, e: PointerEvent) {
    e.preventDefault();
    const ui = this.ui;
    const p = ui.game.player;
    const stack = p.belt[col];
    // D2R's ctrl+click does nothing of its own on the belt: a Mac's is a left click still (quickmove.ts readPress)
    if (readPress(e).button === 2) {
      ui.game.useBelt(col);
      return;
    }
    if (ui.cursorItem) {
      const c = ui.cursorItem;
      if (baseOf(c).type !== 'potion') return;
      if (stack.length >= p.beltRows()) return;
      if (stack.length && stack[0].baseId !== c.baseId) return;
      stack.push(c);
      ui.cursorItem = null;
      ui.sfx.play('item.move');
    } else if (stack.length) {
      ui.cursorItem = stack.pop()!;
      ui.sfx.play('item.move');
    }
    ui.dirty = true;
  }

  /** the belt and the skill slots, drawn again with the panels */
  render() {
    const ui = this.ui;
    const p = ui.game.player;
    // belt
    this.beltEl.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const stack = p.belt[i];
      const s = h('div', 'slot');
      if (stack.length) {
        const it = stack[0];
        s.innerHTML = `<img src="${itemIcon(it)}" /><span class="count">${stack.length > 1 ? stack.length : ''}</span>`;
        s.dataset.uid = it.uid;
        ui.itemByUid.set(it.uid, it);
      }
      s.appendChild(h('span', 'key', String(i + 1)));
      s.addEventListener('pointerdown', (e) => this.onBeltDown(i, e));
      this.beltEl.appendChild(s);
    }
    // skill slots
    this.skillsEl.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const id = p.binds[i];
      const s = h('div', `slot${id ? '' : ' empty'}`);
      if (id && bindUsable(p, id)) {
        s.innerHTML = `<img src="${skillIcon(bindSkill(id))}" />`;
        if (id.startsWith(CHARGE_PREFIX)) {
          const c = h('span', 'charges');
          c.dataset.chg = bindSkill(id);
          s.appendChild(c);
        }
        s.dataset.skill = id;
        if (p.activeAura === id) s.classList.add('active-aura');
        if (SKILL_BY_ID[id]?.cooldown) {
          const cd = h('div', 'cd');
          cd.dataset.cd = id;
          s.appendChild(cd);
        }
      }
      s.appendChild(h('span', 'key', SLOT_KEYS[i]));
      // on a touch screen the slot is a skill button (TouchControls); skills are bound in the skills panel
      if (!ui.touch) s.onclick = () => ui.picker.open(i, s);
      this.skillsEl.appendChild(s);
    }
    const portals = townPortalsIn(p.inventory);
    (this.btns.portal.querySelector('.count') as HTMLElement).textContent = String(portals);
    this.btns.portal.classList.toggle('empty', !portals);
    this.btns.portal.title = `回城传送 (P)：背包里还有 ${portals} 次`;
    this.btns.char.classList.toggle('notify', p.statPoints > 0);
    this.btns.skills.classList.toggle('notify', p.skillPoints > 0);
    // news in the quest log: a quest moved on, or one done it hasn't shown yet
    this.btns.quests.classList.toggle('notify', ui.questNews || ui.game.quests.unseen().length > 0);
  }

  /** every frame: the orbs, the xp bar, the skill slots' cooldowns and costs, the hint, the target, the messages */
  update(dt: number) {
    const g = this.ui.game;
    const p = g.player;
    // orbs
    const d = p.stats;
    const lf = Math.max(0, p.life / d.maxLife);
    const mf = Math.max(0, p.mana / d.maxMana);
    (this.lifeOrb.firstElementChild as HTMLElement).style.height = `${lf * 100}%`;
    (this.manaOrb.firstElementChild as HTMLElement).style.height = `${mf * 100}%`;
    this.lifeOrb.classList.toggle('poison', p.poisonTime > 0);
    (this.lifeOrb.lastElementChild as HTMLElement).textContent = `生命 ${Math.ceil(p.life)}/${d.maxLife}`;
    (this.manaOrb.lastElementChild as HTMLElement).textContent = `法力 ${Math.ceil(p.mana)}/${d.maxMana}`;
    const cur = xpForLevel(p.level);
    const next = xpForLevel(p.level + 1);
    this.xpFill.style.width = `${Math.min(100, ((p.xp - cur) / Math.max(1, next - cur)) * 100)}%`;
    this.stamFill.style.width = `${Math.max(0, Math.min(100, (p.stamina / Math.max(1, d.maxStamina)) * 100))}%`;
    this.runEl.textContent = p.runMode ? '跑' : '走';
    // cooldown overlays
    for (const el of this.skillsEl.querySelectorAll<HTMLElement>('[data-cd]')) {
      const id = el.dataset.cd!;
      const def = SKILL_BY_ID[id];
      const left = p.cooldowns[id] ?? 0;
      el.style.height = `${def.cooldown ? (left / def.cooldown) * 100 : 0}%`;
      el.style.top = 'auto';
      el.style.bottom = '0';
    }
    // insufficient mana tint
    for (const el of this.skillsEl.querySelectorAll<HTMLElement>('[data-skill]')) {
      const id = el.dataset.skill!;
      const out = id.startsWith(CHARGE_PREFIX) ? !(p.chargeFor(bindSkill(id))?.left ?? 0) : id !== 'attack' && p.mana < skillCost(p, id);
      el.style.filter = out ? 'saturate(0.2) brightness(0.6)' : '';
    }
    for (const el of this.skillsEl.querySelectorAll<HTMLElement>('[data-chg]')) el.textContent = String(p.chargeFor(el.dataset.chg!)?.left ?? 0);
    this.hintEl.textContent = p.statPoints > 0 || p.skillPoints > 0 ? `${p.statPoints > 0 ? `有 ${p.statPoints} 点属性点（C）` : ''}${p.statPoints > 0 && p.skillPoints > 0 ? ' · ' : ''}${p.skillPoints > 0 ? `有 ${p.skillPoints} 点技能点（T）` : ''}` : '';

    // target bar
    const m = g.hover.monster;
    if (m && !m.dead) {
      this.target.style.display = 'block';
      const nameEl = this.target.querySelector('.name') as HTMLElement;
      nameEl.textContent = m.displayName;
      nameEl.style.color = m.rank === 'unique' || m.rank === 'boss' ? '#c8a86a' : m.rank === 'champion' ? '#7a7aff' : '#e8e0d0';
      (this.target.querySelector('.bar > div') as HTMLElement).style.width = `${Math.max(0, m.life / m.maxLife) * 100}%`;
      // a champion's kind, then its or a unique's modifiers, in D2's words (MonUMod); a minion's passed-on ones aren't listed, as in D2
      const mods = [...(m.def.undead ? ['亡灵'] : []), ...(m.rank === 'champion' || m.rank === 'unique' ? m.mods.map((x) => UMOD_NAMES[x]).filter(Boolean) : [])];
      (this.target.querySelector('.mods') as HTMLElement).textContent = mods.join(' · ');
    } else if (g.hover.object && !g.hover.ground) {
      this.target.style.display = 'block';
      const nameEl = this.target.querySelector('.name') as HTMLElement;
      nameEl.textContent = g.hover.object.name;
      nameEl.style.color = '#d8c8a0';
      (this.target.querySelector('.bar') as HTMLElement).style.display = 'none';
      (this.target.querySelector('.mods') as HTMLElement).textContent = '';
    } else this.target.style.display = 'none';
    if (m) (this.target.querySelector('.bar') as HTMLElement).style.display = '';

    // messages
    for (const msg of this.msgs) {
      msg.t += dt;
      if (msg.t > msg.dur) msg.el.style.opacity = '0';
    }
    this.msgs = this.msgs.filter((msg) => {
      if (msg.t > msg.dur + 0.5) {
        msg.el.remove();
        return false;
      }
      return true;
    });
  }
}

/** the list of skills that pops up over a skill slot, to bind one to it */
export class SkillPicker {
  readonly el: HTMLElement;
  /** the slot it's open for, -1 when shut */
  private slot = -1;

  constructor(private ui: UIContext) {
    this.el = h('div', 'picker ui-block');
  }

  get isOpen() {
    return this.slot >= 0;
  }

  open(slot: number, anchor: HTMLElement) {
    if (this.slot === slot) return this.close();
    this.slot = slot;
    const ui = this.ui;
    const p = ui.game.player;
    const el = this.el;
    el.innerHTML = '';
    // skills with points, any an item grants (a staff's +3 Teleport, Enigma's Teleport), and charged ones
    const ids = ['attack', ...SKILLS.filter((s) => s.kind !== 'passive' && p.skillLevel(s.id) > 0).map((s) => s.id)];
    for (const c of p.chargedSkills()) if (!ids.includes(CHARGE_PREFIX + c.id)) ids.push(CHARGE_PREFIX + c.id);
    for (const id of ids) {
      const s = h('div', 'slot');
      s.innerHTML = `<img src="${skillIcon(bindSkill(id))}" />`;
      if (id.startsWith(CHARGE_PREFIX)) s.appendChild(h('span', 'charges', String(p.chargeFor(bindSkill(id))?.left ?? 0)));
      s.dataset.skill = id;
      s.onclick = () => {
        p.binds[slot] = id;
        this.close();
        ui.dirty = true;
        ui.sfx.play('ui.click');
      };
      el.appendChild(s);
    }
    const clear = h('div', 'slot', '<span style="font-size:11px;color:#888">清空</span>');
    clear.onclick = () => {
      p.binds[slot] = slot === 0 ? 'attack' : null;
      this.close();
      ui.dirty = true;
    };
    el.appendChild(clear);
    const r = anchor.getBoundingClientRect();
    el.classList.add('open');
    el.style.left = `${Math.max(8, r.left - 100)}px`;
  }

  close() {
    this.slot = -1;
    this.el.classList.remove('open');
  }
}
