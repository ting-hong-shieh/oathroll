"""Assemble the rough cut from edl.json: trim each take, add the small labels, make the end card,
concatenate, and draw the opening overlay. Usage: python build_cut.py <rawDir> <outFile> [voWav]
Hard cuts only. Every label is static text. The game audio is kept as recorded; a narration track,
if given, is mixed on top with the game audio ducked under it."""
import json, os, subprocess, sys, tempfile

FF = os.environ.get("FFMPEG", "ffmpeg")
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "app", "public", "fonts")
SERIF = os.path.join(FONTS, "fraunces.ttf")
MONO = os.path.join(FONTS, "ibm-plex-mono.ttf")
raw, out = sys.argv[1], sys.argv[2]
vo = sys.argv[3] if len(sys.argv) > 3 else None
edl = json.load(open(os.path.join(HERE, "edl.json")))
work = os.path.join(os.path.dirname(out), "segments")
os.makedirs(work, exist_ok=True)

def run(cmd):
    subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error"] + cmd, check=True)

def textfile(s):
    f = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, dir=work)
    f.write(s); f.close(); return f.name

ENC = ["-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "30",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]

def has_audio(path):
    p = subprocess.run([FF.replace("ffmpeg-linux", "ffmpeg-linux"), "-hide_banner", "-i", path], capture_output=True, text=True)
    return "Audio:" in p.stderr

parts = []
for i, s in enumerate(edl["segments"]):
    seg = os.path.join(work, f"{i:02d}_{s['id']}.mp4")
    if s.get("card") == "end":
        t1 = textfile("Oathroll")
        t2 = textfile("github.com/ting-hong-shieh/oathroll")
        t3 = textfile("Every transaction in this video is listed in the README.")
        vf = (f"drawtext=fontfile={SERIF}:textfile={t1}:fontsize=120:fontcolor=0xF3E9D2:x=(w-text_w)/2:y=h/2-170,"
              f"drawtext=fontfile={MONO}:textfile={t2}:fontsize=44:fontcolor=0xD4A64A:x=(w-text_w)/2:y=h/2+10,"
              f"drawtext=fontfile={MONO}:textfile={t3}:fontsize=30:fontcolor=0xBFB5A0:x=(w-text_w)/2:y=h/2+90")
        run(["-f", "lavfi", "-i", f"color=c=0x14110F:s=1920x1080:r=30:d={s['dur']}",
             "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo", "-t", str(s["dur"]), "-vf", vf] + ENC + [seg])
    else:
        src = os.path.join(raw, s["take"], "take.mp4")
        dur = s["out"] - s["in"]
        vf = "scale=1920:1080:flags=lanczos:in_range=pc:out_range=tv"
        if s.get("label"):
            t = textfile(s["label"])
            vf += (f",drawtext=fontfile={MONO}:textfile={t}:fontsize=30:fontcolor=0xF3E9D2:box=1:boxcolor=0x14110FCC:"
                  f"boxborderw=14:x=w-text_w-40:y=h-text_h-40")
        inputs = ["-ss", f"{s['in']:.3f}", "-t", f"{dur:.3f}", "-i", src]
        if has_audio(src):
            run(inputs + ["-vf", vf, "-af", "aresample=48000"] + ENC + [seg])
        else:
            run(inputs + ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a",
                          "-t", f"{dur:.3f}", "-vf", vf] + ENC + [seg])
    parts.append(seg)
    print("segment", i, s["id"], flush=True)

lst = os.path.join(work, "concat.txt")
with open(lst, "w") as f:
    for p in parts: f.write(f"file '{p}'\n")
joined = os.path.join(work, "joined.mp4")
run(["-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", joined])

ov = edl["overlays"][0]
a = textfile(ov["lines"][0]); b = textfile(ov["lines"][1])
en = f"enable='between(t,{ov['from']},{ov['to']})'"
vf = (f"drawbox=x=860:y=ih-215:w=1030:h=175:color=0x14110F@0.88:t=fill:{en},"
      f"drawtext=fontfile={SERIF}:textfile={a}:fontsize=64:fontcolor=0xF3E9D2:x=890:y=h-200:{en},"
      f"drawtext=fontfile={MONO}:textfile={b}:fontsize=30:fontcolor=0xD4A64A:x=892:y=h-95:{en}")
if vo:
    # Duck the game audio under the narration (sidechain), then normalise later in the mix step.
    fc = (f"[0:v]{vf}[v];[1:a]aresample=48000,asplit=2[vo1][vo2];"
          f"[0:a][vo1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];"
          f"[duck][vo2]amix=inputs=2:duration=first:normalize=0[a]")
    run(["-i", joined, "-i", vo, "-filter_complex", fc, "-map", "[v]", "-map", "[a]"] + ENC + [out])
else:
    run(["-i", joined, "-vf", vf, "-c:a", "copy", "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", "-pix_fmt", "yuv420p", out])
p = subprocess.run([FF, "-hide_banner", "-i", out], capture_output=True, text=True)
print([l.strip() for l in p.stderr.splitlines() if "Duration" in l])
