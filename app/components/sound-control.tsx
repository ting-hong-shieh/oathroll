"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { getEnabled, initialize, play, refreshVisibility, setEnabled, setScene, subscribe, unlock } from "@/lib/sound";

export function SoundControl() {
  const pathname = usePathname();
  const on = useSyncExternalStore(subscribe, getEnabled, () => true);
  const titleClicked = useRef(false);
  useEffect(() => {
    initialize();
    const scene = pathname === "/sounds" ? "audition" : ["/", "/play"].includes(pathname) ? "game" : "silent";
    setScene(scene);
    const gesture = (event: Event) => {
      if (scene === "silent" || !(event.target instanceof Element) || event.target.closest(".sound-toggle")) return;
      if (event instanceof KeyboardEvent && (!["Enter", " "].includes(event.key) || event.repeat)) return;
      unlock();
      if (pathname === "/" && !titleClicked.current && event.target.closest(".title-cta")) {
        titleClicked.current = true; void play("title");
      }
    };
    document.addEventListener("pointerdown", gesture, true);
    document.addEventListener("keydown", gesture, true);
    document.addEventListener("visibilitychange", refreshVisibility);
    return () => {
      document.removeEventListener("pointerdown", gesture, true);
      document.removeEventListener("keydown", gesture, true);
      document.removeEventListener("visibilitychange", refreshVisibility);
      if (!["/", "/play"].includes(window.location.pathname)) setScene("silent");
    };
  }, [pathname]);
  return <button type="button" className="sound-toggle" aria-label={on ? "Sound on" : "Sound off"} aria-pressed={on} title={on ? "Sound on" : "Sound off"} onClick={() => { setEnabled(!on); if (!on) unlock(); }}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4 6 8H3v8h3l5 4Z" />
      {on ? <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 6 6m0-6-6 6" />}
    </svg>
  </button>;
}
