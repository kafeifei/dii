// The painted item pictures in the UI (public/icons/items, src/data/itempics.ts), chosen and coloured
// by D2's rules (src/items/picture.ts). An item's <img> shows the code-drawn icon (icons.ts) until its
// picture is in, then the picture: no blank cell, nothing moving (every cell sizes its <img> itself).
// A picture is asked for only when a panel draws an item that shows it, so opening the stash loads
// that page's and no more; each is decoded off the main thread (img.decode) before it is swapped in,
// and the work done here (a recolour, a rune's number) runs a few milliseconds a frame.
//
// A coloured picture is the painting shifted by src/ui/recolour.ts (our approximation of D2's
// palette shifts) and a rune's has its number drawn on the stone; each is made once per (picture,
// colour, InvTrans ranges) and kept as a blob URL. A picture that doesn't load keeps the drawn icon.
import { RUNE_BY_ID } from '../data/legendary';
import { ITEM_PICTURES } from '../data/itempics';
import type { Item } from '../items/item';
import { itemPicture, type ItemPicture } from '../items/picture';
import { itemIcon } from './icons';
import { rangesOf, recolourPixels } from './recolour';

/** what the pictures cost, for tools/scenarios/icons.mjs: counts, and the longest piece of work in a frame */
export const PIC_STATS = { files: 0, loaded: 0, failed: 0, made: 0, makeMs: 0, longestMs: 0, longest: '', swapped: 0, scale: '' };

/** 1x (a cell 34 px, sharpened) on a screen of a pixel per CSS pixel, else 2x (68 px a cell) */
function scale(): '1x' | '2x' {
  if (!PIC_STATS.scale) PIC_STATS.scale = (globalThis.devicePixelRatio ?? 1) > 1.25 ? '2x' : '1x';
  return PIC_STATS.scale as '1x' | '2x';
}

function fileUrl(file: string): string {
  return `${import.meta.env.BASE_URL}icons/items/${file}${scale() === '1x' ? '.1x' : ''}.webp?v=${ITEM_PICTURES[file]}`;
}

/** what an item's <img> shows once ready: its key, the file, the colour, a rune's number */
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
/** the decoded paintings, by file */
const images = new Map<string, Promise<HTMLImageElement>>();

function image(file: string): Promise<HTMLImageElement> {
  let p = images.get(file);
  if (!p) {
    PIC_STATS.files++;
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
      img.onerror = () => reject(new Error(`no picture ${file}`));
      img.src = fileUrl(file);
    });
    p.then(
      () => PIC_STATS.loaded++,
      () => PIC_STATS.failed++,
    );
    images.set(file, p);
  }
  return p;
}

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

let canvas: HTMLCanvasElement | null = null;
/** the painting drawn, recoloured and numbered as the look says, as a blob URL decoded and ready */
function make(look: Look, img: HTMLImageElement): Promise<string> {
  const t = performance.now();
  canvas ??= document.createElement('canvas');
  const c = canvas;
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  if (look.pic.colour) {
    const data = ctx.getImageData(0, 0, c.width, c.height);
    recolourPixels(data.data, look.pic.colour.code, look.pic.colour.invTrans);
    ctx.putImageData(data, 0, 0);
  }
  if (look.rune) drawRuneNumber(ctx, c.width, c.height, look.rune);
  PIC_STATS.made++;
  PIC_STATS.makeMs += performance.now() - t;
  return new Promise<string>((resolve, reject) =>
    c.toBlob((blob) => {
      if (!blob) return reject(new Error('no blob'));
      const url = URL.createObjectURL(blob);
      const pre = new Image();
      pre.src = url;
      pre.decode().then(
        () => resolve(url),
        () => resolve(url),
      );
    }, 'image/png'),
  );
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
      () => failed.add(look.key),
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
if (import.meta.env.DEV) Object.assign(globalThis, { __itempics: { PIC_STATS, picturesPending, itemLookKey } });
