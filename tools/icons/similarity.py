"""How close one of our pictures is to the original it was studied from (numpy + PIL, no model).

Every picture we paint is screened against the matching original inventory image before it is
picked, so none comes out a copy: originals are studied for what an object is, never given to a
model or traced. This gives the number; a reviewer's side-by-side look (--sheet) gives the rest.

  python3 tools/icons/similarity.py OURS ORIGINAL [--bg TEMPLATE.png] [--sheet OUT.png]
  python3 tools/icons/similarity.py --pairs PAIRS.json [--bg TEMPLATE.png ...] [--out SCORES.json]
  python3 tools/icons/similarity.py --template OUT.png ORIGINAL ...

OURS is an RGBA cut-out (a run's candidates). ORIGINAL is RGBA, or RGB on a dark
ground: the object is what differs from that ground, which is a flat colour (the border's median), a
smooth vignette (a normalised blur of the non-object pixels) or, with --bg, a template of a textured
ground many originals share (--template: the per-pixel mode over them). PAIRS is a JSON list of
{id, ours, orig}. The exit code is 2 when a single pair is too close. Study copies and sheets of them
stay outside the repo.

The score, 0-1: both objects are cropped to their bounding box and fitted, aspect kept, into one box
(the original's aspect, 128 px on the long side) on a neutral grey ground, then
  - ssim: SSIM of the grey images (Gaussian window, sigma 1.5) over the two objects' union: shared
    shading and placement of detail;
  - edge: F1 of the two Sobel edge maps (each object's strongest 20 %) within 1 px, outline included;
  - edge_in: the same F1 away from both outlines (2 px in): shared ornament lines and wear marks,
    not the silhouette, which our generic shape guides make similar anyway;
  - colour: Bhattacharyya coefficient of the objects' 6x6x6 RGB histograms: a shared colour scheme;
score = 0.5 ssim + 0.15 edge + 0.25 edge_in + 0.1 colour, at the best alignment of ours: mirrored or
not, turned -8..8 deg, scaled 0.9-1.1, shifted +-6 px (coarse on a cheap proxy, finer around the 3
best), so a flipped, turned or nudged copy can't hide. iou (the silhouettes' overlap) is reported,
not scored. At THRESHOLD or more a picture is too close: redesign it; at REVIEW or more the reviewer
looks at the side-by-side with extra care.

Calibration (2026-10-28; 556 pairs over the study copies of the originals, in scratch):
  - copies, should flag: 20 originals (base, unique, misc, variant; 1x1 to 2x4) cut out and lightly
    edited 11 ways (as is, mirrored, JPEG q40, hue +35 deg with saturation x0.7, hue 180 deg, blur
    1.2 px, half resolution, our grade(), median 5 + posterise, 4 deg turn + 0.92 scale + noise 8,
    hue + grade + blur + half resolution + 3 deg): min 0.547, median 0.89; all flag. Quarter
    resolution: min 0.470, all flag. A heavy edit (median 7, blur 2 px, hue 60 deg, 7 deg, x1.1):
    median 0.501, 70 % flag;
  - our paintings, should pass: the 46 round-2 style-A samples against every picture their base shows
    (70 pairs) and the 6 committed picks: max 0.430 (the short sword family: plain straight blades
    share most of their outline), median 0.27; none flag, 7 of 76 in the review band;
  - for reference, originals against other originals of their type (209 pairs): median 0.38, 14 %
    flag: they include the source's own near-copies (Town Portal and Identify scrolls, gas and oil
    potions, rune stones that differ only by glyph); a unique's original against its base's: 1 of 11
    flags (a recolour with small changes).
"""
import argparse, json, sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw

BOX = 128          # the long side of the shared box
GROUND = 128.0     # the neutral grey both objects are composited on
W_SSIM, W_EDGE, W_EDGE_IN, W_COLOUR = 0.5, 0.15, 0.25, 0.1
THRESHOLD = 0.45   # at or above: too close, redesign (from the calibration below)
REVIEW = 0.38      # at or above: the reviewer compares the pair side by side with extra care


# ---------- small numpy image ops (no scipy on the Mac) ----------

