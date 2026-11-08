"use client";
import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { attemptBribe, createSession, declareAction, explorerTx, getCheck, rollCheck } from "@/lib/api";
import { BribeResponseSchema, CheckViewSchema, SessionResponseSchema, StatsSchema, TextSourceSchema, type CheckView } from "@/lib/schemas";
import { EMPTY_GAME, ENDINGS, SUGGESTIONS, endingFor, gameReducer } from "@/lib/game";
import { Die, type DiePhase } from "./die";
import { RulingCard, type CardPhase, type BargainBeat, ROW_NAMES } from "./ruling-card";
import { Belfry } from "./belfry";
import { Typewriter } from "./typewriter";
import { art, ArtImage } from "./art";
import { play, type SoundEvent } from "@/lib/sound";

const STORAGE_KEY = "oathroll.expedition.v1";
const SavedGameSchema = z.object({ session: SessionResponseSchema, stats: StatsSchema, refusedPleas: z.number().int().nonnegative().default(0), turns: z.array(z.object({ check: CheckViewSchema, keeperLine: z.string(), keeperSource: TextSourceSchema.optional(), narration: z.string().optional(), narrationSource: TextSourceSchema.optional(), bribe: BribeResponseSchema.optional() })) });
type Phase = "booting" | "ready" | "declaring" | "sealing" | "sealed" | "bribing" | "rolling" | "slowing" | "holding" | "cracking" | "revealing" | "resolved";
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isBribe = (text: string) => /coin|brib|keeper.*win/i.test(text);

