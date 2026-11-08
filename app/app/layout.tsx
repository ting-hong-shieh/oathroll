import type { Metadata } from "next";
import { Suspense } from "react";
import { Fraunces, Figtree, IBM_Plex_Mono, EB_Garamond, Jost, Newsreader, Hanken_Grotesk, Sora, Martian_Mono } from "next/font/google";
import { TypePreference } from "@/components/type-preference";
import "./globals.css";
import "./fit-type.css";
import "./sound-wall.css";

// Unselected candidates are not preloaded. Each active pairing uses at most
// four files: display roman + italic, text roman and mono roman, all at 400.
const fraunces = Fraunces({ variable: "--face-fraunces", weight: "400", style: ["normal", "italic"], subsets: ["latin"], display: "swap", preload: false });
const figtree = Figtree({ variable: "--face-figtree", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const plex = IBM_Plex_Mono({ variable: "--face-plex", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const garamond = EB_Garamond({ variable: "--face-garamond", weight: "400", style: ["normal", "italic"], subsets: ["latin"], display: "swap", preload: false });
const jost = Jost({ variable: "--face-jost", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const newsreader = Newsreader({ variable: "--face-newsreader", weight: "400", style: ["normal", "italic"], subsets: ["latin"], display: "swap", preload: false });
const hanken = Hanken_Grotesk({ variable: "--face-hanken", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const sora = Sora({ variable: "--face-sora", weight: "400", subsets: ["latin"], display: "swap", preload: false });
const martian = Martian_Mono({ variable: "--face-martian", weight: "400", subsets: ["latin"], display: "swap", preload: false });
export const metadata: Metadata = { title: "Oathroll — The Drowned Belfry", description: "You can talk the AI game master into cheating. Solana won’t let it.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" data-type="fraunces" suppressHydrationWarning className={[fraunces, figtree, plex, garamond, jost, newsreader, hanken, sora, martian].map((font) => font.variable).join(" ")}><head><script dangerouslySetInnerHTML={{ __html: `(function(){var types=['fraunces','garamond','newsreader','sora'];var requested=new URLSearchParams(location.search).get('type');var selected='fraunces';try{var saved=localStorage.getItem('oathroll-type');if(types.includes(saved))selected=saved;}catch{}if(types.includes(requested)){selected=requested;try{localStorage.setItem('oathroll-type',selected);}catch{}}document.documentElement.dataset.type=selected;})();` }} /></head><body><Suspense><TypePreference /></Suspense><a href="#main" className="skip-link">Skip to content</a>{children}</body></html>;
}
