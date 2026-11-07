"use client";
import { useId, useState } from "react";
import type { BribeResponse, CheckView } from "@/lib/schemas";
import { explorerTx } from "@/lib/api";
import { art } from "./art";

export type BargainBeat = "reply" | "rewrite" | "refused" | "restore" | "bound";
export type CardPhase = "sealing" | "sealed" | "cracking" | "revealing" | "revealed";
export const ROW_NAMES = ["Disaster", "Setback", "Success", "Triumph"];
export const KIND_NAMES = ["Explore", "Persuade", "Sneak", "Force"];
export function OutcomeRows({ check, highlight = true, compact = false }: { check: CheckView; highlight?: boolean; compact?: boolean }) {
  const [expanded, setExpanded] = useState<number[]>([]);
  const prefix = useId();
  return <ol className={`outcome-rows ${compact ? "outcome-rows--compact" : ""}`}>
    {check.outcomes.map((row, i) => {
      const landed = highlight && check.outcome === i;
      const open = !compact || check.outcome === undefined || landed || expanded.includes(i);
      const effects = <span className="row-effects mono">{[row.nerveDelta ? `${row.nerveDelta > 0 ? "+" : "−"}${Math.abs(row.nerveDelta)} nerve` : "", row.progressDelta ? `${row.progressDelta > 0 ? "+" : "−"}${Math.abs(row.progressDelta)} progress` : ""].filter(Boolean).join(" · ") || "no change"}</span>;
      return <li key={i} className={landed ? "outcome-row outcome-row--landed" : "outcome-row"}>
        <div className="row-heading"><span className="row-name">{ROW_NAMES[i]}</span><span className="mono row-condition">{i === 0 ? "1" : i === 1 ? `2–${check.dc - 1}` : i === 2 ? `${check.dc}–19` : "20"}</span>{compact && effects}{landed && <span className="landed-mark" aria-label="Landed outcome">↙ LANDED</span>}{compact && check.outcome !== undefined && !landed && <button className="row-toggle" aria-label={`Read ${ROW_NAMES[i].toLowerCase()} outcome`} aria-expanded={open} aria-controls={`${prefix}-${i}`} onClick={() => setExpanded((previous) => previous.includes(i) ? previous.filter((value) => value !== i) : [...previous, i])}>{open ? "−" : "+"}</button>}</div>
        <p id={`${prefix}-${i}`} className="row-text" hidden={!open}>{row.text}</p>
        {!compact && effects}
      </li>;
    })}
  </ol>;
}
function WaxSeal({ animate, cracked }: { animate: boolean; cracked: boolean }) {
  return <div className={`wax-seal ${animate ? "wax-seal--drop" : ""} ${cracked ? "wax-seal--cracked" : ""}`}>
    {["left", "right"].map((half) => <div className={`wax-half wax-half--${half}`} key={half}><img className="wax-image" src={cracked ? "/art/seal_cracked.webp" : "/art/seal_intact.webp"} alt="" /></div>)}
  </div>;
}
export function RulingCard({ check, phase = "revealed", bribe, full = false, oracleRequested = false, bargainBeat = "bound", bargainRevision = 0 }: { check: CheckView; phase?: CardPhase; bribe?: BribeResponse; full?: boolean; oracleRequested?: boolean; bargainBeat?: BargainBeat; bargainRevision?: number }) {
  const tempted = bribe?.error === "TableSealed";
  const rewriting = tempted && ["rewrite", "refused", "restore"].includes(bargainBeat);
  const stamped = tempted && ["refused", "restore", "bound"].includes(bargainBeat);
  return <div className={`ruling-card phase--${phase} ${full ? "ruling-card--full" : ""} bargain--${bargainBeat}`}>
    <div className="card-flipper">
      <div className="card-face card-front" style={art.vellum ? { backgroundImage: `url(${art.vellum})`, backgroundSize: "512px 512px" } : undefined}>
        <div className="card-topline mono"><span>THE KEEPER’S RULING</span><span>NO. {String(check.seq).padStart(2, "0")}</span></div>
        <div className="card-heading">
          <div className="card-action"><h3>{check.actionText}</h3><div className="dc-line"><strong className={rewriting ? "dc-original dc-original--crossed" : "dc-original"}>DC {check.dc}</strong>{rewriting && <em className="dc-handwritten" aria-label={`Attempted DC ${bribe.attempted.dc}`}>DC {bribe.attempted.dc}</em>}{stamped && <span key={bargainRevision} className="refusal-stamp">REFUSED BY SOLANA</span>}</div></div>
          {!full && <div className="seal-corner"><WaxSeal animate={phase === "sealing"} cracked={phase === "cracking" || phase === "revealing" || phase === "revealed"} />{check.outcome === undefined && <span className="seal-caption mono">{oracleRequested ? "ROLLING" : "SEALED ON SOLANA"}</span>}</div>}
        </div>
        <OutcomeRows check={check} highlight={phase === "revealed"} compact={!full} />
        {stamped && <div key={bargainRevision} className="bribe-refusal"><span className="mono refusal-error">Tried DC {bribe.attempted.dc} · {bribe.error}</span>{bribe.plea && <blockquote className="refusal-plea" title={bribe.plea}>“{bribe.plea}”</blockquote>}{bribe.tx && <a className="refusal-tx mono" href={explorerTx(bribe.tx)} target="_blank" rel="noreferrer">Failed transaction ↗</a>}</div>}
      </div>
    </div>
  </div>;
}
