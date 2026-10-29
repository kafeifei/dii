import type { P2 } from '../core/math';
import { D2X_OBJECTS, D2X_OBJGROUPS, type D2xObject } from '../data/d2x/objects';
import type { TileMap } from './tilemap';
import { OUT_SCALE } from './zone';

/**
 * Diablo II's objects as its rooms roll them (OBJECTS_PopulationHandler, D2MOO
 * source/D2Game/src/OBJECTS/Objects.cpp:2011-2150): each room rolls each of its level's object groups
 * (Levels.txt ObjGrp/ObjPrb, D2X_OBJGROUPS), and a group that passes places one of its objects by
 * that object's PopulateFn, with D2's sizes, margins, tries and spacing. All of it is in D2 subtiles
 * at our scale: a D2 subtile scaled by OUT_SCALE is a quarter of our tile (SUB), so D2's numbers
 * carry over as they are, and an 8×8-tile room of D2's is 40 × 40 subtiles, as ours of 10×10 tiles.
 */

/** what the rolls are drawn from: D2's seed (maze.ts D2Seed), roll() its low half, limited(n) SEED_RollLimitedRandomNumber */
export interface Rolls {
  roll(): number;
  limited(n: number): number;
}

/** subtiles to our tile: a D2 tile is 5 subtiles (DUNGEON_GameTileToSubtileCoords), and OUT_SCALE of our tiles */
export const SUB = 5 / OUT_SCALE;

/** an object placed by D2's rules: where, and its Objects.txt row (D2X_OBJECTS) */
export interface PlacedObject {
  pos: P2;
  id: number;
}
export interface PlacedChest extends PlacedObject {
  /** it needs a key, and drops twice (InitFn 3 and 57, Objects.cpp:651-660; ObjMode.cpp:1264-1277) */
  locked: boolean;
  /** 0, or the trap D2 rolled for it, (rand & 7) + 1 (Objects.cpp:642-649) */
  trap: number;
  /** a spark chest: 580's or 397 (D2GAME_SetSparkChest, Objects.cpp:190; InitFn 57, 703) */
  sparkly: boolean;
  /** 397's own rules on opening (D2xObject.consolation) */
  consolation: boolean;
  /** the preset placeholder it stands for, 580 or 581 (Objects.cpp:215-249) */
  placeholder?: number;
}
export interface PlacedBarrel extends PlacedObject {
  /** 11, BarrelExploding: the first of a cluster one time in 3, the rest one in 4 (Objects.cpp:1666, 1708) */
  exploding: boolean;
  /** it came broken already: 1 in 14 (PreOperate, Objects.cpp:418-423) */
  opened: boolean;
}
export interface PlacedCasket extends PlacedObject {
  /** 28, the hole in the ground the casket clusters mix in (PopulateFn1, Objects.cpp:976-979) */
  hole: boolean;
  /** a hole comes spent 1 in 14 (PreOperate) */
  opened: boolean;
}
export interface PlacedRemains extends PlacedObject {
  /** flies (object 103) over it: 29 % (PopulateFn6, Objects.cpp:1417) */
  flies: boolean;
}
export interface PlacedShrine extends PlacedObject {
  /** its kind by Parm0 (D2xObject.shrine); one made the level's healing shrine is 'health' */
  kind: 'any' | 'health' | 'mana' | 'magic';
}

// what a box must keep clear of (D2Collision.h:38-76): COLLIDE_WALL | COLLIDE_OBJECT | COLLIDE_DOOR
// (0xC01), or COLLIDE_MASK_PLACEMENT, which has the presets' floor too
const C_WALL = 1;
const C_OBJECT = 2;
const C_PRESET = 4;
const M_SOLID = C_WALL | C_OBJECT;
const M_PLACE = C_WALL | C_OBJECT | C_PRESET;
/** the eight ways a cluster steps (PopulateFn1, PopulateFn4: signX, signY) */
const SX = [-1, 0, 1, -1, 1, -1, 0, 1];
const SY = [-1, -1, -1, 0, 0, 1, 1, 1];
/** PopulateFn1 for Casket6 (OBJECT_CASKET6): what its clusters are of, its tries, its steps of 2 × (5 + rand 5) subtiles (Objects.cpp:1029-1036) */
const CASKET = 3;
const CASKET_SET = [3, 28];
const CASKET_TRIES = 18;
const CASKET_STEP = 5;
const BARREL = 7;
const BARREL_EXPLODING = 11;
/** an Act 1 preset's random treasure chest (Objects.txt 581 PlaceRandomTreasureChest) */
export const RANDOM_CHEST = 581;

