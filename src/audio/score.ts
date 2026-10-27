import type { Track } from './music';
import type { ScoreKind } from './sounds';

/**
 * Music composed on the spot, for an area with no recorded track: dark ambient after Diablo II's
 * first act. A drone held under everything with its low-pass slowly sweeping, a soft pad on the
 * current chord, and now and then a few plucked guitar notes (Karplus–Strong) in a large room.
 * Each area is seeded by its name, so it always plays the same piece; it never loops, so it has no
 * seam. A handful of oscillators and one short reverb: cheap enough for a phone.
 */

/** seconds ahead the notes are scheduled, so a late timer (a busy frame) never leaves a gap */
const LOOKAHEAD = 1.2;
/**
 * The longest reverb, s. A convolver costs in proportion to its impulse's length, and building one
 * holds up the frame the hero walks into an area: past about 2 s the reverb was most of the music's
 * CPU. The strings ring on longer than the room does, which carries the space.
 */
export const ROOM_MAX = 2.2;
/** plucked strings are rendered at this rate: the guitar is kept under 3 kHz, and it's a third of 48 kHz's memory */
export const STRING_RATE = 16000;

/** how a phrase goes */
export type Shape = 'up' | 'down' | 'wander' | 'single' | 'sigh' | 'ping';

export interface ScoreDef {
  /** the drone held under it all, [midi, level] */
  pedal: [number, number][];
  /** the drone's level */
  drone: number;
  /** its low-pass sweeps between these, Hz, once every `sweep[2]` seconds */
  sweep: [number, number, number];
  /** the mode, as semitones above E: every note it plays is in it */
  scale: number[];
  /** the chords the guitar picks through, low string to high, and which may follow each: the first is home */
  chords: { notes: number[]; next: number[] }[];
  /** the pad: which of the chord's notes it holds, how loud, its wave, its low-pass */
  pad: { tones: number[]; level: number; wave: OscillatorType; cutoff: number };
  /** phrases on one chord before it moves on */
  stay: [number, number];
  /** quiet between phrases, s */
  gap: [number, number];
  /** notes in a phrase that runs (up, down, wander) */
  notes: [number, number];
  /** between a phrase's notes, s */
  step: [number, number];
  /** how often each shape of phrase comes */
  shapes: Partial<Record<Shape, number>>;
  /** a phrase's loudness, 0–1 */
  vel: [number, number];
  /** how long a string rings (to -60 dB, s) and how bright it's plucked, 0–1 */
  ring: number;
  bright: number;
  /** the guitar's low-pass, Hz */
  tone: number;
  /** the room: its reverb time (s), how much of the guitar and of the drone go into it */
  room: number;
  wet: number;
  droneWet: number;
  /** the guitar's level */
  guitar: number;
}

