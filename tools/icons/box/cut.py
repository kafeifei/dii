"""Cut painted pictures out of their plain grey backdrop into tight RGBA (box only: BiRefNet on a GPU).

usage: CUDA_VISIBLE_DEVICES=0 python -I cut.py IN [IN ...] --out DIR [--list FILE] [--force] [--unshadow]

IN is a PNG or a folder of PNGs; --list names a file of PNG paths, one per line (run.py's shards).
For every image it writes DIR/<name>.png (RGBA at the generation resolution, trimmed to the object
with a 2 px border) and DIR/<name>.json (the measured backdrop and the flags review.py shows).

- Matting: ZhengPeng7/BiRefNet (MIT) at 1024 px, fp16. The soft mask is tightened with a smoothstep
  between --lo and --hi (soft but tight, no grey halo); edge pixels are then colour-decontaminated
  against the backdrop colour measured in the image's border.
- Thin parts are kept: specks are dropped by size, but weak (> --weak) thin pixels that a 5 px opening
  would remove (a bowstring, a flail's chain) are added back when they touch a kept piece; broad weak
  areas (haze, a shadow) are not.
- Cast-shadow check: inside the mask, low-chroma pixels (max-min < 10) at 0.35-0.9 of the backdrop's
  luminance in the object's lower third, in regions reaching its lower or right outline; over 1.5 % of
  the object's area the image is flagged 'shadow' (grey steel can look the same: 0.02-0.07 false
  alarms on a spear butt and a circlet, so it only steers the pick). --unshadow also clears it.
Flags: 'touches_edge' (the object reaches the canvas border: a cropped tip is likely), 'parts' (separate
large pieces: more than one can mean an extra object), 'shadow'.
"""
import argparse, glob, json, os, time

os.environ.setdefault("HF_HUB_OFFLINE", "1")  # the Hub check alone stalled the first load ~9 min

import numpy as np
from PIL import Image
from scipy import ndimage

REPO, RES = "ZhengPeng7/BiRefNet", 1024


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def shadow_check(rgb, alpha, bg):
    """(fraction of the object's area, mask) of a likely cast shadow under the object."""
    obj = alpha > 0.5
    if obj.sum() == 0:
        return 0.0, np.zeros_like(obj)
    ys, _ = np.where(obj)
    y0, y1 = ys.min(), ys.max()
    lum = rgb @ np.array([0.299, 0.587, 0.114])
    bgl = float(np.dot(bg, [0.299, 0.587, 0.114]))
    chroma = rgb.max(-1) - rgb.min(-1)
    cand = obj & (chroma < 10) & (lum > 0.35 * bgl) & (lum < 0.9 * bgl)
    cand[: int(y0 + (y1 - y0) * 2 / 3)] = False
    if not cand.any():
        return 0.0, cand
    # the object's lower and right outline: object pixels with backdrop within 4 px below or to the right
    outside = ~obj
    below = np.zeros_like(obj)
    for k in range(1, 5):
        below[:-k] |= outside[k:]
        below[:, :-k] |= outside[:, k:]
    lab, _ = ndimage.label(cand)
    hit = np.unique(lab[cand & below])
    sh = np.isin(lab, hit[hit > 0])
    return float(sh.sum() / obj.sum()), sh


