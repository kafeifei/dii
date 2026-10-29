import { CLASSES, CLASS_IDS, type PlayerClass } from '../data/classes';
import { debugEnabled } from '../game/debug';
import type { Game } from '../game/game';
import { deleteSave, freeSlot, listSaves, markInGame, MAX_SLOTS, playedElsewhere, releaseHero, setSlot } from '../game/save';
import { areaDef } from '../world/areas';
import { h, type UIContext } from './common';
import { isTouchDevice } from './touch';

// The full-screen overlays: the title screen, the death screen and the pause menu.

/** the controls as a phone has them (TouchControls) */
const TOUCH_HELP = `<b>左半屏按住拖动</b> 移动 · <b>右下按钮</b> 点按或按住，打脚下有圈的敌人 · <b>点怪物</b> 锁定它<br/>
  法术按钮 <b>按住拖动</b> 手动瞄准，松手施放，拖回按钮上松手取消 · 靠近物品、宝箱、商人时出现 <b>交互按钮</b><br/>
  换技能：打开 <b>技</b>，点一个技能，再点下面的技能键 · 背包里 <b>点一下</b> 看说明，<b>再点</b> 拿起，<b>长按</b> 使用或装备 · <b>⛶</b> 全屏`;

/** the title screen: the saved characters, a new one of either class, settings, the controls */
export class TitleScreen {
  readonly el: HTMLElement;
  /** the saved characters listed again (back from a run) */
  readonly refresh: () => void;

