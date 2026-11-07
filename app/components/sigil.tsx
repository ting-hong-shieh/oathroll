import { sigilPath } from "@/lib/sigil";

export function Sigil({ hash, className = "", title }: { hash: string; className?: string; title?: string }) {
  return <svg className={`sigil ${className}`} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
    {title && <title>{title}</title>}
    <circle cx="50" cy="50" r="44" strokeWidth="0.8" />
    <circle cx="50" cy="50" r="39" strokeWidth="0.5" strokeDasharray="1 4" />
    <path d={sigilPath(hash)} />
    <path d="M50 43 57 50 50 57 43 50Z" />
  </svg>;
}
export const BRAND_HASH = "a47f09c32b186e5793d8210f8ca2661b";
