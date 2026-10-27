import type { P2 } from '../core/math';
import { areaSound, PRIORITY, SOUNDS, type AreaId, type Bed, type SoundDef, type SoundId, type Synth } from './sounds';

/**
 * All sounds are synthesized at runtime with WebAudio — no audio assets. Game code plays them by
 * id (src/audio/sounds.ts); one with a place in the world is heard from the listener, the hero.
 */

export interface PlayOpts {
  /** where it sounds: quieter away from the listener, panned by its place on screen; without it, a UI sound */
  pos?: P2;
  /** times the id's own level (default 1) */
  vol?: number;
  /** times its pitch (default 1): the recipes scale their frequencies */
  pitch?: number;
}

/** a sound this close to the listener plays at full volume */
const NEAR = 5;
/** past this it isn't played: well off screen, near where monsters stop acting */
const FAR = 26;
/** a critical sound farther away than FAR is still heard this loud */
const CRITICAL_FLOOR = 0.35;
/** at the screen's edge, and past it: never all in one ear */
export const PAN_MAX = 0.7;
/** voices at once over every id: past this, the lowest priority gives way */
const MAX_VOICES = 24;
/** the same recipe again this soon is the same event, already sounding */
const REPEAT_GAP = 0.035;

/** what the camera shows, for panning: the renderer keeps it up to date */
export interface View {
  /** the screen's right as a direction on the ground */
  right: P2;
  /** how far the screen reaches either side of its middle, in metres along `right` */
  halfWidth: number;
}

/**
 * How loud, and how far left or right, a sound at `pos` is for a listener at `at`: panned by where
 * it is across the screen, all the way (PAN_MAX) at the edge. Without a view it isn't panned. Null
 * when it's too far to hear.
 */
export function spatial(at: P2, view: View | null, pos: P2, critical = false): { gain: number; pan: number } | null {
  const dx = pos.x - at.x;
  const dz = pos.z - at.z;
  const d = Math.hypot(dx, dz);
  let gain = d <= NEAR ? 1 : Math.max(0, (FAR - d) / (FAR - NEAR));
  if (critical) gain = Math.max(gain, CRITICAL_FLOOR);
  else if (gain <= 0) return null;
  // no view yet, or a window with no size to it
  if (!view || !(view.halfWidth > 0)) return { gain, pan: 0 };
  // the view is orthographic, so the offset along the screen's right is the offset on screen
  const sx = dx * view.right.x + dz * view.right.z;
  return { gain, pan: Math.max(-1, Math.min(1, sx / view.halfWidth)) * PAN_MAX };
}

/**
 * Each ear's level for a pan, as a balance: the near ear keeps the sound's level and only the far
 * one is turned down. So a sound in the middle is exactly as loud as a UI one, and panning never
 * makes it louder in either ear (an equal-power pan would be 3 dB down in the middle).
 */
export function earGains(pan: number): { l: number; r: number } {
  return { l: Math.min(1, 1 - pan), r: Math.min(1, 1 + pan) };
}

/** a sound playing, as the voice limits see it */
export interface VoiceInfo {
  id: SoundId;
  prio: number;
  start: number;
}

/**
 * Which playing voice a new `id` takes over: -1 when there's room, null when it loses and isn't
 * played. Past its own limit it takes over its own oldest voice; past the overall limit, the oldest
 * of the lowest priority, unless that one ranks above it. So a critical sound always plays.
 */
export function voiceToSteal(playing: readonly VoiceInfo[], id: SoundId, def: SoundDef): number | null {
  let own = -1;
  let count = 0;
  for (let i = 0; i < playing.length; i++) {
    if (playing[i].id !== id) continue;
    count++;
    if (own < 0 || playing[i].start < playing[own].start) own = i;
  }
  if (count >= (def.max ?? 3)) return own;
  if (playing.length < MAX_VOICES) return -1;
  let low = 0;
  for (let i = 1; i < playing.length; i++) {
    const v = playing[i];
    const w = playing[low];
    if (v.prio < w.prio || (v.prio === w.prio && v.start < w.start)) low = i;
  }
  return playing[low].prio <= PRIORITY[def.prio ?? 'normal'] ? low : null;
}