  constructor(ui: UIContext, openSettings: () => void) {
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
        <b>1-4</b> 腰带药剂 · <b>I</b> 背包 · <b>C</b> 角色 · <b>T</b> 技能树 · <b>L</b> 任务 · <b>P</b> 回城传送门 · <b>Tab</b> 地图 · <b>滚轮</b> 缩放 · <b>Esc</b> 菜单<br/>
        背包内 <b>右键</b> 使用/装备 · <b>Ctrl+左键</b> 存取、出售或丢下 · 把符文放到有孔装备上即可镶嵌
      </div>`;
    (t.querySelector('.title-settings') as HTMLButtonElement).onclick = () => openSettings();
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
      ui.sfx.ensure();
      ui.touch?.enterFullscreen();
      if (run() === false) return;
      ui.touch?.gameStarted();
      t.classList.remove('open');
      ui.dirty = true;
    };
    const refresh = () => {
      name.value = CLASSES[cls].defaultName;
      const saves = listSaves();
      savesCol.style.display = saves.length ? '' : 'none';
      savesEl.innerHTML = '';
      for (const sv of saves) {
        const row = h('div', 'save');
        const pick = h('button', 'btn pick');
        const elsewhere = playedElsewhere(sv.slot);
        pick.innerHTML = `<b></b><span>${CLASSES[sv.cls].name} · ${sv.level} 级 · ${areaDef(sv.area)?.label ?? areaDef(sv.area)?.name ?? '营地'}${elsewhere ? ' · 正在另一个窗口里' : ''}</span>`;
        pick.querySelector('b')!.textContent = sv.name;
        pick.onclick = async () => {
          // a hero another tab plays: that tab saves it a last time and stops before it is read here
          if (playedElsewhere(sv.slot)) {
            pick.disabled = true;
            pick.querySelector('span')!.textContent = '正在从另一个窗口接过这个角色…';
            await ui.game.takeOver(sv.slot);
          }
          start(() => ui.game.continueGame(sv.slot));
        };
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
        ui.game.newGame(name.value.trim(), cls);
      });
    };
    this.el = t;
    t.classList.add('is-loading');
    this.refresh = refresh;
  }

  loadProgress(done: number, total: number) {
    const el = this.el.querySelector('.loading') as HTMLElement;
    if (done >= total) {
      this.el.classList.remove('is-loading');
      el.textContent = '';
    } else el.textContent = `载入模型 ${Math.round((done / total) * 100)}%`;
  }
}

export class DeathScreen {
  readonly el: HTMLElement;

  constructor(private game: Game) {
    const d = h('div', 'overlay ui-block');
    d.innerHTML = `<div class="death-title">你 死 了</div><div class="note"></div><div class="menu"><button class="btn">回到营地</button></div>`;
    (d.querySelector('.btn') as HTMLButtonElement).onclick = () => {
      d.classList.remove('open');
      this.game.respawn();
    };
    this.el = d;
  }

  /** the player died: this comes up a moment later, with what the death cost (Game.lastDeath) */
  open() {
    const pen = this.game.lastDeath;
    const cost = pen ? `失去 ${pen.goldLost} 金币${pen.xpLost ? `、${pen.xpLost} 点经验` : ''}。` : '';
    const left = pen?.goldDropped ? `身上剩下的 ${pen.goldDropped} 金币` : '';
    this.el.querySelector('.note')!.textContent = `你的灵魂回到了营地……${cost}装备${left ? `和${left}` : ''}留在了你倒下的地方，回去拾取尸体就能拿回。`;
    setTimeout(() => this.el.classList.add('open'), 1200);
  }
}

/** Esc's pause menu: back to the game, settings, debug (?dev), save and quit to the title */
export class PauseMenu {
  readonly el: HTMLElement;

  constructor(
    private ui: UIContext,
    title: TitleScreen,
    openSettings: () => void,
    openDebug: () => void,
    /** whoever the hero is with, left as the game is quit, before it's saved (NpcPanel.quit) */
    leave: () => void,
  ) {
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
        <b>1-4</b> 腰带药剂 · <b>I</b> 背包 · <b>C</b> 角色 · <b>T</b> 技能树 · <b>L</b> 任务 · <b>P</b> 回城 · <b>Tab</b> 地图 · <b>滚轮</b> 缩放`
        }<br/>
        光环同一时间只能开启一个 · 第 4、8、12… 层有首领 · 暗金/套装/符文掉落时会有特殊音效
      </div>`;
    (m.querySelector('.resume') as HTMLButtonElement).onclick = () => this.toggle(false);
    (m.querySelector('.open-settings') as HTMLButtonElement).onclick = () => openSettings();
    const dbg = m.querySelector('.open-debug') as HTMLButtonElement | null;
    if (dbg) dbg.onclick = () => openDebug();
    (m.querySelector('.quit') as HTMLButtonElement).onclick = () => {
      const game = this.ui.game;
      // a townsperson's line still going counts as heard for this hero and is saved with them, not
      // left under the title for the next hero's game to hear of
      leave();
      game.save();
      // nor is the quest log's news (UI.questsChanged), nor what the messages say (her reward just
      // handed over, a save that didn't go in: its badge stays up, UI.saveState): they were this
      // hero's, and would hang over the title and into the next game, their clock stopped with this one
      this.ui.questNews = false;
      this.ui.clearMessages();
      // the hero let go: another tab may open it without waiting for this one
      releaseHero();
      markInGame(false);
      game.started = false;
      game.paused = false;
      // a townsperson's line, or the hero's, doesn't follow the hero out to the title
      this.ui.sfx.hush();
      this.ui.sfx.enterArea('title');
      m.classList.remove('open');
      title.refresh();
      title.el.classList.add('open');
    };
    this.el = m;
  }

  /**
   * Open or shut it (flip it with no argument); the game is paused while it's open. Opening it saves
   * the hero, so what was played up to the menu is kept however long it stays up, even if the page
   * goes meanwhile. Shut, the game plays on, but not once another tab has the hero (Game.elsewhere)
   */
  toggle(open?: boolean) {
    const game = this.ui.game;
    const was = this.el.classList.contains('open');
    const o = open ?? !was;
    if (o && !was) game.save();
    this.el.classList.toggle('open', o);
    game.paused = o || game.elsewhere;
  }
}
