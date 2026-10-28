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
| shape guides | `guides.py` | a job's `guide` → `guides/<name>_<W>x<H>.png` (its `ref[0]`) |
| painting | `gen.py` | `jobs.json` → `gen/<id>.png` + `.json` (prompt, seed, timing, VRAM) |
| matting | `cut.py` | `gen/` → `cut/<id>.png` (RGBA, trimmed) + `.json` (flags) |
| grade, export | `export.py` (with `grade.py`) | `cut/` → `cand/<id>.webp`, `<id>.1x.webp`, `<id>.json` |
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

### Painting (`gen.py`)

bf16, the whole pipeline on one card, 4 steps, guidance 1.0. klein has no negative prompt (the negative
words are only recorded). A job's `ref` are klein's reference images: a shape guide (a flat grey shape
we draw, `guides.py`), and for a unique or set picture the raw painting of its base's chosen picture.
The prompt is built in `tools/icons/style.mjs`. With a base picture as the reference, klein tends to
paint the base again (once in two seeds on the first trial): the review sheet shows the reference under
the picture's name, to compare.

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

### Review sheets (`review.py`)

A row per picture (its reference image under its name), a column per seed: the raw painting, the 2× and
1× files on the game's inventory grid (`src/style.css` `.grid`), the seed and the cut's flags (red: EDGE,
P<n> pieces, SH<share>). `ai-icons.mjs` brings them back into `icons-src/run-NN/sheets/`.

## By hand

```sh
# a guide, to look at
~/icons/env/.venv/bin/python -I ~/icons/full/bin/guides.py /tmp/halberd.png halberd 704 1408
# a run again, after a stop (ai-icons.mjs --gen --run NN does the same and follows it)
~/icons/env/.venv/bin/python -I ~/icons/full/bin/run.py ~/icons/full/run-NN
```
