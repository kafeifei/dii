import { sharedKey } from './save';

/**
 * The rift tiers cleared (docs/RIFT.md): the player's, every hero's, as the shared stash pages are,
 * in a record of its own beside them. It only grows: a tier is in it once its guardian has died, and
 * a write puts what this tab cleared together with what the record holds then, so two tabs clearing
 * tiers at once both keep theirs, and one never takes back another's. Keys this build doesn't know
 * (a newer one's tiers) are kept as they are. A record from a newer version is read, never written.
 */

/** the record's version */
const RIFT_V = 1;

interface RiftRecord {
  v: number;
  /** the cleared tiers' keys (src/world/rift.ts RiftTier.key) */
  cleared: string[];
  time: number;
}

/** the key the record is kept under: beside the shared pages', ?dev runs' their own as theirs are */
function riftKey(): string {
  return sharedKey().replace('dii-shared', 'dii-rift');
}

/** what the record holds, for this build; null when it can't be read (or there is no storage) */
function readRecord(): { cleared: string[]; newer: boolean } | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(riftKey());
  } catch {
    return null;
  }
  if (raw === null) return { cleared: [], newer: false };
  try {
    const o = JSON.parse(raw) as Partial<RiftRecord>;
    const cleared = Array.isArray(o?.cleared) ? o.cleared.filter((k): k is string => typeof k === 'string') : [];
    return { cleared, newer: typeof o?.v === 'number' && o.v > RIFT_V };
  } catch {
    return null;
  }
}

/** the tiers cleared as far as this tab knows: the record's and its own not yet written */
export class RiftProgress {
  private readonly mine = new Set<string>();
  /** cleared here and not yet in the record */
  private readonly pending = new Set<string>();
  /** the record came from a newer version: it is read and never written */
  newer = false;

  /** the record and this tab's together, read again from storage */
  cleared(): Set<string> {
    const r = readRecord();
    if (r) {
      this.newer = r.newer;
      for (const k of r.cleared) this.mine.add(k);
    }
    return new Set(this.mine);
  }

  /** a tier cleared here: kept at once, written by the next flush */
  clear(key: string) {
    if (this.mine.has(key) && !this.pending.has(key)) return;
    this.mine.add(key);
    this.pending.add(key);
  }

  /**
   * What this tab cleared into the record, merged with what it holds now. True when nothing is left
   * to write; false when storage refused it, or the record is a newer version's (what was cleared
   * here stays in this tab, and the player must be told it isn't kept)
   */
  flush(): boolean {
    if (!this.pending.size) return true;
    const r = readRecord();
    if (!r) {
      // unreadable as it is: kept aside, and written over by what is known here
      try {
        const raw = localStorage.getItem(riftKey());
        if (raw !== null) localStorage.setItem(`${riftKey()}-unreadable-${Date.now()}`, raw);
      } catch {
        return false;
      }
    }
    if (r?.newer) {
      this.newer = true;
      return false;
    }
    const all = new Set([...(r?.cleared ?? []), ...this.mine]);
    const rec: RiftRecord = { v: RIFT_V, cleared: [...all], time: Date.now() };
    try {
      localStorage.setItem(riftKey(), JSON.stringify(rec));
    } catch {
      return false;
    }
    for (const k of all) this.mine.add(k);
    this.pending.clear();
    return true;
  }
}
