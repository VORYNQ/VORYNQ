import { accessRequests, agents, toPublic } from "@/server/db";
import { fail, isNameConflict, readJson } from "@/server/http";
import { ownedAgent } from "@/server/owned-agent";
import { sessionAddress } from "@/server/session";
import { validateAgent } from "@/server/validate";
import { NAME_TAKEN } from "@/shared/catalog";
import { officialAgentsReleased } from "@/shared/releases";

const FRANCHISE_EDITABLE = new Set(["name", "description", "priceUsdc", "notifyUrl", "dailyJobLimit", "customerDailyLimit"]);

export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]">) {
  const agent = await agents.bySlug((await ctx.params).slug);
  if (!agent) return fail(404, "Agent not found.");
  const viewer = await sessionAddress();
  // An official agent before its release (src/shared/releases.ts) is visible to its owner only, like its page.
  if (agent.official && !officialAgentsReleased() && !(viewer && viewer === agent.ownerAddress)) return fail(404, "Agent not found.");
  return Response.json({ agent: toPublic(agent, viewer) });
}

// Edits an agent. Owner only; send just the fields to change.
export async function PATCH(req: Request, ctx: RouteContext<"/api/agents/[slug]">) {
  const owned = await ownedAgent((await ctx.params).slug);
  if ("error" in owned) return owned.error;

  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body.");
  // A franchise operator sets only their storefront; the agent itself (instructions, tools, model, category) stays the creator's.
  if (owned.agent.franchise) {
    const locked = Object.keys(body).filter((k) => !FRANCHISE_EDITABLE.has(k));
    if (locked.length) return fail(400, `A franchise can change only its name, description, price, notifications and daily limits (not ${locked.join(", ")}).`);
  }
  const result = validateAgent(body, true, owned.agent.tools);
  if ("errors" in result) return fail(400, "Some fields need attention.", result.errors);
  const tools = result.ok.tools ?? owned.agent.tools;
  const webhookUrl = result.ok.webhookUrl !== undefined ? result.ok.webhookUrl : owned.agent.webhookUrl;
  if (tools.includes("send_webhook") && !webhookUrl)
    return fail(400, "Some fields need attention.", { webhookUrl: "Add the webhook URL, or turn off Send webhook." });

  // Franchises run only public agents.
  if (result.ok.apiPrivate === true && owned.agent.allowFranchise)
    return fail(400, "Turn off franchising before making this agent private.", { apiPrivate: "Turn off franchising first." });

  if (result.ok.name !== undefined && (await agents.nameTaken(result.ok.name, owned.agent.id)))
    return fail(409, "Some fields need attention.", { name: NAME_TAKEN });

  // The slug stays the same on rename so existing links and API clients keep working.
  try {
    await agents.update(owned.agent.id, result.ok);
  } catch (err) {
    if (isNameConflict(err)) return fail(409, "Some fields need attention.", { name: NAME_TAKEN });
    throw err;
  }
  // Turning auto-approve on lets in everyone who was already waiting.
  if (result.ok.autoApprove === true) await accessRequests.approvePending(owned.agent.id);
  const updated = await agents.bySlug(owned.agent.slug);
  return Response.json({ agent: toPublic(updated!, owned.viewer) });
}

// Deletes an agent and its job history. Owner only.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/agents/[slug]">) {
  const owned = await ownedAgent((await ctx.params).slug);
  if ("error" in owned) return owned.error;
  await agents.remove(owned.agent.id);
  return Response.json({ deleted: owned.agent.slug });
}
