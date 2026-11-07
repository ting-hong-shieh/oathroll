You are the frontend worker for "Oathroll", a hackathon game (MLH Solana Hackathon; about 26 hours left, so ship a polished vertical slice, not a platform). Work ONLY inside the directory you are started in (`app/`). Never touch `../program`, `../art` (read-only for you: you may read `../art/final/*` and `../art/STYLE.md` and copy assets into `app/public/art/`), or anything else. Never print or commit secrets; `.env.local` exists and must stay untracked.

## Product in one paragraph
An AI game master ("the Keeper") that cannot cheat. The player types an action. The Keeper writes a ruling: action kind, a DC inside a fixed band, and four outcome rows (disaster on a natural 1, setback below DC, success at or above DC, triumph on a natural 20), each with mechanical effects. The ruling is sealed on Solana under a wax seal BEFORE any randomness exists. Then a d20 is rolled with verifiable randomness (MagicBlock VRF) and the Solana program, not the AI, selects the row and applies the effects. The player can read the rows they did not roll. A "bribe" beat shows the AI trying to amend a sealed ruling and the chain refusing it (error `TableSealed`).

Scene: "The Drowned Belfry". Wren, a bell-thief, climbs the bell tower of drowned Saltmere at low tide to steal the silver clapper. Stats: Nerve 3 (lose at 0), Tide 5 (each roll costs 1; tide returns at 0), Progress 0/3 (win at 3). Suggested action chips: "Climb the kelp-slick ladder", "Sweet-talk the bell-ringer's ghost", "Slip the Keeper a coin to let me win" (the bribe), "Pry the silver clapper loose".

## Stack (fixed)
Next.js (latest stable 16.x, App Router, TypeScript), React, plain CSS modules or one global CSS with tokens, Zod. No UI kit, no Tailwind, no wallet adapter. `npm` as package manager. Self-host fonts: Fraunces (narration/display) and IBM Plex Mono (hashes, slots, proof), both SIL OFL; put the OFL texts in `app/public/fonts/` and credit them in `app/CREDITS-FONTS.md`. Use `next/font/local` or @font-face.

## Visual direction "Ledger & Lamplight" (must look striking in a 1080p demo video)
Tokens: Ink #14110F (page), Soot #221C18 (panels), Vellum #EDE3CF (cards, narration), Faded ink #8A7F70 (secondary), Vermilion #B8322A (wax, danger), Gilt #C9A24A (die number, highlights), Verdigris #3E8E7E (verified only). Never pure #000/#fff, no neon, no gradients on UI chrome, no bouncy easing except the wax drop overshoot. Max 2 fonts. Narration ≥ 22px, max ~62ch. Truncate signatures like `3xQf…9aK`. No spinners: the die's idle tumble is the loading state. No toast notifications.
If `../art/final/` contains images (hero, scenes, keeper, vellum tile), use them: hero on the title screen, the current scene image as a darkened backdrop behind the story column (cross-fade between beats), the vellum tile on cards. If they are not there yet, use solid tokens and keep the slots so images can be dropped in later (`public/art/<name>.webp`).

## Screens
1. `/` title: hero image, "Oathroll" (Fraunces), subtitle "An AI game master that can't cheat", small "MLH Solana Hackathon 2026 · devnet" in Plex Mono, a "Begin at low tide" button.
2. `/play`: two columns (story 62%, table 38%), input bar at bottom. Story column: narration log (past turns fade to Faded ink; each resolved turn has a tiny sigil in the margin linking to its proof). Table column: the current sealed card, the d20, a mono status line, stats (Nerve/Tide/Progress as small icon rows, not progress bars), and a "Ledger" list (one line per check: seq, seal slot, roll, ✓ verify link).
3. `/verify/[check]`: full proof view: big sigil, the sealed table exactly as committed with the band (e.g. "DC 14 (band 10–16 ✓)") and the landed row marked, four checks ticking in 250ms apart with explorer links: hash/table matches account data, seal slot < request slot, randomness came from the VRF callback tx, program result = landed row. A timeline: draft → seal → request → resolve with slots. If any check fails it turns Vermilion and the sequence stops.
4. `/r/[check]`: shareable receipt card (fits a screenshot): action, DC, roll, landed outcome text, "Verify" and "Try this challenge" buttons.

