import { jobs } from "@/server/db";
import { fail } from "@/server/http";
import { ownedJob } from "@/server/owned-job";

// Owner only: stops a queued or running job. It ends as failed with a "cancelled" message.
export async function POST(_req: Request, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const id = (await ctx.params).id;
  const owned = await ownedJob(id);
  if ("error" in owned) return owned.error;
  if (!(await jobs.cancel(id))) return fail(400, "This job has already finished.");
  return Response.json({ job: await jobs.byId(id) });
}
