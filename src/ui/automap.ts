import { SHRINE_BY_ID } from '../data/shrines';
import type { Game } from '../game/game';
import { T_FLOOR, T_PROP, T_WALL } from '../world/tilemap';
import { levelLabel } from '../world/levelgen';
import { h } from './common';

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

  private updateExplored() {
    const g = this.game;
    const map = g.level.map;
    const p = g.player;
    const R = 9;
    const cx = Math.floor(p.pos.x);
    const cy = Math.floor(p.pos.z);
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (!map.inBounds(x, y)) continue;
        if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
        map.explored[y * map.w + x] = 1;
      }
    }
  }

  private drawMapTo(ctx: CanvasRenderingContext2D, scale: number, cxW: number, cyW: number, rTiles: number, canvasW: number, canvasH: number) {
    const g = this.game;
    const map = g.level.map;
    ctx.clearRect(0, 0, canvasW, canvasH);
    const ox = canvasW / 2 - cxW * scale;
    const oy = canvasH / 2 - cyW * scale;
    const x0 = Math.max(0, Math.floor(cxW - rTiles));
    const x1 = Math.min(map.w - 1, Math.ceil(cxW + rTiles));
    const y0 = Math.max(0, Math.floor(cyW - rTiles));
    const y1 = Math.min(map.h - 1, Math.ceil(cyW + rTiles));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * map.w + x;
        if (!map.explored[i]) continue;
        const t = map.tiles[i];
        if (t === T_FLOOR || t === T_PROP) {
          ctx.fillStyle = t === T_PROP ? 'rgba(150,130,100,0.45)' : 'rgba(120,110,90,0.28)';
          ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        } else if (t === T_WALL) {
          ctx.fillStyle = 'rgba(200,180,140,0.85)';
          ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
        }
      }
    }
    const dot = (wx: number, wz: number, color: string, r: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox + wx * scale, oy + wz * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const o of g.level.objects) {
      // the way out of the camp is always marked, explored or not
      const campExit = o.kind === 'exit' && g.level.depth === 0;
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
    for (const m of g.level.monsters) {
      if (m.dead || Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) > 12) continue;
      dot(m.pos.x, m.pos.z, m.rank === 'boss' || m.rank === 'unique' ? '#ffb040' : '#d02020', Math.max(1.5, scale * 0.6));
    }
    dot(p.pos.x, p.pos.z, '#ffffff', Math.max(2, scale * 0.9));
  }

  private drawMinimap() {
    const ctx = this.minimap.getContext('2d')!;
    const p = this.game.player;
    this.drawMapTo(ctx, 4, p.pos.x, p.pos.z, 32, 240, 240);
    this.minimapLabel.textContent = levelLabel(this.game.level.depth);
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
    this.drawMapTo(c.getContext('2d')!, scale, map.w / 2, map.h / 2, Math.max(map.w, map.h), size, size);
  }
}
