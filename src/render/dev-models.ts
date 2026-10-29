/**
 * Models only `npm run dev` has, each by the switch that loads it: the earlier AI hero (?aihero),
 * and the KayKit knight with the skeleton carrying its shared clip library (?knight). The production
 * build leaves their files out of dist (vite.config.ts), and the shipped game ignores the switches.
 */
export const DEV_MODELS: Readonly<Record<string, string>> = { ai_hero: 'aihero', knight: 'knight', skeleton_minion: 'knight' };