## Signature animations (timings in ms)
- Seal: card shows face-up with DC + four rows (0), flips face-down (600, rotateY 450), wax drops (1050, scale 0→1.15→1 over 280) with an SVG sigil embossed; when the seal tx signature arrives it writes itself around the seal rim in Plex Mono 9px at 12ms/char, then caption "Sealed · slot N".
- Sigil: deterministic radial SVG from the first 16 bytes of a hex/base58-decoded hash: 8 spokes, length and notch from bytes. Same input → same sigil. Implement in `lib/sigil.ts` (pure function returning SVG path data), with a tiny unit test if quick.
- Roll: "Roll" starts an idle tumble (2D icosahedron outline, 1200ms loop) with caption "awaiting the oracle…"; minimum 900ms even if the result is fast; on result: 700ms deceleration, land with number in Gilt, hold 150, seal cracks into two halves sliding apart 400, card flips face-up 450, landed row gets a Verdigris underline sweep 300, then narration types in.
- Bribe: the card gets a red "REFUSED BY THE CHAIN" stamp slamming in (scale 1.4→1, 180ms) with the error name `TableSealed` and the failed tx/simulation link in mono beneath.
- Respect `prefers-reduced-motion`.

## Data layer: build against this API, with a mock implementation
Create `lib/api.ts` with typed client functions and Zod schemas for these route handlers (the real chain/LLM implementation will be written by someone else later; you write MOCK handlers so the whole game is playable now):
- `POST /api/session` body `{ player: string }` → `{ session: string, title: string, intro: string, stats: { nerve: number, tide: number, progress: number, goal: number } }`
- `POST /api/declare` body `{ session: string, actionText: string }` → `{ check: CheckView, keeperLine: string }` where the check is already sealed.
- `POST /api/roll` body `{ session: string, check: string }` → `{ check: CheckView, stats: Stats, narration: string }`
- `POST /api/bribe` body `{ session: string, check: string }` → `{ attempted: { dc: number }, error: "TableSealed", tx: string | null, logs: string[], keeperLine: string }`
- `GET /api/check/[check]` → `{ check: CheckView }`
`CheckView = { pubkey, seq, actionKind: 0|1|2|3 (explore, persuade, sneak, force), actionText, dc, band: [lo, hi], outcomes: { text, nerveDelta, progressDelta }[4], status: "draft"|"sealed"|"pending"|"resolved", amendments, slots: { draft, seal, request?, resolve? }, txs: { draft, seal, request?, resolve? }, roll?, outcome?: 0|1|2|3, randomness?: hex string }`.
Put mock logic in `lib/mock/*.ts`, selected when env `OATHROLL_MOCK=1` (default to mock if the real implementation module `lib/chain/index.ts` does not exist yet). Mock should feel real: fake base58 signatures, increasing slots, 1–3 s simulated VRF delay, a seeded d20, Keeper lines with personality (dry, archaic, a little smug), and outcome tables written for the four suggested actions plus a generic fallback for free text. Explorer links: `https://explorer.solana.com/tx/<sig>?cluster=devnet`.
Keep game-state reducers pure (`lib/game.ts`): run ends at Nerve 0 (lose), Tide 0 (tide returns), Progress 3 (win), each with a short ending screen.

## Quality bar
- `npm run build` must pass with no type errors. Run it before you finish.
- Keyboard: Enter submits the action; the Roll button is focusable.
- Layout designed for 1920×1080 at 125% zoom (demo capture); also usable at 1280×720. Mobile can be basic.
- Write `app/README-frontend.md`: how to run (`npm install`, `npm run dev`), env vars, the API contract, and where to plug the real implementation.

Commit nothing (the lead commits). When finished, write `app/STATUS.md` listing what works, what is mocked, and known issues.
