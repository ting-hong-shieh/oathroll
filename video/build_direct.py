"""Showcase cut: segments with eased crop-zooms and animated card overlays, then a mix of narration,
music (ducked under the voice), the game's own sounds and a soft chime on each section title.
Usage: python build_direct.py <rawDir> <cardsDir> <outFile> [--skit <framesDir>]"""
import json, os, subprocess, sys
import numpy as np, soundfile as sf

FF = os.environ.get("FFMPEG", "ffmpeg")
HERE = os.path.dirname(os.path.abspath(__file__))
raw, cards, out = sys.argv[1], sys.argv[2], sys.argv[3]
skit = sys.argv[sys.argv.index("--skit") + 1] if "--skit" in sys.argv else None
edl = json.load(open(os.path.join(HERE, os.environ.get("EDL", "edl_direct.json"))))
work = os.path.join(os.path.dirname(out), "direct_work"); os.makedirs(work, exist_ok=True)
SR = 48000
ENC = ["-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30"]

def run(cmd):
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error"] + cmd, check=True)

def has_audio(path):
    p = subprocess.run([FF, "-hide_banner", "-i", path], capture_output=True, text=True)
    return "Audio:" in p.stderr

def zoom_expr(zs):
    """z(it): 1 outside every window, eased (smoothstep, 0.5 s) to z inside it."""
    terms = []
    for z in zs:
        e0 = f"min(clip((it-({z['from']}))/0.5,0,1),clip(({z['to']}-it)/0.5,0,1))"
        terms.append(f"({z['z'] - 1})*({e0})*({e0})*(3-2*({e0}))")
    zexpr = "1+" + "+".join(terms)
    # centre: weighted by each window's activation, default frame centre
    cx = "+".join(f"({z['cx']}-960)*min(clip((it-({z['from']}))/0.5,0,1),clip(({z['to']}-it)/0.5,0,1))" for z in zs)
    cy = "+".join(f"({z['cy']}-540)*min(clip((it-({z['from']}))/0.5,0,1),clip(({z['to']}-it)/0.5,0,1))" for z in zs)
    return zexpr, f"(960+{cx})*2", f"(540+{cy})*2"

timeline = []  # (kind, start_s, ...) for overlays, chimes, pops, keys, clicks, game audio
vo_at = dict(edl.get("vo", {}))

def take_events(take):
    """Keystroke and click times (seconds in take.mp4) from the recording's timeline and screencast frames."""
    d = json.load(open(os.path.join(raw, take, "timeline.json")))
    if not d["frames"]: return [], []
    t0 = d["frames"][0]["ts"]; ts = [(f["ts"] - t0) / 1000 for f in d["frames"]]
    keys, clicks = [], []
    for e in d["timeline"]:
        t = (e["t"] - t0) / 1000
        typed = None
        if e["label"] == "declare": typed, end = e.get("action", ""), t - 0.5
        if e["label"] == "plea-send": typed, end = e.get("text", ""), t - 0.4
        if typed:
            # one screencast frame per typed character: the last len(text) frames before typing ended
            fr = [x for x in ts if x <= end + 0.03][-len(typed):]
            keys += fr
            if fr: clicks.append(fr[0] - 0.06)          # click into the text box
            clicks.append(t + 0.5)                       # stance button / Send plea
        if e["label"] == "roll": clicks.append(t + 0.5)  # Roll d20
    return keys, clicks

