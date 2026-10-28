# Item pictures: the box side

The scripts `box` (the GPU machine, 3× RTX 3090) runs for `tools/ai-icons.mjs`. Every model runs there and
nowhere else; the Mac only builds the job lists, copies files and applies the picks. `ai-icons.mjs` copies
this folder to `box:~/icons/full/bin/` before each run, so these files are the only copy that counts.

## Environment

`~/icons/env` on box: a uv project (Python 3.12, torch 2.14.1+cu130, diffusers 0.42.1, transformers 5.21.0,
Pillow with WebP, scipy), run as `~/icons/env/.venv/bin/python -I`. The models are in box's Hugging Face cache;
box can't reach the Hub, so every script sets `HF_HUB_OFFLINE=1` (without it the first load stalled ~9 min).

| Step | Model | Licence |
|---|---|---|
| painting | `black-forest-labs/FLUX.2-klein-4B` (`Flux2KleinPipeline`, text encoder Qwen3-4B inside) | Apache-2.0 |
| matting | `ZhengPeng7/BiRefNet` | MIT |

## A run

`~/icons/full/run-NN/` is one run, claimed by `ai-icons.mjs` with `mkdir` (so two sessions never share a
number). It writes `jobs.json` there and starts `run.py` detached; `run.py` does each step below for the
jobs that don't have its output yet, so it is started again the same way after a stop, or after
`ai-icons.mjs` adds jobs.

| Step | Script | In → out |
|---|---|---|
| shape guides | `guides.py` | a job's `guide` → `guides/<name>_<W>x<H>.png` (its `ref[0]`): drawn, no model |
| painting | `gen.py` | `jobs.json` → `gen/<id>.png` + `.json` (prompt, seed, timing, VRAM) |
| matting | `cut.py` | `gen/` → `cut/<id>.png` (RGBA, trimmed) + `.json` (flags) |
| grade, export | `export.py` (with `grade.py`) | `cut/` → `cand/<id>.webp`, `<id>.1x.webp`, `<id>.4x.webp` (review only), `<id>.json` |
| review sheets | `review.py` | `cand/` → `sheets/<group>_NN.png` |

`run.py` writes `status.json` (`running`, `done` or `failed`, the step, the counts) and logs to
`logs/run.log`, each GPU's process to `logs/gen-gpu<i>.log` and `logs/cut-gpu<i>.log`.

A job id is `<picture>_s<seed>`: one picture (a D2 picture file, `tools/icons/pictures.mjs`) at one seed.

### GPUs

`run.py` uses every GPU with no compute process on it and under 1 GB in use, and takes a lock on each
(`~/icons/full/locks/gpu<i>.lock`, `flock`) for its painting and matting, so a second run waits instead of
loading a second 18.6 GB pipeline onto a card. The user's wordbook Ollama services are nominally on GPUs 0–2
(they crash-loop and hold nothing); one that holds memory makes its card unusable here, and it is left alone.
The painting jobs are split over the cards by expected time (a job with a reference image takes ~2.2× as long).

### Shape guides (`guides.py`)

Flat grey shapes we draw with PIL polygons, for the pictures whose shape words alone get wrong: a light
grey ground, the object a flat dark grey shape, its key inner lines (a slit, a string, a ridge) lighter or
darker. One function per shape family (`wavy_blade`, `great_sword`, `curved_sword`, `fist`, `pole` with its
heads, `bundle`, `flail`, `bow`, `recurve_bow`, `plated_bow`, `crossbow`, `plate_suit`, `boots`, `crown_shield`,
…), and in its `GUIDES` table one entry per guide: its family, the canvas it is
designed on (its picture's, `style.mjs` `CANVAS`) and its parameters. A description's `guide` names an
entry; its `shape` (or note) holds the words the guide was drawn from. They are generic shapes of a kind
of object, never traced or measured from a picture. The sample round's eight (halberd, crossbow, falcata,
gladius, great-helm, spear, short-bow, soft-boots) come out pixel for pixel as approved, and so does every
picked picture's guide: review round 1 (`tools/icons/rejects/history/review-1.json`) added 24 guides, corrected
claws, heavy-boots and the flail, and dropped the four bow guides nothing uses any more; review round 2
(`review-2.json`) widened two-handed-sword's blade. The unique and set pictures' review added six, each a new
shape for a special version where the base reference alone kept the base's (`special-review-*.json`):
moon-axe, forked-sword, barbed-great-sword, fan-katar, hooked-falchion, lance-shield; every earlier guide still
draws pixel for pixel as before. On another canvas a guide is scaled to fit and centred.

