// The post-processing tools/ai-audio.mjs runs on what ElevenLabs returns, on raw PCM (one
// Float32Array per channel, at RATE), so that loop points come out sample-exact and Node tests can
// check it: a DC blocker, silence trimmed, loudness measured as BS.1770 and normalized under a peak
// ceiling, fades, and an ambience made into a seamless loop.

export const RATE = 48000;

export const dbOf = (x) => 20 * Math.log10(x);
export const lin = (db) => 10 ** (db / 20);

/** BS.1770's K-weighting at 48 kHz: a high shelf (the head), then a high pass (RLB): b0 b1 b2 a1 a2 */
const K = [
  [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585],
  [1, -2, 1, -1.99004745483398, 0.99007225036621],
];

function biquad(x, [b0, b1, b2, a1, a2]) {
  const y = new Float64Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * The K-weighted power summed over the channels, as prefix sums (any window's mean in O(1)). A mono
 * file counts twice: the game plays it in both ears (src/audio/sfx.ts), as it does a stereo file's
 * two channels, so the two are measured alike.
 */
function powerSums(chs) {
  const n = chs[0].length;
  const w = chs.length === 1 ? 2 : 1;
  const ks = chs.map((c) => biquad(biquad(c, K[0]), K[1]));
  const sums = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const k of ks) p += k[i] * k[i];
    sums[i + 1] = sums[i] + p * w;
  }
  return sums;
}

const lufsOf = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/**
 * Loudness in LUFS. 'short': the loudest 3 s, BS.1770's short-term window, or the whole clip if it's
 * shorter (a 0.3 s hit would otherwise be measured with 2.7 s of silence). 'momentary': the loudest
 * 400 ms, BS.1770's momentary window, a shorter clip with silence after it: how loud a sound is as
 * heard, a short one quieter than a long one at the same level (tools/scenarios/sfx.mjs compares a
 * recording with the synthesized sound it replaces by it). 'integrated': gated over 400 ms blocks as
 * BS.1770 (absolute gate -70, relative -10 LU).
 */
export function loudness(chs, how) {
  const n = chs[0].length;
  if (!n) return -Infinity;
  const s = powerSums(chs);
  const mean = (a, b) => (s[b] - s[a]) / (b - a);
  if (how === 'momentary') {
    const win = Math.round(0.4 * RATE);
    if (n <= win) return lufsOf(s[n] / win);
    let best = 0;
    for (let a = 0; a + win <= n; a += RATE / 100) best = Math.max(best, mean(a, a + win));
    return lufsOf(best);
  }
  if (how === 'short') {
    const win = 3 * RATE;
    if (n <= win) return lufsOf(mean(0, n));
    let best = mean(n - win, n);
    for (let a = 0; a + win <= n; a += RATE / 10) best = Math.max(best, mean(a, a + win));
    return lufsOf(best);
  }
  const win = 0.4 * RATE;
  if (n < win) return lufsOf(mean(0, n));
  const blocks = [];
  for (let a = 0; a + win <= n; a += win / 4) blocks.push(mean(a, a + win));
  const loud = blocks.filter((p) => lufsOf(p) > -70);
  if (!loud.length) return -Infinity;
  const gate = lufsOf(avg(loud)) - 10;
  return lufsOf(avg(loud.filter((p) => lufsOf(p) > gate)));
}

export function peak(chs) {
  let m = 0;
  for (const c of chs) for (let i = 0; i < c.length; i++) m = Math.max(m, Math.abs(c[i]));
  return m;
}

/** stereo folded to one channel: an effect is placed in the world by Sfx, not by its file */
export function toMono(chs) {
  if (chs.length === 1) return chs;
  const out = new Float32Array(chs[0].length);
  for (const c of chs) for (let i = 0; i < out.length; i++) out[i] += c[i] / chs.length;
  return [out];
}

/** a one-pole high pass at 20 Hz: an offset would click where a take starts and stops */
export function dcBlock(chs) {
  const r = Math.exp((-2 * Math.PI * 20) / RATE);
  return chs.map((c) => {
    const y = new Float32Array(c.length);
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < c.length; i++) {
      y1 = c[i] - x1 + r * y1;
      x1 = c[i];
      y[i] = y1;
    }
    return y;
  });
}