parts, t = [], 0.0
for i, s in enumerate(edl["segments"]):
    seg = os.path.join(work, f"{i:02d}_{s['id']}.mp4")
    vos = s.get("vo_skit") if (s["id"] == "cold" and skit and s.get("vo_skit")) else s.get("vo", {})
    for k, at in vos.items(): vo_at[k] = t + at
    if s.get("freeze") is not None:
        dur = s["dur"]
        src = os.path.join(raw, s["take"], "take.mp4")
        still = os.path.join(work, f"{i:02d}_{s['id']}.png")
        fvf = "scale=1920:1080:flags=lanczos:in_range=pc:out_range=tv"
        if s.get("zoom_static"):
            zs = s["zoom_static"]; cw, ch = 1920 / zs["z"], 1080 / zs["z"]
            x0 = min(max(zs["cx"] - cw / 2, 0), 1920 - cw); y0 = min(max(zs["cy"] - ch / 2, 0), 1080 - ch)
            fvf = (f"scale=3840:2160:flags=lanczos:in_range=pc:out_range=tv,crop={2 * cw:.0f}:{2 * ch:.0f}:{2 * x0:.0f}:{2 * y0:.0f},scale=1920:1080:flags=lanczos")
            print(f"  zoom_static x0={x0:.1f} y0={y0:.1f}")
        run(["-ss", f"{s['freeze']:.3f}", "-i", src, "-frames:v", "1", "-vf", fvf, still])
        inputs = ["-loop", "1", "-framerate", "30", "-t", f"{dur:.3f}", "-i", still]
        filt, last = "[0:v]format=yuv420p[v0]", "v0"
        for k, o in enumerate(s.get("overlays", [])):
            inputs += ["-framerate", "30", "-i", os.path.join(cards, o["card"], "%04d.png")]
            filt += (f";[{k + 1}:v]format=rgba,setpts=PTS-STARTPTS+{o['at']}/TB[o{k}]"
                     f";[{last}][o{k}]overlay=0:0:eof_action=pass:format=auto[v{k + 1}]")
            last = f"v{k + 1}"
            timeline.append(("pop" if o["card"].startswith("c_") else "chime", t + o["at"]))
        run(inputs + ["-filter_complex", filt, "-map", f"[{last}]", "-t", f"{dur:.3f}"] + ENC + ["-an", seg])
    elif s.get("card"):
        dur = s["dur"]
        src = os.path.join(cards, s["card"], "%04d.png")
        if s["id"] == "cold" and skit:
            src = os.path.join(skit, "%04d.png")
        run(["-framerate", "30", "-i", src, "-t", f"{dur:.3f}", "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p"] + ENC + ["-an", seg])
    else:
        dur = s["out"] - s["in"]
        if s["id"] == "cold" and skit:
            n = len([f for f in os.listdir(skit) if f.endswith(".png")])
            dur = n / 30
            vf = "scale=1920:1080:flags=lanczos,format=yuv420p"
            if s.get("skit_zoom"):
                z, x, y = zoom_expr(s["skit_zoom"])
                vf = (f"scale=3840:2160:flags=lanczos,zoompan=z='{z}':x='clip({x}-iw/zoom/2,0,iw-iw/zoom)':y='clip({y}-ih/zoom/2,0,ih-ih/zoom)':d=1:s=1920x1080:fps=30,format=yuv420p")
            run(["-framerate", "30", "-i", os.path.join(skit, "%04d.png"), "-vf", vf] + ENC + ["-an", seg])
            timeline += [("skitfx", t + e["t"], e["type"], e.get("dur", 0)) for e in s.get("skit_sfx", [])]
        else:
            src = os.path.join(raw, s["take"], "take.mp4")
            vf = "scale=1920:1080:flags=lanczos:in_range=pc:out_range=tv"
            if s.get("zoom"):
                z, x, y = zoom_expr(s["zoom"])
                vf = (f"scale=3840:2160:flags=lanczos:in_range=pc:out_range=tv,"
                      f"zoompan=z='{z}':x='clip({x}-iw/zoom/2,0,iw-iw/zoom)':y='clip({y}-ih/zoom/2,0,ih-ih/zoom)':d=1:s=1920x1080:fps=30")
            filt = f"[0:v]setpts=PTS-STARTPTS,{vf},format=yuv420p[v0]"
            inputs = ["-ss", f"{s['in']:.3f}", "-t", f"{dur:.3f}", "-i", src]
            last = "v0"
            for k, o in enumerate(s.get("overlays", [])):
                inputs += ["-framerate", "30", "-i", os.path.join(cards, o["card"], "%04d.png")]
                filt += (f";[{k + 1}:v]format=rgba,setpts=PTS-STARTPTS+{o['at']}/TB[o{k}]"
                         f";[{last}][o{k}]overlay=0:0:eof_action=pass:format=auto[v{k + 1}]")
                last = f"v{k + 1}"
                if o["card"].startswith("t"):
                    timeline.append(("chime", t + o["at"]))
                if o["card"].startswith("c_"):
                    timeline.append(("pop", t + o["at"]))
            keys, clicks = take_events(s["take"])
            timeline += [("key", t + k - s["in"]) for k in keys if s["in"] <= k < s["out"]]
            timeline += [("click", t + c - s["in"]) for c in clicks if s["in"] <= c < s["out"]]
            run(inputs + ["-filter_complex", filt, "-map", f"[{last}]", "-t", f"{dur:.3f}"] + ENC + ["-an", seg])
            # game audio for this segment
            a = os.path.join(work, f"{i:02d}_{s['id']}.wav")
            run(["-ss", f"{s['in']:.3f}", "-t", f"{dur:.3f}", "-i", src, "-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=stereo",
                 "-filter_complex", f"[0:a]aresample={SR}[g];[g][1:a]amix=inputs=2:duration=first:normalize=0,atrim=0:{dur:.3f}[a]",
                 "-map", "[a]", "-ar", str(SR), "-ac", "2", a]) if has_audio(src) else None
            timeline.append(("game", t, a if os.path.exists(a) else None, dur))
    parts.append(seg); print(f"{t:7.2f} {s['id']} {dur:.2f}s", flush=True)
    t += dur
