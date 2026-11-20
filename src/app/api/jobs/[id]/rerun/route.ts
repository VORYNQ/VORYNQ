import { after } from "next/server";
import { JOB_MAX_ATTEMPTS, jobs } from "@/server/db";
import { franchiseGate } from "@/server/franchise";
import { LIMITS_SERVER, fail } from "@/server/http";
import { JOB_LIMITS } from "@/shared/catalog";
import { ownedJob } from "@/server/owned-job";
import { runJob } from "@/server/runner";

// Same room as a new job: re-runs can use web tools too.
export const maxDuration = 300;

// Owner only: runs a failed job again with the same input, under the same job id.
export async function POST(_req: Request, ctx: RouteContext<"/api/jobs/[id]/rerun">) {
  const id = (await ctx.params).id;
  const owned = await ownedJob(id);
  if ("error" in owned) return owned.error;
  if (owned.meta.status !== "failed") return fail(400, "Only failed jobs can be run again.");
  if (owned.meta.attempts >= JOB_MAX_ATTEMPTS) return fail(400, `This request has already been tried ${JOB_MAX_ATTEMPTS} times.`);
  // Re-runs spend the same DeepSeek credits as new jobs, so they count toward the daily cap (countSince counts them).
  if ((await jobs.countSince(new Date(Date.now() - 86_400_000).toISOString())) >= LIMITS_SERVER.jobsPerDay)
    return fail(503, "The network has reached today's job limit. Please try again tomorrow.");
  // A paused or closed franchise cannot re-run either, and re-runs count toward the franchises' shared pool.
  const gate = await franchiseGate(owned.agent, new Date(Date.now() - 86_400_000).toISOString());
  if ("error" in gate) return gate.error;
  if ((await jobs.countForAgentSince(owned.agent.id, new Date(Date.now() - 86_400_000).toISOString())) >= (owned.agent.dailyJobLimit ?? JOB_LIMITS.agentDailyDefault))
    return fail(429, "This agent has reached its daily job limit. Please try again tomorrow.");
  // Null when another tab re-ran or the job changed between the checks above and now.
  const attempt = await jobs.requeue(id);
  if (attempt === null) return fail(400, "This job changed in the meantime. Refresh and try again.");
  after(() => runJob(id, owned.agent, owned.meta.input, attempt));
  return Response.json({ job: await jobs.byId(id) }, { status: 202 });
}
