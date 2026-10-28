
/**
 * Every sound the game plays, under a stable id: `category.name`. Game code names the event
 * (sfx.play('combat.hit', { pos })), never how it sounds, so recorded files can take over one id
 * at a time (src/audio/files.ts). Until then, and whenever its files fail to load, each id names the
 * WebAudio recipe in Sfx that renders it. Spell sounds are shared by element (cast and impact),
 * whoever casts them, not one set per skill.
 */
import type { PlayerClass } from '../data/classes';
import type { ItemType } from '../data/items';
import type { AreaDef, AreaKind } from '../world/areas';

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
  | 'poison'
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

/** how a recording is played: an effect's, or a line's (LINE), which has no recipe to stand in for it */
export interface Playing {
  /** what plays while it has no recording, or it fails to load: without one, nothing does */
  synth?: Synth;
  /** its level in the mix, times the caller's vol (default 1) */
  vol?: number;
  /** how many may sound at once (default 3): one more takes over the oldest */
  max?: number;
  /** default 'normal' */
  prio?: Priority;
  /** how far a recorded file's pitch strays each time it plays, as a fraction (default VARY, none for ui.*) */
  vary?: number;
}

export interface SoundDef extends Playing {
  synth: Synth;
}

/** a recorded file plays up to 4% (about ±0.7 semitone) off its pitch: variety from one take */
export const VARY = 0.04;

export type SoundCategory = 'combat' | 'player' | 'item' | 'ui' | 'skill' | 'monster' | 'env';

