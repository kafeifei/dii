import type { Sfx } from '../audio/sfx';
import { debugEnabled } from '../game/debug';
import type { Game, GameHooks } from '../game/game';
import type { Level } from '../game/level';
import type { ObjKind } from '../game/objects';
import { baseOf, displayName, itemColor, type Item } from '../items/item';
import type { Renderer } from '../render/renderer';
import type { AreaDef } from '../world/areas';
import { Automap } from './automap';
import { renderChar } from './character';
import { h, type LeftPanel, type RightPanel, type UIContext } from './common';
import { renderCube } from './cube';
import { DebugPanel } from './debug';
import { Hud, SkillPicker } from './hud';
import { CELL, itemIcon } from './icons';
import { renderInventory } from './inventory';
import { onKey, pressButton } from './keys';
import { GroundLabels } from './labels';
import { applySettings, SettingsPanel, type Settings } from './settings';
import { renderShop, renderStash, renderWaypoints } from './shop';
import { SkillTree } from './skilltree';
import { DeathScreen, PauseMenu, TitleScreen } from './title';
import { Tooltip } from './tooltip';
import { isTouchDevice, TouchControls } from './touch';

/** what the touch interact button says it does to each kind of thing */
const USE_VERB: Record<ObjKind, string> = { chest: '打开', barrel: '打碎', stairs: '进入', waypoint: '使用', vendor: '交谈', stash: '打开', portal: '进入', exit: '前往', shrine: '触摸' };

/**
 * The HTML interface over the world, and the game's hooks into it. The HUD, the panels and the
 * overlays are built in their own modules; this keeps what they share (UIContext), says which
 * panels are open, and runs them all each frame.
 */
export class UI implements GameHooks, UIContext {
  cursorItem: Item | null = null;
  left: LeftPanel = null;
  right: RightPanel = null;
  dirty = true;
  readonly itemByUid = new Map<string, Item>();
  /** phone controls, on touch screens */
  touch: TouchControls | null = null;

  // parts (the public ones are the keys' too, src/ui/keys.ts)
  hud!: Hud;
  picker!: SkillPicker;
  tooltip!: Tooltip;
  automap!: Automap;
  menu!: PauseMenu;
  settingsPanel!: SettingsPanel;
  debugPanel: DebugPanel | null = null;
  private labels: GroundLabels;
  private skillTree: SkillTree;
  private title!: TitleScreen;
  private death!: DeathScreen;

  // elements
  private root: HTMLElement;
  private vignette: HTMLElement;
  private leftEl!: HTMLElement;
  private rightEl!: HTMLElement;
  private cursorEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(
    readonly game: Game,
    private renderer: Renderer,
    readonly sfx: Sfx,
    readonly settings: Settings,
  ) {
    this.root = document.getElementById('ui')!;
    this.labels = new GroundLabels(this, renderer, document.getElementById('labels')!);
    this.vignette = document.getElementById('vignette')!;
    this.skillTree = new SkillTree(this);
    this.build();
    if (isTouchDevice()) {
      this.touch = new TouchControls(game.input, document.getElementById('world')!, this.hud.skillsEl, this.root, {
        carrying: () => !!this.cursorItem,
        hideTooltip: () => this.tooltip.hide(),
        pickSkill: (slot, anchor) => this.picker.open(slot, anchor),
        aimable: (slot) => {
          const id = this.game.player.binds[slot] ?? (slot === 0 ? 'attack' : null);
          return !!id && this.game.aimable(id);
        },
        bindSlot: (slot, skill, anchor) => this.skillTree.bindFromPanel(slot, skill, anchor),
      });
      game.touchMode = true;
      const hint = this.touch.iosHint();
      if (hint) this.title.el.querySelector('.title-sub')!.after(h('div', 'ios-hint', hint));
      renderer.setTouchView(true);
    }
    this.applySettings();
    window.addEventListener('keydown', (e) => onKey(this, e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
  }

  // ─────────────────────────── GameHooks ───────────────────────────
  message(text: string, color?: string, dur?: number) {
    this.hud.message(text, color, dur);
  }

  openPanel(kind: 'shop' | 'stash' | 'waypoint') {
    this.left = kind;
    if (kind !== 'waypoint') this.right = 'inv';
    this.dirty = true;
    this.sfx.play('ui.click');
  }

  levelChanged(level: Level) {
    this.renderer.buildLevel(level);
    this.labels.clear();
    if (this.left === 'shop' || this.left === 'stash' || this.left === 'waypoint') this.left = null;
    this.dirty = true;
  }

  areaChanged(area: AreaDef) {
    // the area's name on the way in, as Diablo II shows it
    this.hud.message(area.name, '#d8c8a0', 3);
  }

  teleported() {
    this.renderer.snapCamera();
  }

  playerDied() {
    this.death.open();
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
    return this.labels.hovered;
  }

  levelUp() {
    this.dirty = true;
  }

  // ─────────────────────────── building ───────────────────────────
  private build() {
    const r = this.root;
    this.hud = new Hud(this, r, (k) => pressButton(this, k));
    this.automap = new Automap(this.game, r);

    this.leftEl = h('div', 'panel left ui-block');
    this.rightEl = h('div', 'panel right ui-block');
    r.append(this.leftEl, this.rightEl);

    this.picker = new SkillPicker(this);
    r.appendChild(this.picker.el);

    this.tooltip = new Tooltip(this);
    document.body.appendChild(this.tooltip.el);

    this.cursorEl = h('div');
    this.cursorEl.id = 'cursorItem';
    document.body.appendChild(this.cursorEl);

    this.fpsEl = h('div');
    this.fpsEl.id = 'fps';
    r.appendChild(this.fpsEl);

    this.title = new TitleScreen(this, () => this.openSettings());
    this.root.appendChild(this.title.el);
    this.death = new DeathScreen(this.game);
    this.root.appendChild(this.death.el);
    this.menu = new PauseMenu(
      this,
      this.title,
      () => this.openSettings(),
      () => this.openDebug(),
    );
    this.root.appendChild(this.menu.el);
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
        () => this.menu.toggle(false),
      );
      this.root.appendChild(this.debugPanel.el);
    }
  }

