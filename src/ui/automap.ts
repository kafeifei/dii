import { SHRINE_BY_ID } from '../data/shrines';
import type { Game } from '../game/game';
import { T_FLOOR, T_PROP, T_WALL, type TileMap } from '../world/tilemap';
import { h } from './common';

/** how an explored tile shows on the maps, by its kind: [r, g, b, alpha 0-1] */
const TILE_COLOR: Record<number, [number, number, number, number]> = {
  [T_FLOOR]: [120, 110, 90, 0.28],
  [T_PROP]: [150, 130, 100, 0.45],
  [T_WALL]: [200, 180, 140, 0.85],
};
/** the same as a pixel's bytes, and as a fill */
const TILE_RGBA: Record<number, [number, number, number, number]> = Object.fromEntries(Object.entries(TILE_COLOR).map(([k, [r, g, b, a]]) => [k, [r, g, b, Math.round(a * 255)]]));
const TILE_FILL: Record<number, string> = Object.fromEntries(Object.entries(TILE_COLOR).map(([k, [r, g, b, a]]) => [k, `rgba(${r},${g},${b},${a})`]));

/**
 * The explored tiles of one map, a pixel each, drawn as they are explored and never again: the maps
 * copy the part they show from it, so a big map costs no more to draw than a small one.
 */
class ExploredLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  /** the box of tiles drawn since the last flush: x0, y0, x1, y1 */
  private dirty = [Infinity, Infinity, -Infinity, -Infinity];

  constructor(readonly map: TileMap) {
    this.canvas = h('canvas');
    this.canvas.width = map.w;
    this.canvas.height = map.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(map.w, map.h);
    // a map kept from earlier comes back explored as far as it was
    for (let i = 0; i < map.explored.length; i++) if (map.explored[i]) this.draw(i % map.w, (i / map.w) | 0);
    this.flush();
  }

  /** tile x, y explored: into the picture (flush puts it on the canvas) */
  draw(x: number, y: number) {
    const i = y * this.map.w + x;
    const c = TILE_RGBA[this.map.tiles[i]];
    if (!c) return;
    this.img.data.set(c, i * 4);
    const d = this.dirty;
    d[0] = Math.min(d[0], x);
    d[1] = Math.min(d[1], y);
    d[2] = Math.max(d[2], x);
    d[3] = Math.max(d[3], y);
  }

  /** what was drawn since last time, onto the canvas */
  flush() {
    const [x0, y0, x1, y1] = this.dirty;
    if (x1 < x0) return;
    this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    this.dirty = [Infinity, Infinity, -Infinity, -Infinity];
  }
}

/**
 * The explored tiles of one map as the automap shows them, at its scale and offset, a square
 * filled for each tile as they are explored and kept. The automap's scale is seldom a whole number
 * of pixels (below 1 on a phone): a tile there covers parts of pixels, which a copy of the layer,
 * a pixel a tile, can't show the same (copied nearest-pixel, one-tile walls drop out below 1 and
 * tiles come out 1 or 2 pixels wide above it).
 */
class ScaledTiles {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  /** the fill last set (the context's own reads back reformatted) */
  private fill = '';

