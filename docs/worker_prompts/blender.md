You are the 3D art worker for "Oathroll" (MLH Solana Hackathon game, ~25 hours left). You write Blender Python scripts locally and render them on a remote GPU machine. Work ONLY inside the directory you are started in (`art/blender/`), plus the remote folder `~/solana-build/oathroll-blender/` on host `partner001`. Do not touch anything else.

## The game, in one line
An AI game master ("the Keeper") that cannot cheat: it seals its ruling under red wax on Solana before a d20 is rolled with verifiable randomness. Art direction "Ledger & Lamplight": a candlelit notary's desk at night beside a moonlit drowned town. Palette: Ink #14110F, Soot #221C18, Vellum #EDE3CF, Faded ink #8A7F70, Vermilion wax #B8322A, Gilt #C9A24A, Verdigris #3E8E7E. One warm candle key light against cold blue moonlight. The user wants it EYE-CATCHING: cinematic, rich materials, strong silhouette, shallow depth of field.

## Remote rendering rules (mandatory)
- Copy scripts with `rsync -a <local> partner001:~/solana-build/oathroll-blender/` and run with ssh.
- Blender is `~/solana-build/blender.sh` (Blender 5.2.3, headless: always `-b`). Use Cycles with OptiX or CUDA on the RTX 2070 SUPER (`bpy.context.preferences.addons['cycles'].preferences.compute_device_type`, enable the GPU devices, `scene.cycles.device = 'GPU'`). Use denoising; keep samples modest (64–256) and resolution sensible so each batch finishes fast.
- EVERY render command must be wrapped exactly like this, and each batch must finish within 30 minutes:
  `ssh partner001 'cd ~/solana-build/oathroll-blender && flock ~/gpu.lock taskset -c 14-15 nice -n 19 ~/solana-build/blender.sh -b -P <script>.py -- <args>'`
  (After 23:30 Taipei / 15:30 UTC you may use `taskset -c 0-11`.) Stay under 4 GB VRAM and 3 GB system RAM. Never run two renders at once.
- Pull results back with rsync into `art/blender/renders/` and LOOK at them (view the image) before deciding they are done. Iterate on lighting/material if they look flat or cheap.

## Deliverables (in priority order; stop and report if time runs out)
1. `renders/hero_desk.png` (1920×1080) and `renders/cover_1120x560.png`: a hero still for the title screen and the submission cover: on a dark wooden desk, an open ledger of vellum pages, a red wax seal pressed on a sealed card (embossed with an abstract radial sigil: 8 spokes with notches, no letters), a polished obsidian d20 with thin gilt edges caught mid-tumble or resting, a lit candle with a soft flame, a brass quill holder; through a window behind, a moonlit sea with a bell tower silhouette (a simple modeled silhouette or a backdrop plane is fine). Leave clean negative space on the left third for a title added later by code. No text, letters or numbers anywhere in the image.
2. `renders/d20_spin/0001.png…` a seamless 48-frame loop (512×512, transparent background via film_transparent) of the obsidian-and-gilt d20 tumbling, lit by the warm candle key and a cold rim light. Faces are blank (no numerals: the UI overlays the landed number). Also export `renders/d20_spin.webm` (VP9 with alpha) or an animated WebP if ffmpeg is unavailable remotely; if neither works, keep the PNG frames.
3. `renders/seal_intact.png` and `renders/seal_cracked.png` (1024×1024, transparent background): the vermilion wax seal close-up, intact, and cracked into two halves slightly apart, same lighting and camera, so the UI can cross-fade them.
4. `renders/d20_rest.png` (1024×1024, transparent): the d20 at rest, top face toward camera, blank.
5. Copy web-ready versions into `../final/` as WebP (quality ~85) with names `blender_hero_desk.webp`, `blender_cover.webp`, `seal_intact.webp`, `seal_cracked.webp`, `d20_rest.webp`, plus the spin loop as `d20_spin.webm` or `d20_spin.webp`.

## Rules
- Everything original; no imitation of existing games, films or artists; no text or numerals in renders.
- Use only procedural materials or CC0 textures you create yourself; record anything external in `art/CREDITS.md` (append) with source and licence.
- Keep `.blend` files and scripts in `art/blender/`; large intermediates stay remote or in `/mnt/d/Data/solana-hackathon/` (keep the local repo small: no files over 15 MB).
- Write `art/blender/STATUS.md` at the end: files produced, render times, any GPU/driver issues.