/**
 * Cut the silence off both ends: before the first sample `lead` dB under the peak and after the last
 * one `tail` dB under it (a tail is let ring longer than an attack is let in), neither threshold
 * lower than `floor` dBFS, keeping `pre` and `post` seconds round them. Null if it's all silence.
 */
export function trimSilence(chs, { lead = -40, tail = -50, floor = -70, pre = 0.005, post = 0.05 } = {}) {
  const n = chs[0].length;
  const pk = peak(chs);
  if (pk === 0) return null;
  const at = (i) => chs.reduce((m, c) => Math.max(m, Math.abs(c[i])), 0);
  const a0 = Math.max(pk * lin(lead), lin(floor));
  const b0 = Math.max(pk * lin(tail), lin(floor));
  let a = 0;
  while (a < n && at(a) < a0) a++;
  let b = n - 1;
  while (b > a && at(b) < b0) b--;
  a = Math.max(0, a - Math.round(pre * RATE));
  b = Math.min(n, b + 1 + Math.round(post * RATE));
  return chs.map((c) => c.slice(a, b));
}

/** a linear fade in over `inS` seconds and a cosine fade out over `outS`: no click at either end */
export function fade(chs, inS, outS) {
  return chs.map((c) => {
    const y = Float32Array.from(c);
    const fi = Math.min(y.length, Math.round(inS * RATE));
    for (let i = 0; i < fi; i++) y[i] *= i / fi;
    const fo = Math.min(y.length, Math.round(outS * RATE));
    for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fo);
    return y;
  });
}

export const scale = (chs, g) => chs.map((c) => c.map((x) => x * g));

/**
 * A look-ahead peak limiter: every sample stays under `ceiling` (linear). The gain each sample needs
 * is held over the `look` samples before it and averaged over as many, so it ramps down ahead of a
 * peak (never above what any sample needs), then recovers over `release` seconds.
 */
export function limit(chs, ceiling, { look = Math.round(0.002 * RATE), release = 0.06 } = {}) {
  const n = chs[0].length;
  const need = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const c of chs) m = Math.max(m, Math.abs(c[i]));
    need[i] = m > ceiling ? ceiling / m : 1;
  }
  // the least needed over [i, i + look): a sliding minimum
  const held = new Float64Array(n);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0, j = 0; i < n; i++) {
    for (; j < Math.min(n, i + look); j++) {
      while (tail > head && need[dq[tail - 1]] >= need[j]) tail--;
      dq[tail++] = j;
    }
    while (dq[head] < i) head++;
    held[i] = need[dq[head]];
  }
  // the mean over the windows that hold sample i: each of them no more than it needs
  const r = 1 - Math.exp(-1 / (release * RATE));
  const g = new Float64Array(n);
  let sum = 0;
  let prev = 1;
  for (let i = 0; i < n; i++) {
    sum += held[i];
    if (i >= look) sum -= held[i - look];
    prev = Math.min(sum / Math.min(i + 1, look), prev + (1 - prev) * r);
    g[i] = prev;
  }
  return chs.map((c) => c.map((x, i) => x * g[i]));
}

/**
 * Bring it to `lufs` (measured `how`, see loudness; over `region` [from, to) samples if given) with
 * its peak under `ceiling` dBFS: what goes over is limited, by at most `maxLimit` dB; past that it's
 * left quieter than asked rather than squashed. Returns the PCM and what was done: the gain and the
 * limiting in dB, the loudness and peak it ends at, and `short`, the dB it falls short of `lufs`.
 */
