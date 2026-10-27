import type { P2 } from '../core/math';

/** cells this many tiles square: a query looks at the handful around it, never the whole map */
export const GRID_CELL = 8;

/**
 * How far a monster may have moved since it was last put in its cell and still be found: queries
 * look this much further. Monsters move only while near the hero (Game.update steps them), a step
 * at most a fraction of a tile, and those are put in their cells again after every step.
 */
const SLACK = 1;

/** what the grid needs of a monster */
interface Placed {
  pos: P2;
  radius: number;
}

/**
 * The monsters of a level bucketed by where they stand, so the loops that only care about what is
 * near the hero (the AI, pushing apart, targeting, the views) look at those and nothing more: on the
 * West overworld a thousand monsters sleep far off and cost nothing. Like Diablo II, where a monster
 * no player is near is out of play until one comes back (D2Game GAME/Game.cpp GAME_UpdateProgress:
 * a room no client is near is untiled, DUNGEON_TestRoomCanUnTile, its units made inactive by
 * D2Game UNIT/SUnitInactive.cpp SUNITINACTIVE_CompressUnitIfNeeded and restored by
 * SUNITINACTIVE_RestoreInactiveUnits), but simpler: here it is whatever is past ACTIVE_RADIUS of the
 * hero (Game.update), kept as it is, its life too (a corpse still goes 40 s after, as near ones
 * do). D2 untiles room by room, every 12th frame, never a room with a portal in it nor any of a
 * town while one of its rooms is in use (D2Common Drlg/DrlgActivate.cpp
 * DRLGACTIVATE_TestRoomCanUnTile); keeps 1 in 3 ordinary corpses and none of uniques or minions
 * (SUNITINACTIVE_CompressUnitIfNeeded); and heals a monster brought back 7500 frames or more after
 * (SUNITINACTIVE_RestoreInactiveUnits).
 *
 * The list is bucketed again whenever it is another array or another length (monsters spawned, the
 * dead cleared away); between those the stepped monsters are moved to their new cells (moved).
 */
export class MonsterGrid<M extends Placed> {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: M[][];
  private readonly cellOf = new Map<M, number>();
  private list: readonly M[] | null = null;
  private length = -1;
  /** the widest monster bucketed, for `touching` */
  private maxRadius = 0;

  constructor(w: number, h: number) {
    this.cols = Math.max(1, Math.ceil(w / GRID_CELL));
    this.rows = Math.max(1, Math.ceil(h / GRID_CELL));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  /** the cell a point is in; off the map, the nearest one */
  private cell(x: number, z: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / GRID_CELL)));
    const cz = Math.min(this.rows - 1, Math.max(0, Math.floor(z / GRID_CELL)));
    return cz * this.cols + cx;
  }

  /** bucket `list` afresh if it isn't the list bucketed last, or has grown or shrunk since (or `force`) */
  sync(list: readonly M[], force = false) {
    if (!force && list === this.list && list.length === this.length) return;
    for (const c of this.cells) c.length = 0;
    this.cellOf.clear();
    this.maxRadius = 0;
    for (const m of list) {
      const c = this.cell(m.pos.x, m.pos.z);
      this.cells[c].push(m);
      this.cellOf.set(m, c);
      this.maxRadius = Math.max(this.maxRadius, m.radius);
    }
    this.list = list;
    this.length = list.length;
  }

  /** `m` may have moved: into the cell it stands in now */
  moved(m: M) {
    const was = this.cellOf.get(m);
    if (was === undefined) return;
    const c = this.cell(m.pos.x, m.pos.z);
    if (c === was) return;
    const from = this.cells[was];
    const i = from.indexOf(m);
    if (i >= 0) {
      from[i] = from[from.length - 1];
      from.pop();
    }
    this.cells[c].push(m);
    this.cellOf.set(m, c);
  }

  /**
   * The monsters within `r` of `p`, centre to centre and `r` included, the dead as well, cell by
   * cell (row by row); added to `out` when given
   */
  near(p: P2, r: number, out: M[] = []): M[] {
    return this.collect(p, r, false, out);
  }

  /** the monsters whose bodies come within `r` of `p` (their centres within r + their radius), as near */
  touching(p: P2, r: number, out: M[] = []): M[] {
    return this.collect(p, r, true, out);
  }

  private collect(p: P2, r: number, body: boolean, out: M[]): M[] {
    const pad = r + (body ? this.maxRadius : 0) + SLACK;
    const x0 = Math.max(0, Math.floor((p.x - pad) / GRID_CELL));
    const x1 = Math.min(this.cols - 1, Math.floor((p.x + pad) / GRID_CELL));
    const z0 = Math.max(0, Math.floor((p.z - pad) / GRID_CELL));
    const z1 = Math.min(this.rows - 1, Math.floor((p.z + pad) / GRID_CELL));
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        for (const m of this.cells[cz * this.cols + cx]) {
          const dx = m.pos.x - p.x;
          const dz = m.pos.z - p.z;
          const reach = body ? r + m.radius : r;
          if (dx * dx + dz * dz <= reach * reach) out.push(m);
        }
      }
    }
    return out;
  }
}