/** everything in E, so it sits on the dungeon bed's E drone */
export const SCORES: Record<ScoreKind, ScoreDef> = {
  // the camp: E minor, guitar picking through the chords as a fire burns
  town: {
    pedal: [[40, 0.6], [47, 0.35]],
    drone: 0.026,
    sweep: [260, 820, 38],
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [
      { notes: [40, 47, 52, 55, 59, 66], next: [1, 2, 4] }, // Em(add9)
      { notes: [48, 55, 59, 64, 67], next: [2, 0, 3] }, // Cmaj7
      { notes: [45, 52, 55, 60, 64], next: [0, 4, 1] }, // Am7
      { notes: [50, 57, 62, 64, 66], next: [0, 4] }, // D(add9)
      { notes: [47, 54, 57, 62, 66], next: [0, 1] }, // Bm7
    ],
    pad: { tones: [1, 2], level: 0.0105, wave: 'triangle', cutoff: 1100 },
    stay: [2, 3],
    gap: [3.5, 7],
    notes: [3, 6],
    step: [0.3, 0.52],
    shapes: { up: 4, down: 2, wander: 3, sigh: 1, ping: 0.5 },
    vel: [0.55, 0.85],
    ring: 3.2,
    bright: 0.55,
    tone: 3200,
    room: 1.6,
    wet: 0.5,
    droneWet: 0.2,
    guitar: 0.15,
  },
  // the wilderness: E Phrygian, open fifths and the half step down to E, far apart
  outdoor: {
    pedal: [[28, 0.55], [35, 0.35], [40, 0.25]],
    drone: 0.0325,
    sweep: [150, 560, 52],
    scale: [0, 1, 3, 5, 7, 8, 10],
    chords: [
      { notes: [40, 47, 52, 59, 64], next: [1, 2, 3] }, // E5
      { notes: [41, 48, 53, 57, 60], next: [0] }, // F
      { notes: [45, 52, 55, 60, 64], next: [0, 4] }, // Am
      { notes: [43, 50, 55, 59, 62], next: [0, 1] }, // G
      { notes: [48, 55, 59, 64], next: [0, 2] }, // Cmaj7
    ],
    pad: { tones: [1, 2], level: 0.0097, wave: 'triangle', cutoff: 800 },
    stay: [1, 3],
    gap: [7, 14],
    notes: [2, 3],
    step: [0.55, 1.1],
    shapes: { single: 3, sigh: 3, wander: 2, down: 1, ping: 1 },
    vel: [0.45, 0.75],
    ring: 3.8,
    bright: 0.45,
    tone: 2600,
    room: 1.9,
    wet: 0.6,
    droneWet: 0.25,
    guitar: 0.105,
  },
  // underground: E Phrygian with its fifth flattened too, a tritone in the drone, single low
  // notes a long way apart; plucked a little brighter, and pinged high more often, than the dark
  // would have it, since a phone's speaker plays nothing of a low string but its overtones
  dungeon: {
    pedal: [[28, 0.5], [34, 0.2]],
    drone: 0.041,
    sweep: [90, 340, 70],
    scale: [0, 1, 3, 5, 6, 7, 8, 10],
    chords: [
      { notes: [40, 47, 52, 58], next: [1, 2, 3] }, // E5 and B♭
      { notes: [41, 48, 53, 57], next: [0] }, // F, a half step over E
      { notes: [46, 52, 55, 58], next: [0] }, // E diminished over B♭
      { notes: [43, 46, 50, 55], next: [0, 1] }, // Gm
    ],
    pad: { tones: [1], level: 0.0154, wave: 'sawtooth', cutoff: 420 },
    stay: [1, 2],
    gap: [8, 15],
    notes: [1, 2],
    step: [0.9, 1.8],
    shapes: { single: 4, sigh: 2, ping: 3, wander: 1 },
    vel: [0.4, 0.7],
    ring: 4.2,
    bright: 0.38,
    tone: 2200,
    room: 2.2,
    wet: 0.65,
    droneWet: 0.3,
    guitar: 0.16,
  },
};

