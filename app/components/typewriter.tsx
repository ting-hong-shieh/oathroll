"use client";
import { useEffect, useState } from "react";

export function Typewriter({ text, animate = true, speed = 14 }: { text: string; animate?: boolean; speed?: number }) {
  const [count, setCount] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setCount(text.length); return; }
    const start = performance.now() + 300;
    let frame: number;
    const tick = () => {
      const next = Math.min(text.length, Math.max(0, Math.floor((performance.now() - start) / speed)));
      setCount(next);
      if (next < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, animate, speed]);
  return <span className="typewriter"><span className="sr-only">{text}</span><span aria-hidden="true">{animate ? text.slice(0, count) : text}<span className="typewriter-reserve">{animate ? text.slice(count) : ""}</span></span></span>;
}
