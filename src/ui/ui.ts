import type { Sfx } from '../audio/sfx';
import { ITEM_BASES, slotsFor, type EquipSlot } from '../data/items';
import { GEMS, RUNE_BY_ID } from '../data/legendary';
import { CLASSES, CLASS_IDS, type PlayerClass } from '../data/classes';
import { SKILLS, SKILL_BY_ID, classSkills, type SkillDef } from '../data/skills';
import { MOD_NAMES } from '../data/monsters';
import type { Game, GameHooks } from '../game/game';
import type { Level } from '../game/level';
import type { ObjKind } from '../game/objects';
import { CHARGE_PREFIX, xpForLevel, type Player } from '../game/player';
import { deleteSave, freeSlot, listSaves, markInGame, MAX_SLOTS, setSlot } from '../game/save';
import { skillCost } from '../game/playerctl';
import { transmute } from '../items/cube';
import { createItem, findRuneword, applyRuneword } from '../items/gen';
import type { Grid } from '../items/grid';
import { baseOf, buyPrice, canSocket, itemColor, sellPrice, tooltip, type Item, type TooltipLine } from '../items/item';
import type { Renderer } from '../render/renderer';
import { T_FLOOR, T_PROP, T_WALL } from '../world/tilemap';
import { CELL, itemIcon, skillIcon } from './icons';
import { applySettings, saveSettings, SettingsPanel, type Settings } from './settings';
import { DebugPanel } from './debug';
import { debugEnabled } from '../game/debug';
import { isTouchDevice, TouchControls } from './touch';

type LeftPanel = 'char' | 'stash' | 'shop' | 'waypoint' | 'cube' | null;
type RightPanel = 'inv' | 'skills' | null;
type GridKind = 'inv' | 'stash' | 'shop' | 'cube';

/** runes and gems go into sockets */
const socketable = (it: Item) => {
  const t = baseOf(it).type;
  return t === 'rune' || t === 'gem';
};
const GEM_COLOR: Record<string, string> = Object.fromEntries(GEMS.map((g) => [g.id, ITEM_BASES[g.id].tint ?? '#fff']));

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const SLOT_KEYS = ['左键', '右键', 'Q', 'W', 'E', 'R'];
/** the controls as a phone has them (TouchControls) */
const TOUCH_HELP = `<b>左半屏按住拖动</b> 移动 · <b>右下按钮</b> 点按或按住，打脚下有圈的敌人 · <b>点怪物</b> 锁定它<br/>
  法术按钮 <b>按住拖动</b> 手动瞄准，松手施放，拖回按钮上松手取消 · 靠近物品、宝箱、商人时出现 <b>交互按钮</b><br/>
  换技能：打开 <b>技</b>，点一个技能，再点下面的技能键 · 背包里 <b>点一下</b> 看说明，<b>再点</b> 拿起，<b>长按</b> 使用或装备 · <b>⛶</b> 全屏`;
/** what the touch interact button says it does to each kind of thing */
const USE_VERB: Record<ObjKind, string> = { chest: '打开', barrel: '打碎', stairs: '进入', waypoint: '使用', vendor: '交谈', stash: '打开', portal: '进入' };

// paper doll layout (x, y, w, h in px)
const DOLL: Record<EquipSlot, [number, number, number, number, string]> = {
  head: [137, 0, 68, 68, '头部'],
  neck: [215, 24, 34, 34, '项链'],
  weapon: [0, 34, 68, 136, '武器'],
  body: [137, 78, 68, 102, '躯干'],
  offhand: [272, 34, 68, 136, '副手'],
  hands: [0, 180, 68, 68, '手部'],
  ring1: [95, 190, 34, 34, '戒指'],
  waist: [137, 190, 68, 34, '腰带'],
  ring2: [213, 190, 34, 34, '戒指'],
  feet: [272, 180, 68, 68, '足部'],
};

/** the skill a skill bar entry casts (`chg:<id>` casts <id> from charges) */
function bindSkill(id: string): string {
  return id.startsWith(CHARGE_PREFIX) ? id.slice(CHARGE_PREFIX.length) : id;
}

function bindName(id: string): string {
  if (id === 'attack') return '攻击';
  const name = SKILL_BY_ID[bindSkill(id)]?.name ?? id;
  return id.startsWith(CHARGE_PREFIX) ? `${name}（充能）` : name;
}

function bindUsable(p: Player, id: string): boolean {
  if (id === 'attack') return true;
  if (id.startsWith(CHARGE_PREFIX)) return !!p.chargeFor(bindSkill(id));
  return p.skillLevel(id) > 0;
}

/** gold to refill charges: Diablo II charges by skill level per missing charge */
function rechargeCost(missing: number, lvl: number): number {
  return missing * (10 + lvl * 6);
}

export class UI implements GameHooks {
  cursorItem: Item | null = null;
  private hoverGround: number | null = null;
  left: LeftPanel = null;
  right: RightPanel = null;
  private skillTab = 0;
  private dirty = true;
  private itemByUid = new Map<string, Item>();
  private labelEls = new Map<number, { el: HTMLDivElement; w: number; h: number }>();
  private msgs: { el: HTMLDivElement; t: number; dur: number }[] = [];
  private mapTimer = 0;
  private automapOpen = false;
  private pickerSlot = -1;
  private hoverSkill: string | null = null;
  private tooltipSrc: HTMLElement | null = null;

  // elements
  private root: HTMLElement;
  private labelsLayer: HTMLElement;
  private vignette: HTMLElement;
  private lifeOrb!: HTMLElement;
  private manaOrb!: HTMLElement;
  private beltEl!: HTMLElement;
  private skillsEl!: HTMLElement;
  private xpFill!: HTMLElement;
  private btns: Record<string, HTMLButtonElement> = {};
  private target!: HTMLElement;
  private messagesEl!: HTMLElement;
  private leftEl!: HTMLElement;
  private rightEl!: HTMLElement;
  private tooltipEl!: HTMLElement;
  private cursorEl!: HTMLElement;
  private minimap!: HTMLCanvasElement;
  private minimapLabel!: HTMLElement;
  private automap!: HTMLElement;
  private automapCanvas!: HTMLCanvasElement;
  private titleEl!: HTMLElement;
  private deathEl!: HTMLElement;
  private menuEl!: HTMLElement;
  private settingsPanel!: SettingsPanel;
  private debugPanel: DebugPanel | null = null;
  private fpsEl!: HTMLElement;
  private fpsFrames = 0;
  private fpsTime = 0;
  private pickerEl!: HTMLElement;
  private hintEl!: HTMLElement;
  /** phone controls, on touch screens */
  private touch: TouchControls | null = null;

  constructor(
    private game: Game,
    private renderer: Renderer,
    private sfx: Sfx,
    private settings: Settings,
  ) {
    this.root = document.getElementById('ui')!;
    this.labelsLayer = document.getElementById('labels')!;
    this.vignette = document.getElementById('vignette')!;
    this.build();
    if (isTouchDevice()) {
      this.touch = new TouchControls(game.input, document.getElementById('world')!, this.skillsEl, this.root, {
        carrying: () => !!this.cursorItem,
        hideTooltip: () => this.hideTooltip(),
        pickSkill: (slot, anchor) => this.openPicker(slot, anchor),
        aimable: (slot) => {
          const id = this.game.player.binds[slot] ?? (slot === 0 ? 'attack' : null);
          return !!id && this.game.aimable(id);
        },
        bindSlot: (slot, skill, anchor) => this.bindFromPanel(slot, skill, anchor),
      });
      game.touchMode = true;
      const hint = this.touch.iosHint();
      if (hint) this.titleEl.querySelector('.title-sub')!.after(h('div', 'ios-hint', hint));
      renderer.setTouchView(true);
    }
    this.applySettings();
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
  }

