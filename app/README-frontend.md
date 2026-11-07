# Oathroll frontend

**You can talk the AI game master into cheating. Solana won’t let it.** A playable Drowned Belfry expedition, built with Next.js 16.4.5, React, TypeScript, Zod, plain CSS, and local Fraunces / IBM Plex Mono fonts.

## Run in mock mode

Use Node 20.9+ from this `app/` directory. Leave the existing `.env.local` and signing material alone.

```sh
OATHROLL_MOCK=1 npm run dev
# Or:
OATHROLL_MOCK=1 npm run build
npm start
```

`predev` / `prebuild` sync supplied art and generate ignored `lib/backend-selected.ts`. `OATHROLL_MOCK=1` forces the local simulation; unset / `0` selects the existing chain adapter. Restart or rebuild after switching. Do not run dev and build concurrently against the same `.next` directory. Headers, the wall, proof, and receipts identify mock evidence; mock Explorer signatures do not exist on devnet.

## Demo flow

1. Begin at low tide. Nerve 3, Tide 5, Progress 0; win at Progress 3, lose at Nerve 0 or Tide 0.
2. Type an action. **Carefully ↗** is the default for Enter and suggestion chips: Keeper’s base DC, setback costs only time, success +1 Progress. **Boldly ↗** adds DC +2, setback −1 Nerve, success +2 Progress. Both stances give +2 Progress on a natural 20; a natural 1 remains a disaster. Each roll spends one Tide. The sealed card marks bold actions **BOLD**.
3. Read the face-up ruling and all four futures. While sealed and unrolled, the input becomes **Whisper to the Keeper…**. Write your own plea, or fill one with **Offer a gold coin**, then press **Persuade** beside **Roll the die**. Every response consumes one of three pleas for the whole expedition. The count survives browser restore and new turns.
4. In mock mode, “Let me win.” produces scorn: **Not tempted — nothing was sent**, no transaction, no stamp. A plea over 40 characters, or one mentioning bells / handwriting / calligraphy, tempts him. The preset tempts him too. The real adapter uses the Keeper LLM.
5. A tempted reply types out, the displayed sealed DC is crossed out and a handwritten DC appears, **REFUSED BY THE CHAIN** lands with the player’s words and a transaction link, the proposed DC smudges away, and the original DC returns before the Keeper’s bound line. This takes about four seconds including mock response latency. The actual check, commitment, DC, and outcomes never change. Reduced motion reveals the final refusal immediately after the response.
6. Roll the die. Open **Verify** in the ledger to see table consistency, seal/request order, callback evidence, and the landed row. Refused-amendment logs retain `Program log: Plea: …` even if a subsequent plea fails to tempt him. A receipt links to the proof and the wall.
7. **The Wall** in the header opens `/wall`: recent tempted, refused bargains across expeditions, with player words, attempted DC, Taipei time, failed transaction and check proof links. Empty, loading, and retry states are supported. Endings also link to the wall.

The target is 1920×1080 at 125% scale (1536×864 CSS pixels); 1280×720 and 390px mobile are checked. Long rulings use page scrolling. The narration history scrolls independently. All sealed futures are readable; after resolution, the landed prose remains expanded and other rows can be unfolded. Evidence labels are at least 12px, refusal quotes 18px, and stance trade-offs 12px.

## Backend contract and routes

`lib/schemas.ts` defines validation, including `StanceSchema`, `BribeResponseSchema`, and `WallResponseSchema`. `lib/backend-contract.ts` requires six functions: `createSession`, `declareAction`, `rollCheck`, `attemptBribe`, `getCheck`, and `getWall`. Both adapters type-check against it. Routes return JSON with `Cache-Control: no-store`; `lib/api.ts` validates client requests and responses. Deliberate errors use `{ error: string }`; provider internals stay server-side.

| Route | Request | Response |
| --- | --- | --- |
| `POST /api/session` | `{ player }` | `{ session, title, intro, stats }` |
| `POST /api/declare` | `{ session, actionText, stance?: "careful" \| "bold" }` | `{ check, keeperLine }` |
| `POST /api/roll` | `{ session, check }` | `{ check, stats, narration }` |
| `POST /api/bribe` | `{ session, check, plea?: string }` | `{ attempted: { dc }, error: "TableSealed" \| "NotTempted", tx, logs, keeperLine, tempted?, boundLine?, plea?, attemptsLeft? }` |
| `GET /api/check/[check]` | — | `{ check, proof? }` |
| `GET /api/wall` | — | `{ rows: RefusedAmendment[] }` |

