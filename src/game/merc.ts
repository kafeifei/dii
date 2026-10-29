// The hero's hireling in play (M2a, docs/M2A-STEP0.md 2.3): Kashya's Rogue Scout as she stands on the
// map beside the hero. Only her place in the game's types so far, for what a kill of hers is
// (kills.ts Killer); her state, the save and the stubs come with the save contract.
import { Actor, type Resists } from './actor';

/** the hireling on the map beside the hero: a friendly, as the hero is (faction 'player') */
export class Merc extends Actor {
  faction = 'player' as const;
  /**
   * her magic and gold find, her gear's: what a monster she kills drops by (the killer's, as the
   * hero's is the hero's; inferred, to be checked against D2MOO: docs/M2A-STEP0.md 5)
   */
  mf = 0;
  gf = 0;

  resists(): Resists {
    return { fire: 0, cold: 0, light: 0, poison: 0, phys: 0 };
  }
}
