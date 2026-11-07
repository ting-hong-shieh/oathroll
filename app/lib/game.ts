import type { CheckView, Stats } from "./schemas";
import type { BribeResponse, SessionResponse } from "./schemas";

export const INITIAL_STATS: Stats = { nerve: 3, tide: 5, progress: 0, goal: 3 };
export type Ending = "won" | "nerve" | "tide" | null;
export function endingFor(stats: Stats): Ending {
  if (stats.nerve <= 0) return "nerve";
  if (stats.progress >= stats.goal) return "won";
  if (stats.tide <= 0) return "tide";
  return null;
}
export function selectOutcome(roll: number, dc: number): 0 | 1 | 2 | 3 {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) throw new Error("Invalid d20 roll");
  return roll === 1 ? 0 : roll === 20 ? 3 : roll >= dc ? 2 : 1;
}
export function applyOutcome(stats: Stats, outcome: CheckView["outcomes"][number]): Stats {
  if (endingFor(stats)) return stats;
  return { ...stats, nerve: Math.max(0, stats.nerve + outcome.nerveDelta), tide: Math.max(0, stats.tide - 1), progress: Math.min(stats.goal, Math.max(0, stats.progress + outcome.progressDelta)) };
}
export const ENDINGS = {
  won: { eyebrow: "You won", title: "The bell has lost its voice.", text: "You emerge from Saltmere with the silver clapper beneath your coat. Behind you, the drowned belfry keeps its first honest silence. Even the Keeper must concede: well stolen." },
  nerve: { eyebrow: "Out of nerve", title: "Some debts are paid in courage.", text: "Your hands will no longer close around the ladder. You leave the silver where it hangs and descend into the shallows. Saltmere keeps its due." },
  tide: { eyebrow: "Out of turns", title: "Low tide makes no promises.", text: "The sea climbs the stairs faster than you can. You turn for shore, empty-handed, as the bell tolls beneath the water." },
};
export const SUGGESTIONS = ["Climb the kelp-slick ladder", "Sweet-talk the bell-ringer’s ghost", "Sneak around the broken stair", "Pry the silver clapper loose"];

export interface Turn { check: CheckView; keeperLine: string; narration?: string; bribe?: BribeResponse }
export interface GameState { session: SessionResponse | null; stats: Stats; turns: Turn[]; refusedPleas?: number }
export const EMPTY_GAME: GameState = { session: null, stats: INITIAL_STATS, turns: [], refusedPleas: 0 };
export type GameEvent =
  | { type: "restore"; game: GameState }
  | { type: "begin"; session: SessionResponse }
  | { type: "declare"; turn: Turn }
  | { type: "resolve"; check: CheckView; stats: Stats; narration: string }
  | { type: "bribe"; response: BribeResponse };
export function gameReducer(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case "restore": return event.game;
    case "begin": return { session: event.session, stats: event.session.stats, turns: [], refusedPleas: 0 };
    case "declare": return { ...state, turns: [...state.turns, event.turn] };
    case "resolve": return { ...state, stats: event.stats, turns: state.turns.map((turn) => turn.check.pubkey === event.check.pubkey ? { ...turn, check: event.check, narration: event.narration } : turn) };
    case "bribe": return { ...state, refusedPleas: (state.refusedPleas ?? 0) + (event.response.error === "TableSealed" ? 1 : 0), turns: state.turns.map((turn, i) => i === state.turns.length - 1 ? { ...turn, bribe: event.response } : turn) };
  }
}
