"""Candidate review sheets of a run (numpy + PIL, no model): every seed of every picture side by side.

usage: python -I review.py RUN_DIR [--per 6]

Writes RUN_DIR/sheets/<group>_NN.png. A row is one picture: its id, base name, cells and kind, with
its shape guide or base picture (the reference image) under them; then each seed's raw generation,
the exported 2x and 1x files on the game's inventory grid (src/style.css .grid: #070605, 1 px lines
of rgba(90,74,52,.35) every cell, a #4a3c2a border), and the seed with the cut's flags, red when one
is up (EDGE: touches the canvas border, P<n>: separate pieces, SH<f>: a cast shadow's share).
"""
import argparse, json, os
from collections import defaultdict
from PIL import Image, ImageDraw, ImageFont

GROUPS = ["blades", "long", "ranged", "body", "heads", "misc"]
BG = (7, 6, 5)
LINE = (36, 30, 21)  # rgba(90,74,52,.35) over #070605
EDGE = (74, 60, 42)
PANEL = (22, 18, 13)
RAW_W, RAW_H = 150, 230
LABEL_W = 170


def font(px):
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", px)
    except OSError:
        return ImageFont.load_default()


def grid(w, h, cell):
    g = Image.new("RGB", (w * cell + 2, h * cell + 2), BG)
    d = ImageDraw.Draw(g)
    for i in range(1, w):
        d.line([(1 + i * cell, 1), (1 + i * cell, h * cell)], fill=LINE)
    for j in range(1, h):
        d.line([(1, 1 + j * cell), (w * cell, 1 + j * cell)], fill=LINE)
    d.rectangle([0, 0, w * cell + 1, h * cell + 1], outline=EDGE)
    return g


def thumb(path, bw, bh):
    im = Image.open(path).convert("RGB")
    s = min(bw / im.width, bh / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def flags(cut):
    lab, bad = "", False
    if cut.get("touches_edge"):
        lab += " EDGE"; bad = True
    if (cut.get("parts") or 1) > 1:
        lab += f" P{cut['parts']}"; bad = True
    if cut.get("shadow"):
        lab += f" SH{cut['shadow_frac']:.2f}"; bad = True
    return lab, bad


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--per", type=int, default=6)
    a = ap.parse_args()
    spec = json.load(open(os.path.join(a.run, "jobs.json")))
    os.makedirs(os.path.join(a.run, "sheets"), exist_ok=True)
    pics = defaultdict(list)
    for j in spec["jobs"]:
        pics[j["picture"]].append(j)
    by_group = defaultdict(list)
    for pid, js in pics.items():
        by_group[js[0]["group"]].append((pid, sorted(js, key=lambda j: j["seed"])))
    f14, f12 = font(14), font(12)
    made = []
    for g in sorted(by_group, key=lambda g: GROUPS.index(g) if g in GROUPS else 99):
        rows = sorted(by_group[g])
        for k in range(0, len(rows), a.per):
            chunk = rows[k:k + a.per]
            col = max(RAW_W + 8 + js[0]["w"] * 68 + 10 + js[0]["w"] * 34 + 22 for _, js in chunk)
            ncol = max(len(js) for _, js in chunk)
            Wd = LABEL_W + ncol * col
            Hd = sum(max(RAW_H, js[0]["h"] * 68) + 34 for _, js in chunk) + 10
            sheet = Image.new("RGB", (Wd, Hd), PANEL)
            d = ImageDraw.Draw(sheet)
            y = 10
            for pid, js in chunk:
                j0 = js[0]
                rh = max(RAW_H, j0["h"] * 68)
                d.text((8, y + 2), pid, fill=(220, 200, 150), font=f14)
                d.text((8, y + 20), (j0.get("label") or "")[:22], fill=(190, 180, 160), font=f12)
                d.text((8, y + 36), f"{j0['w']}x{j0['h']} {j0['kind']}", fill=(150, 140, 120), font=f12)
                refs = j0.get("ref") or []
                if refs and os.path.exists(refs[-1]):
                    sheet.paste(thumb(refs[-1], LABEL_W - 30, rh - 70), (8, y + 56))
                x = LABEL_W
                for j in js:
                    side = os.path.join(a.run, "cand", j["id"] + ".json")
                    raw = os.path.join(a.run, "gen", j["id"] + ".png")
                    lab = f"s{j['seed']}"
                    if not os.path.exists(side):
                        d.text((x, y), lab + " (not made)", fill=(140, 130, 120), font=f12)
                        x += col
                        continue
                    st = json.load(open(side))
                    fl, bad = flags(st["cut"])
                    d.text((x, y), lab + fl, fill=(255, 120, 100) if bad else (200, 200, 200), font=f12)
                    sheet.paste(thumb(raw, RAW_W, rh), (x, y + 18))
                    ox = x + RAW_W + 8
                    for scale in (2, 1):
                        cell = 34 * scale
                        gimg = grid(j["w"], j["h"], cell)
                        ic = Image.open(os.path.join(a.run, "cand", st["files"][f"{scale}x"]["file"])).convert("RGBA")
                        gimg.paste(ic, (1, 1), ic)
                        sheet.paste(gimg, (ox, y + 18))
                        ox += j["w"] * cell + 10
                    x += col
                y += rh + 34
            p = os.path.join(a.run, "sheets", f"{g}_{k // a.per + 1:02d}.png")
            sheet.save(p)
            made.append(p)
    print(f"[review] {len(made)} sheets", flush=True)


if __name__ == "__main__":
    main()
