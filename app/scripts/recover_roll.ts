// Roll a sealed check that the Keeper has left unrolled. Anyone may do this once the check has been sealed
// for OVERDUE_SLOTS (1,500 slots, about ten minutes); the caller pays the VRF request fee. The program still
// requires the check to be sealed and unrolled, and the oracle's callback still decides the outcome.
//
// Run from app/:  npx tsx scripts/recover_roll.ts <check pubkey> [wallet keypair path]
// The wallet defaults to ~/.config/solana/id.json and needs a little devnet SOL (solana airdrop 1).
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import idlJson from "../lib/chain/idl/oathroll.json";

const OVERDUE_SLOTS = 1_500;
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const QUEUE = new PublicKey(process.env.VRF_QUEUE || "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");

async function main() {
  const [checkArg, walletArg] = process.argv.slice(2);
  if (!checkArg) throw new Error("usage: npx tsx scripts/recover_roll.ts <check pubkey> [wallet keypair path]");
  const walletPath = walletArg || path.join(os.homedir(), ".config", "solana", "id.json");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const connection = new Connection(RPC, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  const program = new anchor.Program(idlJson as anchor.Idl, provider);

  const check = new PublicKey(checkArg);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = await (program.account as any).check.fetch(check);
  const status = Object.keys(c.status)[0];
  if (status !== "sealed") {
    console.log(`This check is ${status}, not sealed: there is nothing to recover.`);
    return;
  }
  const sealSlot = Number(c.sealSlot);
  const slot = await connection.getSlot("confirmed");
  if (slot < sealSlot + OVERDUE_SLOTS) {
    console.log(`Sealed at slot ${sealSlot}; anyone may roll it from slot ${sealSlot + OVERDUE_SLOTS} (now ${slot}). Try again in about ${Math.ceil((sealSlot + OVERDUE_SLOTS - slot) * 0.4)} s.`);
    return;
  }
  const sig = await program.methods
    .requestOverdueRoll()
    .accountsPartial({ payer: payer.publicKey, session: c.session, check, oracleQueue: QUEUE })
    .rpc();
  console.log(`Roll requested by ${payer.publicKey.toBase58()}: https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  console.log(`The VRF oracle's callback resolves it; then open /verify/${check.toBase58()} to check the proof.`);
}

main().catch((e) => {
  console.error(String((e as Error).message ?? e));
  process.exit(1);
});
