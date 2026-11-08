# Frontend status

## Sound and compact refused-plea wall — 2026-11-08

No music. All source changes are inside `app/`, no commits. Existing work was preserved. Protected chain/proof/RPC modules, live-chain test scripts, `.env.local` and keys were not edited.

- `lib/sound.ts` owns the lazy AudioContext, master gain, safety compressor, encoded-file/buffer preload, random variant choice and ±5% rate variation. Encoded bytes may preload silently; the context, decoding and synthesis begin only after a gesture. Failed or stale audio never blocks gameplay. The header has a 40px icon toggle, accessible name **Sound on** / **Sound off**, pressed state and `oathroll-sound` preference (`on` / `off`, guarded storage). It fits the existing header on desktop and mobile.
- Cues follow actual UI changes: new ruling/page when the card appears; wax impact at 70% of its drop animation; pen scratch while DC rewrites; refusal at the stamp animation’s contact; throw on Roll; landing as the result appears; crack on setback/disaster when the wax image cracks; one bell when an ending appears. Reduced motion gets one immediately visible refusal impact and no hidden rewrite sound; its wax cue waits until the sealed wax becomes visible. Restoring a saved ruling/ending never replays its evidence. No generic button sounds.
- A 12s synthesised brown-noise loop, low-passed at 550 Hz, has an eight-second amplitude swell and a 3s fade-in. Its peak is roughly 22–24 dB below the main event targets; events duck it 6 dB with a gentle release. A bell low-passed at 1.2 kHz plays at −40 dBFS every 40–90s. Mute, hidden documents and navigation to `/wall`, proof or receipt pages silence the complete mix and cancel bell scheduling. There is no sound before the first gesture. Returning to play after an earlier gesture may resume ambience.
- `SOUND_MAP` is the one mapping object in `lib/sound.ts`. Change the `files` array on a single event line, retaining original Kenney names. `db` sets the peak target, `rate` an optional base rate. Empty files means silence, except rewrite’s `scratch: true` synthesises a 180ms band-passed noise stroke. The filter/envelope can lower actual peaks slightly below these targets. A three-voice cap, master at 0.8 and compressor above the normal event level limit rapid audition overlap.

| Event | Initial mapping (original `.ogg` names) | Peak target / base rate |
| --- | --- | --- |
| Wax pressed | `impactSoft_heavy_000.ogg`, `impactSoft_medium_001.ogg` | −12 dBFS |
| Roll / throw | `dice-throw-1.ogg`, `dice-throw-2.ogg` | −14 dBFS |
| d20 landing | `die-throw-1.ogg`, `die-throw-2.ogg` | −12 dBFS |
| DC rewrite | Synthesised pen scratch | −22 dBFS |
| Refusal stamp | `impactWood_heavy_000.ogg`, `impactWood_heavy_001.ogg` | −9 dBFS |
| Failure crack | `impactWood_light_000.ogg`, `impactWood_light_001.ogg` | −14 dBFS |
| New ruling / restart page | `bookFlip1.ogg`, `bookFlip2.ogg` | −22 dBFS |
| Title’s first Play click | `impactBell_heavy_000.ogg` | −17 dBFS |
| Win | `impactBell_heavy_000.ogg` | −15 dBFS |
| Loss | `impactBell_heavy_000.ogg` | −18 dBFS / 0.8× |
| Distant ambience bell | `impactBell_heavy_000.ogg` | −40 dBFS / low-pass 1.2 kHz |
| Generic buttons | Silent | — |

**Audition:** open `/sounds` directly (unlinked from the game; robots noindex). Each event has a chosen-mapping button and a play button for every candidate, at that event’s level. Ambience has its own on/off button and obeys the header mute. All 58 supplied candidates are shipped for this comparison; normal gameplay uses 13 unique files. No candidates were selected by hearing them. A human still needs to choose variants and assess the pen stroke, sea/bell balance and stamp comfort on speakers/headphones. Actual Safari and iOS listening remain untested.

