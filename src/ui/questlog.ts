import { ACT1_QUESTS, type QuestKey } from '../data/quests';
import type { LogState } from '../game/quests/quest';
import { QFLAG, setQuestState } from '../game/quests/record';
import { addClose, escapeHtml, h, type UIContext } from './common';
import { questIcon } from './icons';

/** what each state says under the quest's name */
const STATE_LABEL: Record<LogState, string> = { off: '尚未开放', none: '尚未接到', active: '进行中', reward: '待领赏', done: '已完成' };

/** the quest picked in the log; unset, the first under way */
let picked: QuestKey | null = null;
/** the quests the log shows done for the first time as it opens, which flare as it is drawn (once) */
let fresh = new Set<QuestKey>();

/**
 * The log opens: the quests it shows done for the first time are marked seen, as D2's client tells
 * the server once it has played a quest's completion (QFLAG_UPDATEQUESTLOG, PlrMsg.cpp:3665-3679)
 */
export function openQuestLog(ui: UIContext) {
  const g = ui.game;
  const rec = g.player.quests[g.player.difficulty];
  fresh = new Set(g.quests.unseen());
  for (const k of fresh) setQuestState(rec, k, QFLAG.UPDATEQUESTLOG);
  if (fresh.size) picked = [...fresh][0];
  ui.questNews = false;
}

/**
 * Diablo II's quest log: the act's six quests as pictures, in the order the log lays them out, and
 * what the one picked is at (Game.quests.log). Only this build's quests (the Den of Evil) move on;
 * the rest show as not open yet.
 */
export function renderQuestLog(ui: UIContext, L: HTMLElement) {
  const g = ui.game;
  L.innerHTML = '';
  L.appendChild(h('h2', '', '任 务'));
  addClose(ui, L, 'left');
  const tabs = h('div', 'tabs');
  tabs.appendChild(h('div', 'tab on', '第一幕'));
  L.appendChild(tabs);
  const entries = ACT1_QUESTS.map((q) => ({ q, e: g.quests.log(q.key) }));
  if (!picked || !entries.some((x) => x.q.key === picked)) picked = (entries.find((x) => x.e.state === 'active' || x.e.state === 'reward') ?? entries[0]).q.key;
  const grid = h('div', 'qgrid');
  for (const { q, e } of entries) {
    const cell = h('div', `qcell ${e.state}${q.key === picked ? ' on' : ''}${fresh.has(q.key) ? ' fresh' : ''}`);
    cell.dataset.quest = q.key;
    cell.innerHTML = `<div class="qicon"><img src="${questIcon(q.icon)}" alt="" /></div><div class="qname">${escapeHtml(q.name)}</div>`;
    cell.onclick = () => {
      picked = q.key;
      ui.sfx.play('ui.click');
      ui.dirty = true;
    };
    grid.appendChild(cell);
  }
  L.appendChild(grid);
  fresh = new Set();
  const sel = entries.find((x) => x.q.key === picked)!;
  const detail = h('div', `qdetail ${sel.e.state}`);
  detail.innerHTML = `<div class="qtitle">${escapeHtml(sel.q.name)}</div><div class="qstate">${STATE_LABEL[sel.e.state]}</div><div class="qtext">${escapeHtml(sel.e.text)}</div>`;
  L.appendChild(detail);
  const d = g.player.difficulty;
  L.appendChild(h('div', 'qfoot', `${['普通', '噩梦', '地狱'][d]}难度`));
}
