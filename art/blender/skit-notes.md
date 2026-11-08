# Oathroll cold open

Original procedural toy characters and props; no downloaded assets, text, numerals, or logos.
The existing `oathroll.py` supplies palette conversion, rounded primitives, oak grain,
vermilion wax seal, candle, and blank d20. `skit.py` loads only its helper definitions.

318 frames at 30 fps, 1920×1080, 10.6 seconds. Frames 301–318 freeze the reaction for the cut.
Beat frames (one-based): coin starts 67, first ink 149, chain starts dropping 199,
chain impact 220, shrug begins 259. The full edit rectangle is in `skit-edit.json`.

Local preview: CPU only, core 17, 8 samples, 633×356. Portable Blender lives under `/tmp`.

```sh
CUDA_VISIBLE_DEVICES='' LD_LIBRARY_PATH=/tmp/oathroll-skit-blenv taskset -c 17 /tmp/oathroll-skit-blender/blender -b -t 1 -P skit.py -- check
CUDA_VISIBLE_DEVICES='' LD_LIBRARY_PATH=/tmp/oathroll-skit-blenv taskset -c 17 /tmp/oathroll-skit-blender/blender -b -t 1 -P skit.py -- preview
```

`check` builds the complete keyed scene and saves `skit.blend`. `preview` renders
selected beat poses to `renders/skit-preview`. `frames --start N --end M` writes
`renders/skit/NNNN.png`. EEVEE could not create an EGL context on partner001;
final rendering uses CUDA Cycles, adaptive 8–32 samples, denoising, persistent data.

Every final batch uses exactly the required lock, systemd memory scope, core affinity,
and priority. `skit-queue.py` runs small serial batches and stops if the host/lock is
unavailable, a batch fails, the GPU-minute allowance is nearly spent, or the lease
would pass 06:30 Taipei. Render-time VRAM polling aborts above 7168 MiB total device
use. The first batch was also checked with `nvidia-smi`.

Timing data: `renders/skit-times.jsonl` remotely, local queue wall times in
`renders/skit-batches.jsonl`. Large scene/render outputs are ignored by Git.

The final 18 frames reuse frame 300 byte-for-byte. The native scene also freezes
that pose; exact PNG reuse removes tiny independent GPU denoiser rounding differences.

The requested `/mnt/d/Data/oathroll-video/skit/` destination is read-only in this
worker's filesystem. Final PNGs are staged under `art/blender/renders/skit/`.
Run `./copy-skit.sh` from a shell with D: write access to validate and copy all
318 frames into the requested destination. It accepts an alternate destination
as its first argument. The review MP4 and contact sheets live in
`renders/skit-review/`; `skit-report.json` records final validation and resource use.

Final verification: all 318 PNGs decode as 1920×1080 RGB. All frames were reviewed
in seven contact sheets, with larger views of the entrance, coin, scribble, chain
impact, and reactions. Frames 301–318 are pixel-identical. The largest adjacent
frame changes occur at the intended chain slam and Wren's entrance.

Final render average: **1.906 s/frame**, 606.022 s total for the final frame versions.
Including measurements, revisions, startup, and the failed EGL attempt, the 67
systemd GPU scopes consumed **21.186 minutes**. All scopes are accounted for.
Peak sampled total VRAM: **2390.96 MiB (2.34 GiB)**. Final GPU work ended at
03:27:35 Taipei on 2026-11-08, before the 06:30 lease limit. Afterward, nvidia-smi
showed 0% utilization and 498 MiB baseline device memory. GPU denoising reduced
cached Cycles frames from about 18 seconds to about 1.8 seconds without lowering
the 32-sample cap. No local GPU rendering occurred.

The safe text rectangle at impact frame 220 is **(834, 759)–(1097, 815)**,
with top-left image origin. The four projected card corners for that blank area
are also supplied in `skit-edit.json`.

Added files: `skit.py`, `skit-queue.py`, `skit-review.py`, `copy-skit.sh`,
`skit.blend`, `skit-edit.json`, `skit-report.json`, this note, PNGs, contact sheets,
a review MP4, and timing/validation records. README and .gitignore were updated.
Nothing was committed. The only delivery step blocked by this worker's filesystem
is copying the staged sequence to the requested D: destination.