/** a D2 room in subtiles: an 8×8-tile room is 40 × 40, and so is ours of 10×10 tiles */
export interface SubRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Which subtiles are taken, at D2's grain: walls are our map's (a tile that isn't floor is 4 × 4
 * subtiles of wall), objects and the presets' kept-clear spots are marked here.
 */
export class Occupancy {
  readonly w: number;
  readonly h: number;
  private readonly bits: Uint8Array;
  constructor(private readonly map: TileMap) {
    this.w = map.w * SUB;
    this.h = map.h * SUB;
    this.bits = new Uint8Array(this.w * this.h);
  }
  /** whether a box of w × h centred on (cx, cy), as COLLISION_CreateBoundingBox makes it (D2Collision.cpp:1177-1183), meets `mask` */
  hits(cx: number, cy: number, w: number, h: number, mask: number): boolean {
    const x0 = cx - (w >> 1);
    const y0 = cy - (h >> 1);
    const x1 = x0 + Math.max(1, w) - 1;
    const y1 = y0 + Math.max(1, h) - 1;
    if (mask & C_WALL) {
      for (let ty = Math.floor(y0 / SUB); ty <= Math.floor(y1 / SUB); ty++) for (let tx = Math.floor(x0 / SUB); tx <= Math.floor(x1 / SUB); tx++) if (!this.map.walkable(tx, ty)) return true;
    }
    const m = mask & (C_OBJECT | C_PRESET);
    if (!m) return false;
    if (x0 < 0 || y0 < 0 || x1 >= this.w || y1 >= this.h) return true;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.bits[y * this.w + x] & m) return true;
    return false;
  }
  mark(cx: number, cy: number, w: number, h: number, bit: number) {
    const x0 = cx - (w >> 1);
    const y0 = cy - (h >> 1);
    for (let y = Math.max(0, y0); y < Math.min(this.h, y0 + Math.max(1, h)); y++) for (let x = Math.max(0, x0); x < Math.min(this.w, x0 + Math.max(1, w)); x++) this.bits[y * this.w + x] |= bit;
  }
  /** a preset's spot kept clear r tiles round */
  keep(p: P2, r: number) {
    const s = Math.round(r * SUB);
    this.mark(Math.floor(p.x * SUB), Math.floor(p.z * SUB), 2 * s + 1, 2 * s + 1, C_PRESET);
  }
}

/** the middle of a subtile, in our tiles */
const at = (x: number, y: number): P2 => ({ x: (x + 0.5) / SUB, z: (y + 0.5) / SUB });

/**
 * A level's objects, room by room as D2 populates them (OBJECTS_PopulationHandler,
 * Objects.cpp:2011-2150), in the order the hero comes to the rooms (D2 populates a room as it
 * comes near). Each room rolls each of the level's object groups, rand % 100 ≤ ObjPrb; one that
 * passes picks a member by PROB, whose PopulateFn places it with D2's sizes, margins, tries and
 * spacing, in subtiles. D2's three object seeds are one seed of D2's kind here (maze.ts D2Seed).
 */
export class ObjectRoller {
  readonly occ: Occupancy;
  readonly chests: PlacedChest[] = [];
  readonly barrels: PlacedBarrel[] = [];
  readonly shrines: PlacedShrine[] = [];
  readonly caskets: PlacedCasket[] = [];
  readonly remains: PlacedRemains[] = [];
  readonly wells: PlacedObject[] = [];
  private readonly shrineAt: [number, number][] = [];
  private readonly wellAt: [number, number][] = [];
  private healing = 0;
  /** rooms populated so far (D2ObjectRegionStrc field_4), and the level's (nPopulatedRooms) */
  private done = 0;
  private rooms = 0;

  constructor(
    map: TileMap,
    private readonly seed: Rolls,
    private readonly rolls: { trap: number; lock: number },
  ) {
    this.occ = new Occupancy(map);
  }

  /** OBJRGN_ShouldSpawnHealingShrineOrWell (ObjRgn.cpp:189-193): past ¾ of the rooms, (done << 7) / rooms > 96, with no healing shrine yet */
  private wantHealing(): boolean {
    return this.rooms > 0 && Math.floor((this.done << 7) / this.rooms) > 96 && !this.healing;
  }

