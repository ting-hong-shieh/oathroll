"""Place the rendered lines at their 'at' times into one mono track. Usage: place_vo.py <voDir> <total_s> <out.wav>"""
import json, sys
from pathlib import Path
import numpy as np, soundfile as sf
HERE = Path(__file__).resolve().parent
cfg = json.load(open(HERE / "vo_lines.json"))
vo, total, out = Path(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
SR = 24000
track = np.zeros(int(total * SR) + SR, dtype=np.float32)
prev_end = 0
for l in cfg["lines"]:
    x, sr = sf.read(vo / f"{l['id']}.wav", dtype="float32")
    a = int(l["at"] * SR)
    if l["at"] < prev_end: print("OVERLAP", l["id"], round(prev_end - l["at"], 2))
    track[a:a + len(x)] += x
    prev_end = l["at"] + len(x) / SR
    print(l["id"], l["at"], "->", round(prev_end, 2))
sf.write(out, track[:int(total * SR)], SR, subtype="PCM_16")
