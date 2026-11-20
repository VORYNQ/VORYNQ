import { jobs } from "@/server/db";
import { fail, readJson } from "@/server/http";
import { ownedJob } from "@/server/owned-job";

const NOTE_MAX = 1000;

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const job = await jobs.byId((await ctx.params).id);
  if (!job) return fail(404, "Job not found.");
  return Response.json({ job });
}

// Owner only: set a private note ({ note }, empty clears it) and/or mark it checked ({ reviewed }).
export async function PATCH(req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const id = (await ctx.params).id;
  const owned = await ownedJob(id);
  if ("error" in owned) return owned.error;

  const body = await readJson(req);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body.");
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== "string") return fail(400, "note must be text.", { note: "Must be text." });
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (note.length > NOTE_MAX) return fail(400, `Keep notes under ${NOTE_MAX} characters.`, { note: `At most ${NOTE_MAX} characters.` });
    await jobs.setNote(id, note || null);
  }
  if (body.reviewed !== undefined) {
    if (typeof body.reviewed !== "boolean") return fail(400, "reviewed must be true or false.");
    await jobs.setReviewed(id, body.reviewed);
  }
  return Response.json({ ok: true });
}
