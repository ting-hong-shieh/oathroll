"""Turn a recorded take (screencast frames with timestamps + the page's audio) into a
constant-30fps MP4 whose time 0 is the first frame. Usage: python frames_to_mp4.py <takeDir>
Writes <takeDir>/take.mp4 and prints the offset table (timeline label -> seconds)."""
import json, os, subprocess, sys

FF = os.environ.get("FFMPEG", "ffmpeg")
d = sys.argv[1]
tl = json.load(open(os.path.join(d, "timeline.json")))
res = json.load(open(os.path.join(d, "result.json")))
fr = tl["frames"]
t0 = fr[0]["ts"]
lst = os.path.join(d, "frames.txt")
with open(lst, "w") as f:
    end_t = max(fr[-1]["ts"] + 500, tl["timeline"][-1]["t"])  # hold the last frame until the take ended
    for a, b in zip(fr, fr[1:] + [None]):
        dur = ((b["ts"] if b else end_t) - a["ts"]) / 1000
        f.write(f"file 'frames/{a['name']}'\nduration {max(dur, 0.001):.4f}\n")
    f.write(f"file 'frames/{fr[-1]['name']}'\n")
cmd = [FF, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst]
audio = os.path.join(d, "game_audio.webm")
if os.path.exists(audio) and res.get("audioStart"):
    off = (res["audioStart"] - t0) / 1000
    cmd += ["-itsoffset", f"{off:.3f}", "-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k"]
    print(f"audio offset {off:.3f}s")
cmd += ["-t", f"{(end_t - t0) / 1000:.3f}", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", os.path.join(d, "take.mp4")]
subprocess.run(cmd, check=True)
with open(os.path.join(d, "offsets.txt"), "w") as f:
    for e in tl["timeline"]:
        line = f"{(e['t'] - t0) / 1000:8.2f}  {e['label']}  " + json.dumps({k: v for k, v in e.items() if k not in ('t', 'label')})[:120]
        print(line); f.write(line + "\n")
