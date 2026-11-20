// Sign In With Solana (SIWS) on the server: checks the message a Solana wallet signed and its ed25519 signature.
// The wallet builds the message from our input (domain, nonce, times) and signs it off-chain: no transaction, no fee.
import "server-only";
import { createPublicKey, verify } from "node:crypto";
import bs58 from "bs58";
import { parseSignInMessage } from "@solana/wallet-standard-util";
import { isSolanaAddress } from "@/shared/address";

/** How far a message's issuedAt may be from now (Phantom's SIWS spec uses 10 minutes). */
const MAX_SKEW_MS = 10 * 60_000;

// An ed25519 public key in SPKI form, so node:crypto can verify with it: fixed DER prefix + the 32 raw bytes.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verifyEd25519(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  if (publicKey.length !== 32 || signature.length !== 64) return false;
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey)]), format: "der", type: "spki" });
  return verify(null, Buffer.from(message), key, Buffer.from(signature));
}

/**
 * Hardware wallets (a Ledger inside Phantom, for example) sign a Solana "off-chain message": the text wrapped in a fixed
 * header. Both the older Ledger layout and the v0 standard layout are accepted, for each message format byte.
 */
function offchainEnvelopes(message: Uint8Array, publicKey: Uint8Array): Buffer[] {
  const header = Buffer.concat([Buffer.from([0xff]), Buffer.from("solana offchain")]);
  const len = Buffer.alloc(2);
  len.writeUInt16LE(message.length);
  const body = Buffer.from(message);
  const out: Buffer[] = [];
  for (const format of [0, 1, 2]) {
    out.push(Buffer.concat([header, Buffer.from([0, format]), len, body]));
    out.push(Buffer.concat([header, Buffer.from([0]), Buffer.alloc(32), Buffer.from([format, 1]), Buffer.from(publicKey), len, body]));
  }
  return out;
}

const fromBase64 = (v: unknown): Uint8Array | null => {
  if (typeof v !== "string" || !v || v.length > 4096) return null;
  try {
    return new Uint8Array(Buffer.from(v, "base64"));
  } catch {
    return null;
  }
};

export type SignInCheck = { ok: true; address: string; nonce: string } | { ok: false; error: string };

/**
 * Checks a signed SIWS message: well formed, for one of our hosts, signed by the address it names, and within
 * its time window. The caller still has to consume the returned nonce (one use only).
 */
export function checkSolanaSignIn(body: { address?: unknown; message?: unknown; signature?: unknown }, hosts: string[]): SignInCheck {
  const message = fromBase64(body.message);
  const signature = fromBase64(body.signature);
  if (!message || !signature || !isSolanaAddress(body.address)) return { ok: false, error: "Send the signed message, its signature and the wallet address." };

  const input = parseSignInMessage(message);
  if (!input) return { ok: false, error: "That sign-in message is not valid." };
  if (!hosts.includes(input.domain)) return { ok: false, error: "This sign-in message was made for a different site." };
  if (input.address !== body.address) return { ok: false, error: "The sign-in message names a different wallet." };
  if (!input.nonce) return { ok: false, error: "That sign-in message has no nonce." };
  if (input.chainId && input.chainId !== "mainnet" && input.chainId !== "solana:mainnet") return { ok: false, error: "Sign in on Solana mainnet." };

  const now = Date.now();
  const issued = input.issuedAt ? Date.parse(input.issuedAt) : NaN;
  if (!Number.isFinite(issued) || Math.abs(now - issued) > MAX_SKEW_MS) return { ok: false, error: "This sign-in request has expired. Please try again." };
  if (input.expirationTime && Date.parse(input.expirationTime) < now) return { ok: false, error: "This sign-in request has expired. Please try again." };
  if (input.notBefore && Date.parse(input.notBefore) > now) return { ok: false, error: "This sign-in request is not valid yet." };

  let publicKey: Uint8Array;
  try {
    publicKey = bs58.decode(input.address);
  } catch {
    return { ok: false, error: "That wallet address is not valid." };
  }
  const valid = verifyEd25519(message, signature, publicKey) || offchainEnvelopes(message, publicKey).some((m) => verifyEd25519(m, signature, publicKey));
  // The short code (message bytes, signature bytes) lets support see what the wallet returned, without any secret in it.
  if (!valid) return { ok: false, error: `The signature does not match this wallet. (code m${message.length}-s${signature.length})` };
  return { ok: true, address: input.address, nonce: input.nonce };
}