**Formats and credits:** the imageio-ffmpeg binary was available through `uv` using a `/tmp` cache and the public PyPI index. All 58 Ogg originals have same-basename AAC `.m4a` copies at 96 kb/s. `canPlayType` prefers Vorbis, then checks AAC support; `public/sfx/formats.json` records AAC availability. `scripts/prepare-sfx.mjs` reproduces the copies/conversion and accepts `SFX_FFMPEG`. All three supplied CC0 licenses and a complete filename credit list are in `public/sfx/`; README-frontend also has the required credit line.

The specifically authorised append to `../art/CREDITS.md` could **not** be written: the managed filesystem makes the sibling file read-only (`EROFS`) and approval escalation is unavailable. Its exact append-ready section, including all shipped filenames, is [art/sound-credits-append.md](art/sound-credits-append.md). The sibling original was preserved.

**Wall:** desktop heading is one line at 40–48px; intro is 16px; pleas are 23px italic (22px on mobile) with attempted DC, existing error, local time, failed transaction and Proof on a wrapping 12px mono line. All existing wording is retained. A three-row skeleton replaces the bare loading line, with the same accessible loading announcement and reduced-motion support. Mobile keeps normal list scrolling. `/wall` is included in `scripts/check-fit.mjs`: skeleton/list screenshots, no horizontal overflow, header-control bounds, desktop heading on one line and three complete pleas in the first desktop screen. `OATHROLL_FIT_WALL_ONLY=1` runs just that matrix.

**Validation: PASS.** Mock production build, explicit `npx tsc --noEmit`, all **11** unit tests and the existing gameplay smoke passed. `scripts/check-sound.mjs` passed actual Web Audio checks for the gesture gate, seal/stamp frame alignment, dice, one ending bell, 3s fade, 6 dB ducking, lower/slower loss, stored mute, denied storage, silent evidence routes, actual Ogg/AAC decoding and audition controls. Reduced-motion checks cover visible wax, one stamp, no hidden rewrite and silent saved-state restore. Audition screenshots at 1451×703 and 390×844 have no horizontal overflow.

Full fit verification has **432 passing measurements**, covering all four font sets at all six target viewports, including the wall, gameplay, endings, restart, proof and existing font/storage checks. No recorded viewport failures or browser errors. At 1451×703 the captured third complete plea ends at y≈499; the earlier long-plea fixture ended at y≈530, also within the screen. Desktop wall headings stay on one line. Mobile retains page scrolling.

| Viewport | All four type sets / gameplay | Wall header and controls | Three complete pleas in first screen |
| --- | --- | --- | --- |
| 1451×703 | PASS | PASS | PASS |
| 1366×657 | PASS | PASS | PASS |
| 1536×730 | PASS | PASS | PASS |
| 1280×600 | PASS | PASS | PASS |
| 1920×969 | PASS | PASS | PASS |
| 390×844 | PASS | PASS | Mobile scrolling allowed |

- Definitive combined fit report: `test-results/sound/fit-verification.json`; screenshots: `test-results/fit/<viewport>/<type>/{wall,wall-full,wall-loading,...}.png`. The report asserts complete required-state coverage for each of the 24 viewport/type pairs. Visually reviewed desktop/mobile wall and audition captures, the skeleton, and the six-viewport wall contact sheet at `test-results/sound/wall-viewports.png`.
- Audio report: `test-results/sound/verification.json`; run output: `test-results/sound-check.log`; audition images: `test-results/sound/audition-*.png`. These verify playback mechanics and formats, not perceived sound quality.
- Final mock logs: `test-results/sound-mock-build.log`, `sound-mock-typecheck.log`, `sound-unit.log`, `sound-smoke.log`. Smoke screenshots: `test-results/sound-smoke/`.
- **Left in chain/devnet mode** after `OATHROLL_MOCK=0 node scripts/select-backend.mjs`. Final `npx tsc --noEmit` and `OATHROLL_MOCK=0 npm --ignore-scripts run build` both passed; `lib/backend-selected.ts` confirms `backendMode = "chain"`. Logs: `test-results/sound-chain-{typecheck,build}.log`. `git diff --check` passed. No live gameplay or transactions were exercised.
- Longer combined runs encountered the terminal’s server-session lifetime. Completed checkpoints were preserved; remaining checks ran as bounded per-font processes with their own mock server. `test-results/fit/verification-1451x703.json` and `verification-1366x657.json` supply those complete four-font checkpoints; the other four sizes use `verification-<viewport>-<type>.json`. Earlier interrupted aggregate reports are superseded by `test-results/sound/fit-verification.json`.

