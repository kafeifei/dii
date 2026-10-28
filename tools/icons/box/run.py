"""One run of the icon pipeline on box: guides, generation on the free GPUs, matting, grade and export,
review sheets. tools/ai-icons.mjs starts it detached and follows RUN_DIR/logs/run.log and status.json.

usage: python -I run.py RUN_DIR [--gpus 0,1,2] [--wait 7200]

RUN_DIR/jobs.json (written by ai-icons.mjs) lists the jobs; every step skips what is already made, so
a run stopped anywhere is started again the same way, and jobs added to jobs.json are made next time.
- guides: each job's shape guide (guides.py) at RUN_DIR/guides/<name>_<W>x<H>.png, its ref path;
- gen: the jobs still to paint, split over the usable GPUs by their expected time (a reference image
  doubles it: 5.1 s against 2.3 s a picture on a 3090), one gen.py per GPU;
- cut: the new paintings matted, split the same way (cut.py, ~0.35 s a picture);
- export (export.py, CPU) and review (review.py, CPU).
A GPU is usable when no process holds memory on it (the user's wordbook Ollama services are nominally
on 0-2: one that holds memory is left alone) and this run gets its lock (RUN_ROOT/locks/gpu<i>.lock,
flock), so two runs never load two pipelines onto one 3090 (18.6 GB each). With none usable it waits.
"""
import argparse, fcntl, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
COST_REF = 2.2  # a job with a reference image takes ~2.2x as long (the samples: 5.08 s against 2.28 s)


