# Self-hosted fonts

The four selectable pairings use `next/font/google` with `display: "swap"`, weight 400, and no preloading of unused candidates. Google Fonts are downloaded at build time and served by the app; the browser makes no requests to Google. Display roman and italic plus text roman and mono roman need at most four font files per active set (Sora has no italic file).

| Set | Display | Text | Data |
| --- | --- | --- | --- |
| `fraunces` | Fraunces | Figtree | IBM Plex Mono |
| `garamond` | EB Garamond | Jost | IBM Plex Mono |
| `newsreader` | Newsreader | Hanken Grotesk | IBM Plex Mono |
| `sora` | Sora | Figtree | Martian Mono |

All nine families are distributed under SIL Open Font License 1.1. Full copyright notices and licenses are in `public/fonts/OFL-*.txt`. Sources, checked 2026-11-08:

- [Fraunces](https://github.com/google/fonts/tree/main/ofl/fraunces)
- [Figtree](https://github.com/google/fonts/tree/main/ofl/figtree)
- [IBM Plex Mono](https://github.com/google/fonts/tree/main/ofl/ibmplexmono)
- [EB Garamond](https://github.com/google/fonts/tree/main/ofl/ebgaramond)
- [Jost](https://github.com/google/fonts/tree/main/ofl/jost)
- [Newsreader](https://github.com/google/fonts/tree/main/ofl/newsreader)
- [Hanken Grotesk](https://github.com/google/fonts/tree/main/ofl/hankengrotesk)
- [Sora](https://github.com/google/fonts/tree/main/ofl/sora)
- [Martian Mono](https://github.com/google/fonts/tree/main/ofl/martianmono)

The existing local Fraunces and Plex TTFs remain for `scripts/make-covers.mjs`; the game no longer loads them.

Pairings and size/tracking adjustments follow the [taste-skill type library](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/library/type.json), read in full on 2026-11-08. The library's relative display scales are 1, 1.12, 1.06 and .9 respectively. Its license is MIT, copyright (c) 2026 Leonxlnx; no library code or JSON is redistributed here.
