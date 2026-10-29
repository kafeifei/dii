import type { Sfx } from '../audio/sfx';
import { debugEnabled } from '../game/debug';
import type { Game, GameHooks } from '../game/game';
import type { Level } from '../game/level';
import type { ObjKind, WorldObject } from '../game/objects';
import { heroClaimKey, markInGame, sharedKey } from '../game/save';
import type { Topic } from '../game/quests/quest';
import { baseOf, displayName, itemColor, type Item } from '../items/item';
import type { Renderer } from '../render/renderer';
import type { AreaDef } from '../world/areas';
import { Automap } from './automap';
import { AreaBanner } from './banner';
import { renderChar } from './character';
import { h, type LeftPanel, type RightPanel, type UIContext } from './common';
import { renderCube } from './cube';
import { DebugPanel } from './debug';
import { Hud, SkillPicker } from './hud';
import { CELL } from './icons';
import { itemImg } from './itempics';
import { dropTrade, renderInventory, startIdentify } from './inventory';
import { onKey, pressButton } from './keys';
import { GroundLabels } from './labels';
import { NpcMarks, NpcPanel } from './npc';
import { renderQuestLog } from './questlog';
import { applySettings, SettingsPanel, type Settings } from './settings';
import { renderShop, renderStash, renderWaypoints } from './shop';
import { SkillTree } from './skilltree';
import { DeathScreen, PauseMenu, TitleScreen } from './title';
import { Tooltip } from './tooltip';
import { isTouchDevice, TouchControls } from './touch';

/** what the touch interact button says it does to each kind of thing */
const USE_VERB: Record<ObjKind, string> = { chest: '打开', barrel: '打碎', stairs: '进入', waypoint: '使用', vendor: '交谈', stash: '打开', portal: '进入', exit: '前往', shrine: '触摸', corpse: '拾取' };

/**
 * The HTML interface over the world, and the game's hooks into it. The HUD, the panels and the
 * overlays are built in their own modules; this keeps what they share (UIContext), says which
 * panels are open, and runs them all each frame.
 */
export class UI implements GameHooks, UIContext {
  cursorItem: Item | null = null;
  left: LeftPanel = null;
  right: RightPanel = null;
  stashPage = 0;
  /** the stash was open when the panels were last drawn: its last change is written as it shuts */
  private stashShown = false;
  dirty = true;
  questNews = false;
  readonly itemByUid = new Map<string, Item>();
  /** phone controls, on touch screens */
  touch: TouchControls | null = null;

