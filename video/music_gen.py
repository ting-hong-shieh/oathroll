"""Demo music with ACE-Step 1.5 (same pipeline as Snooze Oracle's generate_v6.py), within the
the shared GPU's limits: VRAM fraction 0.68 of the card, whole-card use under 10,500 MiB (a watchdog
thread stops the run above that), PyTorch LM backend (no vLLM pre-allocation).
Usage (from ~/.venvs/ace-step): python music_gen.py <outDir>"""
import os, sys, json, time, resource, shutil, subprocess, threading
os.environ.setdefault("HF_HOME", "/mnt/d/Data/hf")
import torch
torch.cuda.set_per_process_memory_fraction(0.68)
from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

ROOT = "/mnt/d/Data/ace-step/repo"
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
LIMIT_MIB = 10500
peak = {"card_mib": 0}

def watchdog():
    while True:
        try:
            used = int(subprocess.run(["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
                                      capture_output=True, text=True).stdout.split()[0])
            peak["card_mib"] = max(peak["card_mib"], used)
            if used > LIMIT_MIB:
                print(f"WATCHDOG: card at {used} MiB > {LIMIT_MIB}, stopping", flush=True)
                os._exit(3)
        except Exception:
            pass
        time.sleep(1.5)
threading.Thread(target=watchdog, daemon=True).start()

CAPTION = ("A bright, playful orchestral adventure theme for a fantasy video game reveal trailer. Pizzicato strings and "
           "bouncy woodwinds open with a curious, mischievous motif, joined by glockenspiel, harp and light hand percussion. "
           "A warm French horn and string melody carries a clear, hummable hook. Cheerful and confident with a hint of "
           "seaside pirate mischief, never dark or epic. The energy lifts in the middle with fuller strings and a snare "
           "pattern, then settles and ends on a bright, decisive final chord.")
SEEDS = [int(s) for s in os.environ.get("SEEDS", "20261108,4242424,1357911").split(",")]
DUR = float(os.environ.get("DUR", "118"))

t0 = time.time()
dit = AceStepHandler()
msg, ok = dit.initialize_service(project_root=ROOT, config_path="acestep-v15-turbo", device="cuda",
    offload_to_cpu=True, offload_dit_to_cpu=False, quantization=None, compile_model=False)
print("DIT", ok, msg, flush=True)
llm = LLMHandler()
msg, ok2 = llm.initialize(checkpoint_dir=os.path.join(ROOT, "checkpoints"), lm_model_path="acestep-5Hz-lm-0.6B",
    backend="pt", device="cuda", offload_to_cpu=True)
print("LLM", ok2, msg, flush=True)
if not (ok and ok2): sys.exit(1)
meta = {"load_s": time.time() - t0, "caption": CAPTION, "tries": []}
for seed in SEEDS:
    torch.cuda.reset_peak_memory_stats()
    params = GenerationParams(task_type="text2music", caption=CAPTION, lyrics="[Instrumental]", instrumental=True,
        duration=DUR, bpm=112, keyscale="D major", timesignature="4", inference_steps=8, shift=3.0, seed=seed,
        thinking=True, use_cot_caption=False)
    config = GenerationConfig(batch_size=1, audio_format="wav", use_random_seed=False, seeds=[seed])
    sd = os.path.join(OUT, f"tmp_{seed}"); os.makedirs(sd, exist_ok=True)
    t = time.time(); res = generate_music(dit, llm, params, config, save_dir=sd); dt = time.time() - t
    if not res.success:
        print("FAIL", seed, res.error, flush=True); continue
    dst = os.path.join(OUT, f"music_seed{seed}.wav")
    shutil.move(res.audios[0]["path"], dst); shutil.rmtree(sd, ignore_errors=True)
    rec = dict(seed=seed, gen_s=dt, path=dst, peak_alloc_gb=torch.cuda.max_memory_allocated() / 2**30,
               card_peak_mib=peak["card_mib"])
    meta["tries"].append(rec); print("OK", json.dumps(rec), flush=True)
    json.dump(meta, open(os.path.join(OUT, "music_meta.json"), "w"), indent=1, default=str)
meta["peak_rss_gb"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20
meta["card_peak_mib"] = peak["card_mib"]
json.dump(meta, open(os.path.join(OUT, "music_meta.json"), "w"), indent=1, default=str)
print("DONE", meta["peak_rss_gb"], peak["card_mib"], flush=True)
