/**
 * Decoded recordings, by URL, held under a memory budget: past it, the least recently played go
 * first. Decoding is lazy (the first play, or a preload) and happens once however often it's asked
 * for at the same time. Kept apart from WebAudio so the bookkeeping runs under Node too.
 */

/** decoded PCM is float32: 32 MB is about 3 minutes of mono at 48 kHz */
export const BUDGET = 32 * 1024 * 1024;

/** what the cache needs to know of a decoded buffer: an AudioBuffer, or a test's stand-in */
export interface Decoded {
  length: number;
  numberOfChannels: number;
}

export const bytesOf = (b: Decoded) => b.length * b.numberOfChannels * 4;

export class Buffers<B extends Decoded = AudioBuffer> {
  /** decoded, least recently used first: a Map keeps insertion order, and a use moves one to the end */
  private ready = new Map<string, B>();
  private loading = new Map<string, Promise<B>>();
  /** what's held by something playing (a loop): never evicted, as it would only be decoded again */
  private pins = new Map<string, number>();
  /** what the decoded buffers take, in bytes */
  bytes = 0;

  constructor(
    private decode: (url: string, mono: boolean) => Promise<B>,
    public budget = BUDGET,
  ) {}

  has(url: string) {
    return this.ready.has(url);
  }

  /** a decoded buffer, now the most recently used; undefined if it isn't decoded */
  get(url: string): B | undefined {
    const b = this.ready.get(url);
    if (b) {
      this.ready.delete(url);
      this.ready.set(url, b);
    }
    return b;
  }

  /** decode it (folded to one channel if `mono`) unless it is; rejects when it can't be fetched or decoded */
  load(url: string, mono: boolean): Promise<B> {
    const b = this.get(url);
    if (b) return Promise.resolve(b);
    let p = this.loading.get(url);
    if (!p) {
      p = this.decode(url, mono).then(
        (b) => {
          this.loading.delete(url);
          this.ready.set(url, b);
          this.bytes += bytesOf(b);
          this.evict(url);
          return b;
        },
        (e) => {
          this.loading.delete(url);
          throw e;
        },
      );
      this.loading.set(url, p);
    }
    return p;
  }

  pin(url: string) {
    this.pins.set(url, (this.pins.get(url) ?? 0) + 1);
  }

  unpin(url: string) {
    const n = (this.pins.get(url) ?? 0) - 1;
    if (n > 0) this.pins.set(url, n);
    else {
      this.pins.delete(url);
      this.evict();
    }
  }

  setBudget(bytes: number) {
    this.budget = bytes;
    this.evict();
  }

  /** down to the budget, oldest first, sparing what's pinned and `keep` (the one just decoded) */
  private evict(keep?: string) {
    for (const [url, b] of this.ready) {
      if (this.bytes <= this.budget) return;
      if (url === keep || this.pins.has(url)) continue;
      this.ready.delete(url);
      this.bytes -= bytesOf(b);
    }
  }
}

/** a stereo (or wider) recording folded to one channel: effects are placed by Sfx, not by the file */
export function toMono(ctx: BaseAudioContext, buf: AudioBuffer): AudioBuffer {
  const n = buf.numberOfChannels;
  if (n === 1) return buf;
  const out = ctx.createBuffer(1, buf.length, buf.sampleRate);
  const d = out.getChannelData(0);
  for (let c = 0; c < n; c++) {
    const s = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] += s[i];
  }
  for (let i = 0; i < d.length; i++) d[i] /= n;
  return out;
}

/** which of the decoded variants plays: at random, but not the last one again while there's another */
export function pickVariant(ready: readonly number[], last: number | undefined, rand: () => number): number {
  const pool = ready.length > 1 ? ready.filter((i) => i !== last) : ready;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
