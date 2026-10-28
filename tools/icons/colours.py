"""D2's item recolouring, approximated on our pictures (numpy + PIL, no model).

D2 never paints a quality colour on a picture: it shifts the picture's palette. ITEMS_GetColor (D2MOO
D2Common Items/Items.cpp 3693-4015) calls D2CMP_MixPalette(the base's InvTrans, a colour) with
  - a magic or rare item: the transformcolor of its first suffix that has one, else of its first prefix
    (MagicPrefix/MagicSuffix.txt transformcolor; 3740-3805);
  - a unique: UniqueItems.txt invtransform (3818-3842); a set item: SetItems.txt invtransform (3870-3895);
  - else a socketed gem's Gems.txt transform (3960-3976), else the automagic affix's (3995-4011).
The colour is one of the 21 of Colors.txt (an index below 21, else none); InvTrans (Weapons/Armor/
Misc.txt) says which palette ranges a colour moves: 0 none, and in our scope 2 (grey2), 5 (greybrown)
and 8 (invgreybrown, which D2Win D2Comp.cpp 3108-3109 loads as shift 8).

Those shift tables are game files we neither have nor want, and our pictures are true colour, not
palette art, so this is our own approximation: a range mask per InvTrans (the grey ranges: low
saturation, i.e. iron and steel; the brown ranges: warm, dull, not bright, i.e. leather and wood; gold
and gems stay) and per named colour a gradient map of the masked pixels' luminance onto that colour's
ramp, its lightness scaled (light, dark, crystal, black, bright white). 5 and 8 are treated alike.

  python3 tools/icons/colours.py IN.webp OUT.png COLOUR INVTRANS
"""
import sys

import numpy as np
from PIL import Image

# Colors.txt in index order: code -> (r, g, b) of the ramp at its own luminance, the lightness scale
COLOURS = {
    "whit": ((222, 220, 212), 1.25),
    "lgry": ((168, 168, 166), 1.08),
    "dgry": ((92, 92, 94), 0.72),
    "blac": ((44, 42, 40), 0.5),
    "lblu": ((112, 150, 226), 1.08),
    "dblu": ((44, 62, 140), 0.8),
    "cblu": ((70, 150, 255), 1.04),
    "lred": ((216, 92, 80), 1.05),
    "dred": ((132, 30, 24), 0.78),
    "cred": ((240, 50, 38), 1.02),
    "lgrn": ((116, 196, 96), 1.05),
    "dgrn": ((44, 104, 40), 0.78),
    "cgrn": ((72, 228, 72), 1.02),
    "lyel": ((236, 218, 112), 1.12),
    "dyel": ((168, 148, 44), 0.86),
    "lgld": ((228, 188, 92), 1.1),
    "dgld": ((158, 118, 42), 0.86),
    "lpur": ((188, 122, 218), 1.05),
    "dpur": ((92, 42, 122), 0.78),
    "oran": ((238, 132, 42), 1.02),
    "bwht": ((255, 255, 250), 1.45),
}
CRYSTAL = {"cblu", "cred", "cgrn"}  # D2's "crystal" colours: saturated, a little glow in the shadows
# which ranges an InvTrans moves (the base's column): grey2 the grey ones, (inv)greybrown grey and brown
RANGES = {0: (), 2: ("grey",), 5: ("grey", "brown"), 8: ("grey", "brown")}
STRENGTH = 0.92  # a little of the original stays: the painted texture under the new colour
CHROMA = 0.85  # the ramps a little muted, as the grade mutes every picture (grade.py: chroma x 0.8); crystal ones not


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def masks(rgb):
    """Per pixel, 0-1: how grey (metal) and how brown (leather, wood) it is."""
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    grey = 1 - smooth(0.12, 0.28, sat)
    # brown: orange to yellow-orange hues, dull and not bright; bright saturated gold is left alone
    warm = smooth(5, 15, hue) * (1 - smooth(48, 60, hue))
    brown = warm * smooth(0.12, 0.25, sat) * (1 - smooth(0.62, 0.8, mx)) * (1 - smooth(0.7, 0.9, sat))
    return grey, brown


def ramp(colour, lum):
    """The colour's ramp at luminance lum: black up to the colour at its own luminance, then to white."""
    c, scale = COLOURS[colour]
    c = np.array(c, np.float32) / 255
    lc = float(c @ np.array([0.299, 0.587, 0.114], np.float32))
    l2 = np.clip(lum * scale, 0, 1)[..., None]
    low = c * l2 / max(lc, 1e-3)
    high = c + (1 - c) * (l2 - lc) / max(1 - lc, 1e-3)
    out = np.where(l2 <= lc, low, high)
    if colour in CRYSTAL:
        out = np.maximum(out, c * 0.22)  # shadows keep some of the colour: it seems to glow
    else:
        grey = out @ np.array([0.299, 0.587, 0.114], np.float32)
        out = grey[..., None] + (out - grey[..., None]) * CHROMA
    return np.clip(out, 0, 1)


def recolour(im, colour, inv_trans):
    """im (PIL RGBA) shifted as an item of that colour on a base of that InvTrans; a copy."""
    if colour not in COLOURS or not RANGES.get(int(inv_trans or 0)):
        return im.convert("RGBA").copy()
    a = np.asarray(im.convert("RGBA")).astype(np.float32) / 255
    rgb, alpha = a[..., :3], a[..., 3:]
    grey, brown = masks(rgb)
    rs = RANGES[int(inv_trans)]
    w = np.maximum(grey if "grey" in rs else 0, brown if "brown" in rs else 0) * STRENGTH
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    out = rgb * (1 - w[..., None]) + ramp(colour, lum) * w[..., None]
    return Image.fromarray((np.dstack([out, alpha]) * 255).round().clip(0, 255).astype(np.uint8), "RGBA")


if __name__ == "__main__":
    if len(sys.argv) != 5:
        sys.exit(__doc__.strip().splitlines()[-1].strip())
    recolour(Image.open(sys.argv[1]), sys.argv[3], int(sys.argv[4])).save(sys.argv[2])
