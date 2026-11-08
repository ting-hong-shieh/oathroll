// Local test of request_overdue_roll against solana-test-validator (VRF program + queue cloned from devnet; no oracle runs locally).
// Run from app/: SOLANA_RPC_URL=http://127.0.0.1:8899 SOLANA_CLUSTER=custom GM_KEYPAIR_PATH=./gm-local.json npx tsx scripts/overdue_e2e.ts
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { chain, createSession, draftAndSeal, fetchCheck } from "../lib/chain/chain";

const table = [
  { text: "The rung snaps; you drop into black water.", nerveDelta: -2, progressDelta: 0 },
  { text: "Kelp slicks your grip; you cling, shaking.", nerveDelta: -1, progressDelta: 0 },
  { text: "Hand over hand, you reach the gallery.", nerveDelta: 0, progressDelta: 1 },
  { text: "You vault the last rungs like a gull.", nerveDelta: 1, progressDelta: 2 },
];
const OVERDUE_SLOTS = 1_500;
const queue = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
let failures = 0;
function ok(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}
async function expectError(name: string, code: string, fn: () => Promise<unknown>) {
  try { await fn(); ok(name, false, "no error"); }
  catch (e) {
    const msg = String((e as Error).message ?? e) + ((e as { logs?: string[] }).logs ?? []).join("\n");
    ok(name, msg.includes(code), msg.includes(code) ? code : msg.slice(0, 300));
  }
}

async function main() {
  const { program, gm, connection } = chain();
  await connection.confirmTransaction(await connection.requestAirdrop(gm.publicKey, 10 * LAMPORTS_PER_SOL), "confirmed");
  const stranger = Keypair.generate();
  await connection.confirmTransaction(await connection.requestAirdrop(stranger.publicKey, 2 * LAMPORTS_PER_SOL), "confirmed");
  const overdue = (session: PublicKey, check: PublicKey) =>
    program.methods.requestOverdueRoll().accountsPartial({ payer: stranger.publicKey, session, check, oracleQueue: queue }).signers([stranger]).rpc();

  const { session } = await createSession(Keypair.generate().publicKey, "Overdue test");
  const { check: c1 } = await draftAndSeal(session, { actionKind: 0, actionText: "Climb the kelp-slick ladder", dc: 12, outcomes: table });
  const sealed = await fetchCheck(c1);
  ok("check is sealed", sealed.status === "sealed", `seal slot ${sealed.slots.seal}`);

  await expectError("a stranger cannot roll right after sealing", "RollNotOverdue", () => overdue(session, c1));
  await expectError("a stranger still cannot use the Keeper's request_roll", "NotKeeper", () =>
    program.methods.requestRoll().accountsPartial({ gm: stranger.publicKey, session, check: c1, oracleQueue: queue }).signers([stranger]).rpc());

  // a second session, to check the check must belong to the session passed in
  const { session: other } = await createSession(Keypair.generate().publicKey, "Other session");

  const target = sealed.slots.seal + OVERDUE_SLOTS;
  const t0 = Date.now();
  while ((await connection.getSlot("confirmed")) < target) {
    if (Date.now() - t0 > 1_200_000) throw new Error("validator too slow to reach the overdue slot");
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`waited ${((Date.now() - t0) / 1000).toFixed(0)} s to slot ≥ ${target}`);

  await expectError("an overdue check cannot be rolled through another session", "WrongSession", () => overdue(other, c1));
  const balanceBefore = await connection.getBalance(stranger.publicKey);
  try {
    const sig = await overdue(session, c1);
    const v = await fetchCheck(c1);
    ok("after OVERDUE_SLOTS anyone can request the roll; check becomes pending", v.status === "pending" && (v.slots.request ?? 0) >= target, `request slot ${v.slots.request}, tx ${sig.slice(0, 8)}…`);
    ok("the sealed table did not change", v.dc === 12 && JSON.stringify(v.outcomes) === JSON.stringify(table) && v.amendments === 0);
    const spent = (balanceBefore - (await connection.getBalance(stranger.publicKey))) / LAMPORTS_PER_SOL;
    ok("the caller pays the request fee", spent > 0 && spent < 0.01, `${spent.toFixed(6)} SOL`);
  } catch (e) {
    ok("overdue roll request", false, String((e as Error).message).slice(0, 300) + "\n" + ((e as { logs?: string[] }).logs ?? []).join("\n"));
  }
  await expectError("an overdue roll cannot be requested twice", "NotSealed", () => overdue(session, c1));
  await expectError("the Keeper cannot re-roll a pending check", "NotSealed", () =>
    program.methods.requestRoll().accountsPartial({ gm: gm.publicKey, session, check: c1, oracleQueue: queue }).rpc());
  await expectError("a pending check still cannot be amended", "TableSealed", () =>
    program.methods.amendCheck(6, table).accountsPartial({ gm: gm.publicKey, session, check: c1 }).rpc());

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
