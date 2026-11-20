import "server-only";
// Agent Franchise (test mode): the checks a franchise job passes, its split, and what the runner runs.
import { JOB_LIMITS } from "@/shared/catalog";
import { splitPrice } from "@/shared/franchise";
import { agents, jobs, type AgentRecord, type JobSplit } from "./db";
import { fail } from "./http";

/**
 * For a franchise: whether it may take a job now, and its parent agent. Ordinary agents pass with parent null.
 * Daily caps (BUILD_PLAN F1.1): the franchise's own caps are checked by the caller like any agent's. On top of that,
 * all franchises of one agent share a pool as large as that agent's own daily cap, so franchising can at most double
 * what one agent spends on AI in a day, and operators never use up the creator's own jobs.
 */
export async function franchiseGate(agent: AgentRecord, sinceIso: string): Promise<{ error: Response } | { parent: AgentRecord | null }> {
  if (!agent.franchise) return { parent: null };
  if (agent.franchise.status === "paused") return { error: fail(403, "This franchise is paused by the creator of the original agent.") };
  if (agent.franchise.status === "revoked") return { error: fail(403, "This franchise is closed and no longer takes jobs.") };
  const parent = agent.parentAgentId ? await agents.byId(agent.parentAgentId) : undefined;
  if (!parent || parent.apiPrivate) return { error: fail(403, "The original agent of this franchise is not available right now.") };
  if ((await jobs.countForFranchisesSince(parent.id, sinceIso)) >= (parent.dailyJobLimit ?? JOB_LIMITS.agentDailyDefault))
    return { error: fail(429, "The franchises of this agent have reached today's shared job limit. Please try again tomorrow.") };
  return { parent };
}

/** The split of a new franchise job at today's terms: the creator's share set on the parent, 5% protocol, the rest to the operator. */
export function franchiseSplit(franchise: AgentRecord, parent: AgentRecord): JobSplit {
  return { ...splitPrice(franchise.priceUsdc, parent.franchiseCreatorPct), parentId: parent.id, creatorAddress: parent.ownerAddress, operatorAddress: franchise.ownerAddress };
}

/**
 * What a job of this agent runs, and whose examples and knowledge base it reads. A franchise runs its parent's current
 * instructions, model, tools (without send_webhook), examples and knowledge; it keeps its own name and notifications.
 * Nothing of the parent's private content is ever copied into the franchise's row.
 */
export async function runnableAgent(agent: AgentRecord): Promise<{ run: AgentRecord; sourceId: string }> {
  if (!agent.parentAgentId) return { run: agent, sourceId: agent.id };
  const parent = await agents.byId(agent.parentAgentId);
  if (!parent) throw new Error("The original agent of this franchise is no longer available.");
  return { run: { ...agent, instructions: parent.instructions, model: parent.model, tools: agent.tools, webhookUrl: null }, sourceId: parent.id };
}
