# Oathroll art status

Complete. All requested deliverables are saved inside this art/ directory. Style A is the default; hero B remains available for selection.

Completed (UTC): 2026-11-07T13:57:00.733493+00:00

Eight built-in image generations; no paid API-key fallback. Model identifier and monetary cost are not exposed by the built-in tool. Hero pair and comparison were ready within the requested 15-minute window.

## Image inventory

| File | Dimensions | Bytes |
| --- | --- | ---: |
| `generated/hero_A.png` | 1664×936 | 2,131,079 |
| `generated/hero_AB_side_by_side.png` | 1920×540 | 1,771,231 |
| `generated/hero_B.png` | 1664×936 | 2,863,454 |
| `generated/keeper.png` | 1120×1400 | 2,149,135 |
| `generated/scene_clapper.png` | 1664×936 | 1,866,257 |
| `generated/scene_ghost.png` | 1664×936 | 2,121,714 |
| `generated/scene_ladder.png` | 1664×936 | 2,101,551 |
| `generated/scene_tide.png` | 1664×936 | 2,261,008 |
| `generated/vellum_tile.png` | 1254×1254 | 1,544,033 |
| `generated/vellum_tiling_check.png` | 768×768 | 235,071 |
| `final/hero_A.webp` | 1664×936 | 127,062 |
| `final/hero_AB_side_by_side.webp` | 1920×540 | 180,488 |
| `final/hero_B.webp` | 1664×936 | 322,950 |
| `final/keeper.webp` | 1120×1400 | 121,126 |
| `final/scene_clapper.webp` | 1664×936 | 92,728 |
| `final/scene_ghost.webp` | 1664×936 | 125,970 |
| `final/scene_ladder.webp` | 1664×936 | 123,046 |
| `final/scene_tide.webp` | 1664×936 | 155,908 |
| `final/vellum_tile.webp` | 1254×1254 | 7,986 |
| `final/vellum_tiling_check.webp` | 768×768 | 3,266 |

## Supporting files

- `CREDITS.md`: full prompt and UTC provenance for every generated image, plus processing notes.
- `STYLE.md`: exact shared prompt prefix, palette, frontend placement, focal points, and overlay guidance.
- `STATUS.md`: this delivery report.
- `manifest.json`: machine-readable image inventory with dimensions and byte sizes.
- `export-assets.py`: repeatable Pillow conversion, aspect normalization, provenance import and A/B-sheet generation.
- `requirements.txt`: Pillow dependency pin.
- `generated/hero_A.provenance.json`: exact prompt and original tool output location.
- `generated/hero_B.provenance.json`: exact prompt and original tool output location.
- `generated/keeper.provenance.json`: exact prompt and original tool output location.
- `generated/scene_clapper.provenance.json`: exact prompt and original tool output location.
- `generated/scene_ghost.provenance.json`: exact prompt and original tool output location.
- `generated/scene_ladder.provenance.json`: exact prompt and original tool output location.
- `generated/scene_tide.provenance.json`: exact prompt and original tool output location.
- `generated/vellum_tile.provenance.json`: exact prompt and original tool output location.

## Validation and limits

- All 20 PNG/WebP files decoded successfully. Exact 16:9 and 4:5 delivery ratios checked.
- Quality 82 WebPs total 1,260,530 bytes; no upscaling.
- Native tool outputs were 1672×941 landscapes and 1122×1402 portrait despite maximum-resolution prompts; a few edge pixels were trimmed for exact aspect ratios. Delivered sizes are 1664×936 and 1120×1400.
- Reviewed all eight generated images: no visible lettering, logos, watermarks or gore. Keeper face remains fully hidden.
- Vellum has low contrast, a clean centre and no visible joins in the included 2×2 repeat proof. Native mean edge differences are about 1–2 RGB levels out of 255.
- WebP vellum is only 7,986 bytes; use repeat, initially at 512px CSS tile size.
- Overlay recommendations are starting values; text contrast must be checked in the actual frontend.
- The temporary .venv and .uv-cache created for export were removed. Pre-existing blender/ and managed hidden directories were left alone.
- Built-in generation writes its original image to its service-managed default path; every requested asset has been copied here. No shell commands wrote project files outside art/.
