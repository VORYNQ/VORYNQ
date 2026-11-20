import { agents, jobs } from "@/server/db";
import { fail } from "@/server/http";
import { isThreadId, requesterScope } from "@/server/threads";

async function load(req: Request, ctx: RouteContext<"/api/agents/[slug]/threads/[threadId]">) {
  const { slug, threadId } = await ctx.params;
  if (!isThreadId(threadId)) return { error: fail(400, "Invalid thread id.") };
  const agent = await agents.bySlug(slug);
  if (!agent) return { error: fail(404, "Agent not found.") };
  const who = await requesterScope(req, agent.id);
  if ("error" in who) return who;
  return { agent, scope: who.scope, threadId };
}

// Your conversation with this agent, oldest job first (also serves as its export).
// Only the wallet or API key that started it can read it.
export async function GET(req: Request, ctx: RouteContext<"/api/agents/[slug]/threads/[threadId]">) {
  const t = await load(req, ctx);
  if ("error" in t) return t.error;
  const thread = await jobs.thread(t.agent.id, t.scope, t.threadId);
  if (!thread.length) return fail(404, "No conversation with this id.");
  return Response.json({ threadId: t.threadId, jobs: thread }, { headers: { "cache-control": "no-store" } });
}

// Forgets the conversation: the agent stops remembering it. The jobs stay in the owner's history.
export async function DELETE(req: Request, ctx: RouteContext<"/api/agents/[slug]/threads/[threadId]">) {
  const t = await load(req, ctx);
  if ("error" in t) return t.error;
  const forgotten = await jobs.forgetThread(t.agent.id, t.scope, t.threadId);
  if (!forgotten) return fail(404, "No conversation with this id.");
  return Response.json({ forgotten });
}