def log(msg):
    print(f"[run {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def write_status(run, fresh=False, **kw):
    p = os.path.join(run, "status.json")
    st = json.load(open(p)) if os.path.exists(p) and not fresh else {}
    st.update(kw, updated=time.strftime("%Y-%m-%dT%H:%M:%S"))
    with open(p + ".tmp", "w") as f:
        json.dump(st, f, indent=1)
    os.replace(p + ".tmp", p)


def gpus_free():
    """Indices of GPUs with no compute process and under 1 GB in use."""
    q = subprocess.run(["nvidia-smi", "--query-gpu=index,uuid,memory.used", "--format=csv,noheader,nounits"],
                       capture_output=True, text=True, check=True).stdout
    apps = subprocess.run(["nvidia-smi", "--query-compute-apps=gpu_uuid,pid,used_memory", "--format=csv,noheader,nounits"],
                          capture_output=True, text=True, check=True).stdout
    busy = {l.split(",")[0].strip() for l in apps.splitlines() if l.strip()}
    out = []
    for l in q.splitlines():
        i, uuid, used = [x.strip() for x in l.split(",")]
        if uuid not in busy and int(used) < 1000:
            out.append(int(i))
    return out


def take_gpus(root, allowed, wait_s):
    """Lock every usable GPU this run may use; wait (up to wait_s) while there is none."""
    os.makedirs(os.path.join(root, "locks"), exist_ok=True)
    t0 = time.time()
    while True:
        held = []
        for i in gpus_free():
            if allowed and i not in allowed:
                continue
            fh = open(os.path.join(root, "locks", f"gpu{i}.lock"), "w")
            try:
                fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
                held.append((i, fh))
            except BlockingIOError:
                fh.close()
        if held:
            return held
        if time.time() - t0 > wait_s:
            raise SystemExit("no usable GPU (all busy or locked by another run)")
        log("no usable GPU yet: waiting")
        time.sleep(30)


def shard(items, n, cost):
    """Greedy: the costliest first, each to the least loaded shard."""
    bins = [[] for _ in range(n)]
    load = [0.0] * n
    for it in sorted(items, key=cost, reverse=True):
        k = load.index(min(load))
        bins[k].append(it)
        load[k] += cost(it)
    return bins


def parallel(run, step, gpus, argv_for):
    procs = []
    for i, args in zip(gpus, argv_for):
        if args is None:
            continue
        env = dict(os.environ, CUDA_VISIBLE_DEVICES=str(i), HF_HUB_OFFLINE="1")
        lf = open(os.path.join(run, "logs", f"{step}-gpu{i}.log"), "a")
        procs.append((i, subprocess.Popen([sys.executable, "-I"] + args, env=env, stdout=lf, stderr=subprocess.STDOUT), lf))
    bad = []
    for i, p, lf in procs:
        p.wait()
        lf.close()
        if p.returncode:
            bad.append(i)
    if bad:
        raise SystemExit(f"{step} failed on GPU {bad}: see {run}/logs/{step}-gpu<i>.log")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--gpus", default="")
    ap.add_argument("--wait", type=float, default=7200)
    a = ap.parse_args()
    run = os.path.abspath(a.run)
    root = os.path.dirname(run)
    for sub in ("gen", "cut", "cand", "sheets", "guides", "logs", "shards"):
        os.makedirs(os.path.join(run, sub), exist_ok=True)
    spec = json.load(open(os.path.join(run, "jobs.json")))
    jobs = spec["jobs"]
    write_status(run, fresh=True, state="running", pid=os.getpid(), step="guides", jobs=len(jobs), started=time.strftime("%Y-%m-%dT%H:%M:%S"))
    try:
        import guides
        for j in jobs:
            if j.get("guide"):
                p = j["ref"][0]
                if not os.path.exists(p):
                    guides.draw(j["guide"], j["width"], j["height"], p)
        for j in jobs:
            for p in j.get("ref") or []:
                if not os.path.exists(p):
                    raise SystemExit(f"{j['id']}: reference image {p} is missing")

        todo = [j for j in jobs if not os.path.exists(os.path.join(run, "gen", j["id"] + ".png"))]
        uncut = lambda: [j for j in jobs if os.path.exists(os.path.join(run, "gen", j["id"] + ".png"))
                         and not os.path.exists(os.path.join(run, "cut", j["id"] + ".png"))]
        if todo or uncut():
            held = take_gpus(root, [int(x) for x in a.gpus.split(",") if x], a.wait)
            gpus = [i for i, _ in held]
            if todo:
                write_status(run, step="gen", gpus=gpus, todo=len(todo))
                cost = lambda j: (COST_REF if j.get("ref") else 1.0) * j["width"] * j["height"] / 1e6
                bins = shard(todo, len(gpus), cost)
                log(f"gen: {len(todo)} pictures on GPU {gpus} ({', '.join(str(len(b)) for b in bins)})")
                argv = []
                for i, b in zip(gpus, bins):
                    if not b:
                        argv.append(None)
                        continue
                    f = os.path.join(run, "shards", f"gen-gpu{i}.json")
                    json.dump(dict(model=spec.get("model"), jobs=b), open(f, "w"), ensure_ascii=False, indent=1)
                    argv.append([os.path.join(HERE, "gen.py"), f, "--out", os.path.join(run, "gen")])
                t = time.time()
                parallel(run, "gen", gpus, argv)
                log(f"gen: done in {time.time() - t:.0f}s")
            left = uncut()
            if left:
                write_status(run, step="cut", todo=len(left))
                bins = shard(left, len(gpus), lambda j: 1.0)
                argv = []
                for i, b in zip(gpus, bins):
                    if not b:
                        argv.append(None)
                        continue
                    f = os.path.join(run, "shards", f"cut-gpu{i}.txt")
                    open(f, "w").write("".join(os.path.join(run, "gen", j["id"] + ".png") + "\n" for j in b))
                    argv.append([os.path.join(HERE, "cut.py"), "--list", f, "--out", os.path.join(run, "cut")])
                t = time.time()
                parallel(run, "cut", gpus, argv)
                log(f"cut: {len(left)} done in {time.time() - t:.0f}s")
            for _, fh in held:
                fh.close()
        write_status(run, step="export")
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "export.py"), run], check=True)
        write_status(run, step="review")
        subprocess.run([sys.executable, "-I", os.path.join(HERE, "review.py"), run], check=True)
        made = sum(1 for j in jobs if os.path.exists(os.path.join(run, "cand", j["id"] + ".json")))
        write_status(run, state="done", step=None, made=made, finished=time.strftime("%Y-%m-%dT%H:%M:%S"))
        log(f"done: {made}/{len(jobs)} candidates")
    except BaseException as e:  # noqa: B902 - the status must say it stopped, whatever stopped it
        write_status(run, state="failed", error=str(e) or type(e).__name__)
        log(f"failed: {e}")
        raise


if __name__ == "__main__":
    main()
