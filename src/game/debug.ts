/**
 * Cheats for trying the game out by hand: the debug panel (src/ui/debug.ts) sets these and the game
 * reads them. They act on the real character (unlike ?dev, which plays a throwaway one), and are
 * kept per browser, apart from the saves.
 *
 * The panel is there on the dev server; on the built game, open it once with ?debug to turn it on
 * for that browser (?debug=0 turns it off again).
 */
const KEY = 'dii-debug';
const ENABLE_KEY = 'dii-debug-on';

export interface DebugOpts {
  /** experience from kills is multiplied by this */
  xp: number;
  /** monsters and chests roll their loot this many times */
  loot: number;
  /** the player can't die */
  god: boolean;
  /** the item level the panel's loot buttons roll at; 0 goes by the hero and the area */
  ilvl: number;
}

export const debugOpts: DebugOpts = { xp: 1, loot: 1, god: false, ilvl: 0 };
try {
  Object.assign(debugOpts, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
} catch {
  /* storage unavailable or garbled: defaults */
}

export function saveDebugOpts() {
  try {
    localStorage.setItem(KEY, JSON.stringify(debugOpts));
  } catch {
    /* ignore */
  }
}

export const debugEnabled = (() => {
  const q = new URLSearchParams(location.search).get('debug');
  try {
    if (q === '0') localStorage.removeItem(ENABLE_KEY);
    else if (q !== null) localStorage.setItem(ENABLE_KEY, '1');
    return import.meta.env.DEV || localStorage.getItem(ENABLE_KEY) === '1';
  } catch {
    return import.meta.env.DEV || (q !== null && q !== '0');
  }
})();

// cheats only apply where the panel to turn them off again is reachable
if (!debugEnabled) Object.assign(debugOpts, { xp: 1, loot: 1, god: false });
