// The painted item pictures in the UI, chosen and coloured by D2's rules (src/items/picture.ts). They
// ship packed in atlases, one kind of thing each (public/icons/items/<atlas>.webp; where each picture
// is: src/data/itempics.ts; tools/ai-icons.mjs writes both, tools/icons/atlas.mjs says what goes
// where). An item's <img> shows the code-drawn icon (icons.ts) until its picture is in, then the
// picture: no blank cell, nothing moving (every cell sizes its <img> itself).
//
// An atlas is fetched the first time a panel draws an item whose picture is in it, so opening the stash
// loads that page's atlases and no more. Once a game is on they are also fetched ahead, one at a time
// while the game can spare the network (fetchAhead): those the hero's own items show first (worn, in
// the bag and the belt, the cube, the stash's pages), then the rest, into the HTTP cache, so a panel
// opened a few seconds in finds its atlases there (a phone's first bag 5 s in: 0.3 s, against 0.6 s
// when each picture was a file of its own; opened at once it still waits on them, 1.2–1.5 s, and
// while it does no model download nothing waits on starts: holdOthers). It is decoded off the main thread
// (createImageBitmap) and each picture is cut out of it once, in a canvas: the 2x picture as it is,
// or on a screen of one device pixel per CSS pixel drawn down to 1x and lightly sharpened as the
// exported 1x files were (src/ui/sharpen.ts). A decoded atlas is let go once no cut waits on it, and
// no more than two are decoded at once. An atlas that doesn't come or doesn't decode is asked for once
// more, then its pictures keep the drawn icon.
//
// A coloured picture is the cut shifted by src/ui/recolour.ts (our approximation of D2's palette
// shifts) and a rune's has its number drawn on the stone; each is made once per (picture, colour,
// InvTrans ranges). Cuts and looks are kept as WebP blob URLs where the browser encodes WebP (no more
// than the picture's own file weighed), else as PNG (three times that); past BLOB_BUDGET the least
// recently drawn of them that nothing shows are let go, to be made again if drawn again. The work
// done here (a cut, a recolour, a rune's number) runs a few milliseconds a frame.
import { RUNE_BY_ID } from '../data/legendary';
import { ITEM_ATLASES, ITEM_PICTURES } from '../data/itempics';
import type { Item } from '../items/item';
import { itemPicture, pictureOf, type ItemPicture } from '../items/picture';
import { itemIcon } from './icons';
import { rangesOf, recolourPixels } from './recolour';
import { sharpen } from './sharpen';

/**
 * what the pictures cost, for tools/scenarios/icons.mjs: atlases fetched for cuts (their KB; from the
 * HTTP cache too) and ahead of them, decoded and given up on; pictures cut (the ms it took) and failed;
 * looks made; the blobs kept (how many, their KB, their type) and let go; the longest piece of work in a frame
 */
export const PIC_STATS = {
  atlases: 0,
  atlasKB: 0,
  ahead: 0,
  aheadKB: 0,
  decoded: 0,
  atlasesFailed: 0,
  cut: 0,
  cutMs: 0,
  failed: 0,
  made: 0,
  makeMs: 0,
  kept: 0,
  keptKB: 0,
  blobType: '',
  released: 0,
  longestMs: 0,
  longest: '',
  swapped: 0,
  scale: '',
};

/** 1x (a cell 34 px, drawn down and sharpened) on a screen of a pixel per CSS pixel, else 2x (68 px a cell) */
function scale(): '1x' | '2x' {
  if (!PIC_STATS.scale) PIC_STATS.scale = (globalThis.devicePixelRatio ?? 1) > 1.25 ? '2x' : '1x';
  return PIC_STATS.scale as '1x' | '2x';
}

/** what an item's <img> shows once ready: its key, the picture, the colour, a rune's number */
interface Look {
  key: string;
  pic: ItemPicture;
  rune?: string;
}

