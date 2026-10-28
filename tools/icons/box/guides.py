"""Shape guides: flat grey shapes we draw ourselves with PIL polygons (no model, no traced outline),
given to klein as the reference image where words alone get an object's shape wrong.

usage: python -I guides.py OUT.png NAME WIDTH HEIGHT      one guide on a generation canvas
       python -I guides.py --list                         the guides' names and design canvases

A guide is a light grey ground with the object as a flat dark grey shape and its key inner lines
(slits, a string, a ridge) lighter or darker. Each is designed on its own canvas; on another canvas
it is scaled to fit and centred on the same ground. These are generic parametric shapes of a kind of
object (a halberd's lopsided head, a bow's D), never measured from any picture.
In the samples the mace's guide drew a spear point for a head and wasn't used: it is not kept.
"""
import os, sys
from PIL import Image, ImageDraw

BG = (200, 200, 200)
OBJ = (70, 70, 70)
DARK = (25, 25, 25)
LIGHT = (150, 150, 150)
SS = 2  # supersampled, then reduced


def P(pts):
    return [(x * SS, y * SS) for x, y in pts]


def bez(p0, p1, p2, n=24):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]


def halberd(d, W, H):
    cx = 340
    d.rectangle(P([(cx - 13, 300), (cx + 13, 1385)]), fill=OBJ)            # shaft
    d.rectangle(P([(cx - 16, 1330), (cx + 16, 1390)]), fill=OBJ)           # butt cap
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


def crossbow(d, W, H):
    cx = 416
    d.rectangle(P([(cx - 32, 200), (cx + 32, 1190)]), fill=OBJ)            # straight narrow tiller, square butt
    prod_top = bez((70, 300), (cx, 210), (W - 70, 300))                    # a short thick prod across the front
    prod_bot = bez((W - 70, 330), (cx, 250), (70, 330))
    d.polygon(P(prod_top + prod_bot), fill=OBJ)
    d.ellipse(P([(cx - 60, 70), (cx + 60, 230)]), outline=OBJ, width=22 * SS)  # stirrup at the very front
    nut = (cx, 560)                                                        # the string drawn back to a nut: a V
    d.line(P([(76, 318), nut]), fill=LIGHT, width=6 * SS)
    d.line(P([(W - 76, 318), nut]), fill=LIGHT, width=6 * SS)
    d.ellipse(P([(nut[0] - 22, nut[1] - 22), (nut[0] + 22, nut[1] + 22)]), fill=DARK)
    d.line(P([(cx + 34, 720), (cx + 58, 1080)]), fill=DARK, width=12 * SS)  # a long thin lever along the rear half


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


def gladius(d, W, H):
    d.polygon(P([(256, 160), (322, 300), (322, 1000), (190, 1000), (190, 300)]), fill=OBJ)  # short wide straight blade
    d.line(P([(256, 200), (256, 990)]), fill=LIGHT, width=6 * SS)            # central ridge
    d.ellipse(P([(150, 990), (362, 1080)]), fill=OBJ)                      # a rounded disc guard, no cross-guard
    d.rectangle(P([(222, 1070), (290, 1330)]), fill=OBJ)                    # ribbed grip
    for y in range(1100, 1330, 38):
        d.line(P([(222, y), (290, y)]), fill=LIGHT, width=4 * SS)
    d.ellipse(P([(176, 1320), (336, 1470)]), fill=OBJ)                     # a large round pommel


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


def spear(d, W, H):
    cx = 352
    # a willow-leaf head, widest a third of the way up, smooth convex edges, no barbs
    right = bez((cx, 40), (cx + 70, 200), (cx + 52, 330)) + bez((cx + 52, 330), (cx + 36, 380), (cx + 14, 400))
    left = [(2 * cx - x, y) for x, y in reversed(right)]
    d.polygon(P(right + left), fill=OBJ)
    d.line(P([(cx, 60), (cx, 390)]), fill=LIGHT, width=5 * SS)                       # mid ridge
    d.rectangle(P([(cx - 15, 395), (cx + 15, 480)]), fill=OBJ)                       # socket
    d.rectangle(P([(cx - 11, 470), (cx + 11, 1380)]), fill=OBJ)                      # shaft
    d.rectangle(P([(cx - 14, 840), (cx + 14, 960)]), fill=DARK)                      # grip wrap
    d.rectangle(P([(cx - 14, 1340), (cx + 14, 1390)]), fill=OBJ)                     # butt cap


def short_bow(d, W, H):
    # two mirrored limbs round a grip exactly at the middle and a straight pale string: a D
    top = bez((300, 70), (640, 260), (600, 624))
    bot = bez((600, 624), (640, 988), (300, 1178))
    d.line(P(top + bot), fill=OBJ, width=34 * SS, joint="curve")
    d.rounded_rectangle(P([(575, 560), (640, 690)]), radius=10 * SS, fill=DARK)  # grip
    d.line(P([(300, 70), (300, 1178)]), fill=LIGHT, width=8 * SS)               # string
    for y in (70, 1178):
        d.ellipse(P([(286, y - 16), (316, y + 16)]), fill=(120, 110, 90))     # nocks


def soft_boots(d, W, H):
    # a pair of soft knee-high boots side by side, toes right: turned-down cuffs, thin flat soles, no heel
    for ox, oy in ((150, 120), (545, 150)):
        toe = bez((ox + 150, oy + 630), (ox + 290, oy + 610), (ox + 305, oy + 735))
        d.polygon(P([(ox + 10, oy + 90), (ox + 160, oy + 90)] + toe + [(ox + 0, oy + 735), (ox + 5, oy + 640)]), fill=OBJ)
        d.polygon(P([(ox - 12, oy + 10), (ox + 182, oy + 10), (ox + 172, oy + 120), (ox - 2, oy + 120)]), fill=OBJ)  # cuff
        d.line(P([(ox - 2, oy + 120), (ox + 172, oy + 120)]), fill=DARK, width=5 * SS)
        d.line(P([(ox + 0, oy + 735), (ox + 300, oy + 735)]), fill=DARK, width=8 * SS)                           # sole
        for k in range(4):                                                                                      # thongs
            y = oy + 200 + k * 90
            d.line(P([(ox + 8, y + 40), (ox + 158, y)]), fill=LIGHT, width=6 * SS)


# name: (drawing, its design canvas)
GUIDES = {
    "halberd": (halberd, (704, 1408)),
    "crossbow": (crossbow, (832, 1248)),
    "falcata": (falcata, (512, 1536)),
    "gladius": (gladius, (512, 1536)),
    "great-helm": (great_helm, (1024, 1024)),
    "spear": (spear, (704, 1408)),
    "short-bow": (short_bow, (832, 1248)),
    "soft-boots": (soft_boots, (1024, 1024)),
}


def draw(name, W, H, out):
    fn, (dw, dh) = GUIDES[name]
    im = Image.new("RGB", (dw * SS, dh * SS), BG)
    fn(ImageDraw.Draw(im), dw, dh)
    im = im.resize((dw, dh), Image.LANCZOS)
    if (dw, dh) != (W, H):
        s = min(W / dw, H / dh)
        im = im.resize((round(dw * s), round(dh * s)), Image.LANCZOS)
        c = Image.new("RGB", (W, H), BG)
        c.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
        im = c
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out)
    return out


if __name__ == "__main__":
    if sys.argv[1:] == ["--list"]:
        for k, (_, c) in GUIDES.items():
            print(k, f"{c[0]}x{c[1]}")
    else:
        out, name, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
        print(draw(name, W, H, out))