Mock tests use isolated `/tmp` stores, local CPU and the already-installed Chromium headless shell revision 1248. Build commands use `npm --ignore-scripts run build` after explicitly selecting the backend: this skips the existing art-sync prehook’s reads outside this worker’s allowed `../art/audio/` source. The actual Next production build runs normally. Test servers were isolated from port 3000. No paid API, LLM, wallet, Solana transaction, GPU, browser download or hosted CI work was used. The converter download was approximately 65 MiB; audio processing and validation are local.

Reproduce audio and wall checks after a mock production build (each starts/stops its own server):

```sh
OATHROLL_MOCK=1 node scripts/select-backend.mjs
OATHROLL_MOCK=1 npm --ignore-scripts run build
OATHROLL_MOCK_DIRECTORY=/tmp/oathroll-sound-review OATHROLL_START_SERVER=production \
  OATHROLL_TEST_URL=http://localhost:3112 PLAYWRIGHT_EXECUTABLE_PATH="$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell" \
  node scripts/check-sound.mjs
OATHROLL_MOCK_DIRECTORY=/tmp/oathroll-sound-review OATHROLL_START_SERVER=production \
  OATHROLL_TEST_URL=http://localhost:3112 OATHROLL_FIT_WALL_ONLY=1 \
  PLAYWRIGHT_EXECUTABLE_PATH="$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell" \
  node scripts/check-fit.mjs
OATHROLL_MOCK=0 node scripts/select-backend.mjs
npx tsc --noEmit
OATHROLL_MOCK=0 npm --ignore-scripts run build
```

Added files: `lib/sound.ts`, `components/sound-control.tsx`, `components/sound-audition.tsx`, `app/sounds/page.tsx`, `app/sound-wall.css`, `scripts/prepare-sfx.mjs`, `scripts/check-sound.mjs`, `public/sfx/*`, and `art/sound-credits-append.md`. Updated header/game/wall integration, layout stylesheet imports, `scripts/check-fit.mjs`, README-frontend and this status. The fit script, font files and other existing changes from the previous pass remain intact.

## Viewport fit and type candidates — 2026-11-08

This section supersedes the earlier document-style play layout and its page-scrolling limitation. All edits are inside `app/`; no commit was made. In-app wording is unchanged.

- Desktop play uses a `100dvh` grid shell with a fixed-height header and shrinking content rows. Stats, the d20 and Roll share a toolbar. Narrative and transaction history share the internally scrolling story column; the composer and ending stay outside it. Narrative auto-scroll targets that column, so it cannot move the page. The face-up ruling, corner wax, four outcomes, DC rewrite and refusal stamp remain.
- Height-based spacing, card heading, die and illustration sizing preserve the controls at short desktop heights. Reading prose is at least 15px, labels/data at least 12px, and refusal evidence stays 13px. Mobile retains normal page scrolling; its stamp stacks beneath DC and the complete plea wraps.
- Proof spacing brings the heading, verdict summary and first check into the first screen. The four checks need at most one screen of scrolling. The open transaction log has a 112px scrolling area, retaining its full evidence.
- Type choices: `?type=fraunces` (Fraunces / Figtree / IBM Plex Mono, default), `?type=garamond` (EB Garamond / Jost / IBM Plex Mono), `?type=newsreader` (Newsreader / Hanken Grotesk / IBM Plex Mono), `?type=sora` (Sora / Figtree / Martian Mono). Add the query to any route, including `/play`. The client sets `<html data-type>` and stores the choice as `oathroll-type` in `localStorage`, guarded with try/catch. The choice survives navigation to proof/receipt pages. Invalid ids are ignored; query selection also works when storage is unavailable. Initialization runs before paint to avoid downloading the default pairing on a different candidate's first visit.
- `next/font/google` self-hosts all candidates with `display: "swap"`, weight 400 and no preloading of unused candidates. Actual fresh-browser requests are four font files per serif pairing and three for Sora. Display, text and mono have fixed jobs; no 700/800 or light weights. The taste-skill type library and font licenses are documented in `CREDITS-FONTS.md`; the seven additional OFL files are under `public/fonts/`. Local Fraunces/Plex TTFs remain because `scripts/make-covers.mjs` needs them.
- `scripts/check-fit.mjs` walks the real mock UI for each pairing and viewport: title, initial declaration, Boldly sealed, handwritten/crossed DC, refusal impact, tempted plea, roll result, subsequent Carefully turns, ending and restart. It additionally restores each of the three ending variants to check their different text lengths. Assertions cover document height, primary-control/card/stats/die bounds, clipping, horizontal overflow, 12px/15px floors, proof geometry, font file budget, preference persistence, denied storage, invalid ids, client navigation and browser errors.
- Screenshots: `test-results/fit/<width>x<height>/<type>/<state>.png`; comparison originals: `test-results/fonts/<type>/{title,sealed,tempted,proof}.png`; labelled four-row contact sheet: `test-results/fonts/compare.png`. `test-results/fit/verification.json` contains the measured geometry and failures. `test-results/fit-final.log` contains the walkthrough and smoke output.

