"""The game's music, made with ACE-Step 1.5 (github.com/ACE-Step/ACE-Step-1.5: MIT, the code and the
weights; what it makes is ours to use), for tools/ai-audio.mjs to process.

Run it on a GPU machine, never on the Mac the game is made on (a model there all but froze it).
From an ACE-Step 1.5 checkout, in its uv environment (`uv sync` there first), with a jobs file. uv
is in ~/.local/bin, which a command run over ssh doesn't have on its PATH, so it's named in full:

    node tools/ai-audio.mjs --jobs jobs.json                 # the music takes it can't find
    ssh box 'mkdir -p ~/ace-jobs' && scp tools/audio/acestep.py jobs.json box:ace-jobs/
    ssh box 'cd ~/ACE-Step-1.5 && CUDA_VISIBLE_DEVICES=0 ~/.local/bin/uv run python ~/ace-jobs/acestep.py ~/ace-jobs/jobs.json ~/ace-out/xl'
    scp -rp 'box:ace-out/xl' audio-src/acestep/             # -p keeps when each was made; then: node tools/ai-audio.mjs

usage: python acestep.py <jobs.json> <out-dir> [--dry]
  run from the checkout (or give it as ACE_ROOT); --dry only says what it would make, and loads no model
env: ACE_DEVICE (default cuda), ACE_LM_BACKEND (default vllm; pt where there's no vLLM),
     CUDA_VISIBLE_DEVICES to pick the GPU

The jobs are music entries of tools/audio/list.mjs, in its terms, as JSON:
    [{"id": "music.town", "prompt": "...", "bpm": 66, "key": "D minor", "time": 3, "duration": 150,
      "model": "acestep-v15-turbo", "lm": "acestep-5Hz-lm-1.7B",
      "takes": [{"seed": 101}, {"seed": 113, "prompt": "...", "bpm": 60, "key": "E minor"}]}]
a take giving any field of its own where it differs from its entry's (several seeds of one job are
how to try it out); the sampler's steps, guidance and shift are the model's unless given (tools/
ai-audio.mjs --jobs gives them). Each take is written as <out-dir>/<name>.wav, 48 kHz stereo, and
<out-dir>/<name>.json, its sidecar: what made it in ACE-Step's terms (caption, bpm, key, time,
duration, seed, model, lm, steps, guidance, shift) and when, which is how tools/ai-audio.mjs finds
it, whatever it's called. <name> is the take's own "name", else <id>.<k> for the first k free in
<out-dir>. A take whose sidecar is in <out-dir> already is skipped, so a run stopped halfway can be
run again.
"""
import gc
import json
import os
import shutil
import sys
import time

# what names the take: a job's fields, as the list calls them and as ACE-Step does (tools/audio/music.mjs)
FIELDS = {"prompt": "caption", "bpm": "bpm", "key": "key", "time": "time", "duration": "duration", "seed": "seed", "model": "model", "lm": "lm",
          "steps": "steps", "guidance": "guidance", "shift": "shift"}
# the sampler's, which a job may leave to the model's
SAMPLER = ("steps", "guidance", "shift")


def sampler(model):
    """the turbo models are distilled to 8 steps without guidance; the others sample 64 with it
    (tools/audio/music.mjs sampler(), which names the takes by it)"""
    return {"steps": 8, "guidance": 1.0, "shift": 3.0} if "turbo" in str(model) else {"steps": 64, "guidance": 7.0, "shift": 3.0}


def takes_of(jobs):
    """every take of every job, as the request it is: its own fields, else its job's, else the model's sampler"""
    out = []
    for job in jobs:
        for take in job.get("takes", []):
            req = {f: take.get(f, job.get(f)) for f in FIELDS}
            missing = [f for f, v in req.items() if v is None and f not in SAMPLER]
            if missing:
                sys.exit(f"{job.get('id')}: a take has no {', '.join(missing)}")
            for f, v in sampler(req["model"]).items():
                if req[f] is None:
                    req[f] = v
            out.append({"id": job["id"], "name": take.get("name"), "req": req})
    return out


def sidecar_of(req):
    return {FIELDS[f]: v for f, v in req.items()}


def alike(a, b):
    """the same, or the same number however it's written (3 and "3", 1 and 1.0)"""
    if str(a) == str(b):
        return True
    try:
        return float(a) == float(b)
    except (TypeError, ValueError):
        return False


def same(meta, req):
    """the sidecar records this request: every field alike. One that doesn't give the sampler's
    (the first takes' gen-reference.py) was sampled as its model is by default"""
    rec = {**sampler(meta.get("model")), **meta}
    return all(f in rec and alike(rec[f], v) for f, v in sidecar_of(req).items())


