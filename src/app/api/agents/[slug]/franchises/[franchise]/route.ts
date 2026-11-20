import { franchises } from "@/server/db";
import { fail, readJson } from "@/server/http";
import { ownedAgent } from "@/server/owned-agent";
import type { FranchiseStatus } from "@/shared/franchise";

// Creator of the original agent: pause, resume or close (revoke) one of its franchises. Closing is final.
const ACTIONS: Record<string, { from: FranchiseStatus[]; to: FranchiseStatus }> = {
  pause: { from: ["active"], to: "paused" },
  resume: { from: ["paused"], to: "active" },
  revoke: { from: ["active", "paused"], to: "revoked" },
};

export async function PATCH(req: Request, ctx: RouteContext<"/api/agents/[slug]/franchises/[franchise]">) {
  const { slug, franchise } = await ctx.params;
  const owned = await ownedAgent(slug);
  if ("error" in owned) return owned.error;
  const body = await readJson(req);
  const name = body && body !== "too_large" && typeof body.action === "string" ? body.action : "";
  const action = Object.hasOwn(ACTIONS, name) ? ACTIONS[name] : undefined;
  if (!action) return fail(400, "Send an action: pause, resume or revoke.");
  if (!(await franchises.setStatus(owned.agent.id, franchise, action.from, action.to)))
    return fail(409, "This franchise cannot do that now. Refresh and try again.");
  const list = await franchises.ofParent(owned.agent.id);
  return Response.json({ franchise: list.find((f) => f.slug === franchise) ?? null });
}
