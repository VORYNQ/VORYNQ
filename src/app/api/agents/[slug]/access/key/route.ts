import { randomUUID } from "node:crypto";
import { newApiKey } from "@/server/api-keys";
import { accessRequests, agents, apiKeys } from "@/server/db";
import { fail } from "@/server/http";
import { sessionAddress } from "@/server/session";

// An approved requester makes their own API key. It replaces their previous one, and the full key
// is in this response and nowhere else, so it never passes through the owner or a chat message.
export async function POST(_req: Request, ctx: RouteContext<"/api/agents/[slug]/access/key">) {
  const viewer = await sessionAddress();
  if (!viewer) return fail(401, "Connect your wallet and sign in first.");
  const agent = await agents.bySlug((await ctx.params).slug);
  if (!agent) return fail(404, "Agent not found.");
  if ((await accessRequests.mine(agent.id, viewer))?.status !== "approved") return fail(403, "Your access to this agent has not been approved.");

  await apiKeys.revokeHolder(agent.id, viewer);
  const { key, hash, prefix } = newApiKey();
  const id = randomUUID();
  await apiKeys.insert({ id, agentId: agent.id, keyHash: hash, prefix, label: "", holder: viewer });
  const info = (await apiKeys.activeForHolder(agent.id, viewer))!;
  return Response.json({ key, info }, { status: 201, headers: { "cache-control": "no-store" } });
}