  constructor(
    readonly map: TileMap,
    readonly scale: number,
    readonly ox: number,
    readonly oy: number,
    size: number,
  ) {
    this.canvas = h('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    for (let i = 0; i < map.explored.length; i++) if (map.explored[i]) this.draw(i % map.w, (i / map.w) | 0);
  }

  /** whether it is the automap's picture for this map, scale and offset */
  fits(map: TileMap, scale: number, ox: number, oy: number, size: number): boolean {
    return this.map === map && this.scale === scale && this.ox === ox && this.oy === oy && this.canvas.width === size;
  }

  /** tile x, y explored: filled in */
  draw(x: number, y: number) {
    const fill = TILE_FILL[this.map.tiles[y * this.map.w + x]];
    if (!fill) return;
    if (this.fill !== fill) this.ctx.fillStyle = this.fill = fill;
    this.ctx.fillRect(this.ox + x * this.scale, this.oy + y * this.scale, this.scale, this.scale);
  }
}

/**
 * The maps: the minimap in the corner, with a shrine's blessing under it, and the automap Tab lays
 * over the screen. Both show the tiles the player has explored, which this marks as they go.
 */
export class Automap {
  /** the full-screen automap is up */
  isOpen = false;
  private timer = 0;
  private minimap: HTMLCanvasElement;
  private minimapLabel: HTMLElement;
  private blessingEl: HTMLElement;
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  /** the level's explored tiles, made anew for each map it is on */
  private layer: ExploredLayer | null = null;
  /** and as the automap shows them, made anew for each map and size of it */
  private full: ScaledTiles | null = null;
  /** the minimap's copy of the layer, to whole pixels, before the last part of a pixel's shift */
  private shifted = h('canvas');

  constructor(
    private game: Game,
    root: HTMLElement,
  ) {
    const r = root;
    const mm = h('div');
    mm.id = 'minimap';
    this.minimap = h('canvas');
    this.minimap.width = 240;
    this.minimap.height = 240;
    this.minimapLabel = h('div', 'lvl');
    mm.append(this.minimap, this.minimapLabel);
    r.appendChild(mm);
    // a shrine's blessing and the seconds it has left, under the minimap
    this.blessingEl = h('div');
    this.blessingEl.id = 'blessing';
    r.appendChild(this.blessingEl);

    this.el = h('div');
    this.el.id = 'automap';
    this.canvas = h('canvas');
    this.el.appendChild(this.canvas);
    r.appendChild(this.el);
  }

  /** every frame: explore around the player, the blessing, and the maps drawn again five times a second */
  update(dt: number) {
    this.updateExplored();
    const p = this.game.player;
    const bl = p.shrine && SHRINE_BY_ID[p.shrine.id];
    const blText = bl ? `${bl.name} ${Math.ceil(p.shrine!.left)}` : '';
    if (this.blessingEl.textContent !== blText) {
      this.blessingEl.textContent = blText;
      if (bl) this.blessingEl.style.color = bl.color;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.2;
      this.drawMinimap();
      if (this.isOpen) this.drawAutomap();
    }
    this.el.classList.toggle('open', this.isOpen);
  }

