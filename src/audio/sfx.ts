import type { P2 } from '../core/math';
import { Buffers, leadIn, pickVariant, toMono } from './buffers';
import { FILES, type SoundFiles } from './files';
import { Players, Stream, type Track } from './music';
import { Score, seedOf } from './score';
import { areaKey, areaSound, isNight, LINE, PRIORITY, SOUNDS, VARY, type AmbId, type AreaSound, type Bed, type FileId, type Place, type Playing, type SoundId, type Synth, type VoiceId } from './sounds';

/**
 * Game code plays sounds by id (src/audio/sounds.ts); one with a place in the world is heard from
 * the listener, the hero. An id with recorded files (src/audio/files.ts) plays one of them, decoded
 * on first use; any other, or one whose files won't load, is synthesized at runtime with WebAudio.
 * A line spoken (voice.<speaker>.<line>) plays its recording or nothing, one line at a time (Lines).
 * Each area has its ambience (recorded loops, or a synthesized bed) and its music (a recorded track
 * streamed, or music composed on the spot), both crossfaded as the hero moves between areas (walking
 * over a seam of the overworld, or by a jump), or playing on where the next area's is the same.
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
/** the same sound again this soon (one recording, or one recipe) is the same event, already sounding */
const REPEAT_GAP = 0.035;
/** the music's level in the mix: under the ambience, never over the fighting */
const MUSIC_LEVEL = 0.5;
/** seconds an area's music takes to come in, and the last one's to go */
const MUSIC_IN = 5;
const MUSIC_OUT = 3;
/**
 * seconds an area's ambience takes to come in, and the last one's to go, walking from one to the
 * next: over a seam the two are heard together a moment
 */
const AMB_IN = 2;
const AMB_OUT = 2;
/**
 * Walking to and fro over a seam, the sound switches to another area's at most once in this many
 * seconds: a switch so soon after the last waits until they're up, and happens only if the hero is
 * still on the new side by then. So crossfades don't pile up, nor is the music composed anew at
 * every step; the last switch's ambience has come in by then (AMB_IN)
 */
const SWITCH_HOLD = 2;
/** and as the night falls or the day breaks: slowly, as the light goes */
const NIGHTFALL = 6;
/**
 * A bed's level under the area's music. The dungeon's drone is some 16 dB louder than the camp's
 * wind and sits on the music's own E: at full level it buries everything but the odd pluck.
 */
const BED_UNDER_MUSIC: Record<Bed, number> = { town: 1, wild: 1, dungeon: 0.35, none: 1 };
/**
 * The AudioContext's rate at most. Everything WebAudio renders costs in proportion to it, and every
 * decoded recording takes memory in proportion (decodeAudioData resamples to it): at a DAC's 384 kHz
 * the composed music took eight times the CPU, and one 15 s loop more than the whole budget.
 */
export const MAX_RATE = 48000;

/** where the recordings are served from */
const fileUrl = (file: string) => `${import.meta.env.BASE_URL}audio/${file}`;

const isAmb = (id: FileId): id is AmbId => id.startsWith('amb.');
const isMusic = (id: FileId) => id.startsWith('music.');
const isLine = (id: FileId): id is VoiceId => id.startsWith('voice.');

/** what plays once: an effect, or a line spoken */
type OneShot = SoundId | VoiceId;

/** what plays when a recording won't */
const insteadOf = (id: FileId) => (isAmb(id) ? 'the synthesized bed' : isMusic(id) ? 'the composed music' : isLine(id) ? 'not said' : 'synthesized');

/**
 * An AudioContext at the output's own rate, or at MAX_RATE if that's lower. Most devices run at 44.1
 * or 48 kHz and are left alone; above that the browser resamples once, at the output.
 */
function openContext(): AudioContext {
  const ctx = new AudioContext();
  if (ctx.sampleRate <= MAX_RATE) return ctx;
  void ctx.close();
  try {
    return new AudioContext({ sampleRate: MAX_RATE });
  } catch {
    // one that refuses to run at any rate but its output's
    return new AudioContext();
  }
}

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

/** after a line ends, this long before another starts: the hero never talks over itself */
export const LINE_GAP = 1.2;
/** the same line again this soon isn't said: a cast held with no mana says so once, not on every try */
export const LINE_AGAIN = 8;
/** a line still decoding when its moment comes is said once it's in, if that's within this; later it would go with nothing */
export const LINE_LATE = 0.8;