  populate(rooms: SubRoom[], groups: { group: number; prob: number; healSkip?: true }[]) {
    this.rooms = rooms.length;
    for (const room of rooms) {
      this.done++;
      for (const g of groups) {
        let p = this.seed.roll() % 100;
        // D2MOO reads the Objects.txt row numbered like the group here (D2xMaze.healSkip)
        if (g.healSkip && this.wantHealing()) p = 100;
        if (p > g.prob) continue;
        const pr = this.seed.roll() % 100;
        let sum = 0;
        for (const m of D2X_OBJGROUPS[g.group].objects) {
          sum += m.prob;
          if (pr >= sum) continue;
          this.place(room, m.id, m.density);
          break;
        }
      }
    }
  }

  private place(room: SubRoom, id: number, density: number) {
    const o = D2X_OBJECTS[id];
    switch (o.populate) {
      case 1:
        if (id === CASKET) this.caskets1(room, density);
        break;
      case 2:
        this.shrine2(room, o);
        break;
      case 3:
        this.common3(room, o, density);
        break;
      case 4:
        this.barrels4(room, density);
        break;
      case 6: {
        // PopulateFn6 (Objects.cpp:1407-1430): a corpse as PopulateFn3, flies on it when rand % 100 > 70
        const n = this.remains.length;
        if (this.common3(room, o, density) && this.remains.length > n) this.remains[this.remains.length - 1].flies = this.seed.roll() % 100 > 70;
        break;
      }
      case 8:
        this.well8(room, o);
        break;
    }
  }

  /** how many a room gets: density × (w × h >> 7) >> 8 (Objects.cpp:1071, 1314, 1661) */
  private count(room: SubRoom, density: number) {
    return (density * ((room.w * room.h) >> 7)) >> 8;
  }

  private put(o: D2xObject, x: number, y: number): P2 {
    if (o.blocks) this.occ.mark(x, y, o.size[0], o.size[1], C_OBJECT);
    const pos = at(x, y);
    const opened = !!o.preOperate && this.seed.roll() % 14 === 0;
    switch (o.kind) {
      case 'chest':
        this.chests.push(this.chest(o, pos));
        break;
      case 'barrel':
      case 'explodingBarrel':
        this.barrels.push({ pos, id: o.id, exploding: o.kind === 'explodingBarrel', opened });
        break;
      case 'casket':
        this.caskets.push({ pos, id: o.id, hole: o.id !== CASKET, opened });
        break;
      case 'corpse':
        this.remains.push({ pos, id: o.id, flies: false });
        break;
      case 'well':
        this.wells.push({ pos, id: o.id });
        break;
      case 'shrine':
        this.shrines.push({ pos, id: o.id, kind: o.shrine ?? 'any' });
        break;
    }
    return pos;
  }

  /** a chest's rolls as it comes (InitFn 3 and 57, Objects.cpp:637-704): trapped under MonLvl/8 + 5 %, locked under MonLvl/2 + 8 % (D2xMaze.trap, lock) */
  private chest(o: D2xObject, pos: P2, placeholder?: number): PlacedChest {
    const trap = this.seed.roll() % 100 < this.rolls.trap ? (this.seed.roll() & 7) + 1 : 0;
    const locked = !!o.lockable && this.seed.roll() % 100 < this.rolls.lock;
    return { pos, id: o.id, locked, trap, sparkly: !!o.sparkly || placeholder === 580, consolation: !!o.consolation, placeholder };
  }

  /** a preset's chest at (x, y): a placeholder's one of the act's at random (OBJECTS_SpawnPresetChest, Objects.cpp:103-169), 580's sparkly (172-202) */
  presetChest(id: number, x: number, y: number): PlacedChest {
    const ph = D2X_OBJECTS[id];
    const real = ph.becomes ? D2X_OBJECTS[ph.becomes[this.seed.roll() % ph.becomes.length]] : ph;
    if (real.blocks) this.occ.mark(x, y, real.size[0], real.size[1], C_OBJECT);
    const c = this.chest(real, at(x, y), ph.becomes ? id : undefined);
    this.chests.push(c);
    return c;
  }

  /** OBJECTS_CreateObject (Objects.cpp:1335-1364): five random spots, each at least 1 in from the room's edge, with its size + 6 clear */
  createSpot(room: SubRoom, w: number, h: number): [number, number] | null {
    if (room.w < 2 || room.h < 2) return null;
    for (let i = 0; i < 5; i++) {
      const x = this.seed.limited(room.w - w - 1) + room.x;
      const y = this.seed.limited(room.h - h - 1) + room.y;
      if (x && y && x >= room.x + 1 && y >= room.y + 1 && x < room.x + room.w - 1 && y < room.y + room.h - 1 && !this.occ.hits(x, y, w + 6, h + 6, M_PLACE)) return [x, y];
    }
    return null;
  }

