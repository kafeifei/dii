import type { P2 } from '../core/math';

export const T_VOID = 0;
export const T_FLOOR = 1;
export const T_WALL = 2;
/** floor occupied by solid furniture: drawn as floor, blocks movement */
export const T_PROP = 3;

/** the rings round a spot, in metres, that TileMap.besideOpen looks on for one beside it: the last its reach */
const BESIDE = [0.8, 1.1, 1.4, 1.8, 2.3];

export class TileMap {
  readonly tiles: Uint8Array;
  readonly explored: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.tiles = new Uint8Array(w * h);
    this.explored = new Uint8Array(w * h);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return T_VOID;
    return this.tiles[y * this.w + x];
  }

  set(x: number, y: number, t: number) {
    if (this.inBounds(x, y)) this.tiles[y * this.w + x] = t;
  }

  walkable(x: number, y: number): boolean {
    return this.get(x, y) === T_FLOOR;
  }

  walkableAt(wx: number, wz: number): boolean {
    return this.walkable(Math.floor(wx), Math.floor(wz));
  }

  /**
   * This map with the `blocked` tiles (1 per tile, row by row) shut as well: walking, sight lines
   * and paths on it (resolveCircle, los, findPath) go round them. The tiles are this map's own, not
   * a copy, so the view never goes stale.
   */
  without(blocked: Uint8Array): TileMap {
    const view = Object.create(this) as TileMap;
    // get() is T_VOID off the map, so blocked[] is only read in bounds
    view.walkable = (x, y) => this.get(x, y) === T_FLOOR && !blocked[y * this.w + x];
    return view;
  }

  /** a circle of radius r centred at (wx,wz) is fully on walkable tiles */
  circleClear(wx: number, wz: number, r: number): boolean {
    return (
      this.walkableAt(wx - r, wz - r) &&
      this.walkableAt(wx + r, wz - r) &&
      this.walkableAt(wx - r, wz + r) &&
      this.walkableAt(wx + r, wz + r)
    );
  }

  /** straight-line visibility / walkability check (samples every 0.25 tiles) */
  los(a: P2, b: P2, radius = 0): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      if (radius > 0 ? !this.circleClear(x, z, radius) : !this.walkableAt(x, z)) return false;
    }
    return true;
  }

  /**
   * Where someone set down `step` from `from` stands: the walkable ground nearest that, if it is
   * within reach of `from` (BESIDE: the step is about 1.3 m) and `from` has an open way to it (`los`
   * `clear` wide); else the nearest spot to it round `from` that has one; else `from` itself. Never
   * past a wall, a tree or a rock beside `from`, as the walkable ground nearest the step alone can be,
   * nor farther off than a ring (travel.ts besidePortal, merc.ts besideHero)
   */
  besideOpen(from: P2, step: P2, clear: number): P2 {
    const want = { x: from.x + step.x, z: from.z + step.z };
    const near = this.nearestWalkable(want.x, want.z);
    if (near && Math.hypot(near.x - from.x, near.z - from.z) <= BESIDE.at(-1)! && this.los(from, near, clear)) return near;
    let best: P2 | null = null;
    let bestD = Infinity;
    for (const r of BESIDE) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const c = { x: from.x + Math.sin(a) * r, z: from.z + Math.cos(a) * r };
        const d = Math.hypot(c.x - want.x, c.z - want.z);
        if (d < bestD && this.circleClear(c.x, c.z, 0.3) && this.los(from, c, clear)) {
          best = c;
          bestD = d;
        }
      }
      if (best) return best;
    }
    return { ...from };
  }

  /** nearest walkable tile center to a world point (BFS-ish ring search) */
  nearestWalkable(wx: number, wz: number, maxR = 6): P2 | null {
    const cx = Math.floor(wx);
    const cy = Math.floor(wz);
    if (this.walkable(cx, cy)) return { x: wx, z: wz };
    let best: P2 | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          if (!this.walkable(x, y)) continue;
          const d = (x + 0.5 - wx) ** 2 + (y + 0.5 - wz) ** 2;
          if (d < bestD) {
            bestD = d;
            best = { x: x + 0.5, z: y + 0.5 };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** push a circle out of wall tiles. Returns corrected position. */
  resolveCircle(p: P2, r: number): P2 {
    let { x, z } = p;
    const minX = Math.floor(x - r) - 1;
    const maxX = Math.floor(x + r) + 1;
    const minY = Math.floor(z - r) - 1;
    const maxY = Math.floor(z + r) + 1;
    for (let iter = 0; iter < 2; iter++) {
      for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
          if (this.walkable(tx, ty)) continue;
          const cx = Math.max(tx, Math.min(x, tx + 1));
          const cz = Math.max(ty, Math.min(z, ty + 1));
          const dx = x - cx;
          const dz = z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              const push = r - d;
              x += (dx / d) * push;
              z += (dz / d) * push;
            } else {
              // center inside the tile: push toward nearest edge
              const left = x - tx;
              const right = tx + 1 - x;
              const top = z - ty;
              const bottom = ty + 1 - z;
              const m = Math.min(left, right, top, bottom);
              if (m === left) x = tx - r;
              else if (m === right) x = tx + 1 + r;
              else if (m === top) z = ty - r;
              else z = ty + 1 + r;
            }
          }
        }
      }
    }
    return { x, z };
  }
}