const GROUPS = {
  combat: {
    /** the hero's weapon swung, by its kind (SWING_SOUND): a blade */
    swing: { synth: 'swing', vol: 0.7, max: 2 },
    /** a club, a mace, a hammer, a staff, one- or two-handed; bare fists */
    swing_blunt: { synth: 'swing', vol: 0.7, max: 2 },
    /** a two-handed blade, a spear or a polearm */
    swing_heavy: { synth: 'swing', vol: 0.7, max: 2 },
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
    /** a big one (LARGE_MONSTER) or a boss */
    die_large: { synth: 'die', vol: 0.9, max: 2, prio: 'high' },
    /** a boss notices the hero */
    boss_wake: { synth: 'boss', max: 1, prio: 'high' },
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
    /** a poison spray or spit (Andariel's, a mage's) */
    poison_cast: { synth: 'poison', max: 3 },
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
    /**
     * an item lands on the ground, with the sound of its kind (DROP_SOUND), as in Diablo II: a potion
     * clinks, a ring tings, armour rattles. This one is what has no kind of its own (a staff, the cube)
     */
    drop: { synth: 'drop', vol: 0.5, max: 4 },
    drop_potion: { synth: 'drop', vol: 0.5, max: 3 },
    drop_ring: { synth: 'drop', vol: 0.5, max: 2 },
    drop_amulet: { synth: 'drop', vol: 0.5, max: 2 },
    drop_gem: { synth: 'drop', vol: 0.5, max: 2 },
    drop_weapon: { synth: 'drop', vol: 0.5, max: 3 },
    /** body armour, a helm, a shield */
    drop_armor: { synth: 'drop', vol: 0.5, max: 3 },
    /** gloves, boots, a belt */
    drop_leather: { synth: 'drop', vol: 0.5, max: 3 },
    /** a unique or set item lands: a stinger over the sound of its kind */
    drop_unique: { synth: 'dropunique', max: 2, prio: 'critical' },
    /** a rune lands: its knock on the ground and a stinger, in one */
    drop_rune: { synth: 'droprune', max: 2, prio: 'high' },
    /** picked up off the ground */
    pickup: { synth: 'pickup', max: 2 },
    /** gold lands, or is picked up */
    gold: { synth: 'gold' },
    /** lifted or put down in the bag, the stash, the cube or the belt */
    move: { synth: 'pickup', max: 2, prio: 'high' },
    equip: { synth: 'equip', max: 2, prio: 'high' },
    socket: { synth: 'socket', max: 1, prio: 'high' },
    /** a socketed item became a runeword */
    runeword: { synth: 'dropunique', max: 1, prio: 'critical' },
    /** a worn item's durability ran out */
    broken: { synth: 'nomana', max: 1, prio: 'high' },
    /** the cube made something */
    transmute: { synth: 'socket', max: 1, prio: 'high' },
    drink: { synth: 'potion', max: 2, prio: 'high' },
  },
  ui: {
    click: { synth: 'click', prio: 'high' },
    /** a panel opened: the bag, the character, the skills, a merchant's, the stash, the cube */
    open: { synth: 'click', max: 1, prio: 'high' },
    /** and closed */
    close: { synth: 'click', max: 1, prio: 'high' },
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

/** the hero's swing by the weapon's kind: a blade's (not here) is combat.swing, or swing_heavy two-handed */
export const SWING_SOUND: Partial<Record<ItemType, SoundId>> = {
  club: 'combat.swing_blunt',
  mace: 'combat.swing_blunt',
  hammer: 'combat.swing_blunt',
  scepter: 'combat.swing_blunt',
  staff: 'combat.swing_blunt',
  wand: 'combat.swing_blunt',
  orb: 'combat.swing_blunt',
  spear: 'combat.swing_heavy',
  polearm: 'combat.swing_heavy',
};

/** what an item sounds like landing, by its kind; a rune's is its stinger, the rest are item.drop */
export const DROP_SOUND: Partial<Record<ItemType, SoundId>> = {
  potion: 'item.drop_potion',
  ring: 'item.drop_ring',
  amulet: 'item.drop_amulet',
  gem: 'item.drop_gem',
  // a crystal ball: glass, not steel
  orb: 'item.drop_gem',
  rune: 'item.drop_rune',
  sword: 'item.drop_weapon',
  axe: 'item.drop_weapon',
  club: 'item.drop_weapon',
  mace: 'item.drop_weapon',
  hammer: 'item.drop_weapon',
  scepter: 'item.drop_weapon',
  dagger: 'item.drop_weapon',
  spear: 'item.drop_weapon',
  polearm: 'item.drop_weapon',
  // the D2 bases' kinds, by their Weapons.txt / Misc.txt dropsound: throwing knives and axes
  // (item_smallmetalweapon), claws (item_sword) and javelins (item_javelins) are steel; a jewel
  // (item_jewel) a cut stone. Bows, crossbows, charms, scrolls, tomes, keys and quivers have sounds
  // of their own in D2 that aren't recorded yet: item.drop
  throwing: 'item.drop_weapon',
  claw: 'item.drop_weapon',
  javelin: 'item.drop_weapon',
  jewel: 'item.drop_gem',
  armor: 'item.drop_armor',
  helm: 'item.drop_armor',
  shield: 'item.drop_armor',
  gloves: 'item.drop_leather',
  boots: 'item.drop_leather',
  belt: 'item.drop_leather',
};

/** a monster drawn this much bigger than a man (MonsterDef.scale) dies as a big one: monster.die_large */
export const LARGE_MONSTER = 1.3;

/**
 * What the hero says, by the moment, as Diablo II's heroes do: each class has its own words for
 * every one (tools/audio/voice-lines.md), recorded as voice.<class>.<line> (heroLine) and said by
 * Game.say. Those whose moment the game doesn't have yet (a quest, an area cleared) wait for it.
 */
export const HERO_LINES = [
  // what the hero can't do
  'bag_full',
  'cant_carry',
  'cant_use',
  'too_weak', // short of an item's strength or dexterity
  'low_level', // short of its level
  'no_mana',
  'no_gold',
  'cant_here', // not here: a spell in the camp
  'no_potion', // an empty belt slot used
  // what happens to the hero
  'level_up',
  'low_health',
  'poisoned',
  'item_breaking',
  // what the hero finds
  'unique',
  'set_item',
  'rune',
  // where the hero goes, and what's there
  'enter_wild',
  'enter_dungeon',
  'night_falls',
  'evil_here',
  'lair', // the quest's den
  'graveyard',
  'many_foes',
  'boss_near',
  'boss_dead',
  'area_clear',
  'quest_done',
  'waypoint',
  'shrine',
  'back_in_town',
] as const;
export type HeroLine = (typeof HERO_LINES)[number];
export type HeroVoiceId = `voice.${PlayerClass}.${HeroLine}`;

/** the hero's recording of a line: voice.paladin.no_mana */
export const heroLine = (cls: PlayerClass, line: HeroLine): HeroVoiceId => `voice.${cls}.${line}`;

/**
 * How a line is played (Sfx.play of a voice.* id), whoever speaks it: critical, so a busy fight
 * never drops it, and never off its pitch, which would change the voice. Its level puts the lines
 * (all made at -18 LUFS) about as loud as the hero's loudest cues (tools/scenarios/sfx.mjs).
 */
export const LINE: Playing = { vol: 0.45, max: 1, prio: 'critical', vary: 0 };

/** what the hero says walking into an area of another kind: out of the camp, underground, back */
export const ENTER_LINE: Record<AreaKind, HeroLine> = { town: 'back_in_town', outdoor: 'enter_wild', dungeon: 'enter_dungeon' };

/**
 * Where the hero is, for its ambience and its music: an area (src/world/areas.ts), which sounds as
 * its row of ENVIRONS says (by its key, else by its kind); or off the map, a named screen such as
 * 'title'. Only the area's type is needed here, not the maps that make areas.
 */
export type Place = AreaDef | string;

/**
 * the looping beds Sfx synthesizes where an area has no recorded loops (or they fail to load): the
 * camp's wind and campfire, the wilderness's wind alone, a drone underground
 */
export type Bed = 'town' | 'wild' | 'dungeon' | 'none';

/** a recorded ambience loop */
export type AmbId = `amb.${string}`;
/** a recorded music track, streamed */
export type MusicId = `music.${string}`;
/** a recorded line of speech, one speaker's (tools/audio/list.mjs): voice.<speaker>.<line> */
export type VoiceId = `voice.${string}`;
/** what can have recorded files: an effect, an ambience loop, a music track, a voice line */
export type FileId = SoundId | AmbId | MusicId | VoiceId;

/** the music Sfx composes where an area has no recorded track (src/audio/score.ts): the camp's, the wilderness's, a dungeon's */
export type ScoreKind = 'town' | 'outdoor' | 'dungeon';

/** what an area sounds like */
export interface AreaSound {
  /** the synthesized ambience, while it has no recorded loops (or they failed to load) */
  bed: Bed;
  /** its recorded ambience by day: loops layered together */
  amb?: AmbId[];
  /** under the sky, its ambience by night in place of amb (isNight); while that has no recordings, amb's */
  night?: AmbId[];
  /** its recorded music */
  music?: MusicId;
  /** the music composed in its place while there's no recording of it */
  score?: ScoreKind;
}

/**
 * The sound environments, as Diablo II's: levels.json SoundEnv names an area's row of
 * soundenviron.json (D2Common LevelsTbls.h dwSoundEnv), which plays its Song and its Day and Night
 * Ambience. ESOUNDENVIRON_TOWN_1 (1) is music_town_1 over the wilderness's ambience and the camp's
 * own events; ESOUNDENVIRON_WILDERNESS (2) is music_wilderness with scene_wilderness_day and
 * _night; ESOUNDENVIRON_CAVE (4) is music_caves and scene_cave, day and night. Our ids are D2's,
 * renamed by what plays them: the camp's ambience is its own, for its fire (and by night its
 * crickets). Each composes its own kind of music until it has a recording.
 */
const ENVIRONS = {
  town: { bed: 'town', amb: ['amb.town'], night: ['amb.town_night'], music: 'music.town', score: 'town' },
  wilderness: { bed: 'wild', amb: ['amb.wild'], night: ['amb.wild_night'], music: 'music.wild', score: 'outdoor' },
  cave: { bed: 'dungeon', amb: ['amb.dungeon'], music: 'music.dungeon', score: 'dungeon' },
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
 * What of a place's sound must change when the hero comes to another: its bed, its ambience, its
 * music and the music composed in its place. Equal for two areas, the one's sound plays on into
 * the other's, as D2's does between areas of one SoundEnv.
 */
export function soundKey(s: AreaSound): string {
  return `${s.bed}|${(s.amb ?? []).join('+')}|${(s.night ?? []).join('+')}|${s.music ?? ''}|${s.score ?? ''}`;
}

/** a stable name for a place, which its composed music is seeded by: an area's key, a screen's name */
export function areaKey(place: Place): string {
  return typeof place === 'string' ? place : place.key;
}

/** what kind of area it is: the camp, under the sky, underground; null off the map */
export function areaKind(place: Place): AreaKind | null {
  return typeof place === 'string' ? null : place.kind;
}

/**
 * The sky's dusk and dawn half over (src/render/sky.ts: dusk at 0.75, night from 0.8; night until
 * 0.2, dawn at 0.25), on the day's clock that runs 0 → 1 from midnight (Game.clock): where the
 * night's ambience takes over from the day's, and gives way again.
 */
export const DUSK = 0.775;
export const DAWN = 0.225;
export const isNight = (clock: number) => clock >= DUSK || clock < DAWN;

/** the area's ambience as it's named by day or by night (the day's, where it has no night of its own) */
export function ambOf(s: AreaSound, night: boolean): AmbId[] {
  return (night ? s.night : undefined) ?? s.amb ?? [];
}

const musicOf = (s: AreaSound): FileId[] => (s.music ? [s.music] : []);

/** the recordings a place plays at that time of day, to warm with Sfx.preload before the hero gets there */
export function areaFiles(place: Place, night = false): FileId[] {
  const s = areaSound(place);
  return [...ambOf(s, night), ...musicOf(s)];
}

/** every recording an area can ask for, by day or by night */
export const AREA_FILES: readonly FileId[] = [...new Set(Object.values(ENVIRONS).flatMap((s: AreaSound) => [...(s.amb ?? []), ...(s.night ?? []), ...musicOf(s)]))];

/** the effects heard in each kind of area, by category: nobody fights in the camp */
const HEARD: Record<AreaKind, readonly SoundCategory[]> = {
  town: ['ui', 'item', 'env', 'player'],
  outdoor: Object.keys(GROUPS) as SoundCategory[],
  dungeon: Object.keys(GROUPS) as SoundCategory[],
};

/**
 * What to decode as the hero comes into a place (Sfx.preload), so what's heard there plays recorded
 * from the first time rather than as its synthesized stand-in: the effects of that kind of area, and
 * for each area next to it (`next`: across a seam, or where a way on leads) its recordings at this
 * time of day and the hero's line for walking into it. The place's own ambience isn't here: coming
 * in has started it already.
 */
export function soundsNear(place: Place, next: readonly Place[], night: boolean, cls: PlayerClass): FileId[] {
  const kind = areaKind(place);
  const heard = kind ? HEARD[kind] : [];
  const out = new Set<FileId>((Object.keys(SOUNDS) as SoundId[]).filter((id) => heard.includes(id.split('.')[0] as SoundCategory)));
  for (const a of next) {
    for (const id of areaFiles(a, night)) out.add(id);
    const k = areaKind(a);
    if (k && k !== kind) out.add(heroLine(cls, ENTER_LINE[k]));
  }
  return [...out];
}
