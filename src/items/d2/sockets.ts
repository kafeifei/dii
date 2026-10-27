// When a gem, rune or jewel may go into an item's sockets, Diablo II's way: what the server checks
// before it places a socket filler (D2GAME_ITEMSOCKET_PlaceItem, D2Game ItemMode.cpp:4587-4708). The
// item's quality doesn't matter (a magic, rare or unique item with sockets takes them too; only a
// low, normal or superior one becomes a runeword: d2/legendary.ts findRuneword). Nothing ever comes
// back out: D2 has no way to empty a socket. D2MOO references are to
// github.com/ThePhrozenKeep/D2MOO at commit d9d394f.
import type { Item } from '../item';
import { D2_BASES, isType } from './bases';

/** why a filler can't go in */
export type SocketBlock = 'unidentified' | 'notFiller' | 'fillerUnidentified' | 'noSockets' | 'full';

/** a socket filler: a gem, rune or jewel (ITEMTYPE_SOCKET_FILLER, Items.cpp:3244-3248) */
export function isSocketFiller(item: Pick<Item, 'baseId'>): boolean {
  const b = D2_BASES[item.baseId];
  return !!b && isType(b, 'sock');
}

/**
 * What stops `filler` going into `target`, or null when it can (ItemMode.cpp:4638-4672): the target
 * identified, the filler a socket filler and identified, the target with sockets (IFLAG_SOCKETED,
 * on a base that takes them: ITEMS_CheckIfSocketable) and one of them free
 */
export function socketBlock(target: Pick<Item, 'baseId' | 'identified' | 'sockets' | 'socketed'>, filler: Pick<Item, 'baseId' | 'identified'>): SocketBlock | null {
  if (target.identified === false) return 'unidentified';
  if (!isSocketFiller(filler)) return 'notFiller';
  if (filler.identified === false) return 'fillerUnidentified';
  const b = D2_BASES[target.baseId];
  if (!target.sockets || !b?.sockets) return 'noSockets';
  if (target.socketed.length >= target.sockets) return 'full';
  return null;
}
