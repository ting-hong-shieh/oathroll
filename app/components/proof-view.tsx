"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCheck, explorerAccount, explorerTx, shorten } from "@/lib/api";
import type { CheckView, ProofEvidence } from "@/lib/schemas";
import { tableHash, verifyProof } from "@/lib/proof";
import { RPC_URL, sameAsShown, verifyFromRpc, type RpcVerdict } from "@/lib/rpc-verify";
import { Sigil } from "./sigil";
import { Die } from "./die";
import { RulingCard, ROW_NAMES } from "./ruling-card";
import { art } from "./art";

type CheckData = { check: CheckView; proof?: ProofEvidence };
function useCheck(id: string) {
  const [data, setData] = useState<CheckData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void getCheck(id).then((result) => { if (active) setData(result); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Couldn't load this ruling."); });
    return () => { active = false; };
  }, [id, revision]);
  return { data, error, retry: () => setRevision((value) => value + 1) };
}
function MissingProof({ error, retry }: { error: string; retry: () => void }) {
  return <div className="proof-loading">{error ? <><p role="alert">{error}</p><button className="button button-primary" onClick={retry}>Try again</button><Link className="text-link mono" href="/play">Back to game</Link></> : <><Die phase="tumbling" /><p className="mono">Loading…</p></>}</div>;
}
export function ProofView({ id }: { id: string }) {
  const { data, error, retry } = useCheck(id);
  const [results, setResults] = useState<(boolean | null)[]>([null, null, null, null]);
  const [hash, setHash] = useState("");
  const [cryptoError, setCryptoError] = useState(false);
  const [rpc, setRpc] = useState<RpcVerdict | null>(null);
  const [rpcError, setRpcError] = useState("");
  useEffect(() => {
    if (!data) return;
    let active = true;
    setResults([null, null, null, null]);
    setCryptoError(false);
    setRpcError("");
    void (async () => {
      try {
        let verdicts: boolean[];
        if (data.proof?.mode === "chain") {
          // Chain mode: the browser reads the account and transactions from Solana itself and ignores the server's evidence.
          let v: RpcVerdict;
          try { v = await verifyFromRpc(data.check.pubkey); } catch (e) { if (active) setRpcError(e instanceof Error ? e.message : "RPC error"); return; }
          if (!active) return;
          setRpc(v);
          verdicts = [v.results[0] && sameAsShown(data.check, v.account), ...v.results.slice(1)];
        } else {
          verdicts = await verifyProof(data.check, data.proof);
        }
        const computed = await tableHash(data.check);
        if (!active) return;
        setHash(computed);
        for (let i = 0; i < 4; i++) {
          if (i > 0 && data.check.status !== "resolved") break;
          await new Promise((resolve) => setTimeout(resolve, 250));
          if (!active) return;
          setResults((previous) => previous.map((value, index) => index === i ? verdicts[i] : value));
          if (!verdicts[i]) break;
        }
      } catch { if (active) { setCryptoError(true); setResults([false, null, null, null]); } }
    })();
    return () => { active = false; };
  }, [data]);
  if (!data || error) return <main id="main" className="proof-main"><MissingProof error={error} retry={retry} /></main>;
  const { check, proof } = data;
  const mock = proof?.mode === "mock";
  const failed = results.includes(false);
  const verified = results.every((result) => result === true);
  const complete = check.status === "resolved";
  const rows = [
    { title: "The ruling shown here is the one in the sealed account.", sub: rpc ? `Your browser read the account from Solana: owned by the Oathroll program, same text, DC and outcomes as shown here, DC ${rpc.account.dc} inside ${rpc.band ? `${rpc.band[0]}–${rpc.band[1]}` : "its band"}.` : `DC is within this action’s allowed range (${check.band[0]}–${check.band[1]}).`, href: explorerAccount(check.pubkey), label: "Account data" },
    { title: "Sealed before the roll was requested.", sub: check.slots.request ? `Slot ${check.slots.seal.toLocaleString("en-US")} (seal) < slot ${check.slots.request.toLocaleString("en-US")} (roll request)` : "Not rolled yet.", href: explorerTx(rpc?.txs.seal ?? check.txs.seal), label: "Seal transaction" },
    { title: "The number came from MagicBlock VRF.", sub: mock ? "Local callback evidence agrees with the recorded request and entropy." : rpc?.callbackRandomness ? `The callback was invoked by the MagicBlock VRF program (${"Vrf1RNU…"}) in slot ${check.slots.resolve?.toLocaleString("en-US")}, carrying randomness ${rpc.callbackRandomness.slice(0, 12)}…, the same bytes the account stores.` : "Looking for the VRF callback.", href: (rpc?.txs.resolve ?? check.txs.resolve) ? explorerTx((rpc?.txs.resolve ?? check.txs.resolve)!) : undefined, label: "Callback transaction" },
    { title: "The program picked the outcome from the d20.", sub: check.roll ? `D20 ${check.roll} · DC ${check.dc} → ${ROW_NAMES[check.outcome!]} · d20 recomputed here from the randomness${mock ? " (seeded mock roll)" : ""}` : "Not rolled yet.", href: check.txs.resolve ? explorerTx(check.txs.resolve) : undefined, label: "Resolve transaction" },
  ];
  return <main id="main" className="proof-main">
    <div className="proof-breadcrumb mono"><Link href="/play">← Back to game</Link><span>RULING #{String(check.seq).padStart(2, "0")} · {shorten(check.pubkey, 6)}</span></div>
    <div className="proof-heading"><Sigil hash={check.commitment ?? check.pubkey} title="Deterministic sigil for this ruling" /><div><h1>Check it <em>yourself.</em></h1><p>{mock ? "This page re-checks four facts from the evidence." : <>Your browser reads this ruling straight from Solana (<span className="mono">{RPC_URL.replace(/^https?:\/\//, "")}</span>) and re-checks four facts with the program’s own rules. It does not use our server’s evidence. Every link opens Solana Explorer.</>}</p></div></div>
    {(mock || !proof) && <div className="mock-notice mono">{mock ? "LOCAL SIMULATION · THESE CHECKS VERIFY MOCK RECORDS, NOT SOLANA OR MAGICBLOCK. EXPLORER SIGNATURES ARE ILLUSTRATIVE." : "PROOF EVIDENCE IS UNAVAILABLE. THIS RULING CANNOT BE VERIFIED."}</div>}
    <div className="proof-grid"><section className="proof-table"><RulingCard check={check} full /><p className="proof-card-caption mono">{complete ? "The other three outcomes, unchanged since sealing." : "All four outcomes, as sealed."}</p></section>
    <section className="proof-evidence" aria-label="Proof checks"><div className={`verification-summary ${failed ? "verification-summary--failed" : verified ? "verified" : ""}`} role="status"><span>{failed ? "×" : verified ? "✓" : "◇"}</span><div><strong>{failed ? "Verification stopped" : verified ? mock ? "Simulation checks passed" : "Evidence checks passed" : complete ? "Reading the evidence…" : "Sealed. Not rolled yet."}</strong><p className="mono">{rpcError ? `COULDN’T READ SOLANA FROM YOUR BROWSER: ${rpcError}` : cryptoError ? "HASHING REQUIRES HTTPS OR LOCALHOST" : failed ? "A check failed. Later checks were skipped." : `${results.filter((result) => result === true).length} of 4 checks passed${mock ? " · MOCK EVIDENCE" : ""}`}</p></div></div>
      {proof?.refusedAmendment && <details className="raw-evidence amendment-evidence" id="amendment" open><summary className="mono">Refused change · TableSealed <span>+</span></summary><p>The Keeper tried DC {proof.refusedAmendment.attemptedDc}. The program refused; DC {check.dc} stands.</p><pre>{proof.refusedAmendment.logs.join("\n")}</pre>{proof.refusedAmendment.tx && <a className="mono proof-explorer" href={explorerTx(proof.refusedAmendment.tx)} target="_blank" rel="noreferrer">Failed transaction ↗</a>}</details>}
      <ol className="verification-checks">{rows.map((row, i) => <li key={row.title} className={results[i] === false ? "proof-check failed" : results[i] ? "proof-check passed" : "proof-check waiting"}><span className="check-marker" aria-label={results[i] === false ? "Failed" : results[i] ? "Passed" : "Waiting"}>{results[i] === false ? "×" : results[i] ? "✓" : String(i + 1).padStart(2, "0")}</span><div><h2>{row.title}</h2><p>{row.sub}</p>{row.href && <a className="mono proof-explorer" href={row.href} target="_blank" rel="noreferrer">{row.label} ↗</a>}</div></li>)}</ol>
      <details className="raw-evidence"><summary className="mono">Raw data <span>+</span></summary><dl><dt>Ruling hash (computed here)</dt><dd>{hash || "—"}</dd><dt>Ruling hash (server read)</dt><dd>{proof?.accountTableHash ?? "—"}</dd><dt>RANDOMNESS · HEX</dt><dd>{check.randomness ?? "—"}</dd>{rpc && <><dt>Read by your browser from</dt><dd>{RPC_URL}</dd><dt>d20 recomputed here</dt><dd>{rpc.recomputedRoll ?? "—"}</dd></>}<dt>Changes after seal</dt><dd>{check.amendments}</dd></dl></details>
      <div className="proof-actions">{complete ? <Link href={`/r/${check.pubkey}`} className="button button-primary">Share receipt</Link> : <button onClick={retry} className="button button-outline">Refresh</button>}<Link href="/play" className="text-link mono">Back to game</Link></div>
    </section></div>
  </main>;
}
export function ReceiptView({ id }: { id: string }) {
  const { data, error, retry } = useCheck(id);
  const [copyState, setCopyState] = useState("Copy receipt link");
  if (!data || error) return <main id="main" className="receipt-main"><MissingProof error={error} retry={retry} /></main>;
  const { check, proof } = data;
  const refused = proof?.refusedAmendment;
  const refusedPlea = refused?.logs.find((line) => line.startsWith("Program log: Plea: "))?.slice("Program log: Plea: ".length);
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.href); setCopyState("Link copied ✓"); }
    catch { setCopyState("Copy the address from your browser"); }
  }
  return <main id="main" className="receipt-main"><div className="receipt-shell"><div className="receipt-seal"><Sigil hash={check.commitment ?? check.pubkey} /></div><article className="receipt-card" style={art.vellum ? { backgroundImage: `url(${art.vellum})`, backgroundSize: "512px 512px" } : undefined}><div className="receipt-topline mono"><span>OATHROLL / THE DROWNED BELFRY</span><span>NO. {String(check.seq).padStart(2, "0")}</span></div><h1>{check.actionText}</h1><div className="receipt-result"><div><span className="mono">DIFFICULTY</span><strong>{check.dc}</strong></div><Die phase={check.roll ? "landed" : "idle"} roll={check.roll} /><div><span className="mono">RESULT</span><strong className="receipt-verdict">{check.outcome !== undefined ? ROW_NAMES[check.outcome] : "Sealed"}</strong>{!check.roll && <small className="mono">NOT ROLLED</small>}</div></div><p className="receipt-narration">{check.outcome !== undefined ? check.outcomes[check.outcome].text : "Sealed. Not rolled yet."}</p>{check.outcome !== undefined && <p className="receipt-effects mono">NERVE {check.outcomes[check.outcome].nerveDelta >= 0 ? "+" : ""}{check.outcomes[check.outcome].nerveDelta} <span>·</span> PROGRESS +{check.outcomes[check.outcome].progressDelta} <span>·</span> TIDE −1</p>}<div className="receipt-oath">{refused ? <div><p>The Keeper tried to make it DC {refused.attemptedDc}. Solana refused.</p>{refusedPlea && <blockquote>“{refusedPlea}”</blockquote>}</div> : <p>Sealed on Solana before the roll.</p>}</div><div className="receipt-footer mono"><span>SEALED · SLOT {check.slots.seal.toLocaleString("en-US")}</span><span>{proof?.mode === "mock" ? "LOCAL SIMULATION · MOCK PROOF" : "SOLANA DEVNET"}</span></div></article><div className="receipt-buttons"><Link className="button button-primary" href={`/verify/${check.pubkey}`}>See proof</Link><Link className="button button-outline" href="/play">Play</Link></div><button className="copy-link mono" onClick={copyLink}>{copyState}</button><Link className="receipt-wall text-link mono" href="/wall">Refused pleas</Link></div></main>;
}
