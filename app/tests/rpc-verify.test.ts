import test from "node:test";
import assert from "node:assert/strict";
import { base58Decode, dcBand, decodeCheck, DISC, outcomeRow, PROGRAM_ID } from "../lib/rpc-verify";
import idl from "../lib/chain/idl/oathroll.json";
import { vrfD20 } from "../lib/proof";

test("base58 decodes the program id to 32 bytes", () => {
  assert.equal(base58Decode(PROGRAM_ID).length, 32);
  assert.deepEqual(Array.from(base58Decode("1112")), [0, 0, 0, 1]);
});

test("program rules: dc_band and outcome_row", () => {
  assert.deepEqual(dcBand(0), [6, 12]);
  assert.deepEqual(dcBand(3), [10, 16]);
  assert.equal(dcBand(4), null);
  assert.equal(outcomeRow(1, 2), 0);
  assert.equal(outcomeRow(20, 30), 3);
  assert.equal(outcomeRow(12, 12), 2);
  assert.equal(outcomeRow(11, 12), 1);
});

test("vrfD20 follows random_u8_with_range: last byte under 240, mod 20, plus 1", () => {
  const bytes = new Array(32).fill(0);
  bytes[31] = 239; // 239 % 20 + 1 = 20
  assert.equal(vrfD20(bytes.map((b) => b.toString(16).padStart(2, "0")).join("")), 20);
  bytes[31] = 250; bytes[30] = 41; // 250 is rejected (>= 240), 41 % 20 + 1 = 2
  assert.equal(vrfD20(bytes.map((b) => b.toString(16).padStart(2, "0")).join("")), 2);
  assert.equal(vrfD20("ff".repeat(32)), 255 % 20 + 1); // fallback: all bytes biased, use the last
});

test("decodeCheck reads the Check layout and rejects other accounts", () => {
  const enc = new TextEncoder();
  const parts: number[] = [184, 116, 144, 69, 156, 212, 121, 212];
  const str = (s: string) => { const b = enc.encode(s); parts.push(b.length, 0, 0, 0, ...b); };
  const u64 = (n: number) => { for (let i = 0; i < 8; i++) parts.push(Math.floor(n / 256 ** i) % 256); };
  parts.push(...new Array(32).fill(1)); // session
  parts.push(2, 0); // seq
  parts.push(0); // explore
  str("Climb");
  parts.push(8); // dc
  for (const [t, n, p] of [["a", -1, 0], ["b", 0, 0], ["c", 0, 1], ["d", 1, 2]] as const) { str(t); parts.push(n & 0xff, p); }
  parts.push(3, 0); // resolved, 0 amendments
  u64(100); u64(100); u64(119); u64(122);
  parts.push(...new Array(32).fill(7)); // randomness
  parts.push(8, 2, 255); // roll, outcome, bump
  const c = decodeCheck(Uint8Array.from(parts));
  assert.equal(c.seq, 2);
  assert.equal(c.actionText, "Climb");
  assert.equal(c.outcomes[0].nerveDelta, -1);
  assert.equal(c.status, "resolved");
  assert.deepEqual(c.slots, { draft: 100, seal: 100, request: 119, resolve: 122 });
  assert.equal(c.randomness, "07".repeat(32));
  assert.equal(c.roll, 8);
  assert.equal(vrfD20(c.randomness), 8);
  parts[0] = 0;
  assert.throws(() => decodeCheck(Uint8Array.from(parts)));
});

test("the verifier's discriminators match the program IDL, including the overdue roll", () => {
  const ix = (name: string) => idl.instructions.find((i) => i.name === name)!.discriminator;
  assert.deepEqual(DISC.draft, ix("draft_check"));
  assert.deepEqual(DISC.seal, ix("seal_check"));
  assert.deepEqual(DISC.request, ix("request_roll"));
  assert.deepEqual(DISC.overdueRequest, ix("request_overdue_roll"));
  assert.deepEqual(DISC.resolve, ix("resolve_roll"));
  assert.deepEqual(DISC.checkAccount, idl.accounts.find((a) => a.name === "Check")!.discriminator);
});