TOTAL = t

lst = os.path.join(work, "concat.txt")
open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
video = os.path.join(work, "video.mp4")
run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", video])

# ---------- audio ----------
def load(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    if sr != SR:
        tmp = os.path.join(work, "rs.wav"); run(["-i", path, "-ar", str(SR), tmp]); x, sr = sf.read(tmp, dtype="float32", always_2d=True)
    if x.shape[1] == 1: x = np.repeat(x, 2, axis=1)
    return x

N = int(TOTAL * SR)
vo = np.zeros((N, 2), np.float32); game = np.zeros((N, 2), np.float32); fx = np.zeros((N, 2), np.float32)
for k, at in vo_at.items():
    x = load(os.path.join(edl["vo_dir"], f"{k}.wav")); a = int(at * SR); b = min(N, a + len(x))
    vo[a:b] += x[: b - a]
for e in timeline:
    if e[0] == "game" and e[2]:
        x = load(e[2]); a = int(e[1] * SR); b = min(N, a + len(x)); game[a:b] += x[: b - a]
# soft chime: two sine partials with an exponential decay
tt = np.arange(int(0.9 * SR)) / SR
chime = (0.6 * np.sin(2 * np.pi * 1318.5 * tt) + 0.35 * np.sin(2 * np.pi * 1975.5 * tt) + 0.15 * np.sin(2 * np.pi * 2637 * tt)) * np.exp(-tt * 5.5)
chime = np.stack([chime, chime], 1).astype(np.float32) * 0.18
for e in timeline:
    if e[0] == "chime":
        a = int(e[1] * SR); b = min(N, a + len(chime)); fx[a:b] += chime[: b - a]

rng = np.random.default_rng(20261108)
def env_burst(n_ms, decay):
    tt = np.arange(int(n_ms / 1000 * SR)) / SR; return tt, np.exp(-tt * decay)
def bandnoise(n, lo, hi):
    X = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR); X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n); return y / (np.abs(y).max() + 1e-9)
def key_sound():
    tt, e = env_burst(45, 150)
    y = 0.75 * bandnoise(len(tt), 1800, 6500) * e + 0.5 * np.sin(2 * np.pi * rng.uniform(170, 230) * tt) * np.exp(-tt * 260)
    return y * rng.uniform(0.6, 1.0)
def click_sound():
    tt, e = env_burst(110, 90); y = np.zeros(len(tt))
    for off, g in ((0, 1.0), (int(0.055 * SR), 0.6)):  # press and release
        m = len(tt) - off; y[off:] += g * bandnoise(m, 2500, 9000) * np.exp(-np.arange(m) / SR * 420)
    return y
def pop_sound():
    tt, e = env_burst(160, 28); f = 620 + 520 * np.minimum(1, tt / 0.05)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e * np.minimum(1, tt / 0.004)
def put(buf, at, y, gain, pan=0.0):
    a = int(at * SR); b = min(N, a + len(y))
    if a < 0 or a >= N: return
    buf[a:b, 0] += (y[: b - a] * gain * (1 - pan)).astype(np.float32); buf[a:b, 1] += (y[: b - a] * gain * (1 + pan)).astype(np.float32)
for e in timeline:
    if e[0] == "key": put(fx, e[1], key_sound(), 0.055, rng.uniform(-0.15, 0.15))
    if e[0] == "click": put(fx, e[1], click_sound(), 0.09)
    if e[0] == "pop": put(fx, e[1], pop_sound(), 0.07)
