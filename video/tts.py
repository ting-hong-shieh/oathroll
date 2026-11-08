"""Render the narration with ElevenLabs (same voice and model as Snooze Oracle).
One request per line, no retries. The key is read from ~/.config/elevenlabs.env and never printed.
Usage: python tts.py <outDir> [id ...]   (no ids = all lines not yet rendered)"""
import json, sys, urllib.request
from pathlib import Path
import numpy as np, soundfile as sf

HERE = Path(__file__).resolve().parent
SR = 24000
cfg = json.load(open(HERE / (__import__("os").environ.get("VO_CFG", "vo_lines.json"))))
out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
want = set(sys.argv[2:])

def key():
    for line in (Path.home() / ".config" / "elevenlabs.env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.strip() == "ELEVENLABS_API_KEY":
            return v.strip().strip('"').strip("'")
    raise SystemExit("ELEVENLABS_API_KEY not found")

def trim(x, thresh=2e-4, pre=0.06, post=0.08):
    idx = np.where(np.abs(x) > thresh)[0]
    if not len(idx): return x
    return x[max(0, idx[0] - int(pre * SR)): min(len(x), idx[-1] + 1 + int(post * SR))]

k = key()
todo = [l for l in cfg["lines"] if (l["id"] in want) or (not want and not (out / f"{l['id']}.wav").exists())]
print(len(todo), "lines,", sum(len(l["tts"]) for l in todo), "characters")
for l in todo:
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{cfg['voice_id']}?output_format=pcm_24000",
        data=json.dumps({"text": l["tts"], "model_id": cfg["model"], **({"voice_settings": cfg["voice_settings"]} if cfg.get("voice_settings") else {})}).encode(),
        headers={"xi-api-key": k, "Content-Type": "application/json", "Accept": "audio/pcm"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        x = np.frombuffer(r.read(), dtype="<i2").astype(np.float32) / 32768.0
    x = trim(x)
    sf.write(out / f"{l['id']}.wav", x, SR, subtype="PCM_16")
    print(l["id"], f"{len(x) / SR:.2f}s", flush=True)
