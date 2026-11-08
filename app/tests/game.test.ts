import test from "node:test";
import assert from "node:assert/strict";
import { applyOutcome, endingFor, gameReducer, INITIAL_STATS, selectOutcome, EMPTY_GAME } from "../lib/game";
import { decodeHash, sigilPath } from "../lib/sigil";
import { canonicalTable, seededD20, tableHash, verifyProof } from "../lib/proof";
import { DeclareResponseSchema, type CheckView } from "../lib/schemas";
import { rulingFor } from "../lib/mock/tables";

test("natural 1 and 20 override the DC; all other d20 results use DC", () => {
  for (let dc = 2; dc <= 20; dc++) for (let roll = 1; roll <= 20; roll++) {
    assert.equal(selectOutcome(roll, dc), roll === 1 ? 0 : roll === 20 ? 3 : roll >= dc ? 2 : 1);
  }
  assert.throws(() => selectOutcome(0, 13));
});
test("stats clamp, Tide is spent once per application, and endings have deterministic precedence", () => {
  assert.deepEqual(applyOutcome(INITIAL_STATS, { text: "", nerveDelta: -8, progressDelta: 9 }), { nerve: 0, tide: 4, progress: 3, goal: 3 });
  assert.equal(endingFor({ ...INITIAL_STATS, nerve: 0, tide: 0, progress: 3 }), "nerve");
  assert.equal(endingFor({ ...INITIAL_STATS, progress: 3, tide: 0 }), "won");
  assert.equal(endingFor({ ...INITIAL_STATS, tide: 0 }), "tide");
  const ended = { ...INITIAL_STATS, tide: 0 };
  assert.equal(applyOutcome(ended, { text: "", nerveDelta: -1, progressDelta: 1 }), ended);
});
test("sigils decode hex and base58, are deterministic, and use exactly the first 16 bytes", () => {
  assert.deepEqual([...decodeHash("1112")], [0, 0, 0, 1]);
  assert.equal(sigilPath("00".repeat(16)), sigilPath("1".repeat(16)));
  assert.equal(sigilPath("a47f09c32b186e5793d8210f8ca2661b"), sigilPath("a47f09c32b186e5793d8210f8ca2661b"));
  assert.equal(sigilPath("a4".repeat(16)), sigilPath("a4".repeat(32)));
  assert.notEqual(sigilPath("a4".repeat(16)), sigilPath("b4".repeat(16)));
  assert.throws(() => sigilPath("invalid!"));
});
test("proof detects table tampering, slot inversion, callback mismatch, and wrong outcomes", async () => {
  const { keeperLine: _, ...table } = rulingFor("Climb the kelp-slick ladder");
  const randomness = "a4".repeat(32);
  const roll = seededD20(randomness);
  const check: CheckView = { ...table, pubkey: "2".repeat(44), actionText: "Climb the kelp-slick ladder", seq: 1, amendments: 0, status: "resolved", slots: { draft: 2, seal: 4, request: 6, resolve: 8 }, txs: { draft: "2".repeat(88), seal: "3".repeat(88), request: "4".repeat(88), resolve: "5".repeat(88) }, randomness, roll, outcome: selectOutcome(roll, table.dc) };
  const proof = { mode: "mock" as const, accountTableHash: await tableHash(check), callbackTx: check.txs.resolve, callbackRequestSlot: 6, callbackRandomness: randomness };
  assert.deepEqual(await verifyProof(check, proof), [true, true, true, true]);
  assert.equal((await verifyProof({ ...check, dc: check.dc - 1 }, proof))[0], false);
  assert.equal((await verifyProof({ ...check, slots: { ...check.slots, seal: 7 } }, proof))[1], false);
  assert.equal((await verifyProof(check, { ...proof, callbackRandomness: "b4".repeat(32) }))[2], false);
  assert.equal((await verifyProof({ ...check, outcome: check.outcome === 2 ? 1 : 2 }, proof))[3], false);
  assert.equal(canonicalTable(check), canonicalTable({ ...check, status: "sealed", roll: undefined, outcome: undefined }));
});
test("reducer resolves a matching check without mutating prior state", () => {
  const session = { session: "2".repeat(44), title: "Belfry", intro: "Low tide.", stats: INITIAL_STATS };
  const { keeperLine, ...table } = rulingFor("Climb the kelp-slick ladder");
  const check: CheckView = { ...table, pubkey: "2".repeat(44), seq: 1, actionText: "Climb the kelp-slick ladder", status: "sealed", amendments: 0, slots: { draft: 2, seal: 4 }, txs: { draft: "2".repeat(88), seal: "3".repeat(88) } };
  const started = gameReducer(EMPTY_GAME, { type: "begin", session });
  const before = gameReducer(started, { type: "declare", turn: { check, keeperLine } });
  const after = gameReducer(before, { type: "resolve", check: { ...check, status: "resolved", roll: 7, outcome: 1 }, stats: { ...INITIAL_STATS, nerve: 2, tide: 4 }, narration: "The ladder gives way." });
  assert.equal(before.stats.nerve, 3);
  assert.equal(before.turns[0].check.status, "sealed");
  assert.equal(after.stats.nerve, 2);
  assert.equal(after.turns[0].check.status, "resolved");
  assert.equal(after.turns[0].narration, "The ladder gives way.");
  assert.deepEqual(after.turns[0].check.outcomes, before.turns[0].check.outcomes);
  const refused = gameReducer(before, { type: "bribe", response: { attempted: { dc: 2 }, error: "TableSealed", tx: null, logs: [], keeperLine: "Refused." } });
  const untempted = gameReducer(refused, { type: "bribe", response: { attempted: { dc: check.dc }, error: "NotTempted", tx: null, logs: [], keeperLine: "No." } });
  assert.equal(untempted.refusedPleas, 1, "Untempted replies must preserve the ending’s refusal count");
  assert.equal(gameReducer(untempted, { type: "begin", session }).refusedPleas, 0);
  const scripted = gameReducer(gameReducer(started, { type: "declare", turn: { check, keeperLine, keeperSource: "scripted" } }), { type: "resolve", check: { ...check, status: "resolved", roll: 7, outcome: 1 }, stats: INITIAL_STATS, narration: "x", narrationSource: "scripted" });
  assert.equal(scripted.turns[0].keeperSource, "scripted", "The UI must be able to say when a fixed table wrote the ruling");
  assert.equal(scripted.turns[0].narrationSource, "scripted");
  assert.equal(DeclareResponseSchema.parse({ check, keeperLine, keeperSource: "model" }).keeperSource, "model", "The client schema must keep the source field instead of stripping it");
});


