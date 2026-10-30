// Kashya's hirelings (M2a's M line, docs/M2A-STEP0.md 2.12): her list of Rogue Scouts on offer, their
// levels, prices and what they can do (src/game/merc.ts offers, d2/hireling.ts hireOffer), hiring one,
// and, for one already hired, a question first that says what becomes of the last one's gear (it goes
// back to the hero: the bag, then the personal stash, then beside the stash; docs/M2A.md 佣兵和任务);
// a fallen one raised again for her price.
import { D2X_MONSTERS } from '../data/d2x/monsters';
import { D2X_SKILLS } from '../data/d2x/skills';
import { bandAt, mercSkills, mercStats, HIRE_MIN_LEVEL } from '../game/d2/hireling';
import { MERC_SLOTS, hire, mayHireNow, mercKind, mercName, offers, raiseCost, resurrect, type Offer } from '../game/merc';
import { QUEST_BY_KEY } from '../data/quests';
import { addClose, escapeHtml, h, type UIContext } from './common';

const KASHYA = D2X_MONSTERS.kashya.name;

/** the name asked about: hiring her lets the hireling the hero has go (the question up until answered) */
let asking: number | null = null;

/** what a skill is called in her list: ours (tools/d2-names) */
const skillName = (id: string) => D2X_SKILLS[id]?.name ?? id;

/** the hire panel (UI.openPanel('hire'), from her menu's 雇佣) */
export function renderHire(ui: UIContext, L: HTMLElement) {
  const g = ui.game;
  const p = g.player;
  L.innerHTML = '';
  L.appendChild(h('h2', '', '雇 佣'));
  addClose(ui, L, 'left');
  const head = h('div', 'hire-note');
  head.textContent = `${KASHYA}：这些斥候愿意跟你走。`;
  L.appendChild(head);
  L.appendChild(h('div', 'hire-gold', `金币：背包 ${p.gold} · 储物箱 ${p.stashGold}（先从背包付，不够再从储物箱付）`));

  const st = p.merc;
  // her fallen one first: raised for her price (D2's 复活 at Kashya)
  const cost = raiseCost(g);
  if (st && cost !== null) {
    const box = h('div', 'hire-raise');
    box.appendChild(h('div', '', `${escapeHtml(mercName(st))}（${st.level} 级）倒下了。复活要 ${cost} 金币。`));
    const b = h('button', 'btn', `复活（${cost} 金币）`);
    b.disabled = p.gold + p.stashGold < cost;
    b.onclick = () => {
      if (resurrect(g)) {
        ui.sfx.play('ui.coins');
        ui.dirty = true;
      } else ui.sfx.play('ui.no_gold');
    };
    box.appendChild(b);
    L.appendChild(box);
  }
  if (st?.raw !== undefined) L.appendChild(h('div', 'hire-warn', '你现在的佣兵来自更新的版本：这个版本不能替换她，她和她的装备都原样留着。'));

  if (!mayHireNow(g)) {
    L.appendChild(h('div', 'pending-note', `要到 ${HIRE_MIN_LEVEL} 级才能雇佣（完成「${QUEST_BY_KEY.a1q2.name}」以后也可以）`));
    return;
  }
  const list = h('div', 'wplist hire-list');
  for (const o of offers(g)) list.appendChild(offerRow(ui, o));
  L.appendChild(list);

  if (asking !== null) {
    const o = offers(g).find((x) => x.entry.name === asking);
    if (!o || !st) asking = null;
    else L.appendChild(askBox(ui, o));
  }
}

/**
 * What D2's hire list shows of her (MONSTERS_HirelingInit, D2Common Monsters.cpp:110-170): life,
 * strength and dexterity (the /Lvl columns in eighths, >> 3), her armour class without her dexterity's
 * share, damage, and her band's resistance as it stands in the table, not levelled
 */
function listed(id: number, level: number) {
  const s = mercStats(id, level);
  return { life: s.life, str: s.str, dex: s.dex, def: s.def, dmg: s.dmg, res: bandAt(id, level).resist[0] };
}

