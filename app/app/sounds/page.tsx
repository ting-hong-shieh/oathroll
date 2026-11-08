import type { Metadata } from "next";
import { Header } from "@/components/header";
import { SoundAudition } from "@/components/sound-audition";
import { backendMode } from "@/lib/backend-selected";

export const metadata: Metadata = { title: "Sound audition — Oathroll", robots: { index: false, follow: false } };
export default function SoundsPage() {
  return <><Header mode={backendMode} /><SoundAudition /></>;
}
