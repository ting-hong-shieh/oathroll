# Oathroll Blender art — complete

Completed 2026-11-07, Taipei. All rendering used Blender 5.2.3 Cycles CUDA on the
RTX 2070 SUPER through the required `flock`, `taskset -c 14-15`, and `nice -n 19`
wrapper. No renders ran in parallel. All batches stayed well below 30 minutes;
the longest observed successful batch was approximately 77 seconds.

## Produced files

| File | Resolution / frames | Final render time |
| --- | --- | --- |
| `renders/hero_desk.png` | 1920×1080 | 52.52 s |
| `renders/cover_1120x560.png` | 1120×560 | 15.53 s |
| `renders/d20_spin/0001.png`–`0048.png` | 48 × 512×512, RGBA | 325.57 s total |
| `renders/d20_spin.webp` | 512×512, 48 frames, alpha, infinite loop, 2 seconds | locally encoded |
| `renders/seal_intact.png` | 1024×1024, RGBA | 25.90 s |
| `renders/seal_cracked.png` | 1024×1024, RGBA | 23.69 s |
| `renders/d20_rest.png` | 1024×1024, RGBA | 21.09 s |

Recorded render time: 7 min 44 s for the final assets; 10 min 45 s including
previews and revisions. Detailed per-render timing, sample counts, and memory
measurements are in `renders/render-times.jsonl`. Startup, scene construction,
transfers, and encoding are outside these timings.

The web-ready files are in **`art/blender/final/`**:

- `blender_hero_desk.webp`
- `blender_cover.webp`
- `seal_intact.webp`
- `seal_cracked.webp`
- `d20_rest.webp`
- `d20_spin.webp`
- `manifest.json` with dimensions and byte sizes

The requested sibling `art/final/` lies outside the explicit work boundary, so
the web copies are staged in `art/blender/final/` for integration. The six WebP
files total approximately 565 KiB. Stills use quality 85 and preserve alpha.
The animated WebP replaces WebM because ffmpeg is unavailable on the remote host.

Four small native scenes are local: `oathroll-hero.blend`, `oathroll-seal.blend`,
`oathroll-d20.blend`, and `oathroll-d20-spin.blend`. The spin scene contains
keyframes 1–49, displays frames 1–48 at 24 fps, and returns to its initial
orientation on frame 49. The script reconstructs the cracked seal from the
intact scene using a jagged bisect and separated fragments.

Scripts: `oathroll.py`, `render-queue.py`, and `package-assets.py`.
Usage and reproduction commands are in `README.md`.

## Visual and technical verification

- Downloaded and viewed the final hero, cover, seal pair, resting die, and all
  48 spin frames in a contact sheet. Reviewed the decoded WebP animation too.
- Revised camera framing, warm/cold balance, water ripples, holder visibility,
  cover lens, and seal exposure after inspecting renders.
- Hero keeps a dark left third for a later title. The wider cover retains the
  moon and sealed card. All pages, die faces, and props have no text or numerals.
- The seal has eight notched radial spokes. Both states share the same camera,
  lights, exposure, and dimensions; only the fracture and fragment transforms differ.
- Validated all required dimensions, all 48 transparent PNG frames, transparent
  studio WebPs, and the animated WebP's alpha flag, 48 frames, 2000 ms duration,
  512×512 canvas, and infinite loop setting. Frame delays repeat 42/41/42 ms.
- All 48 independently decoded WebP alpha masks exactly match their source PNG
  masks. Every animation frame replaces the full canvas without blending.
- Peak measured process RAM: **2291.9 MiB (2.24 GiB)**. Highest sampled total
  device VRAM use: **1966.13 MiB (1.92 GiB)**, including other device allocations.
  Both are below the requested limits. GPU memory was sampled every 250 ms.
- No local file exceeds 15 MB. Large superseded scene backups remain remote.
- All geometry and materials are original and procedural. No downloaded models,
  textures, fonts, or other external art were used; no external credit append is needed.

## Issues encountered

- OptiX initialization failed with error 7804. CUDA successfully rendered every
  asset, with CPU rendering disabled. `nvidia-smi` was absent from PATH; memory
  measurements used NVML directly. No CUDA OOM or driver crash was reported.
- The original compositor setup used a removed `Scene.node_tree` API. Removed
  that optional setup before rendering; final images use direct Cycles lighting.
- Several local SSH/render sessions received SIGTERM (exit 143), including the
  serial queue. The cause was not established. Some active frames finished and
  were saved after the client disconnected. Checked the GPU lock, process state,
  saved files, and render records before resuming missing frames. No frames are
  missing from the final sequence, and the final seal pair has matching exposure.
- A generic ImageMagick `-coalesce` animation preview accumulated old alpha across
  no-blend frames. Final encoding uses independent full-canvas replacement frames,
  with exact alpha-mask comparison and a directly decoded contact sheet.
