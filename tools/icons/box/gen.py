"""Paint item pictures with FLUX.2 klein 4B from a job list (box only: one process per GPU).

usage: CUDA_VISIBLE_DEVICES=0 python -I gen.py JOBS.json --out DIR [--force]

JOBS.json is {"model": {...}, "jobs": [...]} (run.py writes one per GPU). A job:
  {"id": "inv2ax_s101", "prompt": "...", "width": 832, "height": 1248, "seed": 101,
   "steps": 4, "guidance": 1.0,          # optional, the model's otherwise
   "ref": ["/abs/guide.png", ...],       # optional reference images: a shape guide, a base picture
   ...}                                  # everything else is copied into the sidecar
Writes DIR/<id>.png and DIR/<id>.json (the job, model, licence, timing, peak VRAM). An image that is
already there is skipped unless --force, so a stopped run is simply started again.
"""
import argparse, json, os, platform, time

os.environ.setdefault("HF_HUB_OFFLINE", "1")  # box can't reach the Hub: the check alone stalls ~9 min

MODEL = dict(repo="black-forest-labs/FLUX.2-klein-4B", license="Apache-2.0", cls="Flux2KleinPipeline", steps=4, guidance=1.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--out", required=True)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-warmup", action="store_true")
    a = ap.parse_args()

    spec = json.load(open(a.jobs))
    jobs = spec["jobs"]
    os.makedirs(a.out, exist_ok=True)
    todo = [j for j in jobs if a.force or not os.path.exists(os.path.join(a.out, j["id"] + ".png"))]
    print(f"[gen] jobs={len(jobs)} todo={len(todo)} out={a.out}", flush=True)
    if not todo:
        return
    for j in todo:
        for p in j.get("ref") or []:
            if not os.path.exists(p):
                raise SystemExit(f"[gen] {j['id']}: reference image {p} is missing")

    import torch
    import diffusers
    from PIL import Image

    t0 = time.time()
    pipe = getattr(diffusers, MODEL["cls"]).from_pretrained(MODEL["repo"], dtype=torch.bfloat16)
    pipe.to("cuda")  # bf16, the whole pipeline on one 3090: 18.6 GB peak
    pipe.set_progress_bar_config(disable=True)
    load_s = time.time() - t0
    print(f"[gen] loaded {MODEL['repo']} in {load_s:.1f}s", flush=True)

    def run(j):
        kw = dict(prompt=j["prompt"], width=int(j["width"]), height=int(j["height"]),
                  num_inference_steps=int(j.get("steps") or MODEL["steps"]),
                  guidance_scale=float(j["guidance"] if j.get("guidance") is not None else MODEL["guidance"]),
                  generator=torch.Generator("cuda").manual_seed(int(j["seed"])))
        if j.get("ref"):
            kw["image"] = [Image.open(p).convert("RGB") for p in j["ref"]]
        return pipe(**kw).images[0], kw

    if not a.no_warmup:  # the first call compiles kernels: kept out of the timings
        w = dict(todo[0], seed=0)
        w.pop("ref", None)
        run(w)
    torch.cuda.reset_peak_memory_stats()

    for i, j in enumerate(todo):
        torch.cuda.synchronize(); t = time.time()
        img, kw = run(j)
        torch.cuda.synchronize(); dt = time.time() - t
        tmp = os.path.join(a.out, j["id"] + ".tmp.png")
        img.save(tmp)
        side = dict(j)
        side.update(repo=MODEL["repo"], license=MODEL["license"], steps=kw["num_inference_steps"], guidance=kw["guidance_scale"],
                    negative_used=False, seconds=round(dt, 2), load_seconds=round(load_s, 1),
                    peak_vram_gb=round(torch.cuda.max_memory_allocated() / 1e9, 2), gpu=torch.cuda.get_device_name(0),
                    diffusers=diffusers.__version__, torch=torch.__version__, host=platform.node(),
                    time=time.strftime("%Y-%m-%dT%H:%M:%S"))
        with open(os.path.join(a.out, j["id"] + ".json"), "w") as f:
            json.dump(side, f, ensure_ascii=False, indent=1)
        os.replace(tmp, os.path.join(a.out, j["id"] + ".png"))  # the PNG last: its presence means done
        print(f"[gen] {i + 1}/{len(todo)} {j['id']} {j['width']}x{j['height']} {dt:.2f}s", flush=True)
    print(f"[gen] done, peak VRAM {torch.cuda.max_memory_allocated() / 1e9:.1f} GB", flush=True)


if __name__ == "__main__":
    main()