def matte(pred, rgb, a):
    """The alpha from BiRefNet's soft prediction, the backdrop colour and the part count."""
    H, W = pred.shape
    ring = np.zeros((H, W), bool)
    r = 8
    ring[:r] = ring[-r:] = True
    ring[:, :r] = ring[:, -r:] = True
    bgm = ring & (pred < 0.05)
    bg = np.median(rgb[bgm if bgm.sum() > 100 else ring], axis=0)

    # strong pieces: drop specks, count separate large parts
    lab, n = ndimage.label(pred > 0.5)
    parts, keep = 0, np.zeros((H, W), bool)
    if n:
        sizes = ndimage.sum(np.ones_like(pred), lab, index=np.arange(1, n + 1))
        big = sizes.max()
        for i, s in enumerate(sizes, 1):
            if s >= 0.004 * big:
                keep |= lab == i
            if s >= 0.03 * big:
                parts += 1
    weak = pred > a.weak
    yy, xx = np.mgrid[-5:6, -5:6]
    thin = weak & ~ndimage.binary_opening(weak, structure=(yy * yy + xx * xx) <= 25)
    clab, cn = ndimage.label(keep | thin)
    if cn:
        ids = np.unique(clab[keep])
        keep = np.isin(clab, ids[ids > 0])
    keep = ndimage.binary_dilation(keep, iterations=4)
    return smoothstep((pred - a.lo) / (a.hi - a.lo)) * keep, bg, parts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="*")
    ap.add_argument("--list", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--lo", type=float, default=0.12)
    ap.add_argument("--hi", type=float, default=0.80)
    ap.add_argument("--weak", type=float, default=0.15)
    ap.add_argument("--shadow-limit", type=float, default=0.015)
    ap.add_argument("--unshadow", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()

    files = []
    for p in a.inputs:
        files += sorted(glob.glob(os.path.join(p, "*.png"))) if os.path.isdir(p) else [p]
    if a.list:
        files += [l.strip() for l in open(a.list) if l.strip()]
    os.makedirs(a.out, exist_ok=True)
    todo = [f for f in files if a.force or not os.path.exists(os.path.join(a.out, os.path.basename(f)))]
    print(f"[cut] {len(files)} images, {len(todo)} to do", flush=True)
    if not todo:
        return

    import torch
    import torch.nn.functional as F
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    torch.set_float32_matmul_precision("high")
    net = AutoModelForImageSegmentation.from_pretrained(REPO, trust_remote_code=True).to("cuda").eval().half()
    tf = transforms.Compose([transforms.Resize((RES, RES)), transforms.ToTensor(),
                             transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    times = []
    for f in todo:
        name = os.path.basename(f)
        img = Image.open(f).convert("RGB")
        W, H = img.size
        torch.cuda.synchronize(); t = time.time()
        with torch.no_grad():
            pred = net(tf(img).unsqueeze(0).to("cuda").half())[-1].sigmoid().float()
            pred = F.interpolate(pred, size=(H, W), mode="bilinear", align_corners=False)[0, 0].cpu().numpy()
        torch.cuda.synchronize(); times.append(time.time() - t)

        rgb = np.asarray(img).astype(np.float32)
        alpha, bg, parts = matte(pred, rgb, a)
        edge = (alpha > 0) & (alpha < 0.98)
        ae = np.maximum(alpha, 0.35)[..., None]
        fg = np.clip((rgb - (1 - alpha[..., None]) * bg) / ae, 0, 255)
        out = np.where(edge[..., None], fg, rgb)

        sh_frac, sh_mask = shadow_check(rgb, alpha, bg)
        shadow = sh_frac > a.shadow_limit
        if shadow and a.unshadow:
            alpha = np.where(ndimage.binary_dilation(sh_mask, iterations=2), 0.0, alpha)

        m = 3
        touches = bool((alpha[:m] > 0.5).any() or (alpha[-m:] > 0.5).any() or (alpha[:, :m] > 0.5).any() or (alpha[:, -m:] > 0.5).any())
        ys, xs = np.where(alpha > 0.03)
        if len(xs) == 0:
            print(f"[cut] {name}: empty mask", flush=True)
            continue
        x0, x1 = max(0, xs.min() - 2), min(W, xs.max() + 3)
        y0, y1 = max(0, ys.min() - 2), min(H, ys.max() + 3)
        rgba = np.dstack([out, alpha * 255]).round().astype(np.uint8)[y0:y1, x0:x1]
        stats = dict(src=f, matte=REPO, matte_license="MIT", lo=a.lo, hi=a.hi, weak=a.weak, bg=[round(float(v)) for v in bg],
                     bbox=[int(x0), int(y0), int(x1), int(y1)], canvas=[W, H],
                     fill=[round((x1 - x0) / W, 3), round((y1 - y0) / H, 3)],
                     touches_edge=touches, parts=parts, shadow=bool(shadow), shadow_frac=round(sh_frac, 4),
                     unshadowed=bool(shadow and a.unshadow), seconds=round(times[-1], 3))
        with open(os.path.join(a.out, name[:-4] + ".json"), "w") as fh:
            json.dump(stats, fh, indent=1)
        tmp = os.path.join(a.out, name[:-4] + ".tmp.png")
        Image.fromarray(rgba, "RGBA").save(tmp)
        os.replace(tmp, os.path.join(a.out, name))
        flag = (" EDGE" if touches else "") + (f" PARTS={parts}" if parts > 1 else "") + (f" SHADOW={sh_frac:.3f}" if shadow else "")
        print(f"[cut] {name} {times[-1]:.2f}s{flag}", flush=True)
    if len(times) > 1:
        print(f"[cut] mean {np.mean(times[1:]):.3f}s/img, peak VRAM {torch.cuda.max_memory_allocated() / 1e9:.1f} GB", flush=True)


if __name__ == "__main__":
    main()
