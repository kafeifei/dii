/**
 * Every sound the game plays, under a stable id: `category.name`. Game code names the event
 * (sfx.play('combat.hit', { pos })), never how it sounds, so recorded files can take over one id
 * at a time (src/audio/files.ts). Until then, and whenever its files fail to load, each id names the
 * WebAudio recipe in Sfx that renders it. Spell sounds are shared by element (cast and impact),
 * whoever casts them, not one set per skill.
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
  /** how far a recorded file's pitch strays each time it plays, as a fraction (default VARY, none for ui.*) */
  vary?: number;
}

/** a recorded file plays up to 4% (about ±0.7 semitone) off its pitch: variety from one take */
export const VARY = 0.04;

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
 * Where the hero is, for its ambience and its music. The game names the area; until levels have
 * areas of their own, a level's theme key stands in for it ('town' the camp, 'wild', 'crypt'…).
 * Off the map, a named screen such as 'title'.
 */
export type AreaId = string | number;

/** the looping beds Sfx synthesizes */
export type Bed = 'town' | 'dungeon' | 'none';

/** a recorded ambience loop */
export type AmbId = `amb.${string}`;
/** a recorded music track, streamed */
export type MusicId = `music.${string}`;
/** a recorded line of speech, one speaker's (tools/audio/list.mjs): voice.<speaker>.<line> */
export type VoiceId = `voice.${string}`;
/** what can have recorded files: an effect, an ambience loop, a music track, a voice line */
export type FileId = SoundId | AmbId | MusicId | VoiceId;

/** the music Sfx composes where an area has no recorded track (src/audio/score.ts) */
export type ScoreKind = 'town' | 'outdoor' | 'dungeon';

/** what an area sounds like */
export interface AreaSound {
  /** the synthesized ambience, while it has no recorded loops (or they failed to load) */
  bed: Bed;
  /** its recorded ambience: loops layered together */
  amb?: AmbId[];
  /** its recorded music */
  music?: MusicId;
  /** the music composed in its place while there's no recording of it */
  score?: ScoreKind;
}

/** by the kind of area: what each sounds like, and the names its recordings will go by */
const KINDS: Record<ScoreKind, AreaSound> = {
  // under the sky, the bed is wind and a campfire
  town: { bed: 'town', amb: ['amb.town'], music: 'music.town', score: 'town' },
  outdoor: { bed: 'town', amb: ['amb.wild'], music: 'music.wild', score: 'outdoor' },
  // underground, a low drone
  dungeon: { bed: 'dungeon', amb: ['amb.dungeon'], music: 'music.dungeon', score: 'dungeon' },
};

/** the level themes standing in for areas, by kind */
const THEME_KIND: Record<string, ScoreKind> = {
  town: 'town',
  wild: 'outdoor',
  crypt: 'dungeon',
  cave: 'dungeon',
  ice: 'dungeon',
  hell: 'dungeon',
};

/** the screens off the map */
const SCREENS: Record<string, AreaSound> = {
  title: { bed: 'none' },
};

/**
 * A stable name for the area, which its composed music is seeded by. An area defined in the world
 * (src/world/areas.ts) would give its key, not itself: String() of an object is the same for all.
 */
export function areaKey(area: AreaId): string {
  return String(area);
}

/** an area nobody has given a sound is quiet */
export function areaSound(area: AreaId): AreaSound {
  const kind = THEME_KIND[String(area)];
  return kind ? KINDS[kind] : (SCREENS[String(area)] ?? { bed: 'none' });
}

const recordings = (s: AreaSound): FileId[] => [...(s.amb ?? []), ...(s.music ? [s.music] : [])];

/** the recordings an area plays, to warm with Sfx.preload before the hero gets there */
export function areaFiles(area: AreaId): FileId[] {
  return recordings(areaSound(area));
}

/** every recording an area can ask for */
export const AREA_FILES: readonly FileId[] = [...new Set(Object.values(KINDS).flatMap(recordings))];
