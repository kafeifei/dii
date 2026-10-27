/**
 * An area's music: a recorded track streamed from public/audio/ (Stream), or until there is one,
 * music composed on the spot (src/audio/score.ts). Either fades in on its own gain and fades out
 * when the hero leaves, so the next area's crossfades over it.
 */
export interface Track {
  /** fade out over `fade` seconds, then let go of everything it holds */
  stop(fade: number): void;
  /** after a click: start again what the browser wouldn't play without one */
  resume?(): void;
}

/** an <audio> element routed into WebAudio for good, and the gain a stream fades it with */
interface Player {
  el: HTMLAudioElement;
  gain: GainNode;
  /** the stream playing on it, or null while it's free */
  owner: Stream | null;
  /** when it was last given to one, for taking back the one held longest */
  since: number;
}

const EVENTS = ['playing', 'ended', 'error'];

/**
 * The <audio> elements the music streams through, made on the first click and used over and over:
 * iOS lets an element play without a click only once one has started (or loaded) it, and an element
 * can be routed into WebAudio only once. Two, so an area's track comes in while the last one's goes
 * out.
 */
export class Players {
  private all: Player[] = [];
  private gave = 0;

  constructor(ctx: AudioContext, bus: AudioNode, n = 2) {
    for (let i = 0; i < n; i++) {
      const el = new Audio();
      // served from elsewhere (a CDN), it would otherwise reach WebAudio as silence
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ctx.createMediaElementSource(el).connect(gain).connect(bus);
      this.all.push({ el, gain, owner: null, since: 0 });
    }
    this.unlock();
  }

  /** in a click (Sfx.ensure): the free elements may play later without one, as Howler's pool does */
  unlock() {
    // with no src yet, loading one does nothing else
    for (const p of this.all) if (!p.owner) p.el.load();
  }

  /** an element for `owner`: a free one, or failing that the one given out longest ago, cut short */
  take(owner: Stream): Player {
    let p = this.all.find((q) => !q.owner);
    if (!p) {
      p = this.all.reduce((a, b) => (b.since < a.since ? b : a));
      p.owner!.lose();
    }
    p.owner = owner;
    p.since = ++this.gave;
    return p;
  }
}

/**
 * A long recording, played as it downloads through one of the Players' elements. Its level is a
 * GainNode's: iOS ignores HTMLMediaElement.volume, so that can't fade it. The fade in waits for the
 * element to play, which on iOS may be only at the next click. One file loops; several play in turn.
 */
export class Stream implements Track {
  private p: Player;
  private i = 0;
  private stopped = false;
  /** it has started playing, and fading in */
  private heard = false;

  constructor(
    private ctx: AudioContext,
    players: Players,
    private urls: string[],
    private fade: number,
    /** it can't be played (missing, undecodable): the area gets its composed music instead */
    private onFail: (e: Error) => void,
  ) {
    const p = (this.p = players.take(this));
    const g = p.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(0, ctx.currentTime);
    for (const type of EVENTS) p.el.addEventListener(type, this);
    p.el.loop = urls.length === 1;
    p.el.src = urls[0];
    this.resume();
  }

  /** the element it plays on, and its gain (for the scenarios) */
  get el() {
    return this.p.el;
  }

  get gain() {
    return this.p.gain;
  }

  handleEvent(e: Event) {
    if (this.stopped) return;
    const el = this.p.el;
    if (e.type === 'playing' && !this.heard) {
      // only now: one that starts late (iOS, at the next click) would otherwise come in at full volume
      this.heard = true;
      const g = this.p.gain.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(1, t + this.fade);
    } else if (e.type === 'ended') {
      this.i = (this.i + 1) % this.urls.length;
      el.src = this.urls[this.i];
      this.resume();
    } else if (e.type === 'error') {
      const code = el.error?.code;
      // what a dev server or an SPA host serves for a missing file (its index page) can't be decoded
      const why = code === 4 ? ' (missing, or not audio)' : '';
      this.onFail(new Error(`${this.urls[this.i]}: media error ${code ?? '?'}${why}`));
    }
  }

  resume() {
    if (this.stopped || !this.p.el.paused) return;
    // refused without a click (iOS, a reload into the game): Sfx.ensure tries again on the next one
    this.p.el.play().catch(() => {});
  }

  stop(fade: number) {
    if (this.stopped) return;
    this.stopped = true;
    const g = this.p.gain.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => {
      // unless a newer stream has taken its element already
      if (this.p.owner === this) this.release();
    }, fade * 1000 + 100);
  }

  /** a newer stream needs its element: let go of it at once */
  lose() {
    this.stopped = true;
    this.release();
  }

  private release() {
    const { el, gain } = this.p;
    for (const type of EVENTS) el.removeEventListener(type, this);
    el.pause();
    // drop the download and the decoder with it
    el.removeAttribute('src');
    el.load();
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.p.owner = null;
  }
}
