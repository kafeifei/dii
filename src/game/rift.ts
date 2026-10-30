import { RNG, type P2 } from '../core/math';
import type { Difficulty } from '../items/d2/types';
import { CAMP_AREA, type AreaDef } from '../world/areas';
import { WILD_MAPS } from '../world/levelgen';
import { isRiftArea, openTiers, riftFloorArea, riftFloorLayout, riftMazeFloor, riftPlan, RIFT_AREA, RIFT_TIERS, guardianName, tierLabel, type RiftFloorMap, type RiftTier } from '../world/rift';
import type { Arrival, Game } from './game';
import { Level } from './level';
import { DUNGEON_MAKERS } from './maps';
import type { Monster, MonsterRank } from './monster';
import { WorldObject } from './objects';
import { RiftProgress } from './riftsave';
import { spawnGuardian } from './spawn';

/**
 * The game's rifts (docs/RIFT.md; the tiers and floors are src/world/rift.ts): the obelisk in the
 * camp that opens them, the one open now, its progress and its guardian, the ways in and out, and the
 * shared record of the tiers cleared. A rift lives as long as the game: no save holds it, and a hero
 * reloaded in one is back in the camp, a body left in it beside them (Game.layOutCorpses).
 */

/** how much of the rift's progress a kill is worth, by rank (Diablo III gives elites more; ours, approximate) */
const WORTH: Record<MonsterRank, number> = { normal: 1, minion: 1, champion: 3, unique: 5, boss: 0 };
/**
 * How much of each floor's worth fills its share of the rift's progress: each floor its own, so the
 * guardian comes once all of the stretch's areas picked have been fought through, the big wilderness
 * floors no more than the small dungeons (ours, approximate)
 */
const FILL = 0.4;
/** a second use of the way out within this many seconds leaves though items lie on its floors */
const CONFIRM = 6;

/**
 * The map of tier `t`'s floor `area` replaying area `source`, from the floor's own seed (never the
 * world's dungeon seed, levelSeed: a rift's Crypt is another Crypt than the game's): a dungeon the
 * game grows as D2 does (DUNGEON_MAKERS: the Den, the Cave's two levels, the Crypt, the Mausoleum)
 * by its maze in the tier's difficulty (its rooms by difficulty, its objects, its light); the
 * wilderness and the dungeons still to come as before (src/world/rift.ts riftFloorLayout)
 */
export function riftFloorMap(t: RiftTier, area: AreaDef, source: number, seed: number): RiftFloorMap {
  const make = DUNGEON_MAKERS[source];
  return make ? riftMazeFloor(area, make(seed, t.difficulty)) : riftFloorLayout(area, source, seed);
}

/** a rift open now */
export interface RiftRun {
  tier: RiftTier;
  /** its floors, made as it opens, and their areas */
  floors: Level[];
  areas: AreaDef[];
  /** each floor's share of the progress: its kills' worth so far, and what fills it (FILL) */
  got: number[];
  share: number[];
  /** the shares filled so far, and all of them: the bar */
  progress: number;
  needed: number;
  /** come once it filled; dead once `done` */
  guardian: Monster | null;
  done: boolean;
}

export class Rifts {
  run: RiftRun | null = null;
  readonly record = new RiftProgress();
  /** the map holding the camp and its obelisk */
  private camp: Level | null = null;
  /** when the way out was last used with items left on the floors (Game.time) */
  private confirmAt = -Infinity;

  constructor(private readonly game: Game) {}

  /** a new game's: the last one's rift and camp gone with its maps (Game.newWorld); the tiers cleared stay the player's */
  forget() {
    this.run = null;
    this.camp = null;
  }

  /** the tiers that may be opened now: 1 to this */
  openTiers(): number {
    return openTiers(this.record.cleared());
  }

  /** the rift's floors: maps this game keeps while it is open */
  levels(): Level[] {
    return this.run?.floors ?? [];
  }

  /** the difficulty whose rules hold on `level`: a rift floor's tier's; null on any other map */
  difficultyOf(level: Level): Difficulty | null {
    return this.run?.floors.includes(level) ? this.run.tier.difficulty : null;
  }

  /** the map of rift area `id` while its rift is open */
  levelFor(id: number): Level | null {
    if (!this.run || !isRiftArea(id)) return null;
    return this.run.floors[id - RIFT_AREA - 1] ?? null;
  }

  /** the floor the hero is on, 1 on; 0 off the rift */
  floorHere(): number {
    return this.run ? this.run.floors.indexOf(this.game.level) + 1 : 0;
  }

  /** whether the floor the hero is on has given all its share of the progress */
  floorFull(): boolean {
    const run = this.run;
    const f = this.floorHere() - 1;
    return !!run && f >= 0 && run.got[f] >= run.share[f];
  }

  /** items lying on the open rift's floors, which go with it when it closes */
  itemsLeft(): number {
    return this.levels().reduce((n, L) => n + L.ground.filter((g) => g.item).length, 0);
  }