  /** the tiles around the player explored; the ones new to it drawn on the level's layer */
  private updateExplored() {
    const g = this.game;
    const map = g.level.map;
    if (this.layer?.map !== map) this.layer = new ExploredLayer(map);
    const p = g.player;
    const R = 9;
    const cx = Math.floor(p.pos.x);
    const cy = Math.floor(p.pos.z);
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (!map.inBounds(x, y)) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
        const i = y * map.w + x;
        if (map.explored[i]) continue;
        map.explored[i] = 1;
        this.layer.draw(x, y);
        if (this.full?.map === map) this.full.draw(x, y);
      }
    }
  }

  /** the map round (cxW, cyW) at `scale` pixels a tile; the explored tiles from `full` when it is this view's picture of them */
  private drawMapTo(ctx: CanvasRenderingContext2D, scale: number, cxW: number, cyW: number, rTiles: number, canvasW: number, canvasH: number, full?: ScaledTiles) {
    const g = this.game;
    const map = g.level.map;
    ctx.clearRect(0, 0, canvasW, canvasH);
    const ox = canvasW / 2 - cxW * scale;
    const oy = canvasH / 2 - cyW * scale;
    const x0 = Math.max(0, Math.floor(cxW - rTiles));
    const x1 = Math.min(map.w - 1, Math.ceil(cxW + rTiles));
    const y0 = Math.max(0, Math.floor(cyW - rTiles));
    const y1 = Math.min(map.h - 1, Math.ceil(cyW + rTiles));
    // the explored tiles in view: the picture made at this scale, or copied from the layer a tile to
    // `scale` pixels, kept square (the minimap's 4 is a whole number), to whole pixels; then shifted
    // the rest of the way smoothly, so their edges come out soft as the squares filled one by one did
    const layer = this.layer;
    if (full?.fits(map, scale, ox, oy, canvasW)) ctx.drawImage(full.canvas, 0, 0);
    else if (layer?.map === map && x1 >= x0 && y1 >= y0) {
      layer.flush();
      // the copy starts a pixel up and left of the canvas, for the edge the shift brings in
      const ix = Math.floor(ox) + 1;
      const iy = Math.floor(oy) + 1;
      const s = this.shifted;
      if (s.width !== canvasW + 2 || s.height !== canvasH + 2) {
        s.width = canvasW + 2;
        s.height = canvasH + 2;
      }
      const sc = s.getContext('2d')!;
      sc.clearRect(0, 0, s.width, s.height);
      sc.imageSmoothingEnabled = false;
      sc.drawImage(layer.canvas, x0, y0, x1 - x0 + 1, y1 - y0 + 1, ix + x0 * scale, iy + y0 * scale, (x1 - x0 + 1) * scale, (y1 - y0 + 1) * scale);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(s, ox - ix, oy - iy);
    }
    const dot = (wx: number, wz: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox + wx * scale, oy + wz * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const o of g.level.objects) {
      // the way out of the camp is always marked, explored or not
      const campExit = o.kind === 'exit' && g.level.inTown(o.pos);
      if (!campExit && !map.explored[Math.floor(o.pos.z) * map.w + Math.floor(o.pos.x)]) continue;
      if (campExit) {
        const k = (performance.now() / 1200) % 1;
        ctx.strokeStyle = `rgba(255, 120, 40, ${1 - k})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ox + o.pos.x * scale, oy + o.pos.z * scale, scale * (1.6 + k * 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (o.kind === 'stairs' || o.kind === 'exit') dot(o.pos.x, o.pos.z, '#ffd040', scale * 1.4);
      else if (o.kind === 'waypoint') dot(o.pos.x, o.pos.z, '#40a0ff', scale * 1.4);
      else if (o.kind === 'portal') dot(o.pos.x, o.pos.z, '#ff4040', scale * 1.2);
      else if (o.kind === 'vendor' || o.kind === 'stash') dot(o.pos.x, o.pos.z, '#40ff60', scale);
      else if (o.kind === 'shrine' && !o.used) dot(o.pos.x, o.pos.z, '#80e0ff', scale * 1.2);
    }
    const p = g.player;
    for (const m of g.level.monstersNear(p.pos, 12)) {
      if (m.dead || Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) > 12) continue;
      dot(m.pos.x, m.pos.z, m.rank === 'boss' || m.rank === 'unique' ? '#ffb040' : '#d02020', Math.max(1.5, scale * 0.6));
    }
    dot(p.pos.x, p.pos.z, '#ffffff', Math.max(2, scale * 0.9));
  }

  private drawMinimap() {
    const ctx = this.minimap.getContext('2d')!;
    const p = this.game.player;
    this.drawMapTo(ctx, 4, p.pos.x, p.pos.z, 32, 240, 240);
    const area = this.game.level.areaAt(p.pos.x, p.pos.z);
    this.minimapLabel.textContent = area.label ?? area.name;
  }

  private drawAutomap() {
    const map = this.game.level.map;
    const size = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.75);
    const c = this.canvas;
    if (c.width !== size) {
      c.width = size;
      c.height = size;
    }
    const scale = (size / Math.max(map.w, map.h)) * 0.95;
    const ox = size / 2 - (map.w / 2) * scale;
    const oy = size / 2 - (map.h / 2) * scale;
    if (!this.full?.fits(map, scale, ox, oy, size)) this.full = new ScaledTiles(map, scale, ox, oy, size);
    this.drawMapTo(c.getContext('2d')!, scale, map.w / 2, map.h / 2, Math.max(map.w, map.h), size, size, this.full);
  }
}
