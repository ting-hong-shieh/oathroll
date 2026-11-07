import type { z } from "zod";
import type {
  SessionRequestSchema, SessionResponseSchema, DeclareRequestSchema, DeclareResponseSchema,
  RollRequestSchema, RollResponseSchema, BribeRequestSchema, BribeResponseSchema, CheckResponseSchema, WallResponseSchema,
} from "./schemas";

export interface GameBackend {
  createSession(input: z.infer<typeof SessionRequestSchema>): Promise<z.infer<typeof SessionResponseSchema>>;
  declareAction(input: z.infer<typeof DeclareRequestSchema>): Promise<z.infer<typeof DeclareResponseSchema>>;
  rollCheck(input: z.infer<typeof RollRequestSchema>): Promise<z.infer<typeof RollResponseSchema>>;
  attemptBribe(input: z.infer<typeof BribeRequestSchema>): Promise<z.infer<typeof BribeResponseSchema>>;
  getWall(): Promise<z.infer<typeof WallResponseSchema>>;
  getCheck(check: string): Promise<z.infer<typeof CheckResponseSchema>>;
}
