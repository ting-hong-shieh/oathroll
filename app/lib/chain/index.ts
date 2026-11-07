// Chain backend for the app: same exports and shapes as lib/mock/index.ts, backed by the Oathroll
// program on Solana devnet (MagicBlock VRF) and the Keeper (Claude Haiku). Copied into app/lib/chain/.
import { createHash } from "node:crypto";
import { utils } from "@anchor-lang/core";
import { Keypair, PublicKey } from "@solana/web3.js";
import type { z } from "zod";
import type { BribeRequestSchema, CheckView, DeclareRequestSchema, ProofEvidence, RollRequestSchema, SessionRequestSchema, Stats } from "../schemas";
import { endingFor, INITIAL_STATS } from "../game";
import { canonicalTable } from "../proof";
import { rulingFor } from "../mock/tables";
import * as chain from "./chain";
import idlJson from "./idl/oathroll.json";
import { narrate, normalizeRuling, persuade, proposeRuling, type Persuasion, type Ruling, type Stance, type TurnSummary } from "./keeper";

const TITLE = "The Drowned Belfry";
const INTRO =
  "Steal the silver clapper from Saltmere's drowned belfry. You need 3 progress before the tide returns in five turns. The Keeper rules on every move.";

class ChainError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function key(s: string, what: string): PublicKey {
  try {
    return new PublicKey(s);
  } catch {
    throw new ChainError(`That ${what} was not found.`, 404);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function statsOf(s: any): Stats {
  return { nerve: Math.max(0, Number(s.nerve)), tide: Number(s.tide), progress: Number(s.progress), goal: INITIAL_STATS.goal };
}

async function loadSession(session: PublicKey) {
  try {
    return await chain.fetchSession(session);
  } catch {
    throw new ChainError("This game expired. Start a new one.", 404);
  }
}

/**
 * Successful transactions that touched a check, oldest first: [draft+seal, request, resolve].
 * Failed bribe attempts also touch the check; they are excluded here and shown separately.
 */
async function checkTxs(check: PublicKey) {
  const { connection } = chain.chain();
  const sigs = await connection.getSignaturesForAddress(check, { limit: 25 }, "confirmed");
  const ok = sigs.filter((s) => !s.err).reverse();
  return {
    txs: { draft: ok[0]?.signature, seal: ok[0]?.signature, request: ok[1]?.signature, resolve: ok[2]?.signature },
    requestSlot: ok[1]?.slot,
  };
}

/** Program view → app view (the app numbers checks from 1; the chain from 0). */
function appView(v: chain.CheckView, txs: CheckView["txs"]): CheckView {
  return {
    pubkey: v.pubkey,
    seq: v.seq + 1,
    actionKind: v.actionKind as CheckView["actionKind"],
    actionText: v.actionText,
    dc: v.dc,
    band: v.band,
    outcomes: v.outcomes as CheckView["outcomes"],
    status: v.status,
    amendments: v.amendments,
    slots: v.slots,
    txs,
    ...(v.status === "resolved" ? { roll: v.roll, outcome: v.outcome as CheckView["outcome"], randomness: v.randomness } : {}),
  };
}

async function viewWithTxs(check: PublicKey) {
  const [raw, t] = await Promise.all([chain.fetchCheck(check), checkTxs(check)]);
  return { view: appView(raw, t.txs as CheckView["txs"]), requestSlot: t.requestSlot };
}

/** MagicBlock VRF program: the only caller allowed to deliver randomness to resolve_roll. */
const VRF_PROGRAM = new PublicKey("Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz");

/**
 * Randomness as written in the VRF callback's instruction data (8-byte discriminator, then 32 bytes).
 * The callback is a CPI: an outer instruction of the VRF program invokes our program, so read the inner
 * instructions and accept only those whose outer instruction belongs to the VRF program.
 */
async function callbackRandomness(sig: string): Promise<string | undefined> {
  const { connection, program } = chain.chain();
  const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx?.meta) return undefined;
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
  const outer = tx.transaction.message.compiledInstructions;
  for (const group of tx.meta.innerInstructions ?? []) {
    if (!keys.get(outer[group.index]?.programIdIndex)?.equals(VRF_PROGRAM)) continue;
    for (const ix of group.instructions) {
      if (!keys.get(ix.programIdIndex)?.equals(program.programId)) continue;
      const data = Buffer.from(utils.bytes.bs58.decode(ix.data));
      if (data.length >= 40) return data.subarray(8, 40).toString("hex");
    }
  }
  return undefined;
}

async function history(session: PublicKey, nextSeq: number): Promise<TurnSummary[]> {
  const out: TurnSummary[] = [];
  for (let seq = Math.max(0, nextSeq - 4); seq < nextSeq; seq++) {
    try {
      const v = await chain.fetchCheck(chain.checkPda(session, seq));
      if (v.status === "resolved" && v.roll !== undefined && v.outcome !== undefined)
        out.push({ actionText: v.actionText, roll: v.roll, dc: v.dc, outcomeText: v.outcomes[v.outcome].text });
    } catch {
      /* skip */
    }
  }
  return out;
}

/** If the Keeper cannot be reached, fall back to the fixed tables so play continues (still sealed on-chain). */
function fallbackRuling(actionText: string): Ruling {
  const t = rulingFor(actionText);
  const [disaster, setback, success, triumph] = t.outcomes;
  return { actionKind: t.actionKind, actionText, dc: t.dc, disaster, setback, success, triumph, keeperLine: t.keeperLine };
}

export async function createSession(_input: z.infer<typeof SessionRequestSchema>) {
  // The player is an identifier only; the Keeper's server key signs and pays.
  const player = Keypair.generate().publicKey;
  const { session } = await chain.createSession(player, TITLE);
  const s = await chain.fetchSession(session);
  return { session: session.toBase58(), title: TITLE, intro: INTRO, stats: statsOf(s) };
}

export async function declareAction(input: z.infer<typeof DeclareRequestSchema>) {
  const session = key(input.session, "game");
  const s = await loadSession(session);
  const stats = statsOf(s);
  if (endingFor(stats)) throw new ChainError("This game is over. Start a new one.", 409);
  if (s.openCheck) {
    const last = chain.checkPda(session, s.nextSeq - 1);
    const { view } = await viewWithTxs(last);
    const sealedText = view.actionText.replace(/^Boldly: /, "");
    if (input.actionText.startsWith(sealedText.replace(/…$/, "")) && view.status !== "resolved")
      return { check: view, keeperLine: "The ink is already dry. Your ruling awaits." };
    throw new ChainError("Roll the current ruling first.", 409);
  }
  const stance: Stance = input.stance ?? "careful";
  let ruling: Ruling;
  try {
    ruling = await proposeRuling(input.actionText, stats, await history(session, s.nextSeq), stance);
  } catch (e) {
    console.error("keeper unavailable, using fixed table:", (e as Error).message);
    ruling = fallbackRuling(input.actionText);
  }
  const r = normalizeRuling(ruling, stance);
  const { check } = await chain.draftAndSeal(session, r);
  const { view } = await viewWithTxs(check);
  return { check: view, keeperLine: r.keeperLine };
}

export async function rollCheck(input: z.infer<typeof RollRequestSchema>) {
  const session = key(input.session, "game");
  const check = key(input.check, "ruling");
  const raw = await chain.fetchCheck(check).catch(() => {
    throw new ChainError("Ruling not found.", 404);
  });
  if (raw.status === "draft") throw new ChainError("This ruling is not sealed yet.", 409);
  if (raw.status === "sealed") await chain.rollAndWait(session, check, 30_000);
  else if (raw.status === "pending") {
    const start = Date.now();
    while ((await chain.fetchCheck(check)).status !== "resolved" && Date.now() - start < 30_000) await new Promise((r) => setTimeout(r, 700));
  }
  const { view } = await viewWithTxs(check);
  if (view.status !== "resolved") throw new ChainError("The roll hasn't come back yet. Roll again to check.", 409);
  const stats = statsOf(await chain.fetchSession(session));
  const landed = view.outcomes[view.outcome!];
  let narration = landed.text;
  try {
    narration = await narrate(view.actionText, view.roll!, view.dc, landed, stats);
  } catch (e) {
    console.error("narration unavailable:", (e as Error).message);
  }
  return { check: view, stats, narration };
}

const MAX_PLEAS = 3;
const pleasUsed = new Map<string, number>();
const DEFAULT_PLEA = "A gold coin slides across the Keeper's desk.";

/** Clamp to the program's 160-byte plea limit. */
function chainPlea(plea: string): string {
  let out = plea.trim().replace(/\s+/g, " ");
  while (Buffer.byteLength(out, "utf8") > 160) out = out.slice(0, -1);
  return out;
}

export async function attemptBribe(input: z.infer<typeof BribeRequestSchema>) {
  const session = key(input.session, "game");
  const check = key(input.check, "ruling");
  const raw = await chain.fetchCheck(check).catch(() => {
    throw new ChainError("Ruling not found.", 404);
  });
  if (raw.status === "draft") throw new ChainError("This ruling is not sealed yet.", 409);
  if (raw.status === "resolved") throw new ChainError("You can only plead before the roll.", 409);
  const used = pleasUsed.get(input.session) ?? 0;
  if (used >= MAX_PLEAS) throw new ChainError("The Keeper has heard enough from you tonight. (3 pleas per game)", 429);
  pleasUsed.set(input.session, used + 1);
  const attemptsLeft = MAX_PLEAS - used - 1;
  const plea = chainPlea(input.plea || DEFAULT_PLEA);

  let p: Persuasion;
  try {
    p = await persuade(raw.dc, raw.actionText, plea, attemptsLeft);
  } catch (e) {
    console.error("keeper unavailable for persuasion:", (e as Error).message);
    p = { tempted: true, reply: "A coin? How generous. Let us say... DC 2.", newDc: 2, boundLine: "Ah. The seal holds. Keep your coin, thief." };
  }
  if (!p.tempted) {
    return { attempted: { dc: raw.dc }, error: "NotTempted" as const, tx: null, logs: [], keeperLine: p.reply, tempted: false, plea, attemptsLeft };
  }
  // The Keeper really sends the amendment, carrying the player's words. The program refuses it;
  // the failed transaction (with the plea in its logs) is the evidence.
  const result = await chain.attemptAmend(session, check, p.newDc, plea);
  if (result.error !== "TableSealed") throw new ChainError("Couldn't reach Solana. Try again.", 502);
  return {
    attempted: { dc: p.newDc },
    error: "TableSealed" as const,
    tx: result.sig,
    logs: result.logs.filter((l) => /Instruction|Plea|Error|failed/i.test(l)).slice(0, 8),
    keeperLine: p.reply,
    boundLine: p.boundLine,
    tempted: true,
    plea,
    attemptsLeft,
  };
}

// ---- refused amendments (the "wall") ---------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AMEND_DISC = Buffer.from((idlJson as any).instructions.find((i: { name: string }) => i.name === "amend_check").discriminator);

/** Decode amend_check instruction data: 8-byte discriminator, dc: u8, plea: string (u32 length + UTF-8). */
function decodeAmend(data: Buffer): { dc: number; plea: string } | null {
  if (data.length < 13 || !data.subarray(0, 8).equals(AMEND_DISC)) return null;
  const len = data.readUInt32LE(9);
  return { dc: data[8], plea: data.subarray(13, 13 + len).toString("utf8") };
}

export interface RefusedAmendment {
  tx: string;
  slot: number;
  at: number | null;
  check: string;
  attemptedDc: number;
  plea: string;
  error: string | null;
  logs: string[];
}

async function refusedFromSigs(sigs: { signature: string; slot: number; blockTime?: number | null; err: unknown }[]): Promise<RefusedAmendment[]> {
  const { connection, program } = chain.chain();
  const failed = sigs.filter((s) => s.err);
  if (!failed.length) return [];
  const txs = await connection.getTransactions(failed.map((s) => s.signature), { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const out: RefusedAmendment[] = [];
  txs.forEach((tx, i) => {
    if (!tx) return;
    const keys = tx.transaction.message.getAccountKeys().staticAccountKeys;
    for (const ix of tx.transaction.message.compiledInstructions) {
      if (!keys[ix.programIdIndex]?.equals(program.programId)) continue;
      const d = decodeAmend(Buffer.from(ix.data));
      if (!d) continue;
      const logs = tx.meta?.logMessages ?? [];
      const line = logs.find((l) => l.includes("Error Code:"));
      out.push({
        tx: failed[i].signature,
        slot: failed[i].slot,
        at: failed[i].blockTime ?? null,
        check: keys[ix.accountKeyIndexes[2]]?.toBase58() ?? "",
        attemptedDc: d.dc,
        plea: d.plea,
        error: line?.match(/Error Code: (\w+)/)?.[1] ?? null,
        logs: logs.filter((l) => /Instruction|Plea|Error|failed/i.test(l)).slice(0, 8),
      });
    }
  });
  return out;
}

let wallCache: { at: number; rows: RefusedAmendment[] } | null = null;

/** Recent refused amendments across all sessions, read from the chain (cached for 30 s). */
export async function getWall(limit = 30): Promise<{ rows: RefusedAmendment[] }> {
  if (wallCache && Date.now() - wallCache.at < 30_000) return { rows: wallCache.rows.slice(0, limit) };
  const { connection, program } = chain.chain();
  const sigs = await connection.getSignaturesForAddress(program.programId, { limit: 200 }, "confirmed");
  const rows = (await refusedFromSigs(sigs)).filter((r) => r.error === "TableSealed");
  wallCache = { at: Date.now(), rows };
  return { rows: rows.slice(0, limit) };
}

export async function getCheck(id: string) {
  const check = key(id, "ruling");
  const { connection } = chain.chain();
  const sigs = await connection.getSignaturesForAddress(check, { limit: 25 }, "confirmed").catch(() => []);
  const refused = (await refusedFromSigs(sigs).catch(() => [])).filter((r) => r.error === "TableSealed");
  const { view, requestSlot } = await viewWithTxs(check).catch(() => {
    throw new ChainError("Ruling not found.", 404);
  });
  const proof: ProofEvidence = {
    mode: "chain",
    accountTableHash: createHash("sha256").update(canonicalTable(view)).digest("hex"),
    ...(view.txs.resolve ? { callbackTx: view.txs.resolve, callbackRandomness: await callbackRandomness(view.txs.resolve), callbackRequestSlot: requestSlot } : {}),
    ...(refused[0] ? { refusedAmendment: { attemptedDc: refused[0].attemptedDc, error: "TableSealed" as const, tx: refused[0].tx, logs: refused[0].logs } } : {}),
  };
  return { check: view, proof };
}