export function normalize(chs, { lufs, how, ceiling = -1, maxLimit = 6, region }) {
  const measure = (c) => loudness(region ? c.map((x) => x.subarray(...region)) : c, how);
  const result = (out, g, limited) => {
    const got = measure(out);
    return { chs: out, gain: g, limited, lufs: got, peak: dbOf(peak(out)), short: Math.max(0, lufs - got) };
  };
  const was = measure(chs);
  if (!Number.isFinite(was)) return { chs, gain: 0, limited: 0, lufs: was, peak: -Infinity, short: 0 };
  const pk = dbOf(peak(chs));
  let g = lufs - was;
  if (pk + g <= ceiling) return result(scale(chs, lin(g)), g, 0);
  // the most gain it may have: its peak limited by maxLimit
  const most = ceiling + Math.max(0, maxLimit) - pk;
  g = Math.min(g, most);
  if (maxLimit <= 0) return result(scale(chs, lin(g)), g, 0);
  // limiting takes some loudness away (the release holds the gain down past a peak): make it up,
  // pass by pass, until it's at the target or limited by all it may be. Once wasn't enough: a ping
  // with a sharp attack stopped 1.1 dB short with only 3.8 of its 6 dB used
  let out = limit(scale(chs, lin(g)), lin(ceiling));
  for (let k = 0; k < 12; k++) {
    const more = Math.min(lufs - measure(out), most - g);
    if (more < 0.02) break;
    g += more;
    out = limit(scale(chs, lin(g)), lin(ceiling));
  }
  return result(out, g, Math.max(0, pk + g - ceiling));
}

/**
 * The body of a seamless loop from a take: its last `crossfade` seconds fade (equal power, as
 * ambience is noise-like) into its first ones, which go on into what follows them, so the body's end
 * runs straight into its start.
 */
export function loopBody(chs, { crossfade = 2 } = {}) {
  const n = chs[0].length;
  const c = Math.min(Math.round(crossfade * RATE), Math.floor(n / 3));
  const len = n - c;
  return chs.map((x) => {
    const b = x.slice(c, n);
    for (let i = len - c; i < len; i++) {
      const t = ((i - (len - c) + 0.5) / c) * (Math.PI / 2);
      b[i] = x[c + i] * Math.cos(t) + x[i - (len - c)] * Math.sin(t);
    }
    return b;
  });
}

/**
 * A loop's body with `pad` seconds of its own end before it and of its start after it, and the loop
 * points (in samples): a browser that places the file a few milliseconds off (the AAC encoder's
 * priming, src/audio/files.ts) moves the seam along the same waveform, still seamless.
 */
export function padLoop(body, { pad = 0.25 } = {}) {
  const len = body[0].length;
  const p = Math.min(Math.round(pad * RATE), len);
  const chs = body.map((b) => {
    const y = new Float32Array(p + len + p);
    y.set(b.subarray(len - p), 0);
    y.set(b, p);
    y.set(b.subarray(0, p), p + len);
    return y;
  });
  return { chs, start: p, end: p + len };
}

export const makeLoop = (chs, opts) => padLoop(loopBody(chs, opts), opts);

/**
 * normalize for a loop's body: limited as it plays, round and round. It's limited with half a second
 * of itself on either side, so the limiter comes into the body's start and leaves its end as it will
 * when the end runs into the start; the body is then the middle of that.
 */
export function normalizeLoop(body, opts) {
  const wrap = padLoop(body, { pad: 0.5 });
  const level = normalize(wrap.chs, { ...opts, region: [wrap.start, wrap.end] });
  return { ...level, chs: level.chs.map((c) => c.slice(wrap.start, wrap.end)) };
}

/** interleaved float32 (what ffmpeg reads and writes as f32le) to channels, and back */
export function deinterleave(buf, channels) {
  const f = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.byteLength & ~3)));
  const n = Math.floor(f.length / channels);
  return Array.from({ length: channels }, (_, ch) => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = f[i * channels + ch];
    return c;
  });
}

export function interleave(chs) {
  const n = chs[0].length;
  const f = new Float32Array(n * chs.length);
  chs.forEach((c, ch) => {
    for (let i = 0; i < n; i++) f[i * chs.length + ch] = c[i];
  });
  return Buffer.from(f.buffer);
}

/**
 * Where the sound starts: the first sample over `thr`, by default a tenth of the peak (to check a
 * file's alignment). Comparing two versions of a sound, give both the same threshold: an encoder
 * can raise the peak a dB, and a tenth of it then lands on a later click of the same sound.
 */
export function onset(chs, thr = peak(chs) / 10) {
  const c = chs[0];
  for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) >= thr) return i;
  return -1;
}
