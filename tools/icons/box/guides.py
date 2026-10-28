"""Shape guides: flat grey shapes we draw ourselves with PIL polygons (no model, no traced outline),
given to klein as the reference image where words alone get an object's shape wrong.

usage: python -I guides.py OUT.png NAME WIDTH HEIGHT      one guide on a generation canvas
       python -I guides.py --list                         the guides' names and design canvases
       python -I guides.py --all DIR                      each guide on its own canvas: DIR/<name>_<W>x<H>.png
       python -I guides.py --sheet OUT.png [NAME ...]     a contact sheet of them, to check by eye

A guide is a light grey ground with the object as a flat dark grey shape and its key inner lines
(slits, a string, a ridge) lighter or darker. A shape family is one function; a guide is one set of its
parameters, designed on its picture's canvas (style.mjs CANVAS); on another canvas it is scaled to fit and
centred on the same ground. These are generic parametric shapes of a kind of object (a halberd's lopsided
head, a bow's D), drawn from the description's words (its "shape", else its note), never measured from any
picture. The sample round's eight (halberd, crossbow, falcata, gladius, great-helm, spear, short-bow,
soft-boots) are kept pixel for pixel as approved: the first two and the last three as their families' defaults.
In the samples the mace's guide drew a spear point for a head and wasn't used: it is not kept.
"""
import math, os, sys
from PIL import Image, ImageDraw

BG = (200, 200, 200)
OBJ = (70, 70, 70)
DARK = (25, 25, 25)
LIGHT = (150, 150, 150)
HORN = (120, 110, 90)
SS = 2  # supersampled, then reduced


def P(pts):
    return [(x * SS, y * SS) for x, y in pts]


def bez(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]


def spline(pts, n=16):
    """a Catmull-Rom curve through the points"""
    ext = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                    + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in (0, 1)))
    return out + [tuple(pts[-1])]


def arc(cx, cy, rx, ry, a0, a1, n=48):
    """points on an ellipse from angle a0 to a1, in degrees (0 right, 90 down)"""
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n)))
            for i in range(n + 1)]


def flip(pts, cx):
    """mirrored left to right about x = cx, in reverse order (so a half outline closes into a whole)"""
    return [(2 * cx - x, y) for x, y in reversed(pts)]


def vflip(pts, cy):
    return [(x, 2 * cy - y) for x, y in reversed(pts)]


