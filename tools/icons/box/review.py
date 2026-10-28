"""Candidate review sheets of a run (numpy + PIL, no model): every seed of every picture side by side.

usage: python -I review.py RUN_DIR [--per 20] [--out DIR]

Writes RUN_DIR/sheets/<group>_NN.png (<group>_r<n>_NN.png, headed with the round, when jobs.json says the run is
for review round n: ai-icons.mjs --review): a group's pictures in the order jobs.json lists them (the
pictures list's: a family stays together), split evenly into sheets of at most --per (20 gives 12-20
a sheet for every group of 12 or more, but 21-23). A row is one picture: its id, the bases it serves,
its cells and kind, and its reference image under them (the shape guide, or a unique's base picture);
then each seed: the seed and the cut's flags (red when one is up: EDGE touches the canvas border,
P<n> separate pieces, SH<f> a cast shadow's share), and under them the candidate at 4x (export.py's
preview, 136 px a cell), 2x and 1x (the game's two files), each on the game's inventory grid
(src/style.css .grid: #070605, 1 px lines of rgba(90,74,52,.35) every cell, a #4a3c2a border).

build() takes two hooks, for a sheet made elsewhere from the same run's files: beside(pid, job) gives
an image (or None) for a column after the label, and note(job) a (text, colour) line under a seed.
"""
import argparse, json, math, os
from collections import OrderedDict
from PIL import Image, ImageDraw, ImageFont

GROUPS = ["blades", "long", "ranged", "body", "heads", "misc"]
BG = (7, 6, 5)
LINE = (36, 30, 21)  # rgba(90,74,52,.35) over #070605
EDGE = (74, 60, 42)
PANEL = (22, 18, 13)
INK, DIM, FAINT, WARN = (220, 200, 150), (190, 180, 160), (150, 140, 120), (255, 120, 100)
CELL = 34       # src/ui/icons.ts CELL: an inventory cell in CSS px
SCALES = (4, 2, 1)
LABEL_W = 230
GAP, COL_GAP, HEAD = 8, 22, 20
TITLE = 34      # the band over a sheet that names its run and review round


def font(px):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try:
            return ImageFont.truetype(f, px)
        except OSError:
            pass
    try:
        return ImageFont.load_default(px)
    except TypeError:  # Pillow before 10.1: one size only
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


def wrap(d, text, f, width):
    """Words onto lines no wider than width."""
    lines, cur = [], ""
    for w in text.split(" "):
        t = (cur + " " + w).strip()
        if cur and d.textlength(t, font=f) > width:
            lines.append(cur)
            cur = w
        else:
            cur = t
    return lines + [cur] if cur else lines


def ref_image(run, j0):
    """The row's reference image: the job's last ref, or the same file name in this run's guides/ (a
    sheet made off box, from pulled files)."""
    for p in reversed(j0.get("ref") or []):
        for q in (p, os.path.join(run, "guides", os.path.basename(p))):
            if os.path.exists(q):
                return q
    return None


def block_w(w):
    return sum(w * CELL * s + 2 for s in SCALES) + GAP * (len(SCALES) - 1)


def chunks(rows, per):
    """rows split evenly into the fewest sheets of at most per."""
    n = max(1, math.ceil(len(rows) / per))
    k, r = divmod(len(rows), n)
    out, i = [], 0
    for s in range(n):
        m = k + (1 if s < r else 0)
        out.append(rows[i:i + m])
        i += m
    return out


def candidate(run, j):
    """The candidate's sidecar and files at each scale (no preview in a run exported before it), or None."""
    side = os.path.join(run, "cand", j["id"] + ".json")
    if not os.path.exists(side):
        return None, None
    st = json.load(open(side))
    files = {s: os.path.join(run, "cand", st["files"][f"{s}x"]["file"]) for s in (2, 1)}
    pv = (st.get("preview") or {}).get("file")
    files[4] = os.path.join(run, "cand", pv) if pv else None
    return st, files


