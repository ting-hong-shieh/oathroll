"use client";
import { useState, useSyncExternalStore } from "react";
import { getEnabled, play, setAmbience, SOUND_CANDIDATES, SOUND_MAP, subscribe, unlock, type SoundEvent } from "@/lib/sound";

const labels: Record<SoundEvent, string> = {
  seal: "Ruling sealed · wax pressed", throw: "d20 thrown · Roll", land: "d20 lands · result appears",
  rewrite: "Keeper crosses out and rewrites DC", refused: "REFUSED BY SOLANA · stamp",
  crack: "Wax cracks · setback / disaster", page: "New turn / page", title: "Title · first Play click",
  win: "Win · one bell", loss: "Loss · one lower, slower bell", distant: "Distant bell · night sea", button: "Button press · silent",
};
export function SoundAudition() {
  const [sea, setSea] = useState(false);
  const [last, setLast] = useState("");
  const enabled = useSyncExternalStore(subscribe, getEnabled, () => true);
  function audition(event: SoundEvent, file?: string) {
    unlock(); void play(event, file); setLast(file ?? `${event} mapping`);
  }
  return <main id="main" className="sounds-main">
    <h1>Sound audition</h1>
    <p>Every candidate plays at its event’s level. The chosen mapping varies its rate by ±5%; loss also plays at 0.8×. No music.</p>
    <p className="mono">Edit SOUND_MAP in lib/sound.ts to change a mapping. Empty files means silence; rewrite uses a short synthesised pen scratch.</p>
    <button type="button" className="button button-outline" aria-pressed={sea} onClick={() => { unlock(); setAmbience(!sea); setSea(!sea); }}>Ambience {sea ? "on" : "off"}</button>
    <p role="status" className="mono">{enabled ? last : "Sound off — enable the header control to listen."}</p>
    <div className="sound-events">{(Object.keys(SOUND_CANDIDATES) as SoundEvent[]).map((event) => <section key={event} aria-labelledby={`sound-${event}`}>
      <div className="sound-event-heading"><h2 id={`sound-${event}`}>{labels[event]}</h2><button type="button" className="button button-outline" onClick={() => audition(event)} aria-label={`Play chosen ${event}`}>Play chosen mapping</button></div>
      <p className="mono">{SOUND_MAP[event].files.join(" / ") || (SOUND_MAP[event].scratch ? "Web Audio · pen scratch" : "Silence")} · {SOUND_MAP[event].db} dBFS peak target</p>
      <div className="sound-candidates">{SOUND_CANDIDATES[event].map((file) => <button type="button" className="sound-candidate mono" key={file} onClick={() => audition(event, file)} aria-label={`Play ${file} for ${event}`}>▷ {file}</button>)}</div>
    </section>)}</div>
    <p className="mono">Sound effects: Kenney (kenney.nl), Impact Sounds, Casino Audio and RPG Audio, CC0 1.0.</p>
  </main>;
}