  private applySettings() {
    applySettings(this.settings, this.renderer, this.sfx);
    this.fpsEl.style.display = this.settings.showFps ? '' : 'none';
  }

  private openSettings() {
    this.sfx.play('ui.click');
    this.settingsPanel.open();
  }

  /** over the pause menu, so closing it leaves the game paused there */
  openDebug() {
    if (!this.debugPanel) return;
    this.sfx.play('ui.click');
    this.menu.toggle(true);
    this.debugPanel.open();
  }

  loadProgress(done: number, total: number) {
    this.title.loadProgress(done, total);
  }

  /** continue the saved run without going through the title screen */
  resume() {
    if (!this.game.continueGame()) return;
    this.touch?.gameStarted();
    this.title.el.classList.remove('open');
    this.dirty = true;
  }

  devStart() {
    const sorc = location.search.includes('sorc');
    this.game.newGame(sorc ? '测试法师' : '测试骑士', sorc ? 'sorceress' : 'paladin');
    this.touch?.gameStarted();
    this.title.el.classList.remove('open');
    this.dirty = true;
  }

  // ─────────────────────────── input ───────────────────────────
  private onPointerMove(e: PointerEvent) {
    if (this.cursorItem) {
      const b = baseOf(this.cursorItem);
      this.cursorEl.style.left = `${e.clientX - (b.w * CELL) / 2}px`;
      this.cursorEl.style.top = `${e.clientY - (b.h * CELL) / 2}px`;
    }
    this.tooltip.pointerMove(e);
  }

  /** the touch interact button: what's in reach to pick up or use (hidden while a panel is open) */
  private updateInteract() {
    const n = this.game.touchNear;
    const t = this.touch!;
    if (!n || this.game.player.dead || this.left || this.right) t.setInteract(null);
    else if (n.ground) t.setInteract('拾取', displayName(n.ground.item!), itemColor(n.ground.item!));
    else t.setInteract(USE_VERB[n.obj.kind], n.obj.name);
  }

  // ─────────────────────────── rendering ───────────────────────────
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
        renderChar(this, this.leftEl);
        break;
      case 'stash':
        renderStash(this, this.leftEl);
        break;
      case 'shop':
        renderShop(this, this.leftEl);
        break;
      case 'waypoint':
        renderWaypoints(this, this.leftEl);
        break;
      case 'cube':
        renderCube(this, this.leftEl);
        break;
    }
    if (this.right === 'inv') renderInventory(this, this.rightEl);
    else if (this.right === 'skills') this.skillTree.render(this.rightEl);
    this.hud.render();
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
    this.hud.update(dt);

    // vignette (light radius)
    const d = p.stats;
    const r = this.renderer;
    const ps = r.playerScreen;
    // under the sky the dark past the hero's light comes with the night: deepest in the wilderness
    const outdoor = !!g.level.layout.theme.outdoor;
    const day = outdoor ? 1 - r.night : 0;
    const town = g.level.inTown(p.pos);
    const dark = (outdoor ? (town ? 10 : 8 + d.lightRadius * 0.7) : 7 + d.lightRadius * 0.7) * r.pxPerUnit;
    const radius = dark + day * 9 * r.pxPerUnit;
    const a = (outdoor ? (town ? 0.4 : 0.6) : 0.85) * (1 - day * 0.8);
    this.vignette.style.background = `radial-gradient(circle at ${ps.x}px ${ps.y}px, rgba(0,0,0,0) ${radius * 0.55}px, rgba(0,0,0,${a * 0.6}) ${radius}px, rgba(0,0,0,${a}) ${radius * 1.6}px)`;

    this.tooltip.dropStale();
    this.labels.update();
    this.automap.update(dt);
  }
}

export { ITEM_BASES } from '../data/items';