  /** the obelisk set up in the camp on `level` (the overworld, as it is made), and the open rift's way in by it */
  furnishCamp(level: Level) {
    this.camp = level;
    const wp = level.objects.find((o) => o.kind === 'waypoint' && level.inTown(o.pos));
    if (!wp) return;
    const pos = level.map.nearestWalkable(wp.pos.x - 3.2, wp.pos.z + 1.6) ?? wp.pos;
    const o = new WorldObject('obelisk', pos, '秘境方碑', 0.7);
    o.rift = 'obelisk';
    level.objects.push(o);
    if (this.run) this.campPortal();
  }

  private obelisk(): WorldObject | undefined {
    return this.camp?.objects.find((o) => o.kind === 'obelisk');
  }

  /** the open rift's way in, beside the obelisk */
  private campPortal() {
    const run = this.run;
    const ob = this.obelisk();
    if (!run || !ob || !this.camp) return;
    const pos = this.camp.map.nearestWalkable(ob.pos.x + 1.8, ob.pos.z - 0.6) ?? ob.pos;
    const o = new WorldObject('portal', pos, `秘境 · ${tierLabel(run.tier)}`, 0.6);
    o.dest = run.areas[0].id;
    o.rift = 'in';
    this.camp.objects.push(o);
  }

  /**
   * Open tier `n`: its floors made, their monsters with them, and its way in beside the obelisk. An
   * open rift closes first. False when the tier isn't open to the player
   */
  begin(n: number): boolean {
    const tier = RIFT_TIERS[n - 1];
    if (!tier || n > this.openTiers() || this.run?.floors.includes(this.game.level)) return false;
    this.close();
    const seed = (Math.random() * 0x100000000) >>> 0;
    const rng = new RNG(seed);
    const plan = riftPlan(tier, rng);
    const areas: AreaDef[] = [];
    const floors: Level[] = [];
    const maps: RiftFloorMap[] = [];
    plan.forEach((source, i) => {
      const area = riftFloorArea(tier, i + 1, source);
      // each floor's own seed, the rift's turned by its place in it
      const s = (seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0;
      const f = riftFloorMap(tier, area, source, s);
      areas.push(area);
      floors.push(new Level(WILD_MAPS, s, f.layout, tier.difficulty));
      maps.push(f);
    });
    floors.forEach((L, i) => this.ways(L, i, areas, maps[i]));
    const share = floors.map((L) => Math.max(5, Math.round(L.monsters.reduce((w, m) => w + WORTH[m.rank], 0) * FILL)));
    const needed = share.reduce((a, b) => a + b, 0);
    this.run = { tier, floors, areas, got: floors.map(() => 0), share, progress: 0, needed, guardian: null, done: false };
    this.campPortal();
    const ob = this.obelisk();
    if (ob) {
      this.game.fx.burst('portal', ob.pos, { color: '#b070ff' });
      this.game.sfx.play('env.portal_open', { pos: ob.pos });
    }
    this.game.hooks.message(`秘境已开启：${tierLabel(tier)}`, '#c8a0ff', 3);
    return true;
  }

  /**
   * The ways on a floor (`f`, its map): back to the camp from the first one's start, back up from the
   * others', and on down from the far end of all but the last; on a dungeon's maze, where its own ways
   * up and down stand (RiftFloorMap). Each faces into the map, where someone coming through it
   * stands (Game.arrival)
   */
  private ways(L: Level, i: number, areas: AreaDef[], f: RiftFloorMap) {
    const start = L.layout.start;
    const { down } = f;
    const away = (from: P2, to: P2) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      return { x: dx / len, z: dz / len };
    };
    const off = (p: P2, d: P2, r: number) => L.map.nearestWalkable(p.x - d.x * r, p.z - d.z * r) ?? p;
    const into = away(start, down);
    const back = f.up ?? { pos: off(start, into, 1.6), inward: into };
    if (i === 0) {
      const o = new WorldObject('portal', back.pos, '回到营地', 0.6);
      o.dest = CAMP_AREA;
      o.rift = 'home';
      L.objects.push(o);
    } else {
      const o = new WorldObject('stairs', back.pos, `返回${areas[i - 1].name}`, 0.9);
      o.dest = areas[i - 1].id;
      o.inward = back.inward;
      L.objects.push(o);
    }
    if (i + 1 < areas.length) {
      const o = new WorldObject('stairs', down, `通往${areas[i + 1].name}`, 0.9);
      o.dest = areas[i + 1].id;
      o.inward = f.downIn ?? away(down, start);
      L.objects.push(o);
    }
  }