function lookFor(item: Item): Look | null {
  const pic = itemPicture(item);
  if (!pic || !ITEM_PICTURES[pic.file]) return null;
  const rune = RUNE_BY_ID[item.baseId]?.glyph;
  const rs = pic.colour && rangesOf(pic.colour.invTrans);
  // 5 and 8 shift the same ranges: one picture for both
  const col = pic.colour && rs ? `|${pic.colour.code}.${rs.brown ? 'gb' : 'g'}` : '';
  return { key: `${pic.file}${col}${rune ? `|r${rune}` : ''}`, pic, rune };
}

/** the shown URL of each look ready, and the looks being made or that failed */
const ready = new Map<string, string>();
const making = new Set<string>();
const failed = new Set<string>();
/** each picture cut out of its atlas, decoded, by file */
const images = new Map<string, Promise<HTMLImageElement>>();

// ── the work done on the main thread: a few milliseconds a frame ──
const BUDGET_MS = 6;
const jobs: [string, () => void][] = [];
let jobsQueued = false;
function queue(what: string, job: () => void) {
  jobs.push([what, job]);
  if (jobsQueued) return;
  jobsQueued = true;
  requestAnimationFrame(runJobs);
}
function runJobs() {
  const t0 = performance.now();
  while (jobs.length && performance.now() - t0 < BUDGET_MS) {
    const t = performance.now();
    const [what, job] = jobs.shift()!;
    job();
    const ms = performance.now() - t;
    if (ms > PIC_STATS.longestMs) {
      PIC_STATS.longestMs = ms;
      PIC_STATS.longest = what;
    }
  }
  jobsQueued = jobs.length > 0;
  if (jobsQueued) requestAnimationFrame(runJobs);
}

// ── the atlases ──
/** an atlas asked for once more after this long, when it didn't come or didn't decode */
const RETRY_MS = 1500;
/** a request given up after this long: nothing waits forever */
const TIMEOUT_MS = 30000;
/** a decoded atlas kept this long after its last cut, for the next page's pictures */
const KEEP_MS = 3000;
/** atlases decoded at once (one is 1–3 MB decoded): the others wait their turn, downloaded */
const MAX_DECODED = 2;

type Source = ImageBitmap | HTMLImageElement;
interface Atlas {
  name: string;
  /** its file while it is fetched and decoded (not kept after: the HTTP cache keeps it) */
  file: Promise<Blob> | null;
  /** decoded, while cuts need it */
  decoded: Promise<Source> | null;
  /** holds one of the MAX_DECODED */
  slot: boolean;
  /** cuts waiting for it or drawing from it */
  users: number;
  /** letting the decoded atlas go */
  timer: ReturnType<typeof setTimeout> | undefined;
  /** the once-more is spent (until it decodes: the next time it fails it has its once-more again) */
  retried: boolean;
  /** given up on: its pictures keep the drawn icon */
  failed: boolean;
  /** the blob URL of an <img> it was decoded in, where createImageBitmap couldn't */
  url: string;
  /** its file has come once: the HTTP cache has it */
  fetched: boolean;
  /** the times it didn't come when fetched ahead of the panels (fetchAhead): AHEAD_TRIES of them, and it waits for a panel */
  aheadFails: number;
}
const atlases = new Map<string, Atlas>();
let decodedNow = 0;
const slotWaiters: { atlas: Atlas; go: () => void }[] = [];
/** atlas files coming for cuts that wait on them (not those fetched ahead): what is fetched ahead waits for them */
let fetchingForCuts = 0;
/** the end of the files' coming for cuts, while they do (holdOthers) */
let cutsFetched: (() => void) | null = null;
/** told, as cuts begin to wait on atlas files, until when they do (holdOthers) */
let holdFor: ((until: Promise<void>) => void) | null = null;
/** the atlas coming ahead of the panels, and how to stop it (one a cut doesn't want makes way for those it does) */
let aheadNow: { a: Atlas; f: Promise<Blob>; ctl: AbortController; stopped: boolean } | null = null;

/**
 * While cuts wait on atlas files (a panel's pictures), `hold` is told until when: the UI holds the
 * model downloads nothing waits on back meanwhile (assets.hold), as what the player opened goes first
 */
export function holdOthers(hold: (until: Promise<void>) => void) {
  holdFor = hold;
}

