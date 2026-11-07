// Server-side Solana client for the Oathroll program. The server holds the Keeper (GM) key,
// pays devnet fees, and never holds any authority the program does not give it.
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import idlJson from "./idl/oathroll.json";

export const VRF_DEVNET_QUEUE = new PublicKey(process.env.VRF_QUEUE || "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh");
const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const CLUSTER = process.env.SOLANA_CLUSTER || "devnet";

export type OutcomeRow = { text: string; nerveDelta: number; progressDelta: number };
export type StatusName = "draft" | "sealed" | "pending" | "resolved";

export interface CheckView {
  pubkey: string;
  seq: number;
  actionKind: number;
  actionText: string;
  dc: number;
  band: [number, number];
  outcomes: OutcomeRow[];
  status: StatusName;
  amendments: number;
  slots: { draft: number; seal: number; request?: number; resolve?: number };
  txs: { draft?: string; seal?: string; request?: string; resolve?: string };
  roll?: number;
  outcome?: number;
  randomness?: string;
}

const BANDS: Record<number, [number, number]> = { 0: [6, 12], 1: [8, 14], 2: [8, 14], 3: [10, 16] };

let cached: { program: anchor.Program; gm: Keypair; connection: Connection } | null = null;

function loadGm(): Keypair {
  // GM_KEYPAIR_JSON (the secret-key array) suits hosted deploys; GM_KEYPAIR_PATH suits local runs.
  const inline = process.env.GM_KEYPAIR_JSON;
  const p = process.env.GM_KEYPAIR_PATH || path.join(process.cwd(), "keys", "gm.json");
  const secret = Uint8Array.from(JSON.parse(inline || fs.readFileSync(/*turbopackIgnore: true*/ p, "utf8")));
  return Keypair.fromSecretKey(secret);
}

export function chain() {
  if (cached) return cached;
  const connection = new Connection(RPC, "confirmed");
  const gm = loadGm();
  const wallet = new anchor.Wallet(gm);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idlJson as anchor.Idl, provider);
  cached = { program, gm, connection };
  return cached;
}

export function explorerTx(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
}

