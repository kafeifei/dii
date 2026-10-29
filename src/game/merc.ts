// The hero's hireling (M2a, docs/M2A-STEP0.md 2.3): Kashya's Rogue Scout. What the hero keeps of her,
// on the map or not, is Player.merc (MercState, saved with the hero as SaveV4.merc: src/game/save.ts);
// Merc is she as she stands on the map beside the hero (Game.merc), her numbers Diablo II's for her
// row and level (src/game/d2/hireling.ts mercStats). So far: what a kill of hers is (kills.ts Killer),
// a friendly monsters go for as they do the hero (ai.ts friendlyTarget), what their blows do to her
// (mercStruck), and the stubs the M line fills (updateMerc, mercDied). None is on the map yet.
import { chance, type P2 } from '../core/math';
import type { Item } from '../items/item';
import { mercStats, type MercSlot } from './d2/hireling';
import { Actor, type DamagePacket, type Resists } from './actor';
import { applyDamage, hitOdds } from './combat';
import type { Game } from './game';
import type { Monster } from './monster';
import type { Player } from './player';

/** the hero's side on a map, what monsters go for (Game.friendlies) */
export type Friendly = Player | Merc;

/**
 * The hero's hireling as the hero keeps her (Player.merc), on the map or not, dead or alive: what the
 * save keeps of her (save.ts MercSave, Diablo II's hireling save: her Hireling.txt row, her name's
 * row, level, experience, gear, life, death). `raw`: one this build can't read (a Hireling.txt row it
 * hasn't, a slot it hasn't, a field not what it should be: a later build's), kept as saved, never
 * played, and written back so; the other fields then say nothing
 */
export interface MercState {
  /** her Hireling.txt Id: her kind, act and difficulty (hireling.ts hireling) */
  hire: number;
  /** her name, a row of her act's names (hireling.ts hirelingName) */
  name: number;
  level: number;
  xp: number;
  /** what she wears: a helm, body armour and a weapon (hireling.ts mercSlot) */
  equipment: Partial<Record<MercSlot, Item>>;
  /** life left; unset is full */
  life?: number;
  /** dead, she waits at the camp to be paid back to life (hireling.ts resurrectCost) */
  dead: boolean;
  raw?: unknown;
}

/** the hireling on the map beside the hero: a friendly, as the hero is (faction 'player') */
export class Merc extends Actor {
  faction = 'player' as const;
  /** what the hero keeps of her (Player.merc); none for a stand-in made without one (the tests') */
  readonly kept: MercState | null;
  /** her defense, her level's and her gear's with her dexterity's (hireling.ts mercStats): what a blow at her is rolled against */
  defense = 0;
  /** her fire, cold, lightning and poison resistances before the difficulty's penalty (mercStats; her gear's come with the M line) */
  res: [number, number, number, number] = [0, 0, 0, 0];
  /**
   * her magic and gold find, her gear's: what a monster she kills drops by (the killer's, as the
   * hero's is the hero's; inferred, to be checked against D2MOO: docs/M2A-STEP0.md 5)
   */
  mf = 0;
  gf = 0;

  /** she at `pos`, from what the hero keeps of her: her life, defense and resistances at her level (her gear's come with the M line) */
  constructor(pos: P2, state: MercState | null = null) {
    super(pos);
    this.kept = state;
    if (!state || state.raw !== undefined) return;
    const s = mercStats(state.hire, state.level);
    this.level = state.level;
    this.maxLife = s.life;
    this.life = Math.min(s.life, state.life ?? s.life);
    this.dead = state.dead;
    this.defense = s.defense;
    this.res = [...s.resist];
  }

  resists(): Resists {
    const [fire, cold, light, poison] = this.res;
    return { fire, cold, light, poison, phys: 0 };
  }
}

/** her step (Game.update): following the hero, fighting, drinking her potions (M2a's M line); nothing yet */
export function updateMerc(_g: Game, _merc: Merc, _dt: number) {}

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