  /** PopulateFn3 (Objects.cpp:1297-1332): the room's count of it, each by CreateObject; the last one, as D2 returns it */
  private common3(room: SubRoom, o: D2xObject, density: number): P2 | null {
    // its rand % 100 > 100 never fails
    this.seed.roll();
    let last: P2 | null = null;
    const n = this.count(room, density);
    for (let i = 0; i < n; i++) {
      const s = this.createSpot(room, o.size[0], o.size[1]);
      last = s ? this.put(o, s[0], s[1]) : null;
    }
    return last;
  }

  /** PopulateFn8 (Objects.cpp:1433-1510): one well, at most 4 a level and ⌊rooms/8⌋ + 1 (ObjRgn.cpp:182-186), 100 subtiles from another both ways (210-222) */
  private well8(room: SubRoom, o: D2xObject) {
    if (this.wells.length === 4 || this.wells.length > Math.floor(this.rooms / 8)) return;
    this.seed.roll();
    const w = 2 * o.size[0] + 1;
    const h = 2 * o.size[1] + 1;
    if (room.w < 2 || room.h < 2 || room.w <= w || room.h <= h) return;
    for (let j = 0; j < 5; j++) {
      const x = room.x + this.seed.limited(room.w - w - 1);
      const y = room.y + this.seed.limited(room.h - h - 1);
      if (!x || !y || x < room.x + 1 || y < room.y + 1 || x >= room.x + room.w - 1 || y >= room.y + room.h - 1) continue;
      if (this.occ.hits(x, y, w + 6, h + 6, M_PLACE) || this.wellAt.some(([wx, wy]) => Math.abs(wx - x) < 100 || Math.abs(wy - y) < 100)) continue;
      this.put(o, x, y);
      this.wellAt.push([x, y]);
      return;
    }
  }

  /**
   * PopulateFn2 (Objects.cpp:1512-1627): a shrine, at most 10 a level and ⌊rooms/8⌋ + 1, 50 subtiles
   * from another both ways (ObjRgn.cpp:196-251). Past ¾ of the rooms with no healing shrine it tries
   * 30 times instead of 3, and one that isn't a healing shrine becomes one (its Parm1, else the
   * healing well 84). One of orientation 1 or 2 stands against the room's low-y or low-x edge; our
   * rooms have their walls inside the room's box, so it slides in off the wall to where its box clears.
   */
  private shrine2(room: SubRoom, o: D2xObject) {
    const heal = this.wantHealing();
    if (!heal) this.seed.roll();
    if (this.shrines.length === 10 || this.shrines.length > Math.floor(this.rooms / 8)) return;
    const w = o.size[0] + 6;
    const h = o.size[1] + 6;
    if (room.w < o.size[0] + 2 || room.h < o.size[1] + 2) return;
    for (let n = heal ? 30 : 3; n > 0; n--) {
      for (let k = 0; k < 5; k++) {
        let x: number;
        let y: number;
        if (o.orientation === 1) {
          x = room.x + (room.w >> 2) + this.seed.limited(room.w >> 1);
          y = room.y + this.seed.limited(1) + 1;
          while (y < room.y + (room.h >> 2) && this.occ.hits(x, y, w, h, C_WALL)) y++;
        } else if (o.orientation === 2) {
          x = room.x + this.seed.limited(1) + 1;
          y = this.seed.limited(room.h >> 1) + room.y + (room.h >> 2);
          while (x < room.x + (room.w >> 2) && this.occ.hits(x, y, w, h, C_WALL)) x++;
        } else {
          x = room.x + this.seed.limited(room.w - o.size[0] - 1);
          y = room.y + this.seed.limited(room.h - o.size[1] - 1);
        }
        if (!x || !y || x < room.x + 1 || y < room.y + 1 || x >= room.x + room.w - 1 || y >= room.y + room.h - 1) continue;
        if (this.occ.hits(x, y, w, h, M_PLACE) || this.shrineAt.some(([sx, sy]) => Math.abs(sx - x) < 50 || Math.abs(sy - y) < 50)) continue;
        let real = o;
        if (o.shrine === 'health') this.healing++;
        else if (heal) {
          real = D2X_OBJECTS[o.healAs ?? 84] ?? o;
          this.healing++;
        }
        this.put(real, x, y);
        this.shrines[this.shrines.length - 1].kind = heal || o.shrine === 'health' ? 'health' : (o.shrine ?? 'any');
        this.shrineAt.push([x, y]);
        return;
      }
    }
  }