def build(run, out_dir, per=20, beside=None, note=None, beside_title="", prefix=""):
    spec = json.load(open(os.path.join(run, "jobs.json")))
    rnd = spec.get("review")
    os.makedirs(out_dir, exist_ok=True)
    pics = OrderedDict()
    for j in spec["jobs"]:
        pics.setdefault(j["picture"], []).append(j)
    by_group = OrderedDict((g, []) for g in GROUPS)
    for pid, js in pics.items():
        by_group.setdefault(js[0]["group"], []).append((pid, sorted(js, key=lambda j: j["seed"])))
    f18, f15, f12 = font(18), font(15), font(12)
    measure = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    made = []
    for g, rows in by_group.items():
        for k, chunk in enumerate(chunks(rows, per) if rows else []):
            col = max(block_w(js[0]["w"]) for _, js in chunk) + COL_GAP
            ncol = max(len(js) for _, js in chunk)
            side_imgs = {pid: beside(pid, js[0]) for pid, js in chunk} if beside else {}
            side_w = max([im.width for im in side_imgs.values() if im is not None] + [0])
            side_w = side_w + COL_GAP if side_w else 0
            head = HEAD + (16 if note else 0)
            heights = []
            for pid, js in chunk:
                j0 = js[0]
                serves = wrap(measure, " / ".join(j0.get("serves") or [j0.get("label") or ""]), f12, LABEL_W - 16)
                lab_h = 24 + 16 * len(serves) + 16 + (16 if j0.get("guide") else 0) + (80 if ref_image(run, j0) else 0)
                sh = side_imgs[pid].height + HEAD if side_imgs.get(pid) is not None else 0
                heights.append((serves, max(lab_h, head + j0["h"] * CELL * SCALES[0] + 2, sh) + 18))
            top = TITLE if rnd else 0
            sheet = Image.new("RGB", (LABEL_W + side_w + ncol * col, top + sum(h for _, h in heights) + 10), PANEL)
            d = ImageDraw.Draw(sheet)
            if rnd:
                d.text((8, 8), f"REVIEW ROUND {rnd}   {os.path.basename(os.path.abspath(run))}   {g} {k + 1}", fill=INK, font=f18)
                d.line([(0, TITLE - 4), (sheet.width, TITLE - 4)], fill=EDGE, width=2)
            y = top + 10
            for (pid, js), (serves, rh) in zip(chunk, heights):
                j0 = js[0]
                d.text((8, y + 2), pid, fill=INK, font=f15)
                ty = y + 24
                for line in serves:
                    d.text((8, ty), line, fill=DIM, font=f12)
                    ty += 16
                d.text((8, ty), f"{j0['w']}x{j0['h']} {j0['kind']}", fill=FAINT, font=f12)
                ty += 16
                if j0.get("guide"):
                    d.text((8, ty), f"guide {j0['guide']}", fill=FAINT, font=f12)
                    ty += 16
                ref = ref_image(run, j0)
                if ref:
                    sheet.paste(thumb(ref, LABEL_W - 30, max(60, y + rh - 18 - ty - 4)), (8, ty + 4))
                x = LABEL_W
                if side_w:
                    d.text((x, y), beside_title, fill=FAINT, font=f12)
                    if side_imgs.get(pid) is not None:
                        sheet.paste(side_imgs[pid], (x, y + HEAD))
                    x += side_w
                for j in js:
                    st, files = candidate(run, j)
                    lab = f"s{j['seed']}"
                    if st is None:
                        d.text((x, y), lab + " (not made)", fill=FAINT, font=f12)
                        x += col
                        continue
                    fl, bad = flags(st["cut"])
                    d.text((x, y), lab + fl, fill=WARN if bad else (200, 200, 200), font=f12)
                    if note:
                        text, colour = note(j)
                        d.text((x, y + 16), text, fill=colour, font=f12)
                    ox = x
                    for s in SCALES:
                        gimg = grid(j["w"], j["h"], CELL * s)
                        ic = Image.open(files[s] or files[2]).convert("RGBA")  # no preview: the 2x file blown up
                        if ic.size != (j["w"] * CELL * s, j["h"] * CELL * s):
                            ic = ic.resize((j["w"] * CELL * s, j["h"] * CELL * s), Image.LANCZOS)
                        gimg.paste(ic, (1, 1), ic)
                        sheet.paste(gimg, (ox, y + head))
                        ox += gimg.width + GAP
                    x += col
                y += rh
            p = os.path.join(out_dir, f"{prefix}{g}{f'_r{rnd}' if rnd else ''}_{k + 1:02d}.png")
            sheet.save(p, optimize=True)
            made.append((p, len(chunk)))
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--per", type=int, default=20)
    ap.add_argument("--out")
    a = ap.parse_args()
    made = build(a.run, a.out or os.path.join(a.run, "sheets"), a.per)
    print(f"[review] {len(made)} sheets ({', '.join(str(n) for _, n in made)} pictures)", flush=True)


if __name__ == "__main__":
    main()