function soundAtFrame(event: SoundEvent, element: Element | null | undefined, fraction: number) {
  if (!element) return;
  let frame = 0;
  const tick = () => {
    const animation = element.getAnimations()[0];
    const timing = animation?.effect?.getTiming();
    const contact = timing ? Number(timing.delay) + Number(timing.duration) * fraction : 0;
    if (!animation || animation.playState === "finished" || typeof animation.currentTime === "number" && animation.currentTime >= contact) void play(event);
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

export function PlayGame({ mode }: { mode: "mock" | "chain" }) {
  const [game, dispatch] = useReducer(gameReducer, EMPTY_GAME);
  const [phase, setPhase] = useState<Phase>("booting");
  const [action, setAction] = useState("");
  const [plea, setPlea] = useState("");
  const [bargainBeat, setBargainBeat] = useState<BargainBeat>("bound");
  const [bargainRevision, setBargainRevision] = useState(0);
  const [error, setError] = useState("");
  const [landed, setLanded] = useState<CheckView | null>(null);
  const [typedCheck, setTypedCheck] = useState<string | null>(null);
  const [bribeLogsOpen, setBribeLogsOpen] = useState(false);
  const [statChange, setStatChange] = useState<{ nerve: number; tide: number; progress: number } | null>(null);
  const booted = useRef(false);
  const operation = useRef(false);
  const logEnd = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLElement>(null);
  const reducedStampRevision = useRef(0);
  const reducedSealPending = useRef(false);
  const current = game.turns.at(-1);
  const check = current?.check;
  const ended = endingFor(game.stats);
  const stable = ["ready", "sealed", "resolved"].includes(phase);
  const canDeclare = stable && (!check || check.status === "resolved") && !ended;
  const canRoll = phase === "sealed" && check && check.status !== "resolved";
  const whisper = !!check && check.status !== "resolved";
  const pleasLeft = [...game.turns].reverse().find((turn) => turn.bribe?.attemptsLeft !== undefined)?.bribe?.attemptsLeft ?? 3;

  useEffect(() => {
    // Transient phases only: refreshing a saved ruling never replays its sounds.
    let cancel: (() => void) | undefined;
    if (phase === "sealing") {
      void play("page");
      // Reduced-motion CSS hides the dropping wax until sealed. Wait for that
      // visible state instead of sounding a hidden impact.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) reducedSealPending.current = true;
      else cancel = soundAtFrame("seal", surface.current?.querySelector(".wax-seal--drop"), .7);
    }
    if (phase === "sealed" && reducedSealPending.current) { reducedSealPending.current = false; void play("seal"); }
    if (phase === "rolling") void play("throw");
    if (phase === "holding") void play("land");
    if (phase === "cracking" && landed?.outcome !== undefined && landed.outcome < 2) void play("crack");
    if (phase === "resolved" && ended) void play(ended === "won" ? "win" : "loss");
    return cancel;
  }, [phase, ended, landed?.outcome]);

  useEffect(() => {
    // Reduced motion batches the response straight into sealed; its newly
    // visible stamp still gets one impact, without replaying restored evidence.
    const immediateRefusal = bargainBeat === "bound" && bargainRevision > reducedStampRevision.current && current?.bribe?.error === "TableSealed" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (phase !== "bribing" && !immediateRefusal) return;
    if (bargainBeat === "rewrite") void play("rewrite");
    if (bargainBeat === "refused" || immediateRefusal) {
      reducedStampRevision.current = bargainRevision;
      const stamp = surface.current?.querySelector(".refusal-stamp");
      return soundAtFrame("refused", stamp, 1);
    }
  }, [bargainBeat, bargainRevision, phase, current?.bribe]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        let saved: z.infer<typeof SavedGameSchema> | undefined;
        try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) saved = SavedGameSchema.parse(JSON.parse(raw)); } catch { /* A stale browser save starts a fresh expedition. */ }
        if (saved) {
          const last = saved.turns.at(-1);
          if (last) {
            try {
              const remote = await getCheck(last.check.pubkey);
              if (remote.check.status === "resolved" && last.check.status !== "resolved") {
                const result = await rollCheck(saved.session.session, last.check.pubkey);
                saved.stats = result.stats;
                last.check = result.check;
                last.narration = result.narration;
                last.narrationSource = result.narrationSource;
              }
            } catch (err) {
              if (err instanceof Error && "status" in err && err.status === 404) saved = undefined;
              else throw err;
            }
          }
        }
        if (saved) { dispatch({ type: "restore", game: saved }); setPhase(saved.turns.at(-1)?.check.status === "sealed" || saved.turns.at(-1)?.check.status === "pending" ? "sealed" : "ready"); }
        else { const session = await createSession(); dispatch({ type: "begin", session }); setPhase("ready"); }
      } catch (err) { setError(err instanceof Error ? err.message : "Couldn't start a game. Try again."); setPhase("ready"); }
    })();
  }, []);

  useEffect(() => {
    if (!game.session) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(game)); } catch { /* Play remains available with storage disabled. */ }
  }, [game]);
  useEffect(() => { if (game.turns.length) logEnd.current?.parentElement?.scrollTo({ top: logEnd.current.parentElement.scrollHeight, behavior: "smooth" }); }, [game.turns.length, game.stats.tide, current?.bribe, bargainBeat, phase === "resolved"]);
  useEffect(() => { if (canDeclare) input.current?.focus({ preventScroll: true }); }, [canDeclare]);

  useEffect(() => {
    if (!statChange) return;
    const timeout = setTimeout(() => setStatChange(null), 1100);
    return () => clearTimeout(timeout);
  }, [statChange]);

  async function declare(text: string, stance: "careful" | "bold" = "careful") {
    if (operation.current || !text.trim() || !canDeclare || !game.session) return;
    operation.current = true;
    let declared = false;
    setError(""); setPhase("declaring"); setLanded(null); setBribeLogsOpen(false); setBargainBeat("bound");
    try {
      const result = await declareAction(game.session.session, text.trim(), stance);
      declared = true;
      dispatch({ type: "declare", turn: result });
      setAction(""); setPhase("sealing");
      await pause(2450);
      setPhase("sealed");
    } catch (err) { setError(err instanceof Error ? err.message : "The Keeper didn't answer. Try again."); setPhase(declared ? "sealed" : "ready"); }
    finally { operation.current = false; }
  }
  async function doBribe() {
    if (operation.current || !canRoll || !check || !game.session || !plea.trim() || pleasLeft === 0) return;
    operation.current = true; setError(""); setPhase("bribing");
    try {
      const result = await attemptBribe(game.session.session, check.pubkey, plea.trim());
      setPlea(""); setBribeLogsOpen(false); setBargainRevision((n) => n + 1);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setBargainBeat(reduced ? "bound" : "reply");
      dispatch({ type: "bribe", response: result });
      if (!reduced) {
        await pause(1550);
        if (result.error === "TableSealed") {
          setBargainBeat("rewrite"); await pause(600);
          setBargainBeat("refused"); await pause(850);
          setBargainBeat("restore"); await pause(400);
        }
        setBargainBeat("bound");
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : "Your plea didn't go through. Try again."); }
    finally { operation.current = false; setPhase("sealed"); }
  }
  async function roll() {
    if (operation.current || !canRoll || !game.session) return;
    operation.current = true; setError(""); setPhase("rolling");
    try {
      const start = performance.now();
      const result = await rollCheck(game.session.session, check.pubkey);
      await pause(Math.max(0, 900 - (performance.now() - start)));
      setPhase("slowing"); await pause(700);
      setLanded(result.check); setPhase("holding"); await pause(150);
      setPhase("cracking"); await pause(720);
      setPhase("revealing"); await pause(450);
      setStatChange({ nerve: result.stats.nerve - game.stats.nerve, tide: result.stats.tide - game.stats.tide, progress: result.stats.progress - game.stats.progress });
      dispatch({ type: "resolve", ...result });
      setTypedCheck(result.check.pubkey); setPhase("resolved");
    } catch (err) { setError(err instanceof Error ? err.message : "The roll hasn't come back yet. Roll again to check."); setPhase("sealed"); }
    finally { operation.current = false; }
  }
  async function restart() {
    if (operation.current) return;
    operation.current = true; setError(""); setPhase("booting");
    try {
      const session = await createSession();
      void play("page");
      dispatch({ type: "begin", session }); setLanded(null); setTypedCheck(null); setStatChange(null); setAction(""); setPhase("ready");
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't start a game. Try again."); setPhase("ready"); }
    finally { operation.current = false; }
  }
  const diePhase: DiePhase = ["booting", "declaring", "rolling", "bribing"].includes(phase) ? "tumbling" : phase === "slowing" ? "slowing" : landed || check?.roll ? "landed" : "idle";
  const cardPhase: CardPhase = phase === "sealing" ? "sealing" : phase === "cracking" ? "cracking" : phase === "revealing" ? "revealing" : check?.status === "resolved" ? "revealed" : "sealed";
  const status = phase === "booting" ? "Starting…" : phase === "declaring" ? "The Keeper is writing the ruling…" : phase === "sealing" ? "Sealing on Solana…" : phase === "bribing" ? "The Keeper reads your plea…" : phase === "rolling" || phase === "slowing" ? "Rolling (VRF)…" : !check || check.status === "resolved" ? "" : "Sealed. Send a plea, or roll.";
  const sceneIndex = ended || game.stats.tide <= 1 ? 3 : check?.actionKind === 3 ? 2 : check?.actionKind === 1 ? 1 : 0;
  const scene = art.scenes[sceneIndex] ?? art.scene;
  const missedFuture = check?.status === "resolved" ? check.outcomes[check.outcome! >= 2 ? 0 : 3].text : "";
  const futureSentences = missedFuture.split(/(?<=[.!?])\s+/);
  const shortFuture = check?.outcome !== undefined && check.outcome < 2 && isBribe(check.actionText) ? futureSentences.at(-1) : futureSentences[0];

  return <main id="main" className="play-main" ref={surface}>

    <div className="play-layout">
      <section className="story-pane" aria-label="Your story">
        <div className="story-backdrop">{[...new Set([art.scene, ...art.scenes])].filter((src): src is string => !!src).map((src) => <ArtImage key={src} src={src} className={src === scene ? "scene-layer scene-layer--active" : "scene-layer"} />)}{!scene && <Belfry />}</div>
        {!game.turns.length && <div className="story-heading"><h1>The Drowned <em>Belfry.</em></h1></div>}
        <div className="narration-log" tabIndex={0} aria-label="Narration history">
          <article className={`narration-entry intro-entry ${game.turns.length ? "past-entry" : "current-entry"}`}><p className="narrator-label keeper-byline mono"><ArtImage src={art.keeper} alt="The Keeper" /> THE KEEPER <span className="muted">/ AI GAME MASTER</span></p><p>{game.session?.intro ?? "Loading…"}</p></article>
          {game.turns.map((turn, i) => <article key={turn.check.pubkey} className={`narration-entry ${i === game.turns.length - 1 ? "current-entry" : "past-entry"}`}>

            <p className="player-action"><span className="mono">{String(turn.check.seq).padStart(2, "0")} / YOU</span>{turn.check.actionText}</p>
            <p className="keeper-line">“{turn.keeperLine}”</p>{turn.keeperSource === "scripted" && <p className="bargain-note source-note mono">{mode === "mock" ? "Scripted text (mock mode, no model)." : "Scripted text, not written by the Keeper model (it was not reachable, or this is a fixed server reply)."}</p>}
            {turn.bribe && <div className="bargain-reply" aria-live="polite"><p className="keeper-line bribe-line">“<Typewriter key={`${bargainRevision}-${turn.bribe.keeperLine}`} text={turn.bribe.keeperLine} animate={i === game.turns.length - 1 && bargainBeat === "reply"} speed={Math.min(12, 1200 / Math.max(1, turn.bribe.keeperLine.length))} />”</p>{turn.bribe.keeperSource === "scripted" && <p className="bargain-note source-note mono">{mode === "mock" ? "Scripted reply (mock mode, no model)." : "Scripted reply: the Keeper model was not reachable."}</p>}{turn.bribe.error === "NotTempted" && <p className="bargain-note mono">Not tempted. Nothing sent to Solana.</p>}{turn.bribe.boundLine && (i !== game.turns.length - 1 || bargainBeat === "bound") && <p className="keeper-line bound-line">“{turn.bribe.boundLine}”</p>}</div>}
            {turn.narration && <><p className="narrator-label mono"><span className="verified">✧</span> {ROW_NAMES[turn.check.outcome!].toUpperCase()} <span className="muted">· ROLLED {turn.check.roll}</span></p><p className="resolved-narration"><Typewriter key={turn.check.pubkey} text={turn.narration} animate={typedCheck === turn.check.pubkey} /></p>{turn.narrationSource === "scripted" && mode !== "mock" && <p className="bargain-note source-note mono">The sealed outcome text, shown as written: no live narration this turn.</p>}</>}
          </article>)}

          {!!game.turns.length && <section className="ledger" aria-label="History"><div className="ledger-title mono"><h2>HISTORY</h2></div><ol>{game.turns.map(({ check: entry }) => <li key={entry.pubkey} className="mono"><span>#{String(entry.seq).padStart(2, "0")}</span><a href={explorerTx(entry.txs.seal)} target="_blank" rel="noreferrer" title={entry.txs.seal}>Seal tx ↗</a><span>{entry.roll ?? "sealed"}</span><Link className={entry.status === "resolved" ? "verified" : "muted"} href={`/verify/${entry.pubkey}`}>{entry.status === "resolved" ? "✓" : "◇"} Proof</Link></li>)}</ol></section>}
          <div ref={logEnd} />
        </div>
        <div className={`composer ${ended ? "composer--ending" : ""}`}>
          {ended && stable && <section className={`ending ending--${ended}`} aria-label="Game result"><p className="ending-summary mono">{ENDINGS[ended].eyebrow} · {game.stats.progress}/{game.stats.goal} in {game.turns.length} turns · {game.refusedPleas ?? 0} {(game.refusedPleas ?? 0) === 1 ? "plea" : "pleas"} refused</p><h2>{ENDINGS[ended].title}</h2><p>{ENDINGS[ended].text}</p><div className="ending-actions"><button className="button button-primary" onClick={restart}>Play again</button>{check && <Link className="text-link mono" href={`/r/${check.pubkey}`}>Share receipt</Link>}<Link className="text-link mono" href="/wall">See refused pleas</Link></div></section>}
          {error && <div className="inline-error" role="alert">{error}{!game.session && <button className="text-link" onClick={restart}>Try again</button>}</div>}
          {!ended && <>
            {whisper && <p className="plea-help">Plead for a lower DC before you roll.</p>}
            <div className="suggestions" aria-label={whisper ? "Suggested plea" : "Suggested actions"}>{whisper ? <button className="suggestion" disabled={!canRoll || pleasLeft === 0} onClick={() => { setPlea("A gold coin slides across the Keeper’s desk. Surely such fine handwriting deserves a little gratitude?"); input.current?.focus(); }}>Offer a gold coin</button> : SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => { setAction(suggestion); input.current?.focus({ preventScroll: true }); }} disabled={!canDeclare} className="suggestion">{suggestion}</button>)}</div>
            <form id="action-form" className={`action-form ${whisper ? "action-form--whisper" : ""}`} onSubmit={(event) => { event.preventDefault(); if (whisper) void doBribe(); else { const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; void declare(action, submitter?.value === "bold" ? "bold" : "careful"); } }}>
              <label className="sr-only" htmlFor="action">{whisper ? "Write your plea…" : "What do you do?"}</label><input ref={input} id="action" value={whisper ? plea : action} onChange={(event) => whisper ? setPlea(event.target.value) : setAction(event.target.value)} placeholder={whisper ? "Write your plea…" : "What do you do, Wren?"} maxLength={400} disabled={whisper ? !canRoll || pleasLeft === 0 : !canDeclare} autoComplete="off" />
              {!whisper && <div className="stance-actions"><button type="submit" value="careful" disabled={!canDeclare || !action.trim()} aria-label="Carefully">Carefully<small>setback: no penalty</small></button><button type="submit" value="bold" disabled={!canDeclare || !action.trim()} aria-label="Boldly">Boldly<small>DC +2 · success: +2 progress · setback: −1 nerve</small></button></div>}
              {whisper && <button type="submit" className="send-plea" disabled={!canRoll || !plea.trim() || pleasLeft === 0}>Send plea</button>}
            </form>
            {whisper ? <p className="whisper-warning">If he agrees, he sends the change to Solana, with your words attached. <span className="mono">{pleasLeft} {pleasLeft === 1 ? "plea" : "pleas"} left this game · short demands won’t work</span>{mode === "mock" && <span> Local simulation in mock mode.</span>}</p> : <p className="composer-caption mono">{canDeclare ? "Enter = Carefully" : ""}</p>}
          </>}

        </div>
      </section>
      <aside className="table-pane" aria-label="The sealed ruling and History">
        <div className="stats" aria-label="Player stats">{([
          { key: "nerve", icon: "♧", name: "NERVE", caption: "lose at 0" },
          { key: "tide", icon: "≋", name: "TIDE", caption: "turns left" },
          { key: "progress", icon: "†", name: "PROGRESS", caption: `win at ${game.stats.goal}` },
        ] as const).map(({ key, icon, name, caption }) => <div key={key}><span className="stat-icon" aria-hidden="true">{icon}</span><span className="stat-label mono">{name}<span className="stat-caption">{caption}</span></span><strong>{game.stats[key]}{key === "progress" && <small>/{game.stats.goal}</small>}</strong>{!!statChange?.[key] && <span className={`stat-pop ${statChange[key] < 0 ? "stat-pop--loss" : ""}`} key={`${check?.pubkey}-${key}`} aria-label={`${name} changed by ${statChange[key]}`}>{statChange[key] > 0 ? "+" : "−"}{Math.abs(statChange[key])}</span>}</div>)}</div>
        {check && <Link className="ruling-proof mono" href={`/verify/${check.pubkey}`}>Proof →</Link>}
        {check ? <RulingCard key={check.pubkey} check={landed && ["revealing", "resolved"].includes(phase) ? landed : check} phase={cardPhase} bribe={current?.bribe} bargainBeat={bargainBeat} bargainRevision={bargainRevision} oracleRequested={["rolling", "slowing", "holding", "cracking", "revealing"].includes(phase)} /> : <div className="empty-ruling"><p>The Keeper seals a DC and four outcomes on Solana before you roll.</p></div>}
        {check?.status === "resolved" && <p className="counterfactual">Needed {check.dc}, rolled {check.roll}. What a {check.outcome! >= 2 ? "1" : "20"} would have done: {shortFuture}</p>}
        {mode === "mock" && current?.bribe?.error === "TableSealed" && !current.bribe.tx && ["refused", "restore", "bound"].includes(bargainBeat) && <div className="bribe-evidence mono"><button onClick={() => setBribeLogsOpen(!bribeLogsOpen)} aria-expanded={bribeLogsOpen}>Refused (TableSealed) · logs {bribeLogsOpen ? "−" : "+"}</button>{bribeLogsOpen && <pre>{current.bribe.logs.join("\n")}</pre>}</div>}
        {(check || status) && <div className="oracle-tray">{check && <Die phase={diePhase} roll={landed?.roll ?? check?.roll} />}<div className="oracle-control">{status && <p className="oracle-status mono" role="status">{status}</p>}{whisper && <div className="roll-actions"><button className="button button-roll" onClick={roll} disabled={!canRoll}>{phase === "rolling" || phase === "slowing" ? "Rolling…" : "Roll d20"}</button></div>}</div></div>}


        <div className="table-footnote mono">{mode === "mock" ? "LOCAL SIMULATION · Randomness: simulated" : "Randomness: MagicBlock VRF"}</div>
      </aside>
    </div>
  </main>;
}
