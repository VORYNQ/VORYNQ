import { accessRequests, agents, apiKeys } from "@/server/db";
import { fail, readJson } from "@/server/http";
import { sessionAddress } from "@/server/session";
import type { MyAccess } from "@/shared/types";

const MESSAGE_MAX = 300;

async function myAccess(agentId: string, address: string): Promise<MyAccess | null> {
  const req = await accessRequests.mine(agentId, address);
  if (!req) return null;
  const { id: _id, requester: _r, ...rest } = req;
  return { ...rest, key: req.status === "approved" ? (await apiKeys.activeForHolder(agentId, address)) ?? null : null };
}

// The signed-in wallet's request to this agent, or null if it has not asked.
export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]/access">) {
  const viewer = await sessionAddress();
  if (!viewer) return fail(401, "Connect your wallet and sign in first.");
  const agent = await agents.bySlug((await ctx.params).slug);
  if (!agent) return fail(404, "Agent not found.");
  return Response.json({ access: await myAccess(agent.id, viewer) }, { headers: { "cache-control": "no-store" } });
}

// Asks the owner of a private agent for access. Body: { message? }. Approved at once when the owner turned on auto-approve.
export async function POST(req: Request, ctx: RouteContext<"/api/agents/[slug]/access">) {
  const viewer = await sessionAddress();
  if (!viewer) return fail(401, "Connect your wallet and sign in to ask for access.");
  const agent = await agents.bySlug((await ctx.params).slug);
  if (!agent) return fail(404, "Agent not found.");
  if (agent.ownerAddress === viewer) return fail(400, "You own this agent, so you already have access.");
  if (!agent.apiPrivate) return fail(400, "This agent is public: anyone can hire it without asking.");

  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length > MESSAGE_MAX) return fail(400, "Some fields need attention.", { message: `Keep it under ${MESSAGE_MAX} characters.` });

  const existing = await accessRequests.mine(agent.id, viewer);
  if (existing?.status === "revoked") return fail(403, "The owner removed your access to this agent.");
  if (existing?.status === "approved") return Response.json({ access: await myAccess(agent.id, viewer) });

  await accessRequests.open(agent.id, viewer, message, agent.autoApprove ? "approved" : "pending");
  return Response.json({ access: await myAccess(agent.id, viewer) }, { status: 201 });
}
