import type { AreaDef, AreaKind } from '../world/areas';

/**
 * Every sound the game plays, under a stable id: `category.name`. Game code names the event
 * (sfx.play('combat.hit', { pos })), never how it sounds, so recorded files can take over one id
 * at a time. Until then each id names the WebAudio recipe in Sfx that renders it. Spell sounds are
 * shared by element (cast and impact), whoever casts them, not one set per skill.
 */

/** the recipes Sfx synthesizes */
export type Synth =
  | 'swing'
  | 'hit'
  | 'hitbone'
  | 'hitheavy'
  | 'block'
  | 'die'
  | 'diebone'
  | 'impdie'
  | 'hurt'
  | 'gold'
  | 'drop'
  | 'dropunique'
  | 'droprune'
  | 'pickup'
  | 'potion'
  | 'levelup'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'hammer'
  | 'holy'
  | 'aura'
  | 'nomana'
  | 'chest'
  | 'barrel'
  | 'portal'
  | 'arrow'
  | 'click'
  | 'equip'
  | 'socket'
  | 'charge'
  | 'boss'
  | 'death';

/** who keeps a voice when every one is busy: a critical sound always plays, however far away */
export type Priority = 'low' | 'normal' | 'high' | 'critical';
export const PRIORITY: Record<Priority, number> = { low: 0, normal: 1, high: 2, critical: 3 };

export interface SoundDef {
  synth: Synth;
  /** its level in the mix, times the caller's vol (default 1) */
  vol?: number;
  /** how many may sound at once (default 3): one more takes over the oldest */
  max?: number;
  /** default 'normal' */
  prio?: Priority;
}

export type SoundCategory = 'combat' | 'player' | 'item' | 'ui' | 'skill' | 'monster' | 'env';

const GROUPS = {
  combat: {
    /** the hero's weapon swung */
    swing: { synth: 'swing', vol: 0.7, max: 2 },
    /** a monster struck, by weapon or spell */
    hit: { synth: 'hit', vol: 0.8, max: 4 },
    hit_heavy: { synth: 'hitheavy', vol: 0.8, max: 3 },
    hit_bone: { synth: 'hitbone', vol: 0.8, max: 4 },
    /** the hero's shield took a blow */
    block: { synth: 'block', max: 2, prio: 'high' },
    /** a bow shot */
    arrow: { synth: 'arrow', prio: 'low' },
  },
  /** what happens to the hero, as monster.* is what happens to a monster */
  player: {
    hurt: { synth: 'hurt', vol: 0.7, max: 2, prio: 'critical' },
    death: { synth: 'death', max: 1, prio: 'critical' },
    level_up: { synth: 'levelup', max: 1, prio: 'critical' },
  },
  monster: {
    /** a monster's melee swing */
    swing: { synth: 'swing', vol: 0.5, prio: 'low' },
    die: { synth: 'die', vol: 0.8, max: 4 },
    die_bone: { synth: 'diebone', vol: 0.8, max: 4 },
    /** imps and shamans */
    die_imp: { synth: 'impdie', vol: 0.8, max: 4 },
    /** a boss notices the hero */
    boss_wake: { synth: 'boss', max: 1, prio: 'high' },
    /** a boss rushes the hero */
    charge: { synth: 'charge', max: 1, prio: 'high' },
    /** a shaman raises a corpse */
    resurrect: { synth: 'holy', vol: 0.5, max: 2 },
  },
  skill: {
    fire_cast: { synth: 'fire' },
    fire_impact: { synth: 'fire', max: 4 },
    cold_cast: { synth: 'cold' },
    cold_impact: { synth: 'cold', max: 4 },
    lightning_cast: { synth: 'lightning' },
    lightning_impact: { synth: 'lightning' },
    holy_cast: { synth: 'holy', max: 2 },
    /** blessed hammer */
    magic_cast: { synth: 'hammer' },
    teleport: { synth: 'portal', vol: 0.6, max: 1 },
    /** an aura switched on */
    aura: { synth: 'aura', max: 1 },
    /** the hero's charge begins */
    charge: { synth: 'charge', max: 1 },
  },
  item: {
    /** an item lands on the ground */
    drop: { synth: 'drop', vol: 0.5, max: 4 },
    /** a unique or set item lands */
    drop_unique: { synth: 'dropunique', max: 2, prio: 'critical' },
    drop_rune: { synth: 'droprune', max: 2, prio: 'high' },
    /** picked up off the ground */
    pickup: { synth: 'pickup', max: 2 },
    gold: { synth: 'gold' },
    /** lifted or put down in the bag, the stash, the cube or the belt */
    move: { synth: 'pickup', max: 2, prio: 'high' },
    equip: { synth: 'equip', max: 2, prio: 'high' },
    socket: { synth: 'socket', max: 1, prio: 'high' },
    /** a socketed item became a runeword */
    runeword: { synth: 'dropunique', max: 1, prio: 'critical' },
    /** the cube made something */
    transmute: { synth: 'socket', max: 1, prio: 'high' },
    drink: { synth: 'potion', max: 2, prio: 'high' },
  },
  ui: {
    click: { synth: 'click', prio: 'high' },
    /** gold changed hands: bought, sold, recharged, into or out of the stash */
    coins: { synth: 'gold', max: 2, prio: 'high' },
    /** a skill point spent */
    skill_learn: { synth: 'levelup', vol: 0.4, max: 1, prio: 'high' },
    no_mana: { synth: 'nomana', max: 1, prio: 'high' },
    /** the bag is full */
    no_room: { synth: 'nomana', max: 1, prio: 'high' },
    no_gold: { synth: 'nomana', max: 1, prio: 'high' },
    /** an item the hero can't equip there */
    cant_use: { synth: 'nomana', max: 1, prio: 'high' },
    /** the cube had no recipe for that */
    denied: { synth: 'nomana', max: 1, prio: 'high' },
  },
  env: {
    chest: { synth: 'chest', max: 2 },
    barrel: { synth: 'barrel' },
    shrine: { synth: 'holy', max: 1, prio: 'high' },
    /** a town portal opens */
    portal_open: { synth: 'portal', max: 1, prio: 'high' },
    /** stepped through a town portal */
    portal_enter: { synth: 'portal', max: 1, prio: 'high' },
    /** travelled by waypoint */
    waypoint: { synth: 'portal', max: 1, prio: 'high' },
    /** the merchant put life and mana back */
    vendor_heal: { synth: 'holy', max: 1, prio: 'high' },
  },
} satisfies Record<SoundCategory, Record<string, SoundDef>>;