  // parts (the public ones are the keys' too, src/ui/keys.ts)
  hud!: Hud;
  picker!: SkillPicker;
  tooltip!: Tooltip;
  automap!: Automap;
  banner!: AreaBanner;
  menu!: PauseMenu;
  settingsPanel!: SettingsPanel;
  debugPanel: DebugPanel | null = null;
  /** a townsperson's menu and lines (src/ui/npc.ts) */
  npc!: NpcPanel;
  private marks: NpcMarks;
  private labels: GroundLabels;
  private skillTree: SkillTree;
  private title!: TitleScreen;
  private death!: DeathScreen;
  /** another tab took the hero (heroGone), and a save that didn't go in (saveState) */
  private goneEl!: HTMLElement;
  private unsavedEl!: HTMLElement;

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
    this.marks = new NpcMarks(this, renderer, document.getElementById('labels')!);
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
    window.addEventListener('storage', (e) => {
      if (!this.game.started) return;
      // another tab opened this hero: it is that tab's from now on (Game.heroClaimed)
      if (e.key !== null && e.key === heroClaimKey()) this.game.heroClaimed();
      // another tab of the game wrote the shared stash: taken in now (Game.syncShared), so an open stash shows what is there
      if (e.key === null || e.key === sharedKey()) this.game.syncShared();
    });
  }

  // ─────────────────────────── GameHooks ───────────────────────────
  message(text: string, color?: string, dur?: number) {
    this.hud.message(text, color, dur);
  }

  openPanel(kind: 'shop' | 'stash' | 'waypoint') {
    this.left = kind;
    if (kind !== 'waypoint') this.right = 'inv';
    this.dirty = true;
    this.sfx.play('ui.open');
  }

  /** a townsperson spoken to (Game.talkTo): what a quest has them say at once, then their menu */
  npcMenu(obj: WorldObject, opening: Topic | null) {
    this.npc.open(obj, opening);
  }

  /** a scroll of identify read from the belt (Game.useBelt): the identify cursor, the bag open to click in */
  identifyWith(scroll: Item) {
    this.right = 'inv';
    this.dirty = true;
    startIdentify(this, scroll);
  }

  /** a quest moved on: its news waits on the log's button, unless the log is open to show it */
  heroGone() {
    this.goneEl.classList.add('open');
    // the game here has stopped: so has whoever was speaking
    this.sfx.hush();
  }

  saveState(ok: boolean) {
    this.unsavedEl.hidden = ok;
  }

  questsChanged() {
    if (this.left !== 'quests') this.questNews = true;
    this.dirty = true;
  }

  levelChanged(level: Level) {
    this.renderer.buildLevel(level);
    this.banner.jump();
    this.labels.clear();
    this.marks.clear();
    this.npc.close(true);
    if (this.left === 'shop' || this.left === 'stash' || this.left === 'waypoint') this.left = null;
    this.dirty = true;
  }

  areaChanged(area: AreaDef, prev: AreaDef | null) {
    // the area's name on the way in, as Diablo II shows it
    this.banner.areaChanged(area, prev);
  }

  teleported() {
    this.renderer.snapCamera();
    this.banner.jump();
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
    this.banner = new AreaBanner(r);
    this.npc = new NpcPanel(this, this.renderer);
    r.appendChild(this.npc.el);

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
    // another tab took the hero: this one has saved and handed it over, and plays no more (Game.heroElsewhere)
    this.goneEl = h('div', 'overlay ui-block hero-gone');
    this.goneEl.innerHTML = `<div class="death-title gone-title">已在别处打开</div><div class="note">这个角色在另一个窗口里打开了。这里的进度已经保存，交给了那个窗口；为了不丢东西，这里的游戏已经停下。</div><div class="menu"><button class="btn">回到标题</button></div>`;
    (this.goneEl.querySelector('.btn') as HTMLButtonElement).onclick = () => {
      // to the title, not back into the game: the hero is the other tab's
      markInGame(false);
      location.reload();
    };
    this.root.appendChild(this.goneEl);
    // a save that didn't go into storage: shown until one does, since nothing done meanwhile is kept
    this.unsavedEl = h('div', 'unsaved-badge', '⚠ 未能保存：浏览器存储写入失败，此后的进度暂时不会保留');
    this.unsavedEl.hidden = true;
    this.root.appendChild(this.unsavedEl);
    this.menu = new PauseMenu(
      this,
      this.title,
      () => this.openSettings(),
      () => this.openDebug(),
      () => this.npc.quit(),
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
    // a reload mid-game: on in the same world, where the hero was
    if (!this.game.continueGame(undefined, true)) return;
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
    if (!n || this.game.player.dead || this.left || this.right || this.npc.isOpen) t.setInteract(null);
    else if (n.ground) t.setInteract('拾取', displayName(n.ground.item!), itemColor(n.ground.item!));
    else t.setInteract(USE_VERB[n.obj.kind], n.obj.name);
  }

  // ─────────────────────────── rendering ───────────────────────────
  private renderPanels() {
    this.itemByUid.clear();
    // the merchant's question goes with the shop
    if (this.left !== 'shop') dropTrade();
    this.leftEl.classList.toggle('open', !!this.left);
    this.rightEl.classList.toggle('open', !!this.right);
    // phones: the bag or the skills on their own spread out to one screen (equipment beside the bag,
    // the skill keys beside the tree); beside another panel the bag comes first, as that's what goes
    // back and forth with a stash or a shop
    this.rightEl.classList.toggle('inv', this.right === 'inv');
    this.rightEl.classList.toggle('skillsp', this.right === 'skills');
    this.rightEl.classList.toggle('wide', !!this.touch && (this.right === 'inv' || this.right === 'skills') && !this.left);
    this.leftEl.classList.toggle('stashp', this.left === 'stash');
    // shut since the last drawing: what was done in it last is written now (Game.syncShared)
    if (this.stashShown && this.left !== 'stash' && this.game.started) this.game.syncShared();
    this.stashShown = this.left === 'stash';
    switch (this.left) {
      case 'char':
        renderChar(this, this.leftEl);
        break;
      case 'stash':
        // in step with the other tabs before it is drawn, this tab's last change written (Game.syncShared)
        this.game.syncShared();
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
      case 'quests':
        renderQuestLog(this, this.leftEl);
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
      this.cursorEl.innerHTML = itemImg(this.cursorItem);
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
    this.npc.update(dt);
    if (this.touch) this.updateInteract();
    // close shop/stash when walking away
    if ((this.left === 'shop' || this.left === 'stash' || this.left === 'waypoint') && g.level) {
      const kind = this.left === 'shop' ? 'vendor' : this.left;
      // the nearest: the overworld has a waypoint in more than one area
      const near = Math.min(...g.level.objects.filter((x) => x.kind === kind).map((o) => Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z)));
      if (!(near <= 4)) {
        this.left = null;
        this.sfx.play('ui.close');
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
    this.marks.update();
    this.automap.update(dt);
    this.banner.update();
  }
}

export { ITEM_BASES } from '../data/items';
