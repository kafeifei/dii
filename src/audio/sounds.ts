/**
 * Every sound the game plays, under a stable id: `category.name`. Game code names the event
 * (sfx.play('combat.hit', { pos })), never how it sounds, so recorded files can take over one id
 * at a time (src/audio/files.ts). Until then, and whenever its files fail to load, each id names the
 * WebAudio recipe in Sfx that renders it. Spell sounds are shared by element (cast and impact),
 * whoever casts them, not one set per skill.
 */
import type { PlayerClass } from '../data/classes';
import type { ItemType } from '../data/items';

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
export const ENTER_LINE: Record<ScoreKind, HeroLine> = { town: 'back_in_town', outdoor: 'enter_wild', dungeon: 'enter_dungeon' };

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
  /** under the sky, its ambience by night in place of amb (isNight); while that has no recordings, amb's */
  night?: AmbId[];
  /** its recorded music */
  music?: MusicId;
  /** the music composed in its place while there's no recording of it */
  score?: ScoreKind;
}

/** by the kind of area: what each sounds like, and the names its recordings will go by */
const KINDS: Record<ScoreKind, AreaSound> = {
  // under the sky, the bed is wind and a campfire; by night the crickets come out
  town: { bed: 'town', amb: ['amb.town'], night: ['amb.town_night'], music: 'music.town', score: 'town' },
  outdoor: { bed: 'town', amb: ['amb.wild'], night: ['amb.wild_night'], music: 'music.wild', score: 'outdoor' },
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

/** what kind of area it is: the camp, under the sky, underground; null off the map (or unknown) */
export function areaKind(area: AreaId): ScoreKind | null {
  return THEME_KIND[String(area)] ?? null;
}

/** an area nobody has given a sound is quiet */
export function areaSound(area: AreaId): AreaSound {
  const kind = areaKind(area);
  return kind ? KINDS[kind] : (SCREENS[String(area)] ?? { bed: 'none' });
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

/** the recordings an area plays at that time of day, to warm with Sfx.preload before the hero gets there */
export function areaFiles(area: AreaId, night = false): FileId[] {
  const s = areaSound(area);
  return [...ambOf(s, night), ...musicOf(s)];
}

/** every recording an area can ask for, by day or by night */
export const AREA_FILES: readonly FileId[] = [...new Set(Object.values(KINDS).flatMap((s) => [...(s.amb ?? []), ...(s.night ?? []), ...musicOf(s)]))];

/** the effects heard in each kind of area, by category: nobody fights in the camp */
const HEARD: Record<ScoreKind, readonly SoundCategory[]> = {
  town: ['ui', 'item', 'env', 'player'],
  outdoor: Object.keys(GROUPS) as SoundCategory[],
  dungeon: Object.keys(GROUPS) as SoundCategory[],
};

/**
 * What to decode as the hero walks into an area (Sfx.preload), so what's heard there plays recorded
 * from the first time rather than as its synthesized stand-in: the effects of that kind of area, and
 * for each area its ways out lead to (`next`), its recordings at this time of day and the hero's line
 * for walking into it. The area's own ambience isn't here: walking in has started it already.
 */
export function soundsNear(area: AreaId, next: readonly AreaId[], night: boolean, cls: PlayerClass): FileId[] {
  const kind = areaKind(area);
  const heard = kind ? HEARD[kind] : [];
  const out = new Set<FileId>((Object.keys(SOUNDS) as SoundId[]).filter((id) => heard.includes(id.split('.')[0] as SoundCategory)));
  for (const a of next) {
    for (const id of areaFiles(a, night)) out.add(id);
    const k = areaKind(a);
    if (k && k !== kind) out.add(heroLine(cls, ENTER_LINE[k]));
  }
  return [...out];
}