test("every authored mock table obeys the on-chain DC bands and effect rules", () => {
  const bands = [[6, 12], [8, 14], [8, 14], [10, 16]];
  const actions = ["Offer a coin", "Climb the ladder", "Talk to the ghost", "Pry the clapper", "Sneak quietly", "Inspect the masonry"];
  const kinds = new Set<number>();
  for (const action of actions) {
    const table = rulingFor(action);
    kinds.add(table.actionKind);
    assert.deepEqual(table.band, bands[table.actionKind], action);
    assert.ok(table.dc >= table.band[0] && table.dc <= table.band[1], action);
    assert.equal(table.dc, /ladder/.test(action) ? 10 : (table.band[0] + table.band[1]) / 2, action);
    assert.equal(table.outcomes.length, 4);
    table.outcomes.forEach((row, index) => {
      assert.ok(Number.isInteger(row.nerveDelta) && Number.isInteger(row.progressDelta));
      assert.ok(row.nerveDelta >= (index < 2 ? -2 : 0) && row.nerveDelta <= (index < 2 ? 0 : 1), action);
      if (index < 2) assert.equal(row.progressDelta, 0, action);
      else assert.ok(row.progressDelta >= 1 && row.progressDelta <= 2, action);
    });
    assert.ok(table.outcomes[0].nerveDelta <= table.outcomes[1].nerveDelta, action);
    assert.ok(table.outcomes[3].progressDelta >= table.outcomes[2].progressDelta, action);
  }
  assert.deepEqual([...kinds].sort(), [0, 1, 2, 3]);
});
