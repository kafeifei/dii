import type { P2 } from '../core/math';
import type { TileMap } from './tilemap';

/**
 * A binary heap of tile indices by priority, kept for every path (findPath empties it first): its
 * arrays only ever grow, so a path costs no allocation once the first few long ones have run.
 */
class MinHeap {
  private items = new Int32Array(1024);
  private prio = new Float64Array(1024);
  size = 0;
  clear() {
    this.size = 0;
  }
  push(item: number, p: number) {
    if (this.size === this.items.length) {
      const items = new Int32Array(this.size * 2);
      const prio = new Float64Array(this.size * 2);
      items.set(this.items);
      prio.set(this.prio);
      this.items = items;
      this.prio = prio;
    }
    const items = this.items;
    const prio = this.prio;
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (prio[parent] <= p) break;
      items[i] = items[parent];
      prio[i] = prio[parent];
      i = parent;
    }
    items[i] = item;
    prio[i] = p;
  }
  pop(): number {
    const items = this.items;
    const prio = this.prio;
    const top = items[0];
    const n = --this.size;
    if (n > 0) {
      const lastI = items[n];
      const lastP = prio[n];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && prio[r] < prio[l] ? r : l;
        if (prio[m] >= lastP) break;
        items[i] = items[m];
        prio[i] = prio[m];
        i = m;
      }
      items[i] = lastI;
      prio[i] = lastP;
    }
    return top;
  }
  get capacity() {
    return this.items.length;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

// buffers kept from path to path and from map to map: they grow to the biggest map walked and no
// more, and a tile counts only when stamped with the current path's number, so nothing is cleared
let gScore = new Float32Array(0);
let came = new Int32Array(0);
let stamp = new Uint32Array(0);
let closedStamp = new Uint32Array(0);
let curStamp = 1;
const open = new MinHeap();

/** how big the kept buffers are (tiles, heap entries), for the tests */
export function pathBuffers(): { tiles: number; heap: number } {
  return { tiles: gScore.length, heap: open.capacity };
}

/**
 * A* over the tile grid with 8-dir movement (no corner cutting).
 * Returns smoothed world-space waypoints (excluding start), or null.
 */
export function findPath(map: TileMap, from: P2, to: P2, maxNodes = 4000, radius = 0.3): P2[] | null {
  const n = map.w * map.h;
  if (gScore.length < n) {
    gScore = new Float32Array(n);
    came = new Int32Array(n);
    stamp = new Uint32Array(n);
    closedStamp = new Uint32Array(n);
  }
  curStamp++;
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.z);
  let goal = to;
  if (!map.walkableAt(to.x, to.z)) {
    const nw = map.nearestWalkable(to.x, to.z);
    if (!nw) return null;
    goal = nw;
  }
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.z);
  if (sx === gx && sy === gy) return [goal];
  if (map.los(from, goal, radius)) return [goal];

  const start = sy * map.w + sx;
  const target = gy * map.w + gx;
  open.clear();
  gScore[start] = 0;
  stamp[start] = curStamp;
  came[start] = -1;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  open.push(start, h(sx, sy));
  let expanded = 0;
  let found = false;
  let bestNode = start;
  let bestH = h(sx, sy);
  while (open.size > 0) {
    const cur = open.pop();
    if (closedStamp[cur] === curStamp) continue;
    closedStamp[cur] = curStamp;
    if (cur === target) {
      found = true;
      break;
    }
    if (++expanded > maxNodes) break;
    const cx = cur % map.w;
    const cy = (cur / map.w) | 0;
    const ch = h(cx, cy);
    if (ch < bestH) {
      bestH = ch;
      bestNode = cur;
    }
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!map.walkable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!map.walkable(cx + dx, cy) || !map.walkable(cx, cy + dy))) continue;
      const ni = ny * map.w + nx;
      if (closedStamp[ni] === curStamp) continue;
      const g = gScore[cur] + cost;
      if (stamp[ni] !== curStamp || g < gScore[ni]) {
        stamp[ni] = curStamp;
        gScore[ni] = g;
        came[ni] = cur;
        open.push(ni, g + h(nx, ny));
      }
    }
  }
  const endNode = found ? target : bestNode;
  if (endNode === start) return null;
  const tiles: P2[] = [];
  let c = endNode;
  while (c !== -1 && c !== start) {
    tiles.push({ x: (c % map.w) + 0.5, z: ((c / map.w) | 0) + 0.5 });
    c = came[c];
  }
  tiles.reverse();
  if (found) tiles[tiles.length - 1] = goal;
  return smooth(map, from, tiles, radius);
}

function smooth(map: TileMap, from: P2, pts: P2[], radius: number): P2[] {
  if (pts.length <= 1) return pts;
  const out: P2[] = [];
  let anchor = from;
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && map.los(anchor, pts[j + 1], radius)) j++;
    out.push(pts[j]);
    anchor = pts[j];
    i = j + 1;
  }
  return out;
}