  /** a casket's spot (PopulateFn1, Objects.cpp:1078-1085): in from the room's edge, its size + 7 clear of walls and objects, its own size clear of anything */
  private casketFits(room: SubRoom, o: D2xObject, x: number, y: number): boolean {
    const [w, h] = o.size;
    if (room.w < w + 2 || room.h < h + 2) return false;
    if (x <= room.x + 1 || y <= room.y + 1 || x >= room.x - w + room.w - 2 || y >= room.y - h + room.h - 2) return false;
    return !this.occ.hits(x, y, w + 7, h + 7, M_SOLID) && !this.occ.hits(x, y, w, h, M_PLACE);
  }

  /**
   * PopulateFn1 for Casket6 (Objects.cpp:972-1166): up to the room's count of clusters in 18 tries; a
   * cluster goes on from its last casket by random steps of 10–18 subtiles, each next one on a roll
   * of 1 in ⌊n/2⌋ (n so far), until a walk of 3 × max(count, 4) steps finds no spot.
   */
  private caskets1(room: SubRoom, density: number) {
    const o = D2X_OBJECTS[CASKET];
    this.seed.roll();
    let n = this.count(room, density);
    const member = () => D2X_OBJECTS[CASKET_SET[this.seed.limited(CASKET_SET.length)]];
    for (let tries = CASKET_TRIES; n > 0 && tries > 0; tries--) {
      const first = member();
      let x = room.x + this.seed.limited(room.w - o.size[0] - 1);
      let y = room.y + this.seed.limited(room.h - o.size[1] - 1);
      if (!this.casketFits(room, o, x, y)) continue;
      this.put(first, x, y);
      let spawned = 1;
      let found = true;
      while (this.seed.limited(spawned >> 1) === 0 && found) {
        found = false;
        const most = 3 * Math.max(n, 4);
        for (let k = 0; k < most && !found; k++) {
          const d = this.seed.roll() & 7;
          x += 2 * (CASKET_STEP + this.seed.limited(CASKET_STEP)) * SX[d];
          y += 2 * (CASKET_STEP + this.seed.limited(CASKET_STEP)) * SY[d];
          found = this.casketFits(room, o, x, y);
        }
        if (found) {
          this.put(member(), x, y);
          spawned++;
        }
      }
      n--;
    }
  }

  /**
   * PopulateFn4 (Objects.cpp:1635-1726): up to the room's count of barrel clusters in twice as many
   * tries, at most 8 barrels a room; a cluster steps XSpace × YSpace subtiles a random way, up to 15
   * times, for each next barrel, on a roll of 1 in ⌊n/2⌋
   */
  private barrels4(room: SubRoom, density: number) {
    const o = D2X_OBJECTS[BARREL];
    const [w, h] = o.size;
    const [sx, sy] = o.space ?? [2, 2];
    this.seed.roll();
    const fits = (x: number, y: number) =>
      room.w >= 2 && room.h >= 2 && x > room.x + 2 && y > room.y + 2 && x < room.w + room.x - w && y < room.h + room.y - h && !this.occ.hits(x, y, w + 2, h + 2, M_PLACE);
    let j = this.count(room, density);
    let made = 0;
    for (let k = 2 * j; j > 0 && k > 0; k--) {
      const first = this.seed.roll() % 3 === 0 ? BARREL_EXPLODING : BARREL;
      let x = room.x + this.seed.limited(room.w);
      let y = room.y + this.seed.limited(room.h);
      if (!fits(x, y)) continue;
      this.put(D2X_OBJECTS[first], x, y);
      if (++made >= 8) return;
      let ok = true;
      for (let max = 1; this.seed.limited(max >> 1) === 0 && ok; ) {
        ok = false;
        for (let i = 0; !ok && i < 15; i++) {
          const d = this.seed.roll() & 7;
          x += sx * SX[d];
          y += sy * SY[d];
          ok = fits(x, y);
        }
        if (ok) {
          this.put(D2X_OBJECTS[(this.seed.roll() & 3) === 0 ? BARREL_EXPLODING : BARREL], x, y);
          max++;
          if (++made >= 8) return;
        }
      }
      j--;
    }
  }
}
