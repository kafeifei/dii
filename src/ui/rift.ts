import type { Game } from '../game/game';
import { RIFT_TIERS, DIFFICULTY_NAMES, areaRow, guardianName, tierLabel } from '../world/rift';
import { addClose, escapeHtml, h, type UIContext } from './common';

// The rifts' faces (src/game/rift.ts): the obelisk's panel, on the left as the waypoint's is, and
// the open rift's progress at the top left while the hero is on its floors.

/** the tier picked in the panel, kept while the page is open */
let picked = 0;

/** the obelisk's panel: the tiers, the open ones to pick from, and the open rift's state */
export function renderRift(ui: UIContext, L: HTMLElement) {
  const rifts = ui.game.rift;
  L.innerHTML = '';
  L.appendChild(h('h2', '', '秘 境'));
  addClose(ui, L, 'left');
  const open = rifts.openTiers();
  const run = rifts.run;
  if (!picked || picked > open) picked = open;

  const note = h('div', 'rift-note');
  note.textContent = run
    ? `开着的秘境：${tierLabel(run.tier)}${run.done ? '（已完成）' : ''}。从方碑旁边的门进去。`
    : '每一层复刻第一幕的一段，层数就是难度，和角色等级无关。打死这一层的镇守者，开放下一层。';
  L.appendChild(note);

  const list = h('div', 'wplist rift-list');
  for (const t of RIFT_TIERS) {
    const locked = t.n > open;
    const row = h('div', `wp rift-tier${t.n === picked ? ' cur' : ''}${locked ? ' locked' : ''}`);
    const where = t.segment.areas.map((id) => areaRow(id).name).filter((n, i, all) => all.indexOf(n) === i);
    row.innerHTML = `<div class="rt-head">第 ${t.n} 层 · ${DIFFICULTY_NAMES[t.difficulty]}</div><div class="rt-sub">${escapeHtml(where.slice(0, 3).join('、'))}${where.length > 3 ? '…' : ''} · 镇守者 ${escapeHtml(guardianName(t))}</div>`;
    if (!locked) {
      row.onclick = () => {
        picked = t.n;
        ui.sfx.play('ui.click');
        ui.dirty = true;
      };
    }
    list.appendChild(row);
  }
  L.appendChild(list);

  const bar = h('div', 'rift-actions');
  const go = h('button', 'btn', run ? `重开第 ${picked} 层` : `开启第 ${picked} 层`);
  go.onclick = () => {
    const left = rifts.itemsLeft();
    if (run && left && !confirm(`开着的秘境地上还有 ${left} 件物品没捡，重开会让它们消失。继续吗？`)) return;
    if (rifts.begin(picked)) {
      ui.left = null;
      ui.dirty = true;
    }
  };
  bar.appendChild(go);
  if (run) {
    const shut = h('button', 'btn', '关闭秘境');
    shut.onclick = () => {
      const left = rifts.itemsLeft();
      if (left && !confirm(`秘境地上还有 ${left} 件物品没捡，关闭后会消失。继续吗？`)) return;
      rifts.close();
      ui.dirty = true;
    };
    bar.appendChild(shut);
  }
  L.appendChild(bar);
  // the picked tier in view
  list.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
}

/** the open rift's progress, at the top left while the hero is on one of its floors */
export class RiftBar {
  readonly el: HTMLElement;
  private title: HTMLElement;
  private fill: HTMLElement;
  private note: HTMLElement;
  private shown = '';

  constructor(
    private readonly game: Game,
    root: HTMLElement,
  ) {
    this.el = h('div');
    this.el.id = 'rift-bar';
    this.title = h('div', 'rb-title');
    const bar = h('div', 'rb-bar');
    this.fill = h('div');
    bar.appendChild(this.fill);
    this.note = h('div', 'rb-note');
    this.el.append(this.title, bar, this.note);
    root.appendChild(this.el);
  }

  update() {
    const rifts = this.game.rift;
    const run = rifts.run;
    const floor = rifts.floorHere();
    const on = !!run && floor > 0;
    this.el.classList.toggle('open', on);
    if (!run || !on) return;
    const pct = Math.round((100 * run.progress) / run.needed);
    const g = run.guardian;
    const note = run.done
      ? '秘境完成：从镇守者倒下处的门离开'
      : g
        ? `镇守者 · ${guardianName(run.tier)}`
        : rifts.floorFull()
          ? `进度 ${pct}% · 这一层够了，往下走`
          : `进度 ${pct}%`;
    const key = `${run.tier.n}|${floor}|${pct}|${note}`;
    if (key === this.shown) return;
    this.shown = key;
    this.title.textContent = `秘境 第 ${run.tier.n} 层 · ${DIFFICULTY_NAMES[run.tier.difficulty]} · ${floor}/${run.floors.length}`;
    this.fill.style.width = `${pct}%`;
    this.fill.classList.toggle('full', pct >= 100);
    this.note.textContent = note;
  }
}
