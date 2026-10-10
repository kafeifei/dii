import type { Sfx } from '../audio/sfx';
import type { LightLevel, Renderer } from '../render/renderer';

/** player preferences, kept in this browser (not part of a save) */
export interface Settings {
  /** share of the screen's own resolution, or 'auto' (at most 1.5×, lowered when frames run long) */
  resolution: 'auto' | 0.5 | 0.75 | 1;
  /** multisampling; the WebGL context has to be made again, so it applies after a reload */
  antialias: boolean;
  lights: LightLevel;
  /** the hero light's shadows in the dungeon, the moon's in the camp */
  shadows: boolean;
  /** bloom, colour grade, ground mist and drifting specks */
  effects: boolean;
  particles: 'few' | 'many';
  showFps: boolean;
  volume: number;
  muted: boolean;
  shake: boolean;
}

type GraphicsKey = 'resolution' | 'antialias' | 'lights' | 'shadows' | 'effects' | 'particles';
export type Preset = 'low' | 'mid' | 'high';

/** the graphics settings each quality preset sets */
export const PRESETS: Record<Preset, Pick<Settings, GraphicsKey>> = {
  low: { resolution: 0.5, antialias: false, lights: 'low', shadows: false, effects: false, particles: 'few' },
  mid: { resolution: 'auto', antialias: true, lights: 'mid', shadows: true, effects: true, particles: 'many' },
  high: { resolution: 1, antialias: true, lights: 'high', shadows: true, effects: true, particles: 'many' },
};

const DEFAULTS: Settings = { ...PRESETS.mid, showFps: false, volume: 0.7, muted: false, shake: true };
const KEY = 'dii-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      const s = { ...DEFAULTS, ...saved };
      // saved before shadows and effects existed: whoever chose the light preset keeps a light load
      if (saved.shadows === undefined && saved.lights === 'low') s.shadows = s.effects = false;
      return s;
    }
  } catch {
    // storage blocked or unreadable: defaults
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage blocked: settings last for this visit
  }
}

/** which preset the graphics settings match, if any */
export function presetOf(s: Settings): Preset | null {
  return (Object.keys(PRESETS) as Preset[]).find((p) => (Object.keys(PRESETS[p]) as GraphicsKey[]).every((k) => PRESETS[p][k] === s[k])) ?? null;
}

/** put everything but antialiasing into effect */
export function applySettings(s: Settings, renderer: Renderer, sfx: Sfx) {
  renderer.setResolution(s.resolution);
  renderer.setLights(s.lights);
  renderer.setShadows(s.shadows);
  renderer.setPost(s.effects);
  renderer.fx.setParticleDensity(s.particles === 'few' ? 0.4 : 1);
  renderer.fx.shakeEnabled = s.shake;
  sfx.setVolume(s.volume);
  if (sfx.muted !== s.muted) sfx.toggleMute();
}

type Choice<T> = [T, string];

/**
 * The settings overlay (opened from the pause menu or the title). Every change applies at once and
 * is saved; antialiasing reloads the page, which drops a running game back where it was.
 */
export class SettingsPanel {
  readonly el: HTMLElement;
  private rows: (() => void)[] = [];

  constructor(
    private s: Settings,
    private apply: () => void,
    private beforeReload: () => void,
  ) {
    const el = document.createElement('div');
    el.className = 'overlay settings ui-block';
    el.innerHTML = `<div class="title-sub">设 置</div><div class="settings-panel"></div><div class="menu"><button class="btn back">返回</button></div>`;
    (el.querySelector('.back') as HTMLButtonElement).onclick = () => this.close();
    const panel = el.querySelector('.settings-panel') as HTMLElement;

    const gfx = this.group(panel, '画面');
    this.choice(gfx, '画质预设', [['low', '低'], ['mid', '中'], ['high', '高']] as Choice<Preset>[], () => presetOf(this.s), (p) => Object.assign(this.s, PRESETS[p]), '自定义');
    this.choice(gfx, '渲染分辨率', [['auto', '自动'], [0.5, '50%'], [0.75, '75%'], [1, '100%']] as Choice<Settings['resolution']>[], () => this.s.resolution, (v) => (this.s.resolution = v), undefined, '相对屏幕原生分辨率；自动最高 1.5 倍，掉帧时自己降低');
    this.choice(gfx, '抗锯齿', [[true, '开'], [false, '关']] as Choice<boolean>[], () => this.s.antialias, (v) => (this.s.antialias = v), undefined, '切换后会重新载入页面');
    this.choice(gfx, '动态光照', [['low', '低'], ['mid', '中'], ['high', '高']] as Choice<LightLevel>[], () => this.s.lights, (v) => (this.s.lights = v), undefined, '同时被火把和法术照亮的光源数');
    this.choice(gfx, '阴影', [[true, '开'], [false, '关']] as Choice<boolean>[], () => this.s.shadows, (v) => (this.s.shadows = v), undefined, '主角光源在地下城、月光在营地投下的影子');
    this.choice(gfx, '画面特效', [[true, '开'], [false, '关']] as Choice<boolean>[], () => this.s.effects, (v) => (this.s.effects = v), undefined, '泛光、调色、地面雾气和空中飘尘');
    this.choice(gfx, '粒子特效', [['few', '少'], ['many', '多']] as Choice<Settings['particles']>[], () => this.s.particles, (v) => (this.s.particles = v));
    this.choice(gfx, '显示帧率', [[true, '开'], [false, '关']] as Choice<boolean>[], () => this.s.showFps, (v) => (this.s.showFps = v));

    const audio = this.group(panel, '声音');
    this.slider(audio, '音量', () => this.s.volume, (v) => (this.s.volume = v));
    this.choice(audio, '静音', [[true, '开'], [false, '关']] as Choice<boolean>[], () => this.s.muted, (v) => (this.s.muted = v), undefined, '游戏中按 M 也可以切换');

    const other = this.group(panel, '其他');
    this.choice(other, '屏幕震动', [[true, '开'], [false, '关']] as Choice<boolean>[], () => this.s.shake, (v) => (this.s.shake = v));

    this.el = el;
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  open() {
    this.refresh();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
  }

  /** show the current values (after a change from elsewhere, like the M key) */
  refresh() {
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

  private choice<T>(group: HTMLElement, label: string, opts: Choice<T>[], get: () => T | null, set: (v: T) => void, unset?: string, note?: string) {
    const r = this.row(group, label, note);
    const seg = document.createElement('div');
    seg.className = 'seg';
    const btns = opts.map(([v, text]) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.onclick = () => {
        const aa = this.s.antialias;
        set(v);
        this.changed(aa !== this.s.antialias);
      };
      seg.appendChild(b);
      return b;
    });
    const off = unset ? document.createElement('span') : null;
    if (off) {
      off.className = 'unset';
      off.textContent = unset!;
      seg.appendChild(off);
    }
    r.appendChild(seg);
    this.rows.push(() => {
      const cur = get();
      btns.forEach((b, i) => b.classList.toggle('on', opts[i][0] === cur));
      if (off) off.style.display = cur === null ? '' : 'none';
    });
  }

  private slider(group: HTMLElement, label: string, get: () => number, set: (v: number) => void) {
    const r = this.row(group, label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.oninput = () => {
      set(+input.value / 100);
      this.changed(false);
    };
    r.appendChild(input);
    this.rows.push(() => (input.value = String(Math.round(get() * 100))));
  }

  private changed(reload: boolean) {
    saveSettings(this.s);
    if (reload) {
      this.beforeReload();
      location.reload();
      return;
    }
    this.apply();
    this.refresh();
  }
}
