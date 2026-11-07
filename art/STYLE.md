# Oathroll — Ledger & Lamplight

Style A is the default. Style B is an alternate hero only. The contact sheet has A on the left and B on the right, with no labels baked in.

## Exact shared style A prompt prefix

```text
Use case: illustration-story. Original Oathroll game art, Ledger & Lamplight. Painterly cinematic dark fantasy, rich oil-paint surfaces and bold deliberate brush masses, strong value contrast, readable silhouettes, restrained texture without film grain or tiny noise. Ink #14110F, Soot #221C18, Vellum #EDE3CF, faded ink #8A7F70, vermilion wax #B8322A, gilt #C9A24A, verdigris #3E8E7E; cold sea-blue darkness against one warm candlelight source. Eerie, melancholy, wondrous, never gory. Entirely original designs. Absolutely no text, letters, numbers, writing, typographic runes, logos or watermarks; any ledger pages are completely blank and wax seals bear only a plain abstract circle.
```

The prefix above was used verbatim for hero A, all four scenes and the Keeper. The vellum uses a dedicated seamless-texture prompt. Hero B uses hero A as its composition reference and its own engraving prompt. Every complete prompt is in CREDITS.md.

## Palette

| Token | Hex | Role |
| --- | --- | --- |
| Ink | #14110F | Main backgrounds, overlays, text on cards |
| Soot | #221C18 | Cloth, desk shadows, secondary surfaces |
| Vellum | #EDE3CF | Card faces, light UI text |
| Faded ink | #8A7F70 | Muted card text, secondary rules |
| Vermilion wax | #B8322A | Sealing and commitment actions |
| Gilt | #C9A24A | Candle highlights, brass, key accents |
| Verdigris | #3E8E7E | Sea glass and verified UI state |

Cold blue is environmental moonlight, not a replacement for the UI palette. Verification meaning must be supplied by code; the illustrations do not encode chain status. One principal warm light against cold ambient moonlight; hero window echoes the foreground candle. Large painted forms, no added grain, and restrained texture.

## Frontend placement and crops

Use final/*.webp in the app. Keep PNGs as source assets. Positions below are CSS object-position values for modest cropping, not coordinates of individual objects. Preserve 16:9 for story art and 4:5 for Keeper wherever possible.

| Base name | Placement | Suggested position / focal area | Text treatment |
| --- | --- | --- | --- |
| hero_A | Landing screen / scene introduction | 60% 50%; tower at right, candle and seal along bottom | Copy in upper-left/middle-left; Ink gradient 65% at left to 10% at right |
| hero_B | Alternate landing art | Same as A; matching composition | Left Ink overlay 60–75%; engraving is higher contrast |
| hero_AB_side_by_side | Art direction review only | Contain whole 32:9 sheet, A left / B right | No overlay or baked labels |
| scene_ladder | Beat 1: climb | 68% 50%; Wren and ladder at right, retain high bell opening | Left Ink gradient 50–65%; avoid copy on lantern |
| scene_ghost | Beat 2: bell-ringer | 65% 45%; ghost at right, Wren lower-left | Short copy upper-left with 45–60% Ink; long narrative belongs below art |
| keeper | Beat 3 / ruling and sealing panel | 50% 50%; preserve hood, both hands, seal and candle | Put dialogue beside or below portrait; 65–80% Ink panel if overlapping |
| scene_clapper | Beat 4: theft | 68% 45%; clapper centre-right, reaching hand below | Upper-left with 45–60% Ink; do not obscure silver bulb |
| scene_tide | Beat 5: escape | 70% 45%; Wren at right, surge along bottom | Upper-left with 55–70% Ink; avoid foam beneath small text |
| vellum_tile | Card face / blank ledger UI | Repeat at 512px 512px CSS background-size initially | Ink text directly on vellum; no darkening |

Overlay percentages are starting points, not measured accessibility guarantees. Check rendered text contrast and raise the local panel opacity as needed. A suitable hero overlay is linear-gradient(90deg, rgba(20,17,15,.65), rgba(20,17,15,.10)). Keep labels, dice values, rulings, and seal state as HTML/SVG supplied by code.

On narrow screens use a separate text block under the image. A portrait crop of a landscape loses narrative context; especially do not crop both the hero's tower and seal away. Keeper should retain its full 4:5 frame.

## Delivery and processing

Built-in image_gen.imagegen was used for all eight generated assets. The tool does not expose a selectable size argument or model identifier. Requested maximum sizes in the prompts; actual landscapes arrived at 1672×941 and Keeper at 1122×1402. Delivery PNGs are centre-trimmed by a few edge pixels to exact 1664×936 (16:9) and 1120×1400 (4:5). There is no upscaling. Vellum remains native 1254×1254. The A/B sheet is 1920×540 with each panel downscaled to 960×540 using Pillow Lanczos.

WebP copies use quality 82 and method 6, with maximum widths 1920 landscape and 1200 portrait. Native delivered assets are smaller than these limits. No darkening is baked into the images. The 2×2 vellum repeat proof is a 768×768 preview; visual review found no visible joins, and native edge mean differences were approximately 1–2 levels out of 255 per channel. No deterministic seam blending was applied.

Regenerate derivatives with a Python environment containing Pillow: python export-assets.py --all. Provenance JSON files record original tool output paths and exact prompts; CREDITS.md is the durable human-readable log.