function atlasNamed(name: string): Atlas {
  let a = atlases.get(name);
  if (!a) {
    a = { name, file: null, decoded: null, slot: false, users: 0, timer: undefined, retried: false, failed: false, url: '', fetched: false, aheadFails: 0 };
    atlases.set(name, a);
  }
  return a;
}

function atlasUrl(name: string): string {
  return `${import.meta.env.BASE_URL}icons/items/${name}.webp?v=${ITEM_ATLASES[name]}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * the atlas's file, given up on after TIMEOUT_MS (or stopped by `ctl`). Its URL carries its version,
 * so any copy in the HTTP cache is the right one (force-cache: no revalidating); reload goes past it,
 * a broken copy may be there. For cuts: what holds back for them is told (holdOthers), and an atlas
 * coming ahead that no cut wants stops, to come later; or `ahead` of them
 */
async function fetchAtlas(a: Atlas, reload: boolean, ahead = false, ctl = new AbortController()): Promise<Blob> {
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  if (!ahead) {
    if (!fetchingForCuts++) holdFor?.(new Promise<void>((r) => (cutsFetched = r)));
    const now = aheadNow;
    if (now && now.a !== a && !now.a.users) {
      now.stopped = true;
      // a cut that comes for it later fetches it afresh
      if (now.a.file === now.f) now.a.file = null;
      now.ctl.abort();
    }
  }
  try {
    const res = await fetch(atlasUrl(a.name), { signal: ctl.signal, cache: reload ? 'reload' : 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = await res.blob();
    a.fetched = true;
    if (ahead) {
      PIC_STATS.ahead++;
      PIC_STATS.aheadKB += file.size / 1024;
    } else {
      PIC_STATS.atlases++;
      PIC_STATS.atlasKB += file.size / 1024;
    }
    return file;
  } finally {
    clearTimeout(timer);
    if (!ahead && !--fetchingForCuts) {
      cutsFetched?.();
      cutsFetched = null;
    }
  }
}

/** a file decoded off the main thread: an ImageBitmap, or an <img> where the engine can't make one of a WebP */
async function decode(a: Atlas, file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // an older engine decodes some formats only in an <img>
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  a.url = url;
  return img;
}

/** a decoding slot for this atlas: one of the MAX_DECODED, or an idle atlas's */
function takeSlot(a: Atlas): Promise<void> {
  return new Promise((go) => {
    slotWaiters.push({ atlas: a, go });
    passSlots();
  });
}
function passSlots() {
  while (slotWaiters.length) {
    if (decodedNow < MAX_DECODED) {
      decodedNow++;
      const w = slotWaiters.shift()!;
      w.atlas.slot = true;
      w.go();
      continue;
    }
    // one decoded with nothing left to cut gives its slot up at once
    const idle = [...atlases.values()].find((x) => x.slot && x.users === 0);
    if (!idle) return;
    close(idle);
  }
}
/** the decoded atlas let go (a later picture fetches it again, from the HTTP cache) */
function close(a: Atlas) {
  clearTimeout(a.timer);
  a.timer = undefined;
  if (!a.slot) return;
  a.slot = false;
  decodedNow--;
  const d = a.decoded;
  const url = a.url;
  a.decoded = null;
  a.url = '';
  d?.then(
    (s) => {
      if ('close' in s) s.close();
      if (url) URL.revokeObjectURL(url);
    },
    () => undefined,
  );
}

/**
 * decoded for the cuts waiting: its file (fetched at once, whatever the slots; or the one coming
 * ahead of them already), then a slot; tried once more after RETRY_MS, then given up on
 */
function decoded(a: Atlas): Promise<Source> {
  if (a.decoded) return a.decoded;
  const file = () => (a.file ??= fetchAtlas(a, a.retried));
  file().catch(() => undefined);
  const d = (async () => {
    for (;;) {
      try {
        const f = await file();
        await takeSlot(a);
        try {
          const src = await decode(a, f);
          PIC_STATS.decoded++;
          // the decoded atlas is what the cuts need: the file isn't held on to as well
          a.file = null;
          // came on its once-more: a good copy is in the HTTP cache now, read from there next time (not
          // fetched again past it), and a later failure has its once-more again
          a.retried = false;
          return src;
        } catch (e) {
          a.slot = false;
          decodedNow--;
          passSlots();
          throw e;
        }
      } catch (e) {
        // a file that came but wouldn't decode is fetched again too: the copy may be broken
        a.file = null;
        if (a.retried) {
          a.failed = true;
          PIC_STATS.atlasesFailed++;
          console.warn(`item pictures: atlas ${a.name} didn't load (${e instanceof Error ? e.message : String(e)}); its items keep their drawn icons`);
          throw e;
        }
        a.retried = true;
        await sleep(RETRY_MS);
      }
    }
  })();
  a.decoded = d;
  d.catch(() => {
    if (a.decoded === d) a.decoded = null;
  });
  return d;
}

