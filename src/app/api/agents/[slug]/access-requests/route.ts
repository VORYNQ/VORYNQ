import { accessRequests } from "@/server/db";
import { ownedAgent } from "@/server/owned-agent";

// Owner only: who asked for access to this agent, waiting requests first.
export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]/access-requests">) {
  const owned = await ownedAgent((await ctx.params).slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  return Response.json({ requests: await accessRequests.forAgent(owned.agent.id) }, { headers: { "cache-control": "no-store" } });
}
