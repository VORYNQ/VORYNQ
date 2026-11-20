// Wallet sessions for Sign In With Solana.
// The cookie holds only the wallet address and an expiry,
// signed with SESSION_SECRET so it cannot be forged; nothing else about the user is stored.
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isSolanaAddress } from "@/shared/address";

const COOKIE = "vorynq_session";
const MAX_AGE_S = 7 * 24 * 3600;

// The signing key: SESSION_SECRET when set. Otherwise it is derived from DATABASE_URL, which is already secret
// and set everywhere the app runs (anyone who knows it controls the database anyway); changing either one
// signs everybody out. With neither, development uses a random per-process key (sign-ins end on restart).
const g = globalThis as typeof globalThis & { __vorynqDevSecret?: string };
function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 32) return s;
  const db = process.env.DATABASE_URL;
  if (db) return createHmac("sha256", "vorynq-session-key-v1").update(db).digest("hex");
  if (process.env.NODE_ENV === "production") throw new Error("Set SESSION_SECRET (at least 32 characters) or DATABASE_URL.");
  if (!g.__vorynqDevSecret) {
    g.__vorynqDevSecret = randomBytes(32).toString("hex");
    console.warn("SESSION_SECRET is not set; using a temporary secret. Wallet sign-ins will reset when the dev server restarts.");
  }
  return g.__vorynqDevSecret;
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

/** Starts a session for the Solana wallet address (case-sensitive, stored as given). */
export async function startSession(address: string) {
  const payload = Buffer.from(JSON.stringify({ a: address, e: Date.now() + MAX_AGE_S * 1000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in Solana wallet address, or null. */
export async function sessionAddress(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { a, e } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { a?: unknown; e?: unknown };
    return typeof a === "string" && isSolanaAddress(a) && typeof e === "number" && e > Date.now() ? a : null;
  } catch {
    return null;
  }
}