/** a cut done with the atlas: when none is left, it is let go now if another waits to decode, else after KEEP_MS */
function release(a: Atlas) {
  if (--a.users > 0 || !a.slot) return;
  if (slotWaiters.length) {
    close(a);
    passSlots();
    return;
  }
  clearTimeout(a.timer);
  a.timer = setTimeout(() => {
    if (a.users === 0) close(a);
    passSlots();
  }, KEEP_MS);
}

let canvas: HTMLCanvasElement | null = null;
/** the scratch canvas at this size, clear (toBlob takes its copy at once, so the next job may reuse it) */
function scratch(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  canvas ??= document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d', { willReadFrequently: true })!];
}

/** a picture out of its atlas at this screen's scale: the 2x as it is, or drawn down to 1x and sharpened */
function drawCut(src: Source, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const t = performance.now();
  const one = scale() === '1x';
  const cw = one ? w / 2 : w;
  const ch = one ? h / 2 : h;
  const [c, ctx] = scratch(cw, ch);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, x, y, w, h, 0, 0, cw, ch);
  if (one) {
    const d = ctx.getImageData(0, 0, cw, ch);
    sharpen(d.data, cw, ch);
    ctx.putImageData(d, 0, 0);
  }
  PIC_STATS.cut++;
  PIC_STATS.cutMs += performance.now() - t;
  return c;
}

// ── what is kept: the blobs of the cuts and looks ──
/**
 * a cut or a look kept as WebP at this quality: every picture's cut weighs no more than its own file
 * did before the atlases (at 2x 1844 KB in all against 1917, 4.6 KB a picture; at 1x 821 KB against
 * 825; a lossless PNG is 15 KB at 2x), 41 dB from the cut at worst (Chromium, 2026-10-29)
 */
const WEBP_QUALITY = 0.87;
/**
 * the blobs kept past this many bytes: the least recently drawn that no <img> shows are let go (made
 * again if drawn again). Every picture's cut as WebP comes to 1.8 MB, a little under their own files;
 * a browser that hands back PNG for WebP (Safari) keeps some 160 pictures' cuts and looks
 */
const BLOB_BUDGET = 2.5 * 1024 * 1024;

/** a blob kept: its bytes, when it was last drawn, the look it shows (ready) and the file it is the cut of (images) */
interface Kept {
  bytes: number;
  drawn: number;
  key: string | null;
  file: string | null;
}
/** the blobs kept, by URL */
const kept = new Map<string, Kept>();
let keptBytes = 0;

/** the canvas as a WebP blob where the browser encodes one (PNG where it doesn't), decoded: an <img> of it, and the blob's size */
function blobImage(c: HTMLCanvasElement): Promise<{ img: HTMLImageElement; bytes: number }> {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('no blob'));
        PIC_STATS.blobType = blob.type;
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        img.decode().then(
          () => resolve({ img, bytes: blob.size }),
          () => resolve({ img, bytes: blob.size }),
        );
      },
      'image/webp',
      WEBP_QUALITY,
    ),
  );
}

/** a blob URL kept, for the look `key` or as the cut of `file`; past BLOB_BUDGET, the least recently drawn that nothing shows let go */
function keep(url: string, bytes: number, key: string | null, file: string | null) {
  kept.set(url, { bytes, drawn: performance.now(), key, file });
  keptBytes += bytes;
  PIC_STATS.kept = kept.size;
  PIC_STATS.keptKB = keptBytes / 1024;
  if (keptBytes > BLOB_BUDGET) trimKept();
}

