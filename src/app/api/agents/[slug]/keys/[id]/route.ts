import { apiKeys } from "@/server/db";
import { fail } from "@/server/http";
import { ownedAgent } from "@/server/owned-agent";

// Owner only: revokes a key. Apps using it get 401 from then on; this cannot be undone.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/agents/[slug]/keys/[id]">) {
  const { slug, id } = await ctx.params;
  const owned = await ownedAgent(slug);
  if ("error" in owned) return owned.error;
  if (!(await apiKeys.revoke(owned.agent.id, id))) return fail(404, "Key not found, or already revoked.");
  return Response.json({ revoked: id });
}
