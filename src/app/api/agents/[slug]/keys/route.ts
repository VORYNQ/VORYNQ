import { randomUUID } from "node:crypto";
import { newApiKey } from "@/server/api-keys";
import { apiKeys } from "@/server/db";
import { fail, readJson } from "@/server/http";
import { ownedAgent } from "@/server/owned-agent";

const MAX_ACTIVE_KEYS = 10;
const LABEL_MAX = 40;

// Owner only: the agent's API keys (never the keys themselves, only their first characters).
export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]/keys">) {
  const owned = await ownedAgent((await ctx.params).slug);
  if ("error" in owned) return owned.error;
  return Response.json({ keys: await apiKeys.forAgent(owned.agent.id) }, { headers: { "cache-control": "no-store" } });
}

// Owner only: creates a key. Body: { label? }. The full key is in this response and nowhere else, ever.
export async function POST(req: Request, ctx: RouteContext<"/api/agents/[slug]/keys">) {
  const owned = await ownedAgent((await ctx.params).slug);
  if ("error" in owned) return owned.error;
  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  const label = typeof body?.label === "string" ? body.label.trim().replace(/\s+/g, " ") : "";
  if (label.length > LABEL_MAX) return fail(400, `Keep the name under ${LABEL_MAX} characters.`, { label: `At most ${LABEL_MAX} characters.` });
  if ((await apiKeys.countActive(owned.agent.id)) >= MAX_ACTIVE_KEYS)
    return fail(400, `An agent can have ${MAX_ACTIVE_KEYS} active keys. Revoke one you no longer use first.`);

  const { key, hash, prefix } = newApiKey();
  const id = randomUUID();
  await apiKeys.insert({ id, agentId: owned.agent.id, keyHash: hash, prefix, label });
  const info = (await apiKeys.forAgent(owned.agent.id)).find((k) => k.id === id)!;
  return Response.json({ key, info }, { status: 201, headers: { "cache-control": "no-store" } });
}
