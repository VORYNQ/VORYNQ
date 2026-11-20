import { randomBytes } from "node:crypto";
import { nonces } from "@/server/db";

const NONCE_TTL_MS = 5 * 60_000;

// A fresh one-time nonce for the Sign In With Solana message. It expires after 5 minutes.
export async function POST() {
  const nonce = randomBytes(16).toString("hex");
  await nonces.create(nonce, NONCE_TTL_MS);
  return Response.json({ nonce }, { headers: { "cache-control": "no-store" } });
}
