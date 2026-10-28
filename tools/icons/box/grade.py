"""The fixed grade and the in-game downscale (numpy + PIL, no model). export.py and review.py share it.

grade(), on the full-resolution cut-out, with the same numbers for every picture:
  - a tone curve through the picture's own luminance percentiles (opaque pixels only): the 5th
    percentile lifted to at least 28, the median pulled 60 % of the way into 45-75, the 98th capped at
    200, a soft shoulder above 180 so highlights don't go white; colour scales with luminance, so hue
    is kept. On the samples this took style A's near-black share from 23.1 % to 6.9 %;
  - chroma times sat (0.8 for style A);
  - shadows below ~80 warmed slightly (+5 red, -5 blue at black, fading out).
fit(): premultiplied Lanczos into the item's w x h cell box; sharpen(): the light unsharp mask, 1x only.
"""
import numpy as np
from PIL import Image, ImageFilter

CSS_CELL = 34  # src/ui/icons.ts CELL: an inventory cell in CSS px


def luma(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def pchip(xs, ys, x):
    """Monotone cubic interpolation (Fritsch-Carlson): the tone curve never folds back."""
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    h = np.diff(xs)
    d = np.diff(ys) / h
    m = np.zeros_like(ys)
    m[0], m[-1] = d[0], d[-1]
    for k in range(1, len(xs) - 1):
        if d[k - 1] * d[k] <= 0:
            m[k] = 0
        else:
            w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
            m[k] = (w1 + w2) / (w1 / d[k - 1] + w2 / d[k])
    x = np.clip(x, xs[0], xs[-1])
    k = np.clip(np.searchsorted(xs, x) - 1, 0, len(h) - 1)
    t = (x - xs[k]) / h[k]
    h00, h10, h01, h11 = 2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2
    return h00 * ys[k] + h10 * h[k] * m[k] + h01 * ys[k + 1] + h11 * h[k] * m[k + 1]


def grade(rgba, sat=0.8, stats=None):
    a = np.asarray(rgba).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    L = luma(rgb)
    m = al > 150
    p5, p50, p98 = np.percentile(L[m], [5, 50, 98])
    t50 = p50 + 0.6 * (np.clip(p50, 45, 75) - p50)
    t98 = min(p98, 200.0)
    t5 = min(max(p5, 28.0), t50 - 10)
    t50 = min(max(t50, t5 + 10), t98 - 10)
    xs = [0.0, max(p5, 1.0), max(p50, p5 + 2), max(p98, p50 + 4), 255.0]
    xs[3] = min(xs[3], 253.0)
    # the black floor: 55 % of t5 where the picture has real shadow detail below p5; where p5 itself is
    # ~0 (pure black ink), t5, so the 5th percentile really ends at 28 or more
    floor = t5 * min(1.0, 0.55 + 0.45 * max(0.0, 8.0 - p5) / 8.0)
    ys = [floor, t5, t50, t98, max(t98 + 12, min(225.0, t98 + (255 - p98) * 0.6))]
    Ln = pchip(xs, ys, L)
    Ln = np.where(Ln > 180, 180 + 40 * (1 - np.exp(-(Ln - 180) / 40)), Ln)
    ratio = Ln / np.maximum(L, 0.5)
    out = np.where((L < 0.5)[..., None], Ln[..., None], rgb * ratio[..., None])
    out = Ln[..., None] + (out - Ln[..., None]) * sat
    w = np.clip(1 - Ln / 80, 0, 1) * 5
    out[..., 0] += w
    out[..., 2] -= w
    out = np.clip(out, 0, 255)
    if stats is not None:
        L2 = luma(out)
        q = np.percentile(L2[m], [5, 50, 98])
        c = (out.max(-1) - out.min(-1))[m]
        c0 = (rgb.max(-1) - rgb.min(-1))[m]
        stats.update(lum_p5_p50_p98_before=[round(float(v), 1) for v in (p5, p50, p98)],
                     lum_p5_p50_p98_after=[round(float(v), 1) for v in q],
                     near_black_before=round(float((L[m] < 30).mean()), 3),
                     near_black_after=round(float((L2[m] < 30).mean()), 3),
                     chroma_before=round(float(c0.mean()), 1), chroma_after=round(float(c.mean()), 1))
    return Image.fromarray(np.dstack([out, al]).round().astype(np.uint8), "RGBA")


def sharpen(img, radius=0.6, percent=50):
    """Unsharp mask on premultiplied colour; alpha untouched, colour kept within alpha."""
    pm = np.asarray(img.convert("RGBa")).astype(np.float32)
    rgb = Image.fromarray(pm[..., :3].round().astype(np.uint8), "RGB").filter(ImageFilter.UnsharpMask(radius, percent, 0))
    s = np.minimum(np.asarray(rgb).astype(np.float32), pm[..., 3:4])
    return Image.fromarray(np.dstack([s, pm[..., 3]]).round().astype(np.uint8), "RGBa").convert("RGBA")


def fit(rgba, w, h, cell, fill=1.0, margin_css=2):
    """The object scaled to fit w x h cells less a 2 CSS px margin (times fill), centred: exactly w*cell x h*cell."""
    m = margin_css * cell / CSS_CELL
    bw, bh = (w * cell - 2 * m) * fill, (h * cell - 2 * m) * fill
    s = min(bw / rgba.width, bh / rgba.height)
    nw, nh = max(1, round(rgba.width * s)), max(1, round(rgba.height * s))
    small = rgba.convert("RGBa").resize((nw, nh), Image.LANCZOS).convert("RGBA")
    c = Image.new("RGBA", (w * cell, h * cell), (0, 0, 0, 0))
    c.paste(small, ((w * cell - nw) // 2, (h * cell - nh) // 2))
    return c


def game_icon(graded, w, h, scale, fill=1.0):
    ic = fit(graded, w, h, CSS_CELL * scale, fill)
    return sharpen(ic) if scale == 1 else ic
