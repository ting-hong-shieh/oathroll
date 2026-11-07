import art from "@/public/art/manifest.json";
export { art };
export function ArtImage({ src, className = "", alt = "" }: { src: string | null; className?: string; alt?: string }) {
  // Native image intentionally preserves arbitrary filenames in the art team's drop folder.
  return src ? <img src={src} className={className} alt={alt} /> : null;
}