/** a look shown again: the last its blob was drawn */
function drawn(url: string) {
  const k = kept.get(url);
  if (k) k.drawn = performance.now();
}

/** a blob drawn (or made) this recently is kept whatever the budget: it is on its way to an <img> */
const FRESH_MS = 2000;

/**
 * the least recently drawn blobs that no <img> shows let go until the kept are under BLOB_BUDGET:
 * their URLs revoked, their looks and cuts forgotten (an item drawn with one again has it made anew);
 * one just made or drawn, or waiting to be swapped in, is kept
 */
function trimKept() {
  const shown = new Set<string>();
  for (const img of document.images) shown.add(img.src);
  const now = performance.now();
  const free = [...kept].filter(([url, k]) => !shown.has(url) && now - k.drawn > FRESH_MS && !(k.key && swaps.has(k.key))).sort((a, b) => a[1].drawn - b[1].drawn);
  for (const [url, k] of free) {
    if (keptBytes <= BLOB_BUDGET) break;
    kept.delete(url);
    keptBytes -= k.bytes;
    URL.revokeObjectURL(url);
    PIC_STATS.released++;
    if (k.key && ready.get(k.key) === url) ready.delete(k.key);
    if (k.file && cutUrls.get(k.file) === url) {
      cutUrls.delete(k.file);
      images.delete(k.file);
    }
  }
  PIC_STATS.kept = kept.size;
  PIC_STATS.keptKB = keptBytes / 1024;
}

/** the blob URL of each picture's cut, by file */
const cutUrls = new Map<string, string>();

/** a picture cut out of its atlas, once its atlas is decoded: an <img> of the cut */
function cutPicture(file: string): Promise<HTMLImageElement> {
  const [name, x, y, w, h] = ITEM_PICTURES[file];
  const at = atlasNamed(name);
  if (at.failed) return Promise.reject(new Error(`atlas ${name} didn't load`));
  at.users++;
  clearTimeout(at.timer);
  return decoded(at).then(
    (src) =>
      new Promise<HTMLImageElement>((resolve, reject) =>
        queue('cut', () => {
          let c: HTMLCanvasElement;
          try {
            c = drawCut(src, x, y, w, h);
          } catch (e) {
            release(at);
            return reject(e);
          }
          release(at);
          blobImage(c).then(({ img, bytes }) => {
            cutUrls.set(file, img.src);
            // a plain picture's look is its cut (request)
            keep(img.src, bytes, file, file);
            resolve(img);
          }, reject);
        }),
      ),
    (e) => {
      release(at);
      throw e;
    },
  );
}

function image(file: string): Promise<HTMLImageElement> {
  let p = images.get(file);
  if (!p) {
    p = cutPicture(file);
    p.catch(() => PIC_STATS.failed++);
    images.set(file, p);
  }
  return p;
}

/** the <img>s waiting for a look swap to it, a frame's worth at once */
const swaps = new Set<string>();
function swapIn(key: string) {
  swaps.add(key);
  if (swaps.size === 1) queue('swap', swapNow);
}
function swapNow() {
  for (const key of swaps) {
    const url = ready.get(key);
    if (!url) continue;
    drawn(url);
    for (const img of document.querySelectorAll<HTMLImageElement>(`img[data-pic="${CSS.escape(key)}"]`)) {
      img.src = url;
      img.removeAttribute('data-pic');
      PIC_STATS.swapped++;
    }
  }
  swaps.clear();
}
/** the <img>s of a look that failed keep the drawn icon and wait no more */
function unwait(key: string) {
  for (const img of document.querySelectorAll<HTMLImageElement>(`img[data-pic="${CSS.escape(key)}"]`)) img.removeAttribute('data-pic');
}

