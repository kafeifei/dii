import { debugOpts, saveDebugOpts, type DropOpts } from '../game/debug';
import type { Game } from '../game/game';
import { MAX_LEVEL, xpForLevel } from '../game/player';
import { DIFFICULTIES, type Difficulty } from '../game/save';
import { debugLoot, lootKindOf, takesQuality, type LootKind, type LootQuality } from '../items/debugloot';
import { createItem, isGold, type Drop } from '../items/gen';
import { displayName, isIdentified, type Item, type Rarity } from '../items/item';
import { tomeMax } from '../items/tomes';
import { CAMP_AREA, areaDef, areaLevel, areaList, dungeonArea, nextArea, trialFloor, type AreaDef } from '../world/areas';

type Choice<T> = [T, string];
type Action = [string, () => void];

const KINDS: Choice<LootKind>[] = [
  ['weapon', '武器'], ['helm', '头盔'], ['body', '盔甲'], ['shield', '盾牌'], ['gloves', '手套'], ['boots', '靴子'], ['belt', '腰带'],
  ['ring', '戒指'], ['amulet', '项链'], ['charm', '神符'], ['jewel', '珠宝'], ['gold', '金币'], ['rune', '符文'], ['gem', '宝石'],
];
const KIND_NAME = Object.fromEntries(KINDS) as Record<LootKind, string>;
const GEAR = KINDS.map(([k]) => k).filter((k) => takesQuality(k) && k !== 'charm' && k !== 'jewel');
const QUALITIES: Choice<LootQuality>[] = [['normal', '普通'], ['magic', '魔法'], ['rare', '稀有'], ['set', '套装'], ['unique', '传奇']];
/** the qualities as the summary counts them: white is one */
const RARITY_NAME: Partial<Record<Rarity, string>> = { low: '普通', normal: '普通', superior: '普通', magic: '魔法', rare: '稀有', set: '套装', unique: '传奇' };
const SOCKETS: Choice<number>[] = [[0, '不打'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']];
const MAX_COUNT = 50;
const DIFFICULTY_NAME: Record<Difficulty, string> = { 0: '普通', 1: '噩梦', 2: '地狱' };
/** how many of the trial ground's floors its list offers at least (it has no bottom) */
const FLOORS = 30;
/** how often the status line is brought up to date, in seconds */
const STATUS_EVERY = 0.25;

/**
 * The debug panel (the ` key, or the pause menu's 调试): on the left of the screen while the game
 * plays on, folded to a tab when it isn't wanted, under the character sheet and the other left-hand
 * panels. Levels, gold and loot for the real character, the cheats in src/game/debug.ts, area jumps.
 * Loot lands at the hero's feet; everything is saved with the character. Its buttons never take the
 * keyboard's focus and its sliders and lists let it go, so the game's keys go on working.
 */
export class DebugPanel {
  readonly el: HTMLElement;
  private rows: (() => void)[] = [];
  private groupsEl: HTMLElement;
  private statusEl: HTMLElement;
  private noteEl: HTMLElement;
  private live = false;
  private status = '';
  private statusIn = 0;
  private areaShown: number | undefined;

  constructor(
    private game: Game,
    /** after a change the HUD and panels should show */
    private changed: () => void,
  ) {
    const el = document.createElement('div');
    el.className = 'debug-dock ui-block';
    el.innerHTML = `<button class="dbg-tab" title="展开（\` 键）">调试 ▸</button><div class="dbg-body"><div class="dbg-head"><span>调 试</span><button class="dbg-fold" title="收起（\` 键）">◂</button></div><div class="dbg-status"></div><div class="dbg-groups"></div><div class="dbg-note"></div></div>`;
    (el.querySelector('.dbg-tab') as HTMLButtonElement).onclick = () => this.toggle(true);
    (el.querySelector('.dbg-fold') as HTMLButtonElement).onclick = () => this.toggle(false);
    // a click keeps the focus where it was: Space and Enter go to the game, not the button again
    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button, summary')) e.preventDefault();
    });
    this.groupsEl = el.querySelector('.dbg-groups') as HTMLElement;
    this.statusEl = el.querySelector('.dbg-status') as HTMLElement;
    this.noteEl = el.querySelector('.dbg-note') as HTMLElement;
    this.el = el;
    this.cleanDrop();

    const loot = this.group('掉落');
    this.levelRange(loot);
    this.chips(this.row(loot, '类型', undefined, [['全选', () => this.setKinds(KINDS.map(([k]) => k))], ['装备', () => this.setKinds(GEAR)], ['清空', () => this.setKinds([])]]), KINDS, () => debugOpts.drop.kinds, (v) => (debugOpts.drop.kinds = v));
    this.chips(this.row(loot, '品质', '都不选：照原版的品质掉率随机，算上魔法装备几率'), QUALITIES, () => debugOpts.drop.qualities, (v) => (debugOpts.drop.qualities = v));
    this.toggles(this.row(loot, '其他', '无形只出在有耐久的武器和护甲上，套装不会无形'), [
      ['无形', () => debugOpts.drop.ethereal, (v) => (debugOpts.drop.ethereal = v)],
      ['已鉴定', () => debugOpts.drop.identified, (v) => (debugOpts.drop.identified = v)],
    ]);
    this.choice(this.row(loot, '打孔', '打到底材在这个物品等级能有的最多为止'), SOCKETS, () => debugOpts.drop.sockets, (v) => (debugOpts.drop.sockets = v));
    this.countRow(loot);
    this.actions(this.row(loot, '鉴定', '背包、储物箱和身上未辨识的物品'), [['全部鉴定', () => this.identifyAll()]]);
    this.actions(this.row(loot, '卷轴之书', '满的一本；捡起时背包里有同种没满的，就补进那本'), [['城镇传送', () => this.dropTome('tbk')], ['鉴定', () => this.dropTome('ibk')]]);

    const me = this.group('角色');
    this.actions(this.row(me, '等级', '每级照常给 5 个属性点、1 个技能点'), [['+1', () => this.levels(1)], ['+5', () => this.levels(5)], ['+10', () => this.levels(10)], ['+30', () => this.levels(30)]]);
    this.actions(this.row(me, '金币'), [['+1 万', () => this.gold(1e4)], ['+10 万', () => this.gold(1e5)]]);
    this.choice(this.row(me, '无敌', '生命掉到 0 时直接回满'), [[true, '开'], [false, '关']] as Choice<boolean>[], () => debugOpts.god, (v) => (debugOpts.god = v));

    const rate = this.group('倍率');
    this.choice(this.row(rate, '经验', '杀怪得到的经验'), [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10'], [100, '×100']] as Choice<number>[], () => debugOpts.xp, (v) => (debugOpts.xp = v));
    this.choice(this.row(rate, '掉落', '怪物和箱子的掉落重复掷几次'), [[1, '×1'], [2, '×2'], [5, '×5'], [10, '×10']] as Choice<number>[], () => debugOpts.loot, (v) => (debugOpts.loot = v));

    const map = this.group('地图');
    this.areaRow(this.row(map, '前往', '直接去，不激活那里的传送点'));
    this.trialRow(this.row(map, '试炼场', '无尽地下城的一层，每次进都重新生成'));
    this.choice(this.row(map, '难度', '换难度就是换一局：地图重新生成，从营地出发'), DIFFICULTIES.map((d): Choice<Difficulty> => [d, DIFFICULTY_NAME[d]]), () => this.game.player.difficulty, (d) => this.difficulty(d));

    el.classList.toggle('folded', !debugOpts.shown);
  }

  get shown() {
    return debugOpts.shown;
  }

  /** open it on the left of the screen, or fold it to its tab (flip it with no argument) */
  toggle(open = !debugOpts.shown) {
    this.game.sfx.play('ui.click');
    debugOpts.shown = open;
    saveDebugOpts();
    this.el.classList.toggle('folded', !open);
    if (open) {
      this.statusIn = 0;
      this.refresh();
    }
  }

  /** each frame: there while a game is on; open, its status line and area list kept up */
  update(dt: number) {
    const live = this.game.started;
    if (live !== this.live) {
      this.live = live;
      this.el.classList.toggle('live', live);
      if (live) this.refresh();
    }
    if (!live || !debugOpts.shown || (this.statusIn -= dt) > 0) return;
    this.statusIn = STATUS_EVERY;
    const s = this.statusText();
    if (s !== this.status) this.statusEl.textContent = this.status = s;
    if (this.game.area?.id !== this.areaShown) this.refresh();
  }

  /** the hero's level, or the area's where it is higher: the loot's item level by default before the range */
  private get hereLevel() {
    const p = this.game.player;
    return Math.min(99, Math.max(p.level, this.game.level?.alvlAt(p.pos) ?? 1));
  }

  /** what the browser kept, from an older build or edited by hand, made what the drop can take */
  private cleanDrop() {
    const o = debugOpts.drop;
    const lvl = (v: unknown, d: number) => (Number.isFinite(v) ? Math.max(1, Math.min(99, Math.round(v as number))) : d);
    o.lo = lvl(o.lo, 1);
    o.hi = Math.max(o.lo, lvl(o.hi, 99));
    const known = <T>(list: unknown, opts: Choice<T>[]) => (Array.isArray(list) ? opts.map(([v]) => v).filter((v) => list.includes(v)) : []);
    o.kinds = known(o.kinds, KINDS);
    o.qualities = known(o.qualities, QUALITIES);
    o.sockets = SOCKETS.some(([v]) => v === o.sockets) ? o.sockets : 0;
    o.count = Math.max(1, Math.min(MAX_COUNT, Math.round(Number(o.count)) || 1));
    o.ethereal = !!o.ethereal;
    o.identified = !!o.identified;
    if (!Array.isArray(debugOpts.folded)) debugOpts.folded = [];
  }

  // ─────────────────────────── what the buttons do ───────────────────────────

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

  private drop(items: Item[]) {
    const drops: Drop[] = items.map((item) => ({ kind: 'item', item }));
    this.game.spawnDrops(this.game.player.pos, drops);
  }

  /** the loot row's items at the hero's feet, and what came of them */
  private dropLoot() {
    const o: DropOpts = debugOpts.drop;
    if (!o.kinds.length) return this.note('先选要掉的类型');
    const p = this.game.player;
    const r = debugLoot({ ...o, difficulty: p.difficulty, mf: p.stats.mf }, o.count);
    if (r.items.length) this.drop(r.items);
    // the range kept on one line (word joiners round the dash)
    const levels = o.lo === o.hi ? `物品等级 ${o.lo}` : `物品等级 ${o.lo}\u2060–\u2060${o.hi}`;
    const one = r.items.length === 1 ? r.items[0] : null;
    const what = !one
      ? `${r.items.length} 件：${this.tally(r.items)}`
      : isGold(one)
        ? `${one.qty} 金币`
        : `一件${this.sortOf(one)}「${displayName({ ...one, identified: true })}」`;
    const lines = [r.items.length ? `掉在脚下了，${what}（${levels}）` : `什么也没掉（${levels}）`];
    if (r.missed.length) {
      const kinds = [...new Set(r.missed)].map((k) => KIND_NAME[k]).join('、');
      lines.push(`${r.missed.length} 件没掉成：${kinds}在这些条件下没有能做的底材`);
    }
    if (r.unused.length) {
      const names = r.unused.map((q) => QUALITIES.find(([v]) => v === q)![1]).join('、');
      lines.push(`选的类型做不出${names}${o.ethereal && r.unused.includes('set') ? '（套装不会是无形的）' : ''}`);
    }
    this.done(lines.join('\n'));
  }

  /** "传奇 3 · 稀有 2 · 符文 1": gear by its quality, the rest by its kind */
  private tally(items: Item[]): string {
    const n = new Map<string, number>();
    for (const it of items) {
      const name = this.sortOf(it);
      n.set(name, (n.get(name) ?? 0) + 1);
    }
    return [...n].map(([name, c]) => `${name} ${c}`).join(' · ');
  }

  /** what the summary counts an item as: gear by its quality, gold, runes and gems by their kind */
  private sortOf(it: Item): string {
    const k = lootKindOf(it);
    return !k ? '' : takesQuality(k) ? (RARITY_NAME[it.rarity] ?? '') : KIND_NAME[k];
  }

  private identifyAll() {
    const p = this.game.player;
    const all = [...Object.values(p.equipment), ...p.inventory.items.map((x) => x.item), ...p.stash.items.map((x) => x.item)].filter((it): it is Item => !!it && !isIdentified(it));
    for (const it of all) it.identified = true;
    p.markDirty();
    this.done(`鉴定了 ${all.length} 件物品`);
  }

  /** a tome of `code` with all the charges it holds */
  private dropTome(code: string) {
    const tome = createItem(code);
    tome.qty = tomeMax(tome);
    this.drop([tome]);
    this.done(`一本满的${displayName(tome)}掉在脚下了`);
  }

  private go(area: AreaDef | undefined) {
    if (!area) return this.note('没有这块区域');
    // a list from an older build, or an area this one has no map of yet
    if (!this.game.travelToArea(area.id)) return this.note(`这个版本还没有「${area.name}」的地图`);
    this.done(`到了「${area.name}」`);
  }

  private trial(floor: number, d: Difficulty) {
    if (!(floor >= 1)) return this.note('没有这一层');
    this.game.enterTrial(floor, d);
    this.done(`试炼场第 ${floor} 层（${DIFFICULTY_NAME[d]}）`);
  }

  private difficulty(d: Difficulty) {
    this.game.setDifficulty(d);
    this.done(`难度：${DIFFICULTY_NAME[d]}（新开一局，回到营地；传送点、掉落表、宝箱和怪物都换成这个难度的）`);
  }

  private done(text: string) {
    this.game.save();
    this.changed();
    this.note(text);
    this.refresh();
  }

  private note(text: string) {
    this.noteEl.textContent = text;
    this.statusIn = 0;
  }

  private statusText() {
    const p = this.game.player;
    const a = this.game.area;
    return `${p.name} · ${p.level} 级 · ${a ? (a.label ?? a.name) : '-'} · ${DIFFICULTY_NAME[p.difficulty]} · 金币 ${p.gold}`;
  }

  private refresh() {
    this.areaShown = this.game.area?.id;
    for (const r of this.rows) r();
  }

  private setKinds(kinds: LootKind[]) {
    debugOpts.drop.kinds = kinds;
    saveDebugOpts();
    this.refresh();
  }

  // ─────────────────────────── building ───────────────────────────

  /** a group with its title, folded shut as it was last left */
  private group(title: string): HTMLElement {
    const g = document.createElement('details');
    g.className = 'dbg-group';
    g.open = !debugOpts.folded.includes(title);
    g.innerHTML = '<summary></summary>';
    g.querySelector('summary')!.textContent = title;
    g.addEventListener('toggle', () => {
      debugOpts.folded = debugOpts.folded.filter((t) => t !== title).concat(g.open ? [] : [title]);
      saveDebugOpts();
    });
    this.groupsEl.appendChild(g);
    return g;
  }

  /** a row: its name, a note under it, small buttons by the name; returns where its controls go */
  private row(group: HTMLElement, label: string, note?: string, side: Action[] = []): HTMLElement {
    const r = document.createElement('div');
    r.className = 'dbg-row';
    r.innerHTML = `<div class="dbg-label"><span></span></div>${note ? '<small></small>' : ''}<div class="dbg-ctl"></div>`;
    r.querySelector('span')!.textContent = label;
    if (note) r.querySelector('small')!.textContent = note;
    const head = r.querySelector('.dbg-label')!;
    for (const [text, fn] of side) {
      const b = this.button(text, fn);
      b.className = 'dbg-side';
      head.appendChild(b);
    }
    group.appendChild(r);
    return r.querySelector('.dbg-ctl') as HTMLElement;
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

  private actions(ctl: HTMLElement, acts: Action[]) {
    for (const [text, fn] of acts) ctl.appendChild(this.button(text, fn));
  }

  /** one of the options, the picked one lit */
  private choice<T>(ctl: HTMLElement, opts: Choice<T>[], get: () => T, set: (v: T) => void) {
    const btns = opts.map(([v, text]) =>
      ctl.appendChild(
        this.button(text, () => {
          set(v);
          saveDebugOpts();
          this.refresh();
        }),
      ),
    );
    this.rows.push(() => btns.forEach((b, i) => b.classList.toggle('on', opts[i][0] === get())));
  }

  /** any of the options, each lit while picked */
  private chips<T>(ctl: HTMLElement, opts: Choice<T>[], get: () => readonly T[], set: (v: T[]) => void) {
    const btns = opts.map(([v, text]) =>
      ctl.appendChild(
        this.button(text, () => {
          const now = get();
          set(now.includes(v) ? now.filter((x) => x !== v) : opts.map(([o]) => o).filter((o) => o === v || now.includes(o)));
          saveDebugOpts();
          this.refresh();
        }),
      ),
    );
    this.rows.push(() => btns.forEach((b, i) => b.classList.toggle('on', get().includes(opts[i][0]))));
  }

  /** switches, each on or off */
  private toggles(ctl: HTMLElement, opts: [string, () => boolean, (v: boolean) => void][]) {
    const btns = opts.map(([text, get, set]) =>
      ctl.appendChild(
        this.button(text, () => {
          set(!get());
          saveDebugOpts();
          this.refresh();
        }),
      ),
    );
    this.rows.push(() => btns.forEach((b, i) => b.classList.toggle('on', opts[i][1]())));
  }

  /** a slider that lets the keyboard go when let go of, so the game's keys aren't its */
  private slider(min: number, max: number, cls: string): HTMLInputElement {
    const s = document.createElement('input');
    s.type = 'range';
    s.min = String(min);
    s.max = String(max);
    s.className = cls;
    s.addEventListener('change', () => {
      saveDebugOpts();
      s.blur();
    });
    return s;
  }

  /** the item levels: two handles on one slider, low and high, and a button for the hero's own */
  private levelRange(group: HTMLElement) {
    const ctl = this.row(group, '物品等级', undefined, [['按角色', () => this.setLevels(this.hereLevel, this.hereLevel)], ['不限', () => this.setLevels(1, 99)]]);
    const track = document.createElement('div');
    track.className = 'dbg-range';
    track.innerHTML = '<div class="track"></div><div class="fill"></div>';
    const lo = this.slider(1, 99, 'lo');
    const hi = this.slider(1, 99, 'hi');
    track.append(lo, hi);
    const val = document.createElement('span');
    val.className = 'dbg-val';
    ctl.append(track, val);
    const o = debugOpts.drop;
    const paint = () => {
      track.style.setProperty('--a', String((o.lo - 1) / 98));
      track.style.setProperty('--b', String((o.hi - 1) / 98));
      // both handles at one end: the one that can still move goes on top
      lo.classList.toggle('top', o.lo === o.hi && o.lo > 50);
      val.textContent = o.lo === o.hi ? `${o.lo}` : `${o.lo}–${o.hi}`;
    };
    lo.addEventListener('input', () => {
      o.lo = Number(lo.value);
      if (o.lo > o.hi) hi.value = String((o.hi = o.lo));
      paint();
    });
    hi.addEventListener('input', () => {
      o.hi = Number(hi.value);
      if (o.hi < o.lo) lo.value = String((o.lo = o.hi));
      paint();
    });
    this.rows.push(() => {
      lo.value = String(o.lo);
      hi.value = String(o.hi);
      paint();
    });
  }

  private setLevels(lo: number, hi: number) {
    debugOpts.drop.lo = lo;
    debugOpts.drop.hi = hi;
    saveDebugOpts();
    this.refresh();
  }

  /** how many, and the button that drops them */
  private countRow(group: HTMLElement) {
    const ctl = this.row(group, '数量');
    const s = this.slider(1, MAX_COUNT, 'dbg-count');
    const go = this.button('', () => this.dropLoot());
    go.className = 'dbg-go';
    ctl.append(s, go);
    const o = debugOpts.drop;
    const paint = () => (go.textContent = `掉落 ${o.count} 件`);
    s.addEventListener('input', () => {
      o.count = Number(s.value);
      paint();
    });
    this.rows.push(() => {
      s.value = String(o.count);
      paint();
    });
  }

  /** a list that lets the keyboard go once picked from */
  private select(): HTMLSelectElement {
    const sel = document.createElement('select');
    sel.addEventListener('change', () => sel.blur());
    return sel;
  }

  /**
   * The areas of normal play to pick from (the one the hero is in picked), a button to go, one for
   * the next (on the trial ground, its next floor)
   */
  private areaRow(ctl: HTMLElement) {
    const sel = this.select();
    ctl.append(
      sel,
      this.button('去', () => this.go(areaDef(Number(sel.value)))),
      this.button('下一个', () => this.go(this.game.area ? nextArea(this.game.area) : undefined)),
    );
    this.rows.push(() => {
      sel.replaceChildren(...areaList().map((a) => new Option(a.kind === 'town' ? a.name : `${a.name} · ${areaLevel(a)} 级`, String(a.id))));
      sel.value = String(this.game.area?.id ?? CAMP_AREA);
    });
  }

  /**
   * The trial ground, the endless dungeon kept out of normal play: a floor by its area level and a
   * difficulty to pick, a button to go (a new floor each time)
   */
  private trialRow(ctl: HTMLElement) {
    const floorSel = this.select();
    const diffSel = this.select();
    diffSel.replaceChildren(...DIFFICULTIES.map((d) => new Option(DIFFICULTY_NAME[d], String(d))));
    ctl.append(floorSel, diffSel, this.button('进入', () => this.trial(Number(floorSel.value), Number(diffSel.value) as Difficulty)));
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
}
