import { examples, jobs } from "@/server/db";
import { fail, readJson } from "@/server/http";
import { ownedAgent } from "@/server/owned-agent";
import { validateExample } from "@/server/validate";
import { LIMITS } from "@/shared/catalog";

// Owner only: the agent's training examples, in the order the model sees them.
export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]/examples">) {
  const owned = await ownedAgent((await ctx.params).slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  return Response.json({ examples: await examples.forAgent(owned.agent.id) }, { headers: { "cache-control": "no-store" } });
}

// Owner only: adds an example. Body: { input, output, sourceJobId? } (sourceJobId when saved from a real job).
export async function POST(req: Request, ctx: RouteContext<"/api/agents/[slug]/examples">) {
  const owned = await ownedAgent((await ctx.params).slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body.");
  const result = validateExample(body);
  if ("errors" in result) return fail(400, "Some fields need attention.", result.errors);
  if ((await examples.count(owned.agent.id)) >= LIMITS.examplesMax)
    return fail(400, `An agent can have ${LIMITS.examplesMax} examples. Delete or edit one first.`);

  let sourceJobId: string | null = null;
  if (typeof body.sourceJobId === "string") {
    const job = await jobs.byId(body.sourceJobId);
    if (!job || job.agentSlug !== owned.agent.slug) return fail(400, "That job does not belong to this agent.");
    sourceJobId = job.id;
  }
  return Response.json({ example: await examples.insert(owned.agent.id, { ...result.ok, sourceJobId }) }, { status: 201 });
}