/** one name on offer: who, her level, price, what the list shows of her, her skills, and her button */
function offerRow(ui: UIContext, o: Offer): HTMLElement {
  const g = ui.game;
  const p = g.player;
  const s = listed(o.offer.id, o.offer.level);
  const skills = mercSkills(o.offer.id, o.offer.level).map((k) => `${skillName(k.skill)} ${k.level}`);
  const row = h('div', `wp hire-row${asking === o.entry.name ? ' cur' : ''}`);
  const short = p.gold + p.stashGold < o.offer.price;
  row.innerHTML =
    `<div class="hr-head"><span class="hr-name">${escapeHtml(o.name)}</span><span class="hr-price${short ? ' short' : ''}">${o.offer.price} 金币</span></div>` +
    `<div class="hr-sub">${o.offer.level} 级 · ${o.offer.element === 'fire' ? '火焰' : '冰冷'} · 生命 ${s.life} · 力量 ${s.str} · 敏捷 ${s.dex}</div>` +
    `<div class="hr-sub">防御 ${s.def} · 伤害 ${s.dmg[0]}–${s.dmg[1]} · 抗性 ${s.res}</div>` +
    `<div class="hr-sub">${escapeHtml(skills.join('、'))}</div>`;
  row.dataset.name = String(o.entry.name);
  row.onclick = () => {
    ui.sfx.play('ui.click');
    if (short) {
      ui.sfx.play('ui.no_gold');
      ui.message('金币不够', '#ff8060', 2);
      return;
    }
    // one already hired (dead or alive): ask first, saying where her gear goes
    if (p.merc) {
      asking = o.entry.name;
      ui.dirty = true;
      return;
    }
    doHire(ui, o.entry.name);
  };
  return row;
}

/** hiring `name`: done, the hireling's panel up; or why not */
function doHire(ui: UIContext, name: number) {
  const r = hire(ui.game, name);
  asking = null;
  if (!r.ok) {
    ui.sfx.play('ui.no_gold');
    const say = { level: '还不能雇佣', gold: '金币不够', gone: '她已经不在名单上了', unreadable: '你现在的佣兵来自更新的版本，不能替换' }[r.why];
    ui.message(say, '#ff8060', 3);
    ui.dirty = true;
    return;
  }
  const back = r.returned;
  if (back.length) {
    const where = { bag: '背包', stash: '个人储物箱', beside: '储物箱旁边' };
    const counts = (['bag', 'stash', 'beside'] as const).map((k) => [k, back.filter((x) => x.home === k).length] as const).filter(([, n]) => n);
    ui.message(`上一个佣兵的 ${back.length} 件装备还给了你：${counts.map(([k, n]) => `${where[k]} ${n} 件`).join('，')}`, '#c8a86a', 5);
  }
  ui.left = 'merc';
  ui.right = 'inv';
  ui.dirty = true;
}

/** the question before letting the hero's hireling go: what becomes of her and her gear, counted */
function askBox(ui: UIContext, o: Offer): HTMLElement {
  const st = ui.game.player.merc!;
  const gear = MERC_SLOTS.filter((s) => st.equipment[s]).length;
  const box = h('div', 'hire-ask');
  const who = `${escapeHtml(mercName(st))}（${escapeHtml(mercKind(st))}，${st.level} 级${st.dead ? '，已倒下' : ''}）`;
  box.innerHTML =
    `<div>雇佣${escapeHtml(o.name)}（${o.offer.price} 金币）会解雇${who}。</div>` +
    (gear
      ? `<div>她身上的 ${gear} 件装备会还给你：先放进背包，放不下的放进个人储物箱，再放不下的放在营地储物箱旁边。</div>`
      : '<div>她身上没有装备。</div>');
  const bar = h('div', 'rift-actions');
  const yes = h('button', 'btn hire-yes', '确定雇佣');
  yes.onclick = () => doHire(ui, o.entry.name);
  const no = h('button', 'btn hire-no', '取消');
  no.onclick = () => {
    asking = null;
    ui.sfx.play('ui.close');
    ui.dirty = true;
  };
  bar.append(yes, no);
  box.appendChild(bar);
  return box;
}

/** the question let go (the panel shut, the hero gone from the camp) */
export function dropHireQuestion() {
  asking = null;
}