  // ─────────────────────────── GameHooks ───────────────────────────
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

  openPanel(kind: 'shop' | 'stash' | 'waypoint') {
    this.left = kind;
    if (kind !== 'waypoint') this.right = 'inv';
    this.dirty = true;
    this.sfx.play('click');
  }

  levelChanged(level: Level) {
    this.renderer.buildLevel(level);
    for (const l of this.labelEls.values()) l.el.remove();
    this.labelEls.clear();
    this.hoverGround = null;
    if (this.left === 'shop' || this.left === 'stash' || this.left === 'waypoint') this.left = null;
    this.dirty = true;
  }

  playerDied() {
    const lost = this.game.player.gold;
    this.deathEl.querySelector('.note')!.textContent = `你的灵魂回到了营地……（携带金币剩余 ${lost}）`;
    setTimeout(() => this.deathEl.classList.add('open'), 1200);
  }

  inventoryChanged() {
    this.dirty = true;
  }

  getCursorItem() {
    return this.cursorItem;
  }

  setCursorItem(item: Item | null) {
    this.cursorItem = item;
    this.dirty = true;
  }

  hoveredGroundId() {
    return this.hoverGround;
  }

  levelUp() {
    this.dirty = true;
  }

  // ─────────────────────────── building ───────────────────────────
  private build() {
    const r = this.root;
    // HUD
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
      ['portal', '门', '回城传送 (P)'],
      ['map', '图', '地图 (Tab)'],
      ['menu', '≡', '菜单 (Esc)'],
    ];
    for (const [k, label, title] of btnDefs) {
      const b = h('button', 'hbtn', `${label}<span class="badge">!</span>`);
      b.title = title;
      b.onclick = () => this.button(k);
      buttons.appendChild(b);
      this.btns[k] = b;
    }
    bar.append(this.beltEl, this.skillsEl, buttons);
    const xp = h('div', 'xpbar');
    this.xpFill = h('div');
    xp.appendChild(this.xpFill);
    bar.appendChild(xp);
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

    const mm = h('div');
    mm.id = 'minimap';
    this.minimap = h('canvas');
    this.minimap.width = 240;
    this.minimap.height = 240;
    this.minimapLabel = h('div', 'lvl');
    mm.append(this.minimap, this.minimapLabel);
    r.appendChild(mm);

    this.automap = h('div');
    this.automap.id = 'automap';
    this.automapCanvas = h('canvas');
    this.automap.appendChild(this.automapCanvas);
    r.appendChild(this.automap);

    this.leftEl = h('div', 'panel left ui-block');
    this.rightEl = h('div', 'panel right ui-block');
    r.append(this.leftEl, this.rightEl);

    this.pickerEl = h('div', 'picker ui-block');
    r.appendChild(this.pickerEl);

    this.tooltipEl = h('div');
    this.tooltipEl.id = 'tooltip';
    document.body.appendChild(this.tooltipEl);

    this.cursorEl = h('div');
    this.cursorEl.id = 'cursorItem';
    document.body.appendChild(this.cursorEl);

    this.fpsEl = h('div');
    this.fpsEl.id = 'fps';
    r.appendChild(this.fpsEl);

