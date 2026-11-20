import "server-only";
import { agents } from "./db";
import { fail } from "./http";
import { sessionAddress } from "./session";

/**
 * The agent, when the signed-in wallet owns it; otherwise the error response to send.
 * With noFranchise, a franchise is refused: it has no examples, knowledge base or access requests of its own.
 */
export async function ownedAgent(slug: string, { noFranchise = false } = {}) {
  const viewer = await sessionAddress();
  if (!viewer) return { error: fail(401, "Connect your wallet and sign in first.") };
  const agent = await agents.bySlug(slug);
  if (!agent) return { error: fail(404, "Agent not found.") };
  if (agent.ownerAddress !== viewer) return { error: fail(403, "Only the agent's owner can change it.") };
  if (noFranchise && agent.franchise) return { error: fail(403, "A franchise runs the original agent's training and knowledge, so it has none of its own to change.") };
  return { agent, viewer };
}