def blur(x, sigma=1.5):
    """Separable Gaussian, reflect padding."""
    r = int(3 * sigma + 0.5)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.pad(x, r, mode="reflect" if r < min(x.shape) else "edge")
    h = sum(k[i] * p[:, i:i + x.shape[1]] for i in range(2 * r + 1))
    return sum(k[i] * h[i:i + x.shape[0], :] for i in range(2 * r + 1))


def shift_max(m, r=1):
    """Dilation by a (2r+1)^2 square."""
    p = np.pad(m, r)
    out = np.zeros_like(m)
    for dy in range(2 * r + 1):
        for dx in range(2 * r + 1):
            out |= p[dy:dy + m.shape[0], dx:dx + m.shape[1]]
    return out


def erode(m, r=1):
    return ~shift_max(~m, r)


def components(m):
    """Labels of 8-connected components (0 = none) and their sizes."""
    lab = np.zeros(m.shape, np.int32)
    sizes = [0]
    H, W = m.shape
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]:
            continue
        n = len(sizes)
        lab[y0, x0] = n
        q, cnt = deque([(y0, x0)]), 0
        while q:
            y, x = q.popleft()
            cnt += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = n
                        q.append((yy, xx))
        sizes.append(cnt)
    return lab, np.array(sizes)


def fill_holes(m, frac=0.02):
    """Small ground regions that don't reach the border become object (JPEG pits); big ones stay
    ground: the space inside a bowstring or a ring."""
    lab, sizes = components(~m)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    small = [k for k in range(1, len(sizes)) if k not in edge and sizes[k] <= max(16, frac * m.sum())]
    return m | np.isin(lab, small)


# ---------- loading ----------

def load_template(path):
    """A shared ground: RGB, alpha 0 where too few originals showed the ground to know it."""
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    rgb, known = a[..., :3], a[..., 3] > 127
    if not known.all():
        # unknown pixels take the mean of the known ones nearby, widening until all are filled
        acc, w = rgb * known[..., None], known.astype(np.float32)
        for s in (2, 4, 8, 16, 32):
            bw = blur(w, s)
            fill = np.dstack([blur(acc[..., c], s) for c in range(3)]) / np.maximum(bw, 1e-6)[..., None]
            rgb = np.where((~known & (bw > 1e-3))[..., None], fill, rgb)
            known = known | (bw > 1e-3)
    return rgb


def load_object(path, templates=(), thresh=14.0):
    """(rgb float HxWx3, alpha float HxW) of the object in a cut-out or an original on its ground."""
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info:
        a = np.asarray(im.convert("RGBA")).astype(np.float32)
        if a[..., 3].min() < 250:
            return a[..., :3], a[..., 3] / 255.0
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    ring = np.zeros(rgb.shape[:2], bool)
    ring[:3], ring[-3:], ring[:, :3], ring[:, -3:] = True, True, True, True
    # a template fits only an original of its size whose border is that ground
    ground = next((t for t in templates if t.shape == rgb.shape and np.median(np.abs(rgb - t).max(-1)[ring]) < 6), None)
    if ground is None:
        # no template: a smooth ground (vignette, gradient) by normalised blur of what isn't object,
        # from the border's median, refined with a falling threshold so a lighter centre isn't object
        border = np.concatenate([rgb[:2].reshape(-1, 3), rgb[-2:].reshape(-1, 3), rgb[:, :2].reshape(-1, 3), rgb[:, -2:].reshape(-1, 3)])
        ground = np.broadcast_to(np.median(border, 0), rgb.shape)
        bl = border.mean(-1)
        if np.percentile(bl, 90) - np.percentile(bl, 10) <= 4:
            thresh = min(thresh, 9.0)  # a flat ground: JPEG grain is ~2, so dark iron and leather show
        else:  # a vignette or texture
            for t in (3 * thresh, 2 * thresh, thresh):
                keep = shift_max(np.abs(rgb - ground).max(-1) > t, 4)
                w = blur((~keep).astype(np.float32), 8)
                est = np.dstack([blur(rgb[..., c] * ~keep, 8) for c in range(3)]) / np.maximum(w, 1e-6)[..., None]
                ground = np.where((w > 0.05)[..., None], est, ground)
            # a textured ground: the threshold rises above its grain, measured on the border ring
            grain = np.median(np.abs(rgb - ground).max(-1)[ring])
            thresh = max(thresh, 3.5 * 1.4826 * grain)
    diff = np.abs(rgb - ground).max(-1)
    m = diff > thresh
    m = shift_max(erode(m, 1), 1)  # drop JPEG speckle
    lab, sizes = components(m)
    if len(sizes) > 1:
        big = sizes[1:].max()
        m = np.isin(lab, np.nonzero(sizes >= max(12, 0.02 * big))[0]) & (lab > 0)
    m = fill_holes(m)
    # a soft rim: edge pixels part-way to the ground keep a partial alpha
    soft = np.clip((diff - thresh * 0.5) / thresh, 0, 1)
    alpha = np.where(m, 1.0, np.where(shift_max(m, 1), soft, 0.0))
    return rgb, alpha