    this.buildTitle();
    this.buildDeath();
    this.buildMenu();
    this.settingsPanel = new SettingsPanel(
      this.settings,
      () => this.applySettings(),
      () => {
        if (this.game.started) this.game.save();
      },
    );
    this.root.appendChild(this.settingsPanel.el);
    if (debugEnabled) {
      this.debugPanel = new DebugPanel(
        this.game,
        () => (this.dirty = true),
        () => this.toggleMenu(false),
      );
      this.root.appendChild(this.debugPanel.el);
    }
  }

  private applySettings() {
    applySettings(this.settings, this.renderer, this.sfx);
    this.fpsEl.style.display = this.settings.showFps ? '' : 'none';
  }

  private openSettings() {
    this.sfx.play('click');
    this.settingsPanel.open();
  }

  /** over the pause menu, so closing it leaves the game paused there */
  private openDebug() {
    if (!this.debugPanel) return;
    this.sfx.play('click');
    this.toggleMenu(true);
    this.debugPanel.open();
  }

  private buildTitle() {
    const t = h('div', 'overlay open ui-block');
    t.innerHTML = `
      <h1 class="title-logo">烬渊</h1>
      <div class="title-sub">EMBER · ABYSS</div>
      <div class="title-cols">
        <div class="menu saves-col">
          <div class="menu-head">选择角色</div>
          <div class="saves"></div>
        </div>
        <div class="menu">
          <div class="menu-head">创建角色</div>
          <div class="classes">${CLASS_IDS.map((c) => `<button class="cls" data-cls="${c}"><b>${CLASSES[c].name}</b><span>${CLASSES[c].desc}</span></button>`).join('')}</div>
          <input class="name" maxlength="12" placeholder="角色名字" value="${CLASSES.paladin.defaultName}" />
          <button class="btn new">新的冒险</button>
          <div class="loading">载入模型…</div>
        </div>
      </div>
      <button class="btn title-settings">设置</button>
      <div class="help title-help">
        <b>左键</b> 移动 / 攻击 / 拾取 · <b>Shift+左键</b> 原地攻击 · <b>右键</b> 释放右键技能 · <b>Q W E R</b> 技能快捷键<br/>
        <b>1-4</b> 腰带药剂 · <b>I</b> 背包 · <b>C</b> 角色 · <b>T</b> 技能树 · <b>P</b> 回城传送门 · <b>Tab</b> 地图 · <b>滚轮</b> 缩放 · <b>Esc</b> 菜单<br/>
        背包内 <b>右键</b> 使用/装备 · <b>Ctrl+左键</b> 快速出售或存取 · 把符文放到有孔装备上即可镶嵌
      </div>`;
    (t.querySelector('.title-settings') as HTMLButtonElement).onclick = () => this.openSettings();
    const name = t.querySelector('.name') as HTMLInputElement;
    const newBtn = t.querySelector('.new') as HTMLButtonElement;
    const savesCol = t.querySelector('.saves-col') as HTMLElement;
    const savesEl = t.querySelector('.saves') as HTMLElement;
    let cls: PlayerClass = 'paladin';
    const clsBtns = [...t.querySelectorAll<HTMLButtonElement>('.cls')];
    const pickClass = (c: PlayerClass) => {
      // keep a typed name, swap the placeholder one
      if (!name.value.trim() || name.value === CLASSES[cls].defaultName) name.value = CLASSES[c].defaultName;
      cls = c;
      for (const b of clsBtns) b.classList.toggle('on', b.dataset.cls === c);
    };
    for (const b of clsBtns) b.onclick = () => pickClass(b.dataset.cls as PlayerClass);
    pickClass('paladin');
    const start = (run: () => boolean | void) => {
      this.sfx.ensure();
      this.touch?.enterFullscreen();
      if (run() === false) return;
      this.touch?.gameStarted();
      t.classList.remove('open');
      this.dirty = true;
    };
    const refresh = () => {
      name.value = CLASSES[cls].defaultName;
      const saves = listSaves();
      savesCol.style.display = saves.length ? '' : 'none';
      savesEl.innerHTML = '';
      for (const sv of saves) {
        const row = h('div', 'save');
        const pick = h('button', 'btn pick');
        pick.innerHTML = `<b></b><span>${CLASSES[sv.cls].name} · ${sv.level} 级 · ${sv.depth ? `第 ${sv.depth} 层` : '营地'}</span>`;
        pick.querySelector('b')!.textContent = sv.name;
        pick.onclick = () => start(() => this.game.continueGame(sv.slot));
        const del = h('button', 'btn del', '✕');
        del.title = '删除角色';
        del.onclick = () => {
          if (!confirm(`删除角色「${sv.name}」？此操作无法撤销。`)) return;
          deleteSave(sv.slot);
          refresh();
        };
        row.append(pick, del);
        savesEl.appendChild(row);
      }
      const full = freeSlot() === null;
      newBtn.disabled = full;
      newBtn.textContent = full ? `角色已满（${MAX_SLOTS} 个）` : '新的冒险';
    };
    refresh();
    newBtn.onclick = () => {
      const free = freeSlot();
      if (free === null) return;
      start(() => {
        setSlot(free);
        this.game.newGame(name.value.trim(), cls);
      });
    };
    this.titleEl = t;
    t.classList.add('is-loading');
    (this.titleEl as HTMLElement & { refresh?: () => void }).refresh = refresh;
    this.root.appendChild(t);
  }

  loadProgress(done: number, total: number) {
    const el = this.titleEl.querySelector('.loading') as HTMLElement;
    if (done >= total) {
      this.titleEl.classList.remove('is-loading');
      el.textContent = '';
    } else el.textContent = `载入模型 ${Math.round((done / total) * 100)}%`;
  }

  /** continue the saved run without going through the title screen */
  resume() {
    if (!this.game.continueGame()) return;
    this.touch?.gameStarted();
    this.titleEl.classList.remove('open');
    this.dirty = true;
  }

  devStart() {
    const sorc = location.search.includes('sorc');
    this.game.newGame(sorc ? '测试法师' : '测试骑士', sorc ? 'sorceress' : 'paladin');
    this.touch?.gameStarted();
    this.titleEl.classList.remove('open');
    this.dirty = true;
  }

  private buildDeath() {
    const d = h('div', 'overlay ui-block');
    d.innerHTML = `<div class="death-title">你 死 了</div><div class="note"></div><div class="menu"><button class="btn">回到营地</button></div>`;
    (d.querySelector('.btn') as HTMLButtonElement).onclick = () => {
      d.classList.remove('open');
      this.game.respawn();
    };
    this.deathEl = d;
    this.root.appendChild(d);
  }

  private buildMenu() {
    const m = h('div', 'overlay ui-block');
    m.innerHTML = `
      <div class="title-sub" style="margin-bottom:24px">暂 停</div>
      <div class="menu">
        <button class="btn resume">继续游戏</button>
        <button class="btn open-settings">设置</button>
        ${debugEnabled ? '<button class="btn open-debug">调试</button>' : ''}
        <button class="btn quit">保存并返回标题</button>
      </div>
      <div class="help">
        ${
          isTouchDevice()
            ? TOUCH_HELP
            : `<b>左键</b> 移动 / 攻击 / 拾取 · <b>Shift+左键</b> 原地攻击 · <b>右键</b> 右键技能 · <b>Q W E R</b> 技能快捷键（点击技能栏可更换）<br/>
        <b>1-4</b> 腰带药剂 · <b>I</b> 背包 · <b>C</b> 角色 · <b>T</b> 技能树 · <b>P</b> 回城 · <b>Tab</b> 地图 · <b>滚轮</b> 缩放`
        }<br/>
        光环同一时间只能开启一个 · 第 4、8、12… 层有首领 · 暗金/套装/符文掉落时会有特殊音效
      </div>`;
    (m.querySelector('.resume') as HTMLButtonElement).onclick = () => this.toggleMenu(false);
    (m.querySelector('.open-settings') as HTMLButtonElement).onclick = () => this.openSettings();
    const dbg = m.querySelector('.open-debug') as HTMLButtonElement | null;
    if (dbg) dbg.onclick = () => this.openDebug();
    (m.querySelector('.quit') as HTMLButtonElement).onclick = () => {
      this.game.save();
      markInGame(false);
      this.game.started = false;
      this.game.paused = false;
      this.sfx.ambience('none');
      m.classList.remove('open');
      (this.titleEl as HTMLElement & { refresh?: () => void }).refresh?.();
      this.titleEl.classList.add('open');
    };
    this.menuEl = m;
    this.root.appendChild(m);
  }

  private toggleMenu(open?: boolean) {
    const o = open ?? !this.menuEl.classList.contains('open');
    this.menuEl.classList.toggle('open', o);
    this.game.paused = o;
  }

  // ─────────────────────────── input ───────────────────────────
  private button(k: string) {
    this.sfx.play('click');
    switch (k) {
      case 'char':
        this.left = this.left === 'char' ? null : 'char';
        break;
      case 'inv':
        this.right = this.right === 'inv' ? null : 'inv';
        break;
      case 'skills':
        this.right = this.right === 'skills' ? null : 'skills';
        break;
      case 'portal':
        this.game.castTownPortal();
        break;
      case 'map':
        this.automapOpen = !this.automapOpen;
        break;
      case 'menu':
        this.toggleMenu();
        break;
    }
    this.dirty = true;
  }

  private onKey(e: KeyboardEvent) {
    // settings sit over the title or the pause menu: Esc goes back to whichever
    if (e.key === 'Escape' && this.settingsPanel.isOpen) {
      this.settingsPanel.close();
      return;
    }
    if (this.debugPanel?.isOpen && (e.key === 'Escape' || e.key === '`')) {
      this.debugPanel.close();
      return;
    }
    if (!this.game.started) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === '`' && this.debugPanel && !this.game.player.dead) {
      this.openDebug();
      return;
    }
    if (k === 'Escape') {
      if (this.pickerSlot >= 0) {
        this.closePicker();
      } else if (this.left || this.right || this.automapOpen) {
        this.left = null;
        this.right = null;
        this.automapOpen = false;
        this.dirty = true;
      } else this.toggleMenu();
      return;
    }
    if (this.game.paused) return;
    // bind hovered skill to a hotkey
    if (this.hoverSkill && ['q', 'w', 'e', 'r'].includes(k)) {
      const idx = 2 + ['q', 'w', 'e', 'r'].indexOf(k);
      this.game.player.binds[idx] = this.hoverSkill;
      this.message(`${bindName(this.hoverSkill)} → ${SLOT_KEYS[idx]}`, '#c8a86a', 1.2);
      this.dirty = true;
      return;
    }
    switch (k) {
      case 'i':
      case 'b':
        this.button('inv');
        break;
      case 'c':
        this.button('char');
        break;
      case 't':
      case 's':
        this.button('skills');
        break;
      case 'p':
        this.button('portal');
        break;
      case 'Tab':
        e.preventDefault();
        this.button('map');
        break;
      case 'm':
        this.sfx.toggleMute();
        this.settings.muted = this.sfx.muted;
        saveSettings(this.settings);
        this.settingsPanel.refresh();
        this.message(this.sfx.muted ? '声音：关' : '声音：开', '#aaa', 1);
        break;
    }
  }

  private onPointerMove(e: PointerEvent) {
    if (this.cursorItem) {
      const b = baseOf(this.cursorItem);
      this.cursorEl.style.left = `${e.clientX - (b.w * CELL) / 2}px`;
      this.cursorEl.style.top = `${e.clientY - (b.h * CELL) / 2}px`;
    }
    // tooltip
    const t = e.target as HTMLElement;
    const holder = t.closest?.('[data-uid],[data-skill],[data-tip]') as HTMLElement | null;
    if (!holder) {
      this.hideTooltip();
      this.hoverSkill = null;
      return;
    }
    if (holder.dataset.skill) {
      this.hoverSkill = holder.dataset.skill;
      this.showSkillTooltip(holder.dataset.skill, e.clientX, e.clientY);
      return;
    }
    this.hoverSkill = null;
    if (holder.dataset.tip) {
      this.showTooltip([{ text: holder.dataset.tip }], e.clientX, e.clientY);
      return;
    }
    const item = this.itemByUid.get(holder.dataset.uid!);
    if (!item) return this.hideTooltip();
    if (this.cursorItem && holder.dataset.src !== 'shop') {
      // still show the target's tooltip when socketing
      if (!(baseOf(this.cursorItem).type === 'rune' && canSocket(item))) return this.hideTooltip();
    }
    const p = this.game.player;
    let price: string | undefined;
    if (holder.dataset.src === 'shop') price = `购买价格：${buyPrice(item)} 金币`;
    else if (this.left === 'shop' && (holder.dataset.src === 'inv')) price = `出售价格：${sellPrice(item)} 金币（${this.touch ? '拿起后放进商店出售' : 'Ctrl+点击出售'}）`;
    this.showTooltip(tooltip(item, { level: p.level, str: p.stats.str, dex: p.stats.dex, cls: p.cls }, price), e.clientX, e.clientY);
  }

  private showTooltip(lines: TooltipLine[], x: number, y: number) {
    const el = this.tooltipEl;
    if (this.touch) lines = lines.map((l) => (l.text.startsWith('右键点击') ? { ...l, text: l.text.replace('右键点击', '长按') } : l));
    el.innerHTML = lines.map((l, i) => `<div class="l${l.small ? ' small' : ''}${i === 0 ? ' title' : ''}" style="${l.color ? `color:${l.color}` : ''}">${escapeHtml(l.text) || '&nbsp;'}</div>`).join('');
    el.style.display = 'block';
    const r = el.getBoundingClientRect();
    let lx = x + 18;
    let ly = y - r.height - 10;
    if (lx + r.width > window.innerWidth - 8) lx = x - r.width - 18;
    if (ly < 8) ly = Math.min(window.innerHeight - r.height - 8, y + 20);
    el.style.left = `${lx}px`;
    el.style.top = `${ly}px`;
  }

  private hideTooltip() {
    this.tooltipEl.style.display = 'none';
  }

  private showSkillTooltip(id: string, x: number, y: number) {
    const p = this.game.player;
    if (id === 'attack') {
      this.showTooltip([{ text: '普通攻击', color: '#c8a86a' }, { text: '用手中的武器攻击' }], x, y);
      return;
    }
    if (id.startsWith(CHARGE_PREFIX)) {
      const sid = id.slice(CHARGE_PREFIX.length);
      const c = p.chargeFor(sid);
      const def = SKILL_BY_ID[sid];
      const lines: TooltipLine[] = [{ text: `${def.name}（充能）`, color: '#c8a86a' }, { text: def.desc, small: true }];
      if (c) {
        lines.push({ text: `技能等级：${c.lvl}（来自${c.item.name}）`, color: '#e8e0d0' });
        for (const l of def.describe(p.skillParams(sid, c.lvl))) lines.push({ text: l, color: '#7a7aff' });
        lines.push({ text: `剩余充能：${c.left}/${c.max}`, color: c.left > 0 ? '#6a8aff' : '#ff4040' });
      } else lines.push({ text: '没有装备带这项充能的物品', color: '#ff4040' });
      lines.push({ text: '每次施放消耗一次充能，不耗法力。找商人可以补充', small: true, color: '#888' });
      lines.push({ text: this.touch ? '点右边的技能键装上' : '悬停时按 Q/W/E/R 绑定快捷键', small: true, color: '#888' });
      this.showTooltip(lines, x, y);
      return;
    }
    const def = SKILL_BY_ID[id];
    const base = p.skillBase(id);
    const eff = p.skillLevel(id);
    const lines: TooltipLine[] = [{ text: def.name, color: '#c8a86a' }, { text: def.desc, small: true }];
    lines.push({ text: `需要等级：${def.reqLevel}`, color: p.level < def.reqLevel ? '#ff4040' : '#aaa', small: true });
    if (def.prereqs.length) lines.push({ text: `前置技能：${def.prereqs.map((x) => SKILL_BY_ID[x].name).join('、')}`, color: def.prereqs.every((x) => p.skillBase(x) > 0) ? '#aaa' : '#ff4040', small: true });
    if (eff > 0) {
      lines.push({ text: `当前等级：${eff}${eff > base ? `（+${eff - base}）` : ''}`, color: '#e8e0d0' });
      for (const l of def.describe(p.skillParams(id))) lines.push({ text: l, color: '#7a7aff' });
      const mana = def.mana(eff);
      if (mana) lines.push({ text: `法力消耗：${mana}`, color: '#6a8aff' });
    }
    if (base < 20) {
      lines.push({ text: '下一等级：', color: '#e8e0d0' });
      for (const l of def.describe(def.params(eff + 1 || 1, p.synergy(def)))) lines.push({ text: l, color: '#aaa' });
    }
    if (def.synergies?.length) {
      lines.push({ text: '协同加成：', color: '#c8a86a', small: true });
      for (const s of def.synergies) lines.push({ text: `${SKILL_BY_ID[s.skill].name}：每级 +${s.pct}% 伤害`, small: true, color: '#aaa' });
    }
    if (def.kind === 'aura') lines.push({ text: '光环：同一时间只能开启一个', small: true, color: '#888' });
    if (!this.touch) lines.push({ text: '悬停时按 Q/W/E/R 绑定快捷键', small: true, color: '#888' });
    else if (def.kind === 'passive') lines.push({ text: '再点一下学习 · 被动技能学会就生效', small: true, color: '#888' });
    else lines.push({ text: '再点一下学习 · 点右边的技能键装上', small: true, color: '#888' });
    this.showTooltip(lines, x, y);
  }

  // ─────────────────────────── item ops ───────────────────────────
  private socketInto(target: Item, rune: Item): boolean {
    if (!canSocket(target) || !socketable(rune)) return false;
    target.socketed.push(rune.baseId);
    const rw = findRuneword(target);
    if (rw) {
      applyRuneword(target, rw);
      this.message(`符文之语：${rw.name}！`, '#c8a86a', 4);
      this.sfx.play('dropunique');
    } else this.sfx.play('socket');
    this.game.player.markDirty();
    return true;
  }

  private gridOf(kind: GridKind): Grid {
    const p = this.game.player;
    return kind === 'inv' ? p.inventory : kind === 'stash' ? p.stash : kind === 'cube' ? p.cube : this.game.shop;
  }

  private onGridDown(kind: GridKind, gridEl: HTMLElement, e: PointerEvent) {
    e.preventDefault();
    const p = this.game.player;
    const grid = this.gridOf(kind);
    const rect = gridEl.getBoundingClientRect();
    // the panel may be drawn scaled (phones): measure in the grid's own pixels
    const k = gridEl.offsetWidth ? rect.width / gridEl.offsetWidth : 1;
    const px = (e.clientX - rect.left) / k;
    const py = (e.clientY - rect.top) / k;
    const cx = Math.floor(px / CELL);
    const cy = Math.floor(py / CELL);
    const under = grid.at(cx, cy);

    if (e.button === 2) {
      if (!under || this.cursorItem) return;
      const it = under.item;
      if (kind === 'shop') return this.buy(it);
      const b = baseOf(it);
      if (b.type === 'cube') {
        this.openCube();
        return;
      }
      if (b.type === 'potion') {
        grid.remove(it);
        this.game.drink(it);
      } else if (kind === 'inv') {
        this.autoEquip(it);
      }
      this.dirty = true;
      return;
    }
    if (e.button !== 0) return;

    if (this.cursorItem) {
      const c = this.cursorItem;
      if (kind === 'shop') {
        this.sell(c);
        this.cursorItem = null;
        this.dirty = true;
        return;
      }
      if (kind === 'cube' && baseOf(c).type === 'cube') return;
      if (under && socketable(c) && canSocket(under.item)) {
        if (this.socketInto(under.item, c)) {
          this.cursorItem = null;
          this.dirty = true;
        }
        return;
      }
      const b = baseOf(c);
      let tx = Math.round(px / CELL - b.w / 2);
      let ty = Math.round(py / CELL - b.h / 2);
      tx = Math.max(0, Math.min(grid.w - b.w, tx));
      ty = Math.max(0, Math.min(grid.h - b.h, ty));
      const over = grid.overlapping(tx, ty, b.w, b.h);
      if (over.length === 0) {
        grid.place(c, tx, ty);
        this.cursorItem = null;
        this.sfx.play('pickup');
      } else if (over.length === 1) {
        grid.remove(over[0].item);
        grid.place(c, tx, ty);
        this.cursorItem = over[0].item;
        this.sfx.play('pickup');
      }
      this.dirty = true;
      return;
    }
    if (!under) return;
    const it = under.item;
    if (kind === 'shop') return this.buy(it);
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      if (this.left === 'shop' && kind === 'inv') {
        grid.remove(it);
        this.sell(it);
      } else if (this.left === 'stash' || this.left === 'cube') {
        const other = this.left === 'stash' ? p.stash : p.cube;
        if (kind === 'inv' && baseOf(it).type === 'cube') return;
        const dest = kind === 'inv' ? other : p.inventory;
        if (dest.add(it)) grid.remove(it);
        else this.message(kind === 'inv' ? (this.left === 'stash' ? '储物箱已满' : '魔盒已满') : '背包已满', '#ff6060');
      } else if (baseOf(it).type === 'potion' && kind === 'inv') {
        if (this.game.beltInsert(it)) grid.remove(it);
      }
      this.sfx.play('pickup');
      this.dirty = true;
      return;
    }
    grid.remove(it);
    this.cursorItem = it;
    this.sfx.play('pickup');
    this.dirty = true;
  }

  private buy(it: Item) {
    const p = this.game.player;
    const price = buyPrice(it);
    if (p.gold < price) {
      this.message('金币不足', '#ff6060');
      this.sfx.play('nomana');
      return;
    }
    const b = baseOf(it);
    const copy = b.type === 'potion' ? createItem(b.id) : it;
    if (!(b.type === 'potion' && this.game.beltInsert(copy)) && !p.inventory.add(copy)) {
      this.message('背包已满', '#ff6060');
      return;
    }
    p.gold -= price;
    if (b.type !== 'potion') this.game.shop.remove(it);
    this.sfx.play('gold');
    this.dirty = true;
  }

  private sell(it: Item) {
    const p = this.game.player;
    if (baseOf(it).noSell) {
      this.message('商人不收这个', '#ff6060');
      this.cursorItem = it;
      return;
    }
    const v = sellPrice(it);
    p.gold += v;
    if (baseOf(it).type !== 'potion') this.game.shop.add(it);
    this.message(`出售 ${it.name}：+${v} 金币`, '#e8d890', 1.5);
    this.sfx.play('gold');
  }

  /** returns error text or null */
  private equipError(it: Item, slot: EquipSlot): string | null {
    const p = this.game.player;
    const b = baseOf(it);
    if (!slotsFor(b.type).includes(slot)) return '无法装备在这里';
    if (!p.meetsReq(it)) return '不满足装备需求';
    if (slot === 'offhand') {
      const w = p.equipment.weapon;
      if (w && baseOf(w).twoHanded) return '双手武器无法搭配盾牌';
    }
    return null;
  }

  private equipTo(it: Item, slot: EquipSlot): Item | null | false {
    const p = this.game.player;
    const err = this.equipError(it, slot);
    if (err) {
      this.message(err, '#ff6060', 1.5);
      this.sfx.play('nomana');
      return false;
    }
    const b = baseOf(it);
    if (slot === 'weapon' && b.twoHanded && p.equipment.offhand) {
      const sh = p.equipment.offhand;
      if (!p.inventory.add(sh)) {
        this.message('背包没有空间放下盾牌', '#ff6060');
        return false;
      }
      delete p.equipment.offhand;
    }
    const old = p.equipment[slot] ?? null;
    p.equipment[slot] = it;
    p.markDirty();
    this.sfx.play('equip');
    return old;
  }

  private autoEquip(it: Item) {
    const p = this.game.player;
    const slots = slotsFor(baseOf(it).type);
    if (!slots.length) return;
    let slot = slots[0];
    if (slots.length > 1) slot = slots.find((s) => !p.equipment[s]) ?? slots[0];
    const placed = p.inventory.items.find((x) => x.item === it);
    p.inventory.remove(it);
    const old = this.equipTo(it, slot);
    if (old === false) {
      if (placed) p.inventory.place(it, placed.x, placed.y);
      else p.inventory.add(it);
      return;
    }
    if (old) {
      if (!(placed && p.inventory.canPlace(old, placed.x, placed.y) && (p.inventory.place(old, placed.x, placed.y), true)) && !p.inventory.add(old)) {
        this.cursorItem = old;
      }
    }
  }

  private onEquipDown(slot: EquipSlot, e: PointerEvent) {
    e.preventDefault();
    const p = this.game.player;
    const cur = p.equipment[slot];
    if (e.button === 2) {
      if (cur && !this.cursorItem && p.inventory.add(cur)) {
        delete p.equipment[slot];
        p.markDirty();
        this.sfx.play('equip');
        this.dirty = true;
      }
      return;
    }
    if (this.cursorItem) {
      const c = this.cursorItem;
      if (cur && socketable(c) && canSocket(cur)) {
        if (this.socketInto(cur, c)) this.cursorItem = null;
        this.dirty = true;
        return;
      }
      const old = this.equipTo(c, slot);
      if (old === false) return;
      this.cursorItem = old;
      this.dirty = true;
      return;
    }
    if (cur) {
      delete p.equipment[slot];
      p.markDirty();
      this.cursorItem = cur;
      this.sfx.play('equip');
      this.dirty = true;
    }
  }

  private onBeltDown(col: number, e: PointerEvent) {
    e.preventDefault();
    const p = this.game.player;
    const stack = p.belt[col];
    if (e.button === 2) {
      this.game.useBelt(col);
      return;
    }
    if (this.cursorItem) {
      const c = this.cursorItem;
      if (baseOf(c).type !== 'potion') return;
      if (stack.length >= p.beltRows()) return;
      if (stack.length && stack[0].baseId !== c.baseId) return;
      stack.push(c);
      this.cursorItem = null;
      this.sfx.play('pickup');
    } else if (stack.length) {
      this.cursorItem = stack.pop()!;
      this.sfx.play('pickup');
    }
    this.dirty = true;
  }

  // ─────────────────────────── rendering ───────────────────────────
  private renderGrid(kind: GridKind, grid: Grid): HTMLElement {
    const el = h('div', 'grid');
    el.style.width = `${grid.w * CELL + 2}px`;
    el.style.height = `${grid.h * CELL + 2}px`;
    const p = this.game.player;
    for (const pl of grid.items) {
      const it = pl.item;
      const b = baseOf(it);
      const d = h('div', `gitem ${it.rarity}${b.type !== 'potion' && b.type !== 'cube' && !socketable(it) && kind !== 'shop' && !p.meetsReq(it) ? ' unusable' : ''}`);
      d.style.left = `${pl.x * CELL + 1}px`;
      d.style.top = `${pl.y * CELL + 1}px`;
      d.style.width = `${b.w * CELL}px`;
      d.style.height = `${b.h * CELL}px`;
      d.dataset.uid = it.uid;
      d.dataset.src = kind;
      d.innerHTML = `<img src="${itemIcon(it)}" />`;
      if (it.sockets > 0) {
        const s = h('div', 'sockets');
        for (let i = 0; i < it.sockets; i++) {
          const id = it.socketed[i];
          const r = id ? RUNE_BY_ID[id] : null;
          const sk = h('div', 'sock', r ? r.letter.slice(0, 1) : '');
          if (id && GEM_COLOR[id]) sk.style.background = `radial-gradient(circle at 40% 35%, #fff 0, ${GEM_COLOR[id]} 35%, #000 100%)`;
          s.appendChild(sk);
        }
        d.appendChild(s);
      }
      this.itemByUid.set(it.uid, it);
      el.appendChild(d);
    }
    el.addEventListener('pointerdown', (e) => this.onGridDown(kind, el, e));
    return el;
  }

  private renderInventory(): void {
    const p = this.game.player;
    const R = this.rightEl;
    R.innerHTML = '';
    R.appendChild(h('h2', '', '背 包'));
    const close = h('button', 'close', '✕');
    close.onclick = () => {
      this.right = null;
      this.dirty = true;
    };
    R.appendChild(close);
    const doll = h('div', 'paperdoll');
    for (const slot of Object.keys(DOLL) as EquipSlot[]) {
      const [x, y, w, hh, label] = DOLL[slot];
      const it = p.equipment[slot];
      const s = h('div', `eqslot ${it ? it.rarity : ''}`);
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.width = `${w}px`;
      s.style.height = `${hh}px`;
      if (it) {
        s.innerHTML = `<img src="${itemIcon(it)}" />`;
        s.dataset.uid = it.uid;
        s.dataset.src = 'eq';
        this.itemByUid.set(it.uid, it);
      } else s.innerHTML = `<span class="ph">${label}</span>`;
      if (this.cursorItem && slotsFor(baseOf(this.cursorItem).type).includes(slot)) s.classList.add('hl');
      s.addEventListener('pointerdown', (e) => this.onEquipDown(slot, e));
      doll.appendChild(s);
    }
    R.appendChild(doll);
    R.appendChild(this.renderGrid('inv', p.inventory));
    const gl = h('div', 'goldline', `<span>金币：${p.gold}</span><span style="color:#8a8278;font-size:12px">${this.touch ? '点一下看说明，再点拿起 · 长按使用/装备' : '右键使用/装备 · Ctrl+点击快捷操作'}</span>`);
    R.appendChild(gl);
  }

  private renderStash() {
    const p = this.game.player;
    const L = this.leftEl;
    L.innerHTML = '';
    L.appendChild(h('h2', '', '储 物 箱'));
    this.addClose(L, 'left');
    L.appendChild(this.renderGrid('stash', p.stash));
    const gl = h('div', 'goldline');
    gl.innerHTML = `<span>储存金币：${p.stashGold}</span>`;
    const dep = h('button', 'btn', '存入全部');
    dep.onclick = () => {
      p.stashGold += p.gold;
      p.gold = 0;
      this.sfx.play('gold');
      this.dirty = true;
    };
    const wd = h('button', 'btn', '取出全部');
    wd.onclick = () => {
      p.gold += p.stashGold;
      p.stashGold = 0;
      this.sfx.play('gold');
      this.dirty = true;
    };
    const box = h('div');
    box.style.display = 'flex';
    box.style.gap = '6px';
    box.append(dep, wd);
    gl.appendChild(box);
    L.appendChild(gl);
  }

  private openCube() {
    this.left = 'cube';
    this.right = 'inv';
    this.dirty = true;
    this.sfx.play('click');
  }

  /** the Horadric Cube: its 3×4 space and the Transmute button */
  private renderCube() {
    const p = this.game.player;
    const L = this.leftEl;
    L.innerHTML = '';
    L.appendChild(h('h2', '', '赫拉迪姆魔盒'));
    this.addClose(L, 'left');
    const wrap = h('div', 'cube-wrap');
    wrap.appendChild(this.renderGrid('cube', p.cube));
    const go = h('button', 'btn cube-go', '转 化');
    go.onclick = () => {
      if (this.cursorItem) return;
      const r = transmute(p.cube, p.level);
      this.message(r.message, r.ok ? '#c8a86a' : '#ff6060', 2.5);
      this.sfx.play(r.ok ? 'socket' : 'nomana');
      this.dirty = true;
    };
    wrap.appendChild(go);
    L.appendChild(wrap);
    L.appendChild(h('div', 'goldline', '<span style="color:#8a8278;font-size:12px">放进配方所需的物品，按"转化"。Ctrl+点击在背包与魔盒间移动</span>'));
  }

  private renderShop() {
    const L = this.leftEl;
    L.innerHTML = '';
    L.appendChild(h('h2', '', '商人 · 艾莉娜'));
    this.addClose(L, 'left');
    L.appendChild(this.renderGrid('shop', this.game.shop));
    L.appendChild(h('div', 'goldline', `<span>你的金币：${this.game.player.gold}</span><span style="color:#8a8278;font-size:12px">点击购买 · 把物品放进来出售</span>`));
    // like Diablo II's repair: refill the charges on worn and carried items
    const p = this.game.player;
    const spent = p.spentCharges();
    if (spent.length) {
      const cost = spent.reduce((n, c) => n + rechargeCost(c.missing, c.lvl), 0);
      const btn = h('button', 'cube-go', `补充充能（${cost} 金币）`);
      btn.onclick = () => {
        if (p.gold < cost) return this.message('金币不够', '#ff4040', 1);
        p.gold -= cost;
        for (const c of spent) (c.item.charges ??= {})[c.param] = (c.item.charges[c.param] ?? 0) + c.missing;
        this.sfx.play('gold');
        this.message('充能已补满', '#c8a86a', 1);
        this.dirty = true;
      };
      L.appendChild(btn);
    }
  }

  private renderWaypoints() {
    const L = this.leftEl;
    L.innerHTML = '';
    L.appendChild(h('h2', '', '传 送 点'));
    this.addClose(L, 'left');
    const list = h('div', 'wplist');
    const p = this.game.player;
    for (const d of p.waypoints) {
      const name = d === 0 ? '流亡者营地' : `第 ${d} 层`;
      const w = h('div', `wp${this.game.level.depth === d ? ' cur' : ''}`, name);
      w.onclick = () => {
        if (this.game.level.depth === d) return;
        this.left = null;
        this.game.travel(d);
      };
      list.appendChild(w);
    }
    L.appendChild(list);
  }

  private addClose(el: HTMLElement, side: 'left' | 'right') {
    const close = h('button', 'close', '✕');
    close.onclick = () => {
      if (side === 'left') this.left = null;
      else this.right = null;
      this.dirty = true;
    };
    el.appendChild(close);
  }

  private renderChar() {
    const p = this.game.player;
    const d = p.stats;
    const L = this.leftEl;
    L.innerHTML = '';
    L.appendChild(h('h2', '', p.name));
    this.addClose(L, 'left');
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
      this.dirty = true;
      this.sfx.play('click');
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

  private renderSkills() {
    const p = this.game.player;
    const R = this.rightEl;
    R.innerHTML = '';
    R.appendChild(h('h2', '', '技 能'));
    this.addClose(R, 'right');
    const tabs = h('div', 'tabs');
    CLASSES[p.cls].trees.forEach((n, i) => {
      const t = h('div', `tab${i === this.skillTab ? ' on' : ''}`, n);
      t.onclick = () => {
        this.skillTab = i;
        this.dirty = true;
      };
      tabs.appendChild(t);
    });
    R.appendChild(tabs);
    const tree = h('div', 'tree');
    const skills = classSkills(p.cls).filter((s) => s.tree === this.skillTab);
    // phones lay the tree on its side, so the tree and the skill keys fit one screen
    const flat = !!this.touch;
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
    if (this.touch) R.appendChild(this.renderBindPad());
  }

  /** phones: the skill buttons as the right thumb has them; a skill tapped in the tree, then one of these, binds it */
  private renderBindPad(): HTMLElement {
    const p = this.game.player;
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
  private bindFromPanel(slot: number, skill: string | null, anchor: HTMLElement) {
    if (!skill) return this.openPicker(slot, anchor);
    const p = this.game.player;
    const def = SKILL_BY_ID[skill];
    if (!def) return;
    if (def.kind === 'passive') return this.message('被动技能学会就生效，不用装上', '#aaa', 1.6);
    if (p.skillLevel(skill) <= 0) return this.message('还没学会这个技能', '#ff6060', 1.4);
    // already on another key: the two swap
    const other = p.binds.indexOf(skill);
    if (other >= 0 && other !== slot) p.binds[other] = p.binds[slot] ?? (other === 0 ? 'attack' : null);
    p.binds[slot] = skill;
    this.sfx.play('click');
    this.message(`${def.name} 已装上`, '#c8a86a', 1.4);
    this.dirty = true;
  }

  /** the touch interact button: what's in reach to pick up or use (hidden while a panel is open) */
  private updateInteract() {
    const n = this.game.touchNear;
    const t = this.touch!;
    if (!n || this.game.player.dead || this.left || this.right) t.setInteract(null);
    else if (n.ground) t.setInteract('拾取', n.ground.item!.name, itemColor(n.ground.item!));
    else t.setInteract(USE_VERB[n.obj.kind], n.obj.name);
  }

  private learn(s: SkillDef) {
    const p = this.game.player;
    if (!p.canLearn(s)) {
      if (p.skillPoints <= 0) this.message('没有可用的技能点', '#aaa', 1.2);
      else if (p.level < s.reqLevel) this.message(`需要等级 ${s.reqLevel}`, '#ff6060', 1.2);
      else this.message('需要先学习前置技能', '#ff6060', 1.2);
      return;
    }
    const first = p.skillBase(s.id) === 0;
    p.skills[s.id] = p.skillBase(s.id) + 1;
    p.skillPoints--;
    p.markDirty();
    this.sfx.play('levelup', 0.4);
    if (first && s.kind !== 'passive') {
      const idx = p.binds.findIndex((b, i) => i >= 1 && !b);
      if (idx >= 0) {
        p.binds[idx] = s.id;
        this.message(`${s.name} 已绑定到 ${SLOT_KEYS[idx]}`, '#c8a86a', 2);
      }
    }
    this.dirty = true;
  }

  private renderHudStatic() {
    const p = this.game.player;
    // belt
    this.beltEl.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const stack = p.belt[i];
      const s = h('div', 'slot');
      if (stack.length) {
        const it = stack[0];
        s.innerHTML = `<img src="${itemIcon(it)}" /><span class="count">${stack.length > 1 ? stack.length : ''}</span>`;
        s.dataset.uid = it.uid;
        this.itemByUid.set(it.uid, it);
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
      if (!this.touch) s.onclick = () => this.openPicker(i, s);
      this.skillsEl.appendChild(s);
    }
    this.btns.char.classList.toggle('notify', p.statPoints > 0);
    this.btns.skills.classList.toggle('notify', p.skillPoints > 0);
  }

  private openPicker(slot: number, anchor: HTMLElement) {
    if (this.pickerSlot === slot) return this.closePicker();
    this.pickerSlot = slot;
    const p = this.game.player;
    const el = this.pickerEl;
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
        this.closePicker();
        this.dirty = true;
        this.sfx.play('click');
      };
      el.appendChild(s);
    }
    const clear = h('div', 'slot', '<span style="font-size:11px;color:#888">清空</span>');
    clear.onclick = () => {
      p.binds[slot] = slot === 0 ? 'attack' : null;
      this.closePicker();
      this.dirty = true;
    };
    el.appendChild(clear);
    const r = anchor.getBoundingClientRect();
    el.classList.add('open');
    el.style.left = `${Math.max(8, r.left - 100)}px`;
  }

  private closePicker() {
    this.pickerSlot = -1;
    this.pickerEl.classList.remove('open');
  }

  private renderPanels() {
    this.itemByUid.clear();
    this.leftEl.classList.toggle('open', !!this.left);
    this.rightEl.classList.toggle('open', !!this.right);
    // phones: the bag or the skills on their own spread out to one screen (equipment beside the bag,
    // the skill keys beside the tree); beside another panel the bag comes first, as that's what goes
    // back and forth with a stash or a shop
    this.rightEl.classList.toggle('inv', this.right === 'inv');
    this.rightEl.classList.toggle('skillsp', this.right === 'skills');
    this.rightEl.classList.toggle('wide', !!this.touch && (this.right === 'inv' || this.right === 'skills') && !this.left);
    switch (this.left) {
      case 'char':
        this.renderChar();
        break;
      case 'stash':
        this.renderStash();
        break;
      case 'shop':
        this.renderShop();
        break;
      case 'waypoint':
        this.renderWaypoints();
        break;
      case 'cube':
        this.renderCube();
        break;
    }
    if (this.right === 'inv') this.renderInventory();
    else if (this.right === 'skills') this.renderSkills();
    this.renderHudStatic();
    // cursor item
    if (this.cursorItem) {
      const b = baseOf(this.cursorItem);
      this.cursorEl.style.display = 'block';
      this.cursorEl.style.width = `${b.w * CELL}px`;
      this.cursorEl.style.height = `${b.h * CELL}px`;
      this.cursorEl.innerHTML = `<img src="${itemIcon(this.cursorItem)}" />`;
    } else this.cursorEl.style.display = 'none';
  }

  // ─────────────────────────── per-frame ───────────────────────────
  update(dt: number) {
    const g = this.game;
    if (this.settings.showFps) {
      this.fpsFrames++;
      this.fpsTime += dt;
      if (this.fpsTime >= 0.5) {
        this.fpsEl.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS · 渲染 ${Math.round(this.renderer.renderScale * 100)}%`;
        this.fpsFrames = 0;
        this.fpsTime = 0;
      }
    }
    if (!g.started) {
      this.vignette.style.background = '';
      return;
    }
    const p = g.player;
    if (this.touch) this.updateInteract();
    // close shop/stash when walking away
    if ((this.left === 'shop' || this.left === 'stash' || this.left === 'waypoint') && g.level) {
      const kind = this.left === 'shop' ? 'vendor' : this.left;
      const o = g.level.objects.find((x) => x.kind === kind);
      if (!o || Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 4) {
        this.left = null;
        this.dirty = true;
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.renderPanels();
    }
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
      const mods = [...(m.def.undead ? ['亡灵'] : []), ...m.mods.map((x) => MOD_NAMES[x])];
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

    // vignette (light radius)
    const r = this.renderer;
    const ps = r.playerScreen;
    const town = g.level.depth === 0;
    const radius = (town ? 10 : 7 + d.lightRadius * 0.7) * r.pxPerUnit;
    const a = town ? 0.4 : 0.85;
    this.vignette.style.background = `radial-gradient(circle at ${ps.x}px ${ps.y}px, rgba(0,0,0,0) ${radius * 0.55}px, rgba(0,0,0,${a * 0.6}) ${radius}px, rgba(0,0,0,${a}) ${radius * 1.6}px)`;

    // drop a stale tooltip when the element under the cursor went away (panel closed, item moved)
    if (this.tooltipEl.style.display === 'block') {
      const under = document.elementFromPoint(this.game.input.mx, this.game.input.my) as HTMLElement | null;
      if (!under?.closest('[data-uid],[data-skill],[data-tip],.glabel')) this.hideTooltip();
    }
    this.updateLabels();
    this.updateExplored();
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.2;
      this.drawMinimap();
      if (this.automapOpen) this.drawAutomap();
    }
    this.automap.classList.toggle('open', this.automapOpen);
  }

  private updateLabels() {
    const g = this.game;
    const r = this.renderer;
    const p = g.player;
    const seen = new Set<number>();
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const items = g.level.ground
      .filter((gi) => Math.hypot(gi.pos.x - p.pos.x, gi.pos.z - p.pos.z) < 18 && gi.age > 0.35)
      .map((gi) => ({ gi, s: r.projectP(gi.pos, 0.2) }))
      .sort((a, b) => b.s.y - a.s.y);
    for (const { gi, s } of items) {
      seen.add(gi.id);
      let rec = this.labelEls.get(gi.id);
      if (!rec) {
        const el = h('div', 'glabel');
        if (gi.item) {
          el.textContent = gi.item.name;
          el.style.color = itemColor(gi.item);
        } else {
          el.textContent = `${gi.gold} 金币`;
          el.style.color = '#e8e0c0';
        }
        el.addEventListener('pointerenter', () => (this.hoverGround = gi.id));
        el.addEventListener('pointerleave', () => {
          if (this.hoverGround === gi.id) this.hoverGround = null;
        });
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (e.button !== 0 || this.cursorItem) return;
          this.sfx.ensure();
          g.player.intent = { kind: 'pickup', ground: gi };
        });
        el.addEventListener('pointermove', (e) => {
          if (gi.item) {
            const pl = g.player;
            this.showTooltip(tooltip(gi.item, { level: pl.level, str: pl.stats.str, dex: pl.stats.dex }), e.clientX, e.clientY);
          }
        });
        el.addEventListener('pointerleave', () => this.hideTooltip());
        this.labelsLayer.appendChild(el);
        rec = { el, w: el.offsetWidth, h: el.offsetHeight };
        this.labelEls.set(gi.id, rec);
      }
      let x = s.x - rec.w / 2;
      let y = s.y - rec.h - 6;
      for (let iter = 0; iter < 20; iter++) {
        const hit = placed.find((q) => x < q.x + q.w && x + rec!.w > q.x && y < q.y + q.h && y + rec!.h > q.y);
        if (!hit) break;
        y = hit.y - rec.h - 1;
      }
      placed.push({ x, y, w: rec.w, h: rec.h });
      rec.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    for (const [id, rec] of this.labelEls) {
      if (!seen.has(id)) {
        rec.el.remove();
        this.labelEls.delete(id);
        if (this.hoverGround === id) this.hoverGround = null;
      }
    }
  }

  private updateExplored() {
    const g = this.game;
    const map = g.level.map;
    const p = g.player;
    const R = 9;
    const cx = Math.floor(p.pos.x);
    const cy = Math.floor(p.pos.z);
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (!map.inBounds(x, y)) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
        map.explored[y * map.w + x] = 1;
      }
    }
  }

  private drawMapTo(ctx: CanvasRenderingContext2D, scale: number, cxW: number, cyW: number, rTiles: number, canvasW: number, canvasH: number) {
    const g = this.game;
    const map = g.level.map;
    ctx.clearRect(0, 0, canvasW, canvasH);
    const ox = canvasW / 2 - cxW * scale;
    const oy = canvasH / 2 - cyW * scale;
    const x0 = Math.max(0, Math.floor(cxW - rTiles));
    const x1 = Math.min(map.w - 1, Math.ceil(cxW + rTiles));
    const y0 = Math.max(0, Math.floor(cyW - rTiles));
    const y1 = Math.min(map.h - 1, Math.ceil(cyW + rTiles));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.w + x;
        if (!map.explored[i]) continue;
        const t = map.tiles[i];
        if (t === T_FLOOR || t === T_PROP) {
          ctx.fillStyle = t === T_PROP ? 'rgba(150,130,100,0.45)' : 'rgba(120,110,90,0.28)';
          ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        } else if (t === T_WALL) {
          ctx.fillStyle = 'rgba(200,180,140,0.85)';
          ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        }
      }
    }
    const dot = (wx: number, wz: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox + wx * scale, oy + wz * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const o of g.level.objects) {
      // the way down from the camp is always marked, explored or not
      const campExit = o.kind === 'stairs' && g.level.depth === 0;
      if (!campExit && !map.explored[Math.floor(o.pos.z) * map.w + Math.floor(o.pos.x)]) continue;
      if (campExit) {
        const k = (performance.now() / 1200) % 1;
        ctx.strokeStyle = `rgba(255, 120, 40, ${1 - k})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ox + o.pos.x * scale, oy + o.pos.z * scale, scale * (1.6 + k * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (o.kind === 'stairs') dot(o.pos.x, o.pos.z, '#ffd040', scale * 1.4);
      else if (o.kind === 'waypoint') dot(o.pos.x, o.pos.z, '#40a0ff', scale * 1.4);
      else if (o.kind === 'portal') dot(o.pos.x, o.pos.z, '#ff4040', scale * 1.2);
      else if (o.kind === 'vendor' || o.kind === 'stash') dot(o.pos.x, o.pos.z, '#40ff60', scale);
    }
    const p = g.player;
    for (const m of g.level.monsters) {
      if (m.dead || Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) > 12) continue;
      dot(m.pos.x, m.pos.z, m.rank === 'boss' || m.rank === 'unique' ? '#ffb040' : '#d02020', Math.max(1.5, scale * 0.6));
    }
    dot(p.pos.x, p.pos.z, '#ffffff', Math.max(2, scale * 0.9));
  }

  private drawMinimap() {
    const ctx = this.minimap.getContext('2d')!;
    const p = this.game.player;
    this.drawMapTo(ctx, 4, p.pos.x, p.pos.z, 32, 240, 240);
    this.minimapLabel.textContent = this.game.level.depth === 0 ? '营地' : `第 ${this.game.level.depth} 层`;
  }

  private drawAutomap() {
    const map = this.game.level.map;
    const size = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.75);
    const c = this.automapCanvas;
    if (c.width !== size) {
      c.width = size;
      c.height = size;
    }
    const scale = (size / Math.max(map.w, map.h)) * 0.95;
    this.drawMapTo(c.getContext('2d')!, scale, map.w / 2, map.h / 2, Math.max(map.w, map.h), size, size);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export { ITEM_BASES };