/** a line asked for, and given the floor (Lines.book) */
export interface Booking {
  id: string;
  at: number;
}

/**
 * Who speaks when: one line at a time, a pause after each, and the same line not again for a while,
 * however often its moment comes. A line is booked as soon as it's asked for, so nothing else starts
 * while it decodes; then it starts, holding the floor until it's done, or gives the floor up. Kept
 * apart from WebAudio so it runs under Node too; times are the AudioContext's, in seconds.
 */
export class Lines {
  /** till when nothing else is said */
  private quiet = -Infinity;
  /** each line's last booking */
  private said = new Map<string, number>();
  /** the booking holding the floor */
  private held: Booking | null = null;

  /** may `id` be said at `now`? Its booking if so, null if it isn't to be said */
  book(id: string, now: number): Booking | null {
    if (now < this.quiet) return null;
    const last = this.said.get(id);
    if (last !== undefined && now - last < LINE_AGAIN) return null;
    this.said.set(id, now);
    this.quiet = now + LINE_LATE;
    return (this.held = { id, at: now });
  }

  /**
   * The booked line is to start at `now` and run `secs`: true if it may, and nothing else is said
   * until it's over and LINE_GAP after. False if it's come too late to go with its moment.
   */
  start(b: Booking, now: number, secs: number): boolean {
    if (b !== this.held) return false;
    if (now - b.at > LINE_LATE) {
      this.drop(b, now);
      return false;
    }
    this.quiet = now + secs + LINE_GAP;
    this.held = null;
    return true;
  }

  /** the booked line won't be said (it wouldn't load): the floor is free again */
  drop(b: Booking, now: number) {
    if (b !== this.held) return;
    this.held = null;
    this.quiet = now;
  }
}

/** a sound playing, as the voice limits see it */
export interface VoiceInfo {
  id: OneShot;
  prio: number;
  start: number;
}

/**
 * Which playing voice a new `id` takes over: -1 when there's room, null when it loses and isn't
 * played. Past its own limit it takes over its own oldest voice; past the overall limit, the oldest
 * of the lowest priority, unless that one ranks above it. So a critical sound always plays.
 */