def made_in(out):
    """the sidecars in out-dir, by name"""
    found = {}
    for f in sorted(os.listdir(out)) if os.path.isdir(out) else []:
        if f.endswith(".json") and os.path.exists(os.path.join(out, f[:-5] + ".wav")):
            try:
                meta = json.load(open(os.path.join(out, f)))
            except ValueError:
                continue
            if isinstance(meta, dict):
                found[f[:-5]] = meta
    return found


def name_for(take, out, taken):
    """its own name, or <id>.<k> for the first k no file in out-dir has"""
    if take["name"]:
        return take["name"]
    k = 1
    while f"{take['id']}.{k}" in taken or any(os.path.exists(os.path.join(out, f"{take['id']}.{k}{ext}")) for ext in (".wav", ".json")):
        k += 1
    return f"{take['id']}.{k}"


def loaded(what, result):
    """ACE-Step's loaders return (status, success) (AceStepHandler.initialize_service,
    LLMHandler.initialize) and go on after a failure: stop there, as a take made without its model
    would be recorded as made with it"""
    status, ok = result
    print(status)
    if not ok:
        sys.exit(f"{what} didn't load")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry" in sys.argv
    if len(args) != 2:
        sys.exit(__doc__)
    jobs_path, out = args
    out = os.path.abspath(out)
    takes = takes_of(json.load(open(jobs_path)))
    made = made_in(out)
    todo = []
    taken = set()
    for t in takes:
        have = next((n for n, m in made.items() if same(m, t["req"])), None)
        if have:
            print("made already", have)
            continue
        t["name"] = name_for(t, out, taken)
        taken.add(t["name"])
        todo.append(t)
    for t in todo:
        r = t["req"]
        print("to make", t["name"], f"{r['model']} + {r['lm']}, seed {r['seed']}, {r['bpm']} BPM, {r['key']}, {r['time']} beats, {r['duration']} s,",
              f"{r['steps']} steps, guidance {r['guidance']}, shift {r['shift']}")
    if dry or not todo:
        return

    root = os.path.abspath(os.environ.get("ACE_ROOT", os.getcwd()))
    if not os.path.isdir(os.path.join(root, "acestep")):
        sys.exit(f"{root} is not an ACE-Step 1.5 checkout: run this from one, or give it as ACE_ROOT")
    # the checkout's package first: this file's own name would shadow it
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path[:] = [root] + [p for p in sys.path if os.path.abspath(p or ".") != here]
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    device = os.environ.get("ACE_DEVICE", "cuda")
    backend = os.environ.get("ACE_LM_BACKEND", "vllm")

    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    from acestep.llm_inference import LLMHandler
    from acestep.model_downloader import ensure_dit_model, ensure_lm_model, get_checkpoints_dir

    ckpt = str(get_checkpoints_dir())
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(out, "_tmp")
    # one model at a time: the takes of each pair of models together
    groups = {}
    for t in todo:
        groups.setdefault((t["req"]["model"], t["req"]["lm"]), []).append(t)
    for (model, lm_name), group in groups.items():
        for ok, msg in (ensure_dit_model(model, ckpt), ensure_lm_model(lm_name, ckpt)):
            print(msg)
            if not ok:
                sys.exit(msg)
        dit = AceStepHandler()
        loaded(model, dit.initialize_service(project_root=root, config_path=model, device=device))
        lm = LLMHandler()
        loaded(lm_name, lm.initialize(checkpoint_dir=ckpt, lm_model_path=lm_name, backend=backend, device=device))
        for t in group:
            r = t["req"]
            params = GenerationParams(
                caption=r["prompt"],
                lyrics="[Instrumental]",
                instrumental=True,
                bpm=int(r["bpm"]),
                keyscale=r["key"],
                timesignature=str(r["time"]),
                duration=float(r["duration"]),
                seed=int(r["seed"]),
                inference_steps=int(r["steps"]),
                guidance_scale=float(r["guidance"]),
                shift=float(r["shift"]),
                thinking=True,
                use_cot_caption=False,
                use_cot_metas=False,
                use_cot_language=False,
            )
            config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[int(r["seed"])], audio_format="wav")
            began = time.time()
            res = generate_music(dit, lm, params, config, save_dir=tmp)
            if not res.success:
                print("FAILED", t["name"], res.error)
                continue
            dst = os.path.join(out, t["name"])
            shutil.move(res.audios[0]["path"], dst + ".wav")
            meta = {"id": t["id"], **sidecar_of(r), "secs": round(time.time() - began, 1), "at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
            # the sidecar last: a take is there once its record is
            with open(dst + ".json.tmp", "w") as f:
                json.dump(meta, f, ensure_ascii=False, indent=1)
            os.replace(dst + ".json.tmp", dst + ".json")
            print("OK", dst, meta["secs"], "s")
        lm.unload()
        del dit, lm
        gc.collect()
        try:
            import torch

            torch.cuda.empty_cache()
        except Exception:
            pass
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
