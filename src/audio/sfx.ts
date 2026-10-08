/**
 * All sounds are synthesized at runtime with WebAudio — no audio assets.
 */
export type SoundName =
  | 'swing'
  | 'hit'
  | 'hitbone'
  | 'hitheavy'
  | 'block'
  | 'die'
  | 'diebone'
  | 'impdie'
  | 'hurt'
  | 'gold'
  | 'drop'
  | 'dropunique'
  | 'droprune'
  | 'pickup'
  | 'potion'
  | 'levelup'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'hammer'
  | 'holy'
  | 'aura'
  | 'nomana'
  | 'chest'
  | 'barrel'
  | 'portal'
  | 'arrow'
  | 'click'
  | 'equip'
  | 'socket'
  | 'charge'
  | 'boss'
  | 'death';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private amb: { stop: () => void } | null = null;
  private lastPlay: Partial<Record<SoundName, number>> = {};
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
    f.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private tone(t: number, dur: number, opts: { type?: OscillatorType; f0: number; f1?: number; gain: number; attack?: number; detune?: number }) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.f0, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(opts.f1, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: SoundName, vol = 1) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    // rate-limit identical sounds
    const last = this.lastPlay[name] ?? -1;
    if (now - last < 0.035) return;
    this.lastPlay[name] = now;
    const t = now + 0.005;
    const v = vol;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      case 'swing':
        this.noise(t, 0.18, { f0: r(600, 900), f1: r(2200, 3000), q: 1.5, gain: 0.18 * v, attack: 0.04 });
        break;
      case 'hit':
        this.tone(t, 0.14, { type: 'sine', f0: r(140, 170), f1: 50, gain: 0.55 * v });
        this.noise(t, 0.09, { type: 'lowpass', f0: 1800, f1: 400, gain: 0.35 * v });
        break;
      case 'hitheavy':
        this.tone(t, 0.25, { type: 'sine', f0: 110, f1: 38, gain: 0.8 * v });
        this.noise(t, 0.16, { type: 'lowpass', f0: 2400, f1: 300, gain: 0.5 * v });
        this.tone(t, 0.08, { type: 'square', f0: 70, f1: 40, gain: 0.15 * v });
        break;
      case 'hitbone':
        this.noise(t, 0.07, { type: 'highpass', f0: 2500, gain: 0.35 * v });
        this.tone(t, 0.06, { type: 'triangle', f0: r(700, 900), f1: 300, gain: 0.25 * v });
        this.tone(t, 0.1, { type: 'sine', f0: 160, f1: 70, gain: 0.3 * v });
        break;
      case 'block':
        for (const f of [r(520, 560), 1410, 2230, 3170]) this.tone(t, 0.45, { type: 'sine', f0: f, gain: 0.12 * v });
        this.noise(t, 0.05, { type: 'highpass', f0: 3000, gain: 0.3 * v });
        break;
      case 'die':
        this.tone(t, 0.5, { type: 'sawtooth', f0: r(180, 220), f1: 60, gain: 0.16 * v, attack: 0.02 });
        this.noise(t, 0.4, { type: 'lowpass', f0: 900, f1: 200, gain: 0.2 * v, attack: 0.02 });
        break;
      case 'diebone':
        for (let i = 0; i < 5; i++) {
          this.noise(t + i * r(0.03, 0.06), 0.05, { type: 'highpass', f0: r(2000, 4000), gain: 0.25 * v });
          this.tone(t + i * 0.05, 0.05, { type: 'triangle', f0: r(500, 1100), gain: 0.12 * v });
        }
        break;
      case 'impdie':
        this.tone(t, 0.3, { type: 'sawtooth', f0: r(700, 900), f1: 250, gain: 0.12 * v, attack: 0.01 });
        this.tone(t, 0.3, { type: 'square', f0: r(1000, 1300), f1: 400, gain: 0.05 * v, attack: 0.01 });
        break;
      case 'hurt':
        this.tone(t, 0.22, { type: 'sawtooth', f0: r(120, 140), f1: 85, gain: 0.18 * v, attack: 0.01 });
        this.noise(t, 0.12, { type: 'bandpass', f0: 700, q: 3, gain: 0.15 * v });
        break;
      case 'gold':
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.035, 0.18, { type: 'triangle', f0: r(2400, 3600), gain: 0.07 * v });
        break;
      case 'drop':
        this.tone(t, 0.12, { type: 'sine', f0: 220, f1: 110, gain: 0.25 * v });
        this.noise(t, 0.06, { type: 'lowpass', f0: 1200, gain: 0.2 * v });
        break;
      case 'dropunique':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, 0.9, { type: 'triangle', f0: f, gain: 0.12 * v, attack: 0.01 }));
        this.tone(t, 1.4, { type: 'sine', f0: 130, gain: 0.15 * v, attack: 0.05 });
        break;
      case 'droprune':
        [392, 587, 784].forEach((f, i) => this.tone(t + i * 0.06, 0.7, { type: 'sine', f0: f, gain: 0.12 * v }));
        break;
      case 'pickup':
        this.noise(t, 0.08, { type: 'bandpass', f0: 1200, q: 2, gain: 0.2 * v });
        this.tone(t, 0.07, { type: 'triangle', f0: 600, f1: 900, gain: 0.08 * v });
        break;
      case 'equip':
        this.noise(t, 0.12, { type: 'bandpass', f0: 2600, q: 4, gain: 0.25 * v });
        this.tone(t, 0.2, { type: 'sine', f0: 900, gain: 0.08 * v });
        this.tone(t + 0.03, 0.25, { type: 'sine', f0: 1350, gain: 0.06 * v });
        break;
      case 'socket':
        this.tone(t, 0.4, { type: 'sine', f0: 660, f1: 990, gain: 0.15 * v });
        this.noise(t, 0.1, { type: 'highpass', f0: 3000, gain: 0.15 * v });
        break;
      case 'potion':
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.09, 0.08, { type: 'sine', f0: r(180, 260), f1: r(300, 400), gain: 0.25 * v });
        break;
      case 'levelup':
        [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.07, 1.2, { type: 'triangle', f0: f, gain: 0.09 * v, attack: 0.02 }));
        this.noise(t, 1.2, { type: 'highpass', f0: 5000, gain: 0.05 * v, attack: 0.3 });
        break;
      case 'fire':
        this.noise(t, 0.5, { type: 'lowpass', f0: 400, f1: 1600, q: 0.7, gain: 0.35 * v, attack: 0.05 });
        this.noise(t + 0.05, 0.4, { type: 'bandpass', f0: 3000, q: 0.5, gain: 0.08 * v });
        break;
      case 'cold':
        for (let i = 0; i < 6; i++) this.tone(t + i * 0.025, 0.4, { type: 'sine', f0: r(2500, 5000), gain: 0.04 * v });
        this.noise(t, 0.3, { type: 'highpass', f0: 4000, gain: 0.08 * v });
        break;
      case 'lightning': {
        for (let i = 0; i < 8; i++) this.noise(t + i * r(0.01, 0.04), r(0.03, 0.08), { type: 'highpass', f0: r(1500, 4000), gain: 0.3 * v });
        this.tone(t, 0.5, { type: 'sawtooth', f0: 60, f1: 30, gain: 0.25 * v });
        this.noise(t + 0.05, 0.9, { type: 'lowpass', f0: 600, f1: 80, gain: 0.4 * v, attack: 0.02 });
        break;
      }
      case 'hammer':
        this.tone(t, 0.6, { type: 'sine', f0: 300, f1: 450, gain: 0.08 * v, attack: 0.05 });
        this.noise(t, 0.5, { type: 'bandpass', f0: 1800, q: 6, gain: 0.08 * v, attack: 0.05 });
        break;
      case 'holy':
        [440, 554, 659].forEach((f) => this.tone(t, 0.7, { type: 'sine', f0: f, gain: 0.07 * v, attack: 0.05 }));
        break;
      case 'aura':
        [330, 495, 660].forEach((f, i) => this.tone(t + i * 0.05, 0.6, { type: 'sine', f0: f, gain: 0.07 * v, attack: 0.03 }));
        break;
      case 'nomana':
        this.tone(t, 0.15, { type: 'square', f0: 140, gain: 0.08 * v });
        break;
      case 'chest':
        this.noise(t, 0.25, { type: 'bandpass', f0: 500, q: 3, gain: 0.3 * v });
        this.tone(t + 0.1, 0.2, { type: 'triangle', f0: 180, f1: 120, gain: 0.2 * v });
        break;
      case 'barrel':
        this.noise(t, 0.3, { type: 'lowpass', f0: 1500, f1: 300, gain: 0.45 * v });
        for (let i = 0; i < 4; i++) this.tone(t + i * 0.04, 0.06, { type: 'triangle', f0: r(250, 500), gain: 0.15 * v });
        break;
      case 'portal':
        this.tone(t, 1.0, { type: 'sine', f0: 200, f1: 800, gain: 0.15 * v, attack: 0.1 });
        this.noise(t, 1.0, { type: 'bandpass', f0: 600, f1: 3000, q: 4, gain: 0.12 * v, attack: 0.1 });
        break;
      case 'arrow':
        this.noise(t, 0.12, { type: 'bandpass', f0: 3000, f1: 1500, q: 3, gain: 0.12 * v });
        this.tone(t, 0.05, { type: 'triangle', f0: 400, gain: 0.1 * v });
        break;
      case 'click':
        this.tone(t, 0.04, { type: 'square', f0: 1200, gain: 0.04 * v });
        break;
      case 'charge':
        this.noise(t, 0.4, { type: 'bandpass', f0: 300, f1: 2000, q: 1, gain: 0.25 * v, attack: 0.05 });
        break;
      case 'boss':
        this.tone(t, 2.0, { type: 'sawtooth', f0: 55, f1: 41, gain: 0.25 * v, attack: 0.2 });
        this.tone(t, 2.0, { type: 'sawtooth', f0: 82, f1: 61, gain: 0.15 * v, attack: 0.2 });
        this.noise(t, 2.0, { type: 'lowpass', f0: 300, gain: 0.25 * v, attack: 0.3 });
        break;
      case 'death':
        [220, 207, 196, 185].forEach((f, i) => this.tone(t + i * 0.35, 1.2, { type: 'sawtooth', f0: f, f1: f * 0.9, gain: 0.1 * v, attack: 0.05 }));
        break;
    }
  }

  /** looping ambience; 'dungeon' drone or 'town' wind+fire */
  ambience(kind: 'dungeon' | 'town' | 'none') {
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
