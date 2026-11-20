import { examples } from "@/server/db";
import { fail, readJson } from "@/server/http";
import { ownedAgent } from "@/server/owned-agent";
import { validateExample } from "@/server/validate";

// Owner only: edits an example. Body: { input, output }.
export async function PATCH(req: Request, ctx: RouteContext<"/api/agents/[slug]/examples/[id]">) {
  const { slug, id } = await ctx.params;
  const owned = await ownedAgent(slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body.");
  const result = validateExample(body);
  if ("errors" in result) return fail(400, "Some fields need attention.", result.errors);
  const example = await examples.update(owned.agent.id, id, result.ok);
  if (!example) return fail(404, "Example not found.");
  return Response.json({ example });
}

// Owner only: deletes an example.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/agents/[slug]/examples/[id]">) {
  const { slug, id } = await ctx.params;
  const owned = await ownedAgent(slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  if (!(await examples.remove(owned.agent.id, id))) return fail(404, "Example not found.");
  return Response.json({ deleted: id });
}
