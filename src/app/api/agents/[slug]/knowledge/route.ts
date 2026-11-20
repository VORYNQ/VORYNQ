import { knowledge } from "@/server/db";
import { KNOWLEDGE_BODY_BYTES, fail, readJson } from "@/server/http";
import { checkDoc } from "@/server/knowledge-input";
import { prepareChunks } from "@/server/knowledge";
import { ownedAgent } from "@/server/owned-agent";

// Owner only: the agent's knowledge base documents (without their text) and how much room is used.
export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[slug]/knowledge">) {
  const owned = await ownedAgent((await ctx.params).slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  const docs = await knowledge.docs(owned.agent.id);
  return Response.json({ docs, usedChars: docs.reduce((n, d) => n + d.chars, 0) }, { headers: { "cache-control": "no-store" } });
}

// Owner only: adds a document. Body: { title, content }. It is split and indexed for search right away.
export async function POST(req: Request, ctx: RouteContext<"/api/agents/[slug]/knowledge">) {
  const owned = await ownedAgent((await ctx.params).slug, { noFranchise: true });
  if ("error" in owned) return owned.error;
  const body = await readJson(req, KNOWLEDGE_BODY_BYTES);
  if (body === "too_large") return fail(413, "Request body too large. Split the document into smaller parts.");
  if (!body) return fail(400, "Send a JSON body.");
  const checked = await checkDoc(owned.agent.id, body);
  if ("errors" in checked) return fail(400, "Some fields need attention.", checked.errors);
  if ("limit" in checked) return fail(400, checked.limit!);
  const chunks = await prepareChunks(checked.ok.title, checked.ok.content);
  return Response.json({ doc: await knowledge.save(owned.agent.id, checked.ok, chunks) }, { status: 201 });
}
