export type DiePhase = "idle" | "tumbling" | "slowing" | "landed";
export function Die({ phase = "idle", roll, small = false }: { phase?: DiePhase; roll?: number; small?: boolean }) {
  return <div className={`die die--${phase} ${small ? "die--small" : ""}`} role="img" aria-label={phase === "tumbling" ? "Awaiting the oracle" : roll ? `D20 rolled ${roll}` : "Twenty-sided die"}>
    <svg viewBox="0 0 120 132" fill="none" aria-hidden="true">
      <path className="die-outline" d="M60 3 111 33 111 96 60 128 9 96 9 33Z" />
      <path d="M60 3 32 49 9 33M60 3 88 49 111 33M32 49 88 49 60 101ZM9 33 32 49 9 96 60 101 111 96 88 49M60 101 60 128" />
    </svg>
    <span className="die-number">{phase === "tumbling" || phase === "slowing" ? "·" : roll ?? "?"}</span>
  </div>;
}
