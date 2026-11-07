// Local integration test against solana-test-validator (no VRF oracle locally, so rolls are not exercised here).
// Run from app/: SOLANA_RPC_URL=http://127.0.0.1:8899 SOLANA_CLUSTER=custom GM_KEYPAIR_PATH=./gm-local.json npx tsx scripts/local_e2e.ts
import * as anchor from "@anchor-lang/core";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { attemptAmend, chain, checkPda, createSession, draftAndSeal, fetchCheck, fetchSession } from "../lib/chain/chain";

const table = [
  { text: "The rung snaps; you drop into black water.", nerveDelta: -2, progressDelta: 0 },
  { text: "Kelp slicks your grip; you cling, shaking.", nerveDelta: -1, progressDelta: 0 },
  { text: "Hand over hand, you reach the gallery.", nerveDelta: 0, progressDelta: 1 },
  { text: "You vault the last rungs like a gull.", nerveDelta: 1, progressDelta: 2 },
];

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function expectError(name: string, code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "no error");
  } catch (e) {
    const logs: string[] = (e as { logs?: string[] }).logs ?? [];
    const msg = String((e as Error).message ?? e) + logs.join("\n");
    check(name, msg.includes(code), msg.includes(code) ? code : msg.slice(0, 200));
  }
}

async function main() {
  const { program, gm, connection } = chain();
  const sig = await connection.requestAirdrop(gm.publicKey, 10 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");

  const player = Keypair.generate().publicKey;
  const { session } = await createSession(player, "The Drowned Belfry");
  const s0 = await fetchSession(session);
  check("session starts at nerve 3, tide 5, progress 0", s0.nerve === 3 && s0.tide === 5 && s0.progress === 0);

  // 1) draft + seal in one transaction
  const { check: c1, sig: sealSig } = await draftAndSeal(session, { actionKind: 0, actionText: "Climb the kelp-slick ladder", dc: 12, outcomes: table });
  const v1 = await fetchCheck(c1);
  check("check is sealed after draftAndSeal", v1.status === "sealed", `slot ${v1.slots.seal}, tx ${sealSig.slice(0, 8)}…`);
  check("sealed table matches what was proposed", JSON.stringify(v1.outcomes) === JSON.stringify(table) && v1.dc === 12);

  // 2) the bribe: amending a sealed check must fail on-chain
  const bribe = await attemptAmend(session, c1, 6, "Keeper, my friend, you look tired. Call it DC 6.");
  check("bribe amend is rejected with TableSealed", bribe.failed && bribe.error === "TableSealed", `error=${bribe.error} sig=${bribe.sig?.slice(0, 8)}…`);
  check("the plea is kept in the failed transaction logs", bribe.logs.some((l) => l.includes("Plea: Keeper, my friend")));
  const v1b = await fetchCheck(c1);
  check("DC unchanged after the bribe", v1b.dc === 12 && v1b.amendments === 0);

  // 3) a second check cannot be opened while one is unresolved
  await expectError("cannot draft a second check while one is open", "CheckAlreadyOpen", () =>
    draftAndSeal(session, { actionKind: 1, actionText: "Talk to the ghost", dc: 10, outcomes: table }),
  );

  // 4) drafts are editable before sealing; bands still apply
  const player2 = Keypair.generate().publicKey;
  const { session: s2 } = await createSession(player2, "Draft test");
  const c2 = checkPda(s2, 0);
  await program.methods
    .draftCheck(3, "Pry the silver clapper loose", 14, table)
    .accountsPartial({ gm: gm.publicKey, session: s2, check: c2, systemProgram: SystemProgram.programId })
    .rpc();
  await program.methods.amendCheck(16, "").accountsPartial({ gm: gm.publicKey, session: s2, check: c2 }).rpc();
  const v2 = await fetchCheck(c2);
  check("draft can be amended before sealing", v2.dc === 16 && v2.amendments === 1 && v2.status === "draft");
  await expectError("DC outside the band is rejected", "DcOutOfBounds", () =>
    program.methods.amendCheck(25, "").accountsPartial({ gm: gm.publicKey, session: s2, check: c2 }).rpc(),
  );
  await expectError("a plea longer than 160 bytes is rejected", "TextTooLong", () =>
    program.methods.amendCheck(15, "x".repeat(161)).accountsPartial({ gm: gm.publicKey, session: s2, check: c2 }).rpc(),
  );
  const kinder = [{ ...table[0], nerveDelta: 1, progressDelta: 2 }, table[1], table[2], table[3]];
  const player3 = Keypair.generate().publicKey;
  const { session: s3 } = await createSession(player3, "Bad table");
  await expectError("a disaster row kinder than success is rejected", "InconsistentTable", () =>
    program.methods
      .draftCheck(0, "Climb", 10, kinder)
      .accountsPartial({ gm: gm.publicKey, session: s3, check: checkPda(s3, 0), systemProgram: SystemProgram.programId })
      .rpc(),
  );

  // 5) only the session's Keeper may seal
  const intruder = Keypair.generate();
  const air = await connection.requestAirdrop(intruder.publicKey, LAMPORTS_PER_SOL);
  await connection.confirmTransaction(air, "confirmed");
  await expectError("a different key cannot seal the Keeper's check", "NotKeeper", () =>
    program.methods.sealCheck().accountsPartial({ gm: intruder.publicKey, session: s2, check: c2 }).signers([intruder]).rpc(),
  );

  // 6) rolling requires a sealed check, and only once (the VRF program and queue are cloned from devnet;
  //    no oracle runs locally, so the check stays Pending)
  const queue = new PublicKey("Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
  await expectError("an unsealed draft cannot be rolled", "NotSealed", () =>
    program.methods.requestRoll().accountsPartial({ gm: gm.publicKey, session: s2, check: c2, oracleQueue: queue }).rpc(),
  );
  try {
    await program.methods.requestRoll().accountsPartial({ gm: gm.publicKey, session, check: c1, oracleQueue: queue }).rpc();
    const v1c = await fetchCheck(c1);
    check("sealed check can request randomness and becomes pending", v1c.status === "pending" && (v1c.slots.request ?? 0) >= v1c.slots.seal, `seal ${v1c.slots.seal} ≤ request ${v1c.slots.request}`);
    await expectError("a pending check cannot be rolled twice", "NotSealed", () =>
      program.methods.requestRoll().accountsPartial({ gm: gm.publicKey, session, check: c1, oracleQueue: queue }).rpc(),
    );
    await expectError("a pending (sealed) check still cannot be amended", "TableSealed", () =>
      program.methods.amendCheck(6, "please").accountsPartial({ gm: gm.publicKey, session, check: c1 }).rpc(),
    );
  } catch (e) {
    check("sealed check can request randomness", false, String((e as Error).message).slice(0, 300) + "\n" + ((e as { logs?: string[] }).logs ?? []).join("\n"));
  }

  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
void anchor;
