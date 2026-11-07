import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import type { CheckView, ProofEvidence, Stats, RefusedAmendment } from "../schemas";

export interface StoredSession { player: string; stats: Stats; checks: string[]; pleasUsed?: number }
export interface StoredCheck { session: string; check: CheckView; proof: ProofEvidence; seed?: string; bribeAttempted?: boolean }
export interface Store { slot: number; sessions: Record<string, StoredSession>; checks: Record<string, StoredCheck>; wall?: RefusedAmendment[] }
const directory = process.env.OATHROLL_MOCK_DIRECTORY ?? path.join(process.cwd(), ".oathroll");
const file = path.join(directory, "mock-state.json");
const lock = path.join(directory, "state.lock");
export class MockError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export async function withStore<T>(work: (store: Store) => T): Promise<T> {
  mkdirSync(directory, { recursive: true });
  let acquired = false;
  for (let i = 0; i < 100; i++) {
    try { mkdirSync(lock); acquired = true; break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await delay(30); }
  }
  if (!acquired) throw new MockError("The server is busy. Try again in a moment.", 503);
  try {
    let state: Store;
    try { state = JSON.parse(readFileSync(file, "utf8")); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = { slot: 386429000, sessions: {}, checks: {} };
    }
    const result = work(state);
    writeFileSync(`${file}.tmp`, JSON.stringify(state));
    renameSync(`${file}.tmp`, file);
    return structuredClone(result);
  } finally { rmSync(lock, { recursive: true, force: true }); }
}
export function nextSlot(store: Store): number { store.slot += 2; return store.slot; }