def skit_sound(kind, dur):
    if kind == "slide":
        n = int(0.55 * SR); tt = np.arange(n) / SR
        return bandnoise(n, 900, 5000) * np.sin(np.pi * tt / 0.55) ** 2 * 0.5
    if kind == "ding":
        tt = np.arange(int(1.2 * SR)) / SR
        return (0.6 * np.sin(2 * np.pi * 2093 * tt) + 0.3 * np.sin(2 * np.pi * 3136 * tt) + 0.15 * np.sin(2 * np.pi * 4186 * tt)) * np.exp(-tt * 4.5) * np.minimum(1, tt / 0.003)
    if kind == "scratch":
        n = int(dur * SR); tt = np.arange(n) / SR
        strokes = np.clip(np.sin(2 * np.pi * 7.5 * tt + 2 * np.sin(2 * np.pi * 1.3 * tt)), 0, 1) ** 1.5
        return bandnoise(n, 3000, 9000) * strokes * np.minimum(1, tt / 0.05) * np.minimum(1, (dur - tt) / 0.1) * 0.55
    if kind == "whoosh":
        n = int(0.75 * SR); tt = np.arange(n) / SR; y = np.zeros(n)
        for k in range(6):  # a falling band of noise
            seg_ = slice(k * n // 6, (k + 1) * n // 6); m = seg_.stop - seg_.start
            y[seg_] = bandnoise(m, 2400 - 300 * k, 4800 - 600 * k)
        return y * (tt / 0.75) ** 2 * 0.6
    if kind == "clank":
        tt = np.arange(int(1.4 * SR)) / SR
        metal = sum(a * np.sin(2 * np.pi * f * tt) * np.exp(-tt * d) for f, a, d in ((523, .5, 5), (1187, .45, 7), (1873, .35, 9), (2950, .25, 12), (4120, .15, 16)))
        thud = np.sin(2 * np.pi * 55 * tt) * np.exp(-tt * 9) * 1.2
        rattle = bandnoise(len(tt), 2000, 8000) * np.exp(-tt * 14) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 23 * tt)))
        return (metal + thud + 0.5 * rattle) * np.minimum(1, tt / 0.002)
    if kind == "womp":
        out_ = np.zeros(int(0.9 * SR))
        for off, f in ((0.0, 392.0), (0.28, 293.7)):  # two soft descending marimba notes
            tt = np.arange(int(0.6 * SR)) / SR; a = int(off * SR)
            out_[a:a + len(tt)] += (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * 4 * f * tt) * np.exp(-tt * 30)) * np.exp(-tt * 7) * np.minimum(1, tt / 0.004)
        return out_
    return np.zeros(1)
GAIN = {"slide": 0.10, "ding": 0.10, "scratch": 0.09, "whoosh": 0.12, "clank": 0.22, "womp": 0.14}
for e in timeline:
    if e[0] == "skitfx": put(fx, e[1], skit_sound(e[2], e[3]), GAIN.get(e[2], 0.1))
print("sfx:", {k: sum(1 for e in timeline if e[0] == k) for k in ("key", "click", "pop", "chime", "skitfx")})

music = np.zeros((N, 2), np.float32)
m = load(edl["music"]["file"]); a = int(edl["music"]["start"] * SR); b = min(N, a + len(m)); music[a:b] = m[: b - a]
fo = int(edl["music"]["fade_out"] * SR); music[N - fo:] *= np.linspace(1, 0, fo)[:, None] ** 2

def rms_db(x):
    v = x[np.abs(x).max(1) > 1e-4]; return 20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-9) if len(v) else -99
# levels: voice ~ -18 dBFS RMS, music bed 6 dB under the voice in gaps, ducked another 9 dB while the voice speaks, game -12 dB
vo *= 10 ** ((-18 - rms_db(vo)) / 20)
music *= 10 ** ((-24 - rms_db(music)) / 20)  # bed at about -24 in gaps (v4: 6 dB lower after review)
env = np.convolve(np.abs(vo).max(1), np.ones(int(0.05 * SR)) / int(0.05 * SR), mode="same") > 0.01
# hold the duck 0.35 s after speech and start it 0.15 s before
hold = np.convolve(env.astype(np.float32), np.ones(int(0.5 * SR)), mode="same") > 0
duck = np.where(hold, 10 ** (-9 / 20), 1.0).astype(np.float32)
duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")  # smooth attack/release
music *= duck[:, None]
game *= 10 ** (-12 / 20)
mix = vo + music + game + fx
mixwav = os.path.join(work, "mix.wav"); sf.write(mixwav, mix, SR, subtype="FLOAT")
# loudness to -14 LUFS, true peak -1 dBTP
run(["-i", video, "-i", mixwav, "-map", "0:v", "-map", "1:a", "-c:v", "copy",
     "-af", "loudnorm=I=-14:TP=-1.0:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR), "-shortest", out])
print("TOTAL", round(TOTAL, 2), "->", out)