type Groups = typeof GROUPS;
export type SoundId = { [C in keyof Groups]: `${C}.${Extract<keyof Groups[C], string>}` }[keyof Groups];

export const SOUNDS = Object.fromEntries(
  Object.entries(GROUPS).flatMap(([cat, group]) => Object.entries(group).map(([name, def]) => [`${cat}.${name}`, def as SoundDef])),
) as Record<SoundId, SoundDef>;

/**
 * Where the hero is, for its ambience and its music: an area (src/world/areas.ts), which sounds as
 * its row of ENVIRONS says (by its key, else by its kind); or off the map, a named screen such as
 * 'title'. Only the area's type is needed here, not the maps that make areas.
 */
export type Place = AreaDef | string;

/** the looping beds Sfx synthesizes: the camp's wind and campfire, the wilderness's wind alone, a drone underground */
export type Bed = 'town' | 'wild' | 'dungeon' | 'none';

/** a recorded ambience loop, named for the audio engine to come (line C); this build has none */
export type AmbId = `amb.${string}`;
/** a recorded music track, likewise */
export type MusicId = `music.${string}`;

/** what an area sounds like */
export interface AreaSound {
  /** the ambience synthesized while there are no recordings: what plays today */
  bed: Bed;
  /** its ambience by day: loops layered */
  amb?: AmbId[];
  /** under the sky, its ambience by night, in place of amb */
  night?: AmbId[];
  /** its music. Nothing plays it yet: there are no recordings and nothing composes one in its place */
  music?: MusicId;
}

/**
 * The sound environments, as Diablo II's: levels.json SoundEnv names an area's row of
 * soundenviron.json (D2Common LevelsTbls.h dwSoundEnv), which plays its Song and its Day and Night
 * Ambience. ESOUNDENVIRON_TOWN_1 (1) is music_town_1 over the wilderness's ambience and the camp's
 * own events; ESOUNDENVIRON_WILDERNESS (2) is music_wilderness with scene_wilderness_day and
 * _night; ESOUNDENVIRON_CAVE (4) is music_caves and scene_cave, day and night. Our ids are D2's,
 * renamed by what plays them: the camp's ambience is its own, for its fire.
 */
const ENVIRONS = {
  town: { bed: 'town', amb: ['amb.town'], night: ['amb.town_night'], music: 'music.town' },
  wilderness: { bed: 'wild', amb: ['amb.wild'], night: ['amb.wild_night'], music: 'music.wild' },
  cave: { bed: 'dungeon', amb: ['amb.dungeon'], music: 'music.dungeon' },
} satisfies Record<string, AreaSound>;

type Environ = keyof typeof ENVIRONS;

/**
 * Each area's environment, by its key, as levels.json SoundEnv has it: the camp 1; Blood Moor,
 * Cold Plains, Stony Field and the Burial Grounds all 2, so the wilderness's music and wind play on
 * from one into the next; the Den of Evil 4
 */
const AREA_ENVIRON: Record<string, Environ> = {
  camp: 'town',
  wild: 'wilderness',
  coldplains: 'wilderness',
  stonyfield: 'wilderness',
  burialgrounds: 'wilderness',
  denofevil: 'cave',
};

/** an area with no row of its own sounds like its kind: the trial ground's floors are dungeons */
const KIND_ENVIRON: Record<AreaKind, Environ> = { town: 'town', outdoor: 'wilderness', dungeon: 'cave' };

/** the screens off the map */
const SCREENS: Record<string, AreaSound> = {
  title: { bed: 'none' },
};

/** what a place sounds like; a screen nobody has given a sound is quiet */
export function areaSound(place: Place): AreaSound {
  if (typeof place === 'string') return SCREENS[place] ?? { bed: 'none' };
  return ENVIRONS[AREA_ENVIRON[place.key] ?? KIND_ENVIRON[place.kind]];
}

/**
 * What of a place's sound must change when the hero comes to another: what plays (its bed) and
 * what will (its ambience and its music). Equal for two areas, the one's sound plays on into the
 * other's, as D2's does between areas of one SoundEnv.
 */
export function soundKey(s: AreaSound): string {
  return `${s.bed}|${(s.amb ?? []).join('+')}|${(s.night ?? []).join('+')}|${s.music ?? ''}`;
}
