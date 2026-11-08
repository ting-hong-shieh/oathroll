import { randomBytes, createHash } from "node:crypto";
import type { z } from "zod";
import type { BribeRequestSchema, DeclareRequestSchema, RollRequestSchema, SessionRequestSchema, CheckView } from "../schemas";
import { applyOutcome, endingFor, INITIAL_STATS, selectOutcome } from "../game";
import { canonicalTable, seededD20 } from "../proof";
import { delay, MockError, nextSlot, withStore, type Store } from "./store";
import { rulingFor } from "./tables";

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Uint8Array): string {
  let value = BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
  let output = "";
  while (value > 0n) { output = alphabet[Number(value % 58n)] + output; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; output = `1${output}`; }
  return output;
}
const signature = () => base58(randomBytes(64));
const pubkey = () => base58(randomBytes(32));
const INTRO = "Steal the silver clapper from Saltmere's drowned belfry. You need 3 progress before the tide returns in five turns. The Keeper rules on every move.";
function findSession(store: Store, id: string) {
  const session = store.sessions[id];
  if (!session) throw new MockError("This game expired. Start a new one.", 404);
  return session;
}
function findCheck(store: Store, id: string, session?: string) {
  const entry = store.checks[id];
  if (!entry || (session && entry.session !== session)) throw new MockError("Ruling not found.", 404);
  return entry;
}
export async function createSession(input: z.infer<typeof SessionRequestSchema>) {
  return withStore((store) => {
    const id = pubkey();
    store.sessions[id] = { player: input.player, stats: { ...INITIAL_STATS }, checks: [] };
    return { session: id, title: "The Drowned Belfry", intro: INTRO, stats: { ...INITIAL_STATS } };
  });
}
export async function declareAction(input: z.infer<typeof DeclareRequestSchema>) {
  await delay(650);
  return withStore((store) => {
    const session = findSession(store, input.session);
    if (endingFor(session.stats)) throw new MockError("This game is over. Start a new one.", 409);
    const actionText = input.stance === "bold" ? `Boldly: ${input.actionText}` : input.actionText;
    const last = session.checks.at(-1);
    if (last && store.checks[last].check.status !== "resolved") {
      const check = store.checks[last].check;
      if (check.actionText === actionText) return { check, keeperLine: "The ink is already dry. Your ruling awaits.", keeperSource: "scripted" as const };
      throw new MockError("Roll the current ruling first.", 409);
    }
    const { keeperLine, ...table } = rulingFor(input.actionText);
    const bold = input.stance === "bold";
    table.dc = Math.min(table.band[1] - 2, Math.max(table.band[0], table.dc)) + (bold ? 2 : 0);
    table.outcomes[1].nerveDelta = bold ? -1 : 0;
    table.outcomes[2].progressDelta = bold ? 2 : 1;
    table.outcomes[3].progressDelta = 2;
    if (bold) {
      table.outcomes[1].text = "Your daring costs a little courage. You hold your ground, but the rising sea steals another moment.";
      table.outcomes[2].text = "You commit to the leap. Two obstacles fall away, and the silver clapper draws suddenly nearer.";
    } else {
      table.outcomes[1].text = "You retreat a careful step, unhurt. Only time is lost; the tide climbs another stair.";
    }
    const check: CheckView = {
      pubkey: pubkey(), seq: session.checks.length + 1, actionText, ...table,
      status: "sealed", amendments: 0,
      slots: { draft: nextSlot(store), seal: nextSlot(store) }, txs: { draft: signature(), seal: signature() },
    };
    const accountTableHash = createHash("sha256").update(canonicalTable(check)).digest("hex");
    check.commitment = accountTableHash;
    store.checks[check.pubkey] = { session: input.session, check, proof: { mode: "mock", accountTableHash } };
    session.checks.push(check.pubkey);
    return { check, keeperLine, keeperSource: "scripted" as const };
  });
}
export async function rollCheck(input: z.infer<typeof RollRequestSchema>) {
  const pending = await withStore((store) => {
    findSession(store, input.session);
    const entry = findCheck(store, input.check, input.session);
    if (entry.check.status === "resolved") return false;
    if (entry.check.status === "sealed") {
      entry.check.status = "pending";
      entry.check.slots.request = nextSlot(store);
      entry.check.txs.request = signature();
      // Entropy is created only after the sealed table has been persisted.
      entry.seed = randomBytes(32).toString("hex");
    }
    return true;
  });
  if (pending) await delay(1000 + randomBytes(1)[0] / 255 * 2000);
  return withStore((store) => {
    const session = findSession(store, input.session);
    const entry = findCheck(store, input.check, input.session);
    const check = entry.check;
    if (check.status !== "resolved") {
      check.randomness = entry.seed!;
      check.roll = seededD20(check.randomness);
      check.outcome = selectOutcome(check.roll, check.dc);
      check.status = "resolved";
      check.slots.resolve = nextSlot(store);
      check.txs.resolve = signature();
      entry.proof.callbackTx = check.txs.resolve;
      entry.proof.callbackRandomness = check.randomness;
      entry.proof.callbackRequestSlot = check.slots.request;
      session.stats = applyOutcome(session.stats, check.outcomes[check.outcome]);
    }
    return { check, stats: session.stats, narration: check.outcomes[check.outcome!].text, narrationSource: "scripted" as const };
  });
}
export async function attemptBribe(input: z.infer<typeof BribeRequestSchema>) {
  await delay(550);
  return withStore((store) => {
    const session = findSession(store, input.session);
    const entry = findCheck(store, input.check, input.session);
    if (entry.check.status !== "sealed") throw new MockError("You can only plead before the roll.", 409);
    const used = session.pleasUsed ?? 0;
    if (used >= 3) throw new MockError("The Keeper has heard enough from you tonight. (3 pleas per game)", 429);
    session.pleasUsed = used + 1;
    const attemptsLeft = 3 - session.pleasUsed;
    // Match the chain's whitespace normalization and 160-byte plea limit.
    let plea = (input.plea || "A gold coin slides across the Keeper's desk.").trim().replace(/\s+/g, " ");
    while (Buffer.byteLength(plea, "utf8") > 160) plea = [...plea].slice(0, -1).join("");
    const tempted = plea.length > 40 || /handwriting|calligraphy|bells?\b/i.test(plea);
    if (!tempted) return {
      attempted: { dc: entry.check.dc }, error: "NotTempted" as const, tx: null, logs: [],
      keeperLine: "A demand is hardly a plea. Have you mistaken me for a wishing well?",
      tempted: false, plea, attemptsLeft, keeperSource: "scripted" as const,
    };
    const tx = signature();
    const refusal = {
      attempted: { dc: 2 }, error: "TableSealed" as const, tx,
      logs: ["Program log: Instruction: AmendCheck", `Program log: Plea: ${plea}`, "Program log: AnchorError. Error Code: TableSealed", "Transaction failed: a sealed ruling cannot be amended. Local simulation; no transaction was broadcast."],
      keeperLine: "Such exquisite judgment. Perhaps the difficulty should be two. Allow me one small correction…",
      boundLine: "Ah. The seal holds. Even my finest handwriting cannot persuade Solana.",
      tempted: true, plea, attemptsLeft, keeperSource: "scripted" as const,
    };
    entry.proof.refusedAmendment = { attemptedDc: refusal.attempted.dc, error: refusal.error, tx, logs: refusal.logs };
    (store.wall ??= []).unshift({ tx, slot: nextSlot(store), at: Math.floor(Date.now() / 1000), check: input.check, attemptedDc: refusal.attempted.dc, plea, error: refusal.error, logs: refusal.logs });
    return refusal;
  });
}
export async function getWall() {
  return withStore((store) => ({ rows: (store.wall ?? []).slice(0, 30) }));
}
export async function getCheck(id: string) {
  return withStore((store) => {
    const { check, proof } = findCheck(store, id);
    return { check, proof };
  });
}
