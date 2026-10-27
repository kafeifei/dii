import { debugOpts, saveDebugOpts } from '../game/debug';
import type { Game } from '../game/game';
import { MAX_LEVEL, xpForLevel } from '../game/player';
import { DIFFICULTIES, type Difficulty } from '../game/save';
import { rollEquipment, rollGem, rollRune, type Drop } from '../items/gen';
import { displayName, type Item, type Rarity } from '../items/item';
import { CAMP_AREA, areaDef, areaLevel, areaList, nextArea, type AreaDef } from '../world/areas';

type Choice<T> = [T, string];
type Action = [string, () => void];

const RARITY_NAME: Partial<Record<Rarity, string>> = { magic: '魔法', rare: '稀有', set: '套装', unique: '暗金' };
const DIFFICULTY_NAME: Record<Difficulty, string> = { 0: '普通', 1: '噩梦', 2: '地狱' };
/** how many of the dungeon's floors the area list offers at least (it has no bottom) */
const FLOORS = 30;

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
    this.choice(loot, '物品等级', [[0, '自动'], [10, '10'], [30, '30'], [60, '60'], [99, '99']] as Choice<number>[], () => debugOpts.ilvl, (v) => (debugOpts.ilvl = v), '自动取角色等级和区域等级里高的');
    this.actions(loot, '随机装备', [['1 件', () => this.dropGear(1)], ['5 件', () => this.dropGear(5)], ['20 件', () => this.dropGear(20)]], '掉在脚下');
    this.actions(loot, '指定品质', (['magic', 'rare', 'set', 'unique'] as Rarity[]).map((r): Action => [RARITY_NAME[r]!, () => this.dropRarity(r)]));
    this.actions(loot, '符文和宝石', [['符文 ×3', () => this.dropRunes()], ['宝石 ×3', () => this.dropGems()]]);

    const rate = this.group(panel, '倍率');
    this.choice(rate, '经验', [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10'], [100, '×100']] as Choice<number>[], () => debugOpts.xp, (v) => (debugOpts.xp = v), '杀怪得到的经验');
    this.choice(rate, '掉落', [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10']] as Choice<number>[], () => debugOpts.loot, (v) => (debugOpts.loot = v), '怪物和箱子的掉落重复掷几次');

    const map = this.group(panel, '地图');
    this.areaRow(map, '前往', '只激活到达区域的传送点');
    this.choice(map, '难度', DIFFICULTIES.map((d): Choice<Difficulty> => [d, DIFFICULTY_NAME[d]]), () => this.game.player.difficulty, (d) => this.difficulty(d), '传送点按难度分开，怪物和掉落还照普通');

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

  /** the level loot is rolled at: the panel's override, or the higher of the hero's and the area's */
  private get ilvl() {
    if (debugOpts.ilvl > 0) return Math.min(99, Math.round(debugOpts.ilvl));
    const p = this.game.player;
    return Math.max(p.level, this.game.level?.alvlAt(p.pos) ?? 1);
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
    this.drop([item], `一件${RARITY_NAME[item.rarity] ?? ''}「${displayName(item)}」`);
  }

  private dropRunes() {
    this.drop(Array.from({ length: 3 }, () => rollRune(this.ilvl)), '3 个符文');
  }

  private dropGems() {
    // flawless and perfect ones mostly
    this.drop(Array.from({ length: 3 }, () => rollGem(Math.random() < 0.6 ? 3 : 4)), '3 颗宝石');
  }

  private go(area: AreaDef | undefined) {
    if (!area) return this.note('没有这块区域');
    // a list from an older build, or an area this one has no map of yet
    if (!this.game.travelToArea(area.id)) return this.note(`这个版本还没有「${area.name}」的地图`);
    this.close();
    this.resume();
  }

  private difficulty(d: Difficulty) {
    this.game.setDifficulty(d);
    this.done(`难度：${DIFFICULTY_NAME[d]}（换成这个难度的传送点，怪物和掉落不变）`);
  }

  private done(text: string) {
    this.game.save();
    this.changed();
    this.note(text);
    this.refresh();
  }

  private note(text: string) {
    const p = this.game.player;
    const a = this.game.area;
    const status = `${p.name} · ${p.level} 级 · ${a ? (a.label ?? a.name) : '-'} · ${DIFFICULTY_NAME[p.difficulty]} · 金币 ${p.gold}`;
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

  private button(text: string, fn: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = text;
    b.onclick = () => {
      this.game.sfx.play('ui.click');
      fn();
    };
    return b;
  }

  private actions(group: HTMLElement, label: string, acts: Action[], note?: string) {
    const r = this.row(group, label, note);
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [text, fn] of acts) seg.appendChild(this.button(text, fn));
    r.appendChild(seg);
  }

  /** the areas from the camp down to pick from (the one the hero is in picked), a button to go, one for the next */
  private areaRow(group: HTMLElement, label: string, note: string) {
    const r = this.row(group, label, note);
    const seg = document.createElement('div');
    seg.className = 'seg';
    const sel = document.createElement('select');
    seg.append(
      sel,
      this.button('去', () => this.go(areaDef(Number(sel.value)))),
      this.button('下一个', () => this.go(this.game.area ? nextArea(this.game.area) : undefined)),
    );
    r.appendChild(seg);
    this.rows.push(() => {
      // a few floors past the one the hero is on, however deep that is
      const floors = Math.max(FLOORS, (this.game.level?.floor ?? 0) + 5);
      sel.replaceChildren(...areaList(floors).map((a) => new Option(a.kind === 'town' ? a.name : `${a.name} · ${areaLevel(a)} 级`, String(a.id))));
      sel.value = String(this.game.area?.id ?? CAMP_AREA);
    });
  }

  private choice<T>(group: HTMLElement, label: string, opts: Choice<T>[], get: () => T, set: (v: T) => void, note?: string) {
    const r = this.row(group, label, note);
    const seg = document.createElement('div');
    seg.className = 'seg';
    const btns = opts.map(([v, text]) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => {
        this.game.sfx.play('ui.click');
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