# ---------- alignment ----------

def bbox(alpha):
    ys, xs = np.nonzero(alpha > 0.5)
    if not len(ys):
        raise ValueError("no object found")
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(rgb, alpha, size, scale=1.0, dx=0, dy=0, flip=False, rot=0.0):
    """The object cropped to its box and fitted (aspect kept, times scale) into size, turned rot
    degrees, centred plus (dx, dy), on the neutral ground: (grey, rgb, mask)."""
    x0, y0, x1, y1 = bbox(alpha)
    pm = np.dstack([rgb[y0:y1, x0:x1] * alpha[y0:y1, x0:x1, None], alpha[y0:y1, x0:x1] * 255])
    im = Image.fromarray(pm.clip(0, 255).round().astype(np.uint8))
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    W, H = size
    s = min(W / im.width, H / im.height) * scale
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)  # premultiplied: no dark fringe
    if rot:
        im = im.rotate(rot, Image.BICUBIC, expand=True)
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(im, ((W - im.width) // 2 + dx, (H - im.height) // 2 + dy))
    a = np.asarray(canvas).astype(np.float32)
    al = a[..., 3:4] / 255.0
    comp = a[..., :3] + GROUND * (1 - al)
    grey = comp @ np.array([0.299, 0.587, 0.114], np.float32)
    return grey, comp, al[..., 0] > 0.5


def shifted(x, dx, dy, fill):
    """x moved by (dx, dy), the uncovered edge filled."""
    out = np.full_like(x, fill)
    H, W = x.shape[:2]
    out[max(0, dy):H + min(0, dy), max(0, dx):W + min(0, dx)] = x[max(0, -dy):H - max(0, dy), max(0, -dx):W - max(0, dx)]
    return out


# ---------- measures ----------

def ssim(g1, g2, region):
    C1, C2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    m1, m2 = blur(g1), blur(g2)
    s11, s22, s12 = blur(g1 * g1) - m1 * m1, blur(g2 * g2) - m2 * m2, blur(g1 * g2) - m1 * m2
    smap = ((2 * m1 * m2 + C1) * (2 * s12 + C2)) / ((m1 * m1 + m2 * m2 + C1) * (s11 + s22 + C2))
    return float(np.clip(smap[region].mean(), 0, 1))


def edges(g, mask, top=0.2):
    p = np.pad(g, 1, mode="edge")
    gx = (p[:-2, 2:] + 2 * p[1:-1, 2:] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[1:-1, :-2] + p[2:, :-2])
    gy = (p[2:, :-2] + 2 * p[2:, 1:-1] + p[2:, 2:]) - (p[:-2, :-2] + 2 * p[:-2, 1:-1] + p[:-2, 2:])
    mag = np.hypot(gx, gy)
    region = shift_max(mask, 1)  # the outline itself is an edge
    if not region.any():
        return region
    t = np.quantile(mag[region], 1 - top)
    return region & (mag >= max(t, 8.0))


def edge_f1(e1, e2):
    if not e1.any() or not e2.any():
        return 0.0
    p = (e1 & shift_max(e2, 1)).sum() / e1.sum()
    r = (e2 & shift_max(e1, 1)).sum() / e2.sum()
    return float(0 if p + r == 0 else 2 * p * r / (p + r))


def colour_bc(c1, m1, c2, m2, bins=6):
    def hist(c, m):
        q = np.clip((c[m] / 256 * bins).astype(int), 0, bins - 1)
        h = np.bincount(q[:, 0] * bins * bins + q[:, 1] * bins + q[:, 2], minlength=bins ** 3).astype(float)
        return h / max(h.sum(), 1)
    return float(np.sqrt(hist(c1, m1) * hist(c2, m2)).sum())


def measure(ours, orig):
    """ours, orig: placed (grey, rgb, mask) in one box."""
    (g1, c1, m1), (g2, c2, m2) = ours, orig
    union = shift_max(m1 | m2, 2)
    s = ssim(g1, g2, union)
    e1, e2 = edges(g1, m1), edges(g2, m2)
    e = edge_f1(e1, e2)
    inner = erode(m1, 2) & erode(m2, 2)  # away from both outlines: detail, not silhouette
    ei = edge_f1(e1 & inner, e2 & inner) if inner.sum() > 40 else e
    c = colour_bc(c1, m1, c2, m2)
    iou = float((m1 & m2).sum() / max((m1 | m2).sum(), 1))
    return {"score": W_SSIM * s + W_EDGE * e + W_EDGE_IN * ei + W_COLOUR * c, "ssim": s, "edge": e, "edge_in": ei, "colour": c, "iou": iou}


FLIPS, ROTS, SCALES, SHIFTS = (False, True), (-8, -4, 0, 4, 8), (0.9, 1.0, 1.1), range(-6, 7, 2)


def compare(ours_path, orig_path, templates=(), search=True):
    """The best match of ours to the original: a coarse search of flip x turn x scale x shift on a
    cheap proxy (silhouette IoU and grey correlation), a finer one around the 3 best, then the full
    score at the 8 best."""
    r1, a1 = load_object(ours_path, templates)
    r2, a2 = load_object(orig_path, templates)
    x0, y0, x1, y1 = bbox(a2)
    w, h = x1 - x0, y1 - y0
    size = (max(8, round(BOX * w / max(w, h))), max(8, round(BOX * h / max(w, h))))
    ref = place(r2, a2, size)
    g2, m2 = ref[0], ref[2]

    def proxy(flip, rot, sc, shifts):
        g1, _, m1 = place(r1, a1, size, sc, 0, 0, flip, rot)
        out = []
        for dx, dy in shifts:
            gs, ms = shifted(g1, dx, dy, GROUND), shifted(m1, dx, dy, False)
            u = ms | m2
            iou = (ms & m2).sum() / max(u.sum(), 1)
            a, b = gs[u] - gs[u].mean(), g2[u] - g2[u].mean()
            ncc = (a * b).sum() / max(np.sqrt((a * a).sum() * (b * b).sum()), 1e-6)
            out.append((0.5 * iou + 0.5 * ncc, flip, rot, sc, dx, dy))
        return out

    if not search:
        cands = proxy(False, 0, 1.0, [(0, 0)])
    else:
        grid = [(dx, dy) for dx in SHIFTS for dy in SHIFTS]
        cands = [c for f in FLIPS for r in ROTS for sc in SCALES for c in proxy(f, r, sc, grid)]
        cands.sort(key=lambda c: -c[0])
        fine = []
        for _, f, r, sc, dx, dy in cands[:3]:
            near = [(dx + i, dy + j) for i in (-1, 0, 1) for j in (-1, 0, 1)]
            fine += [c for dr in (-2, -1, 0, 1, 2) for k in (0.96, 0.98, 1.0, 1.02, 1.04) for c in proxy(f, r + dr, sc * k, near)]
        cands += fine
    cands.sort(key=lambda c: -c[0])
    best = None
    for _, flip, rot, sc, dx, dy in cands[:8]:
        m = measure(place(r1, a1, size, sc, dx, dy, flip, rot), ref)
        if best is None or m["score"] > best["score"]:
            best = dict(m, flip=flip, rot=rot, scale=round(sc, 4), dx=dx, dy=dy)
    best = {k: round(v, 4) if isinstance(v, float) else v for k, v in best.items()}
    best["too_close"] = best["score"] >= THRESHOLD
    best["review"] = best["score"] >= REVIEW
    return best, size


def sheet(ours_path, orig_path, out, templates=(), res=None):
    """ours | original | edges (ours red, the original's green, shared yellow), 2x, for the review."""
    res = res or compare(ours_path, orig_path, templates)[0]
    r1, a1 = load_object(ours_path, templates)
    r2, a2 = load_object(orig_path, templates)
    x0, y0, x1, y1 = bbox(a2)
    w, h = x1 - x0, y1 - y0
    size = (max(8, round(BOX * w / max(w, h))), max(8, round(BOX * h / max(w, h))))
    o = place(r1, a1, size, res["scale"], res["dx"], res["dy"], res["flip"], res.get("rot", 0))
    g = place(r2, a2, size)
    e1, e2 = edges(o[0], o[2]), edges(g[0], g[2])
    ov = np.full(o[1].shape, 40.0)
    ov[e1] = (220, 60, 60)
    ov[e2] = (60, 200, 60)
    ov[e1 & e2] = (230, 220, 60)
    W, H = size
    canvas = Image.new("RGB", (W * 3 + 8, H + 18), (24, 24, 24))
    for i, arr in enumerate((o[1], g[1], ov)):
        canvas.paste(Image.fromarray(arr.clip(0, 255).astype(np.uint8)), (i * (W + 4), 18))
    label = f"{res['score']:.3f} s{res['ssim']:.2f} e{res['edge']:.2f} i{res['edge_in']:.2f} c{res['colour']:.2f}"
    ImageDraw.Draw(canvas).text((2, 3), label, fill=(230, 230, 230))
    canvas.resize((canvas.width * 2, canvas.height * 2), Image.NEAREST).save(out)


def build_template(out, paths, min_count=3):
    """The per-pixel mode over originals sharing one frame: their common ground (alpha 0 where the
    mode is seen fewer than min_count times, i.e. objects cover it in nearly every original)."""
    stack = np.stack([np.asarray(Image.open(p).convert("RGB")).astype(np.uint32) for p in paths])
    packed = np.sort((stack[..., 0] << 16) | (stack[..., 1] << 8) | stack[..., 2], axis=0)
    run = np.ones(packed.shape, np.int32)
    for k in range(1, len(packed)):
        run[k] = np.where(packed[k] == packed[k - 1], run[k - 1] + 1, 1)
    k = run.argmax(0)
    mode = np.take_along_axis(packed, k[None], 0)[0]
    count = run.max(0)
    rgba = np.dstack([(mode >> 16) & 255, (mode >> 8) & 255, mode & 255, np.where(count >= min_count, 255, 0)]).astype(np.uint8)
    Image.fromarray(rgba).save(out)
    return float((count >= min_count).mean())


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--bg", action="append", default=[], help="a ground template (used for originals of its size whose border matches it)")
    ap.add_argument("--pairs")
    ap.add_argument("--out")
    ap.add_argument("--sheet")
    ap.add_argument("--template")
    ap.add_argument("--no-search", action="store_true")
    a = ap.parse_args()
    if a.template:
        print(f"{a.template}: ground known at {build_template(a.template, a.paths):.1%} of pixels")
        return
    templates = [load_template(p) for p in a.bg]
    if a.pairs:
        rows = []
        for p in json.load(open(a.pairs)):
            try:
                r, _ = compare(p["ours"], p["orig"], templates, not a.no_search)
            except Exception as ex:  # a broken pair shouldn't stop the batch
                r = {"error": str(ex)}
            rows.append({**p, **r})
            print(f"{p.get('id', p['ours'])}\t" + ("\t".join(f"{k} {r[k]}" for k in ("score", "ssim", "edge", "edge_in", "colour", "iou", "too_close")) if "score" in r else r["error"]), flush=True)
        if a.out:
            json.dump(rows, open(a.out, "w"), indent=1)
        return
    if len(a.paths) != 2:
        ap.error("give OURS ORIGINAL, or --pairs, or --template")
    r, _ = compare(a.paths[0], a.paths[1], templates, not a.no_search)
    print(json.dumps(r))
    if a.sheet:
        sheet(a.paths[0], a.paths[1], a.sheet, templates, r)
    sys.exit(2 if r.get("too_close") else 0)


if __name__ == "__main__":
    main()
