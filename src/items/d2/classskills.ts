// Each class's 30 skills in skills.txt row order, as staff mods pick them: [D2 skill name,
// reqlevel, itypea1]. From d2data skills.json (skill, charclass, reqlevel, itypea1) at the pinned
// commit fc46999; the integration branch swaps this for the skill table once tools/d2 imports it.
// Staff mods only read the classes an item type's StaffMods names (no Amazon type has any); proc
// and charged skill levels (props.ts) and skill-rand ids read every class.

/** [D2 name, level to learn it, the item type it needs (itypea1)] */
export type ClassSkill = [name: string, reqLvl: number, itype?: string];

export const CLASS_SKILLS: Record<string, ClassSkill[]> = {
  ama: [
    ["Magic Arrow", 1, "miss"], ["Fire Arrow", 1, "miss"], ["Inner Sight", 1], ["Critical Strike", 1, "spea"], ["Jab", 1, "spea"],
    ["Cold Arrow", 6, "miss"], ["Multiple Shot", 6, "miss"], ["Dodge", 6], ["Power Strike", 6, "spea"], ["Poison Javelin", 6, "jave"],
    ["Exploding Arrow", 12, "miss"], ["Slow Missiles", 12], ["Avoid", 12], ["Impale", 12, "spea"], ["Lightning Bolt", 12, "jave"],
    ["Ice Arrow", 18, "miss"], ["Guided Arrow", 18, "miss"], ["Penetrate", 18, "spea"], ["Charged Strike", 18, "spea"], ["Plague Javelin", 18, "jave"],
    ["Strafe", 24, "miss"], ["Immolation Arrow", 24, "miss"], ["Dopplezon", 24], ["Evade", 24], ["Fend", 24, "spea"],
    ["Freezing Arrow", 30, "miss"], ["Valkyrie", 30], ["Pierce", 30, "miss"], ["Lightning Strike", 30, "spea"], ["Lightning Fury", 30, "jave"],
  ],
  sor: [
    ["Fire Bolt", 1], ["Warmth", 1], ["Charged Bolt", 1], ["Ice Bolt", 1], ["Frozen Armor", 1],
    ["Inferno", 6], ["Static Field", 6], ["Telekinesis", 6], ["Frost Nova", 6], ["Ice Blast", 6],
    ["Blaze", 12], ["Fire Ball", 12], ["Nova", 12], ["Lightning", 12], ["Shiver Armor", 12],
    ["Fire Wall", 18], ["Enchant", 18], ["Chain Lightning", 18], ["Teleport", 18], ["Glacial Spike", 18],
    ["Meteor", 24], ["Thunder Storm", 24], ["Energy Shield", 24], ["Blizzard", 24], ["Chilling Armor", 24],
    ["Fire Mastery", 30], ["Hydra", 30], ["Lightning Mastery", 30], ["Frozen Orb", 30], ["Cold Mastery", 30],
  ],
  nec: [
    ["Amplify Damage", 1], ["Teeth", 1], ["Bone Armor", 1], ["Skeleton Mastery", 1], ["Raise Skeleton", 1],
    ["Dim Vision", 6], ["Weaken", 6], ["Poison Dagger", 6, "knif"], ["Corpse Explosion", 6], ["Clay Golem", 6],
    ["Iron Maiden", 12], ["Terror", 12], ["Bone Wall", 12], ["Golem Mastery", 12], ["Raise Skeletal Mage", 12],
    ["Confuse", 18], ["Life Tap", 18], ["Poison Explosion", 18], ["Bone Spear", 18], ["BloodGolem", 18],
    ["Attract", 24], ["Decrepify", 24], ["Bone Prison", 24], ["Summon Resist", 24], ["IronGolem", 24],
    ["Lower Resist", 30], ["Poison Nova", 30], ["Bone Spirit", 30], ["FireGolem", 30], ["Revive", 30],
  ],
  pal: [
    ["Sacrifice", 1, "mele"], ["Smite", 1, "shld"], ["Might", 1], ["Prayer", 1], ["Resist Fire", 1],
    ["Holy Bolt", 6], ["Holy Fire", 6], ["Thorns", 6], ["Defiance", 6], ["Resist Cold", 6],
    ["Zeal", 12, "mele"], ["Charge", 12, "mele"], ["Blessed Aim", 12], ["Cleansing", 12], ["Resist Lightning", 12],
    ["Vengeance", 18, "mele"], ["Blessed Hammer", 18], ["Concentration", 18], ["Holy Freeze", 18], ["Vigor", 18],
    ["Conversion", 24, "mele"], ["Holy Shield", 24, "shld"], ["Holy Shock", 24], ["Sanctuary", 24], ["Meditation", 24],
    ["Fist of the Heavens", 30], ["Fanaticism", 30], ["Conviction", 30], ["Redemption", 30], ["Salvation", 30],
  ],
  bar: [
    ["Bash", 1, "mele"], ["Blade Mastery", 1], ["Axe Mastery", 1], ["Mace Mastery", 1], ["Howl", 1],
    ["Find Potion", 1], ["Leap", 6], ["Double Swing", 6, "mele"], ["Pole Arm Mastery", 6], ["Throwing Mastery", 6],
    ["Spear Mastery", 6], ["Taunt", 6], ["Shout", 6], ["Stun", 12, "mele"], ["Double Throw", 12, "thro"],
    ["Increased Stamina", 12], ["Find Item", 12], ["Leap Attack", 18, "mele"], ["Concentrate", 18, "mele"], ["Iron Skin", 18],
    ["Battle Cry", 18], ["Frenzy", 24, "mele"], ["Increased Speed", 24], ["Battle Orders", 24], ["Grim Ward", 24],
    ["Whirlwind", 30, "mele"], ["Berserk", 30, "mele"], ["Natural Resistance", 30], ["War Cry", 30], ["Battle Command", 30],
  ],
  dru: [
    ["Raven", 1], ["Plague Poppy", 1], ["Wearwolf", 1], ["Shape Shifting", 1], ["Firestorm", 1],
    ["Oak Sage", 6], ["Summon Spirit Wolf", 6], ["Wearbear", 6], ["Molten Boulder", 6], ["Arctic Blast", 6],
    ["Cycle of Life", 12], ["Feral Rage", 12], ["Maul", 12], ["Eruption", 12], ["Cyclone Armor", 12],
    ["Heart of Wolverine", 18], ["Summon Fenris", 18], ["Rabies", 18], ["Fire Claws", 18], ["Twister", 18],
    ["Vines", 24], ["Hunger", 24], ["Shock Wave", 24], ["Volcano", 24], ["Tornado", 24],
    ["Spirit of Barbs", 30], ["Summon Grizzly", 30], ["Fury", 30], ["Armageddon", 30], ["Hurricane", 30],
  ],
  ass: [
    ["Fire Trauma", 1], ["Claw Mastery", 1, "h2h"], ["Psychic Hammer", 1], ["Tiger Strike", 1, "mele"], ["Dragon Talon", 1],
    ["Shock Field", 6], ["Blade Sentinel", 6], ["Quickness", 6], ["Fists of Fire", 6, "h2h"], ["Dragon Claw", 6, "h2h"],
    ["Charged Bolt Sentry", 12], ["Wake of Fire Sentry", 12], ["Weapon Block", 12, "h2h"], ["Cloak of Shadows", 12], ["Cobra Strike", 12, "mele"],
    ["Blade Fury", 18], ["Fade", 18], ["Shadow Warrior", 18], ["Claws of Thunder", 18, "h2h"], ["Dragon Tail", 18],
    ["Lightning Sentry", 24], ["Inferno Sentry", 24], ["Mind Blast", 24], ["Blades of Ice", 24, "h2h"], ["Dragon Flight", 24],
    ["Death Sentry", 30], ["Blade Shield", 30], ["Venom", 30], ["Shadow Master", 30], ["Royal Strike", 30, "mele"],
  ],
};

/** a class skill by its D2 name */
export const CLASS_SKILL_BY_NAME: Record<string, ClassSkill> = Object.fromEntries(
  Object.values(CLASS_SKILLS).flatMap((l) => l.map((s) => [s[0], s])),
);
