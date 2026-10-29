import { CAMP_AREA, DEN_OF_EVIL, depthForArea, isBuilt, trialFloor } from '../world/areas';
import { generateDen } from '../world/den';
import { WILD_MAPS } from '../world/levelgen';
import { BUILT as WEST_AREAS, generateOverworld } from '../world/overworld';
import type { Game } from './game';
import { GALLERY, Level } from './level';

/** a seed for a map made anew */
export const newSeed = () => (Math.random() * 2 ** 31) | 0;

/**
 * The maps of this game, each made the first time it's entered and kept while the game lasts, as
 * Diablo II keeps a game's levels: the West overworld (the camp, Blood Moor and Cold Plains on one
 * map), the Den of Evil, and ?gallery's showroom standing in for the camp
 */
export class Maps {
  west: Level | null = null;
  den: Level | null = null;
  gallery: Level | null = null;
  /** the trial ground's floor visited last, kept so waypoint trips and deaths don't reroll it */
  lastDungeon: Level | null = null;
  /** the dungeons' maps by area (none is made yet) */
  dungeons = new Map<number, Level>();

  constructor(private readonly game: Game) {}

  /** the map this game keeps that holds area `id`, if it has been made yet (none is made here) */
  mapOf(id: number): Level | null {
    if (WEST_AREAS.includes(id)) return this.west;
    if (id === DEN_OF_EVIL) return this.den;
    return null;
  }

  /** whether this build has a map of area `id`: the areas of normal play (isBuilt) and the trial ground's floors */
  hasMap(id: number): boolean {
    return isBuilt(id) || trialFloor(id) !== undefined || this.game.rift.levelFor(id) !== null;
  }

  /**
   * The map that holds area `id` in this game, made the first time it's asked for: the overworld for
   * its areas, the Den of Evil's own, a trial floor (a new one when `fresh`, else the one left last).
   * Null when this build has none
   */
  levelFor(id: number, fresh = false): Level | null {
    if (id === CAMP_AREA && GALLERY) return (this.gallery ??= new Level(0, this.game.worldSeed));
    const rift = this.game.rift.levelFor(id);
    if (rift) return rift;
    if (WEST_AREAS.includes(id)) {
      if (!this.west) {
        const ow = generateOverworld(this.game.worldSeed);
        // its monsters in the difficulty played (a new difficulty is a new game: setDifficulty)
        this.west = new Level(WILD_MAPS, ow.seed, ow, this.game.player.difficulty);
        this.game.rift.furnishCamp(this.west);
      }
      return this.west;
    }
    if (id === DEN_OF_EVIL) {
      // its own seed from the world's, so a reload finds the same den
      const seed = (Math.imul(this.game.worldSeed ^ 0x0de0f, 0x9e3779b1) + DEN_OF_EVIL) >>> 0;
      return (this.den ??= new Level(WILD_MAPS, seed, generateDen(seed), this.game.player.difficulty));
    }
    if (trialFloor(id) === undefined) return null;
    const depth = depthForArea(id)!;
    // like D2: going back to the floor you left (waypoint, after dying) finds it as you left it
    if (!fresh && this.lastDungeon?.depth === depth && this.lastDungeon.difficulty === this.game.player.difficulty) return this.lastDungeon;
    return (this.lastDungeon = new Level(depth, newSeed(), undefined, this.game.player.difficulty));
  }

  /** the maps made so far and kept (the rifts' floors are the rift's: Rifts.levels) */
  kept(): Level[] {
    return [this.west, this.den, this.gallery, this.lastDungeon, ...this.dungeons.values()].filter((L): L is Level => !!L);
  }

  /**
   * the maps of the difficulty played let go of, made anew in the next one's (Game.switchDifficulty);
   * ?gallery's showroom stays, made of the world's seed alone
   */
  forget() {
    this.west = this.den = this.lastDungeon = null;
    this.dungeons.clear();
  }
}
