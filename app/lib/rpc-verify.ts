// Browser-side verification straight from a Solana RPC node. Nothing here trusts the Oathroll server:
// the check account and its transactions are fetched by the browser, decoded with the program's own
// layout, and re-checked against the program's rules (dc_band, outcome_row, random_u8_with_range).
import { vrfD20 } from "./proof";

export const PROGRAM_ID = "HaaUtRdJLNAhEShaA7ibDDHoz5truec23qf5ZSq4eGGd";
export const VRF_PROGRAM_ID = "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz";
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Anchor discriminators, copied from the program IDL (lib/chain/idl/oathroll.json).
const DISC = {
  checkAccount: [184, 116, 144, 69, 156, 212, 121, 212],
  draft: [215, 221, 195, 159, 206, 144, 192, 79],
  seal: [144, 15, 40, 28, 196, 15, 177, 253],
  request: [98, 118, 98, 29, 96, 208, 255, 97],
  resolve: [35, 65, 80, 150, 53, 30, 20, 242],
};
const STATUS = ["draft", "sealed", "pending", "resolved"] as const;

export type ChainCheck = {
  session: string;
  seq: number;
  actionKind: number;
  actionText: string;
  dc: number;
  outcomes: { text: string; nerveDelta: number; progressDelta: number }[];
  status: (typeof STATUS)[number];
  amendments: number;
  slots: { draft: number; seal: number; request: number; resolve: number };
  randomness: string;
  roll: number;
  outcome: number;
};

export type RpcVerdict = {
  results: boolean[];
  account: ChainCheck;
  band: [number, number] | null;
  txs: { seal?: string; request?: string; resolve?: string };
  callbackRandomness?: string;
  recomputedRoll?: number;
};

/** The program's dc_band. */
export function dcBand(kind: number): [number, number] | null {
  return ([[6, 12], [8, 14], [8, 14], [10, 16]] as [number, number][])[kind] ?? null;
}
/** The program's outcome_row: 0 disaster (natural 1), 1 setback, 2 success, 3 triumph (natural 20). */
export function outcomeRow(roll: number, dc: number): number {
  return roll === 1 ? 0 : roll === 20 ? 3 : roll >= dc ? 2 : 1;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function base58Decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    let carry = B58.indexOf(ch);
    if (carry < 0) throw new Error("bad base58");
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const ch of s) { if (ch !== "1") break; bytes.push(0); }
  return Uint8Array.from(bytes.reverse());
}
function base58Encode(b: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of b) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) { carry += digits[i] << 8; digits[i] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = "";
  for (const byte of b) { if (byte !== 0) break; out += "1"; }
  return out + digits.reverse().map((d) => B58[d]).join("");
}
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const startsWith = (data: Uint8Array, disc: number[]) => disc.every((v, i) => data[i] === v);