/** the cut, recoloured and numbered as the look says, as a blob URL decoded and ready */
function make(look: Look, img: HTMLImageElement): Promise<string> {
  const t = performance.now();
  const [c, ctx] = scratch(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  if (look.pic.colour) {
    const data = ctx.getImageData(0, 0, c.width, c.height);
    recolourPixels(data.data, look.pic.colour.code, look.pic.colour.invTrans);
    ctx.putImageData(data, 0, 0);
  }
  if (look.rune) drawRuneNumber(ctx, c.width, c.height, look.rune);
  PIC_STATS.made++;
  PIC_STATS.makeMs += performance.now() - t;
  return blobImage(c).then(({ img: i, bytes }) => {
    keep(i.src, bytes, look.key, null);
    return i.src;
  });
}

/** a rune's number on its blank stone, carved and lit like the socket's numbers (RUNE_COLOR) */
function drawRuneNumber(ctx: CanvasRenderingContext2D, w: number, h: number, n: string) {
  const s = Math.min(w, h);
  ctx.save();
  ctx.font = `700 ${Math.round(s * (n.length > 1 ? 0.4 : 0.46))}px Cinzel, "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, s * 0.06);
  ctx.strokeStyle = 'rgba(20, 10, 4, 0.85)';
  const x = w / 2;
  const y = h / 2 + s * 0.03;
  ctx.strokeText(n, x, y);
  ctx.shadowColor = 'rgba(255, 140, 30, 0.75)';
  ctx.shadowBlur = s * 0.08;
  ctx.fillStyle = '#ffb03a';
  ctx.fillText(n, x, y);
  ctx.restore();
}

function request(look: Look) {
  const plain = !look.pic.colour && !look.rune;
  image(look.pic.file)
    .then(async (img) => {
      if (plain) return img.src;
      if (look.rune) await document.fonts?.load('700 20px Cinzel').catch(() => undefined);
      return new Promise<string>((resolve, reject) => queue('make', () => make(look, img).then(resolve, reject)));
    })
    .then(
      (url) => {
        ready.set(look.key, url);
        swapIn(look.key);
      },
      () => {
        failed.add(look.key);
        unwait(look.key);
      },
    )
    .finally(() => making.delete(look.key));
}

/**
 * The <img> for an item in a cell, a slot, the belt or on the cursor: its painted picture when that
 * is in, else the drawn icon, swapped for the picture when it comes
 */
export function itemImg(item: Item): string {
  const look = lookFor(item);
  if (!look) return `<img src="${itemIcon(item)}" alt="" />`;
  const url = ready.get(look.key);
  if (url) {
    drawn(url);
    return `<img src="${url}" alt="" />`;
  }
  if (failed.has(look.key)) return `<img src="${itemIcon(item)}" alt="" />`;
  // asked for after this frame's drawing: the panel's draw does no more than it did with drawn icons
  if (!making.has(look.key)) {
    making.add(look.key);
    queue('request', () => request(look));
  }
  return `<img src="${itemIcon(item)}" data-pic="${look.key}" alt="" />`;
}

/** what an item shows when drawn: its look's key, or null for the drawn icon (tests and scenarios) */
export function itemLookKey(item: Item): string | null {
  return lookFor(item)?.key ?? null;
}

/** pictures still being loaded or made */
export function picturesPending(): number {
  return making.size + jobs.length;
}

// ── the atlases fetched ahead of the panels ──
/** the longest an idle moment is waited for before the next atlas is fetched ahead (a frame that's always busy doesn't hold them back for good) */
const AHEAD_IDLE_MS = 1000;
/** while the game can't spare the network, or a panel's atlases are coming, looked at again this much later */
const AHEAD_WAIT_MS = 500;
/** an atlas that didn't come ahead: the next fetched ahead this much later (the network may be down for a while), */
const AHEAD_FAILED_MS = 8000;
/** and it is fetched ahead this many times at most, then left for a panel to ask for */
const AHEAD_TRIES = 2;
/** the kinds of thing fetched ahead first after the hero's own: what drops and is sold most, small (the rest by name, the uniques' and set items' last) */
const AHEAD_FIRST = ['potions', 'gems', 'runes', 'jewellery'];
/** ?dev&noahead: nothing fetched ahead (tools/scenarios/icons.mjs counts an atlas's requests) */
const NO_AHEAD = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('noahead');

let ahead: { mine: () => Iterable<Item | null | undefined>; mayGo: () => boolean } | null = null;
/** the next look is waited for, or an atlas is coming ahead */
let aheadOn = false;

/**
 * Once a game is on (the UI calls this as it starts), the atlases fetched one at a time into the HTTP
 * cache ahead of the panels, in idle moments: first those the items `mine` gives show (the hero's own,
 * asked again before each, in the order they're likely shown), then the rest. Each only while `mayGo`
 * (the game on, no level's veil files or tile textures coming) and no panel's atlases are coming (one
 * coming ahead that the panel doesn't want stops for them, to come after); none already fetched or
 * given up on; one that doesn't come is tried again later, once. A cut that wants one on its way takes
 * that download; once in, it isn't held on to: the cut that wants it later reads it from the HTTP cache
 */
export function fetchAhead(mine: () => Iterable<Item | null | undefined>, mayGo: () => boolean) {
  if (NO_AHEAD) return;
  ahead = { mine, mayGo };
  if (!aheadOn) aheadLater(0);
}

function aheadLater(ms: number) {
  aheadOn = true;
  const idle = () => (typeof requestIdleCallback === 'function' ? requestIdleCallback(aheadStep, { timeout: AHEAD_IDLE_MS }) : setTimeout(aheadStep, 50));
  if (ms) setTimeout(idle, ms);
  else idle();
}

/** the atlases the pictures are in now, in the order they're fetched ahead after the hero's own */
function aheadOrder(): string[] {
  const names = [...new Set(Object.values(ITEM_PICTURES).map((r) => r[0]))];
  const rank = (n: string) => (AHEAD_FIRST.includes(n) ? AHEAD_FIRST.indexOf(n) : n === 'sets' || n.startsWith('uniques') ? 99 : 50);
  return names.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** the next atlas to fetch ahead: the first the hero's items show that isn't in or coming, else the first of the rest */
function nextAhead(mine: Iterable<Item | null | undefined>): string | null {
  const due = (name: string) => {
    const a = atlases.get(name);
    return !a || (!a.fetched && a.aheadFails < AHEAD_TRIES && !a.failed && !a.file && !a.decoded);
  };
  for (const it of mine) {
    const file = it && pictureOf(it);
    const at = file ? ITEM_PICTURES[file] : undefined;
    if (at && due(at[0])) return at[0];
  }
  return aheadOrder().find(due) ?? null;
}

function aheadStep() {
  const ah = ahead;
  if (!ah) {
    aheadOn = false;
    return;
  }
  if (!ah.mayGo() || fetchingForCuts > 0) return aheadLater(AHEAD_WAIT_MS);
  const name = nextAhead(ah.mine());
  // all fetched: a later game's hero finds them in the cache too
  if (!name) {
    aheadOn = false;
    return;
  }
  const a = atlasNamed(name);
  const ctl = new AbortController();
  const f = fetchAtlas(a, false, true, ctl);
  const now = (aheadNow = { a, f, ctl, stopped: false });
  a.file = f;
  const done = (came: boolean) => {
    if (aheadNow === now) aheadNow = null;
    // in the HTTP cache now (or not come): not held on to unless a cut has come for it meanwhile
    if (a.file === f && !a.users) a.file = null;
    // stopped for a panel's atlases (fetchAtlas): no failure, fetched again once they're in
    if (!came && !now.stopped) a.aheadFails++;
    aheadLater(came || now.stopped ? 0 : AHEAD_FAILED_MS);
  };
  f.then(
    () => done(true),
    () => done(false),
  );
}

/** the atlases with pictures not yet fetched (ahead or for cuts) nor given up on, for the scenarios */
function aheadLeft(): number {
  return aheadOrder().filter((n) => !atlases.get(n)?.fetched && !atlases.get(n)?.failed).length;
}

// the scenarios read the game's own copy of this module (a dynamic import of it can be another copy after an edit)
if (import.meta.env.DEV) Object.assign(globalThis, { __itempics: { PIC_STATS, picturesPending, itemLookKey, ITEM_PICTURES, aheadLeft } });