  /**
   * The open rift gone, its floors and what lies on them with it. A body left on one waits in the
   * camp from then (Game.layOutCorpses), and a town portal to one closes. Not while the hero is on one
   */
  close() {
    const run = this.run;
    if (!run || run.floors.includes(this.game.level)) return;
    const left = this.itemsLeft();
    this.run = null;
    if (this.camp) this.camp.objects = this.camp.objects.filter((o) => o.rift !== 'in');
    if (this.game.portalLevel && run.floors.includes(this.game.portalLevel)) this.game.closePortals();
    this.game.hooks.message(left ? `秘境已关闭，地上的 ${left} 件物品随之消失` : '秘境已关闭', '#c8a0ff', 3);
  }

  /**
   * Using a rift's object: the obelisk opens its panel; the way in from the camp leads to the first
   * floor's start; the way back from the first floor goes to the camp, the rift open still; the way
   * out a guardian leaves goes too and closes the rift, asked again first while items lie on its
   * floors. False for any other object
   */
  use(obj: WorldObject): boolean {
    if (!obj.rift) return false;
    const g = this.game;
    if (obj.rift === 'obelisk') {
      g.hooks.openPanel('rift');
      return true;
    }
    const run = this.run;
    if (!run) return true;
    g.sfx.play('env.portal_enter', { pos: obj.pos });
    if (obj.rift === 'in') {
      g.enterArea(obj.dest, 'stairs');
      return true;
    }
    const out = obj.rift === 'out';
    const left = out ? this.itemsLeft() : 0;
    if (left && g.time - this.confirmAt > CONFIRM) {
      this.confirmAt = g.time;
      g.hooks.message(`地上还有 ${left} 件物品没捡：再进一次就离开并关闭秘境`, '#ffb060', CONFIRM);
      return true;
    }
    g.enterArea(CAMP_AREA, 'exit');
    if (out) this.close();
    return true;
  }

  /** where the hero comes into the camp out of a rift: by the obelisk. Null for any other way */
  arrival(id: number, how: Arrival, from?: number): { pos: P2 } | null {
    if (id !== CAMP_AREA || how !== 'exit' || from === undefined || !isRiftArea(from)) return null;
    const ob = this.obelisk();
    return ob ? { pos: { x: ob.pos.x + 1.2, z: ob.pos.z + 1.4 } } : null;
  }

  /**
   * A monster killed (Game.killMonster): on the rift's floors, its worth to the progress; once that is
   * full, the guardian comes near the hero; its death clears the tier
   */
  killed(m: Monster) {
    const run = this.run;
    const g = this.game;
    if (!run || run.done || !run.floors.includes(g.level)) return;
    if (m === run.guardian) {
      this.complete(m.pos);
      return;
    }
    if (run.guardian || m.noXp) return;
    const f = run.floors.indexOf(g.level);
    run.got[f] += WORTH[m.rank];
    run.progress = run.got.reduce((n, got, i) => n + Math.min(got, run.share[i]), 0);
    if (run.progress >= run.needed) this.summon();
  }

  /** the guardian, a few steps from the hero, where they can see it come */
  private summon() {
    const run = this.run!;
    const g = this.game;
    const L = g.level;
    const p = g.player.pos;
    const rng = new RNG((Math.random() * 0x100000000) >>> 0);
    let at: P2 = p;
    for (let k = 0; k < 24; k++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(4, 6.5);
      const q = { x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r };
      if (L.monsterMap.walkableAt(q.x, q.z) && L.monsterMap.circleClear(q.x, q.z, 0.6) && L.map.los(p, q)) {
        at = q;
        break;
      }
    }
    const boss = spawnGuardian(L, L.areaAt(at.x, at.z), run.tier.segment.guardian, at, rng);
    if (!boss) {
      // no look to show it by: the tier is cleared all the same
      this.complete(p);
      return;
    }
    run.guardian = boss;
    g.fx.burst('portal', at, { color: '#b070ff' });
    g.fx.burst('resurrect', at);
    g.sfx.play('monster.boss_wake', { pos: at });
    g.hooks.message(`镇守者${guardianName(run.tier)}现身了！`, '#c8a0ff', 4);
  }

  /** the guardian dead: the tier cleared for every hero, and a way out where it fell */
  private complete(at: P2) {
    const run = this.run!;
    const g = this.game;
    const before = this.openTiers();
    run.done = true;
    run.progress = run.needed;
    this.record.clear(run.tier.key);
    const L = g.level;
    const o = new WorldObject('portal', L.map.nearestWalkable(at.x, at.z) ?? at, '离开秘境', 0.6);
    o.dest = CAMP_AREA;
    o.rift = 'out';
    L.objects.push(o);
    g.fx.burst('portal', o.pos, { color: '#4a8aff' });
    g.sfx.play('ui.quest_done');
    const opened = this.openTiers() > before ? `，第 ${this.openTiers()} 层已开放` : '';
    g.hooks.message(`秘境完成${opened}`, '#c8a0ff', 5);
    g.save();
  }

  /** the tiers cleared here written with the rest; false when they couldn't be (Game.persist tells the player) */
  flush(): boolean {
    return this.record.flush();
  }
}