### Painting (`gen.py`)

bf16, the whole pipeline on one card, 4 steps, guidance 1.0. klein has no negative prompt (the negative
words are only recorded). A job's `ref` are klein's reference images: a shape guide (a flat grey shape
we draw, `guides.py`), and for a unique or set picture the raw painting of its base's chosen picture.
The prompt is built in `tools/icons/style.mjs`. With a base picture as the reference, klein tends to
paint the base again (once in two seeds on the first trial): the review sheet shows the reference under
the picture's name, to compare. Over the 78 special pictures (runs 07-10, six seeds each) it kept the
base's outline in most seeds and painted what the words add onto it (a tassel, a net, a plume, a skull,
an emblem, a glow) far more reliably than a reshaped blade or head; so a special picture's words say its
added part first, and a new shape gets a guide as the first reference (style.mjs GUIDE_AND_BASE_PREFIX).

On one 3090 with the model loaded: 1.7 s (768², 1×1 cells) to 2.8 s (1024², 2×2) a picture, ~5.1 s with a
reference image; a model load ~6 s.

### Matting (`cut.py`)

BiRefNet at 1024 px, fp16; the soft mask tightened with a smoothstep 0.12–0.80 and the edge colour
decontaminated against the measured backdrop. Thin parts (a bowstring, a chain) are kept when they touch
the object. Flags for the review: `touches_edge` (a cropped tip is likely), `parts` (an extra object?),
`shadow` (a cast shadow's share of the object over 1.5 %; grey steel gives false alarms, so it only steers
the pick; `--unshadow` would clear it). ~0.35 s a picture.

### Grade and export (`grade.py`, `export.py`)

One fixed grade for every picture, no model: a tone curve through the picture's own luminance percentiles
(5th ≥ 28, median pulled 60 % into 45–75, 98th ≤ 200, a soft shoulder above 180), chroma × 0.8, slightly warm
shadows. Then premultiplied Lanczos into the item's cells less a 2 CSS px margin (times the description's
`fill`): `<id>.webp` exactly w×68 by h×68 px (2×, high-density screens) and `<id>.1x.webp` w×34 by h×34 px
with an unsharp mask (0.6 px, 50 %) on premultiplied colour. WebP, colour at quality 92, alpha lossless.
`<id>.4x.webp` (136 px a cell, unsharpened, from the same graded cut-out) is only the review sheets' large
view: `apply` never copies it into the game.

### Review sheets (`review.py`)

A group's pictures in the list's order (a family stays together), split evenly into sheets of at most
20 (12–20 for every group of 12 or more but 21–23). A row per picture: its id, every base it serves
(normal tier first; a job's `serves`), its cells and kind, its shape guide or base picture under them;
then a column per seed: the seed and the cut's flags (red: EDGE, P<n> pieces, SH<share>) over the
candidate at 4× (the preview), 2× and 1× (the game's files), each on the game's inventory grid
(`src/style.css` `.grid`). A run painted for a review round (`ai-icons.mjs --review n`, `review` in its
`jobs.json`) heads each sheet with the round and names it `<group>_r<n>_NN.png`. `ai-icons.mjs` brings them
back into `icons-src/run-NN/sheets/`, with the run's
`guides/`. `build()` takes two hooks (a column beside the label, a line under each seed), so a sheet
can be made elsewhere from the pulled files.

## By hand

```sh
# a guide, to look at; every guide on its own canvas; a contact sheet of them (any Python with Pillow)
~/icons/env/.venv/bin/python -I ~/icons/full/bin/guides.py /tmp/halberd.png halberd 704 1408
python3 tools/icons/box/guides.py --all /tmp/guides
python3 tools/icons/box/guides.py --sheet /tmp/guides.png [name ...]
# a run again, after a stop (ai-icons.mjs --gen --run NN does the same and follows it)
~/icons/env/.venv/bin/python -I ~/icons/full/bin/run.py ~/icons/full/run-NN
```
