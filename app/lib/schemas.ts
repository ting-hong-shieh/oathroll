import { z } from "zod";

const signature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,100}$/);
const slot = z.number().int().nonnegative();
export const StatsSchema = z.object({ nerve: z.number().int().min(0), tide: z.number().int().min(0), progress: z.number().int().min(0), goal: z.number().int().positive() });
export const OutcomeSchema = z.object({ text: z.string(), nerveDelta: z.number().int(), progressDelta: z.number().int() });
export const CheckViewSchema = z.object({
  pubkey: signature,
  commitment: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  seq: z.number().int().positive(),
  actionKind: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  actionText: z.string(),
  dc: z.number().int().min(2).max(20),
  band: z.tuple([z.number().int(), z.number().int()]),
  outcomes: z.tuple([OutcomeSchema, OutcomeSchema, OutcomeSchema, OutcomeSchema]),
  status: z.enum(["draft", "sealed", "pending", "resolved"]),
  amendments: z.number().int().nonnegative(),
  slots: z.object({ draft: slot, seal: slot, request: slot.optional(), resolve: slot.optional() }),
  txs: z.object({ draft: signature, seal: signature, request: signature.optional(), resolve: signature.optional() }),
  roll: z.number().int().min(1).max(20).optional(),
  outcome: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  randomness: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});
// Additive proof evidence. The chain backend must source this independently from RPC.
export const ProofEvidenceSchema = z.object({
  mode: z.enum(["mock", "chain"]),
  accountTableHash: z.string().regex(/^[a-f0-9]{64}$/i),
  callbackTx: signature.optional(),
  callbackRandomness: z.string().optional(),
  callbackRequestSlot: slot.optional(),
  refusedAmendment: z.object({ attemptedDc: z.number().int(), error: z.literal("TableSealed"), tx: signature.nullable(), logs: z.array(z.string()) }).optional(),
});
export const SessionRequestSchema = z.object({ player: z.string().trim().min(1).max(80) });
export const StanceSchema = z.enum(["careful", "bold"]);
export const DeclareRequestSchema = z.object({ session: signature, actionText: z.string().trim().min(1).max(400), stance: StanceSchema.optional() });
export const RollRequestSchema = z.object({ session: signature, check: signature });
// plea: the player's own words to the Keeper (kept on-chain in the refused transaction's logs).
export const BribeRequestSchema = RollRequestSchema.extend({ plea: z.string().trim().max(400).optional() });
export const SessionResponseSchema = z.object({ session: signature, title: z.string(), intro: z.string(), stats: StatsSchema });
export const DeclareResponseSchema = z.object({ check: CheckViewSchema, keeperLine: z.string() });
export const RollResponseSchema = z.object({ check: CheckViewSchema, stats: StatsSchema, narration: z.string() });
// tempted=false: the Keeper was not persuaded and sent nothing (error "NotTempted", tx null).
export const BribeResponseSchema = z.object({ attempted: z.object({ dc: z.number().int() }), error: z.enum(["TableSealed", "NotTempted"]), tx: signature.nullable(), logs: z.array(z.string()), keeperLine: z.string(), tempted: z.boolean().optional(), boundLine: z.string().optional(), plea: z.string().optional(), attemptsLeft: z.number().int().nonnegative().optional() });
export const CheckResponseSchema = z.object({ check: CheckViewSchema, proof: ProofEvidenceSchema.optional() });
export type Stats = z.infer<typeof StatsSchema>;
export type CheckView = z.infer<typeof CheckViewSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type ProofEvidence = z.infer<typeof ProofEvidenceSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export type BribeResponse = z.infer<typeof BribeResponseSchema>;

export const RefusedAmendmentSchema = z.object({
  tx: signature, slot, at: z.number().int().nullable(), check: signature,
  attemptedDc: z.number().int(), plea: z.string(), error: z.string().nullable(), logs: z.array(z.string()),
});
export const WallResponseSchema = z.object({ rows: z.array(RefusedAmendmentSchema) });
export type RefusedAmendment = z.infer<typeof RefusedAmendmentSchema>;
