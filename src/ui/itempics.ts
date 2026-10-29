// The painted item pictures in the UI, chosen and coloured by D2's rules (src/items/picture.ts). They
// ship packed in atlases, one kind of thing each (public/icons/items/<atlas>.webp; where each picture
// is: src/data/itempics.ts; tools/ai-icons.mjs writes both, tools/icons/atlas.mjs says what goes
// where). An item's <img> shows the code-drawn icon (icons.ts) until its picture is in, then the
// picture: no blank cell, nothing moving (every cell sizes its <img> itself).
//
// An atlas is fetched the first time a panel draws an item whose picture is in it, so opening the stash
// loads that page's atlases and no more. It is decoded off the main thread (createImageBitmap) and
// each picture is cut out of it once, in a canvas: the 2x picture as it is, or on a screen of one
// device pixel per CSS pixel drawn down to 1x and lightly sharpened as the exported 1x files were
// (src/ui/sharpen.ts). The cut is kept as a lossless blob URL; a decoded atlas is let go once no cut
// waits on it, and no more than two are decoded at once. An atlas that doesn't come or doesn't decode
// is asked for once more, then its pictures keep the drawn icon.
//
// A coloured picture is the cut shifted by src/ui/recolour.ts (our approximation of D2's palette
// shifts) and a rune's has its number drawn on the stone; each is made once per (picture, colour,
// InvTrans ranges) and kept as a blob URL. The work done here (a cut, a recolour, a rune's number)
// runs a few milliseconds a frame.
import { RUNE_BY_ID } from '../data/legendary';
import { ITEM_ATLASES, ITEM_PICTURES } from '../data/itempics';
import type { Item } from '../items/item';
import { itemPicture, type ItemPicture } from '../items/picture';
import { itemIcon } from './icons';
import { rangesOf, recolourPixels } from './recolour';
import { sharpen } from './sharpen';

/**
 * what the pictures cost, for tools/scenarios/icons.mjs: atlases fetched (their KB), decoded and
 * given up on; pictures cut (the ms it took) and failed; looks made; the longest piece of work in a frame
 */
export const PIC_STATS = {
  atlases: 0,
  atlasKB: 0,
  decoded: 0,
  atlasesFailed: 0,
  cut: 0,
  cutMs: 0,
  failed: 0,
  made: 0,
  makeMs: 0,
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
  /** the once-more is spent */
  retried: boolean;
  /** given up on: its pictures keep the drawn icon */
  failed: boolean;
  /** the blob URL of an <img> it was decoded in, where createImageBitmap couldn't */
  url: string;
}
const atlases = new Map<string, Atlas>();
let decodedNow = 0;
const slotWaiters: { atlas: Atlas; go: () => void }[] = [];

function atlasUrl(name: string): string {
  return `${import.meta.env.BASE_URL}icons/items/${name}.webp?v=${ITEM_ATLASES[name]}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * the atlas's file, given up on after TIMEOUT_MS. Its URL carries its version, so any copy in the HTTP
 * cache is the right one (force-cache: no revalidating); reload goes past it, a broken copy may be there
 */
async function fetchAtlas(name: string, reload: boolean): Promise<Blob> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(atlasUrl(name), { signal: ctl.signal, cache: reload ? 'reload' : 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = await res.blob();
    PIC_STATS.atlases++;
    PIC_STATS.atlasKB += file.size / 1024;
    return file;
  } finally {
    clearTimeout(timer);
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

/** decoded for the cuts waiting: its file (fetched at once, whatever the slots), then a slot; tried once more after RETRY_MS, then given up on */
function decoded(a: Atlas): Promise<Source> {
  if (a.decoded) return a.decoded;
  const file = () => (a.file ??= fetchAtlas(a.name, a.retried));
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

/** the canvas as a lossless PNG blob, decoded: an <img> of it */
function blobImage(c: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) =>
    c.toBlob((blob) => {
      if (!blob) return reject(new Error('no blob'));
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.decode().then(
        () => resolve(img),
        () => resolve(img),
      );
    }, 'image/png'),
  );
}

/** a picture cut out of its atlas, once its atlas is decoded: an <img> of the cut */
function cutPicture(file: string): Promise<HTMLImageElement> {
  const [name, x, y, w, h] = ITEM_PICTURES[file];
  let a = atlases.get(name);
  if (!a) {
    a = { name, file: null, decoded: null, slot: false, users: 0, timer: undefined, retried: false, failed: false, url: '' };
    atlases.set(name, a);
  }
  if (a.failed) return Promise.reject(new Error(`atlas ${name} didn't load`));
  const at = a;
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
          blobImage(c).then(resolve, reject);
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
  return blobImage(c).then((i) => i.src);
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
  if (url) return `<img src="${url}" alt="" />`;
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

// the scenarios read the game's own copy of this module (a dynamic import of it can be another copy after an edit)
if (import.meta.env.DEV) Object.assign(globalThis, { __itempics: { PIC_STATS, picturesPending, itemLookKey, ITEM_PICTURES } });