def band(d, pts, width, fill=OBJ):
    """a strip along a polyline: width a number, a (start, end) pair, or a function of 0..1 along it"""
    pts = [p for i, p in enumerate(pts) if i == 0 or math.dist(p, pts[i - 1]) > 1e-6]
    if len(pts) < 16:                                                       # enough points for the width to follow
        k = -(-32 // (len(pts) - 1))
        pts = [(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k) for a, b in zip(pts, pts[1:]) for j in range(k)] + [pts[-1]]
    wf = width if callable(width) else (lambda s: width[0] + (width[1] - width[0]) * s) if isinstance(width, tuple) else (lambda s: width)
    run = [0.0]
    for a, b in zip(pts, pts[1:]):
        run.append(run[-1] + math.dist(a, b))
    left, right = [], []
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        m = math.dist(a, b) or 1
        nx, ny = -(b[1] - a[1]) / m, (b[0] - a[0]) / m
        w = wf(run[i] / (run[-1] or 1)) / 2
        left.append((p[0] + nx * w, p[1] + ny * w))
        right.append((p[0] - nx * w, p[1] - ny * w))
    d.polygon(P(left + right[::-1]), fill=fill)


def line(d, pts, w, fill):
    d.line(P(pts), fill=fill, width=round(w * SS), joint="curve")


def dot(d, x, y, r, fill):
    d.ellipse(P([(x - r, y - r), (x + r, y + r)]), fill=fill)


def along(base, tip):
    """(u, v) -> a point: u from 0 at base to 1 at tip, v pixels across (to the right of base→tip, going up)"""
    L = math.dist(base, tip)
    ux, uy = (tip[0] - base[0]) / L, (tip[1] - base[1]) / L
    return lambda u, v: (base[0] + ux * u * L - uy * v, base[1] + uy * u * L + ux * v)


# ---- swords and daggers

def gladius(d, W, H):
    d.polygon(P([(256, 160), (322, 300), (322, 1000), (190, 1000), (190, 300)]), fill=OBJ)  # short wide straight blade
    d.line(P([(256, 200), (256, 990)]), fill=LIGHT, width=6 * SS)            # central ridge
    d.ellipse(P([(150, 990), (362, 1080)]), fill=OBJ)                      # a rounded disc guard, no cross-guard
    d.rectangle(P([(222, 1070), (290, 1330)]), fill=OBJ)                    # ribbed grip
    for y in range(1100, 1330, 38):
        d.line(P([(222, y), (290, y)]), fill=LIGHT, width=4 * SS)
    d.ellipse(P([(176, 1320), (336, 1470)]), fill=OBJ)                     # a large round pommel


def falcata(d, W, H):
    # a blade bending forward, narrow at the hilt and broad toward the tip, the edge on the inner curve
    spine = bez((236, 1060), (200, 620), (250, 330)) + bez((250, 330), (270, 170), (220, 70))
    edge = bez((220, 70), (330, 130), (370, 330)) + bez((370, 330), (380, 560), (316, 760)) + bez((316, 760), (284, 900), (284, 1060))
    d.polygon(P(spine + edge), fill=OBJ)
    d.rectangle(P([(222, 1060), (300, 1090)]), fill=OBJ)                    # small guard
    d.polygon(P([(236, 1090), (284, 1090), (288, 1400), (232, 1400)]), fill=OBJ)  # grip
    hook = bez((250, 1400), (380, 1440), (360, 1250)) + bez((360, 1250), (346, 1150), (300, 1095))
    d.line(P(hook), fill=OBJ, width=30 * SS, joint="curve")                # hooked hilt round the knuckles
    d.ellipse(P([(220, 1385), (290, 1455)]), fill=OBJ)


def bound_grip(d, cx, y0, y1, half, step=36):
    """a straight grip with cord or leather bands across it"""
    d.rectangle(P([(cx - half, y0), (cx + half, y1)]), fill=OBJ)
    for y in range(round(y0 + step / 2), round(y1), step):
        line(d, [(cx - half, y), (cx + half, y)], 4, LIGHT)


def wavy_blade(d, W, H, cx, tip, base, half, bends, amp, taper=0.3, point=0.07,
               guard=None, grip=None, pommel=None, ganja=None, hilt=None):
    """A straight blade whose centre line snakes in even bends (half waves) from its base to the point, both
    edges with it: a flamberge's frozen flame, a kris's waves. guard (half, y0, y1) a straight cross-guard
    with round ends, grip (half, y0, y1), pommel (half, y0, y1) a pear; or a kris's ganja (how far it juts
    right, how high its tip rises) and hilt (a bent band: its points, its widths)."""
    n = 600
    mid, ws = [], []
    for i in range(n + 1):
        t = i / n                                                           # 0 at the base, 1 at the point
        mid.append((cx + amp * math.sin(math.pi * bends * t), base - (base - tip) * t))
        ws.append(half * (1 - taper * t) * min(1, (1 - t) / point))
    d.polygon(P([(x + w, y) for (x, y), w in zip(mid, ws)] + [(x - w, y) for (x, y), w in reversed(list(zip(mid, ws)))]), fill=OBJ)
    if guard:
        h, y0, y1 = guard
        d.rounded_rectangle(P([(cx - h, y0), (cx + h, y1)]), radius=(y1 - y0) / 2 * SS, fill=OBJ)
    if pommel:                                                              # pear: a neck swelling to a round end
        h, y0, y1 = pommel
        d.polygon(P([(cx - h * 0.5, y0), (cx + h * 0.5, y0), (cx + h, y0 + (y1 - y0) * 0.6), (cx - h, y0 + (y1 - y0) * 0.6)]), fill=OBJ)
        d.ellipse(P([(cx - h, y0 + (y1 - y0) * 0.3), (cx + h, y1)]), fill=OBJ)
    if grip:
        bound_grip(d, cx, grip[1], grip[2], grip[0])
    if ganja:                                                               # a guard-piece flared out to one side
        jut, rise = ganja
        top = bez((cx - half - 12, base - 20), (cx + jut * 0.6, base - 16), (cx + jut, base - rise))
        under = bez((cx + jut, base - rise), (cx + jut * 0.8, base + 18), (cx + jut * 0.3, base + 22))
        d.polygon(P(top + under + [(cx - half - 12, base + 22)]), fill=OBJ)
    if hilt:                                                                # a cup ferrule, then the bent hilt
        pts, (w0, w1) = hilt
        d.ellipse(P([(cx - half * 0.9, base + 18), (cx + half * 0.9, base + 64)]), fill=OBJ)
        curve = spline(pts)
        band(d, curve, (w0, w1))
        dot(d, *curve[-1], w1 / 2, OBJ)
    line(d, mid[int(n * 0.02):int(n * 0.93)], 5, LIGHT)                      # the ridge follows the waves


def falchion(d, W, H, bx=203, base=1040, tip=70, root=78, belly=150, belly_y=330):
    """A single-edged chopping blade: the back straight up the left, the edge swelling out to the right
    toward the end and sweeping up to meet the back at the point; a short guard, a bound grip, a disc pommel."""
    edge = bez((bx + root, base), (bx + root + 8, belly_y + 320), (bx + belly, belly_y)) + \
        bez((bx + belly, belly_y), (bx + belly + 10, tip + 90), (bx, tip))
    d.polygon(P([(bx, base)] + edge), fill=OBJ)
    gx = bx + root / 2
    d.rectangle(P([(gx - 85, base), (gx + 85, base + 32)]), fill=OBJ)       # short straight guard
    dot(d, gx, base + 368, 56, OBJ)                                         # a flat disc pommel, face on
    bound_grip(d, gx, base + 32, base + 320, 24)
    d.ellipse(P([(gx - 36, base + 332), (gx + 36, base + 404)]), outline=LIGHT, width=5 * SS)
    line(d, [(bx + 14, base - 10), (bx + 14, tip + 70)], 4, LIGHT)            # the thick back


# ---- fist weapons: a head over a frame held across the knuckles

def fist(d, W, H, head, cx=256, top=780, bottom=1470, bars=91, bar=14, grips=(1080, 1180), straps=(), frame="H"):
    """A fist weapon seen from the front. head: 'katar' (a tall triangle), 'scissors' (two thin blades
    opened in a V from one pivot), 'claws' (three slim prongs), 'crescent' (a broad crescent arching
    over the knuckles, horns down). frame 'H': two side bars from top to bottom joined by the grips;
    'U': the bars joined round the bottom. straps: leather bands wider than the frame."""
    if frame == "H":
        for s in (-1, 1):
            d.rectangle(P([(cx + s * bars - bar, top), (cx + s * bars + bar, bottom)]), fill=OBJ)
    else:
        for s in (-1, 1):
            d.rectangle(P([(cx + s * bars - bar, top), (cx + s * bars + bar, bottom - bars)]), fill=OBJ)
        band(d, arc(cx, bottom - bars, bars, bars, 0, 180), 2 * bar)
    for y in grips:                                                         # leather-wrapped grip bars
        d.rounded_rectangle(P([(cx - bars, y - 18), (cx + bars, y + 18)]), radius=10 * SS, fill=OBJ)
        for x in range(cx - bars + 16, cx + bars - 8, 22):
            line(d, [(x, y - 18), (x + 10, y + 18)], 3, LIGHT)
    for y in straps:
        d.rectangle(P([(cx - bars - 26, y - 16), (cx + bars + 26, y + 16)]), fill=DARK)
        d.rectangle(P([(cx + bars - 6, y - 12), (cx + bars + 18, y + 12)]), outline=LIGHT, width=4 * SS)  # buckle
    if head == "katar":
        half = bars + bar
        d.polygon(P([(cx, 60), (cx + half, top), (cx - half, top)]), fill=OBJ)
        d.rectangle(P([(cx - 52, top - 34), (cx + 52, top + 30)]), fill=OBJ)   # a riveted plate at the join
        line(d, [(cx, 100), (cx, top - 40)], 7, LIGHT)
        for x in (cx - 30, cx + 30):
            dot(d, x, top - 4, 7, DARK)
    elif head == "scissors":
        d.rectangle(P([(cx - bars - bar, top), (cx + bars + bar, top + 36)]), fill=OBJ)
        for s in (-1, 1):
            band(d, [(cx, top), (cx + s * 96, 60)], (50, 0))
            line(d, [(cx + s * 6, top - 50), (cx + s * 88, 110)], 4, LIGHT)
        dot(d, cx, top, 46, OBJ)
        dot(d, cx, top, 16, DARK)
    elif head == "claws":
        d.rectangle(P([(cx - bars - bar, top - 24), (cx + bars + bar, top + 20)]), fill=OBJ)
        for s, tip in ((-1, (cx - 100, 120)), (0, (cx, 60)), (1, (cx + 100, 120))):
            b = (cx + s * 64, top - 20)
            band(d, bez(b, (b[0] + s * 4, (b[1] + tip[1]) / 2), tip), (32, 0))
    elif head == "crescent":
        outer = arc(cx, 470, 205, 400, 180, 360)                             # the edge up, the horns at the sides
        inner = arc(cx, 500, 138, 210, 360, 180)
        d.polygon(P(outer + [(cx + 196, 600)] + inner + [(cx - 196, 600)]), fill=OBJ)
        d.rectangle(P([(cx - 36, 280), (cx + 36, top)]), fill=OBJ)            # the neck onto the knuckle plate
        band(d, bez((cx - bars - bar, top + 20), (cx, top - 60), (cx + bars + bar, top + 20)), 52)
        line(d, arc(cx, 470, 186, 380, 196, 344), 5, LIGHT)                  # the bevel along the edge


# ---- hafted weapons: a shaft, a head on top, a grip and a butt

def leaf_head(d, cx):
    # a willow-leaf head, widest a third of the way up, smooth convex edges, no barbs
    right = bez((cx, 40), (cx + 70, 200), (cx + 52, 330)) + bez((cx + 52, 330), (cx + 36, 380), (cx + 14, 400))
    left = [(2 * cx - x, y) for x, y in reversed(right)]
    d.polygon(P(right + left), fill=OBJ)
    d.line(P([(cx, 60), (cx, 390)]), fill=LIGHT, width=5 * SS)                       # mid ridge
    d.rectangle(P([(cx - 15, 395), (cx + 15, 480)]), fill=OBJ)                       # socket


def halberd_head(d, cx):
    d.polygon(P([(cx, 40), (cx + 26, 200), (cx + 18, 330), (cx - 18, 330), (cx - 26, 200)]), fill=OBJ)  # spike
    # one broad axe blade on the right only, its edge straight and upright
    blade = [(cx + 10, 360), (cx + 120, 345)] + bez((cx + 120, 345), (cx + 210, 300), (cx + 280, 285)) + \
            [(cx + 290, 420), (cx + 292, 560), (cx + 282, 680)] + bez((cx + 282, 680), (cx + 200, 640), (cx + 120, 600)) + \
            [(cx + 10, 590)]
    d.polygon(P(blade), fill=OBJ)
    # a short curved back-hook on the left only, like a bird's beak, tip down
    hook = [(cx - 10, 420), (cx - 60, 410)] + bez((cx - 60, 410), (cx - 150, 410), (cx - 190, 520)) + \
           bez((cx - 190, 520), (cx - 130, 470), (cx - 60, 480)) + [(cx - 10, 500)]
    d.polygon(P(hook), fill=OBJ)
    d.rectangle(P([(cx - 18, 330), (cx + 18, 640)]), fill=OBJ)             # socket and langets


def fork_head(d, cx, tip=40, base=480, side=(78, 300)):
    # one long straight central spike, two short thin side spikes branching close to its base, no crossbar
    d.polygon(P([(cx, tip), (cx + 15, tip + 90), (cx + 14, base), (cx - 14, base), (cx - 15, tip + 90)]), fill=OBJ)
    for s in (-1, 1):
        band(d, [(cx + s * 8, base - 6), (cx + s * side[0], side[1])], (20, 0))
    line(d, [(cx, tip + 30), (cx, base - 10)], 4, LIGHT)
    d.rectangle(P([(cx - 18, base - 10), (cx + 18, base + 90)]), fill=OBJ)   # socket
    line(d, [(cx - 18, base + 70), (cx + 18, base + 70)], 5, DARK)


def winged_head(d, cx, tip=40, base=460, wing=(140, 290)):
    # a long narrow central blade with two short flat wings spreading up and out from its base
    d.polygon(P([(cx, tip), (cx + 28, tip + 100), (cx + 26, base - 30), (cx + 14, base), (cx - 14, base),
                 (cx - 26, base - 30), (cx - 28, tip + 100)]), fill=OBJ)
    for s in (-1, 1):
        d.polygon(P([(cx + s * 10, base - 40), (cx + s * wing[0], wing[1]), (cx + s * (wing[0] - 34), wing[1] + 80),
                     (cx + s * 18, base + 30)]), fill=OBJ)
    line(d, [(cx, tip + 30), (cx, base - 10)], 5, LIGHT)
    d.rectangle(P([(cx - 18, base), (cx + 18, base + 100)]), fill=OBJ)       # socket
    d.rectangle(P([(cx - 25, base + 84), (cx + 25, base + 106)]), fill=OBJ)  # its ring


def bardiche_head(d, cx, tip=(-24, 45), reach=150, tail=660, top=190):
    # one long narrow crescent blade on the left of the upper shaft: fixed by a socket at the top and by its
    # lower tail, a gap between its back and the shaft in between, its point above the shaft's end
    px, py = cx + tip[0], tip[1]
    outer = bez((px, py), (cx - reach - 20, 180), (cx - reach + 10, 400)) + bez((cx - reach + 10, 400), (cx - reach + 30, 560), (cx - 13, tail))
    back = [(cx - 13, tail - 40), (cx - 52, tail - 90), (cx - 52, top + 110), (cx - 13, top + 64)] + \
        bez((cx - 13, top), (cx - 10, py + 60), (px, py))
    d.polygon(P(outer + back), fill=OBJ)
    d.rectangle(P([(cx - 20, top), (cx + 20, top + 64)]), fill=OBJ)          # the socket ring
    d.rectangle(P([(cx - 20, tail - 40), (cx + 20, tail)]), fill=OBJ)        # the tail's binding
    for y in (top + 32, tail - 20):
        dot(d, cx, y, 7, DARK)
    line(d, bez((px - 8, py + 40), (cx - reach - 2, 185), (cx - reach + 28, 400)) + bez((cx - reach + 28, 400), (cx - reach + 48, 550), (cx - 40, tail - 22)), 4, LIGHT)


def poleaxe_head(d, cx, top=40):
    # a broad rounded crescent axe on the left, a small square hammer on the right, a short spike on top
    d.polygon(P([(cx, top), (cx + 16, top + 36), (cx + 16, top + 130), (cx - 16, top + 130), (cx - 16, top + 36)]), fill=OBJ)
    blade = [(cx - 14, 180), (cx - 95, 196)] + bez((cx - 95, 196), (cx - 150, 150), (cx - 236, 92)) + \
        bez((cx - 236, 92), (cx - 300, 266), (cx - 236, 445)) + bez((cx - 236, 445), (cx - 150, 362), (cx - 95, 300)) + [(cx - 14, 300)]
    d.polygon(P(blade), fill=OBJ)
    face = [(cx + 14, 200), (cx + 78, 208), (cx + 92, 198)]
    for i, y in enumerate(range(206, 290, 12)):                             # a toothed striking face
        face.append((cx + (84 if i % 2 else 94), y))
    d.polygon(P(face + [(cx + 92, 296), (cx + 78, 286), (cx + 14, 292)]), fill=OBJ)
    d.rectangle(P([(cx - 17, top + 120), (cx + 17, 620)]), fill=OBJ)         # langets
    for y in (360, 480, 590):
        dot(d, cx, y, 6, DARK)
    line(d, bez((cx - 232, 112), (cx - 284, 266), (cx - 232, 426)), 4, LIGHT)


def voulge_head(d, cx, tip=40, edge=150, bottom=650):
    # a tall narrow cleaver blade flush along the right of the upper shaft, its top slanted into a point
    # above the shaft's end, a small square spur at its lower back
    d.polygon(P([(cx + 13, tip), (cx + edge, tip + 150), (cx + edge, bottom - 50), (cx + edge - 40, bottom),
                 (cx + 13, bottom)]), fill=OBJ)
    d.rectangle(P([(cx - 62, bottom - 46), (cx - 13, bottom - 8)]), fill=OBJ)  # the spur
    for y in (330, bottom - 90):                                            # two rings round shaft and blade
        d.rectangle(P([(cx - 19, y - 14), (cx + 22, y + 14)]), fill=OBJ)
        line(d, [(cx - 19, y), (cx + 22, y)], 5, DARK)
    line(d, [(cx + edge - 14, tip + 168), (cx + edge - 14, bottom - 56)], 4, LIGHT)  # the edge's bevel


def scythe_head(d, cx, tip=(70, 45), base=600):
    # a long narrow gently curved blade standing up in line with the shaft, its tip curving a little forward,
    # the edge on the inner (right, concave) side
    tx, ty = cx + tip[0], tip[1]
    back = spline([(cx - 30, base), (cx - 33, base - 200), (cx - 22, base - 380), (cx + 14, ty + 90), (tx, ty)])
    edge = spline([(tx, ty), (cx + 22, ty + 150), (cx + 26, base - 280), (cx + 30, base)])
    d.polygon(P(back + edge), fill=OBJ)
    line(d, spline([(cx - 16, base - 20), (cx - 18, base - 200), (cx - 8, base - 370), (cx + 22, ty + 110), (tx - 6, ty + 20)]), 4, LIGHT)
    d.rectangle(P([(cx - 19, base - 10), (cx + 19, base + 100)]), fill=OBJ)   # socket
    for y in (base + 18, base + 72):
        line(d, [(cx - 19, y), (cx + 19, y)], 6, DARK)


def pilum_head(d, cx, tip=40, collar=(770, 840)):
    # a long thin iron shank with a tiny pyramid point, a square collar joining it to the wooden shaft
    d.rectangle(P([(cx - 6, tip + 60), (cx + 6, collar[0])]), fill=OBJ)
    d.polygon(P([(cx, tip), (cx + 15, tip + 62), (cx + 6, tip + 78), (cx - 6, tip + 78), (cx - 15, tip + 62)]), fill=OBJ)
    d.rectangle(P([(cx - 30, collar[0]), (cx + 30, collar[1])]), fill=OBJ)
    for x in (cx - 15, cx + 15):
        for y in (collar[0] + 18, collar[1] - 18):
            dot(d, x, y, 5, DARK)


def pick_head(d, cx, top=110, beak=(340, 236), stub=130):
    # a lopsided T on the haft: a long thin beak curving down to the right, a short square hammer to the left
    band(d, bez((cx + 10, top + 52), (cx + 200, top + 36), (cx + beak[0], beak[1])), (84, 10))
    d.polygon(P([(cx - 20, top + 24), (cx - stub + 20, top + 24), (cx - stub, top + 12), (cx - stub, top + 94),
                 (cx - stub + 20, top + 82), (cx - 20, top + 82)]), fill=OBJ)
    d.rectangle(P([(cx - 28, top - 4), (cx + 28, top + 104)]), fill=OBJ)       # the head's eye
    d.rectangle(P([(cx - 14, top - 24), (cx + 14, top)]), fill=OBJ)            # a small cap on the haft's top
    d.rectangle(P([(cx - 21, top + 100), (cx + 21, top + 330)]), fill=OBJ)     # langets riveted down the haft
    for y in (top + 180, top + 290):
        dot(d, cx, y, 6, DARK)
    line(d, bez((cx + 30, top + 40), (cx + 200, top + 28), (cx + beak[0] - 16, beak[1] - 14)), 4, LIGHT)


HEADS = {"leaf": leaf_head, "halberd": halberd_head, "fork": fork_head, "winged": winged_head, "bardiche": bardiche_head,
         "poleaxe": poleaxe_head, "voulge": voulge_head, "scythe": scythe_head, "pilum": pilum_head, "pick": pick_head}


def pole(d, W, H, head, cx, shaft, butt=None, spike=None, grip=None, **kw):
    """A long straight shaft (half width, top, bottom) with a head on top (HEADS, its own parameters), an
    iron butt cap (half width, top, bottom) or a butt spike (its point's y), a dark grip wrap (half width, y0, y1)."""
    hw, y0, y1 = shaft
    d.rectangle(P([(cx - hw, y0), (cx + hw, y1)]), fill=OBJ)
    if butt:
        d.rectangle(P([(cx - butt[0], butt[1]), (cx + butt[0], butt[2])]), fill=OBJ)
    if spike:
        d.polygon(P([(cx - hw - 3, y1 - 10), (cx + hw + 3, y1 - 10), (cx, spike)]), fill=OBJ)
    HEADS[head](d, cx, **kw)
    if grip:
        d.rectangle(P([(cx - grip[0], grip[1]), (cx + grip[0], grip[2])]), fill=DARK)


def bundle(d, W, H, head="leaf", cx=256, bottom=1470, spread=(24, 64), tips=(130, 50, 95), length=150, tie=(780, 870), shaft=9):
    """Three slim straight javelins in a bundle, near parallel, fanning a little toward the top, tied at the
    middle; their heads at staggered heights: 'leaf' points, or 'barb' (a slender point with one barb
    curving back on the outer side, a small leather ring below it)."""
    lines = []
    for i, tip in zip((-1, 0, 1), tips):
        b, t = (cx + i * spread[0], bottom), (cx + i * spread[1], tip + length)
        band(d, [b, t], shaft * 2)
        lines.append((b, t))
        at = along(t, (cx + i * spread[1] * 1.04, tip))
        if head == "leaf":
            leaf = lambda u: 22 * math.sin(math.pi * min(1, u / 0.85) ** 0.7) * (1 - u) ** 0.35
            us = [k / 30 for k in range(31)]
            d.polygon(P([at(u, leaf(u)) for u in us] + [at(u, -leaf(u)) for u in reversed(us)]), fill=OBJ)
            line(d, [at(0.05, 0), at(0.9, 0)], 3, LIGHT)
        else:
            s = i or 1                                                       # the barb on the outer side
            d.polygon(P([at(0, -11), at(1, 0), at(0, 11)]), fill=OBJ)
            d.polygon(P([at(0.62, s * 6), at(0.18, s * 40), at(0.36, s * 8)]), fill=OBJ)
            band(d, [at(-0.05, 0), at(-0.2, 0)], 30, DARK)
    xs = []
    for (b, t) in lines:
        for y in tie:
            xs.append(b[0] + (t[0] - b[0]) * (y - b[1]) / (t[1] - b[1]))
    d.rectangle(P([(min(xs) - shaft - 6, tie[0]), (max(xs) + shaft + 6, tie[1])]), fill=DARK)   # the binding
    for y in range(tie[0] + 16, tie[1], 26):
        line(d, [(min(xs) - shaft - 6, y), (max(xs) + shaft + 6, y + 12)], 3, LIGHT)


def flail(d, W, H, head="ball", cx=416, top=170, bottom=1120, balls=((-235, 360), (235, 470), (-150, 650)), r=50):
    """A straight haft with an onion finial and a round pommel; from its top three short chains to three
    small spiked heads hanging beside it at different heights: 'ball' (solid) or 'cage' (open, a dark core)."""
    d.rectangle(P([(cx - 20, top), (cx + 20, bottom)]), fill=OBJ)
    d.ellipse(P([(cx - 36, bottom - 20), (cx + 36, bottom + 64)]), fill=OBJ)  # pommel
    onion = spline([(cx, top - 110), (cx + 14, top - 76), (cx + 40, top - 40), (cx + 30, top - 8), (cx + 24, top + 6)])
    d.polygon(P(onion + flip(onion, cx)), fill=OBJ)                           # the onion-dome finial
    d.rectangle(P([(cx - 28, top + 4), (cx + 28, top + 30)]), fill=OBJ)      # the collar the chains hang from
    for y in range(top + 80, bottom - 40, 54):                              # cloth wound round the haft
        line(d, [(cx - 20, y + 20), (cx + 20, y)], 4, LIGHT)
    for dx, y in balls:
        x = cx + dx
        a = (cx + (14 if dx > 0 else -14), top + 26)
        n = int(math.dist(a, (x, y)) / 26)
        ang = math.atan2(y - a[1], x - a[0])
        for k in range(1, n):                                               # the chain, link by link
            px, py = a[0] + (x - a[0]) * k / n, a[1] + (y - a[1]) * k / n
            rx, ry = (13, 8) if k % 2 else (8, 8)
            pts = [(px + math.cos(ang) * rx * math.cos(t) - math.sin(ang) * ry * math.sin(t),
                    py + math.sin(ang) * rx * math.cos(t) + math.cos(ang) * ry * math.sin(t)) for t in [j * math.pi / 12 for j in range(25)]]
            line(d, pts, 5, OBJ)
        for k in range(10):                                                 # spikes
            t = 2 * math.pi * k / 10 + 0.3
            band(d, [(x + math.cos(t) * (r - 6), y + math.sin(t) * (r - 6)), (x + math.cos(t) * (r + 30), y + math.sin(t) * (r + 30))], (22, 0))
        if head == "ball":
            dot(d, x, y, r, OBJ)
        else:                                                               # an open spiked cage round a relic
            d.ellipse(P([(x - r, y - r), (x + r, y + r)]), outline=OBJ, width=12 * SS)
            for t in (0, 60, 120):
                c, s = math.cos(math.radians(t)), math.sin(math.radians(t))
                line(d, [(x - c * r, y - s * r), (x + c * r, y + s * r)], 7, OBJ)
            dot(d, x, y, 20, DARK)


# ---- bows: the string straight on the left, the bow to the right

def bow(d, W, H, form="d", sx=300, y0=70, y1=1178, gx=600, ctrl=(640, 260), limb=34, taper=None,
        grip=(575, 560, 640, 690), nocks=16, ears=None, humps=None, riser=None, tips=None, feathers=False):
    """A strung bow, side view. form 'd' (one curve from the tip through ctrl to the grip, mirrored), 'ears'
    (a static recurve: the D to two string bridges, then straight ears (height, reach) angled out to the
    right), 'b' (deflex-reflex: a spline from the tip through humps to the grip, mirrored), 'riser' (a
    straight rigid riser (x0, x1, height, notch) with curved limbs). limb the width, or taper (grip, tips);
    tips 'fork' (antler tines) or 'hook' (curled closed hooks); feathers on a thong below the grip."""
    ym = (y0 + y1) / 2
    width = (lambda s: taper[1] + (taper[0] - taper[1]) * (1 - abs(2 * s - 1))) if taper else limb
    string = [(sx, y0), (sx, y1)]
    if form == "d":
        # two mirrored limbs round a grip exactly at the middle and a straight pale string: a D
        top = bez((sx, y0), ctrl, (gx, ym))
        bot = bez((gx, ym), (ctrl[0], 2 * ym - ctrl[1]), (sx, y1))
        if taper:
            band(d, top + bot, width)
        else:
            d.line(P(top + bot), fill=OBJ, width=limb * SS, joint="curve")
    elif form == "ears":
        eh, reach = ears
        b0, b1 = y0 + eh, y1 - eh
        band(d, bez((sx, b0), ctrl, (gx, ym)) + bez((gx, ym), (ctrl[0], 2 * ym - ctrl[1]), (sx, b1)), width)
        for b, t, s in ((b0, y0, 1), (b1, y1, -1)):
            band(d, [(sx + 6, b + 10 * s), (sx + reach, t)], (30, 20))
            d.rectangle(P([(sx - 10, b - 12), (sx + 14, b + 12)]), fill=DARK)   # the string bridge
        string = [(sx + reach, y0), (sx, b0), (sx, b1), (sx + reach, y1)]
    elif form == "b":
        top = spline([(sx + 4, y0)] + [(sx + x, y) for x, y in humps] + [(gx, ym)])
        band(d, top + vflip(top, ym), width)
    elif form == "riser":
        x0, x1, rh, notch = riser
        r0, r1 = ym - rh / 2, ym + rh / 2
        for a, b, t, c in (((x0 + x1) / 2, r0 + 10, y0, -1), ((x0 + x1) / 2, r1 - 10, y1, 1)):
            band(d, bez((a, b), (x1 + 6, (b + t) / 2 + c * (rh / 3)), (sx, t)), width)
        d.rectangle(P([(x0, r0), (x1, r1)]), fill=OBJ)
        d.rectangle(P([(x0 - 1, ym - notch - 18), (x0 + 22, ym - notch)]), fill=BG)   # the arrow shelf
        for y in (r0 + 4, r1 - 4):                                          # cord at the joints
            d.rectangle(P([(x0 - 4, y - 10), (x1 + 4, y + 10)]), fill=DARK)
    if grip:
        d.rounded_rectangle(P([(grip[0], grip[1]), (grip[2], grip[3])]), radius=10 * SS, fill=DARK)  # grip
    if tips == "fork":                                                      # turned forward into two-pronged tines
        for y, s in ((y0, -1), (y1, 1)):
            band(d, bez((sx, y + s * -6), (sx + 2, y + s * 30), (sx + 22, y + s * 52)), (16, 12))
            band(d, [(sx + 20, y + s * 48), (sx + 30, y + s * 86)], (14, 4))
            band(d, [(sx + 20, y + s * 48), (sx + 64, y + s * 70)], (14, 4))
    if tips == "hook":                                                      # tips curled out into closed hooks
        for y, s in ((y0, 1), (y1, -1)):
            pts = [(sx + 34 + (34 - 10 * k / 30) * math.cos(math.radians(180 + 290 * k / 30)),
                    y + s * (34 - 10 * k / 30) * math.sin(math.radians(180 + 290 * k / 30))) for k in range(31)]
            band(d, pts, (18, 12))
    if feathers:                                                            # a thong with two feathers
        g = (grip[0] + 2, grip[3] + 2)
        e = (g[0] - 70, g[1] + 110)
        line(d, [g, e], 5, DARK)
        for dx in (-34, 6):
            band(d, [e, (e[0] + dx, e[1] + 130)], lambda s: 30 * math.sin(math.pi * min(1, s * 1.08)))
    d.line(P(string), fill=LIGHT, width=8 * SS, joint="curve")              # string
    if nocks:
        for x, y in (string[0], string[-1]):
            d.ellipse(P([(x - 14, y - nocks), (x + 16, y + nocks)]), fill=HORN)   # nocks


# ---- crossbows, from above: the prod at the top, the butt at the bottom

def crossbow(d, W, H, cx=416, tiller=(32, 32, 200, 1190), prod=(70, 300, 210, 330, 250), curl=False, stirrup=(60, 70, 230, 22),
             nut=(560, 22), lever=((34, 720), (58, 1080), 12), string_ends=76, bands=(), box=None, crank=None, lash=False):
    """tiller (front half width, butt half width, front y, butt y); prod (its ends' inset from the sides,
    the upper edge's end y and middle control y, the lower edge's): a bar bowed forward; curl draws a thinner
    prod whose tips turn forward (up); stirrup (half width, top, bottom, ring width) or None; the string a V
    from the prod's ends to the nut (y, r), or to a box magazine's front (box: half width, front, rear, side
    face); lever (from, to, width) relative to cx, wooden and pinned when there's a box; crank (rack top,
    gear box y0, y1, handle (out, down)); bands of iron round the tiller; lash, cord binding the prod on."""
    hf, hb, t0, t1 = tiller
    if hf == hb:
        d.rectangle(P([(cx - hf, t0), (cx + hf, t1)]), fill=OBJ)            # straight narrow tiller, square butt
    else:
        d.polygon(P([(cx - hf, t0), (cx + hf, t0), (cx + hb, t1), (cx - hb, t1)]), fill=OBJ)
    inset, et, ct, eb, cb = prod
    if curl:
        half = cx - inset
        pts = spline([(cx - half - 4, et - 50), (cx - half + 10, et + 4), (cx - half + 120, eb + 4), (cx, eb - 24),
                      (cx + half - 120, eb + 4), (cx + half - 10, et + 4), (cx + half + 4, et - 50)])
        band(d, pts, lambda s: 14 + 10 * (1 - abs(2 * s - 1)))
        ends = ((cx - half + 12, et + 8), (cx + half - 12, et + 8))
    else:
        prod_top = bez((inset, et), (cx, ct), (W - inset, et))                # a short thick prod across the front
        prod_bot = bez((W - inset, eb), (cx, cb), (inset, eb))
        d.polygon(P(prod_top + prod_bot), fill=OBJ)
        ends = ((string_ends, (et + eb) / 2 + 3), (W - string_ends, (et + eb) / 2 + 3))
    if stirrup:
        sw, s0, s1, rw = stirrup
        d.ellipse(P([(cx - sw, s0), (cx + sw, s1)]), outline=OBJ, width=rw * SS)  # stirrup at the very front
    for y in bands:                                                         # iron bands round the tiller
        d.rectangle(P([(cx - hf - 4, y - 12), (cx + hf + 4, y + 12)]), fill=DARK)
    if lash:                                                                # the prod lashed on with cord
        y = (et + eb) / 2 + 10 if curl else (ct + cb) / 2 + 30
        for s in (-1, 1):
            line(d, [(cx - hf - 6, y - 22 * s), (cx + hf + 6, y + 22 * s)], 7, DARK)
    if crank:
        rack, g0, g1, (hx, hy) = crank
        line(d, [(cx + 18, rack), (cx + 18, g0)], 6, DARK)                  # the toothed rack
        for y in range(rack + 10, g0, 22):
            line(d, [(cx + 18, y), (cx + 30, y)], 4, DARK)
        d.rectangle(P([(cx - hf - 16, g0), (cx + hf + 16, g1)]), fill=OBJ)  # the gear box
        d.rectangle(P([(cx - hf + 4, g0 + 20), (cx + hf - 4, g1 - 20)]), outline=DARK, width=5 * SS)
        band(d, [(cx + hf + 10, (g0 + g1) / 2), (cx + hx, (g0 + g1) / 2), (cx + hx, (g0 + g1) / 2 + hy)], 20)  # L handle
        dot(d, cx + hx, (g0 + g1) / 2 + hy, 16, OBJ)
    if box:
        bw, b0, b1, side = box
        d.rectangle(P([(cx - bw, b0), (cx + bw + side, b1)]), fill=OBJ)     # the magazine, its right face showing
        line(d, [(cx + bw, b0), (cx + bw, b1)], 4, DARK)
        line(d, [(cx, b0 + 20), (cx, b1 - 30)], 9, DARK)                     # the slot along its top
        for y in (b0 + 70, b1 - 80):
            line(d, [(cx - bw, y), (cx + bw + side, y)], 7, LIGHT)            # iron straps
        tgt = (cx, b0 + 6)
        d.line(P([ends[0], tgt]), fill=LIGHT, width=6 * SS)
        d.line(P([ends[1], tgt]), fill=LIGHT, width=6 * SS)
    elif nut:
        n = (cx, nut[0])                                                    # the string drawn back to a nut: a V
        d.line(P([ends[0], n]), fill=LIGHT, width=6 * SS)
        d.line(P([ends[1], n]), fill=LIGHT, width=6 * SS)
        d.ellipse(P([(n[0] - nut[1], n[1] - nut[1]), (n[0] + nut[1], n[1] + nut[1])]), fill=DARK)
    if lever:
        (ax, ay), (bx, by), lw = lever
        if box:                                                             # wooden, pinned to the box and near the butt
            band(d, [(cx + ax, ay), (cx + bx, ay + 60), (cx + bx + 4, by)], lw)
            dot(d, cx + ax, ay, 8, DARK)
            dot(d, cx + bx + 4, by, 8, DARK)
        else:
            d.line(P([(cx + ax, ay), (cx + bx, by)]), fill=DARK, width=lw * SS)   # a long thin lever along the rear half


# ---- armour

def great_helm(d, W, H):
    # from the front: a low flattened dome, near-upright sides tapering a little, the lower edge
    # dipping to a blunt point at the chin, a raised ridge down the middle of the face
    outline = bez((290, 300), (300, 150), (512, 140)) + bez((512, 140), (724, 150), (734, 300)) + \
              [(728, 600), (712, 800)] + bez((712, 800), (640, 850), (512, 900)) + bez((512, 900), (384, 850), (312, 800)) + \
              [(296, 600)]
    d.polygon(P(outline), fill=OBJ)
    d.line(P([(512, 150), (512, 890)]), fill=LIGHT, width=8 * SS)                 # central ridge
    d.rectangle(P([(330, 410), (490, 438)]), fill=DARK)                           # eye slits either side of it
    d.rectangle(P([(534, 410), (694, 438)]), fill=DARK)
    for row in range(3):
        for col in range(4):
            x = 560 + col * 30 + (row % 2) * 12
            d.ellipse(P([(x, 600 + row * 36), (x + 13, 613 + row * 36)]), fill=DARK)   # breaths, one side only
    d.line(P(bez((300, 330), (512, 300), (724, 330))), fill=LIGHT, width=6 * SS)    # a band under the crown


def jaw_cap(d, W, H, cx=512, brim=500, rx=290, ry=280, jaw=(212, 250, 58), teeth=9):
    """A low dome cap in the upper half, three-quarter view; below its front edge a wide U of jawbone, open
    at the top, with a row of short upright teeth along it, slung from rings at the cap's sides; fur at the back."""
    dome = arc(cx, brim, rx, ry, 180, 360) + bez((cx + rx, brim), (cx, brim + 70), (cx - rx, brim))
    d.polygon(P(dome), fill=OBJ)
    for k, (lift, reach) in enumerate(((236, 30), (190, 52), (148, 38), (104, 58), (62, 34))):   # coarse fur at the back (left)
        y = brim - lift
        x = cx - rx * math.sqrt(max(0, 1 - ((brim - y) / ry) ** 2))
        d.polygon(P([(x + 14, y - 26), (x - reach, y + 2 - k * 3), (x + 14, y + 24)]), fill=OBJ)
    jx, jy, jw = jaw
    band(d, arc(cx, brim + 10, jx, jy, 0, 180), jw)
    for k in range(teeth):                                                  # teeth along the inside, pointing up
        a = math.radians(26 + 128 * k / (teeth - 1))
        bxx, byy = cx + (jx - jw / 2) * math.cos(a), brim + 10 + (jy - jw / 2) * math.sin(a)
        h = 64 if k in (teeth // 2 - 1, teeth // 2 + 1) else 46
        d.polygon(P([(bxx - 17, byy + 6), (bxx + 17, byy + 6), (bxx + (k - teeth // 2) * 2, byy - h)]), fill=OBJ)
    for s in (-1, 1):                                                       # rings and thongs holding it on
        line(d, [(cx + s * jx, brim + 24), (cx + s * (rx - 30), brim - 16)], 10, DARK)
        d.ellipse(P([(cx + s * jx - 18, brim + 4), (cx + s * jx + 18, brim + 40)]), outline=DARK, width=6 * SS)
    line(d, bez((cx - rx + 10, brim - 20), (cx, brim + 46), (cx + rx - 10, brim - 20)), 7, LIGHT)  # the brim strip
    for x in (-0.45, 0.1, 0.6):                                             # iron strips over the dome
        line(d, bez((cx + x * rx, brim + 10), (cx + x * rx * 1.15, brim - ry * 0.75), (cx + x * 30, brim - ry + 6)), 6, LIGHT)


def lancet_shield(d, W, H, cx=352, half=232, top=40, arch=470, foot=950, bottom=1370, ridges=5, rim=24):
    """A tall narrow shield pointed at both ends: a lancet arch on top, straight parallel sides, a pointed
    foot; raised ridges running from tip to tip, a riveted rim."""
    def hw(y, h=half, t=top, b=bottom):
        if y <= arch:
            R = (h * h + (arch - t) ** 2) / (2 * h)                         # each side an arc meeting the other at the tip
            return max(0, math.sqrt(max(0, R * R - (arch - y) ** 2)) - (R - h))
        if y >= foot:
            R = (h * h + (b - foot) ** 2) / (2 * h)
            return max(0, math.sqrt(max(0, R * R - (y - foot) ** 2)) - (R - h))
        return h
    ys = [top + (bottom - top) * i / 400 for i in range(401)]
    d.polygon(P([(cx + hw(y), y) for y in ys] + [(cx - hw(y), y) for y in reversed(ys)]), fill=OBJ)
    t1, b1 = top + rim * 1.9, bottom - rim * 1.9
    inner = lambda y: hw(y, half - rim, t1, b1)
    iys = [t1 + (b1 - t1) * i / 400 for i in range(401)]
    rim_line = [(cx + inner(y), y) for y in iys] + [(cx - inner(y), y) for y in reversed(iys)]
    d.line(P(rim_line), fill=LIGHT, width=5 * SS, joint="curve")
    for k in range(ridges):                                                 # the ridges converge at the tips
        f = (k - (ridges - 1) / 2) / ((ridges - 1) / 2 + 0.6)
        line(d, [(cx + f * inner(y), y) for y in iys], 8, LIGHT)
    for y in range(round(t1) + 60, round(b1) - 40, 70):                     # rivets on the rim
        for s in (-1, 1):
            dot(d, cx + s * (hw(y) - rim / 2), y, 6, DARK)


def boots(d, W, H, at=((150, 120), (545, 150)), top=90, cuff=True, thongs=4, sole=8, toe_cap=False, toggles=False,
          mail=False, plate=False, greave=False):
    """A pair of boots side by side, toes to the right. The soft boot: a turned-down cuff, thongs round the
    shin, a thin flat sole, no heel. Without the cuff a straight shaft from top; sole over 8 a thick stacked
    sole with hobnails; toe_cap; toggles, a row of horn toggles up the outer side; mail, a low shoe under a
    mail legging with garter and ankle thong; plate, a shin plate on two straps; greave, a plate shin tube,
    a round knee cop and the foot as four stepped lames."""
    for ox, oy in at:
        if greave:
            foot = [(ox + 158, oy + 575), (ox + 196, oy + 580), (ox + 196, oy + 614), (ox + 234, oy + 619), (ox + 234, oy + 653),
                    (ox + 270, oy + 658), (ox + 270, oy + 690)] + bez((ox + 270, oy + 690), (ox + 312, oy + 694), (ox + 310, oy + 735))
            calf = spline([(ox + 22, oy + 150), (ox + 2, oy + 330), (ox + 18, oy + 560), (ox + 14, oy + 735)])
            d.polygon(P([(ox + 164, oy + 150)] + foot + calf[::-1]), fill=OBJ)
            d.ellipse(P([(ox + 14, oy + 40), (ox + 204, oy + 214)]), fill=OBJ)   # the knee cop, an oval plate
            d.ellipse(P([(ox + 36, oy + 60), (ox + 182, oy + 194)]), outline=LIGHT, width=5 * SS)
            dot(d, ox + 109, oy + 127, 9, DARK)
            line(d, [(ox + 118, oy + 220), (ox + 118, oy + 560)], 5, LIGHT)   # the shin tube's ridge
            for k in range(3):                                              # the lames' edges
                line(d, bez((ox + 196 + 38 * k, oy + 582 + 39 * k), (ox + 176 + 38 * k, oy + 660 + 20 * k), (ox + 150 + 44 * k, oy + 732)), 5, DARK)
            line(d, [(ox + 18, oy + 572), (ox + 158, oy + 572)], 5, DARK)    # the ankle
            line(d, [(ox + 0, oy + 735), (ox + 300, oy + 735)], 8, DARK)      # sole
            continue
        toe = bez((ox + 150, oy + 630), (ox + 290, oy + 610), (ox + 305, oy + 735))
        shaft_top = [(ox + 10, oy + top), (ox + 160, oy + top)] if cuff else [(ox + 6, oy + top), (ox + 162, oy + top)]
        d.polygon(P(shaft_top + toe + [(ox + 0, oy + 735), (ox + 5, oy + 640)]), fill=OBJ)
        if cuff:
            d.polygon(P([(ox - 12, oy + 10), (ox + 182, oy + 10), (ox + 172, oy + 120), (ox - 2, oy + 120)]), fill=OBJ)  # cuff
            d.line(P([(ox - 2, oy + 120), (ox + 172, oy + 120)]), fill=DARK, width=5 * SS)
        if sole > 8:                                                        # a thick stacked sole with hobnails
            d.rectangle(P([(ox - 4, oy + 732), (ox + 308, oy + 732 + sole)]), fill=OBJ)
            line(d, [(ox - 4, oy + 732 + sole / 2), (ox + 308, oy + 732 + sole / 2)], 4, LIGHT)
            for x in range(ox + 10, ox + 300, 30):
                dot(d, x, oy + 732 + sole - 4, 5, DARK)
        d.line(P([(ox + 0, oy + 735), (ox + 300, oy + 735)]), fill=DARK, width=8 * SS)  # sole
        for k in range(thongs):                                                          # thongs
            y = oy + 200 + k * 90
            d.line(P([(ox + 8, y + 40), (ox + 158, y)]), fill=LIGHT, width=6 * SS)
        if not cuff:
            line(d, [(ox + 6, oy + top + 16), (ox + 162, oy + top + 16)], 5, DARK)          # the shaft's top edge
        if toe_cap:
            line(d, bez((ox + 196, oy + 734), (ox + 206, oy + 662), (ox + 268, oy + 664)), 6, DARK)
        if toggles:                                                         # closed up the outer side
            line(d, [(ox + 112, oy + top + 40), (ox + 108, oy + 600)], 4, DARK)
            for y in range(oy + top + 70, oy + 600, 72):
                d.ellipse(P([(ox + 100, y - 11), (ox + 122, y + 11)]), fill=LIGHT)
        if mail:                                                            # a low shoe under a mail legging
            line(d, bez((ox + 2, oy + 590), (ox + 130, oy + 582), (ox + 206, oy + 650)), 7, DARK)
            d.rectangle(P([(ox + 4, oy + top + 46), (ox + 164, oy + top + 76)]), fill=DARK)   # garter
            line(d, [(ox + 4, oy + 556), (ox + 156, oy + 548)], 5, DARK)                     # ankle thong
            for y in range(oy + top + 120, oy + 540, 64):
                line(d, bez((ox + 10, y), (ox + 84, y + 26), (ox + 156, y - 4)), 4, LIGHT)   # the mail's folds
        if plate:                                                           # a curved shin plate on two straps
            pl = bez((ox + 108, oy + top + 30), (ox + 96, oy + 330), (ox + 112, oy + 575))
            d.polygon(P([(ox + 170, oy + top + 20)] + pl + [(ox + 166, oy + 560)]), fill=OBJ)
            line(d, pl, 5, LIGHT)
            for y in (oy + 220, oy + 450):
                d.rectangle(P([(ox + 4, y - 12), (ox + 104, y + 12)]), fill=DARK)
                d.rectangle(P([(ox + 84, y - 16), (ox + 108, y + 16)]), outline=LIGHT, width=4 * SS)


# ---- small things

def tau(d, W, H, cx=384, bar=(170, 598, 121, 201), stem=586, knob=56, stone=36):
    """A capital T: a bar across the top, a stem as thick down from its middle, a round knob on each end, a
    small round stone where they meet."""
    x0, x1, y0, y1 = bar
    t = (y1 - y0) / 2
    d.rectangle(P([(x0, y0), (x1, y1)]), fill=OBJ)
    d.rectangle(P([(cx - t, y0), (cx + t, stem)]), fill=OBJ)
    for x, y in ((x0 - 20, (y0 + y1) / 2), (x1 + 20, (y0 + y1) / 2), (cx, stem + 20)):
        dot(d, x, y, knob, OBJ)
    dot(d, cx, (y0 + y1) / 2, stone, LIGHT)


def scroll(d, W, H, x=(90, 934), roll=120, y=(292, 732), sheet=30, knob=(26, 34)):
    """A scroll opened sideways on two upright rollers: each a thick roll of parchment with a knob at both
    ends sticking out, a flat sheet between them a little shorter than the rolls."""
    xl, xr = x
    y0, y1 = y
    d.rectangle(P([(xl + roll, y0 + sheet), (xr - roll, y1 - sheet)]), fill=OBJ)
    for a in (xl, xr - roll):
        d.rounded_rectangle(P([(a, y0), (a + roll, y1)]), radius=18 * SS, fill=OBJ)
        c = a + roll / 2
        d.rectangle(P([(c - 15, y0 - 30), (c + 15, y1 + 30)]), fill=OBJ)   # the roller's rod, out at both ends
        for yy in (y0 - 30 - knob[0], y1 + 30 + knob[0]):
            d.ellipse(P([(c - knob[1], yy - knob[0]), (c + knob[1], yy + knob[0])]), fill=OBJ)
        line(d, [(a + roll * 0.3, y0 + 20), (a + roll * 0.3, y1 - 20)], 4, LIGHT)
    for a in (xl + roll, xr - roll):                                        # where the sheet leaves each roll
        line(d, [(a, y0 + sheet), (a, y1 - sheet)], 6, DARK)


# name: (family, its design canvas[, the guide's parameters])
GUIDES = {
    # swords and daggers
    "gladius": (gladius, (512, 1536)),
    "falcata": (falcata, (512, 1536)),
    "flamberge": (wavy_blade, (704, 1408), dict(cx=352, tip=46, base=930, half=42, bends=24, amp=9, guard=(176, 930, 966),
                                                  grip=(22, 966, 1252), pommel=(46, 1248, 1370))),
    "kris": (wavy_blade, (512, 1536), dict(cx=236, tip=56, base=1110, half=42, bends=7, amp=26, taper=0.45, point=0.09,
                                             ganja=(118, 34), hilt=([(236, 1168), (240, 1270), (262, 1370), (312, 1440)], (52, 62)))),
    "falchion": (falchion, (512, 1536)),
    # fist weapons
    "katar": (fist, (512, 1536), dict(head="katar")),
    "scissors-katar": (fist, (512, 1536), dict(head="scissors")),
    "claws": (fist, (512, 1536), dict(head="claws", grips=(1060,), straps=(1330,))),
    "hatchet-fist": (fist, (512, 1536), dict(head="crescent", frame="U", top=430, bottom=1460, bars=80, grips=(650,), straps=(1010, 1220))),
    # hafted
    "spear": (pole, (704, 1408), dict(head="leaf", cx=352, shaft=(11, 470, 1380), butt=(14, 1340, 1390), grip=(14, 840, 960))),
    "halberd": (pole, (704, 1408), dict(head="halberd", cx=340, shaft=(13, 300, 1385), butt=(16, 1330, 1390))),
    "brandistock": (pole, (704, 1408), dict(head="fork", cx=352, shaft=(12, 540, 1385), butt=(15, 1338, 1392), grip=(15, 860, 980))),
    "spetum": (pole, (704, 1408), dict(head="winged", cx=352, shaft=(12, 540, 1385), butt=(15, 1338, 1392), grip=(15, 860, 980))),
    "bardiche": (pole, (704, 1408), dict(head="bardiche", cx=420, shaft=(13, 190, 1385), butt=(16, 1336, 1392))),
    "poleaxe": (pole, (704, 1408), dict(head="poleaxe", cx=440, shaft=(13, 150, 1316), spike=1394)),
    "voulge": (pole, (704, 1408), dict(head="voulge", cx=307, shaft=(13, 270, 1385), butt=(16, 1336, 1392))),
    "war-scythe": (pole, (704, 1408), dict(head="scythe", cx=340, shaft=(13, 640, 1385), butt=(16, 1336, 1392), grip=(16, 900, 1020))),
    "pilum": (pole, (512, 1536), dict(head="pilum", cx=256, shaft=(17, 830, 1450), butt=(21, 1420, 1476), grip=(20, 850, 980))),
    "military-pick": (pole, (832, 1248), dict(head="pick", cx=310, shaft=(17, 110, 1185), butt=(21, 1150, 1204), grip=(20, 930, 1120))),
    "javelins": (bundle, (512, 1536), dict(head="leaf")),
    "maiden-javelins": (bundle, (512, 1536), dict(head="barb", tips=(120, 50, 90), length=160)),
    "relic-flail": (flail, (832, 1248), dict(head="ball")),
    "relic-flail-gilt": (flail, (832, 1248), dict(head="cage")),
    # bows
    "short-bow": (bow, (832, 1248)),
    "flat-bow": (bow, (832, 1248), dict(sx=210, gx=612, ctrl=(664, 260), taper=(66, 16), grip=(582, 588, 642, 660))),
    "composite-bow": (bow, (832, 1248), dict(form="ears", sx=250, y0=60, y1=1188, gx=560, ctrl=(600, 360), taper=(38, 26),
                                             ears=(160, 118), grip=(532, 568, 590, 680))),
    "battle-bow": (bow, (832, 1248), dict(form="b", sx=256, gx=346, taper=(42, 18), grip=(316, 566, 378, 682),
                                          humps=[(170, 130), (292, 300), (250, 470), (120, 570)])),
    "war-bow": (bow, (832, 1248), dict(form="riser", sx=270, gx=536, taper=(36, 16), riser=(506, 566, 369, 16), grip=(508, 630, 564, 714))),
    "long-bow": (bow, (704, 1408), dict(sx=215, y0=50, y1=1358, gx=477, ctrl=(512, 274), taper=(30, 12), grip=(459, 650, 495, 758), nocks=12)),
    "long-battle-bow": (bow, (704, 1408), dict(form="b", sx=200, y0=50, y1=1358, gx=285, taper=(40, 16), grip=(256, 640, 316, 768),
                                               humps=[(160, 140), (282, 360), (246, 560), (120, 660)])),
    "long-war-bow": (bow, (704, 1408), dict(form="riser", sx=215, y0=50, y1=1358, gx=455, taper=(34, 14), riser=(425, 485, 327, 16),
                                            grip=(427, 712, 483, 790))),
    "stag-bow": (bow, (704, 1408), dict(sx=225, y0=130, y1=1278, gx=473, ctrl=(505, 300), taper=(28, 12), grip=(455, 650, 491, 758),
                                        nocks=0, tips="fork", feathers=True)),
    "reflex-bow": (bow, (704, 1408), dict(sx=140, y0=96, y1=1312, gx=550, ctrl=(605, 304), taper=(34, 18), grip=(532, 650, 570, 758),
                                          nocks=0, tips="hook")),
    # crossbows
    "crossbow": (crossbow, (832, 1248)),
    "light-crossbow": (crossbow, (832, 1248), dict(tiller=(18, 11, 110, 1196), prod=(40, 180, 0, 220, 0), curl=True, stirrup=None,
                                                   nut=(520, 22), lever=((18, 800), (30, 980), 10), lash=True)),
    "heavy-crossbow": (crossbow, (704, 1408), dict(cx=352, tiller=(64, 64, 250, 1376), prod=(80, 330, 250, 386, 306), string_ends=88,
                                                   stirrup=(92, 40, 270, 28), nut=(660, 30), lever=None, bands=(520, 860),
                                                   crank=(720, 1150, 1290, (240, 90)), lash=True)),
    "repeating-crossbow": (crossbow, (832, 1248), dict(tiller=(32, 32, 120, 1196), prod=(130, 190, 120, 216, 152), string_ends=136,
                                                       stirrup=None, box=(46, 330, 790, 16), lever=((52, 770), (70, 1160), 18))),
    # armour
    "great-helm": (great_helm, (1024, 1024)),
    "jawbone-cap": (jaw_cap, (1024, 1024)),
    "gothic-shield": (lancet_shield, (704, 1408)),
    "soft-boots": (boots, (1024, 1024)),
    "heavy-boots": (boots, (1024, 1024), dict(top=40, cuff=False, thongs=0, sole=34, toe_cap=True, toggles=True)),
    "chain-boots": (boots, (1024, 1024), dict(top=40, cuff=False, thongs=0, mail=True)),
    "plated-boots": (boots, (1024, 1024), dict(top=40, cuff=False, thongs=0, toe_cap=True, plate=True)),
    "greaves": (boots, (1024, 1024), dict(greave=True)),
    # small things
    "tau-token": (tau, (768, 768)),
    "scroll": (scroll, (1024, 1024)),
}


def render(name):
    """the guide on its own design canvas"""
    fn, (dw, dh), *kw = GUIDES[name]
    im = Image.new("RGB", (dw * SS, dh * SS), BG)
    fn(ImageDraw.Draw(im), dw, dh, **(kw[0] if kw else {}))
    return im.resize((dw, dh), Image.LANCZOS)


def draw(name, W, H, out):
    im = render(name)
    dw, dh = im.size
    if (dw, dh) != (W, H):
        s = min(W / dw, H / dh)
        im = im.resize((round(dw * s), round(dh * s)), Image.LANCZOS)
        c = Image.new("RGB", (W, H), BG)
        c.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
        im = c
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out)
    return out


def sheet(out, names, row=360, per=10):
    """the guides side by side at one height, each with its name under it, for checking by eye"""
    ims = [(n, render(n)) for n in names]
    ims = [(n, im.resize((round(im.width * row / im.height), row), Image.LANCZOS)) for n, im in ims]
    pad = 16
    rows = [ims[i:i + per] for i in range(0, len(ims), per)]
    width = max(sum(im.width + pad for _, im in r) for r in rows) + pad
    c = Image.new("RGB", (width, len(rows) * (row + 40) + pad), (120, 120, 120))
    dc = ImageDraw.Draw(c)
    for j, r in enumerate(rows):
        x = pad
        for n, im in r:
            c.paste(im, (x, pad + j * (row + 40)))
            dc.text((x, pad + j * (row + 40) + row + 6), n, fill=(255, 255, 255))
            x += im.width + pad
    c.save(out)
    return out


if __name__ == "__main__":
    a = sys.argv[1:]
    if a == ["--list"]:
        for k, (_, c, *_) in GUIDES.items():
            print(k, f"{c[0]}x{c[1]}")
    elif a[:1] == ["--all"]:
        for k, (_, (w, h), *_) in GUIDES.items():
            print(draw(k, w, h, os.path.join(a[1], f"{k}_{w}x{h}.png")))
    elif a[:1] == ["--sheet"]:
        print(sheet(a[1], a[2:] or list(GUIDES)))
    else:
        out, name, W, H = a[0], a[1], int(a[2]), int(a[3])
        print(draw(name, W, H, out))
