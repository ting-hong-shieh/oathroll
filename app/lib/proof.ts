import type { CheckView, ProofEvidence } from "./schemas";
import { selectOutcome } from "./game";

export function canonicalTable(check: CheckView): string {
  return JSON.stringify({ actionKind: check.actionKind, actionText: check.actionText, dc: check.dc, band: check.band, outcomes: check.outcomes.map(({ text, nerveDelta, progressDelta }) => ({ text, nerveDelta, progressDelta })) });
}
export async function tableHash(check: CheckView): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTable(check)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** Demo PRNG. Deliberately separate from a production VRF mapping. */
export function seededD20(randomness: string): number {
  let state = parseInt(randomness.slice(0, 8), 16) >>> 0;
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return (state >>> 0) % 20 + 1;
}
/**
 * The program's own roll rule: ephemeral-vrf-sdk 0.4.1 `rnd::random_u8_with_range(bytes, 1, 20)`.
 * Scan bytes from the end for one below 240 (unbiased), take it mod 20, plus 1; fall back to the last byte.
 */
export function vrfD20(randomnessHex: string): number {
  const bytes = randomnessHex.match(/../g)!.map((h) => parseInt(h, 16));
  const range = 20, threshold = Math.floor(256 / range) * range;
  for (let i = bytes.length - 1; i >= 0; i--) if (bytes[i] < threshold) return 1 + (bytes[i] % range);
  return 1 + (bytes[bytes.length - 1] % range);
}
export async function verifyProof(check: CheckView, proof?: ProofEvidence): Promise<boolean[]> {
  const hash = await tableHash(check);
  return [
    !!proof && hash === proof.accountTableHash && check.dc >= check.band[0] && check.dc <= check.band[1],
    check.slots.request !== undefined && check.slots.seal < check.slots.request,
    !!proof?.callbackTx && proof.callbackTx === check.txs.resolve && !!check.randomness && proof.callbackRandomness === check.randomness && proof.callbackRequestSlot === check.slots.request && check.slots.resolve !== undefined && check.slots.request! < check.slots.resolve,
    check.status === "resolved" && check.roll !== undefined && check.outcome === selectOutcome(check.roll, check.dc) && !!check.randomness && check.roll === (proof?.mode === "mock" ? seededD20(check.randomness) : vrfD20(check.randomness)),
  ];
}
