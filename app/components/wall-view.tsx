"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { explorerTx, getWall } from "@/lib/api";
import type { RefusedAmendment } from "@/lib/schemas";

export function WallView({ mode }: { mode: "mock" | "chain" }) {
  const [rows, setRows] = useState<RefusedAmendment[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void getWall().then(({ rows }) => { if (active) setRows(rows); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Couldn't load refused pleas."); });
    return () => { active = false; };
  }, [revision]);
  return <main id="main" className="wall-main">
    <h1>The Wall of <em>Refused Pleas</em></h1>
    <p className="wall-intro">Each plea here talked the Keeper into changing a sealed DC. He sent the change to Solana, and the program refused every one (TableSealed).</p>
    {mode === "mock" && <p className="mock-notice mono">LOCAL SIMULATION · THESE PLEAS AND FAILED TRANSACTIONS ARE MOCK RECORDS. EXPLORER LINKS ARE ILLUSTRATIVE.</p>}
    {error ? <div role="alert" className="inline-error">{error}<button className="text-link" onClick={() => setRevision((n) => n + 1)}>Try again</button></div> : rows === null ? <div role="status" className="wall-skeleton"><span className="sr-only">Loading…</span>{[0, 1, 2].map((row) => <div className="wall-skeleton-row" key={row} aria-hidden="true"><span /><span /></div>)}</div> : rows.length === 0 ? <section className="wall-empty"><h2>No refused pleas yet.</h2><Link className="text-link" href="/play">Play and try one</Link></section> : <ol className="wall-entries">{rows.map((row) => <li key={row.tx}>
      <blockquote>“{row.plea}”</blockquote>
      <div className="wall-meta mono"><span>Keeper tried DC {row.attemptedDc}</span><span>{row.error ?? "Refused"}</span>{row.at !== null ? <time dateTime={new Date(row.at * 1000).toISOString()}>{new Date(row.at * 1000).toLocaleString("en-GB", { timeZoneName: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time> : <span>slot {row.slot.toLocaleString("en-US")}</span>}<a href={explorerTx(row.tx)} target="_blank" rel="noreferrer">Failed transaction ↗</a><Link href={`/verify/${row.check}#amendment`}>Proof</Link></div>
    </li>)}</ol>}
    <Link className="button button-outline" href="/play">Back to game</Link>
  </main>;
}
