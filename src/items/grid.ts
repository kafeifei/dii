import { baseOf, type Item } from './item';

export interface Placed {
  item: Item;
  x: number;
  y: number;
}

export class Grid {
  items: Placed[] = [];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {}

  size(item: Item): [number, number] {
    const b = baseOf(item);
    return [b.w, b.h];
  }

  /** items overlapping a rectangle */
  overlapping(x: number, y: number, w: number, h: number, ignore?: Item): Placed[] {
    return this.items.filter((p) => {
      if (p.item === ignore) return false;
      const [pw, ph] = this.size(p.item);
      return x < p.x + pw && x + w > p.x && y < p.y + ph && y + h > p.y;
    });
  }

  inBounds(item: Item, x: number, y: number): boolean {
    const [w, h] = this.size(item);
    return x >= 0 && y >= 0 && x + w <= this.w && y + h <= this.h;
  }

  canPlace(item: Item, x: number, y: number, ignore?: Item): boolean {
    if (!this.inBounds(item, x, y)) return false;
    const [w, h] = this.size(item);
    return this.overlapping(x, y, w, h, ignore).length === 0;
  }

  place(item: Item, x: number, y: number) {
    this.items.push({ item, x, y });
  }

  remove(item: Item): boolean {
    const i = this.items.findIndex((p) => p.item === item);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }

  at(x: number, y: number): Placed | undefined {
    return this.overlapping(x, y, 1, 1)[0];
  }

  findSpace(item: Item): { x: number; y: number } | null {
    const [w, h] = this.size(item);
    for (let x = 0; x <= this.w - w; x++) {
      for (let y = 0; y <= this.h - h; y++) {
        if (this.canPlace(item, x, y)) return { x, y };
      }
    }
    return null;
  }

  add(item: Item): boolean {
    const s = this.findSpace(item);
    if (!s) return false;
    this.place(item, s.x, s.y);
    return true;
  }

  contains(item: Item): boolean {
    return this.items.some((p) => p.item === item);
  }
}
