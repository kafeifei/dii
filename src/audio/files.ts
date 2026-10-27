import type { FileId } from './sounds';

/**
 * The recorded sounds under public/audio/, by sound id: written by the audio pipeline
 * (tools/ai-audio.mjs), not by hand. An id that isn't here is synthesized (src/audio/sfx.ts), as is
 * one whose files fail to load.
 */
export interface SoundFiles {
  /** its variants, relative to public/audio/: each time it plays, one of them at random */
  files: string[];
  /**
   * Where a loop starts and ends, in seconds: past the silence an AAC encoder puts at the start,
   * and before the padding at the end. Without it the whole file loops, padding and all. How much
   * of each a browser leaves is its own: of ffmpeg's AAC, Chrome, Firefox and WebKit on a Mac all
   * drop the priming as the MP4's edit list says (a 3 s file's first sound at its 3rd frame), but
   * WebKit keeps the padding (820 frames more), and iOS is unmeasured; one that kept the priming
   * would put everything some 23 ms later. So the pipeline renders the loop with its own content
   * running on past both points (its end before the start, its start after the end): an offset
   * then moves the seam along the same waveform, and it stays seamless.
   */
  loop?: { start: number; end: number };
  /** times the id's own level (default 1): evens the takes out against the synthesized sounds */
  gain?: number;
}

export const FILES: Partial<Record<FileId, SoundFiles>> = {};
