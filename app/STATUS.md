# Frontend status

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

Mock mode uses local authored rules, illustrative transaction signatures and seeded randomness; it makes no Solana, MagicBlock, LLM or wallet calls. Live behavior depends on the lead’s chain adapter. Mock persistence needs a writable filesystem and one shared local instance; preserve `.oathroll/mock-state.json` for receipt URLs. Proof checks are consistency checks, not a production cryptographic verifier; browser hashing requires localhost or HTTPS. Long outcome/proof content uses page scrolling at 720p/mobile, while the desktop Roll action and ending remain visible.