/** a seeded PRNG (mulberry32): the same seed, the same piece */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the seed an area's music is composed from: its name, hashed (FNV-1a) */
export function seedOf(area: string | number): number {
  let h = 0x811c9dc5;
  for (const c of String(area)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

export const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/**
 * A plucked string, Karplus–Strong: a burst of noise circulating in a delay line one period long,
 * each sample averaged with the next on its way round, which takes the highs off first as a real
 * string does. The delay line is a whole number of samples long, so the samples come with the
 * playback rate that puts them exactly on `hz`.
 */
export function pluck(hz: number, opts: { ring: number; bright: number; dur: number }, rand: () => number): { data: Float32Array<ArrayBuffer>; rate: number } {
  const R = STRING_RATE;
  // what's left of the fundamental after each time round, for it to ring `ring` seconds (to -60 dB)
  const keep = (f: number) => 10 ** (-3 / (opts.ring * f));
  // how much of the next sample is averaged in: half takes the highs off fastest, but a high string
  // would then die well within its ring, so it takes less (Jaffe and Smith's decay stretching)
  const cos = (f: number) => Math.cos((2 * Math.PI * f) / R);
  const q = (1 - (keep(hz) / 0.9999) ** 2) / (2 * (1 - cos(hz)));
  const s = q >= 0.25 ? 0.5 : (1 - Math.sqrt(1 - 4 * q)) / 2;
  // and averaging makes the loop `s` of a sample shorter than the line
  const n = Math.max(4, Math.round(R / hz + s));
  const f0 = R / (n - s);
  const loss = Math.sqrt(1 - 2 * s * (1 - s) * (1 - cos(f0)));
  const g = Math.min(0.9999, keep(f0) / loss);
  const line = new Float32Array(n);
  // the pluck: noise, darker for a softer string
  const a = 0.15 + 0.8 * opts.bright;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += a * (rand() * 2 - 1 - lp);
    line[i] = lp;
  }
  // plucked a fifth of the way along: a comb leaves out the harmonics with a node there; and
  // without its mean, so there's no thump of DC
  const pick = Math.max(1, Math.round(n * 0.2));
  const burst = line.map((v, i) => v - (i >= pick ? line[i - pick] : 0));
  const mean = burst.reduce((sum, v) => sum + v, 0) / n;
  line.set(burst.map((v) => v - mean));
  const len = Math.round(opts.dur * R);
  const data = new Float32Array(len);
  let peak = 1e-9;
  // through a DC blocker (about 13 Hz): what DC the burst had left barely decays at all
  let x1 = 0;
  let dc = 0;
  for (let i = 0, j = 0; i < len; i++) {
    const k = j + 1 === n ? 0 : j + 1;
    const y = line[j];
    dc = y - x1 + 0.995 * dc;
    x1 = y;
    data[i] = dc;
    peak = Math.max(peak, Math.abs(dc));
    line[j] = g * ((1 - s) * y + s * line[k]);
    j = k;
  }
  // full scale, and the last tenth faded out so the end doesn't click
  const tail = Math.floor(len * 0.1);
  for (let i = 0; i < len; i++) data[i] *= Math.min(1, (len - i) / tail) / peak;
  return { data, rate: hz / f0 };
}

export interface Note {
  t: number;
  midi: number;
  /** 0–1 */
  vel: number;
  /** -1 left … 1 right */
  pan: number;
}

export interface Phrase {
  /** when it starts */
  t: number;
  /** the chord under it, an index into the score's chords */
  chord: number;
  /** the chord changed with this phrase: the pad moves to it */
  changed: boolean;
  notes: Note[];
}

/**
 * What the guitar plays, phrase by phrase: no WebAudio, so the same seed gives the same notes
 * anywhere, a test included. The harmony walks the chords' `next` lists; each phrase picks out a
 * few of the chord's notes in one of the score's shapes.
 */
export class Composer {
  private rand: () => number;
  private t: number;
  private chord = 0;
  private left: number;

  constructor(
    readonly def: ScoreDef,
    seed: number,
    start: number,
  ) {
    this.rand = mulberry(seed);
    // the drone comes in on its own first
    this.t = start + this.range([2, 4]);
    this.left = this.int(def.stay);
  }

  private range([a, b]: [number, number]) {
    return a + this.rand() * (b - a);
  }

  private int([a, b]: [number, number]) {
    return a + Math.floor(this.rand() * (b - a + 1));
  }

  private shape(): Shape {
    const ws = Object.entries(this.def.shapes) as [Shape, number][];
    let r = this.rand() * ws.reduce((s, [, w]) => s + w, 0);
    for (const [s, w] of ws) if ((r -= w) < 0) return s;
    return ws[0][0];
  }

  /** the next scale note above `m`: the note a sigh falls from */
  private above(m: number) {
    for (let up = 1; up <= 2; up++) if (this.def.scale.includes((((m + up - 40) % 12) + 12) % 12)) return m + up;
    return m + 1;
  }

  next(): Phrase {
    const d = this.def;
    let changed = false;
    if (this.left <= 0) {
      const next = d.chords[this.chord].next;
      this.chord = next[Math.floor(this.rand() * next.length)];
      this.left = this.int(d.stay);
      changed = true;
    }
    this.left--;
    const tones = d.chords[this.chord].notes;
    const top = tones.length - 1;
    const shape = this.shape();
    const runs = shape === 'up' || shape === 'down' || shape === 'wander';
    const count = runs ? this.int(d.notes) : shape === 'sigh' ? 2 : 1;
    // a single note or a ping from the chord's low strings (a ping two octaves up), anything else from its top
    const low = shape === 'single' || shape === 'ping';
    let i = shape === 'up' ? this.int([0, 1]) : shape === 'down' ? top - this.int([0, 1]) : low ? this.int([0, Math.min(2, top)]) : this.int([1, top]);
    let dir = shape === 'down' ? -1 : 1;
    const vel = this.range(d.vel);
    const t0 = this.t;
    let t = t0;
    let step = 0;
    const notes: Note[] = [];
    const add = (midi: number, v: number, at = t) => {
      // low strings a little to the left, high ones to the right, as a guitar sits in front of you
      const pan = Math.max(-0.6, Math.min(0.6, ((midi - 52) / 24) * 0.4 + (this.rand() - 0.5) * 0.3));
      notes.push({ t: at, midi, vel: Math.min(1, v * (0.88 + this.rand() * 0.2)), pan });
    };
    for (let k = 0; k < count; k++) {
      const m = tones[i];
      if (shape === 'ping') add(m + 24, vel * 0.4);
      else if (shape === 'sigh') add(k === 0 ? this.above(m) : m, vel * (k === 0 ? 1 : 0.75));
      else add(m, vel * (1 - 0.07 * k));
      // a run starts on its chord's bass now and then, picked with its first note
      if (k === 0 && runs && i > 0 && this.rand() < 0.3) add(tones[0], vel * 0.7);
      step = this.range(d.step);
      t += step;
      if (shape === 'wander') dir = this.rand() < 0.5 ? -1 : 1;
      // up two strings now and then; turn round at the ends
      const by = shape === 'up' && this.rand() < 0.25 ? 2 : 1;
      if (i + dir * by > top || i + dir * by < 0) dir = -dir;
      i = Math.max(0, Math.min(top, i + dir * by));
    }
    // the last note rings on before the quiet
    this.t = t + step + this.range(d.gap);
    return { t: t0, chord: this.chord, changed, notes };
  }
}

/** a large stone room's reverb: decaying noise, darker than white, after a moment's flight */
function room(ctx: BaseAudioContext, secs: number, rand: () => number): AudioBuffer {
  const R = ctx.sampleRate;
  const len = Math.round(secs * R);
  const ir = ctx.createBuffer(1, len, R);
  const d = ir.getChannelData(0);
  // -60 dB at the end
  const k = Math.exp(-6.9 / len);
  let lp = 0;
  let env = 1;
  for (let i = Math.round(R * 0.012); i < len; i++) {
    lp += 0.35 * (rand() * 2 - 1 - lp);
    d[i] = lp * env;
    env *= k;
  }
  return ir;
}

/** the composed music for one area: everything into its own gain, which fades it in and out */
export class Score implements Track {
  private out: GainNode;
  private guitar: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  /** the pad's voices: the oscillators holding one chord note each, and their level */
  private pad: { osc: OscillatorNode[]; gain: GainNode }[] = [];
  /** each note's string, rendered when it's first played: some 20 of them, 2–3 MB */
  private strings = new Map<number, { buf: AudioBuffer; rate: number }>();
  private def: ScoreDef;
  private composer: Composer;
  private next: Phrase;
  private timer: ReturnType<typeof setInterval>;
  private stopped = false;

  constructor(
    private ctx: BaseAudioContext,
    bus: AudioNode,
    readonly kind: ScoreKind,
    readonly seed: number,
    fade: number,
  ) {
    const def = (this.def = SCORES[kind]);
    const t = ctx.currentTime;
    const rand = mulberry(seed ^ 0x9e3779b9);
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + fade);
    this.out.connect(bus);
    // the room in one channel: the reverb is most of the music's cost, and a stereo one costs twice
    // as much; the right ear hears it a little late, which is wide enough
    const verb = ctx.createConvolver();
    verb.channelCount = 1;
    verb.channelCountMode = 'explicit';
    verb.buffer = room(ctx, def.room, rand);
    const late = ctx.createDelay(0.05);
    late.delayTime.value = 0.017;
    const wide = ctx.createChannelMerger(2);
    verb.connect(wide, 0, 0);
    verb.connect(late).connect(wide, 0, 1);
    wide.connect(this.out);
    const send = (from: AudioNode, level: number) => {
      const g = ctx.createGain();
      g.gain.value = level;
      from.connect(g).connect(verb);
    };

    // the guitar: every note through one low-pass, part of it into the room
    this.guitar = ctx.createGain();
    this.guitar.gain.value = def.guitar;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = def.tone;
    tone.Q.value = 0.5;
    this.guitar.connect(tone).connect(this.out);
    send(tone, def.wet);

    // the drone: each note twice, a few cents apart, one in each ear; the low-pass sweeping slowly
    // and the level swelling at another rate, so it never quite repeats
    const drone = ctx.createGain();
    drone.gain.value = def.drone;
    const sweep = ctx.createBiquadFilter();
    sweep.type = 'lowpass';
    sweep.Q.value = 0.9;
    const [lo, hi, period] = def.sweep;
    sweep.frequency.value = (lo + hi) / 2;
    this.lfo(1 / period, (hi - lo) / 2, sweep.frequency, rand);
    const swell = ctx.createGain();
    swell.gain.value = 1;
    this.lfo(1 / (period * 0.61), 0.3, swell.gain, rand);
    for (const [m, level] of def.pedal) this.pair(m, 'sawtooth', level, sweep, rand);
    sweep.connect(swell).connect(drone).connect(this.out);
    send(drone, def.droneWet);

    // the pad: the chord's inner notes, soft, following the harmony
    const padTone = ctx.createBiquadFilter();
    padTone.type = 'lowpass';
    padTone.frequency.value = def.pad.cutoff;
    this.lfo(1 / (period * 1.37), def.pad.cutoff * 0.3, padTone.frequency, rand);
    padTone.connect(this.out);
    send(padTone, def.droneWet);
    for (const i of def.pad.tones) {
      const gain = ctx.createGain();
      gain.gain.value = def.pad.level;
      gain.connect(padTone);
      this.pad.push({ osc: this.pair(def.chords[0].notes[i], def.pad.wave, 1, gain, rand), gain });
    }

    this.composer = new Composer(def, seed, t);
    this.next = this.composer.next();
    this.advance(t + LOOKAHEAD);
    this.timer = setInterval(() => {
      // an offline render that has finished: nothing left to schedule into
      if (ctx.state === 'closed') clearInterval(this.timer);
      else this.advance(ctx.currentTime + LOOKAHEAD);
    }, 250);
  }

  /** a slow sine moving `param` by ±depth, from a phase of its own: sin φ·cos ωt + cos φ·sin ωt */
  private lfo(hz: number, depth: number, param: AudioParam, rand: () => number) {
    const ctx = this.ctx;
    const phase = rand() * 2 * Math.PI;
    const o = ctx.createOscillator();
    o.setPeriodicWave(ctx.createPeriodicWave([0, Math.sin(phase)], [0, Math.cos(phase)], { disableNormalization: true }));
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    // once a block (128 samples) is enough for a sweep this slow, and spares a swept filter working
    // out its coefficients for every sample
    param.automationRate = 'k-rate';
    o.start(ctx.currentTime);
    this.sources.push(o);
  }

  /** two oscillators on `midi`, a few cents apart, one in each ear */
  private pair(midi: number, wave: OscillatorType, level: number, to: AudioNode, rand: () => number): OscillatorNode[] {
    const ctx = this.ctx;
    const merge = ctx.createChannelMerger(2);
    const g = ctx.createGain();
    g.gain.value = level;
    merge.connect(g).connect(to);
    return [-1, 1].map((side, ch) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = midiHz(midi);
      o.detune.value = side * (3 + rand() * 3);
      o.connect(merge, 0, ch);
      o.start(ctx.currentTime);
      this.sources.push(o);
      return o;
    });
  }

  /** schedule every phrase that starts before `until` */
  advance(until: number) {
    while (!this.stopped && this.next.t < until) {
      this.play(this.next);
      this.next = this.composer.next();
      // known a whole phrase and a gap ahead: time for the pad to move quietly
      if (this.next.changed) this.movePad(this.next);
    }
  }

  /** the pad sinks in the quiet before `p`, moves to its chord while it can't be heard, and swells back */
  private movePad(p: Phrase) {
    const now = this.ctx.currentTime;
    const def = this.def;
    const tones = def.chords[p.chord].notes;
    this.pad.forEach((v, k) => {
      v.gain.gain.setTargetAtTime(0, Math.max(now, p.t - 3.5), 0.5);
      for (const o of v.osc) o.frequency.setTargetAtTime(midiHz(tones[def.pad.tones[k]]), Math.max(now, p.t - 0.5), 0.05);
      v.gain.gain.setTargetAtTime(def.pad.level, Math.max(now, p.t - 0.3), 1.8);
    });
  }

  private play(p: Phrase) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const n of p.notes) {
      // a timer held up past a note's time (a hidden tab): let it go rather than play them all at once
      if (n.t < now) continue;
      const s = this.string(n.midi);
      const src = ctx.createBufferSource();
      src.buffer = s.buf;
      src.playbackRate.value = s.rate;
      const g = ctx.createGain();
      g.gain.value = n.vel;
      const pan = ctx.createStereoPanner();
      pan.pan.value = n.pan;
      src.connect(g).connect(pan).connect(this.guitar);
      src.start(n.t);
    }
  }

  private string(midi: number) {
    let s = this.strings.get(midi);
    if (!s) {
      const def = this.def;
      // seeded by the note, not by when it's first played: the same string whatever came before.
      // Kept for 60% of its ring: by then it's 36 dB down, under the drone, and the room carries it
      const { data, rate } = pluck(midiHz(midi), { ring: def.ring, bright: def.bright, dur: def.ring * 0.6 }, mulberry(this.seed + midi * 7919));
      const buf = this.ctx.createBuffer(1, data.length, STRING_RATE);
      buf.copyToChannel(data, 0);
      s = { buf, rate };
      this.strings.set(midi, s);
    }
    return s;
  }

  stop(fade: number) {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    const g = this.out.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => {
      for (const s of this.sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      this.out.disconnect();
      this.strings.clear();
    }, fade * 1000 + 200);
  }
}
