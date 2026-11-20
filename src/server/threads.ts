// Conversation memory. A thread belongs to one customer of one agent; the scope names that customer.
import "server-only";
import { MALFORMED_KEY, apiKeyFrom } from "./api-keys";
import { apiKeys } from "./db";
import { fail, hashToken } from "./http";
import { sessionAddress } from "./session";

/** Earlier exchanges sent to the model with each job of a thread. */
export const THREAD_HISTORY_JOBS = 5;
/** Longest earlier answer sent back to the model, so long reports do not blow up every later job. */
export const THREAD_OUTPUT_MAX = 4000;

export const isThreadId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(v);

/**
 * Whose conversations these are. A key made through an access request belongs to its holder's wallet,
 * so it shares threads with that wallet on the web and keeps them when the key is replaced. An owner-made
 * key may serve many end users of one app, so its threads stay with the key. Null for anonymous visitors.
 */
export function threadScope(key: { id: string; holder: string | null } | null, wallet: string | null): string | null {
  if (key) return key.holder ? `wallet:${key.holder}` : `key:${key.id}`;
  return wallet ? `wallet:${wallet}` : null;
}

/** The caller's scope for reading or forgetting a thread: their API key if they send one, else their signed-in wallet. */
export async function requesterScope(req: Request, agentId: string): Promise<{ scope: string } | { error: Response }> {
  const raw = apiKeyFrom(req);
  if (raw === "malformed") return { error: fail(401, MALFORMED_KEY) };
  const key = raw ? await apiKeys.use(agentId, hashToken(raw)) : null;
  if (key === undefined) return { error: fail(401, "This API key is not valid for this agent.") };
  const scope = threadScope(key, key ? null : await sessionAddress());
  return scope ? { scope } : { error: fail(401, "Sign in or send an API key to see your conversations.") };
}