Final validation: **PASS**, with 396 recorded state/viewport/type measurements and no viewport failures or browser errors.

| Viewport (CSS px) | Four type sets | Desktop page overflow | Proof heading, verdict and first check | Four checks within one scroll |
| --- | --- | --- | --- | --- |
| 1451×703 | PASS | 0px | PASS | PASS |
| 1366×657 | PASS | 0px | PASS | PASS |
| 1536×730 | PASS | 0px | PASS | PASS |
| 1280×600 | PASS | 0px | PASS | PASS |
| 1920×969 | PASS | 0px | PASS | PASS |
| 390×844 | PASS | Mobile page scrolling allowed | PASS | PASS |

- Latest mock `npm run build` and `npx tsc --noEmit`: passed.
- Existing Playwright smoke: passed, including immutability, proof tamper detection, refusal evidence, reduced motion, mobile and restart. Output: `test-results/fit-smoke.log`; screenshots: `test-results/fit-smoke/`.
- Final `OATHROLL_MOCK=0 node scripts/select-backend.mjs`, `npx tsc --noEmit`, and `OATHROLL_MOCK=0 npm run build`: passed. **Left in devnet/chain mode**, confirmed by `lib/backend-selected.ts`. Build log: `test-results/fit-devnet-build.log`.
- Final `npm test`: all **11** passed (`test-results/fit-unit-final.log`). `git diff --check`: passed.
- Visually reviewed the 1451×703 comparison set, full-size title/refusal/declaration/result/ending views and a full-page mobile refusal capture. The complete comparison has 16 original 1451×703 screenshots and one labelled contact sheet.
- The terminal's session lifetime interrupted longer combined runs; completed validation uses a separate four-type run per viewport. Each checkpoint is `test-results/fit/verification-<viewport>.json`; all six were checked for complete required-state/type coverage and combined into `test-results/fit/verification.json`. Screenshots and assertions are from the same final mock production build. No outstanding viewport failures.

Validation used the installed Chromium headless shell (revision 1248), local CPU and isolated mock stores under `test-results/fit/`. Test servers used ports 3110/3111 (the script defaults to 3108) and were stopped. Port 3000 and `.env.local` were left alone. Browser gameplay was tested in mock mode as requested; no live-chain gameplay was exercised. No paid API, LLM, Solana transaction, hosted CI, GPU job or browser binary download was used.

Files changed by this pass: `app/layout.tsx`, `app/play/page.tsx`, `app/fit-type.css`, `components/play-game.tsx`, `components/type-preference.tsx`, `scripts/check-fit.mjs`, `CREDITS-FONTS.md`, `README-frontend.md`, `STATUS.md`, and the seven new `public/fonts/OFL-{EB-Garamond,Figtree,Hanken-Grotesk,Jost,Martian-Mono,Newsreader,Sora}.txt` licenses. Protected chain/proof/verification paths, `.env.local`, keys and the two live test scripts were not edited by this pass. Concurrent changes by other workers were left in place.

Reproduce after building in mock mode:

```sh
OATHROLL_MOCK=1 npm run build
OATHROLL_START_SERVER=production OATHROLL_SMOKE=1 \
  PLAYWRIGHT_EXECUTABLE_PATH="$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell" \
  node scripts/check-fit.mjs
OATHROLL_MOCK=0 node scripts/select-backend.mjs
npx tsc --noEmit
OATHROLL_MOCK=0 npm run build
npm test
```

`OATHROLL_FIT_TYPE` and `OATHROLL_FIT_VIEWPORT` optionally restrict a diagnostic run; leave both unset for the complete matrix. `OATHROLL_TEST_URL` can point to an already running mock server; omit `OATHROLL_START_SERVER` in that case. `OATHROLL_SMOKE=1` runs the existing smoke after a passing matrix, using the same mock server.

## UI/UX review implementation — 2026-11-07

Implemented U1–U23 and the full copy/deletion audit from `../../logs/hd_panel/out/claude_uiux_copy/answer.md`. All work stays in `app/`. No commits. `lib/chain/**`, `scripts/local_e2e.ts`, `scripts/devnet_smoke.ts`, `.env.local`, and `keys/` were not edited.

- **U1, U10, U17:** suggestions fill and focus the input. Both stance buttons remain available; Enter submits Carefully. Removed suggestion icons. Trade-offs are `setback: no penalty` and `DC +2 · success: +2 progress · setback: −1 nerve`.
- **U2, U11, U12, U21:** title walkthrough teaches the plea. CTA is **Play**; metadata is **5 TURNS · NO WALLET NEEDED**. Sealing adds the optional-plea instruction, an adjacent **Send plea** button, public-word warning, and grammatical game-wide remaining count. Mobile shows the ruling before the plea composer; before the first ruling, the action composer comes before the empty panel so both stance choices fit in the first screen.
- **U3, U4, U6, U7, U9:** stats lead the right column. No Roll before sealing or after resolution. At desktop heights ≤800px, the die and Roll move above the card; the initial story heading is hidden. The refusal stamp is positioned beside DC, with one clipped quote line and one explorer link. Removed repeated roll/status labels, slogans, the chapter bar and the old table label. History uses seal transaction links.
- **U5, U8, U18, U19, U20:** opening starts with the goal and does not auto-scroll. The large story title disappears after the first declaration. Ending replaces the composer outside the scrolling log, with explicit result, progress, turn/refusal counts and **Play again**. Refusal count persists even after a later untempted reply. Bound reply is indented. Floating sigils and duplicate transaction links are removed. The cracked corner wax remains after rolling.
- **U13–U16, U22, U23:** refused change directly follows proof summary; receipt includes the attempted DC and quoted plea from transaction logs. Proof and receipt naming is consistent. Only explorer links use ↗. Removed illustration notes and all decorative mottos/aphorisms; the review’s retained narrative dialogue and ending titles remain. Wall times use the browser’s timezone and show its short zone label.
- The ruling stays face up with its corner wax seal. Struck-through original DC, handwritten proposed DC, **REFUSED BY SOLANA**, d20, stance choices, all outcome prose, and mock/live distinctions remain.
- The terminology grep has no stale visible terms outside the Wall title. Internal class names, types, contract fields, logs and the existing `oathroll.expedition.v1` browser-storage key remain compatible. To satisfy the explicit visible-term cleanup, retained narrative lines received minimal `ledger → ruling/Solana`, `the chain → Solana`, and `bargain → plea` substitutions. No chain adapter text was edited.

## Copy for the lead’s chain adapter

Final INTRO (copy verbatim):

> Steal the silver clapper from Saltmere's drowned belfry. You need 3 progress before the tide returns in five turns. The Keeper rules on every move.

User-facing backend errors:

| Situation | Final string |
| --- | --- |
| Expired/missing session | `This game expired. Start a new one.` |
| Missing ruling | `Ruling not found.` |
| Game already ended | `This game is over. Start a new one.` |
| Previous ruling not rolled | `Roll the current ruling first.` |
| Plea after rolling | `You can only plead before the roll.` |
| All pleas used | `The Keeper has heard enough from you tonight. (3 pleas per game)` |
| Invalid request | `Invalid request. Check your input and try again.` |
| Server unavailable | `Couldn't reach the server. Try again.` |
| Busy server | `The server is busy. Try again in a moment.` |

