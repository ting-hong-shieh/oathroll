const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function decodeHash(input: string): Uint8Array {
  const hex = input.replace(/^0x/, "");
  if (/^[a-f\d]+$/i.test(hex) && hex.length % 2 === 0 && (input.startsWith("0x") || hex.length >= 32)) return Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16));
  if (!input || [...input].some((char) => !ALPHABET.includes(char))) throw new Error("Expected a hex or base58 hash");
  let value = 0n;
  for (const char of input) value = value * 58n + BigInt(ALPHABET.indexOf(char));
  const bytes: number[] = [];
  while (value > 0n) { bytes.unshift(Number(value % 256n)); value /= 256n; }
  for (const char of input) { if (char !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}
/** 100 × 100 viewBox; eight radial spokes, first 16 decoded bytes only. */
export function sigilPath(hash: string): string {
  const bytes = decodeHash(hash);
  const point = (radius: number, angle: number) => `${(50 + Math.cos(angle) * radius).toFixed(2)} ${(50 + Math.sin(angle) * radius).toFixed(2)}`;
  return Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4 - Math.PI / 2;
    const length = 22 + (bytes[i * 2] ?? 0) % 17;
    const notch = 11 + (bytes[i * 2 + 1] ?? 0) % 10;
    return `M ${point(7, angle)} L ${point(length, angle)} M ${point(notch, angle)} L ${point(notch + 4, angle - 0.22)} M ${point(notch, angle)} L ${point(notch + 4, angle + 0.22)}`;
  }).join(" ");
}
