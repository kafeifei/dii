import { debugOpts, saveDebugOpts } from '../game/debug';
import type { Game } from '../game/game';
import { MAX_LEVEL, xpForLevel } from '../game/player';
import { DIFFICULTIES, type Difficulty } from '../game/save';
import { EQUIPPABLE_BASES } from '../data/items';
import { rollEquipment, rollGem, rollRune, type Drop } from '../items/gen';
import { displayName, isIdentified, type Item, type Rarity } from '../items/item';
import { makeItem } from '../items/make';
import { CAMP_AREA, areaDef, areaLevel, areaList, dungeonArea, nextArea, trialFloor, type AreaDef } from '../world/areas';

type Choice<T> = [T, string];
type Action = [string, () => void];

const RARITY_NAME: Partial<Record<Rarity, string>> = { magic: '魔法', rare: '稀有', set: '套装', unique: '暗金' };
const DIFFICULTY_NAME: Record<Difficulty, string> = { 0: '普通', 1: '噩梦', 2: '地狱' };
/** how many of the trial ground's floors its list offers at least (it has no bottom) */
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
    this.actions(loot, '鉴定', [['全部鉴定', () => this.identifyAll()]], '背包、储物箱和身上未辨识的物品');

    const rate = this.group(panel, '倍率');
    this.choice(rate, '经验', [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10'], [100, '×100']] as Choice<number>[], () => debugOpts.xp, (v) => (debugOpts.xp = v), '杀怪得到的经验');
    this.choice(rate, '掉落', [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10']] as Choice<number>[], () => debugOpts.loot, (v) => (debugOpts.loot = v), '怪物和箱子的掉落重复掷几次');

    const map = this.group(panel, '地图');
    this.areaRow(map, '前往', '直接去，不激活那里的传送点');
    this.trialRow(map, '试炼场', '无尽地下城的一层，每次进都重新生成，用来试高等级的怪物和掉落');
    this.choice(map, '难度', DIFFICULTIES.map((d): Choice<Difficulty> => [d, DIFFICULTY_NAME[d]]), () => this.game.player.difficulty, (d) => this.difficulty(d), '传送点、掉落表和宝箱的物品等级按难度分开，怪物还照普通');

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
    // as a unique monster's items drop (their treasure class's quality ratios), with the hero's magic find
    const mf = this.game.player.stats.mf;
    const items = Array.from({ length: n }, () => rollEquipment(this.ilvl, { quality: 2, mf }));
    const count = (r: Rarity) => items.filter((it) => it.rarity === r).length;
    const best = (['unique', 'set', 'rare'] as Rarity[]).filter(count).map((r) => `${RARITY_NAME[r]} ${count(r)}`);
    this.drop(items, `${n} 件装备${best.length ? `（${best.join('、')}）` : ''}`);
  }

  private dropRarity(r: Rarity) {
    // made in that quality (D2's pItemDrop quality), on bases until one has a row for it: a unique
    // or set item needs one at the item level, else D2 makes it rare or magic
    const bases = EQUIPPABLE_BASES.filter((b) => b.qlvl <= this.ilvl && !b.noDrop);
    let item: Item | null = null;
    for (let i = 0; i < 400 && item?.rarity !== r; i++) {
      const b = bases[Math.floor(Math.random() * bases.length)];
      item = makeItem({ code: b.id, ilvl: this.ilvl, quality: r as Item['quality'] });
    }
    if (!item) return this.note('这个物品等级没有可以掉落的底材');
    this.drop([item], `一件${RARITY_NAME[item.rarity] ?? ''}「${displayName({ ...item, identified: true })}」`);
  }

  private identifyAll() {
    const p = this.game.player;
    const all = [...Object.values(p.equipment), ...p.inventory.items.map((x) => x.item), ...p.stash.items.map((x) => x.item)].filter((it): it is Item => !!it && !isIdentified(it));
    for (const it of all) it.identified = true;
    p.markDirty();
    this.done(`鉴定了 ${all.length} 件物品`);
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

  private trial(floor: number, d: Difficulty) {
    if (!(floor >= 1)) return this.note('没有这一层');
    this.game.enterTrial(floor, d);
    this.close();
    this.resume();
  }

  private difficulty(d: Difficulty) {
    this.game.setDifficulty(d);
    this.done(`难度：${DIFFICULTY_NAME[d]}（换成这个难度的传送点、掉落表和宝箱的物品等级，怪物不变）`);
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

  /**
   * The areas of normal play to pick from (the one the hero is in picked), a button to go, one for
   * the next (on the trial ground, its next floor)
   */
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
      sel.replaceChildren(...areaList().map((a) => new Option(a.kind === 'town' ? a.name : `${a.name} · ${areaLevel(a)} 级`, String(a.id))));
      sel.value = String(this.game.area?.id ?? CAMP_AREA);
    });
  }

  /**
   * The trial ground, the endless dungeon kept out of normal play: a floor by its area level and a
   * difficulty to pick, a button to go (a new floor each time)
   */
  private trialRow(group: HTMLElement, label: string, note: string) {
    const r = this.row(group, label, note);
    const seg = document.createElement('div');
    seg.className = 'seg';
    const floorSel = document.createElement('select');
    const diffSel = document.createElement('select');
    diffSel.replaceChildren(...DIFFICULTIES.map((d) => new Option(DIFFICULTY_NAME[d], String(d))));
    seg.append(floorSel, diffSel, this.button('进入', () => this.trial(Number(floorSel.value), Number(diffSel.value) as Difficulty)));
    r.appendChild(seg);
    this.rows.push(() => {
      // a few floors past the one the hero is on, however deep that is
      const here = trialFloor(this.game.area?.id ?? 0);
      const floors = Math.max(FLOORS, (here ?? 0) + 5);
      const opts: HTMLOptionElement[] = [];
      for (let f = 1; f <= floors; f++) opts.push(new Option(`第 ${f} 层 · ${areaLevel(areaDef(dungeonArea(f))!)} 级`, String(f)));
      const keep = floorSel.value;
      floorSel.replaceChildren(...opts);
      floorSel.value = here ? String(here) : keep || '1';
      diffSel.value = String(this.game.player.difficulty);
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
