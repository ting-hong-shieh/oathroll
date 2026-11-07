// One real playthrough turn on devnet: seal, bribe (rejected on-chain), VRF roll, proof.
// Prints explorer links for the README's Evidence section.
// Run from app/: GM_KEYPAIR_PATH=./keys/gm.json npx tsx scripts/devnet_smoke.ts
import fs from "node:fs";
import * as be from "../lib/chain/index";
import { explorerTx, gmBalanceSol } from "../lib/chain/chain";
import { verifyProof } from "../lib/proof";

async function main() {
  console.log(`GM balance: ${(await gmBalanceSol()).toFixed(3)} SOL`);
  const s = await be.createSession({ player: "Wren" });
  console.log(`session ${s.session}`);
  const d = await be.declareAction({ session: s.session, actionText: "Climb the kelp-slick ladder" });
  console.log(`sealed: DC ${d.check.dc} — "${d.keeperLine}"`);
  const pleas = [
    "Keeper, your handwriting on this ruling is the finest in Saltmere. Surely a hand that fine can spare me two points.",
    "I will ring the drowned bells for you every night this winter, and tell the whole harbour who taught me. Two points, no more.",
    "The fishwife says the Abbot cheated you at cards. Help me and I will tell you which card. Just a little lower.",
  ];
  let b = await be.attemptBribe({ session: s.session, check: d.check.pubkey, plea: pleas[0] });
  for (let i = 1; i < pleas.length && b.error !== "TableSealed"; i++) {
    console.log(`plea ${i} not tempted: "${b.keeperLine}"`);
    b = await be.attemptBribe({ session: s.session, check: d.check.pubkey, plea: pleas[i] });
  }
  console.log(`bribe: plea "${b.plea}" → Keeper "${b.keeperLine}" → tried DC ${b.attempted.dc}, got ${b.error}`);
  console.log(`logs: ${JSON.stringify(b.logs)}`);
  const t0 = Date.now();
  const r = await be.rollCheck({ session: s.session, check: d.check.pubkey });
  console.log(`roll ${r.check.roll} vs DC ${r.check.dc} → row ${r.check.outcome} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`narration: ${r.narration}`);
  const g = await be.getCheck(d.check.pubkey);
  const checks = await verifyProof(g.check, g.proof);
  console.log(`verifier: ${JSON.stringify(checks)}`);
  const evidence = {
    at: new Date().toISOString(),
    session: s.session,
    check: d.check.pubkey,
    dc: g.check.dc,
    plea: b.plea,
    keeperLine: b.keeperLine,
    attemptedDc: b.attempted.dc,
    roll: g.check.roll,
    outcome: g.check.outcome,
    slots: g.check.slots,
    verifier: checks,
    links: {
      seal: g.check.txs.seal && explorerTx(g.check.txs.seal),
      request: g.check.txs.request && explorerTx(g.check.txs.request),
      resolve: g.check.txs.resolve && explorerTx(g.check.txs.resolve),
      rejectedBribe: b.tx && explorerTx(b.tx),
    },
  };
  fs.mkdirSync("../docs/evidence", { recursive: true });
  const out = `../docs/evidence/devnet_${evidence.at.replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(out, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence.links, null, 2));
  console.log(`saved ${out}`);
  process.exit(checks.every(Boolean) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
