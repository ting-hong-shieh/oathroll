import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const fraunces = localFont({ src: "../public/fonts/fraunces.ttf", variable: "--font-display", weight: "100 900", display: "swap" });
const plex = localFont({ src: "../public/fonts/ibm-plex-mono.ttf", variable: "--font-mono", weight: "400", display: "swap" });
export const metadata: Metadata = { title: "Oathroll — The Drowned Belfry", description: "You can talk the AI game master into cheating. Solana won’t let it.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" className={`${fraunces.variable} ${plex.variable}`}><body><a href="#main" className="skip-link">Skip to content</a>{children}</body></html>;
}
