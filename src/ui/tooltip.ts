import { SKILL_BY_ID } from '../data/skills';
import { CHARGE_PREFIX } from '../game/player';
import { isSocketFiller } from '../items/d2/sockets';
import { baseOf, canSocket, displayName, tooltip, type TooltipLine } from '../items/item';
import { fillableTome, isBookScroll, tomeRoom } from '../items/tomes';
import { buyPrice, repairCost, sellPrice } from '../items/vendor';
import { escapeHtml, h, type UIContext } from './common';
import { isRepairing } from './inventory';

/** the tooltip by the pointer: items, skills, and anything with a data-tip */
export class Tooltip {
  readonly el: HTMLElement;
  /** the skill under the pointer, which Q/W/E/R bind */
  hoverSkill: string | null = null;

  constructor(private ui: UIContext) {
    this.el = h('div');
    this.el.id = 'tooltip';
  }

  /** the pointer moved: the tooltip of whatever it's over */
  pointerMove(e: PointerEvent) {
    const ui = this.ui;
    const t = e.target as HTMLElement;
    const holder = t.closest?.('[data-uid],[data-skill],[data-tip]') as HTMLElement | null;
    if (!holder) {
      this.hide();
      this.hoverSkill = null;
      return;
    }
    if (holder.dataset.skill) {
      this.hoverSkill = holder.dataset.skill;
      this.showSkill(holder.dataset.skill, e.clientX, e.clientY);
      return;
    }
    this.hoverSkill = null;
    if (holder.dataset.tip) {
      this.show([{ text: holder.dataset.tip }], e.clientX, e.clientY);
      return;
    }
    const item = ui.itemByUid.get(holder.dataset.uid!);
    if (!item) return this.hide();
    if (ui.cursorItem && holder.dataset.src !== 'shop') {
      if (baseOf(item).type === 'cube') return this.show([{ text: '放进魔盒', color: '#c8a86a' }], e.clientX, e.clientY);
      // still show the target's tooltip when socketing
      if (!(isSocketFiller(ui.cursorItem) && canSocket(item))) return this.hide();
    }
    const p = ui.game.player;
    const ctx = p.tradeCtx();
    const src = holder.dataset.src;
    let price: string | string[] | undefined;
    if (src === 'shop') {
      const each = buyPrice(ui.game.shop, item, ctx);
      // a scroll for a tome in the bag with room goes into it; shift + right-click fills it (vendor.ts buyIntoTome)
      const tome = isBookScroll(item) ? fillableTome(p.inventory, item) : undefined;
      price = tome
        ? [`购买价格：${each} 金币（放进背包里的${displayName(tome)}）`, `${ui.touch ? '长按' : 'Shift+右键'}补满：${tomeRoom(tome)} 张，${tomeRoom(tome) * each} 金币`]
        : `购买价格：${each} 金币`;
    } else if (ui.left === 'shop' && isRepairing() && (src === 'inv' || src === 'eq')) {
      const c = repairCost(item, ctx);
      price = c ? `修理价格：${c} 金币` : item.eth ? '无形物品无法修理' : '不需要修理';
    } else if (ui.left === 'shop' && src === 'inv') {
      price = baseOf(item).noSell ? '商人不收这件物品' : `出售价格：${sellPrice(ui.game.shop, item, ctx)} 金币（${ui.touch ? '拿起后放进商店出售' : 'Ctrl+点击出售'}）`;
    } else if (ui.left === 'stash' && src === 'inv' && ui.stashPage > 0 && !ui.game.shared.readOnly) {
      // a quest item, beside a shared page (D2R's rule: src/items/stash.ts)
      price = ui.game.stashBlock(ui.stashPage, item) ?? undefined;
    }
    const worn = Object.values(p.equipment).filter((x) => !!x);
    this.show(tooltip(item, { level: p.level, str: p.stats.str, dex: p.stats.dex, cls: p.cls, worn }, price), e.clientX, e.clientY);
  }

  show(lines: TooltipLine[], x: number, y: number) {
    const el = this.el;
    if (this.ui.touch) lines = lines.map((l) => (l.text.startsWith('右键点击') ? { ...l, text: l.text.replace('右键点击', '长按') } : l));
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

  hide() {
    this.el.style.display = 'none';
  }

  /** drop a stale tooltip when the element under the cursor went away (panel closed, item moved) */
  dropStale() {
    if (this.el.style.display === 'block') {
      const under = document.elementFromPoint(this.ui.game.input.mx, this.ui.game.input.my) as HTMLElement | null;
      if (!under?.closest('[data-uid],[data-skill],[data-tip],.glabel')) this.hide();
    }
  }

  private showSkill(id: string, x: number, y: number) {
    const ui = this.ui;
    const p = ui.game.player;
    if (id === 'attack') {
      this.show([{ text: '普通攻击', color: '#c8a86a' }, { text: '用手中的武器攻击' }], x, y);
      return;
    }
    if (id.startsWith(CHARGE_PREFIX)) {
      const sid = id.slice(CHARGE_PREFIX.length);
      const c = p.chargeFor(sid);
      const def = SKILL_BY_ID[sid];
      const lines: TooltipLine[] = [{ text: `${def.name}（充能）`, color: '#c8a86a' }, { text: def.desc, small: true }];
      if (c) {
        lines.push({ text: `技能等级：${c.lvl}（来自${displayName(c.item)}）`, color: '#e8e0d0' });
        for (const l of def.describe(p.skillParams(sid, c.lvl))) lines.push({ text: l, color: '#7a7aff' });
        lines.push({ text: `剩余充能：${c.left}/${c.max}`, color: c.left > 0 ? '#6a8aff' : '#ff4040' });
      } else lines.push({ text: '没有装备带这项充能的物品', color: '#ff4040' });
      lines.push({ text: '每次施放消耗一次充能，不耗法力。找商人可以补充', small: true, color: '#888' });
      lines.push({ text: ui.touch ? '点右边的技能键装上' : '悬停时按 Q/W/E/R 绑定快捷键', small: true, color: '#888' });
      this.show(lines, x, y);
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
    if (!ui.touch) lines.push({ text: '悬停时按 Q/W/E/R 绑定快捷键', small: true, color: '#888' });
    else if (def.kind === 'passive') lines.push({ text: '再点一下学习 · 被动技能学会就生效', small: true, color: '#888' });
    else lines.push({ text: '再点一下学习 · 点右边的技能键装上', small: true, color: '#888' });
    this.show(lines, x, y);
  }
}
