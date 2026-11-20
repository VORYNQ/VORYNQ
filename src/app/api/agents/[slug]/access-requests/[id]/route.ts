import { accessRequests, apiKeys } from "@/server/db";
import { fail, readJson } from "@/server/http";
import { ownedAgent } from "@/server/owned-agent";
import type { AccessStatus } from "@/shared/types";

// Which states each owner action moves a request from, and to.
const ACTIONS: Record<string, { from: AccessStatus[]; to: AccessStatus }> = {
  approve: { from: ["pending", "rejected"], to: "approved" },
  reject: { from: ["pending"], to: "rejected" },
  // Removing access also revokes the key the requester made, so their apps stop at once.
  revoke: { from: ["approved"], to: "revoked" },
};

// Owner only: approve, reject or remove access. Body: { action: "approve" | "reject" | "revoke" }.
export async function PATCH(req: Request, ctx: RouteContext<"/api/agents/[slug]/access-requests/[id]">) {
  const { slug, id } = await ctx.params;
  const owned = await ownedAgent(slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  const action = typeof body?.action === "string" ? ACTIONS[body.action] : undefined;
  if (!action) return fail(400, 'Send { "action": "approve" | "reject" | "revoke" }.');

  const updated = await accessRequests.decide(owned.agent.id, id, action.from, action.to);
  if (!updated) return fail(404, "Request not found, or it was already changed.");
  if (updated.status === "revoked") await apiKeys.revokeHolder(owned.agent.id, updated.requester);
  return Response.json({ request: updated });
}
