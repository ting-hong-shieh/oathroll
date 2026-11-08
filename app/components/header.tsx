import Link from "next/link";
import { Sigil, BRAND_HASH } from "./sigil";
import { SoundControl } from "./sound-control";

export function Header({ mode = "mock" }: { mode?: "mock" | "chain" }) {
  return <header className="site-header" data-backend={mode}>
    <Link className="brand" href="/" aria-label="Oathroll home"><Sigil hash={BRAND_HASH} /><span>Oathroll</span></Link>
    <Link className="wall-nav mono" href="/wall">Refused pleas</Link>
    <span className="network mono"><span className="network-dot" />{mode === "chain" ? "DEVNET" : "LOCAL"}</span>
    <SoundControl />
  </header>;
}
