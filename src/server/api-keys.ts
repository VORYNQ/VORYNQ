import "server-only";
// API keys for agents. A key looks like "vrq_" + 40 hex characters; only its SHA-256 hash is stored.
import { randomBytes } from "node:crypto";
import { hashToken } from "./http";

export const API_KEY_PREFIX = "vrq_";
/** Reply to a key that is not in the vrq_ + 40 hex characters format. */
export const MALFORMED_KEY = "That API key is incomplete or mistyped. Copy the whole key: vrq_ followed by 40 characters.";
/** Characters of the key kept in clear text so owners can tell keys apart. */
const SHOWN_CHARS = 10;

export function newApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(20).toString("hex")}`;
  return { key, hash: hashToken(key), prefix: key.slice(0, SHOWN_CHARS) };
}

/**
 * The key a request carries, from "Authorization: Bearer <key>" or "X-API-Key: <key>".
 * Returns null when none is sent, and "malformed" when something that is not a VORYNQ key is sent.
 */
export function apiKeyFrom(req: Request): string | null | "malformed" {
  const auth = req.headers.get("authorization");
  const raw = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : req.headers.get("x-api-key")?.trim();
  if (!raw) return null;
  return /^vrq_[0-9a-f]{40}$/.test(raw) ? raw : "malformed";
}
