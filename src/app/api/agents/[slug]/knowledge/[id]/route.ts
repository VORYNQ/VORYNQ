import { knowledge } from "@/server/db";
import { KNOWLEDGE_BODY_BYTES, fail, readJson } from "@/server/http";
import { checkDoc } from "@/server/knowledge-input";
import { prepareChunks } from "@/server/knowledge";
import { ownedAgent } from "@/server/owned-agent";

// Owner only: one document with its full text, for editing.
export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]/knowledge/[id]">) {
  const { slug, id } = await ctx.params;
  const owned = await ownedAgent(slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  const doc = await knowledge.content(owned.agent.id, id);
  if (!doc) return fail(404, "Document not found.");
  return Response.json(doc, { headers: { "cache-control": "no-store" } });
}

// Owner only: replaces a document's title and text. Body: { title, content }.
export async function PATCH(req: Request, ctx: RouteContext<"/api/agents/[slug]/knowledge/[id]">) {
  const { slug, id } = await ctx.params;
  const owned = await ownedAgent(slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  const body = await readJson(req, KNOWLEDGE_BODY_BYTES);
  if (body === "too_large") return fail(413, "Request body too large. Split the document into smaller parts.");
  if (!body) return fail(400, "Send a JSON body.");
  if (!(await knowledge.content(owned.agent.id, id))) return fail(404, "Document not found.");
  const checked = await checkDoc(owned.agent.id, body, id);
  if ("errors" in checked) return fail(400, "Some fields need attention.", checked.errors);
  if ("limit" in checked) return fail(400, checked.limit!);
  const chunks = await prepareChunks(checked.ok.title, checked.ok.content);
  const doc = await knowledge.save(owned.agent.id, { id, ...checked.ok }, chunks);
  if (!doc) return fail(404, "Document not found.");
  return Response.json({ doc });
}

// Owner only: deletes a document. The agent stops using it from the next job.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/agents/[slug]/knowledge/[id]">) {
  const { slug, id } = await ctx.params;
  const owned = await ownedAgent(slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  if (!(await knowledge.remove(owned.agent.id, id))) return fail(404, "Document not found.");
  return Response.json({ deleted: id });
}