export function voiceToSteal(playing: readonly VoiceInfo[], id: OneShot, def: Playing): number | null {
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

/** a recording picked to play: its buffer, its level, and the silence to skip at its start */
interface Take {
  buf: AudioBuffer;
  gain: number;
  lead: number;
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
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  /** the area's ambience playing: its recorded loops, or its bed */
  private amb: { stop: (secs?: number) => void } | null = null;
  /** past dusk (isNight): an area under the sky plays its night's ambience */
  private night = false;
  /** the area's music playing */
  private music: Track | null = null;
  /**
   * the last area's music, fading out, and what it is (soundOf): back over the seam before it's
   * gone, it fades in again where it was (Track.revive) and isn't begun anew
   */
  private leaving: { music: string; track: Track } | null = null;
  /** what the ambience and the music playing are (soundOf): the next area's play on where they're the same */
  private now = { amb: '', music: '' };
  /** the <audio> elements recorded music streams through, made on the first click */
  private players: Players | null = null;
  /** a click has let the AudioContext run: the media elements were unlocked by then too */
  private unlocked = false;
  /** the recordings it plays: the generated manifest, or a test's own */
  files: Partial<Record<FileId, SoundFiles>> = FILES;
  /** the recordings decoded so far */
  private buffers!: Buffers;
  /** ids whose files wouldn't load: synthesized (or the bed, or the score) for the rest of the session */
  private failed = new Set<FileId>();
  /** each id's last variant, not to be played twice running */
  private lastVariant = new Map<FileId, number>();
  /** each decoded effect's silence before its sound (leadIn), skipped when it plays */
  private leads = new WeakMap<AudioBuffer, number>();
  /** asked to preload before there was an AudioContext to decode with: done when they are, after the first click */
  private early: { ids: Set<FileId>; done: Promise<void>; resolve: () => void } | null = null;
  /** each ambience layer's take for its next play: chosen when it's preloaded, so that's the one decoded */
  private takes = new Map<AmbId, string>();
  /** the hero's area, or the screen off the map, as Game says it: what Sfx is to sound like */
  area: Place | null = null;
  /** the place whose ambience and music play: the hero's, or for a moment the last one's (SWITCH_HOLD) */
  private heard: Place | null = null;
  /** when the sound last switched to another area's (the AudioContext's time) */
  private switched = -Infinity;
  /** the switch waiting out SWITCH_HOLD */
  private holding: ReturnType<typeof setTimeout> | null = null;
  /** each sound's last start, and how loud it was: by id when it's recorded, by recipe when it's synthesized */
  private lastPlay = new Map<string, { t: number; level: number }>();
  private voices: Voice[] = [];
  /** who may speak when */
  private lines = new Lines();
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

  /** on every click and key (and touch's end, which is when iOS counts it): start or wake the sound */
  ensure() {
    if (this.ctx) {
      // 'suspended' before the first click; WebKit's 'interrupted' after a call or a trip to the home screen
      const running = this.ctx.state === 'running';
      if (!running && this.ctx.state !== 'closed') void this.ctx.resume();
      // until a click has been let through, each one unlocks the media elements too: not every kind
      // of event counts on iOS (a touch's start doesn't)
      if (!this.unlocked) this.players?.unlock();
      if (running) this.unlocked = true;
      this.music?.resume?.();
      return;
    }
    // the iPhone's mute switch silences the music and the effects alike (Safari 17)
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
    const ctx = openContext();
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
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL;
    this.musicBus.connect(this.master);
    this.buffers = new Buffers((url, mono) => this.decode(url, mono));
    // an OfflineAudioContext (tools/scenarios/sfx.mjs) can't stream
    if ('createMediaElementSource' in ctx) this.players = new Players(ctx, this.musicBus);
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // the game may have entered an area before there was any sound (?dev, a reload into the game)
    if (this.area !== null) {
      this.heard = this.area;
      this.startArea(this.area);
    }
    if (this.early) {
      const { ids, resolve } = this.early;
      this.early = null;
      void this.preload([...ids]).then(resolve);
    }
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

  /** an effect (SOUNDS), or a line spoken (voice.<speaker>.<line>: say) */
  play(id: OneShot, opts: PlayOpts = {}) {
    if (!this.ctx || this.muted) return;
    if (isLine(id)) this.say(id, opts);
    else this.sound(id, SOUNDS[id], opts);
  }

  /**
   * A line: one at a time and not too often (Lines), whatever asks for it. Nothing is synthesized in
   * its place, so with no recording it isn't said; one still to be decoded is said once it is, if
   * that's soon enough.
   */
  private say(id: VoiceId, opts: PlayOpts) {
    if (!this.recorded(id)) return;
    const booked = this.lines.book(id, this.ctx!.currentTime);
    if (!booked) return;
    const go = () => {
      const take = this.variant(id);
      const now = this.ctx!.currentTime;
      // it wouldn't load, or the sound was turned off while it did
      if (!take || this.muted) return this.lines.drop(booked, now);
      if (this.lines.start(booked, now, (take.buf.duration - take.lead) / (opts.pitch ?? 1))) this.sound(id, LINE, opts, take);
    };
    if (this.ready(id)) go();
    else void this.load(id).then(go);
  }

  /** every take of it is decoded */
  private ready(id: OneShot) {
    return !!this.files[id]?.files.every((file) => this.buffers.has(fileUrl(file)));
  }

  /** `take`: the recording to play, already chosen (a line's); otherwise one is picked, or its recipe rendered */
  private sound(id: OneShot, def: Playing, opts: PlayOpts, take?: Take) {
    // a line is only ever played with its take
    if (!take && !def.synth) return;
    const ctx = this.ctx!;
    const prio = PRIORITY[def.prio ?? 'normal'];
    const where = opts.pos ? spatial(this.listener, this.view, opts.pos, prio >= PRIORITY.critical) : null;
    if (opts.pos && !where) return;
    const level = (def.vol ?? 1) * (opts.vol ?? 1) * (where?.gain ?? 1);
    const now = ctx.currentTime;
    // rate-limit identical sounds, unless the new one is louder: a far monster's death mustn't
    // swallow a near one's in the same frame. Ids that share a recipe are the same sound until they
    // have recordings of their own (a fire's cast and its impact)
    const key = this.recorded(id) || !def.synth ? id : def.synth;
    const last = this.lastPlay.get(key);
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
    this.lastPlay.set(key, { t: now, level });
    const rec = take ?? this.variant(id);
    const gain = ctx.createGain();
    gain.gain.value = level * (rec?.gain ?? 1);
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
    this.end = now;
    if (rec) {
      const src = ctx.createBufferSource();
      src.buffer = rec.buf;
      // variety from one take: a little off its pitch each time
      const vary = def.vary ?? (id.startsWith('ui.') ? 0 : VARY);
      src.playbackRate.value = (opts.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
      src.connect(gain);
      src.start(now + 0.005, rec.lead);
      this.end = now + 0.005 + (rec.buf.duration - rec.lead) / src.playbackRate.value;
    } else if (def.synth) {
      this.out = gain;
      this.pitch = opts.pitch ?? 1;
      this.synth(def.synth, now + 0.005);
    }
    this.voices.push({ id, prio, start: now, end: this.end, gain, tail });
  }

  /**
   * One of the id's recorded variants to play now, its level, and where in it to start; null to
   * synthesize it: it has no files, they failed, or none is decoded yet (the first play starts
   * decoding them all).
   */
  private variant(id: OneShot): Take | null {
    const f = this.files[id];
    if (!f || !this.recorded(id)) return null;
    // an id's variants go together: playing one keeps them all from being evicted
    const ready: number[] = [];
    f.files.forEach((file, i) => {
      if (this.buffers.get(fileUrl(file))) ready.push(i);
    });
    if (ready.length < f.files.length) void this.load(id);
    if (!ready.length) return null;
    const i = pickVariant(ready, this.lastVariant.get(id), Math.random);
    this.lastVariant.set(id, i);
    const buf = this.buffers.get(fileUrl(f.files[i]))!;
    return { buf, gain: f.gain ?? 1, lead: this.leads.get(buf) ?? 0 };
  }

  /** it has recordings, and they haven't failed */
  private recorded(id: FileId) {
    return !!this.files[id] && !this.failed.has(id);
  }

  /**
   * Fetch and decode: an effect folded to mono, as Sfx places it, and what silence it starts with
   * (a browser that keeps the AAC encoder's priming would play every effect 44 ms late); a loop kept
   * as recorded, its loop points past any priming. Every error names the file.
   */
  private async decode(url: string, mono: boolean): Promise<AudioBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    // a dev server, or a host that falls back to its index page, answers a missing file with HTML
    const type = res.headers.get('content-type') ?? '';
    if (type.startsWith('text/')) throw new Error(`${url}: not found (served as ${type})`);
    let buf: AudioBuffer;
    try {
      buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      throw new Error(`${url}: ${(e as Error).message}`);
    }
    if (!mono) return buf;
    const m = toMono(this.ctx!, buf);
    this.leads.set(m, leadIn(m.getChannelData(0), m.sampleRate));
    return m;
  }

  /** decode all of an effect's (or a line's) takes: false (and the id given up on for the session) if one won't load */
  private load(id: OneShot): Promise<boolean> {
    const f = this.files[id];
    if (!f || !this.recorded(id)) return Promise.resolve(false);
    return Promise.all(f.files.map((file) => this.buffers.load(fileUrl(file), true))).then(
      () => true,
      (e: Error) => {
        this.fail(id, e);
        return false;
      },
    );
  }

  /** the take an ambience layer plays next time: one at random, kept until it's played */
  private takeOf(id: AmbId): string {
    let url = this.takes.get(id);
    if (!url) {
      const files = this.files[id]!.files;
      url = fileUrl(files[Math.floor(Math.random() * files.length)]);
      this.takes.set(id, url);
    }
    return url;
  }

  /** decode the take of an ambience layer that plays next: its others would only take memory */
  private loadAmb(id: AmbId): Promise<AudioBuffer | null> {
    if (!this.recorded(id)) return Promise.resolve(null);
    return this.buffers.load(this.takeOf(id), false).catch((e: Error) => {
      this.fail(id, e);
      return null;
    });
  }

  private fail(id: FileId, e: Error) {
    if (this.failed.has(id)) return;
    this.failed.add(id);
    console.warn(`sound ${id}: ${e.message}; ${insteadOf(id)} instead`);
  }

  /**
   * Decode these now (the sounds of the areas next to the hero's), so their first play is the
   * recording and not the synthesized stand-in. Music streams, so there's nothing to warm for it.
   * Resolves when they're in, or have failed; asked before the first click, only once that click
   * has made an AudioContext to decode them with.
   */
  preload(ids: readonly FileId[]): Promise<void> {
    if (!this.ctx) {
      if (!this.early) {
        let resolve!: () => void;
        const done = new Promise<void>((r) => (resolve = r));
        this.early = { ids: new Set(), done, resolve };
      }
      for (const id of ids) this.early.ids.add(id);
      return this.early.done;
    }
    const loads = ids.map((id) => (isMusic(id) ? null : isAmb(id) ? this.loadAmb(id) : this.load(id as OneShot)));
    return Promise.all(loads).then(() => {});
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
      case 'poison':
        // a wet hiss, a gurgle under it
        this.noise(t, 0.45, { type: 'bandpass', f0: r(2200, 2800), f1: 900, q: 1.2, gain: 0.16, attack: 0.03 });
        this.tone(t + 0.04, 0.3, { type: 'sine', f0: r(220, 260), f1: 120, gain: 0.08 });
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

  /** what plays: the sound of the place it's heard for (the tools read it); before the first click, what starts with it */
  get playing(): AreaSound {
    return this.heard === null ? { bed: 'none' } : areaSound(this.heard);
  }

  /**
   * The hero is in another area (Game calls it as it announces the area): its ambience and its
   * music fade in over the last one's, except that what's the same plays on (soundOf: floor to
   * floor, Blood Moor into Cold Plains, as Diablo II's areas of one SoundEnv do). `walked` over a
   * seam, not come by a jump: a switch so soon after the last one waits out SWITCH_HOLD.
   */
  enterArea(area: Place, walked = false) {
    if (area === this.area) return;
    this.area = area;
    this.settle(walked);
  }

  /** the hero's area's sound playing: now, or when `hold` and SWITCH_HOLD isn't up, once it is */
  private settle(hold: boolean) {
    if (this.holding !== null) clearTimeout(this.holding);
    this.holding = null;
    const area = this.area;
    if (area === null) return;
    // no AudioContext before the first click: ensure() starts it then
    if (!this.ctx) {
      this.heard = area;
      return;
    }
    const left = this.switched + SWITCH_HOLD - this.ctx.currentTime;
    if (hold && left > 0 && this.changes(area)) {
      this.holding = setTimeout(() => this.settle(false), left * 1000);
      return;
    }
    this.heard = area;
    if (this.startArea(area)) this.switched = this.ctx.currentTime;
  }

  /** coming to `area` would change what plays: its ambience, or its music */
  private changes(area: Place): boolean {
    const now = this.soundOf(areaSound(area));
    return now.amb !== this.now.amb || now.music !== this.now.music;
  }

  /**
   * The time of day under the sky (Game.clock, 0 → 1 from midnight): past dusk an area under it
   * plays its night's ambience, crossfaded from the day's as the light goes, and the day's again
   * after dawn. Underground, or with no night of its own recorded, nothing changes.
   */
  setTime(clock: number) {
    const night = isNight(clock);
    if (night === this.night) return;
    this.night = night;
    if (this.ctx && this.heard !== null) this.startArea(this.heard, NIGHTFALL);
  }

  /** the area's ambience layers that will play now: the night's by night, the day's while the night has none that will */
  private layers(s: AreaSound): AmbId[] {
    const day = (s.amb ?? []).filter((id) => this.recorded(id));
    if (!this.night) return day;
    const night = (s.night ?? []).filter((id) => this.recorded(id));
    return night.length ? night : day;
  }

  /**
   * What an area's ambience and music are, as far as playing on into it goes: the same loops (or,
   * with none that will play, the same bed) and the same track (or the same kind of composed music).
   * So floor to floor of a dungeon nothing starts again, nor from Blood Moor into Cold Plains.
   */
  private soundOf(s: AreaSound): { amb: string; music: string } {
    const layers = this.layers(s);
    const music = s.music && this.recorded(s.music) && this.players ? s.music : `score:${s.score ?? 'none'}`;
    return { amb: layers.length ? layers.join('+') : `bed:${s.bed}`, music };
  }

  /** `fade`: the seconds the last ambience takes to go and this one to come in, if it changes. True if anything did */
  private startArea(area: Place, fade?: number): boolean {
    const s = areaSound(area);
    const now = this.soundOf(s);
    const music = now.music !== this.now.music;
    const amb = now.amb !== this.now.amb;
    // the music first: the bed's level depends on whether there is any
    if (music) {
      const back = this.leaving?.music === now.music ? this.leaving.track : null;
      this.music?.stop(MUSIC_OUT);
      this.leaving = this.music ? { music: this.now.music, track: this.music } : null;
      this.music = back?.revive?.(MUSIC_IN) ? back : this.track(area);
    }
    if (amb) {
      this.amb?.stop(fade ?? AMB_OUT);
      this.amb = this.ambience(s, fade ?? AMB_IN);
    }
    this.now = now;
    return music || amb;
  }

  /**
   * The area's ambience: its recorded loops (those of the time of day), fading in over `rise`
   * seconds once they're decoded (at once, if they were preloaded); its synthesized bed if it has
   * none, or they won't load.
   */
  private ambience(s: AreaSound, rise = AMB_IN): { stop: (secs?: number) => void } | null {
    const ctx = this.ctx!;
    const layers = this.layers(s);
    if (!layers.length) return this.bed(s.bed);
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.ambBus);
    // each layer's take (the one preloaded, if it was), pinned while it plays: evicting it would only
    // mean decoding it again
    const takes = layers.map((id) => {
      const url = this.takeOf(id);
      this.takes.delete(id);
      return { id, f: this.files[id]!, url };
    });
    for (const t of takes) this.buffers.pin(t.url);
    const loops: AudioBufferSourceNode[] = [];
    let bed: { stop: (secs?: number) => void } | null = null;
    let stopped = false;
    void Promise.all(
      takes.map((t) =>
        this.buffers.load(t.url, false).catch((e: Error) => {
          this.fail(t.id, e);
          return null;
        }),
      ),
    ).then((bufs) => {
      if (stopped) return;
      // what plays on into the next area is what played here: without the layers that failed
      if (this.amb === handle) this.now.amb = this.soundOf(s).amb;
      if (!bufs.some((b) => b)) {
        bed = this.bed(s.bed);
        return;
      }
      const now = ctx.currentTime;
      takes.forEach(({ f }, i) => {
        const buf = bufs[i];
        if (!buf) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        // round the loop points, skipping the encoder's silence at the start
        const start = f.loop?.start ?? 0;
        if (f.loop) {
          src.loopStart = start;
          src.loopEnd = f.loop.end;
        }
        const g = ctx.createGain();
        g.gain.value = f.gain ?? 1;
        src.connect(g).connect(out);
        src.start(now, start);
        loops.push(src);
      });
      out.gain.setValueAtTime(0, now);
      out.gain.linearRampToValueAtTime(1, now + rise);
    });
    const handle = {
      stop: (secs = AMB_OUT) => {
        stopped = true;
        bed?.stop(secs);
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + secs);
        setTimeout(() => {
          for (const l of loops) l.stop();
          out.disconnect();
          for (const take of takes) this.buffers.unpin(take.url);
        }, secs * 1000 + 200);
      },
    };
    return handle;
  }

  /**
   * The area's music: its recording streamed, or until there is one (or if it won't play), its score,
   * composed from the area's name: the same piece every time it's entered.
   */
  private track(area: Place): Track | null {
    const ctx = this.ctx!;
    const s = areaSound(area);
    const compose = () => (s.score ? new Score(ctx, this.musicBus, s.score, seedOf(areaKey(area)), MUSIC_IN) : null);
    const id = s.music;
    const f = id && this.files[id];
    if (!id || !f || !this.recorded(id) || !this.players) return compose();
    const stream: Stream = new Stream(
      ctx,
      this.players,
      f.files.map(fileUrl),
      MUSIC_IN,
      (e) => {
        this.fail(id, e);
        if (this.music !== stream) return;
        stream.stop(1);
        this.music = compose();
        this.now.music = this.soundOf(s).music;
      },
      f.gain ?? 1,
    );
    return stream;
  }

  /** the looping bed: 'dungeon' drone, 'wild' wind or 'town' wind and a campfire, fading in; lower under the area's music */
  private bed(kind: Bed): { stop: (secs?: number) => void } | null {
    if (kind === 'none') return null;
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(this.music ? BED_UNDER_MUSIC[kind] : 1, ctx.currentTime + AMB_IN);
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
      // out in the open the wind blows harder, with no fire to hear over it
      ng.gain.value = kind === 'wild' ? 0.16 : 0.12;
      n.connect(bp).connect(ng).connect(out);
      n.start();
      lfo.start();
      nodes.push(n, lfo);
    }
    if (kind === 'town') {
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
    return {
      stop: (secs = AMB_OUT) => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + secs);
        setTimeout(() => {
          for (const nd of nodes) {
            try {
              nd.stop();
            } catch {
              /* already stopped */
            }
          }
          out.disconnect();
        }, secs * 1000 + 200);
      },
    };
  }
}
