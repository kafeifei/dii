// The hero's hireling in play (M2a, docs/M2A-STEP0.md 2.3): Kashya's Rogue Scout as she stands on the
// map beside the hero. Her place in the game's types so far: what a kill of hers is (kills.ts Killer),
// a friendly monsters go for as they do the hero (ai.ts friendlyTarget) and what their blows do to
// her (mercStruck); her state, the save and the rest of the stubs come with the save contract.
import { chance } from '../core/math';
import { Actor, type DamagePacket, type Resists } from './actor';
import { applyDamage, hitOdds } from './combat';
import type { Game } from './game';
import type { Monster } from './monster';
import type { Player } from './player';

/** the hero's side on a map, what monsters go for (Game.friendlies) */
export type Friendly = Player | Merc;

/** the hireling on the map beside the hero: a friendly, as the hero is (faction 'player') */
export class Merc extends Actor {
  faction = 'player' as const;
  /** her defense, her level's and her gear's with her dexterity's (hireling.ts mercStats): what a blow at her is rolled against */
  defense = 0;
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

/**
 * A monster's blow or missile at her (combat.ts monsterStrike): one that isn't a spell lands on
 * D2's hit roll, the blow's rating against her defense, with both levels (SUNITDMG_IsHitSuccessful,
 * as for the hero); she has no shield, so blocks nothing, and her gear never wears (hireling.ts
 * MERC_GEAR_WEARS). Whether it landed
 */
export function mercStruck(g: Game, m: Monster, merc: Merc, pk: DamagePacket, _melee = false): boolean {
  if (merc.dead) return false;
  if (!pk.spell && !chance(hitOdds(pk.ar ?? m.ar, merc.defense, m.level, merc.level))) return false;
  applyDamage(g, merc, pk, m.pos);
  return true;
}

/** her life gone (combat.ts applyDamage): she falls, and waits in the camp to be paid back (M2a's M line) */
export function mercDied(_g: Game, _merc: Merc) {}
