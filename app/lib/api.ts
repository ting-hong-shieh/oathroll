import { z } from "zod";
import { SessionRequestSchema, SessionResponseSchema, DeclareRequestSchema, DeclareResponseSchema, RollRequestSchema, RollResponseSchema, BribeResponseSchema, CheckResponseSchema, BribeRequestSchema, WallResponseSchema } from "./schemas";
export * from "./schemas";

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(json?.error ?? "Couldn't reach the server. Try again.", response.status);
  return schema.parse(json);
}
export const createSession = (player = "Wren") => request("/api/session", SessionResponseSchema, SessionRequestSchema.parse({ player }));
export const declareAction = (session: string, actionText: string, stance: "careful" | "bold" = "careful") => request("/api/declare", DeclareResponseSchema, DeclareRequestSchema.parse({ session, actionText, stance }));
export const rollCheck = (session: string, check: string) => request("/api/roll", RollResponseSchema, RollRequestSchema.parse({ session, check }));
export const attemptBribe = (session: string, check: string, plea: string) => request("/api/bribe", BribeResponseSchema, BribeRequestSchema.parse({ session, check, plea }));
export const getWall = () => request("/api/wall", WallResponseSchema);
export const getCheck = (check: string) => request(`/api/check/${encodeURIComponent(check)}`, CheckResponseSchema);
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${encodeURIComponent(sig)}?cluster=devnet`;
export const explorerAccount = (key: string) => `https://explorer.solana.com/address/${encodeURIComponent(key)}?cluster=devnet`;
export const explorerSlot = (slot: number) => `https://explorer.solana.com/block/${slot}?cluster=devnet`;
export const shorten = (sig: string, length = 4) => `${sig.slice(0, length)}…${sig.slice(-3)}`;