/** Borsh layout of the program's Check account (lib.rs `pub struct Check`). */
export function decodeCheck(data: Uint8Array): ChainCheck {
  if (!startsWith(data, DISC.checkAccount)) throw new Error("not a Check account");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const utf8 = new TextDecoder();
  let o = 8;
  const u8 = () => data[o++];
  const i8 = () => view.getInt8(o++);
  const u16 = () => { const v = view.getUint16(o, true); o += 2; return v; };
  const u64 = () => { const v = Number(view.getBigUint64(o, true)); o += 8; return v; };
  const bytes = (n: number) => { const v = data.subarray(o, o + n); o += n; return v; };
  const str = () => { const n = view.getUint32(o, true); o += 4; return utf8.decode(bytes(n)); };
  const session = base58Encode(bytes(32));
  const seq = u16();
  const actionKind = u8();
  const actionText = str();
  const dc = u8();
  const outcomes = [0, 1, 2, 3].map(() => ({ text: str(), nerveDelta: i8(), progressDelta: i8() }));
  const status = STATUS[u8()];
  const amendments = u8();
  const slots = { draft: u64(), seal: u64(), request: u64(), resolve: u64() };
  const randomness = hex(bytes(32));
  const roll = u8();
  const outcome = u8();
  return { session, seq, actionKind, actionText, dc, outcomes, status, amendments, slots, randomness, roll, outcome };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message}`);
  return body.result as T;
}

type RawIx = { programIdIndex: number; accounts: number[]; data: string };
type RawTx = {
  slot: number;
  meta: { err: unknown; innerInstructions?: { index: number; instructions: RawIx[] }[]; loadedAddresses?: { writable: string[]; readonly: string[] } } | null;
  transaction: { message: { accountKeys: string[]; instructions: RawIx[] }; signatures: string[] };
};

/** Every instruction the program ran in this transaction, with the program that called it (null = top level). */
function programInstructions(tx: RawTx) {
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])];
  const outer = tx.transaction.message.instructions;
  const out: { caller: string | null; data: Uint8Array; accounts: string[] }[] = [];
  outer.forEach((ix) => {
    if (keys[ix.programIdIndex] === PROGRAM_ID) out.push({ caller: null, data: base58Decode(ix.data), accounts: ix.accounts.map((a) => keys[a]) });
  });
  for (const group of tx.meta?.innerInstructions ?? []) {
    const caller = keys[outer[group.index]?.programIdIndex];
    for (const ix of group.instructions)
      if (keys[ix.programIdIndex] === PROGRAM_ID) out.push({ caller, data: base58Decode(ix.data), accounts: ix.accounts.map((a) => keys[a]) });
  }
  return out;
}

export async function verifyFromRpc(checkAddress: string): Promise<RpcVerdict> {
  const info = await rpc<{ value: { owner: string; data: [string, string] } | null }>("getAccountInfo", [checkAddress, { encoding: "base64", commitment: "confirmed" }]);
  if (!info.value) throw new Error("This check account does not exist on devnet.");
  const owned = info.value.owner === PROGRAM_ID;
  const account = decodeCheck(Uint8Array.from(atob(info.value.data[0]), (c) => c.charCodeAt(0)));
  const band = dcBand(account.actionKind);

  const sigs = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [checkAddress, { limit: 25, commitment: "confirmed" }]);
  const txs: RpcVerdict["txs"] = {};
  let callbackRandomness: string | undefined;
  let callbackOk = false;
  for (const s of sigs.filter((x) => !x.err)) {
    const tx = await rpc<RawTx | null>("getTransaction", [s.signature, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
    if (!tx || tx.meta?.err) continue;
    for (const ix of programInstructions(tx)) {
      if (!ix.accounts.includes(checkAddress)) continue;
      if (startsWith(ix.data, DISC.seal) || (startsWith(ix.data, DISC.draft) && !txs.seal)) txs.seal = s.signature;
      if (startsWith(ix.data, DISC.request)) txs.request = s.signature;
      if (startsWith(ix.data, DISC.resolve)) {
        txs.resolve = s.signature;
        callbackRandomness = hex(ix.data.subarray(8, 40));
        callbackOk = ix.caller === VRF_PROGRAM_ID && tx.slot === account.slots.resolve;
      }
    }
  }

  const resolved = account.status === "resolved";
  const recomputedRoll = resolved ? vrfD20(account.randomness) : undefined;
  const results = [
    owned && account.status !== "draft" && !!band && account.dc >= band[0] && account.dc <= band[1],
    resolved || account.status === "pending" ? account.slots.seal > 0 && account.slots.seal < account.slots.request : account.status === "sealed",
    resolved && callbackOk && callbackRandomness === account.randomness && account.slots.request < account.slots.resolve,
    resolved && recomputedRoll === account.roll && outcomeRow(account.roll, account.dc) === account.outcome,
  ];
  return { results, account, band, txs, callbackRandomness, recomputedRoll };
}

/** Does what the page shows (from our server) match what the browser read from the chain? */
export function sameAsShown(shown: { actionText: string; dc: number; outcomes: { text: string; nerveDelta: number; progressDelta: number }[]; roll?: number; outcome?: number }, a: ChainCheck): boolean {
  return shown.actionText === a.actionText && shown.dc === a.dc
    && shown.outcomes.every((o, i) => o.text === a.outcomes[i].text && o.nerveDelta === a.outcomes[i].nerveDelta && o.progressDelta === a.outcomes[i].progressDelta)
    && (a.status !== "resolved" || (shown.roll === a.roll && shown.outcome === a.outcome));
}