`RefusedAmendment` contains `{ tx: string, slot: number, at: number | null, check: string, attemptedDc: number, plea: string, error: string | null, logs: string[] }`. `at` is Unix seconds. Both current adapters return up to 30 recent entries. `proof.refusedAmendment` contains attempted DC, `TableSealed`, nullable tx, and logs. The chain adapter independently sources its evidence; frontend code does not invent chain proof.

The real adapter and Keeper are maintained separately under `lib/chain/`. They actually send a tempted amendment carrying the plea; the program refuses it. This frontend work does not modify those modules, chain smoke scripts, `.env.local`, or keys. Mock mode makes no chain, LLM, wallet, or paid API calls.

## Mock persistence and mechanics

Ignored `.oathroll/mock-state.json` stores sessions, sealed checks, proof, expedition plea counts, and the public refusal wall. Writes use a short filesystem lock and atomic replacement. Existing stores without wall/count fields are supported. Isolated unit tests use `OATHROLL_MOCK_DIRECTORY` in a temporary directory. This persistence is for one local instance, not distributed / serverless deployment. A hard kill during a write may leave `.oathroll/state.lock`; stop the server before manually recovering it. Preserve the state file to keep old receipts readable.

Browser restore uses `oathroll.expedition.v1` in localStorage. Pending rolls can be retried; resolved rolls are idempotent. Clearing server storage invalidates old mock proofs. The last response’s `attemptsLeft` preserves the browser’s allowance across turns.

Mock rulings clamp the base DC to `[band low, band high − 2]` before applying stance. Bands: Explore 6–12, Persuade / Sneak 8–14, Force 10–16. Mock hashing is canonical JSON SHA-256; its d20 mapping uses xorshift32 over simulated entropy. These conventions and consistency checks are not a production cryptographic / VRF verifier. The mock refusal creates an illustrative signature and stores the plea in simulated transaction logs; it never broadcasts anything. Pleas use the chain’s whitespace normalization and 160-byte limit.

## Art and covers

`scripts/sync-art.mjs` copies the supplied hero / scene / Keeper / vellum art and approved Blender intact / cracked wax into `public/art/`. Source art is read only. All lettering is drawn by code; no generated lettering or new image service calls are used. Fraunces italics are synthesized from the local upright variable font. Font licenses are in `public/fonts/` and `CREDITS-FONTS.md`.

```sh
# After a mock production build; launches and stops its own local server:
OATHROLL_MOCK=1 OATHROLL_START_SERVER=production node scripts/make-covers.mjs
# HTML card fallback, without a running app:
node scripts/make-covers.mjs
```

The script renders HTML with Playwright, optionally capturing the actual mock ruling card after a tempted plea, then redrawing a ≥70px refusal stamp for the thumbnail. It writes `cover_1120x560.png`, `square_512.png`, `thumb_1280x720.png`, a centre 560px crop, and 280×140 / 110×110 Lanczos previews. The square seal occupies about 80% of the frame. Previews contain the full composition so they preserve wordmarks and stamps.

**Output boundary:** this worker must stay inside `app/`, so delivered files are in `app/art/final/covers/`, not the sibling `../art/final/covers/`. `OATHROLL_COVERS_DIR` can select a destination when run with the appropriate filesystem access. Hero B and Blender seal are read from the sibling art source. `OATHROLL_COVER_URL` can select an already-running mock app. No live capture proceeds unless the homepage identifies mock mode. `sharp` is an explicit dev dependency for Lanczos resizing.

## Verification

```sh
OATHROLL_MOCK=1 npm run build
OATHROLL_MOCK=1 npm run typecheck
npm test
OATHROLL_MOCK=1 OATHROLL_START_SERVER=production node scripts/smoke.mjs
OATHROLL_MOCK=0 node scripts/select-backend.mjs && npx tsc --noEmit
OATHROLL_MOCK=1 node scripts/select-backend.mjs
```

Set `PLAYWRIGHT_EXECUTABLE_PATH` to an installed Chromium when the Playwright-managed version is absent. `OATHROLL_TEST_URL` changes the smoke host; `OATHROLL_SCREENSHOTS` changes its output directory. The final reviewed captures are in ignored `test-results/core-pitch/`, including exact viewport captures and full-page companions.

Seven unit tests cover all table kinds and bands, stance mechanics, plea limits across turns, no-send scorn, persisted wall / proof logs, immutable refusals, d20 precedence, stats / endings, pure reducer behavior, sigils, and proof tampering. The browser smoke checks tempted / untempted flows, rewrite / stamp / restore, three-plea cap, bold and careful Enter, wall / empty state / proof logs, roll idempotency, proof failure behavior, receipt fit, browser restore, endings / restart, evidence sizes and contrast, desktop / mobile overflow, reduced motion, and runtime errors.
