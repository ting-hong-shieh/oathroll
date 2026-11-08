# Contributing

Small fixes can go straight to a pull request. For a larger change, open an issue
describing the problem and the behavior you want to change.

## Run locally

Use Node.js 22. From the repository root:

```bash
cd app
npm ci
cp ../.env.example .env.local
npm run dev
```

Set `ANTHROPIC_API_KEY` and `GM_KEYPAIR_PATH` in `.env.local` for the live Keeper
and chain backend. Set `OATHROLL_MOCK=1` to play locally without a chain.
See the [README](README.md#run-locally) for the program ID and setup context.

## Run checks

From the repository root:

```bash
cd program && cargo test
```

In a separate shell, from the repository root:

```bash
cd app && npm test
```

The app CI checks can also be run locally:

```bash
cd app
export OATHROLL_MOCK=1
npm ci
node scripts/select-backend.mjs
npm run typecheck
npm test
npm run build
OATHROLL_MOCK=0 node scripts/select-backend.mjs
unset OATHROLL_MOCK
```

Local end-to-end checks need `solana-test-validator`; see
[`app/scripts/local_e2e.ts`](app/scripts/local_e2e.ts). They are separate from
the mock-mode app checks.

## Report a bug

Use the [bug report form](https://github.com/ting-hong-shieh/oathroll/issues/new?template=bug.yml).
Include reproduction steps, expected and actual behavior, browser and OS,
the commit you tested, and whether you used mock mode or devnet. For chain bugs,
include the check address and public transaction links when available. Remove API
keys, keypairs, and other secrets from logs and screenshots.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Pull requests

Explain the problem, the change, and the checks you ran. Changes to the ruling
bounds, sealing, VRF callback, or verifier should include a regression test that
would fail before the change. Identify third-party assets and their licenses.
