// The approved icon style, A "painterly realism" (the second sample round, 2026-10-27, chosen over
// "grim ink and oil" and "hand-painted stylized"): the words every picture's prompt is built from,
// the canvas per cell size, the seeds, and the settings the box scripts run with. The wording is the
// sample round's, word for word, so a picture painted now matches the ones approved then.

/** the generator, run on box only (tools/icons/box/gen.py) */
export const MODEL = { key: 'klein4b', repo: 'black-forest-labs/FLUX.2-klein-4B', license: 'Apache-2.0', steps: 4, guidance: 1.0 };
/** the matting model (tools/icons/box/cut.py) */
export const MATTE = { repo: 'ZhengPeng7/BiRefNet', license: 'MIT', res: 1024 };

export const STYLE = {
  id: 'A',
  name: 'painterly realism',
  zh: '写实油画',
  suffix:
    'Inventory icon for a dark fantasy role-playing game, painted in oil: dull matte surfaces with low ' +
    'specular, a heavily muted earthy palette of umber, iron grey, oxblood and tarnished brass, no pure ' +
    'white and no saturated colour, worn and weathered materials with scratches, soot and grime in the ' +
    'crevices, rough visible brushwork, a dim warm key light from the upper left, shadow side to the ' +
    'lower right, a thin bright rim of light along the outer edges of the silhouette. ',
};

/**
 * The backdrop: mid grey matted better than light grey (fewer highlights and studio reflections).
 * "Floating in empty space" only lessens the cast shadow klein paints; cut.py flags what is left.
 */
export const FRAME =
  'The object alone, centered, filling the frame with a small even margin, the whole object visible, ' +
  'floating in empty space in front of a plain flat mid-grey backdrop, nothing beneath it, no ground, ' +
  'no surface, no text, no border.';

/**
 * The material line by base tier. A picture is shared by a line's three tiers (pictures.mjs), so only
 * the normal tier's is used; the other two are kept for the record of what the samples tried.
 */
export const TIER = {
  0: 'Common make: plain grey iron, brown leather and wood, no gold.',
  1: 'Finer make: steel with bronze and brass fittings.',
  2: 'Finest make: blackened or blued steel with gold inlay.',
};
export const MATERIAL = TIER[0];
/**
 * Weapon and armour types that don't take the material line by default: staves, wands, scepters,
 * orbs, circlets, shrunken heads, pelts and the holy shields aren't iron, leather and wood (the
 * samples had it off for the staff, wand, scepter, orb, circlet and holy shield), nor are throwing
 * potions or quivers. A description sets material: true or false to say otherwise.
 */
export const NO_MATERIAL = new Set(['staf', 'wand', 'scep', 'orb', 'circ', 'head', 'pelt', 'ashd', 'tpot', 'bowq', 'xboq']);

/** klein takes no negative prompt: this is only recorded with each picture, for a model that would */
export const NEGATIVE =
  'photo, photorealistic, 3d render, plastic, glossy toy, cartoon, anime, chibi, text, letters, numbers, ' +
  'watermark, signature, logo, frame, border, multiple objects, hands, person, cropped, cut off, ' +
  'background scenery, floor, cast shadow';

/**
 * Before a description with a shape guide (tools/icons/box/guides.py: flat grey shapes we draw
 * ourselves) as klein's reference image: the samples' most effective change, 33 of 36 right where
 * the halberd, crossbow and hooked sword had come out wrong from any wording.
 */
export const GUIDE_PREFIX =
  'Use the reference image only as a shape guide: paint a brand-new object whose outline, proportions and ' +
  'orientation follow the flat grey shape in the reference exactly, but fully painted with real materials. ';

/**
 * Before a unique or set picture's description, its base's chosen picture being the reference: the
 * special version keeps what the item is and how it lies, and is painted anew. Not in the samples;
 * tried once with the pipeline (a set helm on the great helm, two seeds): one seed painted the new
 * version described, the other came back nearly the base itself, so such seeds are to be rejected
 * in review, and a special picture may want more than four. The special stage painted six each and
 * found the same: an added part (a tassel, a skull, an emblem) takes, a reshaped blade mostly doesn't
 * without a guide (tools/icons/box/README.md).
 */
export const BASE_PREFIX =
  'The reference image shows the plain version of this item: paint a new, rarer version of the same kind ' +
  'of object, keeping its type, orientation and rough proportions, with its own shape details, materials ' +
  'and ornament as described, not a copy of the reference. ';
/** both: the guide is the first reference image, the base picture the second */
export const GUIDE_AND_BASE_PREFIX =
  'Use the first reference image only as a shape guide for the outline, proportions and orientation; the ' +
  'second shows the plain version of this item: paint a new, rarer version of it, fully painted with real ' +
  'materials, with its own shape details and ornament as described, not a copy of either. ';

/** the generation canvas by cell size (w×h), each near a megapixel at the cells' aspect */
export const CANVAS = {
  '1x1': [768, 768],
  '2x2': [1024, 1024],
  '1x2': [704, 1408],
  '2x4': [704, 1408],
  '1x3': [512, 1536],
  '1x4': [448, 1792],
  '2x3': [832, 1248],
  '2x1': [1216, 608],
};
export function canvasFor(w, h) {
  const c = CANVAS[`${w}x${h}`];
  if (!c) throw new Error(`no canvas for ${w}x${h} cells`);
  return c;
}

/** the first four seeds of a picture; another round of a picture takes the next four (seedsFor(1)…) */
export const SEEDS = [101, 202, 303, 404];
export const seedsFor = (round) => SEEDS.map((s) => s + 404 * round);

/**
 * box-side settings: the fixed grade's chroma factor (A's), the export cells and WebP quality. The game
 * ships the 2x only, packed into atlases at the same quality (tools/ai-icons.mjs); the 1x is for the
 * review sheets, a 1x screen drawing the 2x down and sharpening it as grade.py does (src/ui/sharpen.ts)
 */
export const GRADE = { sat: 0.8 };
export const EXPORT = { cell: 34, scales: [2, 1], marginCss: 2, webpQuality: 92 };

/** does this picture's prompt take the normal-tier material line */
export function takesMaterial(picture, desc) {
  if (typeof desc.material === 'boolean') return desc.material;
  return picture.kind === 'base' && picture.group !== 'misc' && !NO_MATERIAL.has(picture.type);
}

/**
 * A picture's prompt: [guide / base prefix] + description [+ material line] + style suffix + frame,
 * as the samples built it (build_jobs.py prompt_for).
 */
export function promptFor(picture, desc, { guide = false, baseRef = false } = {}) {
  let text = desc.desc.trim();
  if (takesMaterial(picture, desc)) text += ' ' + MATERIAL;
  const pre = guide && baseRef ? GUIDE_AND_BASE_PREFIX : guide ? GUIDE_PREFIX : baseRef ? BASE_PREFIX : '';
  return pre + text + ' ' + STYLE.suffix + FRAME;
}
