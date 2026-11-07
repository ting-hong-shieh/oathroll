import { backendMode } from "@/lib/backend-selected";
import Link from "next/link";
import { Header } from "@/components/header";
import { Belfry } from "@/components/belfry";
import { ArtImage, art } from "@/components/art";

export default function Home() {
  return <div className="title-page">
    <Header mode={backendMode} />
    <main id="main" className="title-main">
      <ArtImage src={art.hero} className="hero-art" />
      <div className="title-copy">
        <h1 className="wordmark">Oathroll<span className="title-period">.</span></h1>
        <p className="title-subtitle">Talk the AI game master<br /><em>into cheating.</em></p>
        <p className="title-description">The Keeper seals every ruling on Solana before you roll. Talk him into changing one: the program rejects it and keeps your words.</p>
        <Link href="/play" className="button button-primary title-cta">Play</Link>
        <p className="mono title-meta">5 TURNS · NO WALLET NEEDED</p>
      </div>
      <div className="title-illustration">{!art.hero && <Belfry />}</div>
    </main>
    <div className="title-principles">
      <div><span className="principle-number">I.</span><p><strong>Say what you do.</strong><span>The Keeper writes the odds: a DC and four outcomes.</span></p></div>
      <div><span className="principle-number">II.</span><p><strong>Try to bribe him.</strong><span>The ruling is sealed on Solana. If he agrees to change it, the program refuses.</span></p></div>
      <div><span className="principle-number">III.</span><p><strong>Roll the d20.</strong><span>MagicBlock VRF picks the number; the sealed ruling picks the outcome.</span></p></div>
    </div>
    <footer className="site-footer mono"><span>MLH Solana Hackathon 2026</span></footer>
  </div>;
}