Frontend fallback errors:

| Situation | Final string |
| --- | --- |
| Start/restart | `Couldn't start a game. Try again.` |
| Declaration | `The Keeper didn't answer. Try again.` |
| Plea | `Your plea didn't go through. Try again.` |
| Roll | `The roll hasn't come back yet. Roll again to check.` |
| Proof/receipt | `Couldn't load this ruling.` |
| Wall | `Couldn't load refused pleas.` |

Final mock Keeper plea lines for alignment:

- Untempted: `A demand is hardly a plea. Have you mistaken me for a wishing well?`
- Tempted: `Such exquisite judgment. Perhaps the difficulty should be two. Allow me one small correction…`
- Bound: `Ah. The seal holds. Even my finest handwriting cannot persuade Solana.`
- No-send notice: `Not tempted. Nothing sent to Solana.`
- Plea hint: `Optional: talk the Keeper into a lower DC before you roll.`
- Public-word notice: `If he agrees, he sends the change to Solana with your words. The program will refuse it.`
- Remaining count: `{n} plea(s) left this game · short demands won’t work` (singular at 1).

## Validation and artifacts

- `OATHROLL_MOCK=1 npm run build`: passed.
- `OATHROLL_MOCK=1 npm run typecheck`: passed.
- `npm test`: all seven passed, including refusal-count preservation after an untempted reply and restart reset.
- Production Playwright smoke: passed. Updated for fill-only suggestions, the adjacent Send plea button, no pre-seal/post-roll Roll button, first-screen desktop Roll, visible ending/restart, and all revised copy. Existing immutability, idempotence, proof tamper detection, stance rules, three-plea limit, restore, reduced motion, contrast, type-size, overflow and runtime-error checks still pass.
- `OATHROLL_MOCK=0 node scripts/select-backend.mjs && npx tsc --noEmit`: passed. Switched back with `OATHROLL_MOCK=1 node scripts/select-backend.mjs`.
- Browser: already-installed Chromium headless shell revision 1248. No browser download, image-service call, paid API or hosted CI was used.
- Smoke captures: `test-results/uiux/`. Complete three-viewport capture matrix: `test-results/uiux/matrix/` (1920×1080 physical at 125%, 1280×720, 390×844). Includes title, intro, tempted and untempted pleas, Boldly ruling, ending, proof, receipt and Wall. `scripts/screenshot-uiux.mjs` replays recorded mock states for historical sealed screenshots; proof/receipt/Wall use the current mock API.
- Covers: `scripts/make-covers.mjs` updates the stamp to **REFUSED BY SOLANA**, removes the cover em dash and uses factual refusal text. Output remains `art/final/covers/`, with full-size covers, centre crop, previews and real mock card source.
- Final screenshot matrix: **PASS**, 27 viewport captures plus 27 full-page companions. `test-results/uiux/matrix/verification.json` records the geometry checks. Roll fits the first screen after sealing (including Boldly), an untempted plea and a refused plea at both 1080p/125% and 720p. The full ending and Play again fit without scrolling at all three sizes. Mobile deliberately keeps the full ruling before the plea form; its Roll follows the composer.
- Opened and visually inspected viewport versions of the requested gameplay states, ending, proof, receipt and Wall at all three sizes, plus title/intro and the covers/crop/previews. Rechecked the final mobile intro, won ending and both desktop refusal/ending views after the last adjustment. No decorative motto/aphorism elements or stale visible terminology remain. Rendered-copy and internal-arrow checks also pass in the screenshot script.

## Runtime limits

Mock mode uses local authored rules, illustrative transaction signatures and seeded randomness; it makes no Solana, MagicBlock, LLM or wallet calls. Live behavior depends on the lead’s chain adapter. Mock persistence needs a writable filesystem and one shared local instance; preserve `.oathroll/mock-state.json` for receipt URLs. Proof checks are consistency checks, not a production cryptographic verifier; browser hashing requires localhost or HTTPS. The historical 720p page-scrolling limitation is superseded by the viewport-fit section above. Mobile uses page scrolling; desktop narrative/history scroll only inside their column.