export function sessionPda(player: PublicKey, nonce: anchor.BN) {
  const { program } = chain();
  return PublicKey.findProgramAddressSync(
    [Buffer.from("session"), player.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId,
  )[0];
}

export function checkPda(session: PublicKey, seq: number) {
  const { program } = chain();
  const seqBuf = Buffer.alloc(2);
  seqBuf.writeUInt16LE(seq);
  return PublicKey.findProgramAddressSync([Buffer.from("check"), session.toBuffer(), seqBuf], program.programId)[0];
}

function statusName(s: Record<string, unknown>): StatusName {
  return Object.keys(s)[0] as StatusName;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toView(pubkey: PublicKey, c: any, txs: CheckView["txs"] = {}): CheckView {
  const status = statusName(c.status);
  const n = (x: anchor.BN | number) => (typeof x === "number" ? x : x.toNumber());
  return {
    pubkey: pubkey.toBase58(),
    seq: c.seq,
    actionKind: c.actionKind,
    actionText: c.actionText,
    dc: c.dc,
    band: BANDS[c.actionKind],
    outcomes: c.outcomes.map((o: OutcomeRow) => ({ text: o.text, nerveDelta: o.nerveDelta, progressDelta: o.progressDelta })),
    status,
    amendments: c.amendments,
    slots: {
      draft: n(c.draftSlot),
      seal: n(c.sealSlot),
      ...(n(c.requestSlot) ? { request: n(c.requestSlot) } : {}),
      ...(n(c.resolveSlot) ? { resolve: n(c.resolveSlot) } : {}),
    },
    txs,
    ...(status === "resolved"
      ? { roll: c.roll, outcome: c.outcome, randomness: Buffer.from(c.randomness).toString("hex") }
      : {}),
  };
}

export async function fetchSession(session: PublicKey) {
  const { program } = chain();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program.account as any).session.fetch(session);
}

export async function fetchCheck(check: PublicKey, txs: CheckView["txs"] = {}): Promise<CheckView> {
  const { program } = chain();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = await (program.account as any).check.fetch(check);
  return toView(check, c, txs);
}

export async function createSession(player: PublicKey, title: string) {
  const { program, gm } = chain();
  const nonce = new anchor.BN(Date.now());
  const session = sessionPda(player, nonce);
  const sig = await program.methods
    .createSession(nonce, title)
    .accountsPartial({ gm: gm.publicKey, player, session, systemProgram: SystemProgram.programId })
    .rpc();
  return { session, sig };
}

/** Draft and seal in one transaction: the ruling is frozen the moment it lands. */
export async function draftAndSeal(session: PublicKey, ruling: { actionKind: number; actionText: string; dc: number; outcomes: OutcomeRow[] }) {
  const { program, gm, connection } = chain();
  const s = await fetchSession(session);
  const check = checkPda(session, s.nextSeq);
  const draftIx = await program.methods
    .draftCheck(ruling.actionKind, ruling.actionText, ruling.dc, ruling.outcomes)
    .accountsPartial({ gm: gm.publicKey, session, check, systemProgram: SystemProgram.programId })
    .instruction();
  const sealIx = await program.methods.sealCheck().accountsPartial({ gm: gm.publicKey, session, check }).instruction();
  const tx = new Transaction().add(draftIx, sealIx);
  const sig = await sendAndConfirmTransaction(connection, tx, [gm], { commitment: "confirmed" });
  return { check, sig };
}

/** Ask for VRF randomness, then wait for the oracle's callback to resolve the check. */
export async function rollAndWait(session: PublicKey, check: PublicKey, timeoutMs = 25_000) {
  const { program, gm, connection } = chain();
  const requestSig = await program.methods
    .requestRoll()
    .accountsPartial({ gm: gm.publicKey, session, check, oracleQueue: VRF_DEVNET_QUEUE })
    .rpc({ skipPreflight: false });
  const start = Date.now();
  let view = await fetchCheck(check);
  while (view.status !== "resolved" && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 600));
    view = await fetchCheck(check);
  }
  let resolveSig: string | undefined;
  if (view.status === "resolved") {
    const sigs = await connection.getSignaturesForAddress(check, { limit: 5 }, "confirmed");
    resolveSig = sigs.find((s) => s.signature !== requestSig && !s.err)?.signature;
  }
  return { requestSig, resolveSig, view, waitedMs: Date.now() - start };
}

/**
 * The bribe: the Keeper really sends an amend transaction to a sealed check, carrying the player's
 * plea. It is sent with skipPreflight so the failure lands on-chain as evidence (a failed tx on the
 * explorer whose logs keep the plea).
 */
export async function attemptAmend(session: PublicKey, check: PublicKey, newDc: number, plea: string) {
  const { program, gm, connection } = chain();
  let sig: string | null = null;
  try {
    const tx = await program.methods
      .amendCheck(newDc, plea)
      .accountsPartial({ gm: gm.publicKey, session, check })
      .transaction();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = gm.publicKey;
    tx.sign(gm);
    sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    // A refused amendment may make confirmation throw; the logs are read below either way.
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed").catch(() => null);
    let landed = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    for (let i = 0; !landed && i < 20; i++) {
      await new Promise((r) => setTimeout(r, 400));
      landed = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    }
    const logs = landed?.meta?.logMessages ?? [];
    const failed = !!landed?.meta?.err;
    return { sig, failed, logs, error: failed ? parseAnchorError(logs) : null };
  } catch (e) {
    const logs: string[] = (e as { logs?: string[] }).logs ?? [];
    const msg = (e as Error)?.message; return { sig, failed: true, logs, error: parseAnchorError(logs) ?? (typeof msg === "string" ? msg : JSON.stringify(e)) };
  }
}

function parseAnchorError(logs: string[]): string | null {
  const line = logs.find((l) => l.includes("Error Code:"));
  if (!line) return null;
  const m = line.match(/Error Code: (\w+)/);
  return m ? m[1] : line;
}

export async function gmBalanceSol() {
  const { gm, connection } = chain();
  return (await connection.getBalance(gm.publicKey)) / 1e9;
}
