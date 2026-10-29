/**
 * Cheats for trying the game out by hand: the debug panel (src/ui/debug.ts) sets these and the game
 * reads them. They act on the real character (unlike ?dev, which plays a throwaway one), and are
 * kept per browser, apart from the saves.
 *
 * The panel is there on the dev server; on the built game, open it once with ?debug to turn it on
 * for that browser (?debug=0 turns it off again).
 */
import type { LootKind, LootQuality } from '../items/debugloot';

const KEY = 'dii-debug';
const ENABLE_KEY = 'dii-debug-on';

/** what the panel's loot button drops (src/items/debugloot.ts LootSpec), and how many */
export interface DropOpts {
  lo: number;
  hi: number;
  kinds: LootKind[];
  qualities: LootQuality[];
  ethereal: boolean;
  sockets: number;
  identified: boolean;
  count: number;
}

export interface DebugOpts {
  /** experience from kills is multiplied by this */
  xp: number;
  /** monsters and chests roll their loot this many times */
  loot: number;
  /** the player can't die */
  god: boolean;
  /** the panel open on the left of the screen, not folded to its tab */
  shown: boolean;
  /** the panel's groups folded shut, by title */
  folded: string[];
  drop: DropOpts;
}

const DROP: DropOpts = {
  lo: 1,
  hi: 99,
  kinds: ['weapon', 'helm', 'body', 'shield', 'gloves', 'boots', 'belt', 'ring', 'amulet'],
  qualities: [],
  ethereal: false,
  sockets: 0,
  identified: true,
  count: 5,
};

/**
 * Open from the start, but folded under ?dev, whose scenarios click and take pictures where it would
 * be, and on a touch screen, where the stick starts on the left (src/ui/touch.ts STICK_ZONE)
 */
const SHOWN = !location.search.includes('dev') && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
export const debugOpts: DebugOpts = { xp: 1, loot: 1, god: false, shown: SHOWN, folded: [], drop: { ...DROP } };
try {
  // ilvl: the one item level the loot buttons had before the range
  const { ilvl: _ilvl, drop, ...rest } = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  Object.assign(debugOpts, rest);
  debugOpts.drop = { ...DROP, ...drop };
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