interface Voice extends VoiceInfo {
  end: number;
  gain: GainNode;
  /** what feeds the sound bus: its two ears merged, or its gain */
  tail: AudioNode;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private amb: { stop: () => void } | null = null;
  /** the hero's area: its bed plays, or starts with the AudioContext on the first click */
  private area: AreaId | null = null;
  /** each recipe's last start, and how loud it was */
  private lastPlay: Partial<Record<Synth, { t: number; level: number }>> = {};
  private voices: Voice[] = [];
  /** where sounds are heard from: the hero, kept up to date by the game */
  private listener: P2 = { x: 0, z: 0 };
  /** what the camera shows; until the renderer says, nothing is panned */
  private view: View | null = null;
  /** while a recipe renders: the voice its nodes go into, its pitch, and when its last node stops */
  private out!: AudioNode;
  private pitch = 1;
  private end = 0;
  volume = 0.7;
  muted = false;

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.35;
    this.ambBus.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the game may have entered an area before there was any sound (?dev, a reload into the game)
    if (this.area !== null) this.startBed(areaSound(this.area).bed);
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : v;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  private noise(t: number, dur: number, opts: { type?: BiquadFilterType; f0: number; f1?: number; q?: number; gain: number; attack?: number }) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.Q.value = opts.q ?? 1;
    f.frequency.setValueAtTime(opts.f0 * this.pitch, t);
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1 * this.pitch, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
    this.end = Math.max(this.end, t + dur + 0.05);
  }

  private tone(t: number, dur: number, opts: { type?: OscillatorType; f0: number; f1?: number; gain: number; attack?: number; detune?: number }) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.f0 * this.pitch, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1 * this.pitch, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
    this.end = Math.max(this.end, t + dur + 0.05);
  }

  /** the listener moved: sounds with a place are heard from here */
  setListener(pos: P2) {
    this.listener.x = pos.x;
    this.listener.z = pos.z;
  }

  /** the camera's view changed (zoom, window size): sounds pan by where they are on it */
  setView(right: P2, halfWidth: number) {
    this.view = { right: { x: right.x, z: right.z }, halfWidth };
  }

  play(id: SoundId, opts: PlayOpts = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const def = SOUNDS[id];
    const prio = PRIORITY[def.prio ?? 'normal'];
    const where = opts.pos ? spatial(this.listener, this.view, opts.pos, prio >= PRIORITY.critical) : null;
    if (opts.pos && !where) return;
    const level = (def.vol ?? 1) * (opts.vol ?? 1) * (where?.gain ?? 1);
    const now = ctx.currentTime;
    // rate-limit identical sounds, unless the new one is louder: a far monster's death mustn't
    // swallow a near one's in the same frame
    const last = this.lastPlay[def.synth];
    if (last && now - last.t < REPEAT_GAP && level <= last.level) return;
    this.voices = this.voices.filter((v) => {
      if (v.end > now) return true;
      v.tail.disconnect();
      return false;
    });
    const steal = voiceToSteal(this.voices, id, def);
    if (steal === null) return;
    if (steal >= 0) {
      // fade the voice it takes over, rather than cut it with a click
      const v = this.voices.splice(steal, 1)[0];
      v.gain.gain.setTargetAtTime(0, now, 0.01);
      setTimeout(() => v.tail.disconnect(), 100);
    }
    this.lastPlay[def.synth] = { t: now, level };
    const gain = ctx.createGain();
    gain.gain.value = level;
    let tail: AudioNode = gain;
    if (where) {
      // a balance (earGains), not a StereoPannerNode: that one is 3 dB down in the middle
      const { l, r } = earGains(where.pan);
      const merge = ctx.createChannelMerger(2);
      [l, r].forEach((g, ch) => {
        const ear = ctx.createGain();
        ear.gain.value = g;
        gain.connect(ear).connect(merge, 0, ch);
      });
      tail = merge;
    }
    tail.connect(this.sfxBus);
    this.out = gain;
    this.pitch = opts.pitch ?? 1;
    this.end = now;
    this.synth(def.synth, now + 0.005);
    this.voices.push({ id, prio, start: now, end: this.end, gain, tail });
  }

  private synth(name: Synth, t: number) {
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      case 'swing':
        this.noise(t, 0.18, { f0: r(600, 900), f1: r(2200, 3000), q: 1.5, gain: 0.18, attack: 0.04 });
        break;
      case 'hit':
        this.tone(t, 0.14, { type: 'sine', f0: r(140, 170), f1: 50, gain: 0.55 });
        this.noise(t, 0.09, { type: 'lowpass', f0: 1800, f1: 400, gain: 0.35 });
        break;
      case 'hitheavy':
        this.tone(t, 0.25, { type: 'sine', f0: 110, f1: 38, gain: 0.8 });
        this.noise(t, 0.16, { type: 'lowpass', f0: 2400, f1: 300, gain: 0.5 });
        this.tone(t, 0.08, { type: 'square', f0: 70, f1: 40, gain: 0.15 });
        break;
      case 'hitbone':
        this.noise(t, 0.07, { type: 'highpass', f0: 2500, gain: 0.35 });
        this.tone(t, 0.06, { type: 'triangle', f0: r(700, 900), f1: 300, gain: 0.25 });
        this.tone(t, 0.1, { type: 'sine', f0: 160, f1: 70, gain: 0.3 });
        break;
      case 'block':
        for (const f of [r(520, 560), 1410, 2230, 3170]) this.tone(t, 0.45, { type: 'sine', f0: f, gain: 0.12 });
        this.noise(t, 0.05, { type: 'highpass', f0: 3000, gain: 0.3 });
        break;
      case 'die':
        this.tone(t, 0.5, { type: 'sawtooth', f0: r(180, 220), f1: 60, gain: 0.16, attack: 0.02 });
        this.noise(t, 0.4, { type: 'lowpass', f0: 900, f1: 200, gain: 0.2, attack: 0.02 });
        break;
      case 'diebone':
        for (let i = 0; i < 5; i++) {
          this.noise(t + i * r(0.03, 0.06), 0.05, { type: 'highpass', f0: r(2000, 4000), gain: 0.25 });
          this.tone(t + i * 0.05, 0.05, { type: 'triangle', f0: r(500, 1100), gain: 0.12 });
        }
        break;
      case 'impdie':
        this.tone(t, 0.3, { type: 'sawtooth', f0: r(700, 900), f1: 250, gain: 0.12, attack: 0.01 });
        this.tone(t, 0.3, { type: 'square', f0: r(1000, 1300), f1: 400, gain: 0.05, attack: 0.01 });
        break;
      case 'hurt':
        this.tone(t, 0.22, { type: 'sawtooth', f0: r(120, 140), f1: 85, gain: 0.18, attack: 0.01 });
        this.noise(t, 0.12, { type: 'bandpass', f0: 700, q: 3, gain: 0.15 });
        break;
      case 'gold':
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.035, 0.18, { type: 'triangle', f0: r(2400, 3600), gain: 0.07 });
        break;
      case 'drop':
        this.tone(t, 0.12, { type: 'sine', f0: 220, f1: 110, gain: 0.25 });
        this.noise(t, 0.06, { type: 'lowpass', f0: 1200, gain: 0.2 });
        break;
      case 'dropunique':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, 0.9, { type: 'triangle', f0: f, gain: 0.12, attack: 0.01 }));
        this.tone(t, 1.4, { type: 'sine', f0: 130, gain: 0.15, attack: 0.05 });
        break;
      case 'droprune':
        [392, 587, 784].forEach((f, i) => this.tone(t + i * 0.06, 0.7, { type: 'sine', f0: f, gain: 0.12 }));
        break;
      case 'pickup':
        this.noise(t, 0.08, { type: 'bandpass', f0: 1200, q: 2, gain: 0.2 });
        this.tone(t, 0.07, { type: 'triangle', f0: 600, f1: 900, gain: 0.08 });
        break;
      case 'equip':
        this.noise(t, 0.12, { type: 'bandpass', f0: 2600, q: 4, gain: 0.25 });
        this.tone(t, 0.2, { type: 'sine', f0: 900, gain: 0.08 });
        this.tone(t + 0.03, 0.25, { type: 'sine', f0: 1350, gain: 0.06 });
        break;
      case 'socket':
        this.tone(t, 0.4, { type: 'sine', f0: 660, f1: 990, gain: 0.15 });
        this.noise(t, 0.1, { type: 'highpass', f0: 3000, gain: 0.15 });
        break;
      case 'potion':
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.09, 0.08, { type: 'sine', f0: r(180, 260), f1: r(300, 400), gain: 0.25 });
        break;
      case 'levelup':
        [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.07, 1.2, { type: 'triangle', f0: f, gain: 0.09, attack: 0.02 }));
        this.noise(t, 1.2, { type: 'highpass', f0: 5000, gain: 0.05, attack: 0.3 });
        break;
      case 'fire':
        this.noise(t, 0.5, { type: 'lowpass', f0: 400, f1: 1600, q: 0.7, gain: 0.35, attack: 0.05 });
        this.noise(t + 0.05, 0.4, { type: 'bandpass', f0: 3000, q: 0.5, gain: 0.08 });
        break;
      case 'cold':
        for (let i = 0; i < 6; i++) this.tone(t + i * 0.025, 0.4, { type: 'sine', f0: r(2500, 5000), gain: 0.04 });
        this.noise(t, 0.3, { type: 'highpass', f0: 4000, gain: 0.08 });
        break;
      case 'lightning': {
        for (let i = 0; i < 8; i++) this.noise(t + i * r(0.01, 0.04), r(0.03, 0.08), { type: 'highpass', f0: r(1500, 4000), gain: 0.3 });
        this.tone(t, 0.5, { type: 'sawtooth', f0: 60, f1: 30, gain: 0.25 });
        this.noise(t + 0.05, 0.9, { type: 'lowpass', f0: 600, f1: 80, gain: 0.4, attack: 0.02 });
        break;
      }
      case 'hammer':
        this.tone(t, 0.6, { type: 'sine', f0: 300, f1: 450, gain: 0.08, attack: 0.05 });
        this.noise(t, 0.5, { type: 'bandpass', f0: 1800, q: 6, gain: 0.08, attack: 0.05 });
        break;
      case 'holy':
        [440, 554, 659].forEach((f) => this.tone(t, 0.7, { type: 'sine', f0: f, gain: 0.07, attack: 0.05 }));
        break;
      case 'aura':
        [330, 495, 660].forEach((f, i) => this.tone(t + i * 0.05, 0.6, { type: 'sine', f0: f, gain: 0.07, attack: 0.03 }));
        break;
      case 'nomana':
        this.tone(t, 0.15, { type: 'square', f0: 140, gain: 0.08 });
        break;
      case 'chest':
        this.noise(t, 0.25, { type: 'bandpass', f0: 500, q: 3, gain: 0.3 });
        this.tone(t + 0.1, 0.2, { type: 'triangle', f0: 180, f1: 120, gain: 0.2 });
        break;
      case 'barrel':
        this.noise(t, 0.3, { type: 'lowpass', f0: 1500, f1: 300, gain: 0.45 });
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.04, 0.06, { type: 'triangle', f0: r(250, 500), gain: 0.15 });
        break;
      case 'portal':
        this.tone(t, 1.0, { type: 'sine', f0: 200, f1: 800, gain: 0.15, attack: 0.1 });
        this.noise(t, 1.0, { type: 'bandpass', f0: 600, f1: 3000, q: 4, gain: 0.12, attack: 0.1 });
        break;
      case 'arrow':
        this.noise(t, 0.12, { type: 'bandpass', f0: 3000, f1: 1500, q: 3, gain: 0.12 });
        this.tone(t, 0.05, { type: 'triangle', f0: 400, gain: 0.1 });
        break;
      case 'click':
        this.tone(t, 0.04, { type: 'square', f0: 1200, gain: 0.04 });
        break;
      case 'charge':
        this.noise(t, 0.4, { type: 'bandpass', f0: 300, f1: 2000, q: 1, gain: 0.25, attack: 0.05 });
        break;
      case 'boss':
        this.tone(t, 2.0, { type: 'sawtooth', f0: 55, f1: 41, gain: 0.25, attack: 0.2 });
        this.tone(t, 2.0, { type: 'sawtooth', f0: 82, f1: 61, gain: 0.15, attack: 0.2 });
        this.noise(t, 2.0, { type: 'lowpass', f0: 300, gain: 0.25, attack: 0.3 });
        break;
      case 'death':
        [220, 207, 196, 185].forEach((f, i) => this.tone(t + i * 0.35, 1.2, { type: 'sawtooth', f0: f, f1: f * 0.9, gain: 0.1, attack: 0.05 }));
        break;
      default:
        // every Synth has its recipe above
        name satisfies never;
    }
  }

  /** the hero is in another area: its bed fades in over the last one's (and later its music) */
  enterArea(area: AreaId) {
    if (area === this.area) return;
    this.area = area;
    // no AudioContext before the first click: ensure() starts the bed then
    if (this.ctx) this.startBed(areaSound(area).bed);
  }

  /** the looping bed: 'dungeon' drone or 'town' wind+fire, fading in over the last one */
  private startBed(kind: Bed) {
    if (!this.ctx) return;
    this.amb?.stop();
    this.amb = null;
    if (kind === 'none') return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2);
    out.connect(this.ambBus);
    const nodes: AudioScheduledSourceNode[] = [];
    if (kind === 'dungeon') {
      for (const [f, g] of [[41.2, 0.18], [61.7, 0.1], [82.4, 0.05]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = Math.random() * 10 - 5;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;
        const gg = ctx.createGain();
        gg.gain.value = g;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + Math.random() * 0.1;
        const lfoG = ctx.createGain();
        lfoG.gain.value = 60;
        lfo.connect(lfoG).connect(lp.frequency);
        o.connect(lp).connect(gg).connect(out);
        o.start();
        lfo.start();
        nodes.push(o, lfo);
      }
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 400;
      bp.Q.value = 0.6;
      const ng = ctx.createGain();
      ng.gain.value = 0.05;
      n.connect(bp).connect(ng).connect(out);
      n.start();
      nodes.push(n);
    } else {
      // wind
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 500;
      bp.Q.value = 0.8;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 250;
      lfo.connect(lfoG).connect(bp.frequency);
      const ng = ctx.createGain();
      ng.gain.value = 0.12;
      n.connect(bp).connect(ng).connect(out);
      n.start();
      lfo.start();
      nodes.push(n, lfo);
      // fire crackle
      const crackle = ctx.createBufferSource();
      const len = ctx.sampleRate * 3;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : (Math.random() * 2 - 1) * 0.02;
      crackle.buffer = buf;
      crackle.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1500;
      const cg = ctx.createGain();
      cg.gain.value = 0.4;
      crackle.connect(hp).connect(cg).connect(out);
      crackle.start();
      nodes.push(crackle);
    }
    this.amb = {
      stop: () => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 1);
        setTimeout(() => {
          for (const nd of nodes) {
            try {
              nd.stop();
            } catch {
              /* already stopped */
            }
          }
          out.disconnect();
        }, 1200);
      },
    };
  }
}
