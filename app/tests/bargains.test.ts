import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WallResponseSchema } from "../lib/schemas";

test("mock stances, immutable refusal evidence, and game-wide three-plea limit", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "oathroll-mock-test-"));
  process.env.OATHROLL_MOCK_DIRECTORY = directory;
  const backend = await import("../lib/mock/index");
  try {
    assert.deepEqual(await backend.getWall(), { rows: [] });
    for (const actionText of ["Climb the ladder", "Talk to the ghost", "Sneak quietly", "Pry the clapper", "Inspect the masonry"]) {
      const carefulSession = await backend.createSession({ player: "Careful" });
      const boldSession = await backend.createSession({ player: "Bold" });
      const careful = (await backend.declareAction({ session: carefulSession.session, actionText })).check;
      const bold = (await backend.declareAction({ session: boldSession.session, actionText, stance: "bold" })).check;
      assert.ok(careful.dc >= careful.band[0] && careful.dc <= careful.band[1] - 2);
      assert.equal(bold.dc, careful.dc + 2);
      assert.ok(bold.dc <= bold.band[1]);
      assert.equal(bold.actionText, `Boldly: ${actionText}`);
      assert.equal(careful.outcomes[1].nerveDelta, 0);
      assert.equal(bold.outcomes[1].nerveDelta, -1);
      assert.equal(careful.outcomes[2].progressDelta, 1);
      assert.equal(bold.outcomes[2].progressDelta, 2);
      assert.equal(careful.outcomes[3].progressDelta, 2);
      assert.equal(bold.outcomes[3].progressDelta, 2);
    }
    const { session } = await backend.createSession({ player: "Bargainer" });
    const { check } = await backend.declareAction({ session, actionText: "Climb the ladder" });
    const no = await backend.attemptBribe({ session, check: check.pubkey, plea: "Let me win." });
    assert.equal(no.error, "NotTempted");
    assert.equal(no.tempted, false);
    assert.equal(no.attemptsLeft, 2);
    assert.equal(no.tx, null);
    assert.deepEqual(no.logs, []);
    assert.deepEqual(await backend.getWall(), { rows: [] });
    const plea = "Your handwriting is magnificent. Surely a smaller number would look even finer?";
    const yes = await backend.attemptBribe({ session, check: check.pubkey, plea });
    assert.equal(yes.error, "TableSealed");
    assert.equal(yes.attemptsLeft, 1);
    assert.ok(yes.tx);
    assert.ok(yes.logs.includes(`Program log: Plea: ${plea}`));
    assert.deepEqual((await backend.getCheck(check.pubkey)).check, check);
    assert.equal((await backend.getCheck(check.pubkey)).proof.refusedAmendment?.tx, yes.tx);
    const wall = WallResponseSchema.parse(await backend.getWall());
    assert.equal(wall.rows.length, 1);
    assert.equal(wall.rows[0].plea, plea);
    assert.equal(wall.rows[0].tx, yes.tx);
    assert.equal((await backend.attemptBribe({ session, check: check.pubkey, plea: "No." })).attemptsLeft, 0);
    await assert.rejects(backend.attemptBribe({ session, check: check.pubkey, plea }), (e: unknown) => e instanceof Error && "status" in e && e.status === 429);
    // The allowance persists into a later turn and is isolated from other expeditions.
    await backend.rollCheck({ session, check: check.pubkey });
    const next = await backend.declareAction({ session, actionText: "Talk to the ghost" });
    await assert.rejects(backend.attemptBribe({ session, check: next.check.pubkey, plea }), /heard enough/);
    assert.equal((await backend.getWall()).rows.length, 1);
    await assert.rejects(backend.attemptBribe({ session, check: check.pubkey, plea }), /only plead before the roll/);
  } finally { delete process.env.OATHROLL_MOCK_DIRECTORY; await rm(directory, { recursive: true, force: true }); }
});
