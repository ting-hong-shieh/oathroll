# Brand and documentation assets

## Style brief

Use ink and vellum, a vermilion seal, restrained gold rules, and Fraunces lettering.
The mark is a wax seal over a ruling card, with a single-colour version for small
uses. The turn diagram gives each stage one tinted column, an aligned pair of
white cards, and a dark title band. A dashed branch carries the optional plea to
`TableSealed`; the solid path continues to the roll and browser verification.
Keep the existing game art visible and the text large enough to read at its
displayed size.

## Files and sources

| Asset | Source and use |
| --- | --- |
| [`brand/mark.svg`](brand/mark.svg), [`brand/mark-mono.svg`](brand/mark-mono.svg) | Hand-written ruling-card and wax-seal geometry; checked at 16 px. The monochrome mark uses `currentColor` and transparent cutouts. |
| [`brand/wordmark.svg`](brand/wordmark.svg) | Fraunces lettering, converted to paths. |
| [`brand/lockup.svg`](brand/lockup.svg), [`brand/lockup-dark.svg`](brand/lockup-dark.svg) | Mark and wordmark on opaque vellum and ink backgrounds. |
| [`readme-banner.svg`](readme-banner.svg) | Hand-written SVG with Fraunces text outlines; no external fonts or images. |
| [`hero.png`](hero.png) | Existing [`cover_1120x560.png`](../../art/final/covers/cover_1120x560.png), cropped to `(0, 0, 1120, 512)` to omit its small footer, resized with Lanczos to 1600 × 731, and saved as an optimized PNG. |
| [`screenshot-refused-plea.png`](screenshot-refused-plea.png) | Unedited 1536 × 864 frame from the devnet gameplay recording of 8 Nov 2026 (chain mode, no mock labels), saved as an optimized PNG. |
| [`social-preview.png`](social-preview.png) | Existing [`hero_B.png`](../../art/generated/hero_B.png), resized and cropped, with a dark overlay and code-drawn Fraunces text. 1280 × 640; key text stays between y=192 and y=448. |
| [`turn.png`](turn.png) | TikZ source [`turn.tex`](turn.tex), shared definitions [`figstyle.tex`](figstyle.tex), rendered at 200 dpi. The refusal card uses the Font Awesome 5 ban glyph via `fontawesome5`; other icons are code-drawn. |

There was no new image generation for these assets. Existing art provenance is
in [`art/CREDITS.md`](../../art/CREDITS.md); the original assets and these
derivatives are covered by the repository's [MIT license](../../LICENSE).

Fraunces is by Undercase Type; IBM Plex Mono is by IBM. Their copyright notices
and SIL OFL 1.1 licenses remain in [`app/public/fonts/`](../../app/public/fonts)
and are linked from the [font credits](../../app/CREDITS-FONTS.md). Public Sans
is bundled in [`fonts/`](fonts) with its [OFL license](fonts/OFL.txt). The SVGs
contain outlines rather than font binaries; the PDF figure embeds TrueType fonts.

## Rebuild

From the repository root, for the brand set, README banner, hero, and social preview:

```bash
uv run -q --no-project --with pillow --with fonttools python docs/assets/build-assets.py
```

For the turn diagram:

```bash
mkdir -p /tmp/oathroll-figures
cd docs/assets
~/.local/bin/tectonic turn.tex --outdir /tmp/oathroll-figures
cd ../..
uv run -q --no-project --with pymupdf --with pillow python docs/assets/render-turn.py /tmp/oathroll-figures/turn.pdf
```

Both scripts put display-size review previews in `/tmp/`. Keep all work on the
current CPU; neither rendering path needs a GPU. `type-measurements.json` records
the social preview's text measurements when the cover is rebuilt.
