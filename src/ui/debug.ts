import { monsterLevel } from '../data/monsters';
import { debugOpts, saveDebugOpts } from '../game/debug';
import type { Game } from '../game/game';
import { MAX_LEVEL, xpForLevel } from '../game/player';
import { rollEquipment, rollGem, rollRune, type Drop } from '../items/gen';
import type { Item, Rarity } from '../items/item';

type Choice<T> = [T, string];
type Action = [string, () => void];

const RARITY_NAME: Partial<Record<Rarity, string>> = { magic: '魔法', rare: '稀有', set: '套装', unique: '暗金' };

/**
 * The debug overlay (pause menu → 调试, or the ` key): levels, gold and loot for the real
 * character, and the cheats in src/game/debug.ts. Loot lands at the player's feet; everything is
 * saved with the character.
 */
export class DebugPanel {
  readonly el: HTMLElement;
  private rows: (() => void)[] = [];
  private noteEl: HTMLElement;

  constructor(
    private game: Game,
    /** after a change the HUD and panels should show */
    private changed: () => void,
    /** close the pause menu too, back into the game */
    private resume: () => void,
  ) {
    const el = document.createElement('div');
    el.className = 'overlay settings ui-block';
    el.innerHTML = `<div class="title-sub">调 试</div><div class="settings-panel"></div><div class="debug-note"></div><div class="menu"><button class="btn back">返回</button></div>`;
    (el.querySelector('.back') as HTMLButtonElement).onclick = () => this.close();
    const panel = el.querySelector('.settings-panel') as HTMLElement;
    this.noteEl = el.querySelector('.debug-note') as HTMLElement;

    const me = this.group(panel, '角色');
    this.actions(me, '等级', [['+1', () => this.levels(1)], ['+5', () => this.levels(5)], ['+10', () => this.levels(10)], ['+30', () => this.levels(30)]], '每级照常给 5 个属性点、1 个技能点');
    this.actions(me, '金币', [['+1 万', () => this.gold(1e4)], ['+10 万', () => this.gold(1e5)]]);
    this.choice(me, '无敌', [[true, '开'], [false, '关']] as Choice<boolean>[], () => debugOpts.god, (v) => (debugOpts.god = v), '生命掉到 0 时直接回满');

    const loot = this.group(panel, '掉落');
    this.actions(loot, '随机装备', [['1 件', () => this.dropGear(1)], ['5 件', () => this.dropGear(5)], ['20 件', () => this.dropGear(20)]], '掉在脚下；物品等级取角色等级和这层怪物等级里高的');
    this.actions(loot, '指定品质', (['magic', 'rare', 'set', 'unique'] as Rarity[]).map((r): Action => [RARITY_NAME[r]!, () => this.dropRarity(r)]));
    this.actions(loot, '符文和宝石', [['符文 ×3', () => this.dropRunes()], ['宝石 ×3', () => this.dropGems()]]);

    const rate = this.group(panel, '倍率');
    this.choice(rate, '经验', [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10'], [100, '×100']] as Choice<number>[], () => debugOpts.xp, (v) => (debugOpts.xp = v), '杀怪得到的经验');
    this.choice(rate, '掉落', [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10']] as Choice<number>[], () => debugOpts.loot, (v) => (debugOpts.loot = v), '怪物和箱子的掉落重复掷几次');

    const map = this.group(panel, '地图');
    this.actions(map, '前往', [['下一层', () => this.go(this.depth + 1)], ['往下 5 层', () => this.go(this.depth + 5)], ['回营地', () => this.go(0)]], '沿途的传送点不会激活，只激活到达的那层');

    this.el = el;
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  open() {
    this.note('');
    this.refresh();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
  }

  private get depth() {
    return this.game.level?.depth ?? 0;
  }

  /** the level loot is rolled at */
  private get ilvl() {
    return Math.max(this.game.player.level, monsterLevel(Math.max(1, this.depth)));
  }

  private levels(n: number) {
    const p = this.game.player;
    if (p.level >= MAX_LEVEL) return this.note(`已经是 ${MAX_LEVEL} 级`);
    const to = Math.min(MAX_LEVEL, p.level + n);
    p.xp = Math.max(p.xp, xpForLevel(to));
    const gained = p.gainXp(0);
    this.game.celebrateLevelUp();
    this.done(`升到 ${p.level} 级：多了 ${gained * 5} 个属性点、${gained} 个技能点`);
  }

  private gold(n: number) {
    this.game.player.gold += n;
    this.done(`金币 +${n}`);
  }

  private drop(items: Item[], what: string) {
    const drops: Drop[] = items.map((item) => ({ kind: 'item', item }));
    this.game.spawnDrops(this.game.player.pos, drops);
    this.done(`${what}掉在脚下了（物品等级 ${this.ilvl}），关掉菜单去捡`);
  }

  private dropGear(n: number) {
    const items = Array.from({ length: n }, () => rollEquipment(this.ilvl, { quality: 2 }));
    const count = (r: Rarity) => items.filter((it) => it.rarity === r).length;
    const best = (['unique', 'set', 'rare'] as Rarity[]).filter(count).map((r) => `${RARITY_NAME[r]} ${count(r)}`);
    this.drop(items, `${n} 件装备${best.length ? `（${best.join('、')}）` : ''}`);
  }

  private dropRarity(r: Rarity) {
    // reroll with plenty of magic find until the quality comes up (some bases have no set or unique)
    let item = rollEquipment(this.ilvl, { mf: 1000, quality: 3 });
    for (let i = 0; i < 400 && item.rarity !== r; i++) item = rollEquipment(this.ilvl, { mf: 1000, quality: 3 });
    this.drop([item], `一件${RARITY_NAME[item.rarity] ?? ''}「${item.name}」`);
  }

  private dropRunes() {
    this.drop(Array.from({ length: 3 }, () => rollRune(this.ilvl)), '3 个符文');
  }

  private dropGems() {
    // flawless and perfect ones mostly
    this.drop(Array.from({ length: 3 }, () => rollGem(Math.random() < 0.6 ? 3 : 4)), '3 颗宝石');
  }

  private go(depth: number) {
    this.close();
    this.resume();
    this.game.travel(depth);
  }

  private done(text: string) {
    this.game.save();
    this.changed();
    this.note(text);
    this.refresh();
  }

  private note(text: string) {
    const p = this.game.player;
    const status = `${p.name} · ${p.level} 级 · 第 ${this.depth} 层 · 金币 ${p.gold}`;
    this.noteEl.textContent = text ? `${text}\n${status}` : status;
  }

  private refresh() {
    for (const r of this.rows) r();
  }

  private group(panel: HTMLElement, title: string): HTMLElement {
    const g = document.createElement('div');
    g.className = 'settings-group';
    g.innerHTML = `<h3>${title}</h3>`;
    panel.appendChild(g);
    return g;
  }

  private row(group: HTMLElement, label: string, note?: string): HTMLElement {
    const r = document.createElement('div');
    r.className = 'setting';
    r.innerHTML = `<div class="label"><span></span>${note ? '<small></small>' : ''}</div>`;
    r.querySelector('span')!.textContent = label;
    if (note) r.querySelector('small')!.textContent = note;
    group.appendChild(r);
    return r;
  }

  private actions(group: HTMLElement, label: string, acts: Action[], note?: string) {
    const r = this.row(group, label, note);
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [text, fn] of acts) {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => {
        this.game.sfx.play('click');
        fn();
      };
      seg.appendChild(b);
    }
    r.appendChild(seg);
  }

  private choice<T>(group: HTMLElement, label: string, opts: Choice<T>[], get: () => T, set: (v: T) => void, note?: string) {
    const r = this.row(group, label, note);
    const seg = document.createElement('div');
    seg.className = 'seg';
    const btns = opts.map(([v, text]) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => {
        this.game.sfx.play('click');
        set(v);
        saveDebugOpts();
        this.refresh();
      };
      seg.appendChild(b);
      return b;
    });
    r.appendChild(seg);
    this.rows.push(() => btns.forEach((b, i) => b.classList.toggle('on', opts[i][0] === get())));
  }
}
