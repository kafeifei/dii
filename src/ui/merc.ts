// The hireling's own panel (M2a's M line, docs/M2A-STEP0.md 2.12): her name, level, experience, life,
// numbers and skills, and her helm, armour and bow to put on and take off with the cursor (src/game/
// merc.ts handToMerc, takeFromMerc: each move one item between the cursor and a slot, the hero saved
// at once); a potion on the cursor given to her is drunk (D2: PlrMsg.cpp:3916-3923). Her portrait at
// the top left shows her life and opens the panel (O, as D2R's hireling screen).
import { D2X_SKILLS } from '../data/d2x/skills';
import { nextXp, type MercSlot } from '../game/d2/hireling';
import type { Game } from '../game/game';
import { MERC_SLOTS, Merc, handToMerc, mercKind, mercName, shownResists, takeFromMerc } from '../game/merc';
import { addClose, escapeHtml, h, type UIContext } from './common';
import { itemImg } from './itempics';

const SLOT_LABEL: Record<MercSlot, string> = { head: '头部', body: '身体', weapon: '弓' };

/** her as the panel reads her numbers: on the map, or made from what the hero keeps of her */
function shown(g: Game): Merc | null {
  const st = g.player.merc;
  if (!st || st.raw !== undefined) return null;
  if (g.merc && g.merc.kept === st) return g.merc;
  return new Merc({ x: 0, z: 0 }, st);
}

/** the hireling's panel (UI.openPanel('merc'), her portrait, O) */
export function renderMerc(ui: UIContext, L: HTMLElement) {
  const g = ui.game;
  const st = g.player.merc;
  L.innerHTML = '';
  L.appendChild(h('h2', '', '佣 兵'));
  addClose(ui, L, 'left');
  if (!st) {
    L.appendChild(h('div', 'pending-note', '你还没有佣兵：营地里的柯霞那里可以雇佣'));
    return;
  }
  const m = shown(g);
  if (!m) {
    L.appendChild(h('div', 'pending-note', '这个佣兵来自更新的版本，这里只原样留着她'));
    return;
  }
  const head = h('div', 'merc-head');
  head.innerHTML = `<div class="mh-name">${escapeHtml(mercName(st))}</div><div class="mh-sub">${escapeHtml(mercKind(st))} · ${st.level} 级${st.dead ? ' · <span class="mh-dead">已倒下（到柯霞那里复活）</span>' : ''}</div>`;
  L.appendChild(head);

  // her three slots, with the cursor's item lit where it would go
  const doll = h('div', 'merc-doll');
  for (const slot of MERC_SLOTS) {
    const it = st.equipment[slot];
    const s = h('div', `eqslot merc-slot ${it ? it.rarity : ''}`);
    s.dataset.slot = slot;
    if (it) {
      s.innerHTML = itemImg(it);
      s.dataset.uid = it.uid;
      s.dataset.src = 'merc';
      ui.itemByUid.set(it.uid, it);
    } else s.innerHTML = `<span class="ph">${SLOT_LABEL[slot]}</span>`;
    if (ui.cursorItem) s.classList.add('hl');
    s.addEventListener('pointerdown', (e) => onSlotDown(ui, slot, e));
    doll.appendChild(s);
  }
  L.appendChild(doll);
  L.appendChild(h('div', 'merc-hint', ui.touch ? '拿起物品后点她的格子给她穿上；药水点上去她会喝掉' : '把物品放到她的格子上给她穿上，点格子取下；药水放上去她会喝掉 · Shift+1–4 把腰带里的药水给她'));

  const [fire, cold, light, poison] = shownResists(g, m);
  const next = nextXp(st.hire, st.level);
  const pct = m.dmgPct + m.aura.dmgPct;
  const lo = Math.floor(m.dmg[0] * (1 + pct / 100)) + m.arrowAdd[0];
  const hi = Math.floor(m.dmg[1] * (1 + pct / 100)) + m.arrowAdd[1];
  const rows: [string, string][] = [
    ['经验', next ? `${st.xp} / ${next}` : `${st.xp}`],
    ['生命', `${Math.ceil(m.life)} / ${m.maxLife}`],
    ['力量', String(m.str)],
    ['敏捷', String(m.dex)],
    ['防御', String(m.defense)],
    ['命中', String(m.ar)],
    ['伤害', `${lo}–${hi}`],
    ['火焰抗性', `${fire}%`],
    ['冰冷抗性', `${cold}%`],
    ['闪电抗性', `${light}%`],
    ['毒素抗性', `${poison}%`],
  ];
  const sheet = h('div', 'merc-sheet');
  for (const [k, v] of rows) sheet.appendChild(h('div', 'ms-row', `<span>${k}</span><span>${escapeHtml(v)}</span>`));
  L.appendChild(sheet);
  const sk = h('div', 'merc-skills');
  sk.appendChild(h('div', 'ms-title', '技能'));
  for (const s of m.skills) sk.appendChild(h('div', 'ms-row', `<span>${escapeHtml(D2X_SKILLS[s.skill]?.name ?? s.skill)}</span><span>${s.level} 级${m.auraOn === s.skill ? ' · 开着' : ''}</span>`));
  L.appendChild(sk);
}

/** a slot clicked: the cursor's item handed to her (worn there, or drunk), else what she wears there taken onto the cursor */
function onSlotDown(ui: UIContext, slot: MercSlot, e: PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
  const g = ui.game;
  const c = ui.cursorItem;
  if (c) {
    const r = handToMerc(g, c);
    if (r.refused) ui.message(r.refused, '#ff8060', 2);
    ui.cursorItem = r.cursor;
  } else {
    const r = takeFromMerc(g, slot);
    if (r.refused) ui.message(r.refused, '#ff8060', 2);
    if (r.item) ui.cursorItem = r.item;
  }
  ui.tooltip.hide();
  ui.dirty = true;
}

/** her portrait at the top left: her name and life, while the hero has her; a click opens her panel */
export class MercPortrait {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private name: HTMLElement;
  private shownFor: unknown = null;

  constructor(
    private ui: UIContext & { left: UIContext['left'] },
    root: HTMLElement,
  ) {
    this.el = h('div', 'ui-block');
    this.el.id = 'merc-portrait';
    this.el.title = '佣兵 (O)';
    this.name = h('div', 'mp-name');
    const bar = h('div', 'mp-bar');
    this.fill = h('div');
    bar.appendChild(this.fill);
    this.el.append(this.name, bar);
    this.el.onclick = () => toggleMercPanel(this.ui);
    root.appendChild(this.el);
  }

  update() {
    const g = this.ui.game;
    const st = g.started ? g.player.merc : null;
    const on = !!st && st.raw === undefined;
    this.el.classList.toggle('open', on);
    if (!on) return;
    if (this.shownFor !== st) {
      this.shownFor = st;
      this.name.textContent = mercName(st);
    }
    const m = g.merc && g.merc.kept === st ? g.merc : null;
    const share = st.dead ? 0 : m ? Math.max(0, m.life / m.maxLife) : 1;
    this.fill.style.width = `${share * 100}%`;
    this.el.classList.toggle('dead', st.dead);
    this.el.classList.toggle('poison', !!m && m.poisonTime > 0);
  }
}

/** her panel opened, the bag beside it (or shut, if it's open) */
export function toggleMercPanel(ui: UIContext) {
  if (ui.left === 'merc') {
    ui.left = null;
    ui.sfx.play('ui.close');
  } else {
    ui.left = 'merc';
    ui.right = 'inv';
    ui.sfx.play('ui.open');
  }
  ui.dirty = true;
}
