"""Grade every cut-out of a run and export it as the game's picture files (numpy + PIL, no model).

usage: python -I export.py RUN_DIR [--force] [--procs 8]

For each job in RUN_DIR/jobs.json whose cut-out RUN_DIR/cut/<id>.png exists, writes to RUN_DIR/cand/:
  <id>.webp     2x: exactly w*68 x h*68 px, the size the game's cells are on a high-density screen
  <id>.1x.webp  1x: w*34 x h*34 px with the light unsharp mask, for a 1:1 screen (a browser's own
                downscale of the 2x file is softer than Lanczos plus the mask)
  <id>.4x.webp  4x (136 px a cell), unsharpened: only for the review sheets (review.py), never a game file
  <id>.json     the job, the generation's timing, the cut's flags and the grade's numbers
WebP with alpha, lossy colour at the run's quality, lossless alpha. Existing files are kept unless --force.
"""
import argparse, json, os, sys
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image  # noqa: E402
from grade import CSS_CELL, grade, game_icon  # noqa: E402

KEEP_GEN = ("seconds", "peak_vram_gb", "gpu", "repo", "license", "steps", "guidance", "time", "diffusers", "torch")
PREVIEW = 4  # the review sheets' large view: 136 px a cell
KEEP_CUT = ("matte", "matte_license", "bg", "fill", "touches_edge", "parts", "shadow", "shadow_frac", "unshadowed")


def one(args):
    run, j, settings, force = args
    out = os.path.join(run, "cand", j["id"])
    if not force and os.path.exists(out + ".json"):
        return j["id"], "kept"
    cut = os.path.join(run, "cut", j["id"] + ".png")
    gst = json.load(open(os.path.join(run, "gen", j["id"] + ".json")))
    cst = json.load(open(cut[:-4] + ".json"))
    st = {}
    g = grade(Image.open(cut).convert("RGBA"), settings["grade"]["sat"], st)
    q = settings["export"]["webpQuality"]
    files = {}
    for scale in settings["export"]["scales"]:
        ic = game_icon(g, j["w"], j["h"], scale, j.get("fill", 1))
        assert ic.size == (j["w"] * CSS_CELL * scale, j["h"] * CSS_CELL * scale), (j["id"], ic.size)
        name = j["id"] + (".webp" if scale == 2 else f".{scale}x.webp")
        ic.save(os.path.join(run, "cand", name + ".tmp"), "WEBP", quality=q, method=6, alpha_quality=100)
        os.replace(os.path.join(run, "cand", name + ".tmp"), os.path.join(run, "cand", name))
        files[f"{scale}x"] = dict(file=name, size=list(ic.size))
    # the review's large view, from the same graded cut-out (a 2x file blown up would hide the detail)
    pv = game_icon(g, j["w"], j["h"], PREVIEW, j.get("fill", 1))
    pname = j["id"] + f".{PREVIEW}x.webp"
    pv.save(os.path.join(run, "cand", pname + ".tmp"), "WEBP", quality=q, method=6, alpha_quality=100)
    os.replace(os.path.join(run, "cand", pname + ".tmp"), os.path.join(run, "cand", pname))
    side = dict(job=j, gen={k: gst.get(k) for k in KEEP_GEN}, cut={k: cst.get(k) for k in KEEP_CUT}, grade=st, files=files,
                preview=dict(file=pname, size=list(pv.size)))
    with open(out + ".json", "w") as f:  # the sidecar last: its presence means this candidate is done
        json.dump(side, f, ensure_ascii=False, indent=1)
    return j["id"], "made"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--procs", type=int, default=8)
    a = ap.parse_args()
    spec = json.load(open(os.path.join(a.run, "jobs.json")))
    os.makedirs(os.path.join(a.run, "cand"), exist_ok=True)
    jobs = [j for j in spec["jobs"] if os.path.exists(os.path.join(a.run, "cut", j["id"] + ".png"))]
    settings = dict(grade=spec["grade"], export=spec["export"])
    with Pool(a.procs) as pool:
        res = pool.map(one, [(a.run, j, settings, a.force) for j in jobs])
    made = sum(1 for _, s in res if s == "made")
    print(f"[export] {made} made, {len(res) - made} kept, {len(spec['jobs']) - len(jobs)} without a cut-out", flush=True)


if __name__ == "__main__":
    main()
