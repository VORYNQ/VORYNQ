import "server-only";
// Owner checks for actions on a single job (note, review, re-run, cancel).
import { agents, jobs } from "./db";
import { fail } from "./http";
import { sessionAddress } from "./session";

/** The job and its agent when the signed-in wallet owns the agent; otherwise the error response to send. */
export async function ownedJob(id: string) {
  const viewer = await sessionAddress();
  if (!viewer) return { error: fail(401, "Connect your wallet and sign in first.") };
  const meta = await jobs.meta(id);
  if (!meta) return { error: fail(404, "Job not found.") };
  if (meta.ownerAddress !== viewer) return { error: fail(403, "Only the agent's owner can manage this job.") };
  const agent = await agents.byId(meta.agentId);
  if (!agent) return { error: fail(404, "Agent not found.") };
  return { meta, agent };
}
