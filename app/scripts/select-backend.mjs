import { existsSync, readFileSync, writeFileSync } from "node:fs";

// Load local flags without logging, modifying, or shipping any environment values.
const local = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
const localMock = local.match(/^OATHROLL_MOCK\s*=\s*["']?([01])/m)?.[1];
const mock = (process.env.OATHROLL_MOCK ?? localMock) === "1" || !existsSync("lib/chain/index.ts");
writeFileSync("lib/backend-selected.ts", `// Selected at dev/build time. Do not edit.\nimport * as implementation from "./${mock ? "mock" : "chain"}/index";\nimport type { GameBackend } from "./backend-contract";\nconst backend: GameBackend = implementation;\nexport const { createSession, declareAction, rollCheck, attemptBribe, getCheck, getWall } = backend;\nexport const backendMode = "${mock ? "mock" : "chain"}" as const;\n`);
console.log(`Oathroll backend: ${mock ? "mock (local simulation)" : "chain"}`);
